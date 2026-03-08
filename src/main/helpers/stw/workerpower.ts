/**
 * Worker Power — Query campaign profile and modify all Worker + Hero levels
 * to produce a high-power (level 50) or low-power (level 1) JSON file.
 */

import { executeMcp } from '../epic/mcp';
import type { Storage } from '../../storage';

export interface WorkerPowerResult {
  success: boolean;
  data?: any;
  workerCount?: number;
  heroCount?: number;
  modified?: number;
  sizeMB?: string;
  error?: string;
}

/**
 * Fetch campaign profile via QueryProfile MCP, clone it,
 * and set every Worker + Hero item's level to `targetLevel`.
 */
export async function generateWorkerPower(
  storage: Storage,
  targetLevel: number,
): Promise<WorkerPowerResult> {
  try {
    const result = await executeMcp(storage, 'QueryProfile', 'campaign');
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to query campaign profile' };
    }

    // Deep-clone so we don't mutate the original
    const profile = JSON.parse(JSON.stringify(result.data));

    const changes = profile.profileChanges;
    if (!Array.isArray(changes) || changes.length === 0) {
      return { success: false, error: 'No profileChanges found in response' };
    }

    let workerCount = 0;
    let heroCount = 0;
    let modified = 0;

    for (const change of changes) {
      const items = change?.profile?.items;
      if (!items || typeof items !== 'object') continue;

      for (const [_id, item] of Object.entries(items) as [string, any][]) {
        const tid: string = item?.templateId ?? '';
        const isWorker = tid.startsWith('Worker:');
        const isHero = tid.startsWith('Hero:');
        if (!isWorker && !isHero) continue;

        if (isWorker) workerCount++;
        if (isHero) heroCount++;

        if (item.attributes && item.attributes.level !== targetLevel) {
          item.attributes.level = targetLevel;
          modified++;
        }
      }
    }

    const jsonString = JSON.stringify(profile, null, 2);
    const sizeMB = (Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024)).toFixed(2);

    return { success: true, data: profile, workerCount, heroCount, modified, sizeMB };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}
