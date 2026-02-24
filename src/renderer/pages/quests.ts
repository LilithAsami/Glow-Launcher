import type { PageDefinition, QuestInfo } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────────
let loading = false;
let quests: QuestInfo[] = [];
let error: string | null = null;
let rerolling: string | null = null; // itemId being rerolled

// ─── Helpers ──────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Data ─────────────────────────────────────────────────────

async function loadQuests(): Promise<void> {
  loading = true;
  error = null;
  draw();

  try {
    const result = await window.glowAPI.quests.getAll('en');
    if (result.success && result.quests) {
      quests = result.quests;
    } else {
      error = result.error || 'Failed to fetch quests';
      quests = [];
    }
  } catch (err: any) {
    error = err?.message || 'Unexpected error';
    quests = [];
  }

  loading = false;
  draw();
}

async function handleReroll(itemId: string): Promise<void> {
  if (rerolling) return;
  rerolling = itemId;
  draw();

  try {
    const result = await window.glowAPI.quests.reroll(itemId);
    if (!result.success) {
      error = result.error || 'Reroll failed';
    }
    // Reload quests after reroll
    await loadQuests();
  } catch (err: any) {
    error = err?.message || 'Reroll error';
  }

  rerolling = null;
  draw();
}

// ─── Drawing ──────────────────────────────────────────────────

const CATEGORY_ORDER: QuestInfo['category'][] = ['Dailies', 'Weekly Mythic', 'Wargames', 'Endurance', 'Others'];

const CATEGORY_LABELS: Record<string, string> = {
  'Dailies': 'Dailies',
  'Weekly Mythic': 'Mythic Storm King',
  'Wargames': 'Wargames',
  'Endurance': 'Endurance',
  'Others': 'Others / Events',
};

function draw(): void {
  if (!el) return;

  if (loading) {
    el.innerHTML = `
      <div class="quests-page">
        <div class="quests-header">
          <h1 class="page-title">Quests</h1>
          <p class="page-subtitle">Save the World daily quests and progress</p>
        </div>
        <div class="quests-loading">
          <div class="quests-spinner"></div>
          <span>Loading quests...</span>
        </div>
      </div>`;
    return;
  }

  if (error && quests.length === 0) {
    el.innerHTML = `
      <div class="quests-page">
        <div class="quests-header">
          <h1 class="page-title">Quests</h1>
          <p class="page-subtitle">Save the World daily quests and progress</p>
        </div>
        <div class="quests-error-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>${esc(error)}</span>
        </div>
        <button class="quests-btn quests-btn--retry" id="quests-retry">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          Retry
        </button>
      </div>`;
    el.querySelector('#quests-retry')?.addEventListener('click', () => loadQuests());
    return;
  }

  // Group quests by category
  const grouped = new Map<string, QuestInfo[]>();
  for (const q of quests) {
    const arr = grouped.get(q.category) ?? [];
    arr.push(q);
    grouped.set(q.category, arr);
  }

  const categorySections = CATEGORY_ORDER
    .filter(cat => grouped.has(cat))
    .map(cat => {
      const items = grouped.get(cat)!;
      return `
        <div class="quests-category">
          <div class="quests-category-header">
            <span>${CATEGORY_LABELS[cat] || cat}</span>
            <span class="quests-category-count">${items.length}</span>
          </div>
          <div class="quests-category-list">
            ${items.map(q => renderQuest(q)).join('')}
          </div>
        </div>`;
    }).join('');

  el.innerHTML = `
    <div class="quests-page">
      <div class="quests-header">
        <div class="quests-header-top">
          <div>
            <h1 class="page-title">Quests</h1>
            <p class="page-subtitle">Save the World daily quests and progress</p>
          </div>
          <button class="quests-btn quests-btn--refresh" id="quests-refresh" title="Refresh quests">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            Refresh
          </button>
        </div>
      </div>
      ${error ? `<div class="quests-error-banner"><span>${esc(error)}</span></div>` : ''}
      ${quests.length === 0 ? `
        <div class="quests-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>No active quests found</span>
        </div>
      ` : categorySections}
    </div>`;

  // Bind events
  el.querySelector('#quests-refresh')?.addEventListener('click', () => loadQuests());

  el.querySelectorAll('.quests-reroll-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const itemId = (btn as HTMLElement).dataset.itemId;
      if (itemId) handleReroll(itemId);
    });
  });
}

function renderQuest(q: QuestInfo): string {
  const isRerolling = rerolling === q.itemId;

  // Calculate overall progress
  let totalCurrent = 0;
  let totalMax = 0;
  let hasKnownMax = false;
  for (const obj of q.objectives) {
    if (obj.max !== null) {
      totalCurrent += obj.current;
      totalMax += obj.max;
      hasKnownMax = true;
    }
  }
  const pct = hasKnownMax && totalMax > 0 ? Math.min(Math.round((totalCurrent / totalMax) * 100), 100) : null;
  const isComplete = pct !== null && pct >= 100;
  const pctLabel = pct !== null ? `${pct}%` : '0%';

  return `
    <div class="quests-card ${isComplete ? 'quests-card--complete' : ''}">
      <div class="quests-card-main">
        <div class="quests-card-info">
          <span class="quests-card-name">${esc(q.name)}</span>
          <span class="quests-card-state ${isComplete ? 'quests-card-state--complete' : 'quests-card-state--progress'}">${pctLabel}</span>
        </div>
        ${q.objectives.length > 0 ? `
          <div class="quests-card-objectives">
            ${q.objectives.map(obj => {
              if (obj.max !== null) {
                const p = Math.min(Math.round((obj.current / obj.max) * 100), 100);
                return `
                  <div class="quests-obj">
                    <div class="quests-obj-bar-wrap">
                      <div class="quests-obj-bar" style="width: ${p}%"></div>
                    </div>
                    <span class="quests-obj-text">${obj.current}/${obj.max}</span>
                  </div>`;
              }
              return `
                <div class="quests-obj">
                  <span class="quests-obj-text quests-obj-text--no-max">${obj.current}</span>
                </div>`;
            }).join('')}
          </div>
        ` : ''}
      </div>
      ${q.canReroll ? `
        <button class="quests-reroll-btn ${isRerolling ? 'quests-reroll-btn--loading' : ''}"
                data-item-id="${esc(q.itemId)}" title="Reroll this quest"
                ${isRerolling ? 'disabled' : ''}>
          ${isRerolling ? `
            <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
          ` : `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
          `}
        </button>
      ` : ''}
    </div>`;
}

// ─── Event Listeners ──────────────────────────────────────────

function onAccountSwitched(): void {
  loadQuests();
}

// ─── Page Definition ──────────────────────────────────────────

export const questsPage: PageDefinition = {
  id: 'quests',
  label: 'Quests',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="9" y1="14" x2="15" y2="14"/>
    <line x1="9" y1="18" x2="13" y2="18"/>
  </svg>`,
  order: 5,
  render(container: HTMLElement) {
    el = container;
    window.addEventListener('glow:account-switched', onAccountSwitched);
    loadQuests();
  },
  cleanup() {
    window.removeEventListener('glow:account-switched', onAccountSwitched);
    el = null;
  },
};
