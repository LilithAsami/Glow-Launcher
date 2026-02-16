import type {
  PageDefinition,
  ZoneMissions,
  ProcessedMission,
  AlertRewardItem,
} from '../../shared/types';

let el: HTMLElement | null = null;
let zones: ZoneMissions[] = [];
let loading = true;
let error: string | null = null;
let hasAccount = false;
let activeTab: 'overview' | 'summary' = 'overview';

// ─── Shared world-info cache (renderer-side, UTC day) ────────

let _cachedZones: ZoneMissions[] | null = null;
let _cachedUTCDay: string | null = null;
let _fetchPromise: Promise<ZoneMissions[]> | null = null;

function utcDayKey(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
}

/** Pre-fetch world info at app startup so the home page loads instantly. */
export async function prefetchWorldInfo(): Promise<void> {
  try {
    const accs = await window.glowAPI.accounts.getAll();
    if (!accs?.accounts?.length) return;
    const today = utcDayKey();
    if (_cachedZones && _cachedUTCDay === today) return;
    if (!_fetchPromise) {
      _fetchPromise = window.glowAPI.alerts.getMissions();
      _fetchPromise.then((z) => {
        _cachedZones = z;
        _cachedUTCDay = today;
        _fetchPromise = null;
      }).catch(() => { _fetchPromise = null; });
    }
  } catch { /* ignore */ }
}

async function getCachedMissions(force = false): Promise<ZoneMissions[]> {
  const today = utcDayKey();
  if (!force && _cachedZones && _cachedUTCDay === today) return _cachedZones;
  if (!force && _fetchPromise) return _fetchPromise;
  const p = force
    ? window.glowAPI.alerts.getMissionsForce()
    : window.glowAPI.alerts.getMissions();
  _fetchPromise = p;
  const z = await p;
  _cachedZones = z;
  _cachedUTCDay = today;
  _fetchPromise = null;
  return z;
}

// ─── Category definitions ────────────────────────────────────

interface HomeCategory {
  id: string;
  title: string;
  icon: string;
  color: string;
  filter: (m: ProcessedMission) => boolean;
  rewardFilter?: (r: AlertRewardItem) => boolean;
}

// Reward filters
function isVBucks(r: AlertRewardItem): boolean {
  return r.itemType.toLowerCase().includes('currency_mtxswap');
}
function isSurvivorSR(r: AlertRewardItem): boolean {
  return r.itemType.toLowerCase().includes('worker:') && /_(sr)(?:_|$)/i.test(r.itemType);
}
function isHeroSR(r: AlertRewardItem): boolean {
  return r.itemType.toLowerCase().includes('hero:') && /_(sr)(?:_|$)/i.test(r.itemType);
}
function isSchematicSR(r: AlertRewardItem): boolean {
  return r.itemType.toLowerCase().includes('schematic:') && /_(sr)(?:_|$)/i.test(r.itemType);
}
function isDefenderSR(r: AlertRewardItem): boolean {
  return r.itemType.toLowerCase().includes('defender:') && /_(sr)(?:_|$)/i.test(r.itemType);
}
function isLlama(r: AlertRewardItem): boolean {
  const t = r.itemType.toLowerCase();
  // AccountResource llama vouchers
  if (t.includes('voucher_cardpack') || t.includes('voucher_basicpack')) return true;
  // Actual llama card packs (CardPack:cardpack_*), exclude zone packs (zcp_) and reagent packs
  if (t.startsWith('cardpack:cardpack_')) return true;
  // Name-based match
  if (r.name.toLowerCase().includes('llama')) return true;
  return false;
}

function hasRewardMatch(m: ProcessedMission, test: (r: AlertRewardItem) => boolean): boolean {
  return m.alerts.some(test) || m.rewards.some(test);
}

function getMatchingRewards(m: ProcessedMission, test: (r: AlertRewardItem) => boolean): AlertRewardItem[] {
  return [...m.alerts.filter(test), ...m.rewards.filter(test)];
}

// Order: vbucks, legendary survivors, pl160, llamas, legendary heroes, legendary defenders, legendary schematics
const CATEGORIES: HomeCategory[] = [
  {
    id: 'vbucks',
    title: 'V-Bucks',
    icon: 'assets/icons/stw/resources/currency_mtxswap.png',
    color: '#3b82f6',
    filter: (m) => m.zone === 'V-Bucks' || hasRewardMatch(m, isVBucks),
    rewardFilter: isVBucks,
  },
  {
    id: 'legendary-survivors',
    title: 'Legendary Survivors',
    icon: 'assets/icons/stw/resources/voucher_generic_worker_sr.png',
    color: '#f39c12',
    filter: (m) => hasRewardMatch(m, isSurvivorSR),
    rewardFilter: isSurvivorSR,
  },
  {
    id: 'pl-160',
    title: 'Power Level 160',
    icon: 'assets/icons/stw/difficulties/red-skull.png',
    color: '#e74c3c',
    filter: (m) => m.power === 160,
  },
  {
    id: 'llamas',
    title: 'Llama Missions',
    icon: 'assets/icons/stw/resources/voucher_cardpack_jackpot.png',
    color: '#9b59b6',
    filter: (m) => hasRewardMatch(m, isLlama),
    rewardFilter: isLlama,
  },
  {
    id: 'legendary-heroes',
    title: 'Legendary Heroes',
    icon: 'assets/icons/stw/resources/voucher_generic_hero_sr.png',
    color: '#f39c12',
    filter: (m) => hasRewardMatch(m, isHeroSR),
    rewardFilter: isHeroSR,
  },
  {
    id: 'legendary-defenders',
    title: 'Legendary Defenders',
    icon: 'assets/icons/stw/resources/voucher_generic_defender_sr.png',
    color: '#f39c12',
    filter: (m) => hasRewardMatch(m, isDefenderSR),
    rewardFilter: isDefenderSR,
  },
  {
    id: 'legendary-schematics',
    title: 'Legendary Schematics',
    icon: 'assets/icons/stw/resources/voucher_generic_ranged_sr.png',
    color: '#f39c12',
    filter: (m) => hasRewardMatch(m, isSchematicSR),
    rewardFilter: isSchematicSR,
  },
];

// ─── Zone badge ──────────────────────────────────────────────

function getZoneBadge(zone: string): string {
  const map: Record<string, { letter: string; cls: string }> = {
    'Twine Peaks': { letter: 'T', cls: 'alert-zone-badge-t' },
    'Canny Valley': { letter: 'C', cls: 'alert-zone-badge-c' },
    'Plankerton': { letter: 'P', cls: 'alert-zone-badge-p' },
    'Stonewood': { letter: 'S', cls: 'alert-zone-badge-s' },
  };
  const b = map[zone];
  if (b) return `<span class="alert-zone-badge ${b.cls}" title="${zone}">${b.letter}</span>`;
  if (zone === 'Ventures') return `<img src="assets/icons/stw/difficulties/ventures.png" alt="Ventures" title="Ventures" class="alert-zone-badge-img">`;
  if (zone === 'Events or Campaign') return `<img src="assets/icons/stw/world/quest.png" alt="Events" title="Events" class="alert-zone-badge-img">`;
  if (zone === 'V-Bucks') return `<img src="assets/icons/stw/resources/currency_mtxswap.png" alt="V-Bucks" title="V-Bucks" class="alert-zone-badge-img">`;
  return '';
}

// ─── Data ────────────────────────────────────────────────────

async function loadData(force = false): Promise<void> {
  loading = true;
  error = null;
  draw();

  try {
    const accountsData = await window.glowAPI.accounts.getAll();
    hasAccount = accountsData?.accounts?.length > 0;
    if (!hasAccount) {
      loading = false;
      draw();
      return;
    }
    zones = await getCachedMissions(force);
  } catch (err: any) {
    error = err?.message || 'Failed to load world info';
  }

  loading = false;
  draw();
}

// ─── Drawing ─────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  // No account — show welcome
  if (!loading && !error && !hasAccount) {
    el.innerHTML = `
      <div class="home-welcome">
        <div class="home-welcome-inner">
          <div class="home-logo-glow">
            <span class="home-logo-text">GLOW</span>
            <span class="home-logo-sub">LAUNCHER</span>
          </div>
          <p class="home-welcome-desc">Add an account to get started with Save the World mission alerts.</p>
          <div class="home-welcome-hint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            Click the account selector in the toolbar to add your Epic Games account
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Loading
  if (loading) {
    el.innerHTML = `
      <div class="home-loading">
        <div class="home-loading-inner">
          <div class="home-loader-ring">
            <div class="home-loader-glow"></div>
          </div>
          <div class="home-loader-brand">
            <span class="home-loader-text">GLOW</span>
            <span class="home-loader-sub">LAUNCHER</span>
          </div>
          <p class="home-loader-status">Loading world info...</p>
        </div>
      </div>
    `;
    return;
  }

  // Error
  if (error) {
    el.innerHTML = `
      <div class="home-loading">
        <div class="home-loading-inner">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" opacity="0.7">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <p style="color:var(--text-secondary); margin-top:12px;">${error}</p>
          <button class="btn btn-accent" id="home-retry">Retry</button>
        </div>
      </div>
    `;
    el.querySelector('#home-retry')?.addEventListener('click', () => loadData(true));
    return;
  }

  // Dashboard
  el.innerHTML = `
    <div class="home-dashboard">
      <div class="home-header">
        <div class="home-header-top">
          <h1 class="page-title">World Info</h1>
          <button class="btn btn-sm btn-accent" id="home-refresh" title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>
        <div class="home-tabs">
          <button class="home-tab ${activeTab === 'overview' ? 'home-tab-active' : ''}" data-tab="overview">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Overview
          </button>
          <button class="home-tab ${activeTab === 'summary' ? 'home-tab-active' : ''}" data-tab="summary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
            Rewards Summary
          </button>
        </div>
      </div>
      <div class="home-tab-content">
        ${activeTab === 'overview' ? renderOverview() : renderSummary()}
      </div>
    </div>
  `;

  bindEvents();
}

// ─── Overview tab ────────────────────────────────────────────

function renderOverview(): string {
  const allMissions = zones.flatMap((z) => z.missions);

  const sections = CATEGORIES.map((cat) => {
    const matches = allMissions.filter(cat.filter);
    return renderCategory(cat, matches);
  }).join('');

  return `<div class="home-categories">${sections}</div>`;
}

function renderCategory(cat: HomeCategory, missions: ProcessedMission[]): string {
  const missionRows = missions.length === 0
    ? '<div class="home-cat-empty">No missions found</div>'
    : missions.map((m) => renderHomeMission(m, cat)).join('');

  return `
    <div class="home-cat-section">
      <div class="home-cat-title-bar">
        <img src="${cat.icon}" alt="" class="home-cat-icon" onerror="this.style.display='none'">
        <span class="home-cat-title">${cat.title}</span>
        <span class="home-cat-badge" style="background:${cat.color}20; color:${cat.color}; border-color:${cat.color}40">${missions.length}</span>
      </div>
      <div class="home-cat-missions">
        ${missionRows}
      </div>
    </div>
  `;
}

function renderHomeMission(m: ProcessedMission, cat: HomeCategory): string {
  const matchedRewards = cat.rewardFilter ? getMatchingRewards(m, cat.rewardFilter) : [];
  const highlightPills = matchedRewards.map((r) => {
    const icon = r.icon ? `<img src="${r.icon}" alt="" class="alert-pill-icon" onerror="this.style.display='none'">` : '';
    const qty = r.quantity > 1 ? `<span class="alert-pill-qty">x${r.quantity}</span>` : '';
    return `<span class="alert-pill home-pill-highlight" title="${r.name}${r.quantity > 1 ? ' x' + r.quantity : ''}">${icon}${qty}</span>`;
  }).join('');

  const allRewards = [...m.alerts, ...m.rewards].filter((r) => r.icon);
  const otherPills = allRewards
    .filter((r) => !cat.rewardFilter || !cat.rewardFilter(r))
    .slice(0, 5)
    .map((r) => {
      const qty = r.quantity > 1 ? `<span class="alert-pill-qty">x${r.quantity}</span>` : '';
      return `<span class="alert-pill" title="${r.name}${r.quantity > 1 ? ' x' + r.quantity : ''}"><img src="${r.icon}" alt="" class="alert-pill-icon" onerror="this.style.display='none'">${qty}</span>`;
    }).join('');

  const modIcons = m.modifiers.slice(0, 4).map(
    (mod) => `<img src="${mod.icon}" alt="${mod.name}" title="${mod.name}" class="alert-mod-thumb" onerror="this.style.display='none'">`
  ).join('');

  // For V-Bucks missions, show the geographic zone instead of "V-Bucks" as the zone label
  const zoneLabel = m.zone === 'V-Bucks' ? m.zoneGeo : m.zone;
  const zoneBadge = m.zone === 'V-Bucks' ? getZoneBadge(m.zoneGeo) : getZoneBadge(m.zone);

  return `
    <div class="home-mission">
      <div class="home-mission-left">
        ${zoneBadge}
        <img src="${m.missionIcon}" alt="" class="alert-mission-icon" onerror="this.style.display='none'">
        <div class="home-mission-meta">
          <span class="home-mission-name">${m.missionName}</span>
          <div class="home-mission-tags">
            <span class="alert-power-badge">
              <img src="assets/icons/stw/power.png" alt="" class="alert-power-img" onerror="this.style.display='none'">
              ${m.power}
            </span>
            <span class="home-mission-zone">${zoneLabel}</span>
          </div>
        </div>
      </div>
      <div class="home-mission-right">
        <div class="alert-mod-thumbs">${modIcons}</div>
        <div class="alert-reward-pills">${highlightPills}${otherPills}</div>
      </div>
    </div>
  `;
}

// ─── Summary tab ─────────────────────────────────────────────

interface RewardSummaryItem {
  icon: string;
  name: string;
  total: number;
}

function renderSummary(): string {
  const allMissions = zones.flatMap((z) => z.missions);

  // Aggregate alert rewards only (not regular mission rewards)
  const rewardMap = new Map<string, RewardSummaryItem>();

  for (const m of allMissions) {
    for (const r of m.alerts) {
      if (!r.icon) continue;
      const key = r.icon;
      const existing = rewardMap.get(key);
      if (existing) {
        existing.total += r.quantity;
      } else {
        rewardMap.set(key, { icon: r.icon, name: r.name, total: r.quantity });
      }
    }
  }

  // Sort by total descending, then by name
  const items = Array.from(rewardMap.values()).sort((a, b) => {
    // V-Bucks first
    if (a.name.toLowerCase().includes('pavo') || a.name.toLowerCase().includes('v-buck') || a.icon.includes('mtxswap')) return -1;
    if (b.name.toLowerCase().includes('pavo') || b.name.toLowerCase().includes('v-buck') || b.icon.includes('mtxswap')) return 1;
    return b.total - a.total;
  });

  if (items.length === 0) {
    return '<div class="home-summary-empty">No alert rewards available</div>';
  }

  const grid = items.map((item) => `
    <div class="home-reward-cell" title="${item.name}">
      <img src="${item.icon}" alt="" class="home-reward-icon" onerror="this.style.display='none'">
      <span class="home-reward-qty">${formatNumber(item.total)}</span>
    </div>
  `).join('');

  return `
    <div class="home-summary">
      <h2 class="home-summary-title">Rewards Summary</h2>
      <p class="home-summary-desc">Total alert rewards available today</p>
      <div class="home-reward-grid">
        ${grid}
      </div>
    </div>
  `;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return n.toLocaleString('en-US');
  return String(n);
}

// ─── Events ──────────────────────────────────────────────────

function bindEvents(): void {
  // Refresh
  el?.querySelector('#home-refresh')?.addEventListener('click', () => {
    loadData(true);
  });

  // Tab switching
  el?.querySelectorAll('.home-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab as 'overview' | 'summary';
      if (tab && tab !== activeTab) {
        activeTab = tab;
        draw();
      }
    });
  });

  // Account changes
  window.glowAPI.accounts.onDataChanged(() => {
    _cachedZones = null;
    _cachedUTCDay = null;
    loadData();
  });
}

// ─── Page Definition ─────────────────────────────────────────

export const homePage: PageDefinition = {
  id: 'home',
  label: 'Home',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>`,
  order: 10,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    loading = true;
    error = null;
    hasAccount = false;
    await loadData();
  },

  cleanup(): void {
    el = null;
  },
};
