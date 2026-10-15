// Writes data/catalog.json and data/sections.json from the two source files.
// Checks the data on the way: bad codes, duplicate CRNs, bad times, unknown courses.
//   node scripts/build-data.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { courses, departments } from './catalog-source.mjs';
import { rows, semester, termCode } from './sections-source.mjs';
import { normalizeCode, courseLeaves } from '../public/js/core/prereq.js';
import { parseRange } from '../public/js/core/schedule.js';

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
console.log(`Wrote ${courses.length} courses and ${rows.length} sample sections.`);
