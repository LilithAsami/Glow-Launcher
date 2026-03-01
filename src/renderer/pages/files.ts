import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── World Info state ──────────────────────────────────────────
let loading = false;
let worldInfoData: any = null;
let worldInfoStats: { missions: number; alerts: number; theaters: number; sizeMB: string } | null = null;
let errorMsg: string | null = null;

// ── Dev Builds state ──────────────────────────────────────────
let devLoading = false;
let devActivated: boolean | null = null;
let devError: string | null = null;

// ── DevStairs state ───────────────────────────────────────────
let dsLoading = false;
let dsActivated: boolean | null = null;
let dsError: string | null = null;

// ── AirStrike state ───────────────────────────────────────────
let airLoading = false;
let airActivated: boolean | null = null;
let airError: string | null = null;

// ── Worker Power state ────────────────────────────────────────
let wpLoading = false;
let wpData: any = null;
let wpStats: { workerCount: number; modified: number; sizeMB: string } | null = null;
let wpError: string | null = null;
let wpMode: 'high' | 'low' = 'high';

// ── Modal active data ─────────────────────────────────────────
let activeModalData: any = null;


// ── Trap Height state ─────────────────────────────────────────
interface TrapListItem { name: string; guid: string; desc: string; defaultHeight: string; rarity: string; tier: string; family: string; heightSupported: boolean }
interface TrapPreset { label: string; hex: string; group: string }

interface FamilyInfo { key: string; category: string; defaultHeight: { hex: string; uu: number }; insideFloor: { hex: string; uu: number } | null; heightSupported: boolean; heightOffset: number }
interface HeightScale { blocks: string; hex: string; uu: number }
interface NamedConfig { key: string; label: string; hex: string; uu: number }

let trapList: TrapListItem[] | null = null;
let trapPresets: TrapPreset[] | null = null;
let trapFamilyInfo: Record<string, FamilyInfo> | null = null;
let trapHeightScale: HeightScale[] | null = null;
let trapNamedConfigs: NamedConfig[] | null = null;
let trapSelectedFamily: string | null = null;
let trapSelectedRarity: string | null = null;
let trapSelectedTier: string | null = null;
let trapSelectedGuid: string | null = null;
let trapSelectedHeight: string | null = null;
let trapLoading = false;
let trapError: string | null = null;
let trapStatus: { found: boolean; isModified: boolean; currentHeight: string | null } | null = null;
let trapModifiedCount = 0;

interface ModifiedTrap { guid: string; name: string; currentHeight: string; desc: string; rarity: string; tier: string }
let trapModifiedList: ModifiedTrap[] = [];
let trapViewMode: 'grid' | 'detail' = 'grid';
let trapApplyingGuid: string | null = null;

// ─── Helpers ──────────────────────────────────────────────────

function getDefaultFileName(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `worldinfo_${y}_${m}_${d}`;
}

function getWpFileName(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `campaign_${wpMode}power_${y}_${m}_${d}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Trap selector helpers ────────────────────────────────────

const RARITY_ORDER = ['C', 'UC', 'R', 'VR', 'SR', '-'];
const RARITY_LABELS: Record<string, string> = { C: 'Common', UC: 'Uncommon', R: 'Rare', VR: 'Epic', SR: 'Legendary', '-': 'Unique' };
const RARITY_COLORS: Record<string, string> = { C: '#9e9e9e', UC: '#4caf50', R: '#2196f3', VR: '#9c27b0', SR: '#ff9800', '-': '#607d8b' };

// ─── Trap family icon mapping ─────────────────────────────────

const FAMILY_ICON_MAP: Record<string, string> = {
  FlameGrill: 'floor_flamegrill', FloorFreeze: 'floor_freeze',
  RetractableSpikes: 'floor_spikes', WoodenSpikes: 'floor_spikes_wood',
  TarPit: 'floor_tar', FloorLauncher: 'floor_launcher',
  LaunchPad: 'floor_player_jump_pad', AntiAir: 'floor_ward',
  DefenderPad: 'floor_defender', Campfire: 'floor_campfire',
  HealingPad: 'floor_health', HoverboardCurve: 'floor_hoverboard_speed',
  HoverboardSpeed: 'floor_hoverboard_speed', JumpPadFree: 'floor_player_jump_pad_free_direction',
  JumpPad: 'floor_player_jump_pad', Broadside: 'wall_cannons',
  WallDarts: 'wall_darts', WallDynamo: 'wall_electric',
  WallLauncher: 'wall_launcher', WallLights: 'wall_light',
  Zapomax: 'wall_mechstructor', SoundWall: 'wall_speaker',
  WallWoodSpikes: 'wall_wood_spikes', WallSpikes: 'wall_wood_spikes',
  OBFloorSpikes: 'floor_spikes', CeilingElectricAOE: 'ceiling_electric_aoe',
  CeilingZapper: 'ceiling_electric_single', CeilingDropTrap: 'ceiling_falling',
  CeilingGasTrap: 'ceiling_gas', TarPitCeiling: 'floor_tar',
  CeilingSpikes: 'ceiling_falling',
};

const CATEGORY_LABELS: Record<string, string> = { floor: 'Floor Traps', wall: 'Wall Traps', ceiling: 'Ceiling Traps' };
const CATEGORY_ORDER = ['floor', 'wall', 'ceiling'];

function getFamilyIcon(familyDesc: string): string {
  const info = trapFamilyInfo?.[familyDesc];
  const key = info?.key ?? '';
  const iconFile = FAMILY_ICON_MAP[key] ?? 'floor_spikes';
  return `assets/icons/stw/traps/${iconFile}.png`;
}

function getFamiliesByCategory(): Record<string, string[]> {
  if (!trapFamilyInfo) return {};
  const result: Record<string, string[]> = { floor: [], wall: [], ceiling: [] };
  for (const [desc, info] of Object.entries(trapFamilyInfo)) {
    const cat = info.category || 'floor';
    if (!result[cat]) result[cat] = [];
    result[cat].push(desc);
  }
  return result;
}

function getModifiedCountForFamily(familyDesc: string): number {
  return trapModifiedList.filter(m => m.desc === familyDesc).length;
}

function getTrapsForFamily(familyDesc: string): TrapListItem[] {
  if (!trapList) return [];
  return trapList.filter(t => t.desc === familyDesc);
}

function sortTraps(traps: TrapListItem[]): TrapListItem[] {
  return [...traps].sort((a, b) => {
    const ri = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    if (ri !== 0) return ri;
    return a.tier.localeCompare(b.tier);
  });
}

function getTrapFamilies(): string[] {
  if (!trapList) return [];
  const set = new Set<string>();
  trapList.forEach(t => set.add(t.desc));
  return [...set];
}

function getTrapRarities(): string[] {
  if (!trapList || !trapSelectedFamily) return [];
  const set = new Set<string>();
  trapList.filter(t => t.desc === trapSelectedFamily).forEach(t => set.add(t.rarity));
  return RARITY_ORDER.filter(r => set.has(r));
}

function getTrapTiers(): string[] {
  if (!trapList || !trapSelectedFamily || !trapSelectedRarity) return [];
  const set = new Set<string>();
  trapList.filter(t => t.desc === trapSelectedFamily && t.rarity === trapSelectedRarity).forEach(t => set.add(t.tier));
  return [...set].sort();
}

function resolveGuid(): string | null {
  if (!trapList || !trapSelectedFamily || !trapSelectedRarity || !trapSelectedTier) return null;
  const match = trapList.find(t => t.desc === trapSelectedFamily && t.rarity === trapSelectedRarity && t.tier === trapSelectedTier);
  return match?.guid ?? null;
}

function heightLabel(hex: string): string {
  // Try universal presets first, then all family-specific
  const p = trapPresets?.find(pr => pr.hex === hex);
  if (p) return p.label;
  // Check scale
  const s = trapHeightScale?.find(sc => sc.hex === hex);
  if (s) {
    const n = parseFloat(s.blocks);
    const sign = n > 0 ? '+' : n < 0 ? '' : ' ';
    return `${sign}${s.blocks} blocks (${Math.round(s.uu)} UU)`;
  }
  // Check named
  const c = trapNamedConfigs?.find(nc => nc.hex === hex);
  if (c) return c.label;
  return hex;
}

function formatTrapName(m: ModifiedTrap): string {
  const rLabel = RARITY_LABELS[m.rarity] || m.rarity;
  return `${m.desc} — ${rLabel} ${m.tier}`;
}

const HEIGHT_GROUP_LABELS: Record<string, string> = {
  scale: 'Block Heights (-1.3 to +1.3)',
  named: 'Configurations',
  insideFloor: 'Inside Floor',
  default: 'Trap Default',
};

function buildHeightOptions(presets: TrapPreset[], selected: string | null): string {
  const groups = new Map<string, TrapPreset[]>();
  for (const p of presets) {
    const g = p.group || 'other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }
  let html = '<option value="">— Select height —</option>';
  for (const [gKey, items] of groups) {
    html += `<optgroup label="${esc(HEIGHT_GROUP_LABELS[gKey] || gKey)}">`;
    for (const p of items) {
      html += `<option value="${p.hex}" ${p.hex === selected ? 'selected' : ''}>${esc(p.label)}</option>`;
    }
    html += '</optgroup>';
  }
  return html;
}

/** Build family-aware presets: universal scale + named configs + per-family inside-floor + per-family default */
function getPresetsForFamily(familyDesc: string | null): TrapPreset[] {
  const presets: TrapPreset[] = [];

  // 1. Block-height scale (universal)
  if (trapHeightScale) {
    for (const s of trapHeightScale) {
      const n = parseFloat(s.blocks);
      const sign = n > 0 ? '+' : n < 0 ? '' : ' ';
      presets.push({ label: `${sign}${s.blocks} blocks (${Math.round(s.uu)} UU)`, hex: s.hex, group: 'scale' });
    }
  }

  // 2. Named configurations (universal)
  if (trapNamedConfigs) {
    for (const c of trapNamedConfigs) {
      presets.push({ label: c.label, hex: c.hex, group: 'named' });
    }
  }

  // 3. Per-family inside-floor (only for floor traps that have it)
  if (familyDesc && trapFamilyInfo) {
    const fam = trapFamilyInfo[familyDesc];
    if (fam && fam.category === 'floor' && fam.insideFloor) {
      presets.push({
        label: `Inside floor (${Math.round(fam.insideFloor.uu)} UU)`,
        hex: fam.insideFloor.hex,
        group: 'insideFloor',
      });
    }
  }

  // 4. Per-family default (restore original)
  if (familyDesc && trapFamilyInfo) {
    const fam = trapFamilyInfo[familyDesc];
    if (fam) {
      presets.push({
        label: `Restore Default (${Math.round(fam.defaultHeight.uu)} UU)`,
        hex: fam.defaultHeight.hex,
        group: 'default',
      });
    }
  }

  return presets;
}

// ─── Trap Section Renderers ───────────────────────────────────

function renderTrapSection(): string {
  if (trapViewMode === 'detail' && trapSelectedFamily) return renderTrapDetail();
  return renderTrapGrid();
}

function renderTrapGrid(): string {
  const errorHtml = trapError ? `
    <div class="files-card-error">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <span>${esc(trapError)}</span>
    </div>` : '';

  const loadingHtml = trapLoading ? `
    <div class="files-card-loading">
      <div class="files-spinner"></div>
      <span>Processing...</span>
    </div>` : '';

  if (!trapList) {
    return `
    <div class="trap-section" id="files-trap-card">
      <div class="trap-section-header">
        <div class="trap-section-title-row">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          <h3 class="trap-section-title">Trap Height Modifier</h3>
        </div>
        <p class="trap-section-desc">Modify trap placement height in pakchunk11. Changes are reversible.</p>
      </div>
      ${errorHtml}
      ${loadingHtml}
      ${!trapLoading ? `
      <button class="files-btn files-btn--primary" id="files-trap-load">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Load Traps
      </button>` : ''}
    </div>`;
  }

  const byCategory = getFamiliesByCategory();

  const categorySections = CATEGORY_ORDER.map(cat => {
    const families = byCategory[cat] || [];
    if (families.length === 0) return '';
    return `
      <div class="trap-cat">
        <div class="trap-cat-label">${CATEGORY_LABELS[cat] || cat}</div>
        <div class="trap-fam-grid">
          ${families.map(desc => {
            const modCount = getModifiedCountForFamily(desc);
            const fi = trapFamilyInfo?.[desc];
            const unsupported = fi && !fi.heightSupported;
            return `
          <button class="trap-fam-btn ${modCount > 0 ? 'trap-fam-btn--modified' : ''} ${unsupported ? 'trap-fam-btn--unsupported' : ''}" data-family="${esc(desc)}">
            <img class="trap-fam-btn-img" src="${getFamilyIcon(desc)}" alt="" draggable="false" />
            <span class="trap-fam-btn-name">${esc(desc)}</span>
            ${modCount > 0 ? `<span class="trap-fam-btn-badge">${modCount}</span>` : ''}
            ${unsupported ? '<span class="trap-fam-btn-lock"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>' : ''}
          </button>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  const modifiedSection = trapModifiedList.length > 0 ? `
    <div class="trap-modified-section">
      <div class="trap-modified-header">
        <span class="trap-modified-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          Modified Traps
          <span class="trap-section-badge">${trapModifiedList.length}</span>
        </span>
        <button class="files-btn files-btn--danger files-btn--sm" id="files-trap-revert-all">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          Revert All
        </button>
      </div>
      <div class="trap-modified-list">
        ${trapModifiedList.map(m => `
        <div class="trap-mod-entry" data-guid="${m.guid}">
          <img class="trap-mod-entry-icon" src="${getFamilyIcon(m.desc)}" alt="" draggable="false" />
          <div class="trap-mod-entry-info">
            <span class="trap-mod-entry-name">${esc(formatTrapName(m))}</span>
            <span class="trap-mod-entry-height">${esc(heightLabel(m.currentHeight))}</span>
          </div>
          <button class="files-btn files-btn--danger files-btn--sm trap-grid-revert" data-guid="${m.guid}" title="Revert">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
        </div>`).join('')}
      </div>
    </div>` : '';

  return `
    <div class="trap-section" id="files-trap-card">
      <div class="trap-section-header">
        <div class="trap-section-title-row">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          <h3 class="trap-section-title">Trap Height Modifier</h3>
          ${trapModifiedList.length > 0 ? `<span class="trap-section-badge">${trapModifiedList.length}</span>` : ''}
        </div>
        <p class="trap-section-desc">Select a trap family to modify placement height. Changes are reversible.</p>
      </div>
      ${errorHtml}
      ${loadingHtml}
      ${categorySections}
      ${modifiedSection}
    </div>`;
}

function renderTrapDetail(): string {
  const familyDesc = trapSelectedFamily!;
  const info = trapFamilyInfo?.[familyDesc];
  const catLabel = info ? (CATEGORY_LABELS[info.category] || info.category) : '';
  const defaultHex = info?.defaultHeight.hex ?? '';
  const defaultLabel = heightLabel(defaultHex);
  const insideFloor = info?.insideFloor;
  const traps = sortTraps(getTrapsForFamily(familyDesc));
  const presets = getPresetsForFamily(familyDesc);

  const metaParts = [catLabel];
  metaParts.push(`Default: ${defaultLabel}`);
  if (insideFloor) metaParts.push(`Inside floor: ${Math.round(insideFloor.uu)} UU`);

  const errorHtml = trapError ? `
    <div class="files-card-error" style="margin:8px 0">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <span>${esc(trapError)}</span>
    </div>` : '';

  const unsupported = info && !info.heightSupported;

  const trapRows = traps.map(trap => {
    const modified = trapModifiedList.find(m => m.guid === trap.guid);
    const isModified = !!modified;
    const rarLabel = RARITY_LABELS[trap.rarity] || trap.rarity;
    const rarColor = RARITY_COLORS[trap.rarity] || '#9e9e9e';
    const isApplying = trapApplyingGuid === trap.guid;
    const controlsDisabled = trapLoading || unsupported;

    return `
      <div class="trap-item ${isModified ? 'trap-item--modified' : ''} ${isApplying ? 'trap-item--loading' : ''}" data-guid="${trap.guid}">
        <div class="trap-item-info">
          <span class="trap-item-rarity" style="--rarity-color:${rarColor}">${esc(rarLabel)}</span>
          <span class="trap-item-tier">${esc(trap.tier)}</span>
          ${isModified
            ? `<span class="files-trap-badge files-trap-badge--modified">MODIFIED</span>
               <span class="trap-item-height">${esc(heightLabel(modified!.currentHeight))}</span>`
            : `<span class="files-trap-badge files-trap-badge--default">DEFAULT</span>`
          }
        </div>
        <div class="trap-item-actions">
          <select class="files-trap-select trap-item-select" data-guid="${trap.guid}" ${controlsDisabled ? 'disabled' : ''}>
            ${buildHeightOptions(presets, null)}
          </select>
          <button class="files-btn files-btn--primary files-btn--sm trap-item-apply" data-guid="${trap.guid}" ${controlsDisabled ? 'disabled' : ''}>
            ${isApplying ? '<div class="files-spinner" style="width:12px;height:12px"></div>' : 'Apply'}
          </button>
          ${isModified ? `
          <button class="files-btn files-btn--danger files-btn--sm trap-item-revert" data-guid="${trap.guid}" ${controlsDisabled ? 'disabled' : ''}>Revert</button>
          ` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="trap-section trap-detail" id="files-trap-card">
      <div class="trap-detail-header">
        <button class="files-btn files-btn--ghost" id="trap-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <img class="trap-detail-img" src="${getFamilyIcon(familyDesc)}" alt="" draggable="false" />
        <div class="trap-detail-title-area">
          <h3 class="trap-section-title">${esc(familyDesc)}</h3>
          <span class="trap-detail-meta">${metaParts.map(esc).join(' · ')}</span>
        </div>
      </div>
      ${info && !info.heightSupported ? `
      <div class="trap-unsupported-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>This trap family has no modifiable height offset. Patching is not supported.</span>
      </div>` : ''}
      ${errorHtml}
      <div class="trap-detail-list">
        ${trapRows}
      </div>
    </div>`;
}

// ─── Draw ─────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="files-page">
      <div class="files-header">
        <h1 class="page-title">Files & Tools</h1>
        <p class="page-subtitle">File exports and game patches</p>
      </div>

      <div class="files-grid">
        <!-- World Info Card -->
        <div class="files-card" id="files-worldinfo-card">
          <div class="files-card-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <div class="files-card-body">
            <h3 class="files-card-title">World Info</h3>
            <p class="files-card-desc">STW world info JSON without modifiers (no miniboss, etc...)</p>

            ${loading ? `
              <div class="files-card-loading">
                <div class="files-spinner"></div>
                <span>Fetching world info...</span>
              </div>
            ` : errorMsg ? `
              <div class="files-card-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <span>${errorMsg}</span>
              </div>
              <button class="files-btn files-btn--primary" id="files-worldinfo-generate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Retry
              </button>
            ` : worldInfoData ? `
              <div class="files-card-stats">
                <div class="files-stat">
                  <span class="files-stat-value">${worldInfoStats?.theaters ?? 0}</span>
                  <span class="files-stat-label">Theaters</span>
                </div>
                <div class="files-stat">
                  <span class="files-stat-value">${worldInfoStats?.missions ?? 0}</span>
                  <span class="files-stat-label">Missions</span>
                </div>
                <div class="files-stat">
                  <span class="files-stat-value">${worldInfoStats?.alerts ?? 0}</span>
                  <span class="files-stat-label">Alerts</span>
                </div>
                <div class="files-stat">
                  <span class="files-stat-value">${worldInfoStats?.sizeMB ?? '0'}MB</span>
                  <span class="files-stat-label">Size</span>
                </div>
              </div>
              <div class="files-card-actions">
                <button class="files-btn files-btn--primary" id="files-worldinfo-download">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download JSON
                </button>
                <button class="files-btn files-btn--secondary" id="files-worldinfo-preview">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Preview JSON
                </button>
                <button class="files-btn files-btn--ghost" id="files-worldinfo-refresh">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
              </div>
            ` : `
              <button class="files-btn files-btn--primary" id="files-worldinfo-generate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Generate World Info
              </button>
            `}
          </div>
        </div>

        <!-- Worker Power Card -->
        <div class="files-card" id="files-workerpower-card">
          <div class="files-card-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div class="files-card-body">
            <h3 class="files-card-title">Worker Power</h3>
            <p class="files-card-desc">Generate campaign profile with all workers set to max or min level.</p>

            <div class="wp-mode-toggle">
              <button class="wp-mode-btn ${wpMode === 'high' ? 'wp-mode-btn--active' : ''}" id="wp-mode-high">High Power</button>
              <button class="wp-mode-btn ${wpMode === 'low' ? 'wp-mode-btn--active' : ''}" id="wp-mode-low">Low Power</button>
            </div>

            ${wpLoading ? `
              <div class="files-card-loading">
                <div class="files-spinner"></div>
                <span>Querying campaign profile...</span>
              </div>
            ` : wpError ? `
              <div class="files-card-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <span>${wpError}</span>
              </div>
              <button class="files-btn files-btn--primary" id="files-wp-generate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Retry
              </button>
            ` : wpData ? `
              <div class="files-card-stats">
                <div class="files-stat">
                  <span class="files-stat-value">${wpStats?.workerCount ?? 0}</span>
                  <span class="files-stat-label">Workers</span>
                </div>
                <div class="files-stat">
                  <span class="files-stat-value">${wpStats?.modified ?? 0}</span>
                  <span class="files-stat-label">Modified</span>
                </div>
                <div class="files-stat">
                  <span class="files-stat-value">${wpStats?.sizeMB ?? '0'}MB</span>
                  <span class="files-stat-label">Size</span>
                </div>
                <div class="files-stat">
                  <span class="files-stat-value">Lv ${wpMode === 'high' ? 50 : 1}</span>
                  <span class="files-stat-label">Level</span>
                </div>
              </div>
              <div class="files-card-actions">
                <button class="files-btn files-btn--primary" id="files-wp-download">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download JSON
                </button>
                <button class="files-btn files-btn--secondary" id="files-wp-preview">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Preview JSON
                </button>
                <button class="files-btn files-btn--ghost" id="files-wp-refresh">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
              </div>
            ` : `
              <button class="files-btn files-btn--primary" id="files-wp-generate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                Generate ${wpMode === 'high' ? 'High' : 'Low'} Power File
              </button>
            `}
          </div>
        </div>

        <!-- Dev Builds Card -->
        <div class="files-card files-card--deco" id="files-devbuilds-card">
          <img src="../assets/icons/devbuilds.png" class="files-card-deco-img" alt="" />
          <div class="files-card-icon ${devActivated ? 'files-card-icon--active' : ''}">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </div>
          <div class="files-card-body">
            <h3 class="files-card-title">Dev Builds</h3>
            <p class="files-card-desc">Patch pakchunk10 to enable dev build features.</p>

            ${devLoading ? `
              <div class="files-card-loading">
                <div class="files-spinner"></div>
                <span>Patching file...</span>
              </div>
            ` : devError ? `
              <div class="files-card-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <span>${esc(devError)}</span>
              </div>
              <button class="files-btn files-btn--primary" id="files-devbuilds-toggle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Retry
              </button>
            ` : devActivated !== null ? `
              <div class="files-devbuilds-status">
                <span class="files-devbuilds-badge ${devActivated ? 'files-devbuilds-badge--on' : 'files-devbuilds-badge--off'}">
                  ${devActivated ? 'ACTIVATED' : 'DEACTIVATED'}
                </span>
              </div>
              <div class="files-card-actions">
                <button class="files-btn ${devActivated ? 'files-btn--danger' : 'files-btn--primary'}" id="files-devbuilds-toggle">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${devActivated
                      ? '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>'
                      : '<polygon points="5 3 19 12 5 21 5 3"/>'}
                  </svg>
                  ${devActivated ? 'Deactivate' : 'Activate'}
                </button>
                <button class="files-btn files-btn--ghost" id="files-devbuilds-check" title="Re-check status">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
              </div>
            ` : `
              <button class="files-btn files-btn--primary" id="files-devbuilds-check">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Check Status
              </button>
            `}

            <!-- DevStairs sub-section -->
            <div class="files-devstairs-section">
              <h4 class="files-card-subtitle">DevStairs Only</h4>
              <p class="files-card-desc-sm">Patch pakchunk30 for DevStairs. Auto-deactivates normal Dev Builds when turned on.</p>
              ${dsLoading ? `
                <div class="files-card-loading">
                  <div class="files-spinner"></div>
                  <span>Patching...</span>
                </div>
              ` : dsError ? `
                <div class="files-card-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  <span>${esc(dsError)}</span>
                </div>
                <button class="files-btn files-btn--primary files-btn--sm" id="files-devstairs-toggle">Retry</button>
              ` : dsActivated !== null ? `
                <div class="files-devbuilds-status">
                  <span class="files-devbuilds-badge ${dsActivated ? 'files-devbuilds-badge--on' : 'files-devbuilds-badge--off'}">
                    ${dsActivated ? 'ACTIVATED' : 'DEACTIVATED'}
                  </span>
                </div>
                <div class="files-card-actions">
                  <button class="files-btn files-btn--sm ${dsActivated ? 'files-btn--danger' : 'files-btn--primary'}" id="files-devstairs-toggle">
                    ${dsActivated ? 'Deactivate' : 'Activate'}
                  </button>
                  <button class="files-btn files-btn--ghost files-btn--sm" id="files-devstairs-check" title="Re-check status">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                  </button>
                </div>
              ` : `
                <button class="files-btn files-btn--primary files-btn--sm" id="files-devstairs-check">Check Status</button>
              `}
            </div>
          </div>
        </div>

        <!-- AirStrike Card -->
        <div class="files-card files-card--deco" id="files-airstrike-card">
          <img src="../assets/icons/airstrike.png" class="files-card-deco-img" alt="" />
          <div class="files-card-icon ${airActivated ? 'files-card-icon--active' : ''}">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div class="files-card-body">
            <h3 class="files-card-title">AirStrike</h3>
            <p class="files-card-desc">Patch pakchunk30 to enable AirStrike exploit.</p>

            ${airLoading ? `
              <div class="files-card-loading">
                <div class="files-spinner"></div>
                <span>Patching file...</span>
              </div>
            ` : airError ? `
              <div class="files-card-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <span>${esc(airError)}</span>
              </div>
              <button class="files-btn files-btn--primary" id="files-airstrike-toggle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Retry
              </button>
            ` : airActivated !== null ? `
              <div class="files-devbuilds-status">
                <span class="files-devbuilds-badge ${airActivated ? 'files-devbuilds-badge--on' : 'files-devbuilds-badge--off'}">
                  ${airActivated ? 'ACTIVATED' : 'DEACTIVATED'}
                </span>
              </div>
              <div class="files-card-actions">
                <button class="files-btn ${airActivated ? 'files-btn--danger' : 'files-btn--primary'}" id="files-airstrike-toggle">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${airActivated
                      ? '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>'
                      : '<polygon points="5 3 19 12 5 21 5 3"/>'}
                  </svg>
                  ${airActivated ? 'Deactivate' : 'Activate'}
                </button>
                <button class="files-btn files-btn--ghost" id="files-airstrike-check" title="Re-check status">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
              </div>
            ` : `
              <button class="files-btn files-btn--primary" id="files-airstrike-check">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Check Status
              </button>
            `}
          </div>
        </div>

      </div>

      ${renderTrapSection()}
    </div>

    <!-- JSON Preview Modal -->
    <div class="files-modal-overlay" id="files-modal-overlay" style="display:none">
      <div class="files-modal">
        <div class="files-modal-header">
          <h2 class="files-modal-title">World Info Preview</h2>
          <div class="files-modal-header-actions">
            <button class="files-btn files-btn--ghost files-modal-copy" id="files-modal-copy" title="Copy to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="files-btn files-btn--ghost files-modal-close" id="files-modal-close" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="files-modal-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="files-modal-search-input" placeholder="Search in JSON..." autocomplete="off" spellcheck="false"/>
        </div>
        <pre class="files-modal-json" id="files-modal-json"></pre>
      </div>
    </div>
  `;

  bindEvents();
}

// ─── Events ───────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  const genBtn = el.querySelector('#files-worldinfo-generate') as HTMLButtonElement | null;
  genBtn?.addEventListener('click', () => loadWorldInfo());

  const downloadBtn = el.querySelector('#files-worldinfo-download') as HTMLButtonElement | null;
  downloadBtn?.addEventListener('click', () => downloadWorldInfo());

  const previewBtn = el.querySelector('#files-worldinfo-preview') as HTMLButtonElement | null;
  previewBtn?.addEventListener('click', () => openPreview());

  const refreshBtn = el.querySelector('#files-worldinfo-refresh') as HTMLButtonElement | null;
  refreshBtn?.addEventListener('click', () => loadWorldInfo());

  // ── Worker Power ─────────────────────────────────────────
  const wpGenBtn = el.querySelector('#files-wp-generate') as HTMLButtonElement | null;
  wpGenBtn?.addEventListener('click', () => loadWorkerPower());

  const wpDownloadBtn = el.querySelector('#files-wp-download') as HTMLButtonElement | null;
  wpDownloadBtn?.addEventListener('click', () => downloadWorkerPower());

  const wpPreviewBtn = el.querySelector('#files-wp-preview') as HTMLButtonElement | null;
  wpPreviewBtn?.addEventListener('click', () => openWpPreview());

  const wpRefreshBtn = el.querySelector('#files-wp-refresh') as HTMLButtonElement | null;
  wpRefreshBtn?.addEventListener('click', () => loadWorkerPower());

  const wpHighBtn = el.querySelector('#wp-mode-high') as HTMLButtonElement | null;
  wpHighBtn?.addEventListener('click', () => { wpMode = 'high'; wpData = null; wpStats = null; wpError = null; draw(); });

  const wpLowBtn = el.querySelector('#wp-mode-low') as HTMLButtonElement | null;
  wpLowBtn?.addEventListener('click', () => { wpMode = 'low'; wpData = null; wpStats = null; wpError = null; draw(); });

  const devCheckBtn = el.querySelector('#files-devbuilds-check') as HTMLButtonElement | null;
  devCheckBtn?.addEventListener('click', () => checkDevBuildStatus());

  const devToggleBtn = el.querySelector('#files-devbuilds-toggle') as HTMLButtonElement | null;
  devToggleBtn?.addEventListener('click', () => toggleDevBuilds());

  // ── DevStairs ────────────────────────────────────────────
  const dsCheckBtn = el.querySelector('#files-devstairs-check') as HTMLButtonElement | null;
  dsCheckBtn?.addEventListener('click', () => checkDevStairsStatus());

  const dsToggleBtn = el.querySelector('#files-devstairs-toggle') as HTMLButtonElement | null;
  dsToggleBtn?.addEventListener('click', () => toggleDevStairs());

  // ── AirStrike ────────────────────────────────────────────
  const airCheckBtn = el.querySelector('#files-airstrike-check') as HTMLButtonElement | null;
  airCheckBtn?.addEventListener('click', () => checkAirStrikeStatus());

  const airToggleBtn = el.querySelector('#files-airstrike-toggle') as HTMLButtonElement | null;
  airToggleBtn?.addEventListener('click', () => toggleAirStrike());

  // ── Trap Height ──────────────────────────────────────────
  const trapLoadBtn = el.querySelector('#files-trap-load') as HTMLButtonElement | null;
  trapLoadBtn?.addEventListener('click', () => loadTraps());

  // Family grid buttons
  el.querySelectorAll('.trap-fam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const desc = (btn as HTMLElement).dataset.family;
      if (desc) {
        trapSelectedFamily = desc;
        trapViewMode = 'detail';
        trapError = null;
        draw();
      }
    });
  });

  // Back button from detail view
  const trapBackBtn = el.querySelector('#trap-back') as HTMLButtonElement | null;
  trapBackBtn?.addEventListener('click', () => {
    trapViewMode = 'grid';
    trapSelectedFamily = null;
    trapError = null;
    draw();
  });

  // Per-trap apply buttons
  el.querySelectorAll('.trap-item-apply').forEach(btn => {
    btn.addEventListener('click', () => {
      const guid = (btn as HTMLElement).dataset.guid;
      const select = el?.querySelector(`.trap-item-select[data-guid="${guid}"]`) as HTMLSelectElement | null;
      const hex = select?.value;
      if (guid && hex) applyTrapByGuid(guid, hex);
    });
  });

  // Per-trap revert buttons (in detail view)
  el.querySelectorAll('.trap-item-revert').forEach(btn => {
    btn.addEventListener('click', () => {
      const guid = (btn as HTMLElement).dataset.guid;
      if (guid) revertSingleTrap(guid);
    });
  });

  // Revert all button
  const trapRevertAllBtn = el.querySelector('#files-trap-revert-all') as HTMLButtonElement | null;
  trapRevertAllBtn?.addEventListener('click', () => revertAllTraps());

  // Revert buttons in grid modified list
  el.querySelectorAll('.trap-grid-revert').forEach(btn => {
    btn.addEventListener('click', () => {
      const guid = (btn as HTMLElement).dataset.guid;
      if (guid) revertSingleTrap(guid);
    });
  });

  const overlay = el.querySelector('#files-modal-overlay') as HTMLElement | null;
  const closeBtn = el.querySelector('#files-modal-close') as HTMLButtonElement | null;
  const copyBtn = el.querySelector('#files-modal-copy') as HTMLButtonElement | null;
  const searchInput = el.querySelector('#files-modal-search-input') as HTMLInputElement | null;

  closeBtn?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'files-modal-overlay') closeModal();
  });

  copyBtn?.addEventListener('click', () => {
    if (!activeModalData) return;
    const jsonStr = JSON.stringify(activeModalData, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      if (copyBtn) {
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        }, 2000);
      }
    });
  });

  searchInput?.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    highlightJson(query);
  });

  document.addEventListener('keydown', handleEsc);
}

function handleEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeModal();
}

// ─── World Info Actions ───────────────────────────────────────

async function loadWorldInfo(): Promise<void> {
  if (loading) return;
  loading = true;
  errorMsg = null;
  draw();

  try {
    const result = await window.glowAPI.files.getWorldInfo();
    if (result.success) {
      worldInfoData = result.data;
      worldInfoStats = {
        missions: result.missions ?? 0,
        alerts: result.alerts ?? 0,
        theaters: result.theaters ?? 0,
        sizeMB: result.sizeMB ?? '0',
      };
      errorMsg = null;
    } else {
      errorMsg = result.error || 'Failed to fetch world info';
    }
  } catch (err: any) {
    errorMsg = err.message || 'Unexpected error';
  } finally {
    loading = false;
    draw();
  }
}

async function downloadWorldInfo(): Promise<void> {
  if (!worldInfoData) return;
  const jsonStr = JSON.stringify(worldInfoData, null, 2);
  try {
    await window.glowAPI.files.save(jsonStr, getDefaultFileName());
  } catch {
    // user cancelled or error — silent
  }
}

function openPreview(): void {
  if (!worldInfoData || !el) return;
  activeModalData = worldInfoData;
  const overlay = el.querySelector('#files-modal-overlay') as HTMLElement;
  const jsonPre = el.querySelector('#files-modal-json') as HTMLPreElement;
  const searchInput = el.querySelector('#files-modal-search-input') as HTMLInputElement;
  if (!overlay || !jsonPre) return;

  const jsonStr = JSON.stringify(worldInfoData, null, 2);
  jsonPre.innerHTML = syntaxHighlight(jsonStr);
  overlay.style.display = 'flex';
  if (searchInput) searchInput.value = '';
}

function closeModal(): void {
  if (!el) return;
  const overlay = el.querySelector('#files-modal-overlay') as HTMLElement;
  if (overlay) overlay.style.display = 'none';
}

// ─── Worker Power Actions ─────────────────────────────────────

async function loadWorkerPower(): Promise<void> {
  if (wpLoading) return;
  wpLoading = true;
  wpError = null;
  draw();

  try {
    const targetLevel = wpMode === 'high' ? 50 : 1;
    const result = await window.glowAPI.files.workerPower(targetLevel);
    if (result.success) {
      wpData = result.data;
      wpStats = {
        workerCount: result.workerCount ?? 0,
        modified: result.modified ?? 0,
        sizeMB: result.sizeMB ?? '0',
      };
      wpError = null;
    } else {
      wpError = result.error || 'Failed to query campaign profile';
    }
  } catch (err: any) {
    wpError = err.message || 'Unexpected error';
  } finally {
    wpLoading = false;
    draw();
  }
}

async function downloadWorkerPower(): Promise<void> {
  if (!wpData) return;
  const jsonStr = JSON.stringify(wpData, null, 2);
  try {
    await window.glowAPI.files.save(jsonStr, getWpFileName());
  } catch {
    // user cancelled or error — silent
  }
}

function openWpPreview(): void {
  if (!wpData || !el) return;
  activeModalData = wpData;
  const overlay = el.querySelector('#files-modal-overlay') as HTMLElement;
  const jsonPre = el.querySelector('#files-modal-json') as HTMLPreElement;
  const searchInput = el.querySelector('#files-modal-search-input') as HTMLInputElement;
  if (!overlay || !jsonPre) return;

  const jsonStr = JSON.stringify(wpData, null, 2);
  jsonPre.innerHTML = syntaxHighlight(jsonStr);
  overlay.style.display = 'flex';
  if (searchInput) searchInput.value = '';
}

// ─── Dev Builds Actions ───────────────────────────────────────

async function checkDevBuildStatus(): Promise<void> {
  if (devLoading) return;
  devLoading = true;
  devError = null;
  draw();

  try {
    const result = await window.glowAPI.files.devBuildStatus();
    if (result.found) {
      devActivated = result.activated;
      devError = null;
    } else {
      devError = result.error || 'File not found';
      devActivated = null;
    }
  } catch (err: any) {
    devError = err.message || 'Error checking status';
  } finally {
    devLoading = false;
    draw();
  }
}

async function toggleDevBuilds(): Promise<void> {
  if (devLoading) return;
  devLoading = true;
  devError = null;
  draw();

  try {
    const result = await window.glowAPI.files.devBuildToggle();
    if (result.success) {
      devActivated = result.activated ?? null;
      devError = null;
    } else {
      devError = result.message;
    }
  } catch (err: any) {
    devError = err.message || 'Unexpected error';
  } finally {
    devLoading = false;
    draw();
  }
}

// ─── DevStairs Actions ────────────────────────────────────────

async function checkDevStairsStatus(): Promise<void> {
  if (dsLoading) return;
  dsLoading = true;
  dsError = null;
  draw();

  try {
    const result = await window.glowAPI.files.devStairsStatus();
    if (result.found) {
      dsActivated = result.activated;
      dsError = null;
    } else {
      dsError = result.error || 'File not found';
      dsActivated = null;
    }
  } catch (err: any) {
    dsError = err.message || 'Error checking status';
  } finally {
    dsLoading = false;
    draw();
  }
}

async function toggleDevStairs(): Promise<void> {
  if (dsLoading) return;
  dsLoading = true;
  dsError = null;
  draw();

  try {
    const result = await window.glowAPI.files.devStairsToggle();
    if (result.success) {
      dsActivated = result.activated ?? null;
      dsError = null;
      // DevStairs auto-deactivates normal devbuilds — refresh its status
      if (result.activated) {
        devActivated = false;
      }
    } else {
      dsError = result.message;
    }
  } catch (err: any) {
    dsError = err.message || 'Unexpected error';
  } finally {
    dsLoading = false;
    draw();
  }
}

// ─── AirStrike Actions ───────────────────────────────────────

async function checkAirStrikeStatus(): Promise<void> {
  if (airLoading) return;
  airLoading = true;
  airError = null;
  draw();

  try {
    const result = await window.glowAPI.files.airStrikeStatus();
    if (result.found) {
      airActivated = result.activated;
      airError = null;
    } else {
      airError = result.error || 'File not found';
      airActivated = null;
    }
  } catch (err: any) {
    airError = err.message || 'Error checking status';
  } finally {
    airLoading = false;
    draw();
  }
}

async function toggleAirStrike(): Promise<void> {
  if (airLoading) return;
  airLoading = true;
  airError = null;
  draw();

  try {
    const result = await window.glowAPI.files.airStrikeToggle();
    if (result.success) {
      airActivated = result.activated ?? null;
      airError = null;
    } else {
      airError = result.message;
    }
  } catch (err: any) {
    airError = err.message || 'Unexpected error';
  } finally {
    airLoading = false;
    draw();
  }
}

// ─── Trap Height Actions ──────────────────────────────────────

async function loadTraps(): Promise<void> {
  if (trapLoading) return;
  trapLoading = true;
  trapError = null;
  draw();

  try {
    const [list, presets, modTraps, familyInfo, heightData] = await Promise.all([
      window.glowAPI.files.trapHeightList(),
      window.glowAPI.files.trapHeightPresets(),
      window.glowAPI.files.trapHeightModifiedTraps(),
      window.glowAPI.files.trapHeightFamilyInfo(),
      window.glowAPI.files.trapHeightData(),
    ]);
    trapList = list;
    trapPresets = presets;
    trapModifiedList = modTraps;
    trapModifiedCount = modTraps.length;
    trapFamilyInfo = familyInfo;
    trapHeightScale = heightData.scale;
    trapNamedConfigs = heightData.named;
    trapError = null;
  } catch (err: any) {
    trapError = err.message || 'Failed to load trap data';
  } finally {
    trapLoading = false;
    draw();
  }
}

async function refreshModifiedList(): Promise<void> {
  try {
    trapModifiedList = await window.glowAPI.files.trapHeightModifiedTraps();
    trapModifiedCount = trapModifiedList.length;
  } catch { /* ignore */ }
}

async function applyTrapByGuid(guid: string, hex: string): Promise<void> {
  if (trapLoading) return;
  trapApplyingGuid = guid;
  trapLoading = true;
  trapError = null;
  draw();

  try {
    const result = await window.glowAPI.files.trapHeightApply(guid, hex);
    if (result.success) {
      trapError = null;
      await refreshModifiedList();
    } else {
      trapError = result.message;
    }
  } catch (err: any) {
    trapError = err.message || 'Unexpected error';
  } finally {
    trapApplyingGuid = null;
    trapLoading = false;
    draw();
  }
}

async function applyTrap(): Promise<void> {
  if (!trapSelectedGuid || !trapSelectedHeight || trapLoading) return;
  trapLoading = true;
  trapError = null;
  draw();

  try {
    const result = await window.glowAPI.files.trapHeightApply(trapSelectedGuid, trapSelectedHeight);
    if (result.success) {
      trapError = null;
      // Reset selectors after success
      trapSelectedFamily = null;
      trapSelectedRarity = null;
      trapSelectedTier = null;
      trapSelectedGuid = null;
      trapSelectedHeight = null;
      trapStatus = null;
      await refreshModifiedList();
    } else {
      trapError = result.message;
    }
  } catch (err: any) {
    trapError = err.message || 'Unexpected error';
  } finally {
    trapLoading = false;
    draw();
  }
}

async function revertSingleTrap(guid: string): Promise<void> {
  if (trapLoading) return;
  trapLoading = true;
  trapError = null;
  draw();

  try {
    const result = await window.glowAPI.files.trapHeightRevert(guid);
    if (result.success) {
      trapError = null;
      await refreshModifiedList();
    } else {
      trapError = result.message;
    }
  } catch (err: any) {
    trapError = err.message || 'Unexpected error';
  } finally {
    trapLoading = false;
    draw();
  }
}

async function revertAllTraps(): Promise<void> {
  if (trapLoading) return;
  trapLoading = true;
  trapError = null;
  draw();

  try {
    const result = await window.glowAPI.files.trapHeightRevertAll();
    if (result.success) {
      trapSelectedFamily = null;
      trapSelectedRarity = null;
      trapSelectedTier = null;
      trapSelectedGuid = null;
      trapSelectedHeight = null;
      trapStatus = null;
      trapViewMode = 'grid';
      trapModifiedList = [];
      trapModifiedCount = 0;
      trapError = null;
    } else {
      trapError = result.message;
    }
  } catch (err: any) {
    trapError = err.message || 'Unexpected error';
  } finally {
    trapLoading = false;
    draw();
  }
}

// ─── JSON Syntax Highlighting ─────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          const inner = escapeHtml(match.slice(1, -2));
          return `<span class="${cls}">"${inner}"</span>:`;
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${escapeHtml(match)}</span>`;
    }
  );
}

function highlightJson(query: string): void {
  if (!el || !worldInfoData) return;
  const jsonPre = el.querySelector('#files-modal-json') as HTMLPreElement;
  if (!jsonPre) return;

  const jsonStr = JSON.stringify(worldInfoData, null, 2);

  if (!query) {
    jsonPre.innerHTML = syntaxHighlight(jsonStr);
    return;
  }

  let highlighted = syntaxHighlight(jsonStr);

  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    highlighted = highlighted.replace(/>[^<]*</g, (segment) => {
      return segment.replace(regex, '<mark class="json-match">$1</mark>');
    });
  } catch {
    // invalid regex — ignore
  }

  jsonPre.innerHTML = highlighted;

  const firstMatch = jsonPre.querySelector('.json-match');
  if (firstMatch) firstMatch.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ─── Page Definition ──────────────────────────────────────────

export const filesPage: PageDefinition = {
  id: 'files',
  label: 'Files',
  icon: `<img src="assets/icons/fnui/Automated/files.png" alt="Files" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 17,
  render(container) {
    el = container;
    draw();
  },
  cleanup() {
    document.removeEventListener('keydown', handleEsc);
    el = null;
  },
};
