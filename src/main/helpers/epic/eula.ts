/**
 * EULA & Privacy Policy — corrections endpoints.
 *
 * Correct flow (from Epic docs):
 *  1. Attempt device_auth login → if the account needs a corrective action
 *     (EULA_ACCEPTANCE / PRIVACY_POLICY_ACCEPTANCE), the auth endpoint returns
 *     error 18206 with a `continuation` token.
 *  2. Obtain a **client_credentials** token (just the client, no user).
 *  3. PUT /corrections/acceptEula (or acceptPrivacyPolicy) with:
 *       - Authorization: Bearer <client_credentials token>
 *       - Body: { "continuation": "<token from step 1>" }
 *  4. Returns 204 No Content on success.
 *
 * Endpoints:
 *   acceptEula:          PUT /account/api/public/corrections/acceptEula
 *   acceptPrivacyPolicy: PUT /account/api/public/corrections/acceptPrivacyPolicy
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { ANDROID_CLIENT } from '../auth/clients';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

const CORRECTIONS_BASE = 'https://account-public-service-prod.ol.epicgames.com/account/api/public/corrections';

// ─── Helpers ──────────────────────────────────────────────

async function getMainAccount(storage: Storage) {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) throw new Error('No account found');
  return main;
}

/**
 * Try device_auth for the account.
 * If it succeeds, the account has no corrective action pending → return null.
 * If it fails with 18206 (corrective_action_required), return the continuation token.
 * Otherwise throw.
 */
async function getContinuationToken(
  account: { accountId: string; deviceId: string; secret: string },
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      grant_type: 'device_auth',
      account_id: account.accountId,
      device_id: account.deviceId,
      secret: account.secret,
      token_type: 'eg1',
    });

    await axios.post(Endpoints.OAUTH_TOKEN, params, {
      headers: {
        Authorization: `basic ${ANDROID_CLIENT.auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15_000,
    });

    // Auth succeeded — no corrective action needed
    return null;
  } catch (err: any) {
    const data = err?.response?.data;
    if (data?.numericErrorCode === 18206 && data?.continuation) {
      return data.continuation as string;
    }
    // Some other error
    const msg = data?.errorMessage || err?.message || 'Unknown error during auth';
    throw new Error(msg);
  }
}

/**
 * Get a client_credentials token (no user — just the client app itself).
 */
async function getClientCredentialsToken(): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    token_type: 'eg1',
  });

  const res = await axios.post(Endpoints.OAUTH_TOKEN, params, {
    headers: {
      Authorization: `basic ${ANDROID_CLIENT.auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15_000,
  });

  return res.data.access_token as string;
}

/**
 * Core correction flow:
 *  1. device_auth → extract continuation (or discover it's not needed)
 *  2. client_credentials token
 *  3. PUT corrections endpoint
 */
async function performCorrection(
  storage: Storage,
  endpoint: 'acceptEula' | 'acceptPrivacyPolicy',
  label: string,
): Promise<{ success: boolean; message: string }> {
  const main = await getMainAccount(storage);

  // Step 1 — trigger corrective-action error to get the continuation token
  const continuation = await getContinuationToken(main);

  if (continuation === null) {
    return { success: true, message: `${label} is already accepted (no corrective action pending)` };
  }

  // Step 2 — get a client_credentials token
  const ccToken = await getClientCredentialsToken();

  // Step 3 — PUT the correction
  await axios.put(
    `${CORRECTIONS_BASE}/${endpoint}`,
    { continuation },
    {
      headers: {
        Authorization: `Bearer ${ccToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
      validateStatus: (status) => status >= 200 && status < 300,
    },
  );

  return { success: true, message: `${label} accepted successfully` };
}

// ─── Public API ───────────────────────────────────────────

/**
 * Accept the EULA (End User License Agreement) for the current main account.
 */
export async function acceptEula(storage: Storage): Promise<{ success: boolean; message: string }> {
  return performCorrection(storage, 'acceptEula', 'EULA');
}

/**
 * Accept the Privacy Policy for the current main account.
 */
export async function acceptPrivacyPolicy(storage: Storage): Promise<{ success: boolean; message: string }> {
  return performCorrection(storage, 'acceptPrivacyPolicy', 'Privacy Policy');
}
