// npm install axios
const axios = require('axios');

// ─── Config ────────────────────────────────────────────────


const ACCOUNT_ID    = 'ecf80f2784864f538dd9033b43068412';
const DEVICE_ID     = '2c4f9f79e68c4f9d9b794bb310aefbc2';
const DEVICE_SECRET = 'UGX66UJHGMJBQT34DM6CP2IYTUJPLOFB';

// Deja null los campos que NO quieras cambiar
const CHANGES = {
  displayName:       null,   // Solo a-z A-Z 0-9 . _ - espacios (sin ñ ni tildes), 3-16 chars
  name:              null,   // Tu nombre real
  lastName:          null,   // Tu apellido
  preferredLanguage: null,   // 'es', 'en', 'de', 'fr', 'it', 'pt'...
  phoneNumber:       null,   // '+34612345678'
  company:           null,   // Nombre de empresa
};

// ─── Clients ───────────────────────────────────────────────

const ANDROID_AUTH = Buffer.from(
  '3f69e56c7649492c8cc29f1af08a8a12:b51ee9cb12234f50a69efa67ef53812e'
).toString('base64');

const LAUNCHER_AUTH = Buffer.from(
  '34a02cf8f4414e29b15921876da36f9a:daafbccc737745039dffe53d94fc76cf'
).toString('base64');

const OAUTH_TOKEN  = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token';
const ACCOUNT_API  = 'https://account-public-service-prod.ol.epicgames.com/account/api/public/account';
const EXCHANGE_URL = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/exchange';

const DISPLAY_NAME_COOLDOWN_DAYS = 14;

// ─── Helpers ───────────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

function getDisplayNameStatus(info) {
  if (info.canUpdateDisplayName) {
    return '✅ Puedes cambiar el displayName ahora';
  }

  if (info.lastDisplayNameChange) {
    const last      = new Date(info.lastDisplayNameChange);
    const available = new Date(last.getTime() + DISPLAY_NAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const now       = new Date();
    const diffMs    = available - now;

    if (diffMs > 0) {
      const diffDays  = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      return `❌ No puedes cambiar el displayName — disponible en ${diffDays}d ${diffHours}h (${formatDate(available)})`;
    }
  }

  return '❌ No puedes cambiar el displayName';
}

function getEmailStatus(info) {
  if (!info.emailVerified) return '⚠️  Email no verificado — verifica tu email antes de poder cambiarlo';
  return '✅ Email verificado — puedes cambiarlo (requiere confirmacion desde el correo)';
}

// ─── Validacion ────────────────────────────────────────────

function buildPayload() {
  const errors  = [];
  const payload = {};

  for (const [key, val] of Object.entries(CHANGES)) {
    if (val === null) continue;
    payload[key] = val;
  }

  if (payload.displayName !== undefined) {
    if (payload.displayName.length < 3 || payload.displayName.length > 16)
      errors.push('displayName: debe tener entre 3 y 16 caracteres');
    if (!/^[a-zA-Z0-9 ._-]+$/.test(payload.displayName))
      errors.push('displayName: solo a-z A-Z 0-9 espacios . _ - (sin n~ ni tildes)');
  }

  if (payload.preferredLanguage !== undefined) {
    if (!/^[a-z]{2}(-[a-z]{2})?$/i.test(payload.preferredLanguage))
      errors.push("preferredLanguage: formato incorrecto, usa 'es', 'en', 'de'...");
  }

  if (payload.phoneNumber !== undefined) {
    if (!/^\+?[0-9\s\-()]{7,20}$/.test(payload.phoneNumber))
      errors.push('phoneNumber: formato incorrecto, ej: +34612345678');
  }

  if (errors.length > 0)
    throw new Error('Errores de validacion:\n  - ' + errors.join('\n  - '));

  return payload;
}

// ─── Auth ──────────────────────────────────────────────────

async function getAndroidToken() {
  const params = new URLSearchParams({
    grant_type: 'device_auth',
    account_id:  ACCOUNT_ID,
    device_id:   DEVICE_ID,
    secret:      DEVICE_SECRET,
    token_type:  'eg1',
  });

  const res = await axios.post(OAUTH_TOKEN, params.toString(), {
    headers: { Authorization: `basic ${ANDROID_AUTH}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15_000,
  });

  console.log(`OK Login: ${res.data.displayName} (${res.data.account_id})`);
  return res.data.access_token;
}

async function getLauncherToken(androidToken) {
  const exchange = await axios.get(EXCHANGE_URL, {
    headers: { Authorization: `Bearer ${androidToken}` },
    timeout: 15_000,
  });

  const params = new URLSearchParams({
    grant_type:    'exchange_code',
    exchange_code:  exchange.data.code,
    token_type:    'eg1',
  });

  const res = await axios.post(OAUTH_TOKEN, params.toString(), {
    headers: { Authorization: `basic ${LAUNCHER_AUTH}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15_000,
  });

  return res.data.access_token;
}

// ─── GET account info ──────────────────────────────────────

async function getAccountInfo(token) {
  const res = await axios.get(`${ACCOUNT_API}/${ACCOUNT_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });
  return res.data;
}

// ─── PUT update ────────────────────────────────────────────

async function updateAccount(token, payload) {
  console.log('\nCampos a actualizar:');
  for (const [key, val] of Object.entries(payload))
    console.log(`   ${key}: ${val}`);

  const res = await axios.put(`${ACCOUNT_API}/${ACCOUNT_ID}`, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 15_000,
    validateStatus: () => true,
  });

  const info = res.data?.accountInfo || res.data;

  if (res.status >= 200 && res.status < 300) {
    console.log(`\n✅ Cuenta actualizada correctamente (${res.status})`);
    const SHOW = ['displayName', 'name', 'lastName', 'preferredLanguage', 'phoneNumber', 'company', 'email'];
    for (const key of SHOW) {
      if (info[key] !== undefined) console.log(`   ${key}: ${info[key]}`);
    }
    // Mostrar estado actualizado de disponibilidad
    console.log('\n── Disponibilidad tras el cambio ──');
    console.log('  ' + getDisplayNameStatus(info));
    console.log('  ' + getEmailStatus(info));
  } else {
    console.error(`\n❌ Error (${res.status}): ${res.data?.errorMessage || JSON.stringify(res.data)}`);
    for (const key of Object.keys(payload))
      console.error(`   ✖ ${key}`);
  }
}

// ─── Main ──────────────────────────────────────────────────

(async () => {
  try {
    console.log('=== Epic Games: Update Account ===\n');

    const payload       = buildPayload();
    const androidToken  = await getAndroidToken();
    const launcherToken = await getLauncherToken(androidToken);

    // ── Mostrar estado actual antes de cambiar nada ────────
    const info = await getAccountInfo(launcherToken);
    console.log('\n── Estado actual de la cuenta ────────────────');
    console.log(`   displayName:       ${info.displayName}`);
    console.log(`   email:             ${info.email}`);
    console.log(`   preferredLanguage: ${info.preferredLanguage ?? 'no definido'}`);
    console.log(`   name:              ${info.name ?? ''} ${info.lastName ?? ''}`.trim() || '   name: no definido');
    console.log(`   phoneNumber:       ${info.phoneNumber ?? 'no definido'}`);
    console.log(`   company:           ${info.company ?? 'no definido'}`);
    console.log('\n── Disponibilidad ────────────────────────────');
    console.log('   ' + getDisplayNameStatus(info));
    console.log('   ' + getEmailStatus(info));
    console.log('──────────────────────────────────────────────\n');

    // Advertir si intentan cambiar displayName sin poder
    if (payload.displayName !== undefined && !info.canUpdateDisplayName) {
      console.error('❌ Abortado: canUpdateDisplayName es false — ' + getDisplayNameStatus(info));
      process.exit(1);
    }

    await updateAccount(launcherToken, payload);

  } catch (err) {
    const data = err?.response?.data;

    if (data?.numericErrorCode === 18206) {
      console.error(`\nERROR Corrective action requerida: ${data.correctiveAction}`);
      console.error(`      Resuelvela en: ${data.continuationUrl}`);
      return;
    }

    if (data?.numericErrorCode === 18236 || data?.errorCode?.includes('display_name')) {
      console.error(`\nERROR Cooldown activo (2 semanas entre cambios de displayName): ${data.errorMessage}`);
      return;
    }

    console.error('\nERROR:', data?.errorMessage || err.message);
    process.exit(1);
  }
})();