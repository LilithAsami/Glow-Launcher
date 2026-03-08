/**
 * Gifts Info – Shows who gifted you cosmetics and when.
 *
 * Uses mcp.executeMcp for QueryProfile (handles token refresh / 401 automatically).
 * Queries:
 *   - common_core → stats.attributes.gift_history
 *   - athena → items with giftFromAccountId attribute
 * Then batch-resolves sender accountIds to display names.
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import { executeMcp } from '../epic/mcp';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ─── Types ────────────────────────────────────────────────

export interface GiftedCosmetic {
  templateId: string;
  creationTime: string | null;
}

export interface GiftSender {
  accountId: string;
  displayName: string;
  lastGiftDate: string | null;
  cosmetics: GiftedCosmetic[];
}

export interface GiftsInfoResult {
  success: boolean;
  numReceived: number;
  senders: GiftSender[];
  displayName: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────

async function resolveDisplayNames(
  storage: Storage,
  ids: string[],
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (ids.length === 0) return nameMap;

  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) return nameMap;

  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) return nameMap;

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const params = chunk.map((id) => `accountId=${encodeURIComponent(id)}`).join('&');
    try {
      const { data } = await authenticatedRequest(storage, main.accountId, token, async (t) => {
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

// ─── Main ─────────────────────────────────────────────────

export async function getGiftsInfo(storage: Storage): Promise<GiftsInfoResult> {
  const empty: GiftsInfoResult = { success: false, numReceived: 0, senders: [], displayName: '' };

  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { ...empty, error: 'No account found' };

    empty.displayName = main.displayName;

    // Use mcp.executeMcp which handles token refresh + 401 retry
    const [ccResult, athenaResult] = await Promise.all([
      executeMcp(storage, 'QueryProfile', 'common_core'),
      executeMcp(storage, 'QueryProfile', 'athena'),
    ]);

    if (!ccResult.success) return { ...empty, error: ccResult.error || 'Failed to query common_core' };
    if (!athenaResult.success) return { ...empty, error: athenaResult.error || 'Failed to query athena' };

    const commonCore = ccResult.data;
    const athena = athenaResult.data;

    // ── common_core: gift_history stats ──
    const gh = commonCore?.profileChanges?.[0]?.profile?.stats?.attributes?.gift_history;
    const numReceived: number = gh?.num_received ?? 0;
    const receivedFrom: Record<string, string> = gh?.receivedFrom ?? {};

    // ── athena: items with giftFromAccountId ──
    const items = athena?.profileChanges?.[0]?.profile?.items ?? {};
    const giftedItems: { templateId: string; from: string; creationTime: string | null }[] = [];

    for (const item of Object.values(items) as any[]) {
      if (item?.attributes?.giftFromAccountId) {
        giftedItems.push({
          templateId: item.templateId ?? 'Unknown',
          from: item.attributes.giftFromAccountId,
          creationTime: item.attributes.creation_time ?? null,
        });
      }
    }

    // ── Group cosmetics by sender ──
    const bySender = new Map<string, GiftedCosmetic[]>();
    for (const g of giftedItems) {
      if (!bySender.has(g.from)) bySender.set(g.from, []);
      bySender.get(g.from)!.push({ templateId: g.templateId, creationTime: g.creationTime });
    }

    // Merge senders from both sources
    const allSenderIds = new Set<string>([
      ...Object.keys(receivedFrom),
      ...bySender.keys(),
    ]);

    // Resolve display names in batches of 100
    const nameMap = await resolveDisplayNames(storage, [...allSenderIds]);

    // Build senders array
    const senders: GiftSender[] = [];
    for (const senderId of allSenderIds) {
      const cosmetics = bySender.get(senderId) ?? [];
      // Sort cosmetics by date descending
      cosmetics.sort((a, b) => {
        if (!a.creationTime) return 1;
        if (!b.creationTime) return -1;
        return new Date(b.creationTime).getTime() - new Date(a.creationTime).getTime();
      });

      senders.push({
        accountId: senderId,
        displayName: nameMap.get(senderId) || senderId,
        lastGiftDate: receivedFrom[senderId] ?? cosmetics[0]?.creationTime ?? null,
        cosmetics,
      });
    }

    // Sort by number of cosmetics descending, then by last gift date
    senders.sort((a, b) => {
      const diff = b.cosmetics.length - a.cosmetics.length;
      if (diff !== 0) return diff;
      if (!a.lastGiftDate) return 1;
      if (!b.lastGiftDate) return -1;
      return new Date(b.lastGiftDate).getTime() - new Date(a.lastGiftDate).getTime();
    });

    return {
      success: true,
      numReceived,
      senders,
      displayName: main.displayName,
    };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.message || 'Unknown error';
    return { ...empty, error: msg };
  }
}
