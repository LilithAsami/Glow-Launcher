import { app, BrowserWindow, Tray, Menu, nativeImage, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { registerIpcHandlers } from './ipc';
import { Storage } from './storage';
import { initAutoKick } from './events/autokick/monitor';
import { statusManager } from './managers/status/StatusManager';
import { taxiManager } from './managers/taxi/TaxiManager';
import { discordRpc } from './managers/discord/DiscordRpcManager';
import { notificationManager } from './managers/notifications/NotificationManager';
import { validateAndAutoDetect } from './helpers/cmd/detectFortnite';
import type { AppConfig } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let minimizeToTray = false;
const storage = new Storage();

// ── RAM Cleanup ────────────────────────────────────────────
let ramCleanupTimer: ReturnType<typeof setInterval> | null = null;

async function performMemoryCleanup(): Promise<void> {
  if (!mainWindow) return;
  try {
    // Clear network cache (HTTP cache, preloaded resources)
    await mainWindow.webContents.session.clearCache();
    // Tell renderer to trim JS heap
    mainWindow.webContents.send('memory:did-cleanup');
  } catch { /* window may be closing */ }
}

async function startRamCleanup(): Promise<void> {
  stopRamCleanup();
  const s = await storage.get<{ ramCleanup?: boolean; ramCleanupInterval?: number }>('settings');
  if (!s?.ramCleanup) return;
  const intervalMs = (s.ramCleanupInterval ?? 5) * 60_000;
  ramCleanupTimer = setInterval(() => { performMemoryCleanup(); }, intervalMs);
}

function stopRamCleanup(): void {
  if (ramCleanupTimer) { clearInterval(ramCleanupTimer); ramCleanupTimer = null; }
}

// Must be called before app.whenReady()
app.setAppUserModelId('GLOW Launcher');
protocol.registerSchemesAsPrivileged([
  { scheme: 'glow-bg', privileges: { supportFetchAPI: true, stream: true, bypassCSP: true } }
]);

async function loadTrayPreference(): Promise<void> {
  const settings = await storage.get<{ minimizeToTray?: boolean }>('settings');
  minimizeToTray = settings?.minimizeToTray === true;
}

function createTray(): void {
  if (tray) return;
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('GLOW Launcher');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.restore();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        tray?.destroy();
        tray = null;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function createWindow(): Promise<void> {
  const config = (await storage.get<AppConfig>('config')) || {};
  const bounds = config.windowBounds || { width: 960, height: 640 };

  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const appIcon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 780,
    minHeight: 480,
    frame: false,
    icon: appIcon,
    backgroundColor: '#08080c',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Open DevTools in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    // Initialize AutoKick after window is ready
    initAutoKick(storage).catch(() => {});
    // Initialize Status Manager (reconnects all active XMPP statuses)
    statusManager.initialize(storage).catch(() => {});
    // Initialize Taxi Manager (reconnects all active taxis)
    taxiManager.initialize(storage).catch(() => {});
    // Initialize Discord Rich Presence
    discordRpc.initialize(storage).catch(() => {});
    // Initialize Notification Manager
    notificationManager.initialize(storage).catch(() => {});
    // Auto-detect Fortnite path if not set or if the configured path is no longer valid
    validateAndAutoDetect(storage).then((detected) => {
      if (detected) {
        mainWindow?.webContents.send('settings:path-detected', detected);
      }
    }).catch(() => {});
  });

  // Persist window bounds on close & handle tray
  mainWindow.on('close', (e) => {
    if (!mainWindow) return;

    // Minimize to tray instead of quitting (must be sync before any await)
    if (minimizeToTray && !isQuitting) {
      e.preventDefault();
      createTray();
      mainWindow.hide();
      // Fire-and-forget bounds save
      const b = mainWindow.getBounds();
      storage.get<AppConfig>('config').then((c) => {
        storage.set('config', { ...(c || {}), windowBounds: b });
      });
      return;
    }

    // Normal close — save bounds fire-and-forget
    const bounds = mainWindow.getBounds();
    storage.get<AppConfig>('config').then((c) => {
      storage.set('config', { ...(c || {}), windowBounds: bounds });
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Register custom protocol for serving local background images
  // URL format: glow-bg://load/E:/path/to/image.png
  protocol.handle('glow-bg', (request) => {
    const url = new URL(request.url);
    // pathname comes as /E:/path/image.png — remove leading /
    const filePath = decodeURIComponent(url.pathname).replace(/^\//, '');
    // Security: only allow image files
    const ext = path.extname(filePath).toLowerCase();
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
    if (!allowed.includes(ext) || !fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch('file:///' + filePath.replace(/\\/g, '/'));
  });

  registerIpcHandlers(storage, () => performMemoryCleanup(), () => startRamCleanup());
  await loadTrayPreference();

  // Start RAM cleanup if enabled
  await startRamCleanup();

  // Load startup preference
  const settings = await storage.get<{ launchOnStartup?: boolean }>('settings');
  if (settings?.launchOnStartup) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  createWindow();
});

// Listen for settings changes from renderer via IPC → app events
(app as any).on('glow:tray-changed', (enabled: boolean) => {
  minimizeToTray = enabled;
  if (!enabled && tray) {
    tray.destroy();
    tray = null;
  }
});

(app as any).on('glow:startup-changed', (enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
});

app.on('window-all-closed', () => {
  discordRpc.destroy();
  if (!tray) app.quit();
});
