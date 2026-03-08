import type { PageDefinition, QuestInfo, QuestsResult } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────────
let loading = false;
let quests: QuestInfo[] = [];
let error: string | null = null;
let rerolling: string | null = null;
let dailyRerolls = 0;
let activeCategory: string | null = null;
let collapsedCategories = new Set<string>();

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
    const result: QuestsResult = await window.glowAPI.quests.getAll('en');
    if (result.success && result.quests) {
      quests = result.quests;
      dailyRerolls = (result as any).dailyRerolls ?? 0;
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
    await loadQuests();
  } catch (err: any) {
    error = err?.message || 'Reroll error';
  }

  rerolling = null;
  draw();
}

// ─── Category config ──────────────────────────────────────────

const CATEGORY_ORDER = [
  'Daily', 'WeeklyQuest', 'StormKingHardmode', 'Events', 'Challenges',
  'Achievements', 'Stonewood', 'Plankerton', 'CannyValley', 'TwinePeaks',
  'Phoenix', 'Outpost', 'OnBoarding', 'Generic', 'Hero', 'HeroLoadout',
  'Armory', 'Announcements', 'PIckaxes', 'TeamPerk', 'Survivor', 'STWIrwin',
  'ReactiveQuests', 'Rewards', 'Elder', 'Others',
];

const CATEGORY_LABELS: Record<string, string> = {
  Daily: 'Daily Quests',
  WeeklyQuest: 'Weekly Quests',
  StormKingHardmode: 'Storm King',
  Events: 'Events',
  Challenges: 'Challenges',
  Achievements: 'Achievements',
  Stonewood: 'Stonewood',
  Plankerton: 'Plankerton',
  CannyValley: 'Canny Valley',
  TwinePeaks: 'Twine Peaks',
  Phoenix: 'Ventures',
  Outpost: 'Outpost / SSD',
  OnBoarding: 'Onboarding',
  Generic: 'Generic',
  Hero: 'Hero',
  HeroLoadout: 'Hero Loadout',
  Armory: 'Armory',
  Announcements: 'Announcements',
  PIckaxes: 'Pickaxes',
  TeamPerk: 'Team Perk',
  Survivor: 'Survivor',
  STWIrwin: 'STW Irwin',
  ReactiveQuests: 'Reactive Quests',
  Rewards: 'Rewards',
  Elder: 'Elder',
  Others: 'Others',
};

const CATEGORY_ICONS: Record<string, string> = {
  Daily: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  WeeklyQuest: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  StormKingHardmode: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>',
  Events: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
  Challenges: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  Achievements: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
  Stonewood: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  Plankerton: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  CannyValley: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  TwinePeaks: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  Phoenix: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>',
  Others: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};

function getCatIcon(cat: string): string {
  return CATEGORY_ICONS[cat] || CATEGORY_ICONS['Others'];
}

// ─── Drawing ──────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading) {
    el.innerHTML = `
      <div class="q3-page">
        <div class="q3-header">
          <h1 class="q3-title">Quests</h1>
          <p class="q3-subtitle">Save the World quest tracker</p>
        </div>
        <div class="q3-loading"><div class="q3-spinner"></div><span>Loading quests…</span></div>
      </div>`;
    return;
  }

  if (error && quests.length === 0) {
    el.innerHTML = `
      <div class="q3-page">
        <div class="q3-header">
          <h1 class="q3-title">Quests</h1>
          <p class="q3-subtitle">Save the World quest tracker</p>
        </div>
        <div class="q3-error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>${esc(error)}</span>
        </div>
        <button class="q3-retry-btn" id="q3-retry">Retry</button>
      </div>`;
    el.querySelector('#q3-retry')?.addEventListener('click', () => loadQuests());
    return;
  }

  // Group quests by category
  const grouped = new Map<string, QuestInfo[]>();
  for (const q of quests) {
    // Skip Outpost quests without rewards
    if (q.category === 'Outpost' && q.rewards.length === 0) continue;
    const arr = grouped.get(q.category) ?? [];
    arr.push(q);
    grouped.set(q.category, arr);
  }

  // Determine available categories
  const availableCats = CATEGORY_ORDER.filter(c => grouped.has(c));
  // Add any unknown categories at the end
  for (const cat of grouped.keys()) {
    if (!availableCats.includes(cat)) availableCats.push(cat);
  }

  // If no active category, pick first
  if (!activeCategory || !grouped.has(activeCategory)) {
    activeCategory = availableCats[0] || null;
  }

  // Stats
  const total = quests.length;
  let completedCount = 0;
  for (const q of quests) {
    let tc = 0, tm = 0, hm = false;
    for (const o of q.objectives) { if (o.max !== null) { tc += o.current; tm += o.max; hm = true; } }
    if (hm && tm > 0 && Math.round((tc / tm) * 100) >= 100) completedCount++;
  }

  const dailyCount = grouped.get('Daily')?.length ?? 0;

  // Build category tabs
  const tabsHtml = availableCats.map(cat => {
    const count = grouped.get(cat)?.length ?? 0;
    const label = CATEGORY_LABELS[cat] || cat;
    const icon = getCatIcon(cat);
    const active = cat === activeCategory ? 'q3-tab--active' : '';
    return `<button class="q3-tab ${active}" data-cat="${esc(cat)}" title="${esc(label)} (${count})">
      ${icon}<span class="q3-tab-label">${esc(label)}</span><span class="q3-tab-count">${count}</span>
    </button>`;
  }).join('');

  // Build quest list for active category
  const activeQuests = activeCategory ? (grouped.get(activeCategory) ?? []) : [];
  const questListHtml = activeQuests.map(q => renderQuest(q)).join('');

  const activeLabel = CATEGORY_LABELS[activeCategory || ''] || activeCategory || '';

  el.innerHTML = `
    <div class="q3-page">
      <div class="q3-header">
        <h1 class="q3-title">Quests</h1>
        <p class="q3-subtitle">Save the World quest tracker</p>
      </div>

      <div class="q3-stats-bar">
        <div class="q3-stat"><span class="q3-stat-num">${total}</span><span class="q3-stat-lbl">Active</span></div>
        <div class="q3-stat-sep"></div>
        <div class="q3-stat"><span class="q3-stat-num q3-stat--done">${completedCount}</span><span class="q3-stat-lbl">Completed</span></div>
        <div class="q3-stat-sep"></div>
        <div class="q3-stat"><span class="q3-stat-num">${total - completedCount}</span><span class="q3-stat-lbl">In Progress</span></div>
        ${dailyCount > 0 ? `
          <div class="q3-stat-sep"></div>
          <div class="q3-stat q3-stat--reroll">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            <span class="q3-stat-num">${dailyRerolls}</span>
            <span class="q3-stat-lbl">Rerolls</span>
          </div>
        ` : ''}
      </div>

      ${error ? `<div class="q3-error q3-error--inline">${esc(error)}</div>` : ''}

      <div class="q3-layout">
        <nav class="q3-tabs-nav">${tabsHtml}</nav>
        <div class="q3-content">
          <div class="q3-content-header">
            <span class="q3-content-title">${getCatIcon(activeCategory || '')} ${esc(activeLabel)}</span>
            <span class="q3-content-count">${activeQuests.length} quest${activeQuests.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="q3-quest-list">
            ${activeQuests.length === 0 ? '<div class="q3-empty">No quests in this category</div>' : questListHtml}
          </div>
        </div>
      </div>
    </div>`;

  bindEvents();
}

function renderQuest(q: QuestInfo): string {
  const isRerolling = rerolling === q.itemId;

  let totalCurrent = 0, totalMax = 0, hasKnownMax = false;
  for (const obj of q.objectives) {
    if (obj.max !== null) { totalCurrent += obj.current; totalMax += obj.max; hasKnownMax = true; }
  }
  const pct = hasKnownMax && totalMax > 0 ? Math.min(Math.round((totalCurrent / totalMax) * 100), 100) : null;
  const isComplete = pct !== null && pct >= 100;

  // Quest image — banner style (1024x200)
  const imgSrc = q.image ? `assets/quests/${q.image}` : null;
  const imgHtml = imgSrc
    ? `<img src="${esc(imgSrc)}" alt="" class="q3-quest-img" onerror="this.style.display='none'">`
    : `<div class="q3-quest-img q3-quest-img--placeholder">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>`;

  // Progress bar
  const progressHtml = pct !== null ? `
    <div class="q3-quest-progress">
      <div class="q3-quest-bar"><div class="q3-quest-bar-fill ${isComplete ? 'q3-quest-bar-fill--done' : ''}" style="width:${pct}%"></div></div>
      <span class="q3-quest-pct">${pct}%</span>
    </div>
  ` : '';

  // Objectives detail
  const objHtml = q.objectives.length > 0 ? `<div class="q3-quest-objs">${q.objectives.map(obj => {
    if (obj.max !== null) {
      return `<span class="q3-obj-detail">${obj.current}/${obj.max}</span>`;
    }
    return `<span class="q3-obj-detail">${obj.current}</span>`;
  }).join('')}</div>` : '';

  // Rewards — only show rewards that have an icon
  const visibleRewards = q.rewards.filter(r => r.icon);
  const rewardsHtml = visibleRewards.length > 0 ? `
    <div class="q3-quest-rewards">
      ${visibleRewards.map(r => {
        const iconHtml = `<img src="${esc(r.icon!)}" alt="" class="q3-reward-icon" onerror="this.parentElement.style.display='none'">`;
        const qty = r.quantity > 1 ? `<span class="q3-reward-qty">x${r.quantity}</span>` : '';
        return `<span class="q3-reward-pill" title="${esc(r.name)}${r.quantity > 1 ? ' x' + r.quantity : ''}">${iconHtml}${qty}</span>`;
      }).join('')}
    </div>` : '';

  // Reroll button
  const rerollHtml = q.canReroll ? `
    <button class="q3-reroll ${isRerolling ? 'q3-reroll--busy' : ''}"
            data-item-id="${esc(q.itemId)}" title="Reroll quest (${dailyRerolls} left)" ${isRerolling ? 'disabled' : ''}>
      ${isRerolling
        ? '<svg class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>'
      }
    </button>` : '';

  return `
    <div class="q3-quest ${isComplete ? 'q3-quest--done' : ''}">
      ${imgHtml}
      <div class="q3-quest-body">
        ${rerollHtml ? `<div class="q3-quest-top">${rerollHtml}</div>` : ''}
        ${progressHtml}
        ${objHtml}
        ${rewardsHtml}
      </div>
    </div>`;
}

function bindEvents(): void {
  if (!el) return;

  // Category tabs
  el.querySelectorAll('.q3-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = (btn as HTMLElement).dataset.cat || null;
      draw();
    });
  });

  // Reroll buttons
  el.querySelectorAll('.q3-reroll').forEach(btn => {
    btn.addEventListener('click', () => {
      const itemId = (btn as HTMLElement).dataset.itemId;
      if (itemId) handleReroll(itemId);
    });
  });
}

// ─── Event Listeners ──────────────────────────────────────────

function onAccountSwitched(): void {
  loadQuests();
}

// ─── Page Definition ──────────────────────────────────────────

export const questsPage: PageDefinition = {
  id: 'quests',
  label: 'Quests',
  icon: `<img src="assets/icons/fnui/Automated/quests.png" alt="Quests" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
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
