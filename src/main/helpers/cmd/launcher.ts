/**
 * Game Launcher
 *
 * Flow:
 *   1. Try ANDROID device_auth directly
 *   2. If fails → Fortnite device_auth → exchange → ANDROID exchange_code
 *   3. Get exchange code from ANDROID token
 *   4. Exchange that code for launcherAppClient2 token (required for game launch)
 *   5. Get final exchange code from launcherAppClient2 token
 *   6. Build CMD string and execute
 *
 * CMD:
 *   start /d "{fortnitePath}\FortniteGame\Binaries\Win64"
 *     FortniteLauncher.exe
 *     -AUTH_LOGIN=unused
 *     -AUTH_PASSWORD={finalExchangeCode}     # from fortnitePCGameClient
 *     -AUTH_TYPE=exchangecode
 *     -epicapp=Fortnite
 *     -epicenv=Prod
 *     -EpicPortal
 *     -epicuserid={accountId}
 */

import axios from 'axios';
import { exec } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import { Endpoints } from '../endpoints';
import { ANDROID_CLIENT, FORTNITE_CLIENT, LAUNCHER_CLIENT } from '../auth/clients';
import type { Storage } from '../../storage';
import type { AccountsData, StoredAccount } from '../../../shared/types';

function send(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, data);
}

/**
 * Resolve the Win64 bin directory from whatever path the user selected.
 * Handles three common cases:
 *   1. User picked the root:      E:\Epic Games\Fortnite
 *   2. User picked the game dir:  E:\Epic Games\Fortnite\FortniteGame
 *   3. User picked Win64 itself:  E:\Epic Games\Fortnite\FortniteGame\Binaries\Win64
 *
 * Returns the absolute path to the folder containing FortniteLauncher.exe,
 * or null if it can't be found.
 */
function resolveBinPath(rawPath: string): string | null {
  const candidates = [
    rawPath,                                                          // user picked Win64 directly
    path.join(rawPath, 'FortniteGame', 'Binaries', 'Win64'),         // user picked root
    path.join(rawPath, 'Binaries', 'Win64'),                         // user picked FortniteGame
    path.join(rawPath, '..'),                                        // user picked a subfolder of Win64
  ];

  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'FortniteLauncher.exe'))) {
      return path.resolve(dir);
    }
  }

  return null;
}

/**
 * Get access token via device_auth grant for a given client.
 */
async function getDeviceAuthToken(
  account: StoredAccount,
  clientAuth: string,
): Promise<string | null> {
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
        Authorization: `basic ${clientAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15_000,
    });

    return res.data.access_token;
  } catch {
    return null;
  }
}

/**
 * Get exchange code from an access token.
 */
async function getExchangeCode(accessToken: string): Promise<string | null> {
  try {
    const res = await axios.get(Endpoints.OAUTH_EXCHANGE, {
      headers: { Authorization: `bearer ${accessToken}` },
      timeout: 15_000,
    });
    return res.data.code;
  } catch {
    return null;
  }
}

/**
 * Exchange an exchange code for a token with a given client.
 */
async function exchangeCodeForToken(
  exchangeCode: string,
  clientAuth: string,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      grant_type: 'exchange_code',
      exchange_code: exchangeCode,
      token_type: 'eg1',
    });

    const res = await axios.post(Endpoints.OAUTH_TOKEN, params, {
      headers: {
        Authorization: `basic ${clientAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15_000,
    });

    return res.data.access_token;
  } catch {
    return null;
  }
}

export interface LaunchResult {
  success: boolean;
  message: string;
}

/**
 * Launch Fortnite for the selected (main) account.
 * Mirrors the bot's cmd.ts flow exactly.
 */
export async function launchGame(storage: Storage): Promise<LaunchResult> {
  try {
    send('launch:status', { status: 'starting', message: 'Getting account...' });

    // Get main account
    const accsData = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const account = accsData.accounts.find((a) => a.isMain) ?? accsData.accounts[0];
    if (!account) {
      return { success: false, message: 'No accounts registered' };
    }

    // Get Fortnite path from settings
    const settings = (await storage.get<{ fortnitePath?: string }>('settings')) ?? {};
    const rawPath = settings.fortnitePath || 'C:\\Program Files\\Epic Games\\Fortnite';

    // Resolve Win64 bin directory — handle user selecting any level of the tree
    const binPath = resolveBinPath(rawPath);
    if (!binPath) {
      return {
        success: false,
        message: `FortniteLauncher.exe not found. Check your Fortnite Installation Path in Settings.\nSearched in: ${rawPath}`,
      };
    }

    send('launch:status', { status: 'auth', message: 'Authenticating...' });

    // Step 1: Try ANDROID device_auth directly
    let currentToken = await getDeviceAuthToken(account, ANDROID_CLIENT.auth);

    // Step 2: If that fails, use Fortnite client → exchange → ANDROID
    if (!currentToken) {
      const fnToken = await getDeviceAuthToken(account, FORTNITE_CLIENT.auth);
      if (!fnToken) {
        return { success: false, message: 'Failed to authenticate — no access token' };
      }

      const exchange1 = await getExchangeCode(fnToken);
      if (!exchange1) {
        return { success: false, message: 'Failed to get exchange code from FN token' };
      }

      currentToken = await exchangeCodeForToken(exchange1, ANDROID_CLIENT.auth);
      if (!currentToken) {
        return { success: false, message: 'Failed to exchange for ANDROID token' };
      }
    }

    // Step 3: Exchange from current token to launcherAppClient2 (required for game launch)
    const exchange2 = await getExchangeCode(currentToken);
    if (!exchange2) {
      return { success: false, message: 'Failed to get exchange code from current token' };
    }

    const launcherToken = await exchangeCodeForToken(exchange2, LAUNCHER_CLIENT.auth);
    if (!launcherToken) {
      return { success: false, message: 'Failed to exchange for launcher client token' };
    }

    // Step 4: Get final exchange code from launcher client token
    const finalExchange = await getExchangeCode(launcherToken);
    if (!finalExchange) {
      return { success: false, message: 'Failed to get final exchange code from launcher client' };
    }

    send('launch:status', { status: 'launching', message: 'Launching Fortnite...' });

    // Step 4: Build and execute CMD — binPath already points to the exact folder
    const cmd = `start "" /d "${binPath}" FortniteLauncher.exe` +
      ` -AUTH_LOGIN=unused` +
      ` -AUTH_PASSWORD=${finalExchange}` +
      ` -AUTH_TYPE=exchangecode` +
      ` -epicapp=Fortnite` +
      ` -epicenv=Prod` +
      ` -EpicPortal` +
      ` -epicuserid=${account.accountId}`;

    return new Promise((resolve) => {
      exec(cmd, { shell: 'cmd.exe' }, (error) => {
        if (error) {
          resolve({ success: false, message: `Launch failed: ${error.message}` });
        } else {
          resolve({ success: true, message: `Launched as ${account.displayName}` });
        }
      });
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.message || 'Unknown error';
    return { success: false, message: `Launch error: ${msg}` };
  }
}
