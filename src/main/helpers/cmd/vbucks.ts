/**
 * V-Bucks Information – Detailed breakdown of account's V-Bucks
 *
 * Queries common_core profile and parses:
 *   - MtxPurchased (bought with real money, per platform)
 *   - MtxGiveaway (battlepass / challenges)
 *   - MtxComplimentary (gifts / compensation)
 *   - mtx_purchase_history (historical purchases)
 *   - Gift sending info
 *   - Creator code
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

export interface VBucksSource {
  amount: number;
  count: number;
  platform: string;
  type: 'purchased' | 'earned' | 'complimentary';
}

export interface VBucksInfo {
  success: boolean;
  total: number;
  purchased: number;
  earned: number;
  complimentary: number;
  currentPlatform: string;
  giftsAllowed: boolean;
  giftsRemaining: number;    // typically 5 daily limit
  creatorCode: string | null;
  creatorSetTime: string | null;
  sources: VBucksSource[];
  displayName: string;
  error?: string;
}

const PLATFORM_NAMES: Record<string, string> = {
  PSN: 'PlayStation',
  XBL: 'Xbox',
  Nintendo: 'Nintendo Switch',
  Android: 'Android',
  IOS: 'iOS',
  EpicPC: 'Epic Games',
  Shared: 'Shared',
  EpicPCKorea: 'Epic Games (Korea)',
};

function getPlatformName(platform: string): string {
  return PLATFORM_NAMES[platform] || platform;
}

export async function getVbucksInfo(storage: Storage): Promise<VBucksInfo> {
  const empty: VBucksInfo = {
    success: false,
    total: 0,
    purchased: 0,
    earned: 0,
    complimentary: 0,
    currentPlatform: 'Unknown',
    giftsAllowed: true,
    giftsRemaining: 5,
    creatorCode: null,
    creatorSetTime: null,
    sources: [],
    displayName: '',
  };

  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { ...empty, error: 'No account found' };

    empty.displayName = main.displayName;

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { ...empty, error: 'Failed to refresh token' };

    const url = `${Endpoints.MCP}/${main.accountId}/client/QueryProfile?profileId=common_core&rvn=-1`;

    const { data } = await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
      const res = await axios.post(url, {}, {
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        timeout: 15_000,
      });
      return res.data;
    });

    const profile = data?.profileChanges?.[0]?.profile;
    const items = profile?.items || {};
    const stats = profile?.stats?.attributes || {};

    let purchased = 0;
    let earned = 0;
    let complimentary = 0;
    const sourcesMap: Record<string, VBucksSource> = {};

    // ── Parse current V-Bucks items ──────────────────────────
    for (const key in items) {
      const item = items[key];
      if (!item.templateId?.startsWith('Currency:Mtx')) continue;

      const quantity = item.quantity || 0;
      const platform = item.attributes?.platform || 'Unknown';

      if (item.templateId === 'Currency:MtxPurchased') {
        purchased += quantity;
        if (quantity > 0) {
          const platformName = `${getPlatformName(platform)} Purchased`;
          const groupKey = `${quantity}-${platformName}`;
          if (!sourcesMap[groupKey]) {
            sourcesMap[groupKey] = { amount: quantity, count: 0, platform: platformName, type: 'purchased' };
          }
          sourcesMap[groupKey].count++;
        }
      } else if (item.templateId === 'Currency:MtxGiveaway') {
        earned += quantity;
        if (quantity > 0) {
          const gKey = `earned-bp`;
          if (!sourcesMap[gKey]) {
            sourcesMap[gKey] = { amount: 0, count: 1, platform: 'Battle Pass & Challenges', type: 'earned' };
          }
          sourcesMap[gKey].amount += quantity;
        }
      } else if (item.templateId === 'Currency:MtxComplimentary') {
        complimentary += quantity;
        if (quantity > 0) {
          const cKey = `complimentary`;
          if (!sourcesMap[cKey]) {
            sourcesMap[cKey] = { amount: 0, count: 1, platform: 'Complimentary / Gifts', type: 'complimentary' };
          }
          sourcesMap[cKey].amount += quantity;
        }
      }
    }

    // ── Parse purchase history ───────────────────────────────
    const purchaseHistory = stats.mtx_purchase_history?.purchases || [];
    const historyMap: Record<string, VBucksSource> = {};

    for (const purchase of purchaseHistory) {
      const quantity = purchase.totalMtxPaid || purchase.quantity || purchase.mtxQuantity || 0;
      const platform = purchase.lootResult?.length ? 'Store Purchase' : (purchase.platform || 'Unknown');

      if (quantity > 0) {
        const platformName = platform === 'Store Purchase' ? 'Store Purchase' : `${getPlatformName(platform)} Purchased`;
        const groupKey = `hist-${quantity}-${platformName}`;
        if (!historyMap[groupKey]) {
          historyMap[groupKey] = { amount: quantity, count: 0, platform: platformName, type: 'purchased' };
        }
        historyMap[groupKey].count++;
      }
    }

    // ── Platform & gifts ─────────────────────────────────────
    const currentPlatform = stats.current_mtx_platform || stats.mtx_platform || 'EpicPC';
    const giftsAllowed = stats.allowed_to_send_gifts !== false;
    const giftsRemaining = stats.gift_history?.num_gifts_remaining ?? 5;

    // ── Creator code ─────────────────────────────────────────
    const creatorCode = stats.mtx_affiliate || null;
    const creatorSetTime = stats.mtx_affiliate_set_time || null;

    const total = purchased + earned + complimentary;
    const sources = Object.values(sourcesMap);

    // Add purchase history as separate section if available
    const histSources = Object.values(historyMap);

    return {
      success: true,
      total,
      purchased,
      earned,
      complimentary,
      currentPlatform: getPlatformName(currentPlatform),
      giftsAllowed,
      giftsRemaining,
      creatorCode,
      creatorSetTime,
      sources: [...sources, ...histSources.map(h => ({ ...h, platform: `${h.platform} (History)` }))],
      displayName: main.displayName,
    };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.message || 'Unknown error';
    return { ...empty, error: `Failed to get V-Bucks info: ${msg}` };
  }
}
