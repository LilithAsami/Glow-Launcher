/**
 * AirStrike – Binary-patch pakchunk30-WindowsClient.ucas
 *
 * Searches for the 8-byte AirStrike needle and toggles between
 * original (off) and patched (on) states.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Storage } from '../../storage';

const CHUNK_FILE = 'pakchunk30-WindowsClient.ucas';

// 8-byte needles from HxdCodes.py
const NEEDLE_ORIGINAL = Buffer.from('000A0C039A99193F', 'hex');
const NEEDLE_PATCHED  = Buffer.from('000A0C0300008060', 'hex');

// 64 MB read chunks
const CHUNK_SIZE = 64 * 1024 * 1024;
const OVERLAP    = NEEDLE_ORIGINAL.length;

export interface AirStrikeResult {
  success: boolean;
  activated?: boolean;
  message: string;
}

/**
 * Detect whether AirStrike is currently active
 */
export async function getAirStrikeStatus(storage: Storage): Promise<{ found: boolean; activated: boolean; filePath: string | null; error?: string }> {
  const filePath = await resolveUcasPath30(storage);
  if (!filePath) return { found: false, activated: false, filePath: null, error: 'pakchunk30-WindowsClient.ucas not found in configured Fortnite path' };

  try {
    const offset = await findNeedle(filePath, NEEDLE_PATCHED);
    if (offset >= 0) return { found: true, activated: true, filePath };

    const offsetOrig = await findNeedle(filePath, NEEDLE_ORIGINAL);
    if (offsetOrig >= 0) return { found: true, activated: false, filePath };

    return { found: false, activated: false, filePath, error: 'Could not find AirStrike target in the file' };
  } catch (err: any) {
    return { found: false, activated: false, filePath, error: err.message };
  }
}

/**
 * Toggle AirStrike on/off.
 */
export async function toggleAirStrike(storage: Storage): Promise<AirStrikeResult> {
  const filePath = await resolveUcasPath30(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  try {
    // Check if currently PATCHED (AirStrike ON) → deactivate
    let offset = await findNeedle(filePath, NEEDLE_PATCHED);
    if (offset >= 0) {
      await patchAt(filePath, offset, NEEDLE_ORIGINAL);
      return { success: true, activated: false, message: 'AirStrike deactivated — file restored to original' };
    }

    // Check if currently ORIGINAL → activate
    offset = await findNeedle(filePath, NEEDLE_ORIGINAL);
    if (offset >= 0) {
      await patchAt(filePath, offset, NEEDLE_PATCHED);
      return { success: true, activated: true, message: 'AirStrike activated successfully' };
    }

    return { success: false, message: 'AirStrike target not found in the file.\nThe file may have a different version.' };
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
