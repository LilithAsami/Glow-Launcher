/**
 * XMPP Connection Manager for Taxi System
 *
 * Connects to Epic Games' XMPP server (prod.ol.epicgames.com) via WebSocket
 * using the `stanza` library. Handles:
 * - Authentication with OAuth access token
 * - Incoming admin messages (friend requests, party notifications)
 * - Presence (status) broadcasting
 * - Party chat via MUC groupchat
 * - Keep-alive and reconnect logic
 */

import { createClient, Agent } from 'stanza';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

const EPIC_PROD_ENV = 'prod.ol.epicgames.com';
const XMPP_WS_URL = 'wss://xmpp-service-prod.ol.epicgames.com';
const XMPP_ADMIN_JID = 'xmpp-admin@prod.ol.epicgames.com';

export interface XmppConfig {
  accountId: string;
  accessToken: string;
  displayName: string;
  platform?: string;
}

export interface XmppEvents {
  // Friend events
  'friend:request': { accountId: string; displayName: string; direction: string };
  'friend:removed': { accountId: string };
  // Party events
  'party:invite': { senderId: string; senderDisplayName: string; partyId: string; meta: any };
  'party:member:joined': { partyId: string; accountId: string; displayName: string; meta: any };
  'party:member:left': { partyId: string; accountId: string };
  'party:member:expired': { partyId: string; accountId: string };
  'party:member:kicked': { partyId: string; accountId: string };
  'party:member:stateUpdated': { partyId: string; accountId: string; state: Record<string, string> };
  'party:updated': { partyId: string; meta: any };
  // Party chat (groupchat MUC — legacy, may still work for some messages)
  'party:chat': { partyId: string; authorId: string; content: string };
  // Presence
  'friend:presence': { accountId: string; status: any; show: string; available: boolean };
  // Connection
  'connected': void;
  'disconnected': void;
}

export class EpicXmpp extends EventEmitter {
  private connection: Agent | null = null;
  private config: XmppConfig | null = null;
  private _jid: string = '';
  private _isConnected = false;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private _lastPresence: { status?: string; show?: string } | null = null;

  get jid(): string { return this._jid; }
  get isConnected(): boolean { return this._isConnected; }

  async connect(config: XmppConfig): Promise<void> {
    this.config = config;
    const platform = config.platform || 'WIN';
    const resource = `V2:Fortnite:${platform}::${crypto.randomBytes(16).toString('hex').toUpperCase()}`;

    this.connection = createClient({
      jid: `${config.accountId}@${EPIC_PROD_ENV}`,
      server: EPIC_PROD_ENV,
      transports: {
        websocket: XMPP_WS_URL,
        bosh: false,
      },
      credentials: {
        host: EPIC_PROD_ENV,
        username: config.accountId,
        password: config.accessToken,
      },
      resource,
    });

    this._jid = `${config.accountId}@${EPIC_PROD_ENV}/${resource}`;

    this.setupListeners();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('XMPP connection timeout (15s)'));
      }, 15_000);

      this.connection!.on('session:started', () => {
        clearTimeout(timeout);
        this._isConnected = true;
        this.startKeepAlive();

        // Re-send last presence so friends still see the correct status
        if (this._lastPresence) {
          try { this.connection!.sendPresence(this._lastPresence as any); } catch {}
        }

        this.emit('connected');
        resolve();
      });

      this.connection!.on('session:end', () => {
        clearTimeout(timeout);
        this.handleDisconnect();
      });

      this.connection!.connect();
    });
  }

  private setupListeners(): void {
    if (!this.connection) return;

    // Admin messages (friend requests, party notifications)
    this.connection.on('message', (msg: any) => {
      // Only process admin messages
      const from = typeof msg.from === 'string' ? msg.from : msg.from?.full || msg.from?.bare || '';
      if (!from.startsWith('xmpp-admin@')) return;

      const bodyText = msg.body;
      if (!bodyText) return;

      let body: any;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return;
      }

      this.handleAdminMessage(body);
    });

    // Groupchat (party chat via MUC — legacy)
    this.connection.on('groupchat', (msg: any) => {
      try {
        const fromStr = typeof msg.from === 'string' ? msg.from : msg.from?.full || '';
        // MUC JID format: Party-{partyId}@muc.prod.ol.epicgames.com/{resource}
        const partyId = fromStr.split('@')[0]?.replace('Party-', '') || '';
        const resource = fromStr.split('/')[1] || '';
        const authorId = resource.split(':')[0] || '';
        const content = msg.body || '';

        if (partyId && authorId && content) {
          this.emit('party:chat', { partyId, authorId, content });
        }
      } catch {}
    });

    // Presence updates from friends
    this.connection.on('presence', (pres: any) => {
      try {
        const fromStr = typeof pres.from === 'string' ? pres.from : pres.from?.bare || '';
        const accountId = fromStr.split('@')[0];
        if (!accountId || accountId === this.config?.accountId) return;

        let status: any = {};
        if (pres.status) {
          try { status = JSON.parse(pres.status); } catch { status = { Status: pres.status }; }
        }

        this.emit('friend:presence', {
          accountId,
          status,
          show: pres.show || 'online',
          available: pres.type !== 'unavailable',
        });
      } catch {}
    });

    // Disconnection
    this.connection.on('disconnected', () => {
      this.handleDisconnect();
    });
  }

  private handleAdminMessage(body: any): void {
    const type = body.type || '';

    // Friend request
    if (type === 'com.epicgames.friends.core.apiobjects.Friend') {
      const payload = body.payload || body;
      if (payload.status === 'PENDING' && payload.direction === 'INBOUND') {
        this.emit('friend:request', {
          accountId: payload.accountId,
          displayName: payload.displayName || payload.accountId,
          direction: payload.direction,
        });
      }
    }

    // Friend removal
    if (type === 'FRIENDSHIP_REMOVE') {
      this.emit('friend:removed', { accountId: body.from || body.accountId });
    }

    // Party invite (PING)
    if (type === 'com.epicgames.social.party.notification.v0.PING') {
      this.emit('party:invite', {
        senderId: body.pinger_id || '',
        senderDisplayName: body.pinger_dn || body.pinger_id || '',
        partyId: body.party_id || '',
        meta: body,
      });
    }

    // Party member joined
    if (type === 'com.epicgames.social.party.notification.v0.MEMBER_JOINED') {
      this.emit('party:member:joined', {
        partyId: body.party_id || '',
        accountId: body.account_id || '',
        displayName: body.account_dn || body.account_id || '',
        meta: body.member_state_updated || {},
      });
    }

    // Party member left
    if (type === 'com.epicgames.social.party.notification.v0.MEMBER_LEFT') {
      this.emit('party:member:left', {
        partyId: body.party_id || '',
        accountId: body.account_id || '',
      });
    }

    // Party member expired
    if (type === 'com.epicgames.social.party.notification.v0.MEMBER_EXPIRED') {
      this.emit('party:member:expired', {
        partyId: body.party_id || '',
        accountId: body.account_id || '',
      });
    }

    // Party member kicked
    if (type === 'com.epicgames.social.party.notification.v0.MEMBER_KICKED') {
      this.emit('party:member:kicked', {
        partyId: body.party_id || '',
        accountId: body.account_id || '',
      });
    }

    // Party member state updated
    if (type === 'com.epicgames.social.party.notification.v0.MEMBER_STATE_UPDATED') {
      this.emit('party:member:stateUpdated', {
        partyId: body.party_id || '',
        accountId: body.account_id || '',
        state: body.member_state_updated || {},
      });
    }

    // Party updated (party meta changed)
    if (type === 'com.epicgames.social.party.notification.v0.PARTY_UPDATED') {
      this.emit('party:updated', {
        partyId: body.party_id || '',
        meta: body.party_state_updated || {},
      });
    }
  }

  /**
   * Send presence status to all friends
   */
  sendStatus(statusObj: any, show?: string): void {
    const pres: any = {
      status: JSON.stringify(statusObj),
      ...(show ? { show } : {}),
    };
    this._lastPresence = pres;

    if (!this.connection || !this._isConnected) return;
    this.connection.sendPresence(pres);
  }

  /**
   * Send raw presence stanza
   */
  sendPresence(data: any): void {
    if (!this.connection || !this._isConnected) return;
    this.connection.sendPresence(data);
  }

  /**
   * Join a MUC room for party chat (legacy)
   */
  joinPartyChat(partyId: string): void {
    if (!this.connection || !this._isConnected || !this.config) return;

    try {
      this.connection.joinRoom(
        `Party-${partyId}@muc.${EPIC_PROD_ENV}`,
        `${this.config.accountId}:${this.config.displayName}:${this.config.accountId}`,
      );
    } catch {}
  }

  /**
   * Leave a MUC room
   */
  leavePartyChat(partyId: string): void {
    if (!this.connection || !this._isConnected) return;
    try {
      this.connection.leaveRoom(
        `Party-${partyId}@muc.${EPIC_PROD_ENV}`,
      );
    } catch {}
  }

  /**
   * Send a message to party chat (MUC groupchat)
   */
  sendPartyChatMessage(partyId: string, message: string): void {
    if (!this.connection || !this._isConnected) return;

    this.connection.sendMessage({
      to: `Party-${partyId}@muc.${EPIC_PROD_ENV}`,
      type: 'groupchat',
      body: message,
    });
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    // Send a ping every 30 seconds to keep connection alive
    this.keepAliveTimer = setInterval(() => {
      if (this.connection && this._isConnected) {
        try {
          // Re-send last presence to keep status visible (empty pres resets it)
          this.connection.sendPresence((this._lastPresence || {}) as any);
        } catch {}
      }
    }, 30_000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private handleDisconnect(): void {
    if (!this._isConnected) return;
    this._isConnected = false;
    this.stopKeepAlive();
    this.emit('disconnected');
  }

  disconnect(): void {
    this.stopKeepAlive();
    this._isConnected = false;
    if (this.connection) {
      try { this.connection.disconnect(); } catch {}
      this.connection = null;
    }
  }
}
