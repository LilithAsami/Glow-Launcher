const fs = require('fs');
const UCAS = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.ucas';
const CHUNK = 64*1024*1024;

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

const traps = [];
for (const line of csv) {
  const f = parseCsvLine(line);
  if (f.length >= 6) traps.push({ name: f[0], guid: f[1], height: f[4], desc: f[5] });
}

// Build a set of all guids
const guidToTrap = new Map();
for (const t of traps) guidToTrap.set(t.guid, t);
const remaining = new Set(traps.map(t => t.guid));
const results = new Map(); // guid -> filePos

console.log('Scanning for', remaining.size, 'GUIDs in single pass...');
const fd = fs.openSync(UCAS, 'r');
const stat = fs.fstatSync(fd);
const fileSize = stat.size;
const OVERLAP = 32;
const readBuf = Buffer.alloc(CHUNK + OVERLAP);
let off = 0, carry = 0;

while (remaining.size > 0) {
  const n = fs.readSync(fd, readBuf, carry, CHUNK, off);
  if (n === 0) break;
  const total = carry + n;
  const searchBuf = readBuf.subarray(0, total);
  for (const guid of [...remaining]) {
    const needle = Buffer.from(guid, 'ascii');
    const idx = searchBuf.indexOf(needle);
    if (idx >= 0) {
      results.set(guid, off - carry + idx);
      remaining.delete(guid);
    }
  }
  if (total > OVERLAP) { readBuf.copy(readBuf, 0, total-OVERLAP, total); carry = OVERLAP; } else carry = total;
  off += n;
}
fs.closeSync(fd);
console.log('Found', results.size, '/', traps.length, 'GUIDs in raw file');

// Now verify offsets for all found traps with non-trivial heights
const fd2 = fs.openSync(UCAS, 'r');
const offsetMap = {}; // "familyName" -> set of offsets seen
let verified = 0, noMatch = 0, skipped = 0;

for (const t of traps) {
  const absPos = results.get(t.guid);
  if (absPos === undefined) continue;
  
  const hParts = t.height.split(' ');
  const h0 = parseInt(hParts[0], 16);
  const h1 = parseInt(hParts[1], 16);
  
  // Skip if height is 00 00 (too common) or 01 00 or 00 01
  if ((h0 === 0 && h1 === 0) || (h0 === 0 && h1 === 1) || (h0 === 1 && h1 === 0)) { skipped++; continue; }
  
  const before = Buffer.alloc(64);
  fs.readSync(fd2, before, 0, 64, absPos - 64);
  
  let foundOff = -1;
  for (let i = 62; i >= 0; i--) {
    if (before[i] === h0 && before[i+1] === h1) { foundOff = 64 - i; break; }
  }
  
  // Extract family from name: everything before _RARITY_TIER
  const family = t.name.replace(/_(C|UC|R|VR|SR)_(T\d+)$/, '');
  if (!offsetMap[family]) offsetMap[family] = new Set();
  if (foundOff > 0) {
    offsetMap[family].add(foundOff);
    verified++;
  } else {
    noMatch++;
  }
}
fs.closeSync(fd2);

console.log('Verified:', verified, 'NoMatch:', noMatch, 'Skipped (00 00):', skipped);
console.log('\nOffset map per family:');
for (const [fam, offsets] of Object.entries(offsetMap).sort()) {
  console.log('  ' + fam.padEnd(35) + [...offsets].join(', '));
}
