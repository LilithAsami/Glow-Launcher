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
  claimed?: number;
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
  sent?: number;
  failed?: number;
  sentExpeditions?: any[];
  failedExpeditions?: any[];
  error?: string;
  errorCode?: string;
}

export interface ExpeditionInfo {
  itemId: string;
  templateId: string;
  attributes: any;
  name?: string;
  powerObjective?: number;
  targetPower?: number;
  duration?: number;
  rewardType?: string;
  criteria?: string[];
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
    campaignData?: any;
  }): Promise<ClaimResourcesResult> {
    log.epic.info(`[ExpeditionManager] 🪙 RECLAMANDO recursos collectados para: ${accountId.substring(0, 8)}...`);

    try {
      let campaign = campaignData;
      if (!campaign) {
        const result = await getCampaignData({ accountId, accessToken });
        if (!result.success) {
          return { success: false, error: result.error, errorCode: result.errorCode };
        }
        campaign = result.data;
      }

      // Buscar el ID del token de expedición
      const items = campaign.items || {};
      let collectedResourceId: string | null = null;

      for (const [itemId, item] of Object.entries<any>(items)) {
        if (item.templateId === 'CollectedResource:expedition_token') {
          collectedResourceId = itemId;
          break;
        }
      }

      if (!collectedResourceId) {
        log.epic.info('[ExpeditionManager] [INFO] No hay recursos de expedición para reclamar');
        return {
          success: true,
          claimed: 0,
        };
      }

      // Hacer el MCP ClaimCollectedResources
      const result = await composeMCP({
        profile: 'campaign',
        operation: 'ClaimCollectedResources',
        accountId,
        accessToken,
        body: {
          collectorsToClaim: [collectedResourceId]
        },
      });

      log.epic.info(`[ExpeditionManager] [OK] Recursos reclamados exitosamente`);

      return {
        success: true,
        data: result,
        claimed: 1,
      };
    } catch (error: any) {
      log.epic.error({ error: error.message }, '[ExpeditionManager] [ERROR] Error reclamando recursos');
      return {
        success: false,
        error: error.message,
        errorCode: 'unknown_error',
      };
    }
  }

  /**
   * Refresca las expediciones - SE DEBE LLAMAR PRIMERO ANTES DE CUALQUIER OPERACIÓN
   */
  async refreshExpeditions({ accountId, accessToken }: { accountId: string; accessToken: string }): Promise<RefreshExpeditionsResult> {
    log.epic.info(`[ExpeditionManager] [RELOAD] REFRESCANDO expediciones para: ${accountId.substring(0, 8)}... (SIEMPRE PRIMERO)`);

    try {
      const result = await refreshExpeditions({ accountId, accessToken });
      return result;
    } catch (error: any) {
      log.epic.error({ error: error.message }, '[ExpeditionManager] [ERROR] Error refrescando expediciones');
      return {
        success: false,
        error: error.message,
        errorCode: 'unknown_error',
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
      // 1. Obtener datos de campaña
      const campaignResult = await getCampaignData({ accountId, accessToken });
      if (!campaignResult.success) {
        return { success: false, error: campaignResult.error, errorCode: campaignResult.errorCode };
      }

      const campaignData = campaignResult.data;

      // 2. Extraer todas las expediciones
      const allExpeditions = this.getExpeditionsFromCampaignData(campaignData);
      log.epic.info(`[ExpeditionSenderManager] [SEARCH] Total de expediciones encontradas: ${allExpeditions.length}`);

      // 3. Obtener expediciones activas
      const activeExpeditions = this.getActiveExpeditions(campaignData);
      log.epic.info(`[ExpeditionSenderManager] [SEARCH] Expediciones activas: ${activeExpeditions.length}`);

      // 4. Filtrar expediciones disponibles
      const availableExpeditions = allExpeditions.filter((exp) => !exp.attributes.expedition_start_time);
      log.epic.info(`[ExpeditionSenderManager] [SEARCH] Expediciones disponibles (no enviadas): ${availableExpeditions.length}`);

      // 5. Filtrar por tipos
      let filteredExpeditions = this.filterExpeditionsByType(availableExpeditions, expeditionTypes);
      log.epic.info(`[ExpeditionSenderManager] [FILTER] Expediciones filtradas por tipo: ${filteredExpeditions.length}`);

      // 6. Ordenar por poder objetivo
      filteredExpeditions = this.sortExpeditionsByPower(filteredExpeditions);

      // 7. Obtener héroes ocupados
      const occupiedResult = await getOccupiedHeroes({ accountId, accessToken, campaignData });
      if (!occupiedResult.success) {
        return { success: false, error: occupiedResult.error, errorCode: occupiedResult.errorCode };
      }

      const occupiedHeroIds = occupiedResult.occupiedHeroIds!;
      log.epic.info(`[ExpeditionSenderManager] [CHART] Héroes ocupados: ${occupiedHeroIds.size}`);

      // 8. Obtener Squad IDs en uso
      const squadIdsEnUso = obtenerSquadIdsEnUso(activeExpeditions);
      const squadIdsDisponibles = AVAILABLE_SQUAD_IDS.filter((squadId) => !squadIdsEnUso.has(squadId));
      log.epic.info(`[ExpeditionSenderManager] [OK] Squad IDs disponibles: ${squadIdsDisponibles.length}/${AVAILABLE_SQUAD_IDS.length}`);

      if (squadIdsDisponibles.length === 0) {
        return {
          success: false,
          error: 'No hay Squad IDs disponibles. Todos los slots de expedición están en uso.',
          errorCode: 'no_available_squads',
        };
      }

      // 9. Enviar expediciones
      const sentExpeditions: any[] = [];
      const failedExpeditions: any[] = [];
      let expeditionsSent = 0;

      for (const expedition of filteredExpeditions) {
        if (expeditionsSent >= maxExpeditionsToSend) {
          log.epic.info(`[ExpeditionSenderManager] [STOP] Límite de envíos alcanzado: ${maxExpeditionsToSend}`);
          break;
        }

        if (squadIdsDisponibles.length === 0) {
          log.epic.warn(`[ExpeditionSenderManager] [STOP] No quedan Squad IDs disponibles`);
          break;
        }

        try {
          // Seleccionar mejores héroes para esta expedición
          const heroesResult = await selectBestHeroes({
            accountId,
            accessToken,
            campaignData,
            maxHeroes: 5,
            expeditionCriteria: expedition.attributes.expedition_criteria?.RequiredTags || [],
          });

          if (!heroesResult.success || !heroesResult.heroes || heroesResult.heroes.length === 0) {
            log.epic.warn(`[ExpeditionSenderManager] [WARN] No hay héroes disponibles para expedición ${expedition.itemId}`);
            failedExpeditions.push({
              expeditionId: expedition.itemId,
              reason: 'no_heroes_available',
            });
            continue;
          }

          const heroIds = heroesResult.heroes.map((h) => h.itemId);

          // Intentar enviar
          const sendResult = await sendExpedition({
            expeditionId: expedition.itemId,
            expediciones: activeExpeditions,
            itemIds: heroIds,
            accountId,
            accessToken,
          });

          if (sendResult.success) {
            expeditionsSent++;
            sentExpeditions.push({
              expeditionId: expedition.itemId,
              expeditionName: expedition.name,
              squadId: sendResult.squadId,
              heroCount: sendResult.heroCount,
            });
            log.epic.info(
              `[ExpeditionSenderManager] [OK] Expedición ${expedition.name} enviada (${expeditionsSent}/${maxExpeditionsToSend})`
            );

            // Remover el squad ID usado de disponibles
            const usedSquadIdx = squadIdsDisponibles.indexOf(sendResult.squadId!);
            if (usedSquadIdx !== -1) {
              squadIdsDisponibles.splice(usedSquadIdx, 1);
            }
          } else {
            failedExpeditions.push({
              expeditionId: expedition.itemId,
              reason: sendResult.error,
              errorCode: sendResult.errorCode,
            });
          }
        } catch (error: any) {
          log.epic.error({ error: error.message }, `[ExpeditionSenderManager] [ERROR] Error enviando expedición ${expedition.itemId}`);
          failedExpeditions.push({
            expeditionId: expedition.itemId,
            reason: error.message,
          });
        }
      }

      log.epic.info(`[ExpeditionSenderManager] [OK] Proceso completado: ${sentExpeditions.length} enviadas, ${failedExpeditions.length} fallidas`);

      return {
        success: true,
        sent: sentExpeditions.length,
        failed: failedExpeditions.length,
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
        templateId,
        attributes,
        name: templateId.replace('Expedition:expedition_', '').replace(/_/g, ' '),
        powerObjective: attributes.expedition_target_power || 0,
        targetPower: attributes.expedition_target_power || 0,
        duration: attributes.expedition_duration_seconds || 0,
        rewardType: this.getRewardTypeFromTemplate(templateId),
        criteria: attributes.expedition_criteria?.RequiredTags || [],
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
    expeditions.forEach(exp => {
      if (exp.rewardType) {
        rewardTypesFound.add(exp.rewardType);
      }
    });
    log.epic.info(`[ExpeditionManager] [FILTER] Tipos de recompensa disponibles: ${Array.from(rewardTypesFound).join(', ')}`);

    const filtered = expeditions.filter((expedition) => {
      const rewardType = expedition.rewardType;
      if (!rewardType) return false;

      for (const type of types) {
        if (rewardType.toLowerCase().includes(type.toLowerCase())) {
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
          id: itemId,
          itemId,
          templateId: item.templateId,
          attributes,
          endTime,
          startTime,
        });
      }
    }

    log.epic.info(`[ExpeditionManager] [SEARCH] getActiveExpeditions encontró: ${activeExpeditions.length} expediciones activas`);
    return activeExpeditions;
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
          id: itemId,
          itemId,
          templateId: item.templateId,
          attributes,
          endTime,
          startTime,
        });
      }
    }

    log.epic.info(`[ExpeditionManager] [SEARCH] getSentExpeditions encontró: ${sentExpeditions.length} expediciones ocupando squad slots (activas + completadas no recolectadas)`);
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
      // 1. Tiene start_time (fue enviada)
      // 2. Tiene end_time
      // 3. El end_time ya pasó
      if (startTime && endTime && new Date(endTime) <= currentTime) {
        completedExpeditions.push({
          id: itemId,
          itemId,
          templateId: item.templateId,
          attributes,
          endTime,
          startTime,
        });
      }
    }

    log.epic.info(`[ExpeditionManager] [SEARCH] getCompletedExpeditions encontró: ${completedExpeditions.length} expediciones completadas`);
    return completedExpeditions;
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
      features: ['refresh', 'send', 'collect', 'abandon', 'claim'],
    };
  }
}

// Crear instancia singleton
const expeditionManager = new ExpeditionManager();

export { ExpeditionManager };
export default expeditionManager;
