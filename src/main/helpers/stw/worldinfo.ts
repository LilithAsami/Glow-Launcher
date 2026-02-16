import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

/**
 * Recursively clear all missionAlertGuid fields
 */
function clearMissionAlertGuids(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => clearMissionAlertGuids(item));

  const newObj: any = {};
  for (const [key, value] of Object.entries(obj)) {
    newObj[key] = key === 'missionAlertGuid' ? '' : clearMissionAlertGuids(value);
  }
  return newObj;
}

export interface WorldInfoResult {
  success: boolean;
  data?: any;
  missions?: number;
  alerts?: number;
  theaters?: number;
  sizeMB?: string;
  error?: string;
}

/**
 * Fetch STW world info, clean GUIDs, and return processed data.
 */
export async function getWorldInfo(storage: Storage): Promise<WorldInfoResult> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a: any) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, error: 'Failed to refresh token' };

    const { data: worldInfo } = await authenticatedRequest(
      storage,
      main.accountId,
      token,
      async (t: string) => {
        const res = await axios.get(Endpoints.STW_WORLD_INFO, {
          headers: { Authorization: `Bearer ${t}` },
          timeout: 30_000,
        });
        return res.data;
      },
    );

    const processed = clearMissionAlertGuids(worldInfo);

    // Count stats
    const missions = processed.missions
      ? processed.missions.reduce(
          (total: number, theater: any) =>
            total + (theater.availableMissions ? theater.availableMissions.length : 0),
          0,
        )
      : 0;

    const alerts = processed.missionAlerts
      ? processed.missionAlerts.reduce(
          (total: number, theater: any) =>
            total + (theater.availableMissionAlerts ? theater.availableMissionAlerts.length : 0),
          0,
        )
      : 0;

    const theaters = processed.theaters ? processed.theaters.length : 0;

    const jsonString = JSON.stringify(processed, null, 2);
    const sizeMB = (Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024)).toFixed(2);

    return { success: true, data: processed, missions, alerts, theaters, sizeMB };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}
