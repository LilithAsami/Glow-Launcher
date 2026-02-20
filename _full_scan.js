const fs = require('fs');
const UCAS = 'E:\\Epic Games\\Fortnite\\FortniteGame\\Content\\Paks\\pakchunk11-WindowsClient.ucas';
const CHUNK = 64*1024*1024;

const buf0 = fs.readFileSync('trap_guids_all.csv');
let text;
if (buf0[0]===0xFF && buf0[1]===0xFE) text = buf0.slice(2).toString('utf16le');
else text = buf0.toString('utf8');
const csv = text.trim().split(/\r?\n/).slice(1);

function parseCsvLine(line) {
  const fields = []; let current = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { fields.push(current.trim()); current = ''; continue; }
    current += c;
  }
  fields.push(current.trim());
  return fields;
}

const traps = [];
for (const line of csv) {
  const f = parseCsvLine(line);
  if (f.length >= 6) traps.push({ name: f[0], guid: f[1], height: f[4], desc: f[5] });
}

// Single pass: find all GUIDs
const remaining = new Set(traps.map(t => t.guid));
const results = new Map();
const fd = fs.openSync(UCAS, 'r');
const OVERLAP = 32;
const readBuf = Buffer.alloc(CHUNK + OVERLAP);
let off = 0, carry = 0;
process.stderr.write('Scanning...');
while (remaining.size > 0) {
  const n = fs.readSync(fd, readBuf, carry, CHUNK, off);
  if (n === 0) break;
  const total = carry + n;
  const searchBuf = readBuf.subarray(0, total);
  for (const guid of [...remaining]) {
    const idx = searchBuf.indexOf(Buffer.from(guid, 'ascii'));
    if (idx >= 0) { results.set(guid, off - carry + idx); remaining.delete(guid); }
  }
  if (total > OVERLAP) { readBuf.copy(readBuf, 0, total-OVERLAP, total); carry = OVERLAP; } else carry = total;
  off += n;
}
fs.closeSync(fd);
process.stderr.write(' done\n');

// Check offsets and output JSON
const fd2 = fs.openSync(UCAS, 'r');
const output = [];

for (const t of traps) {
  const absPos = results.get(t.guid);
  const hParts = t.height.split(' ');
  const h0 = parseInt(hParts[0],16);
  const h1 = parseInt(hParts[1],16);
  
  if (absPos === undefined) {
    output.push({name:t.name,guid:t.guid,desc:t.desc,defaultHeight:t.height,found:false,offset:null});
    continue;
  }
  
  const before = Buffer.alloc(64);
  fs.readSync(fd2, before, 0, 64, absPos - 64);
  
  // Try to find default height, skip trivial values
  let foundOff = null;
  const trivial = (h0===0&&h1===0)||(h0===1&&h1===0)||(h0===0&&h1===1);
  if (!trivial) {
    for (let i = 62; i >= 0; i--) {
      if (before[i]===h0 && before[i+1]===h1) { foundOff = 64 - i; break; }
    }
  }
  
  output.push({name:t.name,guid:t.guid,desc:t.desc,defaultHeight:t.height,found:true,offset:foundOff});
}
fs.closeSync(fd2);

// Summary
const found = output.filter(o=>o.found).length;
const withOff = output.filter(o=>o.offset!==null).length;
const noOff = output.filter(o=>o.found&&o.offset===null).length;
const notFound = output.filter(o=>!o.found).length;
console.log(JSON.stringify({found,withOffset:withOff,noOffset:noOff,notFound,traps:output}));
