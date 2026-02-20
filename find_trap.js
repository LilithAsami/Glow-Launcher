/**
 * find_trap.js — Find trap chunk data by computing FPackageId via CityHash64,
 * then decompress the chunk from .ucas to look for FGuid.
 *
 * Strategy:
 *   1. Compute CityHash64(lowercase_path) = FPackageId (8 bytes)
 *   2. Scan .utoc ChunkIds for that FPackageId (first 8 bytes of FIoChunkId)
 *   3. Get offset/length and compression block info from .utoc
 *   4. Read + decompress from .ucas using zlib
 *   5. Dump and search decompressed data for FGuid patterns
 *
 * Usage: node find_trap.js [trap_name]
 */

'use strict';
const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');

const PAKS = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks';
const UTOC = path.join(PAKS, 'pakchunk11-WindowsClient.utoc');
const UCAS = path.join(PAKS, 'pakchunk11-WindowsClient.ucas');

const TRAP = process.argv[2] || 'TID_Floor_FlameGrill_SR_T05';

// Known paths for traps
const TRAP_PATH_BASE = '/fortnitegame/plugins/gamefeatures/savetheworld/content/items/traps/floor/';

// ── CityHash64 (minimal correct port) ──────────────────────
const B = (n) => BigInt(n);
const MASK64 = B('0xffffffffffffffff');
const u64 = (n) => BigInt.asUintN(64, n);
const C1 = B('0x9ae16a3b2f90404f');
const C2 = B('0xb492b66fbe98f273');

function rot64(v, s) { v = u64(v); return u64((v >> B(s)) | (v << B(64 - s))); }
function hash128to64(lo, hi) {
  const k = B('0x9ddfea08eb382d69');
  let a = u64((lo ^ hi) * k); a ^= (a >> B(47));
  let b = u64((hi ^ a) * k); b ^= (b >> B(47));
  return u64(b * k);
}
function hashLen16(u, v, mul) {
  mul = mul || u64(C2 + B(2) * B(16)); // default mul for len=16; not used like this
  let a = u64((u ^ v) * mul); a ^= (a >> B(47));
  let b = u64((v ^ a) * mul); b ^= (b >> B(47));
  return u64(b * mul);
}

function fetch64(buf, pos) {
  if (pos < 0 || pos + 8 > buf.length) return B(0);
  return u64(buf.readBigUInt64LE(pos));
}
function fetch32(buf, pos) {
  if (pos < 0 || pos + 4 > buf.length) return B(0);
  return u64(buf.readUInt32LE(pos));
}
function shiftMix(v) { return u64(v ^ (v >> B(47))); }

function cityHash64(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  const len = buf.length;

  if (len <= 16) {
    if (len >= 8) {
      const mul = u64(C2 + B(len * 2));
      const a = u64(fetch64(buf, 0) + C2);
      const b = fetch64(buf, len - 8);
      const c = u64(rot64(b, 37) * mul + a);
      const d = u64((rot64(a, 25) + b) * mul);
      return hashLen16(c, d, mul);
    }
    if (len >= 4) {
      const mul = u64(C2 + B(len * 2));
      const a = fetch32(buf, 0);
      return hashLen16(u64(B(len) + (a << B(3))), fetch32(buf, len - 4), mul);
    }
    if (len > 0) {
      const a = buf[0], b = buf[Math.floor(len / 2)], c = buf[len - 1];
      const y = u64(B(a) + (B(b) << B(8)));
      const z = u64(B(len) + (B(c) << B(2)));
      return u64(shiftMix(u64(y * C2 ^ z * C1)) * C2);
    }
    return C2;
  }

  if (len <= 32) {
    const mul = u64(C2 + B(len * 2));
    const a = u64(fetch64(buf, 0) * C1);
    const b = fetch64(buf, 8);
    const c = u64(fetch64(buf, len - 8) * mul);
    const d = u64(fetch64(buf, len - 16) * C2);
    return hashLen16(
      u64(rot64(u64(a + b), 43) + rot64(c, 30) + d),
      u64(a + rot64(u64(b + C2), 18) + c),
      mul
    );
  }

  if (len <= 64) {
    const mul = u64(C2 + B(len * 2));
    const a = u64(fetch64(buf, 0) * C2);
    const b = fetch64(buf, 8);
    const c = fetch64(buf, len - 24);
    const d = fetch64(buf, len - 32);
    const e = u64(fetch64(buf, 16) * C2);
    const f = u64(fetch64(buf, 24) * B(9));
    const g = fetch64(buf, len - 8);
    const h = u64(fetch64(buf, len - 16) * mul);
    const uu = u64(rot64(u64(a + g), 43) + u64(rot64(b, 30) + c) * B(9));
    const v = u64(u64(a + g) ^ d + f + B(1));
    const w = u64(bswap64(u64(u64(uu + v) * mul)) + h);
    const x = u64(rot64(u64(e + f), 42) + c);
    const y = u64(bswap64(u64(u64(v + w) * mul)) + g);
    const z = u64(u64(e + w) * mul);
    return u64(
      hashLen16(u64(x + z), y, mul) +
      u64(v)
    );
  }

  // > 64 bytes: full CityHash64
  // Pad buffer for safety
  const pad = Buffer.alloc(len + 128, 0);
  buf.copy(pad);

  let x = fetch64(pad, len - 40);
  let y = u64(fetch64(pad, len - 16) + fetch64(pad, len - 56));
  let z = hash128to64(u64(fetch64(pad, len - 48) + B(len)), fetch64(pad, len - 24));

  // WeakHashLen32WithSeeds
  function wh32(off, sa, sb) {
    const w = fetch64(pad, off);
    const xi = fetch64(pad, off + 8);
    const yi = fetch64(pad, off + 16);
    const zi = fetch64(pad, off + 24);
    sa = u64(sa + w);
    sb = u64(rot64(u64(sb + sa + zi), 21));
    const cc = sa;
    sa = u64(sa + xi + yi);
    sb = u64(sb + rot64(sa, 44));
    return { f: u64(sa + zi), s: u64(sb + cc) };
  }

  let v = wh32(len - 64, B(len), z);
  let w = wh32(len - 32, u64(y + C1), x);
  x = u64(x * C1 + fetch64(pad, 0));

  let s = 0;
  do {
    x = u64(rot64(u64(x + y + v.f + fetch64(pad, s + 8)), 37) * C1);
    y = u64(rot64(u64(y + v.s + fetch64(pad, s + 48)), 42) * C1);
    x ^= w.s;
    y = u64(y + v.f + fetch64(pad, s + 40));
    z = u64(rot64(u64(z + w.f), 33) * C1);
    v = wh32(s, u64(v.s * C1), u64(x + w.f));
    w = wh32(s + 32, u64(z + w.s), u64(y + fetch64(pad, s + 16)));
    { const t = z; z = x; x = t; }
    s += 64;
  } while (s + 64 <= len);

  const rem = len - s;
  const mul = u64(C1 + u64(B(z & B(0xff)) << B(1)));
  const s2 = s; // start of remainder
  w = { f: u64(w.f + u64(B(rem - 1) & B(63))), s: w.s };
  v = { f: u64(v.f + w.f), s: v.s };
  w = { f: u64(w.f + v.f), s: w.s };
  x = u64(rot64(u64(x + y + v.f + fetch64(pad, s2 + 8)), 37) * mul);
  y = u64(rot64(u64(y + v.s + fetch64(pad, s2 + 48)), 42) * mul);
  x ^= u64(w.s * B(9));
  y = u64(y + u64(v.f + fetch64(pad, s2 + 40)));
  z = u64(rot64(u64(z + w.f), 33) * mul);
  v = wh32(s2, u64(v.s * mul), u64(x + w.f));
  w = wh32(s2 + 32, u64(z + w.s), u64(y + fetch64(pad, s2 + 16)));
  { const t = z; z = x; x = t; }
  return hash128to64(
    u64(hash128to64(u64(v.f + z), u64(w.f + y)) + u64(shiftMix(y) * C1) + x),
    u64(hash128to64(u64(v.s + y), u64(w.s + z)) + x)
  );
}

function bswap64(v) {
  let r = B(0);
  for (let i = 0; i < 8; i++) r = (r << B(8)) | ((v >> B(i * 8)) & B(0xff));
  return u64(r);
}

// ── Parse UTOC ──────────────────────────────────────────────
console.log(`Searching for: ${TRAP}`);

const utocBuf = fs.readFileSync(UTOC);

// Parse header
let off = 16; // skip magic
const version    = utocBuf.readUInt8(off); off += 4;
const hdrSize    = utocBuf.readUInt32LE(off); off += 4;
const entryCount = utocBuf.readUInt32LE(off); off += 4;
const compBlkCnt = utocBuf.readUInt32LE(off); off += 4;
const compBlkSz  = utocBuf.readUInt32LE(off); off += 4;
const compMthCnt = utocBuf.readUInt32LE(off); off += 4;
const compMthLen = utocBuf.readUInt32LE(off); off += 4;
const dirIdxSz   = utocBuf.readUInt32LE(off); off += 4;
// ContainerId (4 bytes)
off += 4;
// EncryptionKeyGuid (16 bytes)
off += 16;
// ContainerFlags (1 byte) + padding (3 bytes)
off += 4;

// Version-specific fields
let phSeedsCount = 0, phOverflowCount = 0;
if (version >= 4) { phSeedsCount = utocBuf.readUInt32LE(off); off += 4; }
let partCount = 0, partSize = 0n;
if (version >= 3) {
  partCount = Number(utocBuf.readBigUInt64LE(off)); off += 8;
  partSize  = utocBuf.readBigUInt64LE(off); off += 8;
}
if (version >= 5) { phOverflowCount = utocBuf.readUInt32LE(off); off += 4; }

console.log(`UTOC v${version}: ${entryCount} entries, ${compBlkCnt} comp blocks, phSeeds=${phSeedsCount}, phOverflow=${phOverflowCount}`);

// Section offsets (corrected field order for v8: hash seeds before partitions)
const chunkIdsOff = hdrSize;
const chunkIdsEnd = chunkIdsOff + entryCount * 12;
const olOff       = chunkIdsEnd;
const olEnd       = olOff + entryCount * 10;
const phSeedsOff  = olEnd;
const phSeedsEnd  = phSeedsOff + phSeedsCount * 4;
const phOverOff   = phSeedsEnd;
const phOverEnd   = phOverOff + phOverflowCount * 4;
const compBlkOff  = phOverEnd;
const compBlkEnd  = compBlkOff + compBlkCnt * compBlkSz;
const compMthOff  = compBlkEnd;
const compMthEnd  = compMthOff + compMthCnt * compMthLen;
const dirIdxOff   = compMthEnd;
const dirIdxEnd   = dirIdxOff + dirIdxSz;
const metasOff    = dirIdxEnd;
const metasEnd    = metasOff + entryCount * 33;

// Read compression method name
const compMethod = utocBuf.slice(compMthOff, compMthOff + compMthLen).toString('ascii').replace(/\0+$/, '');
console.log(`Compression: "${compMethod}"`);

// ── Compute FPackageId ──────────────────────────────────────
const trapPath = (TRAP_PATH_BASE + TRAP).toLowerCase();
console.log(`Package path: ${trapPath}`);

const packageId = cityHash64(trapPath);
const pidBytes = Buffer.alloc(8);
pidBytes.writeBigUInt64LE(packageId);
console.log(`FPackageId (CityHash64): 0x${packageId.toString(16).padStart(16, '0')}`);
console.log(`PID bytes LE: ${pidBytes.toString('hex').toUpperCase()}`);

// ── Search ChunkIds for this PackageId ──────────────────────
const foundChunks = [];
for (let i = 0; i < entryCount; i++) {
  const cidOff = chunkIdsOff + i * 12;
  const id64 = utocBuf.readBigUInt64LE(cidOff);
  if (id64 === packageId) {
    const chunkIndex = utocBuf.readUInt16LE(cidOff + 8);
    const pad = utocBuf.readUInt8(cidOff + 10);
    const type = utocBuf.readUInt8(cidOff + 11);
    foundChunks.push({ entryIdx: i, chunkIndex, type, pad });
    console.log(`  Found chunk at entry ${i}: index=${chunkIndex}, type=${type}, pad=${pad}`);
  }
}

if (foundChunks.length === 0) {
  // Try alternate paths
  const altPaths = [
    `/game/plugins/gamefeatures/savetheworld/content/items/traps/floor/${TRAP}`.toLowerCase(),
    TRAP.toLowerCase(),
    `savetheworld/content/items/traps/floor/${TRAP}`.toLowerCase(),
  ];
  console.log('\nPackageId not found with primary path, trying alternates...');
  for (const alt of altPaths) {
    const altId = cityHash64(alt);
    console.log(`  "${alt}" → 0x${altId.toString(16).padStart(16, '0')}`);
    for (let i = 0; i < entryCount; i++) {
      const cidOff = chunkIdsOff + i * 12;
      if (utocBuf.readBigUInt64LE(cidOff) === altId) {
        console.log(`    *** MATCH at entry ${i}!`);
        foundChunks.push({ entryIdx: i, path: alt });
      }
    }
  }
}

if (foundChunks.length === 0) {
  console.log('\nNot found by any path. Trying brute-force name search in directory index...');

  // Try to parse directory index to find the trap
  // Read the name table if possible - scan for trap name as ASCII in the utoc
  const trapNameBuf = Buffer.from(TRAP.toLowerCase(), 'utf8');
  for (let i = dirIdxOff; i < dirIdxEnd - trapNameBuf.length; i++) {
    let match = true;
    for (let j = 0; j < trapNameBuf.length; j++) {
      const b = utocBuf[i + j];
      const expected = trapNameBuf[j];
      // Case-insensitive
      if (b !== expected && b !== (expected - 32) && b !== (expected + 32)) {
        match = false; break;
      }
    }
    if (match) {
      console.log(`  Found "${TRAP}" at dirIndex offset ${i - dirIdxOff}`);
      // Try to read surrounding context
      const ctxStart = Math.max(dirIdxOff, i - 32);
      const ctx = utocBuf.slice(ctxStart, Math.min(dirIdxEnd, i + trapNameBuf.length + 64));
      for (let r = 0; r < ctx.length; r += 16) {
        const hex = [], ascii = [];
        for (let c = 0; c < 16 && r + c < ctx.length; c++) {
          hex.push(ctx[r + c].toString(16).padStart(2, '0'));
          const bb = ctx[r + c];
          ascii.push(bb >= 32 && bb < 127 ? String.fromCharCode(bb) : '.');
        }
        console.log(`    ${hex.join(' ')}  ${ascii.join('')}`);
      }
      break;
    }
  }

  // Also try scanning ALL utoc name strings for trap-related entries
  // by searching for the ASCII bytes of the trap name directly in the utoc buffer
  const trapAscii = Buffer.from(TRAP, 'ascii');
  console.log(`\n  Full buffer search for "${TRAP}"...`);
  let scanHits = 0;
  for (let i = 0; i <= utocBuf.length - trapAscii.length; i++) {
    if (utocBuf.compare(trapAscii, 0, trapAscii.length, i, i + trapAscii.length) === 0) {
      const section = i >= metasOff ? 'Metas' :
                      i >= dirIdxOff ? 'DirIndex' :
                      i >= compMthOff ? 'CompMethods' :
                      i >= compBlkOff ? 'CompBlocks' :
                      i >= olOff ? 'OffsetLengths' :
                      i >= chunkIdsOff ? 'ChunkIds' : 'Header';
      console.log(`    @ ${i} (${section})`);
      scanHits++;
      if (scanHits >= 5) break;
    }
  }
  if (scanHits === 0) {
    console.log('    Not found in utoc at all as ASCII.');
    console.log('    Note: Directory index might be compressed or the trap name is stored in a separate name table.');
  }
}

// If we found chunks, try to read and decompress from UCAS
if (foundChunks.length > 0) {
  for (const chunk of foundChunks) {
    const ci = chunk.entryIdx;
    console.log(`\n=== DECOMPRESSING CHUNK ${ci} (type=${chunk.type}) ===`);

    // Read offset/length (10 bytes per entry)
    // FIoOffsetAndLength: packed 5+5 bytes
    // offset=40bits, length=40bits
    const olBase = olOff + ci * 10;
    const raw = utocBuf.slice(olBase, olBase + 10);

    // Unpack: first 5 bytes = offset (big-endian packed), next 5 = length
    const chunkOffset = Number(
      (BigInt(raw[0]) << 32n) | (BigInt(raw[1]) << 24n) |
      (BigInt(raw[2]) << 16n) | (BigInt(raw[3]) << 8n) | BigInt(raw[4])
    );
    const chunkLength = Number(
      (BigInt(raw[5]) << 32n) | (BigInt(raw[6]) << 24n) |
      (BigInt(raw[7]) << 16n) | (BigInt(raw[8]) << 8n) | BigInt(raw[9])
    );

    console.log(`  Offset: ${chunkOffset} (0x${chunkOffset.toString(16)})`);
    console.log(`  Length: ${chunkLength} bytes`);

    // Find which compression blocks cover this range
    // Compression blocks: each is 12 bytes: offset(5) + compSize(3) + uncompSize(3) + compMethod(1)
    // Actually compression blocks are: uint32 CompressedOffset_Lo, uint16 CompressedOffset_Hi,
    //   uint32 CompressedSize | UncompressedSize packed, uint16 ...
    // Let's just read raw 12 bytes per block
    // Actually: FIoStoreTocCompressedBlockEntry is:
    //   5 bytes: offset (40 bits BE)
    //   3 bytes: compressed size (24 bits)
    //   3 bytes: uncompressed size (24 bits)
    //   1 byte: compression method index

    // Find first block for this chunk's offset
    let firstBlock = -1;
    let lastBlock = -1;
    for (let b = 0; b < compBlkCnt; b++) {
      const bOff = compBlkOff + b * 12;
      const blockOffset = Number(
        (BigInt(utocBuf[bOff]) << 32n) | (BigInt(utocBuf[bOff + 1]) << 24n) |
        (BigInt(utocBuf[bOff + 2]) << 16n) | (BigInt(utocBuf[bOff + 3]) << 8n) | BigInt(utocBuf[bOff + 4])
      );
      const compSize = (utocBuf[bOff + 5] << 16) | (utocBuf[bOff + 6] << 8) | utocBuf[bOff + 7];
      const uncompSize = (utocBuf[bOff + 8] << 16) | (utocBuf[bOff + 9] << 8) | utocBuf[bOff + 10];
      const compMethodIdx = utocBuf[bOff + 11];

      // Check overlap with chunk range
      // The compression block covers decompressed range: we need to figure out the mapping
      // Actually the offset in compression block IS the compressed offset in the ucas
      // We need to find which blocks' decompressed data covers chunkOffset..chunkOffset+chunkLength

      if (b < 5 || (b >= compBlkCnt - 2)) {
        if (b < 5) {
          console.log(`  Block[${b}]: ucasOff=${blockOffset}, compSz=${compSize}, uncompSz=${uncompSize}, method=${compMethodIdx}`);
        }
      }
    }

    // Simpler approach: compression blocks are sequential, each covers uncompSize bytes
    // Find which blocks cover our chunk's data
    let decompOffset = 0;
    const blocks = [];
    for (let b = 0; b < compBlkCnt; b++) {
      const bOff = compBlkOff + b * 12;
      const blockUcasOffset = Number(
        (BigInt(utocBuf[bOff]) << 32n) | (BigInt(utocBuf[bOff + 1]) << 24n) |
        (BigInt(utocBuf[bOff + 2]) << 16n) | (BigInt(utocBuf[bOff + 3]) << 8n) | BigInt(utocBuf[bOff + 4])
      );
      const compSz = (utocBuf[bOff + 5] << 16) | (utocBuf[bOff + 6] << 8) | utocBuf[bOff + 7];
      const uncompSz = (utocBuf[bOff + 8] << 16) | (utocBuf[bOff + 9] << 8) | utocBuf[bOff + 10];
      const method = utocBuf[bOff + 11];

      const blockDecompStart = decompOffset;
      const blockDecompEnd = decompOffset + uncompSz;

      // Does this block overlap with our chunk?
      if (blockDecompEnd > chunkOffset && blockDecompStart < chunkOffset + chunkLength) {
        blocks.push({
          idx: b, ucasOffset: blockUcasOffset, compSize: compSz, uncompSize: uncompSz,
          method, decompStart: blockDecompStart, decompEnd: blockDecompEnd
        });
      }

      decompOffset += uncompSz;

      // Early exit if we're past the chunk
      if (decompOffset > chunkOffset + chunkLength && blocks.length > 0) break;
    }

    console.log(`  Compression blocks covering this chunk: ${blocks.length}`);
    if (blocks.length > 0) {
      console.log(`  First block: idx=${blocks[0].idx}, ucasOff=${blocks[0].ucasOffset}, comp=${blocks[0].compSize}, uncomp=${blocks[0].uncompSize}`);
    }

    // Read and decompress
    if (blocks.length > 0) {
      const ucasFd = fs.openSync(UCAS, 'r');
      const decompData = Buffer.alloc(chunkLength);
      let filled = 0;

      for (const blk of blocks) {
        // Read compressed data from ucas
        const compBuf = Buffer.alloc(blk.compSize);
        fs.readSync(ucasFd, compBuf, 0, blk.compSize, blk.ucasOffset);

        // Decompress
        let uncompBuf;
        if (blk.method === 0 || blk.compSize === blk.uncompSize) {
          uncompBuf = compBuf; // No compression
        } else {
          try {
            uncompBuf = zlib.inflateRawSync(compBuf);
          } catch (e) {
            try {
              uncompBuf = zlib.inflateSync(compBuf);
            } catch (e2) {
              try {
                uncompBuf = zlib.unzipSync(compBuf);
              } catch (e3) {
                console.log(`  WARNING: Could not decompress block ${blk.idx} (${compMethod}): ${e.message}`);
                uncompBuf = compBuf; // Use raw as fallback
              }
            }
          }
        }

        // Copy relevant portion to output
        const srcStart = Math.max(0, chunkOffset - blk.decompStart);
        const srcEnd = Math.min(uncompBuf.length, chunkOffset + chunkLength - blk.decompStart);
        const copyLen = srcEnd - srcStart;
        if (copyLen > 0 && srcStart < uncompBuf.length) {
          uncompBuf.copy(decompData, filled, srcStart, srcStart + copyLen);
          filled += copyLen;
        }
      }
      fs.closeSync(ucasFd);

      console.log(`  Decompressed: ${filled} bytes`);

      // Dump first 256 bytes
      console.log('\n  === DECOMPRESSED DATA (first 256 bytes) ===');
      for (let r = 0; r < Math.min(256, filled); r += 16) {
        const hex = [], ascii = [];
        for (let c = 0; c < 16 && r + c < filled; c++) {
          hex.push(decompData[r + c].toString(16).padStart(2, '0'));
          const bb = decompData[r + c];
          ascii.push(bb >= 32 && bb < 127 ? String.fromCharCode(bb) : '.');
        }
        console.log(`  ${r.toString(16).padStart(4, '0')}: ${hex.join(' ').padEnd(48)} ${ascii.join('')}`);
      }

      // Search for UUID v4 patterns (byte 6 has high nibble = 4, byte 8 has high nibble = 8|9|a|b)
      console.log('\n  === SEARCHING FOR FGuid PATTERNS ===');
      for (let i = 0; i <= filled - 16; i++) {
        // Check if this looks like UUID v4
        const b6 = decompData[i + 6]; // In LE uint32 storage, byte 6 = 3rd uint32 byte 2
        const b8 = decompData[i + 8];
        // Actually FGuid as 4 LE uint32s: check bytes 4-7 high nibble of byte 5 = 4
        // UE FGuid display: AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD
        // In LE: A3 A2 A1 A0 B3 B2 B1 B0 C3 C2 C1 C0 D3 D2 D1 D0
        // UUID v4: byte[6-7] has version 4 → In FGuid terms, B1 high nibble = 4
        // B1 is at byte[5] from start (4+1=5 when B=uint32 starting at byte 4, B1=fifth byte)
        // Actually for a uint32 stored LE: low byte first. So B = B0 B1 B2 B3 stored as B0 B1 B2 B3
        // The version nibble in UUID is at byte 6 of the UUID → B2 byte → offset 4+2 = 6 from FGuid start
        // Wait, UUID byte 6 = B[2] when B is stored as bytes [4,5,6,7]. In LE uint32, byte[6] stores bits 16-23 of the second uint32
        // So decompData[i + 6] should have (value & 0xF0) === 0x40 for UUID v4
        if ((decompData[i + 6] & 0xF0) === 0x40) {
          // Also check variant: byte 8 should be 0x80-0xBF
          if ((decompData[i + 8] & 0xC0) === 0x80) {
            // Read as 4 LE uint32s
            const a = decompData.readUInt32LE(i);
            const b = decompData.readUInt32LE(i + 4);
            const c = decompData.readUInt32LE(i + 8);
            const d = decompData.readUInt32LE(i + 12);
            const hex = (n) => n.toString(16).padStart(8, '0');
            const guid = `${hex(a)}${hex(b)}${hex(c)}${hex(d)}`.toUpperCase();
            console.log(`  @ offset ${i} (0x${i.toString(16)}): ${guid}`);
          }
        }
      }

      // Also search for the known FlameGrill GUID in decompressed data
      const knownGuid = Buffer.from('CA2D14B046A9CF0DD51945B6B873AA3D', 'hex');
      const knownGuidLE = Buffer.from('B0142DCA0DCFA946B64519D53DAA73B8', 'hex');
      for (let i = 0; i <= filled - 16; i++) {
        if (decompData.compare(knownGuid, 0, 16, i, i + 16) === 0) {
          console.log(`\n  *** KNOWN GUID MATCH (BE) @ offset ${i}!`);
        }
        if (decompData.compare(knownGuidLE, 0, 16, i, i + 16) === 0) {
          console.log(`\n  *** KNOWN GUID MATCH (LE) @ offset ${i}!`);
        }
      }
    }
  }
}
