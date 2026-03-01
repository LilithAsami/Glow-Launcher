/**
 * Stalk — search players and check if they are in a Homebase session.
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ── Player search ─────────────────────────────────────────

export interface PlayerSearchResult {
  accountId: string;
  displayName: string;
  platform?: string;
}

async function searchByPrefix(
  token: string,
  accountId: string,
  searchTerm: string,
  platform: string,
): Promise<PlayerSearchResult[]> {
  const res = await axios.get(
    `${Endpoints.ACCOUNT_SEARCH}/${accountId}`,
    {
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
      params: { platform, prefix: searchTerm },
      timeout: 5000,
    },
  );
  if (!res.data || !Array.isArray(res.data)) return [];

  const results: PlayerSearchResult[] = [];
  for (const r of res.data) {
    if (r.accountId && r.matches && Array.isArray(r.matches)) {
      for (const m of r.matches) {
        if (m.value && m.platform) {
          results.push({ accountId: r.accountId, displayName: m.value, platform: m.platform });
        }
      }
    }
  }
  return results;
}

async function searchByDisplayName(
  token: string,
  displayName: string,
): Promise<PlayerSearchResult[]> {
  try {
    const res = await axios.get(
      `${Endpoints.LOOKUP_DISPLAYNAME}/${encodeURIComponent(displayName)}`,
      {
        headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 5000,
      },
    );
    if (res.data?.id && res.data?.displayName) {
      return [{ accountId: res.data.id, displayName: res.data.displayName, platform: 'epic' }];
    }
    return [];
  } catch (err: any) {
    if (err?.response?.status === 404) return [];
    throw err;
  }
}

export async function searchPlayers(
  storage: Storage,
  searchTerm: string,
): Promise<PlayerSearchResult[]> {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain);
  if (!main) throw new Error('No main account');

  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');

  const found = new Map<string, PlayerSearchResult>();
  const platforms = ['epic', 'psn', 'xbl', 'steam', 'nsw'];

  let userSearchFailed = false;
  for (const plat of platforms) {
    if (found.size >= 25) break;
    try {
      const { data: results } = await authenticatedRequest(
        storage, main.accountId, token,
        async (t) => searchByPrefix(t, main.accountId, searchTerm, plat),
      );
      for (const p of results) {
        if (!found.has(p.accountId)) {
          const platformLabel: Record<string, string> = {
            epic: 'Epic', psn: 'PSN', xbl: 'Xbox', steam: 'Steam', nsw: 'Switch',
          };
          found.set(p.accountId, {
            accountId: p.accountId,
            displayName: p.displayName,
            platform: platformLabel[p.platform || plat] || plat.toUpperCase(),
          });
        }
        if (found.size >= 25) break;
      }
    } catch (err: any) {
      if (err?.response?.status === 403) { userSearchFailed = true; break; }
      continue;
    }
  }

  if (userSearchFailed || found.size === 0) {
    try {
      const { data: results } = await authenticatedRequest(
        storage, main.accountId, token,
        async (t) => searchByDisplayName(t, searchTerm),
      );
      for (const p of results) {
        if (!found.has(p.accountId)) found.set(p.accountId, { ...p, platform: 'Epic' });
      }
    } catch { /* ignore */ }
  }

  return Array.from(found.values()).slice(0, 25);
}

// ── Homebase check via QueryPublicProfile ─────────────────

export interface MatchmakingResult {
  online: boolean;
  isHomebase: boolean;
  displayName: string;
  accountId: string;
}

/**
 * Check if a player is currently in a Homebase session by querying
 * their public campaign profile and checking for objectiveDeferral.
 */
export async function getMatchmakingInfo(
  storage: Storage,
  targetInput: string,
): Promise<MatchmakingResult> {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain);
  if (!main) throw new Error('No main account');

  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');

  // Resolve target accountId + displayName
  let targetAccountId: string;
  let targetDisplayName: string;

  const isAccountId = /^[a-f0-9]{32}$/i.test(targetInput);

  if (isAccountId) {
    targetAccountId = targetInput;
    try {
      const { data: name } = await authenticatedRequest(
        storage, main.accountId, token,
        async (t) => {
          const res = await axios.get(`${Endpoints.LOOKUP_ACCOUNTID}/${targetAccountId}`, {
            headers: { Authorization: `bearer ${t}`, 'Content-Type': 'application/json' },
            timeout: 10000,
          });
          return res.data?.displayName || targetAccountId;
        },
      );
      targetDisplayName = name;
    } catch {
      targetDisplayName = targetAccountId;
    }
  } else {
    const { data: acct } = await authenticatedRequest(
      storage, main.accountId, token,
      async (t) => {
        const res = await axios.get(
          `${Endpoints.LOOKUP_DISPLAYNAME}/${encodeURIComponent(targetInput)}`,
          {
            headers: { Authorization: `bearer ${t}`, 'Content-Type': 'application/json' },
            timeout: 10000,
          },
        );
        return { id: res.data.id, displayName: res.data.displayName };
      },
    );
    targetAccountId = acct.id;
    targetDisplayName = acct.displayName;
  }

  // QueryPublicProfile campaign — check objectiveDeferral existence
  try {
    const { data } = await authenticatedRequest(
      storage, main.accountId, token,
      async (t) => {
        const res = await axios.post(
          `${Endpoints.MCP}/${targetAccountId}/public/QueryPublicProfile?profileId=campaign&rvn=-1`,
          {},
          {
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            timeout: 15000,
          },
        );
        return res.data;
      },
    );

    const attrs = data?.profileChanges?.[0]?.profile?.stats?.attributes;
    const isHomebase = !!(attrs?.quest_manager?.objectiveDeferral);

    return { online: isHomebase, isHomebase, displayName: targetDisplayName, accountId: targetAccountId };
  } catch (err: any) {
    if (err?.response?.status === 404 || err?.response?.status === 403) {
      return { online: false, isHomebase: false, displayName: targetDisplayName, accountId: targetAccountId };
    }
    throw err;
  }
}
