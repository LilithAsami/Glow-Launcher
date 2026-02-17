/**
 * XP Boosts – Query and consume STW XP Boosts.
 *
 * Uses MCP QueryProfile on "campaign" to find boost items:
 *   - ConsumableAccountItem:smallxpboost       (Personal)
 *   - ConsumableAccountItem:smallxpboost_gift   (Teammate)
 *
 * Uses ActivateConsumable on "campaign" to consume boosts one at a time.
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

export interface XPBoostInfo {
  success: boolean;
  personal: { itemId: string | null; quantity: number };
  teammate: { itemId: string | null; quantity: number };
  displayName: string;
  error?: string;
}

export interface XPBoostConsumeResult {
  success: boolean;
  consumed: number;
  failed: number;
  type: 'personal' | 'teammate';
  error?: string;
}

/**
 * Query the campaign profile to find XP boost items.
 */
export async function getXPBoosts(storage: Storage): Promise<XPBoostInfo> {
  const empty: XPBoostInfo = {
    success: false,
    personal: { itemId: null, quantity: 0 },
    teammate: { itemId: null, quantity: 0 },
    displayName: '',
  };

  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { ...empty, error: 'No account found' };

    empty.displayName = main.displayName;

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { ...empty, error: 'Failed to refresh token' };

    const url = `${Endpoints.MCP}/${main.accountId}/client/QueryProfile?profileId=campaign&rvn=-1`;

    const { data } = await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
      const res = await axios.post(url, {}, {
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        timeout: 15_000,
      });
      return res.data;
    });

    const items = data?.profileChanges?.[0]?.profile?.items || {};

    let personal = { itemId: null as string | null, quantity: 0 };
    let teammate = { itemId: null as string | null, quantity: 0 };

    for (const [itemId, item] of Object.entries(items) as [string, any][]) {
      if (item.templateId === 'ConsumableAccountItem:smallxpboost') {
        personal = { itemId, quantity: item.quantity || 0 };
      } else if (item.templateId === 'ConsumableAccountItem:smallxpboost_gift') {
        teammate = { itemId, quantity: item.quantity || 0 };
      }
    }

    return {
      success: true,
      personal,
      teammate,
      displayName: main.displayName,
    };
  } catch (err: any) {
    return { ...empty, error: err.message || 'Failed to query XP boosts' };
  }
}

/**
 * Consume XP boosts one at a time.
 * @param type 'personal' or 'teammate'
 * @param amount Number of boosts to consume
 * @param targetAccountId For teammate boosts, the account to apply to
 */
export async function consumeXPBoosts(
  storage: Storage,
  type: 'personal' | 'teammate',
  amount: number,
  targetAccountId?: string,
): Promise<XPBoostConsumeResult> {
  const result: XPBoostConsumeResult = {
    success: false,
    consumed: 0,
    failed: 0,
    type,
  };

  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { ...result, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { ...result, error: 'Failed to refresh token' };

    // First get the item ID
    const info = await getXPBoosts(storage);
    if (!info.success) return { ...result, error: info.error || 'Failed to get boost info' };

    const boostData = type === 'personal' ? info.personal : info.teammate;
    if (!boostData.itemId) return { ...result, error: `No ${type} XP boosts available` };

    const maxConsume = Math.min(amount, boostData.quantity);
    if (maxConsume <= 0) return { ...result, error: `No ${type} XP boosts to consume (have ${boostData.quantity})` };

    const profileId = 'campaign';

    // Consume boosts one at a time
    for (let i = 0; i < maxConsume; i++) {
      try {
        const url = `${Endpoints.MCP}/${main.accountId}/client/ActivateConsumable?profileId=${profileId}&rvn=-1`;

        const body: any = {
          targetItemId: boostData.itemId,
          targetAccountId: type === 'teammate' && targetAccountId ? targetAccountId : main.accountId,
        };

        await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
          const res = await axios.post(url, body, {
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            timeout: 15_000,
          });
          return res.data;
        });

        result.consumed++;
      } catch (err: any) {
        result.failed++;
        // If we get a critical error, stop trying
        const errCode = err?.response?.data?.errorCode;
        if (errCode && errCode.includes('not_enough') || errCode?.includes('invalid') || errCode?.includes('forbidden')) {
          break;
        }
      }
    }

    result.success = result.consumed > 0;
    if (result.failed > 0 && result.consumed === 0) {
      result.error = 'All boost consumptions failed';
    }

    return result;
  } catch (err: any) {
    return { ...result, error: err.message || 'Failed to consume XP boosts' };
  }
}
