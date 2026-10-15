// Unofficial transcript parser.
// Works on plain text: copied from the web page, an .html/.txt file, or text pulled out of a PDF.
// It is built for Banner-style rows ("CS 115  UG  Object-Oriented Programming I  A  2.000  8.000")
// but only needs a course code, then a title, then an optional grade and credit hours.
// No DOM code here; the server and tests use it too.

import { normalizeCode } from './prereq.js';

// Grades that can follow a title. Order matters only for readability.
const GRADES = ['A', 'B', 'C', 'D', 'E', 'F', 'P', 'S', 'U', 'W', 'WF', 'WP', 'I', 'IP', 'AU', 'TR', 'T', 'CR', 'NC', 'NR', 'N', 'X', 'AP'];
const GRADE_RX = `(?:[ABCD][+-]?|E|F|P|S|U|WF|WP|W|IP|I|AU|TR|T|CR|NC|NR|N|X|AP)`;
const NUM_RX = '(\\d{1,2}(?:\\.\\d{1,3})?)';
const PASSING = new Set(['A', 'B', 'C', 'D', 'P', 'S', 'TR', 'T', 'CR', 'AP']);
const NOT_COUNTED = new Set(['E', 'F', 'U', 'W', 'WF', 'WP', 'AU', 'NC', 'NR', 'N', 'X', 'I']);

// Grade before numbers:  "Title  A  3.000  12.000  [E|I|A]"
// (a repeat flag only appears after both numbers, so "3.000 A" is left for ROW_B)
const ROW_A = new RegExp(`^(.*?)\\s+(?:(${GRADE_RX})\\s+)?${NUM_RX}(?:\\s+${NUM_RX}(?:\\s+([EIA]))?)?\\s*$`);
// Grade after credits:   "Title  3.000  A  [12.000]"
const ROW_B = new RegExp(`^(.*?)\\s+${NUM_RX}\\s+(${GRADE_RX})(?:\\s+${NUM_RX})?\\s*$`);
const CODE_AT = /(^|[^A-Za-z0-9])([A-Z]{2,4})\s*[- ]?\s*(\d{3})([A-Z]?)(?![0-9])/;
const TERM_RX = /\b(Fall|Spring|Summer|Winter)\s+(?:Semester\s+|Term\s+)?(\d{4})\b/i;
// Words that look like subjects but are not.
const NOT_SUBJECTS = new Set(['GPA', 'ID', 'IL', 'USA', 'SSN', 'DOB', 'PIN', 'ACT', 'SAT', 'CRN', 'TERM', 'PAGE', 'ZIP', 'APT', 'STE', 'RM', 'NO', 'UG', 'GR']);

export function gradeStatus(grade, mode) {
  const g = String(grade || '').toUpperCase().replace(/[+-]$/, '');
  if (!g) return mode === 'transfer' ? 'completed' : 'in-progress';
  if (PASSING.has(g)) return 'completed';
  if (g === 'IP') return 'in-progress';
  if (NOT_COUNTED.has(g)) return 'not-counted';
  return 'completed';
}

/** Split text into lines and clean them up (HTML tags, tabs, extra spaces). */
export function textToLines(text) {
  let s = String(text || '');
  if (/<\s*(table|tr|td|div|br|p)\b/i.test(s)) {
    s = s
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
      .replace(/<\s*\/\s*(tr|p|div|li|h\d)\s*>/gi, '\n')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/\s*t[dh]\s*>/gi, '  ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  }
  return s.replace(/\r/g, '').replace(/\t/g, '  ').replace(/ /g, ' ')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function cleanTitle(t) {
  return String(t || '')
    .replace(/^\s*(UG|GR|GRD|LW|U|G)\s+/, '') // Banner level column
    .replace(/^[\s\-–:|]+|[\s\-–:|]+$/g, '')
    .trim();
}

/**
 * Parse transcript text.
 *   catalogTitles: optional Map code -> title. Used to fix rows where a title ends in "I"
 *   (like "Calculus I") and no grade is given yet.
 * Returns { courses: [{ code, title, credits, grade, term, status, transfer, repeatExcluded }], warnings }.
 */
export function parseTranscriptText(text, { catalogTitles } = {}) {
  const lines = textToLines(text);
  const courses = [];
  const warnings = [];
  let term = '';
  let mode = 'institution'; // 'institution' | 'transfer' | 'progress'

  for (const line of lines) {
    if (/transfer\s+credit|advanced\s+placement|test\s+credit|credit\s+by\s+exam/i.test(line) && !CODE_AT.test(line)) mode = 'transfer';
    else if (/institution\s+credit/i.test(line) && !CODE_AT.test(line)) mode = 'institution';
    else if (/(courses?|classes)\s+in\s+progress|in[- ]progress\s+courses?|currently\s+enrolled/i.test(line) && !CODE_AT.test(line)) mode = 'progress';

    const t = TERM_RX.exec(line);
    if (t && !CODE_AT.test(line)) {
      term = `${t[1][0].toUpperCase()}${t[1].slice(1).toLowerCase()} ${t[2]}`;
      continue;
    }

    const m = CODE_AT.exec(line);
    if (!m || NOT_SUBJECTS.has(m[2])) continue;
    const code = normalizeCode(`${m[2]} ${m[3]}`);
    if (!code) continue;
    const rest = line.slice(m.index + m[0].length).trim();

    let title = '';
    let grade = '';
    let credits = null;
    let flag = '';
    let r = ROW_A.exec(rest);
    if (r) {
      title = r[1]; grade = r[2] || ''; credits = Number(r[3]); flag = r[5] || '';
      // a second number with no grade is usually "credits  quality points"
    } else if ((r = ROW_B.exec(rest))) {
      title = r[1]; credits = Number(r[2]); grade = r[3];
    } else {
      title = rest;
    }
    title = cleanTitle(title);

    // "Calculus I 5.000" in the in-progress list: the "I" is part of the title, not an Incomplete.
    if (grade === 'I') {
      const known = catalogTitles?.get(code) || '';
      if (mode === 'progress' || (/\sI$/.test(known) && !/\sI$/.test(title))) {
        title = `${title} I`.trim();
        grade = '';
      }
    }
    // Lines that are only a code (e.g. a header or a prerequisite note) carry no title or numbers.
    if (!title && credits == null && !grade) {
      continue;
    }
    if (credits != null && (credits < 0 || credits > 12)) {
      warnings.push(`Odd credit value on: "${line}"`);
      credits = null;
    }

    let status = gradeStatus(grade, mode);
    if (mode === 'progress' && !grade) status = 'in-progress';
    courses.push({
      code,
      title,
      credits,
      grade: grade.toUpperCase(),
      term: mode === 'transfer' && !term ? 'Transfer' : term,
      status,
      transfer: mode === 'transfer' || ['TR', 'T', 'AP', 'CR'].includes(grade.toUpperCase()),
      repeatExcluded: flag === 'E',
    });
  }

  if (!courses.length && lines.length) warnings.push('No course rows were found. Try pasting the transcript text, or use "Read with Claude".');
  return { courses, warnings };
}

/**
 * Rebuild text lines from PDF.js text items ({ str, transform: [a,b,c,d,x,y], width }).
 * Items on the same baseline become one line; big gaps become double spaces (column breaks).
 */
export function linesFromPdfItems(items) {
  const rows = [];
  for (const it of items) {
    const str = String(it.str || '');
    if (!str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, str, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let out = '';
    let end = null;
    for (const p of r.parts) {
      if (end != null) out += p.x - end > 6 ? '  ' : (p.x - end > 0.5 ? ' ' : '');
      out += p.str;
      end = p.x + p.w;
    }
    return out;
  }).join('\n');
}

/**
 * Pick one record per course for counting (repeatable courses like IPRO 497 keep every passing attempt).
 * A passed attempt beats in-progress, which beats a failed or withdrawn attempt;
 * among passed attempts the higher grade wins. Banner's "E" (excluded) repeats lose.
 */
// Courses a student can take more than once for credit (different projects or topics).
export const REPEATABLE = new Set(['IPRO 397', 'IPRO 497', 'CS 397', 'CS 491', 'CS 495', 'CS 497', 'CS 591', 'CS 595', 'CS 597']);

export function bestAttempts(records) {
  const rank = { completed: 3, 'in-progress': 2, 'not-counted': 1 };
  const repeats = records.filter((r) => REPEATABLE.has(r.code));
  records = records.filter((r) => !REPEATABLE.has(r.code));
  const points = (g) => ({ A: 4, B: 3, C: 2, D: 1 })[String(g).replace(/[+-]$/, '')] ?? 2.5;
  const best = new Map();
  for (const rec of records) {
    const prev = best.get(rec.code);
    const score = (rec.repeatExcluded ? 0 : 10) + (rank[rec.status] || 0) * 100 + points(rec.grade);
    if (!prev || score > prev.score) best.set(rec.code, { rec, score });
  }
  // repeatable courses: every attempt that counts is kept
  const keptRepeats = repeats.filter((r) => r.status !== 'not-counted' && !r.repeatExcluded);
  return [...[...best.values()].map((b) => b.rec), ...keptRepeats];
}

/** Validate records that came from the browser or from Claude. Drops anything malformed. */
export function cleanRecords(list, max = 150) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list.slice(0, max)) {
    if (!raw || typeof raw !== 'object') continue;
    const code = normalizeCode(raw.code);
    if (!code) continue;
    const credits = raw.credits === '' || raw.credits == null ? null : Number(raw.credits);
    const grade = String(raw.grade || '').toUpperCase().slice(0, 3);
    const status = ['completed', 'in-progress', 'not-counted'].includes(raw.status) ? raw.status : gradeStatus(grade);
    out.push({
      code,
      title: String(raw.title || '').slice(0, 120),
      credits: Number.isFinite(credits) && credits >= 0 && credits <= 12 ? credits : null,
      grade,
      term: String(raw.term || '').slice(0, 30),
      status,
      transfer: !!raw.transfer,
      repeatExcluded: !!raw.repeatExcluded,
    });
  }
  return out;
}

export { GRADES };
