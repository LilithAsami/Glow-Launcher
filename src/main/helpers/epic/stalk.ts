/**
 * Stalk — search players and get matchmaking info for Fortnite players.
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

/**
 * Search players by prefix using User Search Service.
 */
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

/**
 * Search player by exact display name.
 */
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

/**
 * Search players across multiple platforms with autocomplete.
 * Uses authenticatedRequest for auto-401 retry.
 */
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

  // Strategy 1: User Search Service across platforms
  let userSearchFailed = false;
  for (const plat of platforms) {
    if (found.size >= 25) break;
    try {
      const { data: results } = await authenticatedRequest(
        storage,
        main.accountId,
        token,
        async (t) => {
          return searchByPrefix(t, main.accountId, searchTerm, plat);
        },
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
      if (err?.response?.status === 403) {
        userSearchFailed = true;
        break;
      }
      continue;
    }
  }

  // Strategy 2: Exact display name lookup
  if (userSearchFailed || found.size === 0) {
    try {
      const { data: results } = await authenticatedRequest(
        storage,
        main.accountId,
        token,
        async (t) => searchByDisplayName(t, searchTerm),
      );
      for (const p of results) {
        if (!found.has(p.accountId)) {
          found.set(p.accountId, { ...p, platform: 'Epic' });
        }
      }
    } catch { /* ignore */ }
  }

  return Array.from(found.values()).slice(0, 25);
}

// ── Matchmaking info ──────────────────────────────────────

export interface MatchmakingResult {
  online: boolean;
  displayName: string;
  accountId: string;
  sessionId?: string;
  ownerId?: string;
  totalPlayers?: number;
  maxPlayers?: number | string;
  started?: boolean;
  gameType?: string;
  gameMode?: string;
  region?: string;
  subRegion?: string;
  serverAddress?: string;
  serverPort?: string;
  players?: { index: number; accountId: string; displayName: string }[];
}

/**
 * Look up accountId → displayName.
 */
async function lookupAccountId(token: string, accountId: string): Promise<string> {
  try {
    const res = await axios.get(
      `${Endpoints.LOOKUP_ACCOUNTID}/${accountId}`,
      {
        headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      },
    );
    return res.data?.displayName || accountId;
  } catch {
    return accountId;
  }
}

/**
 * Look up displayName → accountId.
 */
async function getAccountIdFromDisplayName(
  token: string,
  displayName: string,
): Promise<{ id: string; displayName: string }> {
  const res = await axios.get(
    `${Endpoints.LOOKUP_DISPLAYNAME}/${encodeURIComponent(displayName)}`,
    {
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    },
  );
  return { id: res.data.id, displayName: res.data.displayName };
}

/**
 * Get matchmaking info for a target account.
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

  // Resolve target
  let targetAccountId: string;
  let targetDisplayName: string;

  const isAccountId = /^[a-f0-9]{32}$/i.test(targetInput);

  if (isAccountId) {
    targetAccountId = targetInput;
    const { data: name } = await authenticatedRequest(
      storage, main.accountId, token,
      async (t) => lookupAccountId(t, targetInput),
    );
    targetDisplayName = name;
  } else {
    const { data: acct } = await authenticatedRequest(
      storage, main.accountId, token,
      async (t) => getAccountIdFromDisplayName(t, targetInput),
    );
    targetAccountId = acct.id;
    targetDisplayName = acct.displayName;
  }

  // Get matchmaking session
  let sessionData: any = null;
  try {
    const { data: matchData } = await authenticatedRequest(
      storage, main.accountId, token,
      async (t) => {
        const res = await axios.get(
          `${Endpoints.MATCHMAKING}/${targetAccountId}`,
          {
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            timeout: 10000,
          },
        );
        return res.data;
      },
    );

    if (Array.isArray(matchData)) {
      sessionData = matchData.length > 0 ? matchData[0] : null;
    } else if (typeof matchData === 'object') {
      sessionData = matchData;
    }
  } catch (err: any) {
    if (err?.response?.status === 404) {
      sessionData = null;
    } else {
      throw err;
    }
  }

  // Offline
  if (!sessionData || !sessionData.id) {
    return {
      online: false,
      displayName: targetDisplayName,
      accountId: targetAccountId,
    };
  }

  // Online — parse session
  const attributes = sessionData.attributes || {};
  const region = attributes.REGION_s || 'N/A';
  const gameMode = attributes.GAMEMODE_s || 'N/A';
  const serverAddress = attributes.SERVERADDRESS_s || attributes.ADDRESS_s || 'N/A';
  const serverPort = attributes.serverPort_s || sessionData.serverPort || 'N/A';
  const subRegion = attributes.SUBREGION_s || 'N/A';

  let gameType = 'BR';
  if (gameMode === 'FORTPVE' || gameMode.toLowerCase().includes('fortoutpost') || gameMode.toLowerCase().includes('outpost')) {
    gameType = 'STW';
  }

  // Get player list
  let allPlayerIds: string[] = [];
  if (gameType === 'STW') {
    allPlayerIds = [...(sessionData.publicPlayers || []), ...(sessionData.privatePlayers || [])];
  } else {
    allPlayerIds = sessionData.assignments || [];
  }

  // Resolve player names in parallel
  const players: { index: number; accountId: string; displayName: string }[] = [];
  if (allPlayerIds.length > 0) {
    const limited = allPlayerIds.slice(0, 50);
    const resolved = await Promise.all(
      limited.map(async (pid, i) => {
        try {
          const { data: name } = await authenticatedRequest(
            storage, main.accountId, token,
            async (t) => lookupAccountId(t, pid),
          );
          return { index: i + 1, accountId: pid, displayName: name };
        } catch {
          return { index: i + 1, accountId: pid, displayName: pid };
        }
      }),
    );
    players.push(...resolved);
  }

  return {
    online: true,
    displayName: targetDisplayName,
    accountId: targetAccountId,
    sessionId: sessionData.id || 'N/A',
    ownerId: sessionData.ownerId || 'N/A',
    totalPlayers: sessionData.totalPlayers || 0,
    maxPlayers: sessionData.maxPublicPlayers || sessionData.maxPlayers || 'N/A',
    started: sessionData.started || false,
    gameType,
    gameMode,
    region: subRegion !== 'N/A' ? subRegion : region,
    subRegion,
    serverAddress,
    serverPort,
    players,
  };
}
