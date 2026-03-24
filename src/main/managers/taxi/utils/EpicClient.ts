/**
 * EpicClient — Drop-in replacement for fnbr.Client for the Taxi system.
 *
 * Orchestrates:
 * - OAuth authentication via device_auth grant
 * - XMPP real-time connection (friend requests, party notifications, presence)
 * - Party HTTP operations (create, join, leave, meta patches)
 * - Friend HTTP operations (accept, decline)
 * - Presence / status broadcasting
 *
 * Events emitted (same as fnbr):
 *   'friend:request'      → { id, displayName, accept(), decline() }
 *   'party:invite'        → { sender: { id, displayName }, party: { id }, accept(), decline() }
 *   'party:member:joined' → { id, displayName, party: { id } }
 *   'party:member:left'   → { id, party: { id } }
 *   'party:member:expired'→ { id }
 *   'party:member:updated'→ { id, isReady, state }
 *   'party:member:message'→ { content, authorId }
 *   'disconnected'        → void
 *   'ready'               → void
 */

import { EventEmitter } from 'events';
import axios from 'axios';
import { Endpoints } from '../../../helpers/endpoints';
import { ANDROID_CLIENT } from '../../../helpers/auth/clients';
import { EpicXmpp } from './xmpp';
import { defaultPartyMemberMeta } from '../../party/ClientPartyMemberMeta';
import * as partyApi from './partyApi';
import * as friendsApi from './friendsApi';

// ── Types ───────────────────────────────────────────────────

export interface DeviceAuthCredentials {
  accountId: string;
  deviceId: string;
  secret: string;
}

export interface EpicClientConfig {
  deviceAuth: DeviceAuthCredentials;
  platform?: string;
}

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId: string;
  displayName: string;
}

interface PartyState {
  id: string;
  revision: number;
  memberMeta: Record<string, string>;
  memberRevision: number;
}

// ── EpicClient ──────────────────────────────────────────────

export class EpicClient extends EventEmitter {
  private config: EpicClientConfig;
  private xmpp: EpicXmpp;
  private token: TokenData | null = null;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;
  private partyState: PartyState | null = null;
  private _isReady = false;
  private _destroyed = false;

  /** Current user info */
  public user: { self: { id: string; displayName: string } } = {
    self: { id: '', displayName: '' },
  };

  /** A map to track friend presence (filled via XMPP) */
  public friendPresences = new Map<string, { partyId?: string; status?: any }>();

  get isReady(): boolean { return this._isReady; }
  get accessToken(): string { return this.token?.accessToken || ''; }
  get currentPartyId(): string | undefined { return this.partyState?.id; }

  constructor(config: EpicClientConfig) {
    super();
    this.config = config;
    this.xmpp = new EpicXmpp();
  }

  // ── Auth ────────────────────────────────────────────────

  private async authenticate(): Promise<TokenData> {
    const { accountId, deviceId, secret } = this.config.deviceAuth;
    const params = new URLSearchParams({
      grant_type: 'device_auth',
      account_id: accountId,
      device_id: deviceId,
      secret: secret,
      token_type: 'eg1',
    });

    const res = await axios.post(Endpoints.OAUTH_TOKEN, params, {
      headers: {
        Authorization: `basic ${ANDROID_CLIENT.auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15_000,
    });

    const data = res.data;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at).getTime(),
      accountId: data.account_id,
      displayName: data.displayName || accountId,
    };
  }

  private async refreshToken(): Promise<void> {
    if (this._destroyed) return;
    try {
      this.token = await this.authenticate();
      this.scheduleTokenRefresh();
    } catch (e: any) {
      console.error('[EpicClient] Token refresh failed:', e?.message);
    }
  }

  private scheduleTokenRefresh(): void {
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    if (!this.token) return;

    // Refresh 15 minutes before expiry
    const delay = Math.max(this.token.expiresAt - Date.now() - 15 * 60_000, 30_000);
    this.tokenRefreshTimer = setTimeout(() => this.refreshToken(), delay);
  }

  // ── Login / Logout ──────────────────────────────────────

  async login(): Promise<void> {
    // 1. Authenticate
    this.token = await this.authenticate();
    this.user.self.id = this.token.accountId;
    this.user.self.displayName = this.token.displayName;
    this.scheduleTokenRefresh();

    // 2. Connect XMPP
    this.setupXmppEvents();
    await this.xmpp.connect({
      accountId: this.token.accountId,
      accessToken: this.token.accessToken,
      displayName: this.token.displayName,
      platform: this.config.platform || 'WIN',
    });

    // 3. Create initial party
    try {
      await this.createNewParty();
    } catch (e: any) {
      console.warn('[EpicClient] Failed to create initial party:', e?.message);
    }

    // 4. Send initial presence
    this.setStatus();

    this._isReady = true;
    this.emit('ready');
  }

  async logout(): Promise<void> {
    this._isReady = false;
    this._destroyed = true;

    // Clear token refresh
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }

    // Leave party
    if (this.partyState && this.token) {
      try {
        await partyApi.leaveParty(this.token.accessToken, this.partyState.id, this.user.self.id);
      } catch {}
    }
    this.partyState = null;

    // Disconnect XMPP
    this.xmpp.disconnect();

    // Revoke token
    if (this.token) {
      try {
        await axios.delete(`${Endpoints.OAUTH_TOKEN_KILL}/${this.token.accessToken}`, {
          headers: { Authorization: `Bearer ${this.token.accessToken}` },
        });
      } catch {}
    }
    this.token = null;

    this.emit('disconnected');
  }

  async destroy(): Promise<void> {
    return this.logout();
  }

  // ── XMPP Event Setup ───────────────────────────────────

  private setupXmppEvents(): void {
    // Friend request
    this.xmpp.on('friend:request', (data) => {
      const friendObj = {
        id: data.accountId,
        accountId: data.accountId,
        displayName: data.displayName,
        accept: () => this.acceptFriend(data.accountId),
        decline: () => this.declineFriend(data.accountId),
      };
      this.emit('friend:request', friendObj);
    });

    // Party invite (PING)
    this.xmpp.on('party:invite', (data) => {
      const inviteObj = {
        sender: {
          id: data.senderId,
          accountId: data.senderId,
          displayName: data.senderDisplayName,
        },
        party: { id: data.partyId },
        accept: () => this.acceptInvite(data.senderId),
        decline: () => this.declineInvite(data.senderId),
      };
      this.emit('party:invite', inviteObj);
    });

    // Party member joined
    this.xmpp.on('party:member:joined', (data) => {
      this.emit('party:member:joined', {
        id: data.accountId,
        displayName: data.displayName,
        party: { id: data.partyId },
      });
    });

    // Party member left
    this.xmpp.on('party:member:left', (data) => {
      this.emit('party:member:left', {
        id: data.accountId,
        party: { id: data.partyId },
      });
    });

    // Party member expired
    this.xmpp.on('party:member:expired', (data) => {
      this.emit('party:member:expired', {
        id: data.accountId,
        party: { id: data.partyId },
      });
    });

    // Party member kicked
    this.xmpp.on('party:member:kicked', (data) => {
      this.emit('party:member:expired', {
        id: data.accountId,
        party: { id: data.partyId },
      });
    });

    // Party member state updated (readiness, cosmetics, etc.)
    this.xmpp.on('party:member:stateUpdated', (data) => {
      // Parse readiness from state update
      let isReady = false;
      if (data.state?.['Default:LobbyState_j']) {
        try {
          const lobby = JSON.parse(data.state['Default:LobbyState_j']);
          isReady = lobby?.LobbyState?.gameReadiness === 'Ready';
        } catch {}
      }
      this.emit('party:member:updated', {
        id: data.accountId,
        isReady,
        state: data.state,
        party: { id: data.partyId },
      });
    });

    // Party chat
    this.xmpp.on('party:chat', (data) => {
      this.emit('party:member:message', {
        content: data.content,
        authorId: data.authorId,
      });
    });

    // Friend presence (track party IDs)
    this.xmpp.on('friend:presence', (data) => {
      const partyJoinInfo = data.status?.Properties?.['party.joininfodata.286331153_j'];
      this.friendPresences.set(data.accountId, {
        partyId: partyJoinInfo?.partyId,
        status: data.status,
      });
    });

    // Disconnection
    this.xmpp.on('disconnected', () => {
      if (this._isReady) {
        this._isReady = false;
        this.emit('disconnected');
      }
    });
  }

  // ── Party Operations ────────────────────────────────────

  private async createNewParty(): Promise<void> {
    if (!this.token) throw new Error('Not authenticated');

    const result = await partyApi.createParty(
      this.token.accessToken,
      this.user.self.id,
      this.user.self.displayName,
      this.xmpp.jid,
      this.config.platform || 'WIN',
    );

    this.partyState = {
      id: result.id,
      revision: result.revision || 0,
      memberMeta: { ...defaultPartyMemberMeta },
      memberRevision: 0,
    };

    // Send initial member meta
    try {
      const { newRevision } = await partyApi.sendInitialMemberMeta(
        this.token.accessToken,
        result.id,
        this.user.self.id,
      );
      this.partyState.memberRevision = newRevision;
    } catch {}

    // Join party chat
    this.xmpp.joinPartyChat(result.id);
  }

  /**
   * Leave current party and optionally create a new one
   */
  async leaveParty(createNew = true): Promise<void> {
    if (!this.token) return;

    if (this.partyState) {
      this.xmpp.leavePartyChat(this.partyState.id);
      try {
        await partyApi.leaveParty(this.token.accessToken, this.partyState.id, this.user.self.id);
      } catch {}
      this.partyState = null;
    }

    if (createNew) {
      try {
        await this.createNewParty();
      } catch {}
    }
  }

  /**
   * Get party info by ID
   */
  async getParty(partyId: string): Promise<{ id: string; join: () => Promise<void> } | null> {
    if (!this.token) return null;
    try {
      const data = await partyApi.getParty(this.token.accessToken, partyId);
      return {
        id: data.id,
        join: () => this.joinExistingParty(data.id),
      };
    } catch {
      return null;
    }
  }

  /**
   * Join an existing party by ID
   */
  private async joinExistingParty(partyId: string): Promise<void> {
    if (!this.token) throw new Error('Not authenticated');

    // Leave current party first (without creating new one)
    if (this.partyState) {
      this.xmpp.leavePartyChat(this.partyState.id);
      try {
        await partyApi.leaveParty(this.token.accessToken, this.partyState.id, this.user.self.id);
      } catch {}
    }

    // Join the target party
    await partyApi.joinParty(
      this.token.accessToken,
      partyId,
      this.user.self.id,
      this.user.self.displayName,
      this.xmpp.jid,
      this.config.platform || 'WIN',
    );

    this.partyState = {
      id: partyId,
      revision: 0,
      memberMeta: { ...defaultPartyMemberMeta },
      memberRevision: 0,
    };

    // Send initial member meta
    try {
      const { newRevision } = await partyApi.sendInitialMemberMeta(
        this.token.accessToken,
        partyId,
        this.user.self.id,
      );
      this.partyState.memberRevision = newRevision;
    } catch {}

    // Join party chat
    this.xmpp.joinPartyChat(partyId);
  }

  /**
   * Accept a party invite and join the party
   */
  async acceptInvite(senderId: string): Promise<string> {
    if (!this.token) throw new Error('Not authenticated');

    // Leave current party first
    if (this.partyState) {
      this.xmpp.leavePartyChat(this.partyState.id);
      try {
        await partyApi.leaveParty(this.token.accessToken, this.partyState.id, this.user.self.id);
      } catch {}
    }

    const partyId = await partyApi.acceptPartyInvite(
      this.token.accessToken,
      this.user.self.id,
      senderId,
      this.user.self.displayName,
      this.xmpp.jid,
      this.config.platform || 'WIN',
    );

    this.partyState = {
      id: partyId,
      revision: 0,
      memberMeta: { ...defaultPartyMemberMeta },
      memberRevision: 0,
    };

    // Send initial member meta
    try {
      const { newRevision } = await partyApi.sendInitialMemberMeta(
        this.token.accessToken,
        partyId,
        this.user.self.id,
      );
      this.partyState.memberRevision = newRevision;
    } catch {}

    // Join party chat
    this.xmpp.joinPartyChat(partyId);

    return partyId;
  }

  /**
   * Decline a party invite
   */
  async declineInvite(senderId: string): Promise<void> {
    if (!this.token) return;
    await partyApi.declinePartyInvite(this.token.accessToken, this.user.self.id, senderId);
  }

  // ── Member Meta Operations (party.me equivalent) ───────

  /**
   * Send a party member meta patch (the core operation for cosmetics/stats/readiness)
   */
  async sendMemberPatch(updated: Record<string, string>): Promise<void> {
    if (!this.token || !this.partyState) return;

    const { newRevision } = await partyApi.patchMemberMeta(
      this.token.accessToken,
      this.partyState.id,
      this.user.self.id,
      updated,
      this.partyState.memberRevision,
    );
    this.partyState.memberRevision = newRevision;

    // Update local meta copy
    Object.assign(this.partyState.memberMeta, updated);
  }

  /**
   * Set outfit (skin)
   */
  async setOutfit(skinId: string): Promise<void> {
    if (!this.partyState) return;
    const patch = partyApi.buildOutfitMeta(skinId, this.partyState.memberMeta);
    await this.sendMemberPatch(patch);
  }

  /**
   * Set banner
   */
  async setBanner(bannerId: string, color = 'defaultcolor15'): Promise<void> {
    if (!this.partyState) return;
    const patch = partyApi.buildBannerMeta(bannerId, color, undefined, this.partyState.memberMeta);
    await this.sendMemberPatch(patch);
  }

  /**
   * Set level (season level displayed in party)
   */
  async setLevel(level: number): Promise<void> {
    if (!this.partyState) return;
    const patch = partyApi.buildLevelMeta(level, this.partyState.memberMeta);
    await this.sendMemberPatch(patch);
  }

  /**
   * Set emote
   */
  async setEmote(emoteId: string): Promise<void> {
    const patch = partyApi.buildEmoteMeta(emoteId);
    await this.sendMemberPatch(patch);
  }

  /**
   * Set readiness state
   */
  async setReadiness(ready: boolean): Promise<void> {
    const patch = partyApi.buildReadinessMeta(ready);
    await this.sendMemberPatch(patch);
  }

  // ── Friend Operations ──────────────────────────────────

  async acceptFriend(friendId: string): Promise<void> {
    if (!this.token) return;
    await friendsApi.acceptFriendRequest(this.token.accessToken, this.user.self.id, friendId);
  }

  async declineFriend(friendId: string): Promise<void> {
    if (!this.token) return;
    await friendsApi.declineFriendRequest(this.token.accessToken, this.user.self.id, friendId);
  }

  /**
   * Get a friend's current party ID from their presence
   */
  getFriendPartyId(friendId: string): string | undefined {
    return this.friendPresences.get(friendId)?.partyId;
  }

  // ── Presence / Status ──────────────────────────────────

  /**
   * Set status / presence (displayed to friends)
   */
  setStatus(statusText?: string, show?: string): void {
    const partyId = this.partyState?.id || '';
    const displayName = this.user.self.displayName || '';

    const rawStatus = {
      Status: statusText || '',
      bIsPlaying: false,
      bIsJoinable: true,
      bHasVoiceSupport: false,
      SessionId: '',
      ProductName: 'Fortnite',
      Properties: {
        'party.joininfodata.286331153_j': {
          sourceId: displayName,
          sourceDisplayName: displayName,
          sourcePlatform: this.config.platform || 'WIN',
          partyId,
          partyTypeId: 286331153,
          key: 'k',
          appId: 'Fortnite',
          buildId: '1:3:',
          partyFlags: -2024557306,
          notAcceptingReason: 0,
          pc: 1,
        },
        FortBasicInfo_j: { homeBaseRating: 0 },
        FortLFG_I: '0',
        FortPartySize_i: 1,
        FortSubGame_i: 1,
        InUnjoinableMatch_b: false,
        FortGameplayStats_j: {
          state: '',
          playlist: 'None',
          numKills: 0,
          bFellToDeath: false,
        },
      },
    };

    this.xmpp.sendStatus(rawStatus, show);
  }

  // ── Party Chat ─────────────────────────────────────────

  /**
   * Send a message to party chat via XMPP MUC
   */
  sendPartyMessage(message: string): void {
    if (!this.partyState) return;
    this.xmpp.sendPartyChatMessage(this.partyState.id, message);
  }
}
