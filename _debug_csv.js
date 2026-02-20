const fs = require('fs');
const csv = fs.readFileSync('trap_guids_all.csv','utf8').trim().split('\n').slice(1);
console.log('Total CSV lines:', csv.length);

// Better CSV parser for quoted fields
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

// Group by description, pick one per family
const families = {};
for (const t of traps) {
  if (!families[t.desc] || (families[t.desc].height === '00 00' && t.height !== '00 00')) {
    families[t.desc] = t;
  }
}
const targets = Object.values(families);
console.log('Unique families:', targets.length);
for (const t of targets.slice(0,3)) console.log(' ', t.desc, t.name, t.height);
