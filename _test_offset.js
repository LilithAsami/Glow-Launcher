// Find the height offset relative to GUID in the .ucas file
const fs = require('fs');
const UCAS = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.ucas';

// A known floor trap: FlameGrill_SR_T05
// GUID: CA2D14B046A9CF0DD51945B6B873AA3D, expected height: 20 C1
const GUID_ASCII = Buffer.from('CA2D14B046A9CF0DD51945B6B873AA3D', 'ascii');

// Stream-search for this GUID
const CHUNK = 64*1024*1024;
const OVERLAP = 32;
const fd = fs.openSync(UCAS, 'r');
const buf = Buffer.alloc(CHUNK + OVERLAP);
let off = 0, carry = 0;
while(true) {
  const n = fs.readSync(fd, buf, carry, CHUNK, off);
  if (n === 0) break;
  const total = carry + n;
  const idx = buf.subarray(0, total).indexOf(GUID_ASCII);
  if (idx >= 0) {
    const absPos = off - carry + idx;
    console.log('Found GUID at file offset:', absPos);
    // Read 128 bytes before the GUID
    const before = Buffer.alloc(128);
    fs.readSync(fd, before, 0, 128, absPos - 128);
    // Show hex dump of 128 bytes before GUID
    for (let i = 0; i < 128; i += 16) {
      const hex = [];
      for (let j = 0; j < 16 && i+j < 128; j++) {
        hex.push(before[i+j].toString(16).padStart(2,'0'));
      }
      console.log('  -' + (128-i).toString().padStart(3) + ':', hex.join(' '));
    }
    // Also show which offsets have "20 C1" (the expected height)
    for (let i = 0; i < 127; i++) {
      if (before[i] === 0x20 && before[i+1] === 0xC1) {
        console.log('  Found 20 C1 at offset -' + (128-i));
      }
    }
    break;
  }
  if (total > OVERLAP) {
    buf.copy(buf, 0, total - OVERLAP, total);
    carry = OVERLAP;
  } else carry = total;
  off += n;
}
fs.closeSync(fd);
