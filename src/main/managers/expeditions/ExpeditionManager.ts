import { log } from '../../../helpers/logger';
import { composeMCP } from '../../../helpers/epic/utils/mcp';
import {
  getCampaignData,
  getOccupiedHeroes,
  selectBestHeroes,
  obtenerSquadIdsEnUso,
  SQUAD_IDS_CONFIG,
  AVAILABLE_SQUAD_IDS,
} from './helpers';
import { sendExpedition } from './controllers/sendExpedition';
import { collectExpedition } from './controllers/collectExpedition';
import { abandonExpedition } from './controllers/abandonExpedition';
import { refreshExpeditions } from './controllers/RefreshExpeditions';

export interface ClaimResourcesResult {
  success: boolean;
  data?: any;
  result?: any;
  claimed?: number;
  claimedResourceId?: string;
  error?: string;
  errorCode?: string;
}

export interface RefreshExpeditionsResult {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
  errorCode?: string;
}

export interface SendExpeditionsResult {
  success: boolean;
  sent?: number; // Mantener para compatibilidad
  failed?: number; // Mantener para compatibilidad
  summary?: {
    totalSent: number;
    totalFailed: number;
  };
  sentExpeditions?: any[];
  failedExpeditions?: any[];
  error?: string;
  errorCode?: string;
}

export interface ExpeditionInfo {
  itemId: string;
  id?: string;
  templateId: string;
  attributes: any;
  name?: string;
  powerObjective?: number;
  targetPower?: number;
  maxTargetPower?: number;
  power?: number;
  duration?: number;
  rewardType?: string;
  criteria?: string[];
  isSent?: boolean;
  squadId?: string;
}

export interface HeroWithRequirement {
  itemId: string;
  templateId: string;
  level: number;
  tier: number;
  rarity: string;
  power: number;
  heroType: string;
  isRequired?: boolean;
}

/**
 * Manager principal para el sistema completo de expediciones de Fortnite Save the World
 */
class ExpeditionManager {
  public name: string;
  public version: string;

  constructor() {
    this.name = 'ExpeditionManager';
    this.version = '1.0.0';
  }

  /**
   * Reclama recursos collectados (tokens de expedición) - SE DEBE LLAMAR ANTES DE CUALQUIER OPERACIÓN
   */
  async claimCollectedResources({
    accountId,
    accessToken,
    campaignData,
  }: {
    accountId: string;
    accessToken: string;
    campaignData: any;
  }): Promise<ClaimResourcesResult> {
    log.epic.info(`[ExpeditionManager] 🪙 RECLAMANDO recursos collectados para: ${accountId.substring(0, 8)}...`);

    try {
      // Buscar el ID del token de expedición
      const items = campaignData.items || {};
      let collectedResourceId: string | null = null;

      for (const [itemId, item] of Object.entries<any>(items)) {
        if (item.templateId === 'CollectedResource:expedition_token') {
          collectedResourceId = itemId;
          break;
        }
      }

      if (!collectedResourceId) {
        log.epic.info(`[ExpeditionManager] [INFO] No hay recursos de expedición para reclamar`);
        return {
          success: true,
          claimed: 0,
        };
      }

      // Hacer el MCP ClaimCollectedResources
      const mcpResult = await composeMCP({
        profile: 'campaign',
        operation: 'ClaimCollectedResources',
        accountId,
        accessToken,
        body: {
          collectorsToClaim: [collectedResourceId],
        },
      });

      log.epic.info(`[ExpeditionManager] [OK] Recursos collectados reclamados exitosamente`);

      return {
        success: true,
        result: mcpResult,
        claimedResourceId: collectedResourceId,
        claimed: 1,
      };
    } catch (error: any) {
      log.epic.error({ error: error.message }, '[ExpeditionManager] [ERROR] Error reclamando recursos collectados');
      return {
        success: false,
        error: error.message,
        errorCode: 'claim_resources_error',
      };
    }
  }

  /**
   * Refresca las expediciones - SE DEBE LLAMAR PRIMERO ANTES DE CUALQUIER OPERACIÓN
   */
  async refreshExpeditions({
    accountId,
    accessToken,
  }: {
    accountId: string;
    accessToken: string;
  }): Promise<RefreshExpeditionsResult> {
    log.epic.info(`[ExpeditionManager] [RELOAD] REFRESCANDO expediciones para: ${accountId.substring(0, 8)}... (SIEMPRE PRIMERO)`);

    try {
      const result = await refreshExpeditions({ accountId, accessToken });

      if (result.success) {
        log.epic.info(`[ExpeditionManager] [OK] Expediciones refrescadas correctamente`);
      } else {
        log.epic.error({ error: result.error }, '[ExpeditionManager] [ERROR] Error en refrescado');
      }

      return result;
    } catch (error: any) {
      log.epic.error({ error: error.message }, '[ExpeditionManager] [ERROR] Error refrescando expediciones');
      return {
        success: false,
        error: error.message,
        errorCode: 'refresh_error',
      };
    }
  }

  /**
   * Envía expediciones del tipo especificado
   */
  async sendExpeditionsByType({
    accountId,
    accessToken,
    expeditionTypes = [],
    maxExpeditionsToSend = 1,
  }: {
    accountId: string;
    accessToken: string;
    expeditionTypes?: string[];
    maxExpeditionsToSend?: number;
  }): Promise<SendExpeditionsResult> {
    log.epic.info(`[ExpeditionSenderManager] [LAUNCH] Iniciando envío de expediciones para tipos: ${expeditionTypes.join(', ')}`);

    try {
      // 1. PRIMERO: Obtener datos de campaña
      log.epic.info(`[ExpeditionManager] 📋 Paso 1: Obteniendo datos de campaña...`);
      const campaignResult = await getCampaignData({ accountId, accessToken, forceRefresh: true });
      if (!campaignResult.success) {
        return { success: false, error: campaignResult.error, errorCode: campaignResult.errorCode };
      }

      const campaignData = campaignResult.data;

      // 2. SEGUNDO: Reclamar recursos collectados (antes de refrescar)
      log.epic.info(`[ExpeditionManager] 🪙 Paso 2: Reclamando recursos collectados...`);
      const claimResult = await this.claimCollectedResources({ accountId, accessToken, campaignData });
      if (!claimResult.success) {
        log.epic.warn(`[ExpeditionManager] [WARN] No se pudieron reclamar recursos, continuando...`);
      }

      // 3. TERCERO: Refrescar expediciones (obligatorio)
      log.epic.info(`[ExpeditionManager] [RELOAD] Paso 3: Refrescando expediciones antes de enviar...`);
      const refreshResult = await this.refreshExpeditions({ accountId, accessToken });
      if (!refreshResult.success) {
        return { success: false, error: refreshResult.error, errorCode: refreshResult.errorCode };
      }

      // 4. Verificar límite de expediciones enviadas (máximo 6)
      const currentSentExpeditions = this.getSentExpeditions(campaignData);
      const currentSentCount = currentSentExpeditions.length;

      log.epic.info(`[ExpeditionManager] [CHART] Expediciones actualmente enviadas: ${currentSentCount}/6`);

      if (currentSentCount >= 6) {
        log.epic.warn(`[ExpeditionManager] [WARN] Límite de expediciones alcanzado (6/6), no se pueden enviar más`);
        return {
          success: false,
          error: 'Límite de expediciones alcanzado (6/6)',
          errorCode: 'expedition_limit_reached',
          sent: 0,
          failed: 0,
        };
      }

      const slotsDisponibles = 6 - currentSentCount;
      const maxToSend = Math.min(maxExpeditionsToSend, slotsDisponibles);
      log.epic.info(`[ExpeditionManager] [OK] Slots disponibles: ${slotsDisponibles}/6, intentando enviar: ${maxToSend}`);

      // 5. Extraer todas las expediciones
      const allExpeditions = this.getExpeditionsFromCampaignData(campaignData);
      log.epic.info(`[ExpeditionSenderManager] [SEARCH] Total de expediciones encontradas: ${allExpeditions.length}`);

      // 6. Obtener expediciones activas
      const activeExpeditions = this.getActiveExpeditions(campaignData);
      log.epic.info(`[ExpeditionSenderManager] [SEARCH] Expediciones activas: ${activeExpeditions.length}`);

      // 7. Filtrar expediciones disponibles (no enviadas)
      const availableExpeditions = allExpeditions.filter((exp) => !exp.attributes.expedition_start_time);
      log.epic.info(`[ExpeditionSenderManager] [SEARCH] Expediciones disponibles (no enviadas): ${availableExpeditions.length}`);

      // 8. Filtrar por tipos
      let filteredExpeditions = this.filterExpeditionsByType(availableExpeditions, expeditionTypes);
      log.epic.info(`[ExpeditionSenderManager] [FILTER] Expediciones filtradas por tipo: ${filteredExpeditions.length}`);

      if (filteredExpeditions.length === 0) {
        log.epic.warn(`[ExpeditionSenderManager] [WARN] No hay expediciones disponibles de los tipos solicitados`);
        return {
          success: true,
          sent: 0,
          failed: 0,
          summary: {
            totalSent: 0,
            totalFailed: 0,
          },
          sentExpeditions: [],
          failedExpeditions: [],
        };
      }

      // 9. Ordenar por poder objetivo
      filteredExpeditions = this.sortExpeditionsByPower(filteredExpeditions);

      // 10. Obtener héroes ocupados
      const occupiedResult = await getOccupiedHeroes({ accountId, accessToken, campaignData });
      if (!occupiedResult.success) {
        return { success: false, error: occupiedResult.error, errorCode: occupiedResult.errorCode };
      }

      const occupiedHeroIds = occupiedResult.occupiedHeroIds!;
      log.epic.info(`[ExpeditionSenderManager] [CHART] Héroes ocupados: ${occupiedHeroIds.size}`);

      // 11. Obtener Squad IDs en uso (DEBE usar getSentExpeditions para incluir completadas no recolectadas)
      const expeditionsInUse = this.getSentExpeditions(campaignData);
      const squadIdsEnUso = obtenerSquadIdsEnUso(expeditionsInUse);
      const squadIdsDisponibles = AVAILABLE_SQUAD_IDS.filter((squadId) => !squadIdsEnUso.has(squadId));
      log.epic.info(`[ExpeditionSenderManager] [OK] Squad IDs disponibles: ${squadIdsDisponibles.length}/${AVAILABLE_SQUAD_IDS.length}`);

      if (squadIdsDisponibles.length === 0) {
        log.epic.warn(`[ExpeditionSenderManager] [WARN] No hay Squad IDs disponibles`);
        return {
          success: false,
          error: 'No hay Squad IDs disponibles',
          errorCode: 'no_available_squads',
          sent: 0,
          failed: 0,
          summary: {
            totalSent: 0,
            totalFailed: 0,
          },
        };
      }

      // 12. Enviar expediciones
      const sentExpeditions: any[] = [];
      const failedExpeditions: any[] = [];
      let expeditionsSent = 0;

      for (const expedition of filteredExpeditions) {
        if (expeditionsSent >= maxToSend) {
          log.epic.info(`[ExpeditionSenderManager] [OK] Límite de envíos alcanzado (${maxToSend})`);
          break;
        }

        try {
          // Obtener mejores héroes para esta expedición (pasando Set actualizado)
          const heroesResult = await this.getBestHeroesForExpedition({
            accountId,
            accessToken,
            campaignData,
            expeditionCriteria: expedition.criteria || [],
            maxHeroes: 5,
            occupiedHeroIds, // Pasar el Set actualizado
          });

          if (!heroesResult.success || !heroesResult.heroes || heroesResult.heroes.length === 0) {
            log.epic.warn(`[ExpeditionSenderManager] [WARN] No hay héroes disponibles para ${expedition.templateId}`);
            failedExpeditions.push({
              ...expedition,
              error: 'No hay héroes disponibles',
            });
            continue;
          }

          const heroIds = heroesResult.heroes.map((h: any) => h.itemId);

          // Intentar enviar la expedición
          const sendResult = await this.attemptSendExpedition({
            expedition,
            heroes: heroIds,
            squadIdsDisponibles,
            accountId,
            accessToken,
          });

          if (sendResult.success) {
            sentExpeditions.push({
              ...expedition,
              heroesUsed: heroIds.length,
              selectedHeroes: heroesResult.heroes,
              squadId: sendResult.squadId,
            });
            expeditionsSent++;
            log.epic.info(
              `[ExpeditionSenderManager] [OK] Expedición enviada: ${expedition.templateId} (${heroIds.length} héroes, ${sendResult.squadId})`
            );

            // Marcar héroes como ocupados para próximas iteraciones
            heroIds.forEach((heroId) => occupiedHeroIds.add(heroId));
            log.epic.info(`[ExpeditionSenderManager] [RELOAD] Héroes marcados como ocupados: ${heroIds.length}, total ocupados: ${occupiedHeroIds.size}`);

            // Actualizar Squad IDs en uso
            if (sendResult.squadId) {
              squadIdsEnUso.add(sendResult.squadId);
              const index = squadIdsDisponibles.indexOf(sendResult.squadId);
              if (index > -1) {
                squadIdsDisponibles.splice(index, 1);
              }
            }
          } else {
            failedExpeditions.push({
              ...expedition,
              error: sendResult.error,
            });
            log.epic.error({ error: sendResult.error }, `[ExpeditionSenderManager] [ERROR] Falló envío de ${expedition.templateId}`);
          }
        } catch (error: any) {
          failedExpeditions.push({
            ...expedition,
            error: error.message,
          });
          log.epic.error({ error: error.message }, `[ExpeditionSenderManager] [ERROR] Error enviando expedición`);
        }
      }

      log.epic.info(`[ExpeditionSenderManager] [OK] Proceso completado: ${sentExpeditions.length} enviadas, ${failedExpeditions.length} fallidas`);

      return {
        success: true,
        sent: sentExpeditions.length,
        failed: failedExpeditions.length,
        summary: {
          totalSent: sentExpeditions.length,
          totalFailed: failedExpeditions.length,
        },
        sentExpeditions,
        failedExpeditions,
      };
    } catch (error: any) {
      log.epic.error({ error: error.message }, '[ExpeditionSenderManager] [ERROR] Error general en envío de expediciones');
      return {
        success: false,
        error: error.message,
        errorCode: 'unknown_error',
      };
    }
  }

  /**
   * Obtiene los mejores héroes para una expedición específica
   */
  async getBestHeroesForExpedition({
    accountId,
    accessToken,
    campaignData,
    expeditionCriteria,
    maxHeroes,
    occupiedHeroIds = null,
  }: {
    accountId: string;
    accessToken: string;
    campaignData: any;
    expeditionCriteria: string[];
    maxHeroes: number;
    occupiedHeroIds?: Set<string> | null;
  }): Promise<{ success: boolean; heroes?: any[]; error?: string }> {
    try {
      const heroesResult = await selectBestHeroes({
        accountId,
        accessToken,
        campaignData,
        maxHeroes,
        expeditionCriteria: [],
        occupiedHeroIds, // Pasar el Set de héroes ocupados
      });

      if (!heroesResult.success || !heroesResult.heroes) {
        return {
          success: false,
          error: heroesResult.error || 'No se pudieron obtener héroes',
        };
      }

      // Si hay criterios, filtrar
      let selectedHeroes = heroesResult.heroes;
      if (expeditionCriteria && expeditionCriteria.length > 0) {
        selectedHeroes = this.filterHeroesByCriteria(heroesResult.heroes, expeditionCriteria);
      }

      return {
        success: true,
        heroes: selectedHeroes,
      };
    } catch (error: any) {
      log.epic.error({ error: error.message }, '[getBestHeroesForExpedition] Error obteniendo héroes');
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Filtra héroes por criterios específicos de expedición respetando cantidades exactas de cada tipo
   */
  filterHeroesByCriteria(heroes: any[], criteria: string[]): any[] {
    if (!criteria || criteria.length === 0) {
      return heroes;
    }

    log.epic.info(`[ExpeditionManager] [WRENCH] Aplicando criterios exactos: ${criteria.join(', ')}`);

    // 1. Contar cuántos de cada tipo se requieren
    const requiredTypes: Record<string, number> = {};
    criteria.forEach((requirement) => {
      const typeName = this.mapRequirementToType(requirement);
      requiredTypes[typeName] = (requiredTypes[typeName] || 0) + 1;
    });

    log.epic.info(`[ExpeditionManager] [CHART] Tipos requeridos:`, requiredTypes);

    // 2. Separar héroes por tipo
    const heroesByType: Record<string, any[]> = {
      commando: heroes.filter((h) => h.heroType.toLowerCase() === 'soldier'),
      soldier: heroes.filter((h) => h.heroType.toLowerCase() === 'soldier'),
      ninja: heroes.filter((h) => h.heroType.toLowerCase() === 'ninja'),
      constructor: heroes.filter((h) => h.heroType.toLowerCase() === 'constructor'),
      outlander: heroes.filter((h) => h.heroType.toLowerCase() === 'outlander'),
    };

    // Ordenar cada tipo por nivel (mayor a menor)
    Object.keys(heroesByType).forEach((type) => {
      heroesByType[type].sort((a, b) => (b.level || 0) - (a.level || 0));
    });

    // 3. Seleccionar exactamente los héroes requeridos por tipo
    const selectedHeroes: any[] = [];
    const usedHeroIds = new Set<string>();

    for (const [typeName, requiredCount] of Object.entries(requiredTypes)) {
      const availableHeroes = heroesByType[typeName] || [];
      const toSelect = Math.min(requiredCount, availableHeroes.length);

      for (let i = 0; i < toSelect; i++) {
        const hero = availableHeroes[i];
        if (hero && !usedHeroIds.has(hero.itemId)) {
          selectedHeroes.push({
            ...hero,
            isRequired: true,
          });
          usedHeroIds.add(hero.itemId);
        }
      }

      if (toSelect < requiredCount) {
        log.epic.warn(
          `[ExpeditionManager] [WARN] Faltan ${requiredCount - toSelect} héroes de tipo ${typeName} (requeridos: ${requiredCount}, disponibles: ${availableHeroes.length})`
        );
      }
    }

    // 4. Completar con los mejores héroes disponibles restantes (hasta máximo 5)
    const remainingSlots = 5 - selectedHeroes.length;
    if (remainingSlots > 0) {
      const remainingHeroes = heroes
        .filter((h) => !usedHeroIds.has(h.itemId))
        .sort((a, b) => (b.level || 0) - (a.level || 0))
        .slice(0, remainingSlots);

      remainingHeroes.forEach((hero) => {
        selectedHeroes.push({
          ...hero,
          isRequired: false,
        });
      });

      log.epic.info(`[ExpeditionManager] [OK] Añadidos ${remainingHeroes.length} héroes adicionales para completar slots`);
    }

    log.epic.info(
      `[ExpeditionManager] 🏁 Total seleccionados: ${selectedHeroes.length} (${selectedHeroes.filter((h) => h.isRequired).length} requeridos + ${selectedHeroes.filter((h) => !h.isRequired).length} adicionales)`
    );

    return selectedHeroes;
  }

  /**
   * Mapea los nombres de requerimientos a tipos de héroe
   */
  mapRequirementToType(requirement: string): string {
    const mapping: Record<string, string> = {
      commando: 'commando',
      soldier: 'soldier',
      ninja: 'ninja',
      constructor: 'constructor',
      outlander: 'outlander',
    };

    return mapping[requirement.toLowerCase()] || requirement.toLowerCase();
  }

  /**
   * Intenta enviar una expedición con los Squad IDs disponibles
   */
  async attemptSendExpedition({
    expedition,
    heroes,
    squadIdsDisponibles,
    accountId,
    accessToken,
  }: {
    expedition: ExpeditionInfo;
    heroes: string[];
    squadIdsDisponibles: string[];
    accountId: string;
    accessToken: string;
  }): Promise<any> {
    log.epic.info(`[ExpeditionSenderManager] [RELOAD] Intentando enviar ${expedition.templateId} con ${heroes.length} héroes`);

    // Intentar con cada Squad ID disponible (ordenados por capacidad)
    for (const squadId of squadIdsDisponibles) {
      const capacity = SQUAD_IDS_CONFIG[squadId];
      const heroesToUse = heroes.slice(0, capacity);

      log.epic.info(`[ExpeditionSenderManager] [CLIPBOARD] Probando ${squadId} (capacidad: ${capacity}, usando: ${heroesToUse.length} héroes)`);

      const result = await sendExpedition({
        expeditionId: expedition.itemId,
        expediciones: [],
        itemIds: heroesToUse,
        accountId,
        accessToken,
      });

      if (result.success) {
        log.epic.info(`[ExpeditionSenderManager] [OK] Enviada con ${squadId}`);
        return {
          success: true,
          squadId,
          heroCount: heroesToUse.length,
        };
      } else {
        log.epic.warn(`[ExpeditionSenderManager] [WARN] Falló con ${squadId}: ${result.error}`);
      }
    }

    return {
      success: false,
      error: 'Todos los Squad IDs disponibles fallaron',
      errorCode: 'all_squads_failed',
      attemptedSquads: squadIdsDisponibles.length,
    };
  }

  /**
   * Obtiene los tipos de expedición disponibles (por recompensas)
   */
  getAvailableExpeditionTypes(expeditions: ExpeditionInfo[]): string[] {
    const types = new Set<string>();

    expeditions.forEach((exp) => {
      if (exp.rewardType && exp.rewardType !== 'Unknown') {
        types.add(exp.rewardType);
      }
    });

    return Array.from(types);
  }

  /**
   * Extrae todas las expediciones del campaignData
   */
  getExpeditionsFromCampaignData(campaignData: any): ExpeditionInfo[] {
    const items = campaignData.items || {};
    const expeditions: ExpeditionInfo[] = [];

    for (const [itemId, item] of Object.entries<any>(items)) {
      if (!item.templateId?.startsWith('Expedition:')) continue;

      const attributes = item.attributes || {};
      const templateId = item.templateId;

      expeditions.push({
        itemId,
        id: itemId,
        templateId,
        attributes,
        name: templateId.replace('Expedition:expedition_', '').replace(/_/g, ' '),
        powerObjective: attributes.expedition_target_power || 0,
        targetPower: attributes.expedition_target_power || 0,
        maxTargetPower: attributes.expedition_max_target_power || 0,
        power: attributes.expedition_max_target_power || 0,
        duration: attributes.expedition_duration_seconds || 0,
        rewardType: this.getRewardTypeFromTemplate(templateId),
        criteria: attributes.expedition_criteria?.RequiredTags || [],
        isSent: !!attributes.expedition_start_time,
        squadId: attributes.expedition_squad_id || null,
      });
    }

    return expeditions;
  }

  /**
   * Filtra expediciones por tipo de recompensa
   */
  filterExpeditionsByType(expeditions: ExpeditionInfo[], types: string[]): ExpeditionInfo[] {
    if (!types || types.length === 0) {
      return expeditions;
    }

    log.epic.info(`[ExpeditionManager] [FILTER] Filtrando ${expeditions.length} expediciones por tipos: ${types.join(', ')}`);

    // Log de tipos de recompensa disponibles
    const rewardTypesFound = new Set<string>();
    expeditions.forEach((exp) => {
      if (exp.rewardType) {
        rewardTypesFound.add(exp.rewardType);
      }
    });
    log.epic.info(`[ExpeditionManager] [FILTER] Tipos de recompensa disponibles: ${Array.from(rewardTypesFound).join(', ')}`);

    const filtered = expeditions.filter((expedition) => {
      const rewardType = expedition.rewardType;
      if (!rewardType) return false;

      for (const type of types) {
        if (rewardType.toLowerCase() === type.toLowerCase()) {
          return true;
        }
      }

      return false;
    });

    log.epic.info(`[ExpeditionManager] [FILTER] Resultados del filtrado: ${filtered.length} expediciones`);
    return filtered;
  }

  /**
   * Ordena expediciones por poder objetivo (mayor a menor)
   */
  sortExpeditionsByPower(expeditions: ExpeditionInfo[]): ExpeditionInfo[] {
    return expeditions.sort((a, b) => {
      const powerA = a.powerObjective || 0;
      const powerB = b.powerObjective || 0;
      return powerB - powerA;
    });
  }

  /**
   * Obtiene expediciones activas (enviadas pero no completadas aún)
   */
  getActiveExpeditions(campaignData: any): any[] {
    const items = campaignData.items || {};
    const activeExpeditions: any[] = [];
    const currentTime = new Date();

    for (const [itemId, item] of Object.entries<any>(items)) {
      if (!item.templateId?.startsWith('Expedition:')) continue;

      const attributes = item.attributes || {};
      const startTime = attributes.expedition_start_time;
      const endTime = attributes.expedition_end_time;

      // Activa = enviada pero aún no completada
      if (startTime && endTime && new Date(endTime) > currentTime) {
        activeExpeditions.push({
          itemId,
          id: itemId,
          templateId: item.templateId,
          attributes,
          isSent: true,
          squadId: attributes.expedition_squad_id,
        });
      }
    }

    log.epic.info(`[ExpeditionManager] [SEARCH] getActiveExpeditions encontró: ${activeExpeditions.length} expediciones activas`);
    return activeExpeditions;
  }

  /**
   * Obtiene expediciones enviadas del campaignData (activas + completadas)
   */
  getSentExpeditions(campaignData: any): any[] {
    const items = campaignData.items || {};
    const sentExpeditions: any[] = [];

    for (const [itemId, item] of Object.entries<any>(items)) {
      if (!item.templateId?.startsWith('Expedition:')) continue;

      const attributes = item.attributes || {};
      const startTime = attributes.expedition_start_time;
      const endTime = attributes.expedition_end_time;

      // Incluye tanto expediciones activas como completadas (ambas ocupan squad slots)
      if (startTime && endTime) {
        sentExpeditions.push({
          itemId,
          id: itemId,
          templateId: item.templateId,
          attributes,
          isSent: true,
          squadId: attributes.expedition_squad_id,
        });
      }
    }

    log.epic.info(
      `[ExpeditionManager] [SEARCH] getSentExpeditions encontró: ${sentExpeditions.length} expediciones ocupando squad slots (activas + completadas no recolectadas)`
    );

    sentExpeditions.forEach((exp, index) => {
      const timeRemaining = this.formatTimeRemaining(exp.attributes.expedition_end_time);
      log.epic.info(`  ${index + 1}. ${exp.templateId} - ${timeRemaining} - Squad: ${exp.squadId || 'N/A'}`);
    });

    return sentExpeditions;
  }

  /**
   * Obtiene expediciones completadas del campaignData
   */
  getCompletedExpeditions(campaignData: any): any[] {
    const items = campaignData.items || {};
    const completedExpeditions: any[] = [];
    const currentTime = new Date();

    for (const [itemId, item] of Object.entries<any>(items)) {
      if (!item.templateId?.startsWith('Expedition:')) continue;

      const attributes = item.attributes || {};
      const startTime = attributes.expedition_start_time;
      const endTime = attributes.expedition_end_time;

      // Una expedición está completada si:
      // 1. Tiene startTime (fue enviada)
      // 2. Tiene endTime
      // 3. endTime <= tiempo actual
      if (startTime && endTime && new Date(endTime) <= currentTime) {
        completedExpeditions.push({
          itemId,
          id: itemId,
          templateId: item.templateId,
          attributes,
        });
      }
    }

    log.epic.info(`[ExpeditionManager] [SEARCH] getCompletedExpeditions encontró: ${completedExpeditions.length} expediciones completadas`);
    return completedExpeditions;
  }

  /**
   * Formatea el tiempo restante para mostrar
   */
  formatTimeRemaining(endTime: string | null): string {
    if (!endTime) return 'N/A';

    const now = new Date();
    const end = new Date(endTime);
    const diffMs = end.getTime() - now.getTime();

    if (diffMs <= 0) return 'Completada';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Abandona (cancela) expediciones enviadas
   */
  async abandonExpeditions({
    accountId,
    accessToken,
    expeditionIds = [],
  }: {
    accountId: string;
    accessToken: string;
    expeditionIds?: string[];
  }): Promise<any> {
    log.epic.info(`[ExpeditionManager] [ERROR] Abandonando expediciones para: ${accountId.substring(0, 8)}...`);

    try {
      const campaignResult = await getCampaignData({ accountId, accessToken });
      if (!campaignResult.success) {
        return { success: false, error: campaignResult.error };
      }

      const sentExpeditions = this.getSentExpeditions(campaignResult.data);

      let toAbandon = sentExpeditions;
      if (expeditionIds.length > 0) {
        toAbandon = sentExpeditions.filter((exp) => expeditionIds.includes(exp.itemId));
      }

      const abandoned: any[] = [];
      const failed: any[] = [];

      for (const expedition of toAbandon) {
        try {
          const result = await abandonExpedition({
            expeditionId: expedition.itemId,
            accountId,
            accessToken,
          });

          if (result.success) {
            abandoned.push(expedition);
          } else {
            failed.push({ ...expedition, error: result.error });
          }
        } catch (error: any) {
          failed.push({ ...expedition, error: error.message });
        }
      }

      return {
        success: true,
        abandoned: abandoned.length,
        failed: failed.length,
        abandonedExpeditions: abandoned,
        failedExpeditions: failed,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Collecta (recoge) expediciones completadas
   */
  async collectExpeditions({
    accountId,
    accessToken,
    expeditionIds = [],
  }: {
    accountId: string;
    accessToken: string;
    expeditionIds?: string[];
  }): Promise<any> {
    log.epic.info(`[ExpeditionManager] 📦 Collectando expediciones para: ${accountId.substring(0, 8)}...`);

    try {
      const campaignResult = await getCampaignData({ accountId, accessToken });
      if (!campaignResult.success) {
        return { success: false, error: campaignResult.error };
      }

      const completedExpeditions = this.getCompletedExpeditions(campaignResult.data);

      let toCollect = completedExpeditions;
      if (expeditionIds.length > 0) {
        toCollect = completedExpeditions.filter((exp) => expeditionIds.includes(exp.itemId));
      }

      const collected: any[] = [];
      const failed: any[] = [];

      for (const expedition of toCollect) {
        try {
          const result = await collectExpedition({
            expeditionTemplate: expedition.templateId,
            expeditionId: expedition.itemId,
            accountId,
            accessToken,
          });

          if (result.success) {
            collected.push({
              ...expedition,
              expeditionSuccess: result.expeditionSuccess,
              rewards: result.rewards,
            });
          } else {
            failed.push({ ...expedition, error: result.error });
          }
        } catch (error: any) {
          failed.push({ ...expedition, error: error.message });
        }
      }

      return {
        success: true,
        collected: collected.length,
        failed: failed.length,
        collectedExpeditions: collected,
        failedExpeditions: failed,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Obtiene el tipo de recompensa desde el template ID
   */
  private getRewardTypeFromTemplate(templateId: string): string {
    const lowerTemplate = templateId.toLowerCase();

    // Heroes
    if (lowerTemplate.includes('_warparty_')) return 'Heroes';

    // Survivors (múltiples patrones)
    if (lowerTemplate.includes('survivorscouting')) return 'Survivors';
    if (lowerTemplate.includes('peoplerun')) return 'Survivors';
    if (lowerTemplate.includes('_managers_')) return 'Survivors';
    if (lowerTemplate.includes('_rescue_')) return 'Survivors';

    // Supplies
    if (lowerTemplate.includes('supplyrun')) return 'Supplies';
    if (lowerTemplate.includes('craftingrun')) return 'Supplies';

    // Resources
    if (lowerTemplate.includes('resourcerun')) return 'Resources';
    if (lowerTemplate.includes('titheresource')) return 'Resources';
    if (lowerTemplate.includes('choppingwood')) return 'Resources';
    if (lowerTemplate.includes('miningore')) return 'Resources';

    // Traps
    if (lowerTemplate.includes('traprun')) return 'Traps';
    if (lowerTemplate.includes('craftingingredients')) return 'Traps';

    // Weapons
    if (lowerTemplate.includes('_weapons_')) return 'Weapons';

    return 'Unknown';
  }

  /**
   * Información del manager
   */
  getInfo(): any {
    return {
      name: this.name,
      version: this.version,
      capabilities: [
        'claimCollectedResources (AUTOMÁTICO en todas las funciones)',
        'refreshExpeditions (AUTOMÁTICO en todas las funciones)',
        'sendExpeditionsByType',
        'abandonExpeditions',
        'collectExpeditions',
      ],
      supportedTypes: ['Heroes', 'Survivors', 'Supplies', 'Resources', 'Traps', 'Weapons'],
      squadConfig: SQUAD_IDS_CONFIG,
      description: 'Manager principal completo para expediciones de Fortnite Save the World',
    };
  }
}

// Crear instancia singleton
const expeditionManager = new ExpeditionManager();

export { ExpeditionManager };
export default expeditionManager;
