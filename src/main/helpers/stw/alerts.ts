/**
 * STW Mission Alerts — fetches world info and processes missions.
 *
 * Adapted from Boton7.js to TypeScript for GLOW Launcher.
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type {
  AccountsData,
  AlertRewardItem,
  AlertModifier,
  ProcessedMission,
  ZoneMissions,
} from '../../../shared/types';

// Translation maps — loaded once from JSON
import esES from '../../utils/map/es-ES.json';
import guia from '../../utils/map/guia.json';

const esESMap = esES as Record<string, string>;
const guiaMap = guia as Record<string, string>;

// ── World info cache (per UTC day) ─────────────────────────
let _cachedResult: ZoneMissions[] | null = null;
let _cachedUTCDate: string | null = null;

function getUTCDateKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

// ── Translation ────────────────────────────────────────────

export function traducir(key: string): string {
  if (!key) return '';
  if (guiaMap[key]) return guiaMap[key];
  if (esESMap[key]) return esESMap[key];

  // Strip common prefixes as fallback
  if (key.startsWith('CardPack:')) return key.replace('CardPack:', '');
  if (key.startsWith('AccountResource:')) return key.replace('AccountResource:', '');
  if (key.startsWith('Alteration:')) return key.replace('Alteration:', '');
  if (key.startsWith('Token:')) return key.replace('Token:', '');
  if (key.startsWith('Quest:')) return key.replace('Quest:', '');
  return key;
}

// ── Mission name detection ─────────────────────────────────

const MISSION_PATTERNS: { patterns: string[]; name: string }[] = [
  { patterns: ['RtL', 'LtB', 'RideTheLightning', 'LaunchTheBalloon'], name: 'Ride the Lightning' },
  { patterns: ['RtD', 'RetrieveTheData'], name: 'Retrieve the Data' },
  { patterns: ['DtB'], name: 'Deliver the Bomb' },
  { patterns: ['1Gate', '1Gates', 'Cat1FtS'], name: 'Fight the Storm' },
  { patterns: ['2Gates'], name: 'Fight Category 2 Storm' },
  { patterns: ['3Gates'], name: 'Fight Category 3 Storm' },
  { patterns: ['4Gates'], name: 'Fight Category 4 Storm' },
  { patterns: ['DtE', 'DestroyTheEncampments'], name: 'Destroy the Encampments' },
  { patterns: ['BuildtheRadarGrid'], name: 'Build the Radar Grid' },
  { patterns: ['Resupply'], name: 'Resupply' },
  { patterns: ['EliminateAndCollect'], name: 'Eliminate and Collect' },
  { patterns: ['RtS'], name: 'Repair the Shelter' },
  { patterns: ['EtShelter', 'EtS_C'], name: 'Evacuate the Shelter' },
  { patterns: ['EtSurvivors', 'EvacuateTheSurvivors'], name: 'Rescue the Survivors' },
  { patterns: ['RefuelTheBase'], name: 'Refuel the Homebase' },
  { patterns: ['LtR'], name: 'Launch the Rocket' },
  { patterns: ['HTM'], name: 'Hunt the Titan' },
  { patterns: ['PvE'], name: 'Storm Shield Defense' },
  { patterns: ['StabilizeTheRift'], name: 'Stabilize the Rift' },
  { patterns: ['Mayday'], name: 'Hit the Road' },
  { patterns: ['FightTheGunslinger'], name: 'Fight the Gunslinger' },
];

function getMissionName(mission: any): string {
  const raw: string =
    mission.missionGenerator ||
    (mission.missionRewards?.tierGroupName) ||
    mission.missionGuid ||
    mission.missionName ||
    '';

  if (raw) {
    for (const m of MISSION_PATTERNS) {
      for (const p of m.patterns) {
        if (raw.includes(p)) return m.name;
      }
    }
  }

  // Fallback: try to extract suffix and look up in guia.json for English name
  if (raw) {
    // Try extracting the last meaningful part after the last underscore
    const parts = raw.split('_');
    for (let i = parts.length - 1; i >= 0; i--) {
      const suffix = parts[i];
      if (suffix && guiaMap[suffix]) return guiaMap[suffix];
    }
  }

  if (mission.missionGenerator) {
    const match = mission.missionGenerator.match(/MissionGen_[^.]+/);
    if (match) {
      const key = match[0];
      if (guiaMap[key]) return guiaMap[key];
      return traducir(key) || traducir(`Quest:${key}`) || key;
    }
  }
  if (mission.missionRewards?.tierGroupName) {
    const key = mission.missionRewards.tierGroupName;
    if (guiaMap[key]) return guiaMap[key];
    return traducir(key) || traducir(`Quest:${key}`) || key;
  }
  return 'Unknown Mission';
}

// ── Mission icon ───────────────────────────────────────────

function getMissionIcon(missionName: string): string {
  const n = missionName.toLowerCase();
  if (n.includes('ride the lightning')) return 'assets/icons/stw/world/rtl.png';
  if (n.includes('retrieve the data')) return 'assets/icons/stw/world/rtd.png';
  if (n.includes('deliver the bomb')) return 'assets/icons/stw/world/dtb.png';
  if (n.includes('destroy') && n.includes('encampment')) return 'assets/icons/stw/world/dte.png';
  if (n.includes('repair the shelter')) return 'assets/icons/stw/world/rts.png';
  if (n.includes('evacuate the shelter')) return 'assets/icons/stw/world/ets.png';
  if (n.includes('category 4')) return 'assets/icons/stw/world/atlas-c4.png';
  if (n.includes('category 3')) return 'assets/icons/stw/world/atlas-c3.png';
  if (n.includes('category 2')) return 'assets/icons/stw/world/atlas-c2.png';
  if (n.includes('fight the storm')) return 'assets/icons/stw/world/atlas.png';
  if (n.includes('radar')) return 'assets/icons/stw/world/radar.png';
  if (n.includes('rescue the survivor')) return 'assets/icons/stw/world/rescue.png';
  if (n.includes('refuel')) return 'assets/icons/stw/world/refuel.png';
  if (n.includes('resupply')) return 'assets/icons/stw/world/resupply.png';
  if (n.includes('eliminate and collect')) return 'assets/icons/stw/world/eac.png';
  if (n.includes('storm shield')) return 'assets/icons/stw/world/storm-shield.png';
  if (n.includes('hunt the titan') || n.includes('titan')) return 'assets/icons/stw/world/htm.png';
  if (n.includes('launch the rocket')) return 'assets/icons/stw/world/rocket.png';
  if (n.includes('stabilize the rift') || n.includes('hit the road') || n.includes('fight the gunslinger')) return 'assets/icons/stw/world/quest.png';
  return 'assets/icons/stw/world/quest.png';
}

function isQuestIcon(missionName: string): boolean {
  return getMissionIcon(missionName).includes('quest.png');
}

function isStormShield(missionName: string): boolean {
  const n = missionName.toLowerCase();
  return n.includes('storm shield') || n.includes('escudo antitormentas');
}

// ── Zone detection ─────────────────────────────────────────

function getGeographicZone(power: number, _missionName: string, _mission: any): string {
  if (power >= 1 && power <= 18) return 'Stonewood';
  if (power >= 19 && power <= 40) return 'Plankerton';
  if (power >= 41 && power <= 75) return 'Canny Valley';
  if (power >= 76 && power <= 160) return 'Twine Peaks';
  return 'Unknown Zone';
}

function getZone(
  power: number,
  rewardNames: string[],
  alertNames: string[],
  missionName: string,
  mission: any,
): string {
  // PRIORITY 1: V-Bucks
  const hasPavos = (arr: string[]) =>
    arr.some(
      (r) =>
        r.toLowerCase().includes('pavos') ||
        r.toLowerCase().includes('vbucks') ||
        r.toLowerCase().includes('currency_mtxswap'),
    );
  if (hasPavos(rewardNames) || hasPavos(alertNames)) return 'V-Bucks';

  // PRIORITY 2: Event/Campaign missions (uses quest.png icon)
  if (isQuestIcon(missionName)) return 'Events or Campaign';

  // PRIORITY 3: Ventures
  const hasVentures = (arr: string[]) =>
    arr.some((r) => r.toLowerCase().includes('aventura') || r.toLowerCase().includes('venture'));
  if (hasVentures(rewardNames) || hasVentures(alertNames)) return 'Ventures';

  // PRIORITY 4: Geographic zone by power
  return getGeographicZone(power, missionName, mission);
}

// ── Resource icon mapping ──────────────────────────────────

export function extractRarity(itemType: string): string | null {
  if (!itemType) return null;
  const rarityMatch = itemType.match(/_(vr|sr|er|r|uc|c)(?:_|$)/i);
  return rarityMatch ? rarityMatch[1].toLowerCase() : null;
}

const ACCOUNT_RESOURCE_ICONS: Record<string, string> = {
  currency_mtxswap: 'assets/icons/stw/resources/currency_mtxswap.png',
  heroxp: 'assets/icons/stw/resources/heroxp.png',
  personnelxp: 'assets/icons/stw/resources/personnelxp.png',
  schematicxp: 'assets/icons/stw/resources/schematicxp.png',
  phoenixxp: 'assets/icons/stw/resources/phoenixxp.png',
  phoenixxp_reward: 'assets/icons/stw/resources/phoenixxp.png',
  reagent_alteration_ele_fire: 'assets/icons/stw/resources/reagent_alteration_ele_fire.png',
  reagent_alteration_ele_nature: 'assets/icons/stw/resources/reagent_alteration_ele_nature.png',
  reagent_alteration_ele_water: 'assets/icons/stw/resources/reagent_alteration_ele_water.png',
  reagent_alteration_generic: 'assets/icons/stw/resources/reagent_alteration_generic.png',
  reagent_alteration_gameplay_generic: 'assets/icons/stw/resources/reagent_alteration_gameplay_generic.png',
  reagent_alteration_upgrade_sr: 'assets/icons/stw/resources/reagent_alteration_upgrade_sr.png',
  reagent_alteration_upgrade_vr: 'assets/icons/stw/resources/reagent_alteration_upgrade_vr.png',
  reagent_alteration_upgrade_r: 'assets/icons/stw/resources/reagent_alteration_upgrade_r.png',
  reagent_alteration_upgrade_uc: 'assets/icons/stw/resources/reagent_alteration_upgrade_uc.png',
  reagent_c_t01: 'assets/icons/stw/resources/reagent_c_t01.png',
  reagent_c_t02: 'assets/icons/stw/resources/reagent_c_t02.png',
  reagent_c_t03: 'assets/icons/stw/resources/reagent_c_t03.png',
  reagent_c_t04: 'assets/icons/stw/resources/reagent_c_t04.png',
  reagent_people: 'assets/icons/stw/resources/reagent_people.png',
  reagent_weapons: 'assets/icons/stw/resources/reagent_weapons.png',
  reagent_traps: 'assets/icons/stw/resources/reagent_traps.png',
  voucher_herobuyback: 'assets/icons/stw/resources/voucher_herobuyback.png',
  voucher_cardpack_bronze: 'assets/icons/stw/resources/voucher_cardpack_bronze.png',
  voucher_cardpack_jackpot: 'assets/icons/stw/resources/voucher_cardpack_jackpot.png',
  voucher_basicpack: 'assets/icons/stw/resources/voucher_basicpack.png',
  eventcurrency_scaling: 'assets/icons/stw/resources/eventcurrency_scaling.png',
  eventscaling: 'assets/icons/stw/resources/eventscaling.png',
  eventcurrency_adventure: 'assets/icons/stw/currency/eventcurrency_adventure.png',
  eventcurrency_snowballs: 'assets/icons/stw/currency/eventcurrency_snowballs.png',
  eventcurrency_candy: 'assets/icons/stw/currency/eventcurrency_candy.png',
  eventcurrency_spring: 'assets/icons/stw/currency/eventcurrency_spring.png',
  eventcurrency_summer: 'assets/icons/stw/currency/eventcurrency_summer.png',
  campaign_event_currency: 'assets/icons/stw/currency/campaign_event_currency.gif',
  currency_xrayllama: 'assets/icons/stw/resources/currency_xrayllama.png',
};

const INGREDIENT_ICONS: Record<string, string> = {
  reagent_ore_copper: 'assets/icons/stw/ingredients/copper.png',
  reagent_ore_silver: 'assets/icons/stw/ingredients/silver.png',
  reagent_ore_malachite: 'assets/icons/stw/ingredients/malachite.png',
  reagent_ore_obsidian: 'assets/icons/stw/ingredients/obsidian.png',
  reagent_ore_brightcore: 'assets/icons/stw/ingredients/brightcore.png',
  reagent_ore_shadowshard: 'assets/icons/stw/ingredients/shadowshard.png',
  reagent_ore_sunbeam: 'assets/icons/stw/ingredients/sunbeam.png',
  reagent_traps_duct_tape: 'assets/icons/stw/ingredients/duct_tape.png',
  reagent_sup_quartz: 'assets/icons/stw/ingredients/quartz.png',
};

export function getResourceIcon(itemType: string, translatedName: string): string | null {
  if (!itemType) return null;
  const tipo = itemType.toLowerCase();

  // AccountResource
  if (tipo.includes('accountresource:')) {
    const key = itemType.replace(/AccountResource:/i, '').toLowerCase();
    for (const [k, icon] of Object.entries(ACCOUNT_RESOURCE_ICONS)) {
      if (key.includes(k)) return icon;
    }
    // Generic XP fallback
    if (key.includes('xp')) return 'assets/icons/stw/resources/heroxp.png';
    return null;
  }

  // Ingredient
  if (tipo.includes('ingredient:')) {
    const key = itemType.replace(/Ingredient:/i, '').toLowerCase();
    for (const [k, icon] of Object.entries(INGREDIENT_ICONS)) {
      if (key.includes(k)) return icon;
    }
    return null;
  }

  // Worker (Survivor)
  if (tipo.includes('worker:')) {
    const rarity = extractRarity(itemType);
    if (tipo.includes('managersynergy') || tipo.includes('manager')) {
      // Lead survivor
      if (rarity) return `assets/icons/stw/resources/voucher_generic_manager_${rarity}.png`;
      return 'assets/icons/stw/resources/voucher_generic_manager_sr.png';
    }
    // Regular survivor
    if (rarity) return `assets/icons/stw/resources/voucher_generic_worker_${rarity}.png`;
    return 'assets/icons/stw/resources/voucher_generic_worker_sr.png';
  }

  // Hero
  if (tipo.includes('hero:')) {
    const rarity = extractRarity(itemType);
    if (rarity) return `assets/icons/stw/resources/voucher_generic_hero_${rarity}.png`;
    return 'assets/icons/stw/resources/voucher_generic_hero_sr.png';
  }

  // Schematic
  if (tipo.includes('schematic:')) {
    const rarity = extractRarity(itemType);
    // Traps
    if (tipo.includes('trap') || tipo.includes('ceiling') || tipo.includes('floor') || tipo.includes('wall')) {
      if (rarity) return `assets/icons/stw/resources/voucher_generic_trap_${rarity}.png`;
      return 'assets/icons/stw/resources/voucher_generic_trap_sr.png';
    }
    // Melee weapons
    if (tipo.includes('edged') || tipo.includes('blunt') || tipo.includes('piercing') || tipo.includes('melee')) {
      if (rarity) return `assets/icons/stw/resources/voucher_generic_melee_${rarity}.png`;
      return 'assets/icons/stw/resources/voucher_generic_melee_sr.png';
    }
    // Ranged weapons (default for schematics)
    if (rarity) return `assets/icons/stw/resources/voucher_generic_ranged_${rarity}.png`;
    return 'assets/icons/stw/resources/voucher_generic_ranged_sr.png';
  }

  // CardPack
  if (tipo.includes('cardpack:')) {
    if (tipo.includes('reagent_alteration_upgrade')) {
      const rarityMatch = tipo.match(/reagent_alteration_upgrade_(sr|vr|r|uc|c)/);
      if (rarityMatch) {
        return `assets/icons/stw/resources/reagent_alteration_upgrade_${rarityMatch[1]}.png`;
      }
    }
    if (tipo.includes('reagent_alteration_generic')) {
      return 'assets/icons/stw/resources/reagent_alteration_generic.png';
    }
    if (tipo.includes('zcp_eventscaling') || tipo.includes('eventcurrency_scaling') || tipo.includes('eventscaling')) {
      return 'assets/icons/stw/resources/eventcurrency_scaling.png';
    }
    if (tipo.includes('reagent_c_t01')) return 'assets/icons/stw/resources/reagent_c_t01.png';
    if (tipo.includes('reagent_c_t02')) return 'assets/icons/stw/resources/reagent_c_t02.png';
    if (tipo.includes('reagent_c_t03')) return 'assets/icons/stw/resources/reagent_c_t03.png';
    if (tipo.includes('reagent_c_t04')) return 'assets/icons/stw/resources/reagent_c_t04.png';
    if (tipo.includes('zcp_heroxp')) return 'assets/icons/stw/resources/heroxp.png';
    if (tipo.includes('zcp_personnelxp')) return 'assets/icons/stw/resources/personnelxp.png';
    if (tipo.includes('zcp_schematicxp')) return 'assets/icons/stw/resources/schematicxp.png';
    if (tipo.includes('zcp_phoenixxp')) return 'assets/icons/stw/resources/phoenixxp.png';
    return null;
  
  }
  // Token
  if (tipo.includes('token:')) {
    return null;
  }

  return null;
}

// ── Modifier helpers ───────────────────────────────────────

function extractModifierName(itemType: string): string {
  if (!itemType) return 'default';
  if (itemType.startsWith('GameplayModifier:')) return itemType.replace('GameplayModifier:', '');
  const parts = itemType.split('/');
  const lastPart = parts[parts.length - 1];
  if (lastPart.includes('.')) {
    const name = lastPart.split('.')[1];
    return name ? name.replace(/'/g, '') : 'default';
  }
  return lastPart ? lastPart.replace(/'/g, '') : 'default';
}

function getModifierDisplayName(modName: string): string {
  if (!modName) return 'Unknown Modifier';
  let translated = traducir(`GameplayModifier:${modName}`);
  if (translated === `GameplayModifier:${modName}`) translated = traducir(modName);
  if (translated !== modName && translated !== `GameplayModifier:${modName}`) return translated;

  // Fallback map (English)
  const fallback: Record<string, string> = {
    GM_Phoenix_CloseQuarters: 'Close Quarters',
    GM_Phoenix_SuperConstructor: 'Super Constructor',
    GM_Phoenix_SuperHeroic: 'Super Heroic',
    GM_Phoenix_SuperNinja: 'Super Ninja',
    GM_Phoenix_SuperOutlander: 'Super Outlander',
    GM_Phoenix_SuperSoldier: 'Super Soldier',
    GM_Phoenix_RageMeter: 'Rage Meter',
    minibossenableprimarymissionitem: 'Epic Mini-Boss',
  };
  return fallback[modName] || modName.replace(/_/g, ' ');
}

// ── Rarity color ───────────────────────────────────────────

function getRarityColor(itemType: string): string {
  const match = itemType.match(/_(vr|sr|er|r|uc|c)(?:_|$)/i);
  if (match) {
    const colors: Record<string, string> = {
      c: '#8a8a8a',
      uc: '#5cb85c',
      r: '#337ab7',
      vr: '#9b59b6',
      sr: '#f39c12',
      er: '#e74c3c',
    };
    return colors[match[1].toLowerCase()] || '#8a8a8a';
  }
  return '#8a8a8a';
}

// ── Zone icon mapping ──────────────────────────────────────

const ZONE_ICONS: Record<string, string> = {
  'V-Bucks': 'assets/icons/stw/resources/currency_mtxswap.png',
  'Ventures': 'assets/icons/stw/ventures.png',
  'Twine Peaks': 'assets/icons/stw/difficulties/red-skull.png',
  'Canny Valley': 'assets/icons/stw/difficulties/orange-skull.png',
  'Plankerton': 'assets/icons/stw/difficulties/yellow-skull.png',
  'Stonewood': 'assets/icons/stw/difficulties/green-skull.png',
  'Events or Campaign': 'assets/icons/stw/world/quest.png',
};

// ── Zone order ─────────────────────────────────────────────

const ZONE_ORDER = [
  'V-Bucks',
  'Twine Peaks',
  'Canny Valley',
  'Plankerton',
  'Stonewood',
  'Ventures',
  'Events or Campaign',
];

// ── Main API ───────────────────────────────────────────────

export async function getMissions(storage: Storage, forceRefresh = false): Promise<ZoneMissions[]> {
  // Return cached data if same UTC day
  const today = getUTCDateKey();
  if (!forceRefresh && _cachedResult && _cachedUTCDate === today) {
    return _cachedResult;
  }

  // Get active account token
  const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
  const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
  if (!main) throw new Error('No account found');

  const token = await refreshAccountToken(storage, main.accountId);
  if (!token) throw new Error('Failed to refresh token');

  // Fetch world info (with 401 auto-refresh)
  const { data: worldInfo } = await authenticatedRequest(
    storage,
    main.accountId,
    token,
    async (t) => {
      const res = await axios.get(Endpoints.STW_WORLD_INFO, {
        headers: { Authorization: `Bearer ${t}` },
        timeout: 20_000,
      });
      return res.data;
    },
  );

  // Map mission alerts by key (theaterId_tileIndex)
  const alertsByMission: Record<string, any[]> = {};
  const alertGuidsByMission: Record<string, string[]> = {};
  if (Array.isArray(worldInfo.missionAlerts)) {
    for (const group of worldInfo.missionAlerts) {
      if (!Array.isArray(group.availableMissionAlerts)) continue;
      for (const alert of group.availableMissionAlerts) {
        const key = `${group.theaterId}${alert.tileIndex !== undefined ? `_${alert.tileIndex}` : ''}`;
        if (!alertsByMission[key]) alertsByMission[key] = [];
        alertsByMission[key].push(alert);
        // Preserve missionAlertGuid for completed-alerts matching
        if (alert.missionAlertGuid) {
          if (!alertGuidsByMission[key]) alertGuidsByMission[key] = [];
          alertGuidsByMission[key].push(alert.missionAlertGuid);
        }
      }
    }
  }

  // Process missions
  const allMissions: ProcessedMission[] = [];

  if (Array.isArray(worldInfo.missions)) {
    for (const group of worldInfo.missions) {
      if (!Array.isArray(group.availableMissions)) continue;

      for (const mission of group.availableMissions) {
        try {
          const key = `${group.theaterId}${mission.tileIndex !== undefined ? `_${mission.tileIndex}` : ''}`;
          const missionAlerts = alertsByMission[key] || [];

          // Extract alert rewards
          const alerts: AlertRewardItem[] = [];
          for (const a of missionAlerts) {
            if (a.missionAlertRewards?.items) {
              for (const item of a.missionAlertRewards.items) {
                const name = traducir(item.itemType);
                alerts.push({
                  itemType: item.itemType,
                  quantity: item.quantity || 1,
                  name,
                  icon: getResourceIcon(item.itemType, name),
                });
              }
            }
          }

          // Extract mission rewards
          const rewards: AlertRewardItem[] = [];
          if (mission.missionRewards?.items) {
            for (const item of mission.missionRewards.items) {
              const name = traducir(item.itemType);
              rewards.push({
                itemType: item.itemType,
                quantity: item.quantity || 1,
                name,
                icon: getResourceIcon(item.itemType, name),
              });
            }
          }

          // Extract power
          let power = 0;
          let powerLabel = '';
          if (mission.missionDifficultyInfo?.rowName) {
            powerLabel = traducir(mission.missionDifficultyInfo.rowName) || mission.missionDifficultyInfo.rowName;
            const m = powerLabel.match(/^(\d+)/);
            if (m) power = parseInt(m[1]);
          }

          // Mission name and icon
          const missionName = getMissionName(mission);

          // Exclude Storm Shield Defense missions
          if (isStormShield(missionName)) continue;

          const missionIcon = getMissionIcon(missionName);

          // Zone detection
          const rewardNames = rewards.map((r) => r.name);
          const alertNames = alerts.map((r) => r.name);
          const zone = getZone(power, rewardNames, alertNames, missionName, mission);
          const zoneGeo =
            zone === 'V-Bucks'
              ? getGeographicZone(power, missionName, mission)
              : zone === 'Events or Campaign'
                ? 'Events or Campaign'
                : zone;

          // Modifiers
          const modifiers: AlertModifier[] = [];
          for (const a of missionAlerts) {
            if (a.missionAlertModifiers?.items) {
              for (const mod of a.missionAlertModifiers.items) {
                if (mod.itemType) {
                  const modName = extractModifierName(mod.itemType);
                  modifiers.push({
                    name: getModifierDisplayName(modName),
                    type: modName,
                    icon: `assets/icons/stw/modifiers/${modName}.png`,
                  });
                }
              }
            }
          }

          allMissions.push({
            id: key,
            theaterId: group.theaterId,
            tileIndex: mission.tileIndex ?? 0,
            power,
            powerLabel,
            zone,
            zoneGeo,
            missionName,
            missionIcon,
            alerts,
            rewards,
            modifiers,
            hasAlerts: alerts.length > 0,
            alertGuids: alertGuidsByMission[key] || [],
          });
        } catch {
          // Skip broken missions
        }
      }
    }
  }

  // Group by zone
  const zoneMap: Record<string, ProcessedMission[]> = {};
  for (const m of allMissions) {
    if (!zoneMap[m.zone]) zoneMap[m.zone] = [];
    zoneMap[m.zone].push(m);
  }

  // Sort missions within each zone: alerts first, then by power desc
  for (const missions of Object.values(zoneMap)) {
    missions.sort((a, b) => {
      if (a.hasAlerts && !b.hasAlerts) return -1;
      if (!a.hasAlerts && b.hasAlerts) return 1;
      return b.power - a.power;
    });
  }

  // Build result ordered by ZONE_ORDER
  const result: ZoneMissions[] = [];
  for (const zoneName of ZONE_ORDER) {
    if (zoneMap[zoneName] && zoneMap[zoneName].length > 0) {
      result.push({
        zone: zoneName,
        icon: ZONE_ICONS[zoneName] || 'assets/icons/stw/world/quest.png',
        missions: zoneMap[zoneName],
      });
    }
  }
  // Append any zones not in the predefined order
  for (const [zoneName, missions] of Object.entries(zoneMap)) {
    if (!ZONE_ORDER.includes(zoneName) && missions.length > 0) {
      result.push({
        zone: zoneName,
        icon: ZONE_ICONS[zoneName] || 'assets/icons/stw/world/quest.png',
        missions,
      });
    }
  }

  // Store in cache
  _cachedResult = result;
  _cachedUTCDate = today;

  return result;
}

// ── Completed alerts (QueryPublicProfile) ──────────────────

export async function getCompletedAlerts(storage: Storage): Promise<{
  success: boolean;
  claimData: Array<{ missionAlertId: string; redemptionDateUtc: string; evictClaimDataAfterUtc: string }>;
  error?: string;
}> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];
    if (!main) return { success: false, claimData: [], error: 'No account found' };

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return { success: false, claimData: [], error: 'Failed to refresh token' };

    const { data } = await authenticatedRequest(
      storage,
      main.accountId,
      token,
      async (t) => {
        const res = await axios.post(
          `${Endpoints.MCP}/${main.accountId}/public/QueryPublicProfile?profileId=campaign&rvn=-1`,
          {},
          {
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            timeout: 15000,
          },
        );
        return res.data;
      },
    );

    const attrs = data?.profileChanges?.[0]?.profile?.stats?.attributes;
    const claimData: Array<{ missionAlertId: string; redemptionDateUtc: string; evictClaimDataAfterUtc: string }> =
      attrs?.mission_alert_redemption_record?.claimData ?? [];

    return { success: true, claimData };
  } catch (err: any) {
    return { success: false, claimData: [], error: err?.message || 'Unknown error' };
  }
}
