const fs = require('fs');
const UCAS = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.ucas';
const CHUNK = 64*1024*1024, OVERLAP = 32;

// Test multiple traps
const tests = [
  { name: 'Spikes_Wood_UC_T01', guid: '6193115B478C72C2342CB982AEFD644F', expect: 'A0 C0' },
  { name: 'Spikes_Wood_R_T04', guid: '6BE388B3487B8E97DADB629D0F01EEDF', expect: 'A0 C0' },
  { name: 'Floor_Launcher_SR_T05', guid: '9DF7C6B248862CCDD1CF75933F2B960E', expect: 'A0 C0' },
  { name: 'Ceiling_Electric_AOE_R_T01', guid: '21CE054F40466471DA7FD7B616BFE4BF', expect: '00 00' },
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
      const before = Buffer.alloc(32);
      fs.readSync(fd, before, 0, 32, absPos - 32);
      const h0 = before[11].toString(16).padStart(2,'0').toUpperCase(); // offset -21
      const h1 = before[12].toString(16).padStart(2,'0').toUpperCase(); // offset -20
      console.log(t.name + ': Found at ' + absPos + ', height at -21 = ' + h0 + ' ' + h1 + ' (expected: ' + t.expect + ') ' + (h0+' '+h1 === t.expect ? 'OK' : 'MISMATCH'));
      found = true;
      break;
    }
    if (total > OVERLAP) { buf.copy(buf, 0, total-OVERLAP, total); carry = OVERLAP; } else carry = total;
    off += n;
  }
  if (!found) console.log(t.name + ': NOT FOUND');
  fs.closeSync(fd);
}
