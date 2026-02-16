/**
 * GhostEquip page — equip cosmetics to your Fortnite party without owning them.
 * Fetches cosmetics from fortnite-api.com and sends them via PartyManager.
 */

import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────

type CosmeticCategory = 'outfit' | 'backpack' | 'emote' | 'shoe' | 'banner';
type TabId = CosmeticCategory | 'crowns' | 'level';

interface CosmeticItem {
  id: string;
  name: string;
  rarity: string;
  type: string;
  imageUrl: string;
  set: string | null;
}

interface BannerItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
}

let activeTab: TabId = 'outfit';
let searchQuery = '';
let selectedItem: CosmeticItem | BannerItem | null = null;
let applying = false;
let statusMessage: { text: string; type: 'success' | 'error' } | null = null;

// Cosmetic caches (by category)
const cosmeticCache: Record<string, CosmeticItem[]> = {};
const bannerCache: { items: BannerItem[]; expiry: number } = { items: [], expiry: 0 };
let cosmeticCacheExpiry: Record<string, number> = {};
let loadingCosmetics = false;

// Number inputs for crowns/level
let numberInputValue = '';

// ── Helpers ───────────────────────────────────────────────

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'outfit', label: 'Skin', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
  { id: 'backpack', label: 'Backpack', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></svg>' },
  { id: 'emote', label: 'Emote', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>' },
  { id: 'shoe', label: 'Shoes', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16l4-8 4 4 4-4 4 8H4z"/></svg>' },
  { id: 'banner', label: 'Banner', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>' },
  { id: 'crowns', label: 'Crowns', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20h20L18 8l-4 4-2-6-2 6-4-4L2 20z"/></svg>' },
  { id: 'level', label: 'Level', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
];

const RARITY_ORDER: Record<string, number> = {
  legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4,
};

const RARITY_COLORS: Record<string, string> = {
  legendary: '#f0a030',
  epic: '#b845e6',
  rare: '#3c9cff',
  uncommon: '#69bb1e',
  common: '#808080',
};

// ── Data fetching ─────────────────────────────────────────

async function fetchCosmetics(category: CosmeticCategory): Promise<CosmeticItem[]> {
  if (category === 'banner') return []; // banners use separate API

  const cacheKey = category;
  if (cosmeticCache[cacheKey] && Date.now() < (cosmeticCacheExpiry[cacheKey] || 0)) {
    return cosmeticCache[cacheKey];
  }

  loadingCosmetics = true;

  try {
    const response = await fetch('https://fortnite-api.com/v2/cosmetics?language=en', { signal: AbortSignal.timeout(15000) });
    const data = await response.json();

    if (data?.status === 200 && data?.data?.br) {
      const allCosmetics: any[] = data.data.br;

      // Cache all cosmetic categories at once (since the API returns everything)
      const categories: CosmeticCategory[] = ['outfit', 'backpack', 'emote', 'shoe'];
      for (const cat of categories) {
        const typeMap: Record<string, string> = { outfit: 'outfit', backpack: 'backpack', emote: 'emote', shoe: 'shoe' };
        const filtered = allCosmetics
          .filter((item: any) => item.type?.value === typeMap[cat])
          .map((item: any) => ({
            id: item.id,
            name: item.name || item.id,
            rarity: (item.rarity?.value || 'common').toLowerCase(),
            type: item.type?.displayValue || cat,
            imageUrl: item.images?.smallIcon || item.images?.icon || '',
            set: item.set?.text || null,
          }))
          .filter((item: CosmeticItem) => item.id && item.name)
          .sort((a: CosmeticItem, b: CosmeticItem) => {
            const ra = RARITY_ORDER[a.rarity] ?? 99;
            const rb = RARITY_ORDER[b.rarity] ?? 99;
            if (ra !== rb) return ra - rb;
            return a.name.localeCompare(b.name);
          });

        cosmeticCache[cat] = filtered;
        cosmeticCacheExpiry[cat] = Date.now() + 30 * 60 * 1000; // 30 min
      }

      return cosmeticCache[cacheKey] || [];
    }
    return [];
  } catch (err) {
    console.error('[GhostEquip] Failed to fetch cosmetics:', err);
    return [];
  } finally {
    loadingCosmetics = false;
  }
}

async function fetchBanners(): Promise<BannerItem[]> {
  if (bannerCache.items.length > 0 && Date.now() < bannerCache.expiry) {
    return bannerCache.items;
  }

  loadingCosmetics = true;

  try {
    const response = await fetch('https://fortnite-api.com/v1/banners?language=en', { signal: AbortSignal.timeout(15000) });
    const data = await response.json();

    if (data?.status === 200 && Array.isArray(data?.data)) {
      bannerCache.items = data.data
        .map((item: any) => ({
          id: item.id,
          name: item.name || item.devName || 'Banner',
          category: item.category || 'Other',
          imageUrl: item.images?.icon || item.images?.smallIcon || '',
        }))
        .filter((b: BannerItem) => b.id && b.name)
        .sort((a: BannerItem, b: BannerItem) => a.name.localeCompare(b.name));

      bannerCache.expiry = Date.now() + 30 * 60 * 1000;
      return bannerCache.items;
    }
    return [];
  } catch (err) {
    console.error('[GhostEquip] Failed to fetch banners:', err);
    return [];
  } finally {
    loadingCosmetics = false;
  }
}

// ── Apply cosmetic ────────────────────────────────────────

async function applyCosmetic(): Promise<void> {
  if (applying) return;

  applying = true;
  statusMessage = null;
  draw();

  try {
    let result: { success: boolean; message?: string; error?: string };

    switch (activeTab) {
      case 'outfit':
        if (!selectedItem) throw new Error('No item selected');
        result = await window.glowAPI.ghostequip.setOutfit(selectedItem.id);
        break;
      case 'backpack':
        if (!selectedItem) throw new Error('No item selected');
        result = await window.glowAPI.ghostequip.setBackpack(selectedItem.id);
        break;
      case 'emote':
        if (!selectedItem) throw new Error('No item selected');
        result = await window.glowAPI.ghostequip.setEmote(selectedItem.id);
        break;
      case 'shoe':
        if (!selectedItem) throw new Error('No item selected');
        result = await window.glowAPI.ghostequip.setShoes(selectedItem.id);
        break;
      case 'banner':
        if (!selectedItem) throw new Error('No item selected');
        result = await window.glowAPI.ghostequip.setBanner(selectedItem.id);
        break;
      case 'crowns': {
        const num = parseInt(numberInputValue, 10);
        if (isNaN(num)) throw new Error('Enter a valid number');
        result = await window.glowAPI.ghostequip.setCrowns(num);
        break;
      }
      case 'level': {
        const num = parseInt(numberInputValue, 10);
        if (isNaN(num)) throw new Error('Enter a valid number');
        result = await window.glowAPI.ghostequip.setLevel(num);
        break;
      }
      default:
        throw new Error('Unknown tab');
    }

    if (result.success) {
      statusMessage = { text: result.message || 'Applied successfully!', type: 'success' };
    } else {
      statusMessage = { text: result.error || 'Failed to apply', type: 'error' };
    }
  } catch (err: any) {
    statusMessage = { text: err?.message || 'An error occurred', type: 'error' };
  } finally {
    applying = false;
    draw();
  }
}

// ── Filtering ─────────────────────────────────────────────

function filterItems(items: (CosmeticItem | BannerItem)[]): (CosmeticItem | BannerItem)[] {
  if (!searchQuery) return []; // Require search
  const q = searchQuery.toLowerCase();
  return items.filter((item) => {
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.id.toLowerCase().includes(q)) return true;
    if ('rarity' in item && item.rarity.toLowerCase().includes(q)) return true;
    if ('set' in item && item.set && item.set.toLowerCase().includes(q)) return true;
    if ('category' in item && item.category.toLowerCase().includes(q)) return true;
    return false;
  }).slice(0, 100);
}

// ── Get preview image URL ─────────────────────────────────

function getPreviewUrl(item: CosmeticItem | BannerItem | null): string {
  if (!item) return '';
  if (activeTab === 'banner') {
    return `https://fortnite-api.com/images/banners/${item.id}/icon.png`;
  }
  // Use icon instead of smallicon for bigger preview
  return `https://fortnite-api.com/images/cosmetics/br/${item.id}/icon.png`;
}

// ── Draw ──────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  const isNumberTab = activeTab === 'crowns' || activeTab === 'level';
  const isCosmeticTab = !isNumberTab;

  // Build tabs
  const tabsHtml = TABS.map((t) => `
    <button class="ge-tab ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
      ${t.icon}
      <span>${t.label}</span>
    </button>
  `).join('');

  // Build body
  let bodyHtml = '';

  if (isNumberTab) {
    const placeholder = activeTab === 'crowns' ? 'Number of crowns...' : 'Battle Pass level...';
    const label = activeTab === 'crowns' ? 'Victory Crowns' : 'Battle Pass Level';
    bodyHtml = `
      <div class="ge-number-panel">
        <div class="ge-number-form">
          <label class="ge-number-label">${label}</label>
          <input type="number" class="ge-number-input" id="ge-number-input"
                 placeholder="${placeholder}" value="${esc(numberInputValue)}" />
          <p class="ge-number-hint">${activeTab === 'crowns' ? 'Sets your crown count and plays the crown emote' : 'Sets the level shown in your party card'}</p>
        </div>
        <div class="ge-number-preview">
          <div class="ge-number-icon">
            ${activeTab === 'crowns'
              ? '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"><path d="M2 20h20L18 8l-4 4-2-6-2 6-4-4L2 20z"/></svg>'
              : '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
            }
          </div>
          ${numberInputValue ? `<span class="ge-number-value">${esc(numberInputValue)}</span>` : ''}
        </div>
      </div>`;
  } else {
    bodyHtml = `
      <div class="ge-cosmetic-panel">
        <div class="ge-search-wrap">
          <svg class="ge-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="ge-search" id="ge-search"
                 placeholder="Search ${TABS.find(t => t.id === activeTab)?.label || 'cosmetics'}..."
                 value="${esc(searchQuery)}" />
          ${searchQuery ? '<button class="ge-search-clear" id="ge-search-clear">✕</button>' : ''}
        </div>
        <div class="ge-items-wrap">
          <div class="ge-items-list" id="ge-items-list">
            <div class="ge-no-items">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p>Type a name to search cosmetics</p>
            </div>
          </div>
          <div class="ge-preview-panel" id="ge-preview-panel">
            ${selectedItem ? renderPreview(selectedItem) : renderEmptyPreview()}
          </div>
        </div>
      </div>`;
  }

  // Status message
  let statusHtml = '';
  if (statusMessage) {
    statusHtml = `<div class="ge-status ge-status-${statusMessage.type}">${esc(statusMessage.text)}</div>`;
  }

  // Apply button
  const canApply = isNumberTab ? numberInputValue.length > 0 : !!selectedItem;
  const applyLabel = applying ? 'Applying...' : 'Apply';

  el.innerHTML = `
    <div class="page-ghostequip">
      <div class="ge-header">
        <h1 class="ge-title">Ghost Equip</h1>
        <span class="ge-subtitle">Equip cosmetics without owning them</span>
      </div>
      <div class="ge-tabs">${tabsHtml}</div>
      <div class="ge-body">${bodyHtml}</div>
      <div class="ge-footer">
        ${statusHtml}
        <button class="btn btn-accent ge-apply-btn" id="ge-apply" ${!canApply || applying ? 'disabled' : ''}>
          ${applying ? '<div class="shop-spinner tiny"></div>' : ''}
          ${applyLabel}
        </button>
      </div>
    </div>`;

  bindEvents();

  // Only load items if there's an active search query
  if (isCosmeticTab && !loadingCosmetics && searchQuery) {
    loadAndRenderItems();
  }
}

function renderPreview(item: CosmeticItem | BannerItem): string {
  const imageUrl = getPreviewUrl(item);
  const rarityColor = 'rarity' in item ? (RARITY_COLORS[(item as CosmeticItem).rarity] || '#808080') : '#3c9cff';
  const rarityLabel = 'rarity' in item ? (item as CosmeticItem).rarity : (item as BannerItem).category;
  const setLabel = 'set' in item && (item as CosmeticItem).set ? `<span class="ge-preview-set">${esc((item as CosmeticItem).set!)}</span>` : '';

  return `
    <div class="ge-preview-content" style="--preview-accent: ${rarityColor}">
      <div class="ge-preview-image">
        <img src="${esc(imageUrl)}" alt="${esc(item.name)}" onerror="this.style.display='none'" />
      </div>
      <div class="ge-preview-info">
        <h3 class="ge-preview-name">${esc(item.name)}</h3>
        <span class="ge-preview-rarity" style="color: ${rarityColor}">${esc(rarityLabel)}</span>
        ${setLabel}
        <span class="ge-preview-id">${esc(item.id)}</span>
      </div>
    </div>`;
}

function renderEmptyPreview(): string {
  return `
    <div class="ge-preview-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.25">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <p>Select an item to preview</p>
    </div>`;
}

function renderItemCard(item: CosmeticItem | BannerItem, isSelected: boolean): string {
  const imageUrl = activeTab === 'banner'
    ? (item as BannerItem).imageUrl
    : (item as CosmeticItem).imageUrl;
  const rarityColor = 'rarity' in item ? (RARITY_COLORS[(item as CosmeticItem).rarity] || '#808080') : '#3c9cff';
  const subtitleText = 'rarity' in item ? (item as CosmeticItem).rarity : (item as BannerItem).category;

  return `
    <div class="ge-item ${isSelected ? 'selected' : ''}" data-id="${esc(item.id)}" style="--item-accent: ${rarityColor}">
      <div class="ge-item-img">
        ${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(item.name)}" decoding="async" onerror="this.style.display='none'" />` : ''}
      </div>
      <div class="ge-item-info">
        <span class="ge-item-name">${esc(item.name)}</span>
        <span class="ge-item-rarity">${esc(subtitleText)}</span>
      </div>
    </div>`;
}

// ── Load and render items ─────────────────────────────────

async function loadAndRenderItems(): Promise<void> {
  const listEl = el?.querySelector('#ge-items-list') as HTMLElement | null;
  if (!listEl) return;

  // Check if we need to fetch (not cached) — show spinner directly
  const needsFetch = activeTab === 'banner'
    ? !(bannerCache.items.length > 0 && Date.now() < bannerCache.expiry)
    : !(cosmeticCache[activeTab] && Date.now() < (cosmeticCacheExpiry[activeTab] || 0));

  if (needsFetch) {
    listEl.innerHTML = `<div class="ge-loading"><div class="shop-spinner"></div><p>Loading cosmetics...</p></div>`;
  }

  let items: (CosmeticItem | BannerItem)[];

  if (activeTab === 'banner') {
    items = await fetchBanners();
  } else {
    items = await fetchCosmetics(activeTab as CosmeticCategory);
  }

  // Verify list element is still in the DOM
  if (!el?.contains(listEl)) return;

  const filtered = filterItems(items);

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="ge-no-items">
      <p>${searchQuery ? 'No items match your search' : 'No items found'}</p>
    </div>`;
    return;
  }

  listEl.innerHTML = filtered.map((item) => {
    const isSelected = selectedItem?.id === item.id;
    return renderItemCard(item, isSelected);
  }).join('');

  // Bind item clicks
  listEl.querySelectorAll<HTMLElement>('.ge-item').forEach((itemEl) => {
    itemEl.addEventListener('click', () => {
      const id = itemEl.dataset.id;
      if (!id) return;

      // Find the item
      let allItems: (CosmeticItem | BannerItem)[];
      if (activeTab === 'banner') {
        allItems = bannerCache.items;
      } else {
        allItems = cosmeticCache[activeTab] || [];
      }

      const found = allItems.find((i) => i.id === id);
      if (found) {
        selectedItem = found;
        statusMessage = null;

        // Update selection visually
        listEl.querySelectorAll('.ge-item.selected').forEach((s) => s.classList.remove('selected'));
        itemEl.classList.add('selected');

        // Update preview
        const previewEl = el?.querySelector('#ge-preview-panel');
        if (previewEl) previewEl.innerHTML = renderPreview(found);

        // Enable apply button
        const applyBtn = el?.querySelector('#ge-apply') as HTMLButtonElement;
        if (applyBtn) applyBtn.disabled = false;

        // Clear status
        const statusEl = el?.querySelector('.ge-status');
        if (statusEl) statusEl.remove();
      }
    });
  });
}

// ── Event binding ─────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // Tab clicks
  el.querySelectorAll<HTMLElement>('.ge-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab as TabId;
      if (id === activeTab) return;
      activeTab = id;
      searchQuery = '';
      selectedItem = null;
      numberInputValue = '';
      statusMessage = null;
      draw();
    });
  });

  // Search input
  const searchInput = el.querySelector('#ge-search') as HTMLInputElement | null;
  let searchDebounce: ReturnType<typeof setTimeout>;
  searchInput?.addEventListener('input', () => {
    const val = searchInput.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = val;
      if (!val.trim()) {
        const listEl = el?.querySelector('#ge-items-list') as HTMLElement | null;
        if (listEl) {
          listEl.innerHTML = `<div class="ge-no-items">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <p>Type a name to search cosmetics</p>
          </div>`;
        }
        return;
      }
      loadAndRenderItems();
    }, 200);
  });

  // Search clear
  el.querySelector('#ge-search-clear')?.addEventListener('click', () => {
    searchQuery = '';
    if (searchInput) searchInput.value = '';
    const listEl = el?.querySelector('#ge-items-list') as HTMLElement | null;
    if (listEl) {
      listEl.innerHTML = `<div class="ge-no-items">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <p>Type a name to search cosmetics</p>
      </div>`;
    }
  });

  // Number input
  const numInput = el.querySelector('#ge-number-input') as HTMLInputElement | null;
  numInput?.addEventListener('input', () => {
    numberInputValue = numInput.value;
    const applyBtn = el?.querySelector('#ge-apply') as HTMLButtonElement;
    if (applyBtn) applyBtn.disabled = !numberInputValue;
  });

  // Apply button
  el.querySelector('#ge-apply')?.addEventListener('click', () => {
    applyCosmetic();
  });
}

// ── Page Definition ──────────────────────────────────────

export const ghostequipPage: PageDefinition = {
  id: 'ghostequip',
  label: 'Ghost Equip',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>`,
  order: 22,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    activeTab = 'outfit';
    searchQuery = '';
    selectedItem = null;
    numberInputValue = '';
    applying = false;
    statusMessage = null;
    draw();
  },

  cleanup(): void {
    el = null;
  },
};
