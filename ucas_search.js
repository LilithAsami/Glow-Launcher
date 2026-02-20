/**
 * ucas_search.js — Search the pakchunk11 .ucas file for known hex values.
 * Also dump the .utoc header for analysis.
 *
 * Usage: node ucas_search.js
 */

'use strict';
const fs = require('fs');

const UTOC_PATH = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.utoc';
const UCAS_PATH = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.ucas';

// ── Dump the UTOC header bytes for analysis ─────────────────
console.log('=== UTOC RAW HEADER (144 bytes) ===');
const utocBuf = Buffer.alloc(256);
const utocFd = fs.openSync(UTOC_PATH, 'r');
fs.readSync(utocFd, utocBuf, 0, 256, 0);
fs.closeSync(utocFd);

for (let r = 0; r < 144; r += 16) {
  const hex = [];
  const ascii = [];
  for (let c = 0; c < 16 && r + c < 144; c++) {
    hex.push(utocBuf[r + c].toString(16).padStart(2, '0'));
    const b = utocBuf[r + c];
    ascii.push(b >= 32 && b < 127 ? String.fromCharCode(b) : '.');
  }
  console.log(
    r.toString(16).padStart(4, '0') + ': ' +
    hex.join(' ') + '  ' +
    ascii.join('')
  );
}

// ── Parse header correctly ──────────────────────────────────
let off = 16; // skip magic
const version = utocBuf.readUInt8(off); off += 4; // ver + reserved
const tocHeaderSize = utocBuf.readUInt32LE(off); off += 4;
const tocEntryCount = utocBuf.readUInt32LE(off); off += 4;
const compBlockCount = utocBuf.readUInt32LE(off); off += 4;
const compBlockEntrySize = utocBuf.readUInt32LE(off); off += 4;
const compMethodNameCount = utocBuf.readUInt32LE(off); off += 4;
const compMethodNameLen = utocBuf.readUInt32LE(off); off += 4;
const dirIndexSize = utocBuf.readUInt32LE(off); off += 4;
// ContainerId (uint64)
const containerIdLo = utocBuf.readUInt32LE(off); off += 4;
const containerIdHi = utocBuf.readUInt32LE(off); off += 4;
// EncryptionKeyGuid (16 bytes)
const encGuid = utocBuf.slice(off, off + 16).toString('hex').toUpperCase();
off += 16;
// ContainerFlags (uint8)
const containerFlags = utocBuf.readUInt8(off); off += 1;
// Reserved (3 bytes)
off += 3;

console.log(`\nVersion: ${version}`);
console.log(`HeaderSize: ${tocHeaderSize}`);
console.log(`EntryCount: ${tocEntryCount}`);
console.log(`CompBlockCount: ${compBlockCount}`);
console.log(`DirIndexSize: ${dirIndexSize}`);
console.log(`ContainerId: 0x${containerIdHi.toString(16)}${containerIdLo.toString(16).padStart(8, '0')}`);
console.log(`EncGuid: ${encGuid}`);
console.log(`ContainerFlags: 0x${containerFlags.toString(16)} (${containerFlags})`);
console.log(`Remaining header offset: ${off} / ${tocHeaderSize}`);

// Continue parsing based on version
if (version >= 2) {
  const phSeedsCount = utocBuf.readUInt32LE(off); off += 4;
  console.log(`PerfectHashSeedsCount: ${phSeedsCount}`);
}
if (version >= 3) {
  const partCount = utocBuf.readBigUInt64LE(off); off += 8;
  const partSize = utocBuf.readBigUInt64LE(off); off += 8;
  console.log(`PartitionCount: ${partCount}`);
  console.log(`PartitionSize: ${partSize}`);
}
if (version >= 2) {
  const noPHCount = utocBuf.readUInt32LE(off); off += 4;
  console.log(`ChunksWithoutPHCount: ${noPHCount}`);
}
console.log(`Final header parse offset: ${off}`);

// ── Search UCAS for known hex values ────────────────────────
const CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB read chunks

const knownValues = [
  { name: 'FlameGrill_SR_T05', hex: 'CA2D14B046A9CF0DD51945B6B873AA3D' },
  { name: 'Spikes_Wood_UC_T01', hex: '6193115B478C72C2342CB982AEFD644F' },
  { name: 'Spikes_Wood_R_T04', hex: '6BE388B3487B8E97DA' },
];

// Build search patterns
const patterns = [];
for (const kv of knownValues) {
  // Big endian (raw hex order)
  patterns.push({ name: `${kv.name} BE`, bytes: Buffer.from(kv.hex, 'hex') });
  // Per-uint32 little-endian swap (if 32 chars)
  if (kv.hex.length === 32) {
    const le = Buffer.alloc(16);
    for (let w = 0; w < 4; w++) {
      const dword = parseInt(kv.hex.slice(w * 8, w * 8 + 8), 16);
      le.writeUInt32LE(dword, w * 4);
    }
    patterns.push({ name: `${kv.name} LE`, bytes: le });
  }
}

console.log(`\n=== SEARCHING UCAS (${(fs.statSync(UCAS_PATH).size / (1024**3)).toFixed(2)} GB) ===`);
console.log('Patterns:');
for (const p of patterns) {
  console.log(`  ${p.name}: ${p.bytes.toString('hex').toUpperCase()} (${p.bytes.length} bytes)`);
}

const ucasFd = fs.openSync(UCAS_PATH, 'r');
const ucasSize = fs.fstatSync(ucasFd).size;
const readBuf = Buffer.alloc(CHUNK_SIZE + 256); // extra overlap for patterns spanning chunks

let pos = 0;
let totalHits = 0;
const startTime = Date.now();

while (pos < ucasSize) {
  // Read chunk with overlap from previous
  const overlap = pos > 0 ? 256 : 0;
  const readStart = pos - overlap;
  const readLen = Math.min(CHUNK_SIZE + overlap, ucasSize - readStart);
  const bytesRead = fs.readSync(ucasFd, readBuf, 0, readLen, readStart);

  for (const p of patterns) {
    // Simple search in this chunk
    for (let i = overlap; i <= bytesRead - p.bytes.length; i++) {
      let match = true;
      for (let j = 0; j < p.bytes.length; j++) {
        if (readBuf[i + j] !== p.bytes[j]) { match = false; break; }
      }
      if (match) {
        const absPos = readStart + i;
        totalHits++;
        console.log(`\n  *** HIT: ${p.name} @ offset ${absPos} (0x${absPos.toString(16)})`);
        // Show context: 32 bytes before and 48 bytes after
        const ctxStart = Math.max(0, i - 32);
        const ctxEnd = Math.min(bytesRead, i + p.bytes.length + 48);
        const ctx = readBuf.slice(ctxStart, ctxEnd);
        for (let r = 0; r < ctx.length; r += 16) {
          const hexLine = [];
          for (let c = 0; c < 16 && r + c < ctx.length; c++) {
            hexLine.push(ctx[r + c].toString(16).padStart(2, '0'));
          }
          console.log(`    ${(readStart + ctxStart + r).toString(16).padStart(10, '0')}: ${hexLine.join(' ')}`);
        }
      }
    }
  }

  pos += CHUNK_SIZE;
  if (pos % (512 * 1024 * 1024) === 0 || pos >= ucasSize) {
    const pct = Math.min(100, (pos / ucasSize * 100)).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stderr.write(`  Progress: ${pct}% (${elapsed}s, ${totalHits} hits)\r`);
  }
}

fs.closeSync(ucasFd);
const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n\n=== DONE in ${totalTime}s — ${totalHits} total hits ===`);
