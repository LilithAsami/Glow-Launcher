import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────────
let loading = false;
let consuming = false;
let personalQty = 0;
let teammateQty = 0;
let personalItemId: string | null = null;
let teammateItemId: string | null = null;
let displayName = '';
let boostType: 'personal' | 'teammate' = 'personal';
let amount = 1;
let targetAccountId = '';
let targetDisplayName = '';
let fetchError = '';
let consumeResult: { success: boolean; consumed: number; failed: number; error?: string } | null = null;

// ── Player search state ───────────────────────────────────────
let searchTerm = '';
let searching = false;
let searchResults: { accountId: string; displayName: string; platform?: string }[] = [];
let searchError = '';
let showBg = false;
let customBgPath = '';

const xpBgDiv = () => {
  if (!showBg) return '';
  if (customBgPath) return `<div class="xpboost-bg" style="background: url('glow-bg://load/${customBgPath.replace(/\\/g, '/')}') center / cover no-repeat, linear-gradient(135deg, #0d0d1a 0%, #1a1030 40%, #0d0d1a 100%)"></div>`;
  return '<div class="xpboost-bg"></div>';
};

// ─── Helpers ──────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Draw ─────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  const maxQty = boostType === 'personal' ? personalQty : teammateQty;
  const clampedAmount = Math.min(amount, maxQty);
  if (clampedAmount !== amount) amount = clampedAmount;

  el.innerHTML = `
    <div class="xpboost-page">
      ${xpBgDiv()}
      <div class="xpboost-header">
        <h1 class="page-title">XP Boosts</h1>
        <p class="page-subtitle">Activate Save the World XP Boosts (Personal or Teammate)</p>
      </div>

      <div class="xpboost-content">

        <!-- Inventory Card -->
        <div class="xpboost-card">
          <div class="xpboost-inventory">
            <div class="xpboost-inv-item">
              <div class="xpboost-inv-icon xpboost-inv-icon--personal">
                <img src="assets/icons/stw/resources/smallxpboost.png" alt="Personal XP Boost" width="32" height="32" />
              </div>
              <div class="xpboost-inv-text">
                <span class="xpboost-inv-label">Personal</span>
                <span class="xpboost-inv-count" id="xpboost-personal-count">${loading ? '...' : personalQty}</span>
              </div>
            </div>
            <div class="xpboost-inv-item">
              <div class="xpboost-inv-icon xpboost-inv-icon--teammate">
                <img src="assets/icons/stw/resources/smallxpboost_gift.png" alt="Teammate XP Boost" width="32" height="32" />
              </div>
              <div class="xpboost-inv-text">
                <span class="xpboost-inv-label">Teammate</span>
                <span class="xpboost-inv-count" id="xpboost-teammate-count">${loading ? '...' : teammateQty}</span>
              </div>
            </div>
            <button class="xpboost-refresh-btn" id="xpboost-refresh" ${loading ? 'disabled' : ''} title="Refresh">
              ${loading ? `<div class="xpboost-spinner"></div>` :
                `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`}
            </button>
          </div>
        </div>

        <!-- Consume Card -->
        <div class="xpboost-card">
          <h3 class="xpboost-card-title">Activate Boosts</h3>

          <div class="xpboost-type-toggle">
            <button class="xpboost-type-btn ${boostType === 'personal' ? 'xpboost-type-btn--active' : ''}" data-type="personal">
              <img src="assets/icons/stw/resources/smallxpboost.png" alt="" width="18" height="18" />
              Personal
            </button>
            <button class="xpboost-type-btn ${boostType === 'teammate' ? 'xpboost-type-btn--active' : ''}" data-type="teammate">
              <img src="assets/icons/stw/resources/smallxpboost_gift.png" alt="" width="18" height="18" />
              Teammate
            </button>
          </div>

          ${boostType === 'teammate' ? `
            <div class="xpboost-target-row">
              <label class="xpboost-label">Target Player</label>
              <div class="xpboost-search-row">
                <input type="text" class="xpboost-input xpboost-search-input" id="xpboost-search"
                       placeholder="Search by name or 32-char Account ID..."
                       value="${esc(searchTerm)}" spellcheck="false" autocomplete="off" />
                <button class="xpboost-search-btn" id="xpboost-search-btn" ${searching ? 'disabled' : ''}>
                  ${searching
                    ? `<div class="xpboost-spinner"></div>`
                    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`}
                  Search
                </button>
              </div>
              ${searchError ? `<div class="xpboost-search-error">${esc(searchError)}</div>` : ''}
              ${searchResults.length > 0 ? `
                <div class="xpboost-search-results">
                  ${searchResults.map((r) => `
                    <div class="xpboost-search-result ${r.accountId === targetAccountId ? 'xpboost-search-result--selected' : ''}"
                         data-select-player="${r.accountId}" data-player-name="${esc(r.displayName)}">
                      <div class="xpboost-search-result-info">
                        <span class="xpboost-search-result-name">${esc(r.displayName)}</span>
                        <span class="xpboost-search-result-id">${r.accountId.slice(0, 12)}...</span>
                      </div>
                      ${r.platform ? `<span class="xpboost-search-platform xpboost-search-platform--${r.platform.toLowerCase()}">${esc(r.platform)}</span>` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              ${targetAccountId ? `
                <div class="xpboost-selected-player">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <span>Sending to: <strong>${esc(targetDisplayName || targetAccountId)}</strong></span>
                  <button class="xpboost-clear-target" id="xpboost-clear-target" title="Clear selection">✕</button>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="xpboost-amount-row">
            <label class="xpboost-label">Amount <span class="xpboost-label-hint">(max: ${maxQty})</span></label>
            <div class="xpboost-amount-controls">
              <button class="xpboost-amount-btn" id="xpboost-minus" ${amount <= 1 || consuming ? 'disabled' : ''}>−</button>
              <input type="number" class="xpboost-amount-input" id="xpboost-amount"
                     value="${amount}" min="1" max="${maxQty}" ${consuming ? 'disabled' : ''} />
              <button class="xpboost-amount-btn" id="xpboost-plus" ${amount >= maxQty || consuming ? 'disabled' : ''}>+</button>
              <button class="xpboost-amount-max" id="xpboost-max" ${consuming ? 'disabled' : ''}>MAX</button>
            </div>
          </div>

          <button class="xpboost-consume-btn" id="xpboost-consume"
                  ${consuming || maxQty <= 0 || amount < 1 ? 'disabled' : ''}>
            ${consuming ?
              `<div class="xpboost-spinner"></div> Activating...` :
              `<img src="assets/icons/stw/resources/${boostType === 'personal' ? 'smallxpboost' : 'smallxpboost_gift'}.png" alt="" width="18" height="18" /> Activate ${amount} ${boostType} boost${amount !== 1 ? 's' : ''}`}
          </button>

          ${fetchError ? `
            <div class="xpboost-msg xpboost-msg--error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              ${esc(fetchError)}
            </div>
          ` : ''}

          ${consumeResult ? `
            <div class="xpboost-msg ${consumeResult.success ? 'xpboost-msg--success' : 'xpboost-msg--error'}">
              ${consumeResult.success
                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                   Activated ${consumeResult.consumed} ${boostType} boost${consumeResult.consumed !== 1 ? 's' : ''}${consumeResult.failed > 0 ? ` (${consumeResult.failed} failed)` : ''}`
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                   ${esc(consumeResult.error || 'Failed to activate boosts')}`}
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

// ─── Events ───────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  el.querySelector('#xpboost-refresh')?.addEventListener('click', fetchBoosts);

  // Type toggle
  el.querySelectorAll('.xpboost-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = (btn as HTMLElement).dataset.type as 'personal' | 'teammate';
      if (t && t !== boostType) {
        boostType = t;
        amount = 1;
        consumeResult = null;
        searchResults = [];
        searchTerm = '';
        searchError = '';
        draw();
      }
    });
  });

  // Amount controls
  el.querySelector('#xpboost-minus')?.addEventListener('click', () => {
    if (amount > 1) { amount--; draw(); }
  });
  el.querySelector('#xpboost-plus')?.addEventListener('click', () => {
    const max = boostType === 'personal' ? personalQty : teammateQty;
    if (amount < max) { amount++; draw(); }
  });
  el.querySelector('#xpboost-max')?.addEventListener('click', () => {
    amount = boostType === 'personal' ? personalQty : teammateQty;
    draw();
  });

  const amountInput = el.querySelector('#xpboost-amount') as HTMLInputElement | null;
  amountInput?.addEventListener('change', () => {
    const max = boostType === 'personal' ? personalQty : teammateQty;
    let val = parseInt(amountInput.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > max) val = max;
    amount = val;
    draw();
  });

  // Player search
  const searchInput = el.querySelector('#xpboost-search') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    searchTerm = searchInput.value;
  });
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      el?.querySelector('#xpboost-search-btn')?.dispatchEvent(new Event('click'));
    }
  });

  el.querySelector('#xpboost-search-btn')?.addEventListener('click', searchPlayers);

  // Select player from results
  el.querySelectorAll('[data-select-player]').forEach((row) => {
    row.addEventListener('click', () => {
      const accId = (row as HTMLElement).dataset.selectPlayer!;
      const name = (row as HTMLElement).dataset.playerName || accId;
      targetAccountId = accId;
      targetDisplayName = name;
      draw();
    });
  });

  // Clear target selection
  el.querySelector('#xpboost-clear-target')?.addEventListener('click', () => {
    targetAccountId = '';
    targetDisplayName = '';
    searchResults = [];
    searchTerm = '';
    draw();
  });

  el.querySelector('#xpboost-consume')?.addEventListener('click', consumeBoosts);
}

// ─── Actions ──────────────────────────────────────────────────

async function searchPlayers(): Promise<void> {
  if (searching) return;
  const term = searchTerm.trim();
  if (!term) return;

  searching = true;
  searchError = '';
  searchResults = [];
  draw();

  try {
    // If it's a 32-char hex account ID, look it up directly
    if (/^[a-f0-9]{32}$/i.test(term)) {
      searchResults = [{ accountId: term.toLowerCase(), displayName: term.toLowerCase() }];
      try {
        const res = await window.glowAPI.stalk.search(term);
        if (res.success && res.results.length > 0) {
          searchResults = res.results.map((r: any) => ({
            accountId: r.accountId,
            displayName: r.displayName,
            platform: r.platform,
          }));
        }
      } catch {}
    } else {
      // Search by name
      const res = await window.glowAPI.stalk.search(term);
      if (res.success && res.results.length > 0) {
        searchResults = res.results.map((r: any) => ({
          accountId: r.accountId,
          displayName: r.displayName,
          platform: r.platform,
        }));
      } else {
        searchError = 'No players found';
      }
    }
  } catch (err: any) {
    searchError = err.message || 'Search failed';
  } finally {
    searching = false;
    draw();
  }
}

async function fetchBoosts(): Promise<void> {
  if (loading) return;
  loading = true;
  fetchError = '';
  consumeResult = null;
  draw();

  try {
    const result = await window.glowAPI.xpBoosts.getProfile();
    if (result.success) {
      personalQty = result.personal.quantity;
      teammateQty = result.teammate.quantity;
      personalItemId = result.personal.itemId;
      teammateItemId = result.teammate.itemId;
      displayName = result.displayName;
    } else {
      fetchError = result.error || 'Failed to fetch boosts';
    }
  } catch (err: any) {
    fetchError = err.message || 'Unexpected error';
  } finally {
    loading = false;
    draw();
  }
}

async function consumeBoosts(): Promise<void> {
  if (consuming) return;
  const max = boostType === 'personal' ? personalQty : teammateQty;
  if (amount < 1 || amount > max) return;

  if (boostType === 'teammate' && !targetAccountId) {
    consumeResult = { success: false, consumed: 0, failed: 0, error: 'Please search and select a target player first' };
    draw();
    return;
  }

  consuming = true;
  consumeResult = null;
  draw();

  try {
    const result = await window.glowAPI.xpBoosts.consume(
      boostType,
      amount,
      boostType === 'teammate' ? targetAccountId : undefined,
    );
    consumeResult = result;

    // Refresh counts after consuming
    if (result.consumed > 0) {
      await fetchBoosts();
      return; // fetchBoosts already calls draw()
    }
  } catch (err: any) {
    consumeResult = { success: false, consumed: 0, failed: 0, error: err.message || 'Unexpected error' };
  } finally {
    consuming = false;
    draw();
  }
}

// ─── Account change ───────────────────────────────────────────

function onAccountChanged() {
  personalQty = 0;
  teammateQty = 0;
  personalItemId = null;
  teammateItemId = null;
  consumeResult = null;
  fetchError = '';
  amount = 1;
  targetAccountId = '';
  targetDisplayName = '';
  searchTerm = '';
  searchResults = [];
  searchError = '';
  fetchBoosts();
}

// ─── Page Definition ──────────────────────────────────────────

export const xpBoostsPage: PageDefinition = {
  id: 'xpboosts',
  label: 'XP Boosts',
  icon: `<img src="assets/icons/stw/resources/smallxpboost.png" alt="XP Boosts" width="18" height="18" style="vertical-align:middle" />`,
  order: 23,
  async render(container) {
    el = container;
    const s = await window.glowAPI.storage.get<{ pageBackgrounds?: boolean; customBackgrounds?: Record<string, string> }>('settings').catch(() => null);
    showBg = s?.pageBackgrounds ?? false;
    customBgPath = s?.customBackgrounds?.xpboosts || '';
    fetchBoosts();
    window.addEventListener('glow:account-switched', onAccountChanged);
  },
  cleanup() {
    window.removeEventListener('glow:account-switched', onAccountChanged);
    el = null;
  },
};
