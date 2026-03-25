/**
 * AutoKick STW Game Verification Helper
 *
 * Detección de misión completada:
 *
 * 1. El evento XMPP PARTY_UPDATED trae `party_state_updated` con el meta del party.
 *    Se lee `Default:CampaignInfo_j` → CampaignInfo.matchmakingState directamente
 *    del payload XMPP, SIN hacer ninguna llamada HTTP
 *
 * 2. Cuando matchmakingState === 'JoiningExistingSession' (en misión STW):
 *    - Se captura baseline de `matches_played` vía MCP QueryProfile campaign
 *    - Se hace polling MCP cada N segundos hasta que matches_played > baseline
 *    - Eso indica pantalla de victoria (misión completada)
 *
 * 3. Si el jugador sale sin completar, matchmakingState deja de ser JoiningExistingSession
 *    → polling del party endpoint para detectarlo en waitForMissionComplete.
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';

// ─── Interfaces ───────────────────────────────────────────────

// Mantenida por compatibilidad con imports externos
export interface STWGameStatus {
  isInGame: boolean;
  isSTW: boolean;
  started: boolean;
  sessionId: string | null;
  gameMode: string | null;
  refreshedToken?: string;
}

export interface MCPMatchState {
  matchesPlayed: number;
  refreshedToken?: string;
}

// ─── Helper: leer matchmakingState del meta del party (sin HTTP) ───────────

/**
 * Extrae matchmakingState de un objeto meta de party.
 * El meta proviene directamente del payload XMPP (party_state_updated)
 * o del endpoint del party. No hace ninguna llamada HTTP.
 */
export function extractMatchmakingState(meta: Partial<Record<string, string>>): string | null {
  try {
    const raw = meta['Default:CampaignInfo_j'];
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.CampaignInfo?.matchmakingState ?? null;
  } catch {
    return null;
  }
}

/**
 * Devuelve true si el meta indica que la cuenta está en matchmaking o en misión STW activa.
 * Cualquier estado que no sea NotMatchmaking (ni null) cuenta como activo.
 */
export function isInSTWMission(meta: Partial<Record<string, string>>): boolean {
  const state = extractMatchmakingState(meta);
  return state !== null && state !== 'NotMatchmaking';
}

// ─── Helper: obtener meta del party vía HTTP (solo para backup polling) ─────

/**
 * Llama al party endpoint y devuelve el meta del party actual.
 * Usar únicamente en el backup polling (no en el flujo principal XMPP).
 */
export async function fetchPartyMeta(
  accountId: string,
  accessToken: string,
  storage?: Storage
): Promise<{ meta: Partial<Record<string, string>>; refreshedToken?: string }> {
  const call = async (token: string) => {
    const response = await axios.get(
      `${Endpoints.BR_PARTY}/user/${accountId}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );
    const meta: Partial<Record<string, string>> = response.data?.current?.[0]?.meta ?? {};
    return { meta };
  };

  try {
    return await call(accessToken);
  } catch (error: any) {
    if (error.response?.status === 401 && storage) {
      const refreshed = await refreshAccountToken(storage, accountId);
      if (refreshed) {
        const result = await call(refreshed);
        return { ...result, refreshedToken: refreshed };
      }
    }
    throw error;
  }
}

// ─── MCP: leer matches_played ───────────────────────────────────────

// ── Resilient path cache ────────────────────────────────────────────
// Persiste la ruta donde se encontró matches_played en la respuesta MCP.
// En memoria: sobrevive la sesión sin hacer await. En storage: sobrevive reinicios.

let _mpPathCache: string[] | null = null;
const STORAGE_KEY_MP_PATH = 'autokick:matchesPlayedPath';

// Ruta por defecto según estructura MCP actual
const MP_DEFAULT_PATH = ['profileChanges', '0', 'profile', 'stats', 'attributes', 'matches_played'];

function getAtPath(obj: any, parts: string[]): unknown {
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Búsqueda profunda de una clave en un objeto/array. Devuelve {value, path} o null. */
function deepFind(obj: any, key: string, path: string[] = []): { value: unknown; path: string[] } | null {
  if (obj == null || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const r = deepFind(obj[i], key, [...path, String(i)]);
      if (r) return r;
    }
    return null;
  }
  for (const k of Object.keys(obj)) {
    if (k === key) return { value: obj[k], path: [...path, k] };
    if (obj[k] != null && typeof obj[k] === 'object') {
      const r = deepFind(obj[k], key, [...path, k]);
      if (r) return r;
    }
  }
  return null;
}

async function loadMPPath(storage?: Storage): Promise<string[] | null> {
  if (_mpPathCache) return _mpPathCache;
  if (!storage) return null;
  try {
    const saved = await storage.get<string[]>(STORAGE_KEY_MP_PATH);
    if (Array.isArray(saved) && saved.length > 0) { _mpPathCache = saved; return saved; }
  } catch { /* ignore */ }
  return null;
}

async function saveMPPath(p: string[], storage?: Storage): Promise<void> {
  _mpPathCache = p;
  if (!storage) return;
  try { await storage.set(STORAGE_KEY_MP_PATH, p); } catch { /* ignore */ }
}

/**
 * Extrae matches_played de la respuesta MCP cruda.
 * Orden de búsqueda:
 *   1. Ruta cacheada en memoria (instantáneo)
 *   2. Ruta por defecto conocida
 *   3. Deep search completo (lento, solo si cambia la API)
 * Guarda la ruta encontrada para las próximas llamadas.
 */
async function extractMatchesPlayed(raw: any, storage?: Storage): Promise<number> {
  // 1. Caché en memoria / storage
  const cached = await loadMPPath(storage);
  if (cached) {
    const v = getAtPath(raw, cached);
    if (typeof v === 'number') return v;
    // La ruta cacheada ya no es válida → resetear y buscar
    _mpPathCache = null;
  }
  // 2. Ruta conocida por defecto
  const defVal = getAtPath(raw, MP_DEFAULT_PATH);
  if (typeof defVal === 'number') {
    await saveMPPath(MP_DEFAULT_PATH, storage);
    return defVal;
  }
  // 3. Deep search completo
  const found = deepFind(raw, 'matches_played');
  if (found && typeof found.value === 'number') {
    await saveMPPath(found.path, storage);
    return found.value;
  }
  return 0;
}

/**
 * Lee matches_played del profile campaign vía MCP QueryProfile.
 * Este valor se incrementa exactamente al completar una misión STW
 * (aparece en pantalla de victoria), sin importar si hay recompensas.
 */
export async function getMCPMatchesPlayed(
  accountId: string,
  accessToken: string,
  storage?: Storage
): Promise<MCPMatchState> {
  const call = async (token: string): Promise<MCPMatchState> => {
    const response = await axios.post(
      `${Endpoints.MCP}/${accountId}/client/QueryProfile?profileId=campaign`,
      {},
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
    const matchesPlayed = await extractMatchesPlayed(response.data, storage);
    return { matchesPlayed };
  };

  try {
    return await call(accessToken);
  } catch (error: any) {
    if (error.response?.status === 401 && storage) {
      const refreshed = await refreshAccountToken(storage, accountId);
      if (refreshed) {
        const result = await call(refreshed);
        return { ...result, refreshedToken: refreshed };
      }
    }
    throw error;
  }
}

// ─── waitForMissionComplete ────────────────────────────────────────

/**
 * Espera hasta que la misión se complete detectando incremento de matches_played.
 * Comprueba cada intervalMs. Soporta cancelación externa: cuando cancelToken.cancelled
 * sea true (nuevo PARTY_UPDATED sin PostMatchmaking), termina y devuelve 'cancelled'.
 */
export async function waitForMissionComplete(
  accountId: string,
  accessToken: string,
  storage: Storage | undefined,
  matchesPlayedBaseline: number,
  cancelToken: { cancelled: boolean },
  intervalMs: number = 5000
): Promise<'completed' | 'cancelled'> {
  let currentToken = accessToken;

  while (!cancelToken.cancelled) {
    try {
      const mcpState = await getMCPMatchesPlayed(accountId, currentToken, storage);
      if (mcpState.refreshedToken) currentToken = mcpState.refreshedToken;

      if (mcpState.matchesPlayed > matchesPlayedBaseline) {
        return 'completed';
      }
    } catch {
      // Error de red, continuar
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return 'cancelled';
}

// ─── Legacy (compatibilidad) ───────────────────────────────────────────

/** @deprecated Usar isInSTWMission + getMCPMatchesPlayed */
export async function checkSTWGameStatus(
  accountId: string,
  accessToken: string,
  storage?: Storage
): Promise<STWGameStatus> {
  try {
    const { meta } = await fetchPartyMeta(accountId, accessToken, storage);
    const inGame = isInSTWMission(meta);
    return { isInGame: inGame, isSTW: inGame, started: inGame, sessionId: null, gameMode: extractMatchmakingState(meta) };
  } catch {
    return { isInGame: false, isSTW: false, started: false, sessionId: null, gameMode: null };
  }
}

/** @deprecated No necesario con el nuevo flujo XMPP directo */
export async function waitForGameStart(
  _accountId: string,
  _accessToken: string,
  _maxAttempts?: number,
  _intervalMs?: number,
  _storage?: Storage
): Promise<{ started: boolean; matchesPlayedBaseline: number; newToken?: string }> {
  return { started: false, matchesPlayedBaseline: 0 };
}
