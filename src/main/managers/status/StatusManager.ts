/**
 * StatusManager — XMPP Status System for GLOW Launcher
 *
 * Adapted from the bot's XMPPManager but uses JSON storage
 * instead of MongoDB. Manages XMPP connections to maintain
 * custom Fortnite presence status per account.
 *
 * Flow:
 * 1. On launcher start → initializeAllActiveStatuses()
 * 2. Read status.json → connect all accounts with activo=true
 * 3. Each connection sends a Fortnite presence with custom message
 * 4. Auto-reconnect on disconnect (max 3 retries with incremental delay)
 * 5. Token refresh on 401 via refreshAccountToken()
 */

import { createClient, Agent } from 'stanza';
import crypto from 'crypto';
import { BrowserWindow } from 'electron';
import { Endpoints } from '../../helpers/endpoints';
import { refreshAccountToken } from '../../helpers/auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData, StoredAccount } from '../../../shared/types';

// ── Types ───────────────────────────────────────────────────

export type PresenceMode = 'online' | 'away' | 'dnd';

export interface StatusAccountEntry {
  mensaje: string;
  plataforma: string;
  presenceMode: PresenceMode;
  activo: boolean;
  lastUpdate: number;
}

export interface StatusData {
  accounts: Record<string, StatusAccountEntry>;
}

export interface StatusConnectionInfo {
  accountId: string;
  displayName: string;
  isConnected: boolean;
  isActive: boolean;
  isReconnecting: boolean;
  mensaje: string;
  plataforma: string;
  presenceMode: PresenceMode;
  lastUpdate: number;
  retryCount: number;
  error?: string;
}

interface XMPPInstance {
  connection: Agent;
  accountId: string;
  displayName: string;
  platform: string;
  createdAt: number;
  lastStatusSent: number | null;
  isReconnecting: boolean;
  manualDisconnect: boolean;
  sendStatus: (status: string | object, show?: string) => void;
}

// ── Constants ───────────────────────────────────────────────

const MAX_RETRIES = 3;
const CONNECTION_TIMEOUT = 15_000;
const KEEPALIVE_INTERVAL = 30_000;
const VERIFY_INTERVAL = 15 * 60 * 1000; // 15 minutes

// ── Helpers ─────────────────────────────────────────────────

function send(channel: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

// ── StatusManager Singleton ─────────────────────────────────

class StatusManager {
  private connections = new Map<string, XMPPInstance>();
  private connectionRetryCount = new Map<string, number>();
  private processingUpdates = new Set<string>();
  private storageRef: Storage | null = null;
  private verifyInterval: NodeJS.Timeout | null = null;

  // ── Storage ─────────────────────────────────────────────

  private async getStatusData(): Promise<StatusData> {
    if (!this.storageRef) return { accounts: {} };
    return (await this.storageRef.get<StatusData>('status')) ?? { accounts: {} };
  }

  private async saveStatusData(data: StatusData): Promise<void> {
    if (!this.storageRef) return;
    await this.storageRef.set('status', data);
  }

  private async getAccount(accountId: string): Promise<StoredAccount | null> {
    if (!this.storageRef) return null;
    const accsData = (await this.storageRef.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    return accsData.accounts.find((a) => a.accountId === accountId) ?? null;
  }

  // ── XMPP Connection ────────────────────────────────────

  private async createConnection(
    accountId: string,
    displayName: string,
    platform: string = 'AND',
  ): Promise<XMPPInstance> {
    if (!this.storageRef) throw new Error('StatusManager not initialized');

    // Destroy existing connection
    if (this.connections.has(accountId)) {
      await this.destroyConnection(accountId);
    }

    // Refresh token
    const token = await refreshAccountToken(this.storageRef, accountId);
    if (!token) throw new Error('Token refresh failed');

    // XMPP config
    const resourceHash = crypto.randomBytes(16).toString('hex').toUpperCase();
    const serverUrl = Endpoints.EPIC_PROD_ENV;

    const connection = createClient({
      jid: `${accountId}@${serverUrl}`,
      server: serverUrl,
      transports: {
        websocket: `wss://xmpp-service-${serverUrl}`,
        bosh: false,
      },
      credentials: {
        host: serverUrl,
        username: accountId,
        password: token,
      },
      resource: `V2:Fortnite:${platform}::${resourceHash}`,
    }) as Agent;

    connection.enableKeepAlive({ interval: KEEPALIVE_INTERVAL });

    // Setup events
    this.setupConnectionEvents(connection, accountId, displayName, platform);

    // Wait for session
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('XMPP connection timeout'));
      }, CONNECTION_TIMEOUT);

      connection.once('session:started', () => {
        clearTimeout(timeout);
        try {
          connection.sendPresence({ show: 'chat' as any });
        } catch {}
        resolve();
      });

      connection.once('stream:error', (err: any) => {
        clearTimeout(timeout);
        reject(new Error(`XMPP stream error: ${err?.message || err}`));
      });

      connection.connect();
    });

    const xmppInstance: XMPPInstance = {
      connection,
      accountId,
      displayName,
      platform,
      createdAt: Date.now(),
      lastStatusSent: null,
      isReconnecting: false,
      manualDisconnect: false,
      sendStatus: (status: string | object, show: string = 'online') => {
        if (connection && connection.sessionStarted) {
          try {
            const statusString = typeof status === 'object' ? JSON.stringify(status) : status;
            connection.sendPresence({
              status: statusString,
              show: show as any,
            });
            xmppInstance.lastStatusSent = Date.now();
          } catch (e: any) {
            console.error(`[STATUS-XMPP] Error sending status: ${e?.message}`);
          }
        }
      },
    };

    this.connections.set(accountId, xmppInstance);
    return xmppInstance;
  }

  private setupConnectionEvents(
    connection: Agent,
    accountId: string,
    displayName: string,
    platform: string,
  ): void {
    // Reset retry count on successful session
    connection.on('session:started', () => {
      this.connectionRetryCount.delete(accountId);
    });

    // Disconnected
    connection.on('disconnected', async () => {
      const instance = this.connections.get(accountId);
      if (instance?.manualDisconnect) return;

      this.sendStatusUpdate(accountId, displayName, false, 'Disconnected');

      if (instance && !instance.isReconnecting) {
        instance.isReconnecting = true;
        await this.handleReconnect(accountId, displayName, platform);
      }
    });

    // Stream error
    connection.on('stream:error', async (err: any) => {
      const instance = this.connections.get(accountId);
      if (instance?.manualDisconnect) return;

      console.error(`[STATUS-XMPP] ${displayName} stream error: ${err?.message}`);
      this.sendStatusUpdate(accountId, displayName, false, 'Stream error');

      if (instance && !instance.isReconnecting) {
        instance.isReconnecting = true;
        await this.handleReconnect(accountId, displayName, platform);
      }
    });

    // Session end
    connection.on('session:end', async () => {
      const instance = this.connections.get(accountId);
      if (instance?.manualDisconnect) return;

      this.sendStatusUpdate(accountId, displayName, false, 'Session ended');

      if (instance && !instance.isReconnecting) {
        instance.isReconnecting = true;
        await this.handleReconnect(accountId, displayName, platform);
      }
    });
  }

  // ── Reconnection ───────────────────────────────────────

  private async handleReconnect(
    accountId: string,
    displayName: string,
    platform: string,
  ): Promise<void> {
    if (!this.connections.has(accountId)) return;

    const retryCount = this.connectionRetryCount.get(accountId) || 0;

    if (retryCount >= MAX_RETRIES) {
      this.connections.delete(accountId);
      this.connectionRetryCount.delete(accountId);

      // Deactivate in storage
      const data = await this.getStatusData();
      if (data.accounts[accountId]) {
        data.accounts[accountId].activo = false;
        await this.saveStatusData(data);
      }

      this.sendStatusUpdate(accountId, displayName, false, 'Max retries reached');
      send('status:data-changed', null);
      return;
    }

    this.connectionRetryCount.set(accountId, retryCount + 1);
    const delay = 5000 * (retryCount + 1);

    this.sendStatusUpdate(accountId, displayName, false, `Reconnecting (${retryCount + 1}/${MAX_RETRIES})...`);

    setTimeout(async () => {
      try {
        // Check still active
        const data = await this.getStatusData();
        const entry = data.accounts[accountId];
        if (!entry || !entry.activo) return;

        await this.activateStatus(
          accountId,
          entry.mensaje,
          entry.plataforma,
          entry.presenceMode,
        );

        this.connectionRetryCount.delete(accountId);
      } catch (e: any) {
        console.error(`[STATUS-XMPP] Reconnect failed for ${displayName}: ${e?.message}`);
        setTimeout(() => this.handleReconnect(accountId, displayName, platform), 1000);
      }
    }, delay);
  }

  // ── Public API ─────────────────────────────────────────

  async initialize(storage: Storage): Promise<void> {
    this.storageRef = storage;

    // Start all active statuses
    await this.initializeAllActive();

    // Periodic verification every 15 minutes
    if (this.verifyInterval) clearInterval(this.verifyInterval);
    this.verifyInterval = setInterval(() => {
      this.verifyAndReconnectAll().catch(() => {});
    }, VERIFY_INTERVAL);
  }

  async initializeAllActive(): Promise<{ success: number; errors: number; total: number }> {
    const data = await this.getStatusData();
    const accsData = this.storageRef
      ? (await this.storageRef.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] }
      : { tosAccepted: false, accounts: [] };

    let success = 0;
    let errors = 0;
    const entries = Object.entries(data.accounts).filter(([, e]) => e.activo);

    for (const [accountId, entry] of entries) {
      const acc = accsData.accounts.find((a) => a.accountId === accountId);
      if (!acc) {
        // Account removed, deactivate
        data.accounts[accountId].activo = false;
        errors++;
        continue;
      }

      try {
        await this.activateStatus(accountId, entry.mensaje, entry.plataforma, entry.presenceMode);
        success++;
      } catch (e: any) {
        console.error(`[STATUS-XMPP] Init failed for ${acc.displayName}: ${e?.message}`);
        errors++;
        this.sendStatusUpdate(accountId, acc.displayName, false, e?.message || 'Init failed');
      }
    }

    await this.saveStatusData(data);
    return { success, errors, total: entries.length };
  }

  async activateStatus(
    accountId: string,
    mensaje: string,
    plataforma: string = 'AND',
    presenceMode: PresenceMode = 'online',
  ): Promise<{ success: boolean; displayName?: string; error?: string }> {
    if (!this.storageRef) return { success: false, error: 'Not initialized' };

    // Prevent duplicate processing
    if (this.processingUpdates.has(accountId)) {
      return { success: false, error: 'Already processing' };
    }
    this.processingUpdates.add(accountId);

    try {
      const acc = await this.getAccount(accountId);
      if (!acc) throw new Error('Account not found');

      // Create XMPP connection
      const instance = await this.createConnection(accountId, acc.displayName, plataforma);

      // Wait a bit before sending status
      await new Promise((r) => setTimeout(r, 1000));

      // Send status
      const statusObject = {
        Status: mensaje,
        bIsPlaying: false,
        bIsJoinable: false,
        ProductName: 'Fortnite',
      };
      instance.sendStatus(statusObject, presenceMode);

      // Save to storage
      const data = await this.getStatusData();
      data.accounts[accountId] = {
        mensaje,
        plataforma,
        presenceMode,
        activo: true,
        lastUpdate: Date.now(),
      };
      await this.saveStatusData(data);

      this.sendStatusUpdate(accountId, acc.displayName, true);
      send('status:data-changed', null);

      return { success: true, displayName: acc.displayName };
    } catch (e: any) {
      await this.destroyConnection(accountId);
      return { success: false, error: e?.message || 'Activation failed' };
    } finally {
      setTimeout(() => this.processingUpdates.delete(accountId), 2000);
    }
  }

  async deactivateStatus(accountId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.destroyConnection(accountId);

      // Update storage
      const data = await this.getStatusData();
      if (data.accounts[accountId]) {
        data.accounts[accountId].activo = false;
        data.accounts[accountId].lastUpdate = Date.now();
      }
      await this.saveStatusData(data);

      const acc = await this.getAccount(accountId);
      this.sendStatusUpdate(accountId, acc?.displayName || accountId, false);
      send('status:data-changed', null);

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Deactivation failed' };
    }
  }

  async refreshStatus(accountId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = await this.getStatusData();
      const entry = data.accounts[accountId];
      if (!entry || !entry.activo) return { success: false, error: 'Status not active' };

      const instance = this.connections.get(accountId);
      const isValid = instance && instance.connection && instance.connection.sessionStarted && !instance.isReconnecting;

      if (isValid) {
        // If platform changed, reconnect
        if (instance!.platform !== entry.plataforma) {
          return await this.activateStatus(accountId, entry.mensaje, entry.plataforma, entry.presenceMode);
        }

        // Just re-send status
        const statusObject = {
          Status: entry.mensaje,
          bIsPlaying: false,
          bIsJoinable: false,
          ProductName: 'Fortnite',
        };
        instance!.sendStatus(statusObject, entry.presenceMode);
        return { success: true };
      }

      // Connection invalid, recreate
      return await this.activateStatus(accountId, entry.mensaje, entry.plataforma, entry.presenceMode);
    } catch (e: any) {
      return { success: false, error: e?.message || 'Refresh failed' };
    }
  }

  async updateMessage(accountId: string, mensaje: string): Promise<{ success: boolean; error?: string }> {
    const data = await this.getStatusData();
    const entry = data.accounts[accountId];
    if (!entry) return { success: false, error: 'No status config' };

    entry.mensaje = mensaje;
    entry.lastUpdate = Date.now();
    await this.saveStatusData(data);

    // If active, re-send
    if (entry.activo) {
      const instance = this.connections.get(accountId);
      if (instance && instance.connection && instance.connection.sessionStarted) {
        const statusObject = {
          Status: mensaje,
          bIsPlaying: false,
          bIsJoinable: false,
          ProductName: 'Fortnite',
        };
        instance.sendStatus(statusObject, entry.presenceMode);
      }
    }

    send('status:data-changed', null);
    return { success: true };
  }

  async getAllInfo(): Promise<StatusConnectionInfo[]> {
    if (!this.storageRef) return [];

    const accsData = (await this.storageRef.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const statusData = await this.getStatusData();
    const results: StatusConnectionInfo[] = [];

    for (const acc of accsData.accounts) {
      const entry = statusData.accounts[acc.accountId];
      const instance = this.connections.get(acc.accountId);
      const isConnected = !!(instance && instance.connection && instance.connection.sessionStarted && !instance.isReconnecting);

      results.push({
        accountId: acc.accountId,
        displayName: acc.displayName,
        isConnected,
        isActive: entry?.activo ?? false,
        isReconnecting: instance?.isReconnecting ?? false,
        mensaje: entry?.mensaje ?? '',
        plataforma: entry?.plataforma ?? 'AND',
        presenceMode: (entry?.presenceMode as PresenceMode) ?? 'online',
        lastUpdate: entry?.lastUpdate ?? 0,
        retryCount: this.connectionRetryCount.get(acc.accountId) ?? 0,
      });
    }

    return results;
  }

  async getAccountInfo(accountId: string): Promise<StatusConnectionInfo | null> {
    const all = await this.getAllInfo();
    return all.find((a) => a.accountId === accountId) ?? null;
  }

  // ── Verify & Reconnect ─────────────────────────────────

  private async verifyAndReconnectAll(): Promise<void> {
    const data = await this.getStatusData();
    const entries = Object.entries(data.accounts).filter(([, e]) => e.activo);

    for (const [accountId, entry] of entries) {
      const instance = this.connections.get(accountId);
      const isValid = instance && instance.connection && instance.connection.sessionStarted && !instance.isReconnecting;

      if (!isValid) {
        const acc = await this.getAccount(accountId);
        if (!acc) continue;

        try {
          await this.activateStatus(accountId, entry.mensaje, entry.plataforma, entry.presenceMode);
        } catch (e: any) {
          console.error(`[STATUS-XMPP] Verify reconnect failed: ${e?.message}`);
        }
      }
    }
  }

  // ── Destroy ────────────────────────────────────────────

  private async destroyConnection(accountId: string): Promise<void> {
    const instance = this.connections.get(accountId);
    if (instance) {
      instance.manualDisconnect = true;
      try {
        if (instance.connection) {
          // Send offline presence
          try { instance.connection.sendPresence({ type: 'unavailable' as any }); } catch {}
          // Disconnect
          try { await instance.connection.disconnect(); } catch {}
        }
      } catch {}
      this.connections.delete(accountId);
      this.connectionRetryCount.delete(accountId);
    }
  }

  async destroyAll(): Promise<void> {
    for (const accountId of Array.from(this.connections.keys())) {
      await this.destroyConnection(accountId);
    }
    if (this.verifyInterval) {
      clearInterval(this.verifyInterval);
      this.verifyInterval = null;
    }
  }

  // ── IPC Helpers ────────────────────────────────────────

  private sendStatusUpdate(accountId: string, displayName: string, connected: boolean, error?: string): void {
    send('status:connection-update', { accountId, displayName, connected, error });
  }
}

export const statusManager = new StatusManager();
