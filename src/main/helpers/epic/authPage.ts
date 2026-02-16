/**
 * Auth Page — backend helpers.
 *
 * Provides:
 *  - getDeviceAuthInfo()   → returns stored device auth for current main account
 *  - generateAccessToken() → device_auth grant → access_token (8h)
 *  - generateExchangeCode()→ access_token → exchange code (5 min)
 *  - getContinuationToken()→ trigger corrective-action error → continuation
 *  - verifyToken()         → verify an access_token and return its metadata
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { ANDROID_CLIENT } from '../auth/clients';
import { refreshAccountToken } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ─── Helpers ──────────────────────────────────────────────

async function getMainAccount(storage: Storage) {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) throw new Error('No account found');
  return main;
}

// ─── Public API ───────────────────────────────────────────

/**
 * Get the stored device auth credentials for the current main account.
 */
export async function getDeviceAuthInfo(storage: Storage) {
  const main = await getMainAccount(storage);
  return {
    success: true,
    accountId: main.accountId,
    displayName: main.displayName,
    deviceId: main.deviceId,
    secret: main.secret,
  };
}

/**
 * Generate a fresh access token (8h) via device_auth grant.
 */
export async function generateAccessToken(storage: Storage) {
  const main = await getMainAccount(storage);

  const params = new URLSearchParams({
    grant_type: 'device_auth',
    account_id: main.accountId,
    device_id: main.deviceId,
    secret: main.secret,
    token_type: 'eg1',
  });

  const res = await axios.post(Endpoints.OAUTH_TOKEN, params, {
    headers: {
      Authorization: `basic ${ANDROID_CLIENT.auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15_000,
  });

  const d = res.data;
  return {
    success: true,
    accessToken: d.access_token as string,
    accountId: d.account_id as string,
    displayName: d.displayName as string,
    expiresAt: d.expires_at as string,
    tokenType: d.token_type as string,
    clientId: d.client_id as string,
    refreshToken: (d.refresh_token as string) || null,
    refreshExpiresAt: (d.refresh_expires_at as string) || null,
  };
}

/**
 * Generate an exchange code (5 min).
 * Requires a valid access token — obtains one first via device_auth.
 */
export async function generateExchangeCode(storage: Storage) {
  const main = await getMainAccount(storage);
  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');

  const res = await axios.get(Endpoints.OAUTH_EXCHANGE, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });

  return {
    success: true,
    code: res.data.code as string,
    expiresInSeconds: (res.data.expiresInSeconds as number) || 300,
  };
}

/**
 * Get the continuation token by triggering a corrective-action error.
 * Returns null if no corrective action is pending.
 */
export async function extractContinuationToken(storage: Storage) {
  const main = await getMainAccount(storage);

  try {
    const params = new URLSearchParams({
      grant_type: 'device_auth',
      account_id: main.accountId,
      device_id: main.deviceId,
      secret: main.secret,
      token_type: 'eg1',
    });

    await axios.post(Endpoints.OAUTH_TOKEN, params, {
      headers: {
        Authorization: `basic ${ANDROID_CLIENT.auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15_000,
    });

    // Auth succeeded — no corrective action
    return {
      success: true,
      hasContinuation: false,
      continuation: null,
      correctiveAction: null,
      message: 'No corrective action pending — account is clean',
    };
  } catch (err: any) {
    const data = err?.response?.data;
    if (data?.numericErrorCode === 18206 && data?.continuation) {
      return {
        success: true,
        hasContinuation: true,
        continuation: data.continuation as string,
        correctiveAction: (data.correctiveAction as string) || null,
        message: `Corrective action: ${data.correctiveAction || 'unknown'}`,
      };
    }
    throw new Error(data?.errorMessage || err?.message || 'Auth error');
  }
}

/**
 * Verify an access token and return its metadata.
 */
export async function verifyToken(storage: Storage, token: string) {
  // If no token provided, get a fresh one for the main account
  let accessToken = token;
  if (!accessToken) {
    const main = await getMainAccount(storage);
    const t = await refreshAccountToken(storage, main.accountId);
    if (!t) throw new Error('Token refresh failed');
    accessToken = t;
  }

  const res = await axios.get(Endpoints.OAUTH_TOKEN_VERIFY, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15_000,
  });

  const d = res.data;
  return {
    success: true,
    token: accessToken,
    accountId: d.account_id as string,
    clientId: d.client_id as string,
    displayName: (d.display_name as string) || null,
    expiresAt: d.expires_at as string,
    expiresIn: d.expires_in as number,
    tokenType: d.token_type as string,
    app: (d.app as string) || null,
    inAppId: (d.in_app_id as string) || null,
  };
}
