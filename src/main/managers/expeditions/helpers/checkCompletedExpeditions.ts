import { log } from '../../../../helpers/logger';
import { getCampaignData, CampaignDataResult } from './getCampaignData';

export interface ExpeditionStatus {
  expeditionId: string;
  id: string;
  templateId: string;
  expeditionTemplate: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  expirationTime: string | null;
  successChance: number | null;
  squadId: string | null;
  status: string;
  statusMessage: string;
  canCollect: boolean;
  timeUntilComplete: number | null;
  timeUntilExpiration: number | null;
}

export interface ExpeditionStates {
  completed: ExpeditionStatus[];
  inProgress: ExpeditionStatus[];
  failed: ExpeditionStatus[];
  expired: ExpeditionStatus[];
  total: number;
}

export interface ExpeditionSummary {
  totalExpeditions: number;
  completed: number;
  inProgress: number;
  failed: number;
  expired: number;
  readyToCollect: number;
}

export interface CheckExpeditionsResult {
  success: boolean;
  expeditions?: ExpeditionStates;
  summary?: ExpeditionSummary;
  timestamp?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Verifica qué expediciones están completadas y listas para recolectar
 */
export async function checkCompletedExpeditions({
  accountId,
  accessToken,
  campaignData = null,
}: {
  accountId: string;
  accessToken: string;
  campaignData?: any;
}): Promise<CheckExpeditionsResult> {
  log.epic.info(`[checkCompletedExpeditions] [CLIPBOARD] Verificando estado de expediciones para: ${accountId.substring(0, 8)}...`);

  try {
    let campaign = campaignData;
    if (!campaign) {
      const result = await getCampaignData({ accountId, accessToken });
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          errorCode: result.errorCode,
        };
      }
      campaign = result.data;
    }

    const items = campaign.items || {};
    const now = new Date();

    const expeditionStates: ExpeditionStates = {
      completed: [],
      inProgress: [],
      failed: [],
      expired: [],
      total: 0,
    };

    // Analizar todas las expediciones
    for (const [itemId, item] of Object.entries<any>(items)) {
      if (item.templateId && item.templateId.startsWith('Expedition:')) {
        const expeditionInfo = analyzeExpedition(itemId, item, now);

        if (expeditionInfo) {
          const statusKey = expeditionInfo.status as keyof Omit<ExpeditionStates, 'total'>;
          expeditionStates[statusKey].push(expeditionInfo);
          expeditionStates.total++;

          log.epic.info(
            `[checkCompletedExpeditions] [CHART] ${expeditionInfo.name}: ${expeditionInfo.status.toUpperCase()} - ${expeditionInfo.statusMessage}`
          );
        }
      }
    }

    const summary: ExpeditionSummary = {
      totalExpeditions: expeditionStates.total,
      completed: expeditionStates.completed.length,
      inProgress: expeditionStates.inProgress.length,
      failed: expeditionStates.failed.length,
      expired: expeditionStates.expired.length,
      readyToCollect: expeditionStates.completed.filter((exp) => exp.canCollect).length,
    };

    log.epic.info(
      `[checkCompletedExpeditions] [OK] Resumen: ${summary.totalExpeditions} expediciones total - ${summary.completed} completadas, ${summary.inProgress} en progreso, ${summary.failed} fallidas, ${summary.expired} expiradas`
    );

    return {
      success: true,
      expeditions: expeditionStates,
      summary: summary,
      timestamp: now.toISOString(),
    };
  } catch (error: any) {
    log.epic.error({ error: error.message }, '[checkCompletedExpeditions] [ERROR] Error verificando expediciones');
    return {
      success: false,
      error: error.message,
      errorCode: 'unknown_error',
    };
  }
}

/**
 * Analiza una expedición individual y determina su estado
 */
function analyzeExpedition(itemId: string, item: any, currentTime: Date): ExpeditionStatus | null {
  const attributes = item.attributes || {};
  const templateId = item.templateId;

  // Información básica de la expedición
  const expeditionInfo: ExpeditionStatus = {
    expeditionId: itemId,
    id: itemId,
    templateId: templateId,
    expeditionTemplate: templateId,
    name: getExpeditionName(templateId),
    startTime: attributes.expedition_start_time || null,
    endTime: attributes.expedition_end_time || null,
    expirationTime: attributes.expedition_expiration_end_time || null,
    successChance: attributes.expedition_success_chance ? Math.round(attributes.expedition_success_chance * 100) : null,
    squadId: attributes.expedition_squad_id || null,
    status: 'unknown',
    statusMessage: 'Estado desconocido',
    canCollect: false,
    timeUntilComplete: null,
    timeUntilExpiration: null,
  };

  // Determinar el estado de la expedición
  const startTime = expeditionInfo.startTime ? new Date(expeditionInfo.startTime) : null;
  const endTime = expeditionInfo.endTime ? new Date(expeditionInfo.endTime) : null;
  const expirationTime = expeditionInfo.expirationTime ? new Date(expeditionInfo.expirationTime) : null;

  // Caso 1: Expedición no enviada pero expirada
  if (!startTime && expirationTime && currentTime > expirationTime) {
    expeditionInfo.status = 'expired';
    expeditionInfo.statusMessage = 'Expedición expirada sin enviar';
    expeditionInfo.timeUntilExpiration = 0;
    return expeditionInfo;
  }

  // Caso 2: Expedición no enviada (disponible)
  if (!startTime) {
    // Esta no es una expedición enviada, no la incluimos en el reporte
    return null;
  }

  // Caso 3: Expedición enviada y completada
  if (startTime && endTime && currentTime >= endTime) {
    expeditionInfo.status = 'completed';
    expeditionInfo.canCollect = true;

    // Determinar si fue exitosa o fallida basándose en si tiene recompensas o no
    const wasSuccessful = expeditionInfo.successChance ? expeditionInfo.successChance > 50 : false;
    expeditionInfo.statusMessage = wasSuccessful
      ? `Completada exitosamente (${expeditionInfo.successChance}% éxito)`
      : `Completada con fallo (${expeditionInfo.successChance}% éxito)`;

    const completedMinutesAgo = Math.floor((currentTime.getTime() - endTime.getTime()) / (1000 * 60));
    expeditionInfo.statusMessage += ` - Hace ${completedMinutesAgo} minutos`;

    return expeditionInfo;
  }

  // Caso 4: Expedición en progreso
  if (startTime && endTime && currentTime < endTime) {
    expeditionInfo.status = 'inProgress';
    expeditionInfo.timeUntilComplete = Math.floor((endTime.getTime() - currentTime.getTime()) / (1000 * 60)); // En minutos

    const hours = Math.floor(expeditionInfo.timeUntilComplete / 60);
    const minutes = expeditionInfo.timeUntilComplete % 60;

    if (hours > 0) {
      expeditionInfo.statusMessage = `En progreso - ${hours}h ${minutes}m restantes`;
    } else {
      expeditionInfo.statusMessage = `En progreso - ${minutes}m restantes`;
    }

    return expeditionInfo;
  }

  // Caso 5: Expedición fallida (enviada pero sin endTime o con problemas)
  if (startTime && !endTime) {
    expeditionInfo.status = 'failed';
    expeditionInfo.statusMessage = 'Expedición fallida o con error';
    return expeditionInfo;
  }

  return expeditionInfo;
}

/**
 * Obtiene un nombre legible para la expedición basado en su templateId
 */
function getExpeditionName(templateId: string): string {
  // Simplificar el nombre de la expedición
  return templateId
    .replace('Expedition:expedition_', '')
    .replace('Expedition:', '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Obtiene solo las expediciones que están listas para recolectar
 */
export async function getExpeditionsReadyToCollect(options: {
  accountId: string;
  accessToken: string;
  campaignData?: any;
}): Promise<any> {
  const result = await checkCompletedExpeditions(options);

  if (!result.success) {
    return result;
  }

  const readyToCollect = result.expeditions!.completed.filter((exp) => exp.canCollect);

  return {
    success: true,
    expeditions: readyToCollect,
    count: readyToCollect.length,
    timestamp: result.timestamp,
  };
}

/**
 * Obtiene solo las expediciones que están en progreso
 */
export async function getExpeditionsInProgress(options: {
  accountId: string;
  accessToken: string;
  campaignData?: any;
}): Promise<any> {
  const result = await checkCompletedExpeditions(options);

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    expeditions: result.expeditions!.inProgress,
    count: result.expeditions!.inProgress.length,
    timestamp: result.timestamp,
  };
}

/**
 * Verifica si hay expediciones expiradas que necesitan ser refrescadas
 */
export async function checkExpiredExpeditions(options: {
  accountId: string;
  accessToken: string;
  campaignData?: any;
}): Promise<any> {
  const result = await checkCompletedExpeditions(options);

  if (!result.success) {
    return result;
  }

  const hasExpired = result.expeditions!.expired.length > 0;

  return {
    success: true,
    hasExpired: hasExpired,
    expiredCount: result.expeditions!.expired.length,
    expiredExpeditions: result.expeditions!.expired,
    needsRefresh: hasExpired,
  };
}
