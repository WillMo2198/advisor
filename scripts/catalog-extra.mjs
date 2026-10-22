// Reads data/source/courses/*.txt and builds catalog entries for the other subjects.
// Row: CODE|Title|Credits|Prerequisite as printed in the catalog|Short description
// The prerequisite text is turned into the same AND / OR tree the other courses use.
// "and" binds tighter than "or". "*" after a code means it may be taken at the same time.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'source', 'courses');
const CONCURRENT_NOTE = 'An asterisk (*) designates a course which may be taken concurrently.';
const CODE = /^([A-Z]{2,4}) (\d{3})$/;

const TOKEN = /\(|\)|\band\b|\bor\b|\b[A-Z]{2,4} \d{3}(?:-\d{3})?\*?(?:\s+with min\. grade of [A-D]\*?)?|[^()]+?(?=\(|\)|\band\b|\bor\b|\b[A-Z]{2,4} \d{3}|$)/g;

function tokenize(text) {
  const out = [];
  for (const m of text.matchAll(TOKEN)) {
    const s = m[0].trim();
    if (!s) continue;
    if (s === '(') out.push({ k: 'lp' });
    else if (s === ')') out.push({ k: 'rp' });
    else if (s === 'and') out.push({ k: 'and' });
    else if (s === 'or') out.push({ k: 'or' });
    else {
      const cm = /^([A-Z]{2,4} \d{3})(-\d{3})?(\*)?(?:\s+with min\. grade of ([A-D]))?(\*)?$/.exec(s);
      if (cm && !cm[2]) out.push({ k: 'course', code: cm[1], concurrent: Boolean(cm[3] || cm[5]), minGrade: cm[4] || '' });
      else out.push({ k: 'text', text: s.replace(/[*.]+$/, '') });
    }
  }
  return out;
}

/** Text -> tree, or null for no prerequisite. Falls back to one text leaf when it cannot be read. */
export function parsePrereq(raw) {
  const text = String(raw || '').replace(CONCURRENT_NOTE, '').replace(/[,\s]+$/, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (!/\b[A-Z]{2,4} \d{3}\b/.test(text)) return { type: 'text', text: text.replace(/\.$/, '') };
  const toks = tokenize(text);
  let i = 0;
  const leaf = (t) => (t.k === 'course'
    ? { type: 'course', code: t.code, ...(t.minGrade ? { minGrade: t.minGrade } : {}), ...(t.concurrent ? { concurrent: true } : {}) }
    : { type: 'text', text: t.text });
  const atom = () => {
    const t = toks[i];
    if (!t) return null;
    if (t.k === 'lp') { i++; const n = or(); if (toks[i]?.k === 'rp') i++; return n; }
    if (t.k === 'course' || t.k === 'text') { i++; return leaf(t); }
    return null;
  };
  const join2 = (type, kind, next) => {
    const first = next();
    if (!first) return null;
    const kids = [first];
    while (toks[i]?.k === kind) { i++; const n = next(); if (n) kids.push(n); }
    return kids.length === 1 ? first : { type, children: kids };
  };
  const and = () => join2('and', 'and', atom);
  const or = () => join2('or', 'or', and);
  const tree = or();
  if (i < toks.length) return { type: 'text', text }; // not fully read: keep the printed text
  return tree;
}

export const extraDepartments = {
  ECE: 'Electrical and Computer Engineering', MMAE: 'Mechanical, Materials, and Aerospace Engineering',
  PHYS: 'Physics', CHEM: 'Chemistry', BIOL: 'Biology', BUS: 'Business', CAE: 'Civil, Architectural, and Environmental Engineering',
  ARCH: 'Architecture', AURB: 'Architecture and Urbanism', BME: 'Biomedical Engineering', CHE: 'Chemical Engineering',
  COM: 'Communication', DS: 'Data Science', EG: 'Engineering Graphics', EMGT: 'Engineering Management', ENVE: 'Environmental Engineering',
  ENGR: 'Engineering', FDSN: 'Foundation', GEM: 'Global Engineering and Management', INTM: 'Interprofessional Studies',
  ITM: 'Information Technology and Management', ITMD: 'ITM Development', ITMM: 'ITM Management', ITMO: 'ITM Operations',
  ITMS: 'ITM Security', ITMT: 'ITM Technology', IPRO: 'Interprofessional Projects', LAW: 'Law', MS: 'Materials Science',
  STAT: 'Statistics', TECH: 'Technology', ID: 'Industrial Design', IDX: 'Industrial Design Interdisciplinary', BANL: 'Business Analytics', CAPS: 'Capstone',
};

export function loadExtraCourses(skip = new Set()) {
  const out = [];
  const seen = new Set(skip);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.txt')).sort()) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const [code, title, credits, prereq = '', ...desc] = line.split('|');
      if (!CODE.test(code.trim())) throw new Error(`${f}: bad course code in "${line.slice(0, 40)}"`);
      const key = code.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      const prereqText = prereq.replace(CONCURRENT_NOTE, '').replace(/[,\s]+$/, '').trim();
      out.push({
        code: key, title: title.trim(), credits: String(credits).trim() || 'Variable',
        description: desc.join('|').trim(), satisfies: '', prereqText, prereq: parsePrereq(prereqText),
      });
    }
  }
  return out;
}
