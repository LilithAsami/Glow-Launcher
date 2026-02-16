/**
 * Friends — backend helpers for the Friends page.
 * Handles friend list, incoming/outgoing requests, add/remove/accept/reject/block.
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ─── Types ────────────────────────────────────────────────

export interface FriendEntry {
  accountId: string;
  displayName: string;
  created?: string;
  favorite?: boolean;
}

export interface FriendRequest {
  accountId: string;
  displayName: string;
  created?: string;
}

// ─── Helpers ──────────────────────────────────────────────

async function getMainAccount(storage: Storage) {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) throw new Error('No account found. Add an account first.');
  return main;
}

async function getToken(storage: Storage) {
  const main = await getMainAccount(storage);
  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');
  return { main, token };
}

function apiError(err: any): string {
  if (err?.response?.data?.errorMessage) return err.response.data.errorMessage;
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.message) return err.message;
  return 'Unknown error';
}

/**
 * Resolve display names for a list of account IDs in batches of 100.
 * Returns Map<accountId, displayName>.
 */
async function resolveDisplayNames(
  storage: Storage,
  accountId: string,
  token: string,
  ids: string[],
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (ids.length === 0) return nameMap;

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const params = chunk.map((id) => `accountId=${encodeURIComponent(id)}`).join('&');
    try {
      const { data } = await authenticatedRequest(storage, accountId, token, async (t) => {
        const res = await axios.get(`${Endpoints.ACCOUNT_MULTIPLE}?${params}`, {
          headers: { Authorization: `Bearer ${t}` },
          timeout: 10_000,
        });
        return res.data;
      });
      if (Array.isArray(data)) {
        for (const a of data) {
          if (a.displayName) nameMap.set(a.id, a.displayName);
        }
      }
    } catch {
      /* continue with next chunk */
    }
  }
  return nameMap;
}

// ─── Public API ───────────────────────────────────────────

/**
 * Get complete friends summary: friend list, incoming requests, outgoing requests.
 * Display names are resolved progressively.
 */
export async function getFriendsSummary(storage: Storage): Promise<{
  success: boolean;
  friends: FriendEntry[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  error?: string;
}> {
  try {
    const { main, token } = await getToken(storage);

    // Get friends summary from API
    const { data } = await authenticatedRequest(storage, main.accountId, token, async (t) => {
      const res = await axios.get(`${Endpoints.FRIENDS}/${main.accountId}/summary`, {
        headers: { Authorization: `Bearer ${t}` },
        timeout: 15_000,
      });
      return res.data;
    });

    const rawFriends = data?.friends || [];
    const rawIncoming = data?.incoming || [];
    const rawOutgoing = data?.outgoing || [];

    // Build lists with basic data first
    const friends: FriendEntry[] = rawFriends.map((f: any) => ({
      accountId: f.accountId,
      displayName: f.alias || f.displayName || f.accountId,
      created: f.created || '',
      favorite: f.favorite || false,
    }));

    const incoming: FriendRequest[] = rawIncoming.map((f: any) => ({
      accountId: f.accountId,
      displayName: f.displayName || f.accountId,
      created: f.created || '',
    }));

    const outgoing: FriendRequest[] = rawOutgoing.map((f: any) => ({
      accountId: f.accountId,
      displayName: f.displayName || f.accountId,
      created: f.created || '',
    }));

    // Resolve missing display names (those still showing as accountId)
    const missingIds = [
      ...friends.filter((f) => f.displayName === f.accountId).map((f) => f.accountId),
      ...incoming.filter((f) => f.displayName === f.accountId).map((f) => f.accountId),
      ...outgoing.filter((f) => f.displayName === f.accountId).map((f) => f.accountId),
    ];
    const uniqueMissing = [...new Set(missingIds)];

    if (uniqueMissing.length > 0) {
      const freshToken = await refreshAccountToken(storage, main.accountId);
      if (freshToken) {
        const nameMap = await resolveDisplayNames(storage, main.accountId, freshToken, uniqueMissing);
        for (const f of friends) if (nameMap.has(f.accountId)) f.displayName = nameMap.get(f.accountId)!;
        for (const f of incoming) if (nameMap.has(f.accountId)) f.displayName = nameMap.get(f.accountId)!;
        for (const f of outgoing) if (nameMap.has(f.accountId)) f.displayName = nameMap.get(f.accountId)!;
      }
    }

    friends.sort((a, b) => a.displayName.localeCompare(b.displayName));
    incoming.sort((a, b) => a.displayName.localeCompare(b.displayName));
    outgoing.sort((a, b) => a.displayName.localeCompare(b.displayName));

    console.log(`[Friends] Loaded: ${friends.length} friends, ${incoming.length} incoming, ${outgoing.length} outgoing`);
    return { success: true, friends, incoming, outgoing };
  } catch (err: any) {
    const msg = apiError(err);
    console.error('[Friends] getFriendsSummary error:', msg);
    return { success: false, friends: [], incoming: [], outgoing: [], error: msg };
  }
}

/**
 * Add (send request) or accept a friend by display name or account ID.
 */
export async function addFriend(storage: Storage, input: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { main, token } = await getToken(storage);

    // Resolve input to account ID
    let targetId = input;
    const isAccountId = /^[a-f0-9]{32}$/i.test(input);

    if (!isAccountId) {
      const { data } = await authenticatedRequest(storage, main.accountId, token, async (t) => {
        const res = await axios.get(`${Endpoints.LOOKUP_DISPLAYNAME}/${encodeURIComponent(input)}`, {
          headers: { Authorization: `Bearer ${t}` },
          timeout: 10_000,
        });
        return res.data;
      });
      if (!data?.id) throw new Error(`Player "${input}" not found`);
      targetId = data.id;
    }

    // Send friend request
    await authenticatedRequest(storage, main.accountId, token, async (t) => {
      const res = await axios.post(
        `${Endpoints.FRIENDS}/${main.accountId}/friends/${targetId}`,
        {},
        { headers: { Authorization: `Bearer ${t}` }, timeout: 10_000 },
      );
      return res.data;
    });

    console.log(`[Friends] Friend request sent/accepted: ${input} (${targetId})`);
    return { success: true, message: `Friend request sent to ${input}` };
  } catch (err: any) {
    const msg = apiError(err);
    console.error('[Friends] addFriend error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Remove a friend.
 */
export async function removeFriend(storage: Storage, friendId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { main, token } = await getToken(storage);

    await authenticatedRequest(storage, main.accountId, token, async (t) => {
      const res = await axios.delete(
        `${Endpoints.FRIENDS}/${main.accountId}/friends/${friendId}`,
        { headers: { Authorization: `Bearer ${t}` }, timeout: 10_000 },
      );
      return res.data;
    });

    console.log(`[Friends] Removed friend: ${friendId}`);
    return { success: true, message: 'Friend removed' };
  } catch (err: any) {
    const msg = apiError(err);
    console.error('[Friends] removeFriend error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Accept an incoming friend request.
 */
export async function acceptFriend(storage: Storage, friendId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { main, token } = await getToken(storage);

    await authenticatedRequest(storage, main.accountId, token, async (t) => {
      const res = await axios.post(
        `${Endpoints.FRIENDS}/${main.accountId}/friends/${friendId}`,
        {},
        { headers: { Authorization: `Bearer ${t}` }, timeout: 10_000 },
      );
      return res.data;
    });

    console.log(`[Friends] Accepted friend: ${friendId}`);
    return { success: true, message: 'Friend request accepted' };
  } catch (err: any) {
    const msg = apiError(err);
    console.error('[Friends] acceptFriend error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Reject / decline an incoming friend request.
 */
export async function rejectFriend(storage: Storage, friendId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { main, token } = await getToken(storage);

    await authenticatedRequest(storage, main.accountId, token, async (t) => {
      const res = await axios.delete(
        `${Endpoints.FRIENDS}/${main.accountId}/friends/${friendId}`,
        { headers: { Authorization: `Bearer ${t}` }, timeout: 10_000 },
      );
      return res.data;
    });

    console.log(`[Friends] Rejected friend request: ${friendId}`);
    return { success: true, message: 'Friend request declined' };
  } catch (err: any) {
    const msg = apiError(err);
    console.error('[Friends] rejectFriend error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Cancel an outgoing friend request.
 */
export async function cancelRequest(storage: Storage, friendId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { main, token } = await getToken(storage);

    await authenticatedRequest(storage, main.accountId, token, async (t) => {
      const res = await axios.delete(
        `${Endpoints.FRIENDS}/${main.accountId}/friends/${friendId}`,
        { headers: { Authorization: `Bearer ${t}` }, timeout: 10_000 },
      );
      return res.data;
    });

    console.log(`[Friends] Cancelled request to: ${friendId}`);
    return { success: true, message: 'Request cancelled' };
  } catch (err: any) {
    const msg = apiError(err);
    console.error('[Friends] cancelRequest error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Block a user.
 */
export async function blockUser(storage: Storage, userId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { main, token } = await getToken(storage);

    await authenticatedRequest(storage, main.accountId, token, async (t) => {
      const res = await axios.post(
        `${Endpoints.FRIENDS}/${main.accountId}/blocklist/${userId}`,
        {},
        { headers: { Authorization: `Bearer ${t}` }, timeout: 10_000 },
      );
      return res.data;
    });

    console.log(`[Friends] Blocked user: ${userId}`);
    return { success: true, message: 'User blocked' };
  } catch (err: any) {
    const msg = apiError(err);
    console.error('[Friends] blockUser error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Remove all friends.
 */
export async function removeAllFriends(storage: Storage): Promise<{ success: boolean; message?: string; removed: number; error?: string }> {
  try {
    const { main, token } = await getToken(storage);

    // Get current friends list
    const { data } = await authenticatedRequest(storage, main.accountId, token, async (t) => {
      const res = await axios.get(`${Endpoints.FRIENDS}/${main.accountId}/summary`, {
        headers: { Authorization: `Bearer ${t}` },
        timeout: 15_000,
      });
      return res.data;
    });

    const friends = data?.friends || [];
    let removed = 0;

    for (const friend of friends) {
      try {
        const freshToken = await refreshAccountToken(storage, main.accountId);
        if (!freshToken) continue;
        await axios.delete(
          `${Endpoints.FRIENDS}/${main.accountId}/friends/${friend.accountId}`,
          { headers: { Authorization: `Bearer ${freshToken}` }, timeout: 10_000 },
        );
        removed++;
      } catch {
        /* continue removing others */
      }
    }

    console.log(`[Friends] Removed all friends: ${removed}/${friends.length}`);
    return { success: true, message: `Removed ${removed} of ${friends.length} friends`, removed };
  } catch (err: any) {
    const msg = apiError(err);
    console.error('[Friends] removeAllFriends error:', msg);
    return { success: false, removed: 0, error: msg };
  }
}

/**
 * Accept all incoming friend requests.
 */
export async function acceptAllIncoming(storage: Storage): Promise<{ success: boolean; message?: string; accepted: number; error?: string }> {
  try {
    const { main, token } = await getToken(storage);

    // Get incoming requests
    const { data } = await authenticatedRequest(storage, main.accountId, token, async (t) => {
      const res = await axios.get(`${Endpoints.FRIENDS}/${main.accountId}/summary`, {
        headers: { Authorization: `Bearer ${t}` },
        timeout: 15_000,
      });
      return res.data;
    });

    const incoming = data?.incoming || [];
    let accepted = 0;

    for (const req of incoming) {
      try {
        const freshToken = await refreshAccountToken(storage, main.accountId);
        if (!freshToken) continue;
        await axios.post(
          `${Endpoints.FRIENDS}/${main.accountId}/friends/${req.accountId}`,
          {},
          { headers: { Authorization: `Bearer ${freshToken}` }, timeout: 10_000 },
        );
        accepted++;
      } catch {
        /* continue accepting others */
      }
    }

    console.log(`[Friends] Accepted all: ${accepted}/${incoming.length}`);
    return { success: true, message: `Accepted ${accepted} of ${incoming.length} requests`, accepted };
  } catch (err: any) {
    const msg = apiError(err);
    console.error('[Friends] acceptAllIncoming error:', msg);
    return { success: false, accepted: 0, error: msg };
  }
}
