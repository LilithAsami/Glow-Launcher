/**
 * ShopManager — Item Shop data cache & downloader for GLOW Launcher
 *
 * - Downloads shop from fortnite-api.com/v2/shop
 * - Caches in memory with hash comparison
 * - Auto-refreshes at 00:00 UTC daily
 * - Notifies renderer when shop rotates
 * - Provides buy / gift / toggle-gifts helpers via MCP
 * - Friends list for gift target selection
 */

import axios from 'axios';
import { BrowserWindow } from 'electron';
import { refreshAccountToken, authenticatedRequest } from '../../helpers/auth/tokenRefresh';
import { Endpoints } from '../../helpers/endpoints';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ── Types ───────────────────────────────────────────────────

export interface BundleSubItem {
  id: string;
  name: string;
  type: string;
  rarity: string;
  imageUrl: string;
  description: string;
}

export interface ShopEntry {
  id: string;
  offerId: string;
  name: string;
  description: string;
  type: string;
  rarity: string;
  series: string | null;
  seriesColors: string[] | null;
  imageUrl: string;
  price: number;
  regularPrice: number;
  finalPrice: number;
  isBundle: boolean;
  bundleCount: number;
  giftable: boolean;
  sectionId: string;
  bundleItems: BundleSubItem[];
}

export interface ShopSectionData {
  name: string;
  items: ShopEntry[];
}

interface CachedShop {
  hash: string;
  sections: ShopSectionData[];
  totalItems: number;
  fetchedAt: number;          // epoch ms
  expiresAt: number;          // next 00:00 UTC ms
}

// ── Singleton ───────────────────────────────────────────────

let cache: CachedShop | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function nextMidnightUTC(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 2, 0,  // 00:02 UTC to give API time
  ));
  return tomorrow.getTime();
}

function msUntilNextMidnightUTC(): number {
  return Math.max(nextMidnightUTC() - Date.now(), 60_000);
}

// ── Download ────────────────────────────────────────────────

async function downloadShop(language: string = 'en'): Promise<CachedShop> {
  console.log(`[ShopManager] Downloading shop (lang=${language})...`);
  const res = await axios.get(`https://fortnite-api.com/v2/shop?language=${language}`, {
    timeout: 20_000,
  });

  const entries = res.data?.data?.entries;
  const hash: string = res.data?.data?.hash || '';
  if (!Array.isArray(entries)) throw new Error('Invalid shop response');

  const sectionMap: Record<string, { name: string; items: ShopEntry[] }> = {};

  for (const entry of entries) {
    const brItems = entry.brItems || [];
    if (brItems.length === 0) continue;

    const layoutId = entry.layout?.id || entry.layoutId || 'other';
    const sectionName = entry.layout?.name || layoutId || 'Other';
    if (!sectionMap[layoutId]) sectionMap[layoutId] = { name: sectionName, items: [] };

    // For bundles: use bundle data or first item
    let mainItem: any;
    let isBundle = false;
    if (brItems.length > 1 && entry.bundle) {
      mainItem = entry.bundle;
      isBundle = true;
    } else {
      mainItem = brItems[0];
    }

    if (!mainItem) continue;
    const name = mainItem.name || brItems[0]?.name || '';
    if (!name || name === 'TBD' || name.toLowerCase() === 'unknown') continue;

    let rarity = mainItem.rarity?.value?.toLowerCase() || brItems[0]?.rarity?.value?.toLowerCase() || 'common';
    let series: string | null = null;
    let seriesColors: string[] | null = null;
    const seriesSource = mainItem.series || brItems[0]?.series;
    if (seriesSource) {
      series = seriesSource.value?.toLowerCase() || seriesSource.name?.toLowerCase() || null;
      if (seriesSource.colors && Array.isArray(seriesSource.colors)) {
        seriesColors = seriesSource.colors;
      }
    }

    const imageUrl = mainItem.images?.featured
      || mainItem.images?.icon
      || mainItem.images?.smallIcon
      || brItems[0]?.images?.featured
      || brItems[0]?.images?.icon
      || brItems[0]?.images?.smallIcon
      || '';

    // Build bundle sub-items list
    const bundleItems: BundleSubItem[] = [];
    if (brItems.length > 0) {
      for (const bi of brItems) {
        if (!bi) continue;
        const biName = bi.name || '';
        if (!biName || biName === 'TBD' || biName.toLowerCase() === 'unknown') continue;
        bundleItems.push({
          id: bi.id || '',
          name: biName,
          type: bi.type?.displayValue || '',
          rarity: bi.rarity?.value?.toLowerCase() || 'common',
          imageUrl: bi.images?.featured || bi.images?.icon || bi.images?.smallIcon || '',
          description: bi.description || '',
        });
      }
    }

    sectionMap[layoutId].items.push({
      id: mainItem.id || brItems[0]?.id || entry.offerId,
      offerId: entry.offerId || '',
      name,
      description: mainItem.description || brItems[0]?.description || '',
      type: isBundle ? 'Bundle' : (mainItem.type?.displayValue || brItems[0]?.type?.displayValue || ''),
      rarity,
      series,
      seriesColors,
      imageUrl,
      price: entry.finalPrice ?? entry.regularPrice ?? 0,
      regularPrice: entry.regularPrice ?? 0,
      finalPrice: entry.finalPrice ?? 0,
      isBundle,
      bundleCount: brItems.length,
      giftable: entry.giftable === true,
      sectionId: layoutId,
      bundleItems,
    });
  }

  const sections = Object.values(sectionMap).filter((s) => s.items.length > 0);
  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

  const result: CachedShop = {
    hash,
    sections,
    totalItems,
    fetchedAt: Date.now(),
    expiresAt: nextMidnightUTC(),
  };

  console.log(`[ShopManager] Downloaded ${totalItems} items in ${sections.length} sections (hash: ${hash})`);
  return result;
}

// ── Public API ──────────────────────────────────────────────

export function initShopRefreshTimer(storage: Storage): void {
  scheduleRefresh(storage);
}

function scheduleRefresh(storage: Storage): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const ms = msUntilNextMidnightUTC();
  console.log(`[ShopManager] Next auto-refresh in ${Math.round(ms / 60_000)} min`);
  refreshTimer = setTimeout(async () => {
    console.log('[ShopManager] Auto-refresh triggered (daily rotation)');
    try {
      cache = await downloadShop('en');
      // Notify renderer
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('shop:rotated');
      }
    } catch (err: any) {
      console.error('[ShopManager] Auto-refresh failed:', err?.message);
    }
    scheduleRefresh(storage); // schedule next one
  }, ms);
}

export async function getShopData(): Promise<{
  success: boolean;
  sections: ShopSectionData[];
  totalItems: number;
  hash: string;
  error?: string;
}> {
  try {
    // If cache is fresh, return it
    if (cache && Date.now() < cache.expiresAt) {
      return { success: true, sections: cache.sections, totalItems: cache.totalItems, hash: cache.hash };
    }

    // Download fresh data
    cache = await downloadShop('en');
    return { success: true, sections: cache.sections, totalItems: cache.totalItems, hash: cache.hash };
  } catch (err: any) {
    console.error('[ShopManager] getShopData failed:', err?.message);
    // Return stale cache if available
    if (cache) {
      return { success: true, sections: cache.sections, totalItems: cache.totalItems, hash: cache.hash };
    }
    return { success: false, sections: [], totalItems: 0, hash: '', error: err?.message || 'Failed' };
  }
}

export async function purchaseItem(
  storage: Storage,
  offerId: string,
  expectedPrice: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, error: 'Failed to refresh token' };

    const url = `${Endpoints.MCP}/${main.accountId}/client/PurchaseCatalogEntry?profileId=common_core&rvn=-1`;

    await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
      const res = await axios.post(url,
        { offerId, purchaseQuantity: 1, currency: 'MtxCurrency', currencySubType: '', expectedTotalPrice: expectedPrice, gameContext: '' },
        { headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, timeout: 15_000 },
      );
      return res.data;
    });

    console.log(`[ShopManager] Purchase successful: ${offerId}`);
    return { success: true };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.response?.data?.message || err?.message || 'Purchase failed';
    console.error('[ShopManager] Purchase failed:', msg);
    return { success: false, error: msg };
  }
}

export async function giftItem(
  storage: Storage,
  offerId: string,
  receiverAccountId: string,
  expectedPrice: number,
  giftMessage: string = '',
): Promise<{ success: boolean; error?: string }> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, error: 'Failed to refresh token' };

    const url = `${Endpoints.MCP}/${main.accountId}/client/GiftCatalogEntry?profileId=common_core&rvn=-1`;

    await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
      const res = await axios.post(url,
        {
          offerId,
          receiverAccountIds: [receiverAccountId],
          giftWrapTemplateId: 'GiftBox:gb_default',
          personalMessage: giftMessage,
          currency: 'MtxCurrency',
          currencySubType: '',
          expectedTotalPrice: expectedPrice,
          gameContext: '',
        },
        { headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, timeout: 15_000 },
      );
      return res.data;
    });

    console.log(`[ShopManager] Gift successful: ${offerId} → ${receiverAccountId}`);
    return { success: true };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.response?.data?.message || err?.message || 'Gift failed';
    console.error('[ShopManager] Gift failed:', msg);
    return { success: false, error: msg };
  }
}

export async function toggleGifts(
  storage: Storage,
  enable: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, error: 'Failed to refresh token' };

    const url = `${Endpoints.MCP}/${main.accountId}/client/SetReceiveGiftsEnabled?profileId=common_core&rvn=-1`;

    await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
      const res = await axios.post(url,
        { bReceiveGifts: enable },
        { headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, timeout: 15_000 },
      );
      return res.data;
    });

    console.log(`[ShopManager] Gifts ${enable ? 'enabled' : 'disabled'}`);
    return { success: true };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.response?.data?.message || err?.message || 'Failed';
    console.error('[ShopManager] Toggle gifts failed:', msg);
    return { success: false, error: msg };
  }
}

export async function getFriendsList(
  storage: Storage,
): Promise<{ success: boolean; friends: { accountId: string; displayName: string }[]; error?: string }> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, friends: [], error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, friends: [], error: 'Failed to refresh token' };

    // Get friends summary
    const { data } = await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
      const res = await axios.get(
        `${Endpoints.FRIENDS}/${main.accountId}/summary`,
        { headers: { Authorization: `Bearer ${t}` }, timeout: 10_000 },
      );
      return res.data;
    });

    const friends: { accountId: string; displayName: string }[] = [];
    const accepted = data?.friends || [];

    for (const f of accepted) {
      if (f.accountId) {
        friends.push({ accountId: f.accountId, displayName: f.alias || f.displayName || f.accountId });
      }
    }

    // Resolve display names for friends missing them (batch by 100)
    const missingIds = friends.filter((f) => f.displayName === f.accountId).map((f) => f.accountId);
    if (missingIds.length > 0) {
      try {
        const freshToken = await refreshAccountToken(storage, main.accountId);
        if (freshToken) {
          const nameMap = new Map<string, string>();
          // Chunk into batches of 100
          for (let i = 0; i < missingIds.length; i += 100) {
            const chunk = missingIds.slice(i, i + 100);
            const queryParams = chunk.map((id) => `accountId=${encodeURIComponent(id)}`).join('&');
            try {
              const nameRes = await axios.get(
                `${Endpoints.ACCOUNT_PUBLIC}?${queryParams}`,
                { headers: { Authorization: `Bearer ${freshToken}` }, timeout: 10_000 },
              );
              if (Array.isArray(nameRes.data)) {
                for (const a of nameRes.data) {
                  if (a.displayName) nameMap.set(a.id, a.displayName);
                }
              }
            } catch { /* continue with next chunk */ }
          }
          for (const f of friends) {
            if (nameMap.has(f.accountId)) f.displayName = nameMap.get(f.accountId)!;
          }
        }
      } catch { /* ok */ }
    }

    friends.sort((a, b) => a.displayName.localeCompare(b.displayName));
    console.log(`[ShopManager] Friends loaded: ${friends.length}`);
    return { success: true, friends };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.message || 'Failed';
    console.error('[ShopManager] getFriendsList failed:', msg);
    return { success: false, friends: [], error: msg };
  }
}

export async function getVbucks(
  storage: Storage,
): Promise<{ success: boolean; total: number; error?: string }> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, total: 0, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, total: 0, error: 'Failed to refresh token' };

    const url = `${Endpoints.MCP}/${main.accountId}/client/QueryProfile?profileId=common_core&rvn=-1`;

    const { data } = await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
      const res = await axios.post(url, {},
        { headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, timeout: 15_000 },
      );
      return res.data;
    });

    let total = 0;
    const items = data?.profileChanges?.[0]?.profile?.items || {};
    for (const key in items) {
      const item = items[key];
      if (item.templateId && item.templateId.startsWith('Currency:Mtx')) {
        total += item.quantity || 0;
      }
    }

    console.log(`[ShopManager] V-Bucks: ${total}`);
    return { success: true, total };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.message || 'Failed';
    console.error('[ShopManager] getVbucks failed:', msg);
    return { success: false, total: 0, error: msg };
  }
}

export async function getOwnedCosmeticIds(
  storage: Storage,
): Promise<{ success: boolean; ownedIds: string[]; error?: string }> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, ownedIds: [], error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, ownedIds: [], error: 'Failed to refresh token' };

    const url = `${Endpoints.MCP}/${main.accountId}/client/QueryProfile?profileId=athena&rvn=-1`;

    const { data } = await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
      const res = await axios.post(url, {},
        { headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, timeout: 20_000 },
      );
      return res.data;
    });

    const items = data?.profileChanges?.[0]?.profile?.items || {};
    const ownedIds: string[] = Object.values(items)
      .map((item: any) => item?.templateId as string | undefined)
      .filter((tid): tid is string => !!tid && tid.includes(':'))
      .map((tid) => tid.substring(tid.indexOf(':') + 1).toLowerCase());

    console.log(`[ShopManager] Owned cosmetics: ${ownedIds.length}`);
    return { success: true, ownedIds };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.message || 'Failed';
    console.error('[ShopManager] getOwnedCosmeticIds failed:', msg);
    return { success: false, ownedIds: [], error: msg };
  }
}
