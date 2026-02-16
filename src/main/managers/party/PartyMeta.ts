import { Meta } from './Meta';
import type { PartyManager } from './PartyManager';

export const defaultPartyMeta: Record<string, string> = {
  'Default:ActivityName_s': '',
  'Default:ActivityType_s': 'Undefined',
  'Default:AllowJoinInProgress_b': 'false',
  'Default:AthenaPrivateMatch_b': 'false',
  'Default:AthenaSquadFill_b': 'true',
  'Default:CampaignInfo_j':
    '{"CampaignInfo":{"lobbyConnectionStarted":false,"matchmakingResult":"NoResults","matchmakingState":"NotMatchmaking","sessionIsCriticalMission":false,"zoneTileIndex":-1,"theaterId":"","tileStates":{"tileStates":[],"numSetBits":0}}}',
  'Default:CreativeDiscoverySurfaceRevisions_j':
    '{"CreativeDiscoverySurfaceRevisions":[]}',
  'Default:CreativePortalCountdownStartTime_s': '0001-01-01T00:00:00.000Z',
  'Default:CurrentRegionId_s': 'EU',
  'Default:CustomMatchKey_s': '',
  'Default:FortCommonMatchmakingData_j':
    '{"FortCommonMatchmakingData":{"current":{"linkId":{"mnemonic":"","version":-1},"matchmakingTransaction":"NotReady","requester":"INVALID","version":29981},"phaseUsedForCommit":"One","participantData":{"requested":{"linkId":{"mnemonic":"","version":-1},"matchmakingTransaction":"NotReady","requester":"INVALID","version":29981},"broadcast":"ReadyForRequests","version":1}}}',
  'Default:FortMatchmakingMemberData_j':
    '{"FortMatchmakingMemberData":{"current":{"members":[],"requester":"INVALID","version":1},"broadcast":"ReadyForRequests","version":1}}',
  'Default:GameSessionKey_s': '',
  'Default:LFGTime_s': '0001-01-01T00:00:00.000Z',
  'Default:MatchmakingInfoString_s': '',
  'Default:PartyIsJoinedInProgress_b': 'false',
  'Default:PartyMatchmakingInfo_j':
    '{"PartyMatchmakingInfo":{"buildId":-1,"hotfixVersion":-1,"regionId":"","playlistName":"None","playlistRevision":0,"tournamentId":"","eventWindowId":"","linkCode":""}}',
  'Default:PartyState_s': 'BattleRoyaleView',
  'Default:PlatformSessions_j': '{"PlatformSessions":[]}',
  'Default:PlaylistData_j':
    '{"PlaylistData":{"playlistName":"Playlist_DefaultSquad","tournamentId":"","eventWindowId":"","linkId":{"mnemonic":"playlist_defaultsquad","version":-1},"bGracefullyUpgraded":false,"matchmakingRulePreset":"RespectParties"}}',
  'Default:PrimaryGameSessionId_s': '',
  'Default:PrivacySettings_j':
    '{"PrivacySettings":{"partyType":"Public","partyInviteRestriction":"AnyMember","bOnlyLeaderFriendsCanJoin":false}}',
  'Default:SquadInformation_j':
    '{"SquadInformation":{"rawSquadAssignments":[],"squadData":[]}',
  'Default:RegionId_s': 'EU',
  'Default:SelectedIsland_j':
    '{"SelectedIsland":{"linkId":{"mnemonic":"playlist_defaultsquad","version":-1},"worldId":{"iD":"","ownerId":"INVALID","name":""},"sessionId":"","joinInfo":{"islandJoinability":"CanNotBeJoinedOrWatched","bIsWorldJoinable":false,"sessionKey":""}}}',
  'Default:TileStates_j': '{"TileStates":[]}',
  'Default:ZoneInstanceId_s': '',
  'urn:epic:cfg:accepting-members_b': 'true',
  'urn:epic:cfg:build-id_s': '1:3:',
  'urn:epic:cfg:can-join_b': 'true',
  'urn:epic:cfg:chat-enabled_b': 'true',
  'urn:epic:cfg:invite-perm_s': 'Anyone',
  'urn:epic:cfg:join-request-action_s': 'Manual',
  'urn:epic:cfg:party-type-id_s': 'default',
  'urn:epic:cfg:presence-perm_s': 'Anyone',
  'VoiceChat:implementation_s': 'VivoxVoiceChat'
};

export class PartyMeta extends Meta {
  public party: PartyManager;

  constructor(party: PartyManager, schema?: Record<string, string>) {
    super({ ...defaultPartyMeta });

    this.party = party;

    this.refreshSquadAssignments();
    this.updatePrivacy();
    if (schema) this.update(schema, true);
  }

  /**
   * Refreshes the member positions
   */
  refreshSquadAssignments(): string {
    let i = 0;
    const assignments: Array<{ memberId: string; absoluteMemberIdx: number }> = [];

    if (this.party.me && !this.party.hiddenMemberIds?.has(this.party.me.id)) {
      assignments.push({
        memberId: this.party.accountId,
        absoluteMemberIdx: 0
      });
      i += 1;
    }

    this.party.members?.forEach(m => {
      if (
        m.id !== this.party.accountId &&
        !this.party.hiddenMemberIds?.has(m.id)
      ) {
        assignments.push({
          memberId: m.id,
          absoluteMemberIdx: i
        });
        i += 1;
      }
    });

    return this.set('Default:SquadInformation_j', {
      SquadInformation: {
        rawSquadAssignments: assignments
      }
    });
  }

  updatePrivacy(): string {
    // Verificar que existe la configuración de privacidad
    const partyType = this.party.config?.privacy?.partyType || 'Public';
    const inviteRestriction = this.party.config?.privacy?.inviteRestriction || 'AnyMember';
    const onlyLeaderFriendsCanJoin = this.party.config?.privacy?.onlyLeaderFriendsCanJoin || false;

    return this.set('Default:PrivacySettings_j', {
      PrivacySettings: {
        partyType: partyType,
        partyInviteRestriction: inviteRestriction,
        bOnlyLeaderFriendsCanJoin: onlyLeaderFriendsCanJoin
      }
    });
  }

  /**
   * The currently selected island
   */
  get island(): any {
    return this.get('Default:SelectedIsland_j')?.SelectedIsland;
  }

  /**
   * The region ID (EU, NAE, NAW, etc.)
   */
  get regionId(): string | undefined {
    const regionId = this.get('Default:RegionId_s');
    if (typeof regionId !== 'string' || regionId.length === 0) {
      return undefined;
    }

    return regionId;
  }

  /**
   * The custom matchmaking key
   */
  get customMatchmakingKey(): string | undefined {
    const key = this.get('Default:CustomMatchKey_s');

    if (typeof key !== 'string' || key.length === 0) return undefined;
    return key;
  }

  /**
   * The squad fill status
   */
  get squadFill(): boolean {
    return !!this.get('Default:AthenaSquadFill_b');
  }
}
