import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

export interface McpResult {
  success: boolean;
  data?: any;
  operation?: string;
  profileId?: string;
  error?: string;
}

/**
 * Execute an MCP operation on the main account.
 */
export async function executeMcp(
  storage: Storage,
  operation: string,
  profileId: string,
  payload?: Record<string, unknown>,
): Promise<McpResult> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a: any) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, error: 'Failed to refresh token' };

    const endpoint = `${Endpoints.MCP}/${main.accountId}/client/${operation}?profileId=${profileId}&rvn=-1`;
    const body = payload ?? {};

    const { data } = await authenticatedRequest(
      storage,
      main.accountId,
      token,
      async (t: string) => {
        const res = await axios.post(endpoint, body, {
          headers: {
            Authorization: `Bearer ${t}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        });
        return res.data;
      },
    );

    return { success: true, data, operation, profileId };
  } catch (error: any) {
    const msg = error?.response?.data?.errorMessage
      || error?.response?.data?.message
      || error?.message
      || 'Unknown error';
    return { success: false, error: msg, operation, profileId };
  }
}
