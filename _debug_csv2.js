const fs = require('fs');
const buf = fs.readFileSync('trap_guids_all.csv');
// Detect BOM and decode properly
let text;
if (buf[0]===0xFF && buf[1]===0xFE) {
  text = buf.slice(2).toString('utf16le');
} else if (buf[0]===0xFE && buf[1]===0xFF) {
  text = buf.swap16().slice(2).toString('utf16le');
} else {
  text = buf.toString('utf8');
}

const csv = text.trim().split(/\r?\n/).slice(1);
console.log('Total CSV lines:', csv.length);

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
    current += c;
  }
  fields.push(current.trim());
  return fields;
}

const traps = [];
for (const line of csv) {
  const f = parseCsvLine(line);
  if (f.length >= 6) {
    traps.push({ name: f[0], guid: f[1], height: f[4], desc: f[5] });
  }
}
console.log('Parsed traps:', traps.length);
console.log('Sample:', traps[0]);

const families = {};
for (const t of traps) {
  if (!families[t.desc] || (families[t.desc].height === '00 00' && t.height !== '00 00')) {
    families[t.desc] = t;
  }
}
const targets = Object.values(families);
console.log('Unique families:', targets.length);
for (const t of targets) console.log(' ', t.desc.padEnd(30), t.name.padEnd(45), t.height);
