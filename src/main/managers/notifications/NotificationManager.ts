/**
 * Notification Manager — central hub for in-app + native OS notifications.
 *
 * Stores notification history (max 100), pushes to renderer, and optionally
 * fires native Windows toast + sound via Electron Notification API.
 *
 * Notification categories (user-configurable):
 *  - autokick   → kicks, party events
 *  - expeditions → send / collect results
 */

import { BrowserWindow, Notification as ElectronNotification } from 'electron';
import * as path from 'path';
import type { Storage } from '../../storage';

// ── Types ────────────────────────────────────────────────────
export interface NotificationRewardItem {
  name: string;
  quantity: number;
  icon: string | null;
}

export interface GlowNotification {
  id: string;
  category: 'autokick' | 'expeditions' | 'general';
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  /** Optional reward items with icons (for AutoKick rewards, etc.) */
  rewards?: NotificationRewardItem[];
}

export interface NotificationSettings {
  /** Play sound on notification */
  sound: boolean;
  /** Show native Windows toast */
  nativeToast: boolean;
  /** Per-category toggles */
  categories: {
    autokick: boolean;
    expeditions: boolean;
    general: boolean;
  };
}

const DEFAULT_SETTINGS: NotificationSettings = {
  sound: true,
  nativeToast: true,
  categories: {
    autokick: true,
    expeditions: true,
    general: true,
  },
};

const MAX_NOTIFICATIONS = 100;

// ── Manager class ────────────────────────────────────────────
export class NotificationManager {
  private storage: Storage | null = null;
  private notifications: GlowNotification[] = [];
  private settings: NotificationSettings = { ...DEFAULT_SETTINGS };
  private idCounter = 0;

  async initialize(storage: Storage): Promise<void> {
    this.storage = storage;
    const saved = await storage.get<NotificationSettings>('notificationSettings');
    if (saved) {
      this.settings = { ...DEFAULT_SETTINGS, ...saved, categories: { ...DEFAULT_SETTINGS.categories, ...saved.categories } };
    }
    // Load persisted notifications
    const savedNotifs = await storage.get<GlowNotification[]>('notifications');
    if (savedNotifs && Array.isArray(savedNotifs)) {
      this.notifications = savedNotifs.slice(-MAX_NOTIFICATIONS);
    }
  }

  /** Get current settings */
  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  /** Update settings and persist */
  async updateSettings(partial: Partial<NotificationSettings>): Promise<NotificationSettings> {
    if (partial.categories) {
      this.settings.categories = { ...this.settings.categories, ...partial.categories };
    }
    if (partial.sound !== undefined) this.settings.sound = partial.sound;
    if (partial.nativeToast !== undefined) this.settings.nativeToast = partial.nativeToast;
    if (this.storage) {
      await this.storage.set('notificationSettings', this.settings);
    }
    return { ...this.settings };
  }

  /** Get all notifications */
  getAll(): GlowNotification[] {
    return [...this.notifications];
  }

  /** Get unread count */
  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  /** Mark one notification as read */
  markRead(id: string): void {
    const n = this.notifications.find((x) => x.id === id);
    if (n) {
      n.read = true;
      this.persist();
      this.notifyRenderer();
    }
  }

  /** Mark all as read */
  markAllRead(): void {
    for (const n of this.notifications) n.read = true;
    this.persist();
    this.notifyRenderer();
  }

  /** Clear all notifications */
  clearAll(): void {
    this.notifications = [];
    this.persist();
    this.notifyRenderer();
  }

  /** Delete a single notification by id */
  delete(id: string): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.persist();
    this.notifyRenderer();
  }

  /** Push a new notification — the main entry point */
  push(
    category: GlowNotification['category'],
    title: string,
    body: string,
    rewards?: NotificationRewardItem[],
  ): void {
    // Check category toggle
    if (!this.settings.categories[category]) return;

    const notif: GlowNotification = {
      id: `${Date.now()}-${++this.idCounter}`,
      category,
      title,
      body,
      timestamp: Date.now(),
      read: false,
      ...(rewards && rewards.length > 0 ? { rewards } : {}),
    };

    this.notifications.push(notif);
    if (this.notifications.length > MAX_NOTIFICATIONS) {
      this.notifications = this.notifications.slice(-MAX_NOTIFICATIONS);
    }

    this.persist();

    // Push to renderer
    this.sendToRenderer('notifications:new', notif);
    this.notifyRenderer();

    // Native Windows toast + sound
    if (this.settings.nativeToast) {
      this.showNativeToast(title, body);
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  private showNativeToast(title: string, body: string): void {
    try {
      const iconPath = path.join(__dirname, '..', '..', '..', 'assets', 'icon.png');
      const n = new ElectronNotification({
        title,
        body,
        icon: iconPath,
        silent: !this.settings.sound,
      });
      n.show();
    } catch { /* Notification not supported or failed */ }
  }

  private persist(): void {
    if (this.storage) {
      this.storage.set('notifications', this.notifications).catch(() => {});
    }
  }

  private notifyRenderer(): void {
    this.sendToRenderer('notifications:updated', {
      unreadCount: this.getUnreadCount(),
      total: this.notifications.length,
    });
  }

  private sendToRenderer(channel: string, data: any): void {
    try {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        if (!w.isDestroyed()) w.webContents.send(channel, data);
      }
    } catch { /* */ }
  }
}

// Singleton
export const notificationManager = new NotificationManager();
