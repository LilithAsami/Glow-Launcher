/**
 * GhostEquip — backend helpers for equipping cosmetics to party.
 * Uses PartyManager to set outfits, emotes, backpacks, etc.
 */

import { refreshAccountToken } from '../auth/tokenRefresh';
import { PartyManager } from '../../managers/party/PartyManager';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

type GEResult = { success: boolean; message?: string; error?: string };

// ─── Helpers ──────────────────────────────────────────────

async function getMainAccount(storage: Storage) {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) throw new Error('No account found');
  return main;
}

async function getTokenAndParty(storage: Storage) {
  const main = await getMainAccount(storage);
  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');

  const party = new PartyManager({
    accountId: main.accountId,
    displayName: main.displayName || main.accountId,
    token,
  });

  console.log(`[GhostEquip] Fetching party for ${main.displayName || main.accountId}…`);
  await party.fetch();

  if (!party.me) {
    throw new Error('Not in a party. Make sure Fortnite is running and you are in the lobby.');
  }

  console.log(`[GhostEquip] Party ${party.id}, member revision=${party.me.revision}`);
  return { main, token, party };
}

/** Extracts a readable error string from Epic API responses or generic errors */
function extractError(err: any): string {
  if (!err) return 'Unknown error';
  // Epic API throws plain objects with errorMessage
  if (typeof err === 'object' && err.errorMessage) return err.errorMessage;
  if (typeof err === 'object' && err.errorCode) return `${err.errorCode}: ${err.errorMessage || err.message || ''}`;
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  return String(err);
}

// ─── Public API ───────────────────────────────────────────

export async function setOutfit(storage: Storage, cosmeticId: string): Promise<GEResult> {
  try {
    const { party } = await getTokenAndParty(storage);
    console.log(`[GhostEquip] Setting outfit: ${cosmeticId}`);
    await party.me!.setOutfit(cosmeticId);
    console.log(`[GhostEquip] Outfit applied successfully`);
    return { success: true, message: `Outfit set to ${cosmeticId}` };
  } catch (err: any) {
    const msg = extractError(err);
    console.error('[GhostEquip] setOutfit error:', msg, err);
    return { success: false, error: msg };
  }
}

export async function setBackpack(storage: Storage, cosmeticId: string): Promise<GEResult> {
  try {
    const { party } = await getTokenAndParty(storage);
    console.log(`[GhostEquip] Setting backpack: ${cosmeticId}`);
    await party.me!.setBackpack(cosmeticId);
    console.log(`[GhostEquip] Backpack applied successfully`);
    return { success: true, message: `Backpack set to ${cosmeticId}` };
  } catch (err: any) {
    const msg = extractError(err);
    console.error('[GhostEquip] setBackpack error:', msg, err);
    return { success: false, error: msg };
  }
}

export async function setEmote(storage: Storage, cosmeticId: string): Promise<GEResult> {
  try {
    const { party } = await getTokenAndParty(storage);
    console.log(`[GhostEquip] Setting emote: ${cosmeticId}`);
    await party.me!.setEmote(cosmeticId);
    console.log(`[GhostEquip] Emote applied successfully`);
    return { success: true, message: `Emote set to ${cosmeticId}` };
  } catch (err: any) {
    const msg = extractError(err);
    console.error('[GhostEquip] setEmote error:', msg, err);
    return { success: false, error: msg };
  }
}

export async function setShoes(storage: Storage, cosmeticId: string): Promise<GEResult> {
  try {
    const { party } = await getTokenAndParty(storage);
    console.log(`[GhostEquip] Setting shoes: ${cosmeticId}`);
    await party.me!.setShoes(cosmeticId);
    console.log(`[GhostEquip] Shoes applied successfully`);
    return { success: true, message: `Shoes set to ${cosmeticId}` };
  } catch (err: any) {
    const msg = extractError(err);
    console.error('[GhostEquip] setShoes error:', msg, err);
    return { success: false, error: msg };
  }
}

export async function setBanner(storage: Storage, bannerId: string): Promise<GEResult> {
  try {
    const { party } = await getTokenAndParty(storage);
    console.log(`[GhostEquip] Setting banner: ${bannerId}`);
    await party.me!.setBanner(bannerId, 'defaultcolor1');
    console.log(`[GhostEquip] Banner applied successfully`);
    return { success: true, message: `Banner set to ${bannerId}` };
  } catch (err: any) {
    const msg = extractError(err);
    console.error('[GhostEquip] setBanner error:', msg, err);
    return { success: false, error: msg };
  }
}

export async function setCrowns(storage: Storage, amount: number): Promise<GEResult> {
  try {
    const { party } = await getTokenAndParty(storage);
    console.log(`[GhostEquip] Setting crowns: ${amount}`);
    await party.me!.setCosmeticStats(amount, 0);
    // Auto crown emote with delay like the bot
    await new Promise((r) => setTimeout(r, 1000));
    await party.me!.setEmote('EID_Coronet');
    console.log(`[GhostEquip] Crowns applied successfully`);
    return { success: true, message: `Crowns set to ${amount}` };
  } catch (err: any) {
    const msg = extractError(err);
    console.error('[GhostEquip] setCrowns error:', msg, err);
    return { success: false, error: msg };
  }
}

export async function setLevel(storage: Storage, level: number): Promise<GEResult> {
  try {
    const { party } = await getTokenAndParty(storage);
    console.log(`[GhostEquip] Setting level: ${level}`);
    await party.me!.setLevel(level);
    console.log(`[GhostEquip] Level applied successfully`);
    return { success: true, message: `Level set to ${level}` };
  } catch (err: any) {
    const msg = extractError(err);
    console.error('[GhostEquip] setLevel error:', msg, err);
    return { success: false, error: msg };
  }
}

// ─── Power Level (STW FORT stats) ─────────────────────────

const HOMEBASE_RATING_KEYS: [number, number][] = [
  [0, 1], [236, 2], [364, 3], [432, 4], [512, 5],
  [704, 7], [932, 8], [1196, 9], [1876, 13], [2740, 16],
  [3824, 19], [4692, 22], [5460, 24], [6260, 25], [7172, 26],
  [8084, 29], [9552, 32], [10912, 36], [13104, 41], [14844, 46],
  [17180, 49], [19008, 53], [20928, 54], [22708, 55], [24588, 57],
  [26324, 60], [28804, 63], [31312, 68], [35008, 73], [37660, 78],
  [40380, 81], [42308, 84], [44316, 86], [46448, 87], [48592, 89],
  [50852, 93], [54480, 96], [58064, 102], [62528, 107], [65472, 113],
  [68320, 116], [70400, 120], [72384, 121], [74464, 123], [76448, 124],
  [78528, 126], [80512, 127], [82592, 128], [84576, 130], [86124, 131],
  [87040, 133], [87520, 134], [87904, 136], [88384, 137], [88768, 139],
  [89248, 140], [89632, 142], [90112, 143], [90304, 144], [180608, 288],
];

function evalCurve(key: number): number {
  if (key < HOMEBASE_RATING_KEYS[0][0]) return HOMEBASE_RATING_KEYS[0][1];
  const last = HOMEBASE_RATING_KEYS[HOMEBASE_RATING_KEYS.length - 1];
  if (key >= last[0]) return last[1];
  for (let i = 0; i < HOMEBASE_RATING_KEYS.length; i++) {
    if (HOMEBASE_RATING_KEYS[i][0] > key) {
      const [prevTime, prevValue] = HOMEBASE_RATING_KEYS[i - 1];
      const [nextTime, nextValue] = HOMEBASE_RATING_KEYS[i];
      const fac = (key - prevTime) / (nextTime - prevTime);
      return prevValue * (1 - fac) + nextValue * fac;
    }
  }
  return last[1];
}

function findStatForPowerLevel(targetPL: number): number {
  if (targetPL < 1) return 1;
  if (targetPL > 288) return 180608;
  let lo = 1;
  let hi = 10000;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const calc = evalCurve(mid * 16);
    if (Math.abs(calc - targetPL) < 0.5) return mid;
    if (calc < targetPL) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi;
}

export async function setPowerLevel(storage: Storage, powerLevel: number): Promise<GEResult> {
  try {
    const { party } = await getTokenAndParty(storage);
    const stat = findStatForPowerLevel(powerLevel);
    const power = powerLevel;

    const statsPayload = {
      FORTStats: {
        fortitude: stat, offense: stat, resistance: stat, tech: stat,
        teamFortitude: stat, teamOffense: stat, teamResistance: stat, teamTech: stat,
        fortitude_Phoenix: stat, offense_Phoenix: stat, resistance_Phoenix: stat, tech_Phoenix: stat,
        teamFortitude_Phoenix: stat, teamOffense_Phoenix: stat, teamResistance_Phoenix: stat, teamTech_Phoenix: stat,
      },
    };

    console.log(`[GhostEquip] Setting PL ${powerLevel} → stat=${stat}, power=${power}`);
    await party.me!.sendPatch({
      'Default:FORTStats_j': JSON.stringify(statsPayload),
      'Default:CampaignCommanderLoadoutRating_d': String(power),
      'Default:CampaignBackpackRating_d': String(power),
    });
    console.log(`[GhostEquip] Power level applied successfully`);
    return { success: true, message: `Power Level set to ${powerLevel}` };
  } catch (err: any) {
    const msg = extractError(err);
    console.error('[GhostEquip] setPowerLevel error:', msg, err);
    return { success: false, error: msg };
  }
}
