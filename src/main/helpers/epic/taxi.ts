/**
 * Taxi backend helpers — thin wrappers around TaxiManager for IPC
 */

import type { Storage } from '../../storage';
import { taxiManager } from '../../managers/taxi/TaxiManager';
import type { TaxiAccountConfig, TaxiAccountStatus } from '../../managers/taxi/TaxiManager';

export async function getTaxiAll(storage: Storage): Promise<TaxiAccountStatus[]> {
  return taxiManager.getAllStatus();
}

export async function getTaxiAvatars(storage: Storage): Promise<Record<string, string>> {
  return taxiManager.getAllAvatars();
}

export async function activateTaxi(
  storage: Storage,
  accountId: string,
): Promise<{ success: boolean; error?: string }> {
  return taxiManager.activate(accountId);
}

export async function deactivateTaxi(
  storage: Storage,
  accountId: string,
): Promise<{ success: boolean; error?: string }> {
  return taxiManager.deactivate(accountId);
}

export async function updateTaxiConfig(
  storage: Storage,
  accountId: string,
  partial: Partial<TaxiAccountConfig>,
): Promise<{ success: boolean }> {
  return taxiManager.updateConfig(accountId, partial);
}

export async function acceptTaxiResponsibility(
  storage: Storage,
  accountId: string,
): Promise<{ success: boolean }> {
  return taxiManager.acceptResponsibility(accountId);
}

export async function addTaxiWhitelist(
  storage: Storage,
  accountId: string,
  targetId: string,
  targetName: string,
): Promise<{ success: boolean }> {
  return taxiManager.addWhitelist(accountId, targetId, targetName);
}

export async function removeTaxiWhitelist(
  storage: Storage,
  accountId: string,
  targetId: string,
): Promise<{ success: boolean }> {
  return taxiManager.removeWhitelist(accountId, targetId);
}
