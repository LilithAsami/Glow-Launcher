/**
 * Auto-Expeditions Event System
 *
 * Periodically checks all configured accounts, collects completed expeditions
 * and sends new ones based on user-selected reward types.
 *
 * Data stored in JSON via Storage (key: 'auto-expeditions').
 */

import { BrowserWindow } from 'electron';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';
import { refreshAccountToken } from '../../helpers/auth/tokenRefresh';
import expeditionManager from '../../managers/expeditions';
import { getCampaignData } from '../../managers/expeditions/helpers';
import { notificationManager } from '../../managers/notifications/NotificationManager';

// ── Types ────────────────────────────────────────────────────

export interface AutoExpAccountConfig {
  isActive: boolean;
  rewardTypes: string[];   // e.g. ['Heroes', 'Survivors', 'Supplies']
  lastActivity?: string;   // ISO date
  lastCollected?: number;
  lastSent?: number;
}

export interface AutoExpData {
  accounts: Record<string, AutoExpAccountConfig>;
}

export interface AutoExpLogEntry {
  accountId: string;
  displayName: string;
  type: 'info' | 'success' | 'error' | 'warn';
  message: string;
  timestamp: number;
}

// ── Constants ────────────────────────────────────────────────

const EXPEDITION_TYPES = ['Heroes', 'Survivors', 'Supplies', 'Resources', 'Traps', 'Weapons'] as const;
export type ExpeditionRewardType = typeof EXPEDITION_TYPES[number];

const CYCLE_INTERVAL = 60 * 60 * 1000; // 1 hour
const INITIAL_DELAY = 30 * 1000;         // 30 seconds after startup

let intervalHandle: ReturnType<typeof setTimeout> | null = null;
let storageRef: Storage | null = null;

// ── Helpers ──────────────────────────────────────────────────

function sendLog(entry: AutoExpLogEntry): void {
  try {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('expeditions:log', entry);
    }
  } catch {}
}

function emitDataChanged(): void {
  try {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('expeditions:data-changed');
    }
  } catch {}
}

// ── Storage access ───────────────────────────────────────────

export async function getAutoExpData(storage: Storage): Promise<AutoExpData> {
  const data = await storage.get<AutoExpData>('auto-expeditions');
  return data ?? { accounts: {} };
}

async function saveAutoExpData(storage: Storage, data: AutoExpData): Promise<void> {
  await storage.set('auto-expeditions', data);
}

// ── Public API (called from IPC) ─────────────────────────────

export async function getAutoExpStatus(storage: Storage): Promise<{
  success: boolean;
  data: AutoExpData;
  accounts: { accountId: string; displayName: string; isMain: boolean }[];
}> {
  const expData = await getAutoExpData(storage);
  const accs = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const accounts = accs.accounts.map((a) => ({
    accountId: a.accountId,
    displayName: a.displayName,
    isMain: a.isMain ?? false,
  }));
  return { success: true, data: expData, accounts };
}

export async function toggleAutoExp(
  storage: Storage,
  accountId: string,
  active: boolean,
  rewardTypes?: string[],
): Promise<{ success: boolean; error?: string }> {
  const data = await getAutoExpData(storage);

  if (active) {
    data.accounts[accountId] = {
      isActive: true,
      rewardTypes: rewardTypes ?? data.accounts[accountId]?.rewardTypes ?? [],
      lastActivity: new Date().toISOString(),
    };
  } else {
    if (data.accounts[accountId]) {
      data.accounts[accountId].isActive = false;
    }
  }

  await saveAutoExpData(storage, data);
  emitDataChanged();
  return { success: true };
}

export async function updateAutoExpConfig(
  storage: Storage,
  accountId: string,
  partial: Partial<AutoExpAccountConfig>,
): Promise<{ success: boolean }> {
  const data = await getAutoExpData(storage);
  const existing = data.accounts[accountId] ?? { isActive: false, rewardTypes: [] };
  data.accounts[accountId] = { ...existing, ...partial };
  await saveAutoExpData(storage, data);
  emitDataChanged();
  return { success: true };
}

/**
 * Run a single cycle for one account — collect completed + send new.
 * Can be called manually from the UI or by the interval.
 */
export async function runExpeditionCycle(
  storage: Storage,
  accountId: string,
): Promise<{
  success: boolean;
  collected: number;
  sent: number;
  errors: string[];
}> {
  const result = { success: false, collected: 0, sent: 0, errors: [] as string[] };

  const accs = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const account = accs.accounts.find((a) => a.accountId === accountId);
  if (!account) {
    result.errors.push('Account not found');
    return result;
  }

  const displayName = account.displayName;

  // 1. Refresh token
  sendLog({ accountId, displayName, type: 'info', message: 'Refreshing token...', timestamp: Date.now() });
  const token = await refreshAccountToken(storage, accountId);
  if (!token) {
    const msg = 'Failed to refresh token — check device auth';
    sendLog({ accountId, displayName, type: 'error', message: msg, timestamp: Date.now() });
    result.errors.push(msg);
    return result;
  }

  const expData = await getAutoExpData(storage);
  const cfg = expData.accounts[accountId];
  if (!cfg || !cfg.isActive) {
    result.errors.push('Auto-expeditions not active for this account');
    return result;
  }

  try {
    // 2. Fetch campaign data
    sendLog({ accountId, displayName, type: 'info', message: 'Fetching campaign data...', timestamp: Date.now() });
    const campaignResult = await getCampaignData({ accountId, accessToken: token, forceRefresh: true });
    if (!campaignResult.success) {
      const msg = `Campaign data error: ${campaignResult.error}`;
      sendLog({ accountId, displayName, type: 'error', message: msg, timestamp: Date.now() });
      result.errors.push(msg);
      return result;
    }

    // 3. Claim collected resources
    sendLog({ accountId, displayName, type: 'info', message: 'Claiming expedition resources...', timestamp: Date.now() });
    await expeditionManager.claimCollectedResources({ accountId, accessToken: token, campaignData: campaignResult.data });

    // 4. Refresh available expeditions
    sendLog({ accountId, displayName, type: 'info', message: 'Refreshing available expeditions...', timestamp: Date.now() });
    await expeditionManager.refreshExpeditions({ accountId, accessToken: token });

    // 5. Collect completed expeditions
    sendLog({ accountId, displayName, type: 'info', message: 'Collecting completed expeditions...', timestamp: Date.now() });
    const collectResult = await expeditionManager.collectExpeditions({ accountId, accessToken: token });

    if (collectResult.success && collectResult.collected > 0) {
      result.collected = collectResult.collected;
      sendLog({
        accountId, displayName, type: 'success',
        message: `Collected ${collectResult.collected} expedition(s)`,
        timestamp: Date.now(),
      });
    } else if (collectResult.collected === 0) {
      sendLog({ accountId, displayName, type: 'info', message: 'No completed expeditions to collect', timestamp: Date.now() });
    }

    // 6. Determine available slots
    const campaignRefresh = await getCampaignData({ accountId, accessToken: token, forceRefresh: true });
    const sentExps = expeditionManager.getSentExpeditions(campaignRefresh.success ? campaignRefresh.data : campaignResult.data);
    const completedExps = expeditionManager.getCompletedExpeditions(campaignRefresh.success ? campaignRefresh.data : campaignResult.data);
    const occupiedSlots = sentExps.length + completedExps.length;
    const availableSlots = Math.max(0, 6 - occupiedSlots);

    if (availableSlots > 0 && cfg.rewardTypes.length > 0) {
      sendLog({
        accountId, displayName, type: 'info',
        message: `Sending expeditions (${availableSlots} slots, types: ${cfg.rewardTypes.join(', ')})...`,
        timestamp: Date.now(),
      });

      const sendResult = await expeditionManager.sendExpeditionsByType({
        accountId,
        accessToken: token,
        expeditionTypes: cfg.rewardTypes,
        maxExpeditionsToSend: availableSlots,
      });

      if (sendResult.success && sendResult.summary) {
        result.sent = sendResult.summary.totalSent;
        if (sendResult.summary.totalSent > 0) {
          sendLog({
            accountId, displayName, type: 'success',
            message: `Sent ${sendResult.summary.totalSent} expedition(s)`,
            timestamp: Date.now(),
          });
          notificationManager.push('expeditions', 'Auto-Expeditions', `${displayName} — sent ${sendResult.summary.totalSent} expedition(s)`);
        } else {
          sendLog({
            accountId, displayName, type: 'info',
            message: 'No expeditions sent (none available or no matching types)',
            timestamp: Date.now(),
          });
        }
      }
    } else if (availableSlots === 0) {
      sendLog({ accountId, displayName, type: 'info', message: 'All 6 expedition slots are occupied', timestamp: Date.now() });
    } else {
      sendLog({ accountId, displayName, type: 'warn', message: 'No reward types configured', timestamp: Date.now() });
    }

    // 7. Update last activity
    cfg.lastActivity = new Date().toISOString();
    cfg.lastCollected = result.collected;
    cfg.lastSent = result.sent;
    await saveAutoExpData(storage, expData);
    emitDataChanged();

    result.success = true;
    sendLog({
      accountId, displayName, type: 'success',
      message: `Cycle complete — collected: ${result.collected}, sent: ${result.sent}`,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    const msg = err.message || 'Unknown error during expedition cycle';
    sendLog({ accountId, displayName, type: 'error', message: msg, timestamp: Date.now() });
    result.errors.push(msg);
  }

  return result;
}

// ── Automated interval ───────────────────────────────────────

async function runAllCycles(storage: Storage): Promise<void> {
  const expData = await getAutoExpData(storage);
  const activeAccounts = Object.entries(expData.accounts).filter(([, cfg]) => cfg.isActive && cfg.rewardTypes.length > 0);

  if (activeAccounts.length === 0) return;

  for (const [accountId] of activeAccounts) {
    try {
      await runExpeditionCycle(storage, accountId);
    } catch { /* ignore per-account errors */ }
    // Small delay between accounts to avoid hitting rate limits
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/**
 * Start the auto-expeditions interval (called once from main process init).
 */
export function startAutoExpeditionsInterval(storage: Storage): void {
  storageRef = storage;

  const scheduleNext = async (): Promise<void> => {
    const storedSettings = storageRef ? await storageRef.get<any>('settings') : null;
    const delay = storedSettings?.automationTimings?.expeditionsIntervalMs ?? CYCLE_INTERVAL;
    intervalHandle = setTimeout(() => {
      runAllCycles(storage)
        .catch(() => {})
        .finally(() => scheduleNext());
    }, delay);
  };

  // Initial run after startup delay
  setTimeout(() => {
    runAllCycles(storage)
      .catch(() => {})
      .finally(() => scheduleNext());
  }, INITIAL_DELAY);
}

/**
 * Stop the interval (for cleanup).
 */
export function stopAutoExpeditionsInterval(): void {
  if (intervalHandle) {
    clearTimeout(intervalHandle);
    intervalHandle = null;
  }
}
