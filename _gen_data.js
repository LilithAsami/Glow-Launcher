const fs = require('fs');
const buf0 = fs.readFileSync('trap_guids_all.csv');
let text;
if (buf0[0]===0xFF && buf0[1]===0xFE) text = buf0.slice(2).toString('utf16le');
else text = buf0.toString('utf8');
const csv = text.trim().split(/\r?\n/).slice(1);

function parseCsvLine(line) {
  const fields = []; let current = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { fields.push(current.trim()); current = ''; continue; }
    current += c;
  }
  fields.push(current.trim());
  return fields;
}

// Parse all traps
const traps = [];
for (const line of csv) {
  const f = parseCsvLine(line);
  if (f.length < 6) continue;
  const name = f[0];
  const guid = f[1];
  const height = f[4]; // "20 C1" format
  const desc = f[5];
  
  // Parse name: TID_Floor_FlameGrill_SR_T05
  const m = name.match(/^TID_(.+?)_(C|UC|R|VR|SR)_(T\d+)$/);
  let base, rarity, tier;
  if (m) {
    base = m[1]; rarity = m[2]; tier = m[3];
  } else {
    // Special traps without standard rarity/tier
    base = name.replace(/^TID_/, '');
    rarity = ''; tier = '';
  }
  
  traps.push({ name, guid, height, desc, base, rarity, tier });
}

// Get unique floor/wall trap bases with offsets
const output = traps.map(t => {
  const hParts = t.height.split(' ');
  return `  { n: '${t.name}', g: '${t.guid}', h: '${t.height}', d: '${t.desc}' },`;
}).join('\n');

console.log('Total:', traps.length);
console.log('// Unique descriptions:');
const descs = [...new Set(traps.map(t=>t.desc))].sort();
for (const d of descs) console.log('//  ', d);
