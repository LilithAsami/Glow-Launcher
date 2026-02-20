const axios = require('axios');
const fs = require('fs');

// ─────────────────────────────────────────
// 👇 PON TU ACCESS TOKEN AQUÍ
const ACCESS_TOKEN = 'eg1~eyJraWQiOiJnX19WS2pTU21xSjB4WmoxUllrTEdLUTdkbkhpTTlNTGhGVndLUHlTREI0IiwiYWxnIjoiUFMyNTYifQ.eyJhcHAiOiJwcm9kLWZuIiwic3ViIjoiOWEwNTFjNDRiZmNiNGY2NWIyODE3YzUxMmFkODg3NTciLCJtdmVyIjpmYWxzZSwiY3R5IjoiVVMiLCJjbGlkIjoiM2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTIiLCJkbiI6IkJLX0pYU1giLCJhbSI6ImRldmljZV9hdXRoIiwicGZwaWQiOiJwcm9kLWZuIiwicCI6ImVOcTFXVzF6MmpnUS9qOU15SlFFMGtRemZHalRwTmVaOUdXT20wNi9NY0phR3hWWjhra3lDZmZyYnlXL1lIeUFaZUErRVdKcnRhL1BQcnZFU2x2SkxaQklxSndacXpSTmdKaU5zWkNTWjZBMjE4QytHRUVsRzE5ei96a2QzVjNGeDQ3OVhQMFFkUE1KR0krb0JUWUR2UWI5bWFad3pTVS9mRG8zb01rRGZUY1pSZVB4SW80VzQvaHVzcmk1SDcyUEpxTWJ5dTd2MzAvZWswZkJRZG9aV010bFlxNE5YVTlIazZ2TWJFaEtzNkZXbGxxdUpNbnloZUFSRVZ5dWhwRmlNTDI1b2xHa2NtbXJSOVZYZUxPZ0pSVWZjcnMwVGhhSzUxWkFpcDk0eXFpSVUwRXlaV3hHdGQwMEJGbTFBa21VWFlLZWdURjRyWGxXK2tQeHROQnplbitWYVRBZ0l5Q0RidU1FTmZhN1JLV2R2ckZHQ2N5UVNFa0prYlBLZEVwd3h5cm5HblNGSVN2S3RRbzRPRDRRRlZUL1R4QkFEY3g4ZEorNUFJUFgxR1k5VjhkaVNSYlVSc3VHNnAyM29yc1pONUhDQk5sMHV5ZlNtSkJLa3d3VmE2b1E0Rm1UTDB5a2VlYmRPQjJObWxHdVU2RlRTdU9RODRHZ3VZd3crb1NwVnlrVVphaEo1WTVISlMyKzlqSG5ncmwzZWNhb3BVUkRnaHIwVmI3TTl1bmRnU1IyOGtBYkpXbjlickJSdm56YXdmd0VhMWZERm94OWFnWldVN255MGdja3crZWdNNjBTUE93c2pBcUxoMWpHYTQ2eVVzVnlBUVNMaHNjMHNzM1VQTHZ1Zjh6R1ZlbTNQSkxrVkROT01jaTNWZTBhb0RwYWh0UU80aFVWS2lGbVNSSDJ5S0NwYytwY2tGSm5Qa3IwNVk1ZTRIS05ENmNQVjVuS0RJbVZFT28xd09VM3h4RjBGM2hITzhEcmJzQlkxNkY2NFd2b2RsOTlic2t6WjVXTU1iUjg3WkJOcXhock9paFBJRU1QdCtOTU00NUc4TEltM3RJc2EvaW5XMm9EQU1JRHhWRUZUVXRRSFBTQ3hSUjFvNG1MWW9qRnAvcTdvYUNIMXJhVUgxcXhiMHFlRkx4WGFqSlhsSzlLQythVXhFckR5M3pmUTVBRGJFcVZ0WE9MN1cwZUxhbWRXL1hHSSs0YjJKTCtBMExtMW1EZEkyZ0ZaOEJOa1FCMGpXV2lhNENwUFl1SjRHRWdUWFBwV3I4UFR0VmVDYXFJMklmcHJRbnFneTFOWUhNOHJQbDVjTkh3VXBtTCtKOGVuY2J4QmtPVzNGMjY4UWhad210bHRGQnFsYnRnaURqcENlSEhrMkZROUczbmEvUWs0VmdSM0xXb0JJYk9VVTdFVFFFMkpRQTdud1M0dzdudEJlM1pocXRUNTBFVFhzdlA3cDZPQldhcDczWExiTzV1blhNMnh4Ump6cVFVb3kwWXlUUFhMYkgyTDljUnZueWZWUjNoY2tKblZLUktIcGRiUW5hTDdqNUpoSmovRWw1M0NHS3RaTkVPOTJMTGdReW9FV1VOUTloeWtCNUpiWEtOalJqSTN6bSs3ckxvQUduV2tLRStEcGtSSExiVmJUQ0hEWVlPWXd1UFM0aFdKMlZWMnl3R0JTOVQybG1qM1RNMGpZWEV5bnNFMjVqQjluc213cmJnT2hjSWlNSnp3OUluZm9ZWVhSWGZWckFwLzQ4azQ1S2tabkw1RlA1S282RDgvYmw2WXR5R1pmSFpTcjNra2xaYTdiUnlRUjNsRE92b3gwanJ0NTFwSkp4cTNYVE91S2VZKy9uNTIxZTF3Qlo3K2ZDK2NKbS9IYURDMWRkQmx3LzJ4bjd2d0I1S0ZZcmUwV0IyTGVnNXBzN09ZeW9RREtnK1o5b2pDNDNOSnNMUnV0bHc5dEg1QUpoWW4wMU5XZ0g4TmZ2MUJ3aXV6UFhzYUJBWk9MSmRMQ2tlUEE4YjFxTmVOZnBneEhBR2tkTVRBbmJrWnNlRnNENllIMzZSRERXSFFJdVZ1ektOTllsZmtUUXpQSnh1RnpuemtTNDJqMG9uUER6WFhNdkFtaldOMVl5aTZDakhQZWYrajFkd3ZpR2FjakV2Z3oyM0RzY3RvbjNCOVdMWmE0cW9DYlpXQXNyeHg2a3ZGRXJWSVRrNnVEQVFJS1FlQUpuOWsrdHZ4V1hJZU5aajJ6VXJKa0xrOVNmTWw0VkR5cUdTUytSQVdPeW5zSFlYZ2lFbUJIclM3L0JHNHkxMnpIdnU0SEJDVXJudFZVVTl1czF0bzl1MEJnelQ3NjY5SWQ2ems4bXdYSXZsMmU2YThEaWtvWlNZSjgxM3RrSFpONjhWbThlQkIyMjhGVHlMcUpZcUtvNVJwSC9nQ0orckY0Y2lUdk0rYmo1bG5tbDNwY0NFaXVsYWFXZmlhSFNoY1FnZDVDQ3hxeThmNjhpQkc5YmRJYTZON0g2SXJVZjBMMndMNUF0YWp3T2QwVGpsNTRCZFpsbEJjTk1oOVhaajRRcmFoN283TDhhWDdNd0w5ZlpkMW5BS09aSlQxKzU4cGxhVGtza1FCd015OXZheWRMTE4rUHFuNDZtMTEreTJ4K0Rub2lUcGcyUmFjZGEydXVyeWJwK1V3Rit1UVQzNk9XMnlPMk1XaTVQaFFsSE45cXhQOXVHa1ZyOGh3Z3J4Ry82aGQ5aGRWUnNKRmNMQlI0b3BUY04yblB1U0IzSEk2VUFURGNYUEVBSDg0OFROM1Q2SzFNS0NsRXVsbjk0eXRCcll3VitEeXBJZU5QWnJDZEpCYkxMditzM3U5Y3ZGbXJCZXBDRXducGs1ZzRhTlo2RjAvL2JmZEhQbG5uSmtHQjNjaTlaYjBZTGg0NXZoSEJJbHAzVkNTMlY1WE1zL0diVlBIR0txMnR5aTlTSVhxNURmSGN1cWNrdnFjbHFBb0ozKzdmOHhoZTFTYU8vWDNXR3lVNjJIZndIQnE2dUsiLCJpYWkiOiI5YTA1MWM0NGJmY2I0ZjY1YjI4MTdjNTEyYWQ4ODc1NyIsInNlYyI6MSwiYWNyIjoidXJuOmVwaWM6bG9hOmFhbDEiLCJjbHN2YyI6InByb2QtZm4iLCJ0IjoicyIsImF1dGhfdGltZSI6MTc3MTU0MDgxNiwiaWMiOnRydWUsImV4cCI6MTc3MTU0ODAxNiwiaWF0IjoxNzcxNTQwODE2LCJqdGkiOiJjNzBhNWQzMWYxMGY0YTA5YjcwOTc2MGE4ODQ4YWQ2YSJ9.2AsCPKFj-u9iW8NOkF0T1ac2a5n1thTzNdHY0jjVlez2mOeVG-LpvlYUHRpECVJ8QFNL5fTIinn1yTxYFFgKl_vc-BiW3AsQvxA6bFonoiL-YUQ_AjOrTHPkoX7fpSCe2ClcyyrasmFdqc0MJq5HUs-grflYauJo6RoHzXoUKq9qsKfmckT4nqx51dIw9AZElf51siCYmKCYFRD7voZxp8tOVAvPPCgTYDgCtlN5pBVjlA4DCmMSFNmf46UrqW6BwSb0Z07_VIDtFRVTicQnSj9XuHyovoLIc0EcBjb44Yt4muOIxlHB5yuCiyVoA1DrjizhObxb5IxvYKaBm8bWq2ckiR4pnLJche5YzQXgMZFL4Le0SRUzbfI4t5RoqKAcnIXT4o_fJiOcGH2VVgLzhCEWb9TuFMT-5ei27kMEGB0p5e4y83ehtbh_5Cw3sUSG62YEjIx7kK_Jgi8N2Slf7WNyArLk8y9BiFxeAXZq-uoyp1OtzeJTymH4PaMsxSDuYI00vZTS5RAsYj5c16kFumunuxI_npfPSk3DzIhOCSHM8p03sCnbVmN9B4e1fEg43Z1kb5dOT-YZuuUA9fSIY3XJ2_oe09At7i4HkHP9MyDW5Kx1DuQrJqrd_MiOxBwFmpQjVZ8FgBG9khvLMV5e3_uozzKjoFkzcM63SMQYZBc';

// 👇 PON TU ACCOUNT ID AQUÍ
const ACCOUNT_ID = '9a051c44bfcb4f65b2817c512ad88757';
// ─────────────────────────────────────────

const HEADERS = {
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
};

const ENDPOINTS = [
  {
    label: 'Party v1 - user info',
    method: 'GET',
    url: `https://party-service-prod.ol.epicgames.com/party/api/v1/Fortnite/user/${ACCOUNT_ID}`,
  },
  {
    label: 'Party v2 - user info',
    method: 'GET',
    url: `https://party-service-prod.ol.epicgames.com/party/api/v2/Fortnite/user/${ACCOUNT_ID}`,
  },
  {
    label: 'mms',
    method: 'GET',
    url: `https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/matchmaking/session/findPlayer${ACCOUNT_ID}`,
  },
  {
    label: 'Social - summary',
    method: 'GET',
    url: `https://social-private-service-prod.ol.epicgames.com/fortnite/api/social/v1/user/${ACCOUNT_ID}/summary`,
  },
  {
    label: 'MCP - QueryProfile',
    method: 'POST',
    url: `https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/profile/${ACCOUNT_ID}/client/QueryProfile?profileId=common_public&rvn=-1`,
    body: {},
  },
  {
    label: 'Friends - summary',
    method: 'GET',
    url: `https://friends-public-service-prod.ol.epicgames.com/friends/api/v1/${ACCOUNT_ID}/summary`,
  },
];

async function tryEndpoint(ep) {
  if (ep.method === 'GET') {
    return axios.get(ep.url, { headers: HEADERS, timeout: 10000 });
  }
  return axios.post(ep.url, ep.body ?? {}, { headers: HEADERS, timeout: 10000 });
}

async function main() {
  console.log(`🔍  Buscando sesión para cuenta: ${ACCOUNT_ID}\n`);

  const results = {};

  for (const ep of ENDPOINTS) {
    process.stdout.write(`  ${ep.label.padEnd(35)} → `);
    try {
      const res = await tryEndpoint(ep);
      const preview = JSON.stringify(res.data).slice(0, 120);
      console.log(`✅  HTTP ${res.status}  ${preview}`);
      results[ep.label] = { status: res.status, data: res.data };
    } catch (err) {
      const status = err.response?.status ?? '???';
      const code = err.response?.data?.errorCode ?? err.message;
      console.log(`❌  HTTP ${status}  ${code}`);
      results[ep.label] = { status, error: err.response?.data ?? err.message };
    }

    await new Promise(r => setTimeout(r, 200));
  }

  fs.writeFileSync('endpoint_results.json', JSON.stringify(results, null, 2));
  console.log('\n💾  Resultados completos en: endpoint_results.json');
  console.log('    Ábrelo y busca campos como: sessionId, sessionKey, gameSessionId, joinInfo, etc.');
}

main();