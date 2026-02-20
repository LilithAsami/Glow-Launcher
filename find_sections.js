/**
 * find_sections.js — Find actual section offsets in utoc by searching for landmarks.
 */
'use strict';
const fs = require('fs');

const buf = fs.readFileSync('E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.utoc');
console.log('UTOC size:', buf.length);

// 1. Search for compression method names
const methods = ['Zlib', 'Oodle', 'LZ4', 'None', 'Zstd', 'zlib', 'oodle'];
for (const m of methods) {
  const needle = Buffer.from(m, 'utf8');
  for (let i = 0; i <= buf.length - needle.length; i++) {
    if (buf.compare(needle, 0, needle.length, i, i + needle.length) === 0) {
      console.log(`Found "${m}" at offset ${i} (0x${i.toString(16)})`);
      const s = Math.max(0, i - 4);
      const e = Math.min(buf.length, i + 40);
      const sl = buf.slice(s, e);
      const hex = [];
      for (let c = 0; c < sl.length; c++) hex.push(sl[c].toString(16).padStart(2, '0'));
      console.log('  ' + hex.join(' '));
      break;
    }
  }
}

// 2. Find mount point FString ("../../../")
const mp = Buffer.from('../../../', 'utf8');
for (let i = 0; i <= buf.length - mp.length; i++) {
  if (buf.compare(mp, 0, mp.length, i, i + mp.length) === 0) {
    // The FString length uint32 should be right before
    const lenOff = i - 4;
    const strLen = buf.readUInt32LE(lenOff);
    console.log(`\nMount point string at offset ${i}, length field at ${lenOff} = ${strLen}`);
    console.log('  String: ' + buf.slice(i, i + strLen - 1).toString('utf8'));
    console.log('  Directory index starts at: ' + lenOff);

    // Show what's before the length (end of previous section)
    console.log('\n  16 bytes before dirIndex start:');
    const before = buf.slice(lenOff - 16, lenOff);
    const hex = [];
    for (let c = 0; c < before.length; c++) hex.push(before[c].toString(16).padStart(2, '0'));
    console.log('    ' + hex.join(' '));
    break;
  }
}

// 3. Figure out what's between the known sections
// ChunkIds: starts at 144, 12 bytes each, 509644 entries → ends at 6115872
// OffsetLengths: 10 bytes each → ends at 11212312
// Remaining: 11212312 to mount_point_offset
// The compression blocks section should be between: needs 612190*12 = 7346280 bytes

console.log('\n=== BACK-CALCULATING SECTION OFFSETS ===');
const hdrSize = 144;
const entryCount = 509644;
const compBlkCnt = 612190;
const chunkIdsEnd = hdrSize + entryCount * 12; // 6115872
const olEnd = chunkIdsEnd + entryCount * 10; // 11212312

const mountPointOffset = 31822750; // From search above (approx)

// Between olEnd and mountPoint: phSeeds + phOverflow + compBlocks + compMethods
// compBlocks = 7346280 bytes
// compMethods = 32 bytes
// So phSeeds + phOverflow = mountPointOffset - olEnd - 7346280 - 32

const knownMiddle = 7346280 + 32; // compBlocks + compMethods
const gap = mountPointOffset - olEnd;
const hashSections = gap - knownMiddle;
console.log(`OL end: ${olEnd}`);
console.log(`Mount point (dir idx start): ${mountPointOffset}`);
console.log(`Gap: ${gap} bytes`);
console.log(`Known middle (compBlocks+compMethods): ${knownMiddle} bytes`);
console.log(`Hash sections size: ${hashSections} bytes`);

// The directory index should be dirIdxSz=65536 bytes
// After dir index: metas = entryCount * 33 = 16818252 bytes
// After metas: name table
const dirIdxStart = mountPointOffset;
const dirIdxEnd = dirIdxStart + 65536;
const metasStart = dirIdxEnd;
const metasEnd = metasStart + entryCount * 33;
console.log(`\nDir index: ${dirIdxStart} - ${dirIdxEnd}`);
console.log(`Metas: ${metasStart} - ${metasEnd}`);
console.log(`After metas to EOF: ${buf.length - metasEnd} bytes`);

// Name table should be in the file name string area around offset 48M
// Let me check if the data after metas starts with a name table count
console.log(`\nFirst 32 bytes after metas:`);
const afterMetas = buf.slice(metasStart, metasStart + 64);
for (let r = 0; r < 64; r += 16) {
  const hex = [];
  for (let c = 0; c < 16 && r+c < afterMetas.length; c++) hex.push(afterMetas[r+c].toString(16).padStart(2, '0'));
  console.log('  ' + hex.join(' '));
}

// Now figure out where compBlocks starts by searching for the Oodle signature
// Compression block entries: 12 bytes: offset(5) + compSz(3) + uncompSz(3) + method(1)
// The first block should have offset=0 (start of ucas)
// So search for first 5 bytes = 00 00 00 00 00 (offset=0)
// followed by compSize(3) and uncompSize(3) and method(1)

// Actually, let me search for the Oodle method string which should be at compMthOff
// Fortnite uses Oodle compression. Let me search for "Oodle" in the area after olEnd.
console.log('\nSearching for Oodle in potential compMethods area...');
const searchStart = olEnd;
const searchEnd = Math.min(olEnd + 21000000, buf.length);
const needleOodle = Buffer.from('Oodle', 'utf8');
for (let i = searchStart; i <= searchEnd - needleOodle.length; i++) {
  if (buf.compare(needleOodle, 0, needleOodle.length, i, i + needleOodle.length) === 0) {
    console.log(`  Found Oodle at ${i} (0x${i.toString(16)})`);
    // The compMthOff should be here (or start of the 32-byte name block)
    // Show 48 bytes around it
    const s = Math.max(0, i - 4);
    const sl = buf.slice(s, s + 48);
    const hex = [];
    for (let c = 0; c < sl.length; c++) hex.push(sl[c].toString(16).padStart(2, '0'));
    console.log('  ' + hex.join(' '));
    break;
  }
}
