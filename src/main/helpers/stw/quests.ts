import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import { getResourceIcon } from './alerts';
import type { Storage } from '../../storage';
import type { AccountsData, QuestInfo, QuestObjective, QuestRewardItem, QuestsResult } from '../../../shared/types';
import dailysJson from '../../utils/map/dailys.json';
import guiaJson from '../../utils/map/guia.json';
import questCatalog from '../../utils/map/Quests/quest_catalog.json';
import questRewardsData from '../../utils/map/Quests/QuestRewards.json';

// ── Quest catalog + rewards lookup ──────────────────────────────────────────────
const catalog: Record<string, { category: string; image: string | null; fileName: string; objectives?: Record<string, number> }> = questCatalog as any;

// Build rewards index: questTemplateIdLower → reward entries
const rewardsRows: Record<string, any> = (questRewardsData as any)[0]?.Rows ?? (questRewardsData as any).Rows ?? {};
const rewardsIndex = new Map<string, { templateId: string; quantity: number }[]>();
for (const row of Object.values(rewardsRows)) {
  const r = row as any;
  if (!r.QuestTemplateId || !r.TemplateId) continue;
  if (r.Hidden) continue;
  const key = r.QuestTemplateId.toLowerCase();
  const arr = rewardsIndex.get(key) ?? [];
  arr.push({ templateId: r.TemplateId, quantity: r.Quantity || 1 });
  rewardsIndex.set(key, arr);
}

// ── Daily quest database (embedded from _quest.js) ────────────────────────────
const DAILY_DB: Record<string, { obj: Record<string, number> }> = {
  daily_destroyarcademachines:        { obj: { quest_reactive_destroyarcade_v4: 3 } },
  daily_destroybears:                 { obj: { quest_reactive_destroybear_v3: 8 } },
  daily_destroyfiretrucks:            { obj: { quest_reactive_destroyfiretruck_v2: 3 } },
  daily_destroygnomes:                { obj: { quest_reactive_destroygnome_v2: 3 } },
  daily_destroypropanetanks:          { obj: { quest_reactive_destroypropane_v2: 10 } },
  daily_destroyseesaws:               { obj: { quest_reactive_destroyseesaw_v3: 6 } },
  daily_destroyserverracks:           { obj: { quest_reactive_destroyserverrack_v2: 4 } },
  daily_destroytransformers:          { obj: { quest_reactive_destroytransform_v3: 2 } },
  daily_destroytvs:                   { obj: { quest_reactive_destroytv_v2: 20 } },
  daily_discovery_industriallocations:{ obj: { quest_reactive_discoverconstruction_v2: 3 } },
  daily_discovery_rurallocations:     { obj: { quest_reactive_discoverruinedhouses_v2: 3 } },
  daily_discovery_shelters:           { obj: { quest_reactive_discovershelter_v2: 4 } },
  daily_discovery_suburbanlocations:  { obj: { quest_reactive_discoverfastfood_v2: 10 } },
  daily_discovery_urbanlocations:     { obj: { quest_reactive_discoveremergencybuildings_v2: 8 } },
  daily_explorezones:                 { obj: { complete_exploration_1: 3 } },
  daily_high_priority:                { obj: { questcollect_survivoritemdata: 50 } },
  daily_huskextermination_anyhero:    { obj: { kill_husk: 500 } },
  daily_huskextermination_constructor:{ obj: { kill_husk_constructor_v2: 300 } },
  daily_huskextermination_melee:      { obj: { kill_husk_melee: 300 } },
  daily_huskextermination_ninja:      { obj: { kill_husk_ninja_v2: 300 } },
  daily_huskextermination_outlander:  { obj: { kill_husk_outlander_v2: 300 } },
  daily_huskextermination_ranged_assault: { obj: { kill_husk_assault: 300 } },
  daily_huskextermination_ranged_pistol:  { obj: { kill_husk_pistol: 300 } },
  daily_huskextermination_ranged_shotgun: { obj: { kill_husk_shotgun: 300 } },
  daily_huskextermination_ranged_smg:     { obj: { kill_husk_smg: 300 } },
  daily_huskextermination_ranged_sniper:  { obj: { kill_husk_sniper: 300 } },
  daily_huskextermination_soldier:    { obj: { kill_husk_commando_v2: 300 } },
  daily_huskextermination_trap:       { obj: { kill_husk_trap: 150 } },
  daily_mission_buildradar:           { obj: { complete_buildradar_1_diff2: 4 } },
  daily_mission_specialist_anyhero_1: { obj: { complete_primary: 3 } },
  daily_mission_specialist_anyhero_2: { obj: { complete_primary: 5 } },
  daily_mission_specialist_constructor:{ obj: { complete_constructor: 3 } },
  daily_mission_specialist_ninja:     { obj: { complete_ninja: 3 } },
  daily_mission_specialist_outlander: { obj: { complete_outlander: 3 } },
  daily_mission_specialist_soldier:   { obj: { complete_commando: 3 } },
  daily_partyof50:                    { obj: { daily_partyof50: 25 } },
  daily_safes:                        { obj: { interact_safe: 1 } },
  daily_treasurechests:               { obj: { interact_treasurechest: 5 } },
};

const ENDURANCE_ZONES: Record<string, string> = {
  t01: 'Stonewood',
  t02: 'Plankerton',
  t03: 'Canny Valley',
  t04: 'Twine Peaks',
};

// ── Translation databases (imported as JSON modules) ────────────────────────────
const dailysDb: any = dailysJson;
const guiaDb: any = guiaJson;

// ── Helper: get main account ────────────────────────────────────────────────────
async function getMainAccount(storage: Storage) {
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  return main || null;
}

// ── Translate quest name ───────────────────────────────────────────────────────
function translateQuestName(templateKey: string, lang: string): string {
  const fullKey = `Quest:${templateKey}`;
  const entry = dailysDb.Items?.[fullKey];
  if (entry?.name) {
    const name = typeof entry.name === 'string' ? entry.name : (entry.name[lang] ?? entry.name['en'] ?? entry.name['es']);
    if (name) return name;
  }
  if (guiaDb[fullKey]) {
    const g = guiaDb[fullKey];
    const name = g[lang] ?? g['en'] ?? g['es'];
    if (name) return name;
  }
  return templateKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Translate reward name ──────────────────────────────────────────────────────
function translateRewardName(itemType: string, lang: string): string {
  const entry = dailysDb.Items?.[itemType];
  if (entry?.name) {
    const n = entry.name;
    if (typeof n === 'string') return n;
    if (typeof n === 'object' && !n.PassedConditionItem) return n[lang] ?? n['en'] ?? n['es'] ?? itemType;
    if (n.PassedConditionItem) return n[lang]?.PassedConditionItem ?? n['en']?.PassedConditionItem ?? itemType;
  }
  if (guiaDb[itemType]) {
    const g = guiaDb[itemType];
    return g[lang] ?? g['en'] ?? g['es'] ?? itemType;
  }
  const parts = itemType.split(':');
  return parts[parts.length - 1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Get rewards for a quest ──────────────────────────────────────────────────
function getQuestRewards(templateId: string, lang: string): QuestRewardItem[] {
  const rewards = rewardsIndex.get(templateId.toLowerCase());
  if (!rewards) return [];
  return rewards.map(r => ({
    templateId: r.templateId,
    name: translateRewardName(r.templateId, lang),
    quantity: r.quantity,
    icon: getResourceIcon(r.templateId, ''),
  }));
}

// ── Resolve quest category from catalog ──────────────────────────────────────
function resolveCategory(raw: string): string {
  const entry = catalog[raw];
  if (entry) return entry.category;
  // Fallback heuristic
  if (raw.startsWith('daily_')) return 'Daily';
  if (raw.startsWith('wargames_')) return 'Events';
  if (raw.startsWith('endurancedaily_')) return 'Events';
  if (raw.startsWith('stw_stormkinghard_weekly')) return 'WeeklyQuest';
  if (raw.startsWith('stw_stormkinghard_')) return 'StormKingHardmode';
  if (raw.startsWith('s11_holdfast')) return 'Events';
  if (raw.startsWith('weeklyquest_')) return 'WeeklyQuest';
  if (raw.includes('stonewood')) return 'Stonewood';
  if (raw.includes('plankerton')) return 'Plankerton';
  if (raw.includes('cannyvalley')) return 'CannyValley';
  if (raw.includes('twinepeaks')) return 'TwinePeaks';
  if (raw.includes('challenge_')) return 'Challenges';
  if (raw.includes('achievement_')) return 'Achievements';
  if (raw.includes('phoenix') || raw.includes('ventures_')) return 'Phoenix';
  return 'Others';
}

// ── Resolve quest image from catalog ──────────────────────────────────────────
function resolveImage(raw: string): string | null {
  const entry = catalog[raw];
  return entry?.image ?? null;
}

// ── Parse and categorize quests ─────────────────────────────────────────────────
function parseQuests(items: Record<string, any>, lang: string): QuestInfo[] {
  const quests: QuestInfo[] = [];

  for (const [itemId, item] of Object.entries(items)) {
    const tid = (item.templateId || '') as string;
    if (!tid.toLowerCase().startsWith('quest:')) continue;

    const raw = tid.replace(/^Quest:/i, '').toLowerCase();
    const attrs = item.attributes || {};
    const state = attrs.quest_state || 'Active';

    // Skip claimed quests
    if (state === 'Claimed') continue;

    const category = resolveCategory(raw);
    const name = translateQuestName(raw, lang);
    const canReroll = raw.startsWith('daily_') || raw.startsWith('stw_stormkinghard_weekly');
    const image = resolveImage(raw);
    const rewards = getQuestRewards(tid, lang);

    // Parse objectives
    const objectives: QuestObjective[] = [];
    const dbEntry = DAILY_DB[raw];
    const catalogEntry = catalog[raw];
    const completionEntries = Object.entries(attrs).filter(([k]) => k.startsWith('completion_'));

    for (const [key, val] of completionEntries) {
      const objKey = key.replace(/^completion_/, '');
      const current = Number(val) || 0;
      // Lookup max: first DAILY_DB, then catalog objectives
      const max = dbEntry?.obj?.[objKey] ?? catalogEntry?.objectives?.[objKey] ?? null;
      objectives.push({ key: objKey, current, max });
    }

    if (objectives.length === 0 && dbEntry) {
      for (const [objKey, maxVal] of Object.entries(dbEntry.obj)) {
        objectives.push({ key: objKey, current: 0, max: maxVal });
      }
    } else if (objectives.length === 0 && catalogEntry?.objectives) {
      // No completion_ attributes, but catalog has objectives — show them with 0 progress
      for (const [objKey, maxVal] of Object.entries(catalogEntry.objectives)) {
        objectives.push({ key: objKey, current: 0, max: maxVal });
      }
    }

    quests.push({
      itemId,
      templateId: tid,
      questKey: raw,
      category,
      name,
      state,
      objectives,
      canReroll,
      image,
      rewards,
    });
  }

  return quests;
}

// ── Extract dailyQuestRerolls from profile ────────────────────────────────────
function extractDailyRerolls(profileData: any): number {
  const attrs = profileData?.profileChanges?.[0]?.profile?.stats?.attributes;
  return attrs?.quest_manager?.dailyQuestRerolls ?? 0;
}

// ── Public: fetch all quests for the main account ──────────────────────────────
export async function getQuests(storage: Storage, lang: string = 'es'): Promise<QuestsResult> {
  try {
    const main = await getMainAccount(storage);
    if (!main) return { success: false, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, error: 'Failed to refresh token' };

    const endpoint = `${Endpoints.MCP}/${main.accountId}/client/QueryProfile?profileId=campaign&rvn=-1`;

    const { data } = await authenticatedRequest(
      storage,
      main.accountId,
      token,
      async (t: string) => {
        const res = await axios.post(endpoint, {}, {
          headers: {
            Authorization: `Bearer ${t}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        });
        return res.data;
      },
    );

    const items = data?.profileChanges?.[0]?.profile?.items;
    if (!items) return { success: false, error: 'No profile items found' };

    const quests = parseQuests(items, lang);
    const dailyRerolls = extractDailyRerolls(data);
    return { success: true, quests, dailyRerolls };
  } catch (error: any) {
    const msg = error?.response?.data?.errorMessage
      || error?.response?.data?.message
      || error?.message
      || 'Unknown error';
    return { success: false, error: msg };
  }
}

// ── Public: reroll a daily quest ───────────────────────────────────────────────
export async function rerollQuest(storage: Storage, questId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const main = await getMainAccount(storage);
    if (!main) return { success: false, error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, error: 'Failed to refresh token' };

    const endpoint = `${Endpoints.MCP}/${main.accountId}/client/FortRerollDailyQuest?profileId=campaign&rvn=-1`;

    await authenticatedRequest(
      storage,
      main.accountId,
      token,
      async (t: string) => {
        const res = await axios.post(endpoint, { questId }, {
          headers: {
            Authorization: `Bearer ${t}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        });
        return res.data;
      },
    );

    return { success: true };
  } catch (error: any) {
    const msg = error?.response?.data?.errorMessage
      || error?.response?.data?.message
      || error?.message
      || 'Unknown error';
    return { success: false, error: msg };
  }
}
