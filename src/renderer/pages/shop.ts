import type { PageDefinition, ShopSection, ShopItem, ShopFriend, BundleSubItem } from '../../shared/types';

let el: HTMLElement | null = null;
let sections: ShopSection[] = [];
let loading = true;
let error: string | null = null;
let totalItems = 0;
let collapsedSections: Set<string> = new Set();
let vbucksTotal: number | null = null;
let ownedIds = new Set<string>();

// Image retry tracking: imageUrl → { retries, timer }
const imgRetry = new Map<string, { retries: number; timer: ReturnType<typeof setTimeout> | null }>();
const MAX_IMG_RETRIES = 14;
const IMG_RETRY_DELAY = 5_000;

// ── Rarity color map ──────────────────────────────────────

const RARITY_COLORS: Record<string, { bg: string; border: string; gradient: [string, string] }> = {
  common:    { bg: '#636363', border: '#8a8a8a', gradient: ['#636363', '#9a9a9a'] },
  uncommon:  { bg: '#319236', border: '#69bb1e', gradient: ['#1d6a1f', '#69bb1e'] },
  rare:      { bg: '#2060a0', border: '#49b3ff', gradient: ['#1a4a7a', '#49b3ff'] },
  epic:      { bg: '#7b2fbe', border: '#c359ff', gradient: ['#5b1d9e', '#c359ff'] },
  legendary: { bg: '#c36a2d', border: '#f0a440', gradient: ['#a35220', '#f0a440'] },
  mythic:    { bg: '#ba9c36', border: '#f0d850', gradient: ['#a07d1a', '#f0d850'] },
  exotic:    { bg: '#3ab5c5', border: '#7ee8f0', gradient: ['#1e8a9a', '#7ee8f0'] },
};

const SERIES_COLORS: Record<string, { bg: string; border: string; gradient: [string, string] }> = {
  icon:           { bg: '#00546f', border: '#20f2ff', gradient: ['#003040', '#20f2ff'] },
  marvel:         { bg: '#632427', border: '#fe2132', gradient: ['#3a1015', '#fe2132'] },
  dc:             { bg: '#1e2e54', border: '#1b88d0', gradient: ['#0e1830', '#1b88d0'] },
  starwars:       { bg: '#15202a', border: '#c0a040', gradient: ['#0a1018', '#c0a040'] },
  gaminglegends:  { bg: '#1a1a3a', border: '#6060e0', gradient: ['#0a0a2a', '#6060e0'] },
  dark:           { bg: '#3a0050', border: '#b020d0', gradient: ['#200030', '#b020d0'] },
  shadow:         { bg: '#2d3343', border: '#b1b2da', gradient: ['#1a2030', '#b1b2da'] },
  frozen:         { bg: '#1a5080', border: '#80d0ff', gradient: ['#0a3050', '#80d0ff'] },
  lava:           { bg: '#6a2040', border: '#ff5000', gradient: ['#3a1020', '#ff5000'] },
  slurp:          { bg: '#005050', border: '#00d6ec', gradient: ['#002828', '#00d6ec'] },
};

function getItemColors(item: ShopItem): { bg: string; border: string; gradient: [string, string] } {
  if (item.series) {
    const key = item.series.replace(/\s+series$/i, '').replace(/\s+/g, '').toLowerCase();
    if (SERIES_COLORS[key]) return SERIES_COLORS[key];
    if (key.includes('icon') || key.includes('idol')) return SERIES_COLORS.icon;
    if (key.includes('marvel')) return SERIES_COLORS.marvel;
    if (key.includes('dc')) return SERIES_COLORS.dc;
    if (key.includes('star') && key.includes('war')) return SERIES_COLORS.starwars;
    if (key.includes('gaming') || key.includes('legend')) return SERIES_COLORS.gaminglegends;
    if (key.includes('dark') || key.includes('oscur')) return SERIES_COLORS.dark;
    if (key.includes('shadow') || key.includes('sombr')) return SERIES_COLORS.shadow;
    if (key.includes('frozen') || key.includes('congel')) return SERIES_COLORS.frozen;
    if (key.includes('lava')) return SERIES_COLORS.lava;
    if (key.includes('slurp')) return SERIES_COLORS.slurp;
  }

  if (item.seriesColors && item.seriesColors.length >= 2) {
    const c1 = item.seriesColors[0].startsWith('#') ? item.seriesColors[0] : `#${item.seriesColors[0].slice(0, 6)}`;
    const c2 = item.seriesColors[1].startsWith('#') ? item.seriesColors[1] : `#${item.seriesColors[1].slice(0, 6)}`;
    return { bg: c1, border: c2, gradient: [c1, c2] };
  }

  return RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
}

// ── Data ──────────────────────────────────────────────────

async function loadShop(): Promise<void> {
  loading = true;
  error = null;
  draw();

  try {
    const [shopRes, vbRes, ownedRes] = await Promise.all([
      window.glowAPI.shop.getItems(),
      window.glowAPI.shop.getVbucks().catch(() => null),
      window.glowAPI.shop.getOwned().catch(() => null),
    ]);
    if (shopRes.success) {
      sections = shopRes.sections;
      totalItems = shopRes.totalItems;
    } else {
      error = shopRes.error || 'Failed to load item shop';
    }
    if (vbRes?.success) vbucksTotal = vbRes.total;
    if (ownedRes?.success && ownedRes.ownedIds) {
      ownedIds = new Set(ownedRes.ownedIds);
    }
  } catch (err: any) {
    error = err?.message || 'Failed to load item shop';
  }

  loading = false;
  draw();
}

async function refreshVbucks(): Promise<void> {
  try {
    const res = await window.glowAPI.shop.getVbucks();
    if (res.success) {
      vbucksTotal = res.total;
      const vbEl = el?.querySelector('.shop-vbucks-balance');
      if (vbEl) vbEl.innerHTML = `<img class="shop-vbuck-icon" src="https://fortnite-api.com/images/vbuck.png" alt="V" width="16" height="16" /> ${formatPrice(vbucksTotal ?? 0)}`;
    }
  } catch { /* ok */ }
}

// ── Helpers ───────────────────────────────────────────────

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatPrice(price: number): string {
  return price.toLocaleString();
}

// ── Image retry system ────────────────────────────────────

function setupImageRetry(): void {
  if (!el) return;
  el.querySelectorAll<HTMLImageElement>('.shop-card-img').forEach((img) => {
    const src = img.dataset.src;
    if (!src) return;

    // Already loaded successfully
    if (img.complete && img.naturalWidth > 0) {
      img.classList.remove('loading');
      return;
    }

    img.onerror = () => handleImageError(img, src);
    img.onload = () => handleImageLoad(img);

    // Start loading
    if (!img.src || img.src === 'about:blank') {
      img.classList.add('loading');
      img.src = src;
    }
  });
}

function handleImageLoad(img: HTMLImageElement): void {
  img.classList.remove('loading');
  img.classList.remove('failed');
  const wrapper = img.closest('.shop-card-image');
  const loader = wrapper?.querySelector('.shop-card-loader');
  if (loader) loader.classList.add('hidden');
  img.style.display = '';
}

function handleImageError(img: HTMLImageElement, src: string): void {
  let state = imgRetry.get(src);
  if (!state) {
    state = { retries: 0, timer: null };
    imgRetry.set(src, state);
  }

  if (state.retries >= MAX_IMG_RETRIES) {
    // Max retries reached — show broken placeholder
    img.classList.remove('loading');
    img.classList.add('failed');
    const wrapper = img.closest('.shop-card-image');
    const loader = wrapper?.querySelector('.shop-card-loader');
    if (loader) {
      loader.classList.remove('hidden');
      loader.innerHTML = `<span class="retry-exhausted">✕</span>`;
    }
    return;
  }

  state.retries++;
  img.classList.add('loading');
  const wrapper = img.closest('.shop-card-image');
  const loader = wrapper?.querySelector('.shop-card-loader');
  if (loader) {
    loader.classList.remove('hidden');
    loader.innerHTML = `<span class="retry-count">${state.retries}/${MAX_IMG_RETRIES}</span>`;
  }

  // Clear previous timer
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    // Retry by re-setting src with cache buster
    img.src = `${src}${src.includes('?') ? '&' : '?'}retry=${state!.retries}`;
  }, IMG_RETRY_DELAY);
}

function clearRetryTimers(): void {
  for (const [, state] of imgRetry) {
    if (state.timer) clearTimeout(state.timer);
  }
  imgRetry.clear();
}

// ── Modal system ──────────────────────────────────────────

function showModal(html: string, wide = false): HTMLElement {
  document.querySelector('.shop-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'shop-modal-overlay';
  overlay.innerHTML = `<div class="shop-modal ${wide ? 'wide' : ''}">${html}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
  return overlay;
}

function closeModal(): void {
  const overlay = document.querySelector('.shop-modal-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  }
}

// ── Item detail modal (click card) ───────────────────────

function openDetailModal(item: ShopItem): void {
  const colors = getItemColors(item);
  const hasDiscount = item.regularPrice > item.finalPrice && item.regularPrice > 0;

  // Build bundle items HTML
  let bundleHtml = '';
  if (item.isBundle && item.bundleItems && item.bundleItems.length > 1) {
    bundleHtml = `
      <div class="detail-bundle-section">
        <h4 class="detail-bundle-title">Bundle Contents (${item.bundleItems.length} items)</h4>
        <div class="detail-bundle-grid">
          ${item.bundleItems.map((bi: BundleSubItem) => {
            const biColors = RARITY_COLORS[bi.rarity] || RARITY_COLORS.common;
            return `
              <div class="detail-bundle-item" style="--bi-bg: ${biColors.bg}; --bi-border: ${biColors.border}; --bi-start: ${biColors.gradient[0]}; --bi-end: ${biColors.gradient[1]};">
                <div class="detail-bi-img">
                  ${bi.imageUrl ? `<img src="${esc(bi.imageUrl)}" alt="${esc(bi.name)}" />` : ''}
                </div>
                <div class="detail-bi-info">
                  <span class="detail-bi-name">${esc(bi.name)}</span>
                  <span class="detail-bi-type">${esc(bi.type)}</span>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  const overlay = showModal(`
    <div class="detail-layout">
      <div class="detail-image-side" style="background: linear-gradient(145deg, ${colors.gradient[0]}, ${colors.gradient[1]}); border-color: ${colors.border};">
        ${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.name)}" />` : ''}
      </div>
      <div class="detail-info-side">
        <div class="detail-header">
          <h2 class="detail-name">${esc(item.name)}</h2>
          <span class="detail-type">${esc(item.type)}</span>
          ${item.description ? `<p class="detail-desc">${esc(item.description)}</p>` : ''}
        </div>
        <div class="detail-price-row">
          ${hasDiscount ? `<span class="detail-oldprice">${formatPrice(item.regularPrice)}</span>` : ''}
          <span class="detail-price">
            <img src="https://fortnite-api.com/images/vbuck.png" width="20" height="20" alt="V" />
            ${formatPrice(item.finalPrice)}
          </span>
        </div>
        ${bundleHtml}
        <div class="detail-actions">
          <button class="btn btn-accent detail-buy-btn" id="detail-buy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
            Buy
          </button>
          ${item.giftable ? `
          <button class="btn btn-gift-lg detail-gift-btn" id="detail-gift">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
            Gift
          </button>` : ''}
          <button class="btn btn-secondary detail-close-btn" id="detail-close">Close</button>
        </div>
        <div class="detail-status" id="detail-status"></div>
      </div>
    </div>
  `, true);

  overlay.querySelector('#detail-close')?.addEventListener('click', closeModal);

  // Buy button
  overlay.querySelector('#detail-buy')?.addEventListener('click', () => {
    openBuyConfirm(item, overlay);
  });

  // Gift button
  overlay.querySelector('#detail-gift')?.addEventListener('click', () => {
    openGiftFlow(item, overlay);
  });
}

// ── Buy confirmation (inside detail modal) ───────────────

function openBuyConfirm(item: ShopItem, overlay: HTMLElement): void {
  const statusEl = overlay.querySelector('#detail-status')!;
  const buyBtn = overlay.querySelector('#detail-buy') as HTMLButtonElement;
  const giftBtn = overlay.querySelector('#detail-gift') as HTMLButtonElement | null;

  statusEl.innerHTML = `
    <div class="detail-confirm">
      <p>Are you sure you want to buy <strong>${esc(item.name)}</strong> for <img src="https://fortnite-api.com/images/vbuck.png" width="14" height="14" alt="V" /> ${formatPrice(item.finalPrice)}?</p>
      <div class="detail-confirm-btns">
        <button class="btn btn-accent" id="confirm-buy-yes">Confirm Purchase</button>
        <button class="btn btn-secondary" id="confirm-buy-no">Cancel</button>
      </div>
    </div>`;

  buyBtn.disabled = true;
  if (giftBtn) giftBtn.disabled = true;

  overlay.querySelector('#confirm-buy-no')?.addEventListener('click', () => {
    statusEl.innerHTML = '';
    buyBtn.disabled = false;
    if (giftBtn) giftBtn.disabled = false;
  });

  overlay.querySelector('#confirm-buy-yes')?.addEventListener('click', async () => {
    const confirmBtn = overlay.querySelector('#confirm-buy-yes') as HTMLButtonElement;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Purchasing...';
    window.glowAPI.discordRpc.setDetail('Purchasing item...');

    const result = await window.glowAPI.shop.buy(item.offerId, item.finalPrice);
    window.glowAPI.discordRpc.setDetail(null);
    if (result.success) {
      statusEl.innerHTML = `<p class="detail-success">✓ Purchased successfully!</p>`;
      refreshVbucks();
      setTimeout(closeModal, 1500);
    } else {
      statusEl.innerHTML = `<p class="detail-error">✕ ${esc(result.error || 'Purchase failed')}</p>`;
      buyBtn.disabled = false;
      if (giftBtn) giftBtn.disabled = false;
    }
  });
}

// ── Gift flow (inside detail modal) ──────────────────────

function openGiftFlow(item: ShopItem, overlay: HTMLElement): void {
  const statusEl = overlay.querySelector('#detail-status')!;
  const buyBtn = overlay.querySelector('#detail-buy') as HTMLButtonElement;
  const giftBtn = overlay.querySelector('#detail-gift') as HTMLButtonElement;

  buyBtn.disabled = true;
  giftBtn.disabled = true;

  statusEl.innerHTML = `
    <div class="detail-gift-flow">
      <div class="gift-friends-loading">
        <div class="shop-spinner small"></div>
        <span>Loading friends...</span>
      </div>
      <div class="gift-friends-list hidden"></div>
      <div class="gift-message-wrap hidden">
        <label>Message (optional):</label>
        <input type="text" class="gift-message-input" placeholder="Enter a gift message..." maxlength="100" />
      </div>
      <div class="detail-confirm-btns">
        <button class="btn btn-accent" id="confirm-gift-send" disabled>Send Gift</button>
        <button class="btn btn-secondary" id="confirm-gift-cancel">Cancel</button>
      </div>
    </div>`;

  let selectedFriendId: string | null = null;

  overlay.querySelector('#confirm-gift-cancel')?.addEventListener('click', () => {
    statusEl.innerHTML = '';
    buyBtn.disabled = false;
    giftBtn.disabled = false;
  });

  // Load friends
  window.glowAPI.shop.getFriends().then((res) => {
    const loadingEl = statusEl.querySelector('.gift-friends-loading');
    const listEl = statusEl.querySelector('.gift-friends-list');
    const msgWrap = statusEl.querySelector('.gift-message-wrap');
    if (loadingEl) loadingEl.classList.add('hidden');

    if (!res.success || res.friends.length === 0) {
      if (listEl) {
        listEl.classList.remove('hidden');
        listEl.innerHTML = `<p class="gift-no-friends">${res.error || 'No friends found'}</p>`;
      }
      return;
    }

    if (listEl) {
      listEl.classList.remove('hidden');
      listEl.innerHTML = `
        <input type="text" class="gift-search" placeholder="Search friends..." />
        <div class="gift-friends-scroll">
          ${res.friends.map((f: ShopFriend) => `
            <div class="gift-friend-row" data-id="${esc(f.accountId)}">
              <span class="gift-friend-name">${esc(f.displayName)}</span>
              <span class="gift-friend-check hidden">✓</span>
            </div>
          `).join('')}
        </div>
      `;

      const searchInput = listEl.querySelector('.gift-search') as HTMLInputElement;
      searchInput?.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        listEl.querySelectorAll<HTMLElement>('.gift-friend-row').forEach((row) => {
          const name = row.querySelector('.gift-friend-name')?.textContent?.toLowerCase() || '';
          row.style.display = name.includes(q) ? '' : 'none';
        });
      });

      listEl.querySelectorAll('.gift-friend-row').forEach((row) => {
        row.addEventListener('click', () => {
          listEl.querySelectorAll('.gift-friend-row.selected').forEach((r) => {
            r.classList.remove('selected');
            r.querySelector('.gift-friend-check')?.classList.add('hidden');
          });
          row.classList.add('selected');
          row.querySelector('.gift-friend-check')?.classList.remove('hidden');
          selectedFriendId = (row as HTMLElement).dataset.id || null;
          const sendBtn = statusEl.querySelector('#confirm-gift-send') as HTMLButtonElement;
          if (sendBtn) sendBtn.disabled = false;
          msgWrap?.classList.remove('hidden');
        });
      });
    }
  });

  // Send gift
  overlay.querySelector('#confirm-gift-send')?.addEventListener('click', async () => {
    if (!selectedFriendId) return;
    const sendBtn = overlay.querySelector('#confirm-gift-send') as HTMLButtonElement;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    window.glowAPI.discordRpc.setDetail('Gifting item...');

    const message = (statusEl.querySelector('.gift-message-input') as HTMLInputElement)?.value || '';
    const result = await window.glowAPI.shop.gift(item.offerId, selectedFriendId, message, item.finalPrice);
    window.glowAPI.discordRpc.setDetail(null);

    if (result.success) {
      statusEl.innerHTML = `<p class="detail-success">✓ Gift sent successfully!</p>`;
      refreshVbucks();
      setTimeout(closeModal, 1500);
    } else {
      sendBtn.textContent = 'Retry';
      sendBtn.disabled = false;
      const errP = document.createElement('p');
      errP.className = 'detail-error';
      errP.textContent = `✕ ${result.error || 'Gift failed'}`;
      statusEl.querySelector('.detail-gift-flow')?.appendChild(errP);
    }
  });
}

// ── Toggle gifts ─────────────────────────────────────────

async function toggleGiftsAction(enable: boolean): Promise<void> {
  const btn = el?.querySelector(enable ? '#gift-enable-btn' : '#gift-disable-btn') as HTMLButtonElement;
  if (btn) {
    btn.disabled = true;
    btn.textContent = enable ? 'Enabling...' : 'Disabling...';
  }

  const result = await window.glowAPI.shop.toggleGifts(enable);
  if (btn) {
    if (result.success) {
      btn.textContent = enable ? '✓ Enabled' : '✓ Disabled';
      setTimeout(() => {
        btn.textContent = enable ? 'Enable Gifts' : 'Disable Gifts';
        btn.disabled = false;
      }, 2000);
    } else {
      btn.textContent = 'Error';
      setTimeout(() => {
        btn.textContent = enable ? 'Enable Gifts' : 'Disable Gifts';
        btn.disabled = false;
      }, 2000);
    }
  }
}

// ── Drawing ──────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading) {
    el.innerHTML = `
      <div class="page-shop">
        <div class="shop-header">
          <h1 class="shop-title">Item Shop</h1>
        </div>
        <div class="shop-loading">
          <div class="shop-spinner"></div>
          <p>Loading Item Shop...</p>
        </div>
      </div>`;
    return;
  }

  if (error) {
    el.innerHTML = `
      <div class="page-shop">
        <div class="shop-header">
          <h1 class="shop-title">Item Shop</h1>
          <button class="btn btn-accent shop-refresh-btn" id="shop-refresh">↻ Retry</button>
        </div>
        <div class="shop-error">
          <p>⚠ ${esc(error)}</p>
        </div>
      </div>`;
    el.querySelector('#shop-refresh')?.addEventListener('click', () => loadShop());
    return;
  }

  // Build date string
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${days[now.getDay()]} — ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

  let sectionsHtml = '';
  for (const section of sections) {
    const sectionKey = section.name;
    const isCollapsed = collapsedSections.has(sectionKey);

    sectionsHtml += `
      <div class="shop-section" data-section="${esc(sectionKey)}">
        <div class="shop-section-header" data-toggle-section="${esc(sectionKey)}">
          <h2 class="shop-section-title">${esc(section.name)}</h2>
          <span class="shop-section-count">${section.items.length}</span>
          <svg class="shop-section-arrow ${isCollapsed ? 'collapsed' : ''}" width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 4.5L6 8L9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="shop-section-grid ${isCollapsed ? 'hidden' : ''}">
          ${section.items.map((item) => renderCard(item)).join('')}
        </div>
      </div>`;
  }

  // V-Bucks balance display
  const vbucksHtml = vbucksTotal !== null
    ? `<div class="shop-vbucks-balance" title="V-Bucks balance">
        <img src="https://fortnite-api.com/images/vbuck.png" width="18" height="18" alt="V" />
        <span>${formatPrice(vbucksTotal)}</span>
      </div>`
    : `<div class="shop-vbucks-balance loading" title="Loading V-Bucks...">
        <div class="shop-spinner tiny"></div>
      </div>`;

  el.innerHTML = `
    <div class="page-shop">
      <div class="shop-header">
        <div class="shop-header-left">
          <h1 class="shop-title">Item Shop</h1>
          <span class="shop-date">${dateStr}</span>
          <span class="shop-item-count">${totalItems} items</span>
        </div>
        <div class="shop-header-right">
          ${vbucksHtml}
          <div class="shop-gift-toggles">
            <button class="btn btn-small btn-success" id="gift-enable-btn" title="Enable receiving gifts">Enable Gifts</button>
            <button class="btn btn-small btn-danger" id="gift-disable-btn" title="Disable receiving gifts">Disable Gifts</button>
          </div>
          <button class="btn btn-accent shop-refresh-btn" id="shop-refresh">↻ Refresh</button>
        </div>
      </div>
      <div class="shop-sections">
        ${sectionsHtml}
      </div>
    </div>`;

  // Bind events
  el.querySelector('#shop-refresh')?.addEventListener('click', () => {
    clearRetryTimers();
    loadShop();
  });

  el.querySelector('#gift-enable-btn')?.addEventListener('click', () => toggleGiftsAction(true));
  el.querySelector('#gift-disable-btn')?.addEventListener('click', () => toggleGiftsAction(false));

  el.querySelectorAll('[data-toggle-section]').forEach((header) => {
    header.addEventListener('click', () => {
      const key = (header as HTMLElement).dataset.toggleSection!;
      if (collapsedSections.has(key)) {
        collapsedSections.delete(key);
      } else {
        collapsedSections.add(key);
      }
      draw();
    });
  });

  // Bind card clicks → open detail modal
  el.querySelectorAll<HTMLElement>('[data-detail]').forEach((card) => {
    card.addEventListener('click', () => {
      const offerId = card.dataset.detail!;
      const item = findItemByOfferId(offerId);
      if (item) openDetailModal(item);
    });
  });

  // Setup image retry for all card images
  setupImageRetry();
}

function findItemByOfferId(offerId: string): ShopItem | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.offerId === offerId) return item;
    }
  }
  return null;
}

function renderCard(item: ShopItem): string {
  const colors = getItemColors(item);
  const hasDiscount = item.regularPrice > item.finalPrice && item.regularPrice > 0;
  const discount = hasDiscount ? item.regularPrice - item.finalPrice : 0;
  const imgSrc = item.imageUrl || '';
  const typeBadge = item.type ? `<span class="shop-card-type">${esc(item.type)}</span>` : '';
  const bundleBadge = item.isBundle ? `<span class="shop-card-bundle">Bundle (${item.bundleCount})</span>` : '';

  // Owned check: for bundles check all sub-items; for single items check main id
  let isOwned = false;
  if (ownedIds.size > 0) {
    if (item.isBundle && item.bundleItems && item.bundleItems.length > 0) {
      isOwned = item.bundleItems.every((bi: BundleSubItem) => ownedIds.has(bi.id.toLowerCase()));
    } else {
      isOwned = ownedIds.has(item.id.toLowerCase());
    }
  }

  const priceHtml = isOwned
    ? `<div class="shop-card-owned">OWNED</div>`
    : `<div class="shop-card-price">
        ${hasDiscount ? `<span class="shop-card-oldprice">${formatPrice(item.regularPrice)}</span>` : ''}
        <span class="shop-card-vbucks">
          <img class="shop-vbuck-icon" src="https://fortnite-api.com/images/vbuck.png" alt="V" width="14" height="14" />
          ${formatPrice(item.finalPrice)}
        </span>
      </div>`;

  return `
    <div class="shop-card ${isOwned ? 'shop-card-is-owned' : ''}" data-detail="${esc(item.offerId)}" style="--card-bg: ${colors.bg}; --card-border: ${colors.border}; --card-grad-start: ${colors.gradient[0]}; --card-grad-end: ${colors.gradient[1]};">
      <div class="shop-card-image">
        ${imgSrc
          ? `<img class="shop-card-img loading" data-src="${esc(imgSrc)}" alt="${esc(item.name)}" />`
          : ''
        }
        <div class="shop-card-loader ${imgSrc ? '' : 'hidden'}">
          <div class="shop-spinner small"></div>
        </div>
        <div class="shop-card-placeholder" ${imgSrc ? 'style="display:none"' : ''}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>
        ${bundleBadge}
        ${hasDiscount ? `<div class="shop-card-discount">-${formatPrice(discount)} V</div>` : ''}
      </div>
      <div class="shop-card-footer">
        <div class="shop-card-name" title="${esc(item.name)}">${esc(item.name)}</div>
        ${typeBadge}
        ${priceHtml}
      </div>
    </div>`;
}
// ── Account changed listener ────────────────────────────────

async function refreshOwned(): Promise<void> {
  try {
    const res = await window.glowAPI.shop.getOwned();
    if (res.success && res.ownedIds) {
      ownedIds = new Set(res.ownedIds);
      draw();
    }
  } catch { /* ok */ }
}

function onAccountChanged(): void {
  console.log('[Shop] Account changed — refreshing vbucks + owned...');
  refreshVbucks();
  refreshOwned();
}
// ── Shop rotation listener ───────────────────────────────

function onShopRotated(): void {
  console.log('[Shop] Shop rotated — refreshing...');
  clearRetryTimers();
  loadShop();
}

// ── Page Definition ──────────────────────────────────────

export const shopPage: PageDefinition = {
  id: 'shop',
  label: 'Item Shop',
  icon: `<img src="assets/icons/fnui/BR-STW/itemshop.png" alt="Item Shop" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 12,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    sections = [];
    loading = true;
    error = null;
    totalItems = 0;
    collapsedSections = new Set();
    ownedIds = new Set();

    // Listen for shop rotation
    window.glowAPI.shop.onRotated(onShopRotated);

    // Listen for account switch → refresh vbucks
    window.addEventListener('glow:account-switched', onAccountChanged);

    await loadShop();
  },

  cleanup(): void {
    clearRetryTimers();
    window.glowAPI.shop.offRotated();
    window.removeEventListener('glow:account-switched', onAccountChanged);
    el = null;
  },
};
