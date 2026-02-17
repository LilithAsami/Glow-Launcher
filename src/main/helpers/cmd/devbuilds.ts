/**
 * Dev Builds – Binary-patch pakchunk10-WindowsClient.ucas
 *
 * Searches for the string "PBWA_BG_ArchwayLargeSu" in the file and
 * replaces it with "@@@@_BG_ArchwayLargeSu" (activate), or vice-versa
 * to deactivate.
 *
 * Uses a streaming approach – the file can be several GB, so we read it
 * in 64 MB chunks looking for the needle.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Storage } from '../../storage';

const CHUNK_FILE = 'pakchunk10-WindowsClient.ucas';
const NEEDLE_ORIGINAL = Buffer.from('PBWA_BG_ArchwayLargeSu', 'utf8');
const NEEDLE_PATCHED  = Buffer.from('@@@@_BG_ArchwayLargeSu', 'utf8');

// 64 MB read chunks (generous overlap for boundary safety)
const CHUNK_SIZE = 64 * 1024 * 1024;
const OVERLAP    = NEEDLE_ORIGINAL.length;

export interface DevBuildResult {
  success: boolean;
  activated?: boolean;   // true = patched, false = restored to original
  message: string;
}

/**
 * Detect whether dev builds are currently active
 */
export async function getDevBuildStatus(storage: Storage): Promise<{ found: boolean; activated: boolean; filePath: string | null; error?: string }> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) return { found: false, activated: false, filePath: null, error: 'pakchunk10-WindowsClient.ucas not found in configured Fortnite path' };

  try {
    const offset = await findNeedle(filePath, NEEDLE_PATCHED);
    if (offset >= 0) return { found: true, activated: true, filePath };

    const offsetOrig = await findNeedle(filePath, NEEDLE_ORIGINAL);
    if (offsetOrig >= 0) return { found: true, activated: false, filePath };

    return { found: false, activated: false, filePath, error: 'Could not find the target string in the file' };
  } catch (err: any) {
    return { found: false, activated: false, filePath, error: err.message };
  }
}

/**
 * Toggle dev builds on/off.
 * If currently original → patch it (activate).
 * If currently patched  → restore it (deactivate).
 */
export async function toggleDevBuild(storage: Storage): Promise<DevBuildResult> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  try {
    // Try to find the patched version first (i.e. dev builds currently ON)
    let offset = await findNeedle(filePath, NEEDLE_PATCHED);
    if (offset >= 0) {
      // Deactivate — restore to original
      await patchAt(filePath, offset, NEEDLE_ORIGINAL);
      return { success: true, activated: false, message: 'Dev Builds deactivated — file restored to original' };
    }

    // Try to find the original version
    offset = await findNeedle(filePath, NEEDLE_ORIGINAL);
    if (offset >= 0) {
      // Activate — patch
      await patchAt(filePath, offset, NEEDLE_PATCHED);
      return { success: true, activated: true, message: 'Dev Builds activated successfully' };
    }

    return { success: false, message: 'Target string not found in the file.\nThe file may have a different version.' };
  } catch (err: any) {
    return { success: false, message: `Patch failed: ${err.message}` };
  }
}

// ── Internal helpers ──────────────────────────────────────────

/**
 * Resolve the full path to pakchunk10-WindowsClient.ucas from the
 * configured Fortnite installation path.
 */
async function resolveUcasPath(storage: Storage): Promise<string | null> {
  const settings = (await storage.get<{ fortnitePath?: string }>('settings')) ?? {};
  const rawPath = settings.fortnitePath || 'C:\\Program Files\\Epic Games\\Fortnite';

  // Normalise so we can inspect path segments
  const norm = path.resolve(rawPath);

  // Possible locations relative to what the user picked.
  // Users may have configured:
  //   • Root       → E:\Epic Games\Fortnite
  //   • FortniteGame → …\Fortnite\FortniteGame
  //   • Binaries   → …\FortniteGame\Binaries\Win64
  //   • Content    → …\FortniteGame\Content
  //   • Paks       → …\FortniteGame\Content\Paks
  const candidates = [
    // From root: Fortnite/FortniteGame/Content/Paks
    path.join(norm, 'FortniteGame', 'Content', 'Paks', CHUNK_FILE),
    // From FortniteGame/ directly
    path.join(norm, 'Content', 'Paks', CHUNK_FILE),
    // From Content/
    path.join(norm, 'Paks', CHUNK_FILE),
    // From Paks/ or exact file match
    path.join(norm, CHUNK_FILE),
    // ── Handle Win64 / Binaries paths ──────────────────────
    // From …\FortniteGame\Binaries\Win64  →  go up 2 to FortniteGame
    path.join(norm, '..', '..', 'Content', 'Paks', CHUNK_FILE),
    // From …\FortniteGame\Binaries       →  go up 1 to FortniteGame
    path.join(norm, '..', 'Content', 'Paks', CHUNK_FILE),
    // From …\Fortnite\FortniteGame\Binaries\Win64  →  go up 3 to Fortnite root
    path.join(norm, '..', '..', '..', 'FortniteGame', 'Content', 'Paks', CHUNK_FILE),
  ];

  for (const p of candidates) {
    const resolved = path.resolve(p);
    if (fs.existsSync(resolved)) return resolved;
  }

  return null;
}

/**
 * Stream-search a large file for a needle, returning byte offset or -1.
 */
function findNeedle(filePath: string, needle: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(CHUNK_SIZE + OVERLAP);
    let fileOffset = 0;
    let carry = 0; // bytes carried over from previous chunk

    const read = () => {
      const bytesRead = fs.readSync(fd, buf, carry, CHUNK_SIZE, fileOffset);
      if (bytesRead === 0) {
        // Also search the remaining carry bytes
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
      const searchBuf = buf.subarray(0, total);
      const idx = searchBuf.indexOf(needle);

      if (idx >= 0) {
        fs.closeSync(fd);
        return resolve(fileOffset - carry + idx);
      }

      // Keep the last OVERLAP bytes for boundary matches
      if (total > OVERLAP) {
        buf.copy(buf, 0, total - OVERLAP, total);
        carry = OVERLAP;
      } else {
        carry = total;
      }

      fileOffset += bytesRead;
      setImmediate(read); // yield to event loop
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
 * Write replacement bytes at a specific offset.
 */
async function patchAt(filePath: string, offset: number, replacement: Buffer): Promise<void> {
  const fd = fs.openSync(filePath, 'r+');
  try {
    fs.writeSync(fd, replacement, 0, replacement.length, offset);
  } finally {
    fs.closeSync(fd);
  }
}
