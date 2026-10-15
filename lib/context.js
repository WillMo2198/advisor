// Builds the text Claude sees: the COURSE DATA block (same for every request, so it is cached)
// and the STUDENT CONTEXT block (changes per request).

import { extractCodes, evaluate, missingParts, treeToText, normalizeCode } from '../public/js/core/prereq.js';
import { ancestors, creditNumber } from '../public/js/core/catalog.js';
import { buildBlocks, findConflicts, DAY_LABELS, formatHour } from '../public/js/core/schedule.js';
import { cleanRecords, bestAttempts } from '../public/js/core/transcript.js';
import { auditDegree } from '../public/js/core/audit.js';
import { planSemesters } from '../public/js/core/planner.js';

function compactSection(s) {
  return {
    crn: s.crn,
    type: `${s.scheduleType}${s.bucket && s.bucket !== 'Class' ? ` (${s.bucket})` : ''}`,
    meetings: s.meetings.map((m) => [m.days || 'TBA', m.time || 'TBA', m.where || 'TBA', m.instructors.join(', ') || 'TBA'].join(' | ')),
    seatsOpen: s.available,
  };
}

/** The whole catalog + sections as text. Small enough (about 50 courses) to send in full. */
export function courseDataBlock(index, programs = []) {
  const lines = [];
  lines.push('COURSE DATA');
  lines.push(`Catalog source: ${index.source}`);
  lines.push(`Semester for sections: ${index.semester}${index.termCode ? ` (term code ${index.termCode})` : ''}`);
  lines.push(index.sample
    ? 'SECTIONS ARE SAMPLE DATA: CRNs, times, rooms, seats, and instructor names are made up for the demo. Say this when you mention them.'
    : 'Sections were imported from the live Course Status Report through pop.ai. Seats may have changed since import.');
  if (index.forecast) {
    lines.push(`Future offerings: ${index.forecast.source} Terms covered: ${index.forecast.terms.map((t) => t.label).join(', ')}. "futureTerms" lists the terms a course is expected; an empty list means not planned in those terms. Always call this tentative.`);
  }
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
    if (c.futureTerms) row.futureTerms = c.futureTerms;
    if (c.forecastNote) row.forecastNote = c.forecastNote;
    lines.push(JSON.stringify(row));
  }
  if (index.forecast) {
    const labels = new Map(index.forecast.terms.map((t) => [t.key, t.label]));
    const only = Object.entries(index.forecast.courses).filter(([code]) => !index.has(code));
    if (only.length) {
      lines.push('Courses on the future-offerings forecast that are not in this catalog (graduate and CSP courses; titles and prerequisites unknown unless noted):');
      lines.push(only.map(([code, keys]) => `${code}${index.forecast.notes?.[code] ? ` (${index.forecast.notes[code]})` : ''}: ${keys.length ? keys.map((k) => labels.get(k)).join(', ') : 'not planned'}`).join('; '));
    }
  }
  for (const prog of programs) {
    lines.push(`DEGREE PROGRAM ${prog.name} (${prog.catalogYear} catalog, ${prog.totalCredits} credits). Requirement groups:`);
    for (const g of prog.groups) {
      let rule = '';
      if (g.slots) rule = g.slots.map((slot) => slot.map((o) => o.join(' + ')).join(' or ')).join('; ');
      else if (g.from?.codes) rule = `${g.count ? `${g.count} course` : `${g.credits} credits`} from ${g.from.codes.join(', ')}`;
      else if (g.from?.subjects) rule = `${g.credits} credits from ${g.from.subjects.join('/')}${g.from.minLevel ? ` ${g.from.minLevel}+` : ''}${g.from.exclude ? ` except ${g.from.exclude.join(', ')}` : ''}`;
      lines.push(`- ${g.name} (${g.credits} cr): ${rule}${g.note ? ` ${g.note}` : ''}`);
    }
    for (const n of prog.notes || []) lines.push(`  Note: ${n}`);
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
  const manual = cleanCodes(ctx.completed, index);
  const transcript = cleanRecords(ctx.transcript);
  const best = bestAttempts(transcript);
  const fromTranscript = best.filter((r) => r.status === 'completed').map((r) => r.code);
  const inProgress = best.filter((r) => r.status === 'in-progress').map((r) => r.code);
  const grades = new Map(best.filter((r) => r.grade).map((r) => [r.code, r.grade]));
  return {
    query: typeof ctx.query === 'string' ? ctx.query.slice(0, 300) : '',
    manualCompleted: manual,
    completed: [...new Set([...manual, ...fromTranscript])],
    inProgress,
    grades,
    transcript,
    programId: typeof ctx.programId === 'string' ? ctx.programId.slice(0, 40) : '',
    maxCredits: Math.min(21, Math.max(6, Number(ctx.maxCredits) || 15)),
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
  // courses in progress now will be finished before the next term, so they count here
  const state = { completed: new Set([...ctx.completed, ...(ctx.inProgress || [])]), current: new Set(plannedCourses), grades: ctx.grades };
  return { status: evaluate(course.prereq, state), missing: missingParts(course.prereq, state) };
}

/** Degree progress text from the transcript records (empty when there is no transcript). */
export function degreeBlock(index, ctx, programs, sched) {
  if (!ctx.transcript.length) return [];
  const program = programs.find((p) => p.id === ctx.programId) || programs[0];
  if (!program) return [];
  const lines = [];
  const planned = sched.courses.filter((c) => !ctx.completed.includes(c) && !ctx.inProgress.includes(c));
  const audit = auditDegree(program, ctx.transcript, { index, planned });
  const t = audit.totals;
  lines.push(`DEGREE PROGRESS (from the student's uploaded unofficial transcript, checked against ${program.name}, ${program.catalogYear} catalog):`);
  lines.push(`Credits applied: ${t.done} done, ${t.inProgress} in progress, ${t.planned} planned (saved sections), ${t.remaining} still needed, of ${t.required}.`);
  const best = bestAttempts(ctx.transcript);
  const fmt = (r) => `${r.code}${r.grade ? ` (${r.grade})` : ''}`;
  lines.push(`Completed: ${best.filter((r) => r.status === 'completed').map(fmt).join(', ') || 'none'}`);
  lines.push(`In progress now: ${ctx.inProgress.join(', ') || 'none'}`);
  const failed = ctx.transcript.filter((r) => r.status === 'not-counted').map(fmt);
  if (failed.length) lines.push(`Attempts that do not count (W, F, I, and similar): ${failed.join(', ')}`);
  for (const g of audit.groups) {
    lines.push(`- ${g.name}: ${g.status}, ${g.done + g.inProgress + g.planned}/${g.credits} credits${g.courses.length ? ` [${g.courses.map((c) => c.code).join(', ')}]` : ''}${g.remaining.length ? `. Still needed: ${g.remaining.join('; ')}` : ''}`);
  }
  const done = new Set([...ctx.completed, ...ctx.inProgress, ...planned]);
  const plan = planSemesters(audit, program, index, { done, grades: ctx.grades, maxCredits: ctx.maxCredits });
  if (plan.terms.some((term) => term.items.length)) {
    lines.push(`Draft plan the app built (max ${ctx.maxCredits} credits per term, using prerequisites and the tentative forecast; electives are suggestions):`);
    for (const term of plan.terms) {
      if (!term.items.length) continue;
      lines.push(`  ${term.label} (${term.credits} cr): ${term.items.map((i) => (i.code ? `${i.code}${i.kind === 'elective' ? ' [suggested CS elective]' : i.kind === 'choice' ? ` [${i.groupName}]` : ''}` : `[${i.label}]`)).join(', ')}`);
    }
    if (plan.later.length) lines.push(`  Not placed: ${plan.later.map((i) => `${i.code || i.label} (${i.reason})`).join('; ')}`);
  }
  for (const n of program.notes || []) lines.push(`Note: ${n}`);
  return lines;
}

export function studentContextBlock(index, message, ctx, programs = []) {
  const lines = ['STUDENT CONTEXT (from the app, this request only)'];
  lines.push(`Search box: ${ctx.query ? JSON.stringify(ctx.query) : '(empty)'}`);
  lines.push(`Completed courses (entered by the student): ${(ctx.manualCompleted || ctx.completed).length ? (ctx.manualCompleted || ctx.completed).join(', ') : 'not entered'}`);

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

  lines.push(...degreeBlock(index, ctx, programs, sched));

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
      if (course.futureTerms) lines.push(`  Forecast (tentative): ${course.futureTerms.length ? course.futureTerms.join(', ') : 'not planned in the forecast terms'}`);
      if (el.status === 'unknown-history') lines.push('  Eligibility: unknown (no completed courses entered).');
      else if (el.status === 'met') lines.push(`  Eligibility: prerequisites met${ctx.inProgress?.length ? ' (counting courses in progress as finished)' : ''}${others.length ? ' (counting saved courses for concurrent rules)' : ''}.${ctx.grades?.size ? ' Minimum grades checked against transcript grades.' : ' Minimum grades not checked.'}`);
      else if (el.status === 'unknown') lines.push(`  Eligibility: needs a rule the app cannot check: ${el.missing.join('; ')}`);
      else lines.push(`  Eligibility: NOT met. Still missing: ${el.missing.join('; ')}`);
    }
  }
  return lines.join('\n');
}
