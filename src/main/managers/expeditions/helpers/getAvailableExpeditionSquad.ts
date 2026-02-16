import { log } from '../../../../helpers/logger';
import { getCampaignData, CampaignDataResult } from './getCampaignData';

/**
 * Configuración de Squad IDs y sus tamaños
 */
export const SQUAD_IDS_CONFIG: Record<string, number> = {
  Squad_Expedition_ExpeditionSquadOne: 3,
  Squad_Expedition_ExpeditionSquadTwo: 5,
  Squad_Expedition_ExpeditionSquadThree: 4,
  Squad_Expedition_ExpeditionSquadFour: 5,
  Squad_Expedition_ExpeditionSquadFive: 3,
  Squad_Expedition_ExpeditionSquadSix: 4,
};

/**
 * Array de Squad IDs ordenados por capacidad (mayor a menor)
 */
export const AVAILABLE_SQUAD_IDS: string[] = Object.keys(SQUAD_IDS_CONFIG).sort(
  (a, b) => SQUAD_IDS_CONFIG[b] - SQUAD_IDS_CONFIG[a]
);

export interface SquadInfo {
  squadId: string;
  capacity: number;
  inUse: boolean;
  compatible: boolean;
  name: string;
  type: string;
}

export interface SquadsSummary {
  totalSquads: number;
  available: number;
  compatible: number;
  inUse: number;
}

export interface AvailableSquadsResult {
  success: boolean;
  squads?: {
    all: SquadInfo[];
    available: string[];
    inUse: string[];
  };
  summary?: SquadsSummary;
  expeditionType?: string | null;
  error?: string;
  errorCode?: string;
}

/**
 * Obtiene los Squad IDs de expedición disponibles para usar
 * Analiza qué squads están ocupados en expediciones activas y qué expediciones pueden usar cada squad
 */
export async function getAvailableExpeditionSquads({
  accountId,
  accessToken,
  campaignData = null,
  forceRefresh = false,
  expeditionTemplate = null,
}: {
  accountId: string;
  accessToken: string;
  campaignData?: any;
  forceRefresh?: boolean;
  expeditionTemplate?: string | null;
}): Promise<AvailableSquadsResult> {
  log.epic.info(`[getAvailableExpeditionSquads] [DART] Obteniendo Squad IDs de expedición disponibles para: ${accountId.substring(0, 8)}...`);
  if (expeditionTemplate) {
    log.epic.info(`[getAvailableExpeditionSquads] [SEARCH] Filtrando por expedición: ${expeditionTemplate}`);
  }

  try {
    // Obtener datos de campaña si no se proporcionaron
    let campaign = campaignData;
    if (!campaign) {
      const result = await getCampaignData({ accountId, accessToken, forceRefresh });
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          errorCode: result.errorCode,
        };
      }
      campaign = result.data;
    }

    // Obtener Squad IDs en uso por expediciones activas
    const squadsInUse = getSquadsInUse(campaign);
    log.epic.info(`[getAvailableExpeditionSquads] 🚫 Squad IDs en uso: ${Array.from(squadsInUse).join(', ') || 'ninguno'}`);

    // Determinar tipo de expedición si se proporciona template
    const expeditionType = expeditionTemplate ? getExpeditionType(expeditionTemplate) : null;
    if (expeditionType) {
      log.epic.info(`[getAvailableExpeditionSquads] [SEARCH] Tipo de expedición: ${expeditionType}`);
    }

    const squadInfo: SquadInfo[] = [];
    let availableCount = 0;
    let compatibleCount = 0;

    // Analizar cada Squad ID
    for (const [squadId, capacity] of Object.entries(SQUAD_IDS_CONFIG)) {
      const isInUse = squadsInUse.has(squadId);
      const isCompatible = expeditionType ? isSquadCompatibleWithExpedition(squadId, expeditionType) : true;

      const squad: SquadInfo = {
        squadId: squadId,
        capacity: capacity,
        inUse: isInUse,
        compatible: isCompatible,
        name: getSquadName(squadId),
        type: getSquadType(squadId),
      };

      squadInfo.push(squad);

      if (!isInUse) {
        availableCount++;
        if (isCompatible) {
          compatibleCount++;
        }
      }

      const statusIcon = isInUse ? '🚫' : isCompatible ? '[OK]' : '[WARN]';
      const statusText = isInUse ? 'EN USO' : isCompatible ? 'DISPONIBLE' : 'NO COMPATIBLE';
      log.epic.info(`[getAvailableExpeditionSquads] ${statusIcon} ${squad.name} (${capacity} héroes): ${statusText}`);
    }

    // Obtener Squad IDs disponibles y compatibles
    const availableSquadIds = squadInfo
      .filter((squad) => !squad.inUse && squad.compatible)
      .sort((a, b) => b.capacity - a.capacity) // Ordenar por capacidad (mayor primero)
      .map((squad) => squad.squadId);

    log.epic.info(
      `[getAvailableExpeditionSquads] [OK] Resumen: ${compatibleCount}/${availableCount} Squad IDs disponibles y compatibles`
    );

    return {
      success: true,
      squads: {
        all: squadInfo,
        available: availableSquadIds,
        inUse: Array.from(squadsInUse),
      },
      summary: {
        totalSquads: Object.keys(SQUAD_IDS_CONFIG).length,
        available: availableCount,
        compatible: compatibleCount,
        inUse: squadsInUse.size,
      },
      expeditionType: expeditionType,
    };
  } catch (error: any) {
    log.epic.error({ error: error.message }, '[getAvailableExpeditionSquads] [ERROR] Error obteniendo vehículos');
    return {
      success: false,
      error: error.message,
      errorCode: 'squad_fetch_error',
    };
  }
}

/**
 * Obtiene Squad IDs que ya están en uso por expediciones activas
 */
export function obtenerSquadIdsEnUso(expediciones: any[]): Set<string> {
  const usedSquadIds = new Set<string>();

  for (const expedition of expediciones) {
    if (expedition.isSent && expedition.squadId) {
      // Normalizar el squadId: Epic devuelve en minúsculas "squad_expedition_expeditionsquadtwo"
      // pero necesitamos "Squad_Expedition_ExpeditionSquadTwo"
      const normalizedSquadId = normalizeSquadId(expedition.squadId);
      usedSquadIds.add(normalizedSquadId);
    }
  }

  return usedSquadIds;
}

/**
 * Normaliza el Squad ID de Epic Games al formato esperado
 * Epic devuelve: "squad_expedition_expeditionsquadtwo"
 * Necesitamos: "Squad_Expedition_ExpeditionSquadTwo"
 */
function normalizeSquadId(squadId: string): string {
  if (!squadId) return squadId;
  
  // Si ya está normalizado, devolverlo tal cual
  if (squadId.startsWith('Squad_')) return squadId;
  
  // Convertir de formato Epic a formato esperado
  // squad_expedition_expeditionsquadtwo -> Squad_Expedition_ExpeditionSquadTwo
  const parts = squadId.toLowerCase().split('_');
  const normalized = parts.map(part => {
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join('_');
  
  return normalized;
}

/**
 * Encuentra un squad ID disponible que no esté en uso
 */
export function encontrarSquadIdDisponible(squadIdsEnUso: Set<string>): string | null {
  for (const squadId of AVAILABLE_SQUAD_IDS) {
    if (!squadIdsEnUso.has(squadId)) {
      return squadId;
    }
  }
  return null;
}

/**
 * Obtiene el nombre legible del Squad ID
 */
export function getSquadName(squadId: string): string {
  const squadNames: Record<string, string> = {
    Squad_Expedition_ExpeditionSquadOne: 'Squad de Expedición 1 (3 héroes)',
    Squad_Expedition_ExpeditionSquadTwo: 'Squad de Expedición 2 (5 héroes)',
    Squad_Expedition_ExpeditionSquadThree: 'Squad de Expedición 3 (4 héroes)',
    Squad_Expedition_ExpeditionSquadFour: 'Squad de Expedición 4 (5 héroes)',
    Squad_Expedition_ExpeditionSquadFive: 'Squad de Expedición 5 (3 héroes)',
    Squad_Expedition_ExpeditionSquadSix: 'Squad de Expedición 6 (4 héroes)',
  };

  return (
    squadNames[squadId] ||
    `${squadId.replace('Squad_Expedition_', '').replace('ExpeditionSquad', 'Squad ')} (${SQUAD_IDS_CONFIG[squadId] || '?'} héroes)`
  );
}

/**
 * Determina el tipo de expedición basado en su template ID
 */
export function getExpeditionType(expeditionTemplate: string): string {
  const template = expeditionTemplate.toLowerCase();

  // Buscar indicadores de tipo en el template ID
  if (template.includes('air_') || template.includes('_air_')) {
    return 'air';
  } else if (template.includes('sea_') || template.includes('_sea_')) {
    return 'sea';
  } else {
    return 'land'; // Por defecto es terrestre
  }
}

/**
 * Obtiene el tipo de squad basado en el ID
 */
export function getSquadType(squadId: string): string {
  // Por ahora todos los squads pueden ser usados para cualquier tipo
  // pero se puede expandir si hay restricciones específicas
  return 'universal';
}

/**
 * Verifica si un squad es compatible con un tipo de expedición
 */
export function isSquadCompatibleWithExpedition(squadId: string, expeditionType: string): boolean {
  // Por ahora, basándose en los archivos de traducciones, parece que:
  // - Expediciones de aire (Air_) pueden usar cualquier squad
  // - Expediciones de mar (Sea_) pueden usar cualquier squad
  // - Expediciones terrestres (sin prefijo) pueden usar cualquier squad

  // Todos los squads son compatibles con todos los tipos por ahora
  // Esta función se puede expandir si se encuentran restricciones específicas
  return true;
}

/**
 * Obtiene el primer Squad ID disponible y compatible (ordenado por capacidad)
 */
export async function getFirstAvailableSquadId(options: {
  accountId: string;
  accessToken: string;
  campaignData?: any;
  expeditionTemplate?: string | null;
}): Promise<{ success: boolean; squadId?: string | null; squadInfo?: SquadInfo | null; hasAvailable?: boolean; expeditionType?: string | null; error?: string }> {
  const result = await getAvailableExpeditionSquads(options);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  const firstAvailable = result.squads!.available[0] || null;
  const squadInfo = firstAvailable ? result.squads!.all.find((s) => s.squadId === firstAvailable) : null;

  return {
    success: true,
    squadId: firstAvailable,
    squadInfo: squadInfo,
    hasAvailable: firstAvailable !== null,
    expeditionType: result.expeditionType,
  };
}

/**
 * Obtiene todos los Squad IDs disponibles para una expedición específica
 */
export async function getCompatibleSquadsForExpedition(
  options: {
    accountId: string;
    accessToken: string;
    campaignData?: any;
  },
  expeditionTemplate: string
): Promise<AvailableSquadsResult> {
  const newOptions = { ...options, expeditionTemplate };
  return await getAvailableExpeditionSquads(newOptions);
}

/**
 * Obtiene los Squad IDs que están siendo usados por expediciones activas (legacy)
 */
export function getSquadsInUse(campaignData: any): Set<string> {
  const items = campaignData.items || {};
  const squadsInUse = new Set<string>();

  for (const [itemId, item] of Object.entries<any>(items)) {
    // Buscar expediciones que estén enviadas (tienen expedition_start_time)
    if (item.templateId && item.templateId.startsWith('Expedition:') && item.attributes?.expedition_start_time) {
      const squadId = item.attributes.expedition_squad_id;
      if (squadId) {
        squadsInUse.add(squadId);
        log.epic.info(`[getAvailableExpeditionSquads] 🚫 Squad ID en uso: ${squadId} (expedición: ${itemId})`);
      }
    }
  }

  return squadsInUse;
}
