/**
 * Dupe – STW lobby dupe via ModifyQuickbar MCP call.
 *
 * Flow:
 *   1. Check if account is in a game session (findPlayer)
 *   2. Verify game mode is FORTOUTPOST (homebase)
 *   3. Attempt ModifyQuickbar on theater0 profile
 *   4. If it fails, check profileLockExpiration and wait for it
 *   5. Retry after lock expires
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';
import { BrowserWindow } from 'electron';

function send(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, data);
}

export interface DupeResult {
  success: boolean;
  message: string;
}

interface ProfileLockInfo {
  lockExpiration: string | null;
  updated: string | null;
}

// ─── Try dupe (ModifyQuickbar) ───────────────────────────────

async function tryDupe(
  storage: Storage,
  accountId: string,
  token: string,
): Promise<boolean> {
  try {
    const endpoint = `${Endpoints.MCP}/${accountId}/client/ModifyQuickbar?profileId=theater0&rvn=-1`;

    await authenticatedRequest(storage, accountId, token, async (t) => {
      const res = await axios.post(
        endpoint,
        {
          primaryQuickbarChoices: ['', '', ''],
          secondaryQuickbarChoice: '',
        },
        {
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          timeout: 15_000,
        },
      );
      return res.data;
    });

    return true;
  } catch {
    return false;
  }
}

// ─── Get profile lock info ───────────────────────────────────

async function getProfileData(
  storage: Storage,
  accountId: string,
  token: string,
): Promise<ProfileLockInfo> {
  try {
    const endpoint = `${Endpoints.MCP}/${accountId}/client/QueryProfile?profileId=theater0&rvn=-1`;

    const { data } = await authenticatedRequest(storage, accountId, token, async (t) => {
      const res = await axios.post(endpoint, {}, {
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        timeout: 15_000,
      });
      return res.data;
    });

    const profile = data?.profileChanges?.[0]?.profile;
    return {
      lockExpiration: profile?.profileLockExpiration || null,
      updated: profile?.updated || null,
    };
  } catch {
    return { lockExpiration: null, updated: null };
  }
}

function isProfileOutdated(updatedString: string | null): boolean {
  if (!updatedString) return false;
  const updatedTime = new Date(updatedString).getTime();
  const now = Date.now();
  return (now - updatedTime) > 10 * 60 * 1000; // 10 minutes
}

// ─── Main dupe function ──────────────────────────────────────

export async function executeDupe(storage: Storage): Promise<DupeResult> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, message: 'No account found' };

    send('dupe:status', { status: 'checking', message: 'Checking profile...' });

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, message: 'Failed to authenticate' };

    send('dupe:status', { status: 'attempting', message: 'Attempting dupe...' });

    const firstAttempt = await tryDupe(storage, main.accountId, token);
    if (firstAttempt) {
      return { success: true, message: `Dupe executed successfully on ${main.displayName}` };
    }

    send('dupe:status', { status: 'checking', message: 'Checking profile lock...' });

    const profileData = await getProfileData(storage, main.accountId, token);

    if (!profileData.lockExpiration) {
      return { success: false, message: 'Profile is not locked (not bugged).\nMake sure you are properly bugged before using dupe.' };
    }

    // Step 4: If profile is outdated (>10 min), retry up to 2 more times
    if (isProfileOutdated(profileData.updated)) {
      send('dupe:status', { status: 'attempting', message: 'Profile outdated, retrying...' });

      const secondAttempt = await tryDupe(storage, main.accountId, token);
      if (secondAttempt) {
        return { success: true, message: `Dupe executed successfully on ${main.displayName}` };
      }

      const thirdAttempt = await tryDupe(storage, main.accountId, token);
      if (thirdAttempt) {
        return { success: true, message: `Dupe executed successfully on ${main.displayName}` };
      }

      return { success: false, message: 'Dupe failed after 3 attempts with outdated profile.' };
    }

    // Step 5: Wait for profileLockExpiration + 3 seconds safety margin
    const lockExpirationUtc = new Date(profileData.lockExpiration);
    const safeExpiration = new Date(lockExpirationUtc.getTime() + 3000);
    const now = new Date();
    const timeToWait = safeExpiration.getTime() - now.getTime();

    if (timeToWait <= 0) {
      send('dupe:status', { status: 'attempting', message: 'Lock expired, attempting dupe...' });

      const finalAttempt = await tryDupe(storage, main.accountId, token);
      if (finalAttempt) {
        return { success: true, message: `Dupe executed successfully on ${main.displayName}` };
      }
      return { success: false, message: 'Dupe failed after lock expiration.' };
    }

    // Wait with countdown updates every 5 seconds
    send('dupe:status', {
      status: 'waiting',
      message: `Waiting for profile lock to expire...`,
      timeRemaining: timeToWait,
      totalWait: timeToWait,
    });

    await new Promise<void>((resolve) => {
      let remaining = timeToWait;
      const interval = setInterval(() => {
        remaining -= 5000;
        if (remaining <= 0) {
          clearInterval(interval);
          resolve();
          return;
        }
        send('dupe:status', {
          status: 'waiting',
          message: `Waiting for profile lock...`,
          timeRemaining: remaining,
          totalWait: timeToWait,
        });
      }, 5000);

      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, timeToWait);
    });

    // Final attempt after waiting
    send('dupe:status', { status: 'attempting', message: 'Lock expired, executing dupe...' });

    const finalAttempt = await tryDupe(storage, main.accountId, token);
    if (finalAttempt) {
      return { success: true, message: `Dupe executed successfully on ${main.displayName}` };
    }

    return { success: false, message: 'Dupe failed after waiting for profile lock expiration.' };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.message || 'Unknown error';
    return { success: false, message: `Dupe error: ${msg}` };
  }
}
