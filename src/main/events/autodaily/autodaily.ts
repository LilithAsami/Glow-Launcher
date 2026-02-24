/**
 * AutoDaily — Automatic STW daily reward collection
 *
 * Runs once per day at 00:00:10 UTC (10s buffer after daily reset)
 * and executes ClientQuestLogin for every active account to claim
 * the daily login reward.
 *
 * Storage key: 'autodaily'
 */

import axios from 'axios';
import { BrowserWindow } from 'electron';
import { Endpoints } from '../../helpers/endpoints';
import { refreshAccountToken, authenticatedRequest } from '../../helpers/auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData, AutoDailyData, AutoDailyAccountConfig, AutoDailyLogEntry } from '../../../shared/types';

let storageRef: Storage | null = null;
let dailyTimer: ReturnType<typeof setTimeout> | null = null;

// ── Helpers ──────────────────────────────────────────────────

function send(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, data);
}

function emitLog(entry: AutoDailyLogEntry): void {
  send('autodaily:log', entry);
}

// ── Storage ──────────────────────────────────────────────────

export async function getAutoDailyData(storage: Storage): Promise<AutoDailyData> {
  return (await storage.get<AutoDailyData>('autodaily')) ?? { accounts: {} };
}

async function saveAutoDailyData(storage: Storage, data: AutoDailyData): Promise<void> {
  await storage.set('autodaily', data);
}

// ── MCP call ─────────────────────────────────────────────────

async function executeClientQuestLogin(
  storage: Storage,
  accountId: string,
  displayName: string,
): Promise<{ success: boolean; rewards?: any; error?: string }> {
  try {
    const token = await refreshAccountToken(storage, accountId);
    if (!token) return { success: false, error: 'Token refresh failed' };

    const endpoint = `${Endpoints.MCP}/${accountId}/client/ClientQuestLogin?profileId=campaign&rvn=-1`;

    const { data } = await authenticatedRequest(
      storage,
      accountId,
      token,
      async (t: string) => {
        const res = await axios.post(endpoint, {}, {
          headers: {
            Authorization: `Bearer ${t}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        });
        return res.data;
      },
    );

    // Extract notifications (daily login reward items)
    const notifications = data?.notifications ?? [];
    const loginReward = notifications.find((n: any) => n.type === 'dailyRewards');
    const items = loginReward?.items ?? loginReward?.loot?.items ?? [];

    return { success: true, rewards: { items, raw: loginReward } };
  } catch (error: any) {
    const msg = error?.response?.data?.errorMessage
      || error?.response?.data?.message
      || error?.message
      || 'Unknown error';
    return { success: false, error: msg };
  }
}

// ── Process all accounts ─────────────────────────────────────

async function processAllAutoDailies(storage: Storage): Promise<void> {
  const adData = await getAutoDailyData(storage);
  const accsData = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };

  let processed = 0;
  let success = 0;
  let errors = 0;

  emitLog({ accountId: '', displayName: 'System', type: 'info', message: 'Daily reset detected — collecting rewards...' });

  for (const acc of accsData.accounts) {
    const cfg = adData.accounts[acc.accountId];
    if (!cfg || !cfg.isActive) continue;

    processed++;

    try {
      const result = await executeClientQuestLogin(storage, acc.accountId, acc.displayName);

      if (result.success) {
        success++;
        const itemCount = result.rewards?.items?.length ?? 0;
        const msg = itemCount > 0
          ? `Collected daily reward (${itemCount} item${itemCount !== 1 ? 's' : ''})`
          : 'Daily login claimed';

        // Update last collected timestamp
        adData.accounts[acc.accountId] = {
          ...cfg,
          lastCollected: new Date().toISOString(),
        };

        emitLog({ accountId: acc.accountId, displayName: acc.displayName, type: 'success', message: msg });
      } else {
        errors++;
        emitLog({ accountId: acc.accountId, displayName: acc.displayName, type: 'error', message: result.error || 'Failed' });

        // If token failure, deactivate this account
        if (result.error?.includes('token') || result.error?.includes('401') || result.error?.includes('expired')) {
          adData.accounts[acc.accountId] = { ...cfg, isActive: false };
          emitLog({ accountId: acc.accountId, displayName: acc.displayName, type: 'warn', message: 'Account deactivated due to auth failure' });
        }
      }
    } catch (err: any) {
      errors++;
      emitLog({ accountId: acc.accountId, displayName: acc.displayName, type: 'error', message: err?.message || 'Unexpected error' });
    }

    // Small delay between accounts to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  await saveAutoDailyData(storage, adData);
  send('autodaily:data-changed', null);

  const summary = processed === 0
    ? 'No active accounts to process'
    : `Done — ${success} collected, ${errors} failed (${processed} total)`;
  emitLog({ accountId: '', displayName: 'System', type: 'info', message: summary });
}

// ── Scheduler ────────────────────────────────────────────────

function msUntilNextReset(): number {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + (now.getUTCHours() >= 0 && (now.getUTCHours() > 0 || now.getUTCMinutes() > 0 || now.getUTCSeconds() >= 10) ? 1 : 0),
    0, 0, 10, 0, // 00:00:10 UTC
  ));
  return next.getTime() - now.getTime();
}

function scheduleNextRun(storage: Storage): void {
  if (dailyTimer) clearTimeout(dailyTimer);

  const ms = msUntilNextReset();
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);

  console.log(`[AutoDaily] Next run in ${hours}h ${mins}m`);

  dailyTimer = setTimeout(async () => {
    await processAllAutoDailies(storage);
    // Schedule the next one (tomorrow)
    scheduleNextRun(storage);
  }, ms);
}

// ── Public API ───────────────────────────────────────────────

export function startAutoDailyScheduler(storage: Storage): void {
  storageRef = storage;
  scheduleNextRun(storage);
  console.log('[AutoDaily] Scheduler initialized — runs daily at 00:00:10 UTC');
}

export async function toggleAutoDaily(storage: Storage, accountId: string, active: boolean): Promise<AutoDailyData> {
  const adData = await getAutoDailyData(storage);
  if (!adData.accounts[accountId]) {
    adData.accounts[accountId] = { isActive: active };
  } else {
    adData.accounts[accountId].isActive = active;
  }
  await saveAutoDailyData(storage, adData);
  send('autodaily:data-changed', null);
  return adData;
}

export async function getAutoDailyFullStatus(storage: Storage): Promise<{
  data: AutoDailyData;
  accounts: { accountId: string; displayName: string; isActive: boolean; lastCollected?: string }[];
}> {
  const adData = await getAutoDailyData(storage);
  const accsData = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };

  const accounts = accsData.accounts.map((acc) => {
    const cfg = adData.accounts[acc.accountId];
    return {
      accountId: acc.accountId,
      displayName: acc.displayName,
      isActive: cfg?.isActive ?? false,
      lastCollected: cfg?.lastCollected,
    };
  });

  return { data: adData, accounts };
}

export async function runAutoDailyNow(storage: Storage): Promise<void> {
  await processAllAutoDailies(storage);
}
