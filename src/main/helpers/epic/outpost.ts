/**
 * Outpost Info — Fetch metadata profile + cloud storage .sav parsing
 * for Storm Shield structures, traps, and general info.
 */

import axios from 'axios';
import * as zlib from 'zlib';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ── Constants ─────────────────────────────────────────────

const CLOUD_STORAGE_USER = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/cloudstorage/user';

// ── Exported types ────────────────────────────────────────

export interface OutpostPermissionPlayer {
  accountId: string;
  displayName: string;
}

export interface OutpostZoneInfo {
  zoneId: string;
  zoneName: string;
  level: number;
  highestEnduranceWave: number;
  amplifierCount: number;
  editPermissions: OutpostPermissionPlayer[];
  saveFile: string;
}

export interface OutpostInfoResult {
  success: boolean;
  zones: OutpostZoneInfo[];
  error?: string;
}

export interface OutpostTrap {
  displayName: string;
  iconFile: string;
  count: number;
}

export interface OutpostStructures {
  walls: number;
  floors: number;
  stairs: number;
  cones: number;
  total: number;
}

export interface OutpostBaseData {
  success: boolean;
  structures: OutpostStructures;
  traps: OutpostTrap[];
  totalTraps: number;
  warning?: string;  // non-fatal: base may be empty or unbuilt
  error?: string;
}

// ── Zone mappings ─────────────────────────────────────────

const ZONE_MAP: Record<string, string> = {
  outpostcore_pve_04: 'Twine Peaks',
  outpostcore_pve_03: 'Canny Valley',
  outpostcore_pve_02: 'Plankerton',
  outpostcore_pve_01: 'Stonewood',
};

const ZONE_ORDER = [
  'outpostcore_pve_04',
  'outpostcore_pve_03',
  'outpostcore_pve_02',
  'outpostcore_pve_01',
];

// ── Trap name & icon maps ─────────────────────────────────

const TRAP_NAMES: Record<string, string> = {
  Floor_Spikes_Wood: 'Wooden Floor Spikes',
  Floor_Freeze: 'Floor Freeze Trap',
  Floor_Tar: 'Tar Pit',
  Floor_Launcher: 'Floor Launcher',
  Floor_Ward_AntiAir: 'Anti-Air Trap',
  Floor_Health_First_Aid_MegaBacon: 'Healing Pad',
  Floor_Hoverboard_Speed: 'Boost Pad',
  Floor_Player_Jump_Pad: 'Jump Pad (Up)',
  Floor_Player_Jump_Free_Direction_Pad: 'Jump Pad (Directional)',
  Floor_Spikes: 'Retractable Floor Spikes',
  Floor_Campfire: 'Cozy Campfire',
  Floor_Flamegrill: 'Flame Grill Trap',
  Floor_Health: 'Healing Pad',
  Wall_Darts: 'Wall Darts',
  Wall_Electric: 'Wall Dynamo',
  Wall_Launcher: 'Wall Launcher',
  Wall_Spikes: 'Wall Spikes',
  Wall_Wood_Spikes: 'Wall Spikes',
  Wall_Light: 'Wall Lights',
  Wall_Speaker: 'Sound Wall',
  Wall_Cannons: 'Broadside',
  Wall_Mechstructor: 'Zap-o-max',
  Ceiling_Electric: 'Ceiling Electric Field',
  Ceiling_ElectricWeak: 'Ceiling Zapper',
  Ceiling_Electric_Single: 'Ceiling Zapper',
  Ceiling_Falling: 'Ceiling Drop Trap',
  Ceiling_Gas: 'Ceiling Gas Trap',
  Ceiling_Spikes: 'Ceiling Spikes',
  Ceiling_Goop: 'Vindertech Goop',
};

const TRAP_ICON: Record<string, string> = {
  Floor_Spikes_Wood: 'floor_spikes_wood',
  Floor_Freeze: 'floor_freeze',
  Floor_Tar: 'floor_tar',
  Floor_Launcher: 'floor_launcher',
  Floor_Ward_AntiAir: 'floor_ward',
  Floor_Health_First_Aid_MegaBacon: 'floor_health',
  Floor_Hoverboard_Speed: 'floor_hoverboard_speed',
  Floor_Player_Jump_Pad: 'floor_player_jump_pad',
  Floor_Player_Jump_Free_Direction_Pad: 'floor_player_jump_pad_free_direction',
  Floor_Spikes: 'floor_spikes',
  Floor_Campfire: 'floor_campfire',
  Floor_Flamegrill: 'floor_flamegrill',
  Floor_Health: 'floor_health',
  Wall_Darts: 'wall_darts',
  Wall_Electric: 'wall_electric',
  Wall_Launcher: 'wall_launcher',
  Wall_Spikes: 'wall_wood_spikes',
  Wall_Wood_Spikes: 'wall_wood_spikes',
  Wall_Light: 'wall_light',
  Wall_Speaker: 'wall_speaker',
  Wall_Cannons: 'wall_cannons',
  Wall_Mechstructor: 'wall_mechstructor',
  Ceiling_Electric: 'ceiling_electric_aoe',
  Ceiling_ElectricWeak: 'ceiling_electric_single',
  Ceiling_Electric_Single: 'ceiling_electric_single',
  Ceiling_Falling: 'ceiling_falling',
  Ceiling_Gas: 'ceiling_gas',
  Ceiling_Spikes: 'ceiling_falling',
  Ceiling_Goop: 'ceiling_gas',
};

// Structure piece type groupings (totals only, no material breakdown)
const PIECE_TYPES: Record<string, string[]> = {
  walls: ['Solid'],
  floors: ['Floor', 'Floor_2'],
  stairs: ['StairW', 'StairF', 'StairT', 'StairR', 'StairSpiral'],
  cones: ['RoofC'],
};

// ── .sav parser ───────────────────────────────────────────

function parseSav(raw: Buffer): { structures: OutpostStructures; traps: OutpostTrap[] } {
  const magic = raw.slice(0, 4).toString('ascii');
  if (magic !== 'ECFD') throw new Error(`Unknown .sav format: ${magic}`);

  const dec = zlib.inflateSync(raw.slice(16)).toString('latin1');

  // ─ structures ─
  const buildRE =
    /\/Game\/Building\/ActorBlueprints\/Player\/[^/]+\/[^/]+\/PBWA_[A-Z]\d_([^._\s\x00]+)/g;
  const pieces: Record<string, number> = {};
  let m: RegExpExecArray | null;
  while ((m = buildRE.exec(dec)) !== null) {
    pieces[m[1]] = (pieces[m[1]] || 0) + 1;
  }

  const structures: OutpostStructures = { walls: 0, floors: 0, stairs: 0, cones: 0, total: 0 };
  for (const [type, cnt] of Object.entries(pieces)) {
    if (PIECE_TYPES.walls.includes(type)) structures.walls += cnt;
    else if (PIECE_TYPES.floors.includes(type)) structures.floors += cnt;
    else if (PIECE_TYPES.stairs.includes(type)) structures.stairs += cnt;
    else if (PIECE_TYPES.cones.includes(type)) structures.cones += cnt;
  }
  structures.total = structures.walls + structures.floors + structures.stairs + structures.cones;

  // ─ traps ─
  const trapRE = /\/SaveTheWorld\/Items\/Traps\/Blueprints\/Trap_([^.\s\x00]+)/g;
  const trapCounts: Record<string, number> = {};
  while ((m = trapRE.exec(dec)) !== null) {
    trapCounts[m[1]] = (trapCounts[m[1]] || 0) + 1;
  }

  // Merge variants by display name
  const merged: Record<string, { count: number; iconFile: string }> = {};
  for (const [bp, cnt] of Object.entries(trapCounts)) {
    const name = TRAP_NAMES[bp] || bp.replace(/_/g, ' ');
    const icon = TRAP_ICON[bp] || 'floor_spikes';
    if (merged[name]) merged[name].count += cnt;
    else merged[name] = { count: cnt, iconFile: icon };
  }

  const traps: OutpostTrap[] = Object.entries(merged)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([name, d]) => ({ displayName: name, iconFile: d.iconFile, count: d.count }));

  return { structures, traps };
}

// ── Batch account lookup ──────────────────────────────────

async function batchLookupAccounts(
  storage: Storage,
  mainAccountId: string,
  token: string,
  accountIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (accountIds.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < accountIds.length; i += 100) {
    chunks.push(accountIds.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const params = chunk.map((id) => `accountId=${id}`).join('&');
      const { data } = await authenticatedRequest(
        storage, mainAccountId, token,
        async (t) => {
          const res = await axios.get(`${Endpoints.ACCOUNT_PUBLIC}?${params}`, {
            headers: { Authorization: `bearer ${t}`, 'Content-Type': 'application/json' },
            timeout: 15000,
          });
          return res.data;
        },
      );
      if (Array.isArray(data)) {
        for (const acct of data) {
          if (acct.id && acct.displayName) map.set(acct.id, acct.displayName);
        }
      }
    } catch { /* names stay as accountIds */ }
  }

  return map;
}

// ── Public API ────────────────────────────────────────────

export async function getOutpostInfo(storage: Storage): Promise<OutpostInfoResult> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, zones: [], error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, zones: [], error: 'Failed to authenticate' };

    const endpoint = `${Endpoints.MCP}/${main.accountId}/client/QueryProfile?profileId=metadata&rvn=-1`;
    const { data } = await authenticatedRequest(
      storage, main.accountId, token,
      async (t) => {
        const res = await axios.post(endpoint, {}, {
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        });
        return res.data;
      },
    );

    const profile = data?.profileChanges?.[0]?.profile;
    if (!profile) return { success: false, zones: [], error: 'Failed to read metadata profile' };

    const items = profile.items ?? {};
    const allAccountIds = new Set<string>();
    const zoneDataMap = new Map<
      string,
      { level: number; wave: number; amps: number; permissions: string[]; saveFile: string }
    >();

    for (const [, item] of Object.entries(items) as [string, any][]) {
      const templateId: string = item.templateId || '';
      const match = templateId.match(/^Outpost:(.+)$/);
      if (!match) continue;
      const zoneKey = match[1];
      if (!ZONE_MAP[zoneKey]) continue;

      const attrs = item.attributes ?? {};
      const coreInfo = attrs.outpost_core_info ?? {};
      const cloudInfo = attrs.cloud_save_info ?? {};
      const records: any[] = cloudInfo.savedRecords ?? [];
      const permissions: string[] = coreInfo.accountsWithEditPermission ?? [];
      const placedBuildings: any[] = coreInfo.placedBuildings ?? [];
      const saveFile = records.length > 0 ? records[0].recordFilename : '';

      for (const pid of permissions) allAccountIds.add(pid);

      zoneDataMap.set(zoneKey, {
        level: attrs.level ?? 0,
        wave: coreInfo.highestEnduranceWaveReached ?? 0,
        amps: placedBuildings.length,
        permissions,
        saveFile,
      });
    }

    const nameMap = await batchLookupAccounts(storage, main.accountId, token, [...allAccountIds]);

    const zones: OutpostZoneInfo[] = [];
    for (const zoneKey of ZONE_ORDER) {
      const zoneName = ZONE_MAP[zoneKey];
      const zData = zoneDataMap.get(zoneKey);
      if (!zData) {
        zones.push({
          zoneId: zoneKey.replace('outpostcore_', ''),
          zoneName,
          level: 0,
          highestEnduranceWave: 0,
          amplifierCount: 0,
          editPermissions: [],
          saveFile: '',
        });
        continue;
      }
      zones.push({
        zoneId: zoneKey.replace('outpostcore_', ''),
        zoneName,
        level: zData.level,
        highestEnduranceWave: zData.wave,
        amplifierCount: zData.amps,
        saveFile: zData.saveFile,
        editPermissions: zData.permissions.map((pid) => ({
          accountId: pid,
          displayName: nameMap.get(pid) || pid,
        })),
      });
    }

    return { success: true, zones };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.message || 'Unknown error';
    return { success: false, zones: [], error: msg };
  }
}

export async function getOutpostBaseData(
  storage: Storage,
  saveFile: string,
): Promise<OutpostBaseData> {
  const empty: OutpostBaseData = {
    success: false,
    structures: { walls: 0, floors: 0, stairs: 0, cones: 0, total: 0 },
    traps: [],
    totalTraps: 0,
  };

  try {
    if (!saveFile) return { ...empty, error: 'No save file available for this zone' };

    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { ...empty, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { ...empty, error: 'Failed to authenticate' };

    const url = `${CLOUD_STORAGE_USER}/${main.accountId}/${saveFile}`;
    const { data: savData } = await authenticatedRequest(
      storage, main.accountId, token,
      async (t) => {
        const resp = await axios.get(url, {
          headers: { Authorization: `bearer ${t}` },
          responseType: 'arraybuffer',
          timeout: 60000,
        });
        return resp.data;
      },
    );

    let buf = Buffer.from(savData);
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      buf = zlib.gunzipSync(buf);
    }

    let parseResult: { structures: OutpostStructures; traps: OutpostTrap[] } | null = null;
    let parseWarning: string | undefined;
    try {
      parseResult = parseSav(buf);
    } catch (parseErr: any) {
      // Unknown format usually means the base is empty / unbuilt — not a fatal error
      parseWarning = 'This database does not yet have structure data recorded (Storm Shield may not have been set up or does not have enough structures yet).';
    }

    if (parseWarning || !parseResult) {
      return { ...empty, success: true, warning: parseWarning };
    }

    const totalTraps = parseResult.traps.reduce((s, t) => s + t.count, 0);
    return { success: true, structures: parseResult.structures, traps: parseResult.traps, totalTraps };
  } catch (err: any) {
    let msg = err?.message || 'Unknown error';
    try {
      if (err?.response?.data) {
        const txt = Buffer.from(err.response.data).toString('utf8').slice(0, 300);
        const parsed = JSON.parse(txt);
        msg = parsed.errorMessage || parsed.message || txt;
      }
    } catch { /* keep original msg */ }
    return { ...empty, error: msg };
  }
}
