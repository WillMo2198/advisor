// Writes data/catalog.json and data/sections.json from the two source files.
// Checks the data on the way: bad codes, duplicate CRNs, bad times, unknown courses.
//   node scripts/build-data.mjs

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { courses, departments } from './catalog-source.mjs';
import { rows, semester, termCode } from './sections-source.mjs';
import { normalizeCode, courseLeaves } from '../public/js/core/prereq.js';
import { parseRange } from '../public/js/core/schedule.js';
import { parseForecastCsv } from '../public/js/core/forecast.js';
import { programs } from './programs-source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const codes = new Set();
for (const c of courses) {
  if (normalizeCode(c.code) !== c.code) errors.push(`bad code: ${c.code}`);
  if (codes.has(c.code)) errors.push(`duplicate course: ${c.code}`);
  codes.add(c.code);
  for (const leaf of courseLeaves(c.prereq)) {
    if (normalizeCode(leaf.code) !== leaf.code) errors.push(`${c.code}: bad prereq code ${leaf.code}`);
  }
  if (c.prereqText && !c.prereq) errors.push(`${c.code}: has prereq text but no tree`);
  if (!c.prereqText && c.prereq) errors.push(`${c.code}: has a tree but no prereq text`);
}

const byCourse = new Map();
const crns = new Set();
for (const [code, crn, bucket, scheduleType, days, time, where, instructor, available] of rows) {
  if (!codes.has(code)) errors.push(`section ${crn}: unknown course ${code}`);
  if (crns.has(crn)) errors.push(`duplicate CRN ${crn}`);
  crns.add(crn);
  if (time !== 'TBA' && !parseRange(time)) errors.push(`section ${crn}: bad time "${time}"`);
  if (days !== 'TBA' && !/^[UMTWRFS]+$/.test(days)) errors.push(`section ${crn}: bad days "${days}"`);
  if (!byCourse.has(code)) byCourse.set(code, {});
  const buckets = byCourse.get(code);
  (buckets[bucket] = buckets[bucket] || []).push({
    crn: String(crn),
    schedule_type: scheduleType,
    type: bucket,
    available,
    special_title: '',
    meetings: [{ days, time, where, instructors: [instructor], dates: '' }],
  });
}

// ----- future offerings (CS department's tentative schedule) -----
const forecastCsv = readFileSync(join(root, 'data', 'source', 'future-cs-offerings.csv'), 'utf8');
const forecast = parseForecastCsv(forecastCsv);
if (!forecast.terms.length) errors.push('forecast: no term columns');
for (const w of forecast.warnings) console.warn(`forecast: ${w}`);

// ----- degree programs -----
for (const prog of programs) {
  let sum = 0;
  for (const g of prog.groups) {
    sum += g.credits;
    for (const slot of g.slots || []) {
      for (const option of slot) {
        for (const code of option) {
          if (normalizeCode(code) !== code) errors.push(`${prog.id}/${g.id}: bad code ${code}`);
          if (!codes.has(code) && !prog.credits?.[code]) errors.push(`${prog.id}/${g.id}: ${code} has no credits (add it to the catalog or to credits)`);
        }
      }
    }
    for (const code of g.from?.codes || []) if (normalizeCode(code) !== code) errors.push(`${prog.id}/${g.id}: bad code ${code}`);
  }
  if (sum !== prog.totalCredits) errors.push(`${prog.id}: groups add up to ${sum}, not ${prog.totalCredits}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const catalog = {
  source: 'Illinois Tech undergraduate catalog, catalog.iit.edu/courses/cs and /courses/math (read October 2026). Descriptions are short paraphrases.',
  departments,
  courses,
};

// Same shape as pop.ai's export_semester_payload(), plus `sample`.
const sections = {
  semester_name: semester,
  term_code: termCode,
  sample: true,
  note: 'SAMPLE sections. CRNs, times, rooms, seats, and instructors are made up. Import real data from pop.ai (see README).',
  courses: [...byCourse.entries()].map(([code, buckets]) => ({
    name: code,
    title: courses.find((c) => c.code === code).title,
    sections: { [semester]: buckets },
  })),
};

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data', 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
writeFileSync(join(root, 'data', 'sections.json'), JSON.stringify(sections, null, 2) + '\n');
writeFileSync(join(root, 'data', 'forecast.json'), JSON.stringify({
  source: 'Tentative Schedule of Future Computer Science Courses (data/source/future-cs-offerings.csv). Tentative: the department may change it.',
  terms: forecast.terms,
  courses: forecast.courses,
  notes: forecast.notes,
}, null, 2) + '\n');
writeFileSync(join(root, 'data', 'programs.json'), JSON.stringify({ programs }, null, 2) + '\n');
console.log(`Wrote ${courses.length} courses, ${rows.length} sample sections, ${Object.keys(forecast.courses).length} forecast courses (${forecast.terms.map((t) => t.key).join(', ')}), ${programs.length} program(s).`);
