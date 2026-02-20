/**
 * traps.js — Extract Fortnite trap hex IDs from .uasset files
 *
 * The hex values shown in IoStore tools (.ucas) are the FGuid stored inside
 * each .uasset's FPackageFileSummary header.
 *
 * Usage:
 *   node traps.js <folder_with_uassets>
 *   node traps.js <single_file.uasset>
 *   node traps.js                          ← uses ./uassets/
 *
 * Output columns:
 *   NAME          — asset filename without extension
 *   GUID (LE)     — raw bytes as stored (little-endian, matches .ucas viewers)
 *   GUID (UE)     — Unreal's display order (AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE)
 *   CHUNK-ID      — FPackageId computed via CityHash64 of the lowercase path
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── CityHash64 ─────────────────────────────────────────────
// Pure-JS port used by Unreal Engine to derive FPackageId from package paths.

const BigInt = global.BigInt;
const B = (n) => BigInt(n);

const C1 = B('0xb492b66fbe98f273');
const C2 = B('0x9ae16a3b2f90404f');
const MASK64 = B('0xffffffffffffffff');

function u64(n) { return BigInt.asUintN(64, n); }
function rotateRight64(val, shift) {
  val = u64(val);
  return u64((val >> B(shift)) | (val << B(64 - shift)));
}

function hash128to64(lo, hi) {
  const kMul = B('0x9ddfea08eb382d69');
  let a = u64((lo ^ hi) * kMul);
  a = u64(a ^ (a >> B(47)));
  let b = u64((hi ^ a) * kMul);
  b = u64(b ^ (b >> B(47)));
  return u64(b * kMul);
}

function fetch64(buf, pos) {
  return u64(buf.readBigUInt64LE(pos));
}
function fetch32(buf, pos) {
  return u64(buf.readUInt32LE(pos));
}

function shiftMix(val) { return u64(val ^ (val >> B(47))); }

function hashLen16(u, v) { return hash128to64(u, v); }
function hashLen16Mul(u, v, mul) {
  let a = u64((u ^ v) * mul);
  a = u64(a ^ (a >> B(47)));
  let b = u64((v ^ a) * mul);
  b = u64(b ^ (b >> B(47)));
  return u64(b * mul);
}

function hashLen0to16(buf, len) {
  if (len >= 8) {
    const mul = u64(C2 + B(len * 2));
    const a   = u64(fetch64(buf, 0) + C2);
    const b   = fetch64(buf, len - 8);
    const c   = u64(rotateRight64(b, 37) * mul + a);
    const d   = u64((rotateRight64(a, 25) + b) * mul);
    return hashLen16Mul(c, d, mul);
  }
  if (len >= 4) {
    const mul = u64(C2 + B(len * 2));
    const a   = fetch32(buf, 0);
    return hashLen16Mul(
      u64(B(len) + (a << B(3))),
      fetch32(buf, len - 4),
      mul,
    );
  }
  if (len > 0) {
    const a = buf[0];
    const b = buf[Math.floor(len / 2)];
    const c = buf[len - 1];
    const y = u64(B(a) + (B(b) << B(8)));
    const z = u64(B(len) + (B(c) << B(2)));
    return u64(shiftMix(u64(y * C2 ^ z * C1)) * C2);
  }
  return C2;
}

function hashLen17to32(buf, len) {
  const mul = u64(C2 + B(len * 2));
  const a   = u64(fetch64(buf, 0) * C1);
  const b   = fetch64(buf, 8);
  const c   = u64(fetch64(buf, len - 8) * mul);
  const d   = u64(fetch64(buf, len - 16) * C2);
  return hashLen16Mul(
    u64(rotateRight64(u64(a + b), 43) + rotateRight64(c, 30) + d),
    u64(a + rotateRight64(u64(b + C2), 18) + c),
    mul,
  );
}

function hashLen33to64(buf, len) {
  const mul  = u64(C2 + B(len * 2));
  const a    = u64(fetch64(buf, 0) * C2);
  const b    = fetch64(buf, 8);
  const c    = u64(fetch64(buf, len - 24));
  const d    = u64(fetch64(buf, len - 32));
  const e    = u64(fetch64(buf, 16) * C2);
  const f    = u64(fetch64(buf, 24) * B(9));
  const g    = fetch64(buf, len - 8);
  const h    = u64(fetch64(buf, len - 16) * mul);
  const u    = u64(rotateRight64(u64(a + g), 43) + (rotateRight64(b, 30) + c) * B(9));
  const v    = u64((a + g) ^ d + f + B(1));
  const w    = u64(byteSwap64(u64(u + v) * mul) + h);
  const x    = u64(rotateRight64(u64(e + f), 42) + c);
  const y    = u64(byteSwap64(u64(v + w) * mul) + g);
  const z    = u64(u + w);
  return u64(
    u64(x ^ z) * mul +
    hashLen16(y, u64(a + z)) +
    u64(d + e + rotateRight64(x ^ (v + B(1)), 33) * mul)
  );
}

function byteSwap64(v) {
  let r = B(0);
  for (let i = 0; i < 8; i++) {
    r = (r << B(8)) | ((v >> B(i * 8)) & B(0xff));
  }
  return u64(r);
}

function safeFetch64(buf, pos) {
  // Clamp to valid range; return 0 for any out-of-bounds read.
  if (pos < 0 || pos + 8 > buf.length) {
    let v = B(0);
    for (let i = 0; i < 8; i++) {
      const idx = pos + i;
      if (idx >= 0 && idx < buf.length) v |= B(buf[idx]) << B(i * 8);
    }
    return u64(v);
  }
  return u64(buf.readBigUInt64LE(pos));
}

function cityHash64(inputBuf) {
  const len = inputBuf.length;
  if (len <= 16) return hashLen0to16(inputBuf, len);
  if (len <= 32) return hashLen17to32(inputBuf, len);
  if (len <= 64) return hashLen33to64(inputBuf, len);

  // Pad buffer so in-loop block reads (pos + 0..63) are always safe even in
  // the last partial block, and end-relative reads (len - X) are safe when
  // len < 88.
  const safLen = len + 128;
  const buf = Buffer.alloc(safLen, 0);
  inputBuf.copy(buf);

  // Initialise from end of data (matches Google CityHash64 reference).
  let x = safeFetch64(buf, len - 40);
  let y = u64(safeFetch64(buf, len - 16) + safeFetch64(buf, len - 56));
  let z = hashLen16(u64(safeFetch64(buf, len - 48) + B(len)), safeFetch64(buf, len - 24));

  // WeakHashLen32WithSeeds helpers
  function weakHash32(off, seedA, seedB) {
    const w = safeFetch64(buf, off);
    const xi = safeFetch64(buf, off + 8);
    const yi = safeFetch64(buf, off + 16);
    const zi = safeFetch64(buf, off + 24);
    seedA = u64(seedA + w);
    seedB = u64(rotateRight64(u64(seedB + seedA + zi), 21));
    const cc = seedA;
    seedA = u64(seedA + xi);
    seedA = u64(seedA + yi);
    seedB = u64(seedB + rotateRight64(seedA, 44));
    return { f: u64(seedA + zi), s: u64(seedB + cc) };
  }

  let v = weakHash32(len - 64, B(len), z);
  let w = weakHash32(len - 32, u64(y + C1), x);
  x = u64(x * C1 + safeFetch64(buf, 0));

  let pos = 0;
  let remaining = len;

  do {
    x = u64(rotateRight64(u64(x + y + v.f + safeFetch64(buf, pos + 8)), 37) * C1);
    y = u64(rotateRight64(u64(y + v.s + safeFetch64(buf, pos + 48)), 42) * C1);
    x ^= w.s;
    y = u64(y + v.f + safeFetch64(buf, pos + 40));
    z = u64(rotateRight64(u64(z + w.f), 33) * C1);
    v = weakHash32(pos, u64(v.s * C1), u64(x + w.f));
    w = weakHash32(pos + 32, u64(z + w.s), u64(y + safeFetch64(buf, pos + 16)));
    { const tmp = z; z = x; x = tmp; }
    pos += 64;
    remaining -= 64;
  } while (remaining >= 64);

  const mul = u64(C2 + u64(B(len) * B(2)));
  x = u64(rotateRight64(u64(x + y + v.f), 37) * mul);
  y = u64(rotateRight64(u64(y + v.s), 42) * mul);
  x ^= u64(w.s * B(9));
  y = u64(y + v.f + safeFetch64(buf, pos + (remaining > 32 ? 32 : remaining + 32)));

  const xFinal = u64(x + y + safeFetch64(buf, pos + Math.max(0, remaining - 8)));
  const yFinal = u64(y * B(9) + safeFetch64(buf, pos));
  return hashLen16Mul(
    u64(rotateRight64(u64(xFinal + v.s), 28) + yFinal),
    u64(x + y),
    mul,
  );
}

// ── FPackageId ─────────────────────────────────────────────
// Unreal Engine computes this as CityHash64 of the lowercased, zero-terminated
// package name (without /Game/ prefix substitution — uses full path).

function computePackageId(packagePath) {
  // Normalise: lowercase, ensure it starts with /
  let p = packagePath.trim().toLowerCase();
  if (!p.startsWith('/')) p = '/' + p;
  // Remove extension if present
  p = p.replace(/\.(uasset|umap)$/, '');
  const buf = Buffer.from(p, 'utf8');
  const hash = cityHash64(buf);
  return hash.toString(16).padStart(16, '0');
}

// ── UAsset GUID extraction ─────────────────────────────────
// The FPackageFileSummary stores a FGuid (4 × uint32, 16 bytes).
// We parse the header structure to locate it precisely.

const UE4_ASSET_MAGIC = 0x9E2A83C1;

function readFString(buf, off) {
  if (off + 4 > buf.length) return { str: '', next: off + 4 };
  const len = buf.readInt32LE(off);
  off += 4;
  if (len === 0) return { str: '', next: off };
  if (len > 0) {
    // UTF-8
    const end = off + len;
    const str = buf.slice(off, end - 1).toString('utf8'); // strip null
    return { str, next: end };
  }
  // UTF-16: len is negative, actual count = -len
  const count = -len;
  const end   = off + count * 2;
  const str   = buf.slice(off, end - 2).toString('utf16le');
  return { str, next: end };
}

function extractGuid(filePath) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (e) {
    return { error: e.message };
  }

  if (buf.length < 40) return { error: 'file too small' };

  const magic = buf.readUInt32LE(0);
  if (magic !== UE4_ASSET_MAGIC) {
    return { error: `bad magic: 0x${magic.toString(16)}` };
  }

  let off = 4;

  // LegacyFileVersion (int32) — UE4 = -8..-4, UE5 = -8 or lower
  const legacyVer = buf.readInt32LE(off); off += 4;

  // LegacyUE3Version (int32) — skip
  off += 4;

  // FileVersionUE4 (int32)
  const ue4Ver = buf.readInt32LE(off); off += 4;

  // FileVersionUE5 (int32) — present when legacyVer <= -8
  let ue5Ver = 0;
  if (legacyVer <= -8) {
    ue5Ver = buf.readInt32LE(off); off += 4;
  }

  // FileVersionLicenseeUE (int32)
  off += 4;

  // CustomVersions: TArray<FCustomVersion>
  // Each FCustomVersion = FGuid (16 bytes) + Version (int32) = 20 bytes
  if (off + 4 > buf.length) return { error: 'truncated at CustomVersions count' };
  const customVerCount = buf.readInt32LE(off); off += 4;
  if (customVerCount < 0 || customVerCount > 2000) return { error: `suspicious customVerCount: ${customVerCount}` };
  off += customVerCount * 20;

  if (off + 4 > buf.length) return { error: 'truncated at TotalHeaderSize' };

  // TotalHeaderSize (int32)
  off += 4;

  // FolderName (FString)
  const folder = readFString(buf, off);
  off = folder.next;

  // PackageFlags (uint32)
  if (off + 4 > buf.length) return { error: 'truncated at PackageFlags' };
  off += 4;

  // NameCount (int32) + NameOffset (int32)
  if (off + 8 > buf.length) return { error: 'truncated at NameCount/Offset' };
  off += 8;

  // UE5.1+: SoftObjectPathsCount + SoftObjectPathsOffset
  if (ue5Ver >= 1007) {
    off += 8;
  }

  // UE4.27+: LocalizationId (FString) when ue4Ver >= 516
  if (ue4Ver >= 516) {
    const loc = readFString(buf, off);
    off = loc.next;
  }

  // GatherableTextDataCount + GatherableTextDataOffset (skip for cooked) 
  // Present when not cooked — cooked assets have PackageFlags & PKG_FilterEditorOnly
  // We skip these regardless; cooked Fortnite assets omit them (they're zero offsets)
  // Actually for fully cooked they still store the int32 pair
  if (off + 8 > buf.length) return { error: 'truncated at GatherableTextData' };
  off += 8;

  // ExportCount + ExportOffset
  if (off + 8 > buf.length) return { error: 'truncated at ExportCount' };
  off += 8;

  // ImportCount + ImportOffset
  if (off + 8 > buf.length) return { error: 'truncated at ImportCount' };
  off += 8;

  // DependsOffset (int32)
  if (off + 4 > buf.length) return { error: 'truncated at DependsOffset' };
  off += 4;

  // UE4.28+ / UE5: SoftPackageReferencesCount + SoftPackageReferencesOffset
  if (ue4Ver >= 518 || ue5Ver >= 1) {
    if (off + 8 > buf.length) return { error: 'truncated at SoftPackageRefs' };
    off += 8;
  }

  // SearchableNamesOffset (int32)
  if (off + 4 > buf.length) return { error: 'truncated at SearchableNamesOffset' };
  off += 4;

  // ThumbnailTableOffset (int32)
  if (off + 4 > buf.length) return { error: 'truncated at ThumbnailTableOffset' };
  off += 4;

  // ── FGuid here ─────────────────────────────────────────
  if (off + 16 > buf.length) return { error: `truncated at GUID (offset ${off})` };

  const a = buf.readUInt32LE(off);
  const b = buf.readUInt32LE(off + 4);
  const c = buf.readUInt32LE(off + 8);
  const d = buf.readUInt32LE(off + 12);

  const hex = (n) => n.toString(16).padStart(8, '0');

  const guidRaw = `${hex(a)}${hex(b)}${hex(c)}${hex(d)}`;
  const guidUE  = `${hex(a)}-${hex(b).slice(0, 4)}-${hex(b).slice(4)}-${hex(c).slice(0, 4)}-${hex(c).slice(4)}${hex(d)}`;

  return {
    guidRaw,
    guidUE,
    offset: off,
    legacyVer,
    ue4Ver,
    ue5Ver,
  };
}

// ── Main ───────────────────────────────────────────────────

function collectUAssets(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target)
    .filter((f) => f.endsWith('.uasset') || f.endsWith('.umap'))
    .map((f) => path.join(target, f));
}

function main() {
  const arg    = process.argv[2] || './uassets';
  const base   = path.resolve(arg);

  if (!fs.existsSync(base)) {
    console.error(`✖ Path not found: ${base}`);
    process.exit(1);
  }

  const files = collectUAssets(base);
  if (files.length === 0) {
    console.error(`✖ No .uasset/.umap files found in: ${base}`);
    process.exit(1);
  }

  // ── Column widths
  const maxName    = Math.max(14, ...files.map((f) => path.basename(f, path.extname(f)).length));
  const colName    = maxName + 2;
  const colGuidRaw = 34;
  const colGuidUE  = 40;
  const colChunk   = 20;

  const pad  = (s, n) => String(s).padEnd(n);
  const line = '─'.repeat(colName + colGuidRaw + colGuidUE + colChunk + 6);

  console.log('\n FORTNITE TRAP HEX EXTRACTOR');
  console.log(' Source: ' + base);
  console.log(` Files:  ${files.length}\n`);
  console.log(' ' + line);
  console.log(
    ' ' +
    pad('NAME', colName) +
    pad('GUID (LE / .ucas)', colGuidRaw) +
    pad('GUID (UE format)', colGuidUE) +
    pad('CHUNK-ID (FPackageId)', colChunk),
  );
  console.log(' ' + line);

  let errors = 0;
  for (const file of files) {
    const name = path.basename(file, path.extname(file));

    // GUID from binary
    const res = extractGuid(file);

    // FPackageId via CityHash64
    // Try to infer full package path from file location
    let packagePath = name;
    const idx = file.replace(/\\/g, '/').indexOf('FortniteGame/');
    if (idx !== -1) {
      packagePath = '/' + file.replace(/\\/g, '/').slice(idx).replace(/\.(uasset|umap)$/, '');
    }
    let chunkId = '????????????????';
    try { chunkId = computePackageId(packagePath); } catch (_) {}

    if (res.error) {
      errors++;
      console.log(
        ' ' +
        pad(name, colName) +
        pad(`ERROR: ${res.error}`, colGuidRaw + colGuidUE) +
        pad(chunkId.toUpperCase(), colChunk),
      );
    } else {
      console.log(
        ' ' +
        pad(name, colName) +
        pad(res.guidRaw.toUpperCase(), colGuidRaw) +
        pad(res.guidUE.toUpperCase(), colGuidUE) +
        pad(chunkId.toUpperCase(), colChunk),
      );
    }
  }

  console.log(' ' + line);
  console.log(`\n Done. ${files.length - errors} OK, ${errors} error(s)`);
  console.log();
  console.log(' Legend:');
  console.log('   GUID (LE)        — raw bytes from uasset header; matches .ucas viewers (FPackageFileSummary.Guid)');
  console.log('   GUID (UE format) — same bytes in Unreal Engine display order (AAAA-BB-CC-DD-EE)');
  console.log('   CHUNK-ID         — CityHash64 of lowercase package path; matches FPackageId in .utoc');
  console.log();
}

main();
