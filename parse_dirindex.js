/**
 * parse_dirindex.js — Parse the directory index from pakchunk11 utoc
 * to find trap file → chunk index mappings.
 */
'use strict';
const fs = require('fs');

const buf = fs.readFileSync('E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.utoc');
const entryCount = 509644;
const hdrSize = 144;

// Known section offsets (determined empirically)
const chunkIdsOff = hdrSize; // 144
const dirIdxOff = 31822740; // From mount point search

// Read FString at offset
function readFStr(off) {
  const len = buf.readInt32LE(off);
  off += 4;
  if (len === 0) return { str: '', next: off };
  if (len > 0) {
    const str = buf.slice(off, off + len - 1).toString('utf8');
    return { str, next: off + len };
  }
  // Negative = UTF-16
  const count = -len;
  const str = buf.slice(off, off + count * 2 - 2).toString('utf16le');
  return { str, next: off + count * 2 };
}

// Parse directory index
let off = dirIdxOff;
const mountPoint = readFStr(off);
off = mountPoint.next;
console.log('Mount point:', JSON.stringify(mountPoint.str));

// Directory entries
const numDirEntries = buf.readUInt32LE(off); off += 4;
console.log('Directory entries:', numDirEntries);

const dirEntries = [];
for (let i = 0; i < numDirEntries; i++) {
  dirEntries.push({
    name: buf.readUInt32LE(off),
    firstChild: buf.readUInt32LE(off + 4),
    nextSibling: buf.readUInt32LE(off + 8),
    firstFile: buf.readUInt32LE(off + 12),
  });
  off += 16;
}
console.log('After dir entries, offset:', off);

// File entries
const numFileEntries = buf.readUInt32LE(off); off += 4;
console.log('File entries:', numFileEntries);

const fileEntries = [];
for (let i = 0; i < numFileEntries; i++) {
  fileEntries.push({
    name: buf.readUInt32LE(off),
    nextFile: buf.readUInt32LE(off + 4),
    userData: buf.readUInt32LE(off + 8),
  });
  off += 12;
}
console.log('After file entries, offset:', off);

// Name table
const numStrings = buf.readUInt32LE(off); off += 4;
console.log('Name strings:', numStrings);

const nameTable = [];
for (let i = 0; i < numStrings; i++) {
  const s = readFStr(off);
  nameTable.push(s.str);
  off = s.next;
}
console.log('After name table, offset:', off);
console.log('Dir index end should be:', dirIdxOff + 65536, '= ' + (dirIdxOff + 65536));

// Helper
function getName(idx) { return idx < nameTable.length ? nameTable[idx] : `?${idx}`; }

// Walk directory tree recursively
function walkDir(dirIdx, pathPrefix, results) {
  if (dirIdx === 0xFFFFFFFF) return;
  const entry = dirEntries[dirIdx];
  if (!entry) return;
  const dirName = getName(entry.name);
  const fullPath = pathPrefix + dirName + '/';

  let fileIdx = entry.firstFile;
  while (fileIdx !== 0xFFFFFFFF && fileIdx < fileEntries.length) {
    const file = fileEntries[fileIdx];
    const fileName = getName(file.name);
    results.push({ path: fullPath + fileName, chunkIndex: file.userData });
    fileIdx = file.nextFile;
  }

  let childIdx = entry.firstChild;
  while (childIdx !== 0xFFFFFFFF && childIdx < dirEntries.length) {
    walkDir(childIdx, fullPath, results);
    childIdx = dirEntries[childIdx].nextSibling;
  }
}

const allFiles = [];
walkDir(0, mountPoint.str, allFiles);
console.log('Total files found:', allFiles.length);

// Find trap files
const trapFiles = allFiles.filter(f => f.path.includes('Traps/Floor/TID_Floor') && f.path.endsWith('.uasset'));
console.log('Floor trap .uasset files:', trapFiles.length);

// Show first 5 trap files with their chunk indices
console.log('\n=== SAMPLE TRAP FILES ===');
for (const tf of trapFiles.slice(0, 5)) {
  const ci = tf.chunkIndex;
  console.log(`  ${tf.path.split('/').pop().replace('.uasset', '')}`);
  console.log(`    ChunkIndex: ${ci}`);

  // Read ChunkId (12 bytes) from the ChunkIds section
  const cidOff = chunkIdsOff + ci * 12;
  if (cidOff + 12 <= buf.length) {
    const chunkIdRaw = buf.slice(cidOff, cidOff + 12).toString('hex').toUpperCase();
    const chunkId64 = buf.readBigUInt64LE(cidOff);
    const chunkIdx = buf.readUInt16LE(cidOff + 8);
    const chunkType = buf.readUInt8(cidOff + 11);
    console.log(`    ChunkId raw: ${chunkIdRaw}`);
    console.log(`    PackageId: 0x${chunkId64.toString(16).padStart(16, '0')}`);
    console.log(`    ChunkIdx: ${chunkIdx}, Type: ${chunkType}`);
  }
}

// Now look for specific known traps
console.log('\n=== KNOWN TRAPS ===');
const knownTraps = [
  { name: 'TID_Floor_FlameGrill_SR_T05', expectedHex: 'CA2D14B046A9CF0DD51945B6B873AA3D' },
  { name: 'TID_Floor_Spikes_Wood_UC_T01', expectedHex: '6193115B478C72C2342CB982AEFD644F' },
  { name: 'TID_Floor_Spikes_Wood_R_T04', expectedHex: '6BE388B3487B8E97DA' },
];

for (const kt of knownTraps) {
  const tf = trapFiles.find(f => f.path.includes(kt.name + '.uasset'));
  if (!tf) {
    console.log(`\n${kt.name}: NOT FOUND`);
    continue;
  }
  const ci = tf.chunkIndex;
  console.log(`\n${kt.name}:`);
  console.log(`  Path: ${tf.path}`);
  console.log(`  ChunkIndex: ${ci}`);
  console.log(`  Expected hex: ${kt.expectedHex}`);

  // Read ChunkId
  const cidOff = chunkIdsOff + ci * 12;
  const chunkIdRaw = buf.slice(cidOff, cidOff + 12).toString('hex').toUpperCase();
  const chunkId64 = buf.readBigUInt64LE(cidOff);
  const chunkIdx = buf.readUInt16LE(cidOff + 8);
  const chunkType = buf.readUInt8(cidOff + 11);
  console.log(`  ChunkId raw 12B: ${chunkIdRaw}`);
  console.log(`  PackageId: 0x${chunkId64.toString(16).padStart(16, '0')}`);

  // Read ChunkMeta (hash) - metas section starts after dir index
  // metasOff = dirIdxOff + 65536 = 31888276
  const metasOff = dirIdxOff + 65536;
  const cmOff = metasOff + ci * 33;
  if (cmOff + 33 <= buf.length) {
    const hash = buf.slice(cmOff, cmOff + 32).toString('hex').toUpperCase();
    const flags = buf.readUInt8(cmOff + 32);
    console.log(`  ChunkHash: ${hash}`);
    console.log(`  HashFirst16: ${hash.slice(0, 32)}`);
    console.log(`  Flags: ${flags}`);
  }

  // Also look for related chunks (same PackageId, different type)
  const relatedChunks = [];
  for (let i = 0; i < entryCount; i++) {
    const testOff = chunkIdsOff + i * 12;
    if (buf.readBigUInt64LE(testOff) === chunkId64 && i !== ci) {
      relatedChunks.push({
        idx: i,
        chunkIdx: buf.readUInt16LE(testOff + 8),
        type: buf.readUInt8(testOff + 11),
      });
    }
  }
  if (relatedChunks.length > 0) {
    console.log(`  Related chunks:`);
    for (const rc of relatedChunks) {
      console.log(`    Entry ${rc.idx}: chunkIdx=${rc.chunkIdx}, type=${rc.type}`);
    }
  }
}
