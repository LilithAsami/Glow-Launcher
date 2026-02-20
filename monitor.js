const axios = require('axios');

// ─────────────────────────────────────────
// 👇 PON TU ACCESS TOKEN AQUÍ
const ACCESS_TOKEN = 'eg1~eyJraWQiOiJnX19WS2pTU21xSjB4WmoxUllrTEdLUTdkbkhpTTlNTGhGVndLUHlTREI0IiwiYWxnIjoiUFMyNTYifQ.eyJhcHAiOiJwcm9kLWZuIiwic3ViIjoiOWEwNTFjNDRiZmNiNGY2NWIyODE3YzUxMmFkODg3NTciLCJtdmVyIjpmYWxzZSwiY3R5IjoiVVMiLCJjbGlkIjoiM2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTIiLCJkbiI6IkJLX0pYU1giLCJhbSI6ImRldmljZV9hdXRoIiwicGZwaWQiOiJwcm9kLWZuIiwicCI6ImVOcTFXVzF6MmpnUS9qOU15SlFFMGtRemZHalRwTmVaOUdXT20wNi9NY0phR3hWWjhra3lDZmZyYnlXL1lIeUFaZUErRVdKcnRhL1BQcnZFU2x2SkxaQklxSndacXpSTmdKaU5zWkNTWjZBMjE4QytHRUVsRzE5ei96a2QzVjNGeDQ3OVhQMFFkUE1KR0krb0JUWUR2UWI5bWFad3pTVS9mRG8zb01rRGZUY1pSZVB4SW80VzQvaHVzcmk1SDcyUEpxTWJ5dTd2MzAvZWswZkJRZG9aV010bFlxNE5YVTlIazZ2TWJFaEtzNkZXbGxxdUpNbnloZUFSRVZ5dWhwRmlNTDI1b2xHa2NtbXJSOVZYZUxPZ0pSVWZjcnMwVGhhSzUxWkFpcDk0eXFpSVUwRXlaV3hHdGQwMEJGbTFBa21VWFlLZWdURjRyWGxXK2tQeHROQnplbitWYVRBZ0l5Q0RidU1FTmZhN1JLV2R2ckZHQ2N5UVNFa0prYlBLZEVwd3h5cm5HblNGSVN2S3RRbzRPRDRRRlZUL1R4QkFEY3g4ZEorNUFJUFgxR1k5VjhkaVNSYlVSc3VHNnAyM29yc1pONUhDQk5sMHV5ZlNtSkJLa3d3VmE2b1E0Rm1UTDB5a2VlYmRPQjJObWxHdVU2RlRTdU9RODRHZ3VZd3crb1NwVnlrVVphaEo1WTVISlMyKzlqSG5ncmwzZWNhb3BVUkRnaHIwVmI3TTl1bmRnU1IyOGtBYkpXbjlickJSdm56YXdmd0VhMWZERm94OWFnWldVN255MGdja3crZWdNNjBTUE93c2pBcUxoMWpHYTQ2eVVzVnlBUVNMaHNjMHNzM1VQTHZ1Zjh6R1ZlbTNQSkxrVkROT01jaTNWZTBhb0RwYWh0UU80aFVWS2lGbVNSSDJ5S0NwYytwY2tGSm5Qa3IwNVk1ZTRIS05ENmNQVjVuS0RJbVZFT28xd09VM3h4RjBGM2hITzhEcmJzQlkxNkY2NFd2b2RsOTlic2t6WjVXTU1iUjg3WkJOcXhock9paFBJRU1QdCtOTU00NUc4TEltM3RJc2EvaW5XMm9EQU1JRHhWRUZUVXRRSFBTQ3hSUjFvNG1MWW9qRnAvcTdvYUNIMXJhVUgxcXhiMHFlRkx4WGFqSlhsSzlLQythVXhFckR5M3pmUTVBRGJFcVZ0WE9MN1cwZUxhbWRXL1hHSSs0YjJKTCtBMExtMW1EZEkyZ0ZaOEJOa1FCMGpXV2lhNENwUFl1SjRHRWdUWFBwV3I4UFR0VmVDYXFJMklmcHJRbnFneTFOWUhNOHJQbDVjTkh3VXBtTCtKOGVuY2J4QmtPVzNGMjY4UWhad210bHRGQnFsYnRnaURqcENlSEhrMkZROUczbmEvUWs0VmdSM0xXb0JJYk9VVTdFVFFFMkpRQTdud1M0dzdudEJlM1pocXRUNTBFVFhzdlA3cDZPQldhcDczWExiTzV1blhNMnh4Ump6cVFVb3kwWXlUUFhMYkgyTDljUnZueWZWUjNoY2tKblZLUktIcGRiUW5hTDdqNUpoSmovRWw1M0NHS3RaTkVPOTJMTGdReW9FV1VOUTloeWtCNUpiWEtOalJqSTN6bSs3ckxvQUduV2tLRStEcGtSSExiVmJUQ0hEWVlPWXd1UFM0aFdKMlZWMnl3R0JTOVQybG1qM1RNMGpZWEV5bnNFMjVqQjluc213cmJnT2hjSWlNSnp3OUluZm9ZWVhSWGZWckFwLzQ4azQ1S2tabkw1RlA1S282RDgvYmw2WXR5R1pmSFpTcjNra2xaYTdiUnlRUjNsRE92b3gwanJ0NTFwSkp4cTNYVE91S2VZKy9uNTIxZTF3Qlo3K2ZDK2NKbS9IYURDMWRkQmx3LzJ4bjd2d0I1S0ZZcmUwV0IyTGVnNXBzN09ZeW9RREtnK1o5b2pDNDNOSnNMUnV0bHc5dEg1QUpoWW4wMU5XZ0g4TmZ2MUJ3aXV6UFhzYUJBWk9MSmRMQ2tlUEE4YjFxTmVOZnBneEhBR2tkTVRBbmJrWnNlRnNENllIMzZSRERXSFFJdVZ1ektOTllsZmtUUXpQSnh1RnpuemtTNDJqMG9uUER6WFhNdkFtaldOMVl5aTZDakhQZWYrajFkd3ZpR2FjakV2Z3oyM0RzY3RvbjNCOVdMWmE0cW9DYlpXQXNyeHg2a3ZGRXJWSVRrNnVEQVFJS1FlQUpuOWsrdHZ4V1hJZU5aajJ6VXJKa0xrOVNmTWw0VkR5cUdTUytSQVdPeW5zSFlYZ2lFbUJIclM3L0JHNHkxMnpIdnU0SEJDVXJudFZVVTl1czF0bzl1MEJnelQ3NjY5SWQ2ems4bXdYSXZsMmU2YThEaWtvWlNZSjgxM3RrSFpONjhWbThlQkIyMjhGVHlMcUpZcUtvNVJwSC9nQ0orckY0Y2lUdk0rYmo1bG5tbDNwY0NFaXVsYWFXZmlhSFNoY1FnZDVDQ3hxeThmNjhpQkc5YmRJYTZON0g2SXJVZjBMMndMNUF0YWp3T2QwVGpsNTRCZFpsbEJjTk1oOVhaajRRcmFoN283TDhhWDdNd0w5ZlpkMW5BS09aSlQxKzU4cGxhVGtza1FCd015OXZheWRMTE4rUHFuNDZtMTEreTJ4K0Rub2lUcGcyUmFjZGEydXVyeWJwK1V3Rit1UVQzNk9XMnlPMk1XaTVQaFFsSE45cXhQOXVHa1ZyOGh3Z3J4Ry82aGQ5aGRWUnNKRmNMQlI0b3BUY04yblB1U0IzSEk2VUFURGNYUEVBSDg0OFROM1Q2SzFNS0NsRXVsbjk0eXRCcll3VitEeXBJZU5QWnJDZEpCYkxMditzM3U5Y3ZGbXJCZXBDRXducGs1ZzRhTlo2RjAvL2JmZEhQbG5uSmtHQjNjaTlaYjBZTGg0NXZoSEJJbHAzVkNTMlY1WE1zL0diVlBIR0txMnR5aTlTSVhxNURmSGN1cWNrdnFjbHFBb0ozKzdmOHhoZTFTYU8vWDNXR3lVNjJIZndIQnE2dUsiLCJpYWkiOiI5YTA1MWM0NGJmY2I0ZjY1YjI4MTdjNTEyYWQ4ODc1NyIsInNlYyI6MSwiYWNyIjoidXJuOmVwaWM6bG9hOmFhbDEiLCJjbHN2YyI6InByb2QtZm4iLCJ0IjoicyIsImF1dGhfdGltZSI6MTc3MTUzMTY2NCwiaWMiOnRydWUsImV4cCI6MTc3MTUzODg2NCwiaWF0IjoxNzcxNTMxNjY0LCJqdGkiOiIyNzk1ZjI4MTc4NjU0MzMwOWQwOTQ1ZTk0YTQ3Y2MwOSJ9.jIqFKas4r9gOyhrY5mXMomGQQQF0b5MyA4RuZA-xxIPOA4fkLvncKV7SRD3xophmeQhmCxYSE7_f-BiHoeRGqUa3ddrpgEa18q29Dd2bnHz7bgdspr6iG5aZr0Zy5JQKFoiUEbKSdM0hSr00a3VBxYOSWTmf38WXMiglFJPGUMjLqTeL0gabWbfYx5JilIVzp5Qv_twWgrUhWpPfnLJDjgm2e0Sn_55MDeqxZ02kcwS5zFGZcAfabN7EQrXHAl78QkfHATGdJlrjbkGb_edtMhi7QsHzMEdRwN395BaC5bUHwthfyxOFHrrrIIxRmIPb2DEbc5lzPnxieO0MNCYVUuFjVJUiaQkJACH1zBqmNfZVarZxD66JnQLvi1KMNf_Fx6QKN44038Alsq4BbF_g0Z6Yj7X-6ZrF9iW3Km9zwoHN9AMvtu9AT0glyJfbkTirnOyygkCJIeygojnUVTuELUWcB2owABClRpWmBanU9kqx2JsLmuJW1aKzp2BNpAc4e84ANvKMU8ajB3ch0LddHWWNagNvY-ERjcYZESY8fL5E3jXdqEnTsEuswAm3jSQmTYOt04fZheVIhWqlR9pmIQMiGt5cBri3K-qjcVStZ5sgcLlUw0dK1ToG2Wqc2V_ELXuNXlA_7JxX0q-nrySRHMLAZH5WbaaPoTTbN8Iqju8';

// 👇 PON TU ACCOUNT ID AQUÍ
const ACCOUNT_ID = '9a051c44bfcb4f65b2817c512ad88757';

// Intervalo entre comprobaciones (ms)
const INTERVAL_MS = 3000;
// ─────────────────────────────────────────

const PARTY_URL = `https://party-service-prod.ol.epicgames.com/party/api/v1/Fortnite/user/${ACCOUNT_ID}`;

function safeParse(str) {
  try { return str ? JSON.parse(str) : null; } catch { return null; }
}

function timestamp() {
  return new Date().toLocaleTimeString();
}

async function getStatus() {
  const res = await axios.get(PARTY_URL, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    timeout: 10000,
  });

  const current = res.data?.current;
  if (!Array.isArray(current) || current.length === 0) {
    return { location: 'Unknown', gameMode: '', sessionId: '' };
  }

  const party = current[0];
  const partyMeta = party.meta ?? {};
  const memberMeta = party.members?.[0]?.meta ?? {};

  const packed = safeParse(memberMeta['Default:PackedState_j'])?.PackedState ?? {};
  const sessionId = partyMeta['Default:PrimaryGameSessionId_s'] ?? '';
  const partyState = partyMeta['Default:PartyState_s'] ?? '';

  return {
    location: packed.location ?? 'Unknown',
    gameMode: packed.gameMode ?? '',
    sessionId,
    partyState,
  };
}

async function main() {
  console.log('🎮  Monitor de misión STW iniciado');
  console.log(`🔄  Comprobando cada ${INTERVAL_MS / 1000}s...\n`);

  let wasInGame = false;
  let lastLocation = '';

  while (true) {
    try {
      const { location, gameMode, sessionId, partyState } = await getStatus();

      const isInGame = location === 'InGame';
      const isSTW =
        gameMode === 'InSaveTheWorld' ||
        gameMode.toLowerCase().includes('campaign') ||
        gameMode.toLowerCase().includes('stw');

      // Solo mostrar log si cambia el estado
      if (location !== lastLocation) {
        console.log(`[${timestamp()}] 📍 location: ${location} | gameMode: ${gameMode || 'N/A'} | session: ${sessionId || 'N/A'}`);
        lastLocation = location;
      }

      // Detectar entrada a partida
      if (isInGame && isSTW && !wasInGame) {
        console.log(`\n[${timestamp()}] ✅  PARTIDA INICIADA — gameMode: ${gameMode}`);
        wasInGame = true;
      }

      // Detectar misión completada (estaba en juego, ahora no)
      if (!isInGame && wasInGame) {
        console.log(`\n[${timestamp()}] 🏁  ¡MISIÓN COMPLETADA! — Ha salido de InGame`);
        console.log(`               location actual: "${location}"`);
        console.log('\n✅  Puedes ejecutar el autokick u otras acciones aquí.\n');
        wasInGame = false;
      }

    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        console.error(`[${timestamp()}] ❌  Token expirado (401). Renueva el ACCESS_TOKEN.`);
        process.exit(1);
      }
      console.error(`[${timestamp()}] ⚠️   Error: ${err.response?.data?.errorCode ?? err.message}`);
    }

    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
}

main();