/**
 * Status backend helpers — thin wrappers around StatusManager
 * for use by IPC handlers.
 */

import type { Storage } from '../../storage';
import { statusManager } from '../../managers/status/StatusManager';
import type { PresenceMode, StatusConnectionInfo } from '../../managers/status/StatusManager';

export async function getStatusAll(storage: Storage): Promise<StatusConnectionInfo[]> {
  return statusManager.getAllInfo();
}

export async function activateStatus(
  storage: Storage,
  accountId: string,
  mensaje: string,
  plataforma: string,
  presenceMode: string,
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  return statusManager.activateStatus(accountId, mensaje, plataforma, presenceMode as PresenceMode);
}

export async function deactivateStatus(
  storage: Storage,
  accountId: string,
): Promise<{ success: boolean; error?: string }> {
  return statusManager.deactivateStatus(accountId);
}

export async function refreshStatus(
  storage: Storage,
  accountId: string,
): Promise<{ success: boolean; error?: string }> {
  return statusManager.refreshStatus(accountId);
}

export async function updateStatusMessage(
  storage: Storage,
  accountId: string,
  mensaje: string,
): Promise<{ success: boolean; error?: string }> {
  return statusManager.updateMessage(accountId, mensaje);
}

export async function getStatusInfo(
  storage: Storage,
  accountId: string,
): Promise<StatusConnectionInfo | null> {
  return statusManager.getAccountInfo(accountId);
}
