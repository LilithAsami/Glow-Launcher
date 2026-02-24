import type { PageDefinition } from '../../shared/types';
import { sidebarGroups } from './registry';
import { rebuildSidebar } from '../core/sidebar';

interface SettingsData {
  fortnitePath?: string;
  hiddenPages?: string[];
  minimizeToTray?: boolean;
  launchOnStartup?: boolean;
}

/** IDs that the user cannot disable */
const ALWAYS_VISIBLE = new Set(['settings', 'home']);

let el: HTMLElement | null = null;
let settings: SettingsData = {};

async function loadSettings(): Promise<void> {
  settings = (await window.glowAPI.storage.get<SettingsData>('settings')) ?? {};
  if (!settings.fortnitePath) settings.fortnitePath = 'C:\\Program Files\\Epic Games\\Fortnite';
}

async function saveSettings(): Promise<void> {
  await window.glowAPI.storage.set('settings', settings);
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
          <span class="settings-item-value">v0.1 BETA</span>
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
  },

  cleanup(): void {
    el = null;
  },
};
