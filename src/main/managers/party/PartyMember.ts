import { PartyMemberMeta } from './PartyMemberMeta';
import type { PartyManager } from './PartyManager';

export interface PartyMemberData {
  account_id: string;
  account_dn?: string;
  role: string;
  joined_at: string;
  meta: Record<string, string>;
  revision: number;
  externalAuths?: Record<string, any> | any[];
}

export class PartyMember {
  public party: PartyManager;
  public id: string;
  public role: string;
  public joinedAt: Date;
  public meta: PartyMemberMeta;
  public revision: number;
  public receivedInitialStateUpdate: boolean;
  public _displayName?: string;
  public externalAuths: Record<string, any>;

  /**
   * @param party The party this member belongs to
   * @param data The member's data
   */
  constructor(party: PartyManager, data: PartyMemberData) {
    this.party = party;
    this.role = data.role;
    this.joinedAt = new Date(data.joined_at);
    this.meta = new PartyMemberMeta(data.meta);
    this.revision = data.revision;
    this.receivedInitialStateUpdate = false;
    this._displayName = data.account_dn;
    this.id = data.account_id;
    this.externalAuths = data.externalAuths || {};
    if (Array.isArray(this.externalAuths)) this.externalAuths = {};
  }

  get displayName(): string {
    return (
      this._displayName ||
      (Object.values(this.externalAuths)[0] &&
        Object.values(this.externalAuths)[0].externalDisplayName) ||
      this.id
    );
  }

  /**
   * Whether this member is the leader of the party
   */
  get isLeader(): boolean {
    return this.role === 'CAPTAIN';
  }

  /**
   * The member's currently equipped outfit CID
   */
  get outfit(): string | undefined {
    return this.meta.outfit;
  }

  /**
   * The member's currently equipped pickaxe ID
   */
  get pickaxe(): string | undefined {
    return this.meta.pickaxe;
  }

  /**
   * The member's current emote EID
   */
  get emote(): string | undefined {
    return this.meta.emote;
  }

  /**
   * The member's currently equipped backpack BID
   */
  get backpack(): string | undefined {
    return this.meta.backpack;
  }

  /**
   * The member's currently equipped shoes
   */
  get shoes(): string | undefined {
    return this.meta.shoes;
  }

  /**
   * Whether the member is ready
   */
  get isReady(): boolean {
    return this.meta.isReady;
  }

  /**
   * Whether the member is sitting out
   */
  get isSittingOut(): boolean {
    return this.meta.isSittingOut;
  }

  /**
   * The member's current input method
   */
  get inputMethod(): string | undefined {
    return this.meta.input;
  }

  /**
   * The member's cosmetic variants
   */
  get variants(): Record<string, any> {
    return this.meta.variants;
  }

  /**
   * The member's custom data store
   */
  get customDataStore(): any[] {
    return this.meta.customDataStore;
  }

  /**
   * The member's banner info
   */
  get banner(): any {
    return this.meta.banner;
  }

  /**
   * The member's battlepass info
   */
  get battlepass(): any {
    return this.meta.battlepass;
  }

  /**
   * The member's platform
   */
  get platform(): string | undefined {
    return this.meta.platform;
  }

  /**
   * The member's match info
   */
  get matchInfo(): any {
    return this.meta.match;
  }

  /**
   * The member's current playlist
   */
  get playlist(): any {
    return this.meta.island;
  }

  /**
   * Whether a marker has been set
   */
  get isMarkerSet(): boolean {
    return this.meta.isMarkerSet;
  }

  /**
   * The member's marker location [x, y] tuple.
   * [0, 0] if there is no marker set
   */
  get markerLocation(): [number, number] {
    return this.meta.markerLocation;
  }

  /**
   * Kicks this member from the client's party.
   * @throws {PartyPermissionError} The client is not a member or not the leader of the party
   */
  async kick(): Promise<void> {
    // This is a very hacky solution, but it's required since we cannot import ClientParty (circular dependencies)
    if (typeof (this.party as any).kick !== 'function')
      throw new Error('Party permission error');
    return (this.party as any).kick(this.id);
  }

  /**
   * Promotes this member
   * @throws {PartyPermissionError} The client is not a member or not the leader of the party
   */
  async promote(): Promise<void> {
    // This is a very hacky solution, but it's required since we cannot import ClientParty (circular dependencies)
    if (typeof (this.party as any).promote !== 'function')
      throw new Error('Party permission error');
    return (this.party as any).promote(this.id);
  }

  /**
   * Hides this member
   * @param hide Whether the member should be hidden
   * @throws {PartyPermissionError} The client is not the leader of the party
   * @throws {EpicgamesAPIError}
   */
  async hide(hide: boolean = true): Promise<void> {
    // This is a very hacky solution, but it's required since we cannot import ClientParty (circular dependencies)
    if (typeof (this.party as any).hideMember !== 'function')
      throw new Error('Party permission error');
    return (this.party as any).hideMember(this.id, hide);
  }

  update(data: { displayName?: string; externalAuths?: Record<string, any> | any[] }): void {
    this._displayName = data.displayName;
    this.externalAuths = data.externalAuths || {};
    if (Array.isArray(this.externalAuths)) this.externalAuths = {};
  }

  /**
   * Converts this party member into an object
   */
  toObject(): any {
    return {
      id: this.id,
      account_id: this.id,
      joined_at: this.joinedAt.toISOString(),
      updated_at: new Date().toISOString(),
      meta: this.meta.schema,
      revision: 0,
      role: this.role,
      account_dn: this.displayName
    };
  }
}
