import type { PageDefinition, LibraryGame, StoreGame } from '../../shared/types';

// ── State ────────────────────────────────────────────────

let el: HTMLElement | null = null;
type Tab = 'library' | 'store';
let activeTab: Tab = 'library';

// Library state
let games: LibraryGame[] = [];
let filtered: LibraryGame[] = [];
let libLoading = true;
let libError: string | null = null;
let search = '';
let filter: 'all' | 'installed' | 'notinstalled' = 'all';
let activeMenu: string | null = null;
let metaTotal = 0;
let metaLoaded = 0;
let metaPhase = false;

// Store state
let storeCurrent: StoreGame[] = [];
let storeUpcoming: StoreGame[] = [];
let storeLoading = false;
let storeError: string | null = null;
let storeLoaded = false;

// ── Helpers ──────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bytesToSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Hidden patterns — not real games (Unreal Engine assets, plugins, etc.)
const HIDDEN_TITLE_RE = /^unreal engine/i;
const HIDDEN_ID_RE = /^UE_/;

function applyFilters(): void {
  const q = search.trim().toLowerCase();
  filtered = games.filter((g) => {
    // Always hide engine/plugin assets
    if (HIDDEN_TITLE_RE.test(g.title) || HIDDEN_ID_RE.test(g.id)) return false;
    if (filter === 'installed' && !g.installed) return false;
    if (filter === 'notinstalled' && g.installed) return false;
    if (q && !g.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ── Render ───────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="lib-page">
      <div class="lib-header">
        <h1 class="page-title">Games</h1>
        <div class="lib-tabs">
          <button class="lib-tab ${activeTab === 'library' ? 'lib-tab--active' : ''}" data-tab="library">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Library
          </button>
          <button class="lib-tab ${activeTab === 'store' ? 'lib-tab--active' : ''}" data-tab="store">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><path d="M3 9l2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/></svg>
            Store
          </button>
        </div>
      </div>

      <div class="lib-tab-content" id="lib-tab-content">
        ${activeTab === 'library' ? drawLibraryTab() : drawStoreTab()}
      </div>
    </div>`;

  bindTabEvents();
  if (activeTab === 'library') bindLibraryEvents();
  else bindStoreEvents();
}

// ── Library tab ──────────────────────────────────────────

function drawLibraryTab(): string {
  if (libLoading && games.length === 0) {
    return `
      <div class="lib-loading">
        <div class="lib-spinner"></div>
        <p>Loading your library…</p>
      </div>`;
  }

  if (libError && games.length === 0) {
    return `
      <div class="lib-error">
        <p>${escapeHtml(libError)}</p>
        <button class="lib-retry-btn" id="lib-retry">Retry</button>
      </div>`;
  }

  applyFilters();

  return `
    <div class="lib-toolbar">
      <input class="lib-search" id="lib-search" type="text"
             placeholder="Search games…" value="${escapeHtml(search)}" />

      <div class="lib-filters">
        <button class="lib-filter-btn ${filter === 'all' ? 'lib-filter-btn--active' : ''}" data-f="all">All</button>
        <button class="lib-filter-btn ${filter === 'installed' ? 'lib-filter-btn--active' : ''}" data-f="installed">Installed</button>
        <button class="lib-filter-btn ${filter === 'notinstalled' ? 'lib-filter-btn--active' : ''}" data-f="notinstalled">Not Installed</button>
      </div>

      <button class="lib-refresh-btn" id="lib-refresh" title="Refresh library">⟳</button>
    </div>

    ${metaPhase ? `
    <div class="lib-progress-wrap" id="lib-progress">
      <div class="lib-progress-bar">
        <div class="lib-progress-fill" style="width:${metaTotal > 0 ? Math.round((metaLoaded / metaTotal) * 100) : 0}%"></div>
      </div>
      <span class="lib-progress-text">${metaLoaded} / ${metaTotal} loaded</span>
    </div>` : ''}

    <div class="lib-grid" id="lib-grid">
      ${filtered.length === 0
        ? '<p class="lib-empty">No games found</p>'
        : filtered.map(cardHtml).join('')
      }
    </div>`;
}

function cardHtml(g: LibraryGame): string {
  const fav = g.favorite ? ' lib-card--fav' : '';
  const inst = g.installed ? ' lib-card--installed' : '';
  const hasImage = g.images.tall || g.images.wide;
  const imgBlock = hasImage
    ? `<img class="lib-card-img" src="${g.images.tall || g.images.wide}" alt="${escapeHtml(g.title)}" loading="lazy" onerror="this.style.display='none'" />`
    : `<div class="lib-card-placeholder"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--text-muted)" stroke-width="1"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M8 12l3 3 5-5"/></svg></div>`;

  return `
    <div class="lib-card${fav}${inst}" data-id="${g.id}">
      <div class="lib-card-img-wrap">
        ${imgBlock}
        <button class="lib-fav-btn ${g.favorite ? 'lib-fav-btn--on' : ''}" data-fav="${g.id}" title="Favorite">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="${g.favorite ? '#ef4444' : 'none'}" stroke="${g.favorite ? '#ef4444' : '#fff'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>

      <div class="lib-card-body">
        <div class="lib-card-info">
          <h3 class="lib-card-title">${escapeHtml(g.title)}</h3>
          ${g.installed && g.installSize > 0
            ? `<span class="lib-card-size">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>
                ${bytesToSize(g.installSize)}
              </span>`
            : ''
          }
        </div>

        <div class="lib-card-actions">
          ${g.installed
            ? `<button class="lib-play-btn" data-play="${g.id}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>
                Play
              </button>`
            : `<button class="lib-install-btn" data-play="${g.id}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>
                Open in EGL
              </button>`
          }
          <button class="lib-more-btn" data-more="${g.id}" title="Options">⋯</button>
        </div>
      </div>

      <div class="lib-context-menu" data-menu="${g.id}" style="display:none">
        ${g.installed && g.installPath
          ? `<button class="lib-ctx-item" data-ctx-open="${g.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Open Install Folder
            </button>`
          : ''
        }
        <button class="lib-ctx-item" data-ctx-store="${g.id}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          View in Store
        </button>
        <button class="lib-ctx-item" data-ctx-copy="${g.id}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy App ID
        </button>
      </div>
    </div>`;
}

// ── Store tab ────────────────────────────────────────────

function drawStoreTab(): string {
  if (storeLoading) {
    return `
      <div class="lib-loading">
        <div class="lib-spinner"></div>
        <p>Loading store…</p>
      </div>`;
  }

  if (storeError && storeCurrent.length === 0 && storeUpcoming.length === 0) {
    return `
      <div class="lib-error">
        <p>${escapeHtml(storeError)}</p>
        <button class="lib-retry-btn" id="store-retry">Retry</button>
      </div>`;
  }

  if (storeCurrent.length === 0 && storeUpcoming.length === 0) {
    return `<p class="lib-empty">No store data available</p>`;
  }

  let html = '';

  if (storeCurrent.length > 0) {
    html += `
      <div class="store-section">
        <h2 class="store-section-title">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          Free Now
        </h2>
        <div class="store-grid">${storeCurrent.map(storeCardHtml).join('')}</div>
      </div>`;
  }

  if (storeUpcoming.length > 0) {
    html += `
      <div class="store-section">
        <h2 class="store-section-title">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-secondary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Coming Soon
        </h2>
        <div class="store-grid">${storeUpcoming.map(storeCardHtml).join('')}</div>
      </div>`;
  }

  return html;
}

function storeCardHtml(g: StoreGame): string {
  const img = g.images.tall || g.images.wide || g.images.thumbnail;
  const imgBlock = img
    ? `<img class="lib-card-img" src="${img}" alt="${escapeHtml(g.title)}" loading="lazy" onerror="this.style.display='none'" />`
    : `<div class="lib-card-placeholder"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--text-muted)" stroke-width="1"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M8 12l3 3 5-5"/></svg></div>`;

  const priceHtml = g.isFree
    ? `<span class="store-badge-free">FREE</span>`
    : (g.originalPrice !== g.currentPrice && g.originalPrice
      ? `<span class="store-price-old">${escapeHtml(g.originalPrice)}</span><span class="store-price">${escapeHtml(g.currentPrice)}</span>`
      : `<span class="store-price">${escapeHtml(g.currentPrice || 'Free')}</span>`);

  const freeUntilHtml = g.freeUntil
    ? `<span class="store-expires">Until ${new Date(g.freeUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`
    : '';

  return `
    <div class="lib-card store-card" data-store-url="${escapeHtml(g.url)}">
      <div class="lib-card-img-wrap">
        ${imgBlock}
        ${g.isFree ? '<div class="store-free-ribbon">FREE</div>' : ''}
      </div>

      <div class="lib-card-body">
        <div class="lib-card-info">
          <h3 class="lib-card-title">${escapeHtml(g.title)}</h3>
          <span class="store-seller">${escapeHtml(g.seller)}</span>
        </div>

        <div class="store-card-footer">
          <div class="store-pricing">${priceHtml} ${freeUntilHtml}</div>
          <button class="store-get-btn" data-store-get="${escapeHtml(g.url)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            ${g.isFree ? 'Get' : 'View'}
          </button>
        </div>
      </div>
    </div>`;
}

// ── Events ───────────────────────────────────────────────

function closeMenus(): void {
  if (!el) return;
  el.querySelectorAll('.lib-context-menu').forEach((m) => (m as HTMLElement).style.display = 'none');
  activeMenu = null;
}

function bindTabEvents(): void {
  if (!el) return;
  el.querySelectorAll('.lib-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab as Tab;
      if (tab === activeTab) return;
      activeTab = tab;
      if (tab === 'store' && !storeLoaded) loadStore();
      draw();
    });
  });
}

function bindLibraryEvents(): void {
  if (!el) return;

  // Close menus on click outside
  document.addEventListener('click', closeMenus);

  // Retry
  const retryBtn = el.querySelector('#lib-retry');
  if (retryBtn) retryBtn.addEventListener('click', loadLibrary);

  // Search
  const searchInput = el.querySelector('#lib-search') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      search = searchInput.value;
      applyFilters();
      renderGrid();
    });
  }

  // Filter buttons
  el.querySelectorAll('.lib-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = (btn as HTMLElement).dataset.f as typeof filter;
      draw();
    });
  });

  // Refresh
  const refreshBtn = el.querySelector('#lib-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', loadLibrary);

  bindCardEvents(el);
}

function bindStoreEvents(): void {
  if (!el) return;

  // Retry
  const retryBtn = el.querySelector('#store-retry');
  if (retryBtn) retryBtn.addEventListener('click', loadStore);

  // Get / View buttons
  el.querySelectorAll('[data-store-get]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = (btn as HTMLElement).dataset.storeGet;
      if (url) window.glowAPI.shell.openExternal(url);
    });
  });

  // Click card to open store page
  el.querySelectorAll('.store-card').forEach((card) => {
    card.addEventListener('click', () => {
      const url = (card as HTMLElement).dataset.storeUrl;
      if (url) window.glowAPI.shell.openExternal(url);
    });
  });
}

function bindCardEvents(root: Element): void {
  // Play / Open in EGL buttons
  root.querySelectorAll('[data-play]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.play!;
      const game = games.find((g) => g.id === id);
      if (!game) return;
      (btn as HTMLButtonElement).disabled = true;
      (btn as HTMLButtonElement).textContent = 'Launching…';
      await window.glowAPI.library.launchGame(game.namespace, game.catalogItemId, game.id);
      setTimeout(() => {
        (btn as HTMLButtonElement).disabled = false;
        draw();
      }, 3000);
    });
  });

  // Favorite buttons
  root.querySelectorAll('[data-fav]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.fav!;
      const newState = await window.glowAPI.library.toggleFavorite(id);
      const game = games.find((g) => g.id === id);
      if (game) {
        game.favorite = newState;
        games.sort((a, b) => {
          if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
          if (a.installed !== b.installed) return a.installed ? -1 : 1;
          return a.title.localeCompare(b.title);
        });
        draw();
      }
    });
  });

  // More buttons (context menu)
  root.querySelectorAll('[data-more]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.more!;
      const menu = root.querySelector(`[data-menu="${id}"]`) as HTMLElement | null;
      if (!menu) return;
      const wasOpen = activeMenu === id;
      closeMenus();
      if (!wasOpen) {
        menu.style.display = 'flex';
        activeMenu = id;
      }
    });
  });

  // Context menu items
  root.querySelectorAll('[data-ctx-open]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.ctxOpen!;
      const game = games.find((g) => g.id === id);
      if (game?.installPath) {
        window.glowAPI.shell.openPath(game.installPath);
      }
      closeMenus();
    });
  });

  root.querySelectorAll('[data-ctx-store]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.ctxStore!;
      const game = games.find((g) => g.id === id);
      if (game) {
        window.glowAPI.shell.openExternal(`https://store.epicgames.com/p/${game.id}`);
      }
      closeMenus();
    });
  });

  root.querySelectorAll('[data-ctx-copy]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.ctxCopy!;
      navigator.clipboard.writeText(id);
      const original = (btn as HTMLElement).innerHTML;
      (btn as HTMLElement).textContent = 'Copied!';
      setTimeout(() => { (btn as HTMLElement).innerHTML = original; }, 1200);
      closeMenus();
    });
  });
}

function renderGrid(): void {
  if (!el) return;
  const grid = el.querySelector('#lib-grid');
  if (!grid) return;
  applyFilters();
  grid.innerHTML = filtered.length === 0
    ? '<p class="lib-empty">No games found</p>'
    : filtered.map(cardHtml).join('');
  bindCardEvents(grid);
}

function updateProgressBar(): void {
  if (!el) return;
  const fill = el.querySelector('.lib-progress-fill') as HTMLElement | null;
  const text = el.querySelector('.lib-progress-text') as HTMLElement | null;
  if (fill) fill.style.width = `${metaTotal > 0 ? Math.round((metaLoaded / metaTotal) * 100) : 0}%`;
  if (text) text.textContent = `${metaLoaded} / ${metaTotal} loaded`;
}

// ── Data loading (progressive) ───────────────────────────

async function loadLibrary(): Promise<void> {
  libLoading = true;
  libError = null;
  games = [];
  metaTotal = 0;
  metaLoaded = 0;
  metaPhase = false;
  draw();

  // Phase 1: get asset list quickly (no images yet)
  const result = await window.glowAPI.library.getGames();
  libLoading = false;
  if (!result.success) {
    libError = result.error || 'Failed to load library';
    draw();
    return;
  }

  games = result.games;
  draw();

  // Phase 2: fetch catalog metadata in batches, update cards progressively
  const BATCH = 25;
  const needsMetadata = games.filter((g) => !g.images.tall && !g.images.wide);
  metaTotal = needsMetadata.length;
  metaLoaded = 0;
  metaPhase = metaTotal > 0;
  if (metaPhase) draw();

  for (let i = 0; i < needsMetadata.length; i += BATCH) {
    const batch = needsMetadata.slice(i, i + BATCH);
    const items = batch.map((g) => ({ namespace: g.namespace, catalogItemId: g.catalogItemId }));

    const res = await window.glowAPI.library.getMetadata(items);
    if (res.success && res.metadata) {
      let updated = false;
      for (const game of batch) {
        const meta = res.metadata[game.catalogItemId];
        if (meta) {
          if (meta.title) game.title = meta.title;
          if (meta.tall) game.images.tall = meta.tall;
          if (meta.wide) game.images.wide = meta.wide;
          updated = true;
        }
      }
      metaLoaded = Math.min(metaLoaded + batch.length, metaTotal);
      if (updated) {
        games.sort((a, b) => {
          if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
          if (a.installed !== b.installed) return a.installed ? -1 : 1;
          return a.title.localeCompare(b.title);
        });
        draw();
      } else {
        updateProgressBar();
      }
    }
  }

  metaPhase = false;
  const prog = el?.querySelector('#lib-progress');
  if (prog) prog.remove();
}

async function loadStore(): Promise<void> {
  storeLoading = true;
  storeError = null;
  draw();

  const result = await window.glowAPI.store.getFreeGames();
  storeLoading = false;
  storeLoaded = true;

  if (!result.success) {
    storeError = result.error || 'Failed to load store';
  } else {
    storeCurrent = result.current;
    storeUpcoming = result.upcoming;
  }
  draw();
}

// ── Account switch ───────────────────────────────────────

function onAccountChanged(): void {
  games = [];
  filtered = [];
  libLoading = true;
  libError = null;
  search = '';
  filter = 'all';
  storeLoaded = false;
  storeCurrent = [];
  storeUpcoming = [];
  loadLibrary();
}

// ── Page definition ──────────────────────────────────────

export const libraryPage: PageDefinition = {
  id: 'library',
  label: 'Games',
  icon: `<img src="assets/icons/fnui/utility/games.png" alt="Games" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 40,
  render(container) {
    el = container;
    loadLibrary();
    window.addEventListener('glow:account-switched', onAccountChanged);
  },
  cleanup() {
    window.removeEventListener('glow:account-switched', onAccountChanged);
    document.removeEventListener('click', closeMenus);
    el = null;
  },
};
