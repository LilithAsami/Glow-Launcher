import { log } from '../../../../helpers/logger';
import { composeMCP } from '../../../../helpers/epic/utils/mcp';

export interface AbandonExpeditionResult {
  success: boolean;
  data?: any;
  expeditionId?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Controller para abandonar/cancelar expediciones enviadas
 */
export async function abandonExpedition({
  expeditionId,
  accountId,
  accessToken,
}: {
  expeditionId: string;
  accountId: string;
  accessToken: string;
}): Promise<AbandonExpeditionResult> {
  log.epic.info(`[abandonExpedition] [ERROR] Abandonando expedición: ${expeditionId}`);

  try {
    const body = {
      expeditionId,
    };

    log.epic.info(`[abandonExpedition] [CLIPBOARD] Body:`, JSON.stringify(body, null, 2));

    const result = await composeMCP({
      profile: 'campaign',
      operation: 'AbandonExpedition',
      accountId,
      accessToken,
      body,
    });

    log.epic.info(`[abandonExpedition] [OK] Expedición abandonada exitosamente: ${expeditionId}`);

    return {
      success: true,
      data: result,
      expeditionId,
    };
  } catch (error: any) {
    log.epic.error({ error: error.message }, `[abandonExpedition] [ERROR] Error abandonando expedición ${expeditionId}`);
    return {
      success: false,
      error: error.message,
      errorCode: 'unknown_error',
      expeditionId,
    };
  }
}
