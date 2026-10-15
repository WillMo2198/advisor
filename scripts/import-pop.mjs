// Import real section data from pop.ai.
//
// In your pop.ai checkout:
//   python scraping/scrape_descriptions.py
//   python scraping/scrape_courses.py spring 2027 -s CS MATH
//   python -c "from app.db import write_semester_files; write_semester_files('spring', 2027)"
// That writes www/data/spring_2027.json. Then here:
//   node scripts/import-pop.mjs ../pop.ai/www/data/spring_2027.json [--subjects CS,MATH]
//
// This replaces data/sections.json. Prerequisite trees still come from data/catalog.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCode } from '../public/js/core/prereq.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const subjIdx = args.indexOf('--subjects');
const subjects = subjIdx >= 0 && args[subjIdx + 1]
  ? new Set(args[subjIdx + 1].split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
  : null;

if (!file) {
  console.error('usage: node scripts/import-pop.mjs <pop.ai spring_2027.json> [--subjects CS,MATH]');
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`Could not read ${file}: ${err.message}`);
  process.exit(1);
}

if (!payload || !Array.isArray(payload.courses) || !payload.semester_name) {
  console.error('This does not look like a pop.ai semester export (needs semester_name and courses).');
  process.exit(1);
}

const kept = payload.courses.filter((c) => {
  const code = normalizeCode(c.name || c.course_name);
  return code && (!subjects || subjects.has(code.split(' ')[0]));
});

let sectionCount = 0;
for (const c of kept) {
  for (const buckets of Object.values(c.sections || {})) {
    if (Array.isArray(buckets)) { sectionCount += buckets.length; continue; }
    for (const list of Object.values(buckets || {})) if (Array.isArray(list)) sectionCount += list.length;
  }
}

const out = {
  semester_name: payload.semester_name,
  term_code: payload.term_code || '',
  sample: false,
  note: `Imported from pop.ai export ${file} on ${new Date().toISOString().slice(0, 10)}.`,
  courses: kept,
};
writeFileSync(join(root, 'data', 'sections.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`Imported ${kept.length} courses and ${sectionCount} sections for ${payload.semester_name}.`);
