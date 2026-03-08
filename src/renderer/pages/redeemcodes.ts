import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────────
let redeemLoading = false;
let redeemResult: any = null;
let codeHistory: { code: string; success: boolean; message: string; details?: any[] }[] = [];

// Friend codes state
let friendCodesLoading = false;
let friendCodesData: { epic: any[]; xbox: any[] } | null = null;
let friendCodesError: string | null = null;

// ─── Helpers ──────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Draw ─────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="redeem-page">
      <div class="redeem-header">
        <h1 class="page-title">Redeem Codes</h1>
        <p class="page-subtitle">Redeem Epic Games and Fortnite codes on your account</p>
      </div>

      <div class="redeem-content">
        <div class="redeem-input-card">
          <div class="redeem-input-row">
            <input type="text" id="redeem-code-input" class="redeem-input"
                   placeholder="Enter code (e.g. XXXXX-XXXXX-XXXXX-XXXXX)"
                   maxlength="64" spellcheck="false" autocomplete="off"
                   ${redeemLoading ? 'disabled' : ''} />
            <button class="redeem-btn redeem-btn--primary" id="redeem-submit" ${redeemLoading ? 'disabled' : ''}>
              ${redeemLoading ? `
                <div class="redeem-btn-spinner"></div>
              ` : `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              `}
              Redeem
            </button>
          </div>
          <p class="redeem-hint">Dashes are removed automatically. One code at a time.</p>
        </div>

        ${redeemResult ? `
          <div class="redeem-result ${redeemResult.success ? 'redeem-result--success' : 'redeem-result--error'}">
            <div class="redeem-result-icon">
              ${redeemResult.success
                ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'}
            </div>
            <div class="redeem-result-content">
              <span class="redeem-result-title">${redeemResult.success ? 'Code Redeemed!' : 'Failed'}</span>
              ${redeemResult.success && redeemResult.details?.length ? `
                <div class="redeem-result-details">
                  ${redeemResult.details.map((d: any) => `
                    <span class="redeem-result-item">${esc(d.entitlementName)}</span>
                  `).join('')}
                </div>
              ` : ''}
              ${redeemResult.error ? `<span class="redeem-result-error">${esc(redeemResult.error)}</span>` : ''}
            </div>
          </div>
        ` : ''}

        ${codeHistory.length > 0 ? `
          <div class="redeem-history">
            <h3 class="redeem-history-title">History</h3>
            <div class="redeem-history-list">
              ${codeHistory.map((h) => `
                <div class="redeem-history-item ${h.success ? 'redeem-history--success' : 'redeem-history--error'}">
                  <code class="redeem-history-code">${esc(h.code)}</code>
                  <span class="redeem-history-msg">${esc(h.message)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- STW Friend Codes -->
        <div class="friendcodes-card">
          <div class="friendcodes-header-row">
            <h3 class="friendcodes-title">STW Friend Codes</h3>
            <button class="friendcodes-refresh-btn" id="fc-refresh" ${friendCodesLoading ? 'disabled' : ''} title="Refresh">
              ${friendCodesLoading
                ? `<div class="friendcodes-spinner"></div>`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`}
            </button>
          </div>
          ${friendCodesError ? `
            <div class="friendcodes-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              ${esc(friendCodesError)}
            </div>
          ` : friendCodesLoading && !friendCodesData ? `
            <div class="friendcodes-loading">
              <div class="friendcodes-spinner"></div>
              <span>Fetching friend codes...</span>
            </div>
          ` : friendCodesData ? renderFriendCodes() : `
            <div class="friendcodes-loading">
              <div class="friendcodes-spinner"></div>
              <span>Fetching friend codes...</span>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  bindEvents();

  // Focus input
  const input = el.querySelector('#redeem-code-input') as HTMLInputElement | null;
  if (input && !redeemLoading) input.focus();
}

// ─── Friend Codes renderer ───────────────────────────────────

function renderFriendCodes(): string {
  if (!friendCodesData) return '';
  const { epic, xbox } = friendCodesData;
  const hasEpic = epic.length > 0;
  const hasXbox = xbox.length > 0;

  if (!hasEpic && !hasXbox) {
    return `<div class="friendcodes-empty">No friend codes available on this account.</div>`;
  }

  let html = '<div class="friendcodes-platforms">';

  if (hasEpic) {
    html += `
      <div class="friendcodes-platform">
        <div class="friendcodes-platform-header">
          <span class="friendcodes-platform-name">Epic Games</span>
          <span class="friendcodes-platform-count">${epic.length} code${epic.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="friendcodes-list">
          ${epic.map((c: any, i: number) => {
            const codeType = (c.codeType || '').replace('CodeToken:', '') || 'Unknown';
            const dateCreated = c.dateCreated ? new Date(c.dateCreated).toLocaleDateString() : 'Unknown';
            return `
              <div class="friendcodes-item">
                <span class="friendcodes-item-index">${i + 1}.</span>
                <div class="friendcodes-item-info">
                  <span class="friendcodes-item-type">${esc(codeType)}</span>
                  <span class="friendcodes-item-date">Created: ${esc(dateCreated)}</span>
                </div>
                <code class="friendcodes-item-code">${esc(c.codeId || '')}</code>
                <button class="friendcodes-copy-btn" data-code="${esc(c.codeId || '')}" title="Copy">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  if (hasXbox) {
    html += `
      <div class="friendcodes-platform">
        <div class="friendcodes-platform-header">
          <span class="friendcodes-platform-name">Xbox</span>
          <span class="friendcodes-platform-count">${xbox.length} code${xbox.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="friendcodes-list">
          ${xbox.map((c: any, i: number) => {
            const codeType = (c.codeType || '').replace('CodeToken:', '') || 'Unknown';
            const dateCreated = c.dateCreated ? new Date(c.dateCreated).toLocaleDateString() : 'Unknown';
            return `
              <div class="friendcodes-item">
                <span class="friendcodes-item-index">${i + 1}.</span>
                <div class="friendcodes-item-info">
                  <span class="friendcodes-item-type">${esc(codeType)}</span>
                  <span class="friendcodes-item-date">Created: ${esc(dateCreated)}</span>
                </div>
                <code class="friendcodes-item-code">${esc(c.codeId || '')}</code>
                <button class="friendcodes-copy-btn" data-code="${esc(c.codeId || '')}" title="Copy">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}

// ─── Events ───────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  const submitBtn = el.querySelector('#redeem-submit') as HTMLButtonElement | null;
  const input = el.querySelector('#redeem-code-input') as HTMLInputElement | null;

  submitBtn?.addEventListener('click', () => submitCode());
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCode();
  });

  // Friend codes refresh
  el.querySelector('#fc-refresh')?.addEventListener('click', () => fetchFriendCodes());

  // Copy buttons
  el.querySelectorAll('.friendcodes-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = (btn as HTMLElement).dataset.code;
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          const svg = btn.querySelector('svg');
          if (svg) {
            const original = svg.outerHTML;
            svg.outerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(() => {
              const newSvg = btn.querySelector('svg');
              if (newSvg) newSvg.outerHTML = original;
            }, 1500);
          }
        });
      }
    });
  });
}

// ─── Actions ──────────────────────────────────────────────────

async function submitCode(): Promise<void> {
  if (redeemLoading || !el) return;
  const input = el.querySelector('#redeem-code-input') as HTMLInputElement | null;
  const code = input?.value?.trim();
  if (!code) return;

  redeemLoading = true;
  redeemResult = null;
  draw();

  try {
    const result = await window.glowAPI.redeemCodes.redeem(code);
    redeemResult = result;

    codeHistory.unshift({
      code: code.replace(/-/g, ''),
      success: result.success,
      message: result.success
        ? (result.details?.map((d: any) => d.entitlementName).join(', ') || 'Redeemed')
        : (result.error || 'Failed'),
    });

    // Keep only last 20
    if (codeHistory.length > 20) codeHistory = codeHistory.slice(0, 20);
  } catch (err: any) {
    redeemResult = { success: false, error: err.message || 'Unexpected error' };
    codeHistory.unshift({ code, success: false, message: err.message || 'Error' });
  } finally {
    redeemLoading = false;
    draw();
  }
}

async function fetchFriendCodes(): Promise<void> {
  if (friendCodesLoading) return;
  friendCodesLoading = true;
  friendCodesError = null;
  draw();

  try {
    const result = await window.glowAPI.redeemCodes.getFriendCodes();
    if (result.success) {
      friendCodesData = { epic: result.epic, xbox: result.xbox };
    } else {
      friendCodesError = result.error || 'Failed to fetch friend codes';
    }
  } catch (err: any) {
    friendCodesError = err.message || 'Unexpected error';
  } finally {
    friendCodesLoading = false;
    draw();
  }
}

// ─── Account change ───────────────────────────────────────────

function onAccountChanged() {
  redeemResult = null;
  friendCodesData = null;
  friendCodesError = null;
  draw();
  fetchFriendCodes();
}

// ─── Page Definition ──────────────────────────────────────────

export const redeemCodesPage: PageDefinition = {
  id: 'redeemcodes',
  label: 'Redeem Codes',
  icon: `<img src="assets/icons/fnui/EG/codes.png" alt="Redeem Codes" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 22,
  render(container) {
    el = container;
    draw();
    fetchFriendCodes();
    window.addEventListener('glow:account-switched', onAccountChanged);
  },
  cleanup() {
    window.removeEventListener('glow:account-switched', onAccountChanged);
    el = null;
  },
};
