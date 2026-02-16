/**
 * Party — backend helpers for the Party page.
 * Wraps PartyManager actions with token refresh / auth retry.
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import { PartyManager } from '../../managers/party/PartyManager';
import { processSTWRewards } from '../autokick/rewardsProcessor';
import { composeMCP } from '../../utils/mcp';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ─── Helpers ──────────────────────────────────────────────

async function getMainAccount(storage: Storage) {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) throw new Error('No account found');
  return main;
}

async function getTokenAndParty(storage: Storage) {
  const main = await getMainAccount(storage);
  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');

  const party = new PartyManager({
    accountId: main.accountId,
    displayName: main.displayName || main.accountId,
    token,
  });
  await party.fetch();
  return { main, token, party };
}

// ─── Public API ───────────────────────────────────────────

/**
 * Fetch current party info (members list).
 */
export async function getPartyInfo(storage: Storage) {
  const { party } = await getTokenAndParty(storage);

  const members = party.members
    ? Array.from(party.members.values()).map((m) => ({
        accountId: m.id,
        displayName: (m as any).displayName || m.id,
        role: m.role,
        isLeader: m.role === 'CAPTAIN',
      }))
    : [];

  return {
    partyId: party.id || null,
    size: party.size || 0,
    maxSize: party.maxSize || 16,
    isPrivate: party.isPrivate,
    members,
  };
}

/**
 * Leave the current party.
 */
export async function leaveParty(storage: Storage) {
  const { party } = await getTokenAndParty(storage);
  await party.leave();
  return { success: true, message: 'Left party' };
}

/**
 * Kick a specific member from the party.
 */
export async function kickMember(storage: Storage, memberId: string) {
  const { party } = await getTokenAndParty(storage);
  await party.kick(memberId);
  return { success: true, message: `Kicked ${memberId}` };
}

/**
 * KickCollect — collect STW rewards, then leave party.
 * If force=true, skip the STW game check.
 */
export async function kickCollect(storage: Storage, force: boolean = false) {
  const main = await getMainAccount(storage);
  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');

  // Check if in STW game (unless force)
  if (!force) {
    try {
      const { data: matchData } = await authenticatedRequest(
        storage, main.accountId, token,
        async (t) => {
          const res = await axios.get(
            `${Endpoints.MATCHMAKING}/${main.accountId}`,
            { headers: { Authorization: `Bearer ${t}` }, timeout: 10000 },
          );
          return res.data;
        },
      );

      const session = Array.isArray(matchData) ? matchData[0] : matchData;
      const gameMode = session?.attributes?.GAMEMODE_s || '';
      const isSTW = gameMode === 'FORTPVE' || gameMode.toLowerCase().includes('outpost');
      if (!session || !isSTW) {
        throw new Error('Not in a STW game. Use force to skip this check.');
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new Error('Not in any matchmaking session. Use force to skip check.');
      }
      if (err.message?.includes('Not in')) throw err;
      // Other errors: continue with force
    }
  }

  // Collect rewards
  const rewards = await processSTWRewards(main.accountId, token, main.displayName || '');
  const rewardCount = Object.keys(rewards).length;

  // Leave party
  const party = new PartyManager({
    accountId: main.accountId,
    displayName: main.displayName || main.accountId,
    token,
  });
  await party.fetch();
  await party.leave();

  return {
    success: true,
    message: `Collected ${rewardCount} reward(s) and left party`,
    rewards,
  };
}

/**
 * KickCollect-Expulse — kick all members, collect rewards, then leave.
 * If force=true, skip the STW game check.
 */
export async function kickCollectExpulse(storage: Storage, force: boolean = false) {
  const main = await getMainAccount(storage);
  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');

  // Check if in STW game (unless force)
  if (!force) {
    try {
      const { data: matchData } = await authenticatedRequest(
        storage, main.accountId, token,
        async (t) => {
          const res = await axios.get(
            `${Endpoints.MATCHMAKING}/${main.accountId}`,
            { headers: { Authorization: `Bearer ${t}` }, timeout: 10000 },
          );
          return res.data;
        },
      );

      const session = Array.isArray(matchData) ? matchData[0] : matchData;
      const gameMode = session?.attributes?.GAMEMODE_s || '';
      const isSTW = gameMode === 'FORTPVE' || gameMode.toLowerCase().includes('outpost');
      if (!session || !isSTW) {
        throw new Error('Not in a STW game. Use force to skip this check.');
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new Error('Not in any matchmaking session. Use force to skip check.');
      }
      if (err.message?.includes('Not in')) throw err;
    }
  }

  // Fetch party & kick all members
  const party = new PartyManager({
    accountId: main.accountId,
    displayName: main.displayName || main.accountId,
    token,
  });
  await party.fetch();

  const otherMembers = party.members
    ? Array.from(party.members.values()).filter((m) => m.id !== main.accountId)
    : [];
  let kicked = 0;
  for (const member of otherMembers) {
    try {
      await party.kick(member.id);
      kicked++;
    } catch { /* ignore individual kick errors */ }
  }

  // Collect rewards
  const rewards = await processSTWRewards(main.accountId, token, main.displayName || '');
  const rewardCount = Object.keys(rewards).length;

  // Leave party
  await party.leave();

  return {
    success: true,
    message: `Kicked ${kicked} member(s), collected ${rewardCount} reward(s), left party`,
    rewards,
    kicked,
  };
}

/**
 * Invite a player to the party.
 */
export async function invitePlayer(storage: Storage, targetInput: string) {
  const main = await getMainAccount(storage);
  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');

  // Resolve target account id
  const targetAccountId = await resolveAccountId(storage, main.accountId, token, targetInput);

  const party = new PartyManager({
    accountId: main.accountId,
    displayName: main.displayName || main.accountId,
    token,
  });
  await party.fetch();
  await party.invite(targetAccountId);

  return { success: true, message: `Invited ${targetInput}` };
}

/**
 * Join another player's party.
 */
export async function joinPlayer(storage: Storage, targetInput: string) {
  const main = await getMainAccount(storage);
  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');

  const targetAccountId = await resolveAccountId(storage, main.accountId, token, targetInput);

  const party = new PartyManager({
    accountId: main.accountId,
    displayName: main.displayName || main.accountId,
    token,
  });
  await party.fetch();
  await party.requestToJoin(targetAccountId);

  return { success: true, message: `Sent join request to ${targetInput}` };
}

/**
 * Promote a party member to leader.
 */
export async function promotePlayer(storage: Storage, memberId: string) {
  const { party } = await getTokenAndParty(storage);
  await party.promote(memberId);
  return { success: true, message: `Promoted ${memberId} to leader` };
}

/**
 * Toggle party privacy (Private ↔ Public). Auto-reverts after 5 seconds.
 */
export async function togglePrivacy(storage: Storage) {
  const { party } = await getTokenAndParty(storage);

  const wasPrivate = party.isPrivate;

  if (wasPrivate) {
    await party.setPrivacy({ partyType: 'Public', inviteRestriction: 'Anyone', onlyLeaderFriendsCanJoin: false });
  } else {
    await party.setPrivacy({ partyType: 'Private', inviteRestriction: 'Leader', onlyLeaderFriendsCanJoin: true });
  }

  const newState = wasPrivate ? 'Public' : 'Private';

  // Auto-revert after 5 seconds
  setTimeout(async () => {
    try {
      const main = await getMainAccount(storage);
      const freshToken = await refreshAccountToken(storage, main.accountId);
      if (!freshToken) return;

      const p = new PartyManager({
        accountId: main.accountId,
        displayName: main.displayName || main.accountId,
        token: freshToken,
      });
      await p.fetch();

      if (wasPrivate) {
        await p.setPrivacy({ partyType: 'Private', inviteRestriction: 'Leader', onlyLeaderFriendsCanJoin: true });
      } else {
        await p.setPrivacy({ partyType: 'Public', inviteRestriction: 'Anyone', onlyLeaderFriendsCanJoin: false });
      }
    } catch { /* ignore revert errors */ }
  }, 5000);

  return { success: true, message: `Party set to ${newState} (auto-reverting in 5s)` };
}

/**
 * Fix party invite (cloud gaming fix) — same as toggle privacy.
 */
export async function fixPartyInvite(storage: Storage) {
  return togglePrivacy(storage);
}

/**
 * Search players (reuses stalk search for autocomplete in the party page).
 */
export { searchPlayers } from './stalk';

// ─── Internal: resolve account ID ────────────────────────

async function resolveAccountId(
  storage: Storage,
  mainAccountId: string,
  token: string,
  input: string,
): Promise<string> {
  const isAccountId = /^[a-f0-9]{32}$/i.test(input);
  if (isAccountId) return input;

  // Lookup by display name
  const { data } = await authenticatedRequest(
    storage, mainAccountId, token,
    async (t) => {
      const res = await axios.get(
        `${Endpoints.LOOKUP_DISPLAYNAME}/${encodeURIComponent(input)}`,
        { headers: { Authorization: `Bearer ${t}` }, timeout: 10000 },
      );
      return res.data;
    },
  );

  if (!data?.id) throw new Error(`Player "${input}" not found`);
  return data.id;
}
