import axios from 'axios';
import { BrowserWindow, shell } from 'electron';
import { Endpoints } from '../endpoints';
import { ANDROID_CLIENT, FORTNITE_CLIENT } from './clients';
import type { Storage } from '../../storage';
import type { AccountsData, StoredAccount } from '../../../shared/types';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollTimeout: ReturnType<typeof setTimeout> | null = null;

// ─── Helpers ─────────────────────────────────────────────────

function send(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, data);
}

function authUpdate(data: unknown): void {
  send('accounts:auth-update', data);
}

function notifyChanged(): void {
  send('accounts:data-changed', null);
}

// ─── Storage ─────────────────────────────────────────────────

export async function getAccountsData(storage: Storage): Promise<AccountsData> {
  return (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
}

async function save(storage: Storage, data: AccountsData): Promise<void> {
  await storage.set('accounts', data);
}

// ─── TOS ─────────────────────────────────────────────────────

export async function acceptTos(storage: Storage): Promise<void> {
  const data = await getAccountsData(storage);
  data.tosAccepted = true;
  await save(storage, data);
}

// ─── Cancel ──────────────────────────────────────────────────

export function cancelAuth(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (pollTimeout) { clearTimeout(pollTimeout); pollTimeout = null; }
}

// ─── Device Code Auth (Easy Login) ───────────────────────────

export async function startDeviceAuth(storage: Storage): Promise<void> {
  return _startDeviceCodeFlow(storage, true);
}

export async function startDeviceCodeDisplay(storage: Storage): Promise<void> {
  return _startDeviceCodeFlow(storage, false);
}

async function _startDeviceCodeFlow(storage: Storage, autoOpenBrowser: boolean): Promise<void> {
  try {
    cancelAuth();
    authUpdate({ status: 'starting' });

    // 1. Client credentials with FORTNITE client
    const cc = await axios.post(Endpoints.OAUTH_TOKEN, 'grant_type=client_credentials', {
      headers: {
        Authorization: `basic ${FORTNITE_CLIENT.auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // 2. Request device authorization
    const da = await axios.post(Endpoints.OAUTH_DEVICE_CODE, 'prompt=login', {
      headers: {
        Authorization: `bearer ${cc.data.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const verificationUriComplete: string = da.data.verification_uri_complete;
    const verificationUri: string = da.data.verification_uri;
    const userCode: string = da.data.user_code;
    const code: string = da.data.device_code;

    // 3. Optionally open browser
    if (autoOpenBrowser) {
      shell.openExternal(verificationUriComplete);
      authUpdate({ status: 'waiting', verificationUrl: verificationUriComplete });
    } else {
      authUpdate({ status: 'waiting', verificationUrl: verificationUri, userCode });
    }

    // 4. Start polling
    await poll(storage, code);
  } catch (err: any) {
    authUpdate({
      status: 'error',
      message: err?.response?.data?.errorMessage || err?.message || 'Failed to start authorization',
    });
  }
}

function poll(storage: Storage, deviceCode: string): Promise<void> {
  return new Promise<void>((resolve) => {
    pollTimer = setInterval(async () => {
      try {
        // Poll with FORTNITE client — only this client supports device_code
        const launcherToken = await axios.post(Endpoints.OAUTH_TOKEN,
          `grant_type=device_code&device_code=${deviceCode}`, {
          headers: {
            Authorization: `basic ${FORTNITE_CLIENT.auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        // Success — stop polling
        cancelAuth();
        authUpdate({ status: 'processing' });

        // Get exchange code from FORTNITE token
        const exchangeRes = await axios.get(Endpoints.OAUTH_EXCHANGE, {
          headers: { Authorization: `bearer ${launcherToken.data.access_token}` },
        });

        // Convert exchange code → ANDROID token
        const androidToken = await axios.post(Endpoints.OAUTH_TOKEN,
          `grant_type=exchange_code&exchange_code=${exchangeRes.data.code}&token_type=eg1`, {
          headers: {
            Authorization: `basic ${ANDROID_CLIENT.auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        // Register with ANDROID token
        await registerAccount(storage, androidToken.data);
        resolve();
      } catch (err: any) {
        const code = err?.response?.data?.errorCode;
        if (code === 'errors.com.epicgames.account.oauth.authorization_pending') return;

        cancelAuth();
        authUpdate({
          status: 'error',
          message: err?.response?.data?.errorMessage || 'Authorization failed',
        });
        resolve();
      }
    }, 10_000);

    // Timeout after 5 minutes
    pollTimeout = setTimeout(() => {
      cancelAuth();
      authUpdate({ status: 'error', message: 'Authorization timed out (5 min). Please try again.' });
      resolve();
    }, 300_000);
  });
}

// ─── Exchange Code Auth ──────────────────────────────────────

export async function submitExchangeCode(storage: Storage, exchangeCode: string): Promise<void> {
  try {
    authUpdate({ status: 'processing' });

    const params = new URLSearchParams({
      grant_type: 'exchange_code',
      exchange_code: exchangeCode,
      token_type: 'eg1',
    });

    const res = await axios.post(Endpoints.OAUTH_TOKEN, params, {
      headers: {
        Authorization: `basic ${ANDROID_CLIENT.auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    await registerAccount(storage, res.data);
  } catch (err: any) {
    authUpdate({
      status: 'error',
      message: err?.response?.data?.errorMessage || 'Invalid or expired exchange code',
    });
  }
}

// ─── Authorization Code Auth ─────────────────────────────────

export async function submitAuthorizationCode(storage: Storage, code: string): Promise<void> {
  try {
    authUpdate({ status: 'processing' });

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      token_type: 'eg1',
    });

    const res = await axios.post(Endpoints.OAUTH_TOKEN, params, {
      headers: {
        Authorization: `basic ${ANDROID_CLIENT.auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    await registerAccount(storage, res.data);
  } catch (err: any) {
    authUpdate({
      status: 'error',
      message: err?.response?.data?.errorMessage || 'Invalid or expired authorization code',
    });
  }
}

// ─── Account Registration ────────────────────────────────────

async function registerAccount(storage: Storage, token: any): Promise<void> {
  try {
    // Create device auth credentials
    const da = await axios.post(
      `${Endpoints.OAUTH_DEVICE_AUTH}/${token.account_id}/deviceAuth`,
      {},
      { headers: { Authorization: `bearer ${token.access_token}` } },
    );

    const data = await getAccountsData(storage);

    const account: StoredAccount = {
      accountId: da.data.accountId,
      displayName: token.displayName || token.account_id,
      deviceId: da.data.deviceId,
      secret: da.data.secret,
      isMain: data.accounts.length === 0,
      addedAt: Date.now(),
    };

    const idx = data.accounts.findIndex((a) => a.accountId === account.accountId);
    const isUpdate = idx !== -1;

    if (isUpdate) {
      account.isMain = data.accounts[idx].isMain;
      data.accounts[idx] = account;
    } else {
      data.accounts.push(account);
    }

    await save(storage, data);
    notifyChanged();

    authUpdate({
      status: 'success',
      account: { accountId: account.accountId, displayName: account.displayName },
      isUpdate,
    });
  } catch (err: any) {
    authUpdate({
      status: 'error',
      message: err?.response?.data?.errorMessage || 'Failed to create device credentials',
    });
  }
}

// ─── Account Management ──────────────────────────────────────

export async function removeAccount(storage: Storage, accountId: string): Promise<AccountsData> {
  const data = await getAccountsData(storage);
  const wasMain = data.accounts.find((a) => a.accountId === accountId)?.isMain;
  data.accounts = data.accounts.filter((a) => a.accountId !== accountId);
  if (wasMain && data.accounts.length > 0) data.accounts[0].isMain = true;
  await save(storage, data);
  notifyChanged();
  return data;
}

export async function setMainAccount(storage: Storage, accountId: string): Promise<AccountsData> {
  const data = await getAccountsData(storage);
  data.accounts.forEach((a) => { a.isMain = a.accountId === accountId; });
  await save(storage, data);
  notifyChanged();
  return data;
}
