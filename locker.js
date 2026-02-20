// npm install axios @xmpp/client @xmpp/websocket
const axios  = require('axios');
const { client, xml } = require('@xmpp/client');

// ─── Config ────────────────────────────────────────────────

const ACCOUNT_ID    = 'ecf80f2784864f538dd9033b43068412';
const DEVICE_ID     = '2c4f9f79e68c4f9d9b794bb310aefbc2';
const DEVICE_SECRET = 'UGX66UJHGMJBQT34DM6CP2IYTUJPLOFB';
const DISPLAY_NAME  = 'SenioritaPaca';

const LOADOUT = {
  character:         { itemId: null, variants: [] },  // "AthenaCharacter:cid_xxx"
  backpack:          { itemId: null, variants: [] },  // "AthenaBackpack:bid_xxx"
  pickaxe:           { itemId: null, variants: [] },  // "AthenaPickaxe:pickaxe_xxx"
  glider:            { itemId: null, variants: [] },  // "AthenaGlider:glider_xxx"
  contrail:          { itemId: null, variants: [] },  // "AthenaSkyDiveContrail:trails_xxx"
  shoes:             { itemId: null, variants: [] },  // "CosmeticShoes:shoes_xxx"
  aura:              { itemId: null, variants: [] },  // "SparksAura:sparksaura_xxx"
  vehicleBody:       { itemId: null, variants: [] },
  vehicleSkin:       { itemId: null, variants: [] },
  vehicleWheels:     { itemId: null, variants: [] },
  vehicleDriftTrail: { itemId: null, variants: [] },
  vehicleBoost:      { itemId: null, variants: [] },
};

// ─── Constants ─────────────────────────────────────────────

const ANDROID_AUTH  = Buffer.from('3f69e56c7649492c8cc29f1af08a8a12:b51ee9cb12234f50a69efa67ef53812e').toString('base64');
const LAUNCHER_AUTH = Buffer.from('34a02cf8f4414e29b15921876da36f9a:daafbccc737745039dffe53d94fc76cf').toString('base64');
const FN_EOS_AUTH   = Buffer.from('ec684b8c687f479fadea3cb2ad83f5c6:e1f31c211f28413186262d37a13fc84d').toString('base64');

const OAUTH_TOKEN   = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token';
const EXCHANGE_URL  = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/exchange';
const EOS_AUTH_URL  = 'https://api.epicgames.dev/auth/v1/oauth/token';
const DEPLOYMENT_ID = '62a9473a2dca46b29ccf17577fcf42d7';
const LOCKER_BASE   = `https://fngw-svc-gc-livefn.ol.epicgames.com/api/locker/v4/${DEPLOYMENT_ID}/account`;
const PARTY_BASE    = 'https://party-service-prod.ol.epicgames.com/party/api/v1/Fortnite';
const XMPP_SERVER   = 'xmpp-service-prod.ol.epicgames.com';
const EPIC_PROD_ENV = 'prod.ol.epicgames.com';

const SLOT_TEMPLATE = {
  character:         'CosmeticLoadoutSlotTemplate:LoadoutSlot_Character',
  backpack:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_Backpack',
  pickaxe:           'CosmeticLoadoutSlotTemplate:LoadoutSlot_Pickaxe',
  glider:            'CosmeticLoadoutSlotTemplate:LoadoutSlot_Glider',
  contrail:          'CosmeticLoadoutSlotTemplate:LoadoutSlot_Contrails',
  shoes:             'CosmeticLoadoutSlotTemplate:LoadoutSlot_Shoes',
  aura:              'CosmeticLoadoutSlotTemplate:LoadoutSlot_Aura',
  vehicleBody:       'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Body',
  vehicleSkin:       'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Skin',
  vehicleWheels:     'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Wheels',
  vehicleDriftTrail: 'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_DriftTrail',
  vehicleBoost:      'CosmeticLoadoutSlotTemplate:LoadoutSlot_Vehicle_Boost',
};

// ─── Auth ──────────────────────────────────────────────────

async function getAndroidToken() {
  const res = await axios.post(OAUTH_TOKEN, new URLSearchParams({
    grant_type: 'device_auth', account_id: ACCOUNT_ID,
    device_id: DEVICE_ID, secret: DEVICE_SECRET, token_type: 'eg1',
  }).toString(), {
    headers: { Authorization: `basic ${ANDROID_AUTH}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15_000,
  });
  console.log(`OK Login: ${res.data.displayName} (${res.data.account_id})`);
  return res.data.access_token;
}

async function exchangeTo(token, clientAuth, label) {
  const { data: { code } } = await axios.get(EXCHANGE_URL, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 15_000,
  });
  const res = await axios.post(OAUTH_TOKEN, new URLSearchParams({
    grant_type: 'exchange_code', exchange_code: code, token_type: 'eg1',
  }).toString(), {
    headers: { Authorization: `basic ${clientAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15_000,
  });
  console.log(`OK Token de ${label} obtenido`);
  return res.data.access_token;
}

const getLauncherToken = t => exchangeTo(t, LAUNCHER_AUTH, 'Launcher');
const getFnToken       = t => exchangeTo(t, ANDROID_AUTH,  'Fortnite');

async function getEosToken(epicToken) {
  const crypto = require('crypto');
  const res = await axios.post(EOS_AUTH_URL, new URLSearchParams({
    grant_type: 'external_auth', external_auth_type: 'epicgames_access_token',
    external_auth_token: epicToken, deployment_id: DEPLOYMENT_ID,
    nonce: crypto.randomBytes(8).toString('hex'),
  }).toString(), {
    headers: {
      Authorization: `Basic ${FN_EOS_AUTH}`, 'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'EOS-SDK/1.16.3000-33300249 (Windows/10.0.19041.4165.64bit) Fortnite/++Fortnite+Release-30.00-CL-33962396',
      'X-EOS-Version': '1.16.3000-33300249',
      'X-Epic-Correlation-ID': 'EOS-' + crypto.randomBytes(16).toString('hex').toUpperCase(),
    },
    timeout: 15_000,
  });
  console.log('OK Token EOS obtenido');
  return res.data.access_token;
}

// ─── XMPP ──────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function connectXmpp(fnToken) {
  const crypto     = require('crypto');
  const resourceId = `V2:Fortnite:WIN::${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
  const jid        = `${ACCOUNT_ID}@${EPIC_PROD_ENV}/${resourceId}`;

  return new Promise((resolve, reject) => {
    const xmpp = client({
      service:  `wss://${XMPP_SERVER}:443`,
      domain:   EPIC_PROD_ENV,
      username: ACCOUNT_ID,
      password: fnToken,
      resource: resourceId,
    });

    xmpp.on('online', async () => {
      await xmpp.send(xml('presence', {}, [
        xml('status', {}, JSON.stringify({
          Status: 'Playing Battle Royale',
          bIsPlaying: true,
          bIsJoinable: false,
          bHasVoiceSupport: false,
          SessionId: '',
          ProductName: 'Fortnite',
          Properties: {
            'party.joininfodata.sourceplatform_s': 'WIN',
            'KairosProfile_image': 'CID_A_272_Athena_Commando_F_Prime',
            'KairosProfile_color': '["eba409","6f3b0e","f7c563","e6c88a"]',
          }
        })),
      ]));
      // Esperar a que Epic registre la presencia
      await sleep(2000);
      console.log(`OK XMPP online (${resourceId})`);
      resolve({ xmpp, jid });
    });

    xmpp.on('error', () => {});
    setTimeout(() => reject(new Error('XMPP timeout')), 20_000);
    xmpp.start().catch(reject);
  });
}

async function disconnectXmpp(xmpp) {
  try { await xmpp.stop(); } catch (_) {}
}

// ─── Party ─────────────────────────────────────────────────

const DEFAULT_PARTY_META = {
  'Default:PartyState_s':              'BattleRoyaleView',
  'Default:AthenaSquadFill_b':         'true',
  'Default:AthenaPrivateMatch_b':      'false',
  'Default:AllowJoinInProgress_b':     'false',
  'Default:RegionId_s':                'EU',
  'Default:CurrentRegionId_s':         'EU',
  'Default:CustomMatchKey_s':          '',
  'Default:PrivacySettings_j':         JSON.stringify({ PrivacySettings: { partyType: 'Public', partyInviteRestriction: 'AnyMember', bOnlyLeaderFriendsCanJoin: false } }),
  'Default:SquadInformation_j':        JSON.stringify({ SquadInformation: { rawSquadAssignments: [{ memberId: ACCOUNT_ID, absoluteMemberIdx: 0 }], squadData: [] } }),
  'Default:PlaylistData_j':            JSON.stringify({ PlaylistData: { playlistName: 'Playlist_DefaultSquad', tournamentId: '', eventWindowId: '', linkId: { mnemonic: 'playlist_defaultsquad', version: -1 } } }),
  'Default:PlatformSessions_j':        JSON.stringify({ PlatformSessions: [] }),
  'Default:TileStates_j':              JSON.stringify({ TileStates: [] }),
  'Default:ZoneInstanceId_s':          '',
  'Default:GameSessionKey_s':          '',
  'Default:PrimaryGameSessionId_s':    '',
  'Default:LFGTime_s':                 '0001-01-01T00:00:00.000Z',
  'Default:MatchmakingInfoString_s':   '',
  'Default:PartyIsJoinedInProgress_b': 'false',
  'Default:ActivityName_s':            '',
  'Default:ActivityType_s':            'Undefined',
  'Default:PartyMatchmakingInfo_j':    JSON.stringify({ PartyMatchmakingInfo: { buildId: -1, hotfixVersion: -1, regionId: '', playlistName: 'None', playlistRevision: 0, tournamentId: '', eventWindowId: '', linkCode: '' } }),
  'Default:CreativeDiscoverySurfaceRevisions_j': JSON.stringify({ CreativeDiscoverySurfaceRevisions: [] }),
  'Default:CreativePortalCountdownStartTime_s': '0001-01-01T00:00:00.000Z',
  'urn:epic:cfg:accepting-members_b':  'true',
  'urn:epic:cfg:build-id_s':           '1:3:',
  'urn:epic:cfg:can-join_b':           'true',
  'urn:epic:cfg:chat-enabled_b':       'true',
  'urn:epic:cfg:invite-perm_s':        'Anyone',
  'urn:epic:cfg:join-request-action_s': 'Manual',
  'urn:epic:cfg:party-type-id_s':      'default',
  'urn:epic:cfg:presence-perm_s':      'Anyone',
  'VoiceChat:implementation_s':        'VivoxVoiceChat',
};

// Crea una party nueva y devuelve el objeto completo de la party
async function createParty(fnToken, jid) {
  const res = await axios.post(`${PARTY_BASE}/parties`, {
    config: {
      join_confirmation: true, joinability: 'OPEN', max_size: 16,
      sub_type: 'default', type: 'DEFAULT', invite_ttl_seconds: 14400,
      discoverability: 'ALL',
    },
    join_info: {
      connection: {
        id:   jid,  // mismo JID que el XMPP activo
        meta: { 'urn:epic:conn:platform_s': 'WIN', 'urn:epic:conn:type_s': 'game' },
        yield_leadership: false,
      },
      meta: {
        'urn:epic:member:dn_s':          DISPLAY_NAME,
        'urn:epic:member:type_s':        'game',
        'urn:epic:member:platform_s':    'WIN',
        'urn:epic:member:joinrequest_j': JSON.stringify({ CrossplayPreference_i: '1' }),
      },
    },
    meta: DEFAULT_PARTY_META,
  }, {
    headers: { Authorization: `Bearer ${fnToken}`, 'Content-Type': 'application/json' },
    timeout: 15_000,
    validateStatus: () => true,
  });

  if (res.status >= 200 && res.status < 300) {
    console.log(`OK Party creada (${res.data.id})`);
    return res.data;  // contiene { id, members: [...] }
  }
  throw new Error(`createParty ${res.status}: ${JSON.stringify(res.data)}`);
}

// Obtiene la party específica por ID
async function fetchPartyById(fnToken, partyId) {
  const res = await axios.get(`${PARTY_BASE}/parties/${partyId}`, {
    headers: { Authorization: `Bearer ${fnToken}` },
    timeout: 15_000,
    validateStatus: () => true,
  });
  if (res.status !== 200) return null;
  return res.data;
}

// Obtiene la party actual del usuario + su ID
async function fetchCurrentParty(fnToken) {
  const res = await axios.get(`${PARTY_BASE}/user/${ACCOUNT_ID}`, {
    headers: { Authorization: `Bearer ${fnToken}` },
    timeout: 15_000,
    validateStatus: () => true,
  });
  if (res.status !== 200) return null;
  const party = res.data?.current?.[0];
  if (!party) return null;
  return party;  // ya tiene { id, members: [...] }
}

// ─── Parseo meta — replica exacta de PartyMemberMeta.ts ───

function metaGetJson(schema, key) {
  return schema[key] ? JSON.parse(schema[key]) : {};
}

// Replica /(?<=\w*\.)\w*/ de PartyMemberMeta
function defToId(def) {
  if (!def || def === 'None') return null;
  return def.match(/(?<=\w*\.)\w*/)?.shift() ?? null;
}

function parseLockerFromMeta(schema) {
  const cl = metaGetJson(schema, 'Default:AthenaCosmeticLoadout_j')?.AthenaCosmeticLoadout;
  if (!cl) return null;

  return {
    character: cl.characterPrimaryAssetId || null,
    backpack:  defToId(cl.backpackDef)  ? `AthenaBackpack:${defToId(cl.backpackDef)}`        : null,
    pickaxe:   defToId(cl.pickaxeDef)   ? `AthenaPickaxe:${defToId(cl.pickaxeDef)}`         : null,
    contrail:  defToId(cl.contrailDef)  ? `AthenaSkyDiveContrail:${defToId(cl.contrailDef)}` : null,
    shoes:     defToId(cl.shoesDef)     ? `CosmeticShoes:${defToId(cl.shoesDef)}`           : null,
    glider:    null,
    aura:      null,
  };
}

// ─── GET locker desde una party ───────────────────────────

function getMemberFromParty(party) {
  return party?.members?.find(m => m.account_id === ACCOUNT_ID) ?? null;
}

async function getCurrentLocker(fnToken, jid) {
  // 1. Buscar party actual del usuario
  let party = await fetchCurrentParty(fnToken);

  if (party) {
    console.log(`INFO Party encontrada (${party.id})`);
    // 2. Obtener la party específica por ID para asegurarnos de tener la meta completa
    const fullParty = await fetchPartyById(fnToken, party.id);
    if (fullParty) party = fullParty;
  } else {
    // 3. No hay party — crear una
    console.log('INFO No hay party activa — creando una...');
    party = await createParty(fnToken, jid);
  }

  // 4. Buscar al miembro propio en esa party específica
  const me = getMemberFromParty(party);
  if (!me) throw new Error('No se encontró el miembro propio en la party');

  console.log(`INFO Leyendo meta del miembro en party (${party.id})`);

  const equipped = parseLockerFromMeta(me.meta);
  if (!equipped) throw new Error('No se pudo parsear AthenaCosmeticLoadout_j');

  return { partyId: party.id, equipped };
}

function printLocker(locker) {
  console.log('\n── Locker equipado actualmente ───────────────');
  for (const [slot, val] of Object.entries(locker.equipped)) {
    console.log(`   ${slot.padEnd(12)}: ${val ?? '(vacío)'}`);
  }
  console.log('──────────────────────────────────────────────\n');
}

// ─── Payload y PUT ─────────────────────────────────────────

function buildLockerPayload() {
  const CHARACTER_KEYS = ['character','backpack','pickaxe','glider','contrail','shoes','aura'];
  const VEHICLE_KEYS   = ['vehicleBody','vehicleSkin','vehicleWheels','vehicleDriftTrail','vehicleBoost'];
  const charSlots = [], vehSlots = [];

  for (const k of CHARACTER_KEYS) {
    const cfg = LOADOUT[k];
    if (cfg?.itemId) charSlots.push({ slotTemplate: SLOT_TEMPLATE[k], equippedItemId: cfg.itemId, itemCustomizations: cfg.variants || [] });
  }
  for (const k of VEHICLE_KEYS) {
    const cfg = LOADOUT[k];
    if (cfg?.itemId) vehSlots.push({ slotTemplate: SLOT_TEMPLATE[k], equippedItemId: cfg.itemId, itemCustomizations: cfg.variants || [] });
  }

  const changes = [...CHARACTER_KEYS, ...VEHICLE_KEYS].filter(k => LOADOUT[k]?.itemId !== null);
  if (changes.length === 0) throw new Error('No hay ningún campo para cambiar. Rellena al menos uno en LOADOUT.');

  console.log('Slots a actualizar: ' + changes.join(', '));
  return {
    loadouts: {
      'CosmeticLoadout:LoadoutSchema_Character':   { loadoutSlots: charSlots, shuffleType: 'DISABLED' },
      'CosmeticLoadout:LoadoutSchema_Vehicle_SUV': { loadoutSlots: vehSlots },
    },
  };
}

async function updateLocker(eosToken, payload) {
  const res = await axios.put(
    `${LOCKER_BASE}/${ACCOUNT_ID}/active-loadout-group`,
    payload,
    {
      headers: { Authorization: `Bearer ${eosToken}`, 'Content-Type': 'application/json' },
      timeout: 15_000,
      validateStatus: () => true,
    }
  );
  if (res.status >= 200 && res.status < 300) {
    console.log(`✅ Locker actualizado correctamente (${res.status})`);
  } else {
    console.error(`❌ Error (${res.status}): ${res.data?.message || JSON.stringify(res.data)}`);
  }
}

// ─── Main ──────────────────────────────────────────────────

(async () => {
  let xmpp;
  try {
    console.log('=== Fortnite EOS: Update Locker ===\n');

    const androidToken  = await getAndroidToken();
    const launcherToken = await getLauncherToken(androidToken);
    const fnToken       = await getFnToken(androidToken);
    const eosToken      = await getEosToken(launcherToken);

    const { xmpp: x, jid } = await connectXmpp(fnToken);
    xmpp = x;

    const locker = await getCurrentLocker(fnToken, jid);
    printLocker(locker);

    const payload = buildLockerPayload();
    await updateLocker(eosToken, payload);

  } catch (err) {
    const data = err?.response?.data;
    console.error('\nERROR:', data?.message || data?.errorMessage || err.message);
    process.exit(1);
  } finally {
    if (xmpp) await disconnectXmpp(xmpp);
  }
})();