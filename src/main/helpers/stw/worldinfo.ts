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

function countMissions(processed: any): number {
  if (!processed?.missions) return 0;
  return processed.missions.reduce(
    (total: number, theater: any) => total + (theater.availableMissions ? theater.availableMissions.length : 0),
    0,
  );
}

function countAlerts(processed: any): number {
  if (!processed?.missionAlerts) return 0;
  return processed.missionAlerts.reduce(
    (total: number, theater: any) => total + (theater.availableMissionAlerts ? theater.availableMissionAlerts.length : 0),
    0,
  );
}

function convertEventFlagToNotEventFlag(flag: any): any {
  if (typeof flag !== 'string') return flag;
  if (flag.startsWith('EventFlag.')) return `NotEventFlag.${flag.slice('EventFlag.'.length)}`;
  return flag;
}

function convertNestedEventFlags(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => convertNestedEventFlags(v));
  const out: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'eventFlag') {
      out[key] = convertEventFlagToNotEventFlag(value);
    } else {
      out[key] = convertNestedEventFlags(value);
    }
  }
  return out;
}

function toDevWorldInfo(processed: any): any {
  const cloned = typeof (globalThis as any).structuredClone === 'function'
    ? (globalThis as any).structuredClone(processed)
    : JSON.parse(JSON.stringify(processed));

  if (Array.isArray(cloned.theaters)) {
    cloned.theaters = cloned.theaters.map((theater: any) => {
      const t = theater;

      const sourceFlag = typeof t.requiredEventFlag === 'string'
        ? t.requiredEventFlag
        : (typeof t.requiredNotEventFlag === 'string' ? t.requiredNotEventFlag : '');

      t.requiredNotEventFlag = convertEventFlagToNotEventFlag(sourceFlag) || '';
      if ('requiredEventFlag' in t) delete t.requiredEventFlag;

      if (t.bHideLikeTestTheater === true) t.bHideLikeTestTheater = false;

      if (t.runtimeInfo && typeof t.runtimeInfo === 'object') {
        // Dev snapshots typically use Notrequirements instead of requirements.
        if (t.runtimeInfo.requirements && !t.runtimeInfo.Notrequirements) {
          t.runtimeInfo.Notrequirements = convertNestedEventFlags(t.runtimeInfo.requirements);
          delete t.runtimeInfo.requirements;
        }

        // Convert EventFlag.* strings inside runtimeInfo (eventFlag fields).
        t.runtimeInfo = convertNestedEventFlags(t.runtimeInfo);
      }

      return t;
    });
  }

  return cloned;
}

function convertEventFlagKeyToItemDefinition(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => convertEventFlagKeyToItemDefinition(v));
  const out: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'eventFlag') {
      out.itemDefinition = 'None';
    } else {
      out[key] = convertEventFlagKeyToItemDefinition(value);
    }
  }
  return out;
}

function toFunnyWorldInfo(processed: any): any {
  const cloned = typeof (globalThis as any).structuredClone === 'function'
    ? (globalThis as any).structuredClone(processed)
    : JSON.parse(JSON.stringify(processed));

  if (Array.isArray(cloned.theaters)) {
    cloned.theaters = cloned.theaters.map((theater: any) => {
      const t = theater;

      const sourceFlag = typeof t.requiredEventFlag === 'string'
        ? t.requiredEventFlag
        : (typeof t.requiredNotEventFlag === 'string' ? t.requiredNotEventFlag : '');

      t.requiredGlowpito = sourceFlag || '';
      if ('requiredEventFlag' in t) delete t.requiredEventFlag;
      if ('requiredNotEventFlag' in t) delete t.requiredNotEventFlag;

      // In funny_file.json, theaterSlot is normalized to 0 and test theaters are not hidden.
      t.theaterSlot = 0;
      if (t.bHideLikeTestTheater === true) t.bHideLikeTestTheater = false;

      if (t.runtimeInfo && typeof t.runtimeInfo === 'object') {
        const ri = t.runtimeInfo;

        if (ri.theaterVisibilityRequirements && !ri.theaterVisibilityGlowpito) {
          ri.theaterVisibilityGlowpito = ri.theaterVisibilityRequirements;
          delete ri.theaterVisibilityRequirements;
        }

        if (ri.requirements && !ri.Glowpito) {
          ri.Glowpito = ri.requirements;
          delete ri.requirements;
        }

        if (ri.missionAlertRequirements && !ri.missionAlertGlowpito) {
          ri.missionAlertGlowpito = ri.missionAlertRequirements;
          delete ri.missionAlertRequirements;
        }

        if (ri.missionAlertCategoryRequirements && !ri.missionAlertCategoryGlowpito) {
          ri.missionAlertCategoryGlowpito = ri.missionAlertCategoryRequirements;
          delete ri.missionAlertCategoryRequirements;
        }

        // Replace any nested eventFlag fields with itemDefinition: 'None'
        t.runtimeInfo = convertEventFlagKeyToItemDefinition(t.runtimeInfo);
      }

      return t;
    });
  }

  return cloned;
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
    const missions = countMissions(processed);
    const alerts = countAlerts(processed);

    const theaters = processed.theaters ? processed.theaters.length : 0;

    const jsonString = JSON.stringify(processed, null, 2);
    const sizeMB = (Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024)).toFixed(2);

    return { success: true, data: processed, missions, alerts, theaters, sizeMB };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Fetch STW world info and convert it to a dev-style snapshot:
 * - requiredEventFlag -> requiredNotEventFlag
 * - EventFlag.* -> NotEventFlag.*
 * - runtimeInfo.requirements -> runtimeInfo.Notrequirements
 * - unhide test theaters (bHideLikeTestTheater = false)
 */
export async function getDevMissionsWorldInfo(storage: Storage): Promise<WorldInfoResult> {
  const base = await getWorldInfo(storage);
  if (!base.success || !base.data) return base;

  const dev = toDevWorldInfo(base.data);
  const missions = countMissions(dev);
  const alerts = countAlerts(dev);
  const theaters = dev?.theaters ? dev.theaters.length : 0;

  const jsonString = JSON.stringify(dev, null, 2);
  const sizeMB = (Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024)).toFixed(2);

  return { success: true, data: dev, missions, alerts, theaters, sizeMB };
}

/**
 * Fetch STW world info and convert it to the Glowpito style:
 * - requiredEventFlag -> requiredGlowpito
 * - runtimeInfo.theaterVisibilityRequirements -> theaterVisibilityGlowpito
 * - runtimeInfo.requirements -> Glowpito
 * - runtimeInfo.missionAlertRequirements -> missionAlertGlowpito
 * - runtimeInfo.missionAlertCategoryRequirements -> missionAlertCategoryGlowpito
 * - any nested eventFlag fields -> itemDefinition: 'None'
 * - theaterSlot forced to 0, bHideLikeTestTheater forced false
 */
export async function getFunnyWorldInfo(storage: Storage): Promise<WorldInfoResult> {
  const base = await getWorldInfo(storage);
  if (!base.success || !base.data) return base;

  const funny = toFunnyWorldInfo(base.data);
  const missions = countMissions(funny);
  const alerts = countAlerts(funny);
  const theaters = funny?.theaters ? funny.theaters.length : 0;

  const jsonString = JSON.stringify(funny, null, 2);
  const sizeMB = (Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024)).toFixed(2);

  return { success: true, data: funny, missions, alerts, theaters, sizeMB };
}

/**
 * Convert outpost tiles from tileType "Outpost" to "Alwaysactive".
 * Without this, the game ignores them and the dupe doesn't work.
 */
function toDupeWorldInfo(processed: any): any {
  const cloned = typeof (globalThis as any).structuredClone === 'function'
    ? (globalThis as any).structuredClone(processed)
    : JSON.parse(JSON.stringify(processed));

  if (Array.isArray(cloned.theaters)) {
    for (const theater of cloned.theaters) {
      if (Array.isArray(theater.tiles)) {
        for (const tile of theater.tiles) {
          if (tile.tileType === 'Outpost') {
            tile.tileType = 'Alwaysactive';
          }
        }
      }
    }
  }

  return cloned;
}

/**
 * Fetch STW world info and transform it for Dupe File exports.
 * Outpost tiles are changed from tileType "Outpost" to "Alwaysactive"
 * so the game correctly recognises them during the dupe session.
 */
export async function getDupeFileWorldInfo(storage: Storage): Promise<WorldInfoResult> {
  const base = await getWorldInfo(storage);
  if (!base.success || !base.data) return base;

  const dupe = toDupeWorldInfo(base.data);
  const missions = countMissions(dupe);
  const alerts = countAlerts(dupe);
  const theaters = dupe?.theaters ? dupe.theaters.length : 0;

  const jsonString = JSON.stringify(dupe, null, 2);
  const sizeMB = (Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024)).toFixed(2);

  return { success: true, data: dupe, missions, alerts, theaters, sizeMB };
}
