/**
 * Compara dos MCP QueryProfile (campaign) y muestra solo las diferencias
 * Uso: node _compare_mcp.js <archivo_a.json> <archivo_b.json>
 */

const fs = require('fs');

const fileA = process.argv[2];
const fileB = process.argv[3];

if (!fileA || !fileB) {
  console.error('Uso: node _compare_mcp.js <archivo_a.json> <archivo_b.json>');
  process.exit(1);
}

const a = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
const b = JSON.parse(fs.readFileSync(fileB, 'utf-8'));

const profileA = a.profileChanges[0].profile;
const profileB = b.profileChanges[0].profile;

console.log(`\n${'═'.repeat(70)}`);
console.log(`  Comparando MCP profiles`);
console.log(`  A: ${fileA}`);
console.log(`  B: ${fileB}`);
console.log(`${'═'.repeat(70)}\n`);

// ─── 1. Stats/attributes ─────────────────────────────────────────────────────

console.log('━━━ STATS / ATTRIBUTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const statsA = profileA.stats?.attributes ?? {};
const statsB = profileB.stats?.attributes ?? {};

const allStatKeys = new Set([...Object.keys(statsA), ...Object.keys(statsB)]);
let statsDiffs = 0;

for (const key of allStatKeys) {
  const va = JSON.stringify(statsA[key]);
  const vb = JSON.stringify(statsB[key]);

  if (va !== vb) {
    statsDiffs++;
    console.log(`  [STAT] ${key}`);
    if (!(key in statsA)) {
      console.log(`    ← SOLO EN B: ${vb}`);
    } else if (!(key in statsB)) {
      console.log(`    ← SOLO EN A: ${va}`);
    } else {
      console.log(`    A: ${va}`);
      console.log(`    B: ${vb}`);
    }
    console.log();
  }
}

if (statsDiffs === 0) {
  console.log('  (sin diferencias en stats)\n');
}

// ─── 2. Items ─────────────────────────────────────────────────────────────────

console.log('━━━ ITEMS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const itemsA = profileA.items ?? {};
const itemsB = profileB.items ?? {};

const keysA = new Set(Object.keys(itemsA));
const keysB = new Set(Object.keys(itemsB));

// Items solo en A (desaparecieron)
const onlyInA = [...keysA].filter(k => !keysB.has(k));
// Items solo en B (aparecieron)
const onlyInB = [...keysB].filter(k => !keysA.has(k));
// Items en ambos pero distintos
const inBoth = [...keysA].filter(k => keysB.has(k));

console.log(`  Items SOLO EN A (desaparecieron de B): ${onlyInA.length}`);
for (const k of onlyInA) {
  const item = itemsA[k];
  console.log(`    - [${k}] templateId: ${item.templateId} qty: ${item.quantity}`);
  if (item.attributes) {
    // Mostrar atributos relevantes
    const attrs = item.attributes;
    const interesting = ['quest_state', 'match_statistics', 'pack_source', 'item_seen'];
    for (const attr of interesting) {
      if (attrs[attr] !== undefined) {
        console.log(`        ${attr}: ${JSON.stringify(attrs[attr])}`);
      }
    }
  }
}

console.log(`\n  Items SOLO EN B (aparecieron nuevos): ${onlyInB.length}`);
for (const k of onlyInB) {
  const item = itemsB[k];
  console.log(`    + [${k}] templateId: ${item.templateId} qty: ${item.quantity}`);
  if (item.attributes) {
    const attrs = item.attributes;
    const interesting = ['quest_state', 'match_statistics', 'pack_source', 'item_seen'];
    for (const attr of interesting) {
      if (attrs[attr] !== undefined) {
        console.log(`        ${attr}: ${JSON.stringify(attrs[attr])}`);
      }
    }
  }
}

// Items en ambos con diferencias
let changedItems = 0;
for (const k of inBoth) {
  const ia = itemsA[k];
  const ib = itemsB[k];

  if (JSON.stringify(ia) !== JSON.stringify(ib)) {
    changedItems++;
    console.log(`\n  ~ CAMBIÓ [${k}] templateId: ${ia.templateId}`);

    // Comparar quantity
    if (ia.quantity !== ib.quantity) {
      console.log(`    quantity: ${ia.quantity} → ${ib.quantity}`);
    }

    // Comparar atributos uno a uno
    const attrsA = ia.attributes ?? {};
    const attrsB = ib.attributes ?? {};
    const allAttrKeys = new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]);

    for (const ak of allAttrKeys) {
      const av = JSON.stringify(attrsA[ak]);
      const bv = JSON.stringify(attrsB[ak]);
      if (av !== bv) {
        if (!(ak in attrsA)) {
          console.log(`    + attr ${ak}: ${bv}`);
        } else if (!(ak in attrsB)) {
          console.log(`    - attr ${ak}: ${av}`);
        } else {
          console.log(`    ~ attr ${ak}:`);
          console.log(`        A: ${av}`);
          console.log(`        B: ${bv}`);
        }
      }
    }
  }
}

console.log(`\n  Items modificados (en ambos, distintos): ${changedItems}`);

// ─── 3. Resumen rápido ────────────────────────────────────────────────────────

console.log(`\n${'━'.repeat(70)}`);
console.log('  RESUMEN');
console.log(`${'━'.repeat(70)}`);
console.log(`  Stats diferentes    : ${statsDiffs}`);
console.log(`  Items desaparecidos : ${onlyInA.length}`);
console.log(`  Items nuevos        : ${onlyInB.length}`);
console.log(`  Items modificados   : ${changedItems}`);
console.log(`${'═'.repeat(70)}\n`);

// ─── 4. Campos clave del Aerial Launcher ─────────────────────────────────────

console.log('━━━ CAMPOS CLAVE (detección de victoria) ━━━━━━━━━━━━━━━━━━━━━━━\n');

const missionAlertA = statsA.mission_alert_redemption_record?.pendingMissionAlertRewards?.items?.length ?? 0;
const missionAlertB = statsB.mission_alert_redemption_record?.pendingMissionAlertRewards?.items?.length ?? 0;
console.log(`  pendingMissionAlertRewards.items.length      A:${missionAlertA}  B:${missionAlertB}  ${missionAlertA !== missionAlertB ? '← CAMBIÓ' : ''}`);

const diffIncA = statsA.difficulty_increase_rewards_record?.pendingRewards?.length ?? 0;
const diffIncB = statsB.difficulty_increase_rewards_record?.pendingRewards?.length ?? 0;
console.log(`  difficulty_increase_rewards.pendingRewards   A:${diffIncA}  B:${diffIncB}  ${diffIncA !== diffIncB ? '← CAMBIÓ' : ''}`);

// CardPacks con match_statistics o pack_source=ItemCache
function countPendingRewards(items) {
  return Object.entries(items).filter(([, v]) => {
    const attrs = v.attributes ?? {};
    return (
      (v.templateId?.startsWith('CardPack:') && (attrs.match_statistics || attrs.pack_source === 'ItemCache')) ||
      (attrs.quest_state === 'Completed')
    );
  }).length;
}

const pendA = countPendingRewards(itemsA);
const pendB = countPendingRewards(itemsB);
console.log(`  CardPack/Quest pendientes                    A:${pendA}  B:${pendB}  ${pendA !== pendB ? '← CAMBIÓ' : ''}`);

console.log();
