const fs = require('fs');
const koffi = require('koffi');

const lib = koffi.load('C:\\Users\\JXSX\\Downloads\\FModel (1)\\Output\\.data\\oo2core_9_win64.dll');
const OodleLZ_Decompress = lib.func('int OodleLZ_Decompress(void* compBuf, int compLen, void* rawBuf, int rawLen, int fuzzSafe, int checkCRC, int verbosity, void* decBufBase, int decBufSize, void* fpCallback, void* callbackUserData, void* decoderMemory, int decoderMemorySize, int threadPhase)');

const utocBuf = fs.readFileSync('E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.utoc');
const ucasPath = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.ucas';
const compBlkOff = 12231600;
const BLOCK_SIZE = 65536;
const olOff = 6115872;

function readBlock(b) {
  const o = compBlkOff + b * 12;
  return {
    offset: utocBuf[o] + utocBuf[o+1]*256 + utocBuf[o+2]*65536 + utocBuf[o+3]*16777216 + utocBuf[o+4]*4294967296,
    compSz: utocBuf[o+5] + utocBuf[o+6]*256 + utocBuf[o+7]*65536,
    uncompSz: utocBuf[o+8] + utocBuf[o+9]*256 + utocBuf[o+10]*65536,
    method: utocBuf[o+11]
  };
}

function readOL_BE(ci) {
  const base = olOff + ci * 10;
  const off = Number((BigInt(utocBuf[base]) << 32n) | (BigInt(utocBuf[base+1]) << 24n) | (BigInt(utocBuf[base+2]) << 16n) | (BigInt(utocBuf[base+3]) << 8n) | BigInt(utocBuf[base+4]));
  const len = Number((BigInt(utocBuf[base+5]) << 32n) | (BigInt(utocBuf[base+6]) << 24n) | (BigInt(utocBuf[base+7]) << 16n) | (BigInt(utocBuf[base+8]) << 8n) | BigInt(utocBuf[base+9]));
  return { off, len };
}

function decompressChunk(chunkIndex) {
  const { off: virtOff, len } = readOL_BE(chunkIndex);
  if (len <= 0 || len > 50*1024*1024) return null;
  const fd = fs.openSync(ucasPath, 'r');
  const result = Buffer.alloc(len);
  let filled = 0;
  const startBlock = Math.floor(virtOff / BLOCK_SIZE);
  const endBlock = Math.floor((virtOff + len - 1) / BLOCK_SIZE);
  for (let b = startBlock; b <= endBlock; b++) {
    const blk = readBlock(b);
    const compBuf = Buffer.alloc(blk.compSz);
    fs.readSync(fd, compBuf, 0, blk.compSz, blk.offset);
    let rawBuf;
    if (blk.method === 0) { rawBuf = compBuf.slice(0, blk.uncompSz); }
    else {
      rawBuf = Buffer.alloc(blk.uncompSz);
      OodleLZ_Decompress(compBuf, blk.compSz, rawBuf, blk.uncompSz, 1, 0, 0, null, 0, null, null, null, 0, 3);
    }
    const bvs = b * BLOCK_SIZE;
    const srcStart = Math.max(0, virtOff - bvs);
    const srcEnd = Math.min(rawBuf.length, virtOff + len - bvs);
    const copyLen = srcEnd - srcStart;
    if (copyLen > 0) { rawBuf.copy(result, filled, srcStart, srcStart + copyLen); filled += copyLen; }
  }
  fs.closeSync(fd);
  return result.slice(0, filled);
}

// Find 32-char hex strings in binary data
function findHexGuids(data) {
  const text = data.toString('latin1');
  const regex = /[0-9A-Fa-f]{32}/g;
  let match;
  const results = [];
  while ((match = regex.exec(text)) !== null) {
    results.push({ offset: match.index, guid: match[0].toUpperCase() });
  }
  return results;
}

// Find FString instances
function extractStrings(data, minOffset) {
  const strings = [];
  for (let i = minOffset; i < data.length - 4; i++) {
    const len = data.readInt32LE(i);
    if (len >= 5 && len <= 500 && i + 4 + len <= data.length) {
      const raw = data.slice(i + 4, i + 4 + len - 1);
      const isPrintable = raw.every(b => b >= 0x20 && b <= 0x7E);
      if (isPrintable) {
        strings.push({ offset: i, len, str: raw.toString('ascii') });
        i += 4 + len - 1;
      }
    }
  }
  return strings;
}

const traps = [
  { name: 'FlameGrill_SR_T05', ci: 486373 },
  { name: 'FlameGrill_SR_T04', ci: -1 }, // find later
  { name: 'Spikes_Wood_UC_T01', ci: 187176 },
  { name: 'Spikes_Wood_R_T04', ci: 345718 },
];

for (const trap of traps) {
  if (trap.ci === -1) continue;
  const data = decompressChunk(trap.ci);
  if (!data) continue;
  const headerSize = data.readUInt32LE(4);
  
  console.log('\n=== ' + trap.name + ' ===');
  
  // Find hex GUID strings 
  const hexGuids = findHexGuids(data);
  if (hexGuids.length > 0) {
    console.log('Hex GUID strings:');
    hexGuids.forEach(g => console.log('  @' + g.offset + ': ' + g.guid));
  }
  
  // Find FStrings
  const strings = extractStrings(data, headerSize);
  if (strings.length > 0) {
    console.log('FStrings (in export data from offset ' + headerSize + '):');
    strings.forEach(s => console.log('  @' + s.offset + ' (len=' + s.len + '): ' + JSON.stringify(s.str)));
  }
  
  // Dump name map (starts after header summary fields)
  // The name map hash section starts right after the summary
  // Let me parse it
  console.log('\nName map:');
  let off = 64; // approximate start of name map data
  
  // Try reading: hashAlgorithm(uint64) + numHashes(uint32) + hashes(uint64 * numHashes) 
  // Then name entries: count (uint32) + sizes (array of uint8 or uint16) + string data
  
  // Actually, let me just search for readable ASCII in the header area too
  const allStrings = extractStrings(data, 64);
  if (allStrings.length > 0) {
    console.log('All readable strings (from offset 64):');
    allStrings.forEach(s => console.log('  @' + s.offset + ': ' + JSON.stringify(s.str)));
  }
  
  // Also dump a hex view of the export data area
  console.log('\nExport data hex (first 200 bytes from offset ' + headerSize + '):');
  for (let i = 0; i < 200 && i + headerSize < data.length; i += 32) {
    const slice = data.slice(headerSize + i, Math.min(headerSize + i + 32, data.length));
    const hex = [...slice].map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...slice].map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    console.log('  ' + (headerSize + i).toString().padStart(5) + ': ' + hex.padEnd(96) + ' ' + ascii);
  }
}
