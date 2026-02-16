/**
 * Security Helper
 * Handles account info, device auths management, ban check, and panel access.
 * Token flow: Android device_auth → exchange code → Launcher token (like auths.js from the bot).
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { ANDROID_CLIENT } from './clients';
import type { Storage } from '../../storage';
import type { AccountsData, StoredAccount } from '../../../shared/types';

// Launcher client (used for final API calls, same as auths.js in the bot)
const LAUNCHER_CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const LAUNCHER_CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const LAUNCHER_AUTH = Buffer.from(`${LAUNCHER_CLIENT_ID}:${LAUNCHER_CLIENT_SECRET}`).toString('base64');

// ─── Token Flow ───────────────────────────────────────────────

/**
 * Get a Launcher-client access token for the given account.
 * Flow: Android device_auth → exchange → Launcher token
 */
async function getLauncherToken(account: StoredAccount): Promise<string> {
  // 1. Android device_auth token
  const androidParams = new URLSearchParams({
    grant_type: 'device_auth',
    account_id: account.accountId,
    device_id: account.deviceId,
    secret: account.secret,
    token_type: 'eg1',
  });

  const androidRes = await axios.post(Endpoints.OAUTH_TOKEN, androidParams, {
    headers: {
      Authorization: `basic ${ANDROID_CLIENT.auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15_000,
  });

  // 2. Exchange code from Android token
  const exchangeRes = await axios.get(Endpoints.OAUTH_EXCHANGE, {
    headers: { Authorization: `bearer ${androidRes.data.access_token}` },
    timeout: 10_000,
  });

  // 3. Launcher token from exchange code
  const launcherParams = new URLSearchParams({
    grant_type: 'exchange_code',
    exchange_code: exchangeRes.data.code,
    token_type: 'eg1',
  });

  const launcherRes = await axios.post(Endpoints.OAUTH_TOKEN, launcherParams, {
    headers: {
      Authorization: `basic ${LAUNCHER_AUTH}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15_000,
  });

  return launcherRes.data.access_token as string;
}

/**
 * Resolve the main account from storage. Returns null if not found.
 */
async function getMainAccount(storage: Storage): Promise<StoredAccount | null> {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  return raw.accounts.find((a) => a.isMain) ?? null;
}

// ─── Account Info ─────────────────────────────────────────────

export interface AccountInfo {
  displayName: string;
  id: string;
  name: string | null;
  lastName: string | null;
  email: string | null;
  emailVerified: boolean;
  country: string | null;
  phoneNumber: string | null;
  company: string | null;
  preferredLanguage: string | null;
  lastLogin: string | null;
  lastDisplayNameChange: string | null;
  numberOfDisplayNameChanges: number;
  canUpdateDisplayName: boolean;
  tfaEnabled: boolean;
  minorVerified: boolean;
  failedLoginAttempts: number;
}

export async function getAccountInfo(storage: Storage): Promise<AccountInfo> {
  const account = await getMainAccount(storage);
  if (!account) throw new Error('No main account found');

  const token = await getLauncherToken(account);

  const res = await axios.get(`${Endpoints.ACCOUNT_PUBLIC}/${account.accountId}`, {
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 10_000,
  });

  const d = res.data;
  return {
    displayName: d.displayName ?? account.displayName,
    id: d.id ?? account.accountId,
    name: d.name ?? null,
    lastName: d.lastName ?? null,
    email: d.email ?? null,
    emailVerified: d.emailVerified ?? false,
    country: d.country ?? null,
    phoneNumber: d.phoneNumber ?? null,
    company: d.company ?? null,
    preferredLanguage: d.preferredLanguage ?? null,
    lastLogin: d.lastLogin ?? null,
    lastDisplayNameChange: d.lastDisplayNameChange ?? null,
    numberOfDisplayNameChanges: d.numberOfDisplayNameChanges ?? 0,
    canUpdateDisplayName: d.canUpdateDisplayName ?? false,
    tfaEnabled: d.tfaEnabled ?? false,
    minorVerified: d.minorVerified ?? false,
    failedLoginAttempts: d.failedLoginAttempts ?? 0,
  };
}

// ─── Device Auths ─────────────────────────────────────────────

export interface DeviceAuthEntry {
  deviceId: string;
  location: string;
  ipAddress: string;
  dateTime: string;
  userAgent: string;
}

export async function getDeviceAuths(storage: Storage): Promise<DeviceAuthEntry[]> {
  const account = await getMainAccount(storage);
  if (!account) throw new Error('No main account found');

  const token = await getLauncherToken(account);

  const res = await axios.get(
    `${Endpoints.ACCOUNT_DEVICEAUTH_LIST}/${account.accountId}/deviceAuth`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    },
  );

  const list: any[] = res.data || [];
  return list.map((auth: any) => ({
    deviceId: auth.deviceId,
    location: auth.created?.location || auth.lastAccess?.location || 'Unknown',
    ipAddress: auth.created?.ipAddress || auth.lastAccess?.ipAddress || 'Unknown',
    dateTime: auth.created?.dateTime || auth.lastAccess?.dateTime || '',
    userAgent: auth.userAgent || 'Unknown device',
  }));
}

export async function deleteDeviceAuth(storage: Storage, deviceId: string): Promise<{ success: boolean }> {
  const account = await getMainAccount(storage);
  if (!account) throw new Error('No main account found');

  const token = await getLauncherToken(account);

  await axios.delete(
    `${Endpoints.ACCOUNT_DEVICEAUTH_DELETE}/${account.accountId}/deviceAuth/${deviceId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    },
  );

  return { success: true };
}

export async function deleteAllDeviceAuths(storage: Storage): Promise<{ deleted: number; skipped: number }> {
  const account = await getMainAccount(storage);
  if (!account) throw new Error('No main account found');

  const token = await getLauncherToken(account);
  const auths = await getDeviceAuths(storage);

  // Protect the current device auth (match by deviceId stored locally)
  const localDeviceId = account.deviceId;

  let deleted = 0;
  let skipped = 0;

  for (const auth of auths) {
    if (auth.deviceId === localDeviceId) {
      skipped++;
      continue;
    }
    try {
      await axios.delete(
        `${Endpoints.ACCOUNT_DEVICEAUTH_DELETE}/${account.accountId}/deviceAuth/${auth.deviceId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );
      deleted++;
    } catch {
      // Skip failed deletes
    }
  }

  return { deleted, skipped };
}

// ─── Ban Check ────────────────────────────────────────────────

export interface BanStatus {
  banned: boolean;
  allowedActions: string[];
}

export async function checkBanStatus(storage: Storage): Promise<BanStatus> {
  const account = await getMainAccount(storage);
  if (!account) throw new Error('No main account found');

  const token = await getLauncherToken(account);

  const res = await axios.get(Endpoints.LIGHTSWITCH_STATUS, {
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 5_000,
  });

  return {
    banned: res.data.banned === true,
    allowedActions: res.data.allowedActions || [],
  };
}

// ─── Panel (Exchange Code) ────────────────────────────────────

export async function getExchangeCodeUrl(storage: Storage): Promise<string> {
  const account = await getMainAccount(storage);
  if (!account) throw new Error('No main account found');

  const token = await getLauncherToken(account);

  const res = await axios.get(Endpoints.OAUTH_EXCHANGE, {
    headers: { Authorization: `bearer ${token}` },
    timeout: 10_000,
  });

  return `https://epicgames.com/id/exchange?exchangeCode=${res.data.code}`;
}
