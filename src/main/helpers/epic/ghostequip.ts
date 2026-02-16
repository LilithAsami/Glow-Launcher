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
