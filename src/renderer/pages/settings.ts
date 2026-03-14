import type { PageDefinition } from '../../shared/types';
import { sidebarGroups } from './registry';
import { rebuildSidebar } from '../core/sidebar';
import {
  type GlowTheme,
  type ThemeSettings,
  type SavedTheme,
  type ThemeBackground,
  type ThemeFilters,
  type ThemeOpacity,
  THEME_VARIABLES,
  PRESET_THEMES,
  applyTheme,
  clearTheme,
  loadThemeSettings,
  saveThemeSettings,
  generateThemeId,
  parseBetterDiscordCSS,
  parseThemeJSON,
  exportThemeJSON,
} from '../utils/themes';

interface SettingsData {
  fortnitePath?: string;
  hiddenPages?: string[];
  collapsedSidebarGroups?: string[];
  minimizeToTray?: boolean;
  launchOnStartup?: boolean;
  discordRpc?: boolean;
  pageBackgrounds?: boolean;
  customBackgrounds?: Record<string, string>;
  minimalist?: boolean;
  ramCleanup?: boolean;
  ramCleanupInterval?: number;
  automationTimings?: {
    autokickCheckMs?: number;
    expeditionsIntervalMs?: number;
  };
}

interface NotifSettings {
  sound: boolean;
  nativeToast: boolean;
  categories: { autokick: boolean; expeditions: boolean; general: boolean };
}

/** IDs that the user cannot disable */
const ALWAYS_VISIBLE = new Set(['settings', 'home']);

let el: HTMLElement | null = null;
let settings: SettingsData = {};
let notifSettings: NotifSettings = { sound: true, nativeToast: true, categories: { autokick: true, expeditions: true, general: true } };
let themeSettings: ThemeSettings = { enabled: false, activeThemeId: null, themes: [] };

async function loadSettings(): Promise<void> {
  settings = (await window.glowAPI.storage.get<SettingsData>('settings')) ?? {};
  if (!settings.fortnitePath) settings.fortnitePath = 'C:\\Program Files\\Epic Games\\Fortnite';
  if (!settings.automationTimings) {
    settings.automationTimings = { autokickCheckMs: 3000, expeditionsIntervalMs: 3600000 };
    await window.glowAPI.storage.set('settings', settings);
  }
  try {
    notifSettings = await window.glowAPI.notifications.getSettings();
  } catch { /* */ }
  themeSettings = await loadThemeSettings();
}

async function saveSettings(): Promise<void> {
  await window.glowAPI.storage.set('settings', settings);
}

function showPathToast(message: string, type: 'success' | 'error'): void {
  const existing = document.getElementById('settings-path-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'settings-path-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: '9999',
    background: type === 'success' ? 'rgba(30,30,30,0.95)' : 'rgba(30,30,30,0.95)',
    border: `1px solid ${type === 'success' ? 'rgba(255,255,255,0.12)' : 'rgba(200,50,50,0.5)'}`,
    color: type === 'success' ? 'rgba(255,255,255,0.85)' : '#f87171',
    padding: '9px 16px', borderRadius: '7px', fontSize: '12px', fontWeight: '500',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)', pointerEvents: 'none',
    transition: 'opacity 0.3s', opacity: '1',
  });
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 320); }, 3000);
}

function draw(): void {
  if (!el) return;

  // Build sidebar toggle rows with groups
  const allSidebarPages = sidebarGroups.flatMap((g) =>
    g.pages.map((p) => ({ id: p.id, label: p.label, group: g.label }))
  );
  const hiddenSet = new Set(settings.hiddenPages ?? []);

  const toggleRows = sidebarGroups.map((group) => {
    const groupPages = group.pages.filter((p) => !ALWAYS_VISIBLE.has(p.id));
    if (groupPages.length === 0) return '';
    return `
      <div class="settings-toggle-group-label">${group.label}</div>
      ${groupPages.map((p) => `
        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">${p.label}</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" class="settings-toggle-input" data-page-id="${p.id}"
              ${!hiddenSet.has(p.id) ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
      `).join('')}
    `;
  }).join('');

  el.innerHTML = `
    <div class="page-settings">
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Configure your launcher</p>

      <div class="settings-section">
        <h2 class="settings-section-title">Game</h2>
        <div class="settings-item settings-item-stacked">
          <div class="settings-item-info">
            <span class="settings-item-label">Fortnite Installation Path</span>
            <span class="settings-item-desc">Path to your Fortnite installation folder (used by the Launch button)</span>
          </div>
          <div class="settings-path-row">
            <input type="text" class="settings-path-input" id="fortnite-path-input"
              value="${(settings.fortnitePath ?? '').replace(/"/g, '&quot;')}" spellcheck="false" />
            <button class="settings-path-btn" id="fortnite-path-autodetect" title="Auto-detect Fortnite installation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Auto-detect
            </button>
            <button class="settings-path-btn" id="fortnite-path-browse" title="Browse...">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              Browse
            </button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-section-title">Behavior</h2>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Windows Notifications</span>
            <span class="settings-item-desc">Show native Windows toast notifications for events</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" class="settings-toggle-input" id="toggle-notif-toast"
              ${notifSettings.nativeToast ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Notification Sound</span>
            <span class="settings-item-desc">Play the default Windows notification sound</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" class="settings-toggle-input" id="toggle-notif-sound"
              ${notifSettings.sound ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Notification Categories</span>
            <span class="settings-item-desc">Choose which events trigger notifications</span>
          </div>
          <button class="settings-configure-btn" id="btn-notif-categories">Configure</button>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Discord Rich Presence</span>
            <span class="settings-item-desc">Show your current activity in Discord (page, actions, status)</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" class="settings-toggle-input" id="toggle-discord-rpc"
              ${settings.discordRpc !== false ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Page Backgrounds</span>
            <span class="settings-item-desc">${themeSettings.enabled ? 'Disable Themes first to use Page Backgrounds' : 'Show background images on pages (Alerts, Llamas, Dupes, XP Boosts)'}</span>
          </div>
          <div class="settings-item-actions">
            ${settings.pageBackgrounds && !themeSettings.enabled ? `<button class="settings-configure-btn" id="btn-bg-configure">Configure</button>` : ''}
            <label class="settings-toggle">
              <input type="checkbox" class="settings-toggle-input" id="toggle-page-backgrounds"
                ${settings.pageBackgrounds ? 'checked' : ''} ${themeSettings.enabled ? 'disabled' : ''} />
              <span class="settings-toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Minimize to Tray</span>
            <span class="settings-item-desc">When closing the window, hide to system tray instead of quitting</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" class="settings-toggle-input" id="toggle-minimize-tray"
              ${settings.minimizeToTray ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Launch on Startup</span>
            <span class="settings-item-desc">Start GLOW Launcher automatically when Windows boots</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" class="settings-toggle-input" id="toggle-launch-startup"
              ${settings.launchOnStartup ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Minimalist Mode</span>
            <span class="settings-item-desc">Hide labels, avatars, and decorations for a cleaner, compact interface</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" class="settings-toggle-input" id="toggle-minimalist"
              ${settings.minimalist ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">RAM Cleanup</span>
            <span class="settings-item-desc">Periodically free unused memory to reduce RAM consumption</span>
          </div>
          <div class="settings-item-actions">
            ${settings.ramCleanup ? `<button class="settings-configure-btn" id="btn-ram-configure">Configure</button>` : ''}
            <label class="settings-toggle">
              <input type="checkbox" class="settings-toggle-input" id="toggle-ram-cleanup"
                ${settings.ramCleanup ? 'checked' : ''} />
              <span class="settings-toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-section-title">Themes</h2>
        <p class="settings-section-desc">Customize the look and feel of the launcher</p>
        <div class="settings-item" style="background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.15);border-radius:8px;padding:8px 14px;margin-bottom:4px">
          <div class="settings-item-info">
            <span class="settings-item-desc" style="color:var(--text-secondary)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Press <kbd style="background:rgba(255,255,255,0.1);padding:1px 6px;border-radius:4px;font-size:11px;font-family:var(--font-mono)">Ctrl + T</kbd> at any time to instantly disable themes (emergency reset)
            </span>
          </div>
        </div>

        ${settings.pageBackgrounds ? `
        <div class="settings-item theme-conflict-notice">
          <div class="settings-item-info">
            <span class="settings-item-label" style="color: var(--danger)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Page Backgrounds Active
            </span>
            <span class="settings-item-desc">Themes cannot be enabled while Page Backgrounds is active. Disable Page Backgrounds first to use custom themes.</span>
          </div>
        </div>
        ` : `
        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Enable Themes</span>
            <span class="settings-item-desc">Override interface colors with a custom theme</span>
          </div>
          <div class="settings-item-actions">
            ${themeSettings.enabled ? `<button class="settings-configure-btn" id="btn-theme-editor">Editor</button>` : ''}
            <label class="settings-toggle">
              <input type="checkbox" class="settings-toggle-input" id="toggle-theme"
                ${themeSettings.enabled ? 'checked' : ''} />
              <span class="settings-toggle-slider"></span>
            </label>
          </div>
        </div>

        ${themeSettings.enabled ? `
        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Active Theme</span>
            <span class="settings-item-desc">${themeSettings.activeThemeId ? (themeSettings.themes.find(t => t.id === themeSettings.activeThemeId)?.theme.name ?? 'None') : 'None selected'}</span>
          </div>
          <div class="settings-item-actions" style="display:flex;gap:6px">
            ${themeSettings.activeThemeId ? `<button class="settings-configure-btn" id="btn-theme-export-active" title="Export active theme to share">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>` : ''}
            <button class="settings-configure-btn" id="btn-theme-manage">Manage Themes</button>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Import Theme</span>
            <span class="settings-item-desc">From JSON file, BetterDiscord CSS, or URL</span>
          </div>
          <button class="settings-configure-btn" id="btn-theme-import">Import</button>
        </div>
        ` : ''}
        `}
      </div>

      <div class="settings-section">
        <h2 class="settings-section-title">Automation Timings</h2>
        <p class="settings-section-desc">Configure how often automated systems check and run</p>

        <div class="settings-item settings-item-stacked">
          <div class="settings-item-info">
            <span class="settings-item-label">Autokick check interval</span>
            <span class="settings-item-desc">How often to check if a mission has completed (seconds)</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <input type="number" id="input-autokick-interval"
              min="1" max="60" step="1"
              value="${Math.round((settings.automationTimings?.autokickCheckMs ?? 3000) / 1000)}"
              class="settings-path-input" style="width:80px;text-align:center" />
            <span style="font-size:12px;opacity:0.5">s</span>
          </div>
        </div>

        <div class="settings-item settings-item-stacked">
          <div class="settings-item-info">
            <span class="settings-item-label">Expeditions cycle interval</span>
            <span class="settings-item-desc">How often to check and send expeditions (minutes)</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <input type="number" id="input-expeditions-interval"
              min="1" max="1440" step="1"
              value="${Math.round((settings.automationTimings?.expeditionsIntervalMs ?? 3600000) / 60000)}"
              class="settings-path-input" style="width:80px;text-align:center" />
            <span style="font-size:12px;opacity:0.5">min</span>
          </div>
        </div>

        <div class="settings-item" style="justify-content:flex-end">
          <button class="settings-configure-btn" id="btn-save-timings">Save Timings</button>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-section-title">Sidebar</h2>
        <p class="settings-section-desc">Show or hide pages in the sidebar</p>
        ${toggleRows}
      </div>

      <div class="settings-section">
        <h2 class="settings-section-title">General</h2>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">App Version</span>
            <span class="settings-item-desc">Current version of GLOW Launcher</span>
          </div>
          <span class="settings-item-value">v2.2.0</span>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Data Storage</span>
            <span class="settings-item-desc">Settings are persisted locally as JSON files</span>
          </div>
          <span class="badge badge-accent">Active</span>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-section-title">About</h2>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Electron</span>
            <span class="settings-item-desc">Desktop runtime</span>
          </div>
          <span class="settings-item-value">v28+</span>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">TypeScript</span>
            <span class="settings-item-desc">Language</span>
          </div>
          <span class="settings-item-value">v5+</span>
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

function bindEvents(): void {
  // Fortnite path auto-detect
  document.getElementById('fortnite-path-autodetect')?.addEventListener('click', async () => {
    const btn = document.getElementById('fortnite-path-autodetect') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Detecting…';
    try {
      const result = await window.glowAPI.settings.detectFortnitePath();
      if (result.success && result.path) {
        const input = document.getElementById('fortnite-path-input') as HTMLInputElement;
        input.value = result.path;
        settings.fortnitePath = result.path;
        await saveSettings();
        showPathToast('Fortnite found automatically', 'success');
      } else {
        showPathToast('Fortnite installation not found', 'error');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Auto-detect`;
    }
  });

  // Fortnite path browse
  document.getElementById('fortnite-path-browse')?.addEventListener('click', async () => {
    const selected = await window.glowAPI.dialog.openDirectory();
    if (selected) {
      const input = document.getElementById('fortnite-path-input') as HTMLInputElement;
      input.value = selected;
      settings.fortnitePath = selected;
      await saveSettings();
    }
  });

  const pathInput = document.getElementById('fortnite-path-input') as HTMLInputElement | null;
  pathInput?.addEventListener('change', async () => {
    const val = pathInput.value.trim();
    if (val) {
      settings.fortnitePath = val;
      await saveSettings();
    }
  });

  // Sidebar page toggles
  el?.querySelectorAll<HTMLInputElement>('.settings-toggle-input[data-page-id]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const pageId = cb.dataset.pageId!;
      const hidden = new Set(settings.hiddenPages ?? []);
      if (cb.checked) {
        hidden.delete(pageId);
      } else {
        hidden.add(pageId);
      }
      settings.hiddenPages = [...hidden];
      await saveSettings();
      await rebuildSidebar();
    });
  });

  // Minimize to tray toggle
  document.getElementById('toggle-minimize-tray')?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    settings.minimizeToTray = enabled;
    await saveSettings();
    window.glowAPI.settings.notifyTrayChanged(enabled);
  });

  // Launch on startup toggle
  document.getElementById('toggle-launch-startup')?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    settings.launchOnStartup = enabled;
    await saveSettings();
    window.glowAPI.settings.notifyStartupChanged(enabled);
  });

  // Minimalist mode toggle
  document.getElementById('toggle-minimalist')?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    settings.minimalist = enabled;
    await saveSettings();
    document.body.classList.toggle('minimalist', enabled);
    window.dispatchEvent(new CustomEvent('glow:minimalism-changed', { detail: { enabled } }));
  });

  // RAM Cleanup toggle
  document.getElementById('toggle-ram-cleanup')?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    settings.ramCleanup = enabled;
    if (enabled && !settings.ramCleanupInterval) settings.ramCleanupInterval = 5;
    await saveSettings();
    window.glowAPI.memory.restartTimer();
    draw(); // re-draw to show/hide Configure button
  });

  // RAM Cleanup configure modal
  document.getElementById('btn-ram-configure')?.addEventListener('click', () => {
    openRamConfigModal();
  });

  // Discord RPC toggle
  document.getElementById('toggle-discord-rpc')?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    settings.discordRpc = enabled;
    await saveSettings();
    await window.glowAPI.discordRpc.setEnabled(enabled);
  });

  // Page backgrounds toggle
  document.getElementById('toggle-page-backgrounds')?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    settings.pageBackgrounds = enabled;
    await saveSettings();
    draw(); // re-draw to show/hide Configure button
  });

  // Page backgrounds configure modal
  document.getElementById('btn-bg-configure')?.addEventListener('click', () => {
    openBgConfigModal();
  });

  // Notification toast toggle
  document.getElementById('toggle-notif-toast')?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    notifSettings = await window.glowAPI.notifications.updateSettings({ nativeToast: enabled });
  });

  // Notification sound toggle
  document.getElementById('toggle-notif-sound')?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    notifSettings = await window.glowAPI.notifications.updateSettings({ sound: enabled });
  });

  // Notification categories modal
  document.getElementById('btn-notif-categories')?.addEventListener('click', () => {
    openNotifCategoriesModal();
  });

  // Theme toggle
  document.getElementById('toggle-theme')?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    themeSettings.enabled = enabled;
    if (!enabled) {
      // Keep activeThemeId and themes so config is preserved for re-enabling
      clearTheme();
    } else if (themeSettings.activeThemeId) {
      // Re-apply previously active theme
      const saved = themeSettings.themes.find(t => t.id === themeSettings.activeThemeId);
      if (saved) applyTheme(saved.theme);
    } else if (themeSettings.themes.length > 0) {
      // Auto-select first theme if none was active
      themeSettings.activeThemeId = themeSettings.themes[0].id;
      applyTheme(themeSettings.themes[0].theme);
    }
    await saveThemeSettings(themeSettings);
    draw();
  });

  // Theme manage modal
  document.getElementById('btn-theme-manage')?.addEventListener('click', () => {
    openThemeManageModal();
  });

  // Automation timings save
  document.getElementById('btn-save-timings')?.addEventListener('click', async () => {
    const autokickInput = document.getElementById('input-autokick-interval') as HTMLInputElement;
    const expeditionsInput = document.getElementById('input-expeditions-interval') as HTMLInputElement;
    const autokickSec = Math.max(1, parseInt(autokickInput.value, 10) || 3);
    const expeditionsMin = Math.max(1, parseInt(expeditionsInput.value, 10) || 60);
    settings.automationTimings = {
      autokickCheckMs: autokickSec * 1000,
      expeditionsIntervalMs: expeditionsMin * 60000,
    };
    await saveSettings();
    showPathToast('Automation timings saved', 'success');
  });

  // Theme editor modal
  document.getElementById('btn-theme-editor')?.addEventListener('click', () => {
    openThemeEditorModal();
  });

  // Theme import
  document.getElementById('btn-theme-import')?.addEventListener('click', () => {
    openThemeImportModal();
  });

  // Export active theme directly
  document.getElementById('btn-theme-export-active')?.addEventListener('click', async () => {
    if (!themeSettings.activeThemeId) return;
    const saved = themeSettings.themes.find(t => t.id === themeSettings.activeThemeId);
    if (!saved) {
      // Check if it's a preset
      const presetIdx = themeSettings.activeThemeId.startsWith('preset_') ? parseInt(themeSettings.activeThemeId.replace('preset_', '')) : -1;
      if (presetIdx >= 0 && PRESET_THEMES[presetIdx]) {
        await exportThemeFile(PRESET_THEMES[presetIdx]);
      }
      return;
    }
    await exportThemeFile(saved.theme);
  });

  // Listen for Ctrl+T theme kill to refresh settings UI
  const onThemeKilled = async () => {
    themeSettings = await loadThemeSettings();
    draw();
  };
  window.addEventListener('glow:theme-killed', onThemeKilled);
}

// ── Background configuration ──────────────────────────────────

/** Page definitions for the background config modal */
const BG_PAGES = [
  { id: 'alerts',   label: 'Alerts',    defaultImg: 'assets/backgrounds/map.png' },
  { id: 'llamas',   label: 'Llamas',    defaultImg: 'assets/backgrounds/stwshop.png' },
  { id: 'dupe',     label: 'Dupe',      defaultImg: 'assets/backgrounds/dupe.png' },
  { id: 'xpboosts', label: 'XP Boosts', defaultImg: 'assets/backgrounds/commandroom.png' },
];

function getCustomBg(pageId: string): string | null {
  return settings.customBackgrounds?.[pageId] || null;
}

function getEffectiveBg(pageId: string): string {
  const custom = getCustomBg(pageId);
  if (custom) return `glow-bg://load/${custom.replace(/\\/g, '/')}`;
  return BG_PAGES.find(p => p.id === pageId)?.defaultImg || '';
}

function renderBgConfigModal(overlay: HTMLElement): void {
  const customs = settings.customBackgrounds || {};

  const rows = BG_PAGES.map(p => {
    const effective = getEffectiveBg(p.id);
    const isCustom = !!customs[p.id];
    const customPath = customs[p.id] || '';
    const statusText = isCustom ? customPath.replace(/\\/g, '/').split('/').pop() || customPath : 'Default';
    return `
      <div class="bg-config-row" data-page="${p.id}">
        <div class="bg-config-preview" style="background-image: url('${effective}')"></div>
        <div class="bg-config-info">
          <span class="bg-config-page-name">${p.label}</span>
          <span class="bg-config-status" title="${isCustom ? customPath.replace(/\\/g, '/') : ''}">${statusText}</span>
        </div>
        <div class="bg-config-actions">
          <button class="bg-config-btn bg-config-btn--pick" data-bg-pick="${p.id}" title="Choose image">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Browse
          </button>
          <button class="bg-config-btn bg-config-btn--default" data-bg-default="${p.id}" title="Use default image">
            Default
          </button>
        </div>
      </div>`;
  }).join('');

  overlay.innerHTML = `
    <div class="notif-modal notif-modal--medium">
      <div class="notif-modal-header">
        <h2 class="notif-modal-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          Page Backgrounds
        </h2>
        <div class="notif-modal-actions">
          <button class="notif-close-btn" id="bg-config-close">&times;</button>
        </div>
      </div>
      <div class="notif-modal-body" style="padding: 16px;">
        <div class="bg-config-toolbar">
          <button class="bg-config-btn bg-config-btn--accent" id="bg-apply-all">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Apply to All
          </button>
          <button class="bg-config-btn bg-config-btn--ghost" id="bg-clear-all">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Clear All
          </button>
        </div>
        <div class="bg-config-list">
          ${rows}
        </div>
      </div>
    </div>
  `;

  // Bind events
  overlay.querySelector('#bg-config-close')?.addEventListener('click', () => overlay.remove());

  // Apply to All — pick one image and set for all pages
  overlay.querySelector('#bg-apply-all')?.addEventListener('click', async () => {
    const filePath = await window.glowAPI.dialog.openFile({
      title: 'Select background image for all pages',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    if (!filePath) return;
    if (!settings.customBackgrounds) settings.customBackgrounds = {};
    for (const p of BG_PAGES) {
      settings.customBackgrounds[p.id] = filePath;
    }
    await saveSettings();
    renderBgConfigModal(overlay);
  });

  // Clear All — remove all custom backgrounds
  overlay.querySelector('#bg-clear-all')?.addEventListener('click', async () => {
    settings.customBackgrounds = {};
    await saveSettings();
    renderBgConfigModal(overlay);
  });

  // Per-page Browse
  overlay.querySelectorAll('[data-bg-pick]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pageId = (btn as HTMLElement).dataset.bgPick!;
      const filePath = await window.glowAPI.dialog.openFile({
        title: `Select background for ${pageId}`,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      });
      if (!filePath) return;
      if (!settings.customBackgrounds) settings.customBackgrounds = {};
      settings.customBackgrounds[pageId] = filePath;
      await saveSettings();
      renderBgConfigModal(overlay);
    });
  });

  // Per-page Default
  overlay.querySelectorAll('[data-bg-default]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pageId = (btn as HTMLElement).dataset.bgDefault!;
      if (settings.customBackgrounds) {
        delete settings.customBackgrounds[pageId];
        await saveSettings();
      }
      renderBgConfigModal(overlay);
    });
  });
}

function openBgConfigModal(): void {
  let overlay = document.getElementById('bg-config-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'bg-config-overlay';
  overlay.className = 'notif-overlay';
  overlay.style.display = 'flex';
  document.body.appendChild(overlay);

  renderBgConfigModal(overlay);

  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'bg-config-overlay') overlay!.remove();
  });
}

function openNotifCategoriesModal(): void {
  let overlay = document.getElementById('notif-cat-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'notif-cat-overlay';
  overlay.className = 'notif-overlay';
  overlay.style.display = 'flex';
  document.body.appendChild(overlay);

  const cats = notifSettings.categories;

  overlay.innerHTML = `
    <div class="notif-modal notif-modal--small">
      <div class="notif-modal-header">
        <h2 class="notif-modal-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          Notification Categories
        </h2>
        <div class="notif-modal-actions">
          <button class="notif-close-btn" id="notif-cat-close">&times;</button>
        </div>
      </div>
      <div class="notif-modal-body" style="padding: 16px;">
        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">AutoKick</span>
            <span class="settings-item-desc">Kick events, mission completion, party actions</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" class="settings-toggle-input" id="notif-cat-autokick"
              ${cats.autokick ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">Expeditions</span>
            <span class="settings-item-desc">Expedition send and collect results</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" class="settings-toggle-input" id="notif-cat-expeditions"
              ${cats.expeditions ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <span class="settings-item-label">General</span>
            <span class="settings-item-desc">General system notifications</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" class="settings-toggle-input" id="notif-cat-general"
              ${cats.general ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  `;

  // Close
  overlay.querySelector('#notif-cat-close')?.addEventListener('click', () => overlay!.remove());
  overlay.addEventListener('click', (e) => { if ((e.target as HTMLElement).id === 'notif-cat-overlay') overlay!.remove(); });

  // Category toggles
  const bindCat = (id: string, key: 'autokick' | 'expeditions' | 'general') => {
    overlay!.querySelector(`#${id}`)?.addEventListener('change', async (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      notifSettings = await window.glowAPI.notifications.updateSettings({ categories: { ...notifSettings.categories, [key]: checked } });
    });
  };
  bindCat('notif-cat-autokick', 'autokick');
  bindCat('notif-cat-expeditions', 'expeditions');
  bindCat('notif-cat-general', 'general');
}

const RAM_INTERVALS = [
  { label: '1 minute', value: 1 },
  { label: '2 minutes', value: 2 },
  { label: '5 minutes', value: 5 },
  { label: '10 minutes', value: 10 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
];

function openRamConfigModal(): void {
  let overlay = document.getElementById('ram-config-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'ram-config-overlay';
  overlay.className = 'notif-overlay';
  overlay.style.display = 'flex';
  document.body.appendChild(overlay);

  const current = settings.ramCleanupInterval ?? 5;

  overlay.innerHTML = `
    <div class="notif-modal notif-modal--small">
      <div class="notif-modal-header">
        <h2 class="notif-modal-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2"/>
            <path d="M6 10h4v8H6zM14 6h4v12h-4z"/>
          </svg>
          RAM Cleanup
        </h2>
        <div class="notif-modal-actions">
          <button class="notif-close-btn" id="ram-config-close">&times;</button>
        </div>
      </div>
      <div class="notif-modal-body" style="padding: 16px;">
        <p style="color: var(--text-secondary); font-size: 12px; margin: 0 0 14px;">
          Choose how often the launcher should free unused memory. Shorter intervals keep RAM lower but use slightly more CPU.
        </p>
        <div class="ram-interval-grid">
          ${RAM_INTERVALS.map((opt) => `
            <button class="ram-interval-btn ${opt.value === current ? 'ram-interval-btn--active' : ''}"
                    data-interval="${opt.value}">
              ${opt.label}
            </button>
          `).join('')}
        </div>
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
          <button class="settings-configure-btn" id="ram-cleanup-now" style="width: 100%; justify-content: center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Clean Now
          </button>
        </div>
      </div>
    </div>
  `;

  // Close
  overlay.querySelector('#ram-config-close')?.addEventListener('click', () => overlay!.remove());
  overlay.addEventListener('click', (e) => { if ((e.target as HTMLElement).id === 'ram-config-overlay') overlay!.remove(); });

  // Interval selection
  overlay.querySelectorAll('.ram-interval-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const val = parseInt((btn as HTMLElement).dataset.interval ?? '5', 10);
      settings.ramCleanupInterval = val;
      await saveSettings();
      window.glowAPI.memory.restartTimer();
      // Update active state
      overlay!.querySelectorAll('.ram-interval-btn').forEach((b) => b.classList.remove('ram-interval-btn--active'));
      btn.classList.add('ram-interval-btn--active');
    });
  });

  // Clean now button
  overlay.querySelector('#ram-cleanup-now')?.addEventListener('click', async () => {
    const btn = overlay!.querySelector('#ram-cleanup-now') as HTMLButtonElement;
    btn.textContent = 'Cleaning...';
    btn.disabled = true;
    await window.glowAPI.memory.cleanup();
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Done`;
    setTimeout(() => {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Clean Now`;
      btn.disabled = false;
    }, 1500);
  });
}

// ── Theme management ──────────────────────────────────────────

function createOverlay(id: string): HTMLElement {
  let overlay = document.getElementById(id);
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'notif-overlay';
  overlay.style.display = 'flex';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === id) overlay!.remove();
  });
  return overlay;
}

/** Theme management modal — list, activate, delete, export */
function openThemeManageModal(): void {
  const overlay = createOverlay('theme-manage-overlay');
  renderThemeManageModal(overlay);
}

function renderThemeManageModal(overlay: HTMLElement): void {
  // Filter out saved themes that are copies of presets (preset_N IDs)
  const userThemes = themeSettings.themes.filter(st => !st.id.startsWith('preset_'));
  const allThemes: { id: string; theme: GlowTheme; isPreset: boolean }[] = [
    ...PRESET_THEMES.map((t, i) => ({ id: `preset_${i}`, theme: t, isPreset: true })),
    ...userThemes.map((st) => ({ id: st.id, theme: st.theme, isPreset: false })),
  ];

  const rows = allThemes.map((t) => {
    const isActive = themeSettings.activeThemeId === t.id;
    return `
      <div class="theme-row${isActive ? ' theme-row--active' : ''}" data-theme-id="${t.id}">
        <div class="theme-row-preview">
          ${renderThemePreview(t.theme)}
        </div>
        <div class="theme-row-info">
          <span class="theme-row-name">${escHtml(t.theme.name)}</span>
          <span class="theme-row-meta">${escHtml(t.theme.author)} &middot; v${escHtml(t.theme.version)}</span>
          ${t.theme.description ? `<span class="theme-row-desc">${escHtml(t.theme.description)}</span>` : ''}
        </div>
        <div class="theme-row-actions">
          ${isActive ? '<span class="badge badge-accent" style="font-size:10px;">Active</span>' : `<button class="settings-configure-btn theme-apply-btn" data-theme-apply="${t.id}">Apply</button>`}
          ${!t.isPreset ? `
            <button class="settings-configure-btn theme-export-btn" data-theme-export="${t.id}" title="Export">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="settings-configure-btn theme-delete-btn" data-theme-delete="${t.id}" title="Delete" style="color:var(--danger)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          ` : `
            <button class="settings-configure-btn theme-export-btn" data-theme-export-preset="${t.id}" title="Export">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          `}
        </div>
      </div>`;
  }).join('');

  overlay.innerHTML = `
    <div class="notif-modal notif-modal--large">
      <div class="notif-modal-header">
        <h2 class="notif-modal-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
          Manage Themes
        </h2>
        <div class="notif-modal-actions">
          <button class="notif-close-btn" id="theme-manage-close">&times;</button>
        </div>
      </div>
      <div class="notif-modal-body theme-manage-body">
        ${allThemes.length === 0
          ? '<div style="text-align:center;color:var(--text-secondary);padding:32px 0">No themes available. Import or create one!</div>'
          : `<div class="theme-list">${rows}</div>`
        }
      </div>
    </div>
  `;

  // Close
  overlay.querySelector('#theme-manage-close')?.addEventListener('click', () => overlay.remove());

  // Apply buttons
  overlay.querySelectorAll<HTMLElement>('[data-theme-apply]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.themeApply!;
      // Find theme: check presets first, then user themes
      const presetIdx = id.startsWith('preset_') ? parseInt(id.replace('preset_', '')) : -1;
      let theme: GlowTheme | null = null;
      if (presetIdx >= 0) {
        theme = PRESET_THEMES[presetIdx];
        // Save preset as user theme if not already saved
        let saved = themeSettings.themes.find((t) => t.id === id);
        if (!saved) {
          saved = { id, theme, addedAt: Date.now() };
          themeSettings.themes.push(saved);
        }
      } else {
        theme = themeSettings.themes.find((t) => t.id === id)?.theme ?? null;
      }
      if (!theme) return;
      themeSettings.activeThemeId = id;
      applyTheme(theme);
      await saveThemeSettings(themeSettings);
      renderThemeManageModal(overlay);
      draw();
    });
  });

  // Delete buttons
  overlay.querySelectorAll<HTMLElement>('[data-theme-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.themeDelete!;
      themeSettings.themes = themeSettings.themes.filter((t) => t.id !== id);
      if (themeSettings.activeThemeId === id) {
        themeSettings.activeThemeId = null;
        clearTheme();
      }
      await saveThemeSettings(themeSettings);
      renderThemeManageModal(overlay);
      draw();
    });
  });

  // Export buttons (user themes)
  overlay.querySelectorAll<HTMLElement>('[data-theme-export]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.themeExport!;
      const saved = themeSettings.themes.find((t) => t.id === id);
      if (!saved) return;
      await exportThemeFile(saved.theme);
    });
  });

  // Export preset buttons
  overlay.querySelectorAll<HTMLElement>('[data-theme-export-preset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.themeExportPreset!;
      const presetIdx = parseInt(id.replace('preset_', ''));
      const theme = PRESET_THEMES[presetIdx];
      if (theme) await exportThemeFile(theme);
    });
  });
}

function renderThemePreview(theme: GlowTheme): string {
  const bg = theme.colors['bg-base'] || '#08080c';
  const bg2 = theme.colors['bg-secondary'] || '#141419';
  const accent = theme.colors['accent'] || '#00d4ff';
  const text = theme.colors['text-primary'] || '#e4e4ec';
  const bgImg = theme.background?.image;
  const bgStyle = bgImg
    ? `background:url('${escHtml(bgImg)}') center/cover no-repeat`
    : `background:${bg}`;
  return `<div class="theme-mini-preview" style="${bgStyle}">
    <div class="theme-mini-bar" style="background:${bg2}${theme.opacity?.sidebar !== undefined && theme.opacity.sidebar < 100 ? `;opacity:${theme.opacity.sidebar / 100}` : ''}"></div>
    <div class="theme-mini-accent" style="background:${accent}"></div>
    <div class="theme-mini-text" style="background:${text}"></div>
    ${bgImg ? '<div class="theme-mini-bg-badge">BG</div>' : ''}
  </div>`;
}

async function exportThemeFile(theme: GlowTheme): Promise<void> {
  const json = exportThemeJSON(theme);
  const safeName = theme.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = await window.glowAPI.theme.saveFile({
    title: 'Export Theme',
    defaultPath: `${safeName}.glow-theme.json`,
    filters: [{ name: 'GLOW Theme', extensions: ['json'] }],
  });
  if (!filePath) return;
  await window.glowAPI.theme.writeFile(filePath, json);
  showPathToast(`Theme exported: ${theme.name}`, 'success');
}

/** Theme editor — color picker for each variable */
function openThemeEditorModal(): void {
  const overlay = createOverlay('theme-editor-overlay');

  // Start from active theme or defaults
  const activeTheme = themeSettings.activeThemeId
    ? themeSettings.themes.find((t) => t.id === themeSettings.activeThemeId)?.theme
    : null;

  const editColors: Record<string, string> = {};
  for (const v of THEME_VARIABLES) {
    editColors[v.key] = activeTheme?.colors[v.key] || v.default;
  }
  let editName = activeTheme?.name || 'Custom Theme';
  let editCustomCSS = activeTheme?.customCSS || '';
  const editBg: ThemeBackground = { ...(activeTheme?.background || {}) };
  const editFilters: ThemeFilters = { ...(activeTheme?.filters || {}) };
  const editOpacity: ThemeOpacity = { ...(activeTheme?.opacity || {}) };

  let editorTab: 'colors' | 'background' | 'advanced' = 'colors';

  function buildCurrentTheme(): GlowTheme {
    const bg: ThemeBackground | undefined = editBg.image ? editBg : undefined;
    const fl: ThemeFilters | undefined = (editFilters.blur || (editFilters.brightness && editFilters.brightness !== 100) || (editFilters.saturation && editFilters.saturation !== 100) || (editFilters.contrast && editFilters.contrast !== 100)) ? editFilters : undefined;
    const op: ThemeOpacity | undefined = (editOpacity.sidebar !== undefined && editOpacity.sidebar < 100) || (editOpacity.content !== undefined && editOpacity.content < 100) || (editOpacity.toolbar !== undefined && editOpacity.toolbar < 100) || (editOpacity.header !== undefined && editOpacity.header < 100) ? editOpacity : undefined;
    return {
      name: editName || 'Custom Theme',
      author: 'You',
      version: '1.0',
      description: 'Created with GLOW Theme Editor',
      colors: { ...editColors },
      background: bg,
      filters: fl,
      opacity: op,
      customCSS: editCustomCSS || undefined,
    };
  }

  function renderEditor(): void {
    const groups = new Map<string, typeof THEME_VARIABLES>();
    for (const v of THEME_VARIABLES) {
      if (!groups.has(v.group)) groups.set(v.group, []);
      groups.get(v.group)!.push(v);
    }

    const tabClass = (t: string) => editorTab === t ? 'home-tab home-tab-active' : 'home-tab';

    // Colors tab content
    const colorsHtml = [...groups.entries()].map(([group, vars]) => `
      <div class="theme-editor-group">
        <h3 class="theme-editor-group-title">${group}</h3>
        <div class="theme-editor-vars">
          ${vars.map((v) => {
            const val = editColors[v.key] || v.default;
            const isColor = val.startsWith('#') || val.startsWith('rgb');
            return `
              <div class="theme-editor-var">
                <label class="theme-editor-label">${v.label}</label>
                <div class="theme-editor-input-row">
                  ${isColor ? `<input type="color" class="theme-editor-color" data-var="${v.key}" value="${toHex(val)}">` : ''}
                  <input type="text" class="theme-editor-text" data-var-text="${v.key}" value="${escHtml(val)}" spellcheck="false">
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
    `).join('');

    // Background tab content
    const bgHtml = `
      <div class="theme-editor-group">
        <h3 class="theme-editor-group-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Background Image
        </h3>
        <div class="theme-editor-bg-section">
          <div class="theme-editor-var">
            <label class="theme-editor-label">Image URL</label>
            <input type="text" class="theme-editor-text theme-editor-wide" id="te-bg-image" value="${escHtml(editBg.image || '')}" placeholder="https://example.com/background.jpg" spellcheck="false">
          </div>
          <div class="theme-editor-var-row">
            <div class="theme-editor-var">
              <label class="theme-editor-label">Position</label>
              <select class="theme-editor-select" id="te-bg-position">
                ${['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'].map(v =>
                  `<option value="${v}"${(editBg.position || 'center') === v ? ' selected' : ''}>${v}</option>`
                ).join('')}
              </select>
            </div>
            <div class="theme-editor-var">
              <label class="theme-editor-label">Size</label>
              <select class="theme-editor-select" id="te-bg-size">
                ${['cover', 'contain', 'auto', '100% 100%'].map(v =>
                  `<option value="${v}"${(editBg.size || 'cover') === v ? ' selected' : ''}>${v}</option>`
                ).join('')}
              </select>
            </div>
            <div class="theme-editor-var">
              <label class="theme-editor-label">Attachment</label>
              <select class="theme-editor-select" id="te-bg-attachment">
                ${['fixed', 'scroll', 'local'].map(v =>
                  `<option value="${v}"${(editBg.attachment || 'fixed') === v ? ' selected' : ''}>${v}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          ${editBg.image ? `
          <div class="theme-editor-bg-preview">
            <img src="${escHtml(editBg.image)}" alt="Preview" onerror="this.style.display='none'">
          </div>` : ''}
        </div>
      </div>

      <div class="theme-editor-group">
        <h3 class="theme-editor-group-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          Background Filters
        </h3>
        <div class="theme-editor-sliders">
          <div class="theme-editor-slider-row">
            <label class="theme-editor-label">Blur</label>
            <input type="range" class="theme-editor-range" id="te-filter-blur" min="0" max="30" step="1" value="${editFilters.blur || 0}">
            <span class="theme-editor-range-val" id="te-filter-blur-val">${editFilters.blur || 0}px</span>
          </div>
          <div class="theme-editor-slider-row">
            <label class="theme-editor-label">Brightness</label>
            <input type="range" class="theme-editor-range" id="te-filter-brightness" min="0" max="200" step="5" value="${editFilters.brightness ?? 100}">
            <span class="theme-editor-range-val" id="te-filter-brightness-val">${editFilters.brightness ?? 100}%</span>
          </div>
          <div class="theme-editor-slider-row">
            <label class="theme-editor-label">Saturation</label>
            <input type="range" class="theme-editor-range" id="te-filter-saturation" min="0" max="200" step="5" value="${editFilters.saturation ?? 100}">
            <span class="theme-editor-range-val" id="te-filter-saturation-val">${editFilters.saturation ?? 100}%</span>
          </div>
          <div class="theme-editor-slider-row">
            <label class="theme-editor-label">Contrast</label>
            <input type="range" class="theme-editor-range" id="te-filter-contrast" min="0" max="200" step="5" value="${editFilters.contrast ?? 100}">
            <span class="theme-editor-range-val" id="te-filter-contrast-val">${editFilters.contrast ?? 100}%</span>
          </div>
        </div>
      </div>

      <div class="theme-editor-group">
        <h3 class="theme-editor-group-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M12 3v18M3 12h18"/></svg>
          Panel Opacity
        </h3>
        <p class="theme-editor-hint">Lower values make panels more transparent, revealing the background image.</p>
        <div class="theme-editor-sliders">
          <div class="theme-editor-slider-row">
            <label class="theme-editor-label">Sidebar</label>
            <input type="range" class="theme-editor-range" id="te-op-sidebar" min="0" max="100" step="5" value="${editOpacity.sidebar ?? 100}">
            <span class="theme-editor-range-val" id="te-op-sidebar-val">${editOpacity.sidebar ?? 100}%</span>
          </div>
          <div class="theme-editor-slider-row">
            <label class="theme-editor-label">Content</label>
            <input type="range" class="theme-editor-range" id="te-op-content" min="0" max="100" step="5" value="${editOpacity.content ?? 100}">
            <span class="theme-editor-range-val" id="te-op-content-val">${editOpacity.content ?? 100}%</span>
          </div>
          <div class="theme-editor-slider-row">
            <label class="theme-editor-label">Toolbar</label>
            <input type="range" class="theme-editor-range" id="te-op-toolbar" min="0" max="100" step="5" value="${editOpacity.toolbar ?? 100}">
            <span class="theme-editor-range-val" id="te-op-toolbar-val">${editOpacity.toolbar ?? 100}%</span>
          </div>
          <div class="theme-editor-slider-row">
            <label class="theme-editor-label">Header</label>
            <input type="range" class="theme-editor-range" id="te-op-header" min="0" max="100" step="5" value="${editOpacity.header ?? 100}">
            <span class="theme-editor-range-val" id="te-op-header-val">${editOpacity.header ?? 100}%</span>
          </div>
        </div>
      </div>
    `;

    // Advanced tab content
    const advancedHtml = `
      <div class="theme-editor-group">
        <h3 class="theme-editor-group-title">Custom CSS</h3>
        <p class="theme-editor-hint">Raw CSS rules appended after all theme overrides. Use this for animations, keyframes, custom selectors, etc.</p>
        <textarea class="theme-editor-css" id="theme-editor-css" rows="12" spellcheck="false" placeholder="/* Example: animated gradient background */
@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

body::before {
  background: linear-gradient(-45deg, #0a0a2e, #1a0a2e, #0a1a2e, #0a0a3e);
  background-size: 400% 400%;
  animation: gradient-shift 15s ease infinite;
}">${escHtml(editCustomCSS)}</textarea>
      </div>
    `;

    const tabContent = editorTab === 'colors' ? colorsHtml : editorTab === 'background' ? bgHtml : advancedHtml;

    overlay.innerHTML = `
      <div class="notif-modal notif-modal--large theme-editor-modal">
        <div class="notif-modal-header">
          <h2 class="notif-modal-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            Theme Editor
          </h2>
          <div class="notif-modal-actions">
            <button class="notif-close-btn" id="theme-editor-close">&times;</button>
          </div>
        </div>
        <div class="notif-modal-body theme-editor-body">
          <div class="theme-editor-name-row">
            <label class="theme-editor-label">Theme Name</label>
            <input type="text" class="theme-editor-name-input" id="theme-editor-name" value="${escHtml(editName)}" spellcheck="false">
          </div>

          <div class="home-tabs" style="margin-bottom:14px">
            <button class="${tabClass('colors')}" data-editor-tab="colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H16c3.3 0 6-2.7 6-6 0-5.5-4.5-10-10-10z"/></svg>
              Colors
            </button>
            <button class="${tabClass('background')}" data-editor-tab="background">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Background
            </button>
            <button class="${tabClass('advanced')}" data-editor-tab="advanced">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Advanced
            </button>
          </div>

          <div class="theme-editor-tab-content">
            ${tabContent}
          </div>

          <div class="theme-editor-actions">
            <button class="settings-configure-btn" id="theme-editor-preview">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Preview
            </button>
            <button class="settings-configure-btn" id="theme-editor-reset">Reset All</button>
            <button class="settings-configure-btn theme-editor-save-btn" id="theme-editor-save">Save Theme</button>
          </div>
        </div>
      </div>
    `;

    // Close
    overlay.querySelector('#theme-editor-close')?.addEventListener('click', () => overlay.remove());

    // Tab switching
    overlay.querySelectorAll<HTMLElement>('[data-editor-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        editorTab = btn.dataset.editorTab as any;
        renderEditor();
      });
    });

    // Name
    overlay.querySelector('#theme-editor-name')?.addEventListener('input', (e) => {
      editName = (e.target as HTMLInputElement).value;
    });

    // ── Colors tab bindings ──
    overlay.querySelectorAll<HTMLInputElement>('.theme-editor-color').forEach((inp) => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.var!;
        editColors[key] = inp.value;
        const textInp = overlay.querySelector<HTMLInputElement>(`[data-var-text="${key}"]`);
        if (textInp) textInp.value = inp.value;
      });
    });

    overlay.querySelectorAll<HTMLInputElement>('.theme-editor-text[data-var-text]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const key = inp.dataset.varText!;
        editColors[key] = inp.value.trim();
        const colorInp = overlay.querySelector<HTMLInputElement>(`[data-var="${key}"]`);
        if (colorInp && inp.value.startsWith('#')) colorInp.value = inp.value;
      });
    });

    // ── Background tab bindings ──
    const bgImageInput = overlay.querySelector<HTMLInputElement>('#te-bg-image');
    if (bgImageInput) {
      bgImageInput.addEventListener('change', () => { editBg.image = bgImageInput.value.trim() || undefined; });
    }
    const bgPosSelect = overlay.querySelector<HTMLSelectElement>('#te-bg-position');
    if (bgPosSelect) bgPosSelect.addEventListener('change', () => { editBg.position = bgPosSelect.value; });
    const bgSizeSelect = overlay.querySelector<HTMLSelectElement>('#te-bg-size');
    if (bgSizeSelect) bgSizeSelect.addEventListener('change', () => { editBg.size = bgSizeSelect.value; });
    const bgAttachSelect = overlay.querySelector<HTMLSelectElement>('#te-bg-attachment');
    if (bgAttachSelect) bgAttachSelect.addEventListener('change', () => { editBg.attachment = bgAttachSelect.value; });

    // Filter sliders
    function bindSlider(id: string, valId: string, unit: string, setter: (v: number) => void) {
      const range = overlay.querySelector<HTMLInputElement>(`#${id}`);
      const valEl = overlay.querySelector(`#${valId}`);
      if (range && valEl) {
        range.addEventListener('input', () => {
          const v = Number(range.value);
          valEl.textContent = `${v}${unit}`;
          setter(v);
        });
      }
    }
    bindSlider('te-filter-blur', 'te-filter-blur-val', 'px', (v) => { editFilters.blur = v; });
    bindSlider('te-filter-brightness', 'te-filter-brightness-val', '%', (v) => { editFilters.brightness = v; });
    bindSlider('te-filter-saturation', 'te-filter-saturation-val', '%', (v) => { editFilters.saturation = v; });
    bindSlider('te-filter-contrast', 'te-filter-contrast-val', '%', (v) => { editFilters.contrast = v; });

    // Opacity sliders
    bindSlider('te-op-sidebar', 'te-op-sidebar-val', '%', (v) => { editOpacity.sidebar = v; });
    bindSlider('te-op-content', 'te-op-content-val', '%', (v) => { editOpacity.content = v; });
    bindSlider('te-op-toolbar', 'te-op-toolbar-val', '%', (v) => { editOpacity.toolbar = v; });
    bindSlider('te-op-header', 'te-op-header-val', '%', (v) => { editOpacity.header = v; });

    // Custom CSS
    overlay.querySelector('#theme-editor-css')?.addEventListener('input', (e) => {
      editCustomCSS = (e.target as HTMLTextAreaElement).value;
    });

    // Preview
    overlay.querySelector('#theme-editor-preview')?.addEventListener('click', () => {
      applyTheme(buildCurrentTheme());
    });

    // Reset
    overlay.querySelector('#theme-editor-reset')?.addEventListener('click', () => {
      for (const v of THEME_VARIABLES) editColors[v.key] = v.default;
      editName = 'Custom Theme';
      editCustomCSS = '';
      editBg.image = undefined; editBg.position = undefined; editBg.size = undefined; editBg.attachment = undefined;
      editFilters.blur = undefined; editFilters.brightness = undefined; editFilters.saturation = undefined; editFilters.contrast = undefined;
      editOpacity.sidebar = undefined; editOpacity.content = undefined; editOpacity.toolbar = undefined; editOpacity.header = undefined;
      renderEditor();
    });

    // Save
    overlay.querySelector('#theme-editor-save')?.addEventListener('click', async () => {
      const theme = buildCurrentTheme();
      const id = generateThemeId();
      themeSettings.themes.push({ id, theme, addedAt: Date.now() });
      themeSettings.activeThemeId = id;
      applyTheme(theme);
      await saveThemeSettings(themeSettings);
      overlay.remove();
      draw();
      showPathToast(`Theme saved: ${theme.name}`, 'success');
    });
  }

  renderEditor();
}

/** Theme import modal — file (JSON/CSS), URL, or BetterDiscord paste */
function openThemeImportModal(): void {
  const overlay = createOverlay('theme-import-overlay');

  let importTab: 'file' | 'url' | 'paste' = 'file';

  function renderImport(): void {
    const tabClass = (t: string) => importTab === t ? 'home-tab home-tab-active' : 'home-tab';

    overlay.innerHTML = `
      <div class="notif-modal notif-modal--medium">
        <div class="notif-modal-header">
          <h2 class="notif-modal-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import Theme
          </h2>
          <div class="notif-modal-actions">
            <button class="notif-close-btn" id="theme-import-close">&times;</button>
          </div>
        </div>
        <div class="notif-modal-body" style="padding:16px">
          <div class="home-tabs" style="margin-bottom:14px">
            <button class="${tabClass('file')}" data-import-tab="file">File</button>
            <button class="${tabClass('url')}" data-import-tab="url">URL</button>
            <button class="${tabClass('paste')}" data-import-tab="paste">Paste CSS</button>
          </div>
          ${importTab === 'file' ? `
            <p style="color:var(--text-secondary);font-size:12px;margin-bottom:12px">
              Import a <strong>.json</strong> (GLOW theme) or <strong>.css</strong> (BetterDiscord theme) file.
            </p>
            <button class="settings-configure-btn" id="theme-import-browse" style="width:100%;justify-content:center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Browse Files
            </button>
            <div id="theme-import-status" style="margin-top:12px;font-size:12px;color:var(--text-secondary)"></div>
          ` : importTab === 'url' ? `
            <p style="color:var(--text-secondary);font-size:12px;margin-bottom:12px">
              Paste a URL to a BetterDiscord .css theme file or a raw CSS URL (e.g. GitHub raw link).
            </p>
            <div class="settings-path-row">
              <input type="text" class="settings-path-input" id="theme-import-url" placeholder="https://raw.githubusercontent.com/..." spellcheck="false">
              <button class="settings-configure-btn" id="theme-import-fetch">Fetch</button>
            </div>
            <div id="theme-import-status" style="margin-top:12px;font-size:12px;color:var(--text-secondary)"></div>
          ` : `
            <p style="color:var(--text-secondary);font-size:12px;margin-bottom:12px">
              Paste BetterDiscord CSS or GLOW theme JSON directly.
            </p>
            <textarea class="theme-editor-css" id="theme-import-paste" rows="10" placeholder="Paste CSS or JSON here..." spellcheck="false"></textarea>
            <button class="settings-configure-btn" id="theme-import-parse" style="margin-top:10px;width:100%;justify-content:center">Import</button>
            <div id="theme-import-status" style="margin-top:12px;font-size:12px;color:var(--text-secondary)"></div>
          `}
        </div>
      </div>
    `;

    // Close
    overlay.querySelector('#theme-import-close')?.addEventListener('click', () => overlay.remove());

    // Tab switching
    overlay.querySelectorAll<HTMLElement>('[data-import-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        importTab = btn.dataset.importTab as any;
        renderImport();
      });
    });

    // File import
    overlay.querySelector('#theme-import-browse')?.addEventListener('click', async () => {
      const filePath = await window.glowAPI.dialog.openFile({
        title: 'Import Theme',
        filters: [
          { name: 'Theme Files', extensions: ['json', 'css', 'theme.css'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!filePath) return;
      const statusEl = overlay.querySelector('#theme-import-status')!;
      statusEl.textContent = 'Reading file...';
      try {
        const content = await window.glowAPI.theme.readFile(filePath);
        const theme = importThemeFromString(content, filePath);
        if (theme) {
          await addImportedTheme(theme);
          overlay.remove();
          draw();
          showPathToast(`Theme imported: ${theme.name}`, 'success');
        } else {
          statusEl.innerHTML = '<span style="color:var(--danger)">Could not parse theme file. Make sure it\'s valid JSON or CSS.</span>';
        }
      } catch (err: any) {
        statusEl.innerHTML = `<span style="color:var(--danger)">${escHtml(err?.message || 'Failed to read file')}</span>`;
      }
    });

    // URL import
    overlay.querySelector('#theme-import-fetch')?.addEventListener('click', async () => {
      const urlInput = overlay.querySelector<HTMLInputElement>('#theme-import-url');
      const statusEl = overlay.querySelector('#theme-import-status')!;
      const url = urlInput?.value.trim();
      if (!url) { statusEl.innerHTML = '<span style="color:var(--danger)">Enter a URL</span>'; return; }
      statusEl.textContent = 'Fetching...';
      const result = await window.glowAPI.theme.fetchUrl(url);
      if (!result.success) {
        statusEl.innerHTML = `<span style="color:var(--danger)">${escHtml(result.error)}</span>`;
        return;
      }
      const theme = importThemeFromString(result.data, url);
      if (theme) {
        await addImportedTheme(theme);
        overlay.remove();
        draw();
        showPathToast(`Theme imported: ${theme.name}`, 'success');
      } else {
        statusEl.innerHTML = '<span style="color:var(--danger)">Could not parse theme from URL. Make sure it\'s valid CSS or JSON.</span>';
      }
    });

    // Paste import
    overlay.querySelector('#theme-import-parse')?.addEventListener('click', async () => {
      const textarea = overlay.querySelector<HTMLTextAreaElement>('#theme-import-paste');
      const statusEl = overlay.querySelector('#theme-import-status')!;
      const content = textarea?.value.trim();
      if (!content) { statusEl.innerHTML = '<span style="color:var(--danger)">Paste some content first</span>'; return; }
      const theme = importThemeFromString(content, 'paste');
      if (theme) {
        await addImportedTheme(theme);
        overlay.remove();
        draw();
        showPathToast(`Theme imported: ${theme.name}`, 'success');
      } else {
        statusEl.innerHTML = '<span style="color:var(--danger)">Could not parse theme. Make sure it\'s valid CSS or JSON.</span>';
      }
    });
  }

  renderImport();
}

function importThemeFromString(content: string, source: string): GlowTheme | null {
  // Try JSON first
  const jsonTheme = parseThemeJSON(content);
  if (jsonTheme) return jsonTheme;
  // Try as CSS (BetterDiscord)
  if (content.includes('{') && (content.includes('--') || content.includes('@'))) {
    const bdTheme = parseBetterDiscordCSS(content);
    if (Object.keys(bdTheme.colors).length > 0 || bdTheme.customCSS) return bdTheme;
  }
  return null;
}

async function addImportedTheme(theme: GlowTheme): Promise<void> {
  // Check for duplicate by name + author
  const existing = themeSettings.themes.find(
    t => t.theme.name === theme.name && t.theme.author === theme.author
  );
  if (existing) {
    // Update existing theme instead of duplicating
    existing.theme = theme;
    existing.addedAt = Date.now();
    themeSettings.activeThemeId = existing.id;
  } else {
    const id = generateThemeId();
    themeSettings.themes.push({ id, theme, addedAt: Date.now() });
    themeSettings.activeThemeId = id;
  }
  themeSettings.enabled = true;
  applyTheme(theme);
  await saveThemeSettings(themeSettings);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toHex(color: string): string {
  if (color.startsWith('#')) {
    // Ensure it's 7 chars for color input
    if (color.length === 4) return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    return color.slice(0, 7);
  }
  // Try to parse rgba/rgb
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}`;
  }
  return '#000000';
}

export const settingsPage: PageDefinition = {
  id: 'settings',
  label: 'Settings',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0
                   0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0
                   0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0
                   1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9
                   19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0
                   1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0
                   0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0
                   1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6
                   9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1
                   0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0
                   9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2
                   2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65
                   1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2
                   2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4
                   9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0
                   0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>`,
  order: 90,
  position: 'bottom',

  async render(container: HTMLElement): Promise<void> {
    el = container;
    await loadSettings();
    draw();
    // Listen for auto-detected path pushed from main process on startup
    window.glowAPI.settings.onPathDetected((detected) => {
      const input = document.getElementById('fortnite-path-input') as HTMLInputElement | null;
      if (input) input.value = detected;
      settings.fortnitePath = detected;
      showPathToast('Fortnite path detected automatically', 'success');
    });
  },

  cleanup(): void {
    window.glowAPI.settings.offPathDetected();
    el = null;
  },
};
