import type { PageDefinition } from '../../shared/types';

// ─── Types ────────────────────────────────────────────────

interface ZoneInfo {
  zoneId: string;
  zoneName: string;
  level: number;
  highestEnduranceWave: number;
  amplifierCount: number;
  editPermissions: { accountId: string; displayName: string }[];
  saveFile: string;
}

interface StructureData {
  walls: number;
  floors: number;
  stairs: number;
  cones: number;
  total: number;
}

interface TrapData {
  displayName: string;
  iconFile: string;
  count: number;
}

interface BaseData {
  structures: StructureData;
  traps: TrapData[];
  totalTraps: number;
  warning?: string;
}

// ─── State ────────────────────────────────────────────────

let el: HTMLElement | null = null;
let loading = false;
let errorMsg: string | null = null;
let zones: ZoneInfo[] = [];
const baseDataCache: Record<string, BaseData> = {};
const scanningZones = new Set<string>();
const scanErrors: Record<string, string> = {};

const ZONE_ICONS: Record<string, string> = {
  pve_04: 'assets/icons/stw/difficulties/twine.png',
  pve_03: 'assets/icons/stw/difficulties/canny.png',
  pve_02: 'assets/icons/stw/difficulties/plankerton.png',
  pve_01: 'assets/icons/stw/difficulties/stonewood.png',
};

// ─── Helpers ──────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function renderSquares(value: number, max: number, accentClass: string): string {
  let html = '';
  for (let i = 1; i <= max; i++) {
    const filled = i <= value;
    html += `<div class="op-square ${filled ? `op-square--filled ${accentClass}` : ''}"></div>`;
  }
  return html;
}

// ─── Base data section (traps + structures) ───────────────

function renderBaseSection(z: ZoneInfo): string {
  const isScanning = scanningZones.has(z.zoneId);
  const scanErr = scanErrors[z.zoneId];
  const bd = baseDataCache[z.zoneId];

  // Scanning in progress
  if (isScanning) {
    return `
      <div class="op-base-section">
        <div class="op-base-header">
          <span class="op-base-title">PLACED TRAPS & STRUCTURES</span>
        </div>
        <div class="op-scan-loading">
          <div class="op-spinner op-spinner--sm"></div>
          <span>Downloading & parsing base data...</span>
        </div>
      </div>`;
  }

  // Scan error (fatal)
  if (scanErr && !bd) {
    return `
      <div class="op-base-section">
        <div class="op-base-header">
          <span class="op-base-title">PLACED TRAPS & STRUCTURES</span>
        </div>
        <div class="op-scan-error">${esc(scanErr)}</div>
        <button class="op-scan-btn" data-zone="${z.zoneId}" data-save="${esc(z.saveFile)}">Retry Scan</button>
      </div>`;
  }

  // Not scanned yet
  if (!bd) {
    if (!z.saveFile) {
      return `
        <div class="op-base-section">
          <div class="op-base-header">
            <span class="op-base-title">PLACED TRAPS & STRUCTURES</span>
          </div>
          <span class="op-empty">No save data available for this zone</span>
        </div>`;
    }
    return `
      <div class="op-base-section">
        <div class="op-base-header">
          <span class="op-base-title">PLACED TRAPS & STRUCTURES</span>
        </div>
        <button class="op-scan-btn" data-zone="${z.zoneId}" data-save="${esc(z.saveFile)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/><polyline points="21 3 21 9 15 9"/></svg>
          Scan Base
        </button>
      </div>`;
  }

  // ── Scanned: show traps + structures button ──
  // Warning: base empty / unbuilt
  if (bd.warning) {
    return `
      <div class="op-base-section">
        <div class="op-base-header">
          <span class="op-base-title">PLACED TRAPS &amp; STRUCTURES</span>
          <button class="op-scan-btn op-scan-btn--sm" data-zone="${z.zoneId}" data-save="${esc(z.saveFile)}"
                  title="Rescan base">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/><polyline points="21 3 21 9 15 9"/></svg>
          </button>
        </div>
        <div class="op-scan-warning">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>${esc(bd.warning)}</span>
        </div>
      </div>`;
  }

  // Normal: traps + structures
  const trapCards = bd.traps.length > 0
    ? bd.traps.map(t => `
        <div class="op-trap-card">
          <img class="op-trap-icon" src="assets/icons/stw/traps/${t.iconFile}.png"
               alt="${esc(t.displayName)}" width="36" height="36"
               onerror="this.style.opacity='0.3'" />
          <span class="op-trap-name">${esc(t.displayName)}</span>
          <span class="op-trap-count">&times;${fmt(t.count)}</span>
        </div>`).join('')
    : '<span class="op-empty">No traps placed</span>';

  return `
    <div class="op-base-section">
      <div class="op-base-header">
        <span class="op-base-title">PLACED TRAPS (${fmt(bd.totalTraps)})</span>
        <button class="op-scan-btn op-scan-btn--sm" data-zone="${z.zoneId}" data-save="${esc(z.saveFile)}"
                title="Rescan base">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/><polyline points="21 3 21 9 15 9"/></svg>
        </button>
      </div>
      <div class="op-trap-grid">${trapCards}</div>

      <button class="op-structures-btn" data-zone="${z.zoneId}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        View Structures (${fmt(bd.structures.total)})
      </button>
    </div>`;
}

// ─── Zone card ────────────────────────────────────────────

function renderZone(z: ZoneInfo): string {
  const icon = ZONE_ICONS[z.zoneId] || '';
  const accentLvl = `op-square--${z.zoneId.replace('pve_', 'z')}`;

  const playerRows = z.editPermissions.length > 0
    ? z.editPermissions.map((p) => `
        <div class="op-player">
          <div class="op-player-info">
            <span class="op-player-name">${esc(p.displayName)}</span>
            <span class="op-player-id">${p.accountId}</span>
          </div>
          <div class="op-player-actions">
            <button class="op-copy-btn" data-copy="${esc(p.displayName)}" title="Copy display name">Name</button>
            <button class="op-copy-btn" data-copy="${p.accountId}" title="Copy account ID">ID</button>
          </div>
        </div>`).join('')
    : '<span class="op-empty">No edit permissions</span>';

  return `
    <div class="op-zone">
      <div class="op-zone-header">
        ${icon ? `<img class="op-zone-icon" src="${icon}" alt="${esc(z.zoneName)}" width="40" height="40"/>` : ''}
        <div class="op-zone-title-group">
          <h3 class="op-zone-title">${esc(z.zoneName)}</h3>
          <span class="op-zone-id">${esc(z.zoneId)}</span>
        </div>
      </div>

      <div class="op-stats">
        <div class="op-stat">
          <div class="op-stat-header">
            <span class="op-stat-label">Storm Shield Level</span>
            <span class="op-stat-value">${z.level} / 10</span>
          </div>
          <div class="op-squares">${renderSquares(z.level, 10, accentLvl)}</div>
        </div>
        <div class="op-stat">
          <div class="op-stat-header">
            <span class="op-stat-label">Highest Endurance Wave</span>
            <span class="op-stat-value">${z.highestEnduranceWave} / 30</span>
          </div>
          <div class="op-squares op-squares--wave">${renderSquares(z.highestEnduranceWave, 30, 'op-square--wave')}</div>
        </div>
        <div class="op-stat">
          <div class="op-stat-header">
            <span class="op-stat-label">Amplifiers Placed</span>
            <span class="op-stat-value op-stat-value--accent">${z.amplifierCount}</span>
          </div>
        </div>
      </div>

      ${renderBaseSection(z)}

      <div class="op-permissions">
        <div class="op-permissions-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          <span class="op-permissions-title">Edit Permissions (${z.editPermissions.length})</span>
        </div>
        <div class="op-players-list">${playerRows}</div>
      </div>
    </div>`;
}

// ─── Structures modal ─────────────────────────────────────

function showStructuresModal(zoneId: string): void {
  const zone = zones.find(z => z.zoneId === zoneId);
  const bd = baseDataCache[zoneId];
  if (!zone || !bd) return;

  document.querySelector('.op-modal-overlay')?.remove();

  const s = bd.structures;
  const overlay = document.createElement('div');
  overlay.className = 'op-modal-overlay';
  overlay.innerHTML = `
    <div class="op-modal">
      <div class="op-modal-header">
        <h2 class="op-modal-title">Structures \u2014 ${esc(zone.zoneName)}</h2>
        <button class="op-modal-close">&times;</button>
      </div>
      <div class="op-modal-body">
        <div class="op-modal-struct-row">
          <img src="assets/icons/stw/builds/wall.png" width="36" height="36" alt="Walls" />
          <span class="op-modal-struct-name">Walls</span>
          <span class="op-modal-struct-count">${fmt(s.walls)}</span>
        </div>
        <div class="op-modal-struct-row">
          <img src="assets/icons/stw/builds/floor.png" width="36" height="36" alt="Floors" />
          <span class="op-modal-struct-name">Floors</span>
          <span class="op-modal-struct-count">${fmt(s.floors)}</span>
        </div>
        <div class="op-modal-struct-row">
          <img src="assets/icons/stw/builds/stair.png" width="36" height="36" alt="Stairs" />
          <span class="op-modal-struct-name">Stairs</span>
          <span class="op-modal-struct-count">${fmt(s.stairs)}</span>
        </div>
        <div class="op-modal-struct-row">
          <img src="assets/icons/stw/builds/pyramid.png" width="36" height="36" alt="Cones" />
          <span class="op-modal-struct-name">Cones</span>
          <span class="op-modal-struct-count">${fmt(s.cones)}</span>
        </div>
        <div class="op-modal-struct-divider"></div>
        <div class="op-modal-struct-total">
          <span class="op-modal-struct-name">Total Structures</span>
          <span class="op-modal-struct-count op-modal-struct-count--accent">${fmt(s.total)}</span>
        </div>
      </div>
    </div>`;

  overlay.querySelector('.op-modal-close')?.addEventListener('click', hideStructuresModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideStructuresModal(); });
  document.body.appendChild(overlay);
}

function hideStructuresModal(): void {
  document.querySelector('.op-modal-overlay')?.remove();
}

// ─── Draw page ────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  if (loading) {
    el.innerHTML = `
      <div class="op-page">
        <div class="op-header">
          <h1 class="page-title">Outpost Info</h1>
          <p class="page-subtitle">Storm Shield Defense information from your metadata profile</p>
        </div>
        <div class="op-loading">
          <div class="op-spinner"></div>
          <span>Loading outpost data...</span>
        </div>
      </div>`;
    return;
  }

  if (errorMsg) {
    el.innerHTML = `
      <div class="op-page">
        <div class="op-header">
          <h1 class="page-title">Outpost Info</h1>
          <p class="page-subtitle">Storm Shield Defense information from your metadata profile</p>
        </div>
        <div class="op-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>${esc(errorMsg)}</span>
        </div>
        <button class="op-retry-btn" id="op-retry">Retry</button>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="op-page">
      <div class="op-header">
        <h1 class="page-title">Outpost Info</h1>
        <p class="page-subtitle">Storm Shield Defense information from your metadata profile</p>
      </div>
      <div class="op-zones">
        ${zones.map(renderZone).join('')}
      </div>
    </div>`;
}

// ─── Click delegation ─────────────────────────────────────

function handleClick(e: Event): void {
  const target = e.target as HTMLElement;

  const scanBtn = target.closest('.op-scan-btn') as HTMLElement | null;
  if (scanBtn) {
    const zoneId = scanBtn.dataset.zone;
    const saveFile = scanBtn.dataset.save;
    if (zoneId && saveFile) scanBase(zoneId, saveFile);
    return;
  }

  const structBtn = target.closest('.op-structures-btn') as HTMLElement | null;
  if (structBtn) {
    const zoneId = structBtn.dataset.zone;
    if (zoneId) showStructuresModal(zoneId);
    return;
  }

  const retryBtn = target.closest('#op-retry') as HTMLElement | null;
  if (retryBtn) {
    fetchData();
    return;
  }

  const copyBtn = target.closest('.op-copy-btn') as HTMLElement | null;
  if (copyBtn) {
    const text = copyBtn.dataset.copy;
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        const prev = copyBtn.textContent;
        copyBtn.textContent = '✓';
        copyBtn.classList.add('op-copy-btn--ok');
        setTimeout(() => { copyBtn.textContent = prev; copyBtn.classList.remove('op-copy-btn--ok'); }, 1200);
      }).catch(() => {});
    }
    return;
  }
}

// ─── Scan base (download + parse .sav) ────────────────────

async function scanBase(zoneId: string, saveFile: string): Promise<void> {
  scanningZones.add(zoneId);
  delete scanErrors[zoneId];
  draw();

  try {
    const result = await window.glowAPI.outpost.getBaseData(saveFile);
    if (result.success) {
      baseDataCache[zoneId] = {
        structures: result.structures,
        traps: result.traps,
        totalTraps: result.totalTraps,
        warning: result.warning,
      };
      delete scanErrors[zoneId];
    } else {
      scanErrors[zoneId] = result.error || 'Failed to scan base';
    }
  } catch (err: any) {
    scanErrors[zoneId] = err.message || 'Unexpected error';
  } finally {
    scanningZones.delete(zoneId);
    draw();
  }
}

// ─── Fetch outpost metadata ───────────────────────────────

async function fetchData(): Promise<void> {
  loading = true;
  errorMsg = null;
  zones = [];
  draw();

  try {
    const result = await window.glowAPI.outpost.getInfo();
    if (result.success) {
      zones = result.zones;
    } else {
      errorMsg = result.error || 'Failed to fetch outpost data';
    }
  } catch (err: any) {
    errorMsg = err.message || 'Unexpected error';
  } finally {
    loading = false;
    draw();
  }
}

// ─── Account switch ───────────────────────────────────────

function onAccountChanged(): void {
  // Clear cached scan data for the old account
  for (const k of Object.keys(baseDataCache)) delete baseDataCache[k];
  for (const k of Object.keys(scanErrors)) delete scanErrors[k];
  scanningZones.clear();
  if (el) fetchData();
}

// ─── Page Definition ──────────────────────────────────────

export const outpostPage: PageDefinition = {
  id: 'outpost',
  label: 'Outpost Info',
  icon: `<img src="assets/icons/fnui/BR-STW/dupe.png" alt="Outpost" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 12,
  render(container) {
    el = container;
    el.addEventListener('click', handleClick);
    window.addEventListener('glow:account-switched', onAccountChanged);
    fetchData();
  },
  cleanup() {
    window.removeEventListener('glow:account-switched', onAccountChanged);
    hideStructuresModal();
    if (el) el.removeEventListener('click', handleClick);
    el = null;
  },
};
