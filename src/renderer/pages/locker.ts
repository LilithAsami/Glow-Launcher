import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;
let generating = false;
let resultImage: string | null = null;  // file:/// URL for display
let resultPath: string | null = null;   // original file path for save
let resultInfo: { count?: number; time?: string; sizeMB?: string } | null = null;
let errorMsg: string | null = null;

// ─── Filter state ────────────────────────────────────────────

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

// ─── Options ─────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Cosmetics' },
  { value: 'outfit', label: 'Outfits' },
  { value: 'backpack', label: 'Backpacks' },
  { value: 'pickaxe', label: 'Pickaxes' },
  { value: 'glider', label: 'Gliders' },
  { value: 'emote', label: 'Emotes' },
  { value: 'spray', label: 'Sprays' },
  { value: 'emoticon', label: 'Emoticons' },
  { value: 'toy', label: 'Toys' },
  { value: 'wrap', label: 'Wraps' },
  { value: 'music', label: 'Music Packs' },
  { value: 'loadingscreen', label: 'Loading Screens' },
  { value: 'contrail', label: 'Contrails' },
];

const RARITY_OPTIONS = [
  { value: 'all', label: 'All Rarities' },
  { value: 'gaminglegends', label: 'Gaming Legends' },
  { value: 'marvel', label: 'Marvel' },
  { value: 'starwars', label: 'Star Wars' },
  { value: 'dc', label: 'DC' },
  { value: 'icon', label: 'Icon Series' },
  { value: 'dark', label: 'Dark Series' },
  { value: 'shadow', label: 'Shadow Series' },
  { value: 'slurp', label: 'Slurp Series' },
  { value: 'frozen', label: 'Frozen Series' },
  { value: 'lava', label: 'Lava Series' },
  { value: 'legendary', label: 'Legendary' },
  { value: 'epic', label: 'Epic' },
  { value: 'rare', label: 'Rare' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'common', label: 'Common' },
];

const CHAPTER_OPTIONS = [
  { value: 'all', label: 'All Chapters' },
  { value: '1', label: 'Chapter 1' },
  { value: '2', label: 'Chapter 2' },
  { value: '3', label: 'Chapter 3' },
  { value: '4', label: 'Chapter 4' },
  { value: '5', label: 'Chapter 5' },
  { value: '6', label: 'Chapter 6' },
  { value: '7', label: 'Chapter 7' },
];

// ─── Helpers ─────────────────────────────────────────────────

function formatSelected(values: string[], options: { value: string; label: string }[]): string {
  if (values.includes('all')) return 'All';
  if (values.length === 0) return 'None';
  if (values.length <= 2) return values.map(v => options.find(o => o.value === v)?.label || v).join(', ');
  return `${values.length} selected`;
}

function buildChipGroup(
  groupId: string,
  options: { value: string; label: string }[],
  selected: string[],
  multi: boolean,
): string {
  return options.map((opt) => {
    const active = selected.includes(opt.value);
    return `<button class="locker-chip ${active ? 'locker-chip-active' : ''}"
              data-group="${groupId}" data-value="${opt.value}" data-multi="${multi}">
              ${opt.label}
            </button>`;
  }).join('');
}

// ─── Drawing ─────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  const typeSummary = formatSelected(filters.types, TYPE_OPTIONS);
  const raritySummary = formatSelected(filters.rarities, RARITY_OPTIONS);
  const chapterSummary = formatSelected(filters.chapters, CHAPTER_OPTIONS);

  el.innerHTML = `
    <div class="locker-page">
      <div class="locker-header">
        <h1 class="page-title">Locker</h1>
        <p class="page-subtitle">Generate your cosmetic locker image</p>
      </div>

      <div class="locker-content">
        <div class="locker-filters">
          <!-- Types -->
          <div class="locker-filter-group">
            <div class="locker-filter-label">
              <span>Cosmetic Type</span>
              <span class="locker-filter-summary">${typeSummary}</span>
            </div>
            <div class="locker-chips" id="chips-types">
              ${buildChipGroup('types', TYPE_OPTIONS, filters.types, true)}
            </div>
          </div>

          <!-- Rarities -->
          <div class="locker-filter-group">
            <div class="locker-filter-label">
              <span>Rarity / Series</span>
              <span class="locker-filter-summary">${raritySummary}</span>
            </div>
            <div class="locker-chips" id="chips-rarities">
              ${buildChipGroup('rarities', RARITY_OPTIONS, filters.rarities, true)}
            </div>
          </div>

          <!-- Chapters -->
          <div class="locker-filter-group">
            <div class="locker-filter-label">
              <span>Chapter</span>
              <span class="locker-filter-summary">${chapterSummary}</span>
            </div>
            <div class="locker-chips" id="chips-chapters">
              ${buildChipGroup('chapters', CHAPTER_OPTIONS, filters.chapters, true)}
            </div>
          </div>

          <!-- Exclusive toggle + Generate -->
          <div class="locker-actions">
            <button class="locker-chip locker-chip-toggle ${filters.exclusive ? 'locker-chip-active' : ''}" id="locker-exclusive">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Exclusives Only
            </button>
            <button class="btn btn-accent locker-generate-btn" id="locker-generate" ${generating ? 'disabled' : ''}>
              ${generating
                ? `<div class="locker-btn-spinner"></div> Generating...`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> Generate Image`}
            </button>
          </div>
        </div>

        <!-- Result area -->
        <div class="locker-result" id="locker-result">
          ${renderResult()}
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

function renderResult(): string {
  if (generating) {
    return `
      <div class="locker-result-loading">
        <div class="locker-spinner"></div>
        <p>Generating locker image...</p>
        <p class="locker-spinner-hint">This may take a moment depending on the number of cosmetics</p>
      </div>
    `;
  }

  if (errorMsg) {
    return `
      <div class="locker-result-error">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <p>${errorMsg}</p>
      </div>
    `;
  }

  if (resultImage) {
    const infoLine = resultInfo
      ? `<span class="locker-result-info">
           <span>${resultInfo.count ?? 0} items &bull; ${resultInfo.time ?? '?'}s &bull; ${resultInfo.sizeMB ?? '?'} MB</span>
           <button class="locker-save-btn" id="locker-save">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
             Save Image
           </button>
         </span>`
      : '';
    return `
      <div class="locker-result-image-wrap">
        ${infoLine}
        <div class="locker-result-img-scroll">
          <img src="${resultImage}" alt="Locker" class="locker-result-img" id="locker-img">
        </div>
      </div>
    `;
  }

  return `
    <div class="locker-result-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" opacity="0.4">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
      <p>Select your filters and click <strong>Generate Image</strong></p>
    </div>
  `;
}

// ─── Events ──────────────────────────────────────────────────

function bindEvents(): void {
  // Chip selection
  el?.querySelectorAll('.locker-chip[data-group]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const group = (chip as HTMLElement).dataset.group as 'types' | 'rarities' | 'chapters';
      const value = (chip as HTMLElement).dataset.value!;

      if (value === 'all') {
        // Clicking "all" resets to all
        filters[group] = ['all'];
      } else {
        // Remove 'all' if present, toggle the selection
        let current = filters[group].filter(v => v !== 'all');
        if (current.includes(value)) {
          current = current.filter(v => v !== value);
        } else {
          current.push(value);
        }
        // If nothing selected, revert to 'all'
        filters[group] = current.length === 0 ? ['all'] : current;
      }
      draw();
    });
  });

  // Exclusive toggle
  el?.querySelector('#locker-exclusive')?.addEventListener('click', () => {
    filters.exclusive = !filters.exclusive;
    draw();
  });

  // Generate button
  el?.querySelector('#locker-generate')?.addEventListener('click', async () => {
    if (generating) return;
    generating = true;
    errorMsg = null;
    resultImage = null;
    resultPath = null;
    resultInfo = null;
    draw();

    try {
      const result = await window.glowAPI.locker.generate({
        types: filters.types,
        rarities: filters.rarities,
        chapters: filters.chapters,
        exclusive: filters.exclusive,
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

  // Save button
  el?.querySelector('#locker-save')?.addEventListener('click', async () => {
    if (!resultPath) return;
    try {
      await window.glowAPI.locker.save(resultPath);
    } catch { /* user cancelled or error */ }
  });
}

// ─── Page Definition ─────────────────────────────────────────

export const lockerPage: PageDefinition = {
  id: 'locker',
  label: 'Locker',
  icon: `<img src="assets/icons/fnui/BR-STW/locker.png" alt="Locker" width="18" height="18" style="object-fit:contain;vertical-align:middle" />`,
  order: 15,

  async render(container: HTMLElement): Promise<void> {
    el = container;
    generating = false;
    errorMsg = null;
    // Keep previous result/filters if returning to page
    draw();
  },

  cleanup(): void {
    el = null;
  },
};
