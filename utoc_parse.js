/**
 * utoc_parse.js — Parse pakchunk11-WindowsClient.utoc to find what the hex values are.
 *
 * We search the utoc for the known hex values and identify which section they belong to.
 * We also parse the full directory index to map trap names to chunk indices.
 *
 * Known values to match:
 *   TID_Floor_FlameGrill_SR_T05    → CA2D14B046A9CF0DD51945B6B873AA3D
 *   TID_Floor_Spikes_Wood_UC_T01   → 6193115B478C72C2342CB982AEFD644F
 *   TID_Floor_Spikes_Wood_R_T04    → 6BE388B3487B8E97DA
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const UTOC_PATH = process.argv[2] || 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.utoc';
const UCAS_PATH = UTOC_PATH.replace(/\.utoc$/i, '.ucas');

console.log(`\n=== UTOC PARSER ===`);
console.log(`File: ${UTOC_PATH}`);

const buf = fs.readFileSync(UTOC_PATH);
console.log(`Size: ${buf.length} bytes\n`);

// ── Header ──────────────────────────────────────────────────
const MAGIC = '-==--==--==--==-';
const headerMagic = buf.slice(0, 16).toString('ascii');
console.log('Magic:', JSON.stringify(headerMagic), headerMagic === MAGIC ? '✓' : '✗ MISMATCH');

let off = 16;
const version             = buf.readUInt8(off); off += 1;
off += 1; // reserved0
off += 2; // reserved1
const tocHeaderSize       = buf.readUInt32LE(off); off += 4;
const tocEntryCount       = buf.readUInt32LE(off); off += 4;
const compBlockCount      = buf.readUInt32LE(off); off += 4;
const compBlockEntrySize  = buf.readUInt32LE(off); off += 4;
const compMethodNameCount = buf.readUInt32LE(off); off += 4;
const compMethodNameLen   = buf.readUInt32LE(off); off += 4;
const dirIndexSize        = buf.readUInt32LE(off); off += 4;
const containerFlags      = buf.readUInt32LE(off); off += 4;

// EncryptionKeyGuid (16 bytes FGuid)
const encKeyGuid = buf.slice(off, off + 16).toString('hex').toUpperCase();
off += 16;

let perfectHashSeedsCount = 0;
let partitionCount = 0n;
let partitionSize = 0n;
let chunksWithoutPHCount = 0;

if (version >= 2) {
  perfectHashSeedsCount = buf.readUInt32LE(off); off += 4;
}
if (version >= 3) {
  partitionCount = buf.readBigUInt64LE(off); off += 8;
  partitionSize  = buf.readBigUInt64LE(off); off += 8;
}
if (version >= 2) {
  chunksWithoutPHCount = buf.readUInt32LE(off); off += 4;
}

console.log('Version:', version);
console.log('Header size:', tocHeaderSize);
console.log('Entry count:', tocEntryCount);
console.log('Compressed block count:', compBlockCount);
console.log('Compressed block entry size:', compBlockEntrySize);
console.log('Compression methods:', compMethodNameCount, `(name length: ${compMethodNameLen})`);
console.log('Directory index size:', dirIndexSize);
console.log('Container flags:', '0x' + containerFlags.toString(16));
console.log('Encryption key GUID:', encKeyGuid);
console.log('Perfect hash seeds count:', perfectHashSeedsCount);
console.log('Partition count:', partitionCount.toString());
console.log('Partition size:', partitionSize.toString());
console.log('Chunks without perfect hash:', chunksWithoutPHCount);

// ── Section offsets ─────────────────────────────────────────
const dataStart = tocHeaderSize;

const chunkIdsOff         = dataStart;
const chunkIdsEnd         = chunkIdsOff + tocEntryCount * 12;

const offsetLengthsOff    = chunkIdsEnd;
const offsetLengthsEnd    = offsetLengthsOff + tocEntryCount * 10;

const perfectHashOff      = offsetLengthsEnd;
const perfectHashEnd      = perfectHashOff + perfectHashSeedsCount * 4;

const chunksNoPHOff       = perfectHashEnd;
const chunksNoPHEnd       = chunksNoPHOff + chunksWithoutPHCount * 4;

const compBlocksOff       = chunksNoPHEnd;
const compBlocksEnd       = compBlocksOff + compBlockCount * compBlockEntrySize;

const compMethodsOff      = compBlocksEnd;
const compMethodsEnd      = compMethodsOff + compMethodNameCount * compMethodNameLen;

const dirIndexOff         = compMethodsEnd;
const dirIndexEnd         = dirIndexOff + dirIndexSize;

const chunkMetasOff       = dirIndexEnd;
const chunkMetaEntrySize  = 33; // 32 bytes SHA256 hash + 1 byte flags
const chunkMetasEnd       = chunkMetasOff + tocEntryCount * chunkMetaEntrySize;

console.log('\n=== SECTION MAP ===');
console.log(`Chunk IDs:       ${chunkIdsOff} - ${chunkIdsEnd} (${tocEntryCount} × 12)`);
console.log(`Offset/Lengths:  ${offsetLengthsOff} - ${offsetLengthsEnd} (${tocEntryCount} × 10)`);
console.log(`PerfectHash:     ${perfectHashOff} - ${perfectHashEnd} (${perfectHashSeedsCount} × 4)`);
console.log(`ChunksNoPH:      ${chunksNoPHOff} - ${chunksNoPHEnd} (${chunksWithoutPHCount} × 4)`);
console.log(`CompBlocks:      ${compBlocksOff} - ${compBlocksEnd} (${compBlockCount} × ${compBlockEntrySize})`);
console.log(`CompMethods:     ${compMethodsOff} - ${compMethodsEnd} (${compMethodNameCount} × ${compMethodNameLen})`);
console.log(`DirIndex:        ${dirIndexOff} - ${dirIndexEnd} (${dirIndexSize})`);
console.log(`ChunkMetas:      ${chunkMetasOff} - ${chunkMetasEnd} (${tocEntryCount} × ${chunkMetaEntrySize})`);
console.log(`File end:        ${buf.length}`);

// ── Search for known hex values ─────────────────────────────
function searchBytes(haystack, needle) {
  const results = [];
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) results.push(i);
  }
  return results;
}

function identifySection(offset) {
  if (offset >= chunkIdsOff && offset < chunkIdsEnd) {
    const idx = Math.floor((offset - chunkIdsOff) / 12);
    const localOff = (offset - chunkIdsOff) % 12;
    return `ChunkIds[${idx}] +${localOff}`;
  }
  if (offset >= offsetLengthsOff && offset < offsetLengthsEnd) {
    const idx = Math.floor((offset - offsetLengthsOff) / 10);
    return `OffsetLength[${idx}]`;
  }
  if (offset >= compBlocksOff && offset < compBlocksEnd) return 'CompressedBlocks';
  if (offset >= dirIndexOff && offset < dirIndexEnd) return `DirIndex +${offset - dirIndexOff}`;
  if (offset >= chunkMetasOff && offset < chunkMetasEnd) {
    const idx = Math.floor((offset - chunkMetasOff) / chunkMetaEntrySize);
    const localOff = (offset - chunkMetasOff) % chunkMetaEntrySize;
    return `ChunkMeta[${idx}] +${localOff} (${localOff < 32 ? 'hash' : 'flags'})`;
  }
  return `Unknown (offset ${offset})`;
}

const knownValues = [
  { name: 'FlameGrill_SR_T05',    hex: 'CA2D14B046A9CF0DD51945B6B873AA3D' },
  { name: 'Spikes_Wood_UC_T01',   hex: '6193115B478C72C2342CB982AEFD644F' },
  { name: 'Spikes_Wood_R_T04',    hex: '6BE388B3487B8E97DA' },
];

console.log('\n=== SEARCHING KNOWN VALUES ===');
for (const kv of knownValues) {
  console.log(`\n--- ${kv.name}: ${kv.hex} ---`);

  // Try raw hex (big-endian byte order)
  const bytesBE = Buffer.from(kv.hex, 'hex');
  const foundBE = searchBytes(buf, bytesBE);
  console.log(`  Raw BE (${bytesBE.length} bytes): ${foundBE.length} hits`);
  for (const pos of foundBE.slice(0, 3)) {
    console.log(`    @ offset ${pos} → ${identifySection(pos)}`);
  }

  // Try per-uint32 little-endian swap (FGuid storage)
  if (kv.hex.length === 32) {
    const bytesLE = Buffer.alloc(16);
    for (let w = 0; w < 4; w++) {
      const dword = parseInt(kv.hex.slice(w * 8, w * 8 + 8), 16);
      bytesLE.writeUInt32LE(dword, w * 4);
    }
    const foundLE = searchBytes(buf, bytesLE);
    console.log(`  LE swap (${bytesLE.toString('hex')}): ${foundLE.length} hits`);
    for (const pos of foundLE.slice(0, 3)) {
      console.log(`    @ offset ${pos} → ${identifySection(pos)}`);
    }
  }

  // Try first 8 bytes (possible FIoChunkId)
  if (kv.hex.length >= 16) {
    const first8 = Buffer.from(kv.hex.slice(0, 16), 'hex');
    const found8 = searchBytes(buf, first8);
    console.log(`  First 8 bytes BE: ${found8.length} hits`);
    for (const pos of found8.slice(0, 3)) {
      console.log(`    @ offset ${pos} → ${identifySection(pos)}`);
    }
  }
}

// ── Parse directory index to find trap entries ──────────────
// The directory index format:
// FString MountPoint
// Then FIoDirectoryIndexResource:
//   int32 NumDirectoryEntries
//   FIoDirectoryIndexEntry[NumDirectoryEntries]
//     - uint32 Name (index into NameTable)
//     - uint32 FirstChildEntry (0xFFFFFFFF if none)
//     - uint32 NextSiblingEntry (0xFFFFFFFF if none)
//     - uint32 FirstFileEntry (0xFFFFFFFF if none)
//   int32 NumFileEntries
//   FIoFileIndexEntry[NumFileEntries]
//     - uint32 Name (index into NameTable)
//     - uint32 NextFileEntry (0xFFFFFFFF if none)
//     - uint32 UserData (chunk index mapping)
//   int32 NumStrings (name table)
//   FString[NumStrings]

console.log('\n=== DIRECTORY INDEX ===');

let dOff = dirIndexOff;

// Read mount point FString
function readFStr(offset) {
  const len = buf.readInt32LE(offset);
  offset += 4;
  if (len <= 0) return { str: '', next: offset };
  const str = buf.slice(offset, offset + len - 1).toString('utf8');
  return { str, next: offset + len };
}

const mountPoint = readFStr(dOff);
dOff = mountPoint.next;
console.log('Mount point:', JSON.stringify(mountPoint.str));

// Directory entries
const numDirEntries = buf.readInt32LE(dOff); dOff += 4;
console.log('Directory entries:', numDirEntries);

const dirEntries = [];
for (let i = 0; i < numDirEntries; i++) {
  dirEntries.push({
    name: buf.readUInt32LE(dOff),
    firstChild: buf.readUInt32LE(dOff + 4),
    nextSibling: buf.readUInt32LE(dOff + 8),
    firstFile: buf.readUInt32LE(dOff + 12),
  });
  dOff += 16;
}

// File entries
const numFileEntries = buf.readInt32LE(dOff); dOff += 4;
console.log('File entries:', numFileEntries);

const fileEntries = [];
for (let i = 0; i < numFileEntries; i++) {
  fileEntries.push({
    name: buf.readUInt32LE(dOff),
    nextFile: buf.readUInt32LE(dOff + 4),
    userData: buf.readUInt32LE(dOff + 8),
  });
  dOff += 12;
}

// Name table (strings)
const numStrings = buf.readInt32LE(dOff); dOff += 4;
console.log('Name strings:', numStrings);

const nameTable = [];
for (let i = 0; i < numStrings; i++) {
  const s = readFStr(dOff);
  nameTable.push(s.str);
  dOff = s.next;
}

// ── Walk tree to find traps ─────────────────────────────────
function getName(idx) { return idx < nameTable.length ? nameTable[idx] : `?${idx}`; }

// Recursively walk directory tree
function walkDir(dirIdx, pathPrefix, results) {
  if (dirIdx === 0xFFFFFFFF) return;
  const entry = dirEntries[dirIdx];
  const dirName = getName(entry.name);
  const fullPath = pathPrefix + dirName + '/';

  // Walk files in this directory
  let fileIdx = entry.firstFile;
  while (fileIdx !== 0xFFFFFFFF) {
    const file = fileEntries[fileIdx];
    const fileName = getName(file.name);
    results.push({ path: fullPath + fileName, chunkIndex: file.userData });
    fileIdx = file.nextFile;
  }

  // Walk child directories
  let childIdx = entry.firstChild;
  while (childIdx !== 0xFFFFFFFF) {
    walkDir(childIdx, fullPath, results);
    childIdx = dirEntries[childIdx].nextSibling;
  }
}

const allFiles = [];
walkDir(0, mountPoint.str, allFiles);
console.log(`Total files in directory: ${allFiles.length}`);

// Find trap files
const trapFiles = allFiles.filter(f => f.path.includes('Traps/Floor/TID_Floor'));
console.log(`Trap floor files found: ${trapFiles.length}`);

// ── Show data for known traps ───────────────────────────────
const trapNames = ['TID_Floor_FlameGrill_SR_T05', 'TID_Floor_Spikes_Wood_UC_T01', 'TID_Floor_Spikes_Wood_R_T04'];

console.log('\n=== KNOWN TRAP DATA ===');
for (const name of trapNames) {
  const found = trapFiles.find(f => f.path.includes(name));
  if (!found) {
    console.log(`\n${name}: NOT FOUND in directory index`);
    continue;
  }

  const ci = found.chunkIndex;
  console.log(`\n${name}:`);
  console.log(`  Path: ${found.path}`);
  console.log(`  Chunk index: ${ci}`);

  // Read FIoChunkId (12 bytes)
  const cidOff = chunkIdsOff + ci * 12;
  const chunkIdBytes = buf.slice(cidOff, cidOff + 12);
  const chunkId64 = buf.readBigUInt64LE(cidOff);
  const chunkIndex = buf.readUInt16LE(cidOff + 8);
  const chunkPad = buf.readUInt8(cidOff + 10);
  const chunkType = buf.readUInt8(cidOff + 11);
  console.log(`  ChunkId raw 12 bytes: ${chunkIdBytes.toString('hex').toUpperCase()}`);
  console.log(`  ChunkId64: ${chunkId64.toString(16).padStart(16, '0').toUpperCase()}`);
  console.log(`  ChunkIndex: ${chunkIndex}, Type: ${chunkType}, Pad: ${chunkPad}`);

  // Read offset/length (10 bytes: 5 bytes offset, 5 bytes length)
  const olOff = offsetLengthsOff + ci * 10;
  const raw = buf.slice(olOff, olOff + 10);
  // UE stores as 5-byte packed values
  const offsetVal = Number(buf.readBigUInt64LE(olOff) & 0xFFFFFFFFFFn);
  // Actually it's stored as: offset(40 bits) | length(40 bits) packed differently
  // Let me just show raw bytes
  console.log(`  Offset/Length raw: ${raw.toString('hex').toUpperCase()}`);

  // Read chunk meta (33 bytes: 32 hash + 1 flags)
  const cmOff = chunkMetasOff + ci * chunkMetaEntrySize;
  const chunkHash = buf.slice(cmOff, cmOff + 32).toString('hex').toUpperCase();
  const metaFlags = buf.readUInt8(cmOff + 32);
  console.log(`  ChunkHash (SHA256): ${chunkHash}`);
  console.log(`  Meta flags: ${metaFlags}`);

  // Check if ChunkHash first 16 bytes matches the known value
  const first16 = chunkHash.slice(0, 32);
  console.log(`  ChunkHash first 16 bytes: ${first16}`);

  // Also show all nearby chunk IDs (there might be multiple chunks per package)
  // ExportBundleData = type 0xB, BulkData = type 0xC, etc.
  // Search for same ChunkId64 with different types
  console.log(`  Related chunks (same PackageId):`);
  for (let i = 0; i < tocEntryCount; i++) {
    const testOff = chunkIdsOff + i * 12;
    const testId = buf.readBigUInt64LE(testOff);
    if (testId === chunkId64 && i !== ci) {
      const ti = buf.readUInt16LE(testOff + 8);
      const tt = buf.readUInt8(testOff + 11);
      const tp = buf.readUInt8(testOff + 10);
      console.log(`    ChunkIds[${i}]: index=${ti}, type=${tt}, pad=${tp}`);
    }
  }
}

// ── Show first 10 traps with their data ─────────────────────
console.log('\n=== ALL FLOOR TRAPS (first 20) ===');
console.log('NAME'.padEnd(45) + 'CHUNK_IDX  ' + 'CHUNK_ID (12 bytes hex)      ' + 'CHUNK_HASH_16 (first 16 bytes)');
console.log('─'.repeat(140));

for (const tf of trapFiles.slice(0, 20)) {
  const ci = tf.chunkIndex;
  const cidOff = chunkIdsOff + ci * 12;
  const chunkIdRaw = buf.slice(cidOff, cidOff + 12).toString('hex').toUpperCase();
  const cmOff = chunkMetasOff + ci * chunkMetaEntrySize;
  const hashFirst16 = buf.slice(cmOff, cmOff + 16).toString('hex').toUpperCase();
  const shortName = tf.path.split('/').pop();
  console.log(
    shortName.padEnd(45) +
    String(ci).padEnd(11) +
    chunkIdRaw.padEnd(29) +
    hashFirst16
  );
}
