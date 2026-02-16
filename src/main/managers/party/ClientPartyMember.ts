import { AsyncQueue } from '@sapphire/async-queue';
import { PartyMember, type PartyMemberData } from './PartyMember';
import { ClientPartyMemberMeta } from './ClientPartyMemberMeta';
import { Endpoints } from '../../helpers/endpoints';
import type { PartyManager } from './PartyManager';
import axios from 'axios';

interface CosmeticOptions {
  id?: string;
  variants?: any[];
  enlightment?: any;
  path?: string;
}

export class ClientPartyMember extends PartyMember {
  public meta: ClientPartyMemberMeta;
  public patchQueue: AsyncQueue;

  /**
   * @param party The party this member belongs to
   * @param data The member data
   */
  constructor(party: PartyManager, data: PartyMemberData) {
    super(party, data);
    this.meta = new ClientPartyMemberMeta(this, data.meta);
    this.patchQueue = new AsyncQueue();
    this.update({
      displayName: this.party.displayName,
      externalAuths: data.externalAuths
    });
  }

  /**
   * Sends a meta patch to Epicgames's servers
   * @param updated The updated schema
   * @throws {EpicgamesAPIError}
   */
  async sendPatch(updated: Record<string, string>): Promise<void> {
    await this.patchQueue.wait();

    try {
      const response = await this.party.account.sendEpicRequest({
        method: 'PATCH',
        url: `${Endpoints.BR_PARTY}/parties/${this.party.id}/members/${this.id}/meta`,
        data: {
          delete: [],
          revision: this.revision,
          update: updated
        }
      });
      // Log non-standard responses
      if (response?.status && response.status >= 300) {
        console.warn('[ClientPartyMember] sendPatch unexpected status:', response.status, response.data);
      }
    } catch (e: any) {
      this.patchQueue.shift();
      if (e.response?.data) {
        const apiErr = e.response.data;
        const error = new Error(apiErr.errorMessage || apiErr.message || `Party API error ${e.response.status}`);
        (error as any).errorCode = apiErr.errorCode;
        (error as any).numericErrorCode = apiErr.numericErrorCode;
        throw error;
      }
      throw e;
    }

    this.revision += 1;
    this.patchQueue.shift();
  }

  /**
   * Updates the client party member's readiness
   * @param ready Whether the client party member is ready
   * @throws {EpicgamesAPIError}
   */
  async setReadiness(ready: boolean): Promise<void> {
    let data = this.meta.get('Default:LobbyState_j');
    data = this.meta.set('Default:LobbyState_j', {
      ...data,
      LobbyState: {
        gameReadiness: ready ? 'Ready' : 'NotReady',
        readyInputType: ready ? 'MouseAndKeyboard' : 'Count'
      }
    });

    await this.sendPatch({
      'Default:LobbyState_j': data
    });
  }

  /**
   * Updates the client party member's sitting out state
   * @param sittingOut Whether the client party member is sitting out
   * @throws {EpicgamesAPIError}
   */
  async setSittingOut(sittingOut: boolean): Promise<void> {
    let data = this.meta.get('Default:LobbyState_j');
    data = this.meta.set('Default:LobbyState_j', {
      ...data,
      LobbyState: {
        gameReadiness: sittingOut ? 'SittingOut' : 'NotReady',
        readyInputType: 'Count'
      }
    });

    await this.sendPatch({
      'Default:LobbyState_j': data
    });
  }

  /**
   * Updates the client party member's level
   * @param level The new level
   * @throws {EpicgamesAPIError}
   */
  async setLevel(level: number): Promise<void> {
    let data = this.meta.get('Default:AthenaBannerInfo_j');
    data = this.meta.set('Default:AthenaBannerInfo_j', {
      ...data,
      AthenaBannerInfo: {
        ...data.AthenaBannerInfo,
        seasonLevel: level
      }
    });

    await this.sendPatch({
      'Default:AthenaBannerInfo_j': data
    });
  }

  /**
   * Updates the client party member's battle pass info
   * @param isPurchased Whether the battle pass is purchased
   * @param level The battle pass level
   * @param selfBoost The battle pass self boost percentage
   * @param friendBoost The battle pass friend boost percentage
   * @throws {EpicgamesAPIError}
   */
  async setBattlePass(
    isPurchased?: boolean,
    level?: number,
    selfBoost?: number,
    friendBoost?: number
  ): Promise<void> {
    let data = this.meta.get('Default:BattlePassInfo_j');
    data = this.meta.set('Default:BattlePassInfo_j', {
      ...data,
      BattlePassInfo: {
        ...data.BattlePassInfo,
        bHasPurchasedPass:
          typeof isPurchased === 'boolean'
            ? isPurchased
            : data.BattlePassInfo.bHasPurchasedPass,
        passLevel:
          typeof level === 'number' ? level : data.BattlePassInfo.passLevel,
        selfBoostXp:
          typeof selfBoost === 'number'
            ? selfBoost
            : data.BattlePassInfo.selfBoostXp,
        friendBoostXp:
          typeof friendBoost === 'number'
            ? friendBoost
            : data.BattlePassInfo.friendBoostXp
      }
    });

    await this.sendPatch({
      'Default:BattlePassInfo_j': data
    });
  }

  /**
   * Updates the client party member's banner
   * @param bannerId The new banner's id
   * @param color The new banner's color
   * @throws {EpicgamesAPIError}
   */
  async setBanner(bannerId: string, color: string): Promise<void> {
    let data = this.meta.get('Default:AthenaBannerInfo_j');
    data = this.meta.set('Default:AthenaBannerInfo_j', {
      ...data,
      AthenaBannerInfo: {
        ...data.AthenaBannerInfo,
        bannerIconId: bannerId,
        bannerColorId: color
      }
    });

    await this.sendPatch({
      'Default:AthenaBannerInfo_j': data
    });
  }

  /**
   * Updates multiple cosmetics for the client party member.
   * If a cosmetic is set to `undefined` or any falsy value, it will be cleared, if possible.
   * If a cosmetic is not provided, it will remain unchanged.
   * @param cosmetics An object specifying the cosmetics to update, including outfit, backpack, pickaxe and shoes.
   * @throws {EpicgamesAPIError}
   */
  async setCosmetics(cosmetics: {
    outfit?: CosmeticOptions;
    backpack?: CosmeticOptions;
    pickaxe?: CosmeticOptions;
    shoes?: CosmeticOptions;
  } = {}): Promise<void> {
    const { outfit, backpack, pickaxe, shoes } = cosmetics;
    const patches: Record<string, string> = {};

    if (outfit) {
      let data = this.meta.get('Default:AthenaCosmeticLoadout_j');
      const newVariants = [];

      if (outfit.variants) {
        for (const variant of outfit.variants) {
          newVariants.push({
            c: variant.channel || 'Progressive',
            v: variant.variant || 'Stage1',
            dE: 0
          });
        }
      }

      const scratchpad = [];
      if (outfit.enlightment && Array.isArray(outfit.enlightment)) {
        scratchpad.push({
          n: 'SE',
          t: 'ds',
          v: outfit.enlightment.map((v: any) => ({ n: v.season || 'Athena', i: v.level || 350 }))
        });
      }

      data = this.meta.set('Default:AthenaCosmeticLoadout_j', {
        ...data,
        AthenaCosmeticLoadout: {
          ...data.AthenaCosmeticLoadout,
          characterPrimaryAssetId: `AthenaCharacter:${outfit.id}`,
          scratchpad
        }
      });
      patches['Default:AthenaCosmeticLoadout_j'] = data;

      const variantsData = this.meta.set('Default:AthenaCosmeticLoadoutVariants_j', {
        AthenaCosmeticLoadoutVariants: {
          vL: {
            athenaCharacter: { i: newVariants }
          }
        }
      });
      patches['Default:AthenaCosmeticLoadoutVariants_j'] = variantsData;
    }

    if (Object.hasOwn(cosmetics, 'backpack')) {
      let data = this.meta.get('Default:AthenaCosmeticLoadout_j');
      const newVariants = [];

      if (backpack && backpack.variants) {
        for (const variant of backpack.variants) {
          newVariants.push({
            c: variant.channel || 'Progressive',
            v: variant.variant || 'Stage1',
            dE: 0
          });
        }
      }

      const backpackDef = backpack && backpack.id
        ? backpack.path || `/Game/Athena/Items/Cosmetics/Backpacks/${backpack.id}.${backpack.id}`
        : 'None';

      data = this.meta.set('Default:AthenaCosmeticLoadout_j', {
        ...data,
        AthenaCosmeticLoadout: {
          ...data.AthenaCosmeticLoadout,
          backpackDef
        }
      });
      patches['Default:AthenaCosmeticLoadout_j'] = data;

      if (backpack && newVariants.length > 0) {
        const variantsData = this.meta.set('Default:AthenaCosmeticLoadoutVariants_j', {
          AthenaCosmeticLoadoutVariants: {
            vL: {
              athenaBackpack: { i: newVariants }
            }
          }
        });
        patches['Default:AthenaCosmeticLoadoutVariants_j'] = variantsData;
      }
    }

    if (pickaxe) {
      let data = this.meta.get('Default:AthenaCosmeticLoadout_j');
      const newVariants = [];

      if (pickaxe.variants) {
        for (const variant of pickaxe.variants) {
          newVariants.push({
            c: variant.channel || 'Progressive',
            v: variant.variant || 'Stage1',
            dE: 0
          });
        }
      }

      const pickaxeDef =
        pickaxe.path || `/Game/Athena/Items/Cosmetics/Pickaxes/${pickaxe.id}.${pickaxe.id}`;

      data = this.meta.set('Default:AthenaCosmeticLoadout_j', {
        ...data,
        AthenaCosmeticLoadout: {
          ...data.AthenaCosmeticLoadout,
          pickaxeDef
        }
      });
      patches['Default:AthenaCosmeticLoadout_j'] = data;

      if (newVariants.length > 0) {
        const variantsData = this.meta.set('Default:AthenaCosmeticLoadoutVariants_j', {
          AthenaCosmeticLoadoutVariants: {
            vL: {
              athenaPickaxe: { i: newVariants }
            }
          }
        });
        patches['Default:AthenaCosmeticLoadoutVariants_j'] = variantsData;
      }
    }

    if (Object.hasOwn(cosmetics, 'shoes')) {
      let data = this.meta.get('Default:AthenaCosmeticLoadout_j');

      const shoesDef = shoes && shoes.id
        ? shoes.path || `/Game/Athena/Items/Cosmetics/Shoes/${shoes.id}.${shoes.id}`
        : 'None';

      data = this.meta.set('Default:AthenaCosmeticLoadout_j', {
        ...data,
        AthenaCosmeticLoadout: {
          ...data.AthenaCosmeticLoadout,
          shoesDef
        }
      });
      patches['Default:AthenaCosmeticLoadout_j'] = data;
    }

    await this.sendPatch(patches);
  }

  /**
   * Updates the client party member's outfit
   * @param id The outfit's ID
   * @param variants The outfit's variants
   * @param enlightment The outfit's enlightment
   * @throws {EpicgamesAPIError}
   */
  async setOutfit(id: string, variants: any[] = [], enlightment?: any): Promise<void> {
    return this.setCosmetics({ outfit: { id, variants, enlightment } });
  }

  /**
   * Updates the client party member's backpack
   * @param id The backpack's ID
   * @param variants The backpack's variants
   * @param path The backpack's path in the game files
   * @throws {EpicgamesAPIError}
   */
  async setBackpack(id: string, variants: any[] = [], path?: string): Promise<void> {
    return this.setCosmetics({ backpack: { id, variants, path } });
  }

  /**
   * Updates the client party member's pet
   * @param id The pet's ID
   * @param variants The pet's variants
   * @param path The pet's path in the game files
   */
  async setPet(id: string, variants: any[] = [], path?: string): Promise<void> {
    const petPath = path || `/Game/Athena/Items/Cosmetics/PetCarriers/${id}.${id}`;
    return this.setBackpack(id, variants, petPath);
  }

  /**
   * Updates the client party member's pickaxe
   * @param id The pickaxe's ID
   * @param variants The pickaxe's variants
   * @param path The pickaxe's path in the game files
   * @throws {EpicgamesAPIError}
   */
  async setPickaxe(id: string, variants: any[] = [], path?: string): Promise<void> {
    return this.setCosmetics({ pickaxe: { id, variants, path } });
  }

  /**
   * Updates the client party member's shoes
   * @param id The shoes's ID
   * @param path The shoes' path in the game files
   * @throws {EpicgamesAPIError}
   */
  async setShoes(id: string, path?: string): Promise<void> {
    return this.setCosmetics({ shoes: { id, path } });
  }

  /**
   * Updates the client party member's emote
   * @param id The emote's ID
   * @param path The emote's path in the game files
   * @throws {EpicgamesAPIError}
   */
  async setEmote(id: string, path?: string): Promise<void> {
    const emotePath = path || `/Game/Athena/Items/Cosmetics/Dances/${id}.${id}`;

    const data = this.meta.set('Default:FrontendEmote_j', {
      FrontendEmote: {
        emoteItemDef: 'None',
        emoteItemDefEncryptionKey: '',
        emoteSection: -1,
        pickable: emotePath
      }
    });

    await this.sendPatch({
      'Default:FrontendEmote_j': data
    });
  }

  /**
   * Updates the client party member's emoji
   * @param id The emoji's ID
   * @param path The emoji's path in the game files
   * @throws {EpicgamesAPIError}
   */
  async setEmoji(id: string, path?: string): Promise<void> {
    return this.setEmote(id, path || `/Game/Athena/Items/Cosmetics/Dances/Emoji/${id}.${id}`);
  }

  /**
   * Clears the client party member's emote and emoji
   * @throws {EpicgamesAPIError}
   */
  async clearEmote(): Promise<void> {
    const data = this.meta.set('Default:FrontendEmote_j', {
      FrontendEmote: {
        emoteItemDef: 'None',
        emoteItemDefEncryptionKey: '',
        emoteSection: -1,
        pickable: 'None'
      }
    });

    await this.sendPatch({
      'Default:FrontendEmote_j': data
    });
  }

  /**
   * Clears the client party member's backpack
   * @throws {EpicgamesAPIError}
   */
  async clearBackpack(): Promise<void> {
    let data = this.meta.get('Default:AthenaCosmeticLoadout_j');
    data = this.meta.set('Default:AthenaCosmeticLoadout_j', {
      ...data,
      AthenaCosmeticLoadout: {
        ...data.AthenaCosmeticLoadout,
        backpackDef: 'None'
      }
    });

    await this.sendPatch({
      'Default:AthenaCosmeticLoadout_j': data
    });
  }

  /**
   * Clears the client party member's shoes
   * @throws {EpicgamesAPIError}
   */
  async clearShoes(): Promise<void> {
    let data = this.meta.get('Default:AthenaCosmeticLoadout_j');
    data = this.meta.set('Default:AthenaCosmeticLoadout_j', {
      ...data,
      AthenaCosmeticLoadout: {
        ...data.AthenaCosmeticLoadout,
        shoesDef: 'None'
      }
    });

    await this.sendPatch({
      'Default:AthenaCosmeticLoadout_j': data
    });
  }

  /**
   * Updates the client party member's match state.
   * NOTE: This is visually, the client will not actually join a match
   * @param isPlaying Whether the client is in a match
   * @param playerCount The match player count (must be between 0 and 255)
   * @param startedAt The start date of the match
   * @throws {EpicgamesAPIError}
   */
  async setPlaying(
    isPlaying: boolean = true,
    playerCount: number = 100,
    startedAt: Date = new Date()
  ): Promise<void> {
    const patches: Record<string, string> = {};

    let packedState = this.meta.get('Default:PackedState_j');
    packedState = this.meta.set('Default:PackedState_j', {
      ...packedState,
      PackedState: {
        ...packedState.PackedState,
        location: isPlaying ? 'InGame' : 'PreLobby'
      }
    });
    patches['Default:PackedState_j'] = packedState;

    const numPlayersLeft = this.meta.set('Default:NumAthenaPlayersLeft_U', playerCount);
    patches['Default:NumAthenaPlayersLeft_U'] = numPlayersLeft;

    const matchStartedAt = this.meta.set('Default:UtcTimeStartedMatchAthena_s', startedAt.toISOString());
    patches['Default:UtcTimeStartedMatchAthena_s'] = matchStartedAt;

    await this.sendPatch(patches);
  }

  /**
   * Updates the client party member's pre lobby map marker.
   * [0, 0] would be the center of the map
   * @param isSet Whether the marker is set
   * @param locationX The marker x location
   * @param locationY The marker y location
   * @throws {EpicgamesAPIError}
   */
  async setMarker(isSet: boolean, locationX: number, locationY: number): Promise<void> {
    const data = this.meta.set('Default:FrontEndMapMarker_j', {
      FrontEndMapMarker: {
        markerLocation: {
          x: locationY,
          y: locationX
        },
        bIsSet: isSet
      }
    });

    await this.sendPatch({
      'Default:FrontEndMapMarker_j': data
    });
  }

  /**
   * Updates the client party member's cosmetic stats.
   * Crowns are shown when using the EID_Coronet emote
   * @param crowns The amount of crowns / "Royal Royales"
   * @param rankedProgression The ranked progression
   * @throws {EpicgamesAPIError}
   */
  async setCosmeticStats(crowns?: number, rankedProgression?: number): Promise<void> {
    let data = this.meta.get('Default:AthenaCosmeticLoadout_j');
    const cosmeticStats = data.AthenaCosmeticLoadout.cosmeticStats || [];

    const updateStat = (statName: string, value: number) => {
      const existingIndex = cosmeticStats.findIndex((s: any) => s.statName === statName);
      if (existingIndex !== -1) {
        cosmeticStats[existingIndex].statValue = value;
      } else {
        cosmeticStats.push({ statName, statValue: value });
      }
    };

    if (typeof crowns === 'number') {
      updateStat('TotalVictoryCrowns', crowns);
      updateStat('TotalRoyalRoyales', crowns);
    }

    if (typeof rankedProgression === 'number') {
      updateStat('HabaneroProgression', rankedProgression);
    }

    data = this.meta.set('Default:AthenaCosmeticLoadout_j', {
      ...data,
      AthenaCosmeticLoadout: {
        ...data.AthenaCosmeticLoadout,
        cosmeticStats
      }
    });

    await this.sendPatch({
      'Default:AthenaCosmeticLoadout_j': data
    });
  }
}
