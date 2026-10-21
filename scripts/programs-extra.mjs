// Reads data/source/programs/*.txt (degree requirements copied from catalog.iit.edu) and turns each
// program into the same shape as the B.S. in Computer Science entry in programs-source.mjs.
// Line format is described at the top of engineering.txt.
//
// How each catalog section becomes an audit group:
//   required        -> type "all": every course is its own slot. An "O" line is one slot with alternatives.
//   choose          -> type "all" when every option is a course code; otherwise a "pick" from the listed courses.
//   elective        -> type "pick" from the listed courses, or from any course when none are listed.
//   hss             -> the Core Curriculum rules (IPRO, natural science, humanities and social sciences).
//   free            -> type "free": any leftover credit.
//   track           -> not in the total. Kept in program.tracks so the app can show the closest specialization.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(here, '..', 'data', 'source', 'programs');
const CODE_RX = /^[A-Z]{2,5} \d{3}[A-Z]?$/;

// Subjects used to guess Core Curriculum attributes. Transcripts do not show (H), (S), or (N).
const H_SUBJECTS = ['HUM', 'HIST', 'LIT', 'PHIL', 'AAH'];
const S_SUBJECTS = ['PSYC', 'SOC', 'PS', 'ECON', 'SSCI'];
const N_SUBJECTS = ['BIOL', 'CHEM', 'PHYS', 'MS', 'FDSN', 'ENVE', 'ASTR', 'GEOL'];

export const COLLEGES = {
  engineering: 'Armour College of Engineering',
  computing: 'College of Computing',
  architecture: 'College of Architecture',
  'science-letters': 'College of Science',
  business: 'Stuart School of Business',
};

export const warnings = [];
const warn = (programName, message) => warnings.push(`${programName}: ${message}`);

/** "3-4" -> 3, "(24-25)" -> 24, "13 OR 14" -> 13, "not stated" -> 0. */
export function parseCredits(text) {
  const m = String(text ?? '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

const slug = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function shortName(printed) {
  const name = printed.replace(/\*+$/, '').trim();
  return name
    .replace(/^Bachelor of Science in /, 'B.S. in ')
    .replace(/^Bachelor of Arts in /, 'B.A. in ');
}

function programId(printed, used) {
  const name = printed.replace(/\*+$/, '').trim();
  let id;
  if (/^Bachelor of Science in /.test(name)) id = `bs-${slug(name.replace(/^Bachelor of Science in /, ''))}`;
  else if (/^Bachelor of Arts in /.test(name)) id = `ba-${slug(name.replace(/^Bachelor of Arts in /, ''))}`;
  else id = slug(name.replace(/^Bachelor of /, 'b-'));
  let unique = id;
  for (let n = 2; used.has(unique); n++) unique = `${id}-${n}`;
  used.add(unique);
  return unique;
}

/** "CHEM 122+CHEM 123" -> ["CHEM 122","CHEM 123"]. Returns null when a part is not a course code. */
function splitCombo(token) {
  const parts = String(token).split('+').map((p) => p.trim());
  return parts.every((p) => CODE_RX.test(p)) ? parts : null;
}

/** "ECON/BUS 382" -> alternatives BUS 382 or ECON 382. */
function expandSlashCode(code) {
  const m = String(code).match(/^([A-Z]{2,5})\/([A-Z]{2,5}) (\d{3}[A-Z]?)$/);
  return m ? [`${m[1]} ${m[3]}`, `${m[2]} ${m[3]}`] : null;
}

function parseSections(text) {
  const programs = [];
  let program = null;
  let group = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [tag, ...rest] = line.split('|');
    if (tag === 'PROGRAM') {
      program = { name: rest[0].trim(), totalText: rest[1]?.trim() || '', path: rest[2]?.trim() || '', groups: [] };
      programs.push(program);
      group = null;
    } else if (tag === 'G' && program) {
      group = { name: rest[0].trim(), creditsText: rest[1]?.trim() || '', kind: (rest[2] || 'required').trim(), rule: (rest[3] || '').trim(), courses: [], options: [] };
      program.groups.push(group);
    } else if (tag === 'C' && group) {
      group.courses.push({ code: rest[0].trim(), title: (rest[1] || '').trim(), creditsText: (rest[2] || '').trim() });
    } else if (tag === 'O' && group) {
      group.options.push(rest[0].split(',').map((o) => o.trim()).filter(Boolean));
    }
  }
  return programs;
}

/** Credits for every code we can see, so the audit can size courses that are not in catalog.json. */
function collectCreditsAndTitles(program) {
  const credits = {};
  const titles = {};
  for (const g of program.groups) {
    for (const c of g.courses) {
      const n = parseCredits(c.creditsText);
      const combo = splitCombo(c.code);
      if (combo) {
        // lab parts are usually 1 credit: first part gets the rest
        if (n) {
          const lab = combo.slice(1).map(() => 1);
          credits[combo[0]] = Math.max(1, n - lab.reduce((a, b) => a + b, 0));
          combo.slice(1).forEach((code) => { credits[code] = 1; });
        }
        continue;
      }
      const slashed = expandSlashCode(c.code);
      for (const code of slashed || [c.code]) {
        if (!CODE_RX.test(code)) continue;
        if (n) credits[code] = n;
        if (c.title && !/title not listed|not listed/i.test(c.title)) titles[code] = c.title.replace(/\s+\d$/, '');
      }
    }
  }
  return { credits, titles };
}

function allCodes(group) {
  const out = new Set();
  const add = (token) => {
    const combo = splitCombo(token);
    for (const code of combo || [token]) if (CODE_RX.test(code)) out.add(code);
  };
  for (const c of group.courses) for (const code of expandSlashCode(c.code) || [c.code]) add(code);
  for (const set of group.options) for (const token of set) add(token);
  return [...out];
}

function optionToSlotOption(token) {
  const combo = splitCombo(token);
  if (combo) return combo;
  return CODE_RX.test(token) ? [token] : null;
}

function slotsFor(group) {
  // O lines become one slot each. A C line whose code appears in an O line is covered by that slot.
  const optionSets = group.options.map((set) => set.map(optionToSlotOption));
  if (optionSets.some((set) => set.some((o) => !o))) return null; // free-text option: cannot be checked
  const coverKey = (opt) => opt.join('+');
  const covered = new Map(); // course key -> index of option set
  optionSets.forEach((set, i) => set.forEach((opt) => covered.set(coverKey(opt), i)));
  const emitted = new Set();
  const slots = [];
  const emitSet = (i) => { if (!emitted.has(i)) { emitted.add(i); slots.push(optionSets[i]); } };
  for (const c of group.courses) {
    const slashed = expandSlashCode(c.code);
    if (slashed) { slots.push(slashed.map((s) => [s])); continue; }
    const combo = splitCombo(c.code);
    const opt = combo || (CODE_RX.test(c.code) ? [c.code] : null);
    if (!opt) return null;
    const key = coverKey(opt);
    if (covered.has(key)) emitSet(covered.get(key));
    else slots.push([opt]);
  }
  optionSets.forEach((_, i) => emitSet(i));
  // a course listed twice (for example a colloquium taken twice) is one slot
  const seen = new Set();
  return slots.filter((slot) => {
    const key = slot.map((o) => o.join('+')).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hssGroup(group, id, credits) {
  const name = group.name;
  const note = group.rule;
  if (/interprofessional|ipro/i.test(name)) {
    return { id, name, credits, type: 'pick', note: note || 'At least two IPRO experiences.', from: { subjects: ['IPRO'] } };
  }
  if (/natural science|science and engineering|science requirement/i.test(name)) {
    return { id, name, credits, type: 'pick', note: `${note} The app counts BIOL, CHEM, PHYS, MS, FDSN, and ENVE courses.`.trim(), from: { subjects: N_SUBJECTS } };
  }
  if (/^humanities elective|humanities requirements?$/i.test(name) && credits <= 9) {
    return { id, name, credits, type: 'pick', note, from: { subjects: H_SUBJECTS, minLevel: /elective/i.test(name) ? 200 : 0 } };
  }
  if (/social sciences? elective/i.test(name)) {
    return { id, name, credits, type: 'pick', note, from: { subjects: S_SUBJECTS, minLevel: 200 } };
  }
  if (/humanities and social|humanities & social/i.test(name)) {
    if (credits === 21) {
      return {
        id, name, credits, type: 'hss',
        note: 'One HUM 100-level course; two (H) courses at 200+; three (S) courses (two at 200+, from two or more fields); one more (H), (S), or COM course (not COM 101 or 111).',
        hSubjects: H_SUBJECTS, sSubjects: S_SUBJECTS,
      };
    }
    return { id, name, credits, type: 'pick', note: `${note} The app counts H and S courses by subject.`.trim(), from: { subjects: [...H_SUBJECTS, ...S_SUBJECTS, 'COM'] } };
  }
  return { id, name, credits, type: 'pick', note, from: {} };
}

function buildGroup(program, group, index, usedIds) {
  const credits = parseCredits(group.creditsText);
  let id = slug(group.name) || `group-${index}`;
  for (let n = 2; usedIds.has(id); n++) id = `${slug(group.name)}-${n}`;
  usedIds.add(id);
  const note = group.rule;
  const codes = allCodes(group);

  if (group.kind === 'hss') return hssGroup(group, id, credits);
  if (group.kind === 'free') return { id, name: group.name, credits, type: 'free', note };

  if (group.kind === 'required' || group.kind === 'choose') {
    const slots = slotsFor(group);
    const hasListed = group.courses.length || group.options.length;
    if (!hasListed) return { id, name: group.name, credits, type: 'pick', note, from: {} };
    const hasLeftover = group.kind === 'choose' && group.courses.some((c) => {
      const key = c.code;
      return !group.options.some((set) => set.includes(key));
    }) && group.options.length === 0;
    if (slots && !hasLeftover) {
      if (group.kind === 'choose' && group.courses.length && !group.options.length) {
        return { id, name: group.name, credits, type: 'pick', note, from: { codes } };
      }
      return { id, name: group.name, credits, type: 'all', note, slots };
    }
    return { id, name: group.name, credits, type: 'pick', note, from: codes.length ? { codes } : {} };
  }

  // elective
  return { id, name: group.name, credits, type: 'pick', note, from: codes.length ? { codes } : {} };
}

const TYPE_RANK = { all: 0, pick: 1, hss: 2, free: 3 };

/** Rough credit size of an "all" group's slots, used only to catch typing mistakes in the source files. */
function slotCredits(slot, credits) {
  const best = slot.map((option) => option.reduce((sum, code) => sum + (credits[code] ?? 3), 0));
  return Math.max(...best);
}

function buildProgram(raw, used) {
  const { credits, titles } = collectCreditsAndTitles(raw);
  const usedIds = new Set();
  const trackGroups = raw.groups.filter((g) => g.kind === 'track');
  const body = raw.groups.filter((g) => g.kind !== 'track');
  const built = body.map((g, i) => buildGroup(raw, g, i, usedIds));

  // required groups first, then picks, then the Core Curriculum, then free credit (stable order inside each)
  const groups = built.map((g, i) => ({ g, i })).sort((a, b) => (TYPE_RANK[a.g.type] - TYPE_RANK[b.g.type]) || (a.i - b.i)).map((x) => x.g);

  const declared = parseCredits(raw.totalText);
  let sum = groups.reduce((s, g) => s + g.credits, 0);
  let gapNote = '';
  // The catalog total is larger than its listed sections (concentrations, double-counting, open credit).
  // Put the gap in open credit so the degree total matches the catalog.
  if (sum < declared) {
    const gap = declared - sum;
    const free = groups.find((g) => g.type === 'free');
    if (free) free.credits += gap;
    else groups.push({ id: 'other-credits', name: 'Other Credits', credits: gap, type: 'free', note: 'Credit the catalog adds to the total, such as a concentration, a minor, or open electives.' });
    sum = declared;
    gapNote = `The catalog sections add up to less than the ${declared}-credit total. The app counts the ${gap} extra credits as open credit.`;
  }
  const notes = [
    'Requirements were read from the IIT catalog page for this program. Confirm them in your official degree audit.',
    'Course attributes like (H), (S), (N), and (C) are not on transcripts. The app guesses them from the subject.',
    'Open electives (technical, career, minor, free) are filled with any leftover credit. The app does not check which courses the department accepts.',
  ];
  if (/-/.test(raw.totalText) || /min/i.test(raw.totalText)) {
    notes.push(`The catalog gives the total as ${raw.totalText} credits. The app uses ${sum}.`);
  }
  if (gapNote) { notes.push(gapNote); warn(raw.name, gapNote); }
  if (sum !== declared) {
    warn(raw.name, `sections add up to ${sum}, catalog total is ${declared}`);
    notes.push(`The catalog sections add up to ${sum} credits and the catalog total is ${raw.totalText}. Ask your academic advisor about the difference.`);
  }

  // typing-mistake check: slots of "all" groups against the section credits
  for (const g of groups) {
    if (g.type !== 'all') continue;
    const slotSum = g.slots.reduce((s, slot) => s + slotCredits(slot, credits), 0);
    if (Math.abs(slotSum - g.credits) > 1) warn(raw.name, `"${g.name}": courses add up to ${slotSum}, section says ${g.credits}`);
  }

  const tracks = trackGroups.map((t) => ({
    name: t.name.replace(/\s+(Specialization|Concentration)$/i, '').trim(),
    kind: /Concentration/i.test(t.name) ? 'concentration' : 'specialization',
    note: t.rule,
    codes: allCodes(t),
  }));
  if (tracks.length) notes.push('Specializations and concentrations are optional. The app only shows how close you are to each one.');

  // every course code the audit may need must have a credit value
  const programCredits = {};
  const codesInGroups = new Set();
  for (const g of groups) {
    for (const slot of g.slots || []) for (const option of slot) option.forEach((c) => codesInGroups.add(c));
    for (const c of g.from?.codes || []) codesInGroups.add(c);
  }
  for (const code of codesInGroups) programCredits[code] = credits[code] ?? 3;
  const programTitles = {};
  for (const code of codesInGroups) if (titles[code]) programTitles[code] = titles[code];

  const printed = raw.name.replace(/\*+$/, '').trim();
  return {
    id: programId(raw.name, used),
    name: shortName(raw.name),
    majorName: printed.replace(/^Bachelor of (Science|Arts) in /, '').replace(/^Bachelor of /, ''),
    college: COLLEGES[raw.path.split('/')[3]] || 'Other programs',
    catalogYear: '2025–2026',
    totalCredits: sum,
    totalCreditsText: raw.totalText,
    source: `https://catalog.iit.edu${raw.path}`,
    notes,
    credits: programCredits,
    titles: programTitles,
    tracks,
    groups,
  };
}

export function loadExtraPrograms(existingIds = []) {
  warnings.length = 0;
  const used = new Set(existingIds);
  const programs = [];
  for (const file of readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.txt')).sort()) {
    for (const raw of parseSections(readFileSync(join(SOURCE_DIR, file), 'utf8'))) {
      programs.push(buildProgram(raw, used));
    }
  }
  return programs;
}
