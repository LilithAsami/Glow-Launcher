import { log } from '../../../../helpers/logger';
import { composeMCP } from '../../../../helpers/epic/utils/mcp';

export interface CollectExpeditionResult {
  success: boolean;
  data?: any;
  expeditionId?: string;
  expeditionTemplate?: string;
  expeditionSuccess?: boolean;
  rewards?: any[];
  notifications?: any[];
  expeditionNotification?: any;
  error?: string;
  errorCode?: string;
}

/**
 * Controller para recolectar expediciones completadas
 */
export async function collectExpedition({
  expeditionTemplate,
  expeditionId,
  accountId,
  accessToken,
}: {
  expeditionTemplate: string;
  expeditionId: string;
  accountId: string;
  accessToken: string;
}): Promise<CollectExpeditionResult> {
  log.epic.info(`[collectExpedition] 📦 Recolectando expedición: ${expeditionTemplate} (${expeditionId})`);

  try {
    const body = {
      expeditionTemplate,
      expeditionId,
    };

    log.epic.info(`[collectExpedition] [CLIPBOARD] Body:`, JSON.stringify(body, null, 2));

    const result = await composeMCP({
      profile: 'campaign',
      operation: 'CollectExpedition',
      accountId,
      accessToken,
      body,
    });

    const notifications = result.notifications || [];
    const expeditionNotification = notifications.find((n: any) => n.type === 'expeditionResult');

    const expeditionSuccess = expeditionNotification?.success || false;
    const rewards = expeditionNotification?.rewards || [];

    log.epic.info(`[collectExpedition] [DART] Resultado: ${expeditionSuccess ? 'ÉXITO' : 'FALLO'} - ${rewards.length} recompensas`);

    return {
      success: true,
      data: result,
      expeditionId,
      expeditionTemplate,
      expeditionSuccess,
      rewards,
      notifications,
      expeditionNotification,
    };
  } catch (error: any) {
    log.epic.error({ error: error.message }, `[collectExpedition] [ERROR] Error recolectando expedición ${expeditionTemplate}`);
    return {
      success: false,
      error: error.message,
      errorCode: 'unknown_error',
      expeditionId,
      expeditionTemplate,
    };
  }
}
