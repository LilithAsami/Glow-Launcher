/**
 * FN Launch Settings — backend
 *
 * Handles:
 *  - Auto-detecting & caching GameUserSettings.ini path
 *  - Parsing/writing INI key=value pairs (section-aware)
 *  - Reading/writing specific Fortnite graphics + display settings
 *  - Process killer (kill selected processes on launch)
 */

import { readFile, writeFile, access } from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { BrowserWindow } from 'electron';
import type { Storage } from '../../storage';

// ── Types ─────────────────────────────────────────────────────

export interface FnLaunchSettings {
  /** Custom launch arguments appended to game cmd */
  launchArgs: string;
  /** Process killer config */
  processKiller: {
    enabled: boolean;
    processes: ProcessKillEntry[];
  };
}

export interface ProcessKillEntry {
  name: string;
  mode: 'startup' | 'always'; // startup = first 3min, always = while game running
}

export interface GameSettings {
  // Display
  resolutionX: number;
  resolutionY: number;
  windowMode: number; // 0=Fullscreen, 1=Windowed Fullscreen, 2=Windowed
  vsync: boolean;
  frameRateLimit: number;
  renderingMode: string; // dx11, dx12, performance

  // Graphics
  displayGamma: number;
  userInterfaceContrast: number;
  motionBlur: boolean;
  uiParallax: boolean;
  showFps: boolean;

  // Graphics Quality (ScalabilityGroups, 0-3)
  viewDistance: number;
  shadows: number;
  antiAliasingQuality: number;
  textures: number;
  effects: number;
  postProcess: number;
  globalIllumination: number;
  reflections: number;
  foliage: number;
  resolutionQuality: number; // 25-100

  // Advanced Graphics Quality
  antiAliasingMethod: string;
  tsrQuality: string;
  dynamicResolution: boolean;
  nanite: boolean;
  desiredGIQuality: number; // 0=Disabled, 1=AmbientOcclusion, 2=Lumen
  desiredReflectionQuality: number; // 0=Disabled, 1=ScreenSpace, 2=Lumen
  rayTracing: boolean;
  showGrass: boolean;
}

export interface GameSettingsResult {
  success: boolean;
  settings?: GameSettings;
  iniPath?: string;
  error?: string;
}

// ── INI Parsing ───────────────────────────────────────────────

/** Parse INI file into a Map of section → {key → value} */
function parseIni(content: string): { sections: Map<string, Map<string, string>>; raw: string } {
  const sections = new Map<string, Map<string, string>>();
  let currentSection = '';
  sections.set(currentSection, new Map());

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;

    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) sections.set(currentSection, new Map());
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx);
      const val = trimmed.substring(eqIdx + 1);
      // Only store first occurrence per section (some keys repeat)
      const sectionMap = sections.get(currentSection)!;
      if (!sectionMap.has(key)) {
        sectionMap.set(key, val);
      }
    }
  }

  return { sections, raw: content };
}

/** Set a value in an INI file string. If the key exists under the section, replace it. */
function setIniValue(content: string, section: string, key: string, value: string): string {
  const lines = content.split('\n');
  let inSection = section === '' ? true : false;
  let lastKeyLineInSection = -1;
  let sectionStartLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    const sm = trimmed.match(/^\[(.+)\]$/);
    if (sm) {
      if (inSection && section !== '') {
        // We left the section without finding the key → insert before this section header
        break;
      }
      if (sm[1] === section) {
        inSection = true;
        sectionStartLine = i;
      }
      continue;
    }

    if (inSection && trimmed.startsWith(key + '=')) {
      lines[i] = `${key}=${value}`;
      return lines.join('\n');
    }

    if (inSection && trimmed && !trimmed.startsWith(';')) {
      lastKeyLineInSection = i;
    }
  }

  // Key not found in section — append it
  if (sectionStartLine >= 0 && lastKeyLineInSection >= 0) {
    lines.splice(lastKeyLineInSection + 1, 0, `${key}=${value}`);
  } else if (sectionStartLine >= 0) {
    lines.splice(sectionStartLine + 1, 0, `${key}=${value}`);
  } else {
    // Section doesn't exist — create it
    lines.push('', `[${section}]`, `${key}=${value}`);
  }

  return lines.join('\n');
}

function getVal(sections: Map<string, Map<string, string>>, section: string, key: string, fallback: string = ''): string {
  return sections.get(section)?.get(key) ?? fallback;
}

// ── INI Path Discovery ────────────────────────────────────────

const INI_RELATIVE = 'FortniteGame\\Saved\\Config\\WindowsClient\\GameUserSettings.ini';

async function findIniPath(storage: Storage): Promise<string | null> {
  // Check cached path first
  const cached = await storage.get<{ fnIniPath?: string }>('fnlaunch');
  if (cached?.fnIniPath) {
    try {
      await access(cached.fnIniPath);
      return cached.fnIniPath;
    } catch {
      // Cached path invalid — fall through
    }
  }

  // Auto-detect from LocalAppData
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const candidate = path.join(localAppData, INI_RELATIVE);
    try {
      await access(candidate);
      // Cache it
      const existing = (await storage.get<Record<string, unknown>>('fnlaunch')) ?? {};
      existing.fnIniPath = candidate;
      await storage.set('fnlaunch', existing);
      return candidate;
    } catch { /* not there */ }
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────

export async function getGameSettings(storage: Storage): Promise<GameSettingsResult> {
  try {
    const iniPath = await findIniPath(storage);
    if (!iniPath) {
      return { success: false, error: 'GameUserSettings.ini not found. Make sure you have launched Fortnite at least once.' };
    }

    const content = await readFile(iniPath, 'utf-8');
    const { sections } = parseIni(content);

    const fort = '/Script/FortniteGame.FortGameUserSettings';
    const sg = 'ScalabilityGroups';
    const rhi = 'D3DRHIPreference';
    const perf = 'PerformanceMode';

    const preferredRHI = getVal(sections, rhi, 'PreferredRHI', 'dx12');
    const meshQuality = getVal(sections, perf, 'MeshQuality', '');
    // performance mode = dx11 + performance mesh, performance legacy = dx11 + mesh=0 , etc
    let renderingMode = preferredRHI;
    if (meshQuality !== '') renderingMode = 'performance';

    const settings: GameSettings = {
      // Display
      resolutionX: parseInt(getVal(sections, fort, 'ResolutionSizeX', '1920')) || 1920,
      resolutionY: parseInt(getVal(sections, fort, 'ResolutionSizeY', '1080')) || 1080,
      windowMode: parseInt(getVal(sections, fort, 'PreferredFullscreenMode', '1')) || 0,
      vsync: getVal(sections, fort, 'bUseVSync', 'False') === 'True',
      frameRateLimit: parseFloat(getVal(sections, fort, 'FrameRateLimit', '240')) || 240,
      renderingMode,

      // Graphics
      displayGamma: parseFloat(getVal(sections, fort, 'DisplayGamma', '2.2')) || 2.2,
      userInterfaceContrast: parseFloat(getVal(sections, fort, 'UserInterfaceContrast', '1.0')) || 1.0,
      motionBlur: getVal(sections, fort, 'bMotionBlur', 'False') === 'True',
      uiParallax: getVal(sections, fort, 'bAllowUIParallax', 'False') === 'True',
      showFps: getVal(sections, fort, 'bShowFPS', 'False') === 'True',

      // Graphics Quality
      viewDistance: parseInt(getVal(sections, sg, 'sg.ViewDistanceQuality', '3')) || 0,
      shadows: parseInt(getVal(sections, sg, 'sg.ShadowQuality', '3')) || 0,
      antiAliasingQuality: parseInt(getVal(sections, sg, 'sg.AntiAliasingQuality', '3')) || 0,
      textures: parseInt(getVal(sections, sg, 'sg.TextureQuality', '3')) || 0,
      effects: parseInt(getVal(sections, sg, 'sg.EffectsQuality', '3')) || 0,
      postProcess: parseInt(getVal(sections, sg, 'sg.PostProcessQuality', '3')) || 0,
      globalIllumination: parseInt(getVal(sections, sg, 'sg.GlobalIlluminationQuality', '1')) || 0,
      reflections: parseInt(getVal(sections, sg, 'sg.ReflectionQuality', '1')) || 0,
      foliage: parseInt(getVal(sections, sg, 'sg.FoliageQuality', '3')) || 0,
      resolutionQuality: parseInt(getVal(sections, sg, 'sg.ResolutionQuality', '100')) || 100,

      // Advanced Graphics Quality
      antiAliasingMethod: getVal(sections, fort, 'FortAntiAliasingMethod', 'TSRMedium'),
      tsrQuality: getVal(sections, fort, 'TemporalSuperResolutionQuality', 'Quality'),
      dynamicResolution: getVal(sections, fort, 'bUseDynamicResolution', 'False') === 'True',
      nanite: getVal(sections, fort, 'bUseNanite', 'False') === 'True',
      desiredGIQuality: parseInt(getVal(sections, fort, 'DesiredGlobalIlluminationQuality', '1')) || 0,
      desiredReflectionQuality: parseInt(getVal(sections, fort, 'DesiredReflectionQuality', '1')) || 0,
      rayTracing: getVal(sections, fort, 'bRayTracing', 'False') === 'True',
      showGrass: getVal(sections, fort, 'bShowGrass', 'True') === 'True',
    };

    return { success: true, settings, iniPath };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to read game settings' };
  }
}

export async function saveGameSettings(storage: Storage, partial: Partial<GameSettings>): Promise<{ success: boolean; error?: string }> {
  try {
    const iniPath = await findIniPath(storage);
    if (!iniPath) return { success: false, error: 'INI file not found' };

    let content = await readFile(iniPath, 'utf-8');
    const fort = '/Script/FortniteGame.FortGameUserSettings';
    const sg = 'ScalabilityGroups';
    const rhi = 'D3DRHIPreference';
    const perf = 'PerformanceMode';

    // Display
    if (partial.resolutionX !== undefined) {
      content = setIniValue(content, fort, 'ResolutionSizeX', String(partial.resolutionX));
      content = setIniValue(content, fort, 'LastUserConfirmedResolutionSizeX', String(partial.resolutionX));
    }
    if (partial.resolutionY !== undefined) {
      content = setIniValue(content, fort, 'ResolutionSizeY', String(partial.resolutionY));
      content = setIniValue(content, fort, 'LastUserConfirmedResolutionSizeY', String(partial.resolutionY));
    }
    if (partial.windowMode !== undefined) {
      content = setIniValue(content, fort, 'PreferredFullscreenMode', String(partial.windowMode));
      content = setIniValue(content, fort, 'LastConfirmedFullscreenMode', String(partial.windowMode));
    }
    if (partial.vsync !== undefined) {
      content = setIniValue(content, fort, 'bUseVSync', partial.vsync ? 'True' : 'False');
    }
    if (partial.frameRateLimit !== undefined) {
      content = setIniValue(content, fort, 'FrameRateLimit', partial.frameRateLimit.toFixed(6));
    }
    if (partial.renderingMode !== undefined) {
      if (partial.renderingMode === 'performance') {
        content = setIniValue(content, rhi, 'PreferredRHI', 'dx11');
        content = setIniValue(content, perf, 'MeshQuality', '0');
      } else {
        content = setIniValue(content, rhi, 'PreferredRHI', partial.renderingMode);
        content = content.replace(/\[PerformanceMode\]\s*\nMeshQuality=\d+/, '[PerformanceMode]');
      }
    }

    // Graphics
    if (partial.displayGamma !== undefined) {
      content = setIniValue(content, fort, 'DisplayGamma', partial.displayGamma.toFixed(6));
    }
    if (partial.userInterfaceContrast !== undefined) {
      content = setIniValue(content, fort, 'UserInterfaceContrast', partial.userInterfaceContrast.toFixed(6));
    }
    if (partial.motionBlur !== undefined) {
      content = setIniValue(content, fort, 'bMotionBlur', partial.motionBlur ? 'True' : 'False');
    }
    if (partial.uiParallax !== undefined) {
      content = setIniValue(content, fort, 'bAllowUIParallax', partial.uiParallax ? 'True' : 'False');
    }
    if (partial.showFps !== undefined) {
      content = setIniValue(content, fort, 'bShowFPS', partial.showFps ? 'True' : 'False');
    }

    // Graphics Quality
    if (partial.viewDistance !== undefined) content = setIniValue(content, sg, 'sg.ViewDistanceQuality', String(partial.viewDistance));
    if (partial.shadows !== undefined) content = setIniValue(content, sg, 'sg.ShadowQuality', String(partial.shadows));
    if (partial.antiAliasingQuality !== undefined) content = setIniValue(content, sg, 'sg.AntiAliasingQuality', String(partial.antiAliasingQuality));
    if (partial.textures !== undefined) content = setIniValue(content, sg, 'sg.TextureQuality', String(partial.textures));
    if (partial.effects !== undefined) content = setIniValue(content, sg, 'sg.EffectsQuality', String(partial.effects));
    if (partial.postProcess !== undefined) content = setIniValue(content, sg, 'sg.PostProcessQuality', String(partial.postProcess));
    if (partial.globalIllumination !== undefined) content = setIniValue(content, sg, 'sg.GlobalIlluminationQuality', String(partial.globalIllumination));
    if (partial.reflections !== undefined) content = setIniValue(content, sg, 'sg.ReflectionQuality', String(partial.reflections));
    if (partial.foliage !== undefined) content = setIniValue(content, sg, 'sg.FoliageQuality', String(partial.foliage));
    if (partial.resolutionQuality !== undefined) content = setIniValue(content, sg, 'sg.ResolutionQuality', String(partial.resolutionQuality));

    // Advanced Graphics Quality
    if (partial.antiAliasingMethod !== undefined) {
      content = setIniValue(content, fort, 'FortAntiAliasingMethod', partial.antiAliasingMethod);
    }
    if (partial.tsrQuality !== undefined) {
      content = setIniValue(content, fort, 'TemporalSuperResolutionQuality', partial.tsrQuality);
    }
    if (partial.dynamicResolution !== undefined) {
      content = setIniValue(content, fort, 'bUseDynamicResolution', partial.dynamicResolution ? 'True' : 'False');
    }
    if (partial.nanite !== undefined) {
      content = setIniValue(content, fort, 'bUseNanite', partial.nanite ? 'True' : 'False');
    }
    if (partial.desiredGIQuality !== undefined) {
      content = setIniValue(content, fort, 'DesiredGlobalIlluminationQuality', String(partial.desiredGIQuality));
    }
    if (partial.desiredReflectionQuality !== undefined) {
      content = setIniValue(content, fort, 'DesiredReflectionQuality', String(partial.desiredReflectionQuality));
    }
    if (partial.rayTracing !== undefined) {
      content = setIniValue(content, fort, 'bRayTracing', partial.rayTracing ? 'True' : 'False');
    }
    if (partial.showGrass !== undefined) {
      content = setIniValue(content, fort, 'bShowGrass', partial.showGrass ? 'True' : 'False');
    }

    await writeFile(iniPath, content, 'utf-8');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save game settings' };
  }
}

// ── Launch Settings (args + process killer) ───────────────────

export async function getLaunchSettings(storage: Storage): Promise<FnLaunchSettings> {
  const data = await storage.get<Record<string, unknown>>('fnlaunch');
  return {
    launchArgs: (data?.launchArgs as string) ?? '',
    processKiller: (data?.processKiller as FnLaunchSettings['processKiller']) ?? { enabled: false, processes: [] },
  };
}

export async function saveLaunchSettings(storage: Storage, settings: FnLaunchSettings): Promise<void> {
  const existing = (await storage.get<Record<string, unknown>>('fnlaunch')) ?? {};
  existing.launchArgs = settings.launchArgs;
  existing.processKiller = settings.processKiller;
  await storage.set('fnlaunch', existing);
}

// ── Process Killer Engine ─────────────────────────────────────

let killIntervalId: ReturnType<typeof setInterval> | null = null;
let killTimeoutId: ReturnType<typeof setTimeout> | null = null;

function killProcess(name: string): void {
  exec(`taskkill /F /IM "${name}" /T`, { shell: 'cmd.exe' }, () => { /* ignore errors */ });
}

function isGameRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq FortniteClient-Win64-Shipping.exe" /NH', { shell: 'cmd.exe' }, (err, stdout) => {
      resolve(!err && stdout.includes('FortniteClient-Win64-Shipping.exe'));
    });
  });
}

export async function startProcessKiller(storage: Storage): Promise<void> {
  stopProcessKiller();
  const settings = await getLaunchSettings(storage);
  if (!settings.processKiller.enabled || settings.processKiller.processes.length === 0) return;

  const startupProcesses = settings.processKiller.processes.filter(p => p.mode === 'startup');
  const alwaysProcesses = settings.processKiller.processes.filter(p => p.mode === 'always');

  const doKill = (list: ProcessKillEntry[]) => {
    for (const p of list) killProcess(p.name);
  };

  // Startup mode: check every 15s for 3 minutes
  if (startupProcesses.length > 0) {
    let elapsed = 0;
    const id = setInterval(() => {
      elapsed += 15000;
      doKill(startupProcesses);
      if (elapsed >= 180000) clearInterval(id);
    }, 15000);
    doKill(startupProcesses); // immediate first kill
    killTimeoutId = setTimeout(() => clearInterval(id), 180000);
  }

  // Always mode: check every 30s while game is running
  if (alwaysProcesses.length > 0) {
    killIntervalId = setInterval(async () => {
      if (await isGameRunning()) {
        doKill(alwaysProcesses);
      } else {
        stopProcessKiller();
      }
    }, 30000);
    doKill(alwaysProcesses); // immediate first kill
  }
}

export function stopProcessKiller(): void {
  if (killIntervalId) { clearInterval(killIntervalId); killIntervalId = null; }
  if (killTimeoutId) { clearTimeout(killTimeoutId); killTimeoutId = null; }
}
