/**
 * AutoKick Monitor — XMPP Event System
 *
 * Sistema de monitoreo automático para misiones STW usando XMPP + polling de respaldo.
 *
 * Flujo:
 * 1. Conexión XMPP a cada cuenta activa
 * 2. Escucha evento PARTY_UPDATED en raw:incoming
 * 3. Al detectar evento → verifica entrada a partida 
 * 4. Captura baseline de matches_played del MCP campaign
 * 5. Monitorea completación (polling MCP 5s hasta matches_played > baseline)
 * 6. Ejecuta acciones configuradas
 * 7. Polling de respaldo cada 60s por si XMPP falla
 */

import { createClient, Agent } from 'stanza';
import crypto from 'crypto';
import { BrowserWindow } from 'electron';
import { Endpoints } from '../../helpers/endpoints';
import { ANDROID_CLIENT, FORTNITE_CLIENT } from '../../helpers/auth/clients';
import { refreshAccountToken } from '../../helpers/auth/tokenRefresh';
import { isInSTWMission, getMCPMatchesPlayed, fetchPartyMeta, waitForMissionComplete } from '../../helpers/autokick/gameVerification';
import { processSTWRewards } from '../../helpers/autokick/rewardsProcessor';
import { transferMaterials } from '../../helpers/autokick/materialsTransfer';
import { PartyManager } from '../../managers/party/PartyManager';
import { notificationManager } from '../../managers/notifications/NotificationManager';
import type { Storage } from '../../storage';
import type { AccountsData, AutoKickData, AutoKickAccountConfig, AutoKickStatus } from '../../../shared/types';

// ⚙️ CONFIGURACIÓN DE TIEMPOS
const TIMING_CONFIG = {
  MISSION_COMPLETE_CHECK_INTERVAL: 3000,  // 3s entre checks de MCP matches_played
  BACKUP_POLLING_INTERVAL: 60000,         // 60s polling de respaldo: por si el xmpp se desconecta cuando manda el evento
  MONITORING_CLEANUP_INTERVAL: 600000,    // 10 min limpieza
  XMPP_RECONNECT_DELAY: 5000,            // 5s antes de reconectar XMPP
};

const PARTY_UPDATED_EVENT = 'com.epicgames.social.party.notification.v0.PARTY_UPDATED';

// ─── State (idéntico al bot GLOW por si se quieren copiar xd) ─────────────────────────────────

// activeMonitoring: solo tracking de procesamiento duplicado
const activeMonitoring = new Map<string, { processing: boolean; lastUpdate: number }>();
const xmppConnections = new Map<string, Agent>();
// Backup polling intervals separados (no mezclados con activeMonitoring)
const backupIntervals = new Map<string, NodeJS.Timeout>();
const liveTokens = new Map<string, string>();
const intentionalDisconnects = new Set<string>(); // Prevent reconnect on user-initiated disconnect
let storageRef: Storage | null = null;

function send(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, data);
}

// ─── Storage helpers ─────────────────────────────────────────

export async function getAutoKickData(storage: Storage): Promise<AutoKickData> {
  return (await storage.get<AutoKickData>('autokick')) ?? { accounts: {} };
}

export async function saveAutoKickData(storage: Storage, data: AutoKickData): Promise<void> {
  await storage.set('autokick', data);
}

async function getStoredAccount(accountId: string): Promise<any> {
  if (!storageRef) return null;
  const accsData = (await storageRef.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  return accsData.accounts.find((a) => a.accountId === accountId);
}

// ─── Public API ──────────────────────────────────────────────

export async function initAutoKick(storage: Storage): Promise<void> {
  storageRef = storage;
  const akData = await getAutoKickData(storage);
  const accsData = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };

  const statuses: AutoKickStatus[] = [];

  for (const acc of accsData.accounts) {
    const cfg = akData.accounts[acc.accountId];
    if (!cfg || !cfg.isActive) {
      statuses.push({ accountId: acc.accountId, displayName: acc.displayName, connected: false, error: 'Inactive' });
      continue;
    }

    try {
      await createXMPPConnection(storage, acc.accountId, acc.displayName, acc);
      statuses.push({ accountId: acc.accountId, displayName: acc.displayName, connected: true });
    } catch (err: any) {
      statuses.push({
        accountId: acc.accountId,
        displayName: acc.displayName,
        connected: false,
        error: err?.message ?? 'Connection failed',
      });
    }
  }

  send('autokick:status-update', statuses);

  // Limpieza periódica
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of activeMonitoring.entries()) {
      if (!data.processing && now - data.lastUpdate > TIMING_CONFIG.MONITORING_CLEANUP_INTERVAL) {
        activeMonitoring.delete(key);
      }
    }
  }, TIMING_CONFIG.MONITORING_CLEANUP_INTERVAL);
}

export async function toggleAutoKick(
  storage: Storage,
  accountId: string,
  active: boolean,
): Promise<AutoKickData> {
  const akData = await getAutoKickData(storage);
  if (!akData.accounts[accountId]) {
    akData.accounts[accountId] = defaultConfig(active);
  } else {
    akData.accounts[accountId].isActive = active;
  }
  await saveAutoKickData(storage, akData);

  send('autokick:data-changed', null);

  if (active) {
    const accsData = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const acc = accsData.accounts.find((a) => a.accountId === accountId);
    if (acc) {
      send('autokick:status-update', [{ accountId, displayName: acc.displayName, connected: false }]);
      connectAccountAsync(storage, accountId, acc.displayName, acc);
    }
  } else {
    await disconnectAutoKick(accountId);
    send('autokick:status-update', [{ accountId, displayName: accountId, connected: false, error: 'Disabled' }]);
  }

  return akData;
}

export async function updateAutoKickConfig(
  storage: Storage,
  accountId: string,
  partial: Partial<AutoKickAccountConfig>,
): Promise<AutoKickData> {
  const akData = await getAutoKickData(storage);
  if (!akData.accounts[accountId]) {
    akData.accounts[accountId] = defaultConfig(false);
  }
  Object.assign(akData.accounts[accountId], partial);
  await saveAutoKickData(storage, akData);
  return akData;
}

export async function getAutoKickFullStatus(storage: Storage): Promise<{
  data: AutoKickData;
  statuses: AutoKickStatus[];
}> {
  const akData = await getAutoKickData(storage);
  const accsData = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };

  const statuses: AutoKickStatus[] = accsData.accounts.map((acc) => {
    const cfg = akData.accounts[acc.accountId];
    const isConnected = xmppConnections.has(acc.accountId);
    return {
      accountId: acc.accountId,
      displayName: acc.displayName,
      connected: isConnected,
      error: (!cfg || !cfg.isActive) ? 'Inactive' : undefined,
    };
  });

  return { data: akData, statuses };
}

// ─── XMPP Connection ─────────────────────────────────────────

async function createXMPPConnection(
  storage: Storage,
  accountId: string,
  displayName: string,
  accountData: any
): Promise<void> {
  // Desconectar existente (clean)
  if (xmppConnections.has(accountId)) {
    intentionalDisconnects.add(accountId);
    const existing = xmppConnections.get(accountId);
    try { await existing!.disconnect(); } catch {}
    xmppConnections.delete(accountId);
  }

  // Limpiar backup polling anterior
  const oldInterval = backupIntervals.get(accountId);
  if (oldInterval) { clearInterval(oldInterval); backupIntervals.delete(accountId); }
  activeMonitoring.delete(accountId);

  // Refrescar token
  const token = await refreshAccountToken(storage, accountId);
  if (!token) throw new Error('Token refresh failed');
  
  liveTokens.set(accountId, token);

  // Configurar XMPP 
  const resourceHash = crypto.randomBytes(16).toString('hex').toUpperCase();
  const serverUrl = Endpoints.EPIC_PROD_ENV;
  
  const xmpp = createClient({
    jid: `${accountId}@${serverUrl}`,
    server: serverUrl,
    transports: {
      websocket: `wss://xmpp-service-${serverUrl}`,
      bosh: false,
    },
    credentials: {
      host: serverUrl,
      username: accountId,
      password: token,
    },
    resource: `V2:Fortnite:AND::${resourceHash}`,
  }) as Agent;
  
  // Keepalive para mantener la conexión activa
  xmpp.enableKeepAlive({ interval: 30000 });

  // ── Session started: enviar presencia para mantener conexión ──
  xmpp.on('session:started', () => {
    send('autokick:log', { accountId, displayName, type: 'info', message: 'XMPP connected' });

    // Iniciar polling de respaldo cada 60s
    startBackupPolling(storage, accountId, displayName);
  });

  // ── Disconnected: reconectar solo si no fue intencional y cuenta sigue activa ──
  xmpp.on('disconnected', async () => {
    xmppConnections.delete(accountId);
    send('autokick:log', { accountId, displayName, type: 'warn', message: 'XMPP disconnected' });

    // No reconectar si fue desconexión intencional (toggle off, cleanup)
    if (intentionalDisconnects.has(accountId)) {
      intentionalDisconnects.delete(accountId);
      return;
    }

    // Verificar que la cuenta sigue activa antes de reconectar
    try {
      const akData = await getAutoKickData(storage);
      const cfg = akData.accounts[accountId];
      if (!cfg || !cfg.isActive) {
        send('autokick:status-update', [{ accountId, displayName, connected: false, error: 'Disabled' }]);
        return;
      }
    } catch {}

    // Reconectar después de delay
    send('autokick:status-update', [{ accountId, displayName, connected: false, error: 'Reconnecting...' }]);

    setTimeout(async () => {
      // Doble check: verificar que sigue activa
      try {
        const akData = await getAutoKickData(storage);
        const cfg = akData.accounts[accountId];
        if (!cfg || !cfg.isActive) return;
      } catch {}

      try {
        await createXMPPConnection(storage, accountId, displayName, accountData);
        send('autokick:status-update', [{ accountId, displayName, connected: true }]);
      } catch (e: any) {
        send('autokick:status-update', [{ accountId, displayName, connected: false, error: e?.message }]);
      }
    }, TIMING_CONFIG.XMPP_RECONNECT_DELAY);
  });

  // ── PARTY_UPDATED listener en raw XML ──
  xmpp.on('raw:incoming', (rawXML: string) => {
    if (!rawXML.includes('<body>') || !rawXML.includes(PARTY_UPDATED_EVENT)) return;
    
    const bodyMatch = rawXML.match(/<body[^>]*>(.*?)<\/body>/s);
    if (bodyMatch && bodyMatch[1]) {
      try {
        const parsed = JSON.parse(bodyMatch[1]);
        if (parsed.type === PARTY_UPDATED_EVENT) {
          // party_state_updated contiene el meta del party directamente desde XMPP
          const partyMeta: Partial<Record<string, string>> = parsed.party_state_updated ?? {};
          handlePartyUpdate(storage, accountId, displayName, accountData, partyMeta).catch(() => {});
        }
      } catch {}
    }
  });

  // Conectar con timeout
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('XMPP connection timeout (15s)')), 15000);
    xmpp.once('session:started', () => { clearTimeout(timeout); resolve(); });
    xmpp.once('stream:error', (err: any) => {
      clearTimeout(timeout);
      reject(new Error(`XMPP stream error: ${err}`));
    });
    xmpp.connect();
  });

  // Limpiar flag de intencional por si quedó residual
  intentionalDisconnects.delete(accountId);
  xmppConnections.set(accountId, xmpp);
}

async function connectAccountAsync(
  storage: Storage,
  accountId: string,
  displayName: string,
  accountData: any
): Promise<void> {
  try {
    await createXMPPConnection(storage, accountId, displayName, accountData);
    send('autokick:status-update', [{ accountId, displayName, connected: true }]);
  } catch (err: any) {
    send('autokick:status-update', [{ accountId, displayName, connected: false, error: err?.message }]);
  }
}

// ─── Polling de respaldo ─────────────────────────────────────

function startBackupPolling(storage: Storage, accountId: string, displayName: string): void {
  // Limpiar intervalo anterior si existe
  const existing = backupIntervals.get(accountId);
  if (existing) clearInterval(existing);

  const intervalId = setInterval(async () => {
    // Si ya está procesando un evento, no interferir
    const monitoring = activeMonitoring.get(accountId);
    if (monitoring?.processing) return;

    try {
      const token = liveTokens.get(accountId);
      if (!token) return;

      // Backup usa HTTP al party endpoint (no hay XMPP push aquí)
      const partyResult = await fetchPartyMeta(accountId, token, storage);
      if (partyResult.refreshedToken) liveTokens.set(accountId, partyResult.refreshedToken);

      if (isInSTWMission(partyResult.meta)) {
        const accountData = await getStoredAccount(accountId);
        if (accountData) {
          handlePartyUpdate(storage, accountId, displayName, accountData, partyResult.meta).catch(() => {});
        }
      }
    } catch {}
  }, TIMING_CONFIG.BACKUP_POLLING_INTERVAL);

  backupIntervals.set(accountId, intervalId);
}

// ─── Event Handler ─────────────────────────

async function handlePartyUpdate(
  storage: Storage,
  accountId: string,
  displayName: string,
  accountData: any,
  partyMeta: Partial<Record<string, string>> = {}
): Promise<void> {
  // Evitar procesamiento duplicado
  const existing = activeMonitoring.get(accountId);
  if (existing && existing.processing) {
    return;
  }

  // Marcar como procesando (crear entry si no existe)
  activeMonitoring.set(accountId, { processing: true, lastUpdate: Date.now() });

  try {
    const autoKickEntry = await getAutoKickData(storage);
    const config = autoKickEntry.accounts[accountId];

    if (!config || !config.isActive) {
      return;
    }

    // Obtener token (refrescar si no hay)
    let token = liveTokens.get(accountId);
    if (!token) {
      token = await refreshAccountToken(storage, accountId);
      if (!token) {
        send('autokick:log', { accountId, displayName, type: 'error', message: 'Token refresh failed' });
        return;
      }
      liveTokens.set(accountId, token);
    }

    // ── Leer matchmakingState del meta XMPP directamente (sin HTTP) ────────────────
    if (!isInSTWMission(partyMeta)) {
      return;
    }

    send('autokick:log', { accountId, displayName, type: 'info', message: 'STW mission detected — capturing baseline...' });

    // ── Capturar baseline de matches_played via MCP ───────────────────────
    const mcpBaseline = await getMCPMatchesPlayed(accountId, token, storage);
    if (mcpBaseline.refreshedToken) {
      token = mcpBaseline.refreshedToken;
      liveTokens.set(accountId, token);
    }
    const matchesPlayedBaseline = mcpBaseline.matchesPlayed;

    send('autokick:log', {
      accountId, displayName, type: 'info',
      message: `Mission started (baseline matches_played: ${matchesPlayedBaseline}) — waiting for completion...`,
    });

    // ── Esperar incremento de matches_played ─────────────────────────────
    const currentToken = token;
    const storedSettings = storageRef ? await storageRef.get<any>('settings') : null;
    const checkIntervalMs = storedSettings?.automationTimings?.autokickCheckMs ?? TIMING_CONFIG.MISSION_COMPLETE_CHECK_INTERVAL;
    const completed = await waitForMissionComplete(
      accountId,
      currentToken,
      storage,
      matchesPlayedBaseline,
      checkIntervalMs
    );
    if (!completed) {
      send('autokick:log', { accountId, displayName, type: 'warn', message: 'Mission ended unexpectedly' });
      return;
    }

    send('autokick:log', { accountId, displayName, type: 'success', message: 'Mission completed!' });

    // Refrescar token antes de acciones
    const freshToken = await refreshAccountToken(storage, accountId);
    if (freshToken) liveTokens.set(accountId, freshToken);

    await executeAutoKickActions(storage, accountId, displayName, freshToken || currentToken, config);
  } catch (error: any) {
    send('autokick:log', { accountId, displayName, type: 'error', message: `Error: ${error?.message}` });
  } finally {
    // Limpiar estado de procesamiento
    activeMonitoring.delete(accountId);
  }
}

// ─── Actions ─────────────────────────────────────────────────

async function executeAutoKickActions(
  storage: Storage,
  accountId: string,
  displayName: string,
  token: string,
  config: AutoKickAccountConfig
): Promise<void> {
  // 1. Collect Rewards
  if (config.collectRewards) {
    try {
      const rewards = await processSTWRewards(accountId, token, displayName);
      const count = Object.keys(rewards).length;
      send('autokick:log', {
        accountId,
        displayName,
        type: 'info',
        message: count > 0 ? `Collected ${count} reward type(s)` : 'No rewards to collect',
        rewards,
      });

      // Push rich notification with reward items (icons + quantities)
      if (count > 0) {
        const rewardItems = Object.values(rewards).map((r) => ({
          name: r.name,
          quantity: r.quantity,
          icon: r.icon,
        }));
        notificationManager.push(
          'autokick',
          'AutoKick — Rewards',
          `${displayName} — collected ${count} reward(s)`,
          rewardItems,
        );
      }
    } catch (err: any) {
      send('autokick:log', { accountId, displayName, type: 'error', message: `Rewards error: ${err?.message}` });
    }
  }

  // 2. Transfer Materials
  if (config.transferMaterials) {
    try {
      const result = await transferMaterials(accountId, token);
      if (result) {
        send('autokick:log', { accountId, displayName, type: 'info', message: 'Materials transferred' });
      }
    } catch (err: any) {
      send('autokick:log', { accountId, displayName, type: 'error', message: `Materials error: ${err?.message}` });
    }
  }

  // 3. Kick Party Members
  if (config.kickPartyMembers) {
    try {
      const party = new PartyManager({ accountId, displayName, token });
      await party.fetch();
      
      const members = party.members?.filter((m) => m.id !== accountId) || [];
      for (const member of members) {
        try {
          await party.kick(member.id);
        } catch {}
      }
      
      send('autokick:log', {
        accountId,
        displayName,
        type: 'info',
        message: members.length > 0 ? `Kicked ${members.length} member(s)` : 'No members to kick',
      });

      // Push notification for kicks
      if (members.length > 0) {
        notificationManager.push('autokick', 'AutoKick', `${displayName} — kicked ${members.length} member(s)`);
      }
    } catch (err: any) {
      send('autokick:log', { accountId, displayName, type: 'error', message: `Kick error: ${err?.message}` });
    }
  }

  // 4. Auto Leave
  if (config.autoLeave) {
    try {
      const party = new PartyManager({ accountId, displayName, token });
      await party.fetch();
      await party.leave();
      send('autokick:log', { accountId, displayName, type: 'info', message: 'Left party' });
    } catch (err: any) {
      send('autokick:log', { accountId, displayName, type: 'error', message: `Leave error: ${err?.message}` });
    }
  }
}

// ─── Cleanup ─────────────────────────────────────────────────

export async function disconnectAutoKick(accountId: string): Promise<void> {
  // Marcar como desconexión intencional ANTES de desconectar
  intentionalDisconnects.add(accountId);

  const xmpp = xmppConnections.get(accountId);
  if (xmpp) {
    try { await xmpp.disconnect(); } catch {}
    xmppConnections.delete(accountId);
  }

  // Limpiar backup polling
  const interval = backupIntervals.get(accountId);
  if (interval) { clearInterval(interval); backupIntervals.delete(accountId); }

  activeMonitoring.delete(accountId);
  liveTokens.delete(accountId);
}

function defaultConfig(active: boolean): AutoKickAccountConfig {
  return {
    isActive: active,
    kickPartyMembers: false,
    collectRewards: true,
    autoLeave: true,
    transferMaterials: false,
    autoReinvite: false,
    autoJoin: false,
  };
}
