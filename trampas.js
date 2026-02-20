/**
 * extract_traps.js — Complete Fortnite STW trap extractor.
 *
 * Parses pakchunk11-WindowsClient.utoc directory index,
 * reads + Oodle-decompresses chunk data from .ucas,
 * searches for FGuid in decompressed package data.
 *
 * Usage:
 *   node extract_traps.js                       (all floor traps)
 *   node extract_traps.js FlameGrill             (filter by name)
 *   node extract_traps.js --all                  (all traps + wall/ceiling)
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────
const PAKS_DIR   = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks';
const UTOC_FILE  = path.join(PAKS_DIR, 'pakchunk11-WindowsClient.utoc');
const UCAS_FILE  = path.join(PAKS_DIR, 'pakchunk11-WindowsClient.ucas');
const OODLE_DLL  = 'C:\\Users\\JXSX\\Downloads\\FModel (1)\\Output\\.data\\oo2core_9_win64.dll';

const filter = process.argv[2] || '';

// ── Oodle decompressor ──────────────────────────────────────
let OodleDecompress = null;
try {
  const koffi = require('koffi');
  const lib = koffi.load(OODLE_DLL);
  // int OodleLZ_Decompress(const void* compBuf, int compLen, void* rawBuf, int rawLen,
  //   int fuzzSafe, int checkCRC, int verbosity, void* decBufBase, int decBufSize,
  //   void* fpCallback, void* callbackUserData, void* decoderMemory, int decoderMemorySize,
  //   int threadPhase)
  OodleDecompress = lib.func('int OodleLZ_Decompress(void* compBuf, int compLen, void* rawBuf, int rawLen, int fuzzSafe, int checkCRC, int verbosity, void* decBufBase, int decBufSize, void* fpCallback, void* callbackUserData, void* decoderMemory, int decoderMemorySize, int threadPhase)');
  console.log('Oodle DLL loaded successfully.');
} catch (e) {
  console.log('WARNING: Could not load Oodle DLL:', e.message);
  console.log('  Decompression will NOT be available. Only utoc metadata will be shown.');
}

function oodleDecompress(compBuf, rawLen) {
  if (!OodleDecompress) return null;
  const outBuf = Buffer.alloc(rawLen);
  const result = OodleDecompress(compBuf, compBuf.length, outBuf, rawLen, 1, 0, 0, null, 0, null, null, null, 0, 3);
  if (result <= 0) return null;
  return outBuf.slice(0, result);
}

// ── Parse UTOC ──────────────────────────────────────────────
console.log('Reading UTOC...');
const utocBuf = fs.readFileSync(UTOC_FILE);

// Header
const version    = utocBuf.readUInt8(16);
const hdrSize    = utocBuf.readUInt32LE(20);
const entryCount = utocBuf.readUInt32LE(24);
const compBlkCnt = utocBuf.readUInt32LE(28);
const compBlkSz  = utocBuf.readUInt32LE(32);
const compMthCnt = utocBuf.readUInt32LE(36);
const compMthLen = utocBuf.readUInt32LE(40);

console.log(`  v${version}, ${entryCount} chunks, ${compBlkCnt} comp blocks`);

// Known section offsets (empirically determined for this file)
const chunkIdsOff = hdrSize; // 144
const olOff       = chunkIdsOff + entryCount * 12;

// Find compression blocks: Oodle method string at offset 19577880
// compBlkOff = Oodle_offset - 32 (method block) - compBlkCnt * 12
const oodleOff   = 19577880; // empirically found
const compBlkOff = oodleOff - compMthLen - compBlkCnt * compBlkSz;

// Find directory index: mount point string at offset 31822740
const dirIdxOff = 31822740;

// Read FString
function readFStr(off) {
  const len = utocBuf.readInt32LE(off); off += 4;
  if (len === 0) return { str: '', next: off };
  if (len > 0) {
    const str = utocBuf.slice(off, off + len - 1).toString('utf8');
    return { str, next: off + len };
  }
  const count = -len;
  const str = utocBuf.slice(off, off + count * 2 - 2).toString('utf16le');
  return { str, next: off + count * 2 };
}

// ── Parse directory index ───────────────────────────────────
console.log('Parsing directory index...');
let off = dirIdxOff;
const mountPoint = readFStr(off); off = mountPoint.next;

const numDirEntries = utocBuf.readUInt32LE(off); off += 4;
const dirEntries = [];
for (let i = 0; i < numDirEntries; i++) {
  dirEntries.push({
    name: utocBuf.readUInt32LE(off),
    firstChild: utocBuf.readUInt32LE(off + 4),
    nextSibling: utocBuf.readUInt32LE(off + 8),
    firstFile: utocBuf.readUInt32LE(off + 12),
  });
  off += 16;
}

const numFileEntries = utocBuf.readUInt32LE(off); off += 4;
const fileEntries = [];
for (let i = 0; i < numFileEntries; i++) {
  fileEntries.push({
    name: utocBuf.readUInt32LE(off),
    nextFile: utocBuf.readUInt32LE(off + 4),
    userData: utocBuf.readUInt32LE(off + 8),
  });
  off += 12;
}

const numStrings = utocBuf.readUInt32LE(off); off += 4;
const nameTable = [];
for (let i = 0; i < numStrings; i++) {
  const s = readFStr(off);
  nameTable.push(s.str);
  off = s.next;
}

const nameTableEnd = off;
const metaSize = 24; // determined empirically: (fileSize - nameTableEnd) / entryCount = 24

function getName(idx) { return idx < nameTable.length ? nameTable[idx] : `?${idx}`; }

// Walk directory tree
function walkDir(dirIdx, pathPrefix, results) {
  if (dirIdx === 0xFFFFFFFF) return;
  const entry = dirEntries[dirIdx];
  if (!entry) return;
  const dirName = getName(entry.name);
  const fullPath = pathPrefix + dirName + '/';

  let fileIdx = entry.firstFile;
  while (fileIdx !== 0xFFFFFFFF && fileIdx < fileEntries.length) {
    const file = fileEntries[fileIdx];
    results.push({ path: fullPath + getName(file.name), chunkIndex: file.userData });
    fileIdx = file.nextFile;
  }

  let childIdx = entry.firstChild;
  while (childIdx !== 0xFFFFFFFF && childIdx < dirEntries.length) {
    walkDir(childIdx, fullPath, results);
    childIdx = dirEntries[childIdx].nextSibling;
  }
}

const allFiles = [];
walkDir(0, '', allFiles);
console.log(`  ${allFiles.length} files in directory index`);

// ── Find trap files ─────────────────────────────────────────
let trapFiles = allFiles.filter(f => {
  if (!f.path.includes('Traps/Floor/TID_Floor') && !f.path.includes('Traps/Wall/TID_Wall') && !f.path.includes('Traps/Ceiling/TID_Ceiling'))
    return false;
  if (!f.path.endsWith('.uasset')) return false;
  if (filter && filter !== '--all') {
    return f.path.toLowerCase().includes(filter.toLowerCase());
  }
  if (filter !== '--all') {
    return f.path.includes('Traps/Floor/');
  }
  return true;
});

trapFiles.sort((a, b) => a.path.localeCompare(b.path));
console.log(`  ${trapFiles.length} trap files matched\n`);

// ── Read offset/length for a chunk ──────────────────────────
function readOffsetLength(chunkIdx) {
  const base = olOff + chunkIdx * 10;
  // 5 bytes offset (big-endian) + 5 bytes length (big-endian)
  const offset = Number(
    (BigInt(utocBuf[base])     << 32n) |
    (BigInt(utocBuf[base + 1]) << 24n) |
    (BigInt(utocBuf[base + 2]) << 16n) |
    (BigInt(utocBuf[base + 3]) << 8n)  |
    BigInt(utocBuf[base + 4])
  );
  const length = Number(
    (BigInt(utocBuf[base + 5]) << 32n) |
    (BigInt(utocBuf[base + 6]) << 24n) |
    (BigInt(utocBuf[base + 7]) << 16n) |
    (BigInt(utocBuf[base + 8]) << 8n)  |
    BigInt(utocBuf[base + 9])
  );
  return { offset, length };
}

// ── Find compression blocks for a chunk ─────────────────────
function findCompBlocks(chunkOffset, chunkLength) {
  const blocks = [];
  let decompPos = 0;

  for (let b = 0; b < compBlkCnt; b++) {
    const bOff = compBlkOff + b * compBlkSz;
    const blockUcasOff = Number(
      (BigInt(utocBuf[bOff])     << 32n) |
      (BigInt(utocBuf[bOff + 1]) << 24n) |
      (BigInt(utocBuf[bOff + 2]) << 16n) |
      (BigInt(utocBuf[bOff + 3]) << 8n)  |
      BigInt(utocBuf[bOff + 4])
    );
    const compSz   = (utocBuf[bOff + 5] << 16) | (utocBuf[bOff + 6] << 8) | utocBuf[bOff + 7];
    const uncompSz = (utocBuf[bOff + 8] << 16) | (utocBuf[bOff + 9] << 8) | utocBuf[bOff + 10];
    const method   = utocBuf[bOff + 11];

    const blockStart = decompPos;
    const blockEnd = decompPos + uncompSz;

    if (blockEnd > chunkOffset && blockStart < chunkOffset + chunkLength) {
      blocks.push({ ucasOffset: blockUcasOff, compSize: compSz, uncompSize: uncompSz, method, decompStart: blockStart });
    }

    decompPos += uncompSz;
    if (decompPos > chunkOffset + chunkLength && blocks.length > 0) break;
  }
  return blocks;
}

// ── Decompress a chunk from UCAS ────────────────────────────
function decompressChunk(chunkIndex) {
  const { offset: chunkOffset, length: chunkLength } = readOffsetLength(chunkIndex);
  if (chunkLength <= 0 || chunkLength > 50 * 1024 * 1024) return null;

  const blocks = findCompBlocks(chunkOffset, chunkLength);
  if (blocks.length === 0) return null;

  const ucasFd = fs.openSync(UCAS_FILE, 'r');
  const result = Buffer.alloc(chunkLength);
  let filled = 0;

  for (const blk of blocks) {
    const compBuf = Buffer.alloc(blk.compSize);
    fs.readSync(ucasFd, compBuf, 0, blk.compSize, blk.ucasOffset);

    let uncompBuf;
    if (blk.method === 0 || blk.compSize === blk.uncompSize) {
      uncompBuf = compBuf;
    } else {
      uncompBuf = oodleDecompress(compBuf, blk.uncompSize);
      if (!uncompBuf) {
        fs.closeSync(ucasFd);
        return null;
      }
    }

    const srcStart = Math.max(0, chunkOffset - blk.decompStart);
    const srcEnd = Math.min(uncompBuf.length, chunkOffset + chunkLength - blk.decompStart);
    const copyLen = srcEnd - srcStart;
    if (copyLen > 0) {
      uncompBuf.copy(result, filled, srcStart, srcStart + copyLen);
      filled += copyLen;
    }
  }

  fs.closeSync(ucasFd);
  return result.slice(0, filled);
}

// ── Search decompressed data for FGuid patterns (UUID v4) ───
function findGuids(data) {
  const guids = [];
  for (let i = 0; i <= data.length - 16; i++) {
    // UUID v4 check: byte[6] high nibble = 4, byte[8] high nibble = 8/9/a/b
    // In LE uint32 storage: the second uint32's byte[2] (offset i+6) has version
    if ((data[i + 6] & 0xF0) === 0x40 && (data[i + 8] & 0xC0) === 0x80) {
      const a = data.readUInt32LE(i);
      const b = data.readUInt32LE(i + 4);
      const c = data.readUInt32LE(i + 8);
      const d = data.readUInt32LE(i + 12);
      const hex = n => n.toString(16).padStart(8, '0');
      guids.push({ offset: i, guid: `${hex(a)}${hex(b)}${hex(c)}${hex(d)}`.toUpperCase() });
    }
  }
  return guids;
}

// ── Height reference table ──────────────────────────────────
const HEIGHTS = {
  'Default (Wooden Spikes)': { hex: 'A0C0', value: -5, desc: 'Default wooden spikes placement' },
  'Default (Other Floor Traps)': { hex: '20C1', value: -10, desc: 'Default floor trap placement' },
  '-1.0 Under Floor (with floor)': { hex: 'AD43', value: 218.0, desc: 'Under floor with floor piece' },
  '-1.0 Under Floor (without floor)': { hex: 'D2C3', value: -420.0, desc: 'Under floor without floor piece' },
  'Inside Floor (ALL)': { hex: '20C2', value: -40, desc: 'Inside the floor (all traps)' },
  'Inside Floor (Freeze)': { hex: 'C8C1', value: -25, desc: 'Inside floor for freeze trap' },
  'Inside Floor (Tar Pit)': { hex: '74C2', value: -61, desc: 'Inside floor for tar pit' },
  'Irregular Hill Stair': { hex: '1943', value: 153.0, desc: 'Hill/stair placement' },
  '1.0 Lower Zones (without floor)': { hex: 'AE43', value: 220.0, desc: 'Lower zones no floor' },
  '1.0 Upper Zones (without floor)': { hex: 'AF43', value: 222.0, desc: 'Upper zones no floor' },
  '1.0 All Zones (with floor)': { hex: 'B343', value: 230.0, desc: 'All zones with floor' },
  '1.3 All Zones (with floor)': { hex: 'E143', value: 290.0, desc: '1.3 all zones with floor' },
  '-1.3 All Zones (with floor)': { hex: 'E8C3', value: -464.0, desc: '-1.3 all zones with floor' },
};

// ── Process traps ───────────────────────────────────────────
console.log('='.repeat(120));
console.log(' FORTNITE STW TRAP EXTRACTOR');
console.log(' UTOC: ' + UTOC_FILE);
console.log('='.repeat(120));

const results = [];
let processedCount = 0;

for (const tf of trapFiles) {
  const ci = tf.chunkIndex;
  const shortName = path.basename(tf.path, '.uasset');

  // Read ChunkId
  const cidOff = chunkIdsOff + ci * 12;
  const packageId = utocBuf.readBigUInt64LE(cidOff).toString(16).padStart(16, '0').toUpperCase();
  const chunkType = utocBuf.readUInt8(cidOff + 11);

  // Read offset/length
  const { offset: ucasOff, length: ucasLen } = readOffsetLength(ci);

  // Read meta hash
  const metaOff = nameTableEnd + ci * metaSize;
  const metaHash = (metaOff + 16 <= utocBuf.length) ?
    utocBuf.slice(metaOff, metaOff + 16).toString('hex').toUpperCase() : 'N/A';

  const entry = {
    name: shortName,
    chunkIndex: ci,
    packageId,
    ucasOffset: ucasOff,
    ucasLength: ucasLen,
    metaHash,
    guids: [],
  };

  // Try to decompress and find GUIDs
  if (OodleDecompress) {
    const data = decompressChunk(ci);
    if (data) {
      entry.decompSize = data.length;
      entry.guids = findGuids(data);
    }
  }

  results.push(entry);
  processedCount++;
  if (processedCount % 25 === 0) {
    process.stderr.write(`  Processed ${processedCount}/${trapFiles.length}...\r`);
  }
}

process.stderr.write('\n');

// ── Output ──────────────────────────────────────────────────
console.log('\n' + '-'.repeat(120));
const nameCol = Math.max(40, ...results.map(r => r.name.length + 2));

console.log(
  'TRAP NAME'.padEnd(nameCol) +
  'PACKAGE_ID'.padEnd(20) +
  'META_HASH'.padEnd(36) +
  (OodleDecompress ? 'GUIDS_FOUND'.padEnd(15) : '') +
  'UCAS_OFFSET'
);
console.log('-'.repeat(120));

for (const r of results) {
  let guidStr = '';
  if (r.guids.length > 0) {
    guidStr = r.guids.map(g => g.guid).join(', ');
  } else if (OodleDecompress) {
    guidStr = '(none)';
  }

  console.log(
    r.name.padEnd(nameCol) +
    r.packageId.padEnd(20) +
    r.metaHash.padEnd(36) +
    (OodleDecompress ? (r.guids.length > 0 ? `${r.guids.length} GUID(s)` : '(none)').padEnd(15) : '') +
    `0x${r.ucasOffset.toString(16)} (${r.ucasLength}B)`
  );
}

// Show detailed GUID info for traps that have them
if (OodleDecompress) {
  const withGuids = results.filter(r => r.guids.length > 0);
  if (withGuids.length > 0) {
    console.log('\n\n' + '='.repeat(120));
    console.log(' EXTRACTED GUIDS (for traps where UUIDs were found in decompressed data)');
    console.log('='.repeat(120));
    for (const r of withGuids) {
      console.log(`\n  ${r.name}:`);
      for (const g of r.guids) {
        console.log(`    @ offset ${g.offset}: ${g.guid}`);
      }
    }
  }
}

console.log('\n\n' + '='.repeat(120));
console.log(' TRAP HEIGHT VALUES (for placement modification)');
console.log('='.repeat(120));
for (const [label, info] of Object.entries(HEIGHTS)) {
  console.log(`  ${label.padEnd(45)} ${info.hex.padEnd(8)} (≈ ${info.value})`);
}
console.log('\n  Note: Heights are float16 values. Search for these 2-byte hex patterns');
console.log('  in the decompressed ucas data to find/modify trap placement offsets.');

console.log('\n\nDone. Processed ' + results.length + ' traps.');
