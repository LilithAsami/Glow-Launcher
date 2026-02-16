import { log } from '../../../../helpers/logger';
import { Endpoints } from '../../../../helpers/endpoints';
import { composeMCP } from '../../../../helpers/epic/utils/mcp';

export interface CampaignDataResult {
  success: boolean;
  data?: any;
  items?: any;
  stats?: any;
  fromCache?: boolean;
  itemCount?: number;
  statsCount?: number;
  error?: string;
  errorCode?: string;
}

interface CacheEntry {
  data: any;
  timestamp: number;
}

// CACHÉ DE DATOS DE CAMPAÑA POR CUENTA (30 SEGUNDOS)
const campaignDataCache = new Map<string, CacheEntry>();

/**
 * Obtiene los datos completos del perfil de campaña del usuario
 * Incluye sistema de caché para optimizar las consultas
 * @param options - Opciones de configuración
 * @returns Datos completos del perfil de campaña
 */
export async function getCampaignData({
  accountId,
  accessToken,
  forceRefresh = false,
  cacheTimeMs = 30000, // 30 segundos por defecto
}: {
  accountId: string;
  accessToken: string;
  forceRefresh?: boolean;
  cacheTimeMs?: number;
}): Promise<CampaignDataResult> {
  log.epic.info(`[getCampaignData] [SEARCH] Obteniendo datos de campaña para cuenta: ${accountId.substring(0, 8)}...`);

  // Verificar caché si no se fuerza el refresh
  if (!forceRefresh && campaignDataCache.has(accountId)) {
    const cached = campaignDataCache.get(accountId)!;
    const isExpired = Date.now() - cached.timestamp > cacheTimeMs;

    if (!isExpired) {
      log.epic.info(`[getCampaignData] [BOOK] Usando datos en caché (${Math.round((cacheTimeMs - (Date.now() - cached.timestamp)) / 1000)}s restantes)`);
      return {
        success: true,
        data: cached.data,
        items: cached.data.items || {},
        stats: cached.data.stats?.attributes || {},
        fromCache: true,
        itemCount: Object.keys(cached.data.items || {}).length,
        statsCount: Object.keys(cached.data.stats?.attributes || {}).length,
      };
    } else {
      log.epic.info(`[getCampaignData] [CLOCK] Caché expirado para ${accountId.substring(0, 8)}..., obteniendo datos frescos`);
      campaignDataCache.delete(accountId);
    }
  }

  try {
    log.epic.info(`[getCampaignData] [SATELLITE] Consultando perfil de campaña desde Epic Games...`);

    const result = await composeMCP({
      profile: 'campaign',
      operation: 'QueryProfile',
      accountId,
      accessToken,
      body: {}
    });

    if (!result.success) {
      log.epic.error({ error: result.error }, '[getCampaignData] [ERROR] Error en MCP QueryProfile');
      
      // Si hay error de token, devolver información específica
      if (result.errorCode === 'errors.com.epicgames.common.authentication.token_verification_failed') {
        return {
          success: false,
          error: result.error,
          errorCode: 'token_verification_failed',
        };
      }
      
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode || 'mcp_query_failed',
      };
    }

    const profileChanges = result.data?.profileChanges?.[0];
    const profile = profileChanges?.profile || {};

    log.epic.info(`[getCampaignData] [OK] Datos de campaña obtenidos exitosamente`);
    log.epic.info(`[getCampaignData] [CHART] Items en perfil: ${Object.keys(profile.items || {}).length}`);
    log.epic.info(`[getCampaignData] [CHART] Stats disponibles: ${Object.keys(profile.stats?.attributes || {}).length}`);

    // Guardar en caché
    campaignDataCache.set(accountId, {
      data: profile,
      timestamp: Date.now()
    });

    return {
      success: true,
      data: profile,
      items: profile.items || {},
      stats: profile.stats?.attributes || {},
      fromCache: false,
      itemCount: Object.keys(profile.items || {}).length,
      statsCount: Object.keys(profile.stats?.attributes || {}).length,
    };
  } catch (error: any) {
    log.epic.error({ error: error.message }, '[getCampaignData] [ERROR] Error obteniendo datos de campaña');
    return {
      success: false,
      error: error.message,
      errorCode: 'unknown_error',
    };
  }
}

/**
 * Wrapper simplificado para obtener solo los items del perfil de campaña
 */
export async function getCampaignItems(options: {
  accountId: string;
  accessToken: string;
  forceRefresh?: boolean;
  cacheTimeMs?: number;
}): Promise<CampaignDataResult> {
  const result = await getCampaignData(options);

  if (result.success) {
    return {
      success: true,
      items: result.items,
      data: result.data,
    };
  }

  return result;
}

/**
 * Wrapper simplificado para obtener solo las stats del perfil de campaña
 */
export async function getCampaignStats(options: {
  accountId: string;
  accessToken: string;
  forceRefresh?: boolean;
  cacheTimeMs?: number;
}): Promise<CampaignDataResult> {
  const result = await getCampaignData(options);

  if (result.success) {
    return {
      success: true,
      stats: result.stats,
      data: result.data,
    };
  }

  return result;
}

/**
 * Limpia el caché de datos de campaña para una cuenta específica
 */
export function clearCampaignDataCache(accountId: string): boolean {
  if (campaignDataCache.has(accountId)) {
    campaignDataCache.delete(accountId);
    log.epic.info(`[getCampaignData] [TRASH] Caché eliminado para cuenta: ${accountId.substring(0, 8)}...`);
    return true;
  }

  log.epic.info(`[getCampaignData] [WARN] No había caché para eliminar: ${accountId.substring(0, 8)}...`);
  return false;
}

/**
 * Limpia todo el caché de datos de campaña
 */
export function clearAllCampaignDataCache(): number {
  const count = campaignDataCache.size;
  campaignDataCache.clear();
  log.epic.info(`[getCampaignData] [TRASH] Todo el caché eliminado: ${count} entradas`);
  return count;
}

/**
 * Obtiene información sobre el estado actual del caché
 */
export function getCacheInfo() {
  const cacheEntries = [];

  for (const [accountId, entry] of campaignDataCache.entries()) {
    const age = Date.now() - entry.timestamp;
    cacheEntries.push({
      accountId: accountId.substring(0, 8) + '...',
      ageMs: age,
      ageSeconds: Math.round(age / 1000),
      itemCount: Object.keys(entry.data.items || {}).length,
    });
  }

  return {
    totalEntries: campaignDataCache.size,
    entries: cacheEntries,
  };
}
