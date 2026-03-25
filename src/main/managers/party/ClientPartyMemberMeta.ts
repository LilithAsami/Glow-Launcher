import { PartyMemberMeta } from './PartyMemberMeta';
import type { ClientPartyMember } from './ClientPartyMember';

export const defaultPartyMemberMeta: Record<string, string> = {
  'Default:CurrentIsland_j':
    '{"CurrentIsland":{"linkId":{"mnemonic":"","version":-1},"worldId":{"iD":"","ownerId":"INVALID","name":""},"sessionId":"","joinInfo":{"islandJoinability":"CanNotBeJoinedOrWatched","bIsWorldJoinable":false,"sessionKey":""}}}',
  'Default:ArbitraryCustomDataStore_j': '{"ArbitraryCustomDataStore":[]}',
  'Default:AthenaBannerInfo_j':
    '{"AthenaBannerInfo":{"bannerIconId":"standardbanner15","bannerColorId":"defaultcolor15","seasonLevel":1}}',
  'Default:AthenaCosmeticLoadoutVariants_j':
    '{"AthenaCosmeticLoadoutVariants":{"vL":{},"fT":false}}',
  'Default:AthenaCosmeticLoadout_j':
    '{"AthenaCosmeticLoadout":{"characterPrimaryAssetId":"","characterEKey":"","backpackDef":"None","backpackEKey":"","pickaxeDef":"/Game/Athena/Items/Cosmetics/Pickaxes/DefaultPickaxe.DefaultPickaxe","pickaxeEKey":"","contrailDef":"/Game/Athena/Items/Cosmetics/Contrails/DefaultContrail.DefaultContrail","contrailEKey":"","shoesDef":"None","shoesEKey":"","scratchpad":[],"cosmeticStats":[{"statName":"HabaneroProgression","statValue":0},{"statName":"TotalVictoryCrowns","statValue":0},{"statName":"TotalRoyalRoyales","statValue":0},{"statName":"HasCrown","statValue":0}]}}',
  'Default:BattlePassInfo_j':
    '{"BattlePassInfo":{"bHasPurchasedPass":false,"passLevel":1,"selfBoostXp":0,"friendBoostXp":0}}',
  'Default:bIsPartyUsingPartySignal_b': 'false',
  'Default:CampaignHero_j':
    '{"CampaignHero":{"heroItemInstanceId":"","heroType":""}}',
  'Default:CampaignInfo_j':
    '{"CampaignInfo":{"matchmakingLevel":0,"zoneInstanceId":"","homeBaseVersion":1}}',
  'Default:CrossplayPreference_s': 'OptedIn',
  'Default:DownloadOnDemandProgress_d': '0.000000',
  'Default:FeatDefinition_s': 'None',
  'Default:FortCommonMatchmakingData_j':
    '{"FortCommonMatchmakingData":{"request":{"linkId":{"mnemonic":"","version":-1},"matchmakingTransaction":"NotReady","requester":"INVALID","version":0},"response":"NONE","version":0}}',
  'Default:FortMatchmakingMemberData_j':
    '{"FortMatchmakingMemberData":{"request":{"members":[{"player":"","readiness":"NotReady","currentGameId":{"mnemonic":"","version":-1},"currentGameType":"UNDEFINED","currentGameSessionId":"","version":101}],"requester":"","version":1},"response":"NONE","version":1}}',
  'Default:FrontEndMapMarker_j':
    '{"FrontEndMapMarker":{"markerLocation":{"x":0,"y":0},"bIsSet":false}}',
  'Default:FrontendEmote_j':
    '{"FrontendEmote":{"pickable":"None","emoteEKey":"","emoteSection":-1}}',
  'Default:JoinInProgressData_j':
    '{"JoinInProgressData":{"request":{"target":"INVALID","time":0},"responses":[]}}',
  'Default:JoinMethod_s': 'Creation',
  'Default:LobbyState_j':
    '{"LobbyState":{"inGameReadyCheckStatus":"None","gameReadiness":"NotReady","readyInputType":"Count","currentInputType":"MouseAndKeyboard","hiddenMatchmakingDelayMax":0,"hasPreloadedAthena":false}}',
  'Default:MemberSquadAssignmentRequest_j':
    '{"MemberSquadAssignmentRequest":{"startingAbsoluteIdx":-1,"targetAbsoluteIdx":-1,"swapTargetMemberId":"INVALID","version":0}}',
  'Default:NumAthenaPlayersLeft_U': '0',
  'Default:PackedState_j':
    '{"PackedState":{"subGame":"Campaign","location":"PreLobby","gameMode":"None","voiceChatStatus":"Disabled","hasCompletedSTWTutorial":true,"hasPurchasedSTW":true,"platformSupportsSTW":true,"bDownloadOnDemandActive":false,"bIsPartyLFG":false,"bRecVoice":false,"bRecText":false,"bIsInAllSelectExperiment":false,"bAllowEmoteBeatSyncing":true,"bUploadLogs":false}}',
  'Default:PlatformData_j':
    '{"PlatformData":{"platform":{"platformDescription":{"name":"","platformType":"DESKTOP","onlineSubsystem":"None","sessionType":"","externalAccountType":"","crossplayPool":"DESKTOP"}},"uniqueId":"INVALID","sessionId":""}}',
  'Default:SharedQuests_j': '{"SharedQuests":{"bcktMap":{},"pndQst":""}}',
  'Default:SpectateInfo_j':
    '{"SpectateInfo":{"gameSessionId":"","gameSessionKey":""}}',
  'Default:UtcTimeStartedMatchAthena_s': '0001-01-01T00:00:00.000Z'
};

const defaultCharacters = [
  'CID_A_272_Athena_Commando_F_Prime',
  'CID_A_273_Athena_Commando_F_Prime_B',
  'CID_A_274_Athena_Commando_F_Prime_C',
  'CID_A_275_Athena_Commando_F_Prime_D',
  'CID_A_276_Athena_Commando_F_Prime_E',
  'CID_A_277_Athena_Commando_F_Prime_F',
  'CID_A_278_Athena_Commando_F_Prime_G',
  'CID_A_279_Athena_Commando_M_Prime',
  'CID_A_280_Athena_Commando_M_Prime_B',
  'CID_A_281_Athena_Commando_M_Prime_C',
  'CID_A_282_Athena_Commando_M_Prime_D',
  'CID_A_283_Athena_Commando_M_Prime_E',
  'CID_A_284_Athena_Commando_M_Prime_F',
  'CID_A_285_Athena_Commando_M_Prime_G'
];

const getRandomDefaultCharacter = (): string =>
  defaultCharacters[Math.floor(Math.random() * defaultCharacters.length)];

export class ClientPartyMemberMeta extends PartyMemberMeta {
  public member: ClientPartyMember;

  /**
   * @param member The party member
   * @param schema The schema
   */
  constructor(member: ClientPartyMember, schema?: Record<string, string>) {
    super({ ...defaultPartyMemberMeta });
    this.member = member;
    const defaultCharacter = getRandomDefaultCharacter();
    this.update(
      {
        'Default:AthenaCosmeticLoadout_j': JSON.stringify({
          AthenaCosmeticLoadout: {
            ...JSON.parse(
              defaultPartyMemberMeta['Default:AthenaCosmeticLoadout_j']
            ).AthenaCosmeticLoadout,
            characterPrimaryAssetId: `AthenaCharacter:${defaultCharacter}`
          }
        }),
        'Default:CampaignHero_j': JSON.stringify({
          CampaignHero: {
            heroItemInstanceId: '',
            heroType: `/Game/Athena/Heroes/${defaultCharacter.replace(
              'CID',
              'HID'
            )}.${defaultCharacter.replace('CID', 'HID')}`
          }
        }),
        'Default:PlatformData_j': JSON.stringify({
          PlatformData: {
            platform: {
              platformDescription: {
                name: 'WIN',
                platformType: 'DESKTOP',
                onlineSubsystem: 'None',
                sessionType: '',
                externalAccountType: '',
                crossplayPool: 'DESKTOP'
              }
            },
            uniqueId: 'INVALID',
            sessionId: ''
          }
        })
      },
      true
    );
    if (schema) this.update(schema, true);
  }
}
