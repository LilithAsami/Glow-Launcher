/**
 * AutoKick STW Game Verification Helper
 * Verifica si una cuenta está en una partida STW completada
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';

export interface STWGameStatus {
  isInGame: boolean;
  isSTW: boolean;
  started: boolean;
  sessionId: string | null;
  gameMode: string | null;
  refreshedToken?: string;
}

/**
 * Verifica si una cuenta está en una partida STW y si está completada (started === false)
 */
export async function checkSTWGameStatus(
  accountId: string,
  accessToken: string,
  storage?: Storage
): Promise<STWGameStatus> {
  try {
    const response = await axios.get(
      `${Endpoints.MATCHMAKING}/${accountId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000,
      }
    );

    const data = response.data;
    const session = Array.isArray(data) && data.length > 0 ? data[0] : null;
    
    if (!session) {
      return {
        isInGame: false,
        isSTW: false,
        started: false,
        sessionId: null,
        gameMode: null,
      };
    }

    const sessionId = session.id || null;
    const attributes = session.attributes || {};
    const playlist = attributes.GAMEMODE_s || attributes.PLAYLIST_s || null;
    const started = session.started === true;
    
    const isSTW = 
      playlist?.toLowerCase().includes('pve') ||
      playlist?.toLowerCase().includes('stw') ||
      playlist?.toLowerCase().includes('savetheworld') ||
      playlist?.toLowerCase().includes('fortoutpost');

    return {
      isInGame: !!sessionId,
      isSTW,
      started,
      sessionId,
      gameMode: playlist,
    };
  } catch (error: any) {
    // Si es 404 o 204, no está en partida
    if (error.response?.status === 404 || error.response?.status === 204) {
      return {
        isInGame: false,
        isSTW: false,
        started: false,
        sessionId: null,
        gameMode: null,
      };
    }
    
    // Si es 401 (token expirado) y tenemos storage, intentar refrescar
    if (error.response?.status === 401 && storage) {
      const refreshed = await refreshAccountToken(storage, accountId);
      
      if (refreshed) {
        // Reintentar con el nuevo token
        const retryResponse = await axios.get(
          `${Endpoints.MATCHMAKING}/${accountId}`,
          {
            headers: {
              Authorization: `Bearer ${refreshed}`,
            },
            timeout: 10000,
          }
        );
        
        const retryData = retryResponse.data;
        const retrySession = Array.isArray(retryData) && retryData.length > 0 ? retryData[0] : null;
        
        if (!retrySession) {
          return {
            isInGame: false,
            isSTW: false,
            started: false,
            sessionId: null,
            gameMode: null,
            refreshedToken: refreshed,
          };
        }
        
        const sessionId = retrySession.id || null;
        const attributes = retrySession.attributes || {};
        const playlist = attributes.GAMEMODE_s || attributes.PLAYLIST_s || null;
        const started = retrySession.started === true;
        
        const isSTW = 
          playlist?.toLowerCase().includes('pve') ||
          playlist?.toLowerCase().includes('stw') ||
          playlist?.toLowerCase().includes('savetheworld') ||
          playlist?.toLowerCase().includes('fortoutpost');
        
        return {
          isInGame: !!sessionId,
          isSTW,
          started,
          sessionId,
          gameMode: playlist,
          refreshedToken: refreshed,
        };
      }
    }
    
    throw error;
  }
}

/**
 * Espera hasta que la cuenta entre en una partida (started === true)
 * Comprueba cada intervalMs durante maxAttempts intentos
 */
export async function waitForGameStart(
  accountId: string,
  accessToken: string,
  maxAttempts: number = 30,
  intervalMs: number = 5000,
  storage?: Storage
): Promise<{ started: boolean; newToken?: string }> {
  let currentToken = accessToken;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const status = await checkSTWGameStatus(accountId, currentToken, storage);

      if (status.refreshedToken) {
        currentToken = status.refreshedToken;
      }

      // DEBE ESPERAR A QUE started === TRUE (no solo estar en partida)
      if (status.isInGame && status.isSTW && status.started === true) {
        return { started: true, newToken: status.refreshedToken };
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    } catch (error) {
      // Continuar intentando
    }
  }

  return { started: false };
}

/**
 * Espera hasta que la misión se complete (started === false)
 * Comprueba cada 1s
 */
export async function waitForMissionComplete(
  accountId: string,
  accessToken: string,
  storage?: Storage
): Promise<boolean> {
  let currentToken = accessToken;

  while (true) {
    try {
      const status = await checkSTWGameStatus(accountId, currentToken, storage);

      if (status.refreshedToken) {
        currentToken = status.refreshedToken;
      }

      // Si ya no está en partida o no es STW, salir
      if (!status.isInGame || !status.isSTW) {
        return false;
      }

      // Esperar a que started cambie de TRUE a FALSE (misión completada)
      if (status.started === false) {
        return true;
      }

      // Esperar 1 segundo antes de la siguiente verificación
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      // Continuar intentando en caso de error
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
