/**
 * AutoKick STW Game Verification Helper
 *
 * Detección de misión completada:
 *
 * 1. El evento XMPP PARTY_UPDATED trae `party_state_updated` con el meta del party.
 *    Se lee `Default:CampaignInfo_j` → CampaignInfo.matchmakingState directamente
 *    del payload XMPP, SIN hacer ninguna llamada HTTP. (igual que Aerial Launcher)
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
 * Devuelve true si el meta indica que la cuenta está en una misión STW activa.
 */
export function isInSTWMission(meta: Partial<Record<string, string>>): boolean {
  return extractMatchmakingState(meta) === 'JoiningExistingSession';
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
    const matchesPlayed: number =
      response.data?.profileChanges?.[0]?.profile?.stats?.attributes?.matches_played ?? 0;
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
 * Comprueba cada intervalMs. Sin límite de tiempo.
 *
 * También detecta salida sin completar: si el party meta deja de indicar
 * JoiningExistingSession antes de que suba matches_played, devuelve false.
 */
export async function waitForMissionComplete(
  accountId: string,
  accessToken: string,
  storage: Storage | undefined,
  matchesPlayedBaseline: number,
  intervalMs: number = 5000
): Promise<boolean> {
  let currentToken = accessToken;

  while (true) {
    try {
      // Comprobar matches_played via MCP
      const mcpState = await getMCPMatchesPlayed(accountId, currentToken, storage);
      if (mcpState.refreshedToken) currentToken = mcpState.refreshedToken;

      if (mcpState.matchesPlayed > matchesPlayedBaseline) {
        // matches_played subió → misión completada (pantalla de victoria)
        return true;
      }

      // Check secundario: ¿sigue en misión? (detectar salida sin completar)
      try {
        const partyResult = await fetchPartyMeta(accountId, currentToken, storage);
        if (partyResult.refreshedToken) currentToken = partyResult.refreshedToken;
        if (!isInSTWMission(partyResult.meta)) {
          // Salió de la misión sin completarla
          return false;
        }
      } catch {
        // Si falla el party check, continuar mirando MCP
      }
    } catch {
      // Error de red, continuar
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
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
