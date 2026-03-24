/**
 * Trap Height Modifier – Binary-patch pakchunk11-WindowsClient.ucas
 *
 * Searches for a trap's GUID as ASCII text in the file, then modifies
 * the 2-byte height value at a known offset before the GUID.
 *
 * Uses a streaming approach since the file is ~4 GB.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Storage } from '../../storage';
import trapsJson from './traps.json';

// ── Constants ───────────────────────────────────────────────

const CHUNK_FILE = 'pakchunk11-WindowsClient.ucas';
const CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB read chunks
const OVERLAP = 32; // overlap for boundary matching (GUID = 32 ASCII chars)

// Height offset: bytes at GUID_position − N contain the Z component of
// GridPlacementOffset stored as a 4-byte IEEE 754 float32 (LE).
// The offset varies per trap family (13–24 range). We patch the upper 2 bytes.
// Per-family offsets are now stored in traps.json (heightOffset field).
const FALLBACK_HEIGHT_OFFSET = 21; // fallback when per-family offset unavailable
const SEARCH_RADIUS = 32;         // how far back from GUID to scan


// ── Height presets (derived from traps.json) ────────────────

export interface HeightPreset { label: string; hex: string; group: string }

export const HEIGHT_PRESETS: HeightPreset[] = (() => {
  const presets: HeightPreset[] = [];

  // Block-height scale: -1.3 to 1.3 in 0.1 steps
  for (const [blocks, data] of Object.entries(trapsJson.heightScale)) {
    const n = parseFloat(blocks);
    const sign = n > 0 ? '+' : n < 0 ? '' : ' ';
    presets.push({ label: `${sign}${blocks} blocks`, hex: (data as any).hex, group: 'scale' });
  }

  // Named configurations
  for (const cfg of Object.values(trapsJson.namedConfigs)) {
    presets.push({ label: (cfg as any).label, hex: (cfg as any).hex, group: 'named' });
  }

  // Per-family inside floor (deduplicated with descriptive labels)
  const insideFloorMap = new Map<string, string[]>();
  for (const [key, fam] of Object.entries(trapsJson.families)) {
    const f = fam as any;
    if (f.insideFloor) {
      const hex = f.insideFloor.hex as string;
      if (!insideFloorMap.has(hex)) insideFloorMap.set(hex, []);
      insideFloorMap.get(hex)!.push(key);
    }
  }
  for (const [hex, families] of insideFloorMap) {
    const label = families.length > 3
      ? `Inside floor (standard)`
      : `Inside floor (${families.join(', ')})`;
    presets.push({ label, hex, group: 'insideFloor' });
  }

  // Default heights (deduplicated)
  const defaultMap = new Map<string, string[]>();
  for (const [key, fam] of Object.entries(trapsJson.families)) {
    const hex = (fam as any).defaultHeight.hex as string;
    if (!defaultMap.has(hex)) defaultMap.set(hex, []);
    defaultMap.get(hex)!.push(key);
  }
  for (const [hex, families] of defaultMap) {
    const uu = Math.round(hexToFloat(hex));
    presets.push({ label: `Default (${uu} UU)`, hex, group: 'default' });
  }

  return presets;
})();

// ── Trap database (loaded from traps.json) ──────────────────

interface TrapEntry {
  name: string;
  guid: string;
  defaultHeight: string;
  desc: string;
  family: string;
  heightSupported: boolean;
  heightOffset: number;
}

const TRAP_DATA: TrapEntry[] = [];
for (const [familyKey, family] of Object.entries(trapsJson.families)) {
  const fam = family as any;
  for (const trap of fam.traps) {
    TRAP_DATA.push({
      name: trap.name,
      guid: trap.guid,
      defaultHeight: trap.defaultHeight,
      desc: fam.desc,
      family: familyKey,
      heightSupported: fam.heightSupported ?? false,
      heightOffset: fam.heightOffset ?? FALLBACK_HEIGHT_OFFSET,
    });
  }
}

/** Get family info for a trap GUID */
export function getTrapFamily(guid: string): { key: string; insideFloor: string | null } | null {
  const entry = TRAP_DATA.find(t => t.guid === guid);
  if (!entry) return null;
  const fam = (trapsJson.families as any)[entry.family];
  return {
    key: entry.family,
    insideFloor: fam?.insideFloor?.hex ?? null,
  };
}

/** Get family metadata keyed by desc (display name) */
export function getFamilyInfo(): Record<string, { key: string; category: string; defaultHeight: { hex: string; uu: number }; insideFloor: { hex: string; uu: number } | null; heightSupported: boolean; heightOffset: number }> {
  const result: Record<string, any> = {};
  for (const [key, fam] of Object.entries(trapsJson.families)) {
    const f = fam as any;
    result[f.desc as string] = {
      key,
      category: f.category,
      defaultHeight: f.defaultHeight,
      insideFloor: f.insideFloor ?? null,
      heightSupported: f.heightSupported ?? false,
      heightOffset: f.heightOffset ?? FALLBACK_HEIGHT_OFFSET,
    };
  }
  return result;
}

/** Get universal height scale and named configs */
export function getHeightData(): {
  scale: { blocks: string; hex: string; uu: number }[];
  named: { key: string; label: string; hex: string; uu: number }[];
} {
  const scale = Object.entries(trapsJson.heightScale).map(([blocks, data]) => ({
    blocks,
    hex: (data as any).hex as string,
    uu: (data as any).uu as number,
  }));
  const named = Object.entries(trapsJson.namedConfigs).map(([key, cfg]) => ({
    key,
    label: (cfg as any).label as string,
    hex: (cfg as any).hex as string,
    uu: (cfg as any).uu as number,
  }));
  return { scale, named };
}

/** Convert hex height string to float (Unreal Units).
 *  Hex is the upper 2 bytes ("20 C1") → float32  0xC1200000.
 */
function hexToFloat(hex: string): number {
  const parts = hex.trim().split(/\s+/);
  if (parts.length === 4) {
    // Full 4-byte representation: "07 20 20 C1"
    const buf = Buffer.from(parts.map(p => parseInt(p, 16)));
    return buf.readFloatLE(0);
  }
  // Legacy 2-byte representation: "20 C1"
  const b2 = parseInt(parts[0], 16);
  const b3 = parseInt(parts[1], 16);
  const buf = Buffer.alloc(4);
  buf[2] = b2;
  buf[3] = b3;
  return buf.readFloatLE(0);
}

/** Convert a float (UU) to the 4-byte LE hex string */
function floatToFullHex(uu: number): string {
  const buf = Buffer.alloc(4);
  buf.writeFloatLE(uu, 0);
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/** Convert a 2-byte hex height to a full 4-byte float buf (lower 2 bytes = 00) */
function heightHexToFloat32Buf(hex: string): Buffer {
  const parts = hex.trim().split(/\s+/);
  const buf = Buffer.alloc(4);
  if (parts.length === 4) {
    for (let i = 0; i < 4; i++) buf[i] = parseInt(parts[i], 16);
  } else {
    buf[0] = 0;
    buf[1] = 0;
    buf[2] = parseInt(parts[0], 16);
    buf[3] = parseInt(parts[1], 16);
  }
  return buf;
}

// ── Interfaces ──────────────────────────────────────────────

export interface TrapPatchState {
  guidFilePos: number;
  heightOffset: number;
  originalHeight: string; // "20 C1"
  currentHeight: string;  // "AD 43"
  trapName: string;
}

export interface TrapListItem {
  name: string;
  guid: string;
  desc: string;
  defaultHeight: string;
  rarity: string;
  tier: string;
  family: string;
  heightSupported: boolean;
}

export interface TrapHeightResult {
  success: boolean;
  message: string;
  currentHeight?: string;
  isModified?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────

function parseHex(hex: string): [number, number] {
  const parts = hex.trim().split(/\s+/);
  return [parseInt(parts[0], 16), parseInt(parts[1], 16)];
}

function parseTrapName(name: string): { rarity: string; tier: string } {
  const m = name.match(/_(C|UC|R|VR|SR)_(T\d+)$/);
  if (m) return { rarity: m[1], tier: m[2] };
  return { rarity: '-', tier: '-' };
}

/**
 * Resolve pakchunk11-WindowsClient.ucas from Fortnite path.
 */
async function resolveUcasPath(storage: Storage): Promise<string | null> {
  const settings = (await storage.get<{ fortnitePath?: string }>('settings')) ?? {};
  const rawPath = settings.fortnitePath || 'C:\\Program Files\\Epic Games\\Fortnite';
  const norm = path.resolve(rawPath);

  const candidates = [
    path.join(norm, 'FortniteGame', 'Content', 'Paks', CHUNK_FILE),
    path.join(norm, 'Content', 'Paks', CHUNK_FILE),
    path.join(norm, 'Paks', CHUNK_FILE),
    path.join(norm, CHUNK_FILE),
    path.join(norm, '..', '..', 'Content', 'Paks', CHUNK_FILE),
    path.join(norm, '..', 'Content', 'Paks', CHUNK_FILE),
    path.join(norm, '..', '..', '..', 'FortniteGame', 'Content', 'Paks', CHUNK_FILE),
  ];

  for (const p of candidates) {
    const resolved = path.resolve(p);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

/**
 * Stream-search for a GUID's ASCII text in the .ucas file.
 * Returns byte offset or -1.
 */
function findGuidInFile(filePath: string, guid: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const needle = Buffer.from(guid, 'ascii');
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(CHUNK_SIZE + OVERLAP);
    let fileOffset = 0;
    let carry = 0;

    const read = () => {
      const bytesRead = fs.readSync(fd, buf, carry, CHUNK_SIZE, fileOffset);
      if (bytesRead === 0) {
        if (carry > 0) {
          const idx = buf.subarray(0, carry).indexOf(needle);
          if (idx >= 0) {
            fs.closeSync(fd);
            return resolve(fileOffset - carry + idx);
          }
        }
        fs.closeSync(fd);
        return resolve(-1);
      }

      const total = carry + bytesRead;
      const idx = buf.subarray(0, total).indexOf(needle);
      if (idx >= 0) {
        fs.closeSync(fd);
        return resolve(fileOffset - carry + idx);
      }

      if (total > OVERLAP) {
        buf.copy(buf, 0, total - OVERLAP, total);
        carry = OVERLAP;
      } else {
        carry = total;
      }

      fileOffset += bytesRead;
      setImmediate(read);
    };

    try {
      read();
    } catch (err) {
      try { fs.closeSync(fd); } catch {}
      reject(err);
    }
  });
}

/**
 * Discover the height byte offset by scanning backwards from the GUID
 * position.  Returns the offset N such that the 4-byte float32 Z
 * component of GridPlacementOffset starts at  guidPos − N − 2
 * (i.e. the two UPPER bytes sit at guidPos − N).
 *
 * Strategy:
 *  1) Use the per-family heightOffset from traps.json as the primary hint.
 *  2) For known height bytes (not "00 00"), search backwards and
 *     return the offset of the two upper bytes (closest match wins).
 *  3) For "00 00" traps, use the per-family offset directly.
 */
function discoverHeightOffset(filePath: string, guidPos: number, defaultHeight: string, familyOffset: number): number | null {
  // Read SEARCH_RADIUS bytes before the GUID
  const before = Buffer.alloc(SEARCH_RADIUS);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, before, 0, SEARCH_RADIUS, guidPos - SEARCH_RADIUS);
  fs.closeSync(fd);

  if (defaultHeight === '00 00') {
    // For traps with "00 00" defaultHeight, pattern search is unreliable
    // (zero bytes appear everywhere). Use per-family offset.
    return familyOffset;
  }

  const [h0, h1] = parseHex(defaultHeight);

  // Strategy: first check the known per-family offset, then fallback to search
  const expectedIdx = SEARCH_RADIUS - familyOffset;
  if (expectedIdx >= 0 && expectedIdx + 1 < SEARCH_RADIUS) {
    if (before[expectedIdx] === h0 && before[expectedIdx + 1] === h1) {
      return familyOffset; // per-family offset is correct
    }
  }

  // Search backwards – closest 2-byte match to the GUID wins
  for (let i = SEARCH_RADIUS - 2; i >= 0; i--) {
    if (before[i] === h0 && before[i + 1] === h1) {
      return SEARCH_RADIUS - i;
    }
  }

  // Fallback to per-family offset
  return familyOffset;
}

/**
 * Write 2 bytes at a specific file position.
 */
function patchBytes(filePath: string, position: number, b0: number, b1: number): void {
  const fd = fs.openSync(filePath, 'r+');
  const buf = Buffer.from([b0, b1]);
  fs.writeSync(fd, buf, 0, 2, position);
  fs.closeSync(fd);
}

/**
 * Write a full 4-byte float32 (LE) at a specific position.
 * The upper 2 bytes sit at `position`, the lower 2 bytes at `position - 2`.
 */
function patchFloat32(filePath: string, upperPos: number, newHeight: string): void {
  const floatBuf = heightHexToFloat32Buf(newHeight);
  const fd = fs.openSync(filePath, 'r+');
  // Write all 4 bytes: lower pair at upperPos-2, upper pair at upperPos
  fs.writeSync(fd, floatBuf, 0, 4, upperPos - 2);
  fs.closeSync(fd);
}

/**
 * Read 4 bytes at a position and return as "B0 B1 B2 B3" hex string.
 */
function readFloat32Hex(filePath: string, upperPos: number): string {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, upperPos - 2);
  fs.closeSync(fd);
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/**
 * Read 2 bytes at a specific file position.
 */
function readBytes(filePath: string, position: number): [number, number] {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(2);
  fs.readSync(fd, buf, 0, 2, position);
  fs.closeSync(fd);
  return [buf[0], buf[1]];
}

// ── Public API ──────────────────────────────────────────────

/**
 * Get the full trap catalog, grouped and parsed.
 */
export function getTrapList(): TrapListItem[] {
  return TRAP_DATA.map(t => {
    const parsed = parseTrapName(t.name);
    return {
      name: t.name,
      guid: t.guid,
      desc: t.desc,
      defaultHeight: t.defaultHeight,
      rarity: parsed.rarity,
      tier: parsed.tier,
      family: t.family,
      heightSupported: t.heightSupported,
    };
  });
}

/**
 * Get the current status of a specific trap's height modification.
 */
export async function getTrapStatus(
  storage: Storage,
  guid: string,
): Promise<{ found: boolean; isModified: boolean; currentHeight: string | null; error?: string }> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { found: false, isModified: false, currentHeight: null, error: `${CHUNK_FILE} not found. Check Fortnite path in Settings.` };
  }

  const trap = TRAP_DATA.find(t => t.guid === guid);
  if (!trap) {
    return { found: false, isModified: false, currentHeight: null, error: 'Unknown trap GUID' };
  }

  // Check stored patch state first
  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  const state = patches[guid];

  if (state) {
    // Verify the stored position still has a valid GUID
    try {
      const [b0, b1] = readBytes(filePath, state.guidFilePos - state.heightOffset);
      const currentHex = b0.toString(16).padStart(2, '0').toUpperCase() + ' ' +
                         b1.toString(16).padStart(2, '0').toUpperCase();
      const isModified = currentHex !== state.originalHeight;
      return { found: true, isModified, currentHeight: currentHex };
    } catch {
      // Fall through to re-scan
    }
  }

  // No stored state — need to search
  try {
    const guidPos = await findGuidInFile(filePath, guid);
    if (guidPos < 0) {
      return { found: false, isModified: false, currentHeight: null, error: 'GUID not found in file (data may be compressed)' };
    }

    const offset = discoverHeightOffset(filePath, guidPos, trap.defaultHeight, trap.heightOffset);
    if (offset === null) {
      return { found: true, isModified: false, currentHeight: null, error: 'Could not auto-detect height offset' };
    }

    const [b0, b1] = readBytes(filePath, guidPos - offset);
    const currentHex = b0.toString(16).padStart(2, '0').toUpperCase() + ' ' +
                       b1.toString(16).padStart(2, '0').toUpperCase();

    // Always use actual file bytes as original (JSON defaultHeight may not match binary)
    const realOriginal = currentHex;

    // Store the discovered state
    patches[guid] = {
      guidFilePos: guidPos,
      heightOffset: offset,
      originalHeight: realOriginal,
      currentHeight: currentHex,
      trapName: trap.name,
    };
    await storage.set('trapPatches', patches);

    return { found: true, isModified: currentHex !== realOriginal, currentHeight: currentHex };
  } catch (err: any) {
    return { found: false, isModified: false, currentHeight: null, error: err.message };
  }
}

/**
 * Apply a height modification to a specific trap.
 */
export async function applyTrapHeight(
  storage: Storage,
  guid: string,
  newHeight: string,
): Promise<TrapHeightResult> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  const trap = TRAP_DATA.find(t => t.guid === guid);
  if (!trap) {
    return { success: false, message: 'Unknown trap GUID.' };
  }

  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  let state = patches[guid];

  try {
    // If we don't have stored state, search for the GUID
    if (!state) {
      const guidPos = await findGuidInFile(filePath, guid);
      if (guidPos < 0) {
        return { success: false, message: 'GUID not found in file.\nThe trap data may be in a compressed block.' };
      }

      const offset = discoverHeightOffset(filePath, guidPos, trap.defaultHeight, trap.heightOffset);
      if (offset === null) {
        return { success: false, message: 'Could not auto-detect height byte offset.\nThis trap variant may not be supported.' };
      }

      // Always read actual bytes from file as original (JSON may not match binary)
      const [rb0, rb1] = readBytes(filePath, guidPos - offset);
      const realOriginal = rb0.toString(16).padStart(2, '0').toUpperCase() + ' ' +
                           rb1.toString(16).padStart(2, '0').toUpperCase();

      state = {
        guidFilePos: guidPos,
        heightOffset: offset,
        originalHeight: realOriginal,
        currentHeight: realOriginal,
        trapName: trap.name,
      };
    }

    // Write the new height bytes
    const [h0, h1] = parseHex(newHeight);
    patchBytes(filePath, state.guidFilePos - state.heightOffset, h0, h1);

    // Update stored state
    state.currentHeight = newHeight;
    patches[guid] = state;
    await storage.set('trapPatches', patches);

    return {
      success: true,
      message: `Height modified: ${trap.desc} → ${newHeight}`,
      currentHeight: newHeight,
      isModified: true,
    };
  } catch (err: any) {
    return { success: false, message: `Patch failed: ${err.message}` };
  }
}

/**
 * Revert a trap's height to its default value.
 */
export async function revertTrapHeight(
  storage: Storage,
  guid: string,
): Promise<TrapHeightResult> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  const trap = TRAP_DATA.find(t => t.guid === guid);
  if (!trap) {
    return { success: false, message: 'Unknown trap GUID.' };
  }

  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  const state = patches[guid];

  if (!state) {
    return { success: false, message: 'No modification found for this trap.\nNothing to revert.' };
  }

  try {
    const [h0, h1] = parseHex(state.originalHeight);
    patchBytes(filePath, state.guidFilePos - state.heightOffset, h0, h1);

    // Remove from stored patches
    delete patches[guid];
    await storage.set('trapPatches', patches);

    return {
      success: true,
      message: `Height restored: ${trap.desc} → ${state.originalHeight}`,
      currentHeight: state.originalHeight,
      isModified: false,
    };
  } catch (err: any) {
    return { success: false, message: `Revert failed: ${err.message}` };
  }
}

/**
 * Revert ALL modified traps at once.
 */
export async function revertAllTraps(storage: Storage): Promise<TrapHeightResult> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  const guids = Object.keys(patches);
  if (guids.length === 0) {
    return { success: true, message: 'No modifications to revert.' };
  }

  let restored = 0;
  let errors = 0;

  for (const guid of guids) {
    const state = patches[guid];
    try {
      const [h0, h1] = parseHex(state.originalHeight);
      patchBytes(filePath, state.guidFilePos - state.heightOffset, h0, h1);
      delete patches[guid];
      restored++;
    } catch {
      errors++;
    }
  }

  await storage.set('trapPatches', patches);
  const msg = `Restored ${restored} trap(s)${errors > 0 ? `, ${errors} error(s)` : ''}`;
  return { success: errors === 0, message: msg };
}

/**
 * Get count of currently modified traps.
 */
export async function getModifiedCount(storage: Storage): Promise<number> {
  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  return Object.keys(patches).length;
}

/**
 * Get list of all currently modified traps with their state.
 */
export async function getModifiedTraps(storage: Storage): Promise<{ guid: string; name: string; currentHeight: string; desc: string; rarity: string; tier: string }[]> {
  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  return Object.entries(patches).map(([guid, state]) => {
    const parsed = parseTrapName(state.trapName);
    const entry = TRAP_DATA.find(t => t.guid === guid);
    return {
      guid,
      name: state.trapName,
      currentHeight: state.currentHeight,
      desc: entry?.desc ?? '',
      rarity: parsed.rarity,
      tier: parsed.tier,
    };
  });
}

// ── B.A.S.E Pattern-Based Patching ──────────────────────────

const BASE_PREFIX = Buffer.from([0x05, 0x30, 0x00, 0x12]);
const BASE_SUFFIX = Buffer.from([
  0x0F, 0x00, 0x42, 0x01, 0x01, 0x1F, 0x00, 0x00, 0x5F, 0x00,
  0xF2, 0x06, 0x00, 0xB1, 0xF0, 0x05, 0x18, 0x00, 0x31, 0x03, 0x23,
]);
const BASE_PATTERN_LEN = BASE_PREFIX.length + 2 + BASE_SUFFIX.length; // 27
const BASE_DEFAULT_HEIGHT = '74 C2';

interface BasePatchState {
  patternPos: number;
  originalHeight: string;
  currentHeight: string;
}

function findBasePatternInFile(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(CHUNK_SIZE + BASE_PATTERN_LEN);
    let fileOffset = 0;
    let carry = 0;

    const read = () => {
      const bytesRead = fs.readSync(fd, buf, carry, CHUNK_SIZE, fileOffset);
      if (bytesRead === 0) {
        if (carry > 0) {
          for (let i = 0; i <= carry - BASE_PATTERN_LEN; i++) {
            if (matchBasePattern(buf, i)) {
              fs.closeSync(fd);
              return resolve(fileOffset - carry + i);
            }
          }
        }
        fs.closeSync(fd);
        return resolve(-1);
      }

      const total = carry + bytesRead;
      for (let i = 0; i <= total - BASE_PATTERN_LEN; i++) {
        if (matchBasePattern(buf, i)) {
          fs.closeSync(fd);
          return resolve(fileOffset - carry + i);
        }
      }

      if (total > BASE_PATTERN_LEN) {
        buf.copy(buf, 0, total - BASE_PATTERN_LEN, total);
        carry = BASE_PATTERN_LEN;
      } else {
        carry = total;
      }

      fileOffset += bytesRead;
      setImmediate(read);
    };

    try { read(); } catch (err) {
      try { fs.closeSync(fd); } catch {}
      reject(err);
    }
  });
}

function matchBasePattern(buf: Buffer, offset: number): boolean {
  for (let j = 0; j < BASE_PREFIX.length; j++) {
    if (buf[offset + j] !== BASE_PREFIX[j]) return false;
  }
  const suffixStart = offset + BASE_PREFIX.length + 2;
  for (let j = 0; j < BASE_SUFFIX.length; j++) {
    if (buf[suffixStart + j] !== BASE_SUFFIX[j]) return false;
  }
  return true;
}

export async function getBaseStatus(storage: Storage): Promise<{ found: boolean; isModified: boolean; currentHeight: string; error?: string }> {
  const state = await storage.get<BasePatchState>('basePatch');
  if (state) {
    return { found: true, isModified: state.currentHeight !== state.originalHeight, currentHeight: state.currentHeight };
  }
  return { found: false, isModified: false, currentHeight: BASE_DEFAULT_HEIGHT };
}

export async function applyBaseHeight(storage: Storage, newHeight: string): Promise<TrapHeightResult> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  let state = await storage.get<BasePatchState>('basePatch');

  try {
    if (!state) {
      const patternPos = await findBasePatternInFile(filePath);
      if (patternPos < 0) {
        return { success: false, message: 'B.A.S.E pattern not found in pakchunk11.' };
      }

      const heightPos = patternPos + BASE_PREFIX.length;
      const [b0, b1] = readBytes(filePath, heightPos);
      const originalHex = b0.toString(16).padStart(2, '0').toUpperCase() + ' ' +
                          b1.toString(16).padStart(2, '0').toUpperCase();

      state = { patternPos, originalHeight: originalHex, currentHeight: originalHex };
    }

    const heightPos = state.patternPos + BASE_PREFIX.length;
    const [h0, h1] = parseHex(newHeight);
    patchBytes(filePath, heightPos, h0, h1);

    state.currentHeight = newHeight;
    await storage.set('basePatch', state);

    return { success: true, message: `B.A.S.E height set to ${newHeight}`, currentHeight: newHeight, isModified: true };
  } catch (err: any) {
    return { success: false, message: `B.A.S.E patch failed: ${err.message}` };
  }
}

export async function revertBaseHeight(storage: Storage): Promise<TrapHeightResult> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  const state = await storage.get<BasePatchState>('basePatch');
  if (!state) {
    return { success: false, message: 'No B.A.S.E modification found.' };
  }

  try {
    const heightPos = state.patternPos + BASE_PREFIX.length;
    const [h0, h1] = parseHex(state.originalHeight);
    patchBytes(filePath, heightPos, h0, h1);

    await storage.set('basePatch', undefined);

    return { success: true, message: `B.A.S.E height restored to ${state.originalHeight}` };
  } catch (err: any) {
    return { success: false, message: `B.A.S.E revert failed: ${err.message}` };
  }
}
