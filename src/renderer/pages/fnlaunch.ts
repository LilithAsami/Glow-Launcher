import type { PageDefinition } from '../../shared/types';

let el: HTMLElement | null = null;

// ── State ─────────────────────────────────────────────────────
let loading = false;
let error: string | null = null;
let iniPath: string | null = null;

interface GameSettings {
  resolutionX: number; resolutionY: number; windowMode: number;
  vsync: boolean; frameRateLimit: number; renderingMode: string;
  displayGamma: number; userInterfaceContrast: number;
  motionBlur: boolean; uiParallax: boolean; showFps: boolean;
  viewDistance: number; shadows: number; antiAliasingQuality: number;
  textures: number; effects: number; postProcess: number;
  globalIllumination: number; reflections: number; foliage: number;
  resolutionQuality: number;
  antiAliasingMethod: string; tsrQuality: string;
  dynamicResolution: boolean; nanite: boolean;
  desiredGIQuality: number; desiredReflectionQuality: number;
  rayTracing: boolean; showGrass: boolean;
}

interface LaunchSettings {
  launchArgs: string;
  processKiller: { enabled: boolean; processes: { name: string; mode: 'startup' | 'always' }[] };
}

let gameSettings: GameSettings | null = null;
let launchSettings: LaunchSettings = { launchArgs: '', processKiller: { enabled: false, processes: [] } };
let activeTab: 'video' | 'launch' | 'killer' = 'video';

// ── Helpers ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Value definitions for arrow controls: [values[], labels[]]
type ValDef = { v: string[]; l: string[]; parse: (s: string) => unknown };
const bool: ValDef = { v: ['false','true'], l: ['Off','On'], parse: s => s === 'true' };

const VALS: Record<string, ValDef> = {
  windowMode:       { v: ['0','1','2'], l: ['Fullscreen','Windowed Fullscreen','Windowed'], parse: Number },
  vsync:            bool,
  frameRateLimit:   { v: ['30','60','120','144','160','165','180','200','240','360','0'], l: ['30','60','120','144','160','165','180','200','240','360','Unlimited'], parse: Number },
  renderingMode:    { v: ['dx11','dx12','performance'], l: ['DirectX 11','DirectX 12','Performance'], parse: String },
  motionBlur:       bool,
  uiParallax:       bool,
  showFps:          bool,
  viewDistance:      { v: ['0','1','2','3'], l: ['Near','Medium','Far','Epic'], parse: Number },
  shadows:          { v: ['0','1','2','3'], l: ['Near','Medium','Far','Epic'], parse: Number },
  antiAliasingQuality: { v: ['0','1','2','3'], l: ['Off','Low','Medium','High'], parse: Number },
  textures:         { v: ['0','1','2','3'], l: ['Low','Medium','High','Epic'], parse: Number },
  effects:          { v: ['0','1','2','3'], l: ['Low','Medium','High','Epic'], parse: Number },
  postProcess:      { v: ['0','1','2','3'], l: ['Low','Medium','High','Epic'], parse: Number },
  globalIllumination: { v: ['0','1','2','3'], l: ['Low','Medium','High','Epic'], parse: Number },
  reflections:      { v: ['0','1','2','3'], l: ['Low','Medium','High','Epic'], parse: Number },
  foliage:          { v: ['0','1','2','3'], l: ['Off','Low','Medium','Epic'], parse: Number },
  antiAliasingMethod: { v: ['None','Fxaa','Smaa','Taa','TSRLow','TSRMedium','TSRHigh','TSREpic'], l: ['None','FXAA','SMAA','TAA','TSR Low','TSR Medium','TSR High','TSR Epic'], parse: String },
  tsrQuality:       { v: ['Performance','Balanced','Quality','Native'], l: ['Performance','Balanced','Quality','Native'], parse: String },
  dynamicResolution: bool,
  nanite:           bool,
  desiredGIQuality: { v: ['0','1','2'], l: ['Disabled','Ambient Occlusion','Lumen'], parse: Number },
  desiredReflectionQuality: { v: ['0','1','2'], l: ['Disabled','Screen Space','Lumen'], parse: Number },
  rayTracing:       bool,
  showGrass:        bool,
};

function cycleValue(key: string, dir: number): void {
  if (!gameSettings) return;
  const def = VALS[key];
  if (!def) return;
  const cur = String((gameSettings as any)[key]);
  const idx = def.v.indexOf(cur);
  const next = Math.max(0, Math.min(def.v.length - 1, idx + dir));
  (gameSettings as any)[key] = def.parse(def.v[next]);
  draw();
}

function arrowCtrl(key: string): string {
  if (!gameSettings) return '';
  const def = VALS[key];
  if (!def) return '';
  const cur = String((gameSettings as any)[key]);
  const idx = def.v.indexOf(cur);
  const label = idx >= 0 ? def.l[idx] : cur;
  const atMin = idx <= 0;
  const atMax = idx >= def.v.length - 1;
  return `<div class="fnl-arrow-ctrl">
    <button class="fnl-arrow${atMin ? ' fnl-arrow--dim' : ''}" data-key="${key}" data-dir="-1">‹</button>
    <span class="fnl-arrow-label">${esc(label)}</span>
    <button class="fnl-arrow${atMax ? ' fnl-arrow--dim' : ''}" data-key="${key}" data-dir="1">›</button>
  </div>`;
}

function settingRow(label: string, desc: string, control: string): string {
  return `<div class="fnl-row">
    <div class="fnl-row-info"><span class="fnl-row-label">${label}</span><span class="fnl-row-desc">${desc}</span></div>
    <div class="fnl-row-control">${control}</div>
  </div>`;
}

// ── Draw ──────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;
  const page = el.querySelector('.fnl-page');
  const scrollTop = page?.scrollTop ?? 0;

  el.innerHTML = `
    <div class="fnl-page">
      <div class="fnl-header">
        <h1 class="page-title">FN Launch Settings</h1>
        <p class="page-subtitle">Game settings, launch arguments & process management</p>
      </div>

      ${error ? `<div class="fnl-error">${esc(error)}</div>` : ''}

      <div class="fnl-tabs">
        ${renderTab('video', 'Video')}
        ${renderTab('launch', 'Launch Args')}
        ${renderTab('killer', 'Process Killer')}
      </div>

      <div class="fnl-body">
        ${loading ? `<div class="fnl-loading"><div class="fnl-spinner"></div><span>Reading game settings…</span></div>` : renderActiveTab()}
      </div>

      ${iniPath ? `<div class="fnl-ini-path" title="${esc(iniPath)}">INI: ${esc(iniPath)}</div>` : ''}
    </div>
  `;

  const newPage = el.querySelector('.fnl-page');
  if (newPage && scrollTop > 0) newPage.scrollTop = scrollTop;
  bindEvents();
}

function renderTab(id: string, label: string): string {
  return `<button class="fnl-tab ${activeTab === id ? 'fnl-tab--active' : ''}" data-tab="${id}">${label}</button>`;
}

function renderActiveTab(): string {
  switch (activeTab) {
    case 'video': return gameSettings ? renderVideo() : '<div class="fnl-empty">Game settings not available. Launch Fortnite at least once.</div>';
    case 'launch': return renderLaunch();
    case 'killer': return renderKiller();
  }
}

// ── Video tab (Display + Graphics + Quality + Advanced) ───────

function renderVideo(): string {
  const s = gameSettings!;
  return `
    ${sectionTitle('Display')}
    <div class="fnl-section">
      ${settingRow('Window Mode', 'Fullscreen / Windowed / Windowed Fullscreen', arrowCtrl('windowMode'))}
      <div class="fnl-row">
        <div class="fnl-row-info"><span class="fnl-row-label">Resolution</span><span class="fnl-row-desc">Game render resolution</span></div>
        <div class="fnl-row-control fnl-res-group">
          <input type="number" class="fnl-input fnl-input--sm" id="fnl-resX" value="${s.resolutionX}" min="640" max="7680" />
          <span class="fnl-res-x">×</span>
          <input type="number" class="fnl-input fnl-input--sm" id="fnl-resY" value="${s.resolutionY}" min="360" max="4320" />
        </div>
      </div>
      ${settingRow('Vsync', 'Vertical synchronization', arrowCtrl('vsync'))}
      ${settingRow('Frame Rate Limit', 'Max FPS in game (Unlimited = uncapped)', arrowCtrl('frameRateLimit'))}
      ${settingRow('Rendering Mode', 'Graphics API (DX11, DX12, or Performance)', arrowCtrl('renderingMode'))}
    </div>

    ${sectionTitle('Graphics')}
    <div class="fnl-section">
      <div class="fnl-row">
        <div class="fnl-row-info"><span class="fnl-row-label">Brightness</span><span class="fnl-row-desc">Display gamma (1.0 darker → 2.2 default)</span></div>
        <div class="fnl-row-control">
          <input type="number" class="fnl-input fnl-input--sm" id="fnl-gamma" value="${s.displayGamma.toFixed(1)}" min="1.0" max="2.2" step="0.1" />
        </div>
      </div>
      <div class="fnl-row">
        <div class="fnl-row-info"><span class="fnl-row-label">User Interface Contrast</span><span class="fnl-row-desc">UI contrast level (0.5 – 2.0)</span></div>
        <div class="fnl-row-control">
          <input type="number" class="fnl-input fnl-input--sm" id="fnl-contrast" value="${s.userInterfaceContrast.toFixed(1)}" min="0.5" max="2.0" step="0.1" />
        </div>
      </div>
      ${settingRow('Motion Blur', 'Camera motion blur effect', arrowCtrl('motionBlur'))}
      ${settingRow('UI Parallax', 'Parallax motion on UI elements', arrowCtrl('uiParallax'))}
      ${settingRow('Show FPS', 'Display FPS counter in-game', arrowCtrl('showFps'))}
    </div>

    ${sectionTitle('Graphics Quality')}
    <div class="fnl-section">
      ${settingRow('View Distance', 'How far objects render', arrowCtrl('viewDistance'))}
      ${settingRow('Shadows', 'Shadow resolution and distance', arrowCtrl('shadows'))}
      ${settingRow('Anti-Aliasing', 'Edge smoothing quality', arrowCtrl('antiAliasingQuality'))}
      ${settingRow('Textures', 'Texture resolution', arrowCtrl('textures'))}
      ${settingRow('Effects', 'Particle and visual effects', arrowCtrl('effects'))}
      ${settingRow('Post Processing', 'Post-process effects quality', arrowCtrl('postProcess'))}
      ${settingRow('Global Illumination', 'Indirect lighting quality', arrowCtrl('globalIllumination'))}
      ${settingRow('Reflections', 'Reflection quality', arrowCtrl('reflections'))}
      ${settingRow('Foliage', 'Grass and vegetation density', arrowCtrl('foliage'))}
      <div class="fnl-row">
        <div class="fnl-row-info"><span class="fnl-row-label">Resolution Quality (3D%)</span><span class="fnl-row-desc">3D resolution scale (25 – 100)</span></div>
        <div class="fnl-row-control">
          <input type="number" class="fnl-input fnl-input--sm" id="fnl-resQ" value="${s.resolutionQuality}" min="25" max="100" step="5" />
        </div>
      </div>
    </div>

    ${sectionTitle('Advanced Graphics Quality')}
    <div class="fnl-section">
      ${settingRow('Anti-Aliasing Method', 'Type of anti-aliasing algorithm', arrowCtrl('antiAliasingMethod'))}
      ${settingRow('Temporal Super Resolution', 'TSR quality preset', arrowCtrl('tsrQuality'))}
      ${settingRow('Dynamic 3D Resolution', 'Dynamically adjust render resolution', arrowCtrl('dynamicResolution'))}
      ${settingRow('Nanite', 'Virtualized geometry (requires DX12)', arrowCtrl('nanite'))}
      ${settingRow('Global Illumination Mode', 'Lumen requires Nanite', arrowCtrl('desiredGIQuality'))}
      ${settingRow('Reflections Mode', 'Lumen requires Lumen GI', arrowCtrl('desiredReflectionQuality'))}
      ${settingRow('Ray Tracing', 'Hardware RT (requires Nanite + Lumen + DX12)', arrowCtrl('rayTracing'))}
      ${settingRow('Show Grass', 'Render grass and ground cover', arrowCtrl('showGrass'))}
    </div>

    <button class="fnl-save-btn" id="fnl-save-video">Save</button>
  `;
}

function sectionTitle(title: string): string {
  return `<div class="fnl-section-title">${title}</div>`;
}

// ── Launch Args tab ───────────────────────────────────────────

function renderLaunch(): string {
  return `
    <div class="fnl-section">
      <div class="fnl-row fnl-row--col">
        <div class="fnl-row-info">
          <span class="fnl-row-label">Launch Arguments</span>
          <span class="fnl-row-desc">Extra command-line arguments appended when starting Fortnite</span>
        </div>
        <input type="text" class="fnl-input fnl-input--wide" id="fnl-launchArgs"
               value="${esc(launchSettings.launchArgs)}"
               placeholder="-NOTEXTURESTREAMING -USEALLAVAILABLECORES" />
      </div>
    </div>
    <button class="fnl-save-btn" id="fnl-save-launch">Save</button>
  `;
}

// ── Process Killer tab ────────────────────────────────────────

function renderKiller(): string {
  const pk = launchSettings.processKiller;
  return `
    <div class="fnl-section">
      <div class="fnl-admin-warning">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>Glow Launcher must be run as <strong>Administrator</strong> to kill external processes.</span>
      </div>

      <div class="fnl-row">
        <div class="fnl-row-info">
          <span class="fnl-row-label">Process Killer</span>
          <span class="fnl-row-desc">Automatically terminate processes when Fortnite is running</span>
        </div>
        <label class="fnl-toggle">
          <input type="checkbox" class="fnl-toggle-input" id="fnl-pk-enabled" ${pk.enabled ? 'checked' : ''} />
          <span class="fnl-toggle-slider"></span>
        </label>
      </div>

      <div class="fnl-divider"></div>

      <div class="fnl-add-proc">
        <input type="text" class="fnl-input fnl-input--proc" id="fnl-proc-name" placeholder="process.exe" />
        <select class="fnl-select fnl-select--sm" id="fnl-proc-mode">
          <option value="startup">Startup (3 min)</option>
          <option value="always">Always</option>
        </select>
        <button class="fnl-add-btn" id="fnl-proc-add">Add</button>
      </div>

      ${pk.processes.length > 0 ? `
        <div class="fnl-proc-list">
          ${pk.processes.map((p, i) => `
            <div class="fnl-proc-item">
              <span class="fnl-proc-name">${esc(p.name)}</span>
              <span class="fnl-proc-mode">${p.mode === 'startup' ? 'Startup only' : 'Always'}</span>
              <button class="fnl-proc-del" data-proc-idx="${i}" title="Remove">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="fnl-proc-empty">No processes added. Add a process name above.</div>
      `}
    </div>
    <button class="fnl-save-btn" id="fnl-save-killer">Save</button>
  `;
}

// ── Events ────────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // Tabs
  el.querySelectorAll<HTMLElement>('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.tab as typeof activeTab; draw(); });
  });

  // Arrow controls
  el.querySelectorAll<HTMLElement>('.fnl-arrow[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      cycleValue(btn.dataset.key!, parseInt(btn.dataset.dir!, 10));
    });
  });

  // Save video
  el.querySelector('#fnl-save-video')?.addEventListener('click', () => saveVideoSettings());

  // Save launch
  el.querySelector('#fnl-save-launch')?.addEventListener('click', () => {
    launchSettings.launchArgs = (el?.querySelector<HTMLInputElement>('#fnl-launchArgs'))?.value || '';
    saveLaunchSettings('fnl-save-launch');
  });

  // Process killer
  el.querySelector('#fnl-proc-add')?.addEventListener('click', () => {
    const name = (el?.querySelector<HTMLInputElement>('#fnl-proc-name'))?.value.trim() || '';
    if (!name) return;
    const procName = name.toLowerCase().endsWith('.exe') ? name : name + '.exe';
    if (launchSettings.processKiller.processes.some(p => p.name.toLowerCase() === procName.toLowerCase())) return;
    const mode = ((el?.querySelector<HTMLSelectElement>('#fnl-proc-mode'))?.value as 'startup' | 'always') || 'startup';
    launchSettings.processKiller.processes.push({ name: procName, mode });
    draw();
  });

  el.querySelectorAll<HTMLElement>('[data-proc-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      launchSettings.processKiller.processes.splice(parseInt(btn.dataset.procIdx!, 10), 1);
      draw();
    });
  });

  el.querySelector('#fnl-save-killer')?.addEventListener('click', () => {
    launchSettings.processKiller.enabled = (el?.querySelector<HTMLInputElement>('#fnl-pk-enabled'))?.checked ?? false;
    saveLaunchSettings('fnl-save-killer');
  });
}

// ── Save with feedback ────────────────────────────────────────

async function saveVideoSettings(): Promise<void> {
  if (!gameSettings) return;
  const btn = el?.querySelector<HTMLButtonElement>('#fnl-save-video');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    // Read numeric inputs from DOM
    const resX = parseInt((el?.querySelector<HTMLInputElement>('#fnl-resX'))?.value || '') || gameSettings.resolutionX;
    const resY = parseInt((el?.querySelector<HTMLInputElement>('#fnl-resY'))?.value || '') || gameSettings.resolutionY;
    const gamma = parseFloat((el?.querySelector<HTMLInputElement>('#fnl-gamma'))?.value || '') || gameSettings.displayGamma;
    const contrast = parseFloat((el?.querySelector<HTMLInputElement>('#fnl-contrast'))?.value || '') || gameSettings.userInterfaceContrast;
    const resQ = parseInt((el?.querySelector<HTMLInputElement>('#fnl-resQ'))?.value || '') || gameSettings.resolutionQuality;

    const result = await window.glowAPI.fnlaunch.saveGameSettings({
      ...gameSettings,
      resolutionX: resX,
      resolutionY: resY,
      displayGamma: gamma,
      userInterfaceContrast: contrast,
      resolutionQuality: resQ,
    });

    if (!result.success) {
      error = result.error || 'Failed to save';
      btn.disabled = false;
      btn.textContent = 'Save';
      draw();
      return;
    }

    // Reload to reflect real saved state
    const gs = await window.glowAPI.fnlaunch.getGameSettings();
    if (gs.success && gs.settings) gameSettings = gs.settings as GameSettings;

    showSaved(btn);
  } catch (e: any) {
    error = e.message || 'Unexpected error';
    btn.disabled = false;
    btn.textContent = 'Save';
    draw();
  }
}

async function saveLaunchSettings(btnId: string): Promise<void> {
  const btn = el?.querySelector<HTMLButtonElement>('#' + btnId);
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await window.glowAPI.fnlaunch.saveLaunchSettings(launchSettings);
    showSaved(btn);
  } catch (e: any) {
    error = e.message || 'Unexpected error';
    btn.disabled = false;
    btn.textContent = 'Save';
    draw();
  }
}

function showSaved(btn: HTMLButtonElement): void {
  btn.textContent = 'Saved ✓';
  btn.classList.add('fnl-save-btn--done');
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = 'Save';
    btn.classList.remove('fnl-save-btn--done');
  }, 2000);
}

// ── Fetch ─────────────────────────────────────────────────────

async function fetchAll(): Promise<void> {
  loading = true;
  error = null;
  draw();

  try {
    const [gsResult, lsResult] = await Promise.all([
      window.glowAPI.fnlaunch.getGameSettings(),
      window.glowAPI.fnlaunch.getLaunchSettings(),
    ]);

    if (gsResult.success && gsResult.settings) {
      gameSettings = gsResult.settings as GameSettings;
      iniPath = gsResult.iniPath ?? null;
    } else {
      gameSettings = null;
      iniPath = null;
      if (gsResult.error && !gsResult.error.includes('not found')) error = gsResult.error;
    }

    launchSettings = lsResult as LaunchSettings;
  } catch (e: any) {
    error = e.message || 'Failed to load settings';
  } finally {
    loading = false;
    draw();
  }
}

// ── Page Definition ───────────────────────────────────────────

export const fnlaunchPage: PageDefinition = {
  id: 'fnlaunch',
  label: 'FN Launch Settings',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  order: 30,
  render(container) {
    el = container;
    draw();
    fetchAll();
  },
  cleanup() {
    el = null;
  },
};

