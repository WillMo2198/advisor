// Builds the text Claude sees: the COURSE DATA block (same for every request, so it is cached)
// and the STUDENT CONTEXT block (changes per request).

import { extractCodes, evaluate, missingParts, treeToText, normalizeCode } from '../public/js/core/prereq.js';
import { ancestors, creditNumber } from '../public/js/core/catalog.js';
import { buildBlocks, findConflicts, DAY_LABELS, formatHour } from '../public/js/core/schedule.js';

function compactSection(s) {
  return {
    crn: s.crn,
    type: `${s.scheduleType}${s.bucket && s.bucket !== 'Class' ? ` (${s.bucket})` : ''}`,
    meetings: s.meetings.map((m) => [m.days || 'TBA', m.time || 'TBA', m.where || 'TBA', m.instructors.join(', ') || 'TBA'].join(' | ')),
    seatsOpen: s.available,
  };
}

/** The whole catalog + sections as text. Small enough (about 50 courses) to send in full. */
export function courseDataBlock(index) {
  const lines = [];
  lines.push('COURSE DATA');
  lines.push(`Catalog source: ${index.source}`);
  lines.push(`Semester for sections: ${index.semester}${index.termCode ? ` (term code ${index.termCode})` : ''}`);
  lines.push(index.sample
    ? 'SECTIONS ARE SAMPLE DATA: CRNs, times, rooms, seats, and instructor names are made up for the demo. Say this when you mention them.'
    : 'Sections were imported from the live Course Status Report through pop.ai. Seats may have changed since import.');
  lines.push('One JSON object per course:');
  for (const c of index.list) {
    const row = {
      code: c.code,
      title: c.title,
      credits: c.credits,
      department: c.department,
    };
    if (c.satisfies) row.satisfies = c.satisfies;
    if (c.bridge) row.graduateBridge = true;
    if (c.stub) row.note = 'Not in the app catalog file. Only section data is known.';
    row.description = c.description;
    row.prereqText = c.prereqText || 'None';
    row.prereq = c.prereq;
    if (c.note) row.note = c.note;
    row.unlocks = c.dependents.map((d) => d.code + (d.concurrent ? '*' : ''));
    row.sections = c.sections.map(compactSection);
    lines.push(JSON.stringify(row));
  }
  const ext = [...index.external.keys()].sort();
  if (ext.length) {
    lines.push(`Course codes named in prerequisites but not in this catalog (details unknown): ${ext.join(', ')}`);
  }
  return lines.join('\n');
}

function cleanCodes(list, index, max = 80) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list.slice(0, max)) {
    const code = normalizeCode(raw);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Validate and normalize the client's context object. */
export function readClientContext(raw, index) {
  const ctx = raw && typeof raw === 'object' ? raw : {};
  const savedCrns = Array.isArray(ctx.savedCrns)
    ? [...new Set(ctx.savedCrns.slice(0, 40).map((c) => String(c).trim()).filter((c) => index.crnMap.has(c)))]
    : [];
  return {
    query: typeof ctx.query === 'string' ? ctx.query.slice(0, 300) : '',
    completed: cleanCodes(ctx.completed, index),
    savedCrns,
    focus: cleanCodes(ctx.focus, index, 10),
  };
}

/** Codes the student is asking about: from the message, then the search focus. */
export function relevantCodes(index, message, ctx) {
  const codes = extractCodes(message, index.courses);
  // bare numbers like "331" when they match exactly one course
  const nums = String(message || '').match(/(?<![A-Za-z\d])\d{3}(?!\d)/g) || [];
  for (const n of nums) {
    const hits = index.list.filter((c) => c.number === n);
    if (hits.length === 1 && !codes.includes(hits[0].code)) codes.push(hits[0].code);
  }
  for (const c of ctx.focus) if (!codes.includes(c) && index.has(c)) codes.push(c);
  return codes.slice(0, 8);
}

export function savedItems(index, ctx) {
  return ctx.savedCrns.map((crn) => {
    const s = index.crnMap.get(crn);
    return { key: crn, label: s.course, colorKey: s.course, section: s };
  });
}

export function scheduleFacts(index, ctx) {
  const items = savedItems(index, ctx);
  const { blocks } = buildBlocks(items);
  const conflicts = findConflicts(blocks).map((c) => {
    const a = index.crnMap.get(c.a);
    const b = index.crnMap.get(c.b);
    return `${a.course} (CRN ${a.crn}) and ${b.course} (CRN ${b.crn}) overlap on ${DAY_LABELS[c.day]} ${formatHour(c.start)}-${formatHour(c.end)}`;
  });
  const courses = [...new Set(items.map((i) => i.label))];
  const credits = courses.reduce((sum, code) => sum + creditNumber(index.get(code)), 0);
  return { items, conflicts, courses, credits };
}

/** Plain-language eligibility for one course. */
export function eligibility(index, code, ctx, plannedCourses) {
  const course = index.get(code);
  if (!course) return null;
  if (!ctx.completed.length) return { status: 'unknown-history', missing: [] };
  const state = { completed: new Set(ctx.completed), current: new Set(plannedCourses) };
  return { status: evaluate(course.prereq, state), missing: missingParts(course.prereq, state) };
}

export function studentContextBlock(index, message, ctx) {
  const lines = ['STUDENT CONTEXT (from the app, this request only)'];
  lines.push(`Search box: ${ctx.query ? JSON.stringify(ctx.query) : '(empty)'}`);
  lines.push(`Completed courses (entered by the student): ${ctx.completed.length ? ctx.completed.join(', ') : 'not entered'}`);

  const sched = scheduleFacts(index, ctx);
  if (sched.items.length) {
    lines.push(`Saved sections for ${index.semester}:`);
    for (const it of sched.items) {
      const s = it.section;
      const course = index.get(s.course);
      lines.push(`- ${s.course} ${course?.title || ''}, CRN ${s.crn}, ${s.scheduleType}: ${s.meetings.map((m) => `${m.days} ${m.time} in ${m.where}`).join('; ')}`);
    }
    lines.push(`Planned credits: ${sched.credits}`);
    lines.push(sched.conflicts.length ? `Time conflicts: ${sched.conflicts.join('; ')}` : 'Time conflicts: none');
  } else {
    lines.push('Saved sections: none');
  }

  const codes = relevantCodes(index, message, ctx);
  if (codes.length) {
    lines.push('Courses in this question, with checks the app ran:');
    for (const code of codes) {
      const course = index.get(code);
      if (!course) continue;
      const chain = [...ancestors(index, code, (c) => index.has(c) && !index.get(c).bridge)];
      lines.push(`- ${code} ${course.title}. Rule: ${treeToText(course.prereq)}.`);
      if (chain.length) lines.push(`  Full prerequisite chain (all options, no bridge courses): ${chain.join(', ')}`);
      const others = sched.courses.filter((c) => c !== code);
      const el = eligibility(index, code, ctx, others);
      if (el.status === 'unknown-history') lines.push('  Eligibility: unknown (no completed courses entered).');
      else if (el.status === 'met') lines.push(`  Eligibility: prerequisites met${others.length ? ' (counting saved courses for concurrent rules)' : ''}. Minimum grades not checked.`);
      else if (el.status === 'unknown') lines.push(`  Eligibility: needs a rule the app cannot check: ${el.missing.join('; ')}`);
      else lines.push(`  Eligibility: NOT met. Still missing: ${el.missing.join('; ')}`);
    }
  }
  return lines.join('\n');
}
