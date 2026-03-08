/**
 * Native Discord Rich Presence via local IPC pipe.
 *
 * Connects directly to Discord's local socket — zero external dependencies.
 * Handles handshake, heartbeat, presence updates, and auto-reconnect.
 *
 * Features:
 *  - Enable / disable via settings (persisted)
 *  - Page-level + detail-level activity (e.g. "Browsing AutoKick" + "Monitoring 3 accounts")
 *  - Auto-reconnect when Discord restarts
 *  - Graceful shutdown
 */

import * as net from 'net';
import { BrowserWindow } from 'electron';
import type { Storage } from '../../storage';

// ── Discord IPC opcodes ───────────────────────────────────────
const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 } as const;

const CLIENT_ID = '1305273926229950465';
const RECONNECT_INTERVAL = 15_000;
const PIPE_PREFIX = process.platform === 'win32' ? '\\\\?\\pipe\\discord-ipc-' : '';

// ── Page labels for display ───────────────────────────────────
const PAGE_LABELS: Record<string, string> = {
  home: 'Home',
  alerts: 'Alerts',
  friends: 'Friends',
  locker: 'Locker',
  shop: 'Item Shop',
  files: 'Files & Tools',
  mcp: 'MCP Console',
  stalk: 'Stalk',
  party: 'Party',
  ghostequip: 'Ghost Equip',
  dupe: 'Dupe',
  vbucks: 'V-Bucks',
  epicstatus: 'Epic Status',
  eula: 'EULA Accept',
  authpage: 'Authorization',
  status: 'Status',
  taxi: 'Taxi',
  security: 'Security',
  autokick: 'AutoKick',
  accounts: 'Accounts',
  settings: 'Settings',
  redeemcodes: 'Redeem Codes',
  xpboosts: 'XP Boosts',
  quests: 'Quests',
  outpost: 'Outpost Info',
  autodaily: 'AutoDaily',
  expeditions: 'Expeditions',
  autoresponder: 'AutoResponder',
  accountmgmt: 'Account Management',
  lockermgmt: 'Locker Management',
};

function getPageLabel(id: string): string {
  return PAGE_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

// ── Nonce generator ───────────────────────────────────────────
let nonceCounter = 0;
function nonce(): string {
  return `${Date.now()}-${++nonceCounter}`;
}

// ── IPC packet encode / decode ────────────────────────────────
function encode(op: number, data: any): Buffer {
  const payload = JSON.stringify(data);
  const len = Buffer.byteLength(payload);
  const buf = Buffer.alloc(8 + len);
  buf.writeInt32LE(op, 0);
  buf.writeInt32LE(len, 4);
  buf.write(payload, 8, 'utf8');
  return buf;
}

interface Packet { op: number; data: any }

function decode(buf: Buffer): Packet | null {
  if (buf.length < 8) return null;
  const op = buf.readInt32LE(0);
  const len = buf.readInt32LE(4);
  if (buf.length < 8 + len) return null;
  const json = buf.slice(8, 8 + len).toString('utf8');
  try { return { op, data: JSON.parse(json) }; } catch { return { op, data: json }; }
}

// ── Manager class ─────────────────────────────────────────────
export class DiscordRpcManager {
  private socket: net.Socket | null = null;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private currentPage = 'Home';
  private currentDetail: string | null = null;
  private startTimestamp = Date.now();
  private buffer = Buffer.alloc(0);
  private destroyed = false;
  private enabled = true;
  private storage: Storage | null = null;
  private connecting = false;

  /** Initialize with storage reference and load saved preference */
  async initialize(storage: Storage): Promise<void> {
    this.storage = storage;
    const settings = await storage.get<{ discordRpc?: boolean }>('settings');
    this.enabled = settings?.discordRpc !== false; // default: on
    this.notifyRenderer();
    if (this.enabled) this.start();
  }

  /** Start the manager — tries to connect, sets up reconnect loop */
  private start(): void {
    if (this.destroyed) return;
    this.tryConnect();
    if (!this.reconnectTimer) {
      this.reconnectTimer = setInterval(() => {
        if (!this.connected && !this.connecting && !this.destroyed && this.enabled) this.tryConnect();
      }, RECONNECT_INTERVAL);
    }
  }

  /** Stop — disconnect and clear timers (does not destroy permanently) */
  private stop(): void {
    if (this.reconnectTimer) { clearInterval(this.reconnectTimer); this.reconnectTimer = null; }
    this.clearActivity();
    // give Discord a moment to process the clear, then disconnect
    setTimeout(() => this.disconnect(), 200);
  }

  /** Permanent shutdown on app quit */
  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) { clearInterval(this.reconnectTimer); this.reconnectTimer = null; }
    this.clearActivity();
    setTimeout(() => this.disconnect(), 100);
  }

  /** Enable or disable RPC (persisted to settings) */
  async setEnabled(on: boolean): Promise<void> {
    this.enabled = on;
    // Persist
    if (this.storage) {
      const s = (await this.storage.get<Record<string, any>>('settings')) ?? {};
      s.discordRpc = on;
      await this.storage.set('settings', s);
    }
    if (on) {
      this.start();
    } else {
      this.stop();
    }
    this.notifyRenderer();
  }

  /** Is RPC enabled? */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Update current page and push presence */
  setPage(pageId: string): void {
    this.currentPage = getPageLabel(pageId);
    this.currentDetail = null; // reset detail on page change
    if (this.connected && this.enabled) this.setActivity();
  }

  /** Set a specific detail line (e.g. "Monitoring 3 accounts") — pass null to clear */
  setDetail(detail: string | null): void {
    this.currentDetail = detail;
    if (this.connected && this.enabled) this.setActivity();
  }

  /** Is currently connected to Discord? */
  isConnected(): boolean {
    return this.connected;
  }

  // ── Connection ────────────────────────────────────────────

  private tryConnect(): void {
    if (this.connected || this.destroyed || !this.enabled || this.connecting) return;
    // Kill any stale/zombie socket before attempting fresh connection
    if (this.socket) {
      try { this.socket.removeAllListeners(); this.socket.destroy(); } catch { /* */ }
      this.socket = null;
      this.connected = false;
      this.buffer = Buffer.alloc(0);
    }
    this.connecting = true;
    this.tryPipe(0);
  }

  private tryPipe(index: number): void {
    if (index > 9 || this.connected || this.destroyed || !this.enabled) {
      this.connecting = false;
      return;
    }

    const pipePath = process.platform === 'win32'
      ? `${PIPE_PREFIX}${index}`
      : `/tmp/discord-ipc-${index}`;

    const sock = net.createConnection(pipePath);
    let settled = false;

    sock.once('connect', () => {
      if (settled) return;
      settled = true;
      // Clear the connection-phase timeout so it doesn't kill the socket later
      sock.setTimeout(0);
      // Destroy any previous stale socket before assigning the new one
      if (this.socket && this.socket !== sock) {
        try { this.socket.removeAllListeners(); this.socket.destroy(); } catch { /* */ }
      }
      this.socket = sock;
      this.buffer = Buffer.alloc(0);
      this.connecting = false;
      this.setupSocket();
      this.handshake();
    });

    sock.once('error', () => {
      if (settled) return;
      settled = true;
      sock.destroy();
      this.tryPipe(index + 1);
    });

    // Timeout applies ONLY during the connection phase; cleared on success
    sock.setTimeout(2000, () => {
      if (settled) return;
      settled = true;
      sock.destroy();
      this.tryPipe(index + 1);
    });
  }

  private setupSocket(): void {
    if (!this.socket) return;

    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processBuffer();
    });

    this.socket.on('close', () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.socket = null;
      this.buffer = Buffer.alloc(0);
      if (wasConnected) this.notifyRenderer();
    });

    this.socket.on('error', () => {
      this.connected = false;
      this.socket?.destroy();
      this.socket = null;
    });
  }

  private processBuffer(): void {
    while (this.buffer.length >= 8) {
      const len = this.buffer.readInt32LE(4);
      if (this.buffer.length < 8 + len) break;
      const packet = decode(this.buffer.slice(0, 8 + len));
      this.buffer = this.buffer.slice(8 + len);
      if (packet) this.handlePacket(packet);
    }
  }

  private handlePacket(pkt: Packet): void {
    if (pkt.op === OP.FRAME) {
      const evt = pkt.data?.evt;
      const cmd = pkt.data?.cmd;

      if (evt === 'READY') {
        this.connected = true;
        this.startTimestamp = Date.now();
        this.notifyRenderer();
        // Small delay before first activity to let Discord settle
        setTimeout(() => {
          if (this.connected && this.enabled) this.setActivity();
        }, 500);
        return;
      }
      // Handle SET_ACTIVITY response — if it has an error, log but stay connected
      if (cmd === 'SET_ACTIVITY' && pkt.data?.evt === 'ERROR') {
        console.warn('[DiscordRPC] SET_ACTIVITY error:', pkt.data?.data?.message);
        return;
      }
    } else if (pkt.op === OP.CLOSE) {
      this.disconnect();
    } else if (pkt.op === OP.PING) {
      this.send(OP.PONG, pkt.data);
    }
  }

  // ── Sending ───────────────────────────────────────────────

  private send(op: number, data: any): void {
    if (!this.socket || this.socket.destroyed) return;
    try { this.socket.write(encode(op, data)); } catch { /* ignore */ }
  }

  private handshake(): void {
    this.send(OP.HANDSHAKE, { v: 1, client_id: CLIENT_ID });
  }

  private setActivity(): void {
    const activity: Record<string, any> = {
      details: this.currentDetail
        ? `${this.currentPage} — ${this.currentDetail}`
        : `Browsing ${this.currentPage}`,
      state: 'GLOW Launcher',
      timestamps: { start: this.startTimestamp },
      assets: {
        large_image: 'glow_logo',
        large_text: 'GLOW Launcher',
      },
    };

    this.send(OP.FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: nonce(),
    });
  }

  private clearActivity(): void {
    if (!this.connected || !this.socket) return;
    this.send(OP.FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: null },
      nonce: nonce(),
    });
  }

  private disconnect(): void {
    if (this.socket) {
      try { this.socket.end(); this.socket.destroy(); } catch { /* */ }
      this.socket = null;
    }
    const wasConnected = this.connected;
    this.connected = false;
    this.buffer = Buffer.alloc(0);
    if (wasConnected) this.notifyRenderer();
  }

  // ── Renderer notification ─────────────────────────────────

  private notifyRenderer(): void {
    try {
      const payload = { connected: this.connected, enabled: this.enabled };
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        if (!w.isDestroyed()) {
          w.webContents.send('discord-rpc:status', payload);
        }
      }
    } catch { /* window might be closing */ }
  }
}

// Singleton
export const discordRpc = new DiscordRpcManager();
