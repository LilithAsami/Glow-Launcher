import { log } from '../../../../helpers/logger';
import { composeMCP } from '../../../../helpers/epic/utils/mcp';
import { obtenerSquadIdsEnUso, SQUAD_IDS_CONFIG, AVAILABLE_SQUAD_IDS } from '../helpers';

export interface SendExpeditionResult {
  success: boolean;
  data?: any;
  expeditionId?: string;
  squadId?: string;
  heroCount?: number;
  squadCapacity?: number;
  heroesUsed?: string[];
  availableSquads?: number;
  error?: string;
  errorCode?: string;
}

/**
 * Controller para enviar expediciones usando el sistema inteligente de Squad IDs
 */
export async function sendExpedition({
  expeditionId,
  expediciones = [],
  itemIds = [],
  accountId,
  accessToken,
}: {
  expeditionId: string;
  expediciones?: any[];
  itemIds?: string[];
  accountId: string;
  accessToken: string;
}): Promise<SendExpeditionResult> {
  log.epic.info(`[sendExpedition] [LAUNCH] Iniciando envío de expedición: ${expeditionId}`);

  try {
    // 1. Obtener Squad IDs en uso por expediciones activas
    const squadIdsEnUso = obtenerSquadIdsEnUso(expediciones);
    log.epic.info(`[sendExpedition] 🚫 Squad IDs en uso: ${Array.from(squadIdsEnUso).join(', ') || 'ninguno'}`);

    // 2. Obtener Squad IDs disponibles ordenados por capacidad (mayor a menor)
    const squadIdsDisponibles = AVAILABLE_SQUAD_IDS.filter((squadId) => !squadIdsEnUso.has(squadId));
    log.epic.info(`[sendExpedition] [OK] Squad IDs disponibles: ${squadIdsDisponibles.length}/${AVAILABLE_SQUAD_IDS.length}`);

    if (squadIdsDisponibles.length === 0) {
      return {
        success: false,
        error: 'No hay Squad IDs disponibles. Todos están en uso.',
        errorCode: 'no_available_squads',
        expeditionId,
      };
    }

    // 3. Intentar enviar con cada Squad ID disponible (de mayor a menor capacidad)
    for (const squadId of squadIdsDisponibles) {
      const squadCapacity = SQUAD_IDS_CONFIG[squadId];
      log.epic.info(`[sendExpedition] [RELOAD] Probando ${squadId} (capacidad: ${squadCapacity} héroes)`);

      // Intentar con diferentes cantidades de héroes (de mayor a menor)
      const maxHeroes = Math.min(itemIds.length, squadCapacity);

      for (let heroCount = maxHeroes; heroCount >= 1; heroCount--) {
        try {
          const heroesToUse = itemIds.slice(0, heroCount);
          const slotIndices = Array.from({ length: heroCount }, (_, i) => i);

          const body = {
            expeditionId,
            squadId,
            itemIds: heroesToUse,
            slotIndices,
          };

          log.epic.info(`[sendExpedition] [CLIPBOARD] Intentando con ${heroCount} héroes:`, JSON.stringify(body, null, 2));

          try {
            const result = await composeMCP({
              profile: 'campaign',
              operation: 'StartExpedition',
              accountId,
              accessToken,
              body,
            });

            log.epic.info(`[sendExpedition] [OK] Expedición enviada exitosamente con ${squadId} usando ${heroCount} héroes`);
            
            return {
              success: true,
              data: result,
              expeditionId,
              squadId,
              heroCount,
              squadCapacity,
              heroesUsed: heroesToUse,
            };
          } catch (mcpError: any) {
            const errorMsg = mcpError.errorData?.errorMessage || mcpError.message;
            log.epic.warn(`[sendExpedition] [ERROR] Intento con ${squadId} (${heroCount} héroes) falló: ${errorMsg}`);
            
            // Si es el último intento de este squad, continuar con el siguiente
            if (heroCount === 1) {
              log.epic.info(`[sendExpedition] [ERROR] Squad ${squadId} completamente fallido, probando siguiente...`);
            }
          }
        } catch (error: any) {
          // Error no relacionado con MCP
          log.epic.error(`[sendExpedition] [ERROR] Error inesperado: ${error.message}`);
        }
      }
    }

    // Si llegamos aquí, todos los Squad IDs fallaron
    return {
      success: false,
      error: 'Todos los Squad IDs disponibles fallaron',
      errorCode: 'all_squads_failed',
      expeditionId,
      availableSquads: squadIdsDisponibles.length,
      heroCount: itemIds.length,
    };
  } catch (error: any) {
    log.epic.error({ error: error.message }, `[sendExpedition] [ERROR] Error general enviando expedición ${expeditionId}`);

    return {
      success: false,
      error: error.message,
      errorCode: 'unknown_error',
      expeditionId,
    };
  }
}
