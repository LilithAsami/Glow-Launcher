/**
 * Redeem Codes – Redeem Epic Games / Fortnite codes via the Fulfillment Service.
 * Friend Codes – Fetch STW friend codes for Epic Games and Xbox platforms.
 *
 * Endpoint (redeem): POST https://fulfillment-public-service-prod.ol.epicgames.com/fulfillment/api/public/accounts/{accountId}/codes/{code}
 * Endpoint (friend codes): GET https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/friendcodes/{accountId}/{platform}
 * Auth: Bearer token
 */

import axios from 'axios';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

export interface RedeemResult {
  success: boolean;
  code: string;
  offerId?: string;
  accountId?: string;
  details?: {
    entitlementName: string;
    itemId: string;
    namespace: string;
    country: string;
  }[];
  error?: string;
  errorCode?: string;
}

const FULFILLMENT_BASE = 'https://fulfillment-public-service-prod.ol.epicgames.com/fulfillment/api/public/accounts';

/**
 * Redeem a single code for the current main account.
 */
export async function redeemCode(storage: Storage, code: string): Promise<RedeemResult> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, code, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, code, error: 'Failed to refresh token' };

    // Remove dashes from code
    const cleanCode = code.replace(/-/g, '').trim();
    if (!cleanCode) return { success: false, code, error: 'Invalid code' };

    const url = `${FULFILLMENT_BASE}/${main.accountId}/codes/${cleanCode}`;

    const { data } = await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
      const res = await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      });
      return res.data;
    });

    return {
      success: true,
      code: cleanCode,
      offerId: data?.offerId,
      accountId: data?.accountId,
      details: (data?.details || []).map((d: any) => ({
        entitlementName: d.entitlementName || 'Unknown',
        itemId: d.itemId || '',
        namespace: d.namespace || '',
        country: d.country || '',
      })),
    };
  } catch (err: any) {
    const errData = err?.response?.data;
    return {
      success: false,
      code,
      error: errData?.errorMessage || err.message || 'Failed to redeem code',
      errorCode: errData?.errorCode || undefined,
    };
  }
}

// ── Friend Codes ──────────────────────────────────────────────

const FRIENDCODES_ENDPOINT = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/friendcodes';

export interface FriendCode {
  codeId: string;
  codeType: string;
  dateCreated: string;
}

export interface FriendCodesResult {
  success: boolean;
  epic: FriendCode[];
  xbox: FriendCode[];
  error?: string;
}

/**
 * Fetch STW friend codes for both Epic and Xbox platforms.
 */
export async function getFriendCodes(storage: Storage): Promise<FriendCodesResult> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, epic: [], xbox: [], error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, epic: [], xbox: [], error: 'Failed to refresh token' };

    const platforms = ['epic', 'xbox'] as const;
    const results: Record<string, FriendCode[]> = { epic: [], xbox: [] };

    for (const platform of platforms) {
      try {
        const url = `${FRIENDCODES_ENDPOINT}/${main.accountId}/${platform}`;

        const data = await authenticatedRequest(storage, main.accountId, token, async (t: string) => {
          const res = await axios.get<FriendCode[]>(url, {
            headers: {
              Authorization: `Bearer ${t}`,
              'Content-Type': 'application/json',
            },
            timeout: 15_000,
          });
          return res.data;
        });

        results[platform] = Array.isArray(data) ? data : [];
      } catch (err: any) {
        // Individual platform failure is non-fatal
        console.error(`[FriendCodes] Failed to fetch ${platform}:`, err?.response?.data?.errorMessage || err.message);
        results[platform] = [];
      }
    }

    return {
      success: true,
      epic: results.epic,
      xbox: results.xbox,
    };
  } catch (err: any) {
    return {
      success: false,
      epic: [],
      xbox: [],
      error: err.message || 'Failed to fetch friend codes',
    };
  }
}
