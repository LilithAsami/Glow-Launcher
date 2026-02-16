import { log } from '../../../../helpers/logger';
import { getCampaignData } from './getCampaignData';

export interface HeroItem {
  itemId: string;
  templateId: string;
  level: number;
  tier: number;
  rarity: string;
  power: number;
  heroType: string;
}

export interface OccupiedHeroesResult {
  success: boolean;
  occupiedHeroIds?: Set<string>;
  heroDetails?: {
    inLoadouts: any[];
    inExpeditions: any[];
    inBuilds: any[];
  };
  summary?: {
    total: number;
    inLoadouts: number;
    inExpeditions: number;
    inBuilds: number;
  };
  error?: string;
  errorCode?: string;
}

/**
 * Obtiene todos los héroes que están ocupados en builds/loadouts y expediciones
 */
export async function getOccupiedHeroes({
  accountId,
  accessToken,
  campaignData = null,
}: {
  accountId: string;
  accessToken: string;
  campaignData?: any;
}): Promise<OccupiedHeroesResult> {
  log.epic.info(`[getOccupiedHeroes] [SEARCH] Analizando héroes ocupados para cuenta: ${accountId.substring(0, 8)}...`);

  try {
    let campaign = campaignData;
    if (!campaign) {
      const result = await getCampaignData({ accountId, accessToken });
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          errorCode: result.errorCode,
        };
      }
      campaign = result.data;
    }

    const items = campaign.items || {};
    const occupiedHeroIds = new Set<string>();
    const heroDetails = {
      inLoadouts: [] as any[],
      inExpeditions: [] as any[],
      inBuilds: [] as any[],
    };

    // 1. Héroes ocupados en CampaignHeroLoadout (crew_members)
    log.epic.info(`[getOccupiedHeroes] [WRENCH] Analizando CampaignHeroLoadout crew_members...`);
    for (const [itemId, item] of Object.entries<any>(items)) {
      if (item.templateId && item.templateId.includes('CampaignHeroLoadout')) {
        const crewMembers = item.attributes?.crew_members || {};
        
        // crew_members es un OBJETO donde keys son slotIds y values son heroIds
        for (const [slotId, heroId] of Object.entries<any>(crewMembers)) {
          if (heroId && typeof heroId === 'string' && !occupiedHeroIds.has(heroId)) {
            occupiedHeroIds.add(heroId);
            heroDetails.inLoadouts.push({
              heroId,
              loadoutId: itemId,
              loadoutName: getLoadoutName(item.templateId),
            });
            log.epic.info(`[getOccupiedHeroes] 🚫 Héroe en loadout: ${heroId.substring(0, 12)}... (loadout: ${itemId})`);
          }
        }
      }
    }

    // 2. Héroes ocupados en expediciones (squad_id contiene "expedition")
    log.epic.info(`[getOccupiedHeroes] 🚁 Analizando héroes en expediciones...`);
    for (const [itemId, item] of Object.entries<any>(items)) {
      if (item.templateId && item.templateId.startsWith('Hero:')) {
        const squadId = item.attributes?.squad_id;
        
        // Si tiene squad_id que contenga "expedition", está ocupado en expedición
        if (squadId && squadId.includes('expedition') && !occupiedHeroIds.has(itemId)) {
          occupiedHeroIds.add(itemId);
          heroDetails.inExpeditions.push({
            heroId: itemId,
            squadId: squadId,
            slotIndex: item.attributes?.squad_slot_idx || -1,
            heroTemplate: item.templateId,
            level: item.attributes?.level || 1,
          });
          log.epic.info(`[getOccupiedHeroes] 🚫 Héroe en expedición: ${itemId.substring(0, 12)}... (squad: ${squadId})`);
        }
      }
    }

    // 3. Héroes ocupados en otros builds/squads (opcional para completitud)
    log.epic.info(`[getOccupiedHeroes] 🏗️ Analizando otros builds activos...`);
    for (const [itemId, item] of Object.entries<any>(items)) {
      if (item.templateId && item.templateId.startsWith('Hero:')) {
        const squadId = item.attributes?.squad_id;
        const squadSlotIdx = item.attributes?.squad_slot_idx;
        
        // Verificar si está en un squad activo (no expedición) y no está ya contado
        if (squadId && 
            !squadId.includes('expedition') && 
            squadSlotIdx !== undefined && 
            squadSlotIdx >= 0 &&
            !occupiedHeroIds.has(itemId)) {
          
          occupiedHeroIds.add(itemId);
          heroDetails.inBuilds.push({
            heroId: itemId,
            squadId: squadId,
            buildType: getSquadType(squadId),
            slotIndex: squadSlotIdx,
          });
          log.epic.info(`[getOccupiedHeroes] 🚫 Héroe en build: ${itemId.substring(0, 12)}... (squad: ${squadId}, slot: ${squadSlotIdx})`);
        }
      }
    }

    const totalOccupied = occupiedHeroIds.size;
    const summary = {
      total: totalOccupied,
      inLoadouts: heroDetails.inLoadouts.length,
      inExpeditions: heroDetails.inExpeditions.length,
      inBuilds: heroDetails.inBuilds.length,
    };

    log.epic.info(
      `[getOccupiedHeroes] [OK] Resumen: ${totalOccupied} héroes ocupados (${summary.inLoadouts} en loadouts, ${summary.inExpeditions} en expediciones, ${summary.inBuilds} en builds)`
    );

    return {
      success: true,
      occupiedHeroIds,
      heroDetails,
      summary,
    };
  } catch (error: any) {
    log.epic.error({ error: error.message }, '[getOccupiedHeroes] [ERROR] Error analizando héroes ocupados');
    return {
      success: false,
      error: error.message,
      errorCode: 'unknown_error',
    };
  }
}

/**
 * Obtiene solo el Set de IDs de héroes ocupados
 */
export async function getOccupiedHeroIds(options: {
  accountId: string;
  accessToken: string;
  campaignData?: any;
}): Promise<Set<string> | null> {
  const result = await getOccupiedHeroes(options);
  return result.success && result.occupiedHeroIds ? result.occupiedHeroIds : null;
}

/**
 * Verifica si un héroe específico está ocupado
 */
export async function isHeroOccupied(
  heroId: string,
  options: { accountId: string; accessToken: string; campaignData?: any }
): Promise<boolean> {
  const occupiedIds = await getOccupiedHeroIds(options);
  return occupiedIds ? occupiedIds.has(heroId) : false;
}

/**
 * Obtiene el nombre legible del tipo de loadout
 */
export function getLoadoutName(templateId: string): string {
  const loadoutNames: Record<string, string> = {
    CampaignHeroLoadout: 'Loadout Principal',
    DefenderLoadout: 'Loadout de Defensor',
    ExpeditionSquadLoadout: 'Loadout de Expedición',
  };

  for (const [key, name] of Object.entries(loadoutNames)) {
    if (templateId.includes(key)) {
      return name;
    }
  }

  return templateId.replace('CampaignHeroLoadout', 'Loadout').replace('_', ' ');
}

/**
 * Obtiene el nombre del tipo de build
 */
export function getBuildType(templateId: string): string {
  const buildTypes: Record<string, string> = {
    DefenderLoadout: 'Defensor',
    DefenseSquad: 'Squad de Defensa',
    BuildingSquad: 'Squad de Construcción',
    ExpeditionSquad: 'Squad de Expedición',
  };

  for (const [key, type] of Object.entries(buildTypes)) {
    if (templateId.includes(key)) {
      return type;
    }
  }

  return 'Squad Desconocido';
}

/**
 * Obtiene el tipo de squad basado en el ID
 */
export function getSquadType(squadId: string): string {
  const squadTypes: Record<string, string> = {
    Squad_Attribute_EMT: 'E.M.T.',
    Squad_Attribute_FireTeam: 'Equipo de Fuego',
    Squad_Attribute_Corps: 'Cuerpo de Ingenieros',
    Squad_Attribute_Scouting: 'Exploración',
    Squad_Expedition: 'Expedición',
    Squad_Defense: 'Defensa',
  };

  for (const [key, type] of Object.entries(squadTypes)) {
    if (squadId.includes(key)) {
      return type;
    }
  }

  return squadId.replace('Squad_', '').replace('_', ' ');
}

/**
 * Selecciona los mejores héroes disponibles para expediciones
 */
export async function selectBestHeroes({
  accountId,
  accessToken,
  campaignData = null,
  maxHeroes = 5,
  expeditionCriteria = [],
  occupiedHeroIds = null,
}: {
  accountId: string;
  accessToken: string;
  campaignData?: any;
  maxHeroes?: number;
  expeditionCriteria?: string[];
  occupiedHeroIds?: Set<string> | null;
}): Promise<{ success: boolean; heroes?: HeroItem[]; error?: string }> {
  log.epic.info(`[selectBestHeroes] [DART] Seleccionando mejores héroes para: ${accountId.substring(0, 8)}... (max: ${maxHeroes})`);

  try {
    let campaign = campaignData;
    if (!campaign) {
      const result = await getCampaignData({ accountId, accessToken });
      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }
      campaign = result.data;
    }

    // Obtener héroes ocupados (usar el Set proporcionado o buscar nuevos)
    let occupiedSet: Set<string>;
    if (occupiedHeroIds) {
      occupiedSet = occupiedHeroIds;
      log.epic.info(`[selectBestHeroes] 🚫 Usando héroes ocupados existentes: ${occupiedSet.size}`);
    } else {
      const occupiedResult = await getOccupiedHeroes({ accountId, accessToken, campaignData: campaign });
      if (!occupiedResult.success) {
        return {
          success: false,
          error: occupiedResult.error,
        };
      }
      occupiedSet = occupiedResult.occupiedHeroIds!;
      log.epic.info(`[selectBestHeroes] 🚫 Héroes ocupados: ${occupiedSet.size}`);
    }

    // Obtener todos los héroes disponibles
    const items = campaign.items || {};
    const allHeroes: HeroItem[] = [];

    log.epic.info(`[selectBestHeroes] [SEARCH] Total items en campaña: ${Object.keys(items).length}`);

    let heroCount = 0;

    for (const [itemId, item] of Object.entries<any>(items)) {
      // Filtrar solo héroes reales (Hero: en templateId)
      // Worker: son survivors, defenders, etc. - NO son héroes jugables
      if (!item.templateId?.startsWith('Hero:')) continue;
      
      heroCount++;
      
      if (occupiedSet.has(itemId)) continue;

      const level = item.attributes?.level || 1;
      const tier = item.attributes?.tier || 1;
      const rarity = getHeroRarityValue(item.templateId);
      const heroType = getHeroTypeFromTemplate(item.templateId);
      const power = calculateHeroPower(item);

      allHeroes.push({
        itemId,
        templateId: item.templateId,
        level,
        tier,
        rarity: rarity.toString(),
        power,
        heroType,
      });
    }

    log.epic.info(`[selectBestHeroes] [SEARCH] Total héroes encontrados: ${heroCount}, disponibles: ${allHeroes.length}`);
    log.epic.info(`[selectBestHeroes] [CHART] Total héroes disponibles: ${allHeroes.length}`);

    // Filtrar por criterios de expedición si se proporcionan
    let filteredHeroes = allHeroes;
    if (expeditionCriteria && expeditionCriteria.length > 0) {
      filteredHeroes = filterHeroesByCriteria(allHeroes, expeditionCriteria);
      log.epic.info(`[selectBestHeroes] [FILTER] Héroes tras filtrar criterios: ${filteredHeroes.length}`);
    }

    // Ordenar por level (mayor a menor) - máximo 60
    const sortedHeroes = filteredHeroes.sort((a, b) => {
      // Prioridad 1: Level (mayor primero)
      if (b.level !== a.level) {
        return b.level - a.level;
      }

      // Prioridad 2: Rarity (mayor primero)
      const rarityA = typeof a.rarity === 'string' ? parseInt(a.rarity) : a.rarity;
      const rarityB = typeof b.rarity === 'string' ? parseInt(b.rarity) : b.rarity;
      if (rarityB !== rarityA) {
        return rarityB - rarityA;
      }

      // Prioridad 3: Power (mayor primero)
      return b.power - a.power;
    });

    // Tomar los mejores N héroes
    const bestHeroes = sortedHeroes.slice(0, maxHeroes);

    log.epic.info(`[selectBestHeroes] [OK] Seleccionados ${bestHeroes.length} héroes de ${allHeroes.length} disponibles`);

    return {
      success: true,
      heroes: bestHeroes,
    };
  } catch (error: any) {
    log.epic.error({ error: error.message }, '[selectBestHeroes] [ERROR] Error seleccionando héroes');
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Calcula el poder de un héroe basado en sus atributos
 */
export function calculateHeroPower(heroItem: any): number {
  const attributes = heroItem.attributes || {};
  const level = attributes.level || 1;
  const rarity = getHeroRarityValue(heroItem.templateId);

  // Fórmula básica de poder (se puede ajustar según necesidades)
  let basePower = level * 10;

  // Bonus por rareza
  basePower += rarity * 20;

  // Bonus por evolución si existe
  if (attributes.evolution) {
    basePower += attributes.evolution * 50;
  }

  // Bonus por favorite si está marcado
  if (attributes.favorite) {
    basePower += 10;
  }

  return basePower;
}

/**
 * Filtra héroes por criterios específicos de expedición
 */
export function filterHeroesByCriteria(heroes: HeroItem[], criteria: string[]): HeroItem[] {
  if (criteria.length === 0) return heroes;

  return heroes.filter((hero) => {
    for (const criterion of criteria) {
      const lowerCriterion = criterion.toLowerCase();

      if (hero.heroType.toLowerCase().includes(lowerCriterion)) return true;
      if (hero.templateId.toLowerCase().includes(lowerCriterion)) return true;
    }

    return false;
  });
}

/**
 * Obtiene el tipo de héroe desde el templateId
 */
export function getHeroTypeFromTemplate(templateId: string): string {
  const template = templateId.toLowerCase();

  if (template.includes('ninja')) return 'ninja';
  if (template.includes('outlander')) return 'outlander';
  if (template.includes('constructor')) return 'constructor';
  if (template.includes('soldier') || template.includes('commando')) return 'soldier';

  return 'unknown';
}

/**
 * Obtiene el valor numérico de rareza del héroe
 */
export function getHeroRarityValue(templateId: string): number {
  const template = templateId.toLowerCase();

  if (template.includes('_sr_')) return 5; // Legendary (Super Rare)
  if (template.includes('_vr_')) return 4; // Epic (Very Rare)
  if (template.includes('_r_')) return 3; // Rare
  if (template.includes('_uc_')) return 2; // Uncommon
  if (template.includes('_c_')) return 1; // Common

  // Fallback por tiers
  if (template.includes('_t05')) return 5;
  if (template.includes('_t04')) return 4;
  if (template.includes('_t03')) return 3;
  if (template.includes('_t02')) return 2;
  if (template.includes('_t01')) return 1;

  return 0; // Rareza desconocida
}
