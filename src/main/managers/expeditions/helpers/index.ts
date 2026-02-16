// Exportar todos los helpers de expediciones
export * from './getCampaignData';
export * from './checkCompletedExpeditions';
export {
  getAvailableExpeditionSquads,
  obtenerSquadIdsEnUso,
  encontrarSquadIdDisponible,
  getFirstAvailableSquadId,
  getCompatibleSquadsForExpedition,
  getSquadsInUse,
  getExpeditionType,
  getSquadName,
  isSquadCompatibleWithExpedition,
  SQUAD_IDS_CONFIG,
  AVAILABLE_SQUAD_IDS,
} from './getAvailableExpeditionSquad';
export {
  getOccupiedHeroes,
  getOccupiedHeroIds,
  isHeroOccupied,
  selectBestHeroes,
  calculateHeroPower,
  filterHeroesByCriteria,
  getHeroTypeFromTemplate,
  getHeroRarityValue,
  getLoadoutName,
  getBuildType,
  getSquadType,
} from './getOccupiedHeroes';
