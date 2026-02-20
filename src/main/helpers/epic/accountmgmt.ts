/**
 * Account Management — view and update Epic Games account fields.
 * Uses Android token → exchange → Launcher token for the Account API.
 * Launcher tokens are temporary and never persisted.
 */

import axios from 'axios';
import { refreshAccountToken } from '../auth/tokenRefresh';
import { LAUNCHER_CLIENT } from '../auth/clients';
import { Endpoints } from '../endpoints';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ─── Types ────────────────────────────────────────────────

export interface AccountInfo {
  displayName: string;
  email: string;
  emailVerified: boolean;
  name: string;
  lastName: string;
  preferredLanguage: string;
  phoneNumber: string;
  company: string;
  canUpdateDisplayName: boolean;
  lastDisplayNameChange: string | null;
  displayNameAvailableAt: string | null;
}

export type AccountInfoResult = { success: boolean; info?: AccountInfo; error?: string };
export type AccountUpdateResult = { success: boolean; info?: AccountInfo; error?: string };

const DISPLAY_NAME_COOLDOWN_DAYS = 14;

// ─── Helpers ──────────────────────────────────────────────

async function getMainAccount(storage: Storage) {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) throw new Error('No account found');
  return main;
}

/**
 * Exchange an Android token for a Launcher-client token.
 * The Launcher token is required for account GET/PUT endpoints.
 * This token is NEVER persisted — used temporarily and discarded.
 */
async function getLauncherToken(androidToken: string): Promise<string> {
  // Step 1: get exchange code from Android token
  const exchangeRes = await axios.get(Endpoints.OAUTH_EXCHANGE, {
    headers: { Authorization: `Bearer ${androidToken}` },
    timeout: 15_000,
  });
  const exchangeCode = exchangeRes.data?.code;
  if (!exchangeCode) throw new Error('Failed to get exchange code');

  // Step 2: use exchange code to get a Launcher-client token
  const params = new URLSearchParams({
    grant_type: 'exchange_code',
    exchange_code: exchangeCode,
    token_type: 'eg1',
  });

  const tokenRes = await axios.post(Endpoints.OAUTH_TOKEN, params.toString(), {
    headers: {
      Authorization: `basic ${LAUNCHER_CLIENT.auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15_000,
  });

  const launcherToken = tokenRes.data?.access_token;
  if (!launcherToken) throw new Error('Failed to get launcher token');
  return launcherToken;
}

function buildAccountInfo(data: any): AccountInfo {
  let canUpdate = !!data.canUpdateDisplayName;
  let displayNameAvailableAt: string | null = null;

  if (!canUpdate && data.lastDisplayNameChange) {
    const last = new Date(data.lastDisplayNameChange);
    const available = new Date(last.getTime() + DISPLAY_NAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();
    if (available > now) {
      displayNameAvailableAt = available.toISOString();
    } else {
      // Cooldown passed but API still says false — trust the date
      canUpdate = false;
      displayNameAvailableAt = available.toISOString();
    }
  }

  return {
    displayName: data.displayName || '',
    email: data.email || '',
    emailVerified: !!data.emailVerified,
    name: data.name || '',
    lastName: data.lastName || '',
    preferredLanguage: data.preferredLanguage || '',
    phoneNumber: data.phoneNumber || '',
    company: data.company || '',
    canUpdateDisplayName: canUpdate,
    lastDisplayNameChange: data.lastDisplayNameChange || null,
    displayNameAvailableAt,
  };
}

function extractError(err: any): string {
  if (!err) return 'Unknown error';
  const data = err?.response?.data;
  if (data?.errorMessage) return data.errorMessage;
  if (data?.numericErrorCode === 18206) {
    return `Corrective action required: ${data.correctiveAction || 'unknown'}. Resolve at: ${data.continuationUrl || 'N/A'}`;
  }
  if (data?.numericErrorCode === 18236 || data?.errorCode?.includes?.('display_name')) {
    return `Display name cooldown (14 days between changes): ${data.errorMessage || ''}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ─── Public API ───────────────────────────────────────────

/**
 * Get current account info using Android → Launcher token exchange.
 */
export async function getAccountInfo(
  storage: Storage,
): Promise<AccountInfoResult> {
  try {
    const main = await getMainAccount(storage);

    // Get Android token (this is what the launcher stores)
    const androidToken = await refreshAccountToken(storage, main.accountId);
    if (!androidToken) return { success: false, error: 'Failed to refresh token' };

    // Exchange for temporary Launcher token
    const launcherToken = await getLauncherToken(androidToken);

    // GET account info
    const res = await axios.get(`${Endpoints.ACCOUNT_PUBLIC}/${main.accountId}`, {
      headers: { Authorization: `Bearer ${launcherToken}` },
      timeout: 15_000,
    });

    const info = buildAccountInfo(res.data);
    console.log(`[AccountMgmt] Loaded info for ${info.displayName}`);
    return { success: true, info };
  } catch (err: any) {
    // If 401, try refreshing Android token and retry once
    if (err?.response?.status === 401) {
      try {
        const main = await getMainAccount(storage);
        const freshAndroid = await refreshAccountToken(storage, main.accountId);
        if (!freshAndroid) return { success: false, error: 'Token refresh failed after 401' };
        const freshLauncher = await getLauncherToken(freshAndroid);
        const res = await axios.get(`${Endpoints.ACCOUNT_PUBLIC}/${main.accountId}`, {
          headers: { Authorization: `Bearer ${freshLauncher}` },
          timeout: 15_000,
        });
        return { success: true, info: buildAccountInfo(res.data) };
      } catch (retryErr: any) {
        return { success: false, error: extractError(retryErr) };
      }
    }
    console.error('[AccountMgmt] getAccountInfo failed:', extractError(err));
    return { success: false, error: extractError(err) };
  }
}

/**
 * Update a single account field. Supported fields:
 *   displayName, name, lastName, preferredLanguage, phoneNumber, company
 */
export async function updateAccountField(
  storage: Storage,
  field: string,
  value: string,
): Promise<AccountUpdateResult> {
  const allowedFields = ['displayName', 'name', 'lastName', 'preferredLanguage', 'phoneNumber', 'company'];
  if (!allowedFields.includes(field)) {
    return { success: false, error: `Field "${field}" is not updatable` };
  }

  // Basic validation
  if (field === 'displayName') {
    if (value.length < 3 || value.length > 16) {
      return { success: false, error: 'Display name must be 3-16 characters' };
    }
    if (!/^[a-zA-Z0-9 ._-]+$/.test(value)) {
      return { success: false, error: 'Display name only allows: a-z A-Z 0-9 spaces . _ -' };
    }
  }
  if (field === 'preferredLanguage') {
    if (!/^[a-z]{2}(-[a-z]{2})?$/i.test(value)) {
      return { success: false, error: 'Language format invalid — use "es", "en", "de", etc.' };
    }
  }
  if (field === 'phoneNumber') {
    if (value && !/^\+?[0-9\s\-()]{7,20}$/.test(value)) {
      return { success: false, error: 'Phone number format invalid — e.g. +34612345678' };
    }
  }

  try {
    const main = await getMainAccount(storage);

    const androidToken = await refreshAccountToken(storage, main.accountId);
    if (!androidToken) return { success: false, error: 'Failed to refresh token' };

    const launcherToken = await getLauncherToken(androidToken);

    // PUT the single field
    const payload: Record<string, string> = { [field]: value };

    const res = await axios.put(
      `${Endpoints.ACCOUNT_PUBLIC}/${main.accountId}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${launcherToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
        validateStatus: () => true,
      },
    );

    if (res.status >= 200 && res.status < 300) {
      const info = buildAccountInfo(res.data?.accountInfo || res.data);
      console.log(`[AccountMgmt] Updated ${field} → "${value}" OK`);
      return { success: true, info };
    }

    const errMsg = res.data?.errorMessage || `HTTP ${res.status}`;
    console.error(`[AccountMgmt] Update ${field} failed (${res.status}):`, errMsg);
    return { success: false, error: errMsg };
  } catch (err: any) {
    // 401 retry
    if (err?.response?.status === 401) {
      try {
        const main = await getMainAccount(storage);
        const freshAndroid = await refreshAccountToken(storage, main.accountId);
        if (!freshAndroid) return { success: false, error: 'Token refresh failed after 401' };
        const freshLauncher = await getLauncherToken(freshAndroid);

        const payload: Record<string, string> = { [field]: value };
        const res = await axios.put(
          `${Endpoints.ACCOUNT_PUBLIC}/${main.accountId}`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${freshLauncher}`,
              'Content-Type': 'application/json',
            },
            timeout: 15_000,
            validateStatus: () => true,
          },
        );

        if (res.status >= 200 && res.status < 300) {
          return { success: true, info: buildAccountInfo(res.data?.accountInfo || res.data) };
        }
        return { success: false, error: res.data?.errorMessage || `HTTP ${res.status}` };
      } catch (retryErr: any) {
        return { success: false, error: extractError(retryErr) };
      }
    }
    console.error(`[AccountMgmt] updateAccountField(${field}) failed:`, extractError(err));
    return { success: false, error: extractError(err) };
  }
}
