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
  displayName?: string;
  accountId?: string;
  sessionId?: string;
  ownerId?: string;
  totalPlayers?: number;
  maxPlayers?: number | string;
  started?: boolean;
  gameType?: string;
  gameMode?: string;
  region?: string;
  subRegion?: string;
  serverAddress?: string;
  serverPort?: string;
  players?: { index: number; accountId: string; displayName: string }[];
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
    generate: (filters: { types: string[]; rarities: string[]; chapters: string[]; exclusive: boolean }) =>
      Promise<{ success: boolean; fileName?: string; path?: string; count?: number; time?: string; sizeMB?: string; error?: string }>;
    save: (sourcePath: string) => Promise<{ saved: boolean; path?: string }>;
  };
  files: {
    getWorldInfo: () => Promise<{ success: boolean; data?: any; missions?: number; alerts?: number; theaters?: number; sizeMB?: string; error?: string }>;
    save: (jsonString: string, defaultName: string) => Promise<{ saved: boolean; path?: string }>;
    devBuildStatus: () => Promise<{ found: boolean; activated: boolean; filePath: string | null; error?: string }>;
    devBuildToggle: () => Promise<{ success: boolean; activated?: boolean; message: string }>;
    trapHeightList: () => Promise<{ name: string; guid: string; desc: string; defaultHeight: string; rarity: string; tier: string }[]>;
    trapHeightPresets: () => Promise<{ label: string; hex: string }[]>;
    trapHeightStatus: (guid: string) => Promise<{ found: boolean; isModified: boolean; currentHeight: string | null; error?: string }>;
    trapHeightApply: (guid: string, newHeight: string) => Promise<{ success: boolean; message: string; currentHeight?: string; isModified?: boolean }>;
    trapHeightRevert: (guid: string) => Promise<{ success: boolean; message: string }>;
    trapHeightRevertAll: () => Promise<{ success: boolean; message: string }>;
    trapHeightModifiedCount: () => Promise<number>;
    trapHeightModifiedTraps: () => Promise<{ guid: string; name: string; currentHeight: string; desc: string; rarity: string; tier: string }[]>;
  };
  dupe: {
    execute: () => Promise<{ success: boolean; message: string; storageStatus?: string | null }>;
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
    getAll: () => Promise<{ success: boolean; statuses: TaxiAccountStatus[]; error?: string }>;\n    getAvatars: () => Promise<{ success: boolean; avatars: Record<string, string>; error?: string }>;
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
  statsMode: 'normal' | 'low';
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
