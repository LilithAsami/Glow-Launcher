/**
 * FOV Patcher – Binary-patch pakchunkXX-WindowsClient.ucas
 *
 * Searches for the anchor text "Athena_PlayerCameraModeBase" (primary)
 * or fallback anchors near a FOV byte pattern and replaces
 * the FOV byte to change the camera field of view.
 *
 * Based on the logic in fov.py.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Storage } from '../../storage';

// ── Constants ─────────────────────────────────────────────

// Try multiple chunk files — the FOV data can move between updates
const CHUNK_FILES = [
  'pakchunk30-WindowsClient.ucas',
  'pakchunk20-WindowsClient.ucas',
  'pakchunk10-WindowsClient.ucas',
];

// 64 MB read chunks
const CHUNK_SIZE = 64 * 1024 * 1024;

// Anchors — ordered from most to least reliable
interface Anchor {
  name: string;
  text: Buffer;
  searchForward: boolean;
  maxScan: number;
}

const ANCHORS: Anchor[] = [
  {
    name: 'Athena_PlayerCameraModeBase (principal)',
    text: Buffer.from('Athena_PlayerCameraModeBase', 'utf8'),
    searchForward: true,
    maxScan: 512,
  },
  {
    name: 'BPTYPE_Normal (retroceder)',
    text: Buffer.from('BPTYPE_Normal', 'utf8'),
    searchForward: false,
    maxScan: 512,
  },
  {
    name: 'BlueprintTypeEngineNoneDefault__Athena',
    text: Buffer.from('BlueprintTypeEngineNoneDefault__Athena', 'utf8'),
    searchForward: true,
    maxScan: 768,
  },
  {
    name: 'Athena_PlayerCame (forma corta)',
    text: Buffer.from('Athena_PlayerCame', 'utf8'),
    searchForward: true,
    maxScan: 512,
  },
];

// Pattern surrounding the FOV byte:
// 00 00 A0 42 00 00 [FOV_BYTE] C3 26 00
const PATTERN_PREFIX = Buffer.from([0x00, 0x00, 0xA0, 0x42, 0x00, 0x00]);
const PATTERN_SUFFIX = Buffer.from([0xC3, 0x26, 0x00]);
const FULL_PATTERN_LEN = PATTERN_PREFIX.length + 1 + PATTERN_SUFFIX.length; // 10 bytes

// Known FOV byte mappings
const ORIGINAL_BYTE = 0x8C;  // FOV ~80 (default)
const KNOWN_FOV_BYTES: Record<number, number> = {
  80: 0x8C,
  100: 0xFA,
  // Can add more mapped values here in the future
};

function fovByteForValue(fov: number): number {
  if (KNOWN_FOV_BYTES[fov] !== undefined) return KNOWN_FOV_BYTES[fov];
  // Unknown FOV — use 0xFA as best approximation (100 FOV)
  return 0xFA;
}

// ── Helpers ───────────────────────────────────────────────

export interface FovResult {
  success: boolean;
  message: string;
  currentFov?: number;
}

/**
 * Stream-search a large file for a needle, returning ALL byte offsets found.
 * Searches in 64 MB chunks with overlap.
 */
function findAllNeedles(filePath: string, needle: Buffer): number[] {
  const results: number[] = [];
  const fd = fs.openSync(filePath, 'r');
  const overlap = needle.length;
  const buf = Buffer.alloc(CHUNK_SIZE + overlap);
  let fileOffset = 0;
  let carry = 0;

  try {
    while (true) {
      const bytesRead = fs.readSync(fd, buf, carry, CHUNK_SIZE, fileOffset);
      if (bytesRead === 0) {
        if (carry > 0) {
          let idx = 0;
          const sub = buf.subarray(0, carry);
          while (true) {
            const pos = sub.indexOf(needle, idx);
            if (pos < 0) break;
            results.push(fileOffset - carry + pos);
            idx = pos + 1;
          }
        }
        break;
      }

      const total = carry + bytesRead;
      const searchBuf = buf.subarray(0, total);
      let idx = 0;
      while (true) {
        const pos = searchBuf.indexOf(needle, idx);
        if (pos < 0) break;
        results.push(fileOffset - carry + pos);
        idx = pos + 1;
      }

      if (total > overlap) {
        buf.copy(buf, 0, total - overlap, total);
        carry = overlap;
      } else {
        carry = total;
      }
      fileOffset += bytesRead;
    }
  } finally {
    fs.closeSync(fd);
  }

  return results;
}

/**
 * Read a single byte at an offset from a file.
 */
function readByteAt(filePath: string, offset: number): number {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(FULL_PATTERN_LEN);
    fs.readSync(fd, buf, 0, FULL_PATTERN_LEN, offset);
    return buf[0];
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Read bytes at an offset.
 */
function readBytesAt(filePath: string, offset: number, length: number): Buffer {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, offset);
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Search near an anchor offset for the FOV byte pattern.
 * Returns the offset of the FOV byte or -1.
 */
function findPatternNearAnchor(
  filePath: string,
  anchorOffset: number,
  searchForward: boolean,
  maxScan: number,
  fileSize: number,
): number {
  // Read the scan region into memory
  let start: number;
  let end: number;

  if (searchForward) {
    start = anchorOffset;
    end = Math.min(anchorOffset + maxScan + FULL_PATTERN_LEN, fileSize);
  } else {
    start = Math.max(0, anchorOffset - maxScan - FULL_PATTERN_LEN);
    end = anchorOffset + FULL_PATTERN_LEN;
  }

  const regionLen = end - start;
  const region = readBytesAt(filePath, start, regionLen);

  // Scan the region for PATTERN_PREFIX + [byte] + PATTERN_SUFFIX
  const scanEnd = regionLen - FULL_PATTERN_LEN;
  for (let i = 0; i <= scanEnd; i++) {
    let match = true;
    // Check prefix
    for (let j = 0; j < PATTERN_PREFIX.length; j++) {
      if (region[i + j] !== PATTERN_PREFIX[j]) { match = false; break; }
    }
    if (!match) continue;
    // Check suffix
    const suffixStart = i + PATTERN_PREFIX.length + 1;
    for (let j = 0; j < PATTERN_SUFFIX.length; j++) {
      if (region[suffixStart + j] !== PATTERN_SUFFIX[j]) { match = false; break; }
    }
    if (!match) continue;

    // Found! Return the absolute offset of the FOV byte
    return start + i + PATTERN_PREFIX.length;
  }

  return -1;
}

/**
 * Find the FOV byte offset in the ucas file using anchor strategies.
 */
function findFovByteOffset(filePath: string): number {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  for (const anchor of ANCHORS) {
    const occurrences = findAllNeedles(filePath, anchor.text);
    if (occurrences.length === 0) continue;

    for (const occ of occurrences) {
      const offset = findPatternNearAnchor(
        filePath, occ, anchor.searchForward, anchor.maxScan, fileSize,
      );
      if (offset >= 0) return offset;
    }
  }

  return -1;
}

/**
 * Write a single byte at an offset.
 */
function writeByteAt(filePath: string, offset: number, byte: number): void {
  const fd = fs.openSync(filePath, 'r+');
  try {
    const buf = Buffer.from([byte]);
    fs.writeSync(fd, buf, 0, 1, offset);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Resolve ALL existing ucas chunk paths (pakchunk30, 20, 10).
 */
async function resolveAllUcasPaths(storage: Storage): Promise<string[]> {
  const settings = (await storage.get<{ fortnitePath?: string }>('settings')) ?? {};
  const rawPath = settings.fortnitePath || 'C:\\Program Files\\Epic Games\\Fortnite';
  const norm = path.resolve(rawPath);
  const found: string[] = [];

  for (const chunkFile of CHUNK_FILES) {
    const candidates = [
      path.join(norm, 'FortniteGame', 'Content', 'Paks', chunkFile),
      path.join(norm, 'Content', 'Paks', chunkFile),
      path.join(norm, 'Paks', chunkFile),
      path.join(norm, chunkFile),
      path.join(norm, '..', '..', 'Content', 'Paks', chunkFile),
      path.join(norm, '..', 'Content', 'Paks', chunkFile),
      path.join(norm, '..', '..', '..', 'FortniteGame', 'Content', 'Paks', chunkFile),
    ];

    for (const p of candidates) {
      const resolved = path.resolve(p);
      if (fs.existsSync(resolved) && !found.includes(resolved)) {
        found.push(resolved);
        break; // found this chunk, move to next chunkFile
      }
    }
  }

  return found;
}

/**
 * Find the FOV byte across all candidate ucas files.
 * Returns the filePath + offset, or null.
 */
async function findFovInAnyChunk(storage: Storage): Promise<{ filePath: string; offset: number } | null> {
  const paths = await resolveAllUcasPaths(storage);
  if (paths.length === 0) return null;

  for (const fp of paths) {
    const offset = findFovByteOffset(fp);
    if (offset >= 0) return { filePath: fp, offset };
  }

  return null;
}

// ── Public API ────────────────────────────────────────────

/**
 * Get the current FOV status.
 */
export async function getFovStatus(storage: Storage): Promise<{
  found: boolean;
  currentByte: number | null;
  currentFov: number | null;
  filePath: string | null;
  error?: string;
}> {
  const result = await findFovInAnyChunk(storage);
  if (!result) {
    const paths = await resolveAllUcasPaths(storage);
    if (paths.length === 0) {
      return { found: false, currentByte: null, currentFov: null, filePath: null, error: 'No pakchunk ucas files found. Check your Fortnite path in Settings.' };
    }
    return { found: false, currentByte: null, currentFov: null, filePath: null, error: 'FOV pattern not found in any pakchunk file' };
  }

  try {
    const currentByte = readByteAt(result.filePath, result.offset);
    let currentFov: number | null = null;
    for (const [fov, byte] of Object.entries(KNOWN_FOV_BYTES)) {
      if (byte === currentByte) {
        currentFov = Number(fov);
        break;
      }
    }

    return { found: true, currentByte, currentFov, filePath: result.filePath };
  } catch (err: any) {
    return { found: false, currentByte: null, currentFov: null, filePath: result.filePath, error: err.message };
  }
}

/**
 * Apply a specific FOV value.
 */
export async function applyFov(storage: Storage, fov: number): Promise<FovResult> {
  const result = await findFovInAnyChunk(storage);
  if (!result) {
    return { success: false, message: 'FOV pattern not found.\nCheck your Fortnite path in Settings.' };
  }

  try {
    const targetByte = fovByteForValue(fov);
    const currentByte = readByteAt(result.filePath, result.offset);

    if (currentByte === targetByte) {
      return { success: true, message: `FOV is already set to ${fov}`, currentFov: fov };
    }

    // Create backup if none exists
    const backupPath = result.filePath + '.fov.bak';
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, JSON.stringify({
        offset: result.offset,
        originalByte: currentByte,
        filePath: result.filePath,
        timestamp: new Date().toISOString(),
      }));
    }

    writeByteAt(result.filePath, result.offset, targetByte);
    return { success: true, message: `FOV changed to ${fov} successfully`, currentFov: fov };
  } catch (err: any) {
    return { success: false, message: `Patch failed: ${err.message}` };
  }
}

/**
 * Restore FOV to the original default (80).
 */
export async function restoreFov(storage: Storage): Promise<FovResult> {
  const result = await findFovInAnyChunk(storage);
  if (!result) {
    return { success: false, message: 'FOV pattern not found.' };
  }

  try {
    const currentByte = readByteAt(result.filePath, result.offset);
    if (currentByte === ORIGINAL_BYTE) {
      return { success: true, message: 'FOV is already at default (80)', currentFov: 80 };
    }

    writeByteAt(result.filePath, result.offset, ORIGINAL_BYTE);

    // Remove backup file
    const backupPath = result.filePath + '.fov.bak';
    if (fs.existsSync(backupPath)) {
      try { fs.unlinkSync(backupPath); } catch { /* ignore */ }
    }

    return { success: true, message: 'FOV restored to default (80)', currentFov: 80 };
  } catch (err: any) {
    return { success: false, message: `Restore failed: ${err.message}` };
  }
}
