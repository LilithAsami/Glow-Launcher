/**
 * Token Refresh System
 * Handles automatic token refresh for Epic Games accounts.
 * Attempts ANDROID client first, falls back to LAUNCHER (Fortnite).
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { ANDROID_CLIENT, FORTNITE_CLIENT } from './clients';
import type { Storage } from '../../storage';
import type { AccountsData, StoredAccount } from '../../../shared/types';

/**
 * Refresh an account's token using device_auth grant.
 * Tries ANDROID first, then FORTNITE (launcher) as fallback.
 * Returns the fresh access_token or null on failure.
 */
export async function refreshAccountToken(
  storage: Storage,
  accountId: string,
): Promise<string | null> {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const account = raw.accounts.find((a) => a.accountId === accountId);
  if (!account) return null;

  // Try ANDROID client first
  const token = await tryDeviceAuth(account, ANDROID_CLIENT.auth);
  if (token) return token;

  // Fallback: FORTNITE (launcher) client
  const fallback = await tryDeviceAuth(account, FORTNITE_CLIENT.auth);
  return fallback;
}

async function tryDeviceAuth(account: StoredAccount, authHeader: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      grant_type: 'device_auth',
      account_id: account.accountId,
      device_id: account.deviceId,
      secret: account.secret,
      token_type: 'eg1',
    });

    const res = await axios.post(Endpoints.OAUTH_TOKEN, params, {
      headers: {
        Authorization: `basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15_000,
    });

    return res.data.access_token as string;
  } catch {
    return null;
  }
}

/**
 * Make an authenticated request, auto-refreshing token on 401.
 * Returns the axios response data or throws on unrecoverable error.
 */
export async function authenticatedRequest(
  storage: Storage,
  accountId: string,
  accessToken: string,
  requestFn: (token: string) => Promise<any>,
): Promise<{ data: any; token: string }> {
  try {
    const data = await requestFn(accessToken);
    return { data, token: accessToken };
  } catch (err: any) {
    if (err?.response?.status === 401) {
      const newToken = await refreshAccountToken(storage, accountId);
      if (!newToken) throw new Error('Token refresh failed');
      const data = await requestFn(newToken);
      return { data, token: newToken };
    }
    throw err;
  }
}
