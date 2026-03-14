import { ipcMain, BrowserWindow, shell, dialog, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { Storage } from './storage';
import * as auth from './helpers/auth/auth';
import { importFromOtherLaunchers } from './helpers/auth/importAccounts';
import * as autokick from './events/autokick/monitor';
import * as security from './helpers/auth/security';
import * as alerts from './helpers/stw/alerts';
import * as worldinfo from './helpers/stw/worldinfo';
import * as workerpower from './helpers/stw/workerpower';
import * as mcp from './helpers/epic/mcp';
import * as outpost from './helpers/epic/outpost';
import * as stalk from './helpers/epic/stalk';
import * as party from './helpers/epic/party';
import * as eula from './helpers/epic/eula';
import * as authPage from './helpers/epic/authPage';
import * as status from './helpers/epic/status';
import * as taxi from './helpers/epic/taxi';
import * as ghostequip from './helpers/epic/ghostequip';
import * as friends from './helpers/epic/friends';
import { generateLockerImage } from './managers/locker/generateLocker';
import axios from 'axios';
import { refreshAccountToken, authenticatedRequest, validateAllTokens } from './helpers/auth/tokenRefresh';
import { Endpoints } from './helpers/endpoints';
import { launchGame } from './helpers/cmd/launcher';
import { detectFortnitePath } from './helpers/cmd/detectFortnite';
import * as devbuilds from './helpers/cmd/devbuilds';
import * as devstairs from './helpers/cmd/devstairs';
import * as airstrike from './helpers/cmd/airstrike';
import * as trapheight from './helpers/cmd/trapheight';
import * as fov from './helpers/cmd/fov';
import * as dupe from './helpers/cmd/dupe';
import * as vbucksInfo from './helpers/cmd/vbucks';
import * as giftsInfo from './helpers/cmd/gifts';
import * as fnlaunch from './helpers/cmd/fnlaunch';
import * as library from './helpers/cmd/library';
import * as store from './helpers/cmd/store';
import * as epicstatus from './helpers/epic/epicstatus';
import * as redeemcodes from './helpers/cmd/redeemcodes';
import * as lookup from './helpers/epic/lookup';
import * as xpboosts from './helpers/cmd/xpboosts';
import * as quests from './helpers/stw/quests';
import * as autodaily from './events/autodaily/autodaily';
import * as autoresponder from './managers/autoresponder';
import * as shop from './managers/shop/ShopManager';
import * as lockerMgr from './managers/locker/lockerManager';
import * as accountmgmt from './helpers/epic/accountmgmt';
import * as autoExp from './events/expeditions/autoExpeditions';
import expeditionManager from './managers/expeditions';
import { getCampaignData } from './managers/expeditions/helpers';
import guia from './utils/map/guia.json';
import { notificationManager } from './managers/notifications/NotificationManager';
import * as updater from './utils/updater';
import type { AutoKickAccountConfig, AccountsData } from '../shared/types';

/**
 * Register all IPC handlers.
 * Add new channels here as the app grows.
 */
export function registerIpcHandlers(
  storage: Storage,
  performMemoryCleanup: () => Promise<void>,
  restartRamCleanup: () => Promise<void>,
): void {
  // ── Storage ──────────────────────────────────────────────
  ipcMain.handle('storage:get', async (_e, key: string) => {
    return storage.get(key);
  });

  ipcMain.handle('storage:set', async (_e, key: string, value: unknown) => {
    return storage.set(key, value);
  });

  ipcMain.handle('storage:delete', async (_e, key: string) => {
    return storage.delete(key);
  });

  // ── Settings sync (fires app-level events picked up by main/index) ──
  ipcMain.on('settings:tray-changed', (_e, enabled: boolean) => {
    (app as any).emit('glow:tray-changed', enabled);
  });

  ipcMain.on('settings:startup-changed', (_e, enabled: boolean) => {
    (app as any).emit('glow:startup-changed', enabled);
  });

  // ── Window controls ──────────────────────────────────────
  ipcMain.on('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });

  ipcMain.on('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });

  // ── Shell ────────────────────────────────────────────────
  ipcMain.handle('shell:open-external', (_e, url: string) => {
    return shell.openExternal(url);
  });

  ipcMain.handle('shell:open-path', (_e, p: string) => {
    return shell.openPath(p);
  });

  // ── Accounts ─────────────────────────────────────────────
  ipcMain.handle('accounts:get-all', () => {
    return auth.getAccountsData(storage);
  });

  ipcMain.handle('accounts:accept-tos', () => {
    return auth.acceptTos(storage);
  });

  ipcMain.handle('accounts:start-device-auth', () => {
    auth.startDeviceAuth(storage).catch(() => {});
  });

  ipcMain.handle('accounts:start-device-code', () => {
    auth.startDeviceCodeDisplay(storage).catch(() => {});
  });

  ipcMain.handle('accounts:submit-exchange', (_e, code: string) => {
    auth.submitExchangeCode(storage, code).catch(() => {});
  });

  ipcMain.handle('accounts:submit-auth-code', (_e, code: string) => {
    auth.submitAuthorizationCode(storage, code).catch(() => {});
  });

  ipcMain.handle('accounts:cancel-auth', () => {
    auth.cancelAuth();
  });

  ipcMain.handle('accounts:import-launchers', async () => {
    const result = await importFromOtherLaunchers(storage);
    const added = result.results.filter((r) => r.status === 'added').length;
    if (added > 0) {
      // Defer so the IPC response reaches the renderer first, then notify
      setImmediate(() => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('accounts:data-changed');
      });
    }
    return result;
  });

  ipcMain.handle('accounts:remove', (_e, id: string) => {
    return auth.removeAccount(storage, id);
  });

  ipcMain.handle('accounts:set-main', (_e, id: string) => {
    return auth.setMainAccount(storage, id);
  });

  ipcMain.handle('accounts:reorder', async (_e, orderedIds: string[]) => {
    const data = await auth.getAccountsData(storage);
    const map = new Map(data.accounts.map((a) => [a.accountId, a]));
    const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as typeof data.accounts;
    // Append any accounts that weren't in the ordered list (safety net)
    for (const acc of data.accounts) {
      if (!orderedIds.includes(acc.accountId)) reordered.push(acc);
    }
    data.accounts = reordered;
    await storage.set('accounts', data);
    // Notify renderer so toolbar select updates in real-time
    BrowserWindow.getAllWindows()[0]?.webContents.send('accounts:data-changed');
    return data;
  });

  // ── Avatar cache ─────────────────────────────────────────
  const avatarCache = new Map<string, string>(); // accountId → url

  /** Internal: fetch avatar URL from Epic API (no cache) */
  async function fetchAvatarUrl(accountId: string): Promise<string> {
    const DEFAULT_AVATAR = 'https://fortnite-api.com/images/cosmetics/br/cid_890_athena_commando_f_choneheadhunter/variants/material/mat2.png';
    try {
      const token = await refreshAccountToken(storage, accountId);
      if (!token) return DEFAULT_AVATAR;
      const avatarUrl = `${Endpoints.ACCOUNT_AVATAR}/fortnite/ids?accountIds=${accountId}`;
      let avatarId: string | null = null;
      try {
        const response = await axios.get(avatarUrl, { headers: { Authorization: `bearer ${token}` }, timeout: 8000 });
        if (Array.isArray(response.data) && response.data[0]?.avatarId) avatarId = response.data[0].avatarId;
      } catch (err: any) {
        if (err?.response?.status === 401) {
          const newToken = await refreshAccountToken(storage, accountId);
          if (newToken) {
            try {
              const retryRes = await axios.get(avatarUrl, { headers: { Authorization: `bearer ${newToken}` }, timeout: 8000 });
              if (Array.isArray(retryRes.data) && retryRes.data[0]?.avatarId) avatarId = retryRes.data[0].avatarId;
            } catch { /* ignore */ }
          }
        }
      }
      if (avatarId && avatarId.includes(':')) {
        const idPart = avatarId.split(':')[1];
        return `https://fortnite-api.com/images/cosmetics/br/${idPart}/smallicon.png`;
      }
      return DEFAULT_AVATAR;
    } catch {
      return DEFAULT_AVATAR;
    }
  }

  ipcMain.handle('accounts:get-all-avatars', async () => {
    try {
      const data = await auth.getAccountsData(storage) as AccountsData;
      const results: Record<string, string> = {};
      await Promise.all(data.accounts.map(async (acc) => {
        try {
          const url = await fetchAvatarUrl(acc.accountId);
          avatarCache.set(acc.accountId, url);
          results[acc.accountId] = url;
        } catch { /* skip */ }
      }));
      return { success: true, avatars: results };
    } catch (err: any) {
      return { success: false, avatars: {}, error: err?.message };
    }
  });

  ipcMain.handle('accounts:validate-all', () => {
    return validateAllTokens(storage);
  });

  ipcMain.handle('accounts:get-avatar', async (_e, accountId: string) => {
    const DEFAULT_AVATAR = 'https://fortnite-api.com/images/cosmetics/br/cid_890_athena_commando_f_choneheadhunter/variants/material/mat2.png';

    try {
      // 1. Get token
      const token = await refreshAccountToken(storage, accountId);
      if (!token) {
        return { success: true, url: DEFAULT_AVATAR };
      }

      // 2. Fetch avatar from Epic API
      const avatarUrl = `${Endpoints.ACCOUNT_AVATAR}/fortnite/ids?accountIds=${accountId}`;

      let avatarId: string | null = null;

      try {
        const response = await axios.get(avatarUrl, {
          headers: { Authorization: `bearer ${token}` },
          timeout: 8000,
        });

        if (Array.isArray(response.data) && response.data[0]?.avatarId) {
          avatarId = response.data[0].avatarId;
        }
      } catch (err: any) {
        if (err?.response?.status === 401) {
          const newToken = await refreshAccountToken(storage, accountId);
          if (newToken) {
            try {
              const retryRes = await axios.get(avatarUrl, {
                headers: { Authorization: `bearer ${newToken}` },
                timeout: 8000,
              });
              if (Array.isArray(retryRes.data) && retryRes.data[0]?.avatarId) {
                avatarId = retryRes.data[0].avatarId;
              }
            } catch { /* ignore */ }
          }
        }
      }

      // 3. Build URL
      let iconURL: string;
      if (avatarId && avatarId.includes(':')) {
        const idPart = avatarId.split(':')[1];
        iconURL = `https://fortnite-api.com/images/cosmetics/br/${idPart}/smallicon.png`;
      } else {
        iconURL = DEFAULT_AVATAR;
      }

      avatarCache.set(accountId, iconURL);
      return { success: true, url: iconURL };
    } catch {
      return { success: true, url: DEFAULT_AVATAR };
    }
  });

  ipcMain.handle('accounts:get-avatar-cached', async (_e, accountId: string) => {
    const DEFAULT_AVATAR = 'https://fortnite-api.com/images/cosmetics/br/cid_890_athena_commando_f_choneheadhunter/variants/material/mat2.png';
    if (avatarCache.has(accountId)) {
      return { success: true, url: avatarCache.get(accountId)! };
    }
    return { success: true, url: DEFAULT_AVATAR };
  });

  // ── AutoKick ───────────────────────────────────────────────
  ipcMain.handle('autokick:get-full-status', () => {
    return autokick.getAutoKickFullStatus(storage);
  });

  ipcMain.handle('autokick:toggle', (_e, accountId: string, active: boolean) => {
    return autokick.toggleAutoKick(storage, accountId, active);
  });

  ipcMain.handle('autokick:update-config', (_e, accountId: string, partial: Partial<AutoKickAccountConfig>) => {
    return autokick.updateAutoKickConfig(storage, accountId, partial);
  });

  // ── Launch ─────────────────────────────────────────────────
  ipcMain.handle('launch:start', async () => {
    const result = await launchGame(storage);
    if (result.success) {
      // Start process killer after successful launch
      fnlaunch.startProcessKiller(storage);
    }
    return result;
  });

  ipcMain.handle('launch:kill', async () => {
    const { exec: execCb } = require('child_process') as typeof import('child_process');
    return new Promise<{ success: boolean; message: string }>((resolve) => {
      execCb('taskkill /F /IM FortniteClient-Win64-Shipping.exe /T', { shell: 'cmd.exe' }, (err) => {
        if (err) {
          resolve({ success: false, message: 'Fortnite is not running' });
        } else {
          resolve({ success: true, message: 'Fortnite closed' });
        }
      });
    });
  });

  // ── Security ───────────────────────────────────────────────
  ipcMain.handle('security:get-account-info', () => {
    return security.getAccountInfo(storage);
  });

  ipcMain.handle('security:get-device-auths', () => {
    return security.getDeviceAuths(storage);
  });

  ipcMain.handle('security:delete-device-auth', (_e, deviceId: string) => {
    return security.deleteDeviceAuth(storage, deviceId);
  });

  ipcMain.handle('security:delete-all-device-auths', () => {
    return security.deleteAllDeviceAuths(storage);
  });

  ipcMain.handle('security:check-ban', () => {
    return security.checkBanStatus(storage);
  });

  ipcMain.handle('security:get-exchange-url', () => {
    return security.getExchangeCodeUrl(storage);
  });

  // ── Settings helpers ────────────────────────────────────────
  ipcMain.handle('settings:detect-fortnite-path', async (_e) => {
    try {
      const detected = detectFortnitePath();
      if (detected) {
        const s = (await storage.get<{ fortnitePath?: string }>('settings')) ?? {};
        await storage.set('settings', { ...s, fortnitePath: detected });
      }
      return { success: true, path: detected };
    } catch (err: any) {
      return { success: false, path: null, error: err.message };
    }
  });

  // ── Dialog ─────────────────────────────────────────────────
  ipcMain.handle('dialog:open-directory', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Fortnite Installation Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:open-file', async (e, options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      title: options?.title || 'Select a file',
      filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // ── Alerts ─────────────────────────────────────────────────
  ipcMain.handle('alerts:get-missions', () => {
    return alerts.getMissions(storage);
  });

  ipcMain.handle('alerts:get-missions-force', () => {
    return alerts.getMissions(storage, true);
  });

  ipcMain.handle('alerts:get-completed', () => {
    return alerts.getCompletedAlerts(storage);
  });

  // ── Files ──────────────────────────────────────────────────
  ipcMain.handle('files:get-worldinfo', async () => {
    return worldinfo.getWorldInfo(storage);
  });

  ipcMain.handle('files:worker-power', async (_e, targetLevel: number) => {
    return workerpower.generateWorkerPower(storage, targetLevel);
  });

  ipcMain.handle('files:save', async (_e, jsonString: string, defaultName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save File',
      defaultPath: `${defaultName}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { saved: false };
    await fs.promises.writeFile(filePath, jsonString, 'utf8');
    return { saved: true, path: filePath };
  });

  // ── Dev Builds ─────────────────────────────────────────────
  ipcMain.handle('files:devbuild-status', async () => {
    return devbuilds.getDevBuildStatus(storage);
  });

  ipcMain.handle('files:devbuild-toggle', async () => {
    return devbuilds.toggleDevBuild(storage);
  });

  // ── DevStairs ──────────────────────────────────────────────
  ipcMain.handle('files:devstairs-status', async () => {
    return devstairs.getDevStairsStatus(storage);
  });

  ipcMain.handle('files:devstairs-toggle', async () => {
    return devstairs.toggleDevStairs(storage);
  });

  // ── AirStrike ──────────────────────────────────────────────
  ipcMain.handle('files:airstrike-status', async () => {
    return airstrike.getAirStrikeStatus(storage);
  });

  ipcMain.handle('files:airstrike-toggle', async () => {
    return airstrike.toggleAirStrike(storage);
  });

  // ── Trap Height Modifier ───────────────────────────────────
  ipcMain.handle('files:trapheight-list', async () => {
    return trapheight.getTrapList();
  });

  ipcMain.handle('files:trapheight-presets', async () => {
    return trapheight.HEIGHT_PRESETS;
  });

  ipcMain.handle('files:trapheight-status', async (_e, guid: string) => {
    return trapheight.getTrapStatus(storage, guid);
  });

  ipcMain.handle('files:trapheight-apply', async (_e, guid: string, newHeight: string) => {
    return trapheight.applyTrapHeight(storage, guid, newHeight);
  });

  ipcMain.handle('files:trapheight-revert', async (_e, guid: string) => {
    return trapheight.revertTrapHeight(storage, guid);
  });

  ipcMain.handle('files:trapheight-revert-all', async () => {
    return trapheight.revertAllTraps(storage);
  });

  ipcMain.handle('files:trapheight-modified-count', async () => {
    return trapheight.getModifiedCount(storage);
  });

  ipcMain.handle('files:trapheight-modified-traps', async () => {
    return trapheight.getModifiedTraps(storage);
  });

  ipcMain.handle('files:trapheight-family-info', async () => {
    return trapheight.getFamilyInfo();
  });

  ipcMain.handle('files:trapheight-height-data', async () => {
    return trapheight.getHeightData();
  });

  // ── FOV Patcher ────────────────────────────────────────────
  ipcMain.handle('files:fov-status', async () => {
    return fov.getFovStatus(storage);
  });

  ipcMain.handle('files:fov-apply', async (_e, fovValue: number) => {
    return fov.applyFov(storage, fovValue);
  });

  ipcMain.handle('files:fov-restore', async () => {
    return fov.restoreFov(storage);
  });

  // ── Dupe ───────────────────────────────────────────────────
  ipcMain.handle('dupe:execute', async () => {
    return dupe.executeDupe(storage);
  });

  // ── V-Bucks Info ───────────────────────────────────────────
  ipcMain.handle('vbucks:get-info', async () => {
    return vbucksInfo.getVbucksInfo(storage);
  });

  // ── Gifts Info ─────────────────────────────────────────────
  ipcMain.handle('gifts:get-info', async () => {
    return giftsInfo.getGiftsInfo(storage);
  });

  // ── Epic Status ────────────────────────────────────────────
  ipcMain.handle('epicstatus:get-all', async () => {
    return epicstatus.getEpicStatus(storage);
  });

  // ── Redeem Codes ───────────────────────────────────────────
  ipcMain.handle('redeemcodes:redeem', async (_e, code: string) => {
    return redeemcodes.redeemCode(storage, code);
  });

  ipcMain.handle('redeemcodes:friend-codes', async () => {
    return redeemcodes.getFriendCodes(storage);
  });

  // ── XP Boosts ──────────────────────────────────────────────
  ipcMain.handle('xpboosts:get-profile', async () => {
    return xpboosts.getXPBoosts(storage);
  });

  ipcMain.handle('xpboosts:consume', async (_e, type: 'personal' | 'teammate', amount: number, targetAccountId?: string) => {
    return xpboosts.consumeXPBoosts(storage, type, amount, targetAccountId);
  });

  ipcMain.handle('xpboosts:bulk-personal', async () => {
    const result = await xpboosts.bulkPersonalXPBoosts(storage);
    if (result.totalConsumed > 0) {
      notificationManager.push(
        'general',
        'XP Boosts',
        `Bulk activated ${result.totalConsumed} personal boost${result.totalConsumed !== 1 ? 's' : ''} across ${result.accountsProcessed} account${result.accountsProcessed !== 1 ? 's' : ''}`,
      );
    }
    return result;
  });

  // ── MCP ────────────────────────────────────────────────────
  ipcMain.handle('mcp:execute', async (_e, operation: string, profileId: string) => {
    return mcp.executeMcp(storage, operation, profileId);
  });

  // ── Outpost Info ───────────────────────────────────────────
  ipcMain.handle('outpost:info', async () => {
    return outpost.getOutpostInfo(storage);
  });

  ipcMain.handle('outpost:base-data', async (_e, saveFile: string) => {
    return outpost.getOutpostBaseData(storage, saveFile);
  });

  // ── Stalk ──────────────────────────────────────────────────
  ipcMain.handle('stalk:search', async (_e, searchTerm: string) => {
    try {
      const results = await stalk.searchPlayers(storage, searchTerm);
      return { success: true, results };
    } catch (err: any) {
      return { success: false, results: [], error: err.message || 'Search failed' };
    }
  });

  ipcMain.handle('stalk:matchmaking', async (_e, targetInput: string) => {
    try {
      const result = await stalk.getMatchmakingInfo(storage, targetInput);
      return { success: true, ...result };
    } catch (err: any) {
      return { success: false, error: err.message || 'Matchmaking lookup failed' };
    }
  });

  // ── Lookup ─────────────────────────────────────────────────
  ipcMain.handle('lookup:search', async (_e, searchTerm: string) => {
    try {
      const results = await stalk.searchPlayers(storage, searchTerm);
      return { success: true, results };
    } catch (err: any) {
      return { success: false, results: [], error: err.message || 'Search failed' };
    }
  });

  ipcMain.handle('lookup:batch', async (_e, accountIds: string[]) => {
    try {
      const result = await lookup.lookupAccountIds(storage, accountIds);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'Lookup failed' };
    }
  });

  // ── Party ──────────────────────────────────────────────────
  ipcMain.handle('party:info', async () => {
    try {
      const info = await party.getPartyInfo(storage);
      return { success: true, ...info };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get party info' };
    }
  });

  ipcMain.handle('party:leave', async () => {
    try {
      return await party.leaveParty(storage);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to leave party' };
    }
  });

  ipcMain.handle('party:kick', async (_e, memberId: string) => {
    try {
      return await party.kickMember(storage, memberId);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to kick member' };
    }
  });

  ipcMain.handle('party:kick-collect', async (_e, _force: boolean) => {
    try {
      return await party.kickCollect(storage, true);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to kick-collect' };
    }
  });

  ipcMain.handle('party:kick-collect-expulse', async (_e, _force: boolean) => {
    try {
      return await party.kickCollectExpulse(storage, true);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to kick-collect-expulse' };
    }
  });

  ipcMain.handle('party:invite', async (_e, targetInput: string) => {
    try {
      return await party.invitePlayer(storage, targetInput);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to invite' };
    }
  });

  ipcMain.handle('party:join', async (_e, targetInput: string) => {
    try {
      return await party.joinPlayer(storage, targetInput);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to join' };
    }
  });

  ipcMain.handle('party:promote', async (_e, memberId: string) => {
    try {
      return await party.promotePlayer(storage, memberId);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to promote' };
    }
  });

  ipcMain.handle('party:toggle-privacy', async () => {
    try {
      return await party.togglePrivacy(storage);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to toggle privacy' };
    }
  });

  ipcMain.handle('party:fix-invite', async () => {
    try {
      return await party.fixPartyInvite(storage);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fix party invite' };
    }
  });

  ipcMain.handle('party:search', async (_e, searchTerm: string) => {
    try {
      const results = await party.searchPlayers(storage, searchTerm);
      return { success: true, results };
    } catch (err: any) {
      return { success: false, results: [], error: err.message || 'Search failed' };
    }
  });

  // ── GhostEquip ─────────────────────────────────────────────
  ipcMain.handle('ghostequip:set-outfit', async (_e, cosmeticId: string) => {
    return ghostequip.setOutfit(storage, cosmeticId);
  });

  ipcMain.handle('ghostequip:set-backpack', async (_e, cosmeticId: string) => {
    return ghostequip.setBackpack(storage, cosmeticId);
  });

  ipcMain.handle('ghostequip:set-emote', async (_e, cosmeticId: string) => {
    return ghostequip.setEmote(storage, cosmeticId);
  });

  ipcMain.handle('ghostequip:set-shoes', async (_e, cosmeticId: string) => {
    return ghostequip.setShoes(storage, cosmeticId);
  });

  ipcMain.handle('ghostequip:set-banner', async (_e, bannerId: string) => {
    return ghostequip.setBanner(storage, bannerId);
  });

  ipcMain.handle('ghostequip:set-crowns', async (_e, amount: number) => {
    return ghostequip.setCrowns(storage, amount);
  });

  ipcMain.handle('ghostequip:set-level', async (_e, level: number) => {
    return ghostequip.setLevel(storage, level);
  });

  // ── Friends ────────────────────────────────────────────────
  ipcMain.handle('friends:get-summary', async () => {
    return friends.getFriendsSummary(storage);
  });

  ipcMain.handle('friends:add', async (_e, input: string) => {
    return friends.addFriend(storage, input);
  });

  ipcMain.handle('friends:remove', async (_e, friendId: string) => {
    return friends.removeFriend(storage, friendId);
  });

  ipcMain.handle('friends:accept', async (_e, friendId: string) => {
    return friends.acceptFriend(storage, friendId);
  });

  ipcMain.handle('friends:reject', async (_e, friendId: string) => {
    return friends.rejectFriend(storage, friendId);
  });

  ipcMain.handle('friends:cancel', async (_e, friendId: string) => {
    return friends.cancelRequest(storage, friendId);
  });

  ipcMain.handle('friends:block', async (_e, userId: string) => {
    return friends.blockUser(storage, userId);
  });

  ipcMain.handle('friends:remove-all', async () => {
    return friends.removeAllFriends(storage);
  });

  ipcMain.handle('friends:clear-all', async () => {
    return friends.clearAllFriends(storage);
  });

  ipcMain.handle('friends:accept-all', async () => {
    return friends.acceptAllIncoming(storage);
  });

  // ── EULA / Corrections ─────────────────────────────────────
  ipcMain.handle('eula:accept-eula', async () => {
    try {
      return await eula.acceptEula(storage);
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to accept EULA' };
    }
  });

  ipcMain.handle('eula:accept-privacy', async () => {
    try {
      return await eula.acceptPrivacyPolicy(storage);
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to accept Privacy Policy' };
    }
  });

  // ── Auth Page ──────────────────────────────────────────────
  ipcMain.handle('authpage:device-auth-info', async () => {
    try {
      return await authPage.getDeviceAuthInfo(storage);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get device auth info' };
    }
  });

  ipcMain.handle('authpage:access-token', async () => {
    try {
      return await authPage.generateAccessToken(storage);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to generate access token' };
    }
  });

  ipcMain.handle('authpage:exchange-code', async () => {
    try {
      return await authPage.generateExchangeCode(storage);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to generate exchange code' };
    }
  });

  ipcMain.handle('authpage:continuation-token', async () => {
    try {
      return await authPage.extractContinuationToken(storage);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to extract continuation token' };
    }
  });

  ipcMain.handle('authpage:verify-token', async (_e, token: string) => {
    try {
      return await authPage.verifyToken(storage, token);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to verify token' };
    }
  });

  // ── Status ─────────────────────────────────────────────────
  ipcMain.handle('status:get-all', async () => {
    try {
      return { success: true, statuses: await status.getStatusAll(storage) };
    } catch (err: any) {
      return { success: false, statuses: [], error: err.message || 'Failed to get statuses' };
    }
  });

  ipcMain.handle('status:activate', async (_e, accountId: string, mensaje: string, plataforma: string, presenceMode: string) => {
    try {
      return await status.activateStatus(storage, accountId, mensaje, plataforma, presenceMode);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to activate status' };
    }
  });

  ipcMain.handle('status:deactivate', async (_e, accountId: string) => {
    try {
      return await status.deactivateStatus(storage, accountId);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to deactivate status' };
    }
  });

  ipcMain.handle('status:refresh', async (_e, accountId: string) => {
    try {
      return await status.refreshStatus(storage, accountId);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to refresh status' };
    }
  });

  ipcMain.handle('status:update-message', async (_e, accountId: string, mensaje: string) => {
    try {
      return await status.updateStatusMessage(storage, accountId, mensaje);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update message' };
    }
  });

  ipcMain.handle('status:get-info', async (_e, accountId: string) => {
    try {
      const info = await status.getStatusInfo(storage, accountId);
      return { success: true, info };
    } catch (err: any) {
      return { success: false, info: null, error: err.message || 'Failed to get status info' };
    }
  });

  // ── Taxi ───────────────────────────────────────────────────
  ipcMain.handle('taxi:get-all', async () => {
    try {
      return { success: true, statuses: await taxi.getTaxiAll(storage) };
    } catch (err: any) {
      return { success: false, statuses: [], error: err.message || 'Failed' };
    }
  });

  ipcMain.handle('taxi:get-avatars', async () => {
    try {
      return { success: true, avatars: await taxi.getTaxiAvatars(storage) };
    } catch (err: any) {
      return { success: false, avatars: {}, error: err.message || 'Failed' };
    }
  });

  ipcMain.handle('taxi:activate', async (_e, accountId: string) => {
    try {
      return await taxi.activateTaxi(storage, accountId);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to activate' };
    }
  });

  ipcMain.handle('taxi:deactivate', async (_e, accountId: string) => {
    try {
      return await taxi.deactivateTaxi(storage, accountId);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to deactivate' };
    }
  });

  ipcMain.handle('taxi:update-config', async (_e, accountId: string, partial: any) => {
    try {
      return await taxi.updateTaxiConfig(storage, accountId, partial);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update config' };
    }
  });

  ipcMain.handle('taxi:accept-responsibility', async (_e, accountId: string) => {
    try {
      return await taxi.acceptTaxiResponsibility(storage, accountId);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed' };
    }
  });

  ipcMain.handle('taxi:add-whitelist', async (_e, accountId: string, targetId: string, targetName: string) => {
    try {
      return await taxi.addTaxiWhitelist(storage, accountId, targetId, targetName);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed' };
    }
  });

  ipcMain.handle('taxi:remove-whitelist', async (_e, accountId: string, targetId: string) => {
    try {
      return await taxi.removeTaxiWhitelist(storage, accountId, targetId);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed' };
    }
  });

  // ── Locker ─────────────────────────────────────────────────
  ipcMain.handle('locker:generate', async (_e, filters: { types: string[]; rarities: string[]; chapters: string[]; exclusive: boolean; equippedItemIds?: string[] }) => {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a: any) => a.isMain) ?? raw.accounts[0];
    if (!main) throw new Error('No account found');

    // Get fresh token (auto-refreshes device auth)
    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) throw new Error('Failed to refresh token');

    const lockerFilters: any = {
      types: filters.types,
      rarities: filters.rarities,
      chapters: filters.chapters,
      exclusive: filters.exclusive,
    };
    if (filters.equippedItemIds) lockerFilters.equippedItemIds = filters.equippedItemIds;

    const result = await generateLockerImage({
      accessToken: token,
      accountId: main.accountId,
      type: filters.types,
      displayName: main.displayName || main.accountId,
      filters: lockerFilters,
    });

    if (!result.success) {
      // If it looks like a 401/auth error, retry with fresh token
      if (result.error?.includes('401') || result.error?.includes('auth') || result.error?.includes('token')) {
        const newToken = await refreshAccountToken(storage, main.accountId);
        if (newToken) {
          const retry = await generateLockerImage({
            accessToken: newToken,
            accountId: main.accountId,
            type: filters.types,
            displayName: main.displayName || main.accountId,
            filters: lockerFilters,
          });
          return retry;
        }
      }
    }

    return result;
  });

  // ── Locker save ─────────────────────────────────────────────
  ipcMain.handle('locker:save', async (_e, sourcePath: string) => {
    if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error('Image file not found');
    const ext = path.extname(sourcePath).toLowerCase();
    const filterName = ext === '.jpg' ? 'JPEG' : 'PNG';
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Locker Image',
      defaultPath: path.basename(sourcePath),
      filters: [{ name: `${filterName} Image`, extensions: [ext.replace('.', '')] }],
    });
    if (canceled || !filePath) return { saved: false };
    await fs.promises.copyFile(sourcePath, filePath);
    return { saved: true, path: filePath };
  });

  // ── Item Shop ──────────────────────────────────────────────
  ipcMain.handle('shop:get-items', async () => {
    return shop.getShopData();
  });

  ipcMain.handle('shop:buy', async (_e, offerId: string, expectedPrice: number) => {
    return shop.purchaseItem(storage, offerId, expectedPrice);
  });

  ipcMain.handle('shop:gift', async (_e, offerId: string, receiverAccountId: string, message: string, expectedPrice: number) => {
    return shop.giftItem(storage, offerId, receiverAccountId, expectedPrice, message || '');
  });

  ipcMain.handle('shop:toggle-gifts', async (_e, enable: boolean) => {
    return shop.toggleGifts(storage, enable);
  });

  ipcMain.handle('shop:get-friends', async () => {
    return shop.getFriendsList(storage);
  });

  ipcMain.handle('shop:get-vbucks', async () => {
    return shop.getVbucks(storage);
  });

  ipcMain.handle('shop:get-owned', async () => {
    return shop.getOwnedCosmeticIds(storage);
  });

  // ── Account Management ─────────────────────────────────────
  ipcMain.handle('accountmgmt:get-info', async () => {
    return accountmgmt.getAccountInfo(storage);
  });

  ipcMain.handle('accountmgmt:update-field', async (_e, field: string, value: string) => {
    return accountmgmt.updateAccountField(storage, field, value);
  });

  // ── Auto-Expeditions ───────────────────────────────────────
  ipcMain.handle('expeditions:get-status', async () => {
    return autoExp.getAutoExpStatus(storage);
  });

  ipcMain.handle('expeditions:toggle', async (_e, accountId: string, active: boolean, rewardTypes?: string[]) => {
    return autoExp.toggleAutoExp(storage, accountId, active, rewardTypes);
  });

  ipcMain.handle('expeditions:update-config', async (_e, accountId: string, partial: any) => {
    return autoExp.updateAutoExpConfig(storage, accountId, partial);
  });

  ipcMain.handle('expeditions:run-cycle', async (_e, accountId: string) => {
    return autoExp.runExpeditionCycle(storage, accountId);
  });

  // ── Expedition Management (manual actions) ─────────────────
  ipcMain.handle('expeditions:list', async (_e, accountId: string) => {
    try {
      const token = await refreshAccountToken(storage, accountId);
      if (!token) return { success: false, error: 'Failed to refresh token' };

      const campaignResult = await getCampaignData({ accountId, accessToken: token, forceRefresh: true });
      if (!campaignResult.success) return { success: false, error: campaignResult.error };

      const data = campaignResult.data;
      const all = expeditionManager.getExpeditionsFromCampaignData(data);
      const now = Date.now();

      const available: any[] = [];
      const sent: any[] = [];
      const completed: any[] = [];

      for (const exp of all) {
        const startTime = exp.attributes?.expedition_start_time;
        const endTime = exp.attributes?.expedition_end_time;
        const guiaName = (guia as Record<string, string>)[exp.templateId];
        const entry = {
          itemId: exp.itemId,
          templateId: exp.templateId,
          name: guiaName || exp.name || exp.templateId.replace('Expedition:expedition_', '').replace(/_/g, ' '),
          rewardType: exp.rewardType || 'Unknown',
          power: exp.maxTargetPower || exp.power || 0,
          duration: exp.duration || 0,
          endTime: endTime || null,
        };

        if (startTime && endTime) {
          if (new Date(endTime).getTime() > now) {
            sent.push({ ...entry, status: 'sent', timeRemaining: expeditionManager.formatTimeRemaining(endTime) });
          } else {
            completed.push({ ...entry, status: 'completed', timeRemaining: 'Completed' });
          }
        } else {
          available.push({ ...entry, status: 'available' });
        }
      }

      return { success: true, available, sent, completed, slots: { used: sent.length + completed.length, max: 6 } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('expeditions:send', async (_e, accountId: string, types: string[], amount: number) => {
    try {
      const token = await refreshAccountToken(storage, accountId);
      if (!token) return { success: false, error: 'Failed to refresh token' };

      await expeditionManager.refreshExpeditions({ accountId, accessToken: token });

      const result = await expeditionManager.sendExpeditionsByType({
        accountId,
        accessToken: token,
        expeditionTypes: types,
        maxExpeditionsToSend: amount,
      });

      // Notification for expedition sends
      if (result.success && result.sent && result.sent > 0) {
        const accsData = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
        const acc = accsData.accounts.find((a) => a.accountId === accountId);
        const name = acc?.displayName || accountId.slice(0, 8);
        notificationManager.push('expeditions', 'Expeditions Sent', `${name} — sent ${result.sent} expedition(s)`);
      }

      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('expeditions:collect', async (_e, accountId: string, expeditionIds?: string[]) => {
    try {
      const token = await refreshAccountToken(storage, accountId);
      if (!token) return { success: false, error: 'Failed to refresh token' };

      const campaignResult = await getCampaignData({ accountId, accessToken: token, forceRefresh: true });
      if (campaignResult.success) {
        await expeditionManager.claimCollectedResources({ accountId, accessToken: token, campaignData: campaignResult.data });
      }

      const result = await expeditionManager.collectExpeditions({
        accountId,
        accessToken: token,
        expeditionIds,
      });

      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('expeditions:abandon', async (_e, accountId: string, expeditionIds: string[]) => {
    try {
      const token = await refreshAccountToken(storage, accountId);
      if (!token) return { success: false, error: 'Failed to refresh token' };

      const result = await expeditionManager.abandonExpeditions({
        accountId,
        accessToken: token,
        expeditionIds,
      });

      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Quests (STW Dailies) ──────────────────────────────────
  ipcMain.handle('quests:get-all', async (_e, lang?: string) => {
    return quests.getQuests(storage, lang ?? 'es');
  });

  ipcMain.handle('quests:reroll', async (_e, questId: string) => {
    return quests.rerollQuest(storage, questId);
  });

  // ── Locker Management ──────────────────────────────────────
  ipcMain.handle('lockermgmt:get-loadout', async () => {
    return lockerMgr.getCurrentLoadout(storage);
  });

  ipcMain.handle('lockermgmt:get-owned', async () => {
    return lockerMgr.getOwnedCosmetics(storage);
  });

  ipcMain.handle('lockermgmt:get-owned-for-slot', async (_e, slotKey: string) => {
    const owned = await lockerMgr.getOwnedCosmetics(storage);
    const filtered = lockerMgr.filterOwnedForSlot(owned, slotKey);
    return lockerMgr.resolveMetadata(filtered);
  });

  ipcMain.handle('lockermgmt:resolve-items', async (_e, itemIds: string[]) => {
    const results: Record<string, any> = {};
    for (const id of itemIds) {
      results[id] = await lockerMgr.resolveSingleItem(id);
    }
    return results;
  });

  ipcMain.handle('lockermgmt:equip', async (_e, slotKey: string, itemId: string) => {
    return lockerMgr.equipItem(storage, slotKey, itemId);
  });

  ipcMain.handle('lockermgmt:get-categories', () => {
    return lockerMgr.SLOT_CATEGORIES;
  });

  // ── AutoDaily ──────────────────────────────────────────────
  ipcMain.handle('autodaily:get-full-status', () => {
    return autodaily.getAutoDailyFullStatus(storage);
  });

  ipcMain.handle('autodaily:toggle', (_e, accountId: string, active: boolean) => {
    return autodaily.toggleAutoDaily(storage, accountId, active);
  });

  ipcMain.handle('autodaily:run-now', () => {
    return autodaily.runAutoDailyNow(storage);
  });

  // ── AutoResponder ──────────────────────────────────────────
  ipcMain.handle('autoresponder:get-full-status', () => {
    return autoresponder.getFullStatus(storage);
  });

  ipcMain.handle('autoresponder:set-enabled', (_e, enabled: boolean) => {
    return autoresponder.setEnabled(storage, enabled);
  });

  ipcMain.handle('autoresponder:add-rule', (_e, rule: any) => {
    return autoresponder.addRule(storage, rule);
  });

  ipcMain.handle('autoresponder:update-rule', (_e, ruleId: string, partial: any) => {
    return autoresponder.updateRule(storage, ruleId, partial);
  });

  ipcMain.handle('autoresponder:delete-rule', (_e, ruleId: string) => {
    return autoresponder.deleteRule(storage, ruleId);
  });

  ipcMain.handle('autoresponder:toggle-rule', (_e, ruleId: string, enabled: boolean) => {
    return autoresponder.toggleRule(storage, ruleId, enabled);
  });

  ipcMain.handle('autoresponder:clear-logs', () => {
    return autoresponder.clearTraffic();
  });

  ipcMain.handle('autoresponder:test-pattern', (_e, match: string, pattern: string, testUrl: string) => {
    return autoresponder.testPattern(storage, match as any, pattern, testUrl);
  });

  ipcMain.handle('autoresponder:browse-file', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return autoresponder.browseFile(win);
  });

  ipcMain.handle('autoresponder:get-traffic', () => {
    return autoresponder.getTraffic();
  });

  ipcMain.handle('autoresponder:get-traffic-entry', (_e, entryId: number) => {
    return autoresponder.getTrafficEntry(entryId);
  });

  ipcMain.handle('autoresponder:clear-traffic', () => {
    return autoresponder.clearTraffic();
  });

  ipcMain.handle('autoresponder:install-cert', () => {
    return autoresponder.installCert();
  });

  ipcMain.handle('autoresponder:get-proxy-status', () => {
    return autoresponder.getProxyStatus();
  });

  // Init shop refresh timer
  shop.initShopRefreshTimer(storage);

  // Init auto-expeditions interval
  autoExp.startAutoExpeditionsInterval(storage);

  // Init auto-daily scheduler
  autodaily.startAutoDailyScheduler(storage);

  // Init AutoResponder (load saved rules)
  autoresponder.initialize(storage);

  // ── Discord RPC ───────────────────────────────────────────
  const { discordRpc } = require('./managers/discord/DiscordRpcManager');

  ipcMain.handle('discord-rpc:set-page', (_e, pageId: string) => {
    discordRpc.setPage(pageId);
  });

  ipcMain.handle('discord-rpc:set-detail', (_e, detail: string | null) => {
    discordRpc.setDetail(detail);
  });

  ipcMain.handle('discord-rpc:set-enabled', async (_e, enabled: boolean) => {
    await discordRpc.setEnabled(enabled);
  });

  ipcMain.handle('discord-rpc:get-status', () => {
    return { connected: discordRpc.isConnected(), enabled: discordRpc.isEnabled() };
  });

  // ── Notifications ────────────────────────────────────────
  ipcMain.handle('notifications:get-all', () => {
    return notificationManager.getAll();
  });

  ipcMain.handle('notifications:get-unread-count', () => {
    return notificationManager.getUnreadCount();
  });

  ipcMain.handle('notifications:mark-read', (_e, id: string) => {
    notificationManager.markRead(id);
  });

  ipcMain.handle('notifications:mark-all-read', () => {
    notificationManager.markAllRead();
  });

  ipcMain.handle('notifications:clear-all', () => {
    notificationManager.clearAll();
  });

  ipcMain.handle('notifications:delete', (_e, id: string) => {
    notificationManager.delete(id);
  });

  ipcMain.handle('notifications:get-settings', () => {
    return notificationManager.getSettings();
  });

  ipcMain.handle('notifications:update-settings', async (_e, partial: any) => {
    return notificationManager.updateSettings(partial);
  });

  // ── Llamas ───────────────────────────────────────────────
  ipcMain.handle('llamas:get', async (_e, accountId: string) => {
    try {
      const token = await refreshAccountToken(storage, accountId);
      if (!token) return { success: false, error: 'Failed to refresh token' };

      const campaignResult = await getCampaignData({ accountId, accessToken: token, forceRefresh: true });
      if (!campaignResult.success) return { success: false, error: campaignResult.error };

      const items = campaignResult.data?.items || {};
      const llamaList: { templateId: string; name: string; quantity: number; itemIds: string[]; type: 'voucher' | 'cardpack' }[] = [];

      // 1. Scan for voucher-based llamas (AccountResource:voucher_basicpack, voucher_cardpack_*)
      for (const [guid, item] of Object.entries(items) as [string, any][]) {
        const tpl: string = item.templateId || '';
        if (!tpl.startsWith('AccountResource:voucher_')) continue;
        const voucherKey = tpl.replace('AccountResource:', '');
        // Only llama vouchers: voucher_basicpack* or voucher_cardpack_*
        if (!/^voucher_(basicpack|cardpack_)/.test(voucherKey)) continue;
        const qty = item.quantity || 0;
        if (qty <= 0) continue;

        const guiaName = (guia as Record<string, string>)[tpl];
        // Clean display name: remove " Token" suffix if present
        let displayName = guiaName || voucherKey.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        displayName = displayName.replace(/\s+Token$/i, '');

        llamaList.push({
          templateId: tpl,
          name: displayName,
          quantity: qty,
          itemIds: [guid],
          type: 'voucher',
        });
      }

      // 2. Scan for actual CardPack items in inventory
      const cardpackMap = new Map<string, (typeof llamaList)[0]>();
      for (const [guid, item] of Object.entries(items) as [string, any][]) {
        const tpl: string = item.templateId || '';
        if (!tpl.startsWith('CardPack:')) continue;
        if (tpl.includes('_choice_') || tpl.includes('choice')) continue;

        const existing = cardpackMap.get(tpl);
        if (existing) {
          existing.quantity += (item.quantity || 1);
          existing.itemIds.push(guid);
        } else {
          const guiaName = (guia as Record<string, string>)[tpl];
          const key = tpl.replace('CardPack:', '');
          cardpackMap.set(tpl, {
            templateId: tpl,
            name: guiaName || key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            quantity: item.quantity || 1,
            itemIds: [guid],
            type: 'cardpack',
          });
        }
      }
      llamaList.push(...cardpackMap.values());

      llamaList.sort((a, b) => b.quantity - a.quantity);
      return { success: true, llamas: llamaList };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('llamas:open', async (_e, accountId: string, templateId: string, type: string, count: number, itemIds: string[]) => {
    // Helper to send log entries to the renderer + console
    function sendLlamaLog(level: 'info' | 'success' | 'error' | 'warn', account: string, msg: string): void {
      console.log(`[LLAMAS][${level.toUpperCase()}] ${account} — ${msg}`);
      try {
        const entry = { level, account, message: msg, timestamp: Date.now() };
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('llamas:log', entry);
        }
      } catch {}
    }

    try {
      const accsData = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
      const acc = accsData.accounts.find((a) => a.accountId === accountId);
      const displayName = acc?.displayName || accountId.slice(0, 8);

      console.log(`[LLAMAS] open called — account=${displayName}, tpl=${templateId}, type=${type}, count=${count}, ids=${JSON.stringify(itemIds)}`);

      const token = await refreshAccountToken(storage, accountId);
      if (!token) {
        sendLlamaLog('error', displayName, 'Failed to refresh token');
        return { success: false, error: 'Failed to refresh token' };
      }

      const { composeMCP } = await import('./utils/mcp');
      let opened = 0;

      // ── CardPack items: OpenCardPackBatch directly ──
      if (type === 'cardpack' && itemIds && itemIds.length > 0) {
        const ids = itemIds.slice(0, count);
        const BATCH = 10;
        const totalBatches = Math.ceil(ids.length / BATCH);
        sendLlamaLog('info', displayName, `Opening ${ids.length} card pack(s) in ${totalBatches} batch(es)…`);

        for (let i = 0; i < ids.length; i += BATCH) {
          const batch = ids.slice(i, i + BATCH);
          const batchNum = Math.floor(i / BATCH) + 1;
          try {
            sendLlamaLog('info', displayName, `Batch ${batchNum}/${totalBatches} — ${batch.length} pack(s)…`);
            await composeMCP({
              profile: 'campaign',
              operation: 'OpenCardPackBatch',
              accountId,
              accessToken: token,
              body: { cardPackItemIds: batch },
            });
            opened += batch.length;
            sendLlamaLog('success', displayName, `Batch ${batchNum}/${totalBatches} — opened ${batch.length}`);
          } catch (batchErr: any) {
            const msg = batchErr?.response?.data?.errorMessage || batchErr.message || 'Batch failed';
            sendLlamaLog('error', displayName, `Batch ${batchNum}/${totalBatches} failed: ${msg}`);
            if (opened > 0) break;
            return { success: false, error: msg };
          }
        }
      }

      // ── Voucher items: PopulatePrerolledOffers → catalog → PurchaseCatalogEntry ──
      else if (type === 'voucher') {
        sendLlamaLog('info', displayName, `Refreshing llama offers (PopulatePrerolledOffers)…`);
        await composeMCP({
          profile: 'campaign',
          operation: 'PopulatePrerolledOffers',
          accountId,
          accessToken: token,
        });

        sendLlamaLog('info', displayName, `Fetching catalog…`);
        const catalogRes = await axios.get(Endpoints.BR_STORE, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15_000,
        });

        // Find the offer that costs this voucher templateId
        const storefronts = catalogRes.data?.storefronts || [];
        let matchingOffer: any = null;
        for (const sf of storefronts) {
          for (const entry of (sf.catalogEntries || [])) {
            const prices = entry.prices || [];
            if (prices.some((p: any) => p.currencySubType === templateId)) {
              matchingOffer = entry;
              break;
            }
          }
          if (matchingOffer) break;
        }

        if (!matchingOffer) {
          sendLlamaLog('error', displayName, `No catalog offer found for ${templateId}`);
          console.log('[LLAMAS] Catalog storefronts:', JSON.stringify(storefronts.map((sf: any) => ({
            name: sf.name,
            entries: (sf.catalogEntries || []).map((e: any) => ({ offerId: e.offerId, prices: e.prices })),
          })), null, 2));
          return { success: false, error: 'No matching llama offer found in catalog' };
        }

        const price = matchingOffer.prices.find((p: any) => p.currencySubType === templateId);
        if (!price) {
          sendLlamaLog('error', displayName, 'Price mismatch in catalog offer');
          return { success: false, error: 'Price mismatch in catalog offer' };
        }

        sendLlamaLog('info', displayName, `Found offer ${matchingOffer.offerId} — opening ${count} llama(s)…`);

        for (let i = 0; i < count; i++) {
          try {
            sendLlamaLog('info', displayName, `Purchasing ${i + 1}/${count}…`);
            await composeMCP({
              profile: 'common_core',
              operation: 'PurchaseCatalogEntry',
              accountId,
              accessToken: token,
              body: {
                offerId: matchingOffer.offerId,
                purchaseQuantity: 1,
                currency: price.currencyType,
                currencySubType: price.currencySubType,
                expectedTotalPrice: price.finalPrice,
                gameContext: '',
              },
            });
            opened++;
            sendLlamaLog('success', displayName, `Purchased ${i + 1}/${count}`);
          } catch (purchaseErr: any) {
            const msg = purchaseErr?.response?.data?.errorMessage || purchaseErr.message || 'Purchase failed';
            sendLlamaLog('error', displayName, `Failed at ${i + 1}/${count}: ${msg}`);
            if (opened > 0) break;
            return { success: false, error: msg };
          }
        }

        // After purchasing voucher llamas, new CardPack items appear in the profile.
        // Automatically open them with OpenCardPackBatch.
        if (opened > 0) {
          sendLlamaLog('info', displayName, `Purchased ${opened} — scanning for new card packs to open…`);
          const freshProfile = await getCampaignData({ accountId, accessToken: token, forceRefresh: true });
          if (freshProfile.success && freshProfile.data?.items) {
            const freshItems = freshProfile.data.items as Record<string, any>;
            const newCardPackIds: string[] = [];
            for (const [guid, item] of Object.entries(freshItems)) {
              const tpl: string = item.templateId || '';
              if (tpl.startsWith('CardPack:') && !tpl.includes('_choice_') && !tpl.includes('choice')) {
                newCardPackIds.push(guid);
              }
            }

            if (newCardPackIds.length > 0) {
              sendLlamaLog('info', displayName, `Found ${newCardPackIds.length} card pack(s) — opening…`);
              const BATCH = 10;
              const totalBatches = Math.ceil(newCardPackIds.length / BATCH);
              for (let i = 0; i < newCardPackIds.length; i += BATCH) {
                const batch = newCardPackIds.slice(i, i + BATCH);
                const batchNum = Math.floor(i / BATCH) + 1;
                try {
                  sendLlamaLog('info', displayName, `Opening pack batch ${batchNum}/${totalBatches} — ${batch.length} pack(s)…`);
                  await composeMCP({
                    profile: 'campaign',
                    operation: 'OpenCardPackBatch',
                    accountId,
                    accessToken: token,
                    body: { cardPackItemIds: batch },
                  });
                  sendLlamaLog('success', displayName, `Pack batch ${batchNum}/${totalBatches} — opened ${batch.length}`);
                } catch (openErr: any) {
                  const msg = openErr?.response?.data?.errorMessage || openErr.message || 'Open failed';
                  sendLlamaLog('error', displayName, `Pack batch ${batchNum}/${totalBatches} failed: ${msg}`);
                  break;
                }
              }
              sendLlamaLog('success', displayName, `All card packs opened`);
            } else {
              sendLlamaLog('info', displayName, `No new card packs found after purchase`);
            }
          }
        }
      } else {
        sendLlamaLog('error', displayName, `Unknown type: ${type}`);
        return { success: false, error: `Unknown llama type: ${type}` };
      }

      sendLlamaLog('success', displayName, `Done — opened ${opened} llama(s) total`);
      notificationManager.push('llamas', 'Llamas Opened', `${displayName} — opened ${opened} llama(s)`);

      return { success: true, opened };
    } catch (err: any) {
      console.error('[LLAMAS] Unexpected error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Memory Management ──────────────────────────────────────
  ipcMain.handle('memory:get-usage', async () => {
    const main = process.memoryUsage();
    return {
      heapUsed: main.heapUsed,
      heapTotal: main.heapTotal,
      rss: main.rss,
    };
  });

  ipcMain.handle('memory:cleanup', async () => {
    await performMemoryCleanup();
    return { success: true };
  });

  ipcMain.on('memory:restart-timer', () => {
    restartRamCleanup();
  });

  // ── FN Launch Settings ──────────────────────────────────
  ipcMain.handle('fnlaunch:get-game-settings', () => {
    return fnlaunch.getGameSettings(storage);
  });

  ipcMain.handle('fnlaunch:save-game-settings', (_e, partial: any) => {
    return fnlaunch.saveGameSettings(storage, partial);
  });

  ipcMain.handle('fnlaunch:get-launch-settings', () => {
    return fnlaunch.getLaunchSettings(storage);
  });

  ipcMain.handle('fnlaunch:save-launch-settings', (_e, settings: any) => {
    return fnlaunch.saveLaunchSettings(storage, settings);
  });

  // ── Library ──────────────────────────────────────────────
  ipcMain.handle('library:get-games', () => {
    return library.getLibrary(storage);
  });

  ipcMain.handle('library:get-metadata', (_e, items: Array<{ namespace: string; catalogItemId: string }>) => {
    return library.getGameMetadata(storage, items);
  });

  ipcMain.handle('library:launch-game', (_e, namespace: string, catalogItemId: string, appName: string) => {
    return library.launchLibraryGame(namespace, catalogItemId, appName);
  });

  ipcMain.handle('library:toggle-favorite', (_e, appId: string) => {
    return library.toggleFavorite(storage, appId);
  });

  // ── Store ───────────────────────────────────────────────
  ipcMain.handle('store:get-free-games', () => {
    return store.getFreeGames();
  });

  // ── Themes ──────────────────────────────────────────────
  ipcMain.handle('theme:fetch-url', async (_e, url: string) => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: 'Only HTTP/HTTPS URLs are allowed' };
      }
      const resp = await axios.get(parsed.href, {
        timeout: 15000,
        maxContentLength: 2 * 1024 * 1024,
        responseType: 'text',
        headers: { 'Accept': 'text/css, application/json, text/plain, */*' },
      });
      return { success: true, data: String(resp.data) };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to fetch URL' };
    }
  });

  ipcMain.handle('dialog:save-file', async (e, options?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showSaveDialog(win!, {
      title: options?.title || 'Save file',
      defaultPath: options?.defaultPath,
      filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('theme:write-file', async (_e, filePath: string, content: string) => {
    await fs.promises.writeFile(filePath, content, 'utf8');
    return { success: true };
  });

  ipcMain.handle('theme:read-file', async (_e, filePath: string) => {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return content;
  });

  // ── Updater ──────────────────────────────────────────────────

  ipcMain.handle('updater:check', async () => {
    return updater.checkForUpdate();
  });

  ipcMain.handle('updater:download-install', async (_e, url: string, filename: string) => {
    return updater.downloadAndInstall(url, filename, _e.sender);
  });

  ipcMain.handle('updater:open-releases', async () => {
    updater.openReleasePage();
  });

  ipcMain.handle('updater:open-repo', async () => {
    updater.openRepoPage();
  });
}
