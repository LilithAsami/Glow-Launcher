const fs = require('fs');
const UCAS = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.ucas';
const CHUNK = 64*1024*1024, OVERLAP = 32;

const csv2 = fs.readFileSync('trap_guids_all.csv','utf8').trim().split('\n').slice(1);
const traps = csv2.map(line => {
  const m = line.match(/^([^,]+),([^,]+),([^,]+),("[^"]*"|[^,]*),([^,]+),"?([^"]*)"?$/);
  if (!m) return null;
  return { name: m[1], guid: m[2], height: m[5].trim(), desc: m[6] };
}).filter(Boolean);

const families = {};
for (const t of traps) {
  if (!families[t.desc]) families[t.desc] = [];
  families[t.desc].push(t);
}

function findGuid(fd, guidStr) {
  const needle = Buffer.from(guidStr, 'ascii');
  const buf = Buffer.alloc(CHUNK + OVERLAP);
  let off = 0, carry = 0;
  while(true) {
    const n = fs.readSync(fd, buf, carry, CHUNK, off);
    if (n === 0) return -1;
    const total = carry + n;
    const idx = buf.subarray(0, total).indexOf(needle);
    if (idx >= 0) return off - carry + idx;
    if (total > OVERLAP) { buf.copy(buf, 0, total-OVERLAP, total); carry = OVERLAP; } else carry = total;
    off += n;
  }
}

for (const [famName, trps] of Object.entries(families)) {
  const candidate = trps.find(t => t.height !== '00 00') || trps[0];
  if (!candidate) continue;
  
  const fd = fs.openSync(UCAS, 'r');
  const absPos = findGuid(fd, candidate.guid);

  if (absPos < 0) {
    console.log(famName.padEnd(30) + candidate.name.padEnd(45) + 'NOT_FOUND');
    fs.closeSync(fd);
    continue;
  }

  const before = Buffer.alloc(64);
  fs.readSync(fd, before, 0, 64, absPos - 64);
  fs.closeSync(fd);
  
  const hParts = candidate.height.split(' ');
  const h0 = parseInt(hParts[0], 16);
  const h1 = parseInt(hParts[1], 16);
  
  let foundOff = -1;
  if (candidate.height !== '00 00') {
    for (let i = 62; i >= 0; i--) {
      if (before[i] === h0 && before[i+1] === h1) { foundOff = 64 - i; break; }
    }
  }
  
  console.log(famName.padEnd(30) + candidate.name.padEnd(45) + 'h=' + candidate.height + ' off=' + foundOff);
}
