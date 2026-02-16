import { Collection } from 'discord.js';
import { PartyMeta } from './PartyMeta';
import { ClientPartyMember } from './ClientPartyMember';
import { PartyMember, type PartyMemberData } from './PartyMember';
import { AsyncQueue } from '@sapphire/async-queue';
import axios from 'axios';
import { Endpoints } from '../../helpers/endpoints';
import { log } from '../logger';

interface PartyAccount {
  id: string;
  displayName: string;
  sendEpicRequest: (options: any) => Promise<any>;
}

interface PartyConfig {
  maxSize?: number;
  joinability?: string;
  subType?: string;
  type?: string;
  inviteTtl?: number;
  discoverability?: string;
  privacy?: {
    partyType?: string;
    inviteRestriction?: string;
    onlyLeaderFriendsCanJoin?: boolean;
  };
}

export class PartyManager {
  public accountId: string;
  public displayName: string;
  public token: string;
  public account: PartyAccount;
  public id?: string;
  public createdAt?: Date;
  public config?: PartyConfig;
  public meta?: PartyMeta;
  public revision?: number;
  public members?: Collection<string, PartyMember | ClientPartyMember>;
  public hiddenMemberIds?: Set<string>;
  public patchQueue?: AsyncQueue;

  constructor({ accountId, displayName, token }: {
    accountId: string;
    displayName: string;
    token: string;
  }) {
    this.accountId = accountId;
    this.displayName = displayName;
    this.token = token;

    // Agregar objeto account para que ClientPartyMember pueda hacer peticiones
    this.account = {
      id: accountId,
      displayName: displayName,
      sendEpicRequest: async (options: any) => {
        return axios.request({
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${this.token}`
          }
        });
      }
    };

    this.id = undefined;
    this.createdAt = undefined;
    this.config = undefined;
    this.meta = undefined;
    this.revision = undefined;
    this.members = undefined;
    this.hiddenMemberIds = undefined;
  }

  async fetch(): Promise<void> {
    const partyRes = await axios.request({
      method: 'GET',
      url: `${Endpoints.BR_PARTY}/user/${this.accountId}`,
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    });

    const data = partyRes?.data?.current?.[0];
    if (!data) {
      throw new Error('Party not found');
    }

    this.patchQueue = new AsyncQueue();
    this.id = data.id;
    this.createdAt = new Date(data.created_at);
    this.hiddenMemberIds = new Set();
    this.members = new Collection();
    
    const memberEntries = await Promise.all(
      data.members.map(async (m: PartyMemberData) => {
        if (m.account_id === this.accountId) {
          m.account_dn = this.displayName;
          return [m.account_id, new ClientPartyMember(this, m)] as [string, ClientPartyMember];
        }
        
        try {
          const userData = await fetchUser(this.token, m.account_id);
          m.account_dn = userData.displayName;
          m.externalAuths = userData.externalAuths;
        } catch (error) {
          log.epic.warn({ error, accountId: m.account_id }, 'No se pudo obtener datos del usuario');
          m.account_dn = m.account_dn || m.account_id;
          m.externalAuths = m.externalAuths || {};
        }
        
        return [m.account_id, new PartyMember(this, m)] as [string, PartyMember];
      })
    );
    
    memberEntries.forEach(([id, member]) => this.members!.set(id, member));

    this.config = makeCamelCase(data.config);

    // Asegurar que existe la estructura de privacy
    if (!this.config!.privacy) {
      this.config!.privacy = {
        partyType: 'Public',
        inviteRestriction: 'AnyMember',
        onlyLeaderFriendsCanJoin: false
      };
    }

    this.meta = new PartyMeta(this, data.meta);
    this.revision = data.revision || 0;
  }

  get fetched(): boolean {
    return Boolean(this.id);
  }

  get size(): number | undefined {
    return this.members?.size;
  }

  /**
   * The party's max member count
   */
  get maxSize(): number | undefined {
    return this.config?.maxSize;
  }

  /**
   * The party's leader
   */
  get leader(): PartyMember | ClientPartyMember | undefined {
    return this.members?.find(m => m.role === 'CAPTAIN');
  }

  /**
   * The currently selected playlist
   */
  get playlist(): any {
    return this.meta?.island;
  }

  /**
   * The custom matchmaking key
   */
  get customMatchmakingKey(): string | undefined {
    return this.meta?.customMatchmakingKey;
  }

  /**
   * The squad fill status
   */
  get squadFill(): boolean | undefined {
    return this.meta?.squadFill;
  }

  /**
   * Returns the client's party member
   */
  get me(): ClientPartyMember | undefined {
    return this.members?.get(this.accountId) as ClientPartyMember | undefined;
  }

  /**
   * Whether the party is private
   */
  get isPrivate(): boolean {
    return this.config?.privacy?.partyType === 'Private';
  }

  /**
   * Updates this party's data
   */
  async updateData(data: any): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (data.revision > this.revision!) this.revision = data.revision;
    this.meta!.update(data.party_state_updated ?? {}, true);
    this.meta!.remove(data.party_state_removed ?? []);

    this.config!.joinability = data.party_privacy_type;
    this.config!.maxSize = data.max_number_of_members;
    this.config!.subType = data.party_sub_type;
    this.config!.type = data.party_type;
    this.config!.inviteTtl = data.invite_ttl_seconds;
    this.config!.discoverability = data.discoverability;
  }

  /**
   * Converts this party into an object
   */
  toObject(): any {
    return {
      id: this.id,
      created_at: this.createdAt!.toISOString(),
      config: this.config,
      invites: [],
      members: Array.from(this.members!.values()).map(m => m.toObject()),
      meta: this.meta!.schema,
      revision: 0,
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Leaves this party
   * @throws {EpicgamesAPIError}
   */
  async leave(): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    await axios.request({
      method: 'DELETE',
      url: `${Endpoints.BR_PARTY}/parties/${this.id}/members/${this.accountId}`,
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    });
  }

  /**
   * Sends a party patch to Epicgames' servers
   * @param updated The updated schema
   * @param deleted The deleted schema keys
   * @throws {PartyPermissionError} You're not the leader of this party
   * @throws {EpicgamesAPIError}
   */
  async sendPatch(updated: Record<string, string>, deleted: string[] = []): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    await this.patchQueue!.wait();

    try {
      const patchData = {
        config: {
          join_confirmation: true,
          joinability: this.config!.joinability || 'OPEN',
          max_size: this.config!.maxSize || 16,
        },
        meta: {
          delete: deleted,
          update: updated
        },
        party_state_overridden: {},
        party_privacy_type: this.config!.joinability || 'OPEN',
        party_type: this.config!.type || 'DEFAULT',
        party_sub_type: this.config!.subType || 'default',
        max_number_of_members: this.config!.maxSize || 16,
        invite_ttl_seconds: this.config!.inviteTtl || 14400,
        revision: this.revision!
      };

      await axios.request({
        method: 'PATCH',
        url: `${Endpoints.BR_PARTY}/parties/${this.id}`,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        data: patchData
      });

      if (updated) {
        Object.keys(updated).forEach(k => {
          this.meta!.set(k, updated[k], true);
        });
      }

      if (deleted) {
        this.meta!.remove(deleted);
      }

      this.revision! += 1;
    } catch (e: any) {
      log.epic.error({ error: e.response?.data || e }, 'Error sending party patch');
      throw e;
    }

    this.patchQueue!.shift();
  }

  /**
   * Kicks a member from this party
   * @param member The member that should be kicked
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {PartyMemberNotFoundError} The party member wasn't found
   * @throws {EpicgamesAPIError}
   */
  async kick(member: string | PartyMember): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    const memberId = typeof member === 'string' ? member : member.id;
    const partyMember = this.members!.get(memberId);
    if (!partyMember) throw new Error('Party member not found');

    await axios.request({
      method: 'DELETE',
      url: `${Endpoints.BR_PARTY}/parties/${this.id}/members/${memberId}`,
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    });
  }

  /**
   * Sends a party invitation to a friend
   * @param friend The friend id that will receive the invitation
   * @throws {PartyAlreadyJoinedError} The user is already a member of this party
   * @throws {PartyMaxSizeReachedError} The party reached its max size
   * @throws {EpicgamesAPIError}
   */
  async invite(friendId: string): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    
    if (this.members!.has(friendId)) {
      throw new Error('User is already a member of this party');
    }

    if (this.members!.size >= this.maxSize!) {
      throw new Error('Party max size reached');
    }

    await axios.request({
      method: 'POST',
      url: `${Endpoints.BR_PARTY}/parties/${this.id}/invites/${friendId}`,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      data: {
        'urn:epic:cfg:build-id_s': '1:1:',
        'urn:epic:conn:type_s': 'game',
        'urn:epic:conn:platform_s': 'WIN',
        'urn:epic:invite:platformdataoverride_s': ''
      }
    });
  }

  /**
   * Sends a request to join another player's party (intentions)
   * NOTE: Esto NO es una invitación. Solo crea la solicitud.
   * @param targetAccountId The account id of the player whose party you want to join
   * @throws {EpicgamesAPIError}
   */
  async requestToJoin(targetAccountId: string): Promise<void> {
    await axios.request({
      method: 'POST',
      url: `${Endpoints.BR_PARTY}/members/${targetAccountId}/intentions/${this.accountId}`,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      data: {}
    });
  }

  /**
   * Joins another player's party (complete process)
   * Real join flow: Espera invitación real → obtiene partyId → join → delete ping
   * @param targetAccountId The account id of the player whose party you want to join
   * @param timeoutMs Timeout in milliseconds (default 30000)
   * @throws {Error} If no invitation received within timeout
   * @throws {EpicgamesAPIError}
   */
/**
 * Joins another player's party (REAL Epic flow)
 * Flow:
 * requestToJoin →
 * wait ping →
 * resolve party →
 * DELETE ping (accept) →
 * backend auto-join →
 * sync
 */
async join(targetAccountId: string, timeoutMs: number = 30000): Promise<void> {
  const startTime = Date.now();
  let partyId: string | null = null;
  let senderId: string | null = null;

  log.epic.info({ 
    targetAccountId, 
    timeoutMs,
    accountId: this.accountId
  }, '[JOIN] Iniciando flujo real de join (intention-based)...');

  // 1) Poll real de pings
  while (Date.now() - startTime < timeoutMs) {
    try {
      log.epic.debug({ 
        elapsed: Date.now() - startTime,
        url: `${Endpoints.BR_PARTY}/user/${this.accountId}/pings`
      }, '[JOIN] GET pings...');

      const res = await axios.request({
        method: 'GET',
        url: `${Endpoints.BR_PARTY}/user/${this.accountId}/pings`,
        headers: {
          Authorization: `Bearer ${this.token}`
        }
      });

      const pings = res.data;

      log.epic.info({ 
        status: res.status,
        statusText: res.statusText,
        pingsCount: pings?.length || 0,
        pings,
        elapsed: Date.now() - startTime
      }, '[JOIN] GET pings response');

      if (Array.isArray(pings) && pings.length > 0) {
        const ping = pings.find((p: any) => 
          p.sent_by === targetAccountId || 
          p.senderId === targetAccountId
        );

        if (ping) {
          log.epic.info('[JOIN] ✅ Ping detectado, resolviendo partyId...');

          const partyRes = await axios.request({
            method: 'GET',
            url: `${Endpoints.BR_PARTY}/user/${this.accountId}/pings/${targetAccountId}/parties`,
            headers: {
              Authorization: `Bearer ${this.token}`
            }
          });

          log.epic.info({
            status: partyRes.status,
            data: partyRes.data
          }, '[JOIN] Party resolution response');

          if (
            Array.isArray(partyRes.data) &&
            partyRes.data.length > 0 &&
            partyRes.data[0].id
          ) {
            partyId = partyRes.data[0].id;
            senderId = targetAccountId;

            log.epic.info({
              partyId,
              senderId
            }, '[JOIN] ✅ partyId resuelta correctamente');
            break;
          }
        }
      }
    } catch (error: any) {
      log.epic.debug({ 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      }, '[JOIN] Error en polling (continuando...)');
    }

    // Sleep 2s
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  if (!partyId || !senderId) {
    log.epic.error({ 
      targetAccountId,
      elapsed: Date.now() - startTime 
    }, '[JOIN] ❌ Timeout: no se recibió invitación');
    throw new Error('No invite received. Target user did not accept request or no invitation exists.');
  }

  // 2) ACCEPT REAL INVITE (backend join)
  log.epic.info({ 
    senderId,
    url: `${Endpoints.BR_PARTY}/user/${this.accountId}/pings/${senderId}`
  }, '[JOIN] DELETE ping (accept invite)...');

  await axios.request({
    method: 'DELETE',
    url: `${Endpoints.BR_PARTY}/user/${this.accountId}/pings/${senderId}`,
    headers: {
      Authorization: `Bearer ${this.token}`
    }
  });

  log.epic.info('[JOIN] ✅ Ping eliminado - backend procesará el join automáticamente');

  // 3) Esperar backend sync
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 4) Sync party state
  log.epic.info('[JOIN] Sync party state...');

  const partySync = await axios.request({
    method: 'GET',
    url: `${Endpoints.BR_PARTY}/user/${this.accountId}`,
    headers: {
      Authorization: `Bearer ${this.token}`
    }
  });

  log.epic.info({
    data: partySync.data
  }, '[JOIN] ✅ Party sincronizada correctamente (join completado)');
}


  /**
   * Refreshes the member positions of this party
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {EpicgamesAPIError}
   */
  async refreshSquadAssignments(...assignments: any[]): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    const updated = this.meta!.refreshSquadAssignments();

    await this.sendPatch({
      'Default:SquadInformation_j': updated
    });
  }

  /**
   * Updates this party's privacy settings
   * @param privacy The updated party privacy
   * @param sendPatch Whether the updated privacy should be sent to epic's servers
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {EpicgamesAPIError}
   */
  async setPrivacy(privacy: {
    partyType?: string;
    inviteRestriction?: string;
    onlyLeaderFriendsCanJoin?: boolean;
  }, sendPatch: boolean = true): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    const newPrivacy = {
      partyType: privacy.partyType || this.config!.privacy!.partyType || 'Public',
      inviteRestriction: privacy.inviteRestriction || this.config!.privacy!.inviteRestriction || 'AnyMember',
      onlyLeaderFriendsCanJoin: privacy.onlyLeaderFriendsCanJoin ?? this.config!.privacy!.onlyLeaderFriendsCanJoin ?? false
    };

    // Actualizar config local
    this.config!.privacy = newPrivacy;
    // Map partyType to Epic API joinability values
    this.config!.joinability = newPrivacy.partyType === 'Private' ? 'INVITE_AND_FORMER' : 'OPEN';

    // Actualizar meta
    this.meta!.updatePrivacy();

    if (sendPatch) {
      await this.sendPatch({
        'Default:PrivacySettings_j': this.meta!.schema['Default:PrivacySettings_j']
      });
    }
  }

  /**
   * Sets this party's custom matchmaking key
   * @param key The custom matchmaking key
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {EpicgamesAPIError}
   */
  async setCustomMatchmakingKey(key: string): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    const data = this.meta!.set('Default:CustomMatchKey_s', key);

    await this.sendPatch({
      'Default:CustomMatchKey_s': data
    });
  }

  async setSquadData(...information: any[]): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    const squadInfo = this.meta!.get('Default:SquadInformation_j');
    squadInfo.SquadInformation.squadData = information;

    const data = this.meta!.set('Default:SquadInformation_j', squadInfo);

    await this.sendPatch({
      'Default:SquadInformation_j': data
    });
  }

  /**
   * Promotes a party member
   * @param member The member that should be promoted
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {PartyMemberNotFoundError} The party member wasn't found
   * @throws {EpicgamesAPIError}
   */
  async promote(member: string | PartyMember): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    const memberId = typeof member === 'string' ? member : member.id;
    const partyMember = this.members!.get(memberId);
    if (!partyMember) throw new Error('Party member not found');

    await axios.request({
      method: 'POST',
      url: `${Endpoints.BR_PARTY}/parties/${this.id}/members/${memberId}/promote`,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      data: {}
    });
  }

  /**
   * Hides / Unhides a single party member
   * @param member The member that should be hidden
   * @param hide Whether the member should be hidden
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {PartyMemberNotFoundError} The party member wasn't found
   * @throws {EpicgamesAPIError}
   */
  async hideMember(member: string | PartyMember, hide: boolean = true): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    const memberId = typeof member === 'string' ? member : member.id;
    const partyMember = this.members!.get(memberId);
    if (!partyMember) throw new Error('Party member not found');

    if (hide) {
      this.hiddenMemberIds!.add(memberId);
    } else {
      this.hiddenMemberIds!.delete(memberId);
    }

    await this.refreshSquadAssignments();
  }

  /**
   * Hides / Unhides all party members except for the client
   * @param hide Whether all members should be hidden
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {EpicgamesAPIError}
   */
  async hideMembers(hide: boolean = true): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    if (hide) {
      this.members!.forEach(m => {
        if (m.id !== this.accountId) this.hiddenMemberIds!.add(m.id);
      });
    } else {
      this.hiddenMemberIds!.clear();
    }

    await this.refreshSquadAssignments();
  }

  /**
   * Updates the party's playlist
   * @param mnemonic The new mnemonic (Playlist id or island code, for example: playlist_defaultduo or 1111-1111-1111)
   * @param regionId? The new region id
   * @param version? The new version
   * @param options? Playlist options
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {EpicgamesAPIError}
   */
  async setPlaylist(
    mnemonic: string,
    regionId?: string,
    version?: number,
    options?: any
  ): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    const patches: Record<string, string> = {};

    const playlistData = this.meta!.set('Default:PlaylistData_j', {
      PlaylistData: {
        playlistName: mnemonic,
        tournamentId: options?.tournamentId || '',
        eventWindowId: options?.eventWindowId || '',
        linkId: {
          mnemonic: mnemonic.toLowerCase(),
          version: version || -1
        }
      }
    });
    patches['Default:PlaylistData_j'] = playlistData;

    if (regionId) {
      patches['Default:RegionId_s'] = this.meta!.set('Default:RegionId_s', regionId);
    }

    await this.sendPatch(patches);
  }

  /**
   * Updates the squad fill status of this party
   * @param fill Whether fill is enable or not
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {EpicgamesAPIError}
   */
  async setSquadFill(fill: boolean = true): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    const data = this.meta!.set('Default:AthenaSquadFill_b', fill);

    await this.sendPatch({
      'Default:AthenaSquadFill_b': data
    });
  }

  /**
   * Updates the party's max member count
   * @param maxSize The new party max size (1-16)
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {RangeError} The new max member size must be between 1 and 16 (inclusive) and more than the current member count
   * @throws {EpicgamesAPIError}
   */
  async setMaxSize(maxSize: number): Promise<void> {
    if (!this.fetched) throw new Error('Party not fetched');
    if (this.leader?.id !== this.accountId) {
      throw new Error('Party permission error: not the leader');
    }

    if (maxSize < 1 || maxSize > 16 || maxSize < this.members!.size) {
      throw new RangeError('Max size must be between 1 and 16 and greater than current member count');
    }

    this.config!.maxSize = maxSize;

    await this.sendPatch({});
  }
}

const makeCamelCase = (obj: any): any => {
  const returnObj: any = {};
  Object.keys(obj).forEach(k => {
    const key = k.replace(/_./g, x => x[1].toUpperCase());
    if (typeof obj[k] === 'object' && !Array.isArray(obj[k]) && obj[k] !== null) {
      returnObj[key] = makeCamelCase(obj[k]);
    } else {
      returnObj[key] = obj[k];
    }
  });
  return returnObj;
};

const fetchUser = async (token: string, id: string): Promise<any> => {
  const res = await axios.request({
    method: 'GET',
    url: `${Endpoints.ACCOUNT_ID}/${id}`,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return res.data;
};
