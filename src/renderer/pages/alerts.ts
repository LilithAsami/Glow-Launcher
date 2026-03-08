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
let expandedZones: Set<string> = new Set();
let expandedMissions: Set<string> = new Set();
let showBg = false;
let customBgPath = '';

const alertsBgDiv = () => {
  if (!showBg) return '';
  if (customBgPath) return `<div class="alerts-bg" style="background: url('glow-bg://load/${customBgPath.replace(/\\/g, '/')}') center / cover no-repeat, linear-gradient(135deg, #0d0d1a 0%, #1a1030 40%, #0d0d1a 100%)"></div>`;
  return '<div class="alerts-bg"></div>';
};

// ─── Data Fetching ───────────────────────────────────────────

async function loadAlerts(): Promise<void> {
  loading = true;
  error = null;
  draw();

  try {
    zones = await window.glowAPI.alerts.getMissions();
  } catch (err: any) {
    error = err?.message || 'Failed to load mission alerts';
  }

  loading = false;
  draw();
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
      <div class="alerts-zones">
        ${zones.map(renderZone).join('')}
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
    <div class="alert-mission ${m.hasAlerts ? 'alert-mission-has' : 'alert-mission-no'}" data-mission-id="${m.id}">
      <div class="alert-mission-header" data-mission-toggle="${m.id}">
        <div class="alert-mission-left">
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
  // Only show items that have an icon
  const withIcons = items.filter((r) => r.icon);
  if (withIcons.length === 0) return '';
  const maxPills = 6;
  return `<div class="alert-reward-pills">${withIcons
    .slice(0, maxPills)
    .map((r) => {
      const qty = r.quantity > 1 ? `<span class="alert-pill-qty">x${r.quantity}</span>` : '';
      return `<span class="alert-pill" title="${r.name}${r.quantity > 1 ? ' x' + r.quantity : ''}"><img src="${r.icon}" alt="" class="alert-pill-icon" onerror="this.style.display='none'">${qty}</span>`;
    })
    .join('')}${withIcons.length > maxPills ? `<span class="alert-pill alert-pill-more">+${withIcons.length - maxPills}</span>` : ''}</div>`;
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
