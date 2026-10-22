// Time commitments: work, commute, sports, family. The student lists them once.
// The app then marks sections that clash with them and tells the chat advisor.
// No DOM code here; tests use it too.
//
// A commitment: { id, label, days: 'MTWRF', start: 14, end: 17.5 }  (hours, 24-hour clock)

import { parseRange, DAY_LETTERS, DAY_LABELS, formatHour } from './schedule.js';

const MAX = 20;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Clean one commitment from user input. Returns null when it is not usable. */
export function cleanCommitment(raw) {
  const days = [...new Set(String(raw?.days || '').toUpperCase().split('').filter((d) => DAY_LETTERS.includes(d)))]
    .sort((a, b) => DAY_LETTERS.indexOf(a) - DAY_LETTERS.indexOf(b)).join('');
  const start = Number(raw?.start);
  const end = Number(raw?.end);
  if (!days || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 || end <= start) return null;
  return { id: String(raw.id || `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`), label: clip(raw.label, 40) || 'Busy', days, start, end };
}

export const cleanCommitments = (list) => (Array.isArray(list) ? list.map(cleanCommitment).filter(Boolean).slice(0, MAX) : []);

/** "14:30" -> 14.5 (from an <input type="time">). NaN when empty. */
export function hoursFromInput(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  return m ? Number(m[1]) + Number(m[2]) / 60 : NaN;
}

/** Grid blocks for the commitments (same shape as schedule blocks, with kind 'busy'). */
export function commitmentBlocks(list) {
  const blocks = [];
  for (const c of list) {
    for (const letter of c.days) {
      const day = DAY_LETTERS.indexOf(letter);
      if (day >= 0) blocks.push({ key: c.id, label: c.label, kind: 'busy', day, start: c.start, end: c.end });
    }
  }
  return blocks;
}

/** Commitments that overlap a section's meetings. Returns [{ label, day, start, end }]. */
export function sectionClashes(section, list) {
  const out = [];
  for (const m of section?.meetings || []) {
    const range = parseRange(m.time);
    if (!range) continue;
    for (const letter of String(m.days || '').toUpperCase()) {
      const day = DAY_LETTERS.indexOf(letter);
      if (day < 0) continue;
      for (const c of list) {
        if (!c.days.includes(letter)) continue;
        if (range.start < c.end && c.start < range.end) out.push({ label: c.label, day, start: Math.max(range.start, c.start), end: Math.min(range.end, c.end) });
      }
    }
  }
  return out;
}

/** True when the course has no section at all, or at least one section with no clash. */
export function courseFits(course, list) {
  if (!list.length || !course.sections?.length) return true;
  return course.sections.some((s) => !sectionClashes(s, list).length);
}

/** Short day text: "MWF" -> "Mon Wed Fri". */
export const dayWords = (days) => [...days].map((l) => DAY_LABELS[DAY_LETTERS.indexOf(l)]).map((d) => d[0] + d.slice(1).toLowerCase()).join(' ');

/** One plain line per commitment (Degree/Chat context and the list in the UI). */
export const describeCommitment = (c) => `${c.label}: ${dayWords(c.days)}, ${formatHour(c.start)}-${formatHour(c.end)}`;
