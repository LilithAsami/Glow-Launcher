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

// Pick one per family (prefer non-zero height)
const families = {};
for (const t of traps) {
  if (!families[t.desc] || (families[t.desc].height === '00 00' && t.height !== '00 00')) families[t.desc] = t;
}
const targets = Object.values(families);
const remaining = new Set(targets.map(t => t.guid));
const results = new Map();

console.log('Scanning for', remaining.size, 'GUIDs...');
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
  for (const guid of [...remaining]) {
    const needle = Buffer.from(guid, 'ascii');
    const idx = readBuf.subarray(0, total).indexOf(needle);
    if (idx >= 0) {
      results.set(guid, off - carry + idx);
      remaining.delete(guid);
    }
  }
  if (total > OVERLAP) { readBuf.copy(readBuf, 0, total-OVERLAP, total); carry = OVERLAP; } else carry = total;
  off += n;
  if (off % (256*1024*1024) < CHUNK) process.stderr.write(Math.round(off/fileSize*100) + '% ');
}
fs.closeSync(fd);
console.log('\nFound', results.size, '/', targets.length);

// Check height offsets
const fd2 = fs.openSync(UCAS, 'r');
for (const t of targets) {
  const absPos = results.get(t.guid);
  if (absPos === undefined) {
    console.log(t.desc.padEnd(32) + 'NOT_FOUND');
    continue;
  }
  const before = Buffer.alloc(64);
  fs.readSync(fd2, before, 0, 64, absPos - 64);
  
  const hParts = t.height.split(' ');
  const h0 = parseInt(hParts[0], 16);
  const h1 = parseInt(hParts[1], 16);
  
  let foundOff = -1;
  if (t.height !== '00 00') {
    for (let i = 62; i >= 0; i--) {
      if (before[i] === h0 && before[i+1] === h1) { foundOff = 64 - i; break; }
    }
  }
  
  console.log(t.desc.padEnd(32) + ('h='+t.height).padEnd(12) + 'off=' + String(foundOff).padEnd(6) + 'pos=' + absPos);
}
fs.closeSync(fd2);
