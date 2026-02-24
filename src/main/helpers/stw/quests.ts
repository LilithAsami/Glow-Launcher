import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';
import dailysJson from '../../utils/map/dailys.json';
import guiaJson from '../../utils/map/guia.json';

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

  // Try dailys.json first
  const entry = dailysDb.Items?.[fullKey];
  if (entry?.name) {
    const name = typeof entry.name === 'string' ? entry.name : (entry.name[lang] ?? entry.name['en'] ?? entry.name['es']);
    if (name) return name;
  }

  // Try guia.json
  if (guiaDb[fullKey]) {
    const g = guiaDb[fullKey];
    const name = g[lang] ?? g['en'] ?? g['es'];
    if (name) return name;
  }

  // Fallback: prettify the raw template key
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

  // Prettify fallback
  const parts = itemType.split(':');
  return parts[parts.length - 1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Quest interfaces ───────────────────────────────────────────────────────────
export interface QuestObjective {
  key: string;
  current: number;
  max: number | null;
}

export interface QuestInfo {
  /** MCP item GUID (for reroll) */
  itemId: string;
  templateId: string;
  /** Raw quest key (e.g. daily_destroybears) */
  questKey: string;
  /** Category: Dailies, Wargames, Endurance, Weekly Mythic, Others */
  category: 'Dailies' | 'Wargames' | 'Endurance' | 'Weekly Mythic' | 'Others';
  /** Translated display name */
  name: string;
  /** Quest state: Active, Claimed, etc. */
  state: string;
  /** Objectives with progress */
  objectives: QuestObjective[];
  /** Whether the quest can be rerolled */
  canReroll: boolean;
}

export interface QuestsResult {
  success: boolean;
  quests?: QuestInfo[];
  error?: string;
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

    const isDaily = raw.startsWith('daily_');
    const isWargames = raw.startsWith('wargames_');
    const isEndurance = raw.startsWith('endurancedaily_');
    const isMythicWeekly = raw.startsWith('stw_stormkinghard_weekly');

    if (!isDaily && !isWargames && !isEndurance && !isMythicWeekly) continue;

    let category: QuestInfo['category'];
    let name: string;
    let canReroll = false;

    if (isDaily) {
      category = 'Dailies';
      name = translateQuestName(raw, lang);
      canReroll = true;
    } else if (isWargames) {
      category = 'Wargames';
      if (raw === 'wargames_completedailyquest') {
        name = lang === 'es' ? 'Completar diarias de Wargames' : 'Complete Wargames Dailies';
      } else {
        const suffix = raw.replace('wargames_dailyquest_', '').replace(/_/g, ' ');
        name = `Wargames: ${suffix.charAt(0).toUpperCase() + suffix.slice(1)}`;
      }
    } else if (isEndurance) {
      category = 'Endurance';
      const m = raw.match(/endurancedaily_(t\d+)_w(\d+)/);
      if (m) {
        const zone = ENDURANCE_ZONES[m[1]] ?? m[1].toUpperCase();
        const wave = parseInt(m[2], 10);
        name = `${zone} — Wave ${wave}`;
      } else {
        name = raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }
    } else {
      // Mythic weekly
      category = 'Weekly Mythic';
      name = lang === 'es' ? 'Rey de la Tormenta Mitico (Semanal)' : 'Mythic Storm King (Weekly)';
      canReroll = true;
    }

    // Parse objectives
    const objectives: QuestObjective[] = [];
    const dbEntry = DAILY_DB[raw];
    const completionEntries = Object.entries(attrs).filter(([k]) => k.startsWith('completion_'));

    for (const [key, val] of completionEntries) {
      const objKey = key.replace(/^completion_/, '');
      const current = Number(val) || 0;
      const max = dbEntry?.obj?.[objKey] ?? null;
      objectives.push({ key: objKey, current, max });
    }

    // If no completion_ entries but we know objectives from DB, show them as 0
    if (objectives.length === 0 && dbEntry) {
      for (const [objKey, maxVal] of Object.entries(dbEntry.obj)) {
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
    });
  }

  return quests;
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
    return { success: true, quests };
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
