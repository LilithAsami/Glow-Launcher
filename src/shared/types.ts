// ============================================================
// Shared type definitions for GLOW Launcher
// ============================================================

/**
 * Defines a page/section in the launcher.
 *
 * To add a new page:
 *   1. Create a file in  src/renderer/pages/
 *   2. Export a PageDefinition
 *   3. Register it in  src/renderer/pages/registry.ts
 */
export interface PageDefinition {
  /** Unique identifier (kebab-case) */
  id: string;
  /** Display label shown in the sidebar */
  label: string;
  /** SVG icon string (18×18 recommended) */
  icon: string;
  /** Sort order — lower values appear first */
  order: number;
  /** Where to render in the sidebar. Default: 'top' */
  position?: 'top' | 'bottom';
  /** Called when the page becomes active */
  render: (container: HTMLElement) => void | Promise<void>;
  /** Called when navigating away from this page */
  cleanup?: () => void;
}

// ============================================================
// IPC / Preload API exposed to the renderer
// ============================================================

export interface StoredAccount {
  accountId: string;
  displayName: string;
  deviceId: string;
  secret: string;
  isMain: boolean;
  addedAt: number;
}

export interface AccountsData {
  tosAccepted: boolean;
  accounts: StoredAccount[];
}

export interface AuthUpdate {
  status: 'starting' | 'waiting' | 'processing' | 'success' | 'error';
  verificationUrl?: string;
  message?: string;
  account?: { accountId: string; displayName: string };
  isUpdate?: boolean;
}

// ============================================================
// AutoKick types
// ============================================================

export interface AutoKickAccountConfig {
  isActive: boolean;
  kickPartyMembers: boolean;
  collectRewards: boolean;
  autoLeave: boolean;
  transferMaterials: boolean;
  autoReinvite: boolean;
  autoJoin: boolean;
}

export interface AutoKickData {
  /** accountId → config */
  accounts: Record<string, AutoKickAccountConfig>;
}

export interface AutoKickStatus {
  accountId: string;
  displayName: string;
  connected: boolean;
  error?: string;
}

export interface AutoKickLogEntry {
  accountId: string;
  displayName: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
  rewards?: Record<string, { name: string; quantity: number }>;
}

// ============================================================
// Security types
// ============================================================

export interface SecurityAccountInfo {
  displayName: string;
  id: string;
  name: string | null;
  lastName: string | null;
  email: string | null;
  emailVerified: boolean;
  country: string | null;
  phoneNumber: string | null;
  company: string | null;
  preferredLanguage: string | null;
  lastLogin: string | null;
  lastDisplayNameChange: string | null;
  numberOfDisplayNameChanges: number;
  canUpdateDisplayName: boolean;
  tfaEnabled: boolean;
  minorVerified: boolean;
  failedLoginAttempts: number;
}

export interface SecurityDeviceAuth {
  deviceId: string;
  location: string;
  ipAddress: string;
  dateTime: string;
  userAgent: string;
}

export interface SecurityBanStatus {
  banned: boolean;
  allowedActions: string[];
}

export interface StalkMatchmakingResult {
  success: boolean;
  online?: boolean;
  isHomebase?: boolean;
  displayName?: string;
  accountId?: string;
  error?: string;
}

// ============================================================
// Party types
// ============================================================

export interface PartyMemberInfo {
  accountId: string;
  displayName: string;
  role: string;
  isLeader: boolean;
}

export interface PartyInfoResult {
  success: boolean;
  partyId?: string | null;
  size?: number;
  maxSize?: number;
  isPrivate?: boolean;
  members?: PartyMemberInfo[];
  error?: string;
}

export interface PartyActionResult {
  success: boolean;
  message?: string;
  error?: string;
  rewards?: Record<string, { name: string; quantity: number }>;
  kicked?: number;
}

// ============================================================
// Item Shop types
// ============================================================

export interface BundleSubItem {
  id: string;
  name: string;
  type: string;
  rarity: string;
  imageUrl: string;
  description: string;
}

export interface ShopItem {
  id: string;
  offerId: string;
  name: string;
  description: string;
  type: string;
  rarity: string;
  series: string | null;
  seriesColors: string[] | null;
  imageUrl: string;
  price: number;
  regularPrice: number;
  finalPrice: number;
  isBundle: boolean;
  bundleCount: number;
  giftable: boolean;
  sectionId: string;
  bundleItems: BundleSubItem[];
}

export interface ShopSection {
  name: string;
  items: ShopItem[];
}

export interface ShopResponse {
  success: boolean;
  sections: ShopSection[];
  totalItems: number;
  error?: string;
}

export interface ShopFriend {
  accountId: string;
  displayName: string;
}

export interface ShopActionResult {
  success: boolean;
  error?: string;
}

export interface GlowAPI {
  storage: {
    get: <T = unknown>(key: string) => Promise<T | null>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  settings: {
    notifyTrayChanged: (enabled: boolean) => void;
    notifyStartupChanged: (enabled: boolean) => void;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  accounts: {
    getAll: () => Promise<AccountsData>;
    acceptTos: () => Promise<void>;
    startDeviceAuth: () => Promise<void>;
    submitExchangeCode: (code: string) => Promise<void>;
    cancelAuth: () => Promise<void>;
    remove: (accountId: string) => Promise<AccountsData>;
    setMain: (accountId: string) => Promise<AccountsData>;
    reorder: (orderedIds: string[]) => Promise<AccountsData>;
    getAvatar: (accountId: string) => Promise<{ success: boolean; url: string }>;
    getAvatarCached: (accountId: string) => Promise<{ success: boolean; url: string }>;
    getAllAvatars: () => Promise<{ success: boolean; avatars: Record<string, string>; error?: string }>;
    onAuthUpdate: (callback: (data: AuthUpdate) => void) => void;
    offAuthUpdate: () => void;
    onDataChanged: (callback: () => void) => void;
  };
  autokick: {
    getFullStatus: () => Promise<{ data: AutoKickData; statuses: AutoKickStatus[] }>;
    toggle: (accountId: string, active: boolean) => Promise<AutoKickData>;
    updateConfig: (accountId: string, partial: Partial<AutoKickAccountConfig>) => Promise<AutoKickData>;
    onStatusUpdate: (cb: (statuses: AutoKickStatus[]) => void) => void;
    offStatusUpdate: () => void;
    onDataChanged: (cb: () => void) => void;
    offDataChanged: () => void;
    onLog: (cb: (entry: AutoKickLogEntry) => void) => void;
    offLog: () => void;
  };
  expeditions: {
    getStatus: () => Promise<{ success: boolean; data: any; accounts: any[] }>;
    toggle: (accountId: string, active: boolean, rewardTypes: string[]) => Promise<any>;
    updateConfig: (accountId: string, partial: Record<string, unknown>) => Promise<any>;
    runCycle: (accountId: string) => Promise<any>;
    list: (accountId: string) => Promise<{
      success: boolean;
      available?: any[];
      sent?: any[];
      completed?: any[];
      slots?: { used: number; max: number };
      error?: string;
    }>;
    send: (accountId: string, types: string[], amount: number) => Promise<any>;
    collect: (accountId: string, expeditionIds?: string[]) => Promise<any>;
    abandon: (accountId: string, expeditionIds: string[]) => Promise<any>;
    onLog: (cb: (entry: { accountId: string; displayName: string; type: 'info' | 'success' | 'error' | 'warn'; message: string; timestamp: number }) => void) => void;
    offLog: () => void;
    onDataChanged: (cb: () => void) => void;
    offDataChanged: () => void;
  };
  security: {
    getAccountInfo: () => Promise<SecurityAccountInfo>;
    getDeviceAuths: () => Promise<SecurityDeviceAuth[]>;
    deleteDeviceAuth: (deviceId: string) => Promise<{ success: boolean }>;
    deleteAllDeviceAuths: () => Promise<{ deleted: number; skipped: number }>;
    checkBan: () => Promise<SecurityBanStatus>;
    getExchangeUrl: () => Promise<string>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  launch: {
    start: () => Promise<{ success: boolean; message: string }>;
    onStatus: (cb: (data: { status: string; message: string }) => void) => void;
    offStatus: () => void;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
  };
  alerts: {
    getMissions: () => Promise<ZoneMissions[]>;
    getMissionsForce: () => Promise<ZoneMissions[]>;
  };
  locker: {
    generate: (filters: { types: string[]; rarities: string[]; chapters: string[]; exclusive: boolean; equippedItemIds?: string[] }) =>
      Promise<{ success: boolean; fileName?: string; path?: string; count?: number; time?: string; sizeMB?: string; error?: string }>;
    save: (sourcePath: string) => Promise<{ saved: boolean; path?: string }>;
  };
  lockermgmt: {
    getLoadout: () => Promise<{ slots: Record<string, LockerEquippedSlot>; displayName: string }>;
    getOwned: () => Promise<LockerOwnedCosmetic[]>;
    getOwnedForSlot: (slotKey: string) => Promise<LockerCosmeticMeta[]>;
    resolveItems: (itemIds: string[]) => Promise<Record<string, LockerResolvedItem | null>>;
    equip: (slotKey: string, itemId: string) => Promise<{ success: boolean; error?: string }>;
    getCategories: () => Promise<LockerSlotCategory[]>;
  };
  files: {
    getWorldInfo: () => Promise<{ success: boolean; data?: any; missions?: number; alerts?: number; theaters?: number; sizeMB?: string; error?: string }>;
    workerPower: (targetLevel: number) => Promise<{ success: boolean; data?: any; workerCount?: number; modified?: number; sizeMB?: string; error?: string }>;
    save: (jsonString: string, defaultName: string) => Promise<{ saved: boolean; path?: string }>;
    devBuildStatus: () => Promise<{ found: boolean; activated: boolean; filePath: string | null; error?: string }>;
    devBuildToggle: () => Promise<{ success: boolean; activated?: boolean; message: string }>;
    devStairsStatus: () => Promise<{ found: boolean; activated: boolean; filePath: string | null; error?: string }>;
    devStairsToggle: () => Promise<{ success: boolean; activated?: boolean; message: string }>;
    airStrikeStatus: () => Promise<{ found: boolean; activated: boolean; filePath: string | null; error?: string }>;
    airStrikeToggle: () => Promise<{ success: boolean; activated?: boolean; message: string }>;
    trapHeightList: () => Promise<{ name: string; guid: string; desc: string; defaultHeight: string; rarity: string; tier: string; family: string; heightSupported: boolean }[]>;
    trapHeightPresets: () => Promise<{ label: string; hex: string; group: string }[]>;
    trapHeightStatus: (guid: string) => Promise<{ found: boolean; isModified: boolean; currentHeight: string | null; error?: string }>;
    trapHeightApply: (guid: string, newHeight: string) => Promise<{ success: boolean; message: string; currentHeight?: string; isModified?: boolean }>;
    trapHeightRevert: (guid: string) => Promise<{ success: boolean; message: string }>;
    trapHeightRevertAll: () => Promise<{ success: boolean; message: string }>;
    trapHeightModifiedCount: () => Promise<number>;
    trapHeightModifiedTraps: () => Promise<{ guid: string; name: string; currentHeight: string; desc: string; rarity: string; tier: string }[]>;
    trapHeightFamilyInfo: () => Promise<Record<string, { key: string; category: string; defaultHeight: { hex: string; uu: number }; insideFloor: { hex: string; uu: number } | null; heightSupported: boolean; heightOffset: number }>>;
    trapHeightData: () => Promise<{ scale: { blocks: string; hex: string; uu: number }[]; named: { key: string; label: string; hex: string; uu: number }[] }>;
  };
  dupe: {
    execute: () => Promise<{ success: boolean; message: string }>;
    onStatus: (cb: (data: any) => void) => void;
    offStatus: () => void;
  };
  vbucks: {
    getInfo: () => Promise<{
      success: boolean;
      total: number;
      purchased: number;
      earned: number;
      complimentary: number;
      currentPlatform: string;
      giftsAllowed: boolean;
      giftsRemaining: number;
      creatorCode: string | null;
      creatorSetTime: string | null;
      sources: { amount: number; count: number; platform: string; type: string }[];
      displayName: string;
      error?: string;
    }>;
  };
  epicStatus: {
    getAll: () => Promise<{
      success: boolean;
      lightswitch: any;
      lightswitchError: string | null;
      overallStatus: string;
      overallIndicator: string;
      groups: { id: string; name: string; status: string; position: number; children: { id: string; name: string; status: string }[] }[];
      standalone: { id: string; name: string; status: string; position: number }[];
      incidents: {
        id: string; name: string; status: string; impact: string; shortlink: string;
        createdAt: string; updatedAt: string; resolvedAt: string | null;
        updates: { id: string; status: string; body: string; createdAt: string }[];
      }[];
      roadmap: { operational: number; degraded: number; partialOutage: number; majorOutage: number; maintenance: number; total: number };
      error?: string;
    }>;
  };
  redeemCodes: {
    redeem: (code: string) => Promise<{
      success: boolean;
      offerId?: string;
      accountId?: string;
      details?: { entitlementName: string; entitlementId: string; offerId: string; namespace: string }[];
      error?: string;
    }>;
    getFriendCodes: () => Promise<{
      success: boolean;
      epic: { codeId: string; codeType: string; dateCreated: string }[];
      xbox: { codeId: string; codeType: string; dateCreated: string }[];
      error?: string;
    }>;
  };
  xpBoosts: {
    getProfile: () => Promise<{
      success: boolean;
      personal: { itemId: string | null; quantity: number };
      teammate: { itemId: string | null; quantity: number };
      displayName: string;
      error?: string;
    }>;
    consume: (type: 'personal' | 'teammate', amount: number, targetAccountId?: string) => Promise<{
      success: boolean;
      consumed: number;
      failed: number;
      type: 'personal' | 'teammate';
      error?: string;
    }>;
  };
  mcp: {
    execute: (operation: string, profileId: string) =>
      Promise<{ success: boolean; data?: any; operation?: string; profileId?: string; error?: string }>;
  };
  outpost: {
    getInfo: () => Promise<{
      success: boolean;
      zones: {
        zoneId: string;
        zoneName: string;
        level: number;
        highestEnduranceWave: number;
        amplifierCount: number;
        editPermissions: { accountId: string; displayName: string }[];
        saveFile: string;
      }[];
      error?: string;
    }>;
    getBaseData: (saveFile: string) => Promise<{
      success: boolean;
      structures: { walls: number; floors: number; stairs: number; cones: number; total: number };
      traps: { displayName: string; iconFile: string; count: number }[];
      totalTraps: number;
      warning?: string;
      error?: string;
    }>;
  };
  stalk: {
    search: (searchTerm: string) =>
      Promise<{ success: boolean; results: { accountId: string; displayName: string; platform?: string }[]; error?: string }>;
    matchmaking: (targetInput: string) =>
      Promise<StalkMatchmakingResult>;
  };
  party: {
    info: () => Promise<PartyInfoResult>;
    leave: () => Promise<PartyActionResult>;
    kick: (memberId: string) => Promise<PartyActionResult>;
    kickCollect: (force: boolean) => Promise<PartyActionResult>;
    kickCollectExpulse: (force: boolean) => Promise<PartyActionResult>;
    invite: (targetInput: string) => Promise<PartyActionResult>;
    join: (targetInput: string) => Promise<PartyActionResult>;
    promote: (memberId: string) => Promise<PartyActionResult>;
    togglePrivacy: () => Promise<PartyActionResult>;
    fixInvite: () => Promise<PartyActionResult>;
    search: (searchTerm: string) =>
      Promise<{ success: boolean; results: { accountId: string; displayName: string; platform?: string }[]; error?: string }>;
  };
  eula: {
    acceptEula: () => Promise<{ success: boolean; message: string }>;
    acceptPrivacy: () => Promise<{ success: boolean; message: string }>;
  };
  status: {
    getAll: () => Promise<{
      success: boolean;
      statuses: StatusConnectionInfo[];
      error?: string;
    }>;
    activate: (accountId: string, mensaje: string, plataforma: string, presenceMode: string) =>
      Promise<{ success: boolean; displayName?: string; error?: string }>;
    deactivate: (accountId: string) => Promise<{ success: boolean; error?: string }>;
    refresh: (accountId: string) => Promise<{ success: boolean; error?: string }>;
    updateMessage: (accountId: string, mensaje: string) => Promise<{ success: boolean; error?: string }>;
    getInfo: (accountId: string) => Promise<{ success: boolean; info: StatusConnectionInfo | null; error?: string }>;
    onConnectionUpdate: (cb: (data: { accountId: string; displayName: string; connected: boolean; error?: string }) => void) => void;
    offConnectionUpdate: () => void;
    onDataChanged: (cb: () => void) => void;
    offDataChanged: () => void;
  };
  taxi: {
    getAll: () => Promise<{ success: boolean; statuses: TaxiAccountStatus[]; error?: string }>;
    getAvatars: () => Promise<{ success: boolean; avatars: Record<string, string>; error?: string }>;
    activate: (accountId: string) => Promise<{ success: boolean; error?: string }>;
    deactivate: (accountId: string) => Promise<{ success: boolean; error?: string }>;
    updateConfig: (accountId: string, partial: Partial<TaxiAccountConfig>) => Promise<{ success: boolean }>;
    acceptResponsibility: (accountId: string) => Promise<{ success: boolean }>;
    addWhitelist: (accountId: string, targetId: string, targetName: string) => Promise<{ success: boolean }>;
    removeWhitelist: (accountId: string, targetId: string) => Promise<{ success: boolean }>;
    onStatusUpdate: (cb: (data: { accountId: string; displayName: string; connected: boolean; error?: string }) => void) => void;
    offStatusUpdate: () => void;
    onLog: (cb: (entry: TaxiLogEntry) => void) => void;
    offLog: () => void;
    onDataChanged: (cb: () => void) => void;
    offDataChanged: () => void;
    onCooldown: (cb: (data: { accountId: string; displayName: string; cooldownUntil: number }) => void) => void;
    offCooldown: () => void;
  };
  authPage: {
    getDeviceAuthInfo: () => Promise<{
      success: boolean;
      accountId?: string;
      displayName?: string;
      deviceId?: string;
      secret?: string;
      error?: string;
    }>;
    generateAccessToken: () => Promise<{
      success: boolean;
      accessToken?: string;
      accountId?: string;
      displayName?: string;
      expiresAt?: string;
      tokenType?: string;
      clientId?: string;
      refreshToken?: string | null;
      refreshExpiresAt?: string | null;
      error?: string;
    }>;
    generateExchangeCode: () => Promise<{
      success: boolean;
      code?: string;
      expiresInSeconds?: number;
      error?: string;
    }>;
    getContinuationToken: () => Promise<{
      success: boolean;
      hasContinuation?: boolean;
      continuation?: string | null;
      correctiveAction?: string | null;
      message?: string;
      error?: string;
    }>;
    verifyToken: (token: string) => Promise<{
      success: boolean;
      token?: string;
      accountId?: string;
      clientId?: string;
      displayName?: string | null;
      expiresAt?: string;
      expiresIn?: number;
      tokenType?: string;
      app?: string | null;
      inAppId?: string | null;
      error?: string;
    }>;
  };
  shop: {
    getItems: () => Promise<ShopResponse>;
    buy: (offerId: string, expectedPrice: number) => Promise<ShopActionResult>;
    gift: (offerId: string, receiverAccountId: string, message: string, expectedPrice: number) => Promise<ShopActionResult>;
    toggleGifts: (enable: boolean) => Promise<ShopActionResult>;
    getFriends: () => Promise<{ success: boolean; friends: ShopFriend[]; error?: string }>;
    getVbucks: () => Promise<{ success: boolean; total: number; error?: string }>;
    getOwned: () => Promise<{ success: boolean; ownedIds: string[]; error?: string }>;
    onRotated: (cb: () => void) => void;
    offRotated: () => void;
  };
  accountMgmt: {
    getInfo: () => Promise<{
      success: boolean;
      info?: {
        displayName: string;
        email: string;
        emailVerified: boolean;
        name: string;
        lastName: string;
        preferredLanguage: string;
        phoneNumber: string;
        company: string;
        canUpdateDisplayName: boolean;
        lastDisplayNameChange: string | null;
        displayNameAvailableAt: string | null;
      };
      error?: string;
    }>;
    updateField: (field: string, value: string) => Promise<{
      success: boolean;
      info?: {
        displayName: string;
        email: string;
        emailVerified: boolean;
        name: string;
        lastName: string;
        preferredLanguage: string;
        phoneNumber: string;
        company: string;
        canUpdateDisplayName: boolean;
        lastDisplayNameChange: string | null;
        displayNameAvailableAt: string | null;
      };
      error?: string;
    }>;
  };
  ghostequip: {
    setOutfit: (cosmeticId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    setBackpack: (cosmeticId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    setEmote: (cosmeticId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    setShoes: (cosmeticId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    setBanner: (bannerId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    setCrowns: (amount: number) => Promise<{ success: boolean; message?: string; error?: string }>;
    setLevel: (level: number) => Promise<{ success: boolean; message?: string; error?: string }>;
  };
  friends: {
    getSummary: () => Promise<{
      success: boolean;
      friends: { accountId: string; displayName: string; created?: string; favorite?: boolean }[];
      incoming: { accountId: string; displayName: string; created?: string }[];
      outgoing: { accountId: string; displayName: string; created?: string }[];
      error?: string;
    }>;
    add: (input: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    remove: (friendId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    accept: (friendId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    reject: (friendId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    cancel: (friendId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    block: (userId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    removeAll: () => Promise<{ success: boolean; message?: string; removed: number; error?: string }>;
    acceptAll: () => Promise<{ success: boolean; message?: string; accepted: number; error?: string }>;
  };
  quests: {
    getAll: (lang?: string) => Promise<QuestsResult>;
    reroll: (questId: string) => Promise<{ success: boolean; error?: string }>;
  };
  autodaily: {
    getFullStatus: () => Promise<{ data: AutoDailyData; accounts: { accountId: string; displayName: string; isActive: boolean; lastCollected?: string }[] }>;
    toggle: (accountId: string, active: boolean) => Promise<AutoDailyData>;
    runNow: () => Promise<void>;
    onLog: (cb: (entry: AutoDailyLogEntry) => void) => void;
    offLog: () => void;
    onDataChanged: (cb: () => void) => void;
    offDataChanged: () => void;
  };
  autoresponder: {
    getFullStatus: () => Promise<{
      enabled: boolean;
      rules: AutoResponderRule[];
      interceptedCount: number;
    }>;
    setEnabled: (enabled: boolean) => Promise<{ enabled: boolean; port: number; error?: string }>;
    addRule: (rule: Omit<AutoResponderRule, 'id' | 'createdAt'>) => Promise<AutoResponderRule>;
    updateRule: (ruleId: string, partial: Partial<Omit<AutoResponderRule, 'id' | 'createdAt'>>) => Promise<AutoResponderRule | null>;
    deleteRule: (ruleId: string) => Promise<boolean>;
    toggleRule: (ruleId: string, enabled: boolean) => Promise<boolean>;
    clearLogs: () => Promise<void>;
    testPattern: (match: string, pattern: string, testUrl: string) => Promise<{ matches: boolean; error?: string }>;
    browseFile: () => Promise<string | null>;
    getTraffic: () => Promise<TrafficEntry[]>;
    getTrafficEntry: (entryId: number) => Promise<TrafficEntry | null>;
    clearTraffic: () => Promise<void>;
    installCert: () => Promise<{ success: boolean; message: string }>;
    getProxyStatus: () => Promise<{ running: boolean; port: number; certPath: string }>;
    onTraffic: (cb: (msg: { type: string; entry: TrafficEntry }) => void) => void;
    offTraffic: () => void;
  };
  discordRpc: {
    setPage: (pageId: string) => Promise<void>;
    setDetail: (detail: string | null) => Promise<void>;
    setEnabled: (enabled: boolean) => Promise<void>;
    getStatus: () => Promise<{ connected: boolean; enabled: boolean }>;
    onStatus: (cb: (data: { connected: boolean; enabled: boolean }) => void) => void;
    offStatus: () => void;
  };
}

// ============================================================
// AutoResponder types
// ============================================================

export interface AutoResponderRule {
  id: string;
  enabled: boolean;
  match: 'contains' | 'exact' | 'regex';
  pattern: string;
  statusCode: number;
  contentType: string;
  body: string;
  responseFile?: string;
  label: string;
  createdAt: number;
}

export interface TrafficEntry {
  id: number;
  url: string;
  method: string;
  host: string;
  protocol: string;
  resourceType: string;
  statusCode: number;
  contentType: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  intercepted: boolean;
  interceptedBy?: string;
  responseBody?: string;
  timestamp: number;
  completed: boolean;
  error?: string;
}

// ============================================================
// Quest types
// ============================================================

export interface QuestObjective {
  key: string;
  current: number;
  max: number | null;
}

export interface QuestInfo {
  itemId: string;
  templateId: string;
  questKey: string;
  category: 'Dailies' | 'Wargames' | 'Endurance' | 'Weekly Mythic' | 'Others';
  name: string;
  state: string;
  objectives: QuestObjective[];
  canReroll: boolean;
}

export interface QuestsResult {
  success: boolean;
  quests?: QuestInfo[];
  error?: string;
}

// ============================================================
// Locker Management types
// ============================================================

export interface LockerEquippedSlot {
  slotKey: string;
  itemId: string | null;
  customizations: any[];
  schema: string;
}

export interface LockerOwnedCosmetic {
  itemId: string;
  backendType: string;
  id: string;
}

export interface LockerCosmeticMeta {
  name: string;
  imageUrl: string | null;
  rarity: string;
  series: string | null;
  backendType: string;
  id: string;
  itemId: string;
  color?: string;
}

export interface LockerResolvedItem {
  name: string;
  imageUrl: string | null;
  rarity: string;
  series: string | null;
  color?: string;
}

export interface LockerSlotCategory {
  label: string;
  slots: string[];
}

// ============================================================
// AutoDaily types
// ============================================================

export interface AutoDailyAccountConfig {
  isActive: boolean;
  lastCollected?: string;
}

export interface AutoDailyData {
  accounts: Record<string, AutoDailyAccountConfig>;
}

export interface AutoDailyLogEntry {
  accountId: string;
  displayName: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

// ============================================================
// Taxi types
// ============================================================

export interface TaxiWhitelistEntry {
  accountId: string;
  displayName: string;
}

export interface TaxiAccountConfig {
  isActive: boolean;
  isPrivate: boolean;
  whitelist: TaxiWhitelistEntry[];
  statusLibre: string;
  statusOcupado: string;
  tiempoParaIrse: number;
  skin: string;
  emote: string;
  level: number;
  powerLevel: number;
  responsabilityAccepted: boolean;
  autoAcceptFriends: boolean;
}

export interface TaxiQueueEntry {
  accountId: string;
  displayName: string;
  partyId: string;
}

export interface TaxiLogEntry {
  accountId: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export interface TaxiAccountStatus {
  accountId: string;
  displayName: string;
  isConnected: boolean;
  isActive: boolean;
  isOccupied: boolean;
  queue: TaxiQueueEntry[];
  config: TaxiAccountConfig;
  error?: string;
}

// ============================================================
// Status types
// ============================================================

export interface StatusConnectionInfo {
  accountId: string;
  displayName: string;
  isConnected: boolean;
  isActive: boolean;
  isReconnecting: boolean;
  mensaje: string;
  plataforma: string;
  presenceMode: 'online' | 'away' | 'dnd';
  lastUpdate: number;
  retryCount: number;
  error?: string;
}

// ============================================================
// Alerts (STW Mission Alerts) types
// ============================================================

export interface AlertRewardItem {
  itemType: string;
  quantity: number;
  name: string;
  icon: string | null;
}

export interface AlertModifier {
  name: string;
  type: string;
  icon: string;
}

export interface ProcessedMission {
  id: string;
  theaterId: string;
  tileIndex: number;
  power: number;
  powerLabel: string;
  zone: string;
  zoneGeo: string;
  missionName: string;
  missionIcon: string;
  alerts: AlertRewardItem[];
  rewards: AlertRewardItem[];
  modifiers: AlertModifier[];
  hasAlerts: boolean;
}

export interface ZoneMissions {
  zone: string;
  icon: string;
  missions: ProcessedMission[];
}

/** Augment the global Window so TS knows about glowAPI */
declare global {
  interface Window {
    glowAPI: GlowAPI;
  }
}

// ============================================================
// Storage helpers
// ============================================================

export interface AppConfig {
  windowBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
