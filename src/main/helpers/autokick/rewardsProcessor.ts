/**
 * AutoKick STW Rewards Processor
 * Procesa todas las recompensas de STW siguiendo el flujo del bot
 */

import { composeMCP } from '../../utils/mcp';

export interface RewardData {
  name: string;
  quantity: number;
}

/**
 * Compara perfiles (antes/después) para detectar nuevos items
 */
function compararPerfiles(
  itemsAntes: Record<string, any>,
  itemsDespues: Record<string, any>,
  displayName: string
): Record<string, RewardData> {
  const rewards: Record<string, RewardData> = {};

  for (const [guid, itemData] of Object.entries(itemsDespues)) {
    const templateId = itemData?.templateId || '';
    const quantityAfter = itemData?.quantity || 1;

    if (!esItemRecompensa(templateId)) continue;

    const itemBefore = itemsAntes[guid];
    const quantityBefore = itemBefore?.quantity || 0;

    // Solo contar items nuevos o incrementados
    const diff = quantityAfter - quantityBefore;
    if (diff > 0) {
      // Usar templateId como nombre simple
      const name = templateId;

      if (rewards[name]) {
        rewards[name].quantity += diff;
      } else {
        rewards[name] = { name, quantity: diff };
      }
    }
  }

  return rewards;
}

/**
 * Verifica si un templateId es un item de recompensa
 */
function esItemRecompensa(templateId: string): boolean {
  if (!templateId) return false;
  
  const includeTypes = [
    'AccountResource:',
    'CardPack:',
    'Quest:',
    'Hero:',
    'Schematic:',
    'Worker:',
    'Defender:',
    'Currency:',
    'TeamPerk:',
    'Token:',
    'Alteration:',
  ];

  const excludeTypes = [
    'Quest:outpostquest',
    'Quest:homebasequest',
  ];

  if (excludeTypes.some(e => templateId.toLowerCase().includes(e.toLowerCase()))) {
    return false;
  }

  return includeTypes.some(i => templateId.startsWith(i));
}

/**
 * Procesa todas las recompensas de STW siguiendo el flujo EXACTO del bot
 * FLUJO (TODO EN PARALELO):
 * 1. QueryProfile ANTES
 * 2. Detectar cofres válidos y quests completadas
 * 3. PARALELO:
 *    - OpenCardPackBatch (en batches de 10)
 *    - ClaimQuestReward (todas en paralelo)
 *    - ClaimDifficultyIncreaseRewards
 *    - ClaimMissionAlertRewards
 *    - ClaimCollectionBookRewards
 *    - ClaimEventRewards
 * 4. QueryProfile DESPUÉS
 * 5. Comparar perfiles
 */
export async function processSTWRewards(
  accountId: string,
  accessToken: string,
  displayName: string
): Promise<Record<string, RewardData>> {
  try {
    // 1. Query profile ANTES
    const profileBefore = await composeMCP({
      profile: 'campaign',
      operation: 'QueryProfile',
      accountId,
      accessToken,
    });

    const itemsBefore = profileBefore.profileChanges?.[0]?.profile?.items || {};

    // 2. Detectar cofres y quests
    const validCardPacks: string[] = [];
    const completedQuests: string[] = [];

    for (const [guid, item] of Object.entries<any>(itemsBefore)) {
      const templateId = item?.templateId || '';

      // Cofres válidos
      if (templateId.startsWith('CardPack:') && !templateId.toLowerCase().includes('voucher')) {
        validCardPacks.push(guid);
      }

      // Quests completadas (quest_pool)
      if (templateId.startsWith('Quest:') && templateId.toLowerCase().includes('quest_pool')) {
        const questState = item?.attributes?.quest_state || '';
        if (questState.toLowerCase() === 'claimed') {
          completedQuests.push(guid);
        }
      }
    }

    // 3. Ejecutar operaciones en paralelo
    const operations: Promise<any>[] = [];

    // OpenCardPackBatch en batches de 10
    if (validCardPacks.length > 0) {
      for (let i = 0; i < validCardPacks.length; i += 10) {
        const batch = validCardPacks.slice(i, i + 10);
        operations.push(
          composeMCP({
            profile: 'campaign',
            operation: 'OpenCardPackBatch',
            accountId,
            accessToken,
            body: { cardPackItemIds: batch },
          }).catch(() => null)
        );
      }
    }

    // ClaimQuestReward (todas en paralelo)
    for (const questId of completedQuests) {
      operations.push(
        composeMCP({
          profile: 'campaign',
          operation: 'ClaimQuestReward',
          accountId,
          accessToken,
          body: {
            questId,
            selectedRewards: [],
            newQuestsData: {},
            questDefinition: '',
          },
        }).catch(() => null)
      );
    }

    // ClaimDifficultyIncreaseRewards
    operations.push(
      composeMCP({
        profile: 'campaign',
        operation: 'ClaimDifficultyIncreaseRewards',
        accountId,
        accessToken,
      }).catch(() => null)
    );

    // ClaimMissionAlertRewards
    operations.push(
      composeMCP({
        profile: 'campaign',
        operation: 'ClaimMissionAlertRewards',
        accountId,
        accessToken,
      }).catch(() => null)
    );

    // ClaimCollectionBookRewards
    operations.push(
      composeMCP({
        profile: 'campaign',
        operation: 'ClaimCollectionBookRewards',
        accountId,
        accessToken,
      }).catch(() => null)
    );

    // ClaimEventRewards (si aplica)
    operations.push(
      composeMCP({
        profile: 'campaign',
        operation: 'ClaimEventRewards',
        accountId,
        accessToken,
      }).catch(() => null)
    );

    await Promise.all(operations);

    // 4. Query profile DESPUÉS
    const profileAfter = await composeMCP({
      profile: 'campaign',
      operation: 'QueryProfile',
      accountId,
      accessToken,
    });

    const itemsAfter = profileAfter.profileChanges?.[0]?.profile?.items || {};

    // 5. Comparar perfiles
    const rewards = compararPerfiles(itemsBefore, itemsAfter, displayName);

    return rewards;
  } catch (error: any) {
    throw error;
  }
}
