import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc';
import { Storage } from './storage';
import { initAutoKick } from './events/autokick/monitor';
import { statusManager } from './managers/status/StatusManager';
import { taxiManager } from './managers/taxi/TaxiManager';
import { discordRpc } from './managers/discord/DiscordRpcManager';
import type { AppConfig } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let minimizeToTray = false;
const storage = new Storage();

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
  registerIpcHandlers(storage);
  await loadTrayPreference();

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
