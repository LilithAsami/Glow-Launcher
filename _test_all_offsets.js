const fs = require('fs');
const UCAS = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.ucas';
const CHUNK = 64*1024*1024, OVERLAP = 32;

// Parse CSV to get all traps
const csv = fs.readFileSync('trap_guids_all.csv','utf8').trim().split('\n').slice(1);
const traps = csv.map(line => {
  const m = line.match(/^([^,]+),([^,]+),([^,]+),("[^"]*"|[^,]*),([^,]+),"?([^"]*)"?$/);
  if (!m) return null;
  return { name: m[1], guid: m[2], height: m[5].trim(), desc: m[6] };
}).filter(Boolean);

// Group by description (trap family)
const families = {};
for (const t of traps) {
  if (!families[t.desc]) families[t.desc] = [];
  families[t.desc].push(t);
}

// For each family, test the first trap with a non-00-00 height
const results = [];
const fd = fs.openSync(UCAS, 'r');
const buf = Buffer.alloc(CHUNK + OVERLAP);

for (const [famName, trps] of Object.entries(families)) {
  // Pick a trap with non-zero height first, else the first one
  const candidate = trps.find(t => t.height !== '00 00') || trps[0];
  if (!candidate) continue;
  
  const needle = Buffer.from(candidate.guid, 'ascii');
  let off = 0, carry = 0, found = false;
  
  while(true) {
    const n = fs.readSync(fd, buf, carry, CHUNK, off);
    if (n === 0) break;
    const total = carry + n;
    const idx = buf.subarray(0, total).indexOf(needle);
    if (idx >= 0) {
      const absPos = off - carry + idx;
      const before = Buffer.alloc(64);
      fs.readSync(fd, before, 0, 64, absPos - 64);
      
      // Parse expected height bytes
      const hParts = candidate.height.split(' ');
      const h0 = parseInt(hParts[0], 16);
      const h1 = parseInt(hParts[1], 16);
      
      // Search for height in 64 bytes before GUID
      let foundOffset = -1;
      for (let i = 62; i >= 0; i--) {
        if (before[i] === h0 && before[i+1] === h1) {
          foundOffset = 64 - i;
          break;
        }
      }
      
      results.push({
        family: famName,
        name: candidate.name,
        height: candidate.height,
        offset: foundOffset,
        position: absPos
      });
      found = true;
      break;
    }
    if (total > OVERLAP) { buf.copy(buf, 0, total-OVERLAP, total); carry = OVERLAP; } else carry = total;
    off += n;
  }
  
  if (!found) {
    results.push({ family: famName, name: candidate.name, height: candidate.height, offset: 'NOT_FOUND', position: null });
  }
  
  // Reset file position for next search
  // Actually need to re-open since we can't easily reset the streaming state
}
fs.closeSync(fd);

// Output
for (const r of results) {
  console.log(r.family.padEnd(30) + r.name.padEnd(40) + 'height=' + r.height + ' offset=' + r.offset);
}
