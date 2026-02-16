import { Meta } from './Meta';

export class PartyMemberMeta extends Meta {
  /**
   * The currently equipped outfit CID
   */
  get outfit(): string | undefined {
    return this.get(
      'Default:AthenaCosmeticLoadout_j'
    )?.AthenaCosmeticLoadout?.characterPrimaryAssetId?.replace(
      'AthenaCharacter:',
      ''
    );
  }

  /**
   * The currently equipped pickaxe ID
   */
  get pickaxe(): string | undefined {
    return this.get('Default:AthenaCosmeticLoadout_j')
      ?.AthenaCosmeticLoadout?.pickaxeDef?.match(/(?<=\w*\.)\w*/)
      ?.shift();
  }

  /**
   * The current emote EID
   */
  get emote(): string | undefined {
    const emoteAsset = this.get('Default:FrontendEmote_j')?.FrontendEmote
      ?.pickable;
    if (emoteAsset === 'None' || !emoteAsset) return undefined;
    return emoteAsset.match(/(?<=\w*\.)\w*/)?.shift();
  }

  /**
   * The currently equipped backpack BID
   */
  get backpack(): string | undefined {
    return this.get('Default:AthenaCosmeticLoadout_j')
      ?.AthenaCosmeticLoadout?.backpackDef?.match(/(?<=\w*\.)\w*/)
      ?.shift();
  }

  /**
   * Whether the member is ready
   */
  get isReady(): boolean {
    return (
      this.get('Default:LobbyState_j')?.LobbyState?.gameReadiness === 'Ready'
    );
  }

  /**
   * Whether the member is sitting out
   */
  get isSittingOut(): boolean {
    return (
      this.get('Default:LobbyState_j')?.LobbyState?.gameReadiness ===
      'SittingOut'
    );
  }

  /**
   * The current input method
   */
  get input(): string | undefined {
    return this.get('Default:LobbyState_j')?.LobbyState?.currentInputType;
  }

  /**
   * The cosmetic variants
   */
  get variants(): Record<string, any> {
    const variants = this.get('Default:AthenaCosmeticLoadoutVariants_j')
      ?.AthenaCosmeticLoadoutVariants?.vL;
    if (!variants) return {};

    const pascalCaseVariants: Record<string, any> = {};
    Object.keys(variants).forEach(k => {
      pascalCaseVariants[`${k.charAt(0).toUpperCase()}${k.slice(1)}`] =
        variants[k];
    });

    return pascalCaseVariants;
  }

  /**
   * The custom data store
   */
  get customDataStore(): any[] {
    return (
      this.get('Default:ArbitraryCustomDataStore_j')
        ?.ArbitraryCustomDataStore || []
    );
  }

  /**
   * The banner info
   */
  get banner(): any {
    return this.get('Default:AthenaBannerInfo_j')?.AthenaBannerInfo;
  }

  /**
   * The currently equipped shoes
   */
  get shoes(): string | undefined {
    return this.get('Default:AthenaCosmeticLoadout_j')
      ?.AthenaCosmeticLoadout?.shoesDef?.match(/(?<=\w*\.)\w*/)
      ?.shift();
  }

  /**
   * The battle pass info
   */
  get battlepass(): any {
    return this.get('Default:BattlePassInfo_j')?.BattlePassInfo;
  }

  /**
   * The platform
   */
  get platform(): string | undefined {
    return this.get('Default:PlatformData_j')?.PlatformData?.platform
      ?.platformDescription?.name;
  }

  /**
   * The match info
   */
  get match(): any {
    const location = this.get('Default:PackedState_j')?.PackedState?.location;
    const hasPreloadedAthena = this.get('Default:LobbyState_j')?.LobbyState
      ?.hasPreloadedAthena;
    const playerCount = this.get('Default:NumAthenaPlayersLeft_U');
    const matchStartedAt = this.get('Default:UtcTimeStartedMatchAthena_s');

    return {
      hasPreloadedAthena,
      location,
      matchStartedAt: matchStartedAt && new Date(matchStartedAt),
      playerCount
    };
  }

  /**
   * The current island info
   */
  get island(): any {
    return this.get('Default:CurrentIsland_j')?.SelectedIsland;
  }

  /**
   * Whether a marker has been set
   */
  get isMarkerSet(): boolean {
    return !!this.get('Default:FrontEndMapMarker_j')?.FrontEndMapMarker?.bIsSet;
  }

  /**
   * The marker location [x, y] tuple. [0, 0] if there is no marker set
   */
  get markerLocation(): [number, number] {
    const marker = this.get('Default:FrontEndMapMarker_j')?.FrontEndMapMarker
      ?.markerLocation;
    if (!marker) return [0, 0];

    return [marker.y, marker.x];
  }

  /**
   * Whether the member owns Save The World
   */
  get hasPurchasedSTW(): boolean {
    return !!this.get('Default:PackedState_j').PackedState?.hasPurchasedSTW;
  }
}
