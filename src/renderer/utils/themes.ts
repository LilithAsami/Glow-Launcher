/**
 * GLOW Launcher Theme Engine
 *
 * Manages custom themes — colors, background images, opacity, filters, animations.
 * Supports import from JSON files, BetterDiscord .css/.theme.css, and raw URLs.
 */

// ─── Types ───────────────────────────────────────────────────

export interface ThemeBackground {
  /** Image URL (http/https or data:) */
  image?: string;
  /** CSS background-position, default 'center' */
  position?: string;
  /** CSS background-size, default 'cover' */
  size?: string;
  /** CSS background-attachment, default 'fixed' */
  attachment?: string;
}

export interface ThemeFilters {
  /** Blur in px, applied to background, default 0 */
  blur?: number;
  /** Brightness 0-200, default 100 */
  brightness?: number;
  /** Saturation 0-200, default 100 */
  saturation?: number;
  /** Contrast 0-200, default 100 */
  contrast?: number;
}

export interface ThemeOpacity {
  /** Sidebar panel opacity 0-100, default 100 (fully opaque) */
  sidebar?: number;
  /** Content area opacity 0-100, default 100 */
  content?: number;
  /** Toolbar opacity 0-100, default 100 */
  toolbar?: number;
  /** Header opacity 0-100, default 100 */
  header?: number;
}

export interface GlowTheme {
  name: string;
  author: string;
  version: string;
  description: string;
  /** CSS variable overrides (key WITHOUT the leading --) */
  colors: Record<string, string>;
  /** Background image settings */
  background?: ThemeBackground;
  /** Backdrop filters applied over the background image */
  filters?: ThemeFilters;
  /** Opacity for each UI panel (0-100) */
  opacity?: ThemeOpacity;
  /** Optional raw CSS appended after variables (for advanced theming) */
  customCSS?: string;
}

/** Stored alongside settings */
export interface ThemeSettings {
  enabled: boolean;
  activeThemeId: string | null;
  themes: SavedTheme[];
}

export interface SavedTheme {
  id: string;
  theme: GlowTheme;
  addedAt: number;
}

// ─── Defaults ────────────────────────────────────────────────

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  enabled: false,
  activeThemeId: null,
  themes: [],
};

/** All overridable CSS variables with their default values.
 *  Keep in sync with styles.css :root
 */
export const THEME_VARIABLES: { key: string; label: string; group: string; default: string }[] = [
  // Backgrounds
  { key: 'bg-base',       label: 'Base Background',       group: 'Backgrounds', default: '#08080c' },
  { key: 'bg-primary',    label: 'Primary Background',    group: 'Backgrounds', default: '#0e0e14' },
  { key: 'bg-secondary',  label: 'Secondary Background',  group: 'Backgrounds', default: '#141419' },
  { key: 'bg-tertiary',   label: 'Tertiary Background',   group: 'Backgrounds', default: '#1a1a22' },
  { key: 'bg-elevated',   label: 'Elevated Surface',      group: 'Backgrounds', default: '#20202a' },
  { key: 'bg-hover',      label: 'Hover Background',      group: 'Backgrounds', default: '#262633' },
  { key: 'bg-active',     label: 'Active Background',     group: 'Backgrounds', default: '#2c2c3d' },
  // Accent
  { key: 'accent',        label: 'Accent Color',          group: 'Accent', default: '#00d4ff' },
  { key: 'accent-glow',   label: 'Accent Glow',           group: 'Accent', default: 'rgba(0, 212, 255, 0.30)' },
  { key: 'accent-hover',  label: 'Accent Hover',          group: 'Accent', default: '#33ddff' },
  { key: 'accent-subtle', label: 'Accent Subtle',         group: 'Accent', default: 'rgba(0, 212, 255, 0.08)' },
  { key: 'accent-border', label: 'Accent Border',         group: 'Accent', default: 'rgba(0, 212, 255, 0.20)' },
  // Danger
  { key: 'danger',        label: 'Danger Color',          group: 'Danger', default: '#ff4757' },
  { key: 'danger-hover',  label: 'Danger Hover',          group: 'Danger', default: '#ff6b7a' },
  // Text
  { key: 'text-primary',   label: 'Primary Text',         group: 'Text', default: '#e4e4ec' },
  { key: 'text-secondary', label: 'Secondary Text',       group: 'Text', default: '#8585a0' },
  { key: 'text-muted',     label: 'Muted Text',           group: 'Text', default: '#505068' },
  // Borders
  { key: 'border',       label: 'Border',                 group: 'Borders', default: 'rgba(255, 255, 255, 0.06)' },
  { key: 'border-light', label: 'Light Border',           group: 'Borders', default: 'rgba(255, 255, 255, 0.10)' },
  // Layout
  { key: 'sidebar-width',  label: 'Sidebar Width',        group: 'Layout', default: '200px' },
  { key: 'header-height',  label: 'Header Height',        group: 'Layout', default: '32px' },
  { key: 'toolbar-height', label: 'Toolbar Height',       group: 'Layout', default: '48px' },
  // Radii
  { key: 'radius-xs', label: 'Radius XS', group: 'Radii', default: '4px' },
  { key: 'radius-sm', label: 'Radius SM', group: 'Radii', default: '6px' },
  { key: 'radius-md', label: 'Radius MD', group: 'Radii', default: '8px' },
  { key: 'radius-lg', label: 'Radius LG', group: 'Radii', default: '12px' },
];

// ─── Style element management ────────────────────────────────

const STYLE_ID = 'glow-theme-style';

function getOrCreateStyleEl(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}

/** Apply a theme's CSS overrides to the document */
export function applyTheme(theme: GlowTheme): void {
  const el = getOrCreateStyleEl();
  const parts: string[] = [];

  // 2. Background image
  const bg = theme.background;
  const hasBackgroundImage = !!(bg?.image) || (theme.customCSS && /(?:body::before|body|html)\s*\{[^}]*background[^}]*url\(/i.test(theme.customCSS))
    || (theme.customCSS && /background(?:-image)?\s*:\s*(?:url\(|linear-gradient|radial-gradient)/i.test(theme.customCSS));

  // 1. CSS variable overrides — make bg-* vars semi-transparent when background is active
  if (hasBackgroundImage) {
    const contentOp = (theme.opacity?.content ?? 75) / 100;
    const bgVarKeys = ['bg-base', 'bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-elevated', 'bg-hover', 'bg-active'];
    const transparentVars: string[] = [];
    for (const key of bgVarKeys) {
      const color = theme.colors[key] || THEME_VARIABLES.find(v => v.key === key)?.default || '#000';
      const rgb = hexToRgbTuple(color) || cssColorToRgb(color);
      if (rgb) {
        transparentVars.push(`  --${key}: rgba(${rgb}, ${contentOp});`);
      } else {
        transparentVars.push(`  --${key}: color-mix(in srgb, ${color} ${Math.round(contentOp * 100)}%, transparent);`);
      }
    }
    // Non-bg vars stay opaque
    const otherVars = Object.entries(theme.colors)
      .filter(([k]) => !bgVarKeys.includes(k))
      .map(([k, v]) => `  --${k}: ${v};`);
    parts.push(`:root {\n${transparentVars.join('\n')}\n${otherVars.join('\n')}\n}`);
  } else {
    const vars = Object.entries(theme.colors)
      .map(([k, v]) => `  --${k}: ${v};`)
      .join('\n');
    if (vars) parts.push(`:root {\n${vars}\n}`);
  }

  if (bg?.image) {
    const pos = bg.position || 'center';
    const size = bg.size || 'cover';
    const attach = bg.attachment || 'fixed';
    parts.push(`body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background: url("${bg.image}") ${pos} / ${size} no-repeat ${attach};
}`);

    // Background filters
    const f = theme.filters;
    if (f && (f.blur || (f.brightness && f.brightness !== 100) || (f.saturation && f.saturation !== 100) || (f.contrast && f.contrast !== 100))) {
      const filters: string[] = [];
      if (f.blur) filters.push(`blur(${f.blur}px)`);
      if (f.brightness !== undefined && f.brightness !== 100) filters.push(`brightness(${f.brightness}%)`);
      if (f.saturation !== undefined && f.saturation !== 100) filters.push(`saturate(${f.saturation}%)`);
      if (f.contrast !== undefined && f.contrast !== 100) filters.push(`contrast(${f.contrast}%)`);
      parts.push(`body::before { filter: ${filters.join(' ')}; }`);
    }
  }

  // Make all layout panels transparent when there's any background
  if (hasBackgroundImage) {
    const sidebarOp = theme.opacity?.sidebar ?? 80;
    const toolbarOp = theme.opacity?.toolbar ?? 85;
    const headerOp  = theme.opacity?.header ?? 80;

    parts.push(`html, body { background: transparent !important; }`);
    parts.push(`#app { background: transparent !important; }`);
    parts.push(`#main { background: transparent !important; }`);
    parts.push(`#sidebar { background: color-mix(in srgb, var(--bg-primary) ${sidebarOp}%, transparent) !important; }`);
    parts.push(`#content { background: transparent !important; }`);
    parts.push(`#toolbar { background: color-mix(in srgb, var(--bg-primary) ${toolbarOp}%, transparent) !important; }`);
    parts.push(`#header  { background: color-mix(in srgb, var(--bg-base) ${headerOp}%, transparent) !important; }`);

    // Make cards/rows on specific pages nearly invisible (matching .fr-item style)
    parts.push(`
/* ── Transparent cards when background active ─────────── */
/* Home */
.home-cat-missions { background: rgba(255,255,255,0.025) !important; }
.home-mission:hover { background: rgba(255,255,255,0.06) !important; }
.home-reward-cell { background: rgba(255,255,255,0.025) !important; }
.home-reward-cell:hover { background: rgba(255,255,255,0.06) !important; }
/* Alerts */
.alert-zone { background: rgba(255,255,255,0.025) !important; }
.alert-zone-header:hover { background: rgba(255,255,255,0.06) !important; }
.alert-mission-header:hover { background: rgba(255,255,255,0.06) !important; }
/* Files */
.files-card { background: rgba(255,255,255,0.025) !important; }
.files-card:hover { background: rgba(255,255,255,0.06) !important; }
/* Taxi */
.tx-card { background: rgba(255,255,255,0.025) !important; }
/* Autokick */
.ak-account-card { background: rgba(255,255,255,0.025) !important; }
.ak-config-item { background: rgba(255,255,255,0.025) !important; }
.ak-log-list { background: rgba(255,255,255,0.025) !important; }
/* Autodaily */
.ad-account-card { background: rgba(255,255,255,0.025) !important; }
.ad-log-list { background: rgba(255,255,255,0.025) !important; }
/* Expeditions */
.autoexp-card { background: rgba(255,255,255,0.025) !important; }
.autoexp-info-item { background: rgba(255,255,255,0.025) !important; }
.autoexp-log-list { background: rgba(255,255,255,0.025) !important; }
/* FN Launch Settings */
.fnl-row { background: rgba(255,255,255,0.025) !important; }
.fnl-row:hover { background: rgba(255,255,255,0.06) !important; }
.fnl-add-proc { background: rgba(255,255,255,0.025) !important; }
.fnl-proc-item { background: rgba(255,255,255,0.025) !important; }
/* Outpost Info */
.op-zone { background: rgba(255,255,255,0.025) !important; }
.op-trap-card { background: rgba(255,255,255,0.025) !important; }
.op-player { background: rgba(255,255,255,0.025) !important; }
/* Party */
.party-info-banner { background: rgba(255,255,255,0.025) !important; }
.party-card { background: rgba(255,255,255,0.025) !important; }
`);
  } else {
    // 3. Opacity overlays on panels (without background image)
    const op = theme.opacity;
    if (op) {
      if (op.sidebar !== undefined && op.sidebar < 100) {
        parts.push(`#sidebar { background: color-mix(in srgb, var(--bg-primary) ${op.sidebar}%, transparent) !important; }`);
      }
      if (op.content !== undefined && op.content < 100) {
        parts.push(`#content { background: color-mix(in srgb, var(--bg-base) ${op.content}%, transparent) !important; }`);
      }
      if (op.toolbar !== undefined && op.toolbar < 100) {
        parts.push(`#toolbar { background: color-mix(in srgb, var(--bg-primary) ${op.toolbar}%, transparent) !important; }`);
      }
      if (op.header !== undefined && op.header < 100) {
        parts.push(`#header { background: color-mix(in srgb, var(--bg-base) ${op.header}%, transparent) !important; }`);
      }
    }
  }

  // 4. Custom CSS
  if (theme.customCSS) parts.push(theme.customCSS);

  el.textContent = parts.join('\n\n');
}

/** Remove all theme overrides */
export function clearTheme(): void {
  const el = document.getElementById(STYLE_ID);
  if (el) el.textContent = '';
}

// ─── Persistence helpers ─────────────────────────────────────

export async function loadThemeSettings(): Promise<ThemeSettings> {
  const raw = await window.glowAPI.storage.get<ThemeSettings>('themeSettings');
  return raw ?? { ...DEFAULT_THEME_SETTINGS };
}

export async function saveThemeSettings(ts: ThemeSettings): Promise<void> {
  await window.glowAPI.storage.set('themeSettings', ts);
}

/** Called on app boot — if a theme is enabled, apply it immediately */
export async function initThemeOnStartup(): Promise<void> {
  const ts = await loadThemeSettings();
  if (ts.enabled && ts.activeThemeId) {
    const saved = ts.themes.find((t) => t.id === ts.activeThemeId);
    if (saved) applyTheme(saved.theme);
  }
}

// ─── ID generator ────────────────────────────────────────────

export function generateThemeId(): string {
  return `theme_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Preset themes ──────────────────────────────────────────

export const PRESET_THEMES: GlowTheme[] = [
  {
    name: 'Midnight Blue',
    author: 'GLOW',
    version: '1.0',
    description: 'Deep blue tones for a calm, focused experience',
    colors: {
      'bg-base': '#0a0c1a',
      'bg-primary': '#0f1228',
      'bg-secondary': '#141836',
      'bg-tertiary': '#1a1e44',
      'bg-elevated': '#202652',
      'bg-hover': '#282e5a',
      'bg-active': '#303868',
      'accent': '#5b8def',
      'accent-glow': 'rgba(91, 141, 239, 0.30)',
      'accent-hover': '#7ba3f7',
      'accent-subtle': 'rgba(91, 141, 239, 0.08)',
      'accent-border': 'rgba(91, 141, 239, 0.20)',
      'text-primary': '#e0e4f0',
      'text-secondary': '#8890b0',
      'text-muted': '#505878',
      'border': 'rgba(91, 141, 239, 0.08)',
      'border-light': 'rgba(91, 141, 239, 0.14)',
    },
  },
  {
    name: 'Crimson Night',
    author: 'GLOW',
    version: '1.0',
    description: 'Warm reds and deep blacks for a bold look',
    colors: {
      'bg-base': '#0c0808',
      'bg-primary': '#140e0e',
      'bg-secondary': '#1a1212',
      'bg-tertiary': '#221818',
      'bg-elevated': '#2a1e1e',
      'bg-hover': '#332626',
      'bg-active': '#3d2c2c',
      'accent': '#ff4757',
      'accent-glow': 'rgba(255, 71, 87, 0.30)',
      'accent-hover': '#ff6b7a',
      'accent-subtle': 'rgba(255, 71, 87, 0.08)',
      'accent-border': 'rgba(255, 71, 87, 0.20)',
      'danger': '#ff6b6b',
      'danger-hover': '#ff8787',
      'text-primary': '#f0e4e4',
      'text-secondary': '#a08585',
      'text-muted': '#685050',
      'border': 'rgba(255, 71, 87, 0.08)',
      'border-light': 'rgba(255, 71, 87, 0.14)',
    },
  },
  {
    name: 'Emerald Forest',
    author: 'GLOW',
    version: '1.0',
    description: 'Nature-inspired greens with dark undertones',
    colors: {
      'bg-base': '#080c0a',
      'bg-primary': '#0e140f',
      'bg-secondary': '#121a14',
      'bg-tertiary': '#182218',
      'bg-elevated': '#1e2a20',
      'bg-hover': '#263326',
      'bg-active': '#2c3d2e',
      'accent': '#4ade80',
      'accent-glow': 'rgba(74, 222, 128, 0.30)',
      'accent-hover': '#6ee7a0',
      'accent-subtle': 'rgba(74, 222, 128, 0.08)',
      'accent-border': 'rgba(74, 222, 128, 0.20)',
      'text-primary': '#e4f0e8',
      'text-secondary': '#85a090',
      'text-muted': '#506858',
      'border': 'rgba(74, 222, 128, 0.08)',
      'border-light': 'rgba(74, 222, 128, 0.14)',
    },
  },
  {
    name: 'Royal Purple',
    author: 'GLOW',
    version: '1.0',
    description: 'Elegant purple accents with charcoal backgrounds',
    colors: {
      'bg-base': '#0a080c',
      'bg-primary': '#100e16',
      'bg-secondary': '#16131e',
      'bg-tertiary': '#1c1826',
      'bg-elevated': '#241e30',
      'bg-hover': '#2c2638',
      'bg-active': '#342e42',
      'accent': '#a78bfa',
      'accent-glow': 'rgba(167, 139, 250, 0.30)',
      'accent-hover': '#c4b5fd',
      'accent-subtle': 'rgba(167, 139, 250, 0.08)',
      'accent-border': 'rgba(167, 139, 250, 0.20)',
      'text-primary': '#ece4f0',
      'text-secondary': '#9085a0',
      'text-muted': '#605068',
      'border': 'rgba(167, 139, 250, 0.08)',
      'border-light': 'rgba(167, 139, 250, 0.14)',
    },
  },
  {
    name: 'Sunset Orange',
    author: 'GLOW',
    version: '1.0',
    description: 'Vibrant warm tones inspired by sunsets',
    colors: {
      'bg-base': '#0c0a08',
      'bg-primary': '#141008',
      'bg-secondary': '#1a1610',
      'bg-tertiary': '#221c14',
      'bg-elevated': '#2a2218',
      'bg-hover': '#332a20',
      'bg-active': '#3d3228',
      'accent': '#f59e0b',
      'accent-glow': 'rgba(245, 158, 11, 0.30)',
      'accent-hover': '#fbbf24',
      'accent-subtle': 'rgba(245, 158, 11, 0.08)',
      'accent-border': 'rgba(245, 158, 11, 0.20)',
      'text-primary': '#f0ece4',
      'text-secondary': '#a09885',
      'text-muted': '#686050',
      'border': 'rgba(245, 158, 11, 0.08)',
      'border-light': 'rgba(245, 158, 11, 0.14)',
    },
  },
  {
    name: 'Arctic',
    author: 'GLOW',
    version: '1.0',
    description: 'Cool whites and light grays — a near-light theme',
    colors: {
      'bg-base': '#e8eaef',
      'bg-primary': '#dfe2e8',
      'bg-secondary': '#d4d8e0',
      'bg-tertiary': '#c8cdd6',
      'bg-elevated': '#f0f2f5',
      'bg-hover': '#ccd1da',
      'bg-active': '#bcc2ce',
      'accent': '#0078d4',
      'accent-glow': 'rgba(0, 120, 212, 0.25)',
      'accent-hover': '#1a8ae6',
      'accent-subtle': 'rgba(0, 120, 212, 0.06)',
      'accent-border': 'rgba(0, 120, 212, 0.18)',
      'danger': '#d13438',
      'danger-hover': '#e04448',
      'text-primary': '#1a1a2e',
      'text-secondary': '#505070',
      'text-muted': '#8888a0',
      'border': 'rgba(0, 0, 0, 0.08)',
      'border-light': 'rgba(0, 0, 0, 0.12)',
    },
  },
  {
    name: 'Neon Pulse',
    author: 'GLOW',
    version: '1.0',
    description: 'Animated gradient background with neon accents',
    colors: {
      'bg-base': '#0a0a1a',
      'bg-primary': '#0e0e22',
      'bg-secondary': '#12122a',
      'bg-tertiary': '#181832',
      'bg-elevated': '#1e1e3a',
      'bg-hover': '#262642',
      'bg-active': '#2e2e4a',
      'accent': '#ff00ff',
      'accent-glow': 'rgba(255, 0, 255, 0.30)',
      'accent-hover': '#ff44ff',
      'accent-subtle': 'rgba(255, 0, 255, 0.08)',
      'accent-border': 'rgba(255, 0, 255, 0.20)',
      'text-primary': '#ece4f0',
      'text-secondary': '#9080a0',
      'text-muted': '#604e68',
      'border': 'rgba(255, 0, 255, 0.08)',
      'border-light': 'rgba(255, 0, 255, 0.14)',
    },
    opacity: { sidebar: 70, content: 60, toolbar: 75, header: 50 },
    customCSS: `@keyframes glow-gradient-shift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background: linear-gradient(-45deg, #0a0a2e, #1a0030, #001a2e, #0a002e);
  background-size: 400% 400%;
  animation: glow-gradient-shift 15s ease infinite;
}
html, body { background: transparent !important; }
#app { background: transparent !important; }`,
  },
  {
    name: 'Glass Frost',
    author: 'GLOW',
    version: '1.0',
    description: 'Frosted glass panels with a subtle dark backdrop',
    colors: {
      'bg-base': '#080810',
      'bg-primary': '#0c0c18',
      'bg-secondary': '#101020',
      'bg-tertiary': '#161628',
      'bg-elevated': '#1c1c30',
      'bg-hover': '#222238',
      'bg-active': '#282840',
      'accent': '#64b5f6',
      'accent-glow': 'rgba(100, 181, 246, 0.30)',
      'accent-hover': '#90caf9',
      'accent-subtle': 'rgba(100, 181, 246, 0.08)',
      'accent-border': 'rgba(100, 181, 246, 0.20)',
      'text-primary': '#e8eaf6',
      'text-secondary': '#9098b0',
      'text-muted': '#585e78',
      'border': 'rgba(100, 181, 246, 0.08)',
      'border-light': 'rgba(100, 181, 246, 0.14)',
    },
    opacity: { sidebar: 60, content: 50, toolbar: 65, header: 40 },
    customCSS: `body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background: radial-gradient(ellipse at 20% 50%, #0d1b2a 0%, #000 70%);
}
html, body { background: transparent !important; }
#app { background: transparent !important; }
#sidebar { backdrop-filter: blur(12px) saturate(130%); -webkit-backdrop-filter: blur(12px) saturate(130%); }
#content { backdrop-filter: blur(8px) saturate(120%); -webkit-backdrop-filter: blur(8px) saturate(120%); }
#toolbar { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }`,
  },
];

// ─── BetterDiscord CSS Parser ────────────────────────────────

/**
 * Parse a BetterDiscord .theme.css / .css / raw CSS string.
 * Supports standard BD variables, ClearVision, DarkMatter, NFLD99,
 * FrostedGlass, vsthemes.org generator, and any generic Discord theme CSS.
 */
export function parseBetterDiscordCSS(css: string): GlowTheme {
  const meta: Record<string, string> = {};

  // Extract @meta from block comments:  /**\n * @name ...\n * @author ...\n */
  const metaBlock = css.match(/\/\*\*[\s\S]*?\*\//);
  if (metaBlock) {
    const lines = metaBlock[0].split('\n');
    for (const line of lines) {
      const m = line.match(/@(\w+)\s+(.+)/);
      if (m) meta[m[1].toLowerCase()] = m[2].trim().replace(/\*\/\s*$/, '').trim();
    }
  }

  // Also try single-line /* @name ... */ pattern
  if (!meta.name) {
    const singleMeta = css.match(/\/\*[\s\S]*?\*\//);
    if (singleMeta) {
      const lines = singleMeta[0].split('\n');
      for (const line of lines) {
        const m = line.match(/@(\w+)\s+(.+)/);
        if (m && !meta[m[1].toLowerCase()]) {
          meta[m[1].toLowerCase()] = m[2].trim().replace(/\*\/\s*$/, '').trim();
        }
      }
    }
  }

  // ── Variable maps ──────────────────────────────────────────

  // Standard BetterDiscord / ClearVision / DarkMatter → GLOW
  const BD_TO_GLOW: Record<string, string> = {
    // Standard BetterDiscord
    'background-primary': 'bg-primary',
    'background-secondary': 'bg-secondary',
    'background-tertiary': 'bg-tertiary',
    'background-floating': 'bg-elevated',
    'background-modifier-hover': 'bg-hover',
    'background-modifier-active': 'bg-active',
    'background-modifier-selected': 'bg-active',
    'brand-experiment': 'accent',
    'brand-experiment-560': 'accent-hover',
    'text-normal': 'text-primary',
    'text-muted': 'text-secondary',
    'header-primary': 'text-primary',
    'header-secondary': 'text-secondary',
    'interactive-normal': 'text-secondary',
    'interactive-muted': 'text-muted',
    'interactive-active': 'text-primary',
    'text-link': 'accent',
    'status-danger': 'danger',
    'channeltextarea-background': 'bg-tertiary',
    'input-background': 'bg-secondary',
    'deprecated-card-bg': 'bg-elevated',
    'background-accent': 'accent-subtle',
    // ClearVision variables
    'main-color': 'accent',
    'hover-color': 'accent-hover',
    'success-color': 'accent',
    'danger-color': 'danger',
    'url-color': 'accent',
    // DarkMatter / generic
    'background-solid': 'bg-primary',
    'background-solid-dark': 'bg-base',
    'background-solid-darker': 'bg-base',
    // NFLD99 / NFLD Inc themes
    'Main-Colour': 'accent',
    'Background-Colour': 'bg-base',
    'Secondary-Background-Colour': 'bg-secondary',
    'Secondary-Main-Colour': 'accent-hover',
    'Notification-Colour': 'accent',
    'Scroller-Colour': 'accent',
    'Text-Shadow-Colour': 'text-muted',
    'Chat-Input-Colour': 'accent',
    'Settings-Dock-Colour': 'accent',
    'Timestamp-Colour': 'text-secondary',
    'Popout-Main-Colour': 'accent',
    // vsthemes.org generator (BasicBackground)
    'accentcolor': 'accent',
    'transparencycolor': 'bg-base',
    // FrostedGlass themes
    'gradient-primary': 'bg-base',
    'gradient-secondary': 'accent',
    'tint-colour': 'accent',
    'link-colour': 'accent',
  };

  const BD_TEXT_MAP: Record<string, string> = {
    'normal-text': 'text-primary',
    'normal-text-hover': 'text-primary',
    'muted-text': 'text-secondary',
    'text-normal': 'text-primary',
  };

  const colors: Record<string, string> = {};
  let customCSS = '';
  const background: ThemeBackground = {};
  const filters: ThemeFilters = {};
  const opacity: ThemeOpacity = {};
  let hasBackground = false;
  let hasFilters = false;
  let hasOpacity = false;

  // ── Helper: normalize a CSS value to something usable ──────
  function normalizeColorValue(value: string): string {
    // RGB tuple "R, G, B" → rgb(R, G, B)
    if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(value)) {
      return `rgb(${value})`;
    }
    // RGB tuple with semicolons "R; G; B" → rgb(R, G, B)
    if (/^\d{1,3}\s*;\s*\d{1,3}\s*;\s*\d{1,3}$/.test(value)) {
      return `rgb(${value.replace(/;/g, ',')})`;
    }
    return value;
  }

  // ── Helper: extract URL from value that may contain url() ──
  function extractUrl(value: string): string | null {
    const urlMatch = value.match(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/);
    return urlMatch?.[1] || null;
  }

  // ── Extract all --variable: value from any block ───────────
  const varRegex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;!}]+)/g;
  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(css)) !== null) {
    const varName = match[1].trim();
    let value = match[2].trim();

    // Normalize RGB tuples
    value = normalizeColorValue(value);

    // ── Background image from various variable names ─────────
    // Matches: --background-image, --background, --Chat-Background,
    //          --Settings-Background, --Callout-Background,
    //          --Popout-Background, --popout-modal-image
    if (
      varName === 'background-image' ||
      varName === 'background' ||
      varName === 'Chat-Background' ||
      varName === 'Settings-Background' ||
      varName === 'Callout-Background' ||
      varName === 'Popout-Background' ||
      varName === 'popout-modal-image'
    ) {
      if (!hasBackground) {
        const url = extractUrl(value);
        if (url) {
          background.image = url;
          hasBackground = true;
        }
      }
      // Don't add to colors, skip
      continue;
    }

    // ── Background sub-properties ────────────────────────────
    // FrostedGlass: --background-image-blur, --background-image-size, --background-image-position
    if (varName === 'background-image-blur' || varName === 'backgroundblur' || varName === 'popoutblur') {
      const px = parseInt(value);
      if (!isNaN(px) && px > 0) { filters.blur = px; hasFilters = true; }
      continue;
    }
    if (varName === 'background-image-size' || varName === 'backgroundsize') {
      background.size = value; hasBackground = true;
      continue;
    }
    if (varName === 'background-image-position' || varName === 'background-position') {
      background.position = value; hasBackground = true;
      continue;
    }
    if (varName === 'background-size') { background.size = value; hasBackground = true; continue; }
    if (varName === 'background-attachment') { background.attachment = value; hasBackground = true; continue; }

    // ── Background filter (ClearVision compound) ─────────────
    if (varName === 'background-filter') {
      const blurM = value.match(/blur\((\d+)px\)/);
      const satM = value.match(/saturate\((\d+)%?\)/);
      const briM = value.match(/brightness\((\d+)%?\)/);
      const conM = value.match(/contrast\((\d+)%?\)/);
      if (blurM) { filters.blur = parseInt(blurM[1]); hasFilters = true; }
      if (satM) { filters.saturation = parseInt(satM[1]); hasFilters = true; }
      if (briM) { filters.brightness = parseInt(briM[1]); hasFilters = true; }
      if (conM) { filters.contrast = parseInt(conM[1]); hasFilters = true; }
      continue;
    }

    // ── Brightness / darkness → opacity/filters ──────────────
    // NFLD99: --Background-Darkness: 0.43 (0=transparent, 1=fully dark)
    if (varName === 'Background-Darkness') {
      const darkness = parseFloat(value);
      if (!isNaN(darkness)) {
        // Map darkness (0-1) to content opacity (0-100). Higher darkness = more opaque overlay
        const opacityPct = Math.round(Math.max(0, Math.min(1, darkness)) * 100);
        opacity.content = opacityPct;
        opacity.sidebar = Math.min(100, opacityPct + 15);
        hasOpacity = true;
      }
      continue;
    }
    // FrostedGlass: --serverlist-brightness, --left-brightness, --middle-brightness, --right-brightness
    if (varName === 'middle-brightness' || varName === 'serverlist-brightness') {
      const br = parseFloat(value);
      if (!isNaN(br)) {
        opacity.content = Math.round(Math.max(0, Math.min(1, br)) * 100);
        hasOpacity = true;
      }
      continue;
    }
    if (varName === 'left-brightness') {
      const br = parseFloat(value);
      if (!isNaN(br)) {
        opacity.sidebar = Math.round(Math.max(0, Math.min(1, br)) * 100);
        hasOpacity = true;
      }
      continue;
    }
    if (varName === 'right-brightness') {
      continue; // acknowledged but not directly mapped (member list)
    }
    if (varName === 'popout-modal-brightness') {
      continue; // acknowledged
    }

    // vsthemes.org generator: --transparencyalpha (0-1), --messagetransparency, etc.
    if (varName === 'transparencyalpha') {
      const alpha = parseFloat(value);
      if (!isNaN(alpha)) {
        opacity.content = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
        opacity.sidebar = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
        hasOpacity = true;
      }
      continue;
    }
    if (varName === 'messagetransparency' || varName === 'guildchanneltransparency' || varName === 'memberlistransparency') {
      continue; // acknowledged
    }

    // ClearVision: --background-shading
    if (varName === 'background-shading') {
      const pct = parseInt(value);
      if (!isNaN(pct)) {
        opacity.content = Math.max(0, Math.min(100, pct));
        opacity.sidebar = Math.max(0, Math.min(100, pct));
        hasOpacity = true;
      }
      continue;
    }
    if (varName === 'card-shading' || varName === 'popout-shading' || varName === 'modal-shading') {
      continue;
    }

    // vsthemes.org: --backdrop: rgba(0,0,0,0.2) → skip
    if (varName === 'backdrop') { continue; }

    // FrostedGlass: --window-padding, --window-roundness, --scrollbar-colour
    // FrostedGlass: --home-button-image, --home-button-size, --home-button-position → skip
    // FrostedGlass: --show-gift-gif-buttons, --update-notice-1, --font → skip
    // FrostedGlass: --HSL-*, --rs-* → skip
    if (
      varName.startsWith('HSL-') || varName.startsWith('rs-') ||
      varName === 'window-padding' || varName === 'window-roundness' ||
      varName === 'scrollbar-colour' || varName === 'font' ||
      varName === 'show-gift-gif-buttons' || varName === 'update-notice-1' ||
      varName === 'home-button-image' || varName === 'home-button-size' ||
      varName === 'home-button-position' || varName === 'popout-modal-size' ||
      varName === 'popout-modal-position' || varName === 'popout-modal-blur' ||
      varName.startsWith('load') || varName.startsWith('File-Updated') ||
      varName.startsWith('Theme-Variant') || varName.startsWith('Unread-Message') ||
      varName === 'Chat-Font-Used' || varName === 'Chat-Font-Size' ||
      varName === 'Guild-Columns' || varName === 'ServerFolders-Guild-Columns' ||
      varName === 'Chat-Avatar-Border-Radius' || varName === 'Chat-Input-Background' ||
      varName === 'Emote-Popout-Background' ||
      varName === 'version1_0_5' || varName === 'gradient-direction' ||
      varName === 'tint-brightness' || varName === 'rs-phone-visible' ||
      varName === 'popoutblur' || varName === 'backdropblur' ||
      varName === 'popoutsize' || varName === 'backdropsize'
    ) {
      continue;
    }

    // ── Text colors ──────────────────────────────────────────
    const textKey = BD_TEXT_MAP[varName];
    if (textKey) {
      colors[textKey] = value;
      continue;
    }

    // ── Check if it maps to a GLOW variable ──────────────────
    const glowKey = BD_TO_GLOW[varName];
    if (glowKey) {
      colors[glowKey] = value;
    }
    // Also check if it's already a native GLOW variable name
    if (THEME_VARIABLES.some((v) => v.key === varName)) {
      colors[varName] = value;
    }
  }

  // ── Generate accent variants from main accent ──────────────
  if (colors['accent'] && !colors['accent-glow']) {
    const hex = colors['accent'];
    const rgb = hexToRgbTuple(hex) || cssColorToRgb(hex);
    if (rgb) {
      colors['accent-glow'] = `rgba(${rgb}, 0.30)`;
      if (!colors['accent-hover']) colors['accent-hover'] = lightenHex(hex, 20);
      if (!colors['accent-subtle']) colors['accent-subtle'] = `rgba(${rgb}, 0.08)`;
      if (!colors['accent-border']) colors['accent-border'] = `rgba(${rgb}, 0.20)`;
    }
  }

  // ── Generate bg variants from bg-base if we only have bg-base ──
  if (colors['bg-base'] && !colors['bg-primary']) {
    const baseRgb = cssColorToRgb(colors['bg-base']);
    if (baseRgb) {
      const [r, g, b] = baseRgb.split(',').map(v => parseInt(v.trim()));
      const lighter = (amt: number) => `rgb(${Math.min(255, r + amt)}, ${Math.min(255, g + amt)}, ${Math.min(255, b + amt)})`;
      colors['bg-primary'] = lighter(6);
      colors['bg-secondary'] = lighter(12);
      colors['bg-tertiary'] = lighter(18);
      colors['bg-elevated'] = lighter(24);
      colors['bg-hover'] = lighter(30);
      colors['bg-active'] = lighter(36);
    }
  }

  // ── Scan CSS rules for background-image: url(...) as fallback ──
  if (!hasBackground) {
    const bgImgRule = css.match(/[{;]\s*background-image\s*:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i)
      || css.match(/[{;]\s*background\s*:[^;]*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i);
    if (bgImgRule && bgImgRule[1]) {
      background.image = bgImgRule[1];
      hasBackground = true;
      const sizeMatch = css.match(/background-size\s*:\s*([^;]+)/i);
      if (sizeMatch) background.size = sizeMatch[1].trim();
    }
  }

  // ── Strip variable blocks but keep other rules as customCSS ──
  const stripped = css
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/:root\s*\{[^}]*\}/g, '')
    .replace(/\[data-theme[^\]]*\]\s*\{[^}]*\}/g, '')
    .replace(/@import\s+url\([^)]*\)\s*;?/g, '')
    .replace(/@import\s+url\s*\([^)]*\)\s*;?/g, '')
    .trim();

  if (stripped.length > 10) {
    customCSS = stripped;
  }

  // Sanitize the theme name — remove control characters, limit length
  let themeName = meta.name || 'Imported Theme';
  themeName = themeName.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (!themeName) themeName = 'Imported Theme';
  if (themeName.length > 100) themeName = themeName.substring(0, 100);

  return {
    name: themeName,
    author: (meta.author || 'Unknown').replace(/[\x00-\x1F\x7F]/g, '').trim() || 'Unknown',
    version: meta.version || '1.0',
    description: meta.description || 'Imported from CSS',
    colors,
    background: hasBackground ? background : undefined,
    filters: hasFilters ? filters : undefined,
    opacity: hasOpacity ? opacity : undefined,
    customCSS: customCSS || undefined,
  };
}

/** Convert hex color to "r, g, b" tuple string */
function hexToRgbTuple(hex: string): string | null {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

/** Extract r,g,b from any CSS color format (rgb, rgba, hex) */
function cssColorToRgb(color: string): string | null {
  // Try hex first
  const hex = hexToRgbTuple(color);
  if (hex) return hex;
  // Try rgb/rgba
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return `${m[1]}, ${m[2]}, ${m[3]}`;
  return null;
}

/** Lighten a hex color by a percentage */
function lightenHex(hex: string, percent: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
  const r = clamp(parseInt(m[1], 16) + (255 - parseInt(m[1], 16)) * (percent / 100));
  const g = clamp(parseInt(m[2], 16) + (255 - parseInt(m[2], 16)) * (percent / 100));
  const b = clamp(parseInt(m[3], 16) + (255 - parseInt(m[3], 16)) * (percent / 100));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Export / Import JSON ────────────────────────────────────

export function exportThemeJSON(theme: GlowTheme): string {
  return JSON.stringify(theme, null, 2);
}

export function parseThemeJSON(raw: string): GlowTheme | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || typeof obj.colors !== 'object') return null;
    return {
      name: String(obj.name || 'Imported Theme'),
      author: String(obj.author || 'Unknown'),
      version: String(obj.version || '1.0'),
      description: String(obj.description || ''),
      colors: obj.colors,
      background: obj.background || undefined,
      filters: obj.filters || undefined,
      opacity: obj.opacity || undefined,
      customCSS: obj.customCSS ? String(obj.customCSS) : undefined,
    };
  } catch {
    return null;
  }
}
