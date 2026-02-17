import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────────
let vbLoading = false;
let vbData: any = null;
let vbError: string | null = null;

// ─── Helpers ──────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Draw ─────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="vbucks-page">
      <div class="vbucks-header">
        <h1 class="page-title">V-Bucks Info</h1>
        <p class="page-subtitle">Detailed breakdown of your V-Bucks across all platforms</p>
      </div>

      <div class="vbucks-content">
        ${vbLoading ? `
          <div class="vbucks-loading">
            <div class="vbucks-spinner"></div>
            <span>Fetching V-Bucks data...</span>
          </div>
        ` : vbError ? `
          <div class="vbucks-error-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span>${esc(vbError)}</span>
          </div>
          <button class="vbucks-btn vbucks-btn--primary" id="vbucks-fetch">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            Retry
          </button>
        ` : vbData ? `
          <!-- Total display -->
          <div class="vbucks-total-card">
            <div class="vbucks-total-icon">
              <img src="https://fortnite-api.com/images/vbuck.png" alt="V-Bucks" width="32" height="32" />
            </div>
            <div class="vbucks-total-info">
              <span class="vbucks-total-amount">${vbData.total.toLocaleString()}</span>
              <span class="vbucks-total-label">Total V-Bucks</span>
              ${vbData.displayName ? `<span class="vbucks-total-account">${esc(vbData.displayName)}</span>` : ''}
            </div>
          </div>

          <!-- Breakdown grid -->
          <div class="vbucks-grid">
            <div class="vbucks-stat-card vbucks-stat--purchased">
              <span class="vbucks-stat-value">${vbData.purchased.toLocaleString()}</span>
              <span class="vbucks-stat-label">Purchased</span>
            </div>
            <div class="vbucks-stat-card vbucks-stat--earned">
              <span class="vbucks-stat-value">${vbData.earned.toLocaleString()}</span>
              <span class="vbucks-stat-label">Earned</span>
            </div>
            <div class="vbucks-stat-card vbucks-stat--complimentary">
              <span class="vbucks-stat-value">${vbData.complimentary.toLocaleString()}</span>
              <span class="vbucks-stat-label">Free / Gifts</span>
            </div>
          </div>

          <!-- Details table -->
          <div class="vbucks-details">
            <div class="vbucks-detail-row">
              <span class="vbucks-detail-label">Platform</span>
              <span class="vbucks-detail-value">${esc(vbData.currentPlatform)}</span>
            </div>
            <div class="vbucks-detail-row">
              <span class="vbucks-detail-label">Gifts</span>
              <span class="vbucks-detail-value">${vbData.giftsAllowed ? `${vbData.giftsRemaining}/5 remaining` : 'Disabled'}</span>
            </div>
            <div class="vbucks-detail-row">
              <span class="vbucks-detail-label">Last Creator Code</span>
              <span class="vbucks-detail-value">${vbData.creatorCode ? esc(vbData.creatorCode) : 'None'}</span>
            </div>
            ${vbData.sources.length > 0 ? `
              <div class="vbucks-sources-header">Sources Breakdown</div>
              ${vbData.sources.map((s: any) => `
                <div class="vbucks-detail-row vbucks-detail-row--source">
                  <span class="vbucks-detail-label">${esc(s.platform)}</span>
                  <span class="vbucks-detail-value">${s.amount.toLocaleString()}${s.count > 1 ? ` (x${s.count})` : ''}</span>
                </div>
              `).join('')}
            ` : ''}
          </div>

          <button class="vbucks-btn vbucks-btn--ghost" id="vbucks-refresh" title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            Refresh
          </button>
        ` : `
          <div class="vbucks-empty">
            <div class="vbucks-empty-icon">
              <img src="https://fortnite-api.com/images/vbuck.png" alt="V-Bucks" width="48" height="48" />
            </div>
            <p>Click below to fetch your V-Bucks breakdown</p>
            <button class="vbucks-btn vbucks-btn--primary vbucks-btn--large" id="vbucks-fetch">
              <img src="https://fortnite-api.com/images/vbuck.png" alt="V" width="18" height="18" />
              Get V-Bucks Info
            </button>
          </div>
        `}
      </div>
    </div>
  `;

  bindEvents();
}

// ─── Events ───────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  const fetchBtn = el.querySelector('#vbucks-fetch') as HTMLButtonElement | null;
  fetchBtn?.addEventListener('click', () => fetchVbucks());

  const refreshBtn = el.querySelector('#vbucks-refresh') as HTMLButtonElement | null;
  refreshBtn?.addEventListener('click', () => fetchVbucks());
}

// ─── Actions ──────────────────────────────────────────────────

async function fetchVbucks(): Promise<void> {
  if (vbLoading) return;
  vbLoading = true;
  vbError = null;
  draw();

  try {
    const result = await window.glowAPI.vbucks.getInfo();
    if (result.success) {
      vbData = result;
      vbError = null;
    } else {
      vbError = result.error || 'Failed to get V-Bucks info';
    }
  } catch (err: any) {
    vbError = err.message || 'Unexpected error';
  } finally {
    vbLoading = false;
    draw();
  }
}

// ─── Account switch handler ───────────────────────────────────

function onAccountChanged() {
  vbData = null;
  vbError = null;
  vbLoading = false;
  fetchVbucks();
}

// ─── Page Definition ──────────────────────────────────────────

export const vbucksPage: PageDefinition = {
  id: 'vbucks',
  label: 'V-Bucks',
  icon: `<img src="https://fortnite-api.com/images/vbuck.png" alt="V-Bucks" width="18" height="18" style="vertical-align:middle" />`,
  order: 20,
  render(container) {
    el = container;
    draw();
    window.addEventListener('glow:account-switched', onAccountChanged);
  },
  cleanup() {
    window.removeEventListener('glow:account-switched', onAccountChanged);
    el = null;
  },
};
