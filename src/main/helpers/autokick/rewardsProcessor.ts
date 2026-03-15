/**
 * AutoKick STW Rewards Processor
 *
 * Procesa todas las recompensas de STW siguiendo el flujo EXACTO del bot:
 * 1. QueryProfile ANTES
 * 2. Detectar cofres válidos (match_statistics o pack_source=ItemCache, excl _choice_) y quests completadas
 * 3. PARALELO:
 *    - OpenCardPackBatch (en batches de 10)
 *    - ClaimQuestReward (todas en paralelo)
 *    - ClaimDifficultyIncreaseRewards
 *    - ClaimMissionAlertRewards
 *    - ClaimCollectionBookRewards
 *    - ClaimEventRewards
 * 4. QueryProfile DESPUÉS
 * 5. Comparar perfiles → items con nombre traducido, icono y cantidad
 */

import { composeMCP } from '../../utils/mcp';
import { traducir, getResourceIcon } from '../stw/alerts';

// ── Types ────────────────────────────────────────────────────

export interface RewardData {
  name: string;
  quantity: number;
  icon: string | null;
  itemType: string;
}

// ── Item filters ─────────────────────────────────────────────

const REWARD_PREFIXES = [
  'AccountResource:',
  'Hero:',
  'Schematic:',
  'Worker:',
  'Defender:',
  'Currency:',
  'TeamPerk:',
  'Token:',
  'Alteration:',
  'CardPack:',
  'CollectedResource:',
];

const EXCLUDE_PATTERNS = [
  'quest:outpostquest',
  'quest:homebasequest',
];

function esItemRecompensa(templateId: string): boolean {
  if (!templateId) return false;
  const lower = templateId.toLowerCase();
  if (EXCLUDE_PATTERNS.some((e) => lower.includes(e))) return false;
  return REWARD_PREFIXES.some((p) => templateId.startsWith(p));
}

// ── Profile comparison ───────────────────────────────────────

function compararPerfiles(
  itemsBefore: Record<string, any>,
  itemsAfter: Record<string, any>,
): Record<string, RewardData> {
  const rewards: Record<string, RewardData> = {};

  for (const [guid, itemAfter] of Object.entries(itemsAfter)) {
    const templateId: string = itemAfter?.templateId || '';
    if (!esItemRecompensa(templateId)) continue;

    const qtyAfter: number = itemAfter?.quantity ?? 1;
    const itemBefore = itemsBefore[guid];
    const qtyBefore: number = itemBefore?.quantity ?? 0;

    // Only count if existed before AND quantity increased, OR brand new guid
    if (itemBefore && qtyAfter <= qtyBefore) continue;

    const diff = itemBefore ? qtyAfter - qtyBefore : qtyAfter;
    if (diff <= 0) continue;

    const name = traducir(templateId);
    const icon = getResourceIcon(templateId, name);

    if (rewards[templateId]) {
      rewards[templateId].quantity += diff;
    } else {
      rewards[templateId] = { name, quantity: diff, icon, itemType: templateId };
    }
  }

  return rewards;
}

// ── Main export ──────────────────────────────────────────────

export async function processSTWRewards(
  accountId: string,
  accessToken: string,
  displayName: string,
): Promise<Record<string, RewardData>> {
  try {
    // ────────────────────────────────────────────────────────
    // 1. QueryProfile ANTES
    // ────────────────────────────────────────────────────────
    const profileBefore = await composeMCP({
      profile: 'campaign',
      operation: 'QueryProfile',
      accountId,
      accessToken,
    });

    const itemsBefore: Record<string, any> =
      profileBefore.profileChanges?.[0]?.profile?.items ?? {};

    // ────────────────────────────────────────────────────────
    // 2. Detectar cofres válidos y quests completadas
    // ────────────────────────────────────────────────────────
    const validCardPacks: string[] = [];
    const completedQuests: string[] = [];

    for (const [guid, item] of Object.entries<any>(itemsBefore)) {
      const templateId: string = item?.templateId ?? '';
      const attrs = item?.attributes ?? {};

      // ── Filtrar items _choice_ (no se deben abrir) ──
      if (templateId.includes('_choice_')) continue;

      // ── CardPacks: SOLO abrir si tienen match_statistics o pack_source=ItemCache ──
      if (templateId.startsWith('CardPack:')) {
        const hasMatchStats = attrs.match_statistics !== undefined;
        const isItemCache = attrs.pack_source === 'ItemCache';
        if (hasMatchStats || isItemCache) {
          validCardPacks.push(guid);
        }
        continue;
      }

      // ── Quests completadas (state === 'Completed', NO 'Claimed') ──
      if (templateId.startsWith('Quest:') && attrs.quest_state === 'Completed') {
        completedQuests.push(guid);
      }
    }

    // ────────────────────────────────────────────────────────
    // 3. Ejecutar TODAS las operaciones en paralelo
    // ────────────────────────────────────────────────────────
    const operations: Promise<any>[] = [];

    // 3a. OpenCardPackBatch — en batches de 10 (exacto como el bot)
    if (validCardPacks.length > 0) {
      const BATCH_SIZE = 10;
      for (let i = 0; i < validCardPacks.length; i += BATCH_SIZE) {
        const batch = validCardPacks.slice(i, i + BATCH_SIZE);
        operations.push(
          composeMCP({
            profile: 'campaign',
            operation: 'OpenCardPackBatch',
            accountId,
            accessToken,
            body: { cardPackItemIds: batch },
          }).catch(() => null),
        );
      }
    }

    // 3b. ClaimQuestReward — TODAS en paralelo
    for (const questId of completedQuests) {
      operations.push(
        composeMCP({
          profile: 'campaign',
          operation: 'ClaimQuestReward',
          accountId,
          accessToken,
          body: { questId, selectedRewards: [], newQuestsData: {}, questDefinition: '' },
        }).catch(() => null),
      );
    }

    // 3c. Los 4 MCPs adicionales — TAMBIÉN en paralelo
    const claimOps = [
      'ClaimDifficultyIncreaseRewards',
      'ClaimMissionAlertRewards',
      'ClaimCollectionBookRewards',
      'ClaimEventRewards',
    ];
    for (const op of claimOps) {
      operations.push(
        composeMCP({
          profile: 'campaign',
          operation: op,
          accountId,
          accessToken,
        }).catch(() => null),
      );
    }

    // Ejecutar todo en paralelo
    await Promise.allSettled(operations);

    // ────────────────────────────────────────────────────────
    // 4. QueryProfile DESPUÉS
    // ────────────────────────────────────────────────────────
    const profileAfter = await composeMCP({
      profile: 'campaign',
      operation: 'QueryProfile',
      accountId,
      accessToken,
    });

    const itemsAfter: Record<string, any> =
      profileAfter.profileChanges?.[0]?.profile?.items ?? {};

    // ────────────────────────────────────────────────────────
    // 5. Comparar perfiles
    // ────────────────────────────────────────────────────────
    return compararPerfiles(itemsBefore, itemsAfter);
  } catch (error: any) {
    console.error(`[RewardsProcessor] ${displayName} error:`, error?.message);
    return {};
  }
}
