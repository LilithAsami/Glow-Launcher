import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload — exposes a safe API to the renderer via window.glowAPI
 */
contextBridge.exposeInMainWorld('glowAPI', {
  storage: {
    get: (key: string) => ipcRenderer.invoke('storage:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('storage:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('storage:delete', key),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  accounts: {
    getAll: () => ipcRenderer.invoke('accounts:get-all'),
    acceptTos: () => ipcRenderer.invoke('accounts:accept-tos'),
    startDeviceAuth: () => ipcRenderer.invoke('accounts:start-device-auth'),
    submitExchangeCode: (code: string) => ipcRenderer.invoke('accounts:submit-exchange', code),
    cancelAuth: () => ipcRenderer.invoke('accounts:cancel-auth'),
    remove: (accountId: string) => ipcRenderer.invoke('accounts:remove', accountId),
    setMain: (accountId: string) => ipcRenderer.invoke('accounts:set-main', accountId),
    getAvatar: (accountId: string) => ipcRenderer.invoke('accounts:get-avatar', accountId),
    getAvatarCached: (accountId: string) => ipcRenderer.invoke('accounts:get-avatar-cached', accountId),
    getAllAvatars: () => ipcRenderer.invoke('accounts:get-all-avatars'),
    onAuthUpdate: (callback: (data: any) => void) => {
      ipcRenderer.removeAllListeners('accounts:auth-update');
      ipcRenderer.on('accounts:auth-update', (_e, data) => callback(data));
    },
    offAuthUpdate: () => {
      ipcRenderer.removeAllListeners('accounts:auth-update');
    },
    onDataChanged: (callback: () => void) => {
      ipcRenderer.on('accounts:data-changed', () => callback());
    },
  },
  autokick: {
    getFullStatus: () => ipcRenderer.invoke('autokick:get-full-status'),
    toggle: (accountId: string, active: boolean) => ipcRenderer.invoke('autokick:toggle', accountId, active),
    updateConfig: (accountId: string, partial: any) => ipcRenderer.invoke('autokick:update-config', accountId, partial),
    onStatusUpdate: (cb: (data: any) => void) => {
      ipcRenderer.removeAllListeners('autokick:status-update');
      ipcRenderer.on('autokick:status-update', (_e, data) => cb(data));
    },
    offStatusUpdate: () => { ipcRenderer.removeAllListeners('autokick:status-update'); },
    onDataChanged: (cb: () => void) => {
      ipcRenderer.removeAllListeners('autokick:data-changed');
      ipcRenderer.on('autokick:data-changed', () => cb());
    },
    offDataChanged: () => { ipcRenderer.removeAllListeners('autokick:data-changed'); },
    onLog: (cb: (entry: any) => void) => {
      ipcRenderer.removeAllListeners('autokick:log');
      ipcRenderer.on('autokick:log', (_e, entry) => cb(entry));
    },
    offLog: () => { ipcRenderer.removeAllListeners('autokick:log'); },
  },
  security: {
    getAccountInfo: () => ipcRenderer.invoke('security:get-account-info'),
    getDeviceAuths: () => ipcRenderer.invoke('security:get-device-auths'),
    deleteDeviceAuth: (deviceId: string) => ipcRenderer.invoke('security:delete-device-auth', deviceId),
    deleteAllDeviceAuths: () => ipcRenderer.invoke('security:delete-all-device-auths'),
    checkBan: () => ipcRenderer.invoke('security:check-ban'),
    getExchangeUrl: () => ipcRenderer.invoke('security:get-exchange-url'),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  },
  launch: {
    start: () => ipcRenderer.invoke('launch:start'),
    onStatus: (cb: (data: any) => void) => {
      ipcRenderer.removeAllListeners('launch:status');
      ipcRenderer.on('launch:status', (_e, data) => cb(data));
    },
    offStatus: () => { ipcRenderer.removeAllListeners('launch:status'); },
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  },
  alerts: {
    getMissions: () => ipcRenderer.invoke('alerts:get-missions'),
    getMissionsForce: () => ipcRenderer.invoke('alerts:get-missions-force'),
  },
  locker: {
    generate: (filters: { types: string[]; rarities: string[]; chapters: string[]; exclusive: boolean }) =>
      ipcRenderer.invoke('locker:generate', filters),
    save: (sourcePath: string) =>
      ipcRenderer.invoke('locker:save', sourcePath),
  },
  files: {
    getWorldInfo: () => ipcRenderer.invoke('files:get-worldinfo'),
    save: (jsonString: string, defaultName: string) =>
      ipcRenderer.invoke('files:save', jsonString, defaultName),
    devBuildStatus: () => ipcRenderer.invoke('files:devbuild-status'),
    devBuildToggle: () => ipcRenderer.invoke('files:devbuild-toggle'),
  },
  dupe: {
    execute: () => ipcRenderer.invoke('dupe:execute'),
    onStatus: (cb: (data: any) => void) => {
      ipcRenderer.removeAllListeners('dupe:status');
      ipcRenderer.on('dupe:status', (_e, data) => cb(data));
    },
    offStatus: () => { ipcRenderer.removeAllListeners('dupe:status'); },
  },
  vbucks: {
    getInfo: () => ipcRenderer.invoke('vbucks:get-info'),
  },
  epicStatus: {
    getAll: () => ipcRenderer.invoke('epicstatus:get-all'),
  },
  redeemCodes: {
    redeem: (code: string) => ipcRenderer.invoke('redeemcodes:redeem', code),
    getFriendCodes: () => ipcRenderer.invoke('redeemcodes:friend-codes'),
  },
  xpBoosts: {
    getProfile: () => ipcRenderer.invoke('xpboosts:get-profile'),
    consume: (type: 'personal' | 'teammate', amount: number, targetAccountId?: string) =>
      ipcRenderer.invoke('xpboosts:consume', type, amount, targetAccountId),
  },
  mcp: {
    execute: (operation: string, profileId: string) =>
      ipcRenderer.invoke('mcp:execute', operation, profileId),
  },
  stalk: {
    search: (searchTerm: string) =>
      ipcRenderer.invoke('stalk:search', searchTerm),
    matchmaking: (targetInput: string) =>
      ipcRenderer.invoke('stalk:matchmaking', targetInput),
  },
  party: {
    info: () => ipcRenderer.invoke('party:info'),
    leave: () => ipcRenderer.invoke('party:leave'),
    kick: (memberId: string) => ipcRenderer.invoke('party:kick', memberId),
    kickCollect: (force: boolean) => ipcRenderer.invoke('party:kick-collect', force),
    kickCollectExpulse: (force: boolean) => ipcRenderer.invoke('party:kick-collect-expulse', force),
    invite: (targetInput: string) => ipcRenderer.invoke('party:invite', targetInput),
    join: (targetInput: string) => ipcRenderer.invoke('party:join', targetInput),
    promote: (memberId: string) => ipcRenderer.invoke('party:promote', memberId),
    togglePrivacy: () => ipcRenderer.invoke('party:toggle-privacy'),
    fixInvite: () => ipcRenderer.invoke('party:fix-invite'),
    search: (searchTerm: string) => ipcRenderer.invoke('party:search', searchTerm),
  },
  eula: {
    acceptEula: () => ipcRenderer.invoke('eula:accept-eula'),
    acceptPrivacy: () => ipcRenderer.invoke('eula:accept-privacy'),
  },
  authPage: {
    getDeviceAuthInfo: () => ipcRenderer.invoke('authpage:device-auth-info'),
    generateAccessToken: () => ipcRenderer.invoke('authpage:access-token'),
    generateExchangeCode: () => ipcRenderer.invoke('authpage:exchange-code'),
    getContinuationToken: () => ipcRenderer.invoke('authpage:continuation-token'),
    verifyToken: (token: string) => ipcRenderer.invoke('authpage:verify-token', token),
  },
  status: {
    getAll: () => ipcRenderer.invoke('status:get-all'),
    activate: (accountId: string, mensaje: string, plataforma: string, presenceMode: string) =>
      ipcRenderer.invoke('status:activate', accountId, mensaje, plataforma, presenceMode),
    deactivate: (accountId: string) => ipcRenderer.invoke('status:deactivate', accountId),
    refresh: (accountId: string) => ipcRenderer.invoke('status:refresh', accountId),
    updateMessage: (accountId: string, mensaje: string) =>
      ipcRenderer.invoke('status:update-message', accountId, mensaje),
    getInfo: (accountId: string) => ipcRenderer.invoke('status:get-info', accountId),
    onConnectionUpdate: (cb: (data: any) => void) => {
      ipcRenderer.removeAllListeners('status:connection-update');
      ipcRenderer.on('status:connection-update', (_e, data) => cb(data));
    },
    offConnectionUpdate: () => { ipcRenderer.removeAllListeners('status:connection-update'); },
    onDataChanged: (cb: () => void) => {
      ipcRenderer.removeAllListeners('status:data-changed');
      ipcRenderer.on('status:data-changed', () => cb());
    },
    offDataChanged: () => { ipcRenderer.removeAllListeners('status:data-changed'); },
  },
  taxi: {
    getAll: () => ipcRenderer.invoke('taxi:get-all'),
    getAvatars: () => ipcRenderer.invoke('taxi:get-avatars'),
    activate: (accountId: string) => ipcRenderer.invoke('taxi:activate', accountId),
    deactivate: (accountId: string) => ipcRenderer.invoke('taxi:deactivate', accountId),
    updateConfig: (accountId: string, partial: any) => ipcRenderer.invoke('taxi:update-config', accountId, partial),
    acceptResponsibility: (accountId: string) => ipcRenderer.invoke('taxi:accept-responsibility', accountId),
    addWhitelist: (accountId: string, targetId: string, targetName: string) =>
      ipcRenderer.invoke('taxi:add-whitelist', accountId, targetId, targetName),
    removeWhitelist: (accountId: string, targetId: string) =>
      ipcRenderer.invoke('taxi:remove-whitelist', accountId, targetId),
    onStatusUpdate: (cb: (data: any) => void) => {
      ipcRenderer.removeAllListeners('taxi:status-update');
      ipcRenderer.on('taxi:status-update', (_e, data) => cb(data));
    },
    offStatusUpdate: () => { ipcRenderer.removeAllListeners('taxi:status-update'); },
    onLog: (cb: (entry: any) => void) => {
      ipcRenderer.removeAllListeners('taxi:log');
      ipcRenderer.on('taxi:log', (_e, entry) => cb(entry));
    },
    offLog: () => { ipcRenderer.removeAllListeners('taxi:log'); },
    onDataChanged: (cb: () => void) => {
      ipcRenderer.removeAllListeners('taxi:data-changed');
      ipcRenderer.on('taxi:data-changed', () => cb());
    },
    offDataChanged: () => { ipcRenderer.removeAllListeners('taxi:data-changed'); },
    onCooldown: (cb: (data: any) => void) => {
      ipcRenderer.removeAllListeners('taxi:cooldown');
      ipcRenderer.on('taxi:cooldown', (_e, data) => cb(data));
    },
    offCooldown: () => { ipcRenderer.removeAllListeners('taxi:cooldown'); },
  },
  shop: {
    getItems: () => ipcRenderer.invoke('shop:get-items'),
    buy: (offerId: string, expectedPrice: number) => ipcRenderer.invoke('shop:buy', offerId, expectedPrice),
    gift: (offerId: string, receiverAccountId: string, message: string, expectedPrice: number) =>
      ipcRenderer.invoke('shop:gift', offerId, receiverAccountId, message, expectedPrice),
    toggleGifts: (enable: boolean) => ipcRenderer.invoke('shop:toggle-gifts', enable),
    getFriends: () => ipcRenderer.invoke('shop:get-friends'),
    getVbucks: () => ipcRenderer.invoke('shop:get-vbucks'),
    onRotated: (cb: () => void) => {
      ipcRenderer.removeAllListeners('shop:rotated');
      ipcRenderer.on('shop:rotated', () => cb());
    },
    offRotated: () => { ipcRenderer.removeAllListeners('shop:rotated'); },
  },
  ghostequip: {
    setOutfit: (cosmeticId: string) => ipcRenderer.invoke('ghostequip:set-outfit', cosmeticId),
    setBackpack: (cosmeticId: string) => ipcRenderer.invoke('ghostequip:set-backpack', cosmeticId),
    setEmote: (cosmeticId: string) => ipcRenderer.invoke('ghostequip:set-emote', cosmeticId),
    setShoes: (cosmeticId: string) => ipcRenderer.invoke('ghostequip:set-shoes', cosmeticId),
    setBanner: (bannerId: string) => ipcRenderer.invoke('ghostequip:set-banner', bannerId),
    setCrowns: (amount: number) => ipcRenderer.invoke('ghostequip:set-crowns', amount),
    setLevel: (level: number) => ipcRenderer.invoke('ghostequip:set-level', level),
  },
  friends: {
    getSummary: () => ipcRenderer.invoke('friends:get-summary'),
    add: (input: string) => ipcRenderer.invoke('friends:add', input),
    remove: (friendId: string) => ipcRenderer.invoke('friends:remove', friendId),
    accept: (friendId: string) => ipcRenderer.invoke('friends:accept', friendId),
    reject: (friendId: string) => ipcRenderer.invoke('friends:reject', friendId),
    cancel: (friendId: string) => ipcRenderer.invoke('friends:cancel', friendId),
    block: (userId: string) => ipcRenderer.invoke('friends:block', userId),
    removeAll: () => ipcRenderer.invoke('friends:remove-all'),
    acceptAll: () => ipcRenderer.invoke('friends:accept-all'),
  },
});
