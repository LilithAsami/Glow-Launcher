import type {
  PageDefinition,
  ZoneMissions,
  ProcessedMission,
  AlertRewardItem,
} from '../../shared/types';
import { copyMissionToClipboard } from '../utils/missionScreenshot';

let el: HTMLElement | null = null;
let zones: ZoneMissions[] = [];
let loading = true;
let error: string | null = null;
let hasAccount = false;
let activeTab: 'overview' | 'summary' = 'overview';
let doneAlertIds: Set<string> = new Set();
let countdownInterval: ReturnType<typeof setInterval> | null = null;

function getNextRefreshStr(): string {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = midnight.getTime() - now.getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startCountdown(): void {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const span = el?.querySelector<HTMLElement>('#home-next-refresh-value');
    if (span) span.textContent = getNextRefreshStr();
  }, 1_000);
}

// ─── Filter state ───────────────────────────────────────────
let showFilters = false;
let filterZones: Set<string> = new Set();
let filterMinPower = 0;
let filterMaxPower = 0;
let filterRewardIcons: Set<string> = new Set();
let filterStatus: 'all' | 'done' | 'todo' = 'all';
let filterMissionTypes: Set<string> = new Set();

function hasActiveFilters(): boolean {
  return filterZones.size > 0 || filterMinPower > 0 || filterMaxPower > 0 || filterRewardIcons.size > 0 || filterStatus !== 'all' || filterMissionTypes.size > 0;
}
function countActiveFilters(): number {
  return [filterZones.size > 0, filterMinPower > 0, filterMaxPower > 0, filterRewardIcons.size > 0, filterStatus !== 'all', filterMissionTypes.size > 0].filter(Boolean).length;
}
function clearAllFilters(): void {
  filterZones = new Set();
  filterMinPower = 0;
  filterMaxPower = 0;
  filterRewardIcons = new Set();
  filterStatus = 'all';
  filterMissionTypes = new Set();
}

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
    loading = false;
    draw();
    return;
  }

  loading = false;
  draw();

  // Fetch completed alerts in background (non-blocking)
  try {
    const completed = await window.glowAPI.alerts.getCompleted();
    if (completed?.success && completed.claimData) {
      doneAlertIds = new Set(completed.claimData.map((c) => c.missionAlertId));
      draw();
    }
  } catch {
    // ignore — done indicators are optional
  }
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
          <div class="home-header-right">
            <div class="home-next-refresh" title="Time until daily reset (00:00 UTC)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span id="home-next-refresh-value">${getNextRefreshStr()}</span>
            </div>
            <button class="home-refresh-btn" id="home-refresh" title="Refresh">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>
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

function isMissionDone(m: ProcessedMission): boolean {
  if (doneAlertIds.size === 0) return false;
  return m.alertGuids.some((guid) => doneAlertIds.has(guid));
}

function getFilteredMissions(missions: ProcessedMission[]): ProcessedMission[] {
  let result = missions;
  if (filterZones.size > 0) {
    result = result.filter((m) => filterZones.has(m.zone) || filterZones.has(m.zoneGeo));
  }
  if (filterMinPower > 0) result = result.filter((m) => m.power >= filterMinPower);
  if (filterMaxPower > 0) result = result.filter((m) => m.power <= filterMaxPower);
  if (filterRewardIcons.size > 0) {
    result = result.filter((m) => [...m.alerts, ...m.rewards].some((r) => r.icon && filterRewardIcons.has(r.icon)));
  }
  if (filterStatus === 'todo') result = result.filter((m) => !isMissionDone(m));
  if (filterMissionTypes.size > 0) result = result.filter((m) => filterMissionTypes.has(m.missionName));
  return result;
}

const ZONE_LABELS: Record<string, string> = {
  'Twine Peaks': 'Twine', 'Canny Valley': 'Canny', 'Plankerton': 'Plant.',
  'Stonewood': 'Stone', 'Ventures': 'Vent.', 'Events or Campaign': 'Events',
};

// Priority sorter for reward filter pills
function rewardSortPriority(icon: string): number {
  const ic = icon.toLowerCase();
  // V-Bucks
  if (ic.includes('currency_mtxswap')) return 5;
  // Event Gold
  if (ic.includes('eventcurrency_scaling') || ic.includes('eventscaling')) return 8;
  // Perk-UP (by rarity)
  if (ic.includes('reagent_alteration_upgrade_sr')) return 10;
  if (ic.includes('reagent_alteration_upgrade_vr')) return 11;
  if (ic.includes('reagent_alteration_upgrade_r')) return 12;
  if (ic.includes('reagent_alteration_upgrade_uc')) return 13;
  if (ic.includes('reagent_alteration_upgrade')) return 14;
  // Re-Perk!
  if (ic.includes('reagent_alteration_generic')) return 20;
  // Elemental alterations
  if (ic.includes('reagent_alteration_ele')) return 22;
  if (ic.includes('reagent_alteration_gameplay')) return 23;
  // Hero vouchers (by rarity)
  if (ic.includes('voucher_generic_hero_sr')) return 30;
  if (ic.includes('voucher_generic_hero_vr')) return 31;
  if (ic.includes('voucher_generic_hero')) return 32;
  // Survivor / Lead survivor
  if (ic.includes('voucher_generic_manager_sr')) return 40;
  if (ic.includes('voucher_generic_manager')) return 41;
  if (ic.includes('voucher_generic_worker_sr')) return 42;
  if (ic.includes('voucher_generic_worker')) return 43;
  // Defenders
  if (ic.includes('voucher_generic_defender_sr')) return 50;
  if (ic.includes('voucher_generic_defender')) return 51;
  // Schematics
  if (ic.includes('voucher_generic_ranged_sr')) return 60;
  if (ic.includes('voucher_generic_ranged')) return 61;
  if (ic.includes('voucher_generic_melee_sr')) return 62;
  if (ic.includes('voucher_generic_melee')) return 63;
  if (ic.includes('voucher_generic_trap_sr')) return 64;
  if (ic.includes('voucher_generic_trap')) return 65;
  // Llamas
  if (ic.includes('voucher_cardpack_jackpot')) return 70;
  if (ic.includes('voucher_cardpack')) return 71;
  if (ic.includes('voucher_basicpack')) return 72;
  if (ic.includes('currency_xrayllama')) return 73;
  // Evolution mats (t01=Pure Drop, t02=Lightning, t03=Eye, t04=Storm Shard)
  if (ic.includes('reagent_c_t01')) return 80;
  if (ic.includes('reagent_c_t02')) return 81;
  if (ic.includes('reagent_c_t03')) return 82;
  if (ic.includes('reagent_c_t04')) return 83;
  // Ingredients (ores)
  if (ic.includes('brightcore') || ic.includes('sunbeam')) return 88;
  if (ic.includes('obsidian') || ic.includes('shadowshard')) return 89;
  if (ic.includes('malachite') || ic.includes('silver') || ic.includes('copper')) return 90;
  if (ic.includes('reagent_people') || ic.includes('reagent_weapons') || ic.includes('reagent_traps')) return 92;
  // XP
  if (ic.includes('heroxp') || ic.includes('personnelxp') || ic.includes('schematicxp') || ic.includes('phoenixxp')) return 95;
  // Event currencies
  if (ic.includes('eventcurrency')) return 97;
  return 99;
}

function renderFilterPanel(allMissions: ProcessedMission[]): string {
  const zonesPresent = [...new Set(allMissions.map((m) => m.zone))];
  const orderedZones = ['Twine Peaks', 'Canny Valley', 'Plankerton', 'Stonewood', 'Ventures', 'Events or Campaign']
    .filter((z) => zonesPresent.includes(z));

  const rewardMap = new Map<string, { icon: string; name: string }>();
  for (const m of allMissions) {
    for (const r of [...m.alerts, ...m.rewards]) {
      if (r.icon && !rewardMap.has(r.icon)) rewardMap.set(r.icon, { icon: r.icon, name: r.name });
    }
  }
  const rewards = [...rewardMap.values()].sort((a, b) => rewardSortPriority(a.icon) - rewardSortPriority(b.icon));

  const powers = allMissions.map((m) => m.power).filter((p) => p > 0);
  const minPow = powers.length ? Math.min(...powers) : 0;
  const maxPow = powers.length ? Math.max(...powers) : 160;

  const missionTypeMap = new Map<string, string>();
  for (const m of allMissions) {
    if (m.zone !== 'Events or Campaign' && !missionTypeMap.has(m.missionName)) missionTypeMap.set(m.missionName, m.missionIcon);
  }
  const missionTypes = [...missionTypeMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return `
    <div class="home-filters-panel">
      <div class="home-filter-row">
        <span class="home-filter-label">Zone</span>
        <div class="home-filter-pills">
          ${orderedZones.map((z) => `
            <button class="home-filter-pill${filterZones.has(z) ? ' active' : ''}" data-fzone="${z}" title="${z}">${ZONE_LABELS[z] ?? z}</button>
          `).join('')}
        </div>
      </div>
      <div class="home-filter-row">
        <span class="home-filter-label">Power</span>
        <div class="home-filter-power-row">
          <span class="home-filter-power-label">Min</span>
          <input type="number" class="home-filter-power-input" id="home-fpow-min" min="${minPow}" max="${maxPow}" value="${filterMinPower > 0 ? filterMinPower : ''}" placeholder="${minPow}">
          <span class="home-filter-power-label">Max</span>
          <input type="number" class="home-filter-power-input" id="home-fpow-max" min="${minPow}" max="${maxPow}" value="${filterMaxPower > 0 ? filterMaxPower : ''}" placeholder="${maxPow}">
        </div>
      </div>
      <div class="home-filter-row">
        <span class="home-filter-label">Rewards</span>
        <div class="home-filter-pills home-filter-pills-rewards">
          ${rewards.map((r) => `
            <button class="home-filter-reward-pill${filterRewardIcons.has(r.icon) ? ' active' : ''}" data-freward="${r.icon}" title="${r.name}">
              <img src="${r.icon}" alt="">
            </button>
          `).join('')}
        </div>
      </div>
      <div class="home-filter-row">
        <span class="home-filter-label">Mission</span>
        <div class="home-filter-pills home-filter-pills-missions">
          ${missionTypes.map(([name, icon]) => `
            <button class="home-filter-mission-pill${filterMissionTypes.has(name) ? ' active' : ''}" data-fmission="${name}" title="${name}">
              <img src="${icon}" alt="">
              <span>${name}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="home-filter-row home-filter-row-bottom">
        <span class="home-filter-label">Status</span>
        <div class="home-filter-status-group">
          <button class="home-filter-status${filterStatus === 'all' ? ' active' : ''}" data-fstatus="all">All</button>
          <button class="home-filter-status${filterStatus === 'done' ? ' active' : ''}" data-fstatus="done">✓ Done</button>
          <button class="home-filter-status${filterStatus === 'todo' ? ' active' : ''}" data-fstatus="todo">◎ To Do</button>
        </div>
        <button class="home-filter-clear" id="home-filter-clear">Clear All</button>
      </div>
    </div>
  `;
}

function renderDoneList(allMissions: ProcessedMission[]): string {
  // Deduplicate by id (a mission may appear in multiple categories)
  const seen = new Set<string>();
  const doneMissions: ProcessedMission[] = [];
  for (const m of allMissions) {
    if (!seen.has(m.id) && isMissionDone(m)) {
      seen.add(m.id);
      doneMissions.push(m);
    }
  }
  // Apply remaining active filters (zone, power, reward icons) but NOT status
  let filtered = doneMissions;
  if (filterZones.size > 0) filtered = filtered.filter((m) => filterZones.has(m.zone) || filterZones.has(m.zoneGeo));
  if (filterMinPower > 0) filtered = filtered.filter((m) => m.power >= filterMinPower);
  if (filterMaxPower > 0) filtered = filtered.filter((m) => m.power <= filterMaxPower);
  if (filterRewardIcons.size > 0) {
    filtered = filtered.filter((m) => [...m.alerts, ...m.rewards].some((r) => r.icon && filterRewardIcons.has(r.icon)));
  }
  if (filterMissionTypes.size > 0) filtered = filtered.filter((m) => filterMissionTypes.has(m.missionName));

  if (filtered.length === 0) {
    return `<div class="home-cat-empty" style="padding:24px 0;text-align:center">${doneAlertIds.size === 0 ? 'Loading completed missions data…' : 'No completed missions found today'}</div>`;
  }

  const rows = filtered.map((m) => {
    const fakecat: HomeCategory = { id: 'done', title: '', icon: '', color: '', filter: () => true };
    return renderHomeMission(m, fakecat);
  }).join('');

  return `
    <div class="home-cat-section">
      <div class="home-cat-title-bar">
        <span style="font-size:15px">&#10003;</span>
        <span class="home-cat-title">Completed Today</span>
        <span class="home-cat-badge" style="background:#22c55e20;color:#22c55e;border-color:#22c55e40">${filtered.length}</span>
      </div>
      <div class="home-cat-missions">${rows}</div>
    </div>
  `;
}

function renderOverview(): string {
  const allMissions = zones.flatMap((z) => z.missions);
  const activeCount = countActiveFilters();

  let content: string;
  if (filterStatus === 'done') {
    // Show flat unfiltered-by-category list of all completed missions
    content = `<div class="home-categories">${renderDoneList(allMissions)}</div>`;
  } else {
    const sections = CATEGORIES.map((cat) => {
      const catMissions = allMissions.filter(cat.filter);
      const filtered = getFilteredMissions(catMissions);
      return renderCategory(cat, filtered);
    }).join('');
    content = `<div class="home-categories">${sections}</div>`;
  }

  return `
    <div class="home-filter-bar">
      <button class="home-filter-toggle${showFilters ? ' active' : ''}" id="home-filter-toggle">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        Filters${activeCount > 0 ? ` <span class="home-filter-badge">${activeCount}</span>` : ''}
      </button>
    </div>
    ${showFilters ? renderFilterPanel(allMissions) : ''}
    ${content}
  `;
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
  // Aggregate highlight rewards by icon path
  const highlightGrouped = new Map<string, { r: typeof matchedRewards[0]; total: number }>();
  for (const r of matchedRewards.filter((r) => r.icon)) {
    const ex = highlightGrouped.get(r.icon!);
    if (ex) ex.total += r.quantity;
    else highlightGrouped.set(r.icon!, { r, total: r.quantity });
  }
  const highlightPills = [...highlightGrouped.values()].map(({ r, total }) => {
    const icon = `<img src="${r.icon}" alt="" class="alert-pill-icon" onerror="this.style.display='none'">`;
    const qty = total > 1 ? `<span class="alert-pill-qty">x${total}</span>` : '';
    return `<span class="alert-pill home-pill-highlight" title="${r.name}${total > 1 ? ' x' + total : ''}">${icon}${qty}</span>`;
  }).join('');

  const allRewards = [...m.alerts, ...m.rewards].filter((r) => r.icon);
  // Aggregate other rewards by icon path
  const otherGrouped = new Map<string, { r: typeof allRewards[0]; total: number }>();
  for (const r of allRewards.filter((r) => !cat.rewardFilter || !cat.rewardFilter(r))) {
    const ex = otherGrouped.get(r.icon!);
    if (ex) ex.total += r.quantity;
    else otherGrouped.set(r.icon!, { r, total: r.quantity });
  }
  const otherPills = [...otherGrouped.values()].slice(0, 5).map(({ r, total }) => {
    const qty = total > 1 ? `<span class="alert-pill-qty">x${total}</span>` : '';
    return `<span class="alert-pill" title="${r.name}${total > 1 ? ' x' + total : ''}"><img src="${r.icon}" alt="" class="alert-pill-icon" onerror="this.style.display='none'">${qty}</span>`;
  }).join('');

  const modIcons = m.modifiers.slice(0, 4).map(
    (mod) => `<img src="${mod.icon}" alt="${mod.name}" title="${mod.name}" class="alert-mod-thumb" onerror="this.style.display='none'">`
  ).join('');

  // For V-Bucks missions, show the geographic zone instead of "V-Bucks" as the zone label
  const zoneLabel = m.zone === 'V-Bucks' ? m.zoneGeo : m.zone;
  const zoneBadge = m.zone === 'V-Bucks' ? getZoneBadge(m.zoneGeo) : getZoneBadge(m.zone);

  return `
    <div class="home-mission${isMissionDone(m) ? ' mission-done-row' : ''}">
      <div class="home-mission-left">
        ${isMissionDone(m) ? '<span class="mission-done-dot" title="Already completed today"></span>' : ''}
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
        <button class="mission-copy-btn" data-mission-copy="${m.id}" title="Copy to clipboard">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
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
  // Mission copy-to-clipboard buttons
  el?.querySelectorAll<HTMLButtonElement>('[data-mission-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mid = btn.dataset.missionCopy!;
      const m = zones.flatMap((z) => z.missions).find((x) => x.id === mid);
      if (!m) return;
      const prev = btn.innerHTML;
      btn.disabled = true;
      try {
        await copyMissionToClipboard(m);
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => { btn.innerHTML = prev; btn.disabled = false; }, 1600);
      } catch {
        btn.disabled = false;
      }
    });
  });

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

  // ── Filter toggle ────────────────────────────────────
  el?.querySelector('#home-filter-toggle')?.addEventListener('click', () => {
    showFilters = !showFilters;
    draw();
  });

  // Zone filter pills
  el?.querySelectorAll<HTMLElement>('[data-fzone]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const z = btn.dataset.fzone!;
      if (filterZones.has(z)) filterZones.delete(z);
      else filterZones.add(z);
      draw();
    });
  });

  // Status filter
  el?.querySelectorAll<HTMLElement>('[data-fstatus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterStatus = btn.dataset.fstatus as 'all' | 'done' | 'todo';
      draw();
    });
  });

  // Reward icon filter pills
  el?.querySelectorAll<HTMLElement>('[data-freward]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const icon = btn.dataset.freward!;
      if (filterRewardIcons.has(icon)) filterRewardIcons.delete(icon);
      else filterRewardIcons.add(icon);
      draw();
    });
  });

  // Mission type filter pills
  el?.querySelectorAll<HTMLElement>('[data-fmission]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.fmission!;
      if (filterMissionTypes.has(name)) filterMissionTypes.delete(name);
      else filterMissionTypes.add(name);
      draw();
    });
  });

  // Power inputs (debounced)
  let powerTimer: ReturnType<typeof setTimeout> | null = null;
  const onPowerInput = () => {
    if (powerTimer) clearTimeout(powerTimer);
    powerTimer = setTimeout(() => {
      const minEl = el?.querySelector<HTMLInputElement>('#home-fpow-min');
      const maxEl = el?.querySelector<HTMLInputElement>('#home-fpow-max');
      filterMinPower = parseInt(minEl?.value || '0') || 0;
      filterMaxPower = parseInt(maxEl?.value || '0') || 0;
      draw();
    }, 400);
  };
  el?.querySelector('#home-fpow-min')?.addEventListener('input', onPowerInput);
  el?.querySelector('#home-fpow-max')?.addEventListener('input', onPowerInput);

  // Clear all filters
  el?.querySelector('#home-filter-clear')?.addEventListener('click', () => {
    clearAllFilters();
    draw();
  });

  // Account changes
  window.glowAPI.accounts.onDataChanged(() => {
    _cachedZones = null;
    _cachedUTCDay = null;
    loadData();
  });

  startCountdown();
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
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    el = null;
  },
};
