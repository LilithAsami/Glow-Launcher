/**
 * Library — Epic Games library: owned games, installed status, launch.
 *
 * Fetches the user's owned assets from the Epic launcher API,
 * retrieves catalog metadata (title + images) for each,
 * cross-references with local EGL manifest files to determine install state,
 * and can launch games via the EGL URI protocol.
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { shell } from 'electron';
import { Endpoints } from '../endpoints';
import { ANDROID_CLIENT } from '../auth/clients';
import type { Storage } from '../../storage';
import type { AccountsData, StoredAccount } from '../../../shared/types';

// Launcher client credentials (same as security.ts)
const LAUNCHER_CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const LAUNCHER_CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const LAUNCHER_AUTH = Buffer.from(`${LAUNCHER_CLIENT_ID}:${LAUNCHER_CLIENT_SECRET}`).toString('base64');

// Cache the launcher token to avoid re-exchanging for each batch
let cachedToken: { token: string; accountId: string; expiresAt: number } | null = null;

// ── Types ────────────────────────────────────────────────

export interface LibraryGame {
  id: string;            // app_name (e.g. "Fortnite")
  namespace: string;     // catalog namespace
  catalogItemId: string;
  title: string;
  images: {
    tall: string;        // DieselGameBoxTall
    wide: string;        // DieselGameBox / Featured
  };
  installed: boolean;
  installSize: number;   // bytes
  installPath: string;
  favorite: boolean;
}

interface EGLManifest {
  AppName: string;
  DisplayName: string;
  InstallSize: number;
  InstallLocation: string;
  CatalogNamespace: string;
  CatalogItemId: string;
}

// ── Helpers ──────────────────────────────────────────────

const EGL_MANIFESTS_DIR = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';

/**
 * Get a Launcher-client access token.
 * Flow: Android device_auth → exchange code → Launcher client token.
 * The Launcher Assets API requires a token from this specific client.
 */
async function getLauncherToken(account: StoredAccount): Promise<string> {
  // 1. Android device_auth token
  const androidRes = await axios.post(Endpoints.OAUTH_TOKEN, new URLSearchParams({
    grant_type: 'device_auth',
    account_id: account.accountId,
    device_id: account.deviceId,
    secret: account.secret,
    token_type: 'eg1',
  }), {
    headers: {
      Authorization: `basic ${ANDROID_CLIENT.auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15_000,
  });

  // 2. Exchange code from Android token
  const exchangeRes = await axios.get(Endpoints.OAUTH_EXCHANGE, {
    headers: { Authorization: `bearer ${androidRes.data.access_token}` },
    timeout: 10_000,
  });

  // 3. Launcher token from exchange code
  const launcherRes = await axios.post(Endpoints.OAUTH_TOKEN, new URLSearchParams({
    grant_type: 'exchange_code',
    exchange_code: exchangeRes.data.code,
    token_type: 'eg1',
  }), {
    headers: {
      Authorization: `basic ${LAUNCHER_AUTH}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15_000,
  });

  return launcherRes.data.access_token as string;
}

function readInstalledManifests(): Map<string, EGLManifest> {
  const map = new Map<string, EGLManifest>();
  try {
    if (!fs.existsSync(EGL_MANIFESTS_DIR)) return map;
    const files = fs.readdirSync(EGL_MANIFESTS_DIR).filter((f) => f.endsWith('.item'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(EGL_MANIFESTS_DIR, file), 'utf-8');
        const manifest: EGLManifest = JSON.parse(raw);
        if (manifest.AppName) {
          map.set(manifest.AppName, manifest);
        }
      } catch { /* skip malformed manifests */ }
    }
  } catch { /* manifests dir not accessible */ }
  return map;
}

// ── Public API ───────────────────────────────────────────

async function getCachedLauncherToken(account: StoredAccount): Promise<string> {
  if (cachedToken && cachedToken.accountId === account.accountId && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const token = await getLauncherToken(account);
  cachedToken = { token, accountId: account.accountId, expiresAt: Date.now() + 20 * 60_000 };
  return token;
}

/**
 * Phase 1: Fetch the user's asset list + install status. Returns quickly.
 * Games have appName as title, no images yet.
 */
export async function getLibrary(storage: Storage): Promise<{ success: boolean; games: LibraryGame[]; error?: string }> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, games: [], error: 'No account found' };

    let token: string;
    try {
      token = await getCachedLauncherToken(main);
    } catch {
      return { success: false, games: [], error: 'Failed to get launcher token' };
    }

    // Fetch launcher assets list
    const assetsUrl = `${Endpoints.LAUNCHER}public/assets/Windows?label=Live`;
    let assets: any[];
    try {
      const res = await axios.get(assetsUrl, {
        headers: { Authorization: `bearer ${token}` },
        timeout: 30_000,
      });
      assets = res.data;
    } catch (err: any) {
      if (err?.response?.status === 401) {
        cachedToken = null;
        token = await getCachedLauncherToken(main);
        const res = await axios.get(assetsUrl, {
          headers: { Authorization: `bearer ${token}` },
          timeout: 30_000,
        });
        assets = res.data;
      } else {
        throw err;
      }
    }

    if (!Array.isArray(assets)) {
      return { success: false, games: [], error: 'Unexpected assets response' };
    }

    const installedMap = readInstalledManifests();
    const favorites = (await storage.get<string[]>('library-favorites')) ?? [];
    const favSet = new Set(favorites);

    const games: LibraryGame[] = [];
    for (const asset of assets) {
      if (!asset.appName || !asset.namespace || !asset.catalogItemId) continue;
      const installed = installedMap.get(asset.appName);
      games.push({
        id: asset.appName,
        namespace: asset.namespace,
        catalogItemId: asset.catalogItemId,
        title: installed?.DisplayName || asset.appName,
        images: { tall: '', wide: '' },
        installed: !!installed,
        installSize: installed?.InstallSize || 0,
        installPath: installed?.InstallLocation || '',
        favorite: favSet.has(asset.appName),
      });
    }

    // Sort: favorites first, then installed, then alphabetical
    games.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      if (a.installed !== b.installed) return a.installed ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

    return { success: true, games };
  } catch (err: any) {
    return { success: false, games: [], error: err?.message || 'Unknown error' };
  }
}

/**
 * Phase 2: Fetch catalog metadata (title + images) for a batch of games.
 * Called from the renderer in batches so cards appear progressively.
 */
export async function getGameMetadata(
  storage: Storage,
  items: Array<{ namespace: string; catalogItemId: string }>,
): Promise<{ success: boolean; metadata: Record<string, { title: string; tall: string; wide: string }> }> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, metadata: {} };

    let token: string;
    try {
      token = await getCachedLauncherToken(main);
    } catch {
      return { success: false, metadata: {} };
    }

    // Group by namespace
    const byNamespace = new Map<string, string[]>();
    for (const item of items) {
      const arr = byNamespace.get(item.namespace) ?? [];
      arr.push(item.catalogItemId);
      byNamespace.set(item.namespace, arr);
    }

    const metadata: Record<string, { title: string; tall: string; wide: string }> = {};

    for (const [ns, ids] of byNamespace) {
      try {
        const idParam = ids.join('&id=');
        const catalogUrl = `https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${ns}/bulk/items?id=${idParam}&country=US&locale=en`;
        const catalogRes = await axios.get(catalogUrl, {
          headers: { Authorization: `bearer ${token}` },
          timeout: 20_000,
        });
        const data = catalogRes.data;
        if (data && typeof data === 'object') {
          for (const [key, val] of Object.entries(data) as Array<[string, any]>) {
            let tall = '';
            let wide = '';
            if (val?.keyImages && Array.isArray(val.keyImages)) {
              for (const img of val.keyImages) {
                if (img.type === 'DieselGameBoxTall') tall = img.url;
                else if (img.type === 'DieselGameBox') wide = img.url;
                else if (img.type === 'Featured' && !wide) wide = img.url;
                else if (img.type === 'DieselStoreFrontTall' && !tall) tall = img.url;
                else if (img.type === 'DieselStoreFrontWide' && !wide) wide = img.url;
                else if (img.type === 'Thumbnail' && !tall) tall = img.url;
              }
              if (!tall && !wide && val.keyImages.length > 0) {
                tall = val.keyImages[0].url;
                wide = val.keyImages[0].url;
              }
            }
            metadata[key] = {
              title: val?.title || '',
              tall: tall || wide,
              wide: wide || tall,
            };
          }
        }
      } catch { /* batch failed, skip */ }
    }

    return { success: true, metadata };
  } catch {
    return { success: false, metadata: {} };
  }
}

/**
 * Launch a game via EGL URI protocol.
 */
export async function launchLibraryGame(
  namespace: string,
  catalogItemId: string,
  appName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const uri = `com.epicgames.launcher://apps/${namespace}%3A${catalogItemId}%3A${appName}?action=launch&silent=true`;
    await shell.openExternal(uri);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to launch' };
  }
}

/**
 * Toggle a game's favorite status.
 */
export async function toggleFavorite(storage: Storage, appId: string): Promise<boolean> {
  const favorites = (await storage.get<string[]>('library-favorites')) ?? [];
  const idx = favorites.indexOf(appId);
  if (idx >= 0) {
    favorites.splice(idx, 1);
  } else {
    favorites.push(appId);
  }
  await storage.set('library-favorites', favorites);
  return idx < 0; // returns new state: true = favorited
}
