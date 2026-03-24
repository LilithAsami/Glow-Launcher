/**
 * Import accounts from other Fortnite STW launchers (Aerial, Spitfire).
 *
 * Reads their stored deviceAuth files from %APPDATA%, authenticates with the
 * original credentials, generates an exchange code, then creates a fresh
 * Android-client deviceAuth for GLOW.
 */

import { app } from 'electron';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Endpoints } from '../endpoints';
import { ANDROID_CLIENT } from './clients';
import { getAccountsData } from './auth';
import type { Storage } from '../../storage';
import type { StoredAccount, AccountsData } from '../../../shared/types';

// ── Launcher definitions ────────────────────────────────────────────────────

interface LauncherDef {
  name: string;
  /** Path to accounts file relative to %APPDATA% */
  accountsPath: string;
  /** Client credentials (base64 of id:secret) */
  clientAuth: string;
  /** Parse the raw JSON into a flat array of device-auth entries */
  parse: (raw: unknown) => ExternalAccount[];
}

interface ExternalAccount {
  accountId: string;
  deviceId: string;
  secret: string;
  displayName: string;
}

export interface ImportAccountResult {
  accountId: string;
  displayName: string;
  source: string;
  status: 'added' | 'existing' | 'error';
  message?: string;
}

export interface ImportResult {
  results: ImportAccountResult[];
}

// Helper: base64-encode client credentials
function encodeClient(id: string, secret: string): string {
  return Buffer.from(`${id}:${secret}`).toString('base64');
}

// ── Aerial Launcher ─────────────────────────────────────────────────────

const AERIAL: LauncherDef = {
  name: 'Aerial Launcher',
  accountsPath: path.join('aerial-launcher-data', 'accounts.json'),
  // Aerial defaults to Android client
  clientAuth: encodeClient('3f69e56c7649492c8cc29f1af08a8a12', 'b51ee9cb12234f50a69efa67ef53812e'),
  parse(raw: unknown): ExternalAccount[] {
    // Aerial stores a flat array: [{ accountId, deviceId, secret, displayName, ... }]
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((a: any) => a.accountId && a.deviceId && a.secret)
      .map((a: any) => ({
        accountId: a.accountId,
        deviceId: a.deviceId,
        secret: a.secret,
        displayName: a.displayName || a.accountId,
      }));
  },
};

// ── Spitfire Launcher ───────────────────────────────────────────────────

const SPITFIRE: LauncherDef = {
  name: 'Spitfire Launcher',
  accountsPath: path.join('spitfire-launcher', 'accounts.json'),
  // Spitfire defaults to Android client
  clientAuth: encodeClient('3f69e56c7649492c8cc29f1af08a8a12', 'b51ee9cb12234f50a69efa67ef53812e'),
  parse(raw: unknown): ExternalAccount[] {
    // Spitfire stores { activeAccountId, accounts: [{ displayName, accountId, deviceId, secret }] }
    const obj = raw as any;
    const list = Array.isArray(obj?.accounts) ? obj.accounts : [];
    return list
      .filter((a: any) => a.accountId && a.deviceId && a.secret)
      .map((a: any) => ({
        accountId: a.accountId,
        deviceId: a.deviceId,
        secret: a.secret,
        displayName: a.displayName || a.accountId,
      }));
  },
};

const LAUNCHERS: LauncherDef[] = [AERIAL, SPITFIRE];

// ── Scan for accounts from all launchers ────────────────────────────────

function scanLauncher(launcher: LauncherDef): { source: string; accounts: ExternalAccount[] } {
  const appData = app.getPath('appData');
  const filePath = path.join(appData, launcher.accountsPath);

  if (!fs.existsSync(filePath)) {
    return { source: launcher.name, accounts: [] };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { source: launcher.name, accounts: launcher.parse(raw) };
  } catch {
    return { source: launcher.name, accounts: [] };
  }
}

// ── Import all found accounts ───────────────────────────────────────────

export async function importFromOtherLaunchers(storage: Storage): Promise<ImportResult> {
  const results: ImportAccountResult[] = [];
  const data = await getAccountsData(storage);
  const existingIds = new Set(data.accounts.map((a) => a.accountId));

  // Collect all unique external accounts (deduplicate by accountId)
  const seen = new Set<string>();
  const toImport: { account: ExternalAccount; source: string; clientAuth: string }[] = [];

  for (const launcher of LAUNCHERS) {
    const { source, accounts } = scanLauncher(launcher);
    for (const acc of accounts) {
      if (seen.has(acc.accountId)) continue;
      seen.add(acc.accountId);
      toImport.push({ account: acc, source, clientAuth: launcher.clientAuth });
    }
  }

  if (toImport.length === 0) {
    return { results: [] };
  }

  // Process each account sequentially
  for (const { account, source, clientAuth } of toImport) {
    // Already in GLOW?
    if (existingIds.has(account.accountId)) {
      results.push({
        accountId: account.accountId,
        displayName: account.displayName,
        source,
        status: 'existing',
      });
      continue;
    }

    try {
      // 1. Authenticate with the external launcher's deviceAuth & client
      const tokenRes = await axios.post(Endpoints.OAUTH_TOKEN,
        new URLSearchParams({
          grant_type: 'device_auth',
          account_id: account.accountId,
          device_id: account.deviceId,
          secret: account.secret,
          token_type: 'eg1',
        }),
        {
          headers: {
            Authorization: `basic ${clientAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15_000,
        },
      );

      let androidToken = tokenRes.data;

      // 2. If the source client is NOT Android, exchange to Android
      if (clientAuth !== ANDROID_CLIENT.auth) {
        const exchangeRes = await axios.get(Endpoints.OAUTH_EXCHANGE, {
          headers: { Authorization: `bearer ${androidToken.access_token}` },
          timeout: 10_000,
        });

        const androidRes = await axios.post(Endpoints.OAUTH_TOKEN,
          new URLSearchParams({
            grant_type: 'exchange_code',
            exchange_code: exchangeRes.data.code,
            token_type: 'eg1',
          }),
          {
            headers: {
              Authorization: `basic ${ANDROID_CLIENT.auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 15_000,
          },
        );
        androidToken = androidRes.data;
      }

      // 3. Create a new deviceAuth for GLOW
      const daRes = await axios.post(
        `${Endpoints.OAUTH_DEVICE_AUTH}/${androidToken.account_id}/deviceAuth`,
        {},
        {
          headers: { Authorization: `bearer ${androidToken.access_token}` },
          timeout: 15_000,
        },
      );

      const displayName = androidToken.displayName || account.displayName || account.accountId;

      // 4. Store in GLOW
      const freshData = await getAccountsData(storage);
      const newAccount: StoredAccount = {
        accountId: daRes.data.accountId,
        displayName,
        deviceId: daRes.data.deviceId,
        secret: daRes.data.secret,
        isMain: freshData.accounts.length === 0,
        addedAt: Date.now(),
      };

      // Check again in case concurrent import
      const dupIdx = freshData.accounts.findIndex((a) => a.accountId === newAccount.accountId);
      if (dupIdx !== -1) {
        results.push({ accountId: account.accountId, displayName, source, status: 'existing' });
      } else {
        freshData.accounts.push(newAccount);
        await storage.set('accounts', freshData);
        existingIds.add(newAccount.accountId);
        results.push({ accountId: account.accountId, displayName, source, status: 'added' });
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.errorMessage ||
        err?.response?.data?.message ||
        err?.message ||
        'Unknown error';
      results.push({
        accountId: account.accountId,
        displayName: account.displayName,
        source,
        status: 'error',
        message: msg,
      });
    }
  }

  return { results };
}

// ── Import from GLOW JSON ───────────────────────────────────────────────────

export async function importFromGlowJson(
  storage: Storage,
  jsonPath: string,
): Promise<ImportResult> {
  const results: ImportAccountResult[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch {
    return { results: [{ accountId: '', displayName: '', source: 'GLOW JSON', status: 'error', message: 'Could not read or parse the file' }] };
  }

  const rawAccounts: any[] = Array.isArray(parsed?.accounts) ? parsed.accounts : [];
  if (rawAccounts.length === 0) {
    return { results: [{ accountId: '', displayName: '', source: 'GLOW JSON', status: 'error', message: 'No accounts found in the file' }] };
  }

  const data = await getAccountsData(storage);
  const existingIds = new Set(data.accounts.map((a) => a.accountId));

  for (const raw of rawAccounts) {
    const { accountId, displayName, deviceId, secret } = raw;
    if (!accountId || !deviceId || !secret) {
      results.push({ accountId: accountId || '', displayName: displayName || '', source: 'GLOW JSON', status: 'error', message: 'Missing required fields (accountId, deviceId, secret)' });
      continue;
    }

    if (existingIds.has(accountId)) {
      results.push({ accountId, displayName: displayName || accountId, source: 'GLOW JSON', status: 'existing' });
      continue;
    }

    const freshData = await getAccountsData(storage);
    const newAccount: StoredAccount = {
      accountId,
      displayName: displayName || accountId,
      deviceId,
      secret,
      isMain: freshData.accounts.length === 0,
      addedAt: raw.addedAt ?? Date.now(),
    };

    // Check again for race conditions
    if (freshData.accounts.find((a) => a.accountId === accountId)) {
      results.push({ accountId, displayName: newAccount.displayName, source: 'GLOW JSON', status: 'existing' });
    } else {
      freshData.accounts.push(newAccount);
      await storage.set('accounts', freshData);
      existingIds.add(accountId);
      results.push({ accountId, displayName: newAccount.displayName, source: 'GLOW JSON', status: 'added' });
    }
  }

  return { results };
}
