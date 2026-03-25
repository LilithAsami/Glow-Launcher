/**
 * STW Exchange Page — Displays the Save the World item shop.
 *
 * Three tabs like the game:
 *   - X-Ray Llamas (CardPackStorePreroll)
 *   - Loot (Event Llamas with campaign_event_currency only)
 *   - Items (Event Items + Weekly Items)
 *
 * Buy on hover: click = buy 1, long-press = quantity picker.
 */

import type { PageDefinition, STWExchangeData, STWShopItem, STWShopSection } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ───────────────────────────────────────────────────

let data: STWExchangeData | null = null;
let loading = true;
let error: string | null = null;
let activeTab = 'xray';
let showBg = false;
let customBgPath = '';
let buyingSet = new Set<string>(); // offerId set for in-progress purchases
let qtyPickerOffer: string | null = null; // offerId of card showing qty picker


const TABS = [
  { id: 'xray', label: 'X-Ray Llamas', sectionIds: ['xray-llamas'] },
  { id: 'loot', label: 'Loot', sectionIds: ['event-llamas'] },
  { id: 'items', label: 'Items', sectionIds: ['event-items', 'weekly-items'] },
];

// ── Helpers ─────────────────────────────────────────────────

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function getCountdownToReset(): string {
  const now = new Date();
  const reset = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0,
  ));
  const diff = reset.getTime() - now.getTime();
  if (diff <= 0) return 'Resetting...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function getCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    hero: 'Hero', schematic: 'Schematic', worker: 'Survivor',
    defender: 'Defender', resource: 'Account Resource', cardpack: 'Card Pack',
    heroloadout: 'Hero Loadout', other: 'Item',
  };
  return labels[cat] || 'Item';
}

function getRarityLabel(rarity: string): string {
  const labels: Record<string, string> = {
    c: 'Common', uc: 'Uncommon', r: 'Rare',
    vr: 'Epic', sr: 'Legendary', er: 'Mythic',
  };
  return labels[rarity] || '';
}

function getRarityBorderClass(rarity: string): string {
  return rarity ? `stw-ex-card--${rarity}` : 'stw-ex-card--default';
}

function getLimitText(item: STWShopItem): string {
  if (item.eventLimit === 0 || item.weeklyLimit === 0 || item.dailyLimit === 0) return 'Purchased';
  if (item.eventLimit > 0) return `${item.eventLimit} left`;
  if (item.weeklyLimit > 0) return `${item.weeklyLimit} left`;
  if (item.dailyLimit > 0) return `${item.dailyLimit} left`;
  return '';
}

function isSoldOut(item: STWShopItem): boolean {
  return item.eventLimit === 0 || item.weeklyLimit === 0 || item.dailyLimit === 0;
}

function getMaxBuyQty(item: STWShopItem): number {
  if (item.eventLimit > 0) return item.eventLimit;
  if (item.weeklyLimit > 0) return item.weeklyLimit;
  if (item.dailyLimit > 0) return item.dailyLimit;
  return 100;
}

function findItemByOffer(offerId: string): STWShopItem | null {
  if (!data) return null;
  for (const sec of data.sections) {
    for (const item of sec.items) {
      if (item.offerId === offerId) return item;
    }
  }
  return null;
}

// ── Background ──────────────────────────────────────────────

const bgDiv = () => {
  if (!showBg) return '';
  if (customBgPath) return `<div class="stw-ex-bg" style="background: url('glow-bg://load/${customBgPath.replace(/\\/g, '/')}') center / cover no-repeat, linear-gradient(135deg, #0d0d1a 0%, #1a1030 40%, #0d0d1a 100%)"></div>`;
  return '<div class="stw-ex-bg"></div>';
};

// ── Card rendering ──────────────────────────────────────────

function renderCard(item: STWShopItem, isXRay = false): string {
  const limitText = getLimitText(item);
  const categoryLabel = getCategoryLabel(item.itemCategory);
  const rarityLabel = getRarityLabel(item.rarity);
  const borderClass = getRarityBorderClass(item.rarity);
  const iconSrc = item.icon || 'assets/icons/stw/resources/voucher_cardpack_bronze.png';
  const isBuying = buyingSet.has(item.offerId);
  const maxQty = getMaxBuyQty(item);
  const showQtyPicker = qtyPickerOffer === item.offerId;
  const hasMultiple = maxQty > 1;
  const soldOut = isSoldOut(item);

  const buyBtnData = `data-action="buy-one"
                data-offer="${esc(item.offerId)}"
                data-price="${item.price}"
                data-ct="${esc(item.rawCurrencyType)}"
                data-cs="${esc(item.rawCurrencySubType)}"`;

  let overlayContent: string;
  if (soldOut) {
    overlayContent = '<div class="stw-ex-purchased-label">PURCHASED</div>';
  } else if (isBuying) {
    overlayContent = '<div class="stw-ex-buy-spinner"></div>';
  } else if (isXRay && maxQty > 1) {
    // X-Ray llamas: BUY + BUY × (opens qty picker)
    overlayContent = `<div class="stw-ex-buy-stack">
      <button class="stw-ex-buy-btn" ${buyBtnData}>BUY</button>
      <button class="stw-ex-buy-multi-btn" data-action="open-qty" data-offer="${esc(item.offerId)}">BUY &times;</button>
    </div>`;
  } else if (!isXRay && hasMultiple && item.itemCategory !== 'cardpack') {
    // Non-cardpack items with >1 remaining: BUY + BUY ALL
    overlayContent = `<div class="stw-ex-buy-stack">
      <button class="stw-ex-buy-btn" ${buyBtnData}>BUY</button>
      <button class="stw-ex-buy-all-btn"
        data-action="buy-all"
        data-offer="${esc(item.offerId)}"
        data-price="${item.price}"
        data-max="${maxQty}"
        data-ct="${esc(item.rawCurrencyType)}"
        data-cs="${esc(item.rawCurrencySubType)}">BUY ALL</button>
    </div>`;
  } else {
    overlayContent = `<button class="stw-ex-buy-btn" ${buyBtnData}>BUY</button>`;
  }

  return `
    <div class="stw-ex-card ${borderClass}${soldOut ? ' stw-ex-card--sold-out' : ''}" data-offer="${esc(item.offerId)}">
      <div class="stw-ex-card-inner">
        ${limitText ? `<div class="stw-ex-card-limit">${esc(limitText)}</div>` : ''}
        <div class="stw-ex-card-image-wrap">
          <img class="stw-ex-card-image" src="${iconSrc}" alt="${esc(item.title)}" draggable="false"
               onerror="this.src='assets/icons/stw/resources/voucher_cardpack_bronze.png'" />
        </div>
        <div class="stw-ex-card-info">
          <div class="stw-ex-card-category">${esc(categoryLabel)}</div>
          <div class="stw-ex-card-name" title="${esc(item.title)}">
            ${item.quantity > 1 ? `<span class="stw-ex-card-qty">(x${item.quantity})</span> ` : ''}${esc(item.title)}
          </div>
          ${rarityLabel ? `<div class="stw-ex-card-rarity" style="color:${item.rarityColor}">${esc(rarityLabel)}</div>` : ''}
        </div>
        <div class="stw-ex-card-price">
          <img class="stw-ex-card-price-icon" src="${item.currencyIcon}" alt="currency" draggable="false" />
          <span class="stw-ex-card-price-value">${formatNumber(item.price)}</span>
        </div>
        <div class="stw-ex-card-buy-overlay${isBuying ? ' stw-ex-card-buy-overlay--busy' : ''}">
          ${overlayContent}
        </div>
        ${showQtyPicker ? renderQtyPicker(item, maxQty) : ''}
      </div>
    </div>`;
}

function renderQtyPicker(item: STWShopItem, maxQty?: number): string {
  if (!maxQty) maxQty = getMaxBuyQty(item);
  return `
    <div class="stw-ex-qty-picker" data-offer="${esc(item.offerId)}">
      <div class="stw-ex-qty-title">Buy ${esc(item.title)}</div>
      <div class="stw-ex-qty-row">
        <span class="stw-ex-qty-label">1</span>
        <input type="range" class="stw-ex-qty-slider" min="1" max="${maxQty}" value="1"
               data-action="qty-slider" data-offer="${esc(item.offerId)}" />
        <span class="stw-ex-qty-label">${maxQty}</span>
      </div>
      <div class="stw-ex-qty-info">
        <span class="stw-ex-qty-val" data-qty-val="${esc(item.offerId)}">1</span>
        <span class="stw-ex-qty-cost">
          <img src="${item.currencyIcon}" class="stw-ex-qty-cost-icon" alt="" />
          <span data-qty-cost="${esc(item.offerId)}">${formatNumber(item.price)}</span>
        </span>
      </div>
      <div class="stw-ex-qty-actions">
        <button class="stw-ex-qty-cancel" data-action="qty-cancel">Cancel</button>
        <button class="stw-ex-qty-confirm" data-action="qty-confirm"
                data-offer="${esc(item.offerId)}"
                data-price="${item.price}"
                data-ct="${esc(item.rawCurrencyType)}"
                data-cs="${esc(item.rawCurrencySubType)}">Confirm</button>
      </div>
    </div>`;
}

// ── Section rendering (sub-section inside Items tab) ────────

function renderSubSection(section: STWShopSection): string {
  return `
    <div class="stw-ex-subsection">
      <div class="stw-ex-subsection-header">
        <span class="stw-ex-subsection-name">${esc(section.name)}</span>
        <span class="stw-ex-subsection-count">${section.items.length} items</span>
        <span class="stw-ex-subsection-timer">${getCountdownToReset()}</span>
      </div>
      <div class="stw-ex-grid">
        ${section.items.map(i => renderCard(i)).join('')}
      </div>
    </div>`;
}

// ── Tab content rendering ───────────────────────────────────

function renderTabContent(): string {
  if (!data) return '';
  const tab = TABS.find(t => t.id === activeTab);
  if (!tab) return '';

  const sections = data.sections.filter(s => tab.sectionIds.includes(s.id));
  if (sections.length === 0) {
    return `<div class="stw-ex-tab-empty">No items in this section</div>`;
  }

  const isXRay = tab.id === 'xray';

  // Items tab has sub-sections
  if (tab.id === 'items') {
    return sections.map(renderSubSection).join('');
  }

  // Single section tabs — flat grid
  const allItems = sections.flatMap(s => s.items);
  return `<div class="stw-ex-grid">${allItems.map(i => renderCard(i, isXRay)).join('')}</div>`;
}


// ── Main draw ───────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading) {
    el.innerHTML = `
      <div class="stw-ex-page">
        ${bgDiv()}
        <div class="stw-ex-loading">
          <div class="stw-ex-spinner"></div>
          <div class="stw-ex-loading-text">Loading STW Exchange...</div>
        </div>
      </div>`;
    return;
  }

  if (error && !data) {
    el.innerHTML = `
      <div class="stw-ex-page">
        ${bgDiv()}
        <div class="stw-ex-empty">
          <div class="stw-ex-empty-icon">\uD83C\uDFEA</div>
          <div class="stw-ex-empty-text">${esc(error)}</div>
          <button class="stw-ex-retry-btn" data-action="retry">Retry</button>
        </div>
      </div>`;
    return;
  }

  if (!data || data.sections.length === 0) {
    el.innerHTML = `
      <div class="stw-ex-page">
        ${bgDiv()}
        <div class="stw-ex-empty">
          <div class="stw-ex-empty-icon">\uD83C\uDFEA</div>
          <div class="stw-ex-empty-text">No STW shop data available</div>
          <button class="stw-ex-retry-btn" data-action="retry">Refresh</button>
        </div>
      </div>`;
    return;
  }

  // Determine which tabs have content
  const availableTabs = TABS.filter(tab =>
    data!.sections.some(s => tab.sectionIds.includes(s.id)),
  );
  if (!availableTabs.find(t => t.id === activeTab) && availableTabs.length > 0) {
    activeTab = availableTabs[0].id;
  }

  // Save scroll position before redraw
  const scrollEl = el.querySelector('.stw-ex-content');
  const scrollTop = scrollEl ? scrollEl.scrollTop : 0;

  el.innerHTML = `
    <div class="stw-ex-page">
      ${bgDiv()}
      <div class="stw-ex-header">
        <div class="stw-ex-header-left">
          <h1 class="stw-ex-title">STW Exchange</h1>
        </div>
        <div class="stw-ex-header-right">
          <div class="stw-ex-balance stw-ex-balance--gold" title="Gold">
            <img src="assets/icons/stw/resources/eventcurrency_scaling.png" class="stw-ex-balance-icon" alt="Gold" />
            <span class="stw-ex-balance-value">${formatNumber(data.gold)}</span>
          </div>
          <div class="stw-ex-balance stw-ex-balance--xray" title="X-Ray Tickets">
            <img src="assets/icons/stw/resources/currency_xrayllama.png" class="stw-ex-balance-icon" alt="X-Ray Tickets" />
            <span class="stw-ex-balance-value">${formatNumber(data.xrayTickets)}</span>
          </div>
          <button class="stw-ex-refresh-btn" data-action="refresh" title="Refresh">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </button>
        </div>
      </div>
      ${error ? `<div class="stw-ex-error-bar">${esc(error)}</div>` : ''}
      <div class="stw-ex-tabs">
        ${availableTabs.map(tab => `
          <button class="stw-ex-tab${tab.id === activeTab ? ' stw-ex-tab--active' : ''}"
                  data-action="switch-tab" data-tab="${tab.id}">
            ${esc(tab.label)}
          </button>
        `).join('')}
        <span class="stw-ex-tabs-timer">${getCountdownToReset()}</span>
      </div>
      <div class="stw-ex-content">
        ${renderTabContent()}
      </div>
    </div>`;

  // Restore scroll position after redraw
  const newScrollEl = el.querySelector('.stw-ex-content');
  if (newScrollEl && scrollTop > 0) newScrollEl.scrollTop = scrollTop;
}

// ── Data loading ────────────────────────────────────────────

async function loadData(force = false): Promise<void> {
  loading = true;
  error = null;
  draw();

  try {
    data = force
      ? await window.glowAPI.stwExchange.getDataForce()
      : await window.glowAPI.stwExchange.getData();

    if (!data.success) {
      error = data.error || 'Failed to load STW Exchange';
    }
  } catch (err: any) {
    error = err?.message || 'Unexpected error';
  }

  loading = false;
  draw();
}

async function refreshGold(): Promise<void> {
  try {
    const result = await window.glowAPI.stwExchange.getGold();
    if (result.success && data) {
      data = { ...data, gold: result.gold, xrayTickets: result.xrayTickets };
      draw();
    }
  } catch { /* ignore */ }
}

// ── Purchase logic ──────────────────────────────────────────

async function doBuy(offerId: string, price: number, quantity: number, ct: string, cs: string): Promise<void> {
  buyingSet.add(offerId);
  qtyPickerOffer = null;
  draw();

  try {
    const result = await window.glowAPI.stwExchange.buy(offerId, price, quantity, ct, cs);
    if (!result.success) {
      error = result.error || 'Purchase failed';
    } else {
      // Silently refresh data (backend already updated cached counts/balance)
      try {
        const fresh = await window.glowAPI.stwExchange.getData();
        if (fresh.success) data = fresh;
      } catch { /* use existing data */ }
    }
  } catch (err: any) {
    error = err?.message || 'Purchase failed';
  }

  buyingSet.delete(offerId);
  draw();
}

// ── Event handling ──────────────────────────────────────────

function handleClick(e: Event): void {
  const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!target) return;

  const action = target.dataset.action;

  if (action === 'retry' || action === 'refresh') {
    loadData(true);
  } else if (action === 'switch-tab') {
    const tabId = target.dataset.tab;
    if (tabId && tabId !== activeTab) {
      activeTab = tabId;
      qtyPickerOffer = null;
      draw();
    }
  } else if (action === 'buy-one') {
    const offerId = target.dataset.offer || '';
    const price = parseInt(target.dataset.price || '0', 10);
    const ct = target.dataset.ct || '';
    const cs = target.dataset.cs || '';
    if (offerId && !buyingSet.has(offerId)) {
      doBuy(offerId, price, 1, ct, cs);
    }
  } else if (action === 'buy-all') {
    const offerId = target.dataset.offer || '';
    const price = parseInt(target.dataset.price || '0', 10);
    const maxQty = parseInt(target.dataset.max || '1', 10);
    const ct = target.dataset.ct || '';
    const cs = target.dataset.cs || '';
    if (offerId && maxQty > 0 && !buyingSet.has(offerId)) {
      doBuy(offerId, price, maxQty, ct, cs);
    }
  } else if (action === 'open-qty') {
    const offerId = target.dataset.offer || '';
    if (offerId && !buyingSet.has(offerId)) {
      qtyPickerOffer = offerId;
      draw();
    }
  } else if (action === 'qty-cancel') {
    qtyPickerOffer = null;
    draw();
  } else if (action === 'qty-confirm') {
    const offerId = target.dataset.offer || '';
    const price = parseInt(target.dataset.price || '0', 10);
    const ct = target.dataset.ct || '';
    const cs = target.dataset.cs || '';
    const valEl = el?.querySelector(`[data-qty-val="${offerId}"]`);
    const qty = valEl ? parseInt(valEl.textContent || '1', 10) : 1;
    if (offerId && qty > 0) doBuy(offerId, price, qty, ct, cs);
  }
}

function handleInput(e: Event): void {
  const target = e.target as HTMLInputElement;
  if (target.dataset.action !== 'qty-slider') return;
  const offerId = target.dataset.offer || '';
  const item = findItemByOffer(offerId);
  if (!item) return;
  const qty = parseInt(target.value, 10) || 1;
  const valEl = el?.querySelector(`[data-qty-val="${offerId}"]`);
  const costEl = el?.querySelector(`[data-qty-cost="${offerId}"]`);
  if (valEl) valEl.textContent = String(qty);
  if (costEl) costEl.textContent = formatNumber(item.price * qty);
}

// ── Account switch handler ──────────────────────────────────

function onAccountChanged(): void {
  refreshGold();
}

// ── Page Definition ─────────────────────────────────────────

export const stwExchangePage: PageDefinition = {
  id: 'stw-exchange',
  label: 'STW Exchange',
  icon: `<img src="assets/icons/stw/resources/eventcurrency_scaling.png" alt="STW Exchange" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 1,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    el.addEventListener('click', handleClick);
    el.addEventListener('input', handleInput);
    window.addEventListener('glow:account-switched', onAccountChanged);
    const s = await window.glowAPI.storage.get<{ pageBackgrounds?: boolean; customBackgrounds?: Record<string, string> }>('settings');
    showBg = s?.pageBackgrounds ?? false;
    customBgPath = s?.customBackgrounds?.['stw-exchange'] || '';
    await loadData();
  },

  cleanup(): void {
    window.removeEventListener('glow:account-switched', onAccountChanged);
    if (el) {
      el.removeEventListener('click', handleClick);
      el.removeEventListener('input', handleInput);
    }
    el = null;
    qtyPickerOffer = null;
    buyingSet.clear();
  },
};
