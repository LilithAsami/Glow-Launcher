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
  settings: {
    notifyTrayChanged: (enabled: boolean) => ipcRenderer.send('settings:tray-changed', enabled),
    notifyStartupChanged: (enabled: boolean) => ipcRenderer.send('settings:startup-changed', enabled),
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
    reorder: (orderedIds: string[]) => ipcRenderer.invoke('accounts:reorder', orderedIds),
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
    generate: (filters: { types: string[]; rarities: string[]; chapters: string[]; exclusive: boolean; equippedItemIds?: string[] }) =>
      ipcRenderer.invoke('locker:generate', filters),
    save: (sourcePath: string) =>
      ipcRenderer.invoke('locker:save', sourcePath),
  },
  lockermgmt: {
    getLoadout: () => ipcRenderer.invoke('lockermgmt:get-loadout'),
    getOwned: () => ipcRenderer.invoke('lockermgmt:get-owned'),
    getOwnedForSlot: (slotKey: string) => ipcRenderer.invoke('lockermgmt:get-owned-for-slot', slotKey),
    resolveItems: (itemIds: string[]) => ipcRenderer.invoke('lockermgmt:resolve-items', itemIds),
    equip: (slotKey: string, itemId: string) => ipcRenderer.invoke('lockermgmt:equip', slotKey, itemId),
    getCategories: () => ipcRenderer.invoke('lockermgmt:get-categories'),
  },
  files: {
    getWorldInfo: () => ipcRenderer.invoke('files:get-worldinfo'),
    workerPower: (targetLevel: number) => ipcRenderer.invoke('files:worker-power', targetLevel),
    save: (jsonString: string, defaultName: string) =>
      ipcRenderer.invoke('files:save', jsonString, defaultName),
    devBuildStatus: () => ipcRenderer.invoke('files:devbuild-status'),
    devBuildToggle: () => ipcRenderer.invoke('files:devbuild-toggle'),
    devStairsStatus: () => ipcRenderer.invoke('files:devstairs-status'),
    devStairsToggle: () => ipcRenderer.invoke('files:devstairs-toggle'),
    airStrikeStatus: () => ipcRenderer.invoke('files:airstrike-status'),
    airStrikeToggle: () => ipcRenderer.invoke('files:airstrike-toggle'),
    trapHeightList: () => ipcRenderer.invoke('files:trapheight-list'),
    trapHeightPresets: () => ipcRenderer.invoke('files:trapheight-presets'),
    trapHeightStatus: (guid: string) => ipcRenderer.invoke('files:trapheight-status', guid),
    trapHeightApply: (guid: string, newHeight: string) => ipcRenderer.invoke('files:trapheight-apply', guid, newHeight),
    trapHeightRevert: (guid: string) => ipcRenderer.invoke('files:trapheight-revert', guid),
    trapHeightRevertAll: () => ipcRenderer.invoke('files:trapheight-revert-all'),
    trapHeightModifiedCount: () => ipcRenderer.invoke('files:trapheight-modified-count'),
    trapHeightModifiedTraps: () => ipcRenderer.invoke('files:trapheight-modified-traps'),
    trapHeightFamilyInfo: () => ipcRenderer.invoke('files:trapheight-family-info'),
    trapHeightData: () => ipcRenderer.invoke('files:trapheight-height-data'),
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
  outpost: {
    getInfo: () => ipcRenderer.invoke('outpost:info'),
    getBaseData: (saveFile: string) => ipcRenderer.invoke('outpost:base-data', saveFile),
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
    getOwned: () => ipcRenderer.invoke('shop:get-owned'),
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
  accountMgmt: {
    getInfo: () => ipcRenderer.invoke('accountmgmt:get-info'),
    updateField: (field: string, value: string) => ipcRenderer.invoke('accountmgmt:update-field', field, value),
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
  expeditions: {
    getStatus: () => ipcRenderer.invoke('expeditions:get-status'),
    toggle: (accountId: string, active: boolean, rewardTypes?: string[]) =>
      ipcRenderer.invoke('expeditions:toggle', accountId, active, rewardTypes),
    updateConfig: (accountId: string, partial: any) =>
      ipcRenderer.invoke('expeditions:update-config', accountId, partial),
    runCycle: (accountId: string) => ipcRenderer.invoke('expeditions:run-cycle', accountId),
    list: (accountId: string) => ipcRenderer.invoke('expeditions:list', accountId),
    send: (accountId: string, types: string[], amount: number) =>
      ipcRenderer.invoke('expeditions:send', accountId, types, amount),
    collect: (accountId: string, expeditionIds?: string[]) =>
      ipcRenderer.invoke('expeditions:collect', accountId, expeditionIds),
    abandon: (accountId: string, expeditionIds: string[]) =>
      ipcRenderer.invoke('expeditions:abandon', accountId, expeditionIds),
    onLog: (cb: (entry: any) => void) => {
      ipcRenderer.removeAllListeners('expeditions:log');
      ipcRenderer.on('expeditions:log', (_e, entry) => cb(entry));
    },
    offLog: () => { ipcRenderer.removeAllListeners('expeditions:log'); },
    onDataChanged: (cb: () => void) => {
      ipcRenderer.removeAllListeners('expeditions:data-changed');
      ipcRenderer.on('expeditions:data-changed', () => cb());
    },
    offDataChanged: () => { ipcRenderer.removeAllListeners('expeditions:data-changed'); },
  },
  quests: {
    getAll: (lang?: string) => ipcRenderer.invoke('quests:get-all', lang),
    reroll: (questId: string) => ipcRenderer.invoke('quests:reroll', questId),
  },
  autodaily: {
    getFullStatus: () => ipcRenderer.invoke('autodaily:get-full-status'),
    toggle: (accountId: string, active: boolean) => ipcRenderer.invoke('autodaily:toggle', accountId, active),
    runNow: () => ipcRenderer.invoke('autodaily:run-now'),
    onLog: (cb: (entry: any) => void) => {
      ipcRenderer.removeAllListeners('autodaily:log');
      ipcRenderer.on('autodaily:log', (_e, entry) => cb(entry));
    },
    offLog: () => { ipcRenderer.removeAllListeners('autodaily:log'); },
    onDataChanged: (cb: () => void) => {
      ipcRenderer.removeAllListeners('autodaily:data-changed');
      ipcRenderer.on('autodaily:data-changed', () => cb());
    },
    offDataChanged: () => { ipcRenderer.removeAllListeners('autodaily:data-changed'); },
  },
  autoresponder: {
    getFullStatus: () => ipcRenderer.invoke('autoresponder:get-full-status'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('autoresponder:set-enabled', enabled),
    addRule: (rule: any) => ipcRenderer.invoke('autoresponder:add-rule', rule),
    updateRule: (ruleId: string, partial: any) => ipcRenderer.invoke('autoresponder:update-rule', ruleId, partial),
    deleteRule: (ruleId: string) => ipcRenderer.invoke('autoresponder:delete-rule', ruleId),
    toggleRule: (ruleId: string, enabled: boolean) => ipcRenderer.invoke('autoresponder:toggle-rule', ruleId, enabled),
    clearLogs: () => ipcRenderer.invoke('autoresponder:clear-logs'),
    testPattern: (match: string, pattern: string, testUrl: string) => ipcRenderer.invoke('autoresponder:test-pattern', match, pattern, testUrl),
    browseFile: () => ipcRenderer.invoke('autoresponder:browse-file'),
    getTraffic: () => ipcRenderer.invoke('autoresponder:get-traffic'),
    getTrafficEntry: (entryId: number) => ipcRenderer.invoke('autoresponder:get-traffic-entry', entryId),
    clearTraffic: () => ipcRenderer.invoke('autoresponder:clear-traffic'),
    installCert: () => ipcRenderer.invoke('autoresponder:install-cert'),
    getProxyStatus: () => ipcRenderer.invoke('autoresponder:get-proxy-status'),
    onTraffic: (cb: (msg: any) => void) => {
      ipcRenderer.removeAllListeners('autoresponder:traffic');
      ipcRenderer.on('autoresponder:traffic', (_e, msg) => cb(msg));
    },
    offTraffic: () => { ipcRenderer.removeAllListeners('autoresponder:traffic'); },
  },
  discordRpc: {
    setPage: (pageId: string) => ipcRenderer.invoke('discord-rpc:set-page', pageId),
    setDetail: (detail: string | null) => ipcRenderer.invoke('discord-rpc:set-detail', detail),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('discord-rpc:set-enabled', enabled),
    getStatus: () => ipcRenderer.invoke('discord-rpc:get-status') as Promise<{ connected: boolean; enabled: boolean }>,
    onStatus: (cb: (data: { connected: boolean; enabled: boolean }) => void) => {
      ipcRenderer.removeAllListeners('discord-rpc:status');
      ipcRenderer.on('discord-rpc:status', (_e, data) => cb(data));
    },
    offStatus: () => { ipcRenderer.removeAllListeners('discord-rpc:status'); },
  },
});
