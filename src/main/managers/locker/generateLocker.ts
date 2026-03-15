import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import { app } from 'electron';
import { LockerFilters, fetchExtendedCosmeticsData, ExtendedCosmeticData } from './utils/cosmeticFilters';

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════
const USE_WORKER = false; // true = Worker Thread | false = Directo con cache
const DEBUG_MODE = false; // true = logs de debug | false = sin logs (más rápido)
// ═══════════════════════════════════════════════════════════════════════════════

// Logger asíncrono que no bloquea el event loop
const log = DEBUG_MODE ? (...args: any[]) => setImmediate(() => process.stdout.write(`[LOCKER] ${args.join(' ')}\n`)) : () => {};

// Configuraciones — paths resolve from dist/main/ at runtime
const BOT_LOGO_PATH = path.join(__dirname, "locker", "images", "glow.png");
const EPIC_GAMES_LOGO_PATH = path.join(__dirname, "locker", "images", "epicgames.png");
const DISCORD_INVITE_URL = "discord.gg/Z4GDeghSnn";

// Sharp optimizado para máximo rendimiento
sharp.cache({ memory: 1024, files: 200, items: 1000 });
sharp.concurrency(0);
sharp.simd(true);

// Constantes pre-calculadas
const CARD_SIZE = 128;
const CARD_SPACING = 2; // Espacio entre tarjetas
const CANVAS_PADDING = 10; // Margen del canvas

// Configuración de compresión para imágenes grandes
const MAX_FILE_SIZE_MB = 24; // Tamaño máximo antes de comprimir
const JPEG_QUALITY_START = 95; // Calidad inicial JPEG
const JPEG_QUALITY_MIN = 60; // Calidad mínima JPEG

interface TypeMapping {
  prefix: string;
  backendValue: string;
}

const TYPE_MAPPING: Record<string, TypeMapping> = {
  outfit: { prefix: 'AthenaCharacter:', backendValue: 'AthenaCharacter' },
  backpack: { prefix: 'AthenaBackpack:', backendValue: 'AthenaBackpack' },
  pickaxe: { prefix: 'AthenaPickaxe:', backendValue: 'AthenaPickaxe' },
  glider: { prefix: 'AthenaGlider:', backendValue: 'AthenaGlider' },
  emote: { prefix: 'AthenaDance:', backendValue: 'AthenaDance' },
  spray: { prefix: 'AthenaDance:', backendValue: 'AthenaSpray' },
  emoticon: { prefix: 'AthenaDance:', backendValue: 'AthenaEmoji' },
  toy: { prefix: 'AthenaDance:', backendValue: 'AthenaToy' },
  wrap: { prefix: 'AthenaItemWrap:', backendValue: 'AthenaItemWrap' },
  music: { prefix: 'AthenaMusicPack:', backendValue: 'AthenaMusicPack' },
  loadingscreen: { prefix: 'AthenaLoadingScreen:', backendValue: 'AthenaLoadingScreen' },
  contrail: { prefix: 'AthenaSkyDiveContrail:', backendValue: 'AthenaSkyDiveContrail' },
  track: { prefix: 'SparksSong:', backendValue: 'SparksSong' },
  banner: { prefix: 'HomebaseBannerIcon:', backendValue: 'HomebaseBannerIcon' },
  guitar: { prefix: 'SparksGuitar:', backendValue: 'SparksGuitar' },
  bass: { prefix: 'SparksBass:', backendValue: 'SparksBass' },
  drum: { prefix: 'SparksDrums:', backendValue: 'SparksDrums' },
  keyboard: { prefix: 'SparksKeyboard:', backendValue: 'SparksKeyboard' },
  microphone: { prefix: 'SparksMicrophone:', backendValue: 'SparksMicrophone' },
  vehicleBody:  { prefix: 'VehicleCosmetics_Body:', backendValue: 'VehicleCosmetics_Body' },
  vehicleSkin:  { prefix: 'VehicleCosmetics_Skin:', backendValue: 'VehicleCosmetics_Skin' },
  vehicleWheel: { prefix: 'VehicleCosmetics_Wheel:', backendValue: 'VehicleCosmetics_Wheel' },
  vehicleDrift: { prefix: 'VehicleCosmetics_DriftTrail:', backendValue: 'VehicleCosmetics_DriftTrail' },
  vehicleBoost: { prefix: 'VehicleCosmetics_Booster:', backendValue: 'VehicleCosmetics_Booster' },
  companion:    { prefix: 'CosmeticMimosa:', backendValue: 'CosmeticMimosa' },
};

const TYPE_ORDER = ['outfit', 'backpack', 'pickaxe', 'glider', 'emote', 'spray', 'emoticon', 'toy', 'wrap', 'music', 'loadingscreen', 'contrail', 'track', 'banner', 'guitar', 'bass', 'drum', 'keyboard', 'microphone', 'vehicleBody', 'vehicleSkin', 'vehicleWheel', 'vehicleDrift', 'vehicleBoost', 'companion'];
const EID_TYPES = new Set(['emote', 'spray', 'emoticon', 'toy']);
const VALID_EID_VALUES = new Set(['AthenaDance', 'AthenaSpray', 'AthenaEmoji', 'AthenaToy']);
// Types that need lookup in specialized APIs (not BR API)
const TRACK_TYPES = new Set(['track']);
const BANNER_TYPES = new Set(['banner']);
const INSTRUMENT_TYPES = new Set(['guitar', 'bass', 'drum', 'keyboard', 'microphone']);
const VEHICLE_TYPES = new Set(['vehicleBody', 'vehicleSkin', 'vehicleWheel', 'vehicleDrift', 'vehicleBoost']);

// Pre-calcular pesos de rareza
const RARITY_WEIGHTS: Record<string, number> = {
  'gaminglegends': 200, 'marvel': 190, 'starwars': 180, 'dc': 170, 'icon': 160,
  'dark': 150, 'shadow': 140, 'slurp': 130, 'frozen': 120, 'lava': 110,
  'legendary': 100, 'epic': 90, 'rare': 80, 'uncommon': 70, 'common': 60, 'default': 50
};

// Cache global persistente
const imageCache = new Map<string, Buffer>();
const resizedOverlayCache = new Map<string, Buffer>();

// Cache de API de Fortnite con TTL
let apiCosmeticsCache: any[] | null = null;
let apiCacheTimestamp: number | null = null;
const API_CACHE_TTL = 60 * 60 * 1000; // 1 hora en milisegundos

// Pre-cargar logos una vez
let botLogoBuffer: Buffer | null = null;
let epicLogoBuffer: Buffer | null = null;

async function preloadLogos() {
  if (!botLogoBuffer && fs.existsSync(BOT_LOGO_PATH)) {
    botLogoBuffer = await fs.promises.readFile(BOT_LOGO_PATH);
  }
  if (!epicLogoBuffer && fs.existsSync(EPIC_GAMES_LOGO_PATH)) {
    epicLogoBuffer = await fs.promises.readFile(EPIC_GAMES_LOGO_PATH);
  }
}

// Axios optimizado con keep-alive
const axiosInstance: AxiosInstance = axios.create({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip, deflate' },
  decompress: true,
  maxRedirects: 5,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10 })
});

// Rate limiter para descargas de imágenes
let lastDownloadTime = 0;
const DOWNLOAD_DELAY = 0;

async function downloadImageBuffer(url: string, retries = 3): Promise<Buffer | null> {
  const now = Date.now();
  const timeSinceLastDownload = now - lastDownloadTime;
  if (timeSinceLastDownload < DOWNLOAD_DELAY) {
    await new Promise(resolve => setTimeout(resolve, DOWNLOAD_DELAY - timeSinceLastDownload));
  }
  lastDownloadTime = Date.now();

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await axiosInstance.get(url, {
        responseType: 'arraybuffer',
        timeout: 5000
      });
      return Buffer.from(response.data);
    } catch (error) {
      if (attempt === retries - 1) {
        log(`Error descargando ${url}:`, error);
        return null;
      }
      const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  return null;
}

async function composeMCP({ operation, profile, accountId, accessToken, body = {}, route = 'client' }: {
  operation: string;
  profile: string;
  accountId: string;
  accessToken: string;
  body?: any;
  route?: string;
}) {
  const url = `https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/profile/${accountId}/${route}/${operation}?profileId=${profile}&rvn=-1`;
  const response = await axiosInstance.post(url, body, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
  });
  return response.data;
}

interface UserCosmetic {
  id: string;
  templateId: string;
  type: string;
  backendValue: string;
  originalType?: string;
  needsValidation?: boolean;
}

export async function countUserCosmetics(accountId: string, accessToken: string, cosmeticTypes: string | string[]): Promise<number> {
  try {
    const profileData = await composeMCP({
      profile: "athena",
      operation: "QueryProfile",
      body: {},
      accountId,
      accessToken,
      route: 'client'
    });

    const items = profileData?.profileChanges?.[0]?.profile?.items;
    if (!items) return 0;

    // Normalizar a array
    const typesArray = Array.isArray(cosmeticTypes) ? cosmeticTypes : [cosmeticTypes];
    const isAll = typesArray.includes('all');
    let count = 0;

    for (const itemData of Object.values(items)) {
      const templateId = (itemData as any).templateId;
      if (!templateId) continue;

      if (isAll) {
        for (const [type, map] of Object.entries(TYPE_MAPPING)) {
          if (templateId.startsWith(map.prefix)) {
            const isEidType = EID_TYPES.has(type);
            if (isEidType && (itemData as any).attributes?.variants) {
              count++;
            } else if (!isEidType) {
              count++;
            }
            break;
          }
        }
      } else {
        for (const cosmeticType of typesArray) {
          const mapping = TYPE_MAPPING[cosmeticType];
          if (mapping && templateId.startsWith(mapping.prefix)) {
            const isEidType = EID_TYPES.has(cosmeticType);
            if (isEidType && (itemData as any).attributes?.variants) {
              count++;
            } else if (!isEidType) {
              count++;
            }
            break;
          }
        }
      }
    }

    return count;
  } catch (error) {
    log(`Error contando cosméticos:`, error);
    return 0;
  }
}

async function getUserCosmetics(accountId: string, accessToken: string, cosmeticTypes: string | string[]): Promise<UserCosmetic[]> {
  // Normalizar a array and expand composite filter types
  let typesArray = Array.isArray(cosmeticTypes) ? [...cosmeticTypes] : [cosmeticTypes];
  if (typesArray.includes('vehicle')) {
    typesArray = typesArray.filter(t => t !== 'vehicle');
    typesArray.push('vehicleBody', 'vehicleSkin', 'vehicleWheel', 'vehicleDrift', 'vehicleBoost');
  }
  const isAll = typesArray.includes('all');
  const needsBanners = isAll || typesArray.includes('banner');

  // 1. Athena profile — skins, emotes, wraps, music, loadingscreens, instruments, tracks, etc.
  const profileData = await composeMCP({
    profile: "athena",
    operation: "QueryProfile",
    body: {},
    accountId,
    accessToken,
    route: 'client'
  });

  const items = profileData?.profileChanges?.[0]?.profile?.items;
  const cosmetics: UserCosmetic[] = [];

  const processItems = (itemEntries: any) => {
    if (!itemEntries) return;
    for (const itemData of Object.values(itemEntries)) {
      const templateId = (itemData as any).templateId;
      if (!templateId) continue;

      if (isAll) {
        for (const [type, map] of Object.entries(TYPE_MAPPING)) {
          if (templateId.startsWith(map.prefix)) {
            cosmetics.push({
              id: templateId.slice(map.prefix.length),
              templateId,
              type: EID_TYPES.has(type) ? 'eid_generic' : type,
              originalType: type,
              backendValue: map.backendValue
            });
            break;
          }
        }
      } else {
        for (const cosmeticType of typesArray) {
          const mapping = TYPE_MAPPING[cosmeticType];
          if (!mapping) continue;
          
          const isEidType = EID_TYPES.has(cosmeticType);
          const prefix = isEidType ? 'AthenaDance:' : mapping.prefix;
          
          if (templateId.startsWith(prefix)) {
            cosmetics.push({
              id: templateId.slice(prefix.length),
              templateId,
              type: cosmeticType,
              backendValue: mapping.backendValue,
              needsValidation: isEidType
            });
            break;
          }
        }
      }
    }
  };

  processItems(items);

  // 2. Common_core profile — banners (HomebaseBannerIcon)
  if (needsBanners) {
    try {
      const ccData = await composeMCP({
        profile: "common_core",
        operation: "QueryProfile",
        body: {},
        accountId,
        accessToken,
        route: 'client'
      });
      const ccItems = ccData?.profileChanges?.[0]?.profile?.items;
      if (ccItems) {
        for (const itemData of Object.values(ccItems)) {
          const templateId = (itemData as any).templateId;
          if (!templateId) continue;
          // Only pick banner icons from common_core
          if (templateId.startsWith('HomebaseBannerIcon:')) {
            const mapping = TYPE_MAPPING['banner'];
            cosmetics.push({
              id: templateId.slice(mapping.prefix.length),
              templateId,
              type: 'banner',
              backendValue: mapping.backendValue
            });
          }
        }
      }
    } catch { /* banner fetch is non-critical */ }
  }

  return cosmetics;
}

// Búsqueda optimizada con Map indexado
let apiCosmeticsMap: Map<string, any> | null = null;
// Additional API caches for specialized cosmetic types
let apiTracksMap: Map<string, any> | null = null;
let apiBannersMap: Map<string, any> | null = null;
let apiInstrumentsMap: Map<string, any> | null = null;
let apiCarsMap: Map<string, any> | null = null;
let apiTracksCacheTS = 0;
let apiBannersCacheTS = 0;
let apiInstrumentsCacheTS = 0;
let apiCarsCacheTS = 0;

function buildApiMap(apiCosmetics: any[]): Map<string, any> {
  const map = new Map();
  for (const c of apiCosmetics) {
    if (c?.id) map.set(c.id.toLowerCase(), c);
  }
  return map;
}

async function getApiCosmetics(): Promise<any[]> {
  const now = Date.now();

  if (apiCosmeticsCache && apiCacheTimestamp && (now - apiCacheTimestamp) < API_CACHE_TTL) {
    log(`[API CACHE] Usando cache (edad: ${Math.floor((now - apiCacheTimestamp) / 1000)}s)`);
    return apiCosmeticsCache;
  }

  log(`[API CACHE] ${apiCosmeticsCache ? 'Expirado' : 'Nuevo'}, descargando...`);
  const response = await axiosInstance.get("https://fortnite-api.com/v2/cosmetics/br", {
    params: { language: 'en' }
  });

  const cosmetics = response.data?.data || [];

  apiCosmeticsCache = cosmetics;
  apiCacheTimestamp = now;

  log(`[API CACHE] Guardado en cache (${cosmetics.length} items, TTL: ${API_CACHE_TTL / 1000}s)`);

  return cosmetics;
}

async function getApiTracks(): Promise<Map<string, any>> {
  const now = Date.now();
  if (apiTracksMap && (now - apiTracksCacheTS) < API_CACHE_TTL) return apiTracksMap;
  try {
    const res = await axiosInstance.get("https://fortnite-api.com/v2/cosmetics/tracks", { params: { language: 'en' } });
    const tracks: any[] = res.data?.data || [];
    const map = new Map<string, any>();
    for (const t of tracks) {
      if (!t?.id) continue;
      map.set(t.id.toLowerCase(), t);
      if (t.devName) map.set(t.devName.toLowerCase(), t);
    }
    apiTracksMap = map;
    apiTracksCacheTS = now;
    log(`[TRACKS CACHE] ${tracks.length} tracks cached`);
  } catch { apiTracksMap = apiTracksMap || new Map(); }
  return apiTracksMap!;
}

async function getApiBanners(): Promise<Map<string, any>> {
  const now = Date.now();
  if (apiBannersMap && (now - apiBannersCacheTS) < API_CACHE_TTL) return apiBannersMap;
  try {
    const res = await axiosInstance.get("https://fortnite-api.com/v1/banners", { params: { language: 'en' } });
    const banners: any[] = res.data?.data || [];
    const map = new Map<string, any>();
    for (const b of banners) {
      if (b?.id) map.set(b.id.toLowerCase(), b);
    }
    apiBannersMap = map;
    apiBannersCacheTS = now;
    log(`[BANNERS CACHE] ${banners.length} banners cached`);
  } catch { apiBannersMap = apiBannersMap || new Map(); }
  return apiBannersMap!;
}

async function getApiInstruments(): Promise<Map<string, any>> {
  const now = Date.now();
  if (apiInstrumentsMap && (now - apiInstrumentsCacheTS) < API_CACHE_TTL) return apiInstrumentsMap;
  try {
    const res = await axiosInstance.get("https://fortnite-api.com/v2/cosmetics/instruments", { params: { language: 'en' } });
    const instruments: any[] = res.data?.data || [];
    const map = new Map<string, any>();
    for (const inst of instruments) {
      if (!inst?.id) continue;
      const apiId = inst.id.toLowerCase();
      map.set(apiId, inst);
      const colonIdx = apiId.indexOf(':');
      if (colonIdx >= 0) map.set(apiId.slice(colonIdx + 1), inst);
    }
    apiInstrumentsMap = map;
    apiInstrumentsCacheTS = now;
    log(`[INSTRUMENTS CACHE] ${instruments.length} instruments cached`);
  } catch { apiInstrumentsMap = apiInstrumentsMap || new Map(); }
  return apiInstrumentsMap!;
}

async function getApiCars(): Promise<Map<string, any>> {
  const now = Date.now();
  if (apiCarsMap && (now - apiCarsCacheTS) < API_CACHE_TTL) return apiCarsMap;
  try {
    const res = await axiosInstance.get("https://fortnite-api.com/v2/cosmetics/cars", { params: { language: 'en' } });
    const cars: any[] = res.data?.data || [];
    const map = new Map<string, any>();
    for (const car of cars) {
      if (!car?.id) continue;
      const apiId = car.id.toLowerCase();
      map.set(apiId, car);
      // Also index by vehicleId (e.g. VCID_BodyAkumaTi → body_akuma entry)
      if (car.vehicleId) map.set(car.vehicleId.toLowerCase(), car);
      const colonIdx = apiId.indexOf(':');
      if (colonIdx >= 0) map.set(apiId.slice(colonIdx + 1), car);
    }
    apiCarsMap = map;
    apiCarsCacheTS = now;
    log(`[CARS CACHE] ${cars.length} vehicle cosmetics cached`);
  } catch { apiCarsMap = apiCarsMap || new Map(); }
  return apiCarsMap!;
}

function findCosmeticInAPI(cosmeticId: string, cosmeticType: string, backendValue: string): any {
  const idLower = cosmeticId.toLowerCase();

  // Tracks — lookup in tracks API map
  if (TRACK_TYPES.has(cosmeticType)) {
    if (!apiTracksMap) return null;
    return apiTracksMap.get(idLower) || null;
  }

  // Banners — lookup in banners API map
  if (BANNER_TYPES.has(cosmeticType)) {
    if (!apiBannersMap) return null;
    return apiBannersMap.get(idLower) || null;
  }

  // Instruments — lookup in instruments API map
  if (INSTRUMENT_TYPES.has(cosmeticType)) {
    if (!apiInstrumentsMap) return null;
    return apiInstrumentsMap.get(idLower) || null;
  }

  // Vehicles — lookup in cars API map
  if (VEHICLE_TYPES.has(cosmeticType)) {
    if (!apiCarsMap) return null;
    return apiCarsMap.get(idLower) || null;
  }

  // Standard BR cosmetics
  if (!apiCosmeticsMap) return null;
  const cosmetic = apiCosmeticsMap.get(idLower);
  if (!cosmetic) return null;

  if (EID_TYPES.has(cosmeticType) || cosmeticType === 'eid_generic') {
    const apiBackendValue = cosmetic.type?.backendValue;
    if (cosmeticType === 'eid_generic') {
      return VALID_EID_VALUES.has(apiBackendValue) ? cosmetic : null;
    }
    return apiBackendValue === backendValue ? cosmetic : null;
  }
  return cosmetic;
}

function calculateOptimalDimensions(itemCount: number): number {
  const sqrt = Math.sqrt(itemCount);
  let bestCols = Math.floor(sqrt);
  let bestDiff = Math.abs(Math.ceil(itemCount / bestCols) - bestCols);

  for (let cols = Math.max(1, bestCols - 2); cols <= Math.ceil(sqrt) + 2; cols++) {
    const rows = Math.ceil(itemCount / cols);
    const diff = Math.abs(rows - cols);
    if (diff < bestDiff || (diff === bestDiff && rows > cols)) {
      bestDiff = diff;
      bestCols = cols;
    }
  }
  return bestCols;
}

const getRarityWeight = (rarity?: string) => RARITY_WEIGHTS[rarity?.toLowerCase() || ''] || 50;

interface ProcessedCosmetic {
  name: string;
  rarity: string;
  series?: string;
  imageUrl?: string;
  added?: string;
  type: string;
  isExclusive?: boolean;
}

function sortCosmetics(cosmetics: ProcessedCosmetic[], sortByType: boolean): ProcessedCosmetic[] {
  return cosmetics.sort((a, b) => {
    // Primero por tipo (si sortByType está activo)
    if (sortByType) {
      const typeA = TYPE_ORDER.indexOf(a.type);
      const typeB = TYPE_ORDER.indexOf(b.type);
      if (typeA !== typeB) return typeA - typeB;
    }
    
    // Dentro de cada tipo: exclusivos primero
    if (a.isExclusive && !b.isExclusive) return -1;
    if (!a.isExclusive && b.isExclusive) return 1;
    
    // Luego por rareza
    const weightDiff = getRarityWeight(b.rarity) - getRarityWeight(a.rarity);
    if (weightDiff !== 0) return weightDiff;
    
    // Luego por fecha
    const dateA = a.added ? new Date(a.added).getTime() : 0;
    const dateB = b.added ? new Date(b.added).getTime() : 0;
    if (dateA !== dateB) return dateB - dateA;
    
    // Finalmente por nombre
    return (a.name || '').localeCompare(b.name || '');
  });
}

function censorDisplayName(displayName?: string): string {
  if (!displayName || typeof displayName !== 'string') return 'Unknown';
  const name = displayName.replace(/[^\x00-\x7F]/g, '').trim() || 'Player';
  if (/^[a-f0-9]{32}$/i.test(name) || name.length > 20) {
    return name.slice(0, 4) + '*'.repeat(Math.min(8, name.length - 8)) + name.slice(-4);
  }
  if (name.length <= 2) return name;
  return name[0] + '*'.repeat(name.length - 2) + name.slice(-1);
}

function createTextSVG(text: string, fontSize: number, color = 'white', maxWidth: number | null = null, maxHeight: number | null = null): { svg: Buffer; width: number; height: number } {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  
  // Calcular ancho estimado del texto
  const estimatedWidth = Math.ceil(text.length * fontSize * 0.6);
  
  // Si hay maxWidth y el texto es muy largo, aplicar compresión
  let finalWidth = estimatedWidth;
  let textLengthAttr = '';
  
  if (maxWidth && estimatedWidth > maxWidth) {
    finalWidth = maxWidth;
    // Usar textLength para comprimir el texto al ancho máximo
    textLengthAttr = ` textLength="${maxWidth - 8}" lengthAdjust="spacingAndGlyphs"`;
  } else if (maxWidth) {
    finalWidth = Math.min(estimatedWidth, maxWidth);
  }
  
  const height = Math.max(10, maxHeight ? Math.min(Math.ceil(fontSize * 1.4) + 10, maxHeight) : Math.ceil(fontSize * 1.4) + 10);
  const svg = `<svg width="${finalWidth}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>.t{font-family:Arial,sans-serif;font-size:${fontSize}px;font-weight:bold;fill:${color}}</style><text x="50%" y="${Math.min(fontSize, height - 2)}" text-anchor="middle" class="t"${textLengthAttr}>${escaped}</text></svg>`;
  return { svg: Buffer.from(svg), width: finalWidth, height };
}

async function loadImageCached(imagePath: string): Promise<Buffer | null> {
  let buffer = imageCache.get(imagePath);
  if (!buffer) {
    try {
      buffer = await fs.promises.readFile(imagePath);
      imageCache.set(imagePath, buffer);
    } catch {
      return null;
    }
  }
  return buffer;
}

export async function generateLockerImage({ accessToken, accountId, type = 'all', savePath, displayName = null, filters }: {
  accessToken: string;
  accountId: string;
  type?: string | string[];
  savePath?: string;
  displayName?: string | null;
  filters?: LockerFilters;
}): Promise<{ success: boolean; fileName?: string; path?: string; count?: number; time?: string; sizeMB?: string; error?: string }> {
  if (!savePath) savePath = path.join(app.getPath('userData'), 'locker-output');
  const startTime = Date.now();

  // Normalizar types a array
  const typesArray = Array.isArray(type) ? type : [type];

  // Filtros por defecto
  const activeFilters: LockerFilters = filters || {
    types: typesArray,
    rarities: ['all'],
    chapters: ['all'],
    exclusive: false,
  };

  try {
    if (!accessToken || !accountId) throw new Error("Faltan accessToken o accountId");

    preloadLogos();

    const [rawUserCosmetics, apiCosmetics] = await Promise.all([
      getUserCosmetics(accountId, accessToken, activeFilters.types),
      getApiCosmetics(),
    ]);

    // Also fetch specialized APIs in parallel (tracks, banners, instruments, cars)
    await Promise.all([
      getApiTracks(),
      getApiBanners(),
      getApiInstruments(),
      getApiCars(),
    ]);

    let userCosmetics = rawUserCosmetics;

    if (userCosmetics.length === 0) throw new Error("No se encontraron cosméticos");

    // If equippedItemIds provided, filter to only those items
    if (activeFilters.equippedItemIds && activeFilters.equippedItemIds.length > 0) {
      const idSet = new Set(activeFilters.equippedItemIds.map(id => id.toLowerCase()));
      const beforeCount = userCosmetics.length;
      userCosmetics = userCosmetics.filter(uc => idSet.has(uc.templateId.toLowerCase()));
      log(`[EQUIPPED FILTER] ${beforeCount} → ${userCosmetics.length} (whitelist: ${idSet.size})`);
      if (userCosmetics.length === 0) throw new Error('No equipped cosmetics found in profile');
    }

    apiCosmeticsMap = buildApiMap(apiCosmetics);

    // SIEMPRE obtener datos extendidos para detectar exclusivos (fondo dorado)
    const extendedDataMap = await fetchExtendedCosmeticsData();
    
    // Verificar si se necesitan filtros adicionales
    const hasRarityFilter = !activeFilters.rarities.includes('all');
    const hasChapterFilter = !activeFilters.chapters.includes('all');

    const uiPath = path.join(__dirname, "locker", "UI");

    const [missingItemBuffer, largeOverlayBuffer, smallOverlayBuffer] = await Promise.all([
      loadImageCached(path.join(uiPath, "images", "QuestionMark.png")),
      loadImageCached(path.join(uiPath, "images", "LargeOverlay.png")),
      loadImageCached(path.join(uiPath, "images", "SmallOverlay.png"))
    ]);

    const processedCosmetics: ProcessedCosmetic[] = [];
    for (const uc of userCosmetics) {
      const api = findCosmeticInAPI(uc.id, uc.type, uc.backendValue);
      if (uc.needsValidation && (!api || api.type?.backendValue !== uc.backendValue)) continue;

      let rarity = api?.rarity?.value?.toLowerCase() || "common";
      const seriesValue = api?.series?.value?.toLowerCase() || '';

      if (seriesValue) {
        const seriesMap: Record<string, string> = {
          'marvel': 'marvel', 'dc': 'dc', 'starwars': 'starwars',
          'gaminglegends': 'gaminglegends', 'icon': 'icon',
          'shadow': 'shadow', 'dark': 'dark', 'slurp': 'slurp',
          'frozen': 'frozen', 'lava': 'lava'
        };
        if (seriesMap[seriesValue]) rarity = seriesMap[seriesValue];
      }

      // Detectar si es exclusivo (SIEMPRE, para fondo dorado y ordenamiento)
      const extData = extendedDataMap.get(uc.id.toLowerCase());
      const isExclusive = extData?.isExclusive || false;
      
      // Aplicar filtros
      // Filtro de exclusivos
      if (activeFilters.exclusive) {
        if (!isExclusive) continue;
      }
      
      // Filtro de rareza (ahora es array)
      if (hasRarityFilter) {
        const cosmeticRarity = rarity.toLowerCase();
        if (!activeFilters.rarities.some(r => r.toLowerCase() === cosmeticRarity)) continue;
      }
      
      // Filtro de chapter (ahora es array)
      if (hasChapterFilter) {
        if (!extData || !activeFilters.chapters.includes(String(extData.chapter))) continue;
      }

      // Extract image URL based on cosmetic type
      let imageUrl: string | undefined;
      if (TRACK_TYPES.has(uc.type) || TRACK_TYPES.has(uc.originalType || '')) {
        // Tracks use albumArt
        imageUrl = api?.albumArt;
      } else if (BANNER_TYPES.has(uc.type) || BANNER_TYPES.has(uc.originalType || '')) {
        // Banners use images.smallIcon or images.icon
        imageUrl = api?.images?.smallIcon || api?.images?.icon;
      } else if (INSTRUMENT_TYPES.has(uc.type) || INSTRUMENT_TYPES.has(uc.originalType || '')) {
        // Instruments use images.small or images.large
        const img = api?.images ?? {};
        imageUrl = img.small || img.large || img.smallIcon || img.icon;
      } else if (VEHICLE_TYPES.has(uc.type) || VEHICLE_TYPES.has(uc.originalType || '')) {
        // Vehicle cosmetics use images.small or images.icon
        const img = api?.images ?? {};
        imageUrl = img.small || img.icon || img.smallIcon || img.large;
      } else {
        imageUrl = api?.images?.icon || api?.images?.smallIcon;
      }

      // Extract name (tracks use title, banners use name)
      let cosmeticName: string;
      if (TRACK_TYPES.has(uc.type) || TRACK_TYPES.has(uc.originalType || '')) {
        cosmeticName = api?.title || api?.name || uc.id || "?????";
      } else {
        cosmeticName = api?.name || uc.id || "?????";
      }

      processedCosmetics.push({
        name: cosmeticName,
        rarity,
        series: api?.series?.backendValue,
        imageUrl,
        added: api?.added,
        type: uc.originalType || uc.type,
        isExclusive
      });
    }

    if (processedCosmetics.length === 0) throw new Error("No cosmetics match the filters");

    const isAllTypes = activeFilters.types.includes('all');
    const sortedCosmetics = sortCosmetics(processedCosmetics, isAllTypes);
    const collumsCount = calculateOptimalDimensions(sortedCosmetics.length);
    const rows = Math.ceil(sortedCosmetics.length / collumsCount);

    const MAX_CANVAS_DIMENSION = 8192;
    let cardSize = CARD_SIZE;

    // Altura estimada de header + footer para cálculo preliminar
    const ESTIMATED_HEADER_FOOTER = 280; // Espacio reservado para logo, nombre, link, fecha
    
    // Calcular ancho: padding + columnas * (card + spacing) - último spacing
    let preliminaryWidth = CANVAS_PADDING * 2 + collumsCount * cardSize + (collumsCount - 1) * CARD_SPACING;
    // Calcular altura: padding + header + filas * (card + spacing) - último spacing + footer
    let preliminaryHeight = CANVAS_PADDING * 2 + ESTIMATED_HEADER_FOOTER + rows * cardSize + (rows - 1) * CARD_SPACING;

    if (preliminaryWidth > MAX_CANVAS_DIMENSION || preliminaryHeight > MAX_CANVAS_DIMENSION) {
      const maxDimension = Math.max(preliminaryWidth, preliminaryHeight);
      const reductionFactor = MAX_CANVAS_DIMENSION / maxDimension;
      cardSize = Math.floor(cardSize * reductionFactor * 0.95);
      preliminaryWidth = CANVAS_PADDING * 2 + collumsCount * cardSize + (collumsCount - 1) * CARD_SPACING;
      preliminaryHeight = CANVAS_PADDING * 2 + ESTIMATED_HEADER_FOOTER + rows * cardSize + (rows - 1) * CARD_SPACING;
      log(`Reduciendo cardSize a ${cardSize}px para caber en ${MAX_CANVAS_DIMENSION}px`);
    }

    const scaleFactor = Math.max(1, preliminaryWidth / 2000);
    const HEADER_HEIGHT = Math.max(80, Math.round(100 * scaleFactor)); // Espacio para logo Epic + nombre
    const FOOTER_HEIGHT = Math.max(120, Math.round(160 * scaleFactor)); // Espacio para logo bot + link + fecha
    const canvasWidth = preliminaryWidth;
    const cardsHeight = rows * cardSize + (rows - 1) * CARD_SPACING; // Altura de todas las tarjetas
    const canvasHeight = CANVAS_PADDING + HEADER_HEIGHT + cardsHeight + FOOTER_HEIGHT + CANVAS_PADDING;

    log(`Canvas: ${canvasWidth}x${canvasHeight}, Items: ${sortedCosmetics.length}, CardSize: ${cardSize}px`);

    const bgResizedCache = new Map<string, Buffer>();

    async function getResizedBg(series: string | undefined, rarity: string, isExclusive: boolean = false): Promise<Buffer> {
      // Si es exclusivo, usar fondo dorado
      if (isExclusive) {
        const key = 'exclusive_golden';
        let buffer = bgResizedCache.get(key);
        if (buffer) return buffer;

        // Crear fondo dorado con gradiente
        buffer = await sharp({
          create: {
            width: cardSize,
            height: cardSize,
            channels: 4,
            background: { r: 255, g: 215, b: 0, alpha: 1 } // Dorado #FFD700
          }
        })
        .composite([{
          input: Buffer.from(
            `<svg width="${cardSize}" height="${cardSize}">
              <defs>
                <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#FFD700;stop-opacity:1" />
                  <stop offset="50%" style="stop-color:#FFA500;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#FF8C00;stop-opacity:1" />
                </linearGradient>
              </defs>
              <rect width="${cardSize}" height="${cardSize}" fill="url(#gold)"/>
            </svg>`
          ),
          top: 0,
          left: 0
        }])
        .png()
        .toBuffer();
        
        bgResizedCache.set(key, buffer);
        return buffer;
      }

      const key = series || rarity;
      let buffer = bgResizedCache.get(key);
      if (buffer) return buffer;

      const bgPath = series 
        ? path.join(uiPath, "images", "series", `${series}.png`)
        : path.join(uiPath, "images", "rarities", `${rarity[0].toUpperCase()}${rarity.slice(1)}.png`);
      
      let raw = await loadImageCached(bgPath);
      if (!raw) raw = await loadImageCached(path.join(uiPath, "images", "rarities", "Common.png"));
      if (!raw) throw new Error('No background images found');
      
      buffer = await sharp(raw).resize(cardSize, cardSize, { fit: 'fill' }).png().toBuffer();
      bgResizedCache.set(key, buffer);
      return buffer;
    }

    const overlayKey = `${cardSize}`;
    let smallOverlay = resizedOverlayCache.get(`small_${overlayKey}`);
    let largeOverlay = resizedOverlayCache.get(`large_${overlayKey}`);
    let missingResized = resizedOverlayCache.get(`missing_${overlayKey}`);

    if (!smallOverlay && smallOverlayBuffer) {
      smallOverlay = await sharp(smallOverlayBuffer).resize(cardSize, cardSize, { fit: 'fill' }).ensureAlpha().png().toBuffer();
      resizedOverlayCache.set(`small_${overlayKey}`, smallOverlay);
    }
    if (!largeOverlay && largeOverlayBuffer) {
      largeOverlay = await sharp(largeOverlayBuffer).resize(cardSize, cardSize, { fit: 'fill' }).ensureAlpha().png().toBuffer();
      resizedOverlayCache.set(`large_${overlayKey}`, largeOverlay);
    }
    if (!missingResized && missingItemBuffer) {
      missingResized = await sharp(missingItemBuffer).resize(cardSize, cardSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().png().toBuffer();
      resizedOverlayCache.set(`missing_${overlayKey}`, missingResized);
    }

    const cardPromises = sortedCosmetics.map(async (cosmetic, idx) => {
      const x = CANVAS_PADDING + (idx % collumsCount) * (cardSize + CARD_SPACING);
      const y = CANVAS_PADDING + HEADER_HEIGHT + Math.floor(idx / collumsCount) * (cardSize + CARD_SPACING);

      try {
        // Descargar imagen del cosmético
        let itemBuffer: Buffer | null = null;
        if (cosmetic.imageUrl) {
          itemBuffer = await downloadImageBuffer(cosmetic.imageUrl);
          if (!itemBuffer) {
            log(`⚠️ Usando fallback para: ${cosmetic.name}`);
          }
        }
        
        // Si no se pudo descargar, usar imagen de respaldo
        if (!itemBuffer && missingItemBuffer) {
          itemBuffer = missingItemBuffer;
        }
        
        if (!itemBuffer) return null;

        const bgBuffer = await getResizedBg(cosmetic.series, cosmetic.rarity, cosmetic.isExclusive || false);

        // Redimensionar item
        const itemResized = await sharp(itemBuffer)
          .resize(cardSize, cardSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .ensureAlpha()
          .png()
          .toBuffer();

        const useSmall = cosmetic.name.length <= 15;
        const overlay = useSmall ? smallOverlay : largeOverlay;
        const fontSize = Math.max(14, Math.min(20, Math.floor(200 / Math.max(cosmetic.name.length, 1))));
        const textY = useSmall ? Math.round(cardSize * 0.80) : Math.round(cardSize * 0.72);
        const textSVG = createTextSVG(cosmetic.name, fontSize, 'white', cardSize - 16, cardSize - textY);
        const textX = Math.max(0, Math.round((cardSize - textSVG.width) / 2));

        const card = await sharp(bgBuffer)
          .composite([
            { input: itemResized, top: 0, left: 0 },
            { input: overlay!, top: 0, left: 0 },
            { input: textSVG.svg, top: Math.min(textY, cardSize - textSVG.height), left: textX }
          ])
          .png()
          .toBuffer();

        return { buffer: card, x, y };
      } catch (error) {
        log(`❌ Error procesando tarjeta: ${cosmetic.name}`, error);
        return null;
      }
    });

    const cards = (await Promise.all(cardPromises)).filter(Boolean) as { buffer: Buffer; x: number; y: number }[];
    log(`Tarjetas: ${cards.length}/${sortedCosmetics.length}`);

    const composites = cards
      .filter(c => c.x >= 0 && c.y >= 0 && c.x + cardSize <= canvasWidth && c.y + cardSize <= canvasHeight)
      .map(c => ({ input: c.buffer, top: c.y, left: c.x }));

    // Procesamiento normal: primero crear canvas con tarjetas, luego aplicar header/footer
    const canvas = await sharp({
      create: { width: canvasWidth, height: canvasHeight, channels: 4, background: { r: 10, g: 14, b: 39, alpha: 1 } }
    }).composite(composites).png({ compressionLevel: 0 }).toBuffer();

    const headerFooterComposites: any[] = [];
    const logoSizeHeader = Math.round((canvasWidth < 800 ? 45 : canvasWidth < 1500 ? 70 : 100) * scaleFactor);
    const logoSizeFooter = Math.round((canvasWidth < 800 ? 55 : canvasWidth < 1500 ? 85 : 120) * scaleFactor);
    const headerFontSize = Math.max(16, Math.min(200, Math.round(28 * canvasWidth / 800)));
    const footerFontSize = Math.max(16, Math.min(200, Math.round(24 * canvasWidth / 800)));

    if (displayName) {
      const censoredName = censorDisplayName(displayName);
      const headerSpacing = Math.max(10, Math.round(15 * scaleFactor));
      const headerMargin = Math.max(15, Math.round(25 * scaleFactor));
      const headerLogoY = Math.max(10, Math.round(15 * scaleFactor));
      const headerTextLeft = headerMargin + logoSizeHeader + headerSpacing;
      const headerMaxTextW = Math.max(50, canvasWidth - headerTextLeft - 10);
      const textSVG = createTextSVG(censoredName, headerFontSize, 'white', headerMaxTextW);
      const headerTextY = headerLogoY + Math.round((logoSizeHeader - textSVG.height) / 2);

      if (epicLogoBuffer) {
        const logo = await sharp(epicLogoBuffer).resize(
          Math.min(logoSizeHeader, canvasWidth - headerMargin),
          Math.min(logoSizeHeader, canvasHeight - headerLogoY),
          { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } },
        ).toBuffer();
        headerFooterComposites.push({ input: logo, top: headerLogoY, left: headerMargin });
      }

      if (headerTextLeft + textSVG.width <= canvasWidth && Math.max(0, headerTextY) + textSVG.height <= canvasHeight) {
        headerFooterComposites.push({ input: textSVG.svg, top: Math.max(0, headerTextY), left: headerTextLeft });
      }
    }

    const now = new Date();
    const footerDateStr = `${String(now.getDate()).padStart(2, '0')} ${now.toLocaleString('en', { month: 'long' })} ${now.getFullYear()}`;
    const footerMargin = Math.max(15, Math.round(25 * scaleFactor));
    const footerDateFontSize = Math.max(12, Math.min(150, Math.round(16 * canvasWidth / 800)));
    const textSpacing = Math.max(2, Math.round(4 * scaleFactor));
    const horizontalSpacing = Math.max(8, Math.round(12 * scaleFactor));
    
    // Crear textos del footer — clamp max width
    const footerMaxTextW = Math.max(50, canvasWidth - footerMargin * 2 - logoSizeFooter - horizontalSpacing - 10);
    const footerText = createTextSVG(DISCORD_INVITE_URL, footerFontSize, '#1E90FF', footerMaxTextW);
    const footerDate = createTextSVG(footerDateStr, footerDateFontSize, 'white', footerMaxTextW);
    
    // Calcular altura total necesaria para las dos líneas de texto
    const textBlockHeight = footerText.height + textSpacing + footerDate.height;
    const footerLogoSize = Math.min(Math.max(textBlockHeight, logoSizeFooter), canvasHeight / 3);
    
    // Posición Y del footer (desde el final del canvas)
    const footerStartY = Math.max(0, canvasHeight - footerLogoSize - Math.max(10, Math.round(15 * scaleFactor)));
    
    // Logo del bot a la izquierda (ocupando altura de las dos líneas)
    if (botLogoBuffer) {
      const fls = Math.min(footerLogoSize, canvasWidth - footerMargin, canvasHeight - footerStartY);
      if (fls > 0) {
        const logo = await sharp(botLogoBuffer).resize(fls, fls, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
        headerFooterComposites.push({ input: logo, top: footerStartY, left: footerMargin });
      }
    }
    
    // Textos a la derecha del logo
    const textX = footerMargin + footerLogoSize + horizontalSpacing;
    
    // Centrar verticalmente el bloque de texto respecto al logo
    const textBlockStartY = footerStartY + Math.round((footerLogoSize - textBlockHeight) / 2);
    
    // Link de Discord arriba — safe bounds check
    if (textX + footerText.width <= canvasWidth && textBlockStartY >= 0 && textBlockStartY + footerText.height <= canvasHeight) {
      headerFooterComposites.push({ input: footerText.svg, top: textBlockStartY, left: textX });
    }
    
    // Fecha abajo del link
    const footerDateY = textBlockStartY + footerText.height + textSpacing;
    if (textX + footerDate.width <= canvasWidth && footerDateY >= 0 && footerDateY + footerDate.height <= canvasHeight) {
      headerFooterComposites.push({ input: footerDate.svg, top: footerDateY, left: textX });
    }

    // Aplicar header/footer
    let composedImage: Buffer;
    if (headerFooterComposites.length > 0) {
      composedImage = await sharp(canvas)
        .composite(headerFooterComposites)
        .png({ compressionLevel: 6, adaptiveFiltering: true })
        .toBuffer();
    } else {
      composedImage = canvas;
    }

    // Verificar tamaño y comprimir si es necesario
    let fileSizeMB = composedImage.length / (1024 * 1024);
    let finalImage = composedImage;
    let isJpeg = false;

    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      log(`Imagen muy grande (${fileSizeMB.toFixed(2)}MB), comprimiendo a JPEG...`);
      
      // Intentar con PNG máxima compresión primero
      const pngMaxCompressed = await sharp(composedImage)
        .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true })
        .toBuffer();
      
      fileSizeMB = pngMaxCompressed.length / (1024 * 1024);
      
      if (fileSizeMB <= MAX_FILE_SIZE_MB) {
        finalImage = pngMaxCompressed;
        log(`PNG comprimido: ${fileSizeMB.toFixed(2)}MB`);
      } else {
        // Convertir a JPEG con calidad progresiva
        let quality = JPEG_QUALITY_START;
        
        while (quality >= JPEG_QUALITY_MIN) {
          const jpegBuffer = await sharp(composedImage)
            .flatten({ background: { r: 10, g: 14, b: 39 } }) // Fondo del locker
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
          
          fileSizeMB = jpegBuffer.length / (1024 * 1024);
          log(`JPEG quality ${quality}: ${fileSizeMB.toFixed(2)}MB`);
          
          if (fileSizeMB <= MAX_FILE_SIZE_MB) {
            finalImage = jpegBuffer;
            isJpeg = true;
            break;
          }
          
          quality -= 10;
        }
        
        // Si aún es muy grande, usar la última versión JPEG
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          finalImage = await sharp(composedImage)
            .flatten({ background: { r: 10, g: 14, b: 39 } })
            .jpeg({ quality: JPEG_QUALITY_MIN, mozjpeg: true })
            .toBuffer();
          isJpeg = true;
          fileSizeMB = finalImage.length / (1024 * 1024);
          log(`JPEG mínimo: ${fileSizeMB.toFixed(2)}MB`);
        }
      }
    }

    if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

    const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    const extension = isJpeg ? 'jpg' : 'png';
    let version = 1;
    let fileName = `locker_${dateStr}_v${version}.${extension}`;
    while (fs.existsSync(path.join(savePath, fileName))) {
      version++;
      fileName = `locker_${dateStr}_v${version}.${extension}`;
    }

    await fs.promises.writeFile(path.join(savePath, fileName), finalImage);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const sizeMB = (finalImage.length / (1024 * 1024)).toFixed(2);
    log(`Generado en ${totalTime}s: ${fileName} (${sizeMB}MB)`);

    return { success: true, fileName, path: path.join(savePath, fileName), count: sortedCosmetics.length, time: totalTime, sizeMB };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export function clearApiCache() {
  apiCosmeticsCache = null;
  apiCacheTimestamp = null;
  log('[API CACHE] Cache limpiado manualmente');
}

export function getCacheStats() {
  if (!apiCosmeticsCache) {
    return { cached: false, items: 0, age: 0, ttl: API_CACHE_TTL };
  }

  const age = Date.now() - (apiCacheTimestamp || 0);
  const remaining = Math.max(0, API_CACHE_TTL - age);

  return {
    cached: true,
    items: apiCosmeticsCache.length,
    ageSeconds: Math.floor(age / 1000),
    remainingSeconds: Math.floor(remaining / 1000),
    ttlSeconds: Math.floor(API_CACHE_TTL / 1000)
  };
}
