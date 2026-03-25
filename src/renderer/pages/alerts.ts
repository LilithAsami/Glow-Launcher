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
let expandedZones: Set<string> = new Set();
let expandedMissions: Set<string> = new Set();
let showBg = false;
let customBgPath = '';
let doneAlertIds: Set<string> = new Set();

// ─── Filter state ───────────────────────────────────────────
let showFilters = false;
let filterZones: Set<string> = new Set();
let filterMinPower = 0;
let filterMaxPower = 0;
let filterRewardIcons: Set<string> = new Set();
let filterStatus: 'all' | 'done' | 'todo' = 'all';
let filterMissionTypes: Set<string> = new Set();

const alertsBgDiv = () => {
  if (!showBg) return '';
  if (customBgPath) return `<div class="alerts-bg" style="background: url('glow-bg://load/${customBgPath.replace(/\\/g, '/')}') center / cover no-repeat, linear-gradient(135deg, #0d0d1a 0%, #1a1030 40%, #0d0d1a 100%)"></div>`;
  return '<div class="alerts-bg"></div>';
};

// ─── Filter helpers ──────────────────────────────────────────

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
function getFilteredMissions(): ProcessedMission[] {
  let result = zones.flatMap((z) => z.missions);
  if (filterZones.size > 0) result = result.filter((m) => filterZones.has(m.zone) || filterZones.has(m.zoneGeo));
  if (filterMinPower > 0) result = result.filter((m) => m.power >= filterMinPower);
  if (filterMaxPower > 0) result = result.filter((m) => m.power <= filterMaxPower);
  if (filterRewardIcons.size > 0) result = result.filter((m) => [...m.alerts, ...m.rewards].some((r) => r.icon && filterRewardIcons.has(r.icon)));
  if (filterStatus === 'todo') result = result.filter((m) => !isMissionDone(m));
  if (filterStatus === 'done') result = result.filter((m) => isMissionDone(m));
  if (filterMissionTypes.size > 0) result = result.filter((m) => filterMissionTypes.has(m.missionName));
  return result;
}

// ─── Data Fetching ───────────────────────────────────────────

async function loadAlerts(): Promise<void> {
  loading = true;
  error = null;
  draw();

  try {
    zones = await window.glowAPI.alerts.getMissions();
  } catch (err: any) {
    error = err?.message || 'Failed to load mission alerts';
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
      doneAlertIds = new Set((completed.claimData as Array<{ missionAlertId: string }>).map((c) => c.missionAlertId));
      draw();
    }
  } catch {
    // ignore — done indicators are optional
  }
}

// ─── Filter Panel ─────────────────────────────────────────────

const ALERTS_ZONE_LABELS: Record<string, string> = {
  'Twine Peaks': 'Twine', 'Canny Valley': 'Canny', 'Plankerton': 'Plant.',
  'Stonewood': 'Stone', 'Ventures': 'Vent.', 'Events or Campaign': 'Events',
};

function alertsRewardSortPriority(icon: string): number {
  const ic = icon.toLowerCase();
  if (ic.includes('currency_mtxswap')) return 5;
  if (ic.includes('eventcurrency_scaling') || ic.includes('eventscaling')) return 8;
  if (ic.includes('reagent_alteration_upgrade_sr')) return 10;
  if (ic.includes('reagent_alteration_upgrade_vr')) return 11;
  if (ic.includes('reagent_alteration_upgrade_r')) return 12;
  if (ic.includes('reagent_alteration_upgrade_uc')) return 13;
  if (ic.includes('reagent_alteration_upgrade')) return 14;
  if (ic.includes('reagent_alteration_generic')) return 20;
  if (ic.includes('reagent_alteration_ele')) return 22;
  if (ic.includes('reagent_alteration_gameplay')) return 23;
  if (ic.includes('voucher_generic_hero_sr')) return 30;
  if (ic.includes('voucher_generic_hero_vr')) return 31;
  if (ic.includes('voucher_generic_hero')) return 32;
  if (ic.includes('voucher_generic_manager_sr')) return 40;
  if (ic.includes('voucher_generic_manager')) return 41;
  if (ic.includes('voucher_generic_worker_sr')) return 42;
  if (ic.includes('voucher_generic_worker')) return 43;
  if (ic.includes('voucher_generic_defender_sr')) return 50;
  if (ic.includes('voucher_generic_defender')) return 51;
  if (ic.includes('voucher_generic_ranged_sr')) return 60;
  if (ic.includes('voucher_generic_ranged')) return 61;
  if (ic.includes('voucher_generic_melee_sr')) return 62;
  if (ic.includes('voucher_generic_melee')) return 63;
  if (ic.includes('voucher_generic_trap_sr')) return 64;
  if (ic.includes('voucher_generic_trap')) return 65;
  if (ic.includes('voucher_cardpack_jackpot')) return 70;
  if (ic.includes('voucher_cardpack')) return 71;
  if (ic.includes('voucher_basicpack')) return 72;
  if (ic.includes('currency_xrayllama')) return 73;
  if (ic.includes('reagent_c_t01')) return 80;
  if (ic.includes('reagent_c_t02')) return 81;
  if (ic.includes('reagent_c_t03')) return 82;
  if (ic.includes('reagent_c_t04')) return 83;
  if (ic.includes('brightcore') || ic.includes('sunbeam')) return 88;
  if (ic.includes('obsidian') || ic.includes('shadowshard')) return 89;
  if (ic.includes('malachite') || ic.includes('silver') || ic.includes('copper')) return 90;
  if (ic.includes('reagent_people') || ic.includes('reagent_weapons') || ic.includes('reagent_traps')) return 92;
  if (ic.includes('heroxp') || ic.includes('personnelxp') || ic.includes('schematicxp') || ic.includes('phoenixxp')) return 95;
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
  const rewards = [...rewardMap.values()].sort((a, b) => alertsRewardSortPriority(a.icon) - alertsRewardSortPriority(b.icon));

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
            <button class="home-filter-pill${filterZones.has(z) ? ' active' : ''}" data-fzone="${z}" title="${z}">${ALERTS_ZONE_LABELS[z] ?? z}</button>
          `).join('')}
        </div>
      </div>
      <div class="home-filter-row">
        <span class="home-filter-label">Power</span>
        <div class="home-filter-power-row">
          <span class="home-filter-power-label">Min</span>
          <input type="number" class="home-filter-power-input" id="alerts-fpow-min" min="${minPow}" max="${maxPow}" value="${filterMinPower > 0 ? filterMinPower : ''}" placeholder="${minPow}">
          <span class="home-filter-power-label">Max</span>
          <input type="number" class="home-filter-power-input" id="alerts-fpow-max" min="${minPow}" max="${maxPow}" value="${filterMaxPower > 0 ? filterMaxPower : ''}" placeholder="${maxPow}">
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
        <button class="home-filter-clear" id="alerts-filter-clear">Clear All</button>
      </div>
    </div>
  `;
}

// ─── Drawing ─────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading) {
    el.innerHTML = `
      <div class="page-alerts">
        ${alertsBgDiv()}
        <div class="alerts-header">
          <h1 class="page-title">Alerts</h1>
          <p class="page-subtitle">Save the World mission alerts &amp; rewards</p>
        </div>
        <div class="alerts-loading">
          <div class="alerts-spinner"></div>
          <p>Fetching world info...</p>
        </div>
      </div>
    `;
    return;
  }

  if (error) {
    el.innerHTML = `
      <div class="page-alerts">
        ${alertsBgDiv()}
        <div class="alerts-header">
          <h1 class="page-title">Alerts</h1>
          <p class="page-subtitle">Save the World mission alerts &amp; rewards</p>
        </div>
        <div class="alerts-error-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <p>${error}</p>
          <button class="btn btn-accent" id="alerts-retry">Retry</button>
        </div>
      </div>
    `;
    el.querySelector('#alerts-retry')?.addEventListener('click', loadAlerts);
    return;
  }

  // Count totals
  const totalMissions = zones.reduce((sum, z) => sum + z.missions.length, 0);
  const totalAlerts = zones.reduce(
    (sum, z) => sum + z.missions.filter((m) => m.hasAlerts).length,
    0,
  );

  const allMissions = zones.flatMap((z) => z.missions);
  const activeFilterCount = countActiveFilters();
  const filtered = hasActiveFilters() ? getFilteredMissions() : [];
  const zonesContent = hasActiveFilters()
    ? (filtered.length === 0
        ? '<div class="home-cat-empty" style="padding:32px;text-align:center;color:var(--text-muted)">No missions match the active filters</div>'
        : filtered.map(renderMission).join(''))
    : zones.map(renderZone).join('');

  el.innerHTML = `
    <div class="page-alerts">
      ${alertsBgDiv()}
      <div class="alerts-header">
        <h1 class="page-title">Alerts</h1>
        <p class="page-subtitle">Save the World mission alerts &amp; rewards</p>
        <div class="alerts-stats">
          <span class="alerts-stat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${totalMissions} missions
          </span>
          <span class="alerts-stat alerts-stat-alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            ${totalAlerts} alerts
          </span>
        </div>
      </div>
      <div class="home-filter-bar" style="padding:0 16px 8px">
        <button class="home-filter-toggle${showFilters ? ' active' : ''}" id="alerts-filter-toggle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Filters${activeFilterCount > 0 ? ` <span class="home-filter-badge">${activeFilterCount}</span>` : ''}
        </button>
      </div>
      ${showFilters ? renderFilterPanel(allMissions) : ''}
      <div class="alerts-zones">
        ${zonesContent}
      </div>
    </div>
  `;

  bindEvents();
}

// ─── Zone Renderer ───────────────────────────────────────────

function renderZone(zoneData: ZoneMissions): string {
  const isExpanded = expandedZones.has(zoneData.zone);
  const alertCount = zoneData.missions.filter((m) => m.hasAlerts).length;

  return `
    <div class="alert-zone ${isExpanded ? 'alert-zone-open' : ''}" data-zone="${zoneData.zone}">
      <div class="alert-zone-header" data-zone-toggle="${zoneData.zone}">
        <div class="alert-zone-left">
          <img src="${zoneData.icon}" alt="" class="alert-zone-icon" onerror="this.style.display='none'">
          <div class="alert-zone-info">
            <span class="alert-zone-name">${zoneData.zone}</span>
            <span class="alert-zone-count">${zoneData.missions.length} missions${alertCount > 0 ? ` · ${alertCount} alerts` : ''}</span>
          </div>
        </div>
        <svg class="alert-zone-arrow ${isExpanded ? 'alert-zone-arrow-open' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="alert-zone-body" style="display:${isExpanded ? 'block' : 'none'}">
        ${zoneData.missions.map(renderMission).join('')}
      </div>
    </div>
  `;
}

// ─── Zone Badge Helper ───────────────────────────────────────

function isMissionDone(m: ProcessedMission): boolean {
  if (doneAlertIds.size === 0) return false;
  return m.alertGuids.some((guid) => doneAlertIds.has(guid));
}

function getZoneBadge(zone: string): string {
  const ZONE_BADGE_MAP: Record<string, { letter: string; cls: string }> = {
    'Twine Peaks': { letter: 'T', cls: 'alert-zone-badge-t' },
    'Canny Valley': { letter: 'C', cls: 'alert-zone-badge-c' },
    'Plankerton': { letter: 'P', cls: 'alert-zone-badge-p' },
    'Stonewood': { letter: 'S', cls: 'alert-zone-badge-s' },
  };

  const badge = ZONE_BADGE_MAP[zone];
  if (badge) {
    return `<span class="alert-zone-badge ${badge.cls}" title="${zone}">${badge.letter}</span>`;
  }
  // Icon-based badges for special zones
  if (zone === 'Ventures') {
    return `<img src="assets/icons/stw/difficulties/ventures.png" alt="Ventures" title="Ventures" class="alert-zone-badge-img" onerror="this.style.display='none'">`;
  }
  if (zone === 'Events or Campaign') {
    return `<img src="assets/icons/stw/world/quest.png" alt="Events" title="Events or Campaign" class="alert-zone-badge-img" onerror="this.style.display='none'">`;
  }
  if (zone === 'V-Bucks') {
    return `<img src="assets/icons/stw/resources/currency_mtxswap.png" alt="V-Bucks" title="V-Bucks" class="alert-zone-badge-img" onerror="this.style.display='none'">`;
  }
  return '';
}

// ─── Mission Renderer ────────────────────────────────────────

function renderMission(m: ProcessedMission): string {
  const isExpanded = expandedMissions.has(m.id);
  const modIconsHTML = m.modifiers
    .slice(0, 8)
    .map(
      (mod) =>
        `<img src="${mod.icon}" alt="${mod.name}" title="${mod.name}" class="alert-mod-thumb" onerror="this.style.display='none'">`,
    )
    .join('');

  // Zone badge (colored letter or icon)
  const zoneBadge = getZoneBadge(m.zone);

  return `
    <div class="alert-mission ${m.hasAlerts ? 'alert-mission-has' : 'alert-mission-no'}${isMissionDone(m) ? ' alert-mission-done' : ''}" data-mission-id="${m.id}">
      <div class="alert-mission-header" data-mission-toggle="${m.id}">
        <div class="alert-mission-left">
          ${isMissionDone(m) ? '<span class="mission-done-dot" title="Already completed today"></span>' : ''}
          ${zoneBadge}
          <img src="${m.missionIcon}" alt="" class="alert-mission-icon" onerror="this.style.display='none'">
          <div class="alert-mission-meta">
            <span class="alert-mission-name">${m.missionName}</span>
            <div class="alert-mission-tags">
              <span class="alert-power-badge">
                <img src="assets/icons/stw/power.png" alt="" class="alert-power-img" onerror="this.style.display='none'">
                ${m.power}
              </span>
              ${m.hasAlerts ? `<span class="alert-badge-alert">${m.alerts.length} alert${m.alerts.length > 1 ? 's' : ''}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="alert-mission-right">
          <div class="alert-mod-thumbs">${modIconsHTML}</div>
          ${renderRewardPills([...m.alerts, ...m.rewards])}
          <button class="mission-copy-btn" data-mission-copy="${m.id}" title="Copy to clipboard">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <svg class="alert-mission-arrow ${isExpanded ? 'alert-mission-arrow-open' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="alert-mission-details" style="display:${isExpanded ? 'block' : 'none'}">
        ${renderMissionDetails(m)}
      </div>
    </div>
  `;
}

function renderRewardPills(items: AlertRewardItem[]): string {
  const withIcons = items.filter((r) => r.icon);
  if (withIcons.length === 0) return '';
  // Aggregate duplicates by icon path, summing quantities
  const grouped = new Map<string, { r: AlertRewardItem; total: number }>();
  for (const r of withIcons) {
    const key = r.icon!;
    const ex = grouped.get(key);
    if (ex) ex.total += r.quantity;
    else grouped.set(key, { r, total: r.quantity });
  }
  const merged = [...grouped.values()];
  const maxPills = 6;
  return `<div class="alert-reward-pills">${merged
    .slice(0, maxPills)
    .map(({ r, total }) => {
      const qty = total > 1 ? `<span class="alert-pill-qty">x${total}</span>` : '';
      return `<span class="alert-pill" title="${r.name}${total > 1 ? ' x' + total : ''}"><img src="${r.icon}" alt="" class="alert-pill-icon" onerror="this.style.display='none'">${qty}</span>`;
    })
    .join('')}${merged.length > maxPills ? `<span class="alert-pill alert-pill-more">+${merged.length - maxPills}</span>` : ''}</div>`;
}

function renderMissionDetails(m: ProcessedMission): string {
  // Info section
  const info = `
    <div class="alert-detail-section">
      <h4 class="alert-detail-title">Information</h4>
      <div class="alert-detail-grid">
        <div class="alert-detail-item"><span class="alert-detail-label">Power</span><span class="alert-detail-value">${m.power || 'N/A'}</span></div>
        <div class="alert-detail-item"><span class="alert-detail-label">Zone</span><span class="alert-detail-value">${m.zoneGeo || m.zone}</span></div>
        <div class="alert-detail-item"><span class="alert-detail-label">Theater</span><span class="alert-detail-value alert-detail-mono">${m.theaterId}</span></div>
        <div class="alert-detail-item"><span class="alert-detail-label">Tile</span><span class="alert-detail-value">${m.tileIndex}</span></div>
      </div>
    </div>
  `;

  // Modifiers
  const mods =
    m.modifiers.length > 0
      ? `<div class="alert-detail-section">
          <h4 class="alert-detail-title">Modifiers</h4>
          <div class="alert-detail-list">${m.modifiers
            .map(
              (mod) => `
            <div class="alert-modifier-row">
              <img src="${mod.icon}" alt="" class="alert-modifier-icon" onerror="this.style.display='none'">
              <span>${mod.name}</span>
            </div>`,
            )
            .join('')}</div>
        </div>`
      : '';

  // Alerts
  const alertsSection =
    m.alerts.length > 0
      ? `<div class="alert-detail-section">
          <h4 class="alert-detail-title">Alerts</h4>
          <div class="alert-detail-list">${m.alerts.map((a) => renderRewardRow(a, 'alert')).join('')}</div>
        </div>`
      : '';

  // Rewards
  const rewardsSection =
    m.rewards.length > 0
      ? `<div class="alert-detail-section">
          <h4 class="alert-detail-title">Rewards</h4>
          <div class="alert-detail-list">${m.rewards.map((r) => renderRewardRow(r, 'reward')).join('')}</div>
        </div>`
      : '';

  return `<div class="alert-details-inner">${info}${mods}${alertsSection}${rewardsSection}</div>`;
}

function renderRewardRow(item: AlertRewardItem, type: string): string {
  const iconHTML = item.icon
    ? `<img src="${item.icon}" alt="" class="alert-reward-icon" onerror="this.style.display='none'">`
    : '<span class="alert-reward-icon-placeholder"></span>';
  return `
    <div class="alert-reward-row alert-reward-${type}">
      ${iconHTML}
      <span class="alert-reward-name">${item.name}</span>
      ${item.quantity > 1 ? `<span class="alert-reward-qty">x${item.quantity}</span>` : ''}
    </div>
  `;
}

// ─── Events ──────────────────────────────────────────────────

function bindEvents(): void {
  // Zone toggles — manipulate DOM directly to preserve scroll position
  el?.querySelectorAll('[data-zone-toggle]').forEach((header) => {
    header.addEventListener('click', () => {
      const zone = (header as HTMLElement).dataset.zoneToggle!;
      const zoneEl = el?.querySelector(`.alert-zone[data-zone="${zone}"]`) as HTMLElement | null;
      if (!zoneEl) return;

      const body = zoneEl.querySelector('.alert-zone-body') as HTMLElement | null;
      const arrow = zoneEl.querySelector('.alert-zone-arrow') as HTMLElement | null;

      if (expandedZones.has(zone)) {
        expandedZones.delete(zone);
        zoneEl.classList.remove('alert-zone-open');
        if (body) body.style.display = 'none';
        if (arrow) arrow.classList.remove('alert-zone-arrow-open');
      } else {
        expandedZones.add(zone);
        zoneEl.classList.add('alert-zone-open');
        if (body) body.style.display = 'block';
        if (arrow) arrow.classList.add('alert-zone-arrow-open');
      }
    });
  });

  // Mission toggles — manipulate DOM directly to preserve scroll position
  el?.querySelectorAll('[data-mission-toggle]').forEach((header) => {
    header.addEventListener('click', () => {
      const mid = (header as HTMLElement).dataset.missionToggle!;
      const missionEl = el?.querySelector(`.alert-mission[data-mission-id="${mid}"]`) as HTMLElement | null;
      if (!missionEl) return;

      const details = missionEl.querySelector('.alert-mission-details') as HTMLElement | null;
      const arrow = missionEl.querySelector('.alert-mission-arrow') as HTMLElement | null;

      if (expandedMissions.has(mid)) {
        expandedMissions.delete(mid);
        if (details) details.style.display = 'none';
        if (arrow) arrow.classList.remove('alert-mission-arrow-open');
      } else {
        expandedMissions.add(mid);
        if (details) details.style.display = 'block';
        if (arrow) arrow.classList.add('alert-mission-arrow-open');
      }
    });
  });

  // Mission copy-to-clipboard buttons
  el?.querySelectorAll<HTMLButtonElement>('[data-mission-copy]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
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

  // ── Filters ──────────────────────────────────────────────────
  el?.querySelector('#alerts-filter-toggle')?.addEventListener('click', () => {
    showFilters = !showFilters;
    draw();
  });

  el?.querySelectorAll<HTMLElement>('[data-fzone]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const z = btn.dataset.fzone!;
      if (filterZones.has(z)) filterZones.delete(z);
      else filterZones.add(z);
      draw();
    });
  });

  el?.querySelectorAll<HTMLElement>('[data-fstatus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterStatus = btn.dataset.fstatus as 'all' | 'done' | 'todo';
      draw();
    });
  });

  el?.querySelectorAll<HTMLElement>('[data-freward]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const icon = btn.dataset.freward!;
      if (filterRewardIcons.has(icon)) filterRewardIcons.delete(icon);
      else filterRewardIcons.add(icon);
      draw();
    });
  });

  el?.querySelectorAll<HTMLElement>('[data-fmission]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.fmission!;
      if (filterMissionTypes.has(name)) filterMissionTypes.delete(name);
      else filterMissionTypes.add(name);
      draw();
    });
  });

  let powerTimer: ReturnType<typeof setTimeout> | null = null;
  const onPowerInput = () => {
    if (powerTimer) clearTimeout(powerTimer);
    powerTimer = setTimeout(() => {
      const minEl = el?.querySelector<HTMLInputElement>('#alerts-fpow-min');
      const maxEl = el?.querySelector<HTMLInputElement>('#alerts-fpow-max');
      filterMinPower = parseInt(minEl?.value || '0') || 0;
      filterMaxPower = parseInt(maxEl?.value || '0') || 0;
      draw();
    }, 400);
  };
  el?.querySelector('#alerts-fpow-min')?.addEventListener('input', onPowerInput);
  el?.querySelector('#alerts-fpow-max')?.addEventListener('input', onPowerInput);

  el?.querySelector('#alerts-filter-clear')?.addEventListener('click', () => {
    clearAllFilters();
    draw();
  });

  // Refresh data on account change
  window.glowAPI.accounts.onDataChanged(() => {
    expandedZones.clear();
    expandedMissions.clear();
    loadAlerts();
  });
}

// ─── Page Definition ─────────────────────────────────────────

export const alertsPage: PageDefinition = {
  id: 'alerts',
  label: 'Alerts',
  icon: `<img src="assets/icons/fnui/BR-STW/stworld.png" alt="Alerts" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 15,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    zones = [];
    loading = true;
    error = null;
    expandedZones = new Set();
    expandedMissions = new Set();
    const s = await window.glowAPI.storage.get<{ pageBackgrounds?: boolean; customBackgrounds?: Record<string, string> }>('settings');
    showBg = s?.pageBackgrounds ?? false;
    customBgPath = s?.customBackgrounds?.alerts || '';
    await loadAlerts();
  },

  cleanup(): void {
    el = null;
  },
};
