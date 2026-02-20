const fs = require('fs');
const UCAS = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.ucas';
const CHUNK = 64*1024*1024;

// Parse CSV
const csv = fs.readFileSync('trap_guids_all.csv','utf8').trim().split('\n').slice(1);
const traps = csv.map(line => {
  const m = line.match(/^([^,]+),([^,]+),([^,]+),("[^"]*"|[^,]*),([^,]+),"?([^"]*)"?$/);
  if (!m) return null;
  return { name: m[1], guid: m[2], height: m[5].trim(), desc: m[6] };
}).filter(Boolean);

// Pick one representative per family (preferring non-zero height)
const families = {};
for (const t of traps) {
  if (!families[t.desc] || (families[t.desc].height === '00 00' && t.height !== '00 00')) {
    families[t.desc] = t;
  }
}
const targets = Object.values(families);
const results = new Map(); // guid -> absPos

// Single-pass scan: read file with overlap for all target GUIDs
const fd = fs.openSync(UCAS, 'r');
const stat = fs.fstatSync(fd);
const fileSize = stat.size;
const OVERLAP = 32;
const buf = Buffer.alloc(CHUNK + OVERLAP);
let off = 0, carry = 0;
let remaining = new Set(targets.map(t => t.guid));

console.log('Scanning ' + (fileSize/(1024*1024*1024)).toFixed(1) + ' GB for ' + remaining.size + ' GUIDs...');

while (remaining.size > 0) {
  const n = fs.readSync(fd, buf, carry, CHUNK, off);
  if (n === 0) break;
  const total = carry + n;
  
  for (const guid of [...remaining]) {
    const needle = Buffer.from(guid, 'ascii');
    const idx = buf.subarray(0, total).indexOf(needle);
    if (idx >= 0) {
      results.set(guid, off - carry + idx);
      remaining.delete(guid);
    }
  }
  
  if (total > OVERLAP) {
    buf.copy(buf, 0, total - OVERLAP, total);
    carry = OVERLAP;
  } else carry = total;
  off += n;
  
  if (off % (512*1024*1024) === 0) process.stderr.write(Math.round(off/fileSize*100) + '% ');
}
fs.closeSync(fd);
console.log('\nFound ' + results.size + '/' + targets.length);

// Now check height offsets
const fd2 = fs.openSync(UCAS, 'r');
for (const t of targets) {
  const absPos = results.get(t.guid);
  if (absPos === undefined) {
    console.log(t.desc.padEnd(28) + t.name.padEnd(42) + 'NOT_FOUND');
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
  
  console.log(t.desc.padEnd(28) + t.name.padEnd(42) + 'h=' + t.height.padEnd(8) + 'off=' + foundOff);
}
fs.closeSync(fd2);
