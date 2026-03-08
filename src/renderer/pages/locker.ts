import type {
  PageDefinition,
  LockerEquippedSlot,
  LockerCosmeticMeta,
  LockerResolvedItem,
  LockerSlotCategory,
} from '../../shared/types';

let el: HTMLElement | null = null;

// ═══════════════════════════════════════════════════════════════
// Locker Management state
// ═══════════════════════════════════════════════════════════════

let mgmtLoading = false;
let mgmtError: string | null = null;
let mgmtSlots: Record<string, LockerEquippedSlot> = {};
let mgmtResolved: Record<string, LockerResolvedItem | null> = {};
let mgmtCategories: LockerSlotCategory[] = [];
let mgmtDisplayName = '';
let mgmtCollapsed = false; // section collapsed state

// Modal state
let modalOpen = false;
let modalSlotKey = '';
let modalSlotLabel = '';
let modalItems: LockerCosmeticMeta[] = [];
let modalLoading = false;
let modalSearch = '';
let modalEquipping = false;

// ═══════════════════════════════════════════════════════════════
// Image Generation state (preserved from original)
// ═══════════════════════════════════════════════════════════════

let generating = false;
let resultImage: string | null = null;
let resultPath: string | null = null;
let resultInfo: { count?: number; time?: string; sizeMB?: string } | null = null;
let errorMsg: string | null = null;
let genCollapsed = false;

interface LockerFilterState {
  types: string[];
  rarities: string[];
  chapters: string[];
  exclusive: boolean;
}

let filters: LockerFilterState = {
  types: ['all'],
  rarities: ['all'],
  chapters: ['all'],
  exclusive: false,
};

// ═══════════════════════════════════════════════════════════════
// Rarity color maps (same as shop, lightweight)
// ═══════════════════════════════════════════════════════════════

const RARITY_COLORS: Record<string, { bg: string; border: string; gradient: [string, string] }> = {
  common:         { bg: '#636363', border: '#8a8a8a', gradient: ['#636363', '#9a9a9a'] },
  uncommon:       { bg: '#319236', border: '#69bb1e', gradient: ['#1d6a1f', '#69bb1e'] },
  rare:           { bg: '#2060a0', border: '#49b3ff', gradient: ['#1a4a7a', '#49b3ff'] },
  epic:           { bg: '#7b2fbe', border: '#c359ff', gradient: ['#5b1d9e', '#c359ff'] },
  legendary:      { bg: '#c36a2d', border: '#f0a440', gradient: ['#a35220', '#f0a440'] },
  mythic:         { bg: '#ba9c36', border: '#f0d850', gradient: ['#a07d1a', '#f0d850'] },
  exotic:         { bg: '#3ab5c5', border: '#7ee8f0', gradient: ['#1e8a9a', '#7ee8f0'] },
  transcendent:   { bg: '#ba9c36', border: '#f0d850', gradient: ['#a07d1a', '#f0d850'] },
  unattainable:   { bg: '#ba9c36', border: '#f0d850', gradient: ['#a07d1a', '#f0d850'] },
};

const SERIES_COLORS: Record<string, { bg: string; border: string; gradient: [string, string] }> = {
  icon:           { bg: '#00546f', border: '#20f2ff', gradient: ['#003040', '#20f2ff'] },
  marvel:         { bg: '#632427', border: '#fe2132', gradient: ['#3a1015', '#fe2132'] },
  dc:             { bg: '#1e2e54', border: '#1b88d0', gradient: ['#0e1830', '#1b88d0'] },
  starwars:       { bg: '#15202a', border: '#c0a040', gradient: ['#0a1018', '#c0a040'] },
  gaminglegends:  { bg: '#1a1a3a', border: '#6060e0', gradient: ['#0a0a2a', '#6060e0'] },
  dark:           { bg: '#3a0050', border: '#b020d0', gradient: ['#200030', '#b020d0'] },
  shadow:         { bg: '#2d3343', border: '#b1b2da', gradient: ['#1a2030', '#b1b2da'] },
  frozen:         { bg: '#1a5080', border: '#80d0ff', gradient: ['#0a3050', '#80d0ff'] },
  lava:           { bg: '#6a2040', border: '#ff5000', gradient: ['#3a1020', '#ff5000'] },
  slurp:          { bg: '#005050', border: '#00d6ec', gradient: ['#002828', '#00d6ec'] },
};

function getColors(rarity: string, series: string | null): { bg: string; border: string; gradient: [string, string] } {
  // Try series first
  if (series) {
    const raw = series.toLowerCase();
    // Strip trailing "series" (with or without whitespace)
    const key = raw.replace(/\s*series$/i, '').replace(/\s+/g, '');
    if (SERIES_COLORS[key]) return SERIES_COLORS[key];

    // Fuzzy fallback for API backendValues like "CreatorCollabSeries", "ColumbusSeries", "PlatformSeries", "CUBESeries"
    if (raw.includes('icon') || raw.includes('idol') || raw.includes('creatorcol')) return SERIES_COLORS.icon;
    if (raw.includes('marvel')) return SERIES_COLORS.marvel;
    if (raw.includes('dc') || raw.includes('dcu')) return SERIES_COLORS.dc;
    if (raw.includes('star') && raw.includes('war') || raw.includes('columbus')) return SERIES_COLORS.starwars;
    if (raw.includes('gaming') || raw.includes('legend') || raw.includes('platform')) return SERIES_COLORS.gaminglegends;
    if (raw.includes('dark') || raw.includes('cube')) return SERIES_COLORS.dark;
    if (raw.includes('shadow') || raw.includes('sombr')) return SERIES_COLORS.shadow;
    if (raw.includes('frozen') || raw.includes('congel')) return SERIES_COLORS.frozen;
    if (raw.includes('lava')) return SERIES_COLORS.lava;
    if (raw.includes('slurp')) return SERIES_COLORS.slurp;
  }

  // Try rarity value (may also contain a series backendValue from the backend)
  const r = rarity.toLowerCase();
  if (RARITY_COLORS[r]) return RARITY_COLORS[r];

  // Rarity string might be a full series backendValue like "marvelseries"
  if (r.includes('marvel')) return SERIES_COLORS.marvel;
  if (r.includes('icon') || r.includes('creatorcol')) return SERIES_COLORS.icon;
  if (r.includes('dcu') || (r.includes('dc') && r.length < 12)) return SERIES_COLORS.dc;
  if (r.includes('columbus') || r.includes('starwar')) return SERIES_COLORS.starwars;
  if (r.includes('platform') || r.includes('gaming')) return SERIES_COLORS.gaminglegends;
  if (r.includes('cube') || r.includes('dark')) return SERIES_COLORS.dark;
  if (r.includes('shadow')) return SERIES_COLORS.shadow;
  if (r.includes('frozen')) return SERIES_COLORS.frozen;
  if (r.includes('lava')) return SERIES_COLORS.lava;
  if (r.includes('slurp')) return SERIES_COLORS.slurp;

  return RARITY_COLORS.common;
}

// ═══════════════════════════════════════════════════════════════
// Slot display labels
// ═══════════════════════════════════════════════════════════════

const SLOT_LABELS: Record<string, string> = {
  character: 'Outfit', backpack: 'Back Bling', pickaxe: 'Pickaxe', glider: 'Glider',
  contrail: 'Contrail', shoes: 'Shoes', aura: 'Aura',
  emote0: 'Emote 1', emote1: 'Emote 2', emote2: 'Emote 3', emote3: 'Emote 4',
  emote4: 'Emote 5', emote5: 'Emote 6', emote6: 'Emote 7', emote7: 'Emote 8',
  wrap0: 'Wrap 1', wrap1: 'Wrap 2', wrap2: 'Wrap 3', wrap3: 'Wrap 4',
  wrap4: 'Wrap 5', wrap5: 'Wrap 6', wrap6: 'Wrap 7',
  bannerIcon: 'Banner Icon', bannerColor: 'Banner Color',
  musicpack: 'Music Pack', loadingscreen: 'Loading Screen',
  guitar: 'Guitar', bass: 'Bass', drum: 'Drums', keyboard: 'Keytar', microphone: 'Mic',
  jamSong0: 'Track 1', jamSong1: 'Track 2', jamSong2: 'Track 3', jamSong3: 'Track 4',
  jamSong4: 'Track 5', jamSong5: 'Track 6', jamSong6: 'Track 7', jamSong7: 'Track 8',
  // Vehicle (Sports)
  vehicleBody: 'Body', vehicleSkin: 'Decal', vehicleWheel: 'Wheels',
  vehicleDriftSmoke: 'Drift Trail', vehicleBooster: 'Booster',
  // Vehicle (SUV)
  suvBody: 'Body', suvSkin: 'Decal', suvWheel: 'Wheels',
  suvDriftSmoke: 'Drift Trail', suvBooster: 'Booster',
  // Companion
  mimosaMain: 'Companion',
};

// ═══════════════════════════════════════════════════════════════
// Options for image generation
// ═══════════════════════════════════════════════════════════════

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Cosmetics' }, { value: 'outfit', label: 'Outfits' },
  { value: 'backpack', label: 'Backpacks' }, { value: 'pickaxe', label: 'Pickaxes' },
  { value: 'glider', label: 'Gliders' }, { value: 'emote', label: 'Emotes' },
  { value: 'spray', label: 'Sprays' }, { value: 'emoticon', label: 'Emoticons' },
  { value: 'toy', label: 'Toys' }, { value: 'wrap', label: 'Wraps' },
  { value: 'music', label: 'Music Packs' }, { value: 'loadingscreen', label: 'Loading Screens' },
  { value: 'contrail', label: 'Contrails' }, { value: 'track', label: 'Tracks' },
  { value: 'banner', label: 'Banners' }, { value: 'guitar', label: 'Guitar' },
  { value: 'bass', label: 'Bass' }, { value: 'drum', label: 'Drums' },
  { value: 'keyboard', label: 'Keyboard' }, { value: 'microphone', label: 'Microphone' },
  { value: 'vehicle', label: 'Vehicles' }, { value: 'companion', label: 'Companion' },
];

const RARITY_OPTIONS = [
  { value: 'all', label: 'All Rarities' }, { value: 'gaminglegends', label: 'Gaming Legends' },
  { value: 'marvel', label: 'Marvel' }, { value: 'starwars', label: 'Star Wars' },
  { value: 'dc', label: 'DC' }, { value: 'icon', label: 'Icon Series' },
  { value: 'dark', label: 'Dark Series' }, { value: 'shadow', label: 'Shadow Series' },
  { value: 'slurp', label: 'Slurp Series' }, { value: 'frozen', label: 'Frozen Series' },
  { value: 'lava', label: 'Lava Series' }, { value: 'legendary', label: 'Legendary' },
  { value: 'epic', label: 'Epic' }, { value: 'rare', label: 'Rare' },
  { value: 'uncommon', label: 'Uncommon' }, { value: 'common', label: 'Common' },
];

const CHAPTER_OPTIONS = [
  { value: 'all', label: 'All Chapters' }, { value: '1', label: 'Chapter 1' },
  { value: '2', label: 'Chapter 2' }, { value: '3', label: 'Chapter 3' },
  { value: '4', label: 'Chapter 4' }, { value: '5', label: 'Chapter 5' },
  { value: '6', label: 'Chapter 6' }, { value: '7', label: 'Chapter 7' },
];

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatSelected(values: string[], options: { value: string; label: string }[]): string {
  if (values.includes('all')) return 'All';
  if (values.length === 0) return 'None';
  if (values.length <= 2) return values.map(v => options.find(o => o.value === v)?.label || v).join(', ');
  return `${values.length} selected`;
}

function buildChipGroup(groupId: string, options: { value: string; label: string }[], selected: string[]): string {
  return options.map((opt) => {
    const active = selected.includes(opt.value);
    return `<button class="locker-chip ${active ? 'locker-chip-active' : ''}"
              data-group="${groupId}" data-value="${opt.value}">
              ${opt.label}
            </button>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// Locker Management: data loading
// ═══════════════════════════════════════════════════════════════

async function loadLoadout(): Promise<void> {
  mgmtLoading = true;
  mgmtError = null;
  draw();

  try {
    const [loadoutRes, cats] = await Promise.all([
      window.glowAPI.lockermgmt.getLoadout(),
      window.glowAPI.lockermgmt.getCategories(),
    ]);

    mgmtSlots = loadoutRes.slots;
    mgmtDisplayName = loadoutRes.displayName;
    mgmtCategories = cats;

    // Collect all equipped item IDs to resolve metadata
    const itemIds = Object.values(mgmtSlots)
      .map((s) => s.itemId)
      .filter((id): id is string => !!id);

    if (itemIds.length > 0) {
      mgmtResolved = await window.glowAPI.lockermgmt.resolveItems(itemIds);
    }
  } catch (err: any) {
    mgmtError = err?.message || 'Failed to load locker';
  }

  mgmtLoading = false;
  draw();
}

// ═══════════════════════════════════════════════════════════════
// Main draw
// ═══════════════════════════════════════════════════════════════

function draw(): void {
  if (!el) return;

  el.innerHTML = `
    <div class="locker-page">
      <div class="locker-header">
        <h1 class="page-title">Locker</h1>
        <p class="page-subtitle">Manage your equipped cosmetics and generate locker images</p>
      </div>

      ${renderLockerManagement()}
      ${renderImageGeneration()}
    </div>
  `;

  bindAllEvents();
  if (modalOpen) renderModal();
}

// ═══════════════════════════════════════════════════════════════
// Locker Management section
// ═══════════════════════════════════════════════════════════════

function renderLockerManagement(): string {
  const chevron = mgmtCollapsed ? '▸' : '▾';
  const headerExtra = mgmtDisplayName && !mgmtLoading ? ` — ${esc(mgmtDisplayName)}` : '';

  let content = '';
  if (mgmtCollapsed) {
    content = '';
  } else if (mgmtLoading) {
    content = `
      <div class="lm-loading">
        <div class="locker-spinner"></div>
        <p>Loading locker data...</p>
      </div>`;
  } else if (mgmtError) {
    content = `
      <div class="lm-error">
        <p>${esc(mgmtError)}</p>
        <button class="btn btn-accent lm-retry-btn" id="lm-retry">Retry</button>
      </div>`;
  } else if (mgmtCategories.length === 0 && !mgmtLoading) {
    content = `
      <div class="lm-loading">
        <div class="locker-spinner"></div>
        <p>Loading locker data...</p>
      </div>`;
    // auto-load on first render
    if (!mgmtError) setTimeout(() => loadLoadout(), 0);
  } else {
    content = `<div class="lm-body">${renderSlotGrid()}</div>`;
  }

  return `
    <div class="lm-section">
      <div class="lm-section-header" id="lm-toggle-collapse">
        <h2 class="lm-section-title">${chevron} Locker Management${headerExtra}</h2>
        ${!mgmtCollapsed && mgmtCategories.length > 0 ? `<button class="btn btn-sm btn-accent" id="lm-refresh">Refresh</button>` : ''}
      </div>
      ${content}
    </div>`;
}

function renderSlotGrid(): string {
  return mgmtCategories.map((cat) => {
    const slotsHtml = cat.slots.map((slotKey) => {
      const equipped = mgmtSlots[slotKey];
      const itemId = equipped?.itemId;
      const info = itemId ? mgmtResolved[itemId] : null;
      const colors = info ? getColors(info.rarity, info.series) : null;
      const label = SLOT_LABELS[slotKey] || slotKey;

      if (!itemId || !info) {
        return `
          <div class="lm-slot lm-slot-empty" data-slot="${slotKey}" title="${esc(label)}">
            <div class="lm-slot-inner">
              <div class="lm-slot-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" opacity=".4">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
              </div>
            </div>
            <span class="lm-slot-label">${esc(label)}</span>
          </div>`;
      }

      // Banner color: show colored swatch as background
      const isBannerColor = slotKey === 'bannerColor';
      const bannerHex = (info as any)?.color as string | undefined;

      // Choose inner content
      let innerContent: string;
      if (isBannerColor && bannerHex) {
        innerContent = `<div class="lm-slot-color" style="background:${bannerHex}"></div>`;
      } else if (info.imageUrl) {
        innerContent = `<img class="lm-slot-img" src="${esc(info.imageUrl)}" alt="${esc(info.name)}" loading="lazy" />`;
      } else {
        innerContent = `<div class="lm-slot-noimg">${esc(info.name.charAt(0).toUpperCase())}</div>`;
      }

      return `
        <div class="lm-slot" data-slot="${slotKey}" title="${esc(info.name)}"
             style="--slot-bg:${colors!.bg};--slot-border:${colors!.border};--slot-grad-start:${colors!.gradient[0]};--slot-grad-end:${colors!.gradient[1]}">
          <div class="lm-slot-inner lm-slot-filled">
            ${innerContent}
          </div>
          <span class="lm-slot-label">${esc(label)}</span>
          <span class="lm-slot-name">${esc(info.name)}</span>
        </div>`;
    }).join('');

    return `
      <div class="lm-category">
        <h3 class="lm-category-title">${esc(cat.label)}</h3>
        <div class="lm-slots-row">${slotsHtml}</div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// Image Generation section (preserved logic)
// ═══════════════════════════════════════════════════════════════

function renderImageGeneration(): string {
  const chevron = genCollapsed ? '▸' : '▾';

  let content = '';
  if (!genCollapsed) {
    const typeSummary = formatSelected(filters.types, TYPE_OPTIONS);
    const raritySummary = formatSelected(filters.rarities, RARITY_OPTIONS);
    const chapterSummary = formatSelected(filters.chapters, CHAPTER_OPTIONS);

    content = `
      <div class="locker-content lm-gen-body">
        <div class="locker-filters">
          <div class="locker-filter-group">
            <div class="locker-filter-label"><span>Cosmetic Type</span><span class="locker-filter-summary">${typeSummary}</span></div>
            <div class="locker-chips" id="chips-types">${buildChipGroup('types', TYPE_OPTIONS, filters.types)}</div>
          </div>
          <div class="locker-filter-group">
            <div class="locker-filter-label"><span>Rarity / Series</span><span class="locker-filter-summary">${raritySummary}</span></div>
            <div class="locker-chips" id="chips-rarities">${buildChipGroup('rarities', RARITY_OPTIONS, filters.rarities)}</div>
          </div>
          <div class="locker-filter-group">
            <div class="locker-filter-label"><span>Chapter</span><span class="locker-filter-summary">${chapterSummary}</span></div>
            <div class="locker-chips" id="chips-chapters">${buildChipGroup('chapters', CHAPTER_OPTIONS, filters.chapters)}</div>
          </div>
          <div class="locker-actions">
            <button class="locker-chip locker-chip-toggle ${filters.exclusive ? 'locker-chip-active' : ''}" id="locker-exclusive">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Exclusives Only
            </button>
            <button class="btn locker-generate-btn locker-generate-equipped-btn" id="locker-generate-equipped" ${generating ? 'disabled' : ''}>
              ${generating
                ? `<div class="locker-btn-spinner"></div> Generating...`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Generate Equipped`}
            </button>
            <button class="btn btn-accent locker-generate-btn" id="locker-generate" ${generating ? 'disabled' : ''}>
              ${generating
                ? `<div class="locker-btn-spinner"></div> Generating...`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> Generate Image`}
            </button>
          </div>
        </div>
        <div class="locker-result" id="locker-result">${renderResult()}</div>
      </div>`;
  }

  return `
    <div class="lm-section lm-section-gen">
      <div class="lm-section-header" id="gen-toggle-collapse">
        <h2 class="lm-section-title">${chevron} Image Generation</h2>
      </div>
      ${content}
    </div>`;
}

function renderResult(): string {
  if (generating) {
    return `<div class="locker-result-loading"><div class="locker-spinner"></div><p>Generating locker image...</p><p class="locker-spinner-hint">This may take a moment depending on the number of cosmetics</p></div>`;
  }
  if (errorMsg) {
    return `<div class="locker-result-error"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><p>${errorMsg}</p></div>`;
  }
  if (resultImage) {
    const info = resultInfo
      ? `<span class="locker-result-info"><span>${resultInfo.count ?? 0} items &bull; ${resultInfo.time ?? '?'}s &bull; ${resultInfo.sizeMB ?? '?'} MB</span><button class="locker-save-btn" id="locker-save"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Save Image</button></span>`
      : '';
    return `<div class="locker-result-image-wrap">${info}<div class="locker-result-img-scroll"><img src="${resultImage}" alt="Locker" class="locker-result-img" id="locker-img"></div></div>`;
  }
  return `<div class="locker-result-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" opacity="0.4"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><p>Select your filters and click <strong>Generate Image</strong></p></div>`;
}

// ═══════════════════════════════════════════════════════════════
// Modal: cosmetic picker
// ═══════════════════════════════════════════════════════════════

async function openSlotModal(slotKey: string): Promise<void> {
  modalSlotKey = slotKey;
  modalSlotLabel = SLOT_LABELS[slotKey] || slotKey;
  modalOpen = true;
  modalSearch = '';
  modalLoading = true;
  modalItems = [];
  modalEquipping = false;
  renderModal();

  try {
    modalItems = await window.glowAPI.lockermgmt.getOwnedForSlot(slotKey);
    // Sort: rarity weight descending, then name ascending
    const rar = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    modalItems.sort((a, b) => {
      const wa = rar.indexOf(a.rarity) === -1 ? -1 : rar.indexOf(a.rarity);
      const wb = rar.indexOf(b.rarity) === -1 ? -1 : rar.indexOf(b.rarity);
      if (wa !== wb) return wa - wb;
      return a.name.localeCompare(b.name);
    });
  } catch (err: any) {
    // Show error in modal
    modalItems = [];
  }

  modalLoading = false;
  renderModal();
}

function renderModal(): void {
  // Remove any existing modal
  document.querySelector('.lm-modal-overlay')?.remove();
  if (!modalOpen) return;

  const overlay = document.createElement('div');
  overlay.className = 'lm-modal-overlay';

  const filtered = modalSearch
    ? modalItems.filter((i) => i.name.toLowerCase().includes(modalSearch.toLowerCase()))
    : modalItems;

  // Currently equipped item ID for this slot
  const currentItemId = mgmtSlots[modalSlotKey]?.itemId;

  const itemsHtml = filtered.length === 0
    ? (modalLoading
        ? `<div class="lm-modal-loading"><div class="locker-spinner"></div><p>Loading cosmetics...</p></div>`
        : `<p class="lm-modal-empty">No cosmetics found for this slot.</p>`)
    : `<div class="lm-modal-grid"><div class="lm-modal-card lm-modal-card-remove" data-itemid="" title="Remove cosmetic">
            <div class="lm-modal-card-img-wrap" style="--card-grad-start:#1a1a2e;--card-grad-end:#16213e">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
            <span class="lm-modal-card-name">Remove</span>
          </div>${filtered.map((item) => {
        const c = getColors(item.rarity, item.series);
        // Normalize IDs: companions may have variant suffix (:70c) in EOS but not in MCP
        const normCmp = (s: string) => { const p = s.split(':'); return p.length > 2 ? p.slice(0, 2).join(':') : s; };
        const isCurrent = normCmp(item.itemId) === normCmp(currentItemId || '');
        const itemColor = (item as any).color as string | undefined;
        const isBannerColorItem = modalSlotKey === 'bannerColor';

        let imgContent: string;
        if (isBannerColorItem && itemColor) {
          imgContent = `<div class="lm-modal-card-color" style="background:${itemColor}"></div>`;
        } else if (item.imageUrl) {
          imgContent = `<img class="lm-modal-card-img" src="${esc(item.imageUrl)}" alt="${esc(item.name)}" loading="lazy" />`;
        } else {
          imgContent = `<div class="lm-modal-card-noimg">${esc(item.name.charAt(0).toUpperCase())}</div>`;
        }

        return `
          <div class="lm-modal-card ${isCurrent ? 'lm-modal-card-current' : ''}" data-itemid="${esc(item.itemId)}"
               style="--card-bg:${c.bg};--card-border:${c.border};--card-grad-start:${c.gradient[0]};--card-grad-end:${c.gradient[1]}"
               title="${esc(item.name)}">
            <div class="lm-modal-card-img-wrap">
              ${imgContent}
            </div>
            <span class="lm-modal-card-name">${esc(item.name)}</span>
            ${isCurrent ? `<span class="lm-modal-card-badge">Equipped</span>` : ''}
          </div>`;
      }).join('')}</div>`;

  overlay.innerHTML = `
    <div class="lm-modal">
      <div class="lm-modal-header">
        <h3 class="lm-modal-title">Select ${esc(modalSlotLabel)}</h3>
        <span class="lm-modal-count">${filtered.length} / ${modalItems.length} items</span>
        <button class="lm-modal-close" id="lm-modal-close">&times;</button>
      </div>
      <div class="lm-modal-search-wrap">
        <input type="text" class="lm-modal-search" id="lm-modal-search" placeholder="Search..." value="${esc(modalSearch)}" />
      </div>
      <div class="lm-modal-body" id="lm-modal-body">
        ${itemsHtml}
      </div>
      ${modalEquipping ? `<div class="lm-modal-equipping"><div class="locker-spinner"></div> Equipping...</div>` : ''}
    </div>`;

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  // Event: close button
  overlay.querySelector('#lm-modal-close')?.addEventListener('click', closeModal);

  // Event: search
  const searchInput = overlay.querySelector<HTMLInputElement>('#lm-modal-search');
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  searchInput?.addEventListener('input', () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      modalSearch = searchInput.value;
      renderModal();
      // Re-focus and restore cursor
      const newInput = document.querySelector<HTMLInputElement>('#lm-modal-search');
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(newInput.value.length, newInput.value.length);
      }
    }, 200);
  });

  // Event: card click → equip
  overlay.querySelectorAll<HTMLElement>('.lm-modal-card').forEach((card) => {
    card.addEventListener('click', async () => {
      const itemId = card.dataset.itemid ?? '';
      if (modalEquipping) return;
      // "Remove" card sends empty string; regular cards skip if already equipped
      // Normalize IDs for comparison (companion IDs may have variant suffixes like ":70c")
      const normId = (s: string) => { const p = s.split(':'); return p.length > 2 ? p.slice(0, 2).join(':') : s; };
      if (itemId && normId(itemId) === normId(currentItemId || '')) return;

      modalEquipping = true;
      renderModal();

      try {
        const result = await window.glowAPI.lockermgmt.equip(modalSlotKey, itemId);
        if (result.success) {
          // Update local state — create entry if it doesn't exist
          if (mgmtSlots[modalSlotKey]) {
            mgmtSlots[modalSlotKey].itemId = itemId || null;
          } else {
            mgmtSlots[modalSlotKey] = { slotKey: modalSlotKey, itemId: itemId || null, customizations: [], schema: '' } as any;
          }
          // Re-resolve the new item (skip if removing)
          if (itemId) {
            const resolved = await window.glowAPI.lockermgmt.resolveItems([itemId]);
            Object.assign(mgmtResolved, resolved);
          }
          closeModal();
          draw();
          return;
        }
        // Show error briefly
        alert(`Failed to equip: ${result.error || 'Unknown error'}`);
      } catch (err: any) {
        alert(`Error: ${err?.message || 'Unknown'}`);
      }

      modalEquipping = false;
      renderModal();
    });
  });

  // Focus search on open
  searchInput?.focus();
}

function closeModal(): void {
  modalOpen = false;
  modalEquipping = false;
  const overlay = document.querySelector('.lm-modal-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  }
}

// ═══════════════════════════════════════════════════════════════
// All event bindings
// ═══════════════════════════════════════════════════════════════

function bindAllEvents(): void {
  if (!el) return;

  // ── Locker Management events ──

  // Toggle collapse
  el.querySelector('#lm-toggle-collapse')?.addEventListener('click', () => {
    mgmtCollapsed = !mgmtCollapsed;
    draw();
  });

  // Load loadout button
  el.querySelector('#lm-load')?.addEventListener('click', () => loadLoadout());

  // Retry button
  el.querySelector('#lm-retry')?.addEventListener('click', () => loadLoadout());

  // Refresh button
  el.querySelector('#lm-refresh')?.addEventListener('click', (e) => {
    e.stopPropagation();
    loadLoadout();
  });

  // Slot click → open modal
  el.querySelectorAll<HTMLElement>('.lm-slot').forEach((slot) => {
    slot.addEventListener('click', () => {
      const slotKey = slot.dataset.slot;
      if (slotKey) openSlotModal(slotKey);
    });
  });

  // ── Image generation events ──

  el.querySelector('#gen-toggle-collapse')?.addEventListener('click', () => {
    genCollapsed = !genCollapsed;
    draw();
  });

  // Chip selection
  el.querySelectorAll('.locker-chip[data-group]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const group = (chip as HTMLElement).dataset.group as 'types' | 'rarities' | 'chapters';
      const value = (chip as HTMLElement).dataset.value!;
      if (value === 'all') {
        filters[group] = ['all'];
      } else {
        let current = filters[group].filter(v => v !== 'all');
        if (current.includes(value)) current = current.filter(v => v !== value);
        else current.push(value);
        filters[group] = current.length === 0 ? ['all'] : current;
      }
      draw();
    });
  });

  el.querySelector('#locker-exclusive')?.addEventListener('click', () => {
    filters.exclusive = !filters.exclusive;
    draw();
  });

  // Generate Equipped — image of only currently equipped items
  el.querySelector('#locker-generate-equipped')?.addEventListener('click', async () => {
    if (generating) return;
    // Collect equipped item IDs from locker management
    const equippedIds = Object.values(mgmtSlots)
      .map((s) => s.itemId)
      .filter((id): id is string => !!id);
    if (equippedIds.length === 0) {
      errorMsg = 'No equipped items found. Load your locker first in Locker Management.';
      draw();
      return;
    }
    generating = true;
    errorMsg = null;
    resultImage = null;
    resultPath = null;
    resultInfo = null;
    draw();
    try {
      const result = await window.glowAPI.locker.generate({
        types: ['all'], rarities: ['all'],
        chapters: ['all'], exclusive: false,
        equippedItemIds: equippedIds,
      });
      if (result.success && result.path) {
        resultPath = result.path;
        resultImage = `file:///${result.path.replace(/\\/g, '/')}`;
        resultInfo = { count: result.count, time: result.time, sizeMB: result.sizeMB };
      } else {
        errorMsg = result.error || 'Failed to generate equipped image';
      }
    } catch (err: any) {
      errorMsg = err?.message || 'Unexpected error generating equipped image';
    }
    generating = false;
    draw();
  });

  el.querySelector('#locker-generate')?.addEventListener('click', async () => {
    if (generating) return;
    generating = true;
    errorMsg = null;
    resultImage = null;
    resultPath = null;
    resultInfo = null;
    draw();
    try {
      const result = await window.glowAPI.locker.generate({
        types: filters.types, rarities: filters.rarities,
        chapters: filters.chapters, exclusive: filters.exclusive,
      });
      if (result.success && result.path) {
        resultPath = result.path;
        resultImage = `file:///${result.path.replace(/\\/g, '/')}`;
        resultInfo = { count: result.count, time: result.time, sizeMB: result.sizeMB };
      } else {
        errorMsg = result.error || 'Failed to generate locker image';
      }
    } catch (err: any) {
      errorMsg = err?.message || 'Unexpected error generating locker';
    }
    generating = false;
    draw();
  });

  el.querySelector('#locker-save')?.addEventListener('click', async () => {
    if (!resultPath) return;
    try { await window.glowAPI.locker.save(resultPath); } catch { /* cancelled */ }
  });

  // Right-click on generated image → copy to clipboard
  el.querySelector('#locker-img')?.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const img = e.target as HTMLImageElement;
    if (!img?.src) return;
    try {
      const resp = await fetch(img.src);
      const blob = await resp.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      // Brief visual feedback
      const wrap = img.closest('.locker-result-img-scroll');
      if (wrap) {
        const toast = document.createElement('div');
        toast.className = 'lm-copy-toast';
        toast.textContent = 'Copied to clipboard!';
        wrap.appendChild(toast);
        setTimeout(() => toast.remove(), 1500);
      }
    } catch { /* clipboard write not supported or failed */ }
  });
}

// ═══════════════════════════════════════════════════════════════
// Account switch handler
// ═══════════════════════════════════════════════════════════════

function onAccountChanged(): void {
  mgmtSlots = {};
  mgmtResolved = {};
  mgmtCategories = [];
  mgmtDisplayName = '';
  mgmtError = null;
  mgmtLoading = false;
  draw();
  loadLoadout();
}

// ═══════════════════════════════════════════════════════════════
// Page Definition
// ═══════════════════════════════════════════════════════════════

export const lockerPage: PageDefinition = {
  id: 'locker',
  label: 'Locker',
  icon: `<img src="assets/icons/fnui/BR-STW/locker.png" alt="Locker" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 15,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    generating = false;
    errorMsg = null;
    draw();
    // Auto-load locker data on page enter
    loadLoadout();
    // Listen for account switch
    window.addEventListener('glow:account-switched', onAccountChanged);
  },

  cleanup(): void {
    closeModal();
    window.removeEventListener('glow:account-switched', onAccountChanged);
    el = null;
  },
};
