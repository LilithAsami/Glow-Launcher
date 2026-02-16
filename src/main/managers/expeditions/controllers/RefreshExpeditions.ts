import { log } from '../../../../helpers/logger';
import { Endpoints } from '../../../../helpers/endpoints';
import { composeMCP } from '../../../../helpers/epic/utils/mcp';

export interface RefreshExpeditionsResult {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Controller para refrescar expediciones expiradas
 */
export async function refreshExpeditions({
  accountId,
  accessToken,
}: {
  accountId: string;
  accessToken: string;
}): Promise<RefreshExpeditionsResult> {
  log.epic.info(`[refreshExpeditions] [RELOAD] Refrescando expediciones expiradas para cuenta: ${accountId.substring(0, 8)}...`);

  try {
    const body = {};

    log.epic.info(`[refreshExpeditions] [CLIPBOARD] Body:`, JSON.stringify(body, null, 2));

    const result = await composeMCP({
      profile: 'campaign',
      operation: 'RefreshExpeditions',
      accountId,
      accessToken,
      body,
    });

    log.epic.info(`[refreshExpeditions] [OK] Expediciones refrescadas exitosamente`);

    return {
      success: true,
      data: result,
      message: 'Expediciones refrescadas correctamente',
    };
  } catch (error: any) {
    log.epic.error({ error: error.message }, '[refreshExpeditions] [ERROR] Error refrescando expediciones');
    return {
      success: false,
      error: error.message,
      errorCode: 'unknown_error',
    };
  }
}
