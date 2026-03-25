/**
 * TaxiManager — Fortnite Taxi Bot System for GLOW Launcher
 *
 * Manages EpicClient instances per account. Handles:
 * - Friend request acceptance (public/private + whitelist)
 * - Party invite acceptance with queue system
 * - Cosmetic/stats configuration
 * - Auto-reconnect and session management
 * - Timer-based auto-leave
 *
 * Storage: taxi.json in %AppData%/glow-launcher/data/
 */

import { BrowserWindow } from 'electron';
import axios from 'axios';
import type { Storage } from '../../storage';
import type { AccountsData, StoredAccount } from '../../../shared/types';
import { refreshAccountToken, authenticatedRequest } from '../../helpers/auth/tokenRefresh';
import { Endpoints } from '../../helpers/endpoints';
import { EpicClient } from './utils/EpicClient';

// ── Types ───────────────────────────────────────────────────

export interface TaxiWhitelistEntry {
  accountId: string;
  displayName: string;
}

export interface TaxiAccountConfig {
  isActive: boolean;
  isPrivate: boolean;
  whitelist: TaxiWhitelistEntry[];
  statusLibre: string;
  statusOcupado: string;
  tiempoParaIrse: number;
  skin: string;
  emote: string;
  level: number;
  powerLevel: number;
  responsabilityAccepted: boolean;
  autoAcceptFriends: boolean;
}

export interface TaxiData {
  accounts: Record<string, TaxiAccountConfig>;
}

export interface TaxiQueueEntry {
  accountId: string;
  displayName: string;
  partyId: string;
}

export interface TaxiLogEntry {
  accountId: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export interface TaxiAccountStatus {
  accountId: string;
  displayName: string;
  isConnected: boolean;
  isActive: boolean;
  isOccupied: boolean;
  queue: TaxiQueueEntry[];
  config: TaxiAccountConfig;
  error?: string;
}

// ── Power Level Calculation (ported from power.py) ──────────

const HOMEBASE_RATING_KEYS: [number, number][] = [
  [0, 1], [236, 2], [364, 3], [432, 4], [512, 5],
  [704, 7], [932, 8], [1196, 9], [1876, 13], [2740, 16],
  [3824, 19], [4692, 22], [5460, 24], [6260, 25], [7172, 26],
  [8084, 29], [9552, 32], [10912, 36], [13104, 41], [14844, 46],
  [17180, 49], [19008, 53], [20928, 54], [22708, 55], [24588, 57],
  [26324, 60], [28804, 63], [31312, 68], [35008, 73], [37660, 78],
  [40380, 81], [42308, 84], [44316, 86], [46448, 87], [48592, 89],
  [50852, 93], [54480, 96], [58064, 102], [62528, 107], [65472, 113],
  [68320, 116], [70400, 120], [72384, 121], [74464, 123], [76448, 124],
  [78528, 126], [80512, 127], [82592, 128], [84576, 130], [86124, 131],
  [87040, 133], [87520, 134], [87904, 136], [88384, 137], [88768, 139],
  [89248, 140], [89632, 142], [90112, 143], [90304, 144], [180608, 288],
];

function evalCurve(key: number): number {
  if (key < HOMEBASE_RATING_KEYS[0][0]) return HOMEBASE_RATING_KEYS[0][1];
  const last = HOMEBASE_RATING_KEYS[HOMEBASE_RATING_KEYS.length - 1];
  if (key >= last[0]) return last[1];
  for (let i = 0; i < HOMEBASE_RATING_KEYS.length; i++) {
    if (HOMEBASE_RATING_KEYS[i][0] > key) {
      const [prevTime, prevValue] = HOMEBASE_RATING_KEYS[i - 1];
      const [nextTime, nextValue] = HOMEBASE_RATING_KEYS[i];
      const fac = (key - prevTime) / (nextTime - prevTime);
      return prevValue * (1 - fac) + nextValue * fac;
    }
  }
  return last[1];
}

function findStatForPowerLevel(targetPL: number): number {
  // power-extra.py: find_stat_for_power_level with binary search + curve (mid * 16)
  if (targetPL < 1) return 1;
  if (targetPL > 288) return 180608;
  let lo = 1;
  let hi = 10000;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const calc = evalCurve(mid * 16);
    if (Math.abs(calc - targetPL) < 0.5) return mid;
    if (calc < targetPL) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi;
}

function calculatePowerNumber(targetPL: number): number {
  // power-extra.py sends power_level directly (not calculate_power_number result)
  return targetPL;
}

function buildStatsForPowerLevel(pl: number): { stats: any; power: number } {
  const stat = findStatForPowerLevel(pl);
  const power = calculatePowerNumber(pl);
  return {
    stats: {
      FORTStats: {
        fortitude: stat,
        offense: stat,
        resistance: stat,
        tech: stat,
        teamFortitude: stat,
        teamOffense: stat,
        teamResistance: stat,
        teamTech: stat,
        fortitude_Phoenix: stat,
        offense_Phoenix: stat,
        resistance_Phoenix: stat,
        tech_Phoenix: stat,
        teamFortitude_Phoenix: stat,
        teamOffense_Phoenix: stat,
        teamResistance_Phoenix: stat,
        teamTech_Phoenix: stat,
      },
    },
    power,
  };
}

// ── Default config ─────────────────────────────────────────

export function defaultTaxiConfig(): TaxiAccountConfig {
  return {
    isActive: false,
    isPrivate: false,
    whitelist: [],
    statusLibre: 'Free |💫| Taxi → GLOW Launcher',
    statusOcupado: 'Busy |🛑| In queue: {queue}',
    tiempoParaIrse: 2,
    skin: 'CID_028_Athena_Commando_F',
    emote: 'EID_Floss',
    level: 100,
    powerLevel: 130,
    responsabilityAccepted: false,
    autoAcceptFriends: true,
  };
}

// ── Client instance wrapper ─────────────────────────────────

interface TaxiClientInstance {
  client: EpicClient;
  accountId: string;
  displayName: string;
  occupied: boolean;
  sessionActive: boolean;
  readyTriggered: boolean;
  queue: TaxiQueueEntry[];
  byeTimeout?: NodeJS.Timeout;
  currentPowerLevel: number;
  /** True while the bot is leaving one party to join another (invite accept / queue hop) */
  isTransitioning: boolean;
}

// ── Helpers ─────────────────────────────────────────────────

function send(channel: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

// ── TaxiManager ─────────────────────────────────────────────

class TaxiManager {
  private instances = new Map<string, TaxiClientInstance>();
  private storageRef: Storage | null = null;
  private cooldowns = new Map<string, number>(); // accountId → timestamp when cooldown ends
  private disconnectLog = new Map<string, number[]>(); // accountId → array of disconnect timestamps
  private avatarCache = new Map<string, { url: string; ts: number }>(); // accountId → cached avatar URL

  // ── Storage ─────────────────────────────────────────────

  async getTaxiData(): Promise<TaxiData> {
    if (!this.storageRef) return { accounts: {} };
    return (await this.storageRef.get<TaxiData>('taxi')) ?? { accounts: {} };
  }

  async saveTaxiData(data: TaxiData): Promise<void> {
    if (!this.storageRef) return;
    await this.storageRef.set('taxi', data);
  }

  private async getAccount(accountId: string): Promise<StoredAccount | null> {
    if (!this.storageRef) return null;
    const accsData = (await this.storageRef.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    return accsData.accounts.find((a) => a.accountId === accountId) ?? null;
  }

  private getConfig(data: TaxiData, accountId: string): TaxiAccountConfig {
    if (!data.accounts[accountId]) {
      data.accounts[accountId] = defaultTaxiConfig();
    }
    const cfg = data.accounts[accountId];
    // Migrate legacy statsMode → powerLevel
    if (cfg.powerLevel === undefined || cfg.powerLevel === null) {
      const legacy = (cfg as any).statsMode;
      cfg.powerLevel = legacy === 'low' ? 1 : 130;
      delete (cfg as any).statsMode;
    }
    return cfg;
  }

  // ── Init ────────────────────────────────────────────────

  async initialize(storage: Storage): Promise<void> {
    this.storageRef = storage;
    await this.initializeAllActive();
  }

  private async initializeAllActive(): Promise<void> {
    const data = await this.getTaxiData();
    const entries = Object.entries(data.accounts).filter(([, cfg]) => cfg.isActive && cfg.responsabilityAccepted);

    if (entries.length === 0) return;
    console.log(`[TAXI] Initializing ${entries.length} active taxis...`);

    for (const [accountId, cfg] of entries) {
      const acc = await this.getAccount(accountId);
      if (!acc) {
        cfg.isActive = false;
        continue;
      }
      try {
        await this.createClient(accountId, acc, cfg);
        this.sendLog(accountId, 'success', `Connected as ${acc.displayName}`);
      } catch (e: any) {
        console.error(`[TAXI] Init failed for ${acc.displayName}: ${e?.message}`);
        this.sendLog(accountId, 'error', `Init failed: ${e?.message}`);
      }
    }

    await this.saveTaxiData(data);
    send('taxi:data-changed', null);
  }

  // ── Activate / Deactivate ─────────────────────────────

  async activate(accountId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.storageRef) return { success: false, error: 'Not initialized' };

    // Check cooldown
    const cooldownEnd = this.cooldowns.get(accountId) || 0;
    if (Date.now() < cooldownEnd) {
      const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
      return { success: false, error: `Cooldown active (${remaining}s remaining)` };
    }

    const data = await this.getTaxiData();
    const cfg = this.getConfig(data, accountId);

    if (!cfg.responsabilityAccepted) {
      return { success: false, error: 'Responsibility not accepted' };
    }

    const acc = await this.getAccount(accountId);
    if (!acc) return { success: false, error: 'Account not found' };

    try {
      await this.createClient(accountId, acc, cfg);
      cfg.isActive = true;
      await this.saveTaxiData(data);
      send('taxi:data-changed', null);
      this.sendLog(accountId, 'success', `Taxi activated for ${acc.displayName}`);
      return { success: true };
    } catch (e: any) {
      this.sendLog(accountId, 'error', `Activation failed: ${e?.message}`);
      return { success: false, error: e?.message || 'Activation failed' };
    }
  }

  async deactivate(accountId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.destroyClient(accountId);

      // Set 10s cooldown after deactivation
      const cooldownEnd = Date.now() + 10_000;
      this.cooldowns.set(accountId, cooldownEnd);
      this.disconnectLog.delete(accountId);

      const data = await this.getTaxiData();
      if (data.accounts[accountId]) {
        data.accounts[accountId].isActive = false;
      }
      await this.saveTaxiData(data);
      send('taxi:data-changed', null);
      this.sendLog(accountId, 'info', 'Taxi deactivated');

      // Notify renderer about cooldown
      const inst2 = this.instances.get(accountId);
      send('taxi:cooldown', {
        accountId,
        displayName: inst2?.displayName || accountId,
        cooldownUntil: cooldownEnd,
      });

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  }

  // ── Config ─────────────────────────────────────────────

  async updateConfig(accountId: string, partial: Partial<TaxiAccountConfig>): Promise<{ success: boolean }> {
    const data = await this.getTaxiData();
    const cfg = this.getConfig(data, accountId);
    Object.assign(cfg, partial);
    await this.saveTaxiData(data);
    send('taxi:data-changed', null);

    // If active, apply changes live
    const inst = this.instances.get(accountId);
    if (inst && inst.client) {
      try {
        await this.applyCosmetics(inst, cfg);
        if (!inst.occupied) {
          inst.client.setStatus(cfg.statusLibre);
        }
      } catch {}
    }

    return { success: true };
  }

  async acceptResponsibility(accountId: string): Promise<{ success: boolean }> {
    const data = await this.getTaxiData();
    const cfg = this.getConfig(data, accountId);
    cfg.responsabilityAccepted = true;
    await this.saveTaxiData(data);
    send('taxi:data-changed', null);
    return { success: true };
  }

  // ── Whitelist ──────────────────────────────────────────

  async addWhitelist(accountId: string, targetId: string, targetName: string): Promise<{ success: boolean }> {
    const data = await this.getTaxiData();
    const cfg = this.getConfig(data, accountId);

    if (cfg.whitelist.some((w) => w.accountId === targetId)) {
      return { success: true }; // Already in whitelist
    }

    cfg.whitelist.push({ accountId: targetId, displayName: targetName });
    await this.saveTaxiData(data);
    send('taxi:data-changed', null);
    return { success: true };
  }

  async removeWhitelist(accountId: string, targetId: string): Promise<{ success: boolean }> {
    const data = await this.getTaxiData();
    const cfg = this.getConfig(data, accountId);
    cfg.whitelist = cfg.whitelist.filter((w) => w.accountId !== targetId);
    await this.saveTaxiData(data);
    send('taxi:data-changed', null);
    return { success: true };
  }

  // ── Status query ───────────────────────────────────────

  async getAllStatus(): Promise<TaxiAccountStatus[]> {
    if (!this.storageRef) return [];

    const accsData = (await this.storageRef.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const taxiData = await this.getTaxiData();
    const results: TaxiAccountStatus[] = [];

    for (const acc of accsData.accounts) {
      const cfg = taxiData.accounts[acc.accountId] ?? defaultTaxiConfig();
      const inst = this.instances.get(acc.accountId);
      const isConnected = !!(inst && inst.client && inst.client.isReady);

      results.push({
        accountId: acc.accountId,
        displayName: acc.displayName,
        isConnected,
        isActive: cfg.isActive,
        isOccupied: inst?.occupied ?? false,
        queue: inst?.queue ?? [],
        config: cfg,
      });
    }

    return results;
  }

  // ── Avatar ──────────────────────────────────────────────

  private readonly AVATAR_CACHE_TTL = 10 * 60 * 1000; // 10 min cache
  private readonly DEFAULT_AVATAR = 'https://fortnite-api.com/images/cosmetics/br/cid_890_athena_commando_f_choneheadhunter/variants/material/mat2.png';

  async getAvatar(accountId: string): Promise<string> {
    // Check cache
    const cached = this.avatarCache.get(accountId);
    if (cached && Date.now() - cached.ts < this.AVATAR_CACHE_TTL) {
      return cached.url;
    }

    if (!this.storageRef) {
      return this.DEFAULT_AVATAR;
    }

    try {
      // 1. Get token
      const token = await refreshAccountToken(this.storageRef, accountId);
      if (!token) return this.DEFAULT_AVATAR;

      // 2. Fetch from Epic API
      const avatarApiUrl = `${Endpoints.ACCOUNT_AVATAR}/fortnite/ids?accountIds=${accountId}`;

      let avatarId: string | null = null;

      try {
        const response = await axios.get(avatarApiUrl, {
          headers: { Authorization: `bearer ${token}` },
          timeout: 8000,
        });

        if (Array.isArray(response.data) && response.data[0]?.avatarId) {
          avatarId = response.data[0].avatarId;
        }
      } catch (err: any) {
        if (err?.response?.status === 401) {
          const newToken = await refreshAccountToken(this.storageRef, accountId);
          if (newToken) {
            try {
              const retryRes = await axios.get(avatarApiUrl, {
                headers: { Authorization: `bearer ${newToken}` },
                timeout: 8000,
              });
              if (Array.isArray(retryRes.data) && retryRes.data[0]?.avatarId) {
                avatarId = retryRes.data[0].avatarId;
              }
            } catch (retryErr: any) {
              console.error('[TaxiAvatar] Retry failed:', retryErr?.response?.status, retryErr?.message);
            }
          }
        } else {
          console.error('[TaxiAvatar] Request error:', err?.response?.status, err?.code, err?.message);
        }
      }

      // 3. Build URL
      let iconURL: string;
      if (avatarId && avatarId.includes(':')) {
        const idPart = avatarId.split(':')[1];
        iconURL = `https://fortnite-api.com/images/cosmetics/br/${idPart}/smallicon.png`;
      } else {
        iconURL = this.DEFAULT_AVATAR;
      }

      this.avatarCache.set(accountId, { url: iconURL, ts: Date.now() });
      return iconURL;
    } catch (err: any) {
      console.error('[TaxiAvatar] Unexpected error:', err?.message, err?.stack);
      return this.DEFAULT_AVATAR;
    }
  }

  async getAllAvatars(): Promise<Record<string, string>> {
    if (!this.storageRef) return {};
    const accsData = (await this.storageRef.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const result: Record<string, string> = {};

    await Promise.all(
      accsData.accounts.map(async (acc) => {
        result[acc.accountId] = await this.getAvatar(acc.accountId);
      }),
    );

    return result;
  }

  // ── EpicClient Creation ───────────────────────────────

  private async createClient(
    accountId: string,
    account: StoredAccount,
    config: TaxiAccountConfig,
    retryCount = 0,
  ): Promise<void> {
    // Destroy existing
    if (this.instances.has(accountId)) {
      await this.destroyClient(accountId);
    }

    console.log(`[TAXI] Creating EpicClient for ${account.displayName}... (attempt ${retryCount + 1})`);

    const client = new EpicClient({
      deviceAuth: {
        accountId: account.accountId,
        deviceId: account.deviceId,
        secret: account.secret,
      },
    });

    const inst: TaxiClientInstance = {
      client,
      accountId,
      displayName: account.displayName,
      occupied: false,
      sessionActive: false,
      readyTriggered: false,
      queue: [],
      currentPowerLevel: config.powerLevel,
      isTransitioning: false,
    };

    this.instances.set(accountId, inst);

    // Setup events BEFORE login
    this.setupEvents(inst, config);

    // Login
    try {
      await client.login();
    } catch (e: any) {
      this.instances.delete(accountId);
      const msg = e?.message?.toLowerCase() || '';
      if ((msg.includes('auth') || msg.includes('token') || msg.includes('401') ||
           msg.includes('oauth') || msg.includes('invalid')) && retryCount < 2) {
        this.sendLog(accountId, 'warn', `Auth error, retrying in 5s... (${e?.message})`);
        await new Promise((r) => setTimeout(r, 5000));
        return this.createClient(accountId, account, config, retryCount + 1);
      }
      throw e;
    }

    console.log(`[TAXI] ${account.displayName} logged in ✅`);

    // Set free status immediately
    try { client.setStatus(config.statusLibre); } catch {}

    // Apply cosmetics right after login
    try {
      await inst.client.setOutfit(config.skin);
      this.sendLog(accountId, 'info', `Skin set: ${config.skin}`);
    } catch (e: any) {
      this.sendLog(accountId, 'warn', `Failed to set skin after login: ${e?.message}`);
    }

    try {
      await inst.client.setBanner('standardbanner15');
    } catch {}

    try {
      await inst.client.setLevel(config.level);
      this.sendLog(accountId, 'info', `Level set: ${config.level}`);
    } catch (e: any) {
      this.sendLog(accountId, 'warn', `Failed to set level after login: ${e?.message}`);
    }

    // Apply stats
    await this.applyStats(inst, config.powerLevel);

    send('taxi:status-update', {
      accountId,
      displayName: account.displayName,
      connected: true,
    });
  }

  private setupEvents(inst: TaxiClientInstance, config: TaxiAccountConfig): void {
    const { client, accountId } = inst;

    // Friend request
    client.on('friend:request', async (friend: any) => {
      const freshCfg = await this.getFreshConfig(accountId);
      await this.handleFriendRequest(inst, friend, freshCfg);
    });

    // Party invite
    client.on('party:invite', async (invite: any) => {
      const freshCfg = await this.getFreshConfig(accountId);
      await this.handlePartyInvite(inst, invite, freshCfg);
    });

    // Member joined — re-apply cosmetics whenever bot joins a new party
    client.on('party:member:joined', async (member: any) => {
      try {
        // Only act when the bot itself joins
        if (member.id === client.user?.self?.id) {
          // Skip if we're in the middle of an invite accept / queue hop —
          // the calling code will apply cosmetics itself.
          if (inst.isTransitioning) return;

          const freshCfg = await this.getFreshConfig(accountId);
          this.sendLog(accountId, 'info', 'Bot joined party, applying cosmetics...');
          await new Promise((r) => setTimeout(r, 1000));

          // Apply cosmetics + stats
          try { await client.setOutfit(freshCfg.skin); } catch {}
          try { await client.setBanner('standardbanner15'); } catch {}
          try { await client.setLevel(freshCfg.level); } catch {}
          await this.applyStats(inst, freshCfg.powerLevel);
        }
      } catch (e: any) {
        this.sendLog(accountId, 'warn', `Error applying cosmetics on join: ${e?.message}`);
      }
    });

    // Member left
    client.on('party:member:left', async (member: any) => {
      const freshCfg = await this.getFreshConfig(accountId);
      await this.handleMemberLeft(inst, member, freshCfg);
    });

    // Member expired (kicked)
    client.on('party:member:expired', async (member: any) => {
      const freshCfg = await this.getFreshConfig(accountId);
      if (member.id === client.user?.self?.id) {
        this.sendLog(accountId, 'warn', 'Kicked from party');
        await this.finishSession(inst, freshCfg);
      }
    });

    // Member updated (readiness)
    client.on('party:member:updated', async (member: any) => {
      try {
        if (member.id !== client.user?.self?.id && member.isReady && !inst.readyTriggered) {
          inst.readyTriggered = true;
          await client.setReadiness(true);
          this.sendLog(accountId, 'info', 'Set ready (member readied up)');
        }
      } catch (e: any) {
        inst.readyTriggered = false;
      }
    });

    // Party chat message → switch to reversa/low stats (PL 1)
    client.on('party:member:message', async (msgObj: any) => {
      try {
        await this.applyStats(inst, 1);
        inst.currentPowerLevel = 1;
        this.sendLog(accountId, 'info', 'Switched to PL 1 stats (party message)');
      } catch {}
    });

    // Disconnected
    client.on('disconnected', async () => {
      console.log(`[TAXI] ${inst.displayName} disconnected`);
      this.sendLog(accountId, 'warn', 'Disconnected');
      send('taxi:status-update', {
        accountId,
        displayName: inst.displayName,
        connected: false,
        error: 'Disconnected',
      });

      // Track disconnect for flap detection
      const now = Date.now();
      const dcLog = this.disconnectLog.get(accountId) || [];
      dcLog.push(now);
      // Keep only disconnects from last 30s
      const recent = dcLog.filter((t) => now - t < 30_000);
      this.disconnectLog.set(accountId, recent);

      // If 3+ disconnects in 30s → flapping, auto-disable with 10s cooldown
      if (recent.length >= 3) {
        this.sendLog(accountId, 'error', 'Connection loop detected — auto-disabled for 10s');
        const cooldownEnd = Date.now() + 10_000;
        this.cooldowns.set(accountId, cooldownEnd);
        this.disconnectLog.delete(accountId);

        try { await this.destroyClient(accountId); } catch {}
        const data0 = await this.getTaxiData();
        if (data0.accounts[accountId]) {
          data0.accounts[accountId].isActive = false;
        }
        await this.saveTaxiData(data0);
        send('taxi:data-changed', null);
        send('taxi:cooldown', {
          accountId,
          displayName: inst.displayName,
          cooldownUntil: cooldownEnd,
        });

        // Auto-reactivate after cooldown
        setTimeout(async () => {
          try {
            const data4 = await this.getTaxiData();
            const cfg4 = data4.accounts[accountId];
            if (!cfg4 || !cfg4.responsabilityAccepted) return;
            const acc = await this.getAccount(accountId);
            if (!acc) return;
            this.sendLog(accountId, 'info', 'Auto-reactivating after cooldown...');
            await this.createClient(accountId, acc, cfg4);
            cfg4.isActive = true;
            await this.saveTaxiData(data4);
            send('taxi:data-changed', null);
            this.sendLog(accountId, 'success', 'Reactivated successfully');
          } catch (e: any) {
            this.sendLog(accountId, 'error', `Auto-reactivation failed: ${e?.message}`);
          }
        }, 10_000);
        return; // Don't do normal reconnect
      }

      // Check if still active and try to reconnect with token refresh
      const data = await this.getTaxiData();
      const cfg = data.accounts[accountId];
      if (cfg?.isActive) {
        this.sendLog(accountId, 'info', 'Reconnecting in 10s (will refresh token)...');
        setTimeout(async () => {
          try {
            const data2 = await this.getTaxiData();
            if (!data2.accounts[accountId]?.isActive) return;

            const acc = await this.getAccount(accountId);
            if (!acc) return;
            const cfg2 = data2.accounts[accountId];
            // createClient already refreshes token + retries on 401
            await this.createClient(accountId, acc, cfg2);
            this.sendLog(accountId, 'success', 'Reconnected successfully');
          } catch (e: any) {
            this.sendLog(accountId, 'error', `Reconnect failed: ${e?.message}`);
            send('taxi:status-update', {
              accountId,
              displayName: inst.displayName,
              connected: false,
              error: e?.message,
            });
            // Retry once more after 30s if still active
            setTimeout(async () => {
              try {
                const data3 = await this.getTaxiData();
                if (!data3.accounts[accountId]?.isActive) return;
                const acc2 = await this.getAccount(accountId);
                if (!acc2) return;
                await this.createClient(accountId, acc2, data3.accounts[accountId]);
                this.sendLog(accountId, 'success', 'Reconnected on second attempt');
              } catch (e2: any) {
                this.sendLog(accountId, 'error', `Second reconnect failed: ${e2?.message}`);
              }
            }, 30_000);
          }
        }, 10_000);
      }
    });
  }

  // ── Handlers ──────────────────────────────────────────

  private async handleFriendRequest(
    inst: TaxiClientInstance,
    friend: any,
    config: TaxiAccountConfig,
  ): Promise<void> {
    const incomingId = friend.id || friend.accountId;
    const incomingName = friend.displayName || incomingId;

    this.sendLog(inst.accountId, 'info', `Friend request from ${incomingName}`);

    if (config.isPrivate) {
      const isAllowed = config.whitelist.some((w) => w.accountId === incomingId);
      if (!isAllowed) {
        this.sendLog(inst.accountId, 'warn', `Rejected friend request (not whitelisted): ${incomingName}`);
        try { await friend.decline(); } catch {}
        return;
      }
    }

    if (config.autoAcceptFriends) {
      try {
        await friend.accept();
        this.sendLog(inst.accountId, 'success', `Accepted friend request from ${incomingName}`);
      } catch (e: any) {
        this.sendLog(inst.accountId, 'error', `Error accepting friend: ${e?.message}`);
      }
    }
  }

  private async handlePartyInvite(
    inst: TaxiClientInstance,
    invite: any,
    config: TaxiAccountConfig,
  ): Promise<void> {
    const senderId = invite.sender?.id || invite.sender?.accountId || 'unknown';
    const senderName = invite.sender?.displayName || senderId;

    this.sendLog(inst.accountId, 'info', `Party invite from ${senderName}`);

    // Private mode check
    if (config.isPrivate) {
      const isAllowed = config.whitelist.some((w) => w.accountId === senderId);
      if (!isAllowed) {
        this.sendLog(inst.accountId, 'warn', `Declined invite (not whitelisted): ${senderName}`);
        try { await invite.decline(); } catch {}
        return;
      }
    }

    // If occupied → queue
    if (inst.occupied) {
      const alreadyInQueue = inst.queue.some((q) => q.accountId === senderId);
      if (alreadyInQueue) {
        const pos = inst.queue.findIndex((q) => q.accountId === senderId) + 1;
        this.sendLog(inst.accountId, 'info', `${senderName} already in queue (position ${pos})`);
      } else {
        inst.queue.push({
          accountId: senderId,
          displayName: senderName,
          partyId: invite.party?.id || '',
        });
        this.sendLog(inst.accountId, 'info', `${senderName} added to queue (position ${inst.queue.length})`);
        this.updateOccupiedStatus(inst, config);
      }
      try { await invite.decline(); } catch {}
      send('taxi:data-changed', null);
      return;
    }

    // Free → accept invite
    try {
      inst.occupied = true;
      inst.sessionActive = true;
      inst.readyTriggered = false;
      inst.currentPowerLevel = config.powerLevel;
      inst.isTransitioning = true;

      await invite.accept();
      inst.isTransitioning = false;
      this.sendLog(inst.accountId, 'success', `Joined ${senderName}'s party`);

      // Wait for party to settle, apply outfit/banner/level
      await new Promise((r) => setTimeout(r, 1500));
      try { await inst.client.setOutfit(config.skin); } catch {}
      try { await inst.client.setBanner('standardbanner15'); } catch {}
      try { await inst.client.setLevel(config.level); } catch {}
      // Apply configured power level stats on session start
      await this.applyStats(inst, config.powerLevel);

      // Set emote after cosmetics
      await new Promise((r) => setTimeout(r, 500));
      try {
        if (config.emote) {
          await inst.client.setEmote(config.emote);
        }
      } catch {}

      // Update status
      this.updateOccupiedStatus(inst, config);

      // Send party message
      try {
        inst.client.sendPartyMessage('👋 Hello! GLOW Taxi');
      } catch {}

      // Start timer
      this.startLeaveTimer(inst, config);

      // Re-apply configured power level stats after 3 seconds
      setTimeout(async () => {
        try {
          const { stats: reStats, power: rePower } = buildStatsForPowerLevel(config.powerLevel);
          await inst.client.sendMemberPatch({
            'Default:FORTStats_j': JSON.stringify(reStats),
            'Default:CampaignCommanderLoadoutRating_d': String(rePower),
            'Default:CampaignBackpackRating_d': String(rePower),
          });
          this.sendLog(inst.accountId, 'info', `PL ${config.powerLevel} stats re-applied (3s after join)`);
        } catch {}
      }, 3000);

      send('taxi:data-changed', null);
    } catch (e: any) {
      inst.isTransitioning = false;
      inst.occupied = false;
      inst.sessionActive = false;
      this.sendLog(inst.accountId, 'error', `Error accepting invite: ${e?.message}`);
    }
  }

  private async handleMemberLeft(
    inst: TaxiClientInstance,
    member: any,
    config: TaxiAccountConfig,
  ): Promise<void> {
    // If it's the bot itself that left
    if (member.id === inst.client.user?.self?.id) {
      this.sendLog(inst.accountId, 'info', 'Left the party');
      // Skip finishSession if we're transitioning (accepting invite / queue hop)
      if (inst.isTransitioning) return;
      await this.finishSession(inst, config);
      return;
    }

    try {
      // In our implementation the bot is always the joiner, not the leader.
      // But if the party empties out, we should go free.
      const isLeader = false; // Taxi bots are never party leaders

      if (inst.queue.length > 0) {
        // Process next in queue
        if (inst.byeTimeout) {
          clearTimeout(inst.byeTimeout);
          inst.byeTimeout = undefined;
        }
        await this.processNextInQueue(inst, config);
      } else {
        // No queue, go free
        inst.occupied = false;
        inst.sessionActive = false;
        if (inst.byeTimeout) {
          clearTimeout(inst.byeTimeout);
          inst.byeTimeout = undefined;
        }

        inst.client.setStatus(config.statusLibre);
        try { await inst.client.leaveParty(); } catch {}

        this.sendLog(inst.accountId, 'info', 'Party empty, back to free');
        send('taxi:data-changed', null);
      }
    } catch (e: any) {
      this.sendLog(inst.accountId, 'error', `Error handling member left: ${e?.message}`);
    }
  }

  // ── Session management ────────────────────────────────

  private startLeaveTimer(inst: TaxiClientInstance, config: TaxiAccountConfig): void {
    if (inst.byeTimeout) {
      clearTimeout(inst.byeTimeout);
    }

    const delay = config.tiempoParaIrse * 60_000 + 1000;
    this.sendLog(inst.accountId, 'info', `Will leave in ${config.tiempoParaIrse} min`);

    inst.byeTimeout = setTimeout(async () => {
      if (!inst.sessionActive) return;

      try {
        inst.client.sendPartyMessage('Bye! 👋 GLOW Taxi');
      } catch {}

      await new Promise((r) => setTimeout(r, 2000));

      try {
        await inst.client.leaveParty();
      } catch {}

      this.sendLog(inst.accountId, 'info', 'Timer expired, leaving party');
      await this.finishSession(inst, config);
    }, delay);
  }

  private async finishSession(inst: TaxiClientInstance, config: TaxiAccountConfig): Promise<void> {
    if (!inst.sessionActive && !inst.byeTimeout && !inst.occupied) return;

    inst.sessionActive = false;
    inst.readyTriggered = false;
    inst.currentPowerLevel = config.powerLevel; // Reset to configured PL

    if (inst.byeTimeout) {
      clearTimeout(inst.byeTimeout);
      inst.byeTimeout = undefined;
    }

    if (inst.queue.length > 0) {
      await this.processNextInQueue(inst, config);
    } else {
      // Like reference finishSession: just set free status + leave party
      inst.occupied = false;
      inst.client.setStatus(config.statusLibre);

      try { await inst.client.leaveParty(); } catch {}

      this.sendLog(inst.accountId, 'info', 'Session finished, back to free');
      send('taxi:data-changed', null);
    }
  }

  private async processNextInQueue(inst: TaxiClientInstance, config: TaxiAccountConfig): Promise<void> {
    const next = inst.queue.shift();
    if (!next) {
      inst.occupied = false;
      inst.client.setStatus(config.statusLibre);
      send('taxi:data-changed', null);
      return;
    }

    this.sendLog(inst.accountId, 'info', `Processing next in queue: ${next.displayName}`);
    send('taxi:data-changed', null);

    try {
      // Leave current party (flag transition so member:left doesn't trigger finishSession)
      inst.isTransitioning = true;
      try { await inst.client.leaveParty(false); } catch {}
      await new Promise((r) => setTimeout(r, 2000));
      inst.isTransitioning = false;

      // Try to join next person's party
      let joined = false;

      // Method 1: Join by party ID
      if (next.partyId) {
        try {
          const party = await inst.client.getParty(next.partyId);
          if (party) {
            await party.join();
            joined = true;
          }
        } catch {}
      }

      // Method 2: Try to join by friend presence party ID
      if (!joined) {
        try {
          const friendPartyId = inst.client.getFriendPartyId(next.accountId);
          if (friendPartyId) {
            const party = await inst.client.getParty(friendPartyId);
            if (party) {
              await party.join();
              joined = true;
            }
          }
        } catch {}
      }

      if (joined) {
        inst.sessionActive = true;
        inst.readyTriggered = false;

        // Apply everything after joining from queue
        await new Promise((r) => setTimeout(r, 1500));
        try { await inst.client.setOutfit(config.skin); } catch {}
        try { await inst.client.setBanner('standardbanner15'); } catch {}
        try { await inst.client.setLevel(config.level); } catch {}
        await this.applyStats(inst, config.powerLevel);

        // Emote
        await new Promise((r) => setTimeout(r, 500));
        try {
          if (config.emote) await inst.client.setEmote(config.emote);
        } catch {}

        // Re-apply configured power level stats after 3s
        setTimeout(async () => {
          try {
            const { stats: reStats2, power: rePower2 } = buildStatsForPowerLevel(config.powerLevel);
            await inst.client.sendMemberPatch({
              'Default:FORTStats_j': JSON.stringify(reStats2),
              'Default:CampaignCommanderLoadoutRating_d': String(rePower2),
              'Default:CampaignBackpackRating_d': String(rePower2),
            });
          } catch {}
        }, 3000);

        this.updateOccupiedStatus(inst, config);
        this.startLeaveTimer(inst, config);
        this.sendLog(inst.accountId, 'success', `Joined ${next.displayName}'s party from queue`);
      } else {
        this.sendLog(inst.accountId, 'warn', `Could not join ${next.displayName}'s party, skipping`);
        // Try next in queue
        await this.processNextInQueue(inst, config);
      }
    } catch (e: any) {
      this.sendLog(inst.accountId, 'error', `Queue processing error: ${e?.message}`);
      await this.processNextInQueue(inst, config);
    }
  }

  // ── Cosmetics and Stats ──────────────────────────────

  /**
   * Apply cosmetics inline (outfit, banner, level).
   * Called after login and when going free.
   */
  private async applyCosmetics(inst: TaxiClientInstance, config: TaxiAccountConfig): Promise<void> {
    try { await inst.client.setOutfit(config.skin); } catch {}
    try { await inst.client.setBanner('standardbanner15'); } catch {}
    try { await inst.client.setLevel(config.level); } catch {}
    await this.applyStats(inst, config.powerLevel);
  }

  /**
   * Apply stats via sendMemberPatch for a given power level.
   */
  private async applyStats(inst: TaxiClientInstance, powerLevel: number): Promise<void> {
    try {
      const { stats, power } = buildStatsForPowerLevel(powerLevel);
      const fortStat = stats.FORTStats.fortitude;
      console.log(`[TAXI-STATS] PL=${powerLevel} → stat=${fortStat}, power=${power}`);

      await inst.client.sendMemberPatch({
        'Default:FORTStats_j': JSON.stringify(stats),
        'Default:CampaignCommanderLoadoutRating_d': String(power),
        'Default:CampaignBackpackRating_d': String(power),
      });
    } catch {}
  }

  private updateOccupiedStatus(inst: TaxiClientInstance, config: TaxiAccountConfig): void {
    const status = config.statusOcupado.replace('{queue}', String(inst.queue.length));
    inst.client.setStatus(status);
  }

  // ── Destroy ───────────────────────────────────────────

  private async destroyClient(accountId: string): Promise<void> {
    const inst = this.instances.get(accountId);
    if (!inst) return;

    if (inst.byeTimeout) {
      clearTimeout(inst.byeTimeout);
      inst.byeTimeout = undefined;
    }

    try {
      await inst.client.logout();
    } catch {
      try {
        await inst.client.destroy();
      } catch {}
    }

    this.instances.delete(accountId);
    send('taxi:status-update', {
      accountId,
      displayName: inst.displayName,
      connected: false,
    });
  }

  async destroyAll(): Promise<void> {
    for (const accountId of Array.from(this.instances.keys())) {
      await this.destroyClient(accountId);
    }
  }

  // ── Helpers ───────────────────────────────────────────

  private async getFreshConfig(accountId: string): Promise<TaxiAccountConfig> {
    const data = await this.getTaxiData();
    return data.accounts[accountId] ?? defaultTaxiConfig();
  }

  private sendLog(accountId: string, type: string, message: string): void {
    const entry: TaxiLogEntry = {
      accountId,
      type: type as TaxiLogEntry['type'],
      message,
      timestamp: Date.now(),
    };
    send('taxi:log', entry);
    console.log(`[TAXI] [${type.toUpperCase()}] ${message}`);
  }
}

export const taxiManager = new TaxiManager();
