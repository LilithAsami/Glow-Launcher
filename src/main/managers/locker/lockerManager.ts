/**
 * Locker Manager — EOS-based locker read/write + MCP owned cosmetics
 *
 * Auth flow (from locker.js reference):
 *   1. device_auth (ANDROID) → access_token
 *   2. exchange code from that token
 *   3. exchange_code → LAUNCHER token
 *   4. LAUNCHER token → EOS token (external_auth with FN_EOS client)
 *   5. Use EOS token with locker v4 API
 *
 * Owned cosmetics: MCP QueryProfile (athena)
 * Metadata:        fortnite-api.com/v2/cosmetics/br  (+ instruments, tracks, cars, banners)
 */

import axios from 'axios';
import crypto from 'crypto';
import { Endpoints } from '../../helpers/endpoints';
import { refreshAccountToken } from '../../helpers/auth/tokenRefresh';
import { ANDROID_CLIENT, LAUNCHER_CLIENT } from '../../helpers/auth/clients';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ── Constants ─────────────────────────────────────────────

const FN_EOS_CLIENT = Buffer.from(
  'ec684b8c687f479fadea3cb2ad83f5c6:e1f31c211f28413186262d37a13fc84d',
).toString('base64');

const EOS_AUTH_URL = 'https://api.epicgames.dev/auth/v1/oauth/token';
const DEPLOYMENT_ID = '62a9473a2dca46b29ccf17577fcf42d7';
const LOCKER_BASE = `https://fngw-svc-gc-livefn.ol.epicgames.com/api/locker/v4/${DEPLOYMENT_ID}/account`;

const FN_API_BR = 'https://fortnite-api.com/v2/cosmetics/br';
const FN_API_BANNERS = 'https://fortnite-api.com/v1/banners';
const FN_API_BANNER_COLORS = 'https://fortnite-api.com/v1/banners/colors';
const FN_API_INSTRUMENTS = 'https://fortnite-api.com/v2/cosmetics/instruments';
const FN_API_TRACKS = 'https://fortnite-api.com/v2/cosmetics/tracks';
const FN_API_CARS = 'https://fortnite-api.com/v2/cosmetics/cars';
const LANG = 'en';

// ── Slot template map ─────────────────────────────────────

export const SLOT_TEMPLATE: Record<string, string> = {
  // Character schema
  character:         'CosmeticLoadoutSlotTemplate:LoadoutSlot_Character',
  backpack:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_Backpack',
  pickaxe:           'CosmeticLoadoutSlotTemplate:LoadoutSlot_Pickaxe',
  glider:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Glider',
  contrail:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_Contrails',
  shoes:             'CosmeticLoadoutSlotTemplate:LoadoutSlot_Shoes',
  aura:              'CosmeticLoadoutSlotTemplate:LoadoutSlot_Aura',
  // Emotes schema
  emote0:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Emote_0',
  emote1:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Emote_1',
  emote2:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Emote_2',
  emote3:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Emote_3',
  emote4:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Emote_4',
  emote5:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Emote_5',
  emote6:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Emote_6',
  emote7:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Emote_7',
  // Wraps schema
  wrap0:             'CosmeticLoadoutSlotTemplate:LoadoutSlot_Wrap_0',
  wrap1:             'CosmeticLoadoutSlotTemplate:LoadoutSlot_Wrap_1',
  wrap2:             'CosmeticLoadoutSlotTemplate:LoadoutSlot_Wrap_2',
  wrap3:             'CosmeticLoadoutSlotTemplate:LoadoutSlot_Wrap_3',
  wrap4:             'CosmeticLoadoutSlotTemplate:LoadoutSlot_Wrap_4',
  wrap5:             'CosmeticLoadoutSlotTemplate:LoadoutSlot_Wrap_5',
  wrap6:             'CosmeticLoadoutSlotTemplate:LoadoutSlot_Wrap_6',
  // Platform schema (banner, music, loading)
  bannerIcon:        'CosmeticLoadoutSlotTemplate:LoadoutSlot_Banner_Icon',
  bannerColor:       'CosmeticLoadoutSlotTemplate:LoadoutSlot_Banner_Color',
  musicpack:         'CosmeticLoadoutSlotTemplate:LoadoutSlot_LobbyMusic',
  loadingscreen:     'CosmeticLoadoutSlotTemplate:LoadoutSlot_LoadingScreen',
  // Sparks schema (instruments)
  guitar:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Guitar',
  bass:              'CosmeticLoadoutSlotTemplate:LoadoutSlot_Bass',
  drum:              'CosmeticLoadoutSlotTemplate:LoadoutSlot_Drum',
  keyboard:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_Keyboard',
  microphone:        'CosmeticLoadoutSlotTemplate:LoadoutSlot_Microphone',
  // JamTracks schema
  jamSong0:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_JamSong0',
  jamSong1:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_JamSong1',
  jamSong2:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_JamSong2',
  jamSong3:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_JamSong3',
  jamSong4:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_JamSong4',
  jamSong5:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_JamSong5',
  jamSong6:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_JamSong6',
  jamSong7:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_JamSong7',
  // Vehicle schema (Sports car)
  vehicleBody:       'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Body',
  vehicleSkin:       'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Skin',
  vehicleWheel:      'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Wheel',
  vehicleDriftSmoke: 'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_DriftSmoke',
  vehicleBooster:    'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Booster',
  // Vehicle SUV schema
  suvBody:           'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Body_SUV',
  suvSkin:           'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Skin_SUV',
  suvWheel:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Wheel_SUV',
  suvDriftSmoke:     'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_DriftSmoke_SUV',
  suvBooster:        'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Booster_SUV',
  // Mimosa schema (companion)
  mimosaMain:        'CosmeticLoadoutSlotTemplate:LoadoutSlot_MimosaMain',
};

/** Reverse map: template → slotKey */
const TEMPLATE_TO_SLOT = Object.fromEntries(
  Object.entries(SLOT_TEMPLATE).map(([k, v]) => [v, k]),
);

/**
 * Fallback: slot → schema mapping.
 * Used ONLY when a slot doesn't exist in the current GET response (first-time equip).
 * The primary approach is to dynamically rebuild from the GET response.
 */
const SLOT_TO_SCHEMA: Record<string, string> = {
  // Character
  character: 'CosmeticLoadout:LoadoutSchema_Character',
  backpack: 'CosmeticLoadout:LoadoutSchema_Character',
  pickaxe: 'CosmeticLoadout:LoadoutSchema_Character',
  glider: 'CosmeticLoadout:LoadoutSchema_Character',
  contrail: 'CosmeticLoadout:LoadoutSchema_Character',
  shoes: 'CosmeticLoadout:LoadoutSchema_Character',
  aura: 'CosmeticLoadout:LoadoutSchema_Character',
  // Emotes
  emote0: 'CosmeticLoadout:LoadoutSchema_Emotes',
  emote1: 'CosmeticLoadout:LoadoutSchema_Emotes',
  emote2: 'CosmeticLoadout:LoadoutSchema_Emotes',
  emote3: 'CosmeticLoadout:LoadoutSchema_Emotes',
  emote4: 'CosmeticLoadout:LoadoutSchema_Emotes',
  emote5: 'CosmeticLoadout:LoadoutSchema_Emotes',
  emote6: 'CosmeticLoadout:LoadoutSchema_Emotes',
  emote7: 'CosmeticLoadout:LoadoutSchema_Emotes',
  // Wraps
  wrap0: 'CosmeticLoadout:LoadoutSchema_Wraps',
  wrap1: 'CosmeticLoadout:LoadoutSchema_Wraps',
  wrap2: 'CosmeticLoadout:LoadoutSchema_Wraps',
  wrap3: 'CosmeticLoadout:LoadoutSchema_Wraps',
  wrap4: 'CosmeticLoadout:LoadoutSchema_Wraps',
  wrap5: 'CosmeticLoadout:LoadoutSchema_Wraps',
  wrap6: 'CosmeticLoadout:LoadoutSchema_Wraps',
  // Platform
  bannerIcon: 'CosmeticLoadout:LoadoutSchema_Platform',
  bannerColor: 'CosmeticLoadout:LoadoutSchema_Platform',
  musicpack: 'CosmeticLoadout:LoadoutSchema_Platform',
  loadingscreen: 'CosmeticLoadout:LoadoutSchema_Platform',
  // Sparks (instruments)
  guitar: 'CosmeticLoadout:LoadoutSchema_Sparks',
  bass: 'CosmeticLoadout:LoadoutSchema_Sparks',
  drum: 'CosmeticLoadout:LoadoutSchema_Sparks',
  keyboard: 'CosmeticLoadout:LoadoutSchema_Sparks',
  microphone: 'CosmeticLoadout:LoadoutSchema_Sparks',
  // JamTracks
  jamSong0: 'CosmeticLoadout:LoadoutSchema_JamTracks',
  jamSong1: 'CosmeticLoadout:LoadoutSchema_JamTracks',
  jamSong2: 'CosmeticLoadout:LoadoutSchema_JamTracks',
  jamSong3: 'CosmeticLoadout:LoadoutSchema_JamTracks',
  jamSong4: 'CosmeticLoadout:LoadoutSchema_JamTracks',
  jamSong5: 'CosmeticLoadout:LoadoutSchema_JamTracks',
  jamSong6: 'CosmeticLoadout:LoadoutSchema_JamTracks',
  jamSong7: 'CosmeticLoadout:LoadoutSchema_JamTracks',
  // Vehicle (Sports)
  vehicleBody: 'CosmeticLoadout:LoadoutSchema_Vehicle',
  vehicleSkin: 'CosmeticLoadout:LoadoutSchema_Vehicle',
  vehicleWheel: 'CosmeticLoadout:LoadoutSchema_Vehicle',
  vehicleDriftSmoke: 'CosmeticLoadout:LoadoutSchema_Vehicle',
  vehicleBooster: 'CosmeticLoadout:LoadoutSchema_Vehicle',
  // Vehicle (SUV)
  suvBody: 'CosmeticLoadout:LoadoutSchema_Vehicle_SUV',
  suvSkin: 'CosmeticLoadout:LoadoutSchema_Vehicle_SUV',
  suvWheel: 'CosmeticLoadout:LoadoutSchema_Vehicle_SUV',
  suvDriftSmoke: 'CosmeticLoadout:LoadoutSchema_Vehicle_SUV',
  suvBooster: 'CosmeticLoadout:LoadoutSchema_Vehicle_SUV',
  // Mimosa (companion)
  mimosaMain: 'CosmeticLoadout:LoadoutSchema_Mimosa',
};

// ── User-visible slot categories ──────────────────────────

export interface SlotCategory {
  label: string;
  slots: string[];
}

export const SLOT_CATEGORIES: SlotCategory[] = [
  { label: 'Character',    slots: ['character', 'backpack', 'pickaxe', 'glider', 'contrail', 'shoes', 'aura'] },
  { label: 'Emotes',       slots: ['emote0', 'emote1', 'emote2', 'emote3', 'emote4', 'emote5', 'emote6', 'emote7'] },
  { label: 'Wraps',        slots: ['wrap0', 'wrap1', 'wrap2', 'wrap3', 'wrap4', 'wrap5', 'wrap6'] },
  { label: 'Banner',       slots: ['bannerIcon', 'bannerColor'] },
  { label: 'Music & Screen', slots: ['musicpack', 'loadingscreen'] },
  { label: 'Instruments',  slots: ['guitar', 'bass', 'drum', 'keyboard', 'microphone'] },
  { label: 'Tracks',       slots: ['jamSong0', 'jamSong1', 'jamSong2', 'jamSong3', 'jamSong4', 'jamSong5', 'jamSong6', 'jamSong7'] },
  { label: 'Vehicle (Sports)', slots: ['vehicleBody', 'vehicleSkin', 'vehicleWheel', 'vehicleDriftSmoke', 'vehicleBooster'] },
  { label: 'Vehicle (SUV)',    slots: ['suvBody', 'suvSkin', 'suvWheel', 'suvDriftSmoke', 'suvBooster'] },
  { label: 'Companion',    slots: ['mimosaMain'] },
];

// ── Slot → cosmetic prefix mapping (for owned items) ──────

const SLOT_PREFIX_MAP: Record<string, string[]> = {
  character:    ['AthenaCharacter'],
  backpack:     ['AthenaBackpack'],
  pickaxe:      ['AthenaPickaxe'],
  glider:       ['AthenaGlider'],
  contrail:     ['AthenaSkyDiveContrail'],
  shoes:        ['CosmeticShoes'],
  aura:         ['SparksAura'],
  // Normalized keys used by filterOwnedForSlot via normalizeSlotType
  emote:        ['AthenaDance'],
  wrap:         ['AthenaItemWrap'],
  jamSong:      ['SparksSong'],
  emote0:       ['AthenaDance'],
  emote1:       ['AthenaDance'],
  emote2:       ['AthenaDance'],
  emote3:       ['AthenaDance'],
  emote4:       ['AthenaDance'],
  emote5:       ['AthenaDance'],
  emote6:       ['AthenaDance'],
  emote7:       ['AthenaDance'],
  wrap0:        ['AthenaItemWrap'],
  wrap1:        ['AthenaItemWrap'],
  wrap2:        ['AthenaItemWrap'],
  wrap3:        ['AthenaItemWrap'],
  wrap4:        ['AthenaItemWrap'],
  wrap5:        ['AthenaItemWrap'],
  wrap6:        ['AthenaItemWrap'],
  bannerIcon:   ['HomebaseBannerIcon'],
  bannerColor:  ['HomebaseBannerColor'],
  musicpack:    ['AthenaMusicPack'],
  loadingscreen:['AthenaLoadingScreen'],
  guitar:       ['SparksGuitar'],
  bass:         ['SparksBass'],
  drum:         ['SparksDrums'],
  keyboard:     ['SparksKeyboard'],
  microphone:   ['SparksMicrophone'],
  jamSong0:     ['SparksSong'],
  jamSong1:     ['SparksSong'],
  jamSong2:     ['SparksSong'],
  jamSong3:     ['SparksSong'],
  jamSong4:     ['SparksSong'],
  jamSong5:     ['SparksSong'],
  jamSong6:     ['SparksSong'],
  jamSong7:     ['SparksSong'],
  // Vehicle (Sports)
  vehicleBody:       ['VehicleCosmetics_Body'],
  vehicleSkin:       ['VehicleCosmetics_Skin'],
  vehicleWheel:      ['VehicleCosmetics_Wheel'],
  vehicleDriftSmoke: ['VehicleCosmetics_DriftTrail'],
  vehicleBooster:    ['VehicleCosmetics_Booster'],
  // Vehicle (SUV) — same cosmetic types, each slot individually mapped
  suvBody:           ['VehicleCosmetics_Body'],
  suvSkin:           ['VehicleCosmetics_Skin'],
  suvWheel:          ['VehicleCosmetics_Wheel'],
  suvDriftSmoke:     ['VehicleCosmetics_DriftTrail'],
  suvBooster:        ['VehicleCosmetics_Booster'],
  // Companion
  mimosaMain:        ['CosmeticMimosa'],
  companion:         ['CosmeticMimosa'],
};

// Normalized slot type for grouping (e.g. emote0-7 → emote)
function normalizeSlotType(slot: string): string {
  if (slot.startsWith('emote')) return 'emote';
  if (slot.startsWith('wrap')) return 'wrap';
  if (slot.startsWith('jamSong')) return 'jamSong';
  return slot;
}

// ── EOS Auth ──────────────────────────────────────────────

async function getExchangeCode(accessToken: string): Promise<string> {
  const { data } = await axios.get(Endpoints.OAUTH_EXCHANGE, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15_000,
  });
  return data.code;
}

async function exchangeToLauncher(exchangeCode: string): Promise<string> {
  const { data } = await axios.post(
    Endpoints.OAUTH_TOKEN,
    new URLSearchParams({
      grant_type: 'exchange_code',
      exchange_code: exchangeCode,
      token_type: 'eg1',
    }).toString(),
    {
      headers: {
        Authorization: `basic ${LAUNCHER_CLIENT.auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15_000,
    },
  );
  return data.access_token;
}

async function getEosToken(epicToken: string): Promise<string> {
  const { data } = await axios.post(
    EOS_AUTH_URL,
    new URLSearchParams({
      grant_type: 'external_auth',
      external_auth_type: 'epicgames_access_token',
      external_auth_token: epicToken,
      deployment_id: DEPLOYMENT_ID,
      nonce: crypto.randomBytes(8).toString('hex'),
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${FN_EOS_CLIENT}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 15_000,
    },
  );
  return data.access_token;
}

/**
 * Full auth chain: device_auth → exchange → launcher → EOS token
 * Returns { eosToken, accountId, epicToken }
 */
async function getFullAuth(storage: Storage): Promise<{
  eosToken: string;
  accountId: string;
  epicToken: string;
  displayName: string;
}> {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) throw new Error('No account found');

  // Step 1: device_auth → android token
  const androidToken = await refreshAccountToken(storage, main.accountId);
  if (!androidToken) throw new Error('Token refresh failed');

  // Step 2: android token → exchange code → launcher token
  const exchangeCode = await getExchangeCode(androidToken);
  const launcherToken = await exchangeToLauncher(exchangeCode);

  // Step 3: launcher token → EOS token
  const eosToken = await getEosToken(launcherToken);

  return {
    eosToken,
    accountId: main.accountId,
    epicToken: androidToken,
    displayName: main.displayName || main.accountId,
  };
}

// ── EOS Locker API ────────────────────────────────────────

export interface EquippedSlot {
  slotKey: string;
  itemId: string | null;
  customizations: any[];
  schema: string;
}

export async function getCurrentLoadout(storage: Storage): Promise<{
  slots: Record<string, EquippedSlot>;
  displayName: string;
}> {
  const { eosToken, accountId, displayName } = await getFullAuth(storage);

  const res = await axios.get(`${LOCKER_BASE}/${accountId}/items`, {
    headers: { Authorization: `Bearer ${eosToken}` },
    timeout: 15_000,
    validateStatus: () => true,
  });

  if (res.status === 401) {
    // Retry once with fresh auth
    const fresh = await getFullAuth(storage);
    const retry = await axios.get(`${LOCKER_BASE}/${fresh.accountId}/items`, {
      headers: { Authorization: `Bearer ${fresh.eosToken}` },
      timeout: 15_000,
    });
    return { slots: parseLoadouts(retry.data), displayName: fresh.displayName };
  }

  if (res.status !== 200) {
    throw new Error(`Locker API error (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return { slots: parseLoadouts(res.data), displayName };
}

function parseLoadouts(data: any): Record<string, EquippedSlot> {
  const loadouts = data?.activeLoadoutGroup?.loadouts;
  if (!loadouts) return {};

  const result: Record<string, EquippedSlot> = {};
  for (const [schemaKey, schema] of Object.entries(loadouts) as [string, any][]) {
    for (const slot of (schema.loadoutSlots ?? [])) {
      const slotKey = TEMPLATE_TO_SLOT[slot.slotTemplate];
      if (slotKey) {
        result[slotKey] = {
          slotKey,
          itemId: slot.equippedItemId ?? null,
          customizations: slot.itemCustomizations ?? [],
          schema: schemaKey,
        };
      }
    }
  }
  return result;
}

// ── Equip item ────────────────────────────────────────────

export async function equipItem(
  storage: Storage,
  slotKey: string,
  itemId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { eosToken, accountId } = await getFullAuth(storage);

    const template = SLOT_TEMPLATE[slotKey];
    if (!template) return { success: false, error: `Unknown slot: ${slotKey}` };

    // ── 1. GET the current full loadout from EOS ──
    const getRes = await axios.get(`${LOCKER_BASE}/${accountId}/items`, {
      headers: { Authorization: `Bearer ${eosToken}` },
      timeout: 15_000,
      validateStatus: () => true,
    });

    if (getRes.status !== 200) {
      return { success: false, error: `Failed to read current loadout (${getRes.status})` };
    }

    const rawLoadouts = getRes.data?.activeLoadoutGroup?.loadouts;
    if (!rawLoadouts) {
      return { success: false, error: 'No loadout data in GET response' };
    }

    // ── 2. Dynamically rebuild payload from the ACTUAL GET response ──
    //    We iterate over exactly what Epic returned, preserving all schemas.
    //    Only the target slot is modified; everything else stays untouched.
    const loadouts: Record<string, any> = {};
    let targetFound = false;

    for (const [schemaKey, schemaData] of Object.entries(rawLoadouts) as [string, any][]) {
      const rebuiltSlots: any[] = [];

      for (const slot of (schemaData.loadoutSlots ?? [])) {
        const isTarget = slot.slotTemplate === template;

        if (isTarget) {
          targetFound = true;
          // Equipping: set itemId; Removing: skip slot entirely (empty itemId)
          if (itemId) {
            rebuiltSlots.push({
              slotTemplate: template,
              equippedItemId: itemId,
              itemCustomizations: [],
            });
          }
          // if !itemId → slot removed (not added to payload)
        } else {
          // Keep existing slot exactly as the API returned it
          const entry: any = {
            slotTemplate: slot.slotTemplate,
            itemCustomizations: slot.itemCustomizations ?? [],
          };
          if (slot.equippedItemId) {
            entry.equippedItemId = slot.equippedItemId;
          }
          rebuiltSlots.push(entry);
        }
      }

      if (rebuiltSlots.length) {
        loadouts[schemaKey] = {
          loadoutSlots: rebuiltSlots,
          shuffleType: schemaData.shuffleType ?? 'DISABLED',
        };
      }
    }

    // If the target slot wasn't in any schema yet (first-time equip), add it
    if (!targetFound && itemId) {
      const fallbackSchema = SLOT_TO_SCHEMA[slotKey];
      if (fallbackSchema) {
        if (!loadouts[fallbackSchema]) {
          loadouts[fallbackSchema] = { loadoutSlots: [], shuffleType: 'DISABLED' };
        }
        loadouts[fallbackSchema].loadoutSlots.push({
          slotTemplate: template,
          equippedItemId: itemId,
          itemCustomizations: [],
        });
      }
    }

    const payload = { loadouts };

    // ── 3. PUT the full loadout ──
    const putFn = async (token: string, accId: string) => {
      return axios.put(
        `${LOCKER_BASE}/${accId}/active-loadout-group`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 15_000,
          validateStatus: () => true,
        },
      );
    };

    const res = await putFn(eosToken, accountId);

    if (res.status >= 200 && res.status < 300) {
      return { success: true };
    }

    if (res.status === 401) {
      const fresh = await getFullAuth(storage);
      const retry = await putFn(fresh.eosToken, fresh.accountId);
      if (retry.status >= 200 && retry.status < 300) return { success: true };
      return { success: false, error: `Locker API error (${retry.status})` };
    }

    return { success: false, error: res.data?.message || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown error' };
  }
}

// ── Get owned cosmetics (MCP athena profile) ──────────────

export interface OwnedCosmetic {
  itemId: string;       // full templateId: "AthenaCharacter:CID_xxx"
  backendType: string;  // prefix: "AthenaCharacter"
  id: string;           // just "CID_xxx"
}

export async function getOwnedCosmetics(storage: Storage): Promise<OwnedCosmetic[]> {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) throw new Error('No account found');

  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Token refresh failed');

  const cosmetics: OwnedCosmetic[] = [];

  // Helper to parse items from a profile response
  const parseItems = (items: any) => {
    if (!items) return;
    for (const itemData of Object.values(items) as any[]) {
      const templateId: string = itemData.templateId;
      if (!templateId) continue;
      const sep = templateId.indexOf(':');
      if (sep < 0) continue;
      const backendType = templateId.slice(0, sep);
      const id = templateId.slice(sep + 1);
      cosmetics.push({ itemId: templateId, backendType, id });
    }
  };

  // 1. Athena profile — skins, emotes, wraps, music, loadingscreens, instruments, tracks, etc.
  const athenaUrl = `${Endpoints.MCP}/${main.accountId}/client/QueryProfile?profileId=athena&rvn=-1`;
  const { data: athenaData } = await axios.post(athenaUrl, {}, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 20_000,
  });
  parseItems(athenaData?.profileChanges?.[0]?.profile?.items);

  // 2. Common_core profile — banners (HomebaseBannerIcon) & banner colors (HomebaseBannerColor)
  try {
    const ccUrl = `${Endpoints.MCP}/${main.accountId}/client/QueryProfile?profileId=common_core&rvn=-1`;
    const { data: ccData } = await axios.post(ccUrl, {}, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 20_000,
    });
    const ccItems = ccData?.profileChanges?.[0]?.profile?.items;
    if (ccItems) {
      // Only pick banner-related items from common_core
      for (const itemData of Object.values(ccItems) as any[]) {
        const templateId: string = itemData.templateId;
        if (!templateId) continue;
        if (!templateId.startsWith('HomebaseBannerIcon:') && !templateId.startsWith('HomebaseBannerColor:')) continue;
        const sep = templateId.indexOf(':');
        if (sep < 0) continue;
        const backendType = templateId.slice(0, sep);
        const id = templateId.slice(sep + 1);
        cosmetics.push({ itemId: templateId, backendType, id });
      }
    }
  } catch { /* banner fetch is non-critical */ }

  return cosmetics;
}

/**
 * Get owned cosmetics filtered for a specific slot type
 */
export function filterOwnedForSlot(
  owned: OwnedCosmetic[],
  slotKey: string,
): OwnedCosmetic[] {
  const prefixes = SLOT_PREFIX_MAP[normalizeSlotType(slotKey)];
  if (!prefixes) return [];
  return owned.filter((c) => prefixes.includes(c.backendType));
}

// ── Fortnite-API metadata ─────────────────────────────────

let brApiCache: any[] | null = null;
let brApiCacheTS = 0;
let bannerApiCache: any[] | null = null;
let bannerApiCacheTS = 0;
let bannerColorsCache: any[] | null = null;
let bannerColorsCacheTS = 0;
let instrumentsCache: any[] | null = null;
let instrumentsCacheTS = 0;
let tracksCache: any[] | null = null;
let tracksCacheTS = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1h

async function getBrCosmetics(): Promise<any[]> {
  if (brApiCache && Date.now() - brApiCacheTS < CACHE_TTL) return brApiCache;
  try {
    const { data } = await axios.get(FN_API_BR, { params: { language: LANG }, timeout: 20_000 });
    brApiCache = data?.data ?? [];
    brApiCacheTS = Date.now();
  } catch { brApiCache = brApiCache ?? []; }
  return brApiCache!;
}

async function getBanners(): Promise<any[]> {
  if (bannerApiCache && Date.now() - bannerApiCacheTS < CACHE_TTL) return bannerApiCache;
  try {
    const { data } = await axios.get(FN_API_BANNERS, { params: { language: LANG }, timeout: 20_000 });
    bannerApiCache = data?.data ?? [];
    bannerApiCacheTS = Date.now();
  } catch { bannerApiCache = bannerApiCache ?? []; }
  return bannerApiCache!;
}

async function getBannerColors(): Promise<any[]> {
  if (bannerColorsCache && Date.now() - bannerColorsCacheTS < CACHE_TTL) return bannerColorsCache;
  try {
    const { data } = await axios.get(FN_API_BANNER_COLORS, { timeout: 20_000 });
    bannerColorsCache = data?.data ?? [];
    bannerColorsCacheTS = Date.now();
  } catch { bannerColorsCache = bannerColorsCache ?? []; }
  return bannerColorsCache!;
}

async function getInstruments(): Promise<any[]> {
  if (instrumentsCache && Date.now() - instrumentsCacheTS < CACHE_TTL) return instrumentsCache;
  try {
    const { data } = await axios.get(FN_API_INSTRUMENTS, { params: { language: LANG }, timeout: 20_000 });
    instrumentsCache = data?.data ?? [];
    instrumentsCacheTS = Date.now();
  } catch { instrumentsCache = instrumentsCache ?? []; }
  return instrumentsCache!;
}

async function getTracks(): Promise<any[]> {
  if (tracksCache && Date.now() - tracksCacheTS < CACHE_TTL) return tracksCache;
  try {
    const { data } = await axios.get(FN_API_TRACKS, { params: { language: LANG }, timeout: 20_000 });
    tracksCache = data?.data ?? [];
    tracksCacheTS = Date.now();
  } catch { tracksCache = tracksCache ?? []; }
  return tracksCache!;
}

let carsCache: any[] | null = null;
let carsCacheTS = 0;

async function getCars(): Promise<any[]> {
  if (carsCache && Date.now() - carsCacheTS < CACHE_TTL) return carsCache;
  try {
    const { data } = await axios.get(FN_API_CARS, { params: { language: LANG }, timeout: 20_000 });
    carsCache = data?.data ?? [];
    carsCacheTS = Date.now();
  } catch { carsCache = carsCache ?? []; }
  return carsCache!;
}

export interface CosmeticMeta {
  name: string;
  imageUrl: string | null;
  rarity: string;
  series: string | null;
  backendType: string;
  id: string;
  itemId: string;
  color?: string; // hex color for banner colors
}

// Helper: extract rarity string from an API item
function extractRarity(item: any): string {
  return item?.series?.backendValue?.toLowerCase()
    || item?.rarity?.value?.toLowerCase()
    || 'common';
}
function extractSeries(item: any): string | null {
  return item?.series?.backendValue || null;
}
function extractImage(item: any): string | null {
  if (!item) return null;
  if (item.albumArt) return item.albumArt; // tracks
  const img = item.images ?? {};
  // instruments use images.small/large, BR uses smallIcon/icon/featured
  return img.smallIcon || img.icon || img.featured || img.small || img.large || img.background || null;
}

// ── Banner color name → hex conversion ─────────────────────
// Epic returns names like "RedH0", "GreenH120Dark", "Gray666666FF" — NOT hex
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function parseBannerColor(colorStr: string): string | undefined {
  if (!colorStr) return undefined;

  let variant: 'normal' | 'dark' | 'light' = 'normal';
  let base = colorStr;

  if (base.endsWith('Light')) { variant = 'light'; base = base.slice(0, -5); }
  else if (base.endsWith('Dark')) { variant = 'dark'; base = base.slice(0, -4); }

  // Embedded ARGB hex — e.g. "Gray666666FF" → #666666
  const hexMatch = base.match(/([0-9a-fA-F]{6,8})$/);
  if (hexMatch) {
    const raw = hexMatch[1].slice(0, 6);
    let r = parseInt(raw.slice(0, 2), 16);
    let g = parseInt(raw.slice(2, 4), 16);
    let b = parseInt(raw.slice(4, 6), 16);
    if (variant === 'dark') { r = Math.round(r * 0.6); g = Math.round(g * 0.6); b = Math.round(b * 0.6); }
    else if (variant === 'light') { r = Math.min(255, Math.round(r * 1.4)); g = Math.min(255, Math.round(r * 1.4)); b = Math.min(255, Math.round(b * 1.4)); }
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  }

  // HSL hue-based — e.g. "RedH0", "GreenH120", "BlueH240Dark"
  const hueMatch = base.match(/H(\d+)$/);
  if (hueMatch) {
    const hue = parseInt(hueMatch[1], 10);
    let s = 70, l = 50;
    if (variant === 'dark') { s = 65; l = 32; }
    else if (variant === 'light') { s = 65; l = 72; }
    return hslToHex(hue, s, l);
  }

  return undefined;
}

// Instrument prefix set
const INSTRUMENT_PREFIXES = new Set(['SparksGuitar', 'SparksBass', 'SparksDrums', 'SparksKeyboard', 'SparksMicrophone']);
// Vehicle cosmetic prefix set
const VEHICLE_PREFIXES = new Set([
  'VehicleCosmetics_Body', 'VehicleCosmetics_Skin', 'VehicleCosmetics_Wheel',
  'VehicleCosmetics_DriftTrail', 'VehicleCosmetics_Booster',
]);

/**
 * Resolve metadata for a list of OwnedCosmetics.
 * Uses fortnite-api.com data (cached 1h).
 */
export async function resolveMetadata(
  cosmetics: OwnedCosmetic[],
): Promise<CosmeticMeta[]> {
  // Pre-fetch all needed API data in parallel
  const [brAll, banners, bannerColors, instruments, tracks, cars] = await Promise.all([
    getBrCosmetics(), getBanners(), getBannerColors(), getInstruments(), getTracks(), getCars(),
  ]);

  const brMap = new Map<string, any>();
  for (const c of brAll) { if (c?.id) brMap.set(c.id.toLowerCase(), c); }

  const bannerMap = new Map<string, any>();
  for (const b of banners) { if (b?.id) bannerMap.set(b.id.toLowerCase(), b); }

  const bannerColorMap = new Map<string, any>();
  for (const bc of bannerColors) { if (bc?.id) bannerColorMap.set(bc.id.toLowerCase(), bc); }

  const instrumentMap = new Map<string, any>();
  for (const inst of instruments) {
    if (!inst?.id) continue;
    const apiId = inst.id.toLowerCase();
    instrumentMap.set(apiId, inst);
    const colonIdx = apiId.indexOf(':');
    if (colonIdx >= 0) instrumentMap.set(apiId.slice(colonIdx + 1), inst);
  }

  const trackMap = new Map<string, any>();
  for (const t of tracks) {
    if (!t?.id) continue;
    trackMap.set(t.id.toLowerCase(), t);
    const devN = (t.devName ?? '').toLowerCase();
    if (devN) trackMap.set(devN, t);
  }

  const carMap = new Map<string, any>();
  for (const car of cars) {
    if (!car?.id) continue;
    carMap.set(car.id.toLowerCase(), car);
    if (car.vehicleId) carMap.set(car.vehicleId.toLowerCase(), car);
  }

  const results: CosmeticMeta[] = [];

  for (const c of cosmetics) {
    const idLower = c.id.toLowerCase();

    // 1. Banner icons (check before BR since they aren't in BR API)
    if (c.backendType === 'HomebaseBannerIcon') {
      const b = bannerMap.get(idLower);
      results.push({
        name: b?.name || c.id,
        imageUrl: b?.images?.smallIcon || b?.images?.icon || null,
        rarity: 'common', series: null,
        backendType: c.backendType, id: c.id, itemId: c.itemId,
      });
      continue;
    }

    // 2. Banner colors
    if (c.backendType === 'HomebaseBannerColor') {
      const bc = bannerColorMap.get(idLower);
      const hex = bc?.color ? parseBannerColor(String(bc.color)) : undefined;
      results.push({
        name: bc?.name || bc?.devName || c.id,
        imageUrl: null,
        rarity: 'common', series: null,
        backendType: c.backendType, id: c.id, itemId: c.itemId,
        color: hex,
      });
      continue;
    }

    // 3. Instruments
    if (INSTRUMENT_PREFIXES.has(c.backendType)) {
      const inst = instrumentMap.get(idLower);
      if (inst) {
        results.push({
          name: inst.name || c.id,
          imageUrl: extractImage(inst),
          rarity: extractRarity(inst),
          series: extractSeries(inst),
          backendType: c.backendType, id: c.id, itemId: c.itemId,
        });
        continue;
      }
    }

    // 4. Tracks / jam songs
    if (c.backendType === 'SparksSong') {
      const t = trackMap.get(idLower);
      if (t) {
        results.push({
          name: t.title || t.name || c.id,
          imageUrl: t.albumArt || null,
          rarity: extractRarity(t),
          series: extractSeries(t),
          backendType: c.backendType, id: c.id, itemId: c.itemId,
        });
        continue;
      }
    }

    // 5. Vehicle cosmetics (cars API)
    if (VEHICLE_PREFIXES.has(c.backendType)) {
      const car = carMap.get(idLower);
      if (car) {
        const img = car.images ?? {};
        results.push({
          name: car.name || c.id,
          imageUrl: img.small || img.large || img.icon || null,
          rarity: extractRarity(car),
          series: extractSeries(car),
          backendType: c.backendType, id: c.id, itemId: c.itemId,
        });
        continue;
      }
    }

    // 6. BR cosmetics (outfits, emotes, wraps, music packs, loading screens, companions, etc.)
    const brFound = brMap.get(idLower);
    if (brFound) {
      results.push({
        name: brFound.name || c.id,
        imageUrl: extractImage(brFound),
        rarity: extractRarity(brFound),
        series: extractSeries(brFound),
        backendType: c.backendType, id: c.id, itemId: c.itemId,
      });
      continue;
    }

    // 6.5. Companion — ID may have variant suffix (e.g. "companion_flourcut:70c")
    //   Strip variant suffix and retry BR lookup
    if (c.backendType === 'CosmeticMimosa') {
      const colonIdx = c.id.indexOf(':');
      const baseId = colonIdx >= 0 ? c.id.slice(0, colonIdx) : c.id;
      const brComp = brMap.get(baseId.toLowerCase());
      if (brComp) {
        results.push({
          name: brComp.name || baseId,
          imageUrl: extractImage(brComp),
          rarity: extractRarity(brComp),
          series: extractSeries(brComp),
          backendType: c.backendType, id: c.id, itemId: c.itemId,
        });
        continue;
      }
    }

    // 7. Fallback
    results.push({
      name: c.id, imageUrl: null, rarity: 'common', series: null,
      backendType: c.backendType, id: c.id, itemId: c.itemId,
    });
  }
  return results;
}

/**
 * Resolve a single itemId to metadata (for current loadout display)
 */
export async function resolveSingleItem(itemId: string): Promise<{
  name: string;
  imageUrl: string | null;
  rarity: string;
  series: string | null;
  color?: string;
} | null> {
  if (!itemId) return null;
  const sep = itemId.indexOf(':');
  const prefix = sep >= 0 ? itemId.slice(0, sep) : '';
  const id = sep >= 0 ? itemId.slice(sep + 1) : itemId;
  const idLower = id.toLowerCase();
  const itemIdLower = itemId.toLowerCase();

  // 1. Banner icons (not in BR API)
  if (prefix === 'HomebaseBannerIcon') {
    const banners = await getBanners();
    const b = banners.find((bn: any) => (bn.id ?? '').toLowerCase() === idLower);
    if (b) {
      return {
        name: b.name || id,
        imageUrl: b.images?.smallIcon || b.images?.icon || null,
        rarity: 'common', series: null,
      };
    }
  }

  // 2. Banner colors
  if (prefix === 'HomebaseBannerColor') {
    const colors = await getBannerColors();
    const bc = colors.find((c: any) => (c.id ?? '').toLowerCase() === idLower);
    const hex = bc?.color ? parseBannerColor(String(bc.color)) : undefined;
    return {
      name: bc?.name || bc?.devName || id,
      imageUrl: null,
      rarity: 'common', series: null,
      color: hex,
    };
  }

  // 3. Instruments
  if (INSTRUMENT_PREFIXES.has(prefix)) {
    const instruments = await getInstruments();
    const inst = instruments.find((i: any) => {
      const apiId = (i.id ?? '').toLowerCase();
      const apiPart = apiId.includes(':') ? apiId.split(':')[1] : apiId;
      return apiId === idLower || apiPart === idLower || apiId.includes(idLower);
    });
    if (inst) {
      return {
        name: inst.name || id,
        imageUrl: extractImage(inst),
        rarity: extractRarity(inst),
        series: extractSeries(inst),
      };
    }
  }

  // 4. Tracks / jam songs
  if (prefix === 'SparksSong') {
    const tracks = await getTracks();
    const t = tracks.find((tr: any) => {
      const apiId = (tr.id ?? '').toLowerCase();
      const devN = (tr.devName ?? '').toLowerCase();
      return apiId === idLower || devN === idLower || apiId.includes(idLower) || devN.includes(idLower);
    });
    if (t) {
      return {
        name: t.title || t.name || id,
        imageUrl: t.albumArt || null,
        rarity: extractRarity(t),
        series: extractSeries(t),
      };
    }
  }

  // 5. Vehicle cosmetics (cars API)
  if (VEHICLE_PREFIXES.has(prefix)) {
    const cars = await getCars();
    const car = cars.find((c: any) => {
      const apiId = (c.id ?? '').toLowerCase();
      const vId = (c.vehicleId ?? '').toLowerCase();
      return apiId === idLower || vId === idLower;
    });
    if (car) {
      const img = car.images ?? {};
      return {
        name: car.name || id,
        imageUrl: img.small || img.large || img.icon || null,
        rarity: extractRarity(car),
        series: extractSeries(car),
      };
    }
  }

  // 6. BR cosmetics (outfits, emotes, wraps, music packs, loading screens, companions, etc.)
  const brAll = await getBrCosmetics();
  const brFound = brAll.find((c: any) => (c.id ?? '').toLowerCase() === idLower);
  if (brFound) {
    return {
      name: brFound.name || id,
      imageUrl: extractImage(brFound),
      rarity: extractRarity(brFound),
      series: extractSeries(brFound),
    };
  }

  // 6.5. Companion items — prefix is CosmeticMimosa, equippedItemId has variant suffix
  //   e.g. "CosmeticMimosa:companion_flourcut:70c" → prefix=CosmeticMimosa, id=companion_flourcut:70c
  //   Strip variant suffix (:70c) and search for "companion_flourcut" in BR
  if (prefix === 'CosmeticMimosa' || idLower.startsWith('companion_')) {
    const rawId = prefix === 'CosmeticMimosa' ? id : (sep >= 0 ? itemId.slice(0, sep) : itemId);
    // rawId might be "companion_flourcut:70c" — strip ":variant"
    const colonIdx = rawId.indexOf(':');
    const baseCompanionId = colonIdx >= 0 ? rawId.slice(0, colonIdx) : rawId;
    const found = brAll.find((c: any) => (c.id ?? '').toLowerCase() === baseCompanionId.toLowerCase());
    if (found) {
      return {
        name: found.name || baseCompanionId,
        imageUrl: extractImage(found),
        rarity: extractRarity(found),
        series: extractSeries(found),
      };
    }
  }

  // 7. Try searching without prefix in cars API (for items where equippedItemId has no prefix)
  {
    const cars = await getCars();
    const car = cars.find((c: any) => {
      const apiId = (c.id ?? '').toLowerCase();
      const vId = (c.vehicleId ?? '').toLowerCase();
      return apiId === itemIdLower || vId === itemIdLower || apiId === idLower;
    });
    if (car) {
      const img = car.images ?? {};
      return {
        name: car.name || id,
        imageUrl: img.small || img.large || img.icon || null,
        rarity: extractRarity(car),
        series: extractSeries(car),
      };
    }
  }

  return { name: id, imageUrl: null, rarity: 'common', series: null };
}
