const axios  = require("axios");
const fs     = require("path");
const path   = require("path");
const fsSync = require("fs");

// ══════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════

const ACCESS_TOKEN = "eg1~eyJraWQiOiJnX19WS2pTU21xSjB4WmoxUllrTEdLUTdkbkhpTTlNTGhGVndLUHlTREI0IiwiYWxnIjoiUFMyNTYifQ.eyJhcHAiOiJwcm9kLWZuIiwic3ViIjoiZmRjMzY2YjU5OTIzNGM4ZDljOWY0OWJlZTU4MTFjYzgiLCJtdmVyIjpmYWxzZSwiY3R5IjoiRVMiLCJjbGlkIjoiM2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTIiLCJkbiI6IuS5giBTVFdfSlhTWCDjg6EiLCJhbSI6ImRldmljZV9hdXRoIiwicGZwaWQiOiJwcm9kLWZuIiwicCI6ImVOcTFXZHR1SWprUS9SOEUwWktiZ2lVZVpqTEo3RWlaaTViVmF0NlFzYXNiRDI2NzEzYVRzRisvWmZlRkpxSHBTNWluSkpERzVWT25UcDBxSW0yY0VnNElrenJqMW1sRFl5QjJaeDBrNUJHb3l3endMMVpTeGE4dlJQZzVuOTZPcldhQ1NtS0JHclltRVdkWHQ3ZXJtOW5zOHVxYTNmRVptMFhYc3hYQXpkMTB5dGpkL0hJY25Ucm5uODBQU1hlZmdBdEdIZkFGbUMyWXp6U0JDNkdFUHk2MU81TFFkR0swbzA1b1JkSnNKUVVqVXFqTmhHa09lQUpsVEdmS2xXK1ZmOEtMQTZPby9KQzV0WjFQYjhhZ25IQVNFdnlKVHhVWFNiVjFLVFZ1Vi9zZ3B6ZWdpSFpyTUF1d0ZvKzFqOXA4eU4rOWw4Si93RjNEeFRJTHBoVVdrbi9JQXB3VEtyWVhsbTU5Z01jL01UWHdGMGlnRmhZQnRFY2h3V0swK0xvRnhZQThsbzlGaXF5b1kydi9KaGlyRmNVODVVZFVxTFJtRE9PUU5GTU1MMCs0ZmxaU1UwNUcxU0gzV2prTS9XTW1KTGVONlIyQ3dzL0Z6eElJa1hMcUtERVFJL2FOR1Q2R3dTZllla1k1c082aGpzZjV3dno4K08yclhtRU95bUFOVlpzQThZaWtlRFNZMU9nWTQvTG9zQnl0Q1o2ekZSaG1vbmttZ1NEZlJFU1plM3UxT0tPR0M2cnMvR3E4cHYrQlZKbXplRXZNQVg1c2hNZTJ4OHQwa21DMWh1d1lESjFiZkVrcFlMNkFiS2VhTFI3clFoWXNYQ3AxVE95YW9tQ1FVUjNzeEtPZlVBOFBNakZVRXFJazFCYmZuTTlPUzhPaEJFMXJFbFJDVnZ4c0Q1TWs0R2hnMURwZCtwd3ZCVjlhUjJPTUM4TTFtbTNBR2NwOG1JTlFQaHU1bmpKRjM2aEJnc2lGV0R2bHd4LzdKQ3hXZWlVTGJUR01NR3Y0NUVDK0lRQUNXWTc0NWZ3YURlOEtReUQ3U2xtSkdLUllRYTlManFZQ0QvRlArRlJ4WVpuR0hyUHIwY0ZLTGUzTXQ1QTlGYUVHaWExdk1WMkJiR3dCUTNENXNiZ3BjWG1tTnZWaStLeU41UDZGVktkNEN5MmxmdTRRMWVVWVpRdnpHL3F2WlFhd09aWnhMaDIyMlNWYlU3ZDAra1V3RVJxcEFWOGRLQ0Zkd2c3a1Fhd3NLa0tsNSswa3FscmIvRFpQUE4xaWhadDlveXVSUkFJRXd2bmJZaWFyVnZFa3R0QXh1cHphOCt1eHYxYW12RmtKVkM4dEJzR0xZcTlDM1RJRXNVQ3RsV2dRbWxIRGVMeUJzVDRwSFFoWTVxK1EwTGVVSkZMclRaWWV2ZVlQby9rM3JjSnRSd1JWengyWWh5NUFaeXVNWDZUNW5WY0dEUUdqMXMyblk1OW1JckNPaEpmakdDYit1ajRsdFFMdkxLaEJnODZqN1hnbXh4alE2aGtxT2NsU2IySXczcE1ONTVVTGZWQW91WlVQclo3MEQwRmtkTEFmRGFUYXczd0FVRVdsTFV3Zzk2SCtmL29MZGoxL3kzYUVKQ2JydTBMQ2VkNDFHV29ES1I2UEdIR1UvbjN0V0t3eWl3QWl3bkMvQnJZNXEzWXZxRXkwcXVTN0RoYUhuSFBhZUl5a2I5R21DMWt4cnVTQWZ5RVZaRU9GMFIyVSszcFEvd3pLblVua3VmUlpMVEVOODhsMG5QKzFnVjN4T2xxN2xxSG9nUXQza282bmZPKzMzK043MFo3L0NWSm9lK2grZTNpNHl5TWU3dFhNTnVxVjYxRnJBRWVock0rWE5UK1FHYlRrUVA3TjhLOGhBdFlXVEtzNjkreEZCNlpMVXAvNnZ0NkxTdXpSMU5UR2tIZnA3bG41OWtGeG93V3ZwcXcrbHFMNjU3eFBOKzhJT0hpUG1HOElac0ZHVEtxSnVaeklrQzIrVVh1YnNWOGdkSjZuU2UyaDBIaTk5U3JtUkE5TmgzdzF4TzRkQkpZV0R3ZnNVR2RxZzZpZlpqYjI5OVQveFNMUFNMbEFDY3VUczFyWEo2R3lsNzNBREROdTFYTnJrZFpBMUJTVDdZM2JNdnp5REQ2L3hGQWhsNFc5V2pvdjFnNHI3QjAzZWxkSjFmTldHVzJqSlJTRFROalJSSEZQazl6SDhoMVlocFp4L3BjV0hWenN0TTkyYlpIUGJ1aWhjUmJWbVJzMGxSY0RvRkRvQVBEYVp5MkdMOThYSlQvM0hhUWQxZHp6MDYwMmZnaVlUcys3bGlvakd1enRteU02MnMrdmF2MzhORWZlaWYzb3lDWXRSWUhEVDNqajlQQ0ZseVJOYS96c1FNMFR3ZUc1a1lqcng5UVN2aC9uQ2pGYzBjcFF0eDU3KzlxampvS3Z4OHRCOEhybFJrMUhFY1lSM2ppdm9LLzB5M2NGQTNpTXd5ekZnMGxhSktEL3FpTzNicjFMWnkzOGhVTzNnUXd0ais5eVlXbFh6akEyUlJwM2FLcFh2VWJCdW1GY2VYdWF6d2V0dkxwdWJOMWhYSy9XQjEvNG9POUpEa2VDZldDclRHNjZURG85dFRWMG5XSnJVWSszMmlvTldGam1QQmkwZ0EwbmR0eFQ5NmJiMjJIZ1hjYjlsUmY1U0ZlN2UyMWk4YjV0OHhHcFBXSjAvRDRxaHI5OTA3MFA4K2lyUVR0ZjJVeFdtaHAreEtBZWsxNmpmd0ZERm9ldmlTYkJzYlIwZ0E2anpUWVgwbkQ4NGNhcGxRbXpVbjc5SHJKZ0gzUmFSRjgxVldnaWxEWVBMeW5lRTNpakZTeXFjMVRiMGNYb3d0R2cvWEhtTHdVT2grN2V3dW0xWVlJRXdoREMxNThvVGJtQmREUXVRVmZhaWFoYWJYWm9YK1dWaTl4Tkc3ZWoxVzQwSDdmbTA3T3V1YTlMVkFvU3hGUktEMDJDYWttNzlmOWp6UVF4OWxWQVl3UDV4TmR1K2Y4SHRXdlRHQT09IiwiaWFpIjoiZmRjMzY2YjU5OTIzNGM4ZDljOWY0OWJlZTU4MTFjYzgiLCJzZWMiOjEsImFjciI6InVybjplcGljOmxvYTphYWwxIiwiY2xzdmMiOiJwcm9kLWZuIiwidCI6InMiLCJhdXRoX3RpbWUiOjE3NzIzNzU0NzAsImljIjp0cnVlLCJleHAiOjE3NzIzODI2NzAsImlhdCI6MTc3MjM3NTQ3MCwianRpIjoiZWUxODMwMTIxYjk0NDIwZTgyNzRmZDQyMzc3YTMxYWIifQ.S-pJqLQtCEf3xJ5iq839i6s3pdzSjJBYV33HH8gF-e89H9FFMKX-FlOP_97Rifr9AG_0pQKW-ajCYlsJQcBnMhsSAJWOUDfGdkMHF5L5jtQLVRqmytuQ-QXFBwkIRZpdeLMpqKT0CF-6jL_Dl-kXA8QNmruqyIEjj70NJzTePD6N1XqVedpycL9iKisvKbHRIILibBSOfySg_73y-bkpoWFhaP5KeC4vI2gDPDunTUNnw8XI76rnSwkmUx__o61j1LISxaAd2hMPgZTcANExk12FKU_IAK48UfQJ97mLZeQiMLrGeP1ICmPJ5qZ7D26X-K_WxBUni3QHC0HYHypjRy-NI0Rf5zuxUUW0YZswcmrwkeYElDLa8tLoRu0mTVUT66pRbkWhpdJn3uelEXnObNIb-smy8-lFzBEyhXY6RAH4ZI2gVpQGmWTglrjgyzVUJnlqd_C6_pPk7KkKLEe-jTw6v_hL-z_3c0ugwfx20gHZ5uixbdIl8kaitRcTGsvX4T-eCm-S3a8ADShfuTb-2c7WLcJiGjvTL0mkrIOknPGtcZGNCKxlhvb2mLhFL2PXtSdHd2nJfCtADdP5roVOF7Bdk8SuuzjluUEf2qtpArJqTqMt5uPEwBHLvI004Eu04Y5Bni4yMfEUf4mMNGiYwLMRa-C20p0kn3zRwYjyOL0";
const CODE         = "NADBAGW7MSVSHYSSEYSG";
const LOCALE       = "en-US";

// Cookies de sesión web — sácalas del navegador en epicgames.com
// (F12 → Application → Cookies → https://www.epicgames.com)
// Las más importantes: EPIC_SESSION_AP, EPIC_BEARER_TOKEN, JSESSIONID, EPIC_EG1
const WEB_COOKIES = {
  EPIC_SESSION_AP:    "",   // ← pega aquí
  EPIC_BEARER_TOKEN:  "",   // ← pega aquí (suele ser el mismo access token en base64)
  EPIC_EG1:           "",   // ← pega aquí si existe
  JSESSIONID:         "",   // ← pega aquí si existe
  // Cloudflare — si tienes estas del browser también ayudan
  "__cf_bm":          "",
  "cf_clearance":     "",
};

// ══════════════════════════════════════════════════════════════════
//  LOG
// ══════════════════════════════════════════════════════════════════

const LOG_FILE = path.join(__dirname, `epic_cookie_probe_${Date.now()}.json`);
const logResults = [];
function saveLog() {
  fsSync.writeFileSync(LOG_FILE, JSON.stringify(logResults, null, 2), "utf8");
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS DE HEADERS
// ══════════════════════════════════════════════════════════════════

function buildCookieString(extra = {}) {
  const all = { ...WEB_COOKIES, ...extra };
  return Object.entries(all)
    .filter(([, v]) => v && v.trim() !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// Headers que imitan un Chrome real para evitar Cloudflare
function browserHeaders(extra = {}) {
  return {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "sec-ch-ua":       '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    "sec-ch-ua-mobile":   "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest":  "empty",
    "Sec-Fetch-Mode":  "cors",
    "Sec-Fetch-Site":  "same-origin",
    "Connection":      "keep-alive",
    "Cache-Control":   "no-cache",
    "Pragma":          "no-cache",
    "Referer":         "https://www.epicgames.com/",
    "Origin":          "https://www.epicgames.com",
    "Cookie":          buildCookieString(),
    ...extra,
  };
}

function apiHeaders() {
  return {
    "Authorization": `Bearer ${ACCESS_TOKEN}`,
    "Content-Type":  "application/json",
    "User-Agent":    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Cookie":        buildCookieString(),
  };
}

// ══════════════════════════════════════════════════════════════════
//  ENDPOINTS
// ══════════════════════════════════════════════════════════════════

async function getAccountId() {
  const res = await axios.get(
    "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/verify",
    { headers: apiHeaders(), validateStatus: () => true }
  );
  if (!res.data.account_id) throw new Error(`Verify falló: ${JSON.stringify(res.data)}`);
  return res.data.account_id;
}

function buildEndpoints(accountId) {
  return [

    // ════════════════════════════════════════════════
    //  🍪 SAC — necesita sesión web (antes 401)
    // ════════════════════════════════════════════════

    {
      label: "🍪 [1] sac.epicgames.com/api/get-code-availability ?code= + cookies",
      method: "GET",
      url: "https://sac.epicgames.com/api/get-code-availability",
      params: { code: CODE },
      headers: {
        ...browserHeaders({ "Referer": "https://sac.epicgames.com/" }),
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
      },
    },
    {
      label: "🍪 [2] sac.epicgames.com/api/get-code-availability ?slug= + cookies",
      method: "GET",
      url: "https://sac.epicgames.com/api/get-code-availability",
      params: { slug: CODE },
      headers: {
        ...browserHeaders({ "Referer": "https://sac.epicgames.com/" }),
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
      },
    },
    {
      label: "🍪 [3] sac.epicgames.com/api/get-code-availability sin Bearer (solo cookies)",
      method: "GET",
      url: "https://sac.epicgames.com/api/get-code-availability",
      params: { code: CODE },
      headers: browserHeaders({ "Referer": "https://sac.epicgames.com/" }),
    },

    // ════════════════════════════════════════════════
    //  ☁️  Cloudflare bypass — redeem.epicgames.com
    //  Trick: pedir primero la página HTML para obtener
    //  cf_clearance y luego usarlo en el POST
    // ════════════════════════════════════════════════

    {
      label: "☁️  [4] redeem.epicgames.com/api/code/verify — browser headers completos + cookies",
      method: "POST",
      url: "https://redeem.epicgames.com/api/code/verify",
      data: { code: CODE, locale: LOCALE },
      headers: {
        ...browserHeaders({ "Referer": "https://redeem.epicgames.com/" }),
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
      },
    },
    {
      label: "☁️  [5] redeem.epicgames.com/api/code/verify — sin Authorization (solo cookies web)",
      method: "POST",
      url: "https://redeem.epicgames.com/api/code/verify",
      data: { code: CODE, locale: LOCALE },
      headers: {
        ...browserHeaders({ "Referer": "https://redeem.epicgames.com/" }),
        "Content-Type": "application/json",
      },
    },

    // ════════════════════════════════════════════════
    //  ☁️  Cloudflare bypass — fortnite.com
    // ════════════════════════════════════════════════

    {
      label: "☁️  [6] fortnite.com/api/promotion-code — browser headers + cookies",
      method: "POST",
      url: "https://www.fortnite.com/api/promotion-code",
      data: { code: CODE },
      headers: {
        ...browserHeaders({ "Referer": "https://www.fortnite.com/" }),
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
      },
    },
    {
      label: "☁️  [7] fortnite.com/ajax/redemption/validate-redemption-code — browser headers + cookies",
      method: "GET",
      url: "https://www.fortnite.com/ajax/redemption/validate-redemption-code",
      params: { "redeem-code": CODE },
      headers: {
        ...browserHeaders({ "Referer": "https://www.fortnite.com/" }),
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
      },
    },

    // ════════════════════════════════════════════════
    //  🔍 EXTRA — otros servicios Epic no probados aún
    // ════════════════════════════════════════════════

    {
      label: "🔍 [8] coderedemption-public-service /redeem — GET",
      method: "GET",
      url: `https://coderedemption-public-service-prod.ol.epicgames.com/coderedemption/api/public/accounts/${accountId}/redeemCodes/${CODE}`,
      headers: apiHeaders(),
    },
    {
      label: "🔍 [9] coderedemption-public-service /status — GET",
      method: "GET",
      url: `https://coderedemption-public-service-prod.ol.epicgames.com/coderedemption/api/public/codes/${CODE}`,
      headers: apiHeaders(),
    },
    {
      label: "🔍 [10] coderedemption-public-service /verify — GET",
      method: "GET",
      url: `https://coderedemption-public-service-prod.ol.epicgames.com/coderedemption/api/public/codes/${CODE}/verify`,
      headers: apiHeaders(),
    },
    {
      label: "🔍 [11] coderedemption-public-service /check — GET",
      method: "GET",
      url: `https://coderedemption-public-service-prod.ol.epicgames.com/coderedemption/api/public/codes/${CODE}/check`,
      headers: apiHeaders(),
    },
  ];
}

// ══════════════════════════════════════════════════════════════════
//  PROBE
// ══════════════════════════════════════════════════════════════════

function divider(label) {
  console.log("\n" + "═".repeat(72));
  console.log(`  ${label}`);
  console.log("═".repeat(72));
}

function highlight(status, resHeaders) {
  if (status === 200)                   return "  ✅✅✅  200 OK — BINGO";
  if (status === 400)                   return "  ⚠️   400 — endpoint existe, revisar params";
  if (status === 401 || status === 403) {
    const cf = resHeaders["cf-mitigated"];
    return cf
      ? `  ☁️   ${status} — Cloudflare challenge (cf-mitigated: ${cf})`
      : `  🔑  ${status} — Auth issue, endpoint existe`;
  }
  if (status === 405) return `  ⚠️   405 — existe | allow: ${resHeaders["allow"] || "?"}`;
  if (status === 422) return "  ⚠️   422 — existe, body mal formado";
  if (status === 429) return "  🚦  429 — rate limited";
  return null;
}

async function probeEndpoint(ep) {
  divider(ep.label);

  const cfg = {
    method: ep.method,
    url: ep.url,
    headers: ep.headers,
    validateStatus: () => true,
    timeout: 15000,
    maxRedirects: 5,
  };
  if (ep.params) cfg.params = ep.params;
  if (ep.data)   cfg.data   = ep.data;

  const logEntry = {
    label:     ep.label,
    method:    ep.method,
    url:       ep.url,
    params:    ep.params    || null,
    body_sent: ep.data      || null,
    status:    null,
    headers:   {},
    body:      null,
    error:     null,
  };

  try {
    const res = await axios(cfg);

    logEntry.status  = res.status;
    logEntry.headers = res.headers;
    logEntry.body    = res.data;

    console.log(`  Status  : ${res.status} ${res.statusText}`);

    const interesting = [
      "content-type", "allow", "location",
      "x-epic-error-name", "x-epic-error-code", "x-epic-correlation-id",
      "cf-mitigated", "cf-ray",
    ];
    for (const k of interesting) {
      if (res.headers[k]) console.log(`  ${k}: ${res.headers[k]}`);
    }

    const body = res.data;
    if (body !== undefined && body !== "") {
      const str = typeof body === "string" ? body : JSON.stringify(body, null, 2);
      console.log(`\n  Body (≤800 chars — completo en JSON):`);
      console.log(str.length > 800 ? str.slice(0, 800) + "\n  ..." : str);
    } else {
      console.log("\n  Body: <vacío>");
    }

    const hl = highlight(res.status, res.headers);
    if (hl) console.log(`\n${hl}`);

  } catch (err) {
    logEntry.error = err.message;
    console.log(`  ❌ Error de red: ${err.message}`);
  }

  logResults.push(logEntry);
  saveLog();
}

// ══════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════

async function main() {
  if (!ACCESS_TOKEN || ACCESS_TOKEN === "TU_ACCESS_TOKEN_AQUI") {
    console.error("❌  Pon tu ACCESS_TOKEN."); process.exit(1);
  }
  if (!CODE || CODE === "TU_CODIGO_AQUI") {
    console.error("❌  Pon el código."); process.exit(1);
  }

  const cookiesFilled = Object.values(WEB_COOKIES).some(v => v && v.trim() !== "");
  if (!cookiesFilled) {
    console.warn("⚠️   WEB_COOKIES vacías — los endpoints que necesiten sesión web seguirán fallando.");
    console.warn("     Sácalas del navegador: F12 → Application → Cookies → epicgames.com\n");
  }

  console.log("🔑  Verificando token...");
  let accountId;
  try {
    accountId = await getAccountId();
    console.log(`✅  Account ID: ${accountId}`);
  } catch (err) {
    console.error(`❌  ${err.message}`); process.exit(1);
  }

  const endpoints = buildEndpoints(accountId);
  console.log(`\n🔍  Probando ${endpoints.length} endpoints para: ${CODE}`);
  console.log(`📄  Log: ${LOG_FILE}\n`);

  for (const ep of endpoints) {
    await probeEndpoint(ep);
  }

  console.log("\n" + "═".repeat(72));
  console.log("  ✅  Prueba completada");
  console.log(`  📄  Log guardado en: ${LOG_FILE}`);
  console.log("═".repeat(72));
}

main();