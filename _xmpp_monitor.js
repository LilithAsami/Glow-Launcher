/**
 * XMPP Event Monitor — GLOW Launcher
 *
 * Conecta a Epic Games XMPP y captura todos los eventos recibidos.
 * Al cerrar (Ctrl+C) guarda todo en xmpp_log.json
 *
 * Uso: node _xmpp_monitor.js
 */

const { createClient } = require('stanza');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────
// 👇 PON TU ACCESS TOKEN AQUÍ
const ACCESS_TOKEN = 'eg1~eyJraWQiOiJnX19WS2pTU21xSjB4WmoxUllrTEdLUTdkbkhpTTlNTGhGVndLUHlTREI0IiwiYWxnIjoiUFMyNTYifQ.eyJhcHAiOiJwcm9kLWZuIiwic3ViIjoiZmRjMzY2YjU5OTIzNGM4ZDljOWY0OWJlZTU4MTFjYzgiLCJtdmVyIjpmYWxzZSwiY3R5IjoiRVMiLCJjbGlkIjoiM2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTIiLCJkbiI6IuS5giBTVFdfSlhTWCDjg6EiLCJhbSI6ImRldmljZV9hdXRoIiwicGZwaWQiOiJwcm9kLWZuIiwicCI6ImVOcTFXZHR1SWprUS9SOEUwWktiZ2lVZVpqTEo3RWlaaTViVmF0NlFzYXNiRDI2NzEzYVRzRisvWmZlRkpxSHBTNWluSkpERzVWT25UcDBxSW0yY0VnNElrenJqMW1sRFl5QjJaeDBrNUJHb3l3endMMVpTeGE4dlJQZzVuOTZPcldhQ1NtS0JHclltRVdkWHQ3ZXJtOW5zOHVxYTNmRVptMFhYc3hYQXpkMTB5dGpkL0hJY25Ucm5uODBQU1hlZmdBdEdIZkFGbUMyWXp6U0JDNkdFUHk2MU81TFFkR0swbzA1b1JkSnNKUVVqVXFqTmhHa09lQUpsVEdmS2xXK1ZmOEtMQTZPby9KQzV0WjFQYjhhZ25IQVNFdnlKVHhVWFNiVjFLVFZ1Vi9zZ3B6ZWdpSFpyTUF1d0ZvKzFqOXA4eU4rOWw4Si93RjNEeFRJTHBoVVdrbi9JQXB3VEtyWVhsbTU5Z01jL01UWHdGMGlnRmhZQnRFY2h3V0swK0xvRnhZQThsbzlGaXF5b1kydi9KaGlyRmNVODVVZFVxTFJtRE9PUU5GTU1MMCs0ZmxaU1UwNUcxU0gzV2prTS9XTW1KTGVONlIyQ3dzL0Z6eElJa1hMcUtERVFJL2FOR1Q2R3dTZllla1k1c082aGpzZjV3dno4K08yclhtRU95bUFOVlpzQThZaWtlRFNZMU9nWTQvTG9zQnl0Q1o2ekZSaG1vbmttZ1NEZlJFU1plM3UxT0tPR0M2cnMvR3E4cHYrQlZKbXplRXZNQVg1c2hNZTJ4OHQwa21DMWh1d1lESjFiZkVrcFlMNkFiS2VhTFI3clFoWXNYQ3AxVE95YW9tQ1FVUjNzeEtPZlVBOFBNakZVRXFJazFCYmZuTTlPUzhPaEJFMXJFbFJDVnZ4c0Q1TWs0R2hnMURwZCtwd3ZCVjlhUjJPTUM4TTFtbTNBR2NwOG1JTlFQaHU1bmpKRjM2aEJnc2lGV0R2bHd4LzdKQ3hXZWlVTGJUR01NR3Y0NUVDK0lRQUNXWTc0NWZ3YURlOEtReUQ3U2xtSkdLUllRYTlManFZQ0QvRlArRlJ4WVpuR0hyUHIwY0ZLTGUzTXQ1QTlGYUVHaWExdk1WMkJiR3dCUTNENXNiZ3BjWG1tTnZWaStLeU41UDZGVktkNEN5MmxmdTRRMWVVWVpRdnpHL3F2WlFhd09aWnhMaDIyMlNWYlU3ZDAra1V3RVJxcEFWOGRLQ0Zkd2c3a1Fhd3NLa0tsNSswa3FscmIvRFpQUE4xaWhadDlveXVSUkFJRXd2bmJZaWFyVnZFa3R0QXh1cHphOCt1eHYxYW12RmtKVkM4dEJzR0xZcTlDM1RJRXNVQ3RsV2dRbWxIRGVMeUJzVDRwSFFoWTVxK1EwTGVVSkZMclRaWWV2ZVlQby9rM3JjSnRSd1JWengyWWh5NUFaeXVNWDZUNW5WY0dEUUdqMXMyblk1OW1JckNPaEpmakdDYit1ajRsdFFMdkxLaEJnODZqN1hnbXh4alE2aGtxT2NsU2IySXczcE1ONTVVTGZWQW91WlVQclo3MEQwRmtkTEFmRGFUYXczd0FVRVdsTFV3Zzk2SCtmL29MZGoxL3kzYUVKQ2JydTBMQ2VkNDFHV29ES1I2UEdIR1UvbjN0V0t3eWl3QWl3bkMvQnJZNXEzWXZxRXkwcXVTN0RoYUhuSFBhZUl5a2I5R21DMWt4cnVTQWZ5RVZaRU9GMFIyVSszcFEvd3pLblVua3VmUlpMVEVOODhsMG5QKzFnVjN4T2xxN2xxSG9nUXQza282bmZPKzMzK043MFo3L0NWSm9lK2grZTNpNHl5TWU3dFhNTnVxVjYxRnJBRWVock0rWE5UK1FHYlRrUVA3TjhLOGhBdFlXVEtzNjkreEZCNlpMVXAvNnZ0NkxTdXpSMU5UR2tIZnA3bG41OWtGeG93V3ZwcXcrbHFMNjU3eFBOKzhJT0hpUG1HOElac0ZHVEtxSnVaeklrQzIrVVh1YnNWOGdkSjZuU2UyaDBIaTk5U3JtUkE5TmgzdzF4TzRkQkpZV0R3ZnNVR2RxZzZpZlpqYjI5OVQveFNMUFNMbEFDY3VUczFyWEo2R3lsNzNBREROdTFYTnJrZFpBMUJTVDdZM2JNdnp5REQ2L3hGQWhsNFc5V2pvdjFnNHI3QjAzZWxkSjFmTldHVzJqSlJTRFROalJSSEZQazl6SDhoMVlocFp4L3BjV0hWenN0TTkyYlpIUGJ1aWhjUmJWbVJzMGxSY0RvRkRvQVBEYVp5MkdMOThYSlQvM0hhUWQxZHp6MDYwMmZnaVlUcys3bGlvakd1enRteU02MnMrdmF2MzhORWZlaWYzb3lDWXRSWUhEVDNqajlQQ0ZseVJOYS96c1FNMFR3ZUc1a1lqcng5UVN2aC9uQ2pGYzBjcFF0eDU3KzlxampvS3Z4OHRCOEhybFJrMUhFY1lSM2ppdm9LLzB5M2NGQTNpTXd5ekZnMGxhSktEL3FpTzNicjFMWnkzOGhVTzNnUXd0ais5eVlXbFh6akEyUlJwM2FLcFh2VWJCdW1GY2VYdWF6d2V0dkxwdWJOMWhYSy9XQjEvNG9POUpEa2VDZldDclRHNjZURG85dFRWMG5XSnJVWSszMmlvTldGam1QQmkwZ0EwbmR0eFQ5NmJiMjJIZ1hjYjlsUmY1U0ZlN2UyMWk4YjV0OHhHcFBXSjAvRDRxaHI5OTA3MFA4K2lyUVR0ZjJVeFdtaHAreEtBZWsxNmpmd0ZERm9ldmlTYkJzYlIwZ0E2anpUWVgwbkQ4NGNhcGxRbXpVbjc5SHJKZ0gzUmFSRjgxVldnaWxEWVBMeW5lRTNpakZTeXFjMVRiMGNYb3d0R2cvWEhtTHdVT2grN2V3dW0xWVlJRXdoREMxNThvVGJtQmREUXVRVmZhaWFoYWJYWm9YK1dWaTl4Tkc3ZWoxVzQwSDdmbTA3T3V1YTlMVkFvU3hGUktEMDJDYWttNzlmOWp6UVF4OWxWQVl3UDV4TmR1K2Y4SHRXdlRHQT09IiwiaWFpIjoiZmRjMzY2YjU5OTIzNGM4ZDljOWY0OWJlZTU4MTFjYzgiLCJzZWMiOjEsImFjciI6InVybjplcGljOmxvYTphYWwxIiwiY2xzdmMiOiJwcm9kLWZuIiwidCI6InMiLCJhdXRoX3RpbWUiOjE3NzE1OTU2NDAsImljIjp0cnVlLCJleHAiOjE3NzE2MDI4NDAsImlhdCI6MTc3MTU5NTY0MCwianRpIjoiNGIzN2EwOGU5OGFiNDU4MmIyOWEwNWI0MTgwOWYxZmQifQ.0nFwOWa0MGFtsamrczliRBi4oZtAdWnBIeWSPwhsdVYOJPnkwMoJ8K79JnogZqrLLwq8Wuyu1kRAawOswReaQ9ox4TA3pS9l68ep_b-LGnWCHDOBnBmK2PGMicPkKC6shAkjVxUL-sghrH5NNPw9S_GAvfb6tum7xgvBEMU4KmOGQ9cTXpq2kQn6RavQh7HP9a4qp7-NgZ04FrA1bLDl7gYRJeLIcblKSbPCl6YO28zlfEy2z-8OJvVRP7gT3MArOlgWiHbCeoMANikY-TUmvVox7ZHzLTdZ1sdprV4MdQh2A73CPyGtj8_u0x8LT9Pjt04zNR5RMYLOOtfhxOa4cOu7alJvYb0N-ubN4uJtQnIr2GQXxsJRpy2qW-RyxgDY4gkn3xXSlchzyCj32qgsSyhebVV3AObjdu5VDVUYoXOlurdMV29rJSvMbr9AG_f-riS_ZsgujJKozDXKePjvNuXsobtLrAzgqYdIS7LqJZHGLmfsl22z-kK0HITel17gZurrYzmM8Cl1aWKQNiwV6ttSICbxoLb19CGHHcZm-NqtZ637kx41y9hHBHNByJfV5jolEP324MQHq5babDLQqjNowbB2R3DxMGA55_BLHTUcblwhu--Y8MNLi2125d81x84NaOLrBlcxmb_zymvCs3rQfZXUiZs2M1PJAZdcSOs';

// 👇 PON TU ACCOUNT ID AQUÍ (el accountId del token)
const ACCOUNT_ID = 'fdc366b599234c8d9c9f49bee5811cc8';
// ─────────────────────────────────────────

const XMPP_SERVER = 'prod.ol.epicgames.com';
const OUTPUT_FILE = path.join(__dirname, 'xmpp_log.json');

// ─── Estado del log ───────────────────────────────────────────

const capturedEvents = [];
let eventCounter = 0;

function timestamp() {
  return new Date().toISOString();
}

function ts() {
  return new Date().toLocaleTimeString();
}

function log(label, message) {
  console.log(`[${ts()}] ${label} ${message}`);
}

function recordEvent(type, data) {
  eventCounter++;
  const entry = {
    index: eventCounter,
    timestamp: timestamp(),
    type,
    data,
  };
  capturedEvents.push(entry);
  return entry;
}

// ─── Parse XML helpers ────────────────────────────────────────

function extractBodyJson(rawXML) {
  const match = rawXML.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return match[1]; // devolver como string si no es JSON
  }
}

function extractAttr(rawXML, attr) {
  const match = rawXML.match(new RegExp(`${attr}="([^"]+)"`));
  return match ? match[1] : null;
}

function summarizeRaw(rawXML) {
  // Extraer tag principal
  const tagMatch = rawXML.match(/^<([a-zA-Z:]+)/);
  const tag = tagMatch ? tagMatch[1] : 'unknown';
  const from = extractAttr(rawXML, 'from');
  const type = extractAttr(rawXML, 'type');
  const body = extractBodyJson(rawXML);

  return { tag, from, type, body };
}

// ─── Guardar al cerrar ────────────────────────────────────────

function saveAndExit() {
  console.log(`\n\n[${ts()}] 💾  Guardando ${capturedEvents.length} eventos en ${OUTPUT_FILE}...`);

  const output = {
    meta: {
      accountId: ACCOUNT_ID,
      server: XMPP_SERVER,
      startedAt: capturedEvents[0]?.timestamp ?? timestamp(),
      endedAt: timestamp(),
      totalEvents: capturedEvents.length,
    },
    events: capturedEvents,
  };

  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`[${ts()}] ✅  Guardado en: ${OUTPUT_FILE}`);
  } catch (err) {
    console.error(`[${ts()}] ❌  Error guardando JSON: ${err.message}`);
  }

  process.exit(0);
}

process.on('SIGINT', saveAndExit);
process.on('SIGTERM', saveAndExit);

// ─── Conexión XMPP ───────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  XMPP Event Monitor — GLOW Launcher');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Account : ${ACCOUNT_ID}`);
  console.log(`  Server  : ${XMPP_SERVER}`);
  console.log(`  Output  : ${OUTPUT_FILE}`);
  console.log('  Presiona Ctrl+C para guardar y salir');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const resourceHash = crypto.randomBytes(16).toString('hex').toUpperCase();

  const xmpp = createClient({
    jid: `${ACCOUNT_ID}@${XMPP_SERVER}`,
    server: XMPP_SERVER,
    transports: {
      websocket: `wss://xmpp-service-${XMPP_SERVER}`,
      bosh: false,
    },
    credentials: {
      host: XMPP_SERVER,
      username: ACCOUNT_ID,
      password: ACCESS_TOKEN,
    },
    resource: `V2:Fortnite:WIN::${resourceHash}`,
  });

  xmpp.enableKeepAlive({ interval: 30000 });

  // ── Session ──────────────────────────────────────────────────

  xmpp.on('session:started', () => {
    log('✅', 'XMPP session:started — conectado! Escuchando eventos...\n');
    recordEvent('session:started', { message: 'XMPP session established' });
  });

  xmpp.on('session:end', () => {
    log('🔌', 'XMPP session:end');
    recordEvent('session:end', {});
  });

  xmpp.on('disconnected', () => {
    log('🔴', 'XMPP disconnected');
    recordEvent('disconnected', {});
  });

  xmpp.on('reconnected', () => {
    log('🔁', 'XMPP reconnected');
    recordEvent('reconnected', {});
  });

  // ── Stream errors ─────────────────────────────────────────────

  xmpp.on('stream:error', (err) => {
    log('❌', `stream:error → ${JSON.stringify(err)}`);
    recordEvent('stream:error', err);
  });

  xmpp.on('auth:failed', () => {
    log('❌', 'auth:failed — Token inválido o expirado');
    recordEvent('auth:failed', { message: 'Authentication failed' });
    saveAndExit();
  });

  // ── RAW INCOMING — captura TODO lo que llega ──────────────────

  xmpp.on('raw:incoming', (rawXML) => {
    // Ignorar keepalive vacíos
    if (!rawXML.trim() || rawXML.trim() === ' ') return;

    // Presencia: solo mostrar la de NUESTRA PROPIA cuenta (otras sesiones/bots)
    // Ignorar presencias de terceros (amigos, etc.)
    if (rawXML.trimStart().startsWith('<presence')) {
      const from = extractAttr(rawXML, 'from') ?? '';
      // from tiene formato: accountId@server/resource
      const isOwnAccount = from.startsWith(ACCOUNT_ID + '@');
      if (!isOwnAccount) return; // ruido de terceros, ignorar

      const resource = from.split('/')[1] ?? 'unknown';
      const presType = extractAttr(rawXML, 'type') ?? 'available';
      console.log(`\n${'━'.repeat(60)}`);
      console.log(`[${ts()}] 👁️  #${eventCounter + 1} PRESENCIA PROPIA (otra sesión/bot)`);
      console.log(`  resource : ${resource}`);
      console.log(`  type     : ${presType}`);
      console.log(`  raw      : ${rawXML}`);
      recordEvent('own-presence', { from, resource, type: presType, raw: rawXML });
      return;
    }

    const summary = summarizeRaw(rawXML);

    // ── Mostrar TODO en consola sin filtrar ──────────────────────
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${ts()}] 📨 #${eventCounter + 1} RAW:INCOMING`);
    console.log(`  tag  : ${summary.tag}`);
    if (summary.from) console.log(`  from : ${summary.from}`);
    if (summary.type) console.log(`  type : ${summary.type}`);

    // Si tiene body JSON parseado → mostrar bonito
    if (summary.body !== null) {
      if (typeof summary.body === 'object') {
        console.log(`  body : ${JSON.stringify(summary.body, null, 2).split('\n').map((l, i) => i === 0 ? l : '         ' + l).join('\n')}`);
      } else {
        console.log(`  body : ${String(summary.body)}`);
      }
    } else {
      // Mostrar XML crudo completo
      console.log(`  xml  : ${rawXML}`);
    }

    recordEvent('raw:incoming', {
      summary,
      raw: rawXML,
    });
  });

  // ── RAW OUTGOING — captura lo que se envía ────────────────────

  xmpp.on('raw:outgoing', (rawXML) => {
    if (!rawXML.trim() || rawXML.trim() === ' ') return;
    // Ignorar presencia outgoing también
    if (rawXML.trimStart().startsWith('<presence')) return;
    // Solo grabar en JSON, no en consola (evitar eco de keepalives/pings)
    recordEvent('raw:outgoing', { raw: rawXML });
  });

  // ── IQ stanzas (parseadas por stanza.js) ─────────────────────

  xmpp.on('iq', (iq) => {
    // Ya capturado en raw:incoming, sin duplicar en consola
    recordEvent('iq:parsed', iq);
  });

  // ── Conectar ──────────────────────────────────────────────────

  log('🔌', `Conectando a wss://xmpp-service-${XMPP_SERVER} ...`);

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout de conexión (15s)')), 15000);

      xmpp.once('session:started', () => {
        clearTimeout(timeout);
        resolve();
      });

      xmpp.once('stream:error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Stream error: ${JSON.stringify(err)}`));
      });

      xmpp.once('auth:failed', () => {
        clearTimeout(timeout);
        reject(new Error('Autenticación fallida — verifica ACCESS_TOKEN y ACCOUNT_ID'));
      });

      xmpp.connect();
    });
  } catch (err) {
    console.error(`\n[${ts()}] ❌  No se pudo conectar: ${err.message}`);
    process.exit(1);
  }

  // Mantener proceso activo
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
