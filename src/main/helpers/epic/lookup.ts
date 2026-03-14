/**
 * Lookup — batch account lookup by account IDs.
 * Uses Account Service "Lookup by Account Ids" endpoint.
 * Max 100 IDs per request.
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

export interface LookupAccount {
  id: string;
  displayName: string;
  externalAuths: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface LookupResult {
  success: boolean;
  accounts?: LookupAccount[];
  error?: string;
}

export async function lookupAccountIds(
  storage: Storage,
  accountIds: string[],
): Promise<LookupResult> {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain);
  if (!main) return { success: false, error: 'No main account' };

  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) return { success: false, error: 'Token refresh failed' };

  // Deduplicate and validate (32-hex chars)
  const ids = [...new Set(accountIds)].filter((id) => /^[a-f0-9]{32}$/i.test(id));

  if (ids.length === 0) return { success: false, error: 'No valid account IDs provided' };

  // Chunk into batches of 100 (API limit)
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));

  try {
    const allAccounts: LookupAccount[] = [];

    for (const chunk of chunks) {
      const { data } = await authenticatedRequest(storage, main.accountId, token, async (t) => {
        const params = new URLSearchParams();
        for (const id of chunk) params.append('accountId', id);
        const res = await axios.get(
          `${Endpoints.ACCOUNT_PUBLIC}?${params.toString()}`,
          {
            headers: { Authorization: `bearer ${t}`, 'Content-Type': 'application/json' },
            timeout: 15_000,
          },
        );
        return res.data;
      });

      const arr: unknown[] = Array.isArray(data) ? data : [data];
      for (const a of arr as any[]) {
        allAccounts.push({
          id: a.id || '',
          displayName: a.displayName || '(no display name)',
          externalAuths: a.externalAuths || {},
          raw: a,
        });
      }
    }

    return { success: true, accounts: allAccounts };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.message || 'Lookup failed';
    return { success: false, error: msg };
  }
}
