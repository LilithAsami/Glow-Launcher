/**
 * DevStairs – Binary-patch pakchunk30-WindowsClient.ucas
 *
 * Searches for the DevStairs needle (NavigationLink_StairR… + "PBWA_W1")
 * and replaces "PBWA_W1" with null bytes to activate, or vice-versa.
 *
 * When activating DevStairs, normal Dev Builds (pakchunk10) are
 * automatically deactivated if currently active.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Storage } from '../../storage';
import { getDevBuildStatus, toggleDevBuild } from './devbuilds';

const CHUNK_FILE = 'pakchunk30-WindowsClient.ucas';

// Full needle from HxdCodes.py – the differing bytes are at the end:
// Original has "PBWA_W1" (50 42 57 41 5F 57 31), patched has 7× 0x00
const NEEDLE_ORIGINAL = Buffer.from(
  '263C2F47616D652F4275696C64696E672F416374' +
  '6F72426C75657072696E74732F4E617669676174' +
  '696F6E4C696E6B5F53746169725241746865' +
  '6E61506C61796572576F6F64315479' +
  '70652E2E416C2E466C6F6F72537461694375' +
  '7276656444656661756C745363656E65' +
  '526F6F745F434E6F6E6553697A365374616963' +
  '4D7368436F6D706F6E656E743050425741' +
  '5F57315F5F505343535F4E6F646553696D',
  'hex',
);

const NEEDLE_PATCHED = Buffer.from(
  '263C2F47616D652F4275696C64696E672F416374' +
  '6F72426C75657072696E74732F4E617669676174' +
  '696F6E4C696E6B5F53746169725241746865' +
  '6E61506C61796572576F6F64315479' +
  '70652E2E416C2E466C6F6F72537461694375' +
  '7276656444656661756C745363656E65' +
  '526F6F745F434E6F6E6553697A365374616963' +
  '4D7368436F6D706F6E656E7430000000' +
  '000000005F5F505343535F4E6F646553696D',
  'hex',
);

// 64 MB read chunks
const CHUNK_SIZE = 64 * 1024 * 1024;
const OVERLAP    = NEEDLE_ORIGINAL.length;

export interface DevStairsResult {
  success: boolean;
  activated?: boolean;
  message: string;
}

/**
 * Detect whether DevStairs is currently active
 */
export async function getDevStairsStatus(storage: Storage): Promise<{ found: boolean; activated: boolean; filePath: string | null; error?: string }> {
  const filePath = await resolveUcasPath30(storage);
  if (!filePath) return { found: false, activated: false, filePath: null, error: 'pakchunk30-WindowsClient.ucas not found in configured Fortnite path' };

  try {
    const offset = await findNeedle(filePath, NEEDLE_PATCHED);
    if (offset >= 0) return { found: true, activated: true, filePath };

    const offsetOrig = await findNeedle(filePath, NEEDLE_ORIGINAL);
    if (offsetOrig >= 0) return { found: true, activated: false, filePath };

    return { found: false, activated: false, filePath, error: 'Could not find DevStairs target in the file' };
  } catch (err: any) {
    return { found: false, activated: false, filePath, error: err.message };
  }
}

/**
 * Toggle DevStairs on/off.
 * When activating — also deactivates normal Dev Builds (pakchunk10).
 */
export async function toggleDevStairs(storage: Storage): Promise<DevStairsResult> {
  const filePath = await resolveUcasPath30(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  try {
    // Check if currently PATCHED (DevStairs ON) → deactivate
    let offset = await findNeedle(filePath, NEEDLE_PATCHED);
    if (offset >= 0) {
      await patchAt(filePath, offset, NEEDLE_ORIGINAL);
      return { success: true, activated: false, message: 'DevStairs deactivated — file restored to original' };
    }

    // Check if currently ORIGINAL → activate DevStairs
    offset = await findNeedle(filePath, NEEDLE_ORIGINAL);
    if (offset >= 0) {
      // First deactivate normal Dev Builds if they are on
      try {
        const devStatus = await getDevBuildStatus(storage);
        if (devStatus.found && devStatus.activated) {
          await toggleDevBuild(storage);
        }
      } catch { /* ignore — best effort */ }

      await patchAt(filePath, offset, NEEDLE_PATCHED);
      return { success: true, activated: true, message: 'DevStairs activated (normal Dev Builds auto-deactivated)' };
    }

    return { success: false, message: 'DevStairs target not found in the file.\nThe file may have a different version.' };
  } catch (err: any) {
    return { success: false, message: `Patch failed: ${err.message}` };
  }
}

// ── Internal helpers ──────────────────────────────────────────

async function resolveUcasPath30(storage: Storage): Promise<string | null> {
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

function findNeedle(filePath: string, needle: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(CHUNK_SIZE + OVERLAP);
    let fileOffset = 0;
    let carry = 0;

    const read = () => {
      const bytesRead = fs.readSync(fd, buf, carry, CHUNK_SIZE, fileOffset);
      if (bytesRead === 0) {
        if (carry > 0) {
          const idx = buf.subarray(0, carry).indexOf(needle);
          if (idx >= 0) { fs.closeSync(fd); return resolve(fileOffset - carry + idx); }
        }
        fs.closeSync(fd);
        return resolve(-1);
      }

      const total = carry + bytesRead;
      const searchBuf = buf.subarray(0, total);
      const idx = searchBuf.indexOf(needle);

      if (idx >= 0) { fs.closeSync(fd); return resolve(fileOffset - carry + idx); }

      if (total > OVERLAP) {
        buf.copy(buf, 0, total - OVERLAP, total);
        carry = OVERLAP;
      } else {
        carry = total;
      }

      fileOffset += bytesRead;
      setImmediate(read);
    };

    try { read(); } catch (err) { try { fs.closeSync(fd); } catch {} reject(err); }
  });
}

async function patchAt(filePath: string, offset: number, replacement: Buffer): Promise<void> {
  const fd = fs.openSync(filePath, 'r+');
  try {
    fs.writeSync(fd, replacement, 0, replacement.length, offset);
  } finally {
    fs.closeSync(fd);
  }
}
