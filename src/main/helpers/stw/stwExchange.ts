/**
 * STW Exchange — fetches the STW item shop (catalog) and returns parsed data.
 *
 * Sections:
 *   - X-Ray Llamas     (CardPackStorePreroll)
 *   - Event Llamas      (CardPackStoreGameplay)
 *   - Event Items        (STWSpecialEventStorefront) — rotates with events
 *   - Weekly Items       (STWRotationalEventStorefront) — weekly rotation
 *
 * Also queries the campaign profile for gold balance.
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import { traducir, getResourceIcon, extractRarity } from './alerts';
import { executeMcp } from '../epic/mcp';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ── Types ───────────────────────────────────────────────────

export interface PrerollItem {
  templateId: string;
  title: string;
  rarity: string;
  rarityColor: string;
  icon: string | null;
  quantity: number;
}

export interface STWShopItem {
  offerId: string;
  devName: string;
  title: string;
  description: string;
  itemType: string;       // e.g. "Hero:hid_commando_008_sr_t01"
  itemCategory: string;   // "hero", "schematic", "worker", "defender", "resource", "cardpack", "other"
  rarity: string;         // "c", "uc", "r", "vr", "sr", "er" or ""
  rarityColor: string;
  quantity: number;
  price: number;
  currencyType: string;   // "eventcurrency_scaling" (gold), "currency_xrayllama" (x-ray tickets)
  currencyIcon: string;
  rawCurrencyType: string;
  rawCurrencySubType: string;
  icon: string | null;
  dailyLimit: number;      // from catalog dailyLimit; -1 = unlimited
  weeklyLimit: number;
  eventLimit: number;      // from meta EventLimit; -1 = unlimited
  purchaseLimitingEventId: string; // from meta PurchaseLimitingEventId
  sortPriority: number;
  prerollContents: PrerollItem[];
}

export interface STWShopSection {
  id: string;
  name: string;
  items: STWShopItem[];
}

export interface STWExchangeData {
  success: boolean;
  sections: STWShopSection[];
  gold: number;
  xrayTickets: number;
  expiration: string;         // catalog expiration ISO string
  error?: string;
}

// ── Cache ───────────────────────────────────────────────────

let _cachedData: STWExchangeData | null = null;
let _cachedUTCDate: string | null = null;

function getUTCDateKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

// ── Currency icon mapping ───────────────────────────────────

function getCurrencyIcon(currencySubType: string): string {
  const key = currencySubType.replace(/AccountResource:/i, '').toLowerCase();
  if (key.includes('eventcurrency_scaling') || key.includes('eventscaling'))
    return 'assets/icons/stw/resources/eventcurrency_scaling.png';
  // Event-specific currencies (eventcurrency_lunar, eventcurrency_spring, etc.) → campaign event icon
  if (key.includes('eventcurrency_') && !key.includes('eventcurrency_scaling'))
    return 'assets/icons/stw/currency/campaign_event_currency.gif';
  if (key.includes('currency_xrayllama'))
    return 'assets/icons/stw/resources/currency_xrayllama.png';
  if (key.includes('currency_mtxswap'))
    return 'assets/icons/stw/resources/currency_mtxswap.png';
  if (key.includes('voucher_cardpack_bronze'))
    return 'assets/icons/stw/resources/voucher_cardpack_bronze.png';
  if (key.includes('voucher_basicpack'))
    return 'assets/icons/stw/resources/voucher_basicpack.png';
  if (key.includes('voucher_cardpack_jackpot'))
    return 'assets/icons/stw/resources/voucher_cardpack_jackpot.png';
  return 'assets/icons/stw/resources/eventcurrency_scaling.png';
}

function getCurrencyKey(currencySubType: string): string {
  return currencySubType.replace(/AccountResource:/i, '').toLowerCase();
}

// ── Item category detection ─────────────────────────────────

function getItemCategory(templateId: string): string {
  const t = templateId.toLowerCase();
  if (t.startsWith('hero:')) return 'hero';
  if (t.startsWith('schematic:')) return 'schematic';
  if (t.startsWith('worker:')) return 'worker';
  if (t.startsWith('defender:')) return 'defender';
  if (t.startsWith('cardpack:')) return 'cardpack';
  if (t.startsWith('accountresource:')) return 'resource';
  if (t.startsWith('campaignheroloadout:')) return 'heroloadout';
  if (t.startsWith('token:')) return 'other';
  return 'other';
}

// ── Item icon from templateId ───────────────────────────────

function getItemIcon(templateId: string): string | null {
  // Use the same icon logic as alerts.ts for resources/account items
  const icon = getResourceIcon(templateId, traducir(templateId));
  if (icon) return icon;

  const tipo = templateId.toLowerCase();

  // Hero
  if (tipo.startsWith('hero:')) {
    const rarity = extractRarity(templateId);
    if (rarity) return `assets/icons/stw/resources/voucher_generic_hero_${rarity}.png`;
    return 'assets/icons/stw/resources/voucher_generic_hero_sr.png';
  }

  // Schematic — detect weapon type
  if (tipo.startsWith('schematic:')) {
    const rarity = extractRarity(templateId);
    if (tipo.includes('trap') || tipo.includes('ceiling') || tipo.includes('floor') || tipo.includes('wall')) {
      if (rarity) return `assets/icons/stw/resources/voucher_generic_trap_${rarity}.png`;
      return 'assets/icons/stw/resources/voucher_generic_trap_sr.png';
    }
    if (tipo.includes('edged') || tipo.includes('blunt') || tipo.includes('piercing') || tipo.includes('melee') || tipo.includes('spear') || tipo.includes('sword') || tipo.includes('scyth') || tipo.includes('axe') || tipo.includes('club') || tipo.includes('hammer')) {
      if (rarity) return `assets/icons/stw/resources/voucher_generic_melee_${rarity}.png`;
      return 'assets/icons/stw/resources/voucher_generic_melee_sr.png';
    }
    if (rarity) return `assets/icons/stw/resources/voucher_generic_ranged_${rarity}.png`;
    return 'assets/icons/stw/resources/voucher_generic_ranged_sr.png';
  }

  // Worker (Survivor)
  if (tipo.startsWith('worker:')) {
    const rarity = extractRarity(templateId);
    if (tipo.includes('manager')) {
      if (rarity) return `assets/icons/stw/resources/voucher_generic_manager_${rarity}.png`;
      return 'assets/icons/stw/resources/voucher_generic_manager_sr.png';
    }
    if (rarity) return `assets/icons/stw/resources/voucher_generic_worker_${rarity}.png`;
    return 'assets/icons/stw/resources/voucher_generic_worker_sr.png';
  }

  // Defender
  if (tipo.startsWith('defender:')) {
    const rarity = extractRarity(templateId);
    if (rarity) return `assets/icons/stw/resources/voucher_generic_defender_${rarity}.png`;
    return 'assets/icons/stw/resources/voucher_generic_defender_sr.png';
  }

  // CardPack (Llama)
  if (tipo.startsWith('cardpack:')) {
    if (tipo.includes('schematic_r')) return 'assets/icons/stw/resources/voucher_generic_schematic_r.png';
    if (tipo.includes('schematic_vr')) return 'assets/icons/stw/resources/voucher_generic_schematic_vr.png';
    if (tipo.includes('schematic_sr')) return 'assets/icons/stw/resources/voucher_generic_schematic_sr.png';
    return 'assets/icons/stw/resources/voucher_cardpack_bronze.png';
  }

  // CampaignHeroLoadout
  if (tipo.startsWith('campaignheroloadout:')) {
    return 'assets/icons/stw/resources/voucher_generic_hero_sr.png';
  }

  // Token
  if (tipo.startsWith('token:')) {
    if (tipo.includes('accountinventorybonus')) return 'assets/icons/stw/resources/armory_slot.png';
    return null;
  }

  return null;
}

// ── Item display name from devName ──────────────────────────

function extractDisplayName(entry: any): string {
  // Use the title field if available
  if (entry.title) return entry.title;

  // Parse devName: "[VIRTUAL]1 x Copper Ratatat for 1680 GameItem : ..."
  const dev: string = entry.devName || '';
  const match = dev.match(/\[VIRTUAL\]\d+\s*x\s*(.+?)\s+for\s+\d+/i);
  if (match) return match[1].trim();

  // Try translating the first itemGrant
  if (entry.itemGrants?.[0]?.templateId) {
    const translated = traducir(entry.itemGrants[0].templateId);
    if (translated && translated !== entry.itemGrants[0].templateId) return translated;
  }

  return dev || 'Unknown Item';
}

// ── Rarity color ────────────────────────────────────────────

function getRarityColor(rarity: string): string {
  const colors: Record<string, string> = {
    c: '#8a8a8a',
    uc: '#5cb85c',
    r: '#337ab7',
    vr: '#9b59b6',
    sr: '#f39c12',
    er: '#e74c3c',
  };
  return colors[rarity] || '#8a8a8a';
}

// ── Parse a catalog entry ───────────────────────────────────

function parseCatalogEntry(entry: any): STWShopItem | null {
  if (!entry?.itemGrants?.length) return null;

  const grant = entry.itemGrants[0];
  const templateId: string = grant.templateId || '';
  const quantity: number = grant.quantity || 1;
  const price = entry.prices?.[0]?.finalPrice ?? 0;
  const currencySubType: string = entry.prices?.[0]?.currencySubType || '';

  const rarity = extractRarity(templateId) || '';
  const category = getItemCategory(templateId);
  const rawCurrencyType: string = entry.prices?.[0]?.currencyType || '';
  const rawCurrencySubType: string = entry.prices?.[0]?.currencySubType || '';

  // Event limit from metaInfo
  let eventLimit = -1;
  let purchaseLimitingEventId = '';
  const metaInfo = entry.metaInfo || [];
  for (const m of metaInfo) {
    if (m.key === 'EventLimit') {
      eventLimit = parseInt(m.value, 10) || -1;
    }
    if (m.key === 'PurchaseLimitingEventId') {
      purchaseLimitingEventId = m.value || '';
    }
  }

  // Daily / Weekly limit
  const dailyLimit: number = entry.dailyLimit ?? -1;
  const weeklyLimit: number = entry.weeklyLimit ?? -1;

  return {
    offerId: entry.offerId || '',
    devName: entry.devName || '',
    title: extractDisplayName(entry),
    description: entry.description || '',
    itemType: templateId,
    itemCategory: category,
    rarity,
    rarityColor: getRarityColor(rarity),
    quantity,
    price,
    currencyType: getCurrencyKey(currencySubType),
    currencyIcon: getCurrencyIcon(currencySubType),
    icon: getItemIcon(templateId),
    dailyLimit,
    weeklyLimit,
    eventLimit,
    purchaseLimitingEventId,
    sortPriority: entry.sortPriority ?? 0,
    rawCurrencyType,
    rawCurrencySubType,
    prerollContents: [],
  };
}

// ── Fetch profile data (gold, x-ray tickets, preroll contents) ──

interface ProfileData {
  gold: number;
  xrayTickets: number;
  prerollDataOfferIds: Map<string, string>;       // offerId → prerollData templateId
  cardPackContents: Map<string, PrerollItem[]>;   // cardpack templateId → preroll items
}

function parsePrerollItems(itemsArr: any[]): PrerollItem[] {
  const contents: PrerollItem[] = [];
  for (const entry of itemsArr) {
    const tplId: string = entry.itemType || entry.templateId || '';
    if (!tplId) continue;
    const qty: number = entry.quantity || 1;
    const r = extractRarity(tplId) || '';
    contents.push({
      templateId: tplId,
      title: traducir(tplId),
      rarity: r,
      rarityColor: getRarityColor(r),
      icon: getItemIcon(tplId),
      quantity: qty,
    });
  }
  return contents;
}

async function fetchProfileData(
  storage: Storage,
  accountId: string,
  token: string,
): Promise<ProfileData> {
  const empty: ProfileData = { gold: 0, xrayTickets: 0, prerollDataOfferIds: new Map(), cardPackContents: new Map() };
  try {
    // PopulatePrerolledOffers generates X-Ray preview data and returns the full campaign profile
    const { data } = await authenticatedRequest(
      storage,
      accountId,
      token,
      async (t) => {
        const res = await axios.post(
          `${Endpoints.MCP}/${accountId}/client/PopulatePrerolledOffers?profileId=campaign&rvn=-1`,
          {},
          {
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            timeout: 15_000,
          },
        );
        return res.data;
      },
    );

    let gold = 0;
    let xrayTickets = 0;
    const prerollMap = new Map<string, PrerollItem[]>();

    // First pass: collect PrerollData items (offerId mapping)
    // Second pass: collect CardPack items with pack_source "Preroll" (actual contents)
    const prerollDataOfferIds = new Map<string, string>(); // offerId → prerollData templateId
    const cardPackContents = new Map<string, PrerollItem[]>(); // cardpack templateId → items

    const changes = data?.profileChanges || [];
    for (const change of changes) {
      const items = change?.profile?.items;
      if (!items) continue;
      for (const [, item] of Object.entries(items) as [string, any][]) {
        const tid = (item.templateId || '').toLowerCase();
        const attrs = item.attributes || {};

        if (tid === 'accountresource:eventcurrency_scaling') {
          gold = item.quantity || 0;
        } else if (tid === 'accountresource:currency_xrayllama') {
          xrayTickets = item.quantity || 0;
        } else if (tid.startsWith('prerolldata:')) {
          // PrerollData items have offerId linking to catalog entries
          const offerId: string = attrs.offerId || '';
          if (offerId) prerollDataOfferIds.set(offerId, tid);
        } else if (tid.startsWith('cardpack:') && attrs.pack_source === 'Preroll') {
          // CardPack items with pack_source "Preroll" contain the actual rolled items
          const itemsArr = attrs.items;
          if (Array.isArray(itemsArr) && itemsArr.length > 0) {
            cardPackContents.set(item.templateId, parsePrerollItems(itemsArr));
          }
        }
      }
    }

    // We return cardPackContents keyed by templateId; matching to catalog happens in getSTWExchange
    return {
      gold,
      xrayTickets,
      prerollDataOfferIds,
      cardPackContents,
    };
  } catch {
    return empty;
  }
}

// ── Fetch purchase counts from common_core profile ──────────

interface PurchaseCounts {
  dailyPurchases: Record<string, number>;
  weeklyPurchases: Record<string, number>;
  // instanceId (= PurchaseLimitingEventId) → offerId → count; from EventPurchaseTracker:generic_instance items
  eventPurchases: Record<string, Record<string, number>>;
}

function extractPurchaseList(obj: any): Record<string, number> {
  if (!obj || typeof obj !== 'object') return {};
  // Structure: { lastInterval: string, purchaseList: Record<string, number> }
  if (obj.purchaseList && typeof obj.purchaseList === 'object') return obj.purchaseList;
  // Flat structure fallback: { offerId: count, ... }
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') result[k] = v;
  }
  return result;
}

function extractTrackerPurchases(obj: any): Record<string, number> {
  // Flat offerId → count map from EventPurchaseTracker attributes.event_purchases
  if (!obj || typeof obj !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') result[k] = v;
  }
  return result;
}

async function fetchPurchaseCounts(
  storage: Storage,
  accountId: string,
  token: string,
): Promise<PurchaseCounts> {
  const empty: PurchaseCounts = { dailyPurchases: {}, weeklyPurchases: {}, eventPurchases: {} };
  try {
    const { data } = await authenticatedRequest(
      storage,
      accountId,
      token,
      async (t) => {
        const res = await axios.post(
          `${Endpoints.MCP}/${accountId}/client/QueryProfile?profileId=common_core&rvn=-1`,
          {},
          {
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            timeout: 15_000,
          },
        );
        return res.data;
      },
    );

    let dailyPurchases: Record<string, number> = {};
    let weeklyPurchases: Record<string, number> = {};
    const eventPurchases: Record<string, Record<string, number>> = {};

    const changes = data?.profileChanges || [];
    for (const change of changes) {
      const profile = change?.profile;
      if (!profile) continue;

      // stats.attributes → daily/weekly
      const attrs = profile?.stats?.attributes;
      if (attrs) {
        dailyPurchases = extractPurchaseList(attrs.daily_purchases);
        weeklyPurchases = extractPurchaseList(attrs.weekly_purchases);
      }

      // items → EventPurchaseTracker:generic_instance
      const items = profile?.items || {};
      for (const item of Object.values(items) as any[]) {
        if (item?.templateId !== 'EventPurchaseTracker:generic_instance') continue;
        const instanceId: string = item?.attributes?.event_instance_id;
        const purchases = item?.attributes?.event_purchases;
        if (instanceId && purchases) {
          eventPurchases[instanceId] = extractTrackerPurchases(purchases);
        }
      }

      break;
    }

    return { dailyPurchases, weeklyPurchases, eventPurchases };
  } catch {
    return empty;
  }
}

function applyPurchaseCounts(sections: STWShopSection[], counts: PurchaseCounts): void {
  for (const section of sections) {
    for (const item of section.items) {
      // Event-limited items — matched by full PurchaseLimitingEventId = EventPurchaseTracker.event_instance_id
      if (item.eventLimit > 0 && item.purchaseLimitingEventId) {
        const trackerOffers = counts.eventPurchases[item.purchaseLimitingEventId];
        const bought = trackerOffers?.[item.offerId] || 0;
        item.eventLimit = Math.max(0, item.eventLimit - bought);
      }
      // Weekly-limited items
      if (item.weeklyLimit > 0) {
        const bought = counts.weeklyPurchases[item.offerId] || 0;
        item.weeklyLimit = Math.max(0, item.weeklyLimit - bought);
      }
      // Daily-limited items
      if (item.dailyLimit > 0) {
        const bought = counts.dailyPurchases[item.offerId] || 0;
        item.dailyLimit = Math.max(0, item.dailyLimit - bought);
      }
    }
  }
}

// ── Main API ────────────────────────────────────────────────

export async function getSTWExchange(storage: Storage, forceRefresh = false): Promise<STWExchangeData> {
  const today = getUTCDateKey();
  if (!forceRefresh && _cachedData && _cachedUTCDate === today) {
    // Refresh gold balance even on cache hit
    try {
      const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
      const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
      if (main) {
        const token = await refreshAccountToken(storage, main.accountId);
        if (token) {
          const { gold, xrayTickets } = await fetchProfileData(storage, main.accountId, token);
          _cachedData = { ..._cachedData, gold, xrayTickets };
        }
      }
    } catch { /* use cached values */ }
    return _cachedData;
  }

  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) return { success: false, sections: [], gold: 0, xrayTickets: 0, expiration: '', error: 'No account found' };

  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) return { success: false, sections: [], gold: 0, xrayTickets: 0, expiration: '', error: 'Failed to refresh token' };

  // Fetch catalog
  const { data: catalog } = await authenticatedRequest(
    storage,
    main.accountId,
    token,
    async (t) => {
      const res = await axios.get(Endpoints.BR_STORE, {
        headers: { Authorization: `Bearer ${t}` },
        timeout: 20_000,
      });
      return res.data;
    },
  );

  const expiration: string = catalog.expiration || '';

  // Fetch profile data (gold, x-ray, preroll contents)
  const { gold, xrayTickets, prerollDataOfferIds, cardPackContents } = await fetchProfileData(storage, main.accountId, token);

  // Build a helper to find preroll contents for a catalog entry
  function findPrerollContents(offerId: string, itemGrantsTemplateId: string): PrerollItem[] {
    // Strategy 1: Check if this offerId has a PrerollData entry, then match CardPack by root name
    // Strategy 2: Try matching the catalog's cardpack type to profile's prerolled cardpacks
    const catalogType = itemGrantsTemplateId.toLowerCase(); // e.g. "cardpack:cardpack_bronze"
    for (const [profileType, contents] of cardPackContents) {
      const profileTypeLower = profileType.toLowerCase();
      // Try: profile type starts with catalog type (e.g. "cardpack:cardpack_bronze_03x" starts with "cardpack:cardpack_bronze")
      if (profileTypeLower.startsWith(catalogType)) return contents;
      // Try: catalog type starts with profile type
      if (catalogType.startsWith(profileTypeLower)) return contents;
    }
    // Strategy 3: fuzzy match — strip CardPack: prefix, look for shared base
    const catalogBase = catalogType.replace('cardpack:', '').replace('cardpack_', '');
    for (const [profileType, contents] of cardPackContents) {
      const profileBase = profileType.toLowerCase().replace('cardpack:', '').replace('cardpack_', '');
      if (catalogBase && profileBase && (profileBase.includes(catalogBase) || catalogBase.includes(profileBase))) {
        return contents;
      }
    }
    return [];
  }

  // Extract STW storefronts
  const storefronts: any[] = catalog.storefronts || [];
  const sfMap: Record<string, any> = {};
  for (const sf of storefronts) {
    sfMap[sf.name] = sf;
  }

  const sections: STWShopSection[] = [];

  // 1) X-Ray Llamas (CardPackStorePreroll)
  const preroll = sfMap['CardPackStorePreroll'];
  if (preroll?.catalogEntries?.length) {
    const items: STWShopItem[] = [];
    for (const entry of preroll.catalogEntries) {
      const parsed = parseCatalogEntry(entry);
      if (!parsed || parsed.price <= 0) continue;
      // Only include llamas that cost X-Ray tickets (currency_xrayllama)
      if (!parsed.rawCurrencySubType.toLowerCase().includes('currency_xrayllama')) continue;
      // Attach preroll contents if available
      const contents = findPrerollContents(parsed.offerId, parsed.itemType);
      if (contents.length) parsed.prerollContents = contents;
      items.push(parsed);
    }
    items.sort((a, b) => a.price - b.price);
    if (items.length > 0) {
      sections.push({ id: 'xray-llamas', name: 'X-Ray Llamas', items });
    }
  }

  // 2) Event Llamas (CardPackStoreGameplay) — only event-currency entries, not vouchers
  const gameplay = sfMap['CardPackStoreGameplay'];
  if (gameplay?.catalogEntries?.length) {
    const items: STWShopItem[] = [];
    for (const entry of gameplay.catalogEntries) {
      const sub = (entry.prices?.[0]?.currencySubType || '').toLowerCase();
      if (sub.includes('voucher')) continue; // Skip voucher-based entries
      const parsed = parseCatalogEntry(entry);
      if (parsed) items.push(parsed);
    }
    items.sort((a, b) => a.price - b.price);
    if (items.length > 0) {
      sections.push({ id: 'event-llamas', name: 'Event Llamas', items });
    }
  }

  // 3) Event Items (STWSpecialEventStorefront)
  const special = sfMap['STWSpecialEventStorefront'];
  if (special?.catalogEntries?.length) {
    const items: STWShopItem[] = [];
    for (const entry of special.catalogEntries) {
      const parsed = parseCatalogEntry(entry);
      if (parsed) items.push(parsed);
    }
    items.sort((a, b) => b.sortPriority - a.sortPriority || b.price - a.price);
    if (items.length > 0) {
      sections.push({ id: 'event-items', name: 'Event Items', items });
    }
  }

  // 4) Weekly Items (STWRotationalEventStorefront)
  const rotational = sfMap['STWRotationalEventStorefront'];
  if (rotational?.catalogEntries?.length) {
    const items: STWShopItem[] = [];
    for (const entry of rotational.catalogEntries) {
      const parsed = parseCatalogEntry(entry);
      if (parsed) items.push(parsed);
    }
    items.sort((a, b) => b.sortPriority - a.sortPriority || b.price - a.price);
    if (items.length > 0) {
      sections.push({ id: 'weekly-items', name: 'Weekly Items', items });
    }
  }

  // Fetch purchase counts from common_core and compute actual remaining
  const purchaseCounts = await fetchPurchaseCounts(storage, main.accountId, token);
  applyPurchaseCounts(sections, purchaseCounts);

  const result: STWExchangeData = {
    success: true,
    sections,
    gold,
    xrayTickets,
    expiration,
  };

  _cachedData = result;
  _cachedUTCDate = today;

  return result;
}

// ── Gold balance only (for account switch refresh) ──────────

export async function getGoldBalance(storage: Storage): Promise<{ success: boolean; gold: number; xrayTickets: number; error?: string }> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, gold: 0, xrayTickets: 0, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, gold: 0, xrayTickets: 0, error: 'Failed to refresh token' };

    const { gold, xrayTickets } = await fetchProfileData(storage, main.accountId, token);
    return { success: true, gold, xrayTickets };
  } catch (err: any) {
    return { success: false, gold: 0, xrayTickets: 0, error: err?.message || 'Unknown error' };
  }
}

// ── Purchase an STW shop item ───────────────────────────────

export async function purchaseSTWItem(
  storage: Storage,
  offerId: string,
  price: number,
  quantity: number,
  currencyType: string,
  currencySubType: string,
): Promise<{ success: boolean; error?: string }> {
  // For cardpack (llama) items, purchase one at a time sequentially
  const isCardPack = _cachedData?.sections.some(s =>
    s.items.some(i => i.offerId === offerId && i.itemCategory === 'cardpack'),
  );
  const loops = (isCardPack && quantity > 1) ? quantity : 1;
  const perLoopQty = (isCardPack && quantity > 1) ? 1 : quantity;

  let lastError: string | undefined;
  let purchased = 0;

  for (let i = 0; i < loops; i++) {
    const result = await executeMcp(storage, 'PurchaseCatalogEntry', 'common_core', {
      offerId,
      purchaseQuantity: perLoopQty,
      currency: currencyType,
      currencySubType,
      expectedTotalPrice: price * perLoopQty,
      gameContext: '',
    });

    if (!result.success) {
      lastError = result.error;
      break;
    }
    purchased += perLoopQty;
  }

  if (purchased > 0 && _cachedData) {
    // Locally update remaining counts and currency balance
    for (const section of _cachedData.sections) {
      const item = section.items.find(i => i.offerId === offerId);
      if (item) {
        if (item.dailyLimit > 0) item.dailyLimit = Math.max(0, item.dailyLimit - purchased);
        if (item.eventLimit > 0) item.eventLimit = Math.max(0, item.eventLimit - purchased);
        if (item.weeklyLimit > 0) item.weeklyLimit = Math.max(0, item.weeklyLimit - purchased);
        const ck = item.currencyType;
        if (ck.includes('eventcurrency_scaling')) {
          _cachedData.gold = Math.max(0, _cachedData.gold - (price * purchased));
        } else if (ck.includes('currency_xrayllama')) {
          _cachedData.xrayTickets = Math.max(0, _cachedData.xrayTickets - (price * purchased));
        }
        break;
      }
    }
  }

  if (purchased === 0) return { success: false, error: lastError };
  if (purchased < quantity) return { success: true, error: `Only purchased ${purchased}/${quantity}: ${lastError}` };
  return { success: true };
}

// ── Clear cache ─────────────────────────────────────────────

export function clearSTWExchangeCache(): void {
  _cachedData = null;
  _cachedUTCDate = null;
}
