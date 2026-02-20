const fs = require('fs');
const UCAS = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.ucas';
const CHUNK = 64*1024*1024, OVERLAP = 32;

const tests = [
  { name: 'FlameGrill_SR_T05', guid: 'CA2D14B046A9CF0DD51945B6B873AA3D', expect: [0x20, 0xC1] },
  { name: 'Spikes_Wood_UC_T01', guid: '6193115B478C72C2342CB982AEFD644F', expect: [0xA0, 0xC0] },
  { name: 'Floor_Launcher_SR_T05', guid: '9DF7C6B248862CCDD1CF75933F2B960E', expect: [0xA0, 0xC0] },
  { name: 'Ceiling_Electric_AOE_R_T01', guid: '21CE054F40466471DA7FD7B616BFE4BF', expect: [0x00, 0x00] },
];

for (const t of tests) {
  const needle = Buffer.from(t.guid, 'ascii');
  const fd = fs.openSync(UCAS, 'r');
  const buf = Buffer.alloc(CHUNK + OVERLAP);
  let off = 0, carry = 0, found = false;
  while(true) {
    const n = fs.readSync(fd, buf, carry, CHUNK, off);
    if (n === 0) break;
    const total = carry + n;
    const idx = buf.subarray(0, total).indexOf(needle);
    if (idx >= 0) {
      const absPos = off - carry + idx;
      const before = Buffer.alloc(512);
      fs.readSync(fd, before, 0, 512, absPos - 512);
      
      // Search for expected height bytes in the 512 bytes before GUID
      const hits = [];
      for (let i = 0; i < 511; i++) {
        if (before[i] === t.expect[0] && before[i+1] === t.expect[1]) {
          hits.push(512 - i);
        }
      }
      console.log(t.name + ': GUID at ' + absPos + ', height ' + t.expect.map(x=>x.toString(16).padStart(2,'0')).join(' ') + ' found at offsets: ' + (hits.length?hits.join(', '):'NONE'));
      
      // Also dump the 64 bytes immediately before the GUID for analysis
      console.log('  Bytes -40 to 0:');
      const row = [];
      for (let i = 512-40; i < 512; i++) row.push(before[i].toString(16).padStart(2,'0'));
      console.log('  ' + row.join(' '));
      
      found = true;
      break;
    }
    if (total > OVERLAP) { buf.copy(buf, 0, total-OVERLAP, total); carry = OVERLAP; } else carry = total;
    off += n;
  }
  if (!found) console.log(t.name + ': NOT FOUND');
  fs.closeSync(fd);
}
