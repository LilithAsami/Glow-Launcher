/**
 * extract_traps.js — Fortnite STW trap GUID + height extractor
 * 
 * Reads pakchunk11-WindowsClient.utoc/.ucas, decompresses via Oodle,
 * and extracts the hex GUID identifier + height value for every trap.
 *
 * Usage:
 *   node extract_traps.js                  (all floor traps)
 *   node extract_traps.js FlameGrill       (filter by name)
 *   node extract_traps.js --all            (floor + wall + ceiling)
 *   node extract_traps.js --csv            (output as CSV)
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────
const PAKS_DIR   = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks';
const UTOC_FILE  = path.join(PAKS_DIR, 'pakchunk11-WindowsClient.utoc');
const UCAS_FILE  = path.join(PAKS_DIR, 'pakchunk11-WindowsClient.ucas');
const OODLE_DLL  = 'C:\\Users\\JXSX\\Downloads\\FModel (1)\\Output\\.data\\oo2core_9_win64.dll';
const BLOCK_SIZE = 65536; // CompressionBlockSize from utoc header

const args     = process.argv.slice(2);
const csvMode  = args.includes('--csv');
const allMode  = args.includes('--all');
const filter   = args.find(a => !a.startsWith('--')) || '';

// ── Load Oodle DLL ──────────────────────────────────────────
const koffi = require('koffi');
const oodleLib = koffi.load(OODLE_DLL);
const OodleLZ_Decompress = oodleLib.func(
  'int OodleLZ_Decompress(void* compBuf, int compLen, void* rawBuf, int rawLen, ' +
  'int fuzzSafe, int checkCRC, int verbosity, void* decBufBase, int decBufSize, ' +
  'void* fpCallback, void* callbackUserData, void* decoderMemory, int decoderMemorySize, int threadPhase)'
);
if (!csvMode) console.log('[OK] Oodle DLL loaded');

// ── Read UTOC ───────────────────────────────────────────────
const utocBuf    = fs.readFileSync(UTOC_FILE);
const entryCount = utocBuf.readUInt32LE(24);
const compBlkCnt = utocBuf.readUInt32LE(28);
const hdrSize    = utocBuf.readUInt32LE(20);    // 144
const chunkIdsOff = hdrSize;                     // section start
const olOff       = chunkIdsOff + entryCount * 12;

// Compression blocks section offset (empirically determined)
const compBlkOff = 12231600;

if (!csvMode) console.log('[OK] UTOC: ' + entryCount + ' chunks, ' + compBlkCnt + ' comp blocks');

// ── Read helpers ────────────────────────────────────────────
function readBlock(b) {
  const o = compBlkOff + b * 12;
  return {
    offset:   utocBuf[o] + utocBuf[o+1]*256 + utocBuf[o+2]*65536 + utocBuf[o+3]*16777216 + utocBuf[o+4]*4294967296,
    compSz:   utocBuf[o+5] + utocBuf[o+6]*256 + utocBuf[o+7]*65536,
    uncompSz: utocBuf[o+8] + utocBuf[o+9]*256 + utocBuf[o+10]*65536,
    method:   utocBuf[o+11]
  };
}

function readOL(ci) {
  const base = olOff + ci * 10;
  const off = Number(
    (BigInt(utocBuf[base])   << 32n) | (BigInt(utocBuf[base+1]) << 24n) |
    (BigInt(utocBuf[base+2]) << 16n) | (BigInt(utocBuf[base+3]) << 8n) | BigInt(utocBuf[base+4])
  );
  const len = Number(
    (BigInt(utocBuf[base+5]) << 32n) | (BigInt(utocBuf[base+6]) << 24n) |
    (BigInt(utocBuf[base+7]) << 16n) | (BigInt(utocBuf[base+8]) << 8n) | BigInt(utocBuf[base+9])
  );
  return { off, len };
}

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

// ── Decompress a chunk from UCAS ────────────────────────────
function decompressChunk(chunkIndex) {
  const { off: virtOff, len } = readOL(chunkIndex);
  if (len <= 0 || len > 50 * 1024 * 1024) return null;

  const fd = fs.openSync(UCAS_FILE, 'r');
  const result = Buffer.alloc(len);
  let filled = 0;
  const startBlock = Math.floor(virtOff / BLOCK_SIZE);
  const endBlock   = Math.floor((virtOff + len - 1) / BLOCK_SIZE);

  for (let b = startBlock; b <= endBlock; b++) {
    const blk = readBlock(b);
    const compBuf = Buffer.alloc(blk.compSz);
    fs.readSync(fd, compBuf, 0, blk.compSz, blk.offset);

    let rawBuf;
    if (blk.method === 0) {
      rawBuf = compBuf.slice(0, blk.uncompSz);
    } else {
      rawBuf = Buffer.alloc(blk.uncompSz);
      const r = OodleLZ_Decompress(compBuf, blk.compSz, rawBuf, blk.uncompSz, 1, 0, 0, null, 0, null, null, null, 0, 3);
      if (r <= 0) { fs.closeSync(fd); return null; }
      rawBuf = rawBuf.slice(0, r);
    }

    const bvs      = b * BLOCK_SIZE;
    const srcStart = Math.max(0, virtOff - bvs);
    const srcEnd   = Math.min(rawBuf.length, virtOff + len - bvs);
    const copyLen  = srcEnd - srcStart;
    if (copyLen > 0) {
      rawBuf.copy(result, filled, srcStart, srcStart + copyLen);
      filled += copyLen;
    }
  }

  fs.closeSync(fd);
  return result.slice(0, filled);
}

// ── Extract trap info from decompressed ZenPackage data ─────
function extractTrapInfo(data) {
  if (!data || data.length < 100) return null;

  const headerSize = data.readUInt32LE(4);
  if (headerSize >= data.length || headerSize < 50) return null;

  const info = {
    guid: null,
    guid2: null,
    displayName: null,
    description: null,
    heightHex: null,
  };

  // Extract all FStrings from the serialized export data
  const exportStart = headerSize;
  const strings = [];
  for (let i = exportStart; i < data.length - 4; i++) {
    const len = data.readInt32LE(i);
    if (len >= 5 && len <= 1000 && i + 4 + len <= data.length) {
      const raw = data.slice(i + 4, i + 4 + len - 1);
      const isPrintable = raw.every(b => b >= 0x20 && b <= 0x7E);
      if (isPrintable) {
        strings.push(raw.toString('ascii'));
        i += 4 + len - 1;
      }
    }
    // Also check for negative length (UTF-16 strings)
    if (data.readInt32LE(i) < -2 && data.readInt32LE(i) > -500) {
      const uLen = -data.readInt32LE(i);
      if (i + 4 + uLen * 2 <= data.length) {
        const raw = data.slice(i + 4, i + 4 + uLen * 2 - 2);
        try {
          const str = raw.toString('utf16le');
          if (str.length > 3) strings.push(str);
        } catch (e) {}
        i += 4 + uLen * 2 - 1;
      }
    }
  }

  // Identify GUIDs and text
  const hexGuidRegex = /^[0-9A-Fa-f]{32}$/;
  let guidCount = 0;
  for (const s of strings) {
    if (hexGuidRegex.test(s)) {
      if (guidCount === 0) info.guid = s.toUpperCase();
      else if (guidCount === 1) info.guid2 = s.toUpperCase();
      guidCount++;
    } else if (!info.displayName) {
      info.displayName = s;
    } else if (!info.description) {
      info.description = s;
    }
  }

  // Height bytes at export data offset +64 (2 bytes)
  if (exportStart + 65 < data.length) {
    const b0 = data[exportStart + 64];
    const b1 = data[exportStart + 65];
    info.heightHex = b0.toString(16).padStart(2, '0').toUpperCase() + ' ' +
                     b1.toString(16).padStart(2, '0').toUpperCase();
  }

  return info;
}

// ── Parse directory index ───────────────────────────────────
if (!csvMode) console.log('[..] Parsing directory index...');
const dirIdxOff = 31822740;
let doff = dirIdxOff;
const mountPoint = readFStr(doff); doff = mountPoint.next;

const numDirEntries = utocBuf.readUInt32LE(doff); doff += 4;
const dirEntries = [];
for (let i = 0; i < numDirEntries; i++) {
  dirEntries.push({
    name:        utocBuf.readUInt32LE(doff),
    firstChild:  utocBuf.readUInt32LE(doff + 4),
    nextSibling: utocBuf.readUInt32LE(doff + 8),
    firstFile:   utocBuf.readUInt32LE(doff + 12),
  });
  doff += 16;
}

const numFileEntries = utocBuf.readUInt32LE(doff); doff += 4;
const fileEntries = [];
for (let i = 0; i < numFileEntries; i++) {
  fileEntries.push({
    name:      utocBuf.readUInt32LE(doff),
    nextFile:  utocBuf.readUInt32LE(doff + 4),
    userData:  utocBuf.readUInt32LE(doff + 8),
  });
  doff += 12;
}

const numStrings = utocBuf.readUInt32LE(doff); doff += 4;
const nameTable = [];
for (let i = 0; i < numStrings; i++) {
  const s = readFStr(doff);
  nameTable.push(s.str);
  doff = s.next;
}

function getName(idx) { return idx < nameTable.length ? nameTable[idx] : '?' + idx; }

function walkDir(dirIdx, pathPrefix, results) {
  if (dirIdx === 0xFFFFFFFF) return;
  const entry = dirEntries[dirIdx];
  if (!entry) return;
  const fullPath = pathPrefix + getName(entry.name) + '/';

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

// ── Filter trap files ───────────────────────────────────────
let trapFiles = allFiles.filter(f => {
  if (!f.path.endsWith('.uasset')) return false;
  const isTrap = f.path.includes('Traps/Floor/TID_Floor') ||
                 f.path.includes('Traps/Wall/TID_Wall')   ||
                 f.path.includes('Traps/Ceiling/TID_Ceiling');
  if (!isTrap) return false;
  if (filter) return f.path.toLowerCase().includes(filter.toLowerCase());
  if (!allMode) return f.path.includes('Traps/Floor/');
  return true;
});
trapFiles.sort((a, b) => a.path.localeCompare(b.path));
if (!csvMode) console.log('[OK] ' + trapFiles.length + ' trap files found\n');

// ── Process each trap ───────────────────────────────────────
const results = [];
let done = 0;

for (const tf of trapFiles) {
  const shortName = path.basename(tf.path, '.uasset');
  
  let info = null;
  try {
    const data = decompressChunk(tf.chunkIndex);
    info = data ? extractTrapInfo(data) : null;
  } catch (e) {
    // decompression error, skip
  }

  results.push({
    name:        shortName,
    chunkIndex:  tf.chunkIndex,
    guid:        info && info.guid  ? info.guid  : 'ERROR',
    guid2:       info && info.guid2 ? info.guid2 : '',
    displayName: info && info.displayName ? info.displayName : '',
    heightHex:   info && info.heightHex   ? info.heightHex   : '',
    description: info && info.description ? info.description : '',
  });

  done++;
  if (!csvMode && done % 20 === 0) process.stderr.write('  Processed ' + done + '/' + trapFiles.length + '...\r');
}
if (!csvMode) process.stderr.write('  Processed ' + done + '/' + trapFiles.length + '    \n');

// ── Output ──────────────────────────────────────────────────
if (csvMode) {
  console.log('Name,GUID,GUID2,DisplayName,Height,Description');
  for (const r of results) {
    const esc = s => '"' + (s || '').replace(/"/g, '""') + '"';
    console.log([r.name, r.guid, r.guid2, esc(r.displayName), r.heightHex, esc(r.description)].join(','));
  }
} else {
  const W = Math.max(42, ...results.map(r => r.name.length + 2));

  console.log('='.repeat(140));
  console.log(' FORTNITE STW TRAP GUID EXTRACTOR');
  console.log(' Source: ' + UTOC_FILE);
  console.log('='.repeat(140));
  console.log(
    'TRAP NAME'.padEnd(W) +
    'GUID (TemplateId)'.padEnd(36) +
    'HEIGHT'.padEnd(10) +
    'DISPLAY NAME'
  );
  console.log('-'.repeat(140));

  for (const r of results) {
    console.log(
      r.name.padEnd(W) +
      r.guid.padEnd(36) +
      r.heightHex.padEnd(10) +
      r.displayName
    );
  }

  // Height reference table
  console.log('\n' + '='.repeat(140));
  console.log(' TRAP HEIGHT REFERENCE (hex bytes to search/replace in ucas for modding)');
  console.log('='.repeat(140));
  console.log('  A0 C0  = Default wooden spikes offset (-5)');
  console.log('  20 C1  = Default other floor traps offset (-10)');
  console.log('  AD 43  = Under floor WITH floor piece');
  console.log('  D2 C3  = Under floor WITHOUT floor piece');
  console.log('  20 C2  = Inside floor (all traps, -40)');
  console.log('  C8 C1  = Inside floor (freeze trap, -25)');
  console.log('  74 C2  = Inside floor (tar pit, -61)');
  console.log('  19 43  = Hill/stair placement');
  console.log('  AE 43  = Lower zones without floor');
  console.log('  AF 43  = Upper zones without floor');
  console.log('  B3 43  = All zones with floor');
  console.log('  E1 43  = 1.3x all zones with floor');
  console.log('  E8 C3  = -1.3x all zones with floor');

  console.log('\nDone. ' + results.length + ' traps extracted successfully.');
}
