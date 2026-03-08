import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────────
let loading = false;
let data: any = null;
let error: string | null = null;
let expandedSender: string | null = null;

// ── Search state ──────────────────────────────────────────────
let searchQuery = '';
let searchResults: SearchResult[] = [];
let allAthenaItems: AthenaItem[] | null = null;
let searchModal: { item: SearchResult } | null = null;

interface AthenaItem {
  templateId: string;
  giftFromAccountId: string | null;
  creationTime: string | null;
}

interface SearchResult {
  templateId: string;
  name: string;
  image: string;
  isGifted: boolean;
  giftFromAccountId: string | null;
  giftFromName: string | null;
  creationTime: string | null;
}

// ── Cosmetic cache (from fortnite-api.com) ────────────────────
let cosmeticMap: Map<string, { name: string; image: string }> | null = null;
let cosmeticMapLoading = false;

// ─── Helpers ──────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function extractCosmeticId(templateId: string): string {
  const idx = templateId.indexOf(':');
  return idx >= 0 ? templateId.substring(idx + 1) : templateId;
}

function getCosmeticImageUrl(cosmeticId: string): string {
  return `https://fortnite-api.com/images/cosmetics/br/${cosmeticId}/smallicon.png`;
}

async function loadCosmeticMap(): Promise<void> {
  if (cosmeticMap || cosmeticMapLoading) return;
  cosmeticMapLoading = true;
  try {
    const res = await fetch('https://fortnite-api.com/v2/cosmetics?language=en', { signal: AbortSignal.timeout(15000) });
    const json = await res.json();
    if (json?.status === 200 && json?.data?.br) {
      cosmeticMap = new Map();
      for (const item of json.data.br) {
        if (item.id) {
          cosmeticMap.set(item.id.toLowerCase(), {
            name: item.name || item.id,
            image: item.images?.smallIcon || item.images?.icon || '',
          });
        }
      }
    }
  } catch { /* no images fallback */ } finally {
    cosmeticMapLoading = false;
  }
}

function lookupCosmetic(templateId: string): { name: string; image: string } {
  const id = extractCosmeticId(templateId).toLowerCase();
  if (cosmeticMap?.has(id)) return cosmeticMap.get(id)!;
  const cleanName = extractCosmeticId(templateId).replace(/_/g, ' ');
  return { name: cleanName, image: getCosmeticImageUrl(extractCosmeticId(templateId)) };
}

/** Build a flat map of giftFromAccountId → displayName from the senders data */
function buildSenderNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!data?.senders) return map;
  for (const s of data.senders) {
    if (s.displayName && s.displayName !== s.accountId) {
      map.set(s.accountId, s.displayName);
    }
  }
  return map;
}

// ─── Search ───────────────────────────────────────────────────

async function loadAthenaItems(): Promise<void> {
  if (allAthenaItems) return;
  try {
    const result = await window.glowAPI.mcp.execute('QueryProfile', 'athena');
    if (!result.success) return;
    const items = result.data?.profileChanges?.[0]?.profile?.items ?? {};
    allAthenaItems = [];
    for (const item of Object.values(items) as any[]) {
      const tid = item?.templateId;
      if (!tid) continue;
      // Only cosmetic types
      const lower = tid.toLowerCase();
      if (!lower.startsWith('athena')) continue;
      allAthenaItems.push({
        templateId: tid,
        giftFromAccountId: item.attributes?.giftFromAccountId || null,
        creationTime: item.attributes?.creation_time || null,
      });
    }
  } catch { /* silent */ }
}

function performSearch(query: string): SearchResult[] {
  if (!allAthenaItems || !query.trim()) return [];
  const q = query.toLowerCase().trim();
  const senderNames = buildSenderNameMap();
  const results: SearchResult[] = [];

  for (const item of allAthenaItems) {
    const info = lookupCosmetic(item.templateId);
    if (!info.name.toLowerCase().includes(q)) continue;
    results.push({
      templateId: item.templateId,
      name: info.name,
      image: info.image,
      isGifted: !!item.giftFromAccountId,
      giftFromAccountId: item.giftFromAccountId,
      giftFromName: item.giftFromAccountId ? (senderNames.get(item.giftFromAccountId) || item.giftFromAccountId) : null,
      creationTime: item.creationTime,
    });
  }

  // Gifted items first, then alphabetical
  results.sort((a, b) => {
    if (a.isGifted !== b.isGifted) return a.isGifted ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, 50);
}

// ─── Draw ─────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  // Save scroll position
  const page = el.querySelector('.gifts-page');
  const scrollTop = page?.scrollTop ?? 0;

  el.innerHTML = `
    <div class="gifts-page">
      <div class="gifts-header">
        <h1 class="page-title">Gifts Info</h1>
        <p class="page-subtitle">History of cosmetics gifted to your account</p>
      </div>

      <div class="gifts-content">
        ${data && !loading && !error ? renderSearch() : ''}

        ${loading ? `
          <div class="gifts-loading">
            <div class="gifts-spinner"></div>
            <span>Fetching gift data...</span>
          </div>
        ` : error ? `
          <div class="gifts-error-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span>${esc(error)}</span>
          </div>
          <button class="gifts-retry-btn" id="gifts-retry">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            Retry
          </button>
        ` : data ? renderData() : `
          <div class="gifts-loading">
            <div class="gifts-spinner"></div>
            <span>Loading...</span>
          </div>
        `}
      </div>
    </div>

    ${searchModal ? renderModal() : ''}
  `;

  // Restore scroll position
  const newPage = el.querySelector('.gifts-page');
  if (newPage && scrollTop > 0) newPage.scrollTop = scrollTop;

  // Restore search input cursor
  const searchInput = el.querySelector('#gifts-search') as HTMLInputElement | null;
  if (searchInput && searchQuery) {
    searchInput.value = searchQuery;
    searchInput.setSelectionRange(searchQuery.length, searchQuery.length);
  }

  bindEvents();
}

function renderSearch(): string {
  return `
    <div class="gifts-search-wrap">
      <svg class="gifts-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" class="gifts-search-input" id="gifts-search"
             placeholder="Search a cosmetic to check if gifted..."
             value="${esc(searchQuery)}" />
      ${searchQuery ? '<button class="gifts-search-clear" id="gifts-search-clear">&times;</button>' : ''}
    </div>
    ${searchQuery && searchResults.length > 0 ? `
      <div class="gifts-search-results">
        ${searchResults.map((r, i) => `
          <div class="gifts-search-row" data-search-idx="${i}">
            <div class="gifts-search-row-img">
              <img src="${esc(r.image)}" alt="" loading="lazy" onerror="this.style.display='none'" />
            </div>
            <span class="gifts-search-row-name">${esc(r.name)}</span>
            ${r.isGifted
              ? `<span class="gifts-search-tag gifts-search-tag--gifted">Gifted</span>`
              : `<span class="gifts-search-tag gifts-search-tag--owned">Not gifted</span>`
            }
          </div>
        `).join('')}
      </div>
    ` : searchQuery && searchResults.length === 0 ? `
      <div class="gifts-search-empty">No matching cosmetics found.</div>
    ` : ''}
  `;
}

function renderModal(): string {
  if (!searchModal) return '';
  const r = searchModal.item;
  return `
    <div class="gifts-modal-overlay" id="gifts-modal-overlay">
      <div class="gifts-modal">
        <button class="gifts-modal-close" id="gifts-modal-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="gifts-modal-img">
          <img src="${esc(r.image)}" alt="" onerror="this.style.display='none'" />
        </div>
        <div class="gifts-modal-info">
          <h3 class="gifts-modal-name">${esc(r.name)}</h3>
          <span class="gifts-modal-tid">${esc(extractCosmeticId(r.templateId))}</span>
          ${r.isGifted ? `
            <div class="gifts-modal-gifted">
              <span class="gifts-modal-badge">Gifted</span>
              <div class="gifts-modal-detail">
                <span class="gifts-modal-detail-label">From</span>
                <span class="gifts-modal-detail-value">${esc(r.giftFromName || r.giftFromAccountId || 'Unknown')}</span>
              </div>
              ${r.creationTime ? `
                <div class="gifts-modal-detail">
                  <span class="gifts-modal-detail-label">Date</span>
                  <span class="gifts-modal-detail-value">${formatDate(r.creationTime)}</span>
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="gifts-modal-not-gifted">
              <span class="gifts-modal-badge gifts-modal-badge--muted">Not gifted</span>
              <span class="gifts-modal-detail-hint">This item was not received as a gift.</span>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

function renderData(): string {
  const senders: any[] = data.senders || [];
  const totalCosmetics = senders.reduce((sum: number, s: any) => sum + s.cosmetics.length, 0);

  return `
    <div class="gifts-stats">
      <div class="gifts-stat">
        <span class="gifts-stat-num">${data.numReceived}</span>
        <span class="gifts-stat-lbl">Received</span>
      </div>
      <div class="gifts-stat">
        <span class="gifts-stat-num">${senders.length}</span>
        <span class="gifts-stat-lbl">Senders</span>
      </div>
      <div class="gifts-stat">
        <span class="gifts-stat-num">${totalCosmetics}</span>
        <span class="gifts-stat-lbl">Cosmetics</span>
      </div>
    </div>

    ${senders.length === 0 ? `
      <div class="gifts-empty">No gift history found.</div>
    ` : `
      <div class="gifts-list">
        ${senders.map((s: any) => renderSender(s)).join('')}
      </div>
    `}
  `;
}

function renderSender(sender: any): string {
  const isExpanded = expandedSender === sender.accountId;
  const count = sender.cosmetics.length;
  const isIdOnly = sender.displayName === sender.accountId;

  return `
    <div class="gifts-sender ${isExpanded ? 'expanded' : ''}" data-sid="${esc(sender.accountId)}">
      <div class="gifts-sender-row" data-toggle="${esc(sender.accountId)}">
        <div class="gifts-sender-left">
          <span class="gifts-sender-name">${esc(sender.displayName)}</span>
          <button class="gifts-copy" data-copy="${esc(sender.displayName)}" title="Copy">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          ${!isIdOnly ? `<span class="gifts-sender-aid">${esc(sender.accountId)}</span>` : ''}
        </div>
        <div class="gifts-sender-right">
          <span class="gifts-sender-date">${formatDate(sender.lastGiftDate)}</span>
          <span class="gifts-sender-cnt">${count}</span>
          ${count > 0 ? `<svg class="gifts-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>` : ''}
        </div>
      </div>
      ${isExpanded && count > 0 ? `
        <div class="gifts-items">
          ${sender.cosmetics.map((c: any) => {
            const info = lookupCosmetic(c.templateId);
            return `
              <div class="gifts-item">
                <div class="gifts-item-img">
                  <img src="${esc(info.image)}" alt="" loading="lazy" onerror="this.style.display='none'" />
                </div>
                <span class="gifts-item-name">${esc(info.name)}</span>
                <span class="gifts-item-date">${formatDate(c.creationTime)}</span>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ─── Events ───────────────────────────────────────────────────

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

function bindEvents(): void {
  if (!el) return;

  el.querySelector('#gifts-retry')?.addEventListener('click', () => fetchGifts());

  // Sender toggle — preserve scroll
  el.querySelectorAll('[data-toggle]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.gifts-copy')) return;
      const sid = (row as HTMLElement).dataset.toggle!;
      expandedSender = expandedSender === sid ? null : sid;
      draw();
    });
  });

  // Copy buttons
  el.querySelectorAll('.gifts-copy').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = (btn as HTMLElement).dataset.copy!;
      navigator.clipboard.writeText(text);
      const svg = btn.querySelector('svg');
      if (svg) {
        const orig = svg.outerHTML;
        svg.outerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => { const c = btn.querySelector('svg'); if (c) c.outerHTML = orig; }, 1000);
      }
    });
  });

  // Search input
  const searchInput = el.querySelector('#gifts-search') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      searchQuery = searchInput.value;
      if (!searchQuery.trim()) {
        searchResults = [];
        draw();
        return;
      }
      // Ensure athena items are loaded
      await loadAthenaItems();
      await loadCosmeticMap();
      searchResults = performSearch(searchQuery);
      draw();
      // Refocus the input
      const newInput = el?.querySelector('#gifts-search') as HTMLInputElement | null;
      newInput?.focus();
    }, 300);
  });

  // Search clear
  el.querySelector('#gifts-search-clear')?.addEventListener('click', () => {
    searchQuery = '';
    searchResults = [];
    draw();
  });

  // Search result click → open modal
  el.querySelectorAll('[data-search-idx]').forEach((row) => {
    row.addEventListener('click', () => {
      const idx = parseInt((row as HTMLElement).dataset.searchIdx!, 10);
      if (searchResults[idx]) {
        searchModal = { item: searchResults[idx] };
        draw();
      }
    });
  });

  // Modal close
  el.querySelector('#gifts-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'gifts-modal-overlay') {
      searchModal = null;
      draw();
    }
  });
  el.querySelector('#gifts-modal-close')?.addEventListener('click', () => {
    searchModal = null;
    draw();
  });
}

// ─── Fetch ────────────────────────────────────────────────────

async function fetchGifts(): Promise<void> {
  if (loading) return;
  loading = true;
  error = null;
  draw();

  loadCosmeticMap();

  try {
    const result = await window.glowAPI.gifts.getInfo();
    if (result.success) {
      data = result;
      error = null;
    } else {
      error = result.error || 'Failed to get gift info';
    }
  } catch (err: any) {
    error = err.message || 'Unexpected error';
  } finally {
    loading = false;
    draw();
  }
}

// ─── Account switch ───────────────────────────────────────────

function onAccountChanged() {
  data = null;
  error = null;
  loading = false;
  expandedSender = null;
  searchQuery = '';
  searchResults = [];
  allAthenaItems = null;
  searchModal = null;
  fetchGifts();
}

// ─── Page Definition ──────────────────────────────────────────

export const giftsPage: PageDefinition = {
  id: 'gifts',
  label: 'Gifts Info',
  icon: `<img src="assets/icons/br/gift.png" alt="Gifts" width="18" height="18" style="vertical-align:middle" />`,
  order: 25,
  render(container) {
    el = container;
    draw();
    fetchGifts();
    window.addEventListener('glow:account-switched', onAccountChanged);
  },
  cleanup() {
    window.removeEventListener('glow:account-switched', onAccountChanged);
    el = null;
  },
};
