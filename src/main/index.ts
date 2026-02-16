import { app, BrowserWindow, nativeImage } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc';
import { Storage } from './storage';
import { initAutoKick } from './events/autokick/monitor';
import { statusManager } from './managers/status/StatusManager';
import { taxiManager } from './managers/taxi/TaxiManager';
import type { AppConfig } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
const storage = new Storage();

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
  });

  // Persist window bounds on close
  mainWindow.on('close', async () => {
    if (!mainWindow) return;
    const currentBounds = mainWindow.getBounds();
    const current = (await storage.get<AppConfig>('config')) || {};
    await storage.set('config', { ...current, windowBounds: currentBounds });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers(storage);
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
