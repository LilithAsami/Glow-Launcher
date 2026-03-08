import type { PageDefinition } from '../../shared/types';
import { sidebarGroups } from './registry';
import { rebuildSidebar } from '../core/sidebar';

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

async function loadSettings(): Promise<void> {
  settings = (await window.glowAPI.storage.get<SettingsData>('settings')) ?? {};
  if (!settings.fortnitePath) settings.fortnitePath = 'C:\\Program Files\\Epic Games\\Fortnite';
  try {
    notifSettings = await window.glowAPI.notifications.getSettings();
  } catch { /* */ }
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
            <span class="settings-item-desc">Show background images on pages (Alerts, Llamas, Dupes, XP Boosts)</span>
          </div>
          <div class="settings-item-actions">
            ${settings.pageBackgrounds ? `<button class="settings-configure-btn" id="btn-bg-configure">Configure</button>` : ''}
            <label class="settings-toggle">
              <input type="checkbox" class="settings-toggle-input" id="toggle-page-backgrounds"
                ${settings.pageBackgrounds ? 'checked' : ''} />
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
          <span class="settings-item-value">v2.0.0</span>
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
