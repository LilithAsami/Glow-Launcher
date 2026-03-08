import type { PageDefinition } from '../../shared/types';

// ─── Types ────────────────────────────────────────────────────

interface FieldDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
}

interface OpSchema {
  profileId: string;   // pipe-separated, first is default
  payload: FieldDef[];
  notes?: string;
}

// ─── Operations Schema ────────────────────────────────────────

const OPERATIONS_SCHEMA: Record<string, OpSchema> = {
  AbandonExpedition: {
    profileId: 'campaign',
    payload: [
      { name: 'expeditionId', type: 'string', required: true, description: 'Expedition Item GUID' },
    ],
  },
  ActivateConsumable: {
    profileId: 'theater0',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Consumable Item GUID' },
      { name: 'quantity', type: 'number', required: true, description: 'Amount to consume' },
      { name: 'consumeImmediately', type: 'boolean', required: false, description: 'Consume right away. Default: false' },
    ],
    notes: 'profileId can be theater0, theater1, or theater2',
  },
  AddToCollection: {
    profileId: 'collections',
    payload: [
      { name: 'collectionVariants', type: 'array', required: true, description: 'Array of {category: string, variant: string}' },
    ],
  },
  ApplyAlteration: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'alterationId', type: 'string', required: true, description: 'Alteration Template Id, e.g. Alteration:aid_att_damage_t05' },
      { name: 'alterationSlot', type: 'number', required: true, description: 'Index of the alteration slot' },
    ],
  },
  ApplyVote: {
    profileId: 'campaign',
    payload: [
      { name: 'characterTemplateId', type: 'string', required: true, description: 'Hero Template Id' },
    ],
  },
  AssignGadgetToLoadout: {
    profileId: 'campaign',
    payload: [
      { name: 'loadoutId', type: 'string', required: true, description: 'Loadout Item GUID' },
      { name: 'gadgetId', type: 'string', required: true, description: 'Gadget Template Id to assign' },
      { name: 'gadgetIndex', type: 'number', required: true, description: 'Gadget Slot Index (0 or 1)' },
    ],
  },
  AssignHeroToLoadout: {
    profileId: 'campaign',
    payload: [
      { name: 'loadoutId', type: 'string', required: true, description: 'Loadout Item GUID' },
      { name: 'slotIndex', type: 'number', required: true, description: 'Hero Slot Index (0=CommanderSlot, 1-5=SupportTeam)' },
      { name: 'heroId', type: 'string', required: true, description: 'Hero Item GUID (or empty for AccountLevel items)' },
    ],
  },
  AssignTeamPerkToLoadout: {
    profileId: 'campaign',
    payload: [
      { name: 'loadoutId', type: 'string', required: true, description: 'Loadout Item GUID' },
      { name: 'teamPerkId', type: 'string', required: true, description: 'TeamPerk Item GUID' },
    ],
  },
  AssignWorkerToSquad: {
    profileId: 'campaign',
    payload: [
      { name: 'squadId', type: 'string', required: true, description: 'Squad Id, e.g. Squad_Attribute_Medicine_EMTSquad' },
      { name: 'slotIdx', type: 'number', required: true, description: 'Slot index within the squad' },
      { name: 'itemId', type: 'string', required: true, description: 'Survivor Item GUID' },
    ],
  },
  AssignWorkerToSquadBatch: {
    profileId: 'campaign',
    payload: [
      { name: 'assignments', type: 'array', required: true, description: 'Array of {squadId: string, slotIdx: number, itemId: string}' },
    ],
  },
  AthenaPinQuest: {
    profileId: 'athena',
    payload: [
      { name: 'questId', type: 'string', required: true, description: 'Quest Item GUID to pin' },
    ],
  },
  AthenaRemoveQuests: {
    profileId: 'athena',
    payload: [
      { name: 'questsToRemove', type: 'array', required: true, description: 'Array of Quest Item GUIDs to remove' },
    ],
  },
  AthenaTrackQuests: {
    profileId: 'athena',
    payload: [
      { name: 'questsToTrack', type: 'array', required: true, description: 'Array of Quest Item GUIDs to track' },
    ],
  },
  BulkUpdateCollections: {
    profileId: 'collections',
    payload: [
      { name: 'collectionVariants', type: 'array', required: true, description: 'Array of {category: string, variant: string, count: number}' },
    ],
  },
  CancelOrResumeSubscription: {
    profileId: 'common_core',
    payload: [
      { name: 'subscriptionId', type: 'string', required: true, description: 'Subscription Id (from profile)' },
      { name: 'bCancel', type: 'boolean', required: true, description: 'true to cancel, false to resume' },
    ],
  },
  ChallengeBundleLevelUp: {
    profileId: 'athena',
    payload: [
      { name: 'bundleId', type: 'string', required: true, description: 'Challenge Bundle GUID' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  ClaimCollectedResources: {
    profileId: 'campaign',
    payload: [
      { name: 'diffId', type: 'string', required: false, description: 'Diff Id (usually empty)' },
    ],
    notes: 'profileId can be campaign, theater0, theater1, or theater2',
  },
  ClaimCollectionBookPageRewards: {
    profileId: 'campaign',
    payload: [
      { name: 'pageTemplateId', type: 'string', required: true, description: 'Collection Book Page Template Id' },
      { name: 'rewardItemId', type: 'string', required: false, description: 'Reward Item GUID (if multiple rewards exist)' },
    ],
  },
  ClaimCollectionBookRewards: {
    profileId: 'campaign',
    payload: [
      { name: 'level', type: 'number', required: true, description: 'Collection Book Level to claim reward for' },
    ],
  },
  ClaimDifficultyIncreaseRewards: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required',
  },
  ClaimImportFriendsReward: {
    profileId: 'common_core',
    payload: [],
    notes: 'No payload required',
  },
  ClaimLoginReward: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. profileId can be campaign or athena.',
  },
  ClaimMfaEnabled: {
    profileId: 'common_core',
    payload: [
      { name: 'bClaimForStw', type: 'boolean', required: true, description: 'true to claim the StW Hero reward, false for BR reward' },
    ],
  },
  ClaimMissionAlertRewards: {
    profileId: 'campaign',
    payload: [
      { name: 'missionAlertId', type: 'string', required: true, description: 'Mission Alert GUID' },
      { name: 'zoneId', type: 'string', required: true, description: 'Zone (Outpost) GUID' },
    ],
  },
  ClaimQuestReward: {
    profileId: 'campaign',
    payload: [
      { name: 'questId', type: 'string', required: true, description: 'Quest Item GUID' },
      { name: 'selectedRewardIndex', type: 'number', required: false, description: 'Index of the reward to select (if multiple)' },
    ],
    notes: 'profileId can be campaign or athena',
  },
  ClaimSubscriptionRewards: {
    profileId: 'common_core',
    payload: [
      { name: 'subscriptionId', type: 'string', required: true, description: 'Subscription Id (from profile)' },
      { name: 'expectedTotalRewardsGranted', type: 'number', required: true, description: 'Expected total rewards granted (from profile)' },
    ],
  },
  ClearHeroLoadout: {
    profileId: 'campaign',
    payload: [
      { name: 'loadoutId', type: 'string', required: true, description: 'Loadout Item GUID' },
    ],
  },
  ClientQuestLogin: {
    profileId: 'athena',
    payload: [
      { name: 'streamingAppKey', type: 'string', required: false, description: 'Can be left empty. Used for GeForceNow or XboxCloud.' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  CollectExpedition: {
    profileId: 'campaign',
    payload: [
      { name: 'expeditionTemplate', type: 'string', required: true, description: 'Expedition Item Template Id, e.g. Expedition:expedition_sea_supplyrun_long_t04' },
      { name: 'expeditionId', type: 'string', required: true, description: 'Expedition Item GUID' },
    ],
  },
  CompletePlayerSurvey: {
    profileId: 'common_core',
    payload: [
      { name: 'surveyId', type: 'string', required: true, description: 'Survey Id, e.g. 220320_Overall Health_FNC' },
      { name: 'bUpdateAllSurveysMetadata', type: 'boolean', required: false, description: 'Whether survey_data.allSurveysMetadata should update' },
    ],
  },
  ConsumeItems: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID to consume' },
      { name: 'quantity', type: 'number', required: true, description: 'Amount to consume' },
    ],
  },
  ConvertItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'conversionIndex', type: 'number', required: true, description: 'Index if more than 1 option (e.g. Obsidian vs Shadowshard)' },
    ],
  },
  ConvertLegacyAlterations: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Schematic Item GUID' },
    ],
  },
  ConvertSlottedItem: {
    profileId: 'collection_book_people0',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'ConversionIndex', type: 'number', required: true, description: 'Index if more than 1 option (e.g. Obsidian vs Shadowshard)' },
    ],
    notes: 'profileId can be collection_book_people0 or collection_book_schematics0',
  },
  CopyCosmeticLoadout: {
    profileId: 'athena',
    payload: [
      { name: 'sourceIndex', type: 'number', required: true, description: 'Index of the Loadout to copy' },
      { name: 'targetIndex', type: 'number', required: true, description: 'Index of the preset to set the loadout to' },
      { name: 'optNewNameForTarget', type: 'string', required: false, description: 'New name for the target loadout' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  CraftWorldItem: {
    profileId: 'theater0',
    payload: [
      { name: 'targetSchematicItemId', type: 'string', required: true, description: 'Schematic Item GUID' },
      { name: 'numTimesToCraft', type: 'number', required: true, description: 'Quantity of the item to craft' },
      { name: 'targetSchematicTier', type: 'string', required: true, description: 'Item tier as lowercased Roman numeral, e.g. ii' },
    ],
  },
  CreateDeployableBaseItem: {
    profileId: 'outpost0',
    payload: [],
    notes: 'No documented schema',
  },
  CreateNewBattleLabFile: {
    profileId: 'creative',
    payload: [
      { name: 'templateId', type: 'string', required: true, description: 'Island GUID' },
      { name: 'locale', type: 'string', required: true, description: 'Locale, e.g. en' },
      { name: 'title', type: 'string', required: true, description: 'Battle Lab file title' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  CreateNewIsland: {
    profileId: 'creative',
    payload: [
      { name: 'templateId', type: 'string', required: true, description: 'Island GUID' },
      { name: 'locale', type: 'string', required: true, description: 'Island locale, e.g. en' },
      { name: 'title', type: 'string', required: true, description: 'Island title' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  CreateNewIslandFromLinkCode: {
    profileId: 'creative',
    payload: [
      { name: 'linkCode', type: 'string', required: true, description: 'Island code, e.g. 1111-2222-3333' },
      { name: 'locale', type: 'string', required: true, description: 'Locale' },
      { name: 'title', type: 'string', required: true, description: 'New island title' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  CreateOrUpgradeOutpostItem: {
    profileId: 'outpost0',
    payload: [],
    notes: 'No documented schema',
  },
  DeleteBattleLabIsland: {
    profileId: 'creative',
    payload: [],
    notes: 'No payload required',
  },
  DeleteCosmeticLoadout: {
    profileId: 'athena',
    payload: [
      { name: 'index', type: 'number', required: true, description: 'Cosmetic Loadout Index' },
      { name: 'fallbackLoadoutIndex', type: 'number', required: false, description: 'Fallback loadout index (-1 for none)' },
      { name: 'leaveNullSlot', type: 'boolean', required: false, description: 'Whether to leave a null slot' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  DeleteIsland: {
    profileId: 'creative',
    payload: [
      { name: 'plotItemId', type: 'string', required: true, description: 'Island GUID' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  DeleteModularCosmeticLoadout: {
    profileId: 'athena',
    payload: [
      { name: 'loadoutType', type: 'string', required: true, description: 'Loadout type, e.g. CosmeticLoadout:LoadoutSchema_Platform' },
      { name: 'presetId', type: 'number', required: true, description: 'Loadout index' },
    ],
  },
  DepositPostResources: {
    profileId: 'theater0',
    payload: [
      { name: 'itemsToDepositIds', type: 'array', required: true, description: 'Array of item GUIDs to deposit' },
      { name: 'itemCountsToDeposit', type: 'array', required: true, description: 'Array of item quantities to deposit' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  DestroyWorldItems: {
    profileId: 'outpost0',
    payload: [
      { name: 'itemIds', type: 'array', required: true, description: 'Item GUIDs to destroy (no resources returned)' },
    ],
    notes: 'profileId can be outpost0, theater0, theater1, or theater2',
  },
  DisassembleWorldItems: {
    profileId: 'theater0',
    payload: [
      { name: 'targetItemIdAndQuantityPairs', type: 'array', required: true, description: 'Array of {itemId: string, quantity: number}' },
    ],
    notes: 'profileId can be theater0, theater1, or theater2',
  },
  DuplicateIsland: {
    profileId: 'creative',
    payload: [
      { name: 'islandId', type: 'string', required: true, description: 'Island GUID' },
      { name: 'locale', type: 'string', required: true, description: 'Locale, e.g. en' },
      { name: 'newTitle', type: 'string', required: true, description: 'Title for the duplicated island' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  EarnScore: {
    profileId: 'campaign',
    payload: [],
    notes: 'No documented schema',
  },
  EndBattleRoyaleGame: {
    profileId: 'athena',
    payload: [
      { name: 'advance', type: 'array', required: false, description: 'Array of {statName, count, timestampOffset}' },
      { name: 'playlistId', type: 'string', required: false, description: 'Playlist identifier' },
      { name: 'matchStats', type: 'object', required: false, description: 'Match stats object' },
      { name: 'totalXPAccum', type: 'number', required: false, description: 'Total XP accumulated' },
      { name: 'restedXPAccum', type: 'number', required: false, description: 'Rested XP accumulated' },
      { name: 'accolades', type: 'array', required: false, description: 'Array of {accoladeDef, templateId, count}' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  EndBattleRoyaleGameV2: {
    profileId: 'athena',
    payload: [
      { name: 'playlistId', type: 'string', required: true, description: 'Playlist identifier' },
      { name: 'bDidPlayerWin', type: 'boolean', required: true, description: 'Whether the player won' },
      { name: 'victoryCrownData', type: 'object', required: false, description: 'Victory crown data object' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  EndPrimaryMission: {
    profileId: 'campaign',
    payload: [],
    notes: 'No documented schema',
  },
  EquipBattleRoyaleCustomization: {
    profileId: 'athena',
    payload: [
      { name: 'slotName', type: 'string', required: true, description: 'Slot name, e.g. Character, Backpack, Dance, SkyDiveContrail, LoadingScreen, MusicPack' },
      { name: 'itemToSlot', type: 'string', required: true, description: 'Item Template Id to equip, e.g. AthenaCharacter:CID_001_Athena_Commando_F_Default' },
      { name: 'indexWithinSlot', type: 'number', required: false, description: '0 normally; for Dance: 0-5; for ItemWrap: 0-6' },
      { name: 'variantUpdates', type: 'array', required: false, description: 'Array of {channel, active, owned} variant objects' },
    ],
  },
  EquipCharCosmetic: {
    profileId: 'campaign',
    payload: [
      { name: 'heroId', type: 'string', required: true, description: 'Hero Item GUID' },
      { name: 'outfitId', type: 'string', required: true, description: 'Outfit Item GUID' },
      { name: 'backpackId', type: 'string', required: false, description: 'Back Bling Item GUID' },
    ],
  },
  EquipModularCosmeticLoadoutPreset: {
    profileId: 'athena',
    payload: [
      { name: 'loadoutType', type: 'string', required: true, description: 'Loadout type, e.g. CosmeticLoadout:LoadoutSchema_Platform' },
      { name: 'presetId', type: 'number', required: true, description: 'Loadout index' },
    ],
  },
  ExchangeGameCurrencyForBattlePassOffer: {
    profileId: 'athena',
    payload: [
      { name: 'offerItemIdList', type: 'array', required: true, description: 'Battle Pass Item Offer Ids' },
      { name: 'additionalData', type: 'object', required: false, description: 'Additional context object' },
    ],
  },
  ExchangeGameCurrencyForSeasonPassOffer: {
    profileId: 'athena',
    payload: [
      { name: 'offerItemIdList', type: 'array', required: true, description: 'Season Pass Item Offer Ids' },
      { name: 'seasonPassTemplateId', type: 'string', required: true, description: 'Season Pass Template Id, e.g. AthenaSeason:athenaseason35' },
      { name: 'additionalData', type: 'object', required: false, description: 'Additional context object' },
    ],
  },
  ExchangeGiftToken: {
    profileId: 'athena',
    payload: [],
    notes: 'No payload required. Used to redeem the Glow Skin gift token (2019).',
  },
  FortRerollDailyQuest: {
    profileId: 'athena',
    payload: [
      { name: 'questId', type: 'string', required: true, description: 'Quest Item GUID' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  GetMcpTimeForLogin: {
    profileId: 'common_core',
    payload: [],
    notes: 'No documented schema',
  },
  GiftCatalogEntry: {
    profileId: 'common_core',
    payload: [
      { name: 'offerId', type: 'string', required: true, description: 'Offer Id from the catalog' },
      { name: 'currency', type: 'string', required: true, description: 'Currency type from offer' },
      { name: 'currencySubType', type: 'string', required: true, description: 'Currency sub-type from offer' },
      { name: 'expectedTotalPrice', type: 'number', required: true, description: 'Expected total price' },
      { name: 'receiverAccountIds', type: 'array', required: true, description: "Friends' Account Ids" },
      { name: 'gameContext', type: 'string', required: false, description: 'Game context, e.g. Frontend.CatabaScreen' },
      { name: 'giftWrapTemplateId', type: 'string', required: false, description: 'Empty string or GiftBox:GB_GiftWrap1 through 4' },
      { name: 'personalMessage', type: 'string', required: false, description: 'Personal message' },
    ],
  },
  IncrementNamedCounterStat: {
    profileId: 'campaign',
    payload: [
      { name: 'statName', type: 'string', required: true, description: 'Stat name to increment' },
      { name: 'increment', type: 'number', required: true, description: 'Amount to increment by' },
    ],
  },
  InitializeTheater: {
    profileId: 'theater0',
    payload: [
      { name: 'theaterGuid', type: 'string', required: true, description: 'Theater GUID from World Info API' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  IssueFriendCode: {
    profileId: 'common_core',
    payload: [
      { name: 'codeTokenType', type: 'string', required: true, description: 'Type of token to issue' },
    ],
  },
  LockProfileForWrite: {
    profileId: 'theater0',
    payload: [
      { name: 'code', type: 'string', required: true, description: 'Lock code' },
      { name: 'timeout', type: 'number', required: true, description: 'How long (ms) the write should be locked' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  MarkCollectedItemsSeen: {
    profileId: 'collections',
    payload: [
      { name: 'variants', type: 'array', required: true, description: 'Array of {category: string, variant: string}' },
    ],
  },
  MarkItemSeen: {
    profileId: 'athena',
    payload: [
      { name: 'itemIds', type: 'array', required: true, description: 'Item GUIDs to mark as seen' },
    ],
    notes: 'profileId can be athena, campaign, or common_core',
  },
  MarkNewQuestNotificationSent: {
    profileId: 'athena',
    payload: [
      { name: 'itemIds', type: 'array', required: true, description: 'Quest Item GUIDs' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  ModifyCreativePlotPermissions: {
    profileId: 'creative',
    payload: [
      { name: 'plotItemId', type: 'string', required: true, description: 'Island GUID' },
      { name: 'permission', type: 'string', required: true, description: 'Private or Public' },
      { name: 'accountIds', type: 'array', required: false, description: 'Account Ids' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  ModifyMission: {
    profileId: 'campaign',
    payload: [
      { name: 'matchmakingSessionId', type: 'string', required: true, description: 'Matchmaking session ID' },
      { name: 'difficulty', type: 'string', required: true, description: 'New difficulty level' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  ModifyQuickbar: {
    profileId: 'theater0',
    payload: [
      { name: 'primaryQuickbarChoices', type: 'array', required: true, description: 'Array with 3 elements - Item GUID or empty string for empty slot' },
      { name: 'secondaryQuickbarChoice', type: 'string', required: true, description: 'Selected Trap Item GUID' },
    ],
    notes: 'profileId can be theater0, theater1, or theater2',
  },
  OpenCardPack: {
    profileId: 'campaign',
    payload: [
      { name: 'cardPackItemId', type: 'string', required: true, description: 'CardPack Item GUID' },
      { name: 'selectionIdx', type: 'number', required: false, description: 'Index of selected reward when multiple rewards exist' },
    ],
  },
  OpenCardPackBatch: {
    profileId: 'campaign',
    payload: [
      { name: 'cardPackItemIds', type: 'array', required: true, description: 'CardPack Item GUIDs' },
    ],
  },
  PopulatePrerolledOffers: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. Prerolls XRAY Llamas.',
  },
  PromoteItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID to supercharge' },
    ],
    notes: 'profileId can be campaign, collection_book_people0, or collection_book_schematics0',
  },
  ProtoJuno_CreateWorld: {
    profileId: 'proto_juno',
    payload: [
      { name: 'world_metadata', type: 'object', required: true, description: 'World metadata object' },
    ],
    notes: 'Deprecated LEGO test operation (removed)',
  },
  ProtoJuno_DeleteAllWorlds: {
    profileId: 'proto_juno',
    payload: [],
    notes: 'Deprecated. No payload required.',
  },
  ProtoJuno_DeleteWorld: {
    profileId: 'proto_juno',
    payload: [
      { name: 'worldId', type: 'string', required: true, description: 'World Profile Item GUID' },
    ],
    notes: 'Deprecated LEGO test operation (removed)',
  },
  ProtoJuno_MarkWorldDeleted: {
    profileId: 'proto_juno',
    payload: [
      { name: 'worldId', type: 'string', required: true, description: 'World Profile Item GUID' },
    ],
    notes: 'Deprecated LEGO test operation (removed)',
  },
  ProtoJuno_SetWorldName: {
    profileId: 'proto_juno',
    payload: [
      { name: 'worldId', type: 'string', required: true, description: 'World Profile Item GUID' },
      { name: 'name', type: 'string', required: true, description: 'New world name' },
    ],
    notes: 'Deprecated LEGO test operation (removed)',
  },
  ProtoJuno_UpdateWorldLastAccessTime: {
    profileId: 'proto_juno',
    payload: [
      { name: 'worldId', type: 'string', required: true, description: 'World Profile Item GUID' },
    ],
    notes: 'Deprecated LEGO test operation (removed)',
  },
  ProtoJuno_UpdateWorldMetadata: {
    profileId: 'proto_juno',
    payload: [
      { name: 'worldId', type: 'string', required: true, description: 'World Profile Item GUID' },
      { name: 'worldMetadata', type: 'object', required: true, description: 'Updated world metadata object' },
    ],
    notes: 'Deprecated LEGO test operation (removed)',
  },
  ProtoJuno_UpdateWorldSysMetadata: {
    profileId: 'proto_juno',
    payload: [
      { name: 'worldId', type: 'string', required: true, description: 'World Profile Item GUID' },
      { name: 'sysMetadata', type: 'object', required: true, description: 'Updated system metadata object' },
    ],
    notes: 'DedicatedServer ONLY. Deprecated.',
  },
  PurchaseCatalogEntry: {
    profileId: 'common_core',
    payload: [
      { name: 'offerId', type: 'string', required: true, description: 'Offer Id from catalog' },
      { name: 'purchaseQuantity', type: 'number', required: true, description: 'How many times to purchase the offer' },
      { name: 'currency', type: 'string', required: true, description: 'Currency type from offer' },
      { name: 'currencySubType', type: 'string', required: true, description: 'Currency sub-type from offer' },
      { name: 'expectedTotalPrice', type: 'number', required: true, description: 'Expected total price' },
      { name: 'gameContext', type: 'string', required: false, description: 'Game context, e.g. Frontend.CatabaScreen' },
    ],
  },
  PurchaseHomebaseNode: {
    profileId: 'campaign',
    payload: [
      { name: 'nodeId', type: 'string', required: true, description: 'Node Template Id, e.g. HomebaseNode:skilltree_airstrike' },
    ],
  },
  PurchaseMultipleCatalogEntries: {
    profileId: 'common_core',
    payload: [
      { name: 'purchaseInfoList', type: 'array', required: true, description: 'Array of purchase objects: [{offerId, purchaseQuantity, currency, currencySubType, expectedTotalPrice, gameContext}]' },
    ],
  },
  PurchaseOrUpgradeHomebaseNode: {
    profileId: 'campaign',
    payload: [
      { name: 'nodeId', type: 'string', required: true, description: 'Node Template Id, e.g. HomebaseNode:skilltree_airstrike' },
    ],
  },
  PurchaseResearchStatUpgrade: {
    profileId: 'campaign',
    payload: [
      { name: 'statId', type: 'string', required: true, description: 'Valid values: fortitude, offense, resistance, technology' },
    ],
  },
  PutModularCosmeticLoadout: {
    profileId: 'athena',
    payload: [
      { name: 'loadoutType', type: 'string', required: true, description: 'Loadout schema type: CosmeticLoadout:LoadoutSchema_Character|Emotes|Wraps|Platform|Sparks|Jam|Vehicle' },
      { name: 'presetId', type: 'number', required: true, description: 'Loadout preset index' },
      { name: 'loadoutData', type: 'string', required: true, description: 'Stringified JSON with slots array and optional display_name' },
    ],
  },
  QueryProfile: {
    profileId: 'athena',
    payload: [],
    notes: 'No payload required. Downloads the full profile. profileId can be any profile.',
  },
  QueryPublicProfile: {
    profileId: 'common_public',
    payload: [],
    notes: 'No payload required. Downloads the public profile. Uses /public/ route.',
  },
  RecordCampaignMatchEnded: {
    profileId: 'athena',
    payload: [],
    notes: 'No payload required. Usage unknown.',
  },
  RecycleItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
    ],
  },
  RecycleItemBatch: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemIds', type: 'array', required: true, description: 'Item GUIDs' },
    ],
  },
  RedeemRealMoneyPurchases: {
    profileId: 'common_core',
    payload: [
      { name: 'appStore', type: 'string', required: true, description: 'App store, e.g. EpicPurchasingService' },
      { name: 'authTokens', type: 'array', required: false, description: 'Auth tokens from auth response' },
      { name: 'receiptIds', type: 'array', required: false, description: 'Receipt Ids to refresh' },
      { name: 'refreshType', type: 'string', required: false, description: 'Enum: Default|UpdateOfflineAuth|ForceAll|ForceCurrent' },
      { name: 'purchaseCorrelationId', type: 'string', required: false, description: 'Purchase correlation ID' },
    ],
  },
  RedeemSTWAccoladeTokens: {
    profileId: 'athena',
    payload: [],
    notes: 'No payload required. Transfers BR XP gained in StW to BR.',
  },
  RefreshExpeditions: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. Generates expeditions.',
  },
  RefundItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
    ],
  },
  RefundMtxPurchase: {
    profileId: 'common_core',
    payload: [
      { name: 'purchaseId', type: 'string', required: true, description: 'Purchase ID from Purchase History profile stat' },
      { name: 'quickReturn', type: 'boolean', required: true, description: 'Whether to use the Cancel Purchase feature' },
      { name: 'gameContext', type: 'string', required: false, description: 'Game context, e.g. Frontend.AthenaLobby or empty string' },
    ],
  },
  RemoveGiftBox: {
    profileId: 'athena',
    payload: [
      { name: 'giftBoxItemIds', type: 'array', required: true, description: 'Giftbox Item GUIDs to remove' },
    ],
    notes: 'profileId can be any profile',
  },
  ReportConsumableUsed: {
    profileId: 'athena',
    payload: [
      { name: 'usedQuantity', type: 'number', required: true, description: 'Item quantity used' },
      { name: 'itemType', type: 'string', required: true, description: 'Item Template Id' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  RequestRestedStateIncrease: {
    profileId: 'athena',
    payload: [
      { name: 'timeToCompensateFor', type: 'number', required: true, description: 'Time in seconds rested at the campfire' },
      { name: 'restedXpGenAccumulated', type: 'number', required: true, description: 'Amount of Supercharged XP to add' },
    ],
    notes: 'Only works during Winterfest',
  },
  ResearchItemFromCollectionBook: {
    profileId: 'campaign',
    payload: [
      { name: 'templateId', type: 'string', required: true, description: 'Item Template Id' },
    ],
    notes: 'profileId can be campaign, theater0, theater1, or theater2',
  },
  RespecAlteration: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'alterationSlot', type: 'number', required: true, description: 'Perk Index' },
      { name: 'alterationId', type: 'string', required: true, description: 'Perk Template Id, e.g. Alteration:aid_att_damage_t05' },
    ],
  },
  RespecResearch: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. Resets StW Research Levels.',
  },
  RespecUpgrades: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. Resets StW Upgrade Levels.',
  },
  RestoreDeletedIsland: {
    profileId: 'creative',
    payload: [
      { name: 'plotItemId', type: 'string', required: true, description: 'Island GUID' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  ServerQuestLogin: {
    profileId: 'athena',
    payload: [
      { name: 'matchmakingSessionId', type: 'string', required: true, description: 'Matchmaking session ID' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  SetActiveArchetype: {
    profileId: 'athena',
    payload: [
      { name: 'archetypeGroup', type: 'string', required: true, description: 'Loadout archetype to modify, e.g. CosmeticArchetype:LoadoutArchetype_Vehicles' },
      { name: 'archetype', type: 'string', required: true, description: 'Archetype group tag, e.g. Vehicle.Archetype.SUV' },
    ],
  },
  SetActiveHeroLoadout: {
    profileId: 'campaign',
    payload: [
      { name: 'selectedLoadout', type: 'string', required: true, description: 'Loadout Item GUID' },
    ],
  },
  SetAffiliateName: {
    profileId: 'common_core',
    payload: [
      { name: 'affiliateName', type: 'string', required: true, description: 'Support-A-Creator code to support' },
    ],
  },
  SetBattleRoyaleBanner: {
    profileId: 'athena',
    payload: [
      { name: 'homebaseBannerIconId', type: 'string', required: true, description: 'Banner icon asset name, e.g. standardbanner1' },
      { name: 'homebaseBannerColorId', type: 'string', required: true, description: 'Banner color asset name, e.g. defaultcolor2' },
    ],
  },
  SetCosmeticLockerBanner: {
    profileId: 'athena',
    payload: [
      { name: 'lockerItem', type: 'string', required: true, description: 'Locker Item GUID' },
      { name: 'bannerIconTemplateName', type: 'string', required: true, description: 'Banner Icon Id, e.g. brs10level100' },
      { name: 'bannerColorTemplateName', type: 'string', required: true, description: 'Banner Color Id, e.g. defaultcolor10' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  SetCosmeticLockerName: {
    profileId: 'athena',
    payload: [
      { name: 'lockerItem', type: 'string', required: true, description: 'Locker Item GUID' },
      { name: 'name', type: 'string', required: true, description: 'New loadout name' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  SetCosmeticLockerSlot: {
    profileId: 'athena',
    payload: [
      { name: 'lockerItem', type: 'string', required: true, description: 'Locker Item GUID' },
      { name: 'category', type: 'string', required: true, description: 'Category, e.g. Character, Backpack, Dance, ItemWrap, SkyDiveContrail' },
      { name: 'itemToSlot', type: 'string', required: true, description: 'Cosmetic to equip, e.g. AthenaCharacter:CID_029_Athena_Commando_F_Halloween' },
      { name: 'slotIndex', type: 'number', required: true, description: '0 normally, -1 for all wrap slots, 0-5 for emotes, 0-6 for wraps' },
      { name: 'variantUpdates', type: 'array', required: false, description: 'Array of {channel, active, owned} variant update objects' },
      { name: 'optLockerUseCountOverride', type: 'number', required: false, description: 'Unknown override value' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  SetCosmeticLockerSlots: {
    profileId: 'athena',
    payload: [
      { name: 'lockerItem', type: 'string', required: true, description: 'Locker Item GUID' },
      { name: 'loadoutData', type: 'array', required: true, description: 'Array of {category, itemToSlot, slotIndex, variantUpdates} objects' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  SetCreativePlotMetadata: {
    profileId: 'creative',
    payload: [
      { name: 'plotItemId', type: 'string', required: true, description: 'Island GUID' },
      { name: 'locale', type: 'string', required: true, description: 'Language code, e.g. de' },
      { name: 'title', type: 'string', required: true, description: 'Island title' },
      { name: 'tagline', type: 'string', required: false, description: 'Island tagline' },
      { name: 'DescriptionTags', type: 'array', required: false, description: 'String array of tags describing the island' },
      { name: 'youtubeVideoId', type: 'string', required: false, description: 'YouTube video ID for the island trailer' },
      { name: 'introduction', type: 'string', required: false, description: 'Island introduction text' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  SetForcedIntroPlayed: {
    profileId: 'common_core',
    payload: [
      { name: 'forcedIntroName', type: 'string', required: true, description: "The forced intro's name/codename, e.g. Coconut" },
    ],
  },
  SetGameplayStats: {
    profileId: 'campaign',
    payload: [
      { name: 'gameplayStats', type: 'array', required: true, description: 'Array of {statName: string, statValue: number}' },
    ],
  },
  SetHardcoreModifier: {
    profileId: 'athena',
    payload: [
      { name: 'updates', type: 'array', required: true, description: 'Array of {modifierId: string (e.g. HardcoreModifier:hcmod_003_nobuilding), bEnabled: boolean}' },
    ],
  },
  SetHeroCosmeticVariants: {
    profileId: 'campaign',
    payload: [
      { name: 'heroItem', type: 'string', required: true, description: 'Hero item GUID' },
      { name: 'outfitVariants', type: 'array', required: true, description: 'Array of {channel, active, owned} outfit variant objects' },
      { name: 'backblingVariants', type: 'array', required: false, description: 'Array of {channel, active, owned} back bling variant objects' },
    ],
  },
  SetHomebaseBanner: {
    profileId: 'common_public',
    payload: [
      { name: 'homebaseBannerIconId', type: 'string', required: true, description: 'Banner icon asset name, e.g. standardbanner1' },
      { name: 'homebaseBannerColorId', type: 'string', required: true, description: 'Banner color asset name, e.g. defaultcolor2' },
    ],
  },
  SetHomebaseName: {
    profileId: 'common_public',
    payload: [
      { name: 'homebaseName', type: 'string', required: true, description: 'New homebase name' },
    ],
    notes: 'Deprecated',
  },
  SetIntroGamePlayed: {
    profileId: 'common_core',
    payload: [],
    notes: 'No payload required. Removed in latest FN.',
  },
  SetItemArchivedStatusBatch: {
    profileId: 'athena',
    payload: [
      { name: 'itemIds', type: 'array', required: true, description: 'Array of Item GUIDs' },
      { name: 'archived', type: 'boolean', required: true, description: 'Whether the items should be archived' },
    ],
  },
  SetItemFavoriteStatus: {
    profileId: 'athena',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'GUID of the item' },
      { name: 'bFavorite', type: 'boolean', required: true, description: 'Whether the item should be favorited' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  SetItemFavoriteStatusBatch: {
    profileId: 'athena',
    payload: [
      { name: 'itemIds', type: 'array', required: true, description: 'Array of Item GUIDs' },
      { name: 'itemFavStatus', type: 'array', required: true, description: 'Array of booleans specifying new favorite state for each indexed item' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  SetLastUsedBattleLabFile: {
    profileId: 'creative',
    payload: [
      { name: 'plotItemId', type: 'string', required: true, description: 'Island GUID' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  SetLastUsedCreativePlot: {
    profileId: 'creative',
    payload: [
      { name: 'plotItemId', type: 'string', required: true, description: 'Island GUID (sets portal to island in hub)' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  SetLastUsedProject: {
    profileId: 'creative',
    payload: [
      { name: 'projectID', type: 'string', required: true, description: 'UEFN Project GUID' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  SetLoadoutName: {
    profileId: 'athena',
    payload: [
      { name: 'lockerItem', type: 'string', required: true, description: 'Locker Item GUID' },
      { name: 'name', type: 'string', required: true, description: 'New loadout name' },
    ],
  },
  SetLoadoutShuffleEnabled: {
    profileId: 'athena',
    payload: [
      { name: 'loadoutType', type: 'string', required: true, description: 'Loadout section, e.g. :LoadoutSchema_Jam' },
      { name: 'bEnabled', type: 'boolean', required: true, description: 'Whether shuffle is enabled' },
    ],
  },
  SetMatchmakingBansViewed: {
    profileId: 'common_core',
    payload: [],
    notes: 'No payload required. Errors if no bans exist.',
  },
  SetMtxPlatform: {
    profileId: 'common_core',
    payload: [
      { name: 'newPlatform', type: 'string', required: true, description: 'Platform: WeGame|EpicPCKorea|Epic|EpicPC|EpicAndroid|PSN|Live|IOSAppStore|Nintendo|Samsung|GooglePlay|Shared' },
    ],
  },
  SetPartyAssistQuest: {
    profileId: 'athena',
    payload: [
      { name: 'questToPinAsPartyAssist', type: 'string', required: true, description: 'Quest Item GUID. Empty string to remove current active quest.' },
    ],
    notes: 'Deprecated',
  },
  SetPinnedQuests: {
    profileId: 'campaign',
    payload: [
      { name: 'pinnedQuestIds', type: 'array', required: true, description: 'Array of quest GUIDs to pin' },
    ],
  },
  SetRandomCosmeticLoadoutFlag: {
    profileId: 'athena',
    payload: [
      { name: 'random', type: 'boolean', required: true, description: 'true to use a random cosmetic loadout, false otherwise' },
    ],
    notes: 'profileId can be athena or campaign',
  },
  SetReceiveGiftsEnabled: {
    profileId: 'common_core',
    payload: [
      { name: 'bReceiveGifts', type: 'boolean', required: true, description: 'true to enable receiving gifts, false to disable' },
    ],
  },
  SetRewardGraphConfig: {
    profileId: 'athena',
    payload: [
      { name: 'state', type: 'array', required: true, description: 'Array of state strings' },
      { name: 'rewardGraphId', type: 'string', required: true, description: 'RewardGraph Item GUID' },
    ],
  },
  SetSeasonPassAutoClaim: {
    profileId: 'athena',
    payload: [
      { name: 'seasonIds', type: 'array', required: true, description: 'Pass IDs: br (Battle Royale), figment (OG), musicpass (Festival), juno (LEGO)' },
      { name: 'bEnabled', type: 'boolean', required: true, description: 'Whether to enable Auto-Claim' },
    ],
  },
  SkipTutorial: {
    profileId: 'campaign',
    payload: [],
    notes: 'No payload required. Skips the Save the World tutorial.',
  },
  StartExpedition: {
    profileId: 'campaign',
    payload: [
      { name: 'expeditionId', type: 'string', required: true, description: 'Expedition GUID' },
      { name: 'squadId', type: 'string', required: true, description: 'Squad Id' },
      { name: 'itemIds', type: 'array', required: true, description: 'Array of hero GUIDs to use' },
      { name: 'slotIndices', type: 'array', required: true, description: 'Slot indices' },
    ],
  },
  StorageTransfer: {
    profileId: 'theater0',
    payload: [
      { name: 'transferOperations', type: 'array', required: true, description: 'Array of {itemId: string, quantity: number, toStorage: boolean, newItemIdHint: string}' },
    ],
  },
  ToggleQuestActiveState: {
    profileId: 'athena',
    payload: [
      { name: 'questIds', type: 'array', required: true, description: 'Array of Quest GUIDs' },
    ],
  },
  TransmogItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID to transmogrify' },
    ],
  },
  UnassignAllSquads: {
    profileId: 'campaign',
    payload: [
      { name: 'squadIds', type: 'array', required: true, description: 'Array of squad Ids, e.g. Squad_Attribute_Medicine_EMTSquad' },
    ],
  },
  UnlockProfileForWrite: {
    profileId: 'theater0',
    payload: [
      { name: 'code', type: 'string', required: true, description: 'Lock code from theater profiles' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  UnlockRewardNode: {
    profileId: 'athena',
    payload: [
      { name: 'nodeId', type: 'string', required: true, description: 'Reward node ID to open (from game files)' },
      { name: 'rewardGraphId', type: 'string', required: true, description: 'RewardGraph Item GUID' },
      { name: 'rewardCfg', type: 'string', required: false, description: 'Unknown config string (game uses empty string)' },
    ],
  },
  UnloadWarehouse: {
    profileId: 'campaign',
    payload: [],
    notes: 'No documented schema',
  },
  UnslotAllWorkers: {
    profileId: 'campaign',
    payload: [],
    notes: 'No documented schema',
  },
  UnslotItemFromCollectionBook: {
    profileId: 'campaign',
    payload: [
      { name: 'templateId', type: 'string', required: true, description: 'Item Template Id' },
      { name: 'itemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'specific', type: 'string', required: false, description: 'Leave as empty string' },
    ],
    notes: 'profileId can be campaign, theater0, theater1, or theater2',
  },
  UpdateBuildingLevelAndRating: {
    profileId: 'outpost0',
    payload: [],
    notes: 'No documented schema',
  },
  UpdateDeployableBaseTierProgression: {
    profileId: 'outpost0',
    payload: [],
    notes: 'No documented schema',
  },
  UpdateOutpostCore: {
    profileId: 'outpost0',
    payload: [],
    notes: 'No documented schema',
  },
  UpdatePlotPublishInfo: {
    profileId: 'creative',
    payload: [
      { name: 'plotItemId', type: 'string', required: true, description: 'Island GUID' },
      { name: 'linkCode', type: 'string', required: true, description: 'Island code, e.g. 1111-2222-3333' },
      { name: 'linkVersion', type: 'number', required: true, description: 'Island version' },
      { name: 'vkProjectId', type: 'string', required: false, description: 'Valkyrie (Creative 2.0) project ID' },
      { name: 'vkModuleId', type: 'string', required: false, description: 'Valkyrie (Creative 2.0) module ID' },
      { name: 'moderationLinkCode', type: 'string', required: false, description: 'Moderator island code' },
    ],
    notes: 'DedicatedServer ONLY',
  },
  UpdateQuestClientObjectives: {
    profileId: 'campaign',
    payload: [
      { name: 'advance', type: 'array', required: true, description: 'Array of {statName: string, count: number, timestampOffset: number (use 0)}' },
    ],
    notes: 'profileId can be campaign or athena',
  },
  UpdateQuests: {
    profileId: 'athena',
    payload: [
      { name: 'advance', type: 'array', required: true, description: 'Array of {statName: string, count: number, timestampOffset: number (use 0)}' },
    ],
    notes: 'DedicatedServer ONLY. profileId can be athena or campaign.',
  },
  UpgradeAlteration: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'alterationSlot', type: 'number', required: true, description: 'Index of the Alteration Slot (0-5)' },
    ],
  },
  UpgradeItem: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID to upgrade by +1 level' },
    ],
  },
  UpgradeItemBulk: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'desiredLevel', type: 'number', required: true, description: 'Target level to upgrade to' },
      { name: 'desiredTier', type: 'string', required: true, description: 'Tier: no_tier or lowercased Roman numerals' },
      { name: 'conversionRecipeIndexChoice', type: 'number', required: false, description: 'Recipe index when multiple options exist, -1 for default' },
    ],
  },
  UpgradeItemRarity: {
    profileId: 'campaign',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID of the hero or schematic to upgrade rarity' },
    ],
  },
  UpgradeSlottedItem: {
    profileId: 'collection_book_people0',
    payload: [
      { name: 'targetItemId', type: 'string', required: true, description: 'Item GUID' },
      { name: 'desiredLevel', type: 'number', required: true, description: 'Desired level to upgrade to' },
    ],
    notes: 'profileId can be collection_book_people0 or collection_book_schematics0',
  },
  VerifyRealMoneyPurchase: {
    profileId: 'common_core',
    payload: [
      { name: 'appStore', type: 'string', required: true, description: 'App store from receipt, e.g. EpicPurchasingService' },
      { name: 'appStoreId', type: 'string', required: true, description: 'App store ID from receipt' },
      { name: 'receiptId', type: 'string', required: true, description: 'Receipt ID from receipt' },
      { name: 'receiptInfo', type: 'string', required: true, description: 'Receipt info from receipt' },
      { name: 'purchaseCorrelationId', type: 'string', required: false, description: 'Purchase correlation ID' },
    ],
  },
};

// ─── Derived Lists ────────────────────────────────────────────

const OPERATIONS = Object.keys(OPERATIONS_SCHEMA).sort();

const PROFILES = [
  'athena', 'common_core', 'campaign', 'theater0', 'theater1', 'theater2',
  'outpost0', 'collections', 'collection_book_people0',
  'collection_book_schematics0', 'metadata', 'common_public', 'creative',
  'recycle_bin', 'proto_juno',
];

// ─── State ────────────────────────────────────────────────────

let el: HTMLElement | null = null;
let executing = false;
let selectedOp = '';
let selectedProfile = '';
let payloadValues: Record<string, string> = {};
let payloadErrors: Record<string, string> = {};
let resultData: any = null;
let errorMsg: string | null = null;

// Quick actions state
let claim2faLoading = false;
let claim2faStatus: 'idle' | 'success' | 'error' = 'idle';
let claim2faMsg = '';
let skipTutorialLoading = false;
let skipTutorialStatus: 'idle' | 'success' | 'error' = 'idle';
let skipTutorialMsg = '';

// Dropdown state
let opFilter = '';
let profileFilter = '';
let opDropdownOpen = false;
let profileDropdownOpen = false;

// ─── Helpers ──────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function filteredOps(): string[] {
  if (!opFilter) return OPERATIONS;
  const q = opFilter.toLowerCase();
  return OPERATIONS.filter((o) => o.toLowerCase().includes(q));
}

function filteredProfiles(): string[] {
  if (!profileFilter) return PROFILES;
  const q = profileFilter.toLowerCase();
  return PROFILES.filter((p) => p.toLowerCase().includes(q));
}

function getOpSchema(): OpSchema | null {
  return selectedOp ? (OPERATIONS_SCHEMA[selectedOp] ?? null) : null;
}

function buildPayload(): { payload: Record<string, unknown> | null; errors: Record<string, string> } {
  const schema = getOpSchema();
  if (!schema || schema.payload.length === 0) return { payload: {}, errors: {} };

  const payload: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of schema.payload) {
    const rawVal = (payloadValues[field.name] ?? '').trim();

    if (!rawVal) {
      if (field.required) {
        errors[field.name] = 'This field is required';
      }
      continue;
    }

    if (field.type === 'string') {
      payload[field.name] = rawVal;
    } else if (field.type === 'number') {
      const n = Number(rawVal);
      if (isNaN(n)) {
        errors[field.name] = 'Must be a valid number';
      } else {
        payload[field.name] = n;
      }
    } else if (field.type === 'boolean') {
      payload[field.name] = rawVal === 'true';
    } else if (field.type === 'array' || field.type === 'object') {
      try {
        payload[field.name] = JSON.parse(rawVal);
      } catch {
        errors[field.name] = `Must be valid JSON ${field.type === 'array' ? 'array' : 'object'}`;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { payload: null, errors };
  return { payload, errors: {} };
}

// ─── Render Payload Form ──────────────────────────────────────

function renderPayloadForm(): string {
  const schema = getOpSchema();
  if (!schema) return '';
  if (schema.payload.length === 0) {
    return `
      <div class="mcp-payload-empty">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 12 16"/><line x1="12" y1="12" x2="12" y2="12"/></svg>
        No payload required for this operation
        ${schema.notes ? `<span class="mcp-payload-note">${escapeHtml(schema.notes)}</span>` : ''}
      </div>
    `;
  }

  const required = schema.payload.filter((f) => f.required);
  const optional = schema.payload.filter((f) => !f.required);

  function renderField(field: FieldDef): string {
    const val = payloadValues[field.name] ?? '';
    const err = payloadErrors[field.name];
    const placeholder = field.type === 'array'
      ? '[ "value1", "value2" ]'
      : field.type === 'object'
        ? '{ "key": "value" }'
        : field.type === 'number'
          ? '0'
          : field.description.length < 40 ? field.description : '';

    const isTextArea = field.type === 'array' || field.type === 'object';
    const isBool = field.type === 'boolean';

    return `
      <div class="mcp-field-row ${err ? 'mcp-field-row--error' : ''}">
        <div class="mcp-field-label-row">
          <label class="mcp-field-name">
            ${escapeHtml(field.name)}
            ${field.required ? '<span class="mcp-field-required">*</span>' : '<span class="mcp-field-optional">optional</span>'}
          </label>
          <span class="mcp-field-type">${field.type}</span>
        </div>
        <p class="mcp-field-desc">${escapeHtml(field.description)}</p>
        ${isBool ? `
          <select class="mcp-input mcp-input--select" data-field="${escapeAttr(field.name)}">
            <option value="">— select —</option>
            <option value="true" ${val === 'true' ? 'selected' : ''}>true</option>
            <option value="false" ${val === 'false' ? 'selected' : ''}>false</option>
          </select>
        ` : isTextArea ? `
          <textarea class="mcp-input mcp-input--textarea" data-field="${escapeAttr(field.name)}" placeholder="${escapeAttr(placeholder)}" spellcheck="false" autocomplete="off">${escapeHtml(val)}</textarea>
        ` : `
          <input type="${field.type === 'number' ? 'number' : 'text'}" class="mcp-input" data-field="${escapeAttr(field.name)}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(val)}" spellcheck="false" autocomplete="off"/>
        `}
        ${err ? `<p class="mcp-field-error">${escapeHtml(err)}</p>` : ''}
      </div>
    `;
  }

  return `
    <div class="mcp-payload-form">
      <div class="mcp-payload-header">
        <span class="mcp-payload-title">Payload</span>
        ${schema.notes ? `<span class="mcp-payload-note-badge" title="${escapeAttr(schema.notes)}">note</span>` : ''}
        ${required.length > 0 ? `<span class="mcp-payload-counts">${required.length} required${optional.length > 0 ? `, ${optional.length} optional` : ''}</span>` : ''}
      </div>
      ${required.length > 0 ? required.map(renderField).join('') : ''}
      ${optional.length > 0 ? `
        <div class="mcp-optional-section">
          <div class="mcp-optional-label">Optional fields</div>
          ${optional.map(renderField).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ─── Draw ─────────────────────────────────────────────────────

function draw(): void {
  if (!el) return;

  const jsonStr = resultData ? JSON.stringify(resultData, null, 2) : null;
  const sizeMB = jsonStr ? new Blob([jsonStr]).size / (1024 * 1024) : 0;
  const schema = getOpSchema();
  const hasPayloadFields = schema && schema.payload.length > 0;

  el.innerHTML = `
    <div class="mcp-page">
      <div class="mcp-header">
        <h1 class="page-title">MCP</h1>
        <p class="page-subtitle">Execute MCP operations on your main account</p>
      </div>

      <!-- Quick Actions -->
      <div class="mcp-quick-actions">
        <div class="mcp-quick-card">
          <div class="mcp-quick-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          </div>
          <div class="mcp-quick-info">
            <h3 class="mcp-quick-title">Claim 2FA Reward</h3>
            <p class="mcp-quick-desc">Claim the reward for activating Two-Factor Authentication</p>
          </div>
          <div class="mcp-quick-action">
            ${claim2faStatus === 'success' ? `<span class="mcp-quick-status mcp-quick-status--success"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Claimed</span>` : ''}
            ${claim2faStatus === 'error' ? `<span class="mcp-quick-status mcp-quick-status--error" title="${escapeAttr(claim2faMsg)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Error</span>` : ''}
            <button class="mcp-quick-btn" id="mcp-claim2fa" ${claim2faLoading ? 'disabled' : ''}>${claim2faLoading ? '<div class="mcp-spinner mcp-spinner--sm"></div>' : 'Claim'}</button>
          </div>
        </div>
        <div class="mcp-quick-card">
          <div class="mcp-quick-icon mcp-quick-icon--yellow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div class="mcp-quick-info">
            <h3 class="mcp-quick-title">Skip STW Tutorial</h3>
            <p class="mcp-quick-desc">Skip the Save the World introductory tutorial</p>
          </div>
          <div class="mcp-quick-action">
            ${skipTutorialStatus === 'success' ? `<span class="mcp-quick-status mcp-quick-status--success"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Skipped</span>` : ''}
            ${skipTutorialStatus === 'error' ? `<span class="mcp-quick-status mcp-quick-status--error" title="${escapeAttr(skipTutorialMsg)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Error</span>` : ''}
            <button class="mcp-quick-btn mcp-quick-btn--yellow" id="mcp-skip-tutorial" ${skipTutorialLoading ? 'disabled' : ''}>${skipTutorialLoading ? '<div class="mcp-spinner mcp-spinner--sm"></div>' : 'Skip'}</button>
          </div>
        </div>
      </div>

      <div class="mcp-divider"></div>

      <div class="mcp-form">
        <!-- Operation + Profile row -->
        <div class="mcp-selects-row">
          <!-- Operation Select -->
          <div class="mcp-field">
            <label class="mcp-label">Operation <span class="mcp-op-count">(${OPERATIONS.length})</span></label>
            <div class="mcp-select" id="mcp-op-select">
              <div class="mcp-select-trigger" id="mcp-op-trigger">
                <span class="mcp-select-value ${selectedOp ? '' : 'mcp-select-placeholder'}">${selectedOp || 'Select operation...'}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <div class="mcp-select-dropdown ${opDropdownOpen ? 'mcp-select-dropdown--open' : ''}" id="mcp-op-dropdown">
                <div class="mcp-select-search">
                  <input type="text" id="mcp-op-search" placeholder="Search operations..." value="${escapeAttr(opFilter)}" autocomplete="off" spellcheck="false"/>
                </div>
                <div class="mcp-select-options" id="mcp-op-options">
                  ${filteredOps().map((op) => {
                    const s = OPERATIONS_SCHEMA[op];
                    const badge = s && s.payload.length === 0 ? '' : s ? `<span class="mcp-op-fields">${s.payload.length}</span>` : '';
                    return `<div class="mcp-select-option ${op === selectedOp ? 'mcp-select-option--active' : ''}" data-value="${op}">${op}${badge}</div>`;
                  }).join('')}
                  ${filteredOps().length === 0 ? '<div class="mcp-select-empty">No operations found</div>' : ''}
                </div>
              </div>
            </div>
          </div>

          <!-- Profile Select -->
          <div class="mcp-field mcp-field--profile">
            <label class="mcp-label">Profile ID
              ${schema ? `<span class="mcp-profile-hint">${escapeHtml(schema.profileId)}</span>` : ''}
            </label>
            <div class="mcp-select" id="mcp-profile-select">
              <div class="mcp-select-trigger" id="mcp-profile-trigger">
                <span class="mcp-select-value ${selectedProfile ? '' : 'mcp-select-placeholder'}">${selectedProfile || 'Select profile...'}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <div class="mcp-select-dropdown ${profileDropdownOpen ? 'mcp-select-dropdown--open' : ''}" id="mcp-profile-dropdown">
                <div class="mcp-select-search">
                  <input type="text" id="mcp-profile-search" placeholder="Search profiles..." value="${escapeAttr(profileFilter)}" autocomplete="off" spellcheck="false"/>
                </div>
                <div class="mcp-select-options" id="mcp-profile-options">
                  ${filteredProfiles().map((p) => `<div class="mcp-select-option ${p === selectedProfile ? 'mcp-select-option--active' : ''}" data-value="${p}">${p}</div>`).join('')}
                  ${filteredProfiles().length === 0 ? '<div class="mcp-select-empty">No profiles found</div>' : ''}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Payload Form -->
        ${selectedOp ? renderPayloadForm() : ''}

        <!-- Execute Row -->
        <div class="mcp-execute-row">
          ${hasPayloadFields ? `<button class="mcp-clear-btn" id="mcp-clear" title="Clear all payload fields">Clear</button>` : ''}
          <button class="mcp-execute-btn ${executing ? 'mcp-execute-btn--loading' : ''}" id="mcp-execute" ${executing || !selectedOp || !selectedProfile ? 'disabled' : ''}>
            ${executing ? `<div class="mcp-spinner"></div>Executing...` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>Execute`}
          </button>
        </div>
      </div>

      <!-- Error -->
      ${errorMsg ? `
        <div class="mcp-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>${escapeHtml(errorMsg)}</span>
        </div>
      ` : ''}

      <!-- Result -->
      ${resultData ? `
        <div class="mcp-result">
          <div class="mcp-result-header">
            <div class="mcp-result-info">
              <span class="mcp-result-badge mcp-result-badge--success">Success</span>
              <span class="mcp-result-meta">${selectedOp} · ${selectedProfile} · ${sizeMB.toFixed(2)}MB</span>
            </div>
            <div class="mcp-result-actions">
              <button class="files-btn files-btn--primary" id="mcp-download">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </button>
              <button class="files-btn files-btn--secondary" id="mcp-preview">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview
              </button>
              <button class="files-btn files-btn--ghost" id="mcp-copy" title="Copy to clipboard">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    </div>

    <!-- JSON Preview Modal -->
    <div class="files-modal-overlay" id="mcp-modal-overlay" style="display:none">
      <div class="files-modal">
        <div class="files-modal-header">
          <h2 class="files-modal-title">MCP Response</h2>
          <div class="files-modal-header-actions">
            <button class="files-btn files-btn--ghost" id="mcp-modal-copy" title="Copy to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="files-btn files-btn--ghost" id="mcp-modal-close" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="files-modal-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="mcp-modal-search" placeholder="Search in JSON..." autocomplete="off" spellcheck="false"/>
        </div>
        <pre class="files-modal-json" id="mcp-modal-json"></pre>
      </div>
    </div>
  `;

  bindEvents();
}

// ─── Events ───────────────────────────────────────────────────

function bindEvents(): void {
  if (!el) return;

  // ─ Operation dropdown
  const opTrigger = el.querySelector('#mcp-op-trigger') as HTMLElement;
  const opDropdown = el.querySelector('#mcp-op-dropdown') as HTMLElement;
  const opSearch = el.querySelector('#mcp-op-search') as HTMLInputElement;
  const opOptions = el.querySelector('#mcp-op-options') as HTMLElement;

  opTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdownOpen = false;
    opDropdownOpen = !opDropdownOpen;
    draw();
    if (opDropdownOpen) setTimeout(() => (el?.querySelector('#mcp-op-search') as HTMLInputElement)?.focus(), 0);
  });

  opSearch?.addEventListener('input', () => {
    opFilter = opSearch.value;
    const opts = el?.querySelector('#mcp-op-options') as HTMLElement;
    if (opts) {
      opts.innerHTML = filteredOps().map((op) => {
        const s = OPERATIONS_SCHEMA[op];
        const badge = s && s.payload.length > 0 ? `<span class="mcp-op-fields">${s.payload.length}</span>` : '';
        return `<div class="mcp-select-option ${op === selectedOp ? 'mcp-select-option--active' : ''}" data-value="${op}">${op}${badge}</div>`;
      }).join('') || '<div class="mcp-select-empty">No operations found</div>';
      bindOptionClicks(opts, 'op');
    }
  });

  opSearch?.addEventListener('click', (e) => e.stopPropagation());
  if (opOptions) bindOptionClicks(opOptions, 'op');

  // ─ Profile dropdown
  const profileTrigger = el.querySelector('#mcp-profile-trigger') as HTMLElement;
  const profileSearch = el.querySelector('#mcp-profile-search') as HTMLInputElement;
  const profileOptions = el.querySelector('#mcp-profile-options') as HTMLElement;

  profileTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    opDropdownOpen = false;
    profileDropdownOpen = !profileDropdownOpen;
    draw();
    if (profileDropdownOpen) setTimeout(() => (el?.querySelector('#mcp-profile-search') as HTMLInputElement)?.focus(), 0);
  });

  profileSearch?.addEventListener('input', () => {
    profileFilter = profileSearch.value;
    const opts = el?.querySelector('#mcp-profile-options') as HTMLElement;
    if (opts) {
      opts.innerHTML = filteredProfiles().map((p) => `<div class="mcp-select-option ${p === selectedProfile ? 'mcp-select-option--active' : ''}" data-value="${p}">${p}</div>`).join('') || '<div class="mcp-select-empty">No profiles found</div>';
      bindOptionClicks(opts, 'profile');
    }
  });

  profileSearch?.addEventListener('click', (e) => e.stopPropagation());
  if (profileOptions) bindOptionClicks(profileOptions, 'profile');

  // ─ Close dropdowns on outside click
  document.addEventListener('click', handleOutsideClick);

  // ─ Payload form inputs (live update state without redraw)
  el.querySelectorAll<HTMLElement>('.mcp-input[data-field]').forEach((input) => {
    const fieldName = (input as HTMLElement).dataset.field!;
    const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventType, () => {
      payloadValues[fieldName] = (input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
      // clear error for this field on change
      if (payloadErrors[fieldName]) {
        delete payloadErrors[fieldName];
        const errEl = input.closest('.mcp-field-row')?.querySelector('.mcp-field-error');
        if (errEl) errEl.remove();
        input.closest('.mcp-field-row')?.classList.remove('mcp-field-row--error');
      }
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  });

  // ─ Clear button
  el.querySelector('#mcp-clear')?.addEventListener('click', () => {
    payloadValues = {};
    payloadErrors = {};
    draw();
  });

  // ─ Quick actions
  el.querySelector('#mcp-claim2fa')?.addEventListener('click', executeQuickAction2FA);
  el.querySelector('#mcp-skip-tutorial')?.addEventListener('click', executeQuickActionSkip);

  // ─ Execute
  el.querySelector('#mcp-execute')?.addEventListener('click', executeMcp);

  // ─ Result actions
  el.querySelector('#mcp-download')?.addEventListener('click', downloadResult);
  el.querySelector('#mcp-preview')?.addEventListener('click', openPreview);
  el.querySelector('#mcp-copy')?.addEventListener('click', () => copyToClipboard());

  // ─ Modal
  const overlay = el.querySelector('#mcp-modal-overlay') as HTMLElement;
  overlay?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'mcp-modal-overlay') closeModal();
  });
  el.querySelector('#mcp-modal-close')?.addEventListener('click', closeModal);
  el.querySelector('#mcp-modal-copy')?.addEventListener('click', () => copyToClipboard(el?.querySelector('#mcp-modal-copy') as HTMLButtonElement));

  const modalSearch = el.querySelector('#mcp-modal-search') as HTMLInputElement;
  modalSearch?.addEventListener('input', () => highlightJson(modalSearch.value.trim().toLowerCase()));

  document.addEventListener('keydown', handleEsc);
}

function bindOptionClicks(container: HTMLElement, type: 'op' | 'profile'): void {
  container.querySelectorAll('.mcp-select-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = (opt as HTMLElement).dataset.value || '';
      if (type === 'op') {
        selectedOp = value;
        opFilter = '';
        opDropdownOpen = false;
        payloadValues = {};
        payloadErrors = {};
        // Auto-suggest profile from schema
        const schema = OPERATIONS_SCHEMA[value];
        if (schema) {
          const suggested = schema.profileId.split('|')[0].trim();
          if (suggested && !selectedProfile) selectedProfile = suggested;
          else if (suggested) selectedProfile = suggested; // always auto-set on op change
        }
      } else {
        selectedProfile = value;
        profileFilter = '';
        profileDropdownOpen = false;
      }
      draw();
    });
  });
}

function handleOutsideClick(): void {
  if (opDropdownOpen || profileDropdownOpen) {
    opDropdownOpen = false;
    profileDropdownOpen = false;
    draw();
  }
}

function handleEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (el?.querySelector('#mcp-modal-overlay')?.style.display === 'flex') {
      closeModal();
    } else if (opDropdownOpen || profileDropdownOpen) {
      opDropdownOpen = false;
      profileDropdownOpen = false;
      draw();
    }
  }
}

// ─── Actions ──────────────────────────────────────────────────

async function executeQuickAction2FA(): Promise<void> {
  if (claim2faLoading) return;
  claim2faLoading = true;
  claim2faStatus = 'idle';
  claim2faMsg = '';
  draw();
  try {
    const result = await window.glowAPI.mcp.execute('ClaimMfaEnabled', 'common_core', { bClaimForStw: true });
    if (result.success) {
      claim2faStatus = 'success';
    } else {
      claim2faStatus = 'error';
      claim2faMsg = result.error || 'Failed to claim 2FA reward';
    }
  } catch (err: any) {
    claim2faStatus = 'error';
    claim2faMsg = err.message || 'Unexpected error';
  } finally {
    claim2faLoading = false;
    draw();
  }
}

async function executeQuickActionSkip(): Promise<void> {
  if (skipTutorialLoading) return;
  skipTutorialLoading = true;
  skipTutorialStatus = 'idle';
  skipTutorialMsg = '';
  draw();
  try {
    const result = await window.glowAPI.mcp.execute('SkipTutorial', 'campaign', {});
    if (result.success) {
      skipTutorialStatus = 'success';
    } else {
      skipTutorialStatus = 'error';
      skipTutorialMsg = result.error || 'Failed to skip tutorial';
    }
  } catch (err: any) {
    skipTutorialStatus = 'error';
    skipTutorialMsg = err.message || 'Unexpected error';
  } finally {
    skipTutorialLoading = false;
    draw();
  }
}

async function executeMcp(): Promise<void> {
  if (executing || !selectedOp || !selectedProfile) return;

  // Collect & validate payload from DOM live values
  const schema = getOpSchema();
  if (schema && schema.payload.length > 0) {
    // Sync payloadValues from DOM inputs before validating
    el?.querySelectorAll<HTMLElement>('.mcp-input[data-field]').forEach((input) => {
      const fieldName = (input as HTMLElement).dataset.field!;
      payloadValues[fieldName] = (input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    });
  }

  const { payload, errors } = buildPayload();
  if (payload === null) {
    payloadErrors = errors;
    draw();
    return;
  }

  payloadErrors = {};
  executing = true;
  errorMsg = null;
  resultData = null;
  draw();

  try {
    const result = await window.glowAPI.mcp.execute(selectedOp, selectedProfile, payload);
    if (result.success) {
      resultData = result.data;
      errorMsg = null;
    } else {
      errorMsg = result.error || 'MCP operation failed';
    }
  } catch (err: any) {
    errorMsg = err.message || 'Unexpected error';
  } finally {
    executing = false;
    draw();
  }
}

async function downloadResult(): Promise<void> {
  if (!resultData) return;
  const jsonStr = JSON.stringify(resultData, null, 2);
  const name = `mcp_${selectedProfile}_${selectedOp}`;
  try {
    await window.glowAPI.files.save(jsonStr, name);
  } catch { /* user cancelled */ }
}

function copyToClipboard(btn?: HTMLButtonElement | null): void {
  if (!resultData) return;
  const jsonStr = JSON.stringify(resultData, null, 2);
  navigator.clipboard.writeText(jsonStr).then(() => {
    if (btn) {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      }, 2000);
    }
  });
}

function openPreview(): void {
  if (!resultData || !el) return;
  const overlay = el.querySelector('#mcp-modal-overlay') as HTMLElement;
  const jsonPre = el.querySelector('#mcp-modal-json') as HTMLPreElement;
  const searchInput = el.querySelector('#mcp-modal-search') as HTMLInputElement;
  if (!overlay || !jsonPre) return;

  const jsonStr = JSON.stringify(resultData, null, 2);
  jsonPre.innerHTML = syntaxHighlight(jsonStr);
  overlay.style.display = 'flex';
  if (searchInput) searchInput.value = '';
}

function closeModal(): void {
  if (!el) return;
  const overlay = el.querySelector('#mcp-modal-overlay') as HTMLElement;
  if (overlay) overlay.style.display = 'none';
}

// ─── JSON Syntax Highlighting ─────────────────────────────────

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          const inner = escapeHtml(match.slice(1, -2));
          return `<span class="${cls}">"${inner}"</span>:`;
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${escapeHtml(match)}</span>`;
    },
  );
}

function highlightJson(query: string): void {
  if (!el || !resultData) return;
  const jsonPre = el.querySelector('#mcp-modal-json') as HTMLPreElement;
  if (!jsonPre) return;

  const jsonStr = JSON.stringify(resultData, null, 2);
  if (!query) { jsonPre.innerHTML = syntaxHighlight(jsonStr); return; }

  let highlighted = syntaxHighlight(jsonStr);
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    highlighted = highlighted.replace(/>[^<]*</g, (seg) => seg.replace(regex, '<mark class="json-match">$1</mark>'));
  } catch { /* ignore */ }
  jsonPre.innerHTML = highlighted;

  const first = jsonPre.querySelector('.json-match');
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ─── Page Definition ──────────────────────────────────────────

export const mcpPage: PageDefinition = {
  id: 'mcp',
  label: 'MCP',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  order: 18,
  render(container) {
    el = container;
    draw();
  },
  cleanup() {
    document.removeEventListener('keydown', handleEsc);
    document.removeEventListener('click', handleOutsideClick);
    el = null;
  },
};
