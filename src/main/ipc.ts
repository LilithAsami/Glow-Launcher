import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { Storage } from './storage';
import * as auth from './helpers/auth/auth';
import * as autokick from './events/autokick/monitor';
import * as security from './helpers/auth/security';
import * as alerts from './helpers/stw/alerts';
import * as worldinfo from './helpers/stw/worldinfo';
import * as mcp from './helpers/epic/mcp';
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
import { refreshAccountToken, authenticatedRequest } from './helpers/auth/tokenRefresh';
import { Endpoints } from './helpers/endpoints';
import { launchGame } from './helpers/cmd/launcher';
import * as devbuilds from './helpers/cmd/devbuilds';
import * as dupe from './helpers/cmd/dupe';
import * as vbucksInfo from './helpers/cmd/vbucks';
import * as epicstatus from './helpers/epic/epicstatus';
import * as redeemcodes from './helpers/cmd/redeemcodes';
import * as xpboosts from './helpers/cmd/xpboosts';
import * as shop from './managers/shop/ShopManager';
import type { AutoKickAccountConfig, AccountsData } from '../shared/types';

/**
 * Register all IPC handlers.
 * Add new channels here as the app grows.
 */
export function registerIpcHandlers(storage: Storage): void {
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

  ipcMain.handle('accounts:submit-exchange', (_e, code: string) => {
    auth.submitExchangeCode(storage, code).catch(() => {});
  });

  ipcMain.handle('accounts:cancel-auth', () => {
    auth.cancelAuth();
  });

  ipcMain.handle('accounts:remove', (_e, id: string) => {
    return auth.removeAccount(storage, id);
  });

  ipcMain.handle('accounts:set-main', (_e, id: string) => {
    return auth.setMainAccount(storage, id);
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

  ipcMain.handle('accounts:get-avatar', async (_e, accountId: string) => {
    const DEFAULT_AVATAR = 'https://fortnite-api.com/images/cosmetics/br/cid_890_athena_commando_f_choneheadhunter/variants/material/mat2.png';
    console.log(`[Avatar] Fetching avatar for account: ${accountId}`);

    try {
      // 1. Get token
      const token = await refreshAccountToken(storage, accountId);
      console.log(`[Avatar] Token obtained: ${token ? 'YES (' + token.substring(0, 20) + '...)' : 'NULL'}`);
      if (!token) {
        console.log('[Avatar] No token, returning default');
        return { success: true, url: DEFAULT_AVATAR };
      }

      // 2. Fetch avatar from Epic API (exactly like avatarHandler.ts)
      const avatarUrl = `${Endpoints.ACCOUNT_AVATAR}/fortnite/ids?accountIds=${accountId}`;
      console.log(`[Avatar] Requesting: ${avatarUrl}`);

      let avatarId: string | null = null;

      try {
        const response = await axios.get(avatarUrl, {
          headers: { Authorization: `bearer ${token}` },
          timeout: 8000,
        });

        console.log(`[Avatar] Response status: ${response.status}`);
        console.log(`[Avatar] Response data:`, JSON.stringify(response.data));

        if (Array.isArray(response.data) && response.data[0]?.avatarId) {
          avatarId = response.data[0].avatarId;
          console.log(`[Avatar] Got avatarId: ${avatarId}`);
        } else {
          console.log('[Avatar] No avatarId in response');
        }
      } catch (err: any) {
        if (err?.response?.status === 401) {
          console.log('[Avatar] Got 401, refreshing token and retrying...');
          const newToken = await refreshAccountToken(storage, accountId);
          if (newToken) {
            try {
              const retryRes = await axios.get(avatarUrl, {
                headers: { Authorization: `bearer ${newToken}` },
                timeout: 8000,
              });
              console.log(`[Avatar] Retry response status: ${retryRes.status}`);
              console.log(`[Avatar] Retry response data:`, JSON.stringify(retryRes.data));
              if (Array.isArray(retryRes.data) && retryRes.data[0]?.avatarId) {
                avatarId = retryRes.data[0].avatarId;
                console.log(`[Avatar] Retry got avatarId: ${avatarId}`);
              }
            } catch (retryErr: any) {
              console.error('[Avatar] Retry also failed:', retryErr?.response?.status, retryErr?.message);
            }
          } else {
            console.error('[Avatar] Token refresh returned null');
          }
        } else {
          console.error('[Avatar] Request error:', err?.response?.status, err?.code, err?.message);
        }
      }

      // 3. Build URL (exactly like avatarHandler.ts)
      let iconURL: string;
      if (avatarId && avatarId.includes(':')) {
        const idPart = avatarId.split(':')[1];
        iconURL = `https://fortnite-api.com/images/cosmetics/br/${idPart}/smallicon.png`;
        console.log(`[Avatar] Built avatar URL: ${iconURL}`);
      } else {
        iconURL = DEFAULT_AVATAR;
        console.log('[Avatar] Using default avatar');
      }

      avatarCache.set(accountId, iconURL);
      return { success: true, url: iconURL };
    } catch (err: any) {
      console.error('[Avatar] Unexpected error:', err?.message, err?.stack);
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
  ipcMain.handle('launch:start', () => {
    return launchGame(storage);
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

  // ── Alerts ─────────────────────────────────────────────────
  ipcMain.handle('alerts:get-missions', () => {
    return alerts.getMissions(storage);
  });

  ipcMain.handle('alerts:get-missions-force', () => {
    return alerts.getMissions(storage, true);
  });

  // ── Files ──────────────────────────────────────────────────
  ipcMain.handle('files:get-worldinfo', async () => {
    return worldinfo.getWorldInfo(storage);
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

  // ── Dupe ───────────────────────────────────────────────────
  ipcMain.handle('dupe:execute', async () => {
    return dupe.executeDupe(storage);
  });

  // ── V-Bucks Info ───────────────────────────────────────────
  ipcMain.handle('vbucks:get-info', async () => {
    return vbucksInfo.getVbucksInfo(storage);
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

  // ── MCP ────────────────────────────────────────────────────
  ipcMain.handle('mcp:execute', async (_e, operation: string, profileId: string) => {
    return mcp.executeMcp(storage, operation, profileId);
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

  ipcMain.handle('party:kick-collect', async (_e, force: boolean) => {
    try {
      return await party.kickCollect(storage, force);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to kick-collect' };
    }
  });

  ipcMain.handle('party:kick-collect-expulse', async (_e, force: boolean) => {
    try {
      return await party.kickCollectExpulse(storage, force);
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
  ipcMain.handle('locker:generate', async (_e, filters: { types: string[]; rarities: string[]; chapters: string[]; exclusive: boolean }) => {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a: any) => a.isMain) ?? raw.accounts[0];
    if (!main) throw new Error('No account found');

    // Get fresh token (auto-refreshes device auth)
    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) throw new Error('Failed to refresh token');

    const result = await generateLockerImage({
      accessToken: token,
      accountId: main.accountId,
      type: filters.types,
      displayName: main.displayName || main.accountId,
      filters: {
        types: filters.types,
        rarities: filters.rarities,
        chapters: filters.chapters,
        exclusive: filters.exclusive,
      },
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
            filters: {
              types: filters.types,
              rarities: filters.rarities,
              chapters: filters.chapters,
              exclusive: filters.exclusive,
            },
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

  // Init shop refresh timer
  shop.initShopRefreshTimer(storage);
}
