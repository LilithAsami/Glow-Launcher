/**
 * Fortnite installation path auto-detection.
 *
 * Strategy (in order, stops at first hit):
 *   1. Read Epic Games Launcher's LauncherInstalled.dat — instant, most reliable
 *   2. Scan all drive letters for common Epic Games folder structures
 *
 * The returned path is always the Win64 binary folder:
 *   …\FortniteGame\Binaries\Win64  (containing FortniteLauncher.exe)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Storage } from '../../storage';

const WIN64_SUFFIX = path.join('FortniteGame', 'Binaries', 'Win64');
const LAUNCHER_EXE = 'FortniteLauncher.exe';
const SHIPPING_EXE = 'FortniteClient-Win64-Shipping.exe';
const PAKS_RELATIVE = path.join('..', '..', 'Content', 'Paks'); // Win64 → FortniteGame/Content/Paks

/**
 * Validate that a directory is a genuine Fortnite Win64 folder.
 * Checks for:
 *   1. FortniteLauncher.exe (the launcher stub)
 *   2. FortniteClient-Win64-Shipping.exe (the actual game binary)
 *   3. FortniteGame/Content/Paks directory exists (game assets)
 */
function isValidWin64(dir: string): boolean {
  try {
    if (!fs.existsSync(path.join(dir, LAUNCHER_EXE))) return false;
    if (!fs.existsSync(path.join(dir, SHIPPING_EXE))) return false;
    const paksDir = path.resolve(dir, PAKS_RELATIVE);
    if (!fs.existsSync(paksDir) || !fs.statSync(paksDir).isDirectory()) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Given any base path (root, FortniteGame dir, or Win64 itself),
 * return the Win64 path if FortniteLauncher.exe is found there.
 */
export function resolveToWin64(base: string): string | null {
  const candidates = [
    base,
    path.join(base, WIN64_SUFFIX),          // root → full path
    path.join(base, 'Binaries', 'Win64'),   // FortniteGame dir
  ];
  for (const c of candidates) {
    if (isValidWin64(c)) return path.resolve(c);
  }
  return null;
}

/**
 * Read Epic Games Launcher's LauncherInstalled.dat to find Fortnite location.
 * This file is always at a fixed path on Windows and lists every installed Epic game.
 */
function tryLauncherDat(): string | null {
  const datPath = 'C:\\ProgramData\\Epic\\UnrealEngineLauncher\\LauncherInstalled.dat';
  try {
    if (!fs.existsSync(datPath)) return null;
    const json = JSON.parse(fs.readFileSync(datPath, 'utf-8'));
    const list: { AppName?: string; InstallLocation?: string }[] = json.InstallationList ?? [];
    const entry = list.find((e) => e.AppName === 'Fortnite');
    if (!entry?.InstallLocation) return null;
    return resolveToWin64(entry.InstallLocation);
  } catch {
    return null;
  }
}

/**
 * Fallback scan: check every available drive letter against known folder structures.
 * Only touches paths that are likely to exist — no recursive walk.
 */
function scanDrives(): string | null {
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZAB'; // C, D, E first — most common
  const subDirs = [
    'Epic Games\\Fortnite',
    'EpicGames\\Fortnite',
    'Program Files\\Epic Games\\Fortnite',
    'Games\\Epic Games\\Fortnite',
    'Games\\Fortnite',
    'Fortnite',
  ];

  for (const letter of letters) {
    const root = `${letter}:\\`;
    try {
      if (!fs.existsSync(root)) continue;
    } catch {
      continue;
    }
    for (const sub of subDirs) {
      const result = resolveToWin64(path.join(root, sub));
      if (result) return result;
    }
  }
  return null;
}

/**
 * Detect the Fortnite Win64 binary path.
 * Returns the path string, or null if not found.
 */
export function detectFortnitePath(): string | null {
  return tryLauncherDat() ?? scanDrives();
}

/**
 * Validate the currently stored path and auto-detect if missing or invalid.
 * Saves the detected path to storage automatically.
 * Returns the detected path if it was auto-detected (and therefore changed), or null if no change.
 */
export async function validateAndAutoDetect(storage: Storage): Promise<string | null> {
  try {
    const s = (await storage.get<{ fortnitePath?: string }>('settings')) ?? {};

    // Validate existing configured path
    if (s.fortnitePath) {
      const resolved = resolveToWin64(s.fortnitePath);
      if (resolved) return null; // currently configured path is still valid — nothing to do
    }

    // Missing or invalid — run detection
    const detected = detectFortnitePath();
    if (!detected) return null;

    // Save the detected path into settings
    await storage.set('settings', { ...s, fortnitePath: detected });
    return detected;
  } catch {
    return null;
  }
}
