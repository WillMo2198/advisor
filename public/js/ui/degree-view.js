// Degree tab: transcript upload, degree audit, and semester plan.

import { parseTranscriptText, linesFromPdfItems, gradeStatus, cleanRecords, bestAttempts, REPEATABLE } from '../core/transcript.js';
import { auditDegree } from '../core/audit.js';
import { planSemesters } from '../core/planner.js';
import { normalizeCode } from '../core/prereq.js';
import { esc } from './util.js';

const MAX_FILE = 8 * 1024 * 1024;
const STATUS_TEXT = { done: 'Done', 'in-progress': 'In progress', planned: 'Planned', remaining: 'Needed' };

// ---------- reading files ----------

let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('/vendor/pdfjs/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfjsPromise;
}

async function pdfToText(file) {
  const lib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(linesFromPdfItems(content.items));
  }
  await doc.destroy();
  return pages.join('\n');
}

const kindOf = (file) => {
  const name = (file.name || '').toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/^image\/(png|jpeg|gif|webp)$/.test(file.type) || /\.(png|jpe?g|gif|webp)$/.test(name)) return 'image';
  if (/\.(html?|txt|text|csv)$/.test(name) || /^text\//.test(file.type)) return 'text';
  return 'unknown';
};

function fileToBase64(file) {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => fail(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

function imageMediaType(file) {
  if (file.type) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/png';
}

// ---------- rendering ----------

function pill(status) {
  return `<span class="req-pill ${status}">${STATUS_TEXT[status] || status}</span>`;
}

function courseChip(c, known) {
  const cls = c.status === 'completed' ? 'done' : c.status === 'in-progress' ? 'ip' : 'pl';
  const label = `${c.code}${c.grade ? ` · ${c.grade}` : c.status === 'in-progress' ? ' · now' : c.status === 'planned' ? ' · saved' : ''}`;
  const tip = `${c.code}${c.title ? `: ${c.title}` : ''} — ${c.status === 'completed' ? 'completed' : c.status === 'in-progress' ? 'in progress' : 'planned (saved section)'}`;
  return known(c.code)
    ? `<button type="button" class="req-chip ${cls}" data-code="${esc(c.code)}" title="${esc(tip)}">${esc(label)}</button>`
    : `<span class="req-chip ${cls}" title="${esc(tip)}">${esc(label)}</span>`;
}

function linkify(text, known) {
  return esc(text).replace(/\b([A-Z]{2,4}) (\d{3})\b/g, (m) => (known(m) ? `<button type="button" class="code-link" data-code="${m}">${m}</button>` : m));
}

function planItem(it, known, note = '') {
  const tags = {
    required: '<span class="tag req">Required</span>',
    choice: `<span class="tag">${esc(it.groupName)}</span>`,
    elective: '<span class="tag">Suggested CS elective</span>',
    placeholder: `<span class="tag ph">${esc(it.groupName)}</span>`,
  };
  const name = it.code
    ? `${known(it.code) ? `<button type="button" class="code-link" data-code="${esc(it.code)}">${esc(it.code)}</button>` : `<strong>${esc(it.code)}</strong>`} <span class="plan-title">${esc(it.title || '')}</span>`
    : `<strong>${esc(it.label)}</strong>`;
  const sub = it.kind === 'choice' && it.alternatives?.length ? `<div class="plan-sub">${esc(it.why ? `${it.why}. ` : '')}Other choices: ${esc(it.alternatives.join(', '))}</div>`
    : it.kind === 'placeholder' && it.hint ? `<div class="plan-sub">${esc(it.hint)}</div>`
      : it.kind === 'elective' ? '<div class="plan-sub">Swap for any CS 300+ course you like.</div>' : '';
  const extra = note ? `<div class="plan-sub warn">${esc(note)}</div>` : '';
  return `<li class="plan-item ${it.kind}"><div class="plan-main">${name}${sub}${extra}</div><div class="plan-side">${tags[it.kind] || ''}<span class="plan-cr">${esc(it.credits)} cr</span></div></li>`;
}

/**
 * Render the whole Degree tab body.
 * ctx: { index, programs, transcript, savedCourses, known, health }
 * Returns { audit, plan } (or null when there is no transcript).
 */
export function renderDegree(el, ctx) {
  const { index, programs, transcript, known } = ctx;
  const tableWasOpen = !!el.querySelector('details.t-card[open]');
  const program = programs.find((p) => p.id === transcript?.programId) || programs[0];
  if (!transcript?.courses?.length || !program) {
    el.innerHTML = '';
    return null;
  }
  const best = bestAttempts(transcript.courses);
  const completed = new Set(best.filter((r) => r.status === 'completed').map((r) => r.code));
  const inProgress = new Set(best.filter((r) => r.status === 'in-progress').map((r) => r.code));
  const grades = new Map(best.filter((r) => r.grade).map((r) => [r.code, r.grade]));
  const planned = [...ctx.savedCourses].filter((c) => !completed.has(c) && !inProgress.has(c));
  const audit = auditDegree(program, transcript.courses, { index, planned });
  const maxCredits = transcript.maxCredits || 15;
  const plan = planSemesters(audit, program, index, {
    done: new Set([...completed, ...inProgress, ...planned]), grades, maxCredits,
  });
  const t = audit.totals;
  const pct = (n) => `${Math.max(0, Math.min(100, (n / t.required) * 100)).toFixed(1)}%`;

  // ----- summary -----
  let html = `<div class="card degree-summary">
      <div class="card-head">
        <h2 class="card-title">${esc(program.name)}</h2>
        <label class="small muted">Program
          <select id="program-select">${programs.map((p) => `<option value="${esc(p.id)}"${p.id === program.id ? ' selected' : ''}>${esc(p.name)} (${esc(p.catalogYear)})</option>`).join('')}</select>
        </label>
      </div>
      <div class="big-stats">
        <div><span class="big">${t.done}</span><span class="muted small">credits done</span></div>
        <div><span class="big">${t.inProgress + t.planned}</span><span class="muted small">in progress${t.planned ? ' / saved' : ''}</span></div>
        <div><span class="big">${t.remaining}</span><span class="muted small">still needed</span></div>
        <div><span class="big">${t.required}</span><span class="muted small">to graduate</span></div>
      </div>
      <div class="progress" role="img" aria-label="${t.done} credits done, ${t.inProgress} in progress, ${t.planned} planned, out of ${t.required}">
        <span class="p-done" style="width:${pct(t.done)}"></span><span class="p-ip" style="width:${pct(t.inProgress)}"></span><span class="p-pl" style="width:${pct(t.planned)}"></span>
      </div>
      <p class="small muted">From ${esc(transcript.source || 'your transcript')} · ${best.length} course${best.length === 1 ? '' : 's'} read${t.earned > t.done ? ` · ${t.earned} credits earned in all` : ''}</p>
    </div>`;

  // ----- requirements -----
  html += `<div class="card"><div class="card-head"><h2 class="card-title">Requirements</h2><span class="small muted">${audit.groups.filter((g) => g.status === 'done').length} of ${audit.groups.length} done</span></div><ul class="req-list">`;
  for (const g of audit.groups) {
    const have = g.done + g.inProgress + g.planned;
    html += `<li class="req">
        <div class="req-head"><span class="req-name">${esc(g.name)}</span>${pill(g.status)}<span class="req-cr">${Math.min(have, g.credits)}/${g.credits} cr</span></div>
        <div class="req-bar"><span class="p-done" style="width:${Math.min(100, (g.done / g.credits) * 100)}%"></span><span class="p-ip" style="width:${Math.min(100, (g.inProgress / g.credits) * 100)}%"></span><span class="p-pl" style="width:${Math.min(100, (g.planned / g.credits) * 100)}%"></span></div>
        ${g.courses.length ? `<div class="req-chips">${g.courses.map((c) => courseChip(c, known)).join('')}</div>` : ''}
        ${g.remaining.length ? `<ul class="req-left">${g.remaining.map((r) => `<li>${linkify(r, known)}</li>`).join('')}</ul>` : ''}
        ${g.note && g.status !== 'done' ? `<p class="req-note">${esc(g.note)}</p>` : ''}
      </li>`;
  }
  html += '</ul>';
  if (audit.extra.length) {
    html += `<p class="small muted">Extra credit beyond the degree: ${audit.extra.map((e) => esc(e.code)).join(', ')}</p>`;
  }
  html += '</div>';

  // ----- plan -----
  const termsWithItems = plan.terms.filter((term) => term.items.length);
  html += `<div class="card plan-card">
      <div class="card-head">
        <h2 class="card-title">Semester plan</h2>
        <label class="small muted">Max credits per term
          <select id="max-credits">${[12, 13, 15, 16, 18].map((n) => `<option value="${n}"${n === maxCredits ? ' selected' : ''}>${n}</option>`).join('')}</select>
        </label>
      </div>`;
  if (!termsWithItems.length && !plan.later.length) {
    html += '<p class="plan-done">Everything is done or in progress. 🎓 Check with your advisor about applying to graduate.</p>';
  } else {
    html += `<p class="small muted">Built from your remaining requirements, prerequisites, and the CS department’s <strong>tentative</strong> schedule of future courses. Required courses come first; electives and Core Curriculum slots are flexible.</p>`;
    plan.terms.forEach((term, i) => {
      if (!term.items.length) return;
      html += `<section class="plan-term">
          <h3>${i === plan.terms.findIndex((x) => x.items.length) ? '<span class="next-badge">Next</span>' : ''}${esc(term.label)} <span class="muted small">· ${term.credits} credits</span></h3>
          <ul>${term.items.map((it) => planItem(it, known)).join('')}</ul>
        </section>`;
    });
    if (plan.later.length) {
      html += `<section class="plan-term later"><h3>Not placed yet</h3><ul>${plan.later.map((it) => planItem(it, known, it.reason)).join('')}</ul></section>`;
    }
    const last = [...plan.terms].reverse().find((term) => term.items.length);
    if (last && !plan.later.length) html += `<p class="plan-done">On this plan you finish in <strong>${esc(last.label)}</strong>.</p>`;
    html += '<div class="course-actions"><button type="button" class="btn" data-ask-plan>Ask the advisor about this plan</button></div>';
  }
  html += '</div>';

  // ----- transcript courses (editable) -----
  const rows = transcript.courses.map((r, i) => `<tr class="${r.status === 'not-counted' || r.repeatExcluded ? 'muted-row' : ''}">
      <td><strong>${esc(r.code)}</strong></td>
      <td class="t-title">${esc(r.title)}</td>
      <td>${esc(r.term)}</td>
      <td><input class="t-in" type="number" min="0" max="12" step="0.5" value="${r.credits ?? ''}" data-edit="credits" data-i="${i}" aria-label="Credits for ${esc(r.code)}"></td>
      <td><input class="t-in g" type="text" maxlength="3" value="${esc(r.grade)}" data-edit="grade" data-i="${i}" aria-label="Grade for ${esc(r.code)}" placeholder="—"></td>
      <td class="t-status">${r.repeatExcluded ? 'Repeat (excluded)' : r.status === 'completed' ? (r.transfer ? 'Transfer' : 'Done') : r.status === 'in-progress' ? 'In progress' : 'Not counted'}</td>
      <td><button type="button" class="saved-remove" data-del="${i}" aria-label="Remove ${esc(r.code)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></td>
    </tr>`).join('');
  html += `<details class="card t-card"${tableWasOpen ? ' open' : ''}>
      <summary><span class="card-title">Courses from your transcript (${transcript.courses.length})</span><span class="small muted">Check and fix anything read wrong</span></summary>
      ${transcript.warnings?.length ? `<ul class="t-warn">${transcript.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <div class="t-scroll"><table class="t-table">
        <thead><tr><th>Course</th><th>Title</th><th>Term</th><th>Credits</th><th>Grade</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <form class="t-add" id="t-add">
        <input name="code" placeholder="Add a course, e.g. COM 421" aria-label="Course code" required>
        <input name="credits" type="number" min="0" max="12" step="0.5" placeholder="Credits" aria-label="Credits">
        <input name="grade" maxlength="3" placeholder="Grade" aria-label="Grade (leave empty if in progress)">
        <button type="submit" class="btn">Add</button>
      </form>
      <p class="hint">Leave the grade empty for a course you are taking now. Grades like W, F, and I do not count.</p>
    </details>`;

  // ----- notes -----
  html += `<div class="card notes-card"><p class="small muted"><strong>Check with your advisor.</strong> This is a planning aid, not an official degree audit.</p><ul class="small muted">
      ${program.notes.map((n) => `<li>${esc(n)}</li>`).join('')}
      <li>Future offerings come from the CS department’s tentative schedule (${esc(index.forecast?.terms?.map((x) => x.label).join(', ') || 'none loaded')}). Non-CS courses are assumed to run every term.</li>
      <li>Requirements: <a href="${esc(program.source)}" target="_blank" rel="noopener noreferrer">${esc(program.name)} in the IIT catalog</a>.</li>
    </ul></div>`;

  el.innerHTML = html;
  return { audit, plan, program };
}

// ---------- wiring ----------

/**
 * els: { drop, file, pasteToggle, pasteBox, pasteText, pasteGo, sample, status, body, clear }
 * hooks: { getTranscript, setTranscript(t), rerender(), hasClaude(), onCode(code), askPlan(text), catalogTitles }
 */
export function wireDegree(els, hooks) {
  let lastInput = null; // { kind, file?, text? } for "Read with Claude"

  const status = (html, kind = '') => {
    els.status.className = `upload-status ${kind}`;
    els.status.innerHTML = html;
  };

  const apply = (courses, source, warnings = []) => {
    const prev = hooks.getTranscript();
    hooks.setTranscript({
      courses,
      source,
      warnings,
      programId: prev?.programId,
      maxCredits: prev?.maxCredits || 15,
    });
  };

  const claudeButton = () => (hooks.hasClaude()
    ? ' <button type="button" class="btn" data-read-claude>Read with Claude</button>'
    : ' Ask the site owner to add a Claude API key to read scanned files, or paste the text instead.');

  async function handleText(text, source) {
    const { courses, warnings } = parseTranscriptText(text, { catalogTitles: hooks.catalogTitles });
    if (courses.length >= 3) {
      apply(courses, source, warnings);
      status(`Read <strong>${courses.length}</strong> course rows from ${esc(source)}. Check the list below if anything looks wrong.${hooks.hasClaude() ? ' <button type="button" class="link-btn" data-read-claude>Read again with Claude</button>' : ''}`, 'ok');
    } else {
      status(`Only found ${courses.length} course row${courses.length === 1 ? '' : 's'} in ${esc(source)}. It may be a scanned or unusual file.${claudeButton()}`, 'warn');
    }
  }

  async function handleFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE) { status('That file is larger than 8 MB. Try the PDF from Banner, or paste the text.', 'warn'); return; }
    const kind = kindOf(file);
    lastInput = { kind, file };
    try {
      if (kind === 'pdf') {
        status('Reading the PDF…');
        const text = await pdfToText(file);
        if (!text.trim()) { status(`This PDF has no text layer (it may be a scan).${claudeButton()}`, 'warn'); return; }
        lastInput.text = text;
        await handleText(text, file.name);
      } else if (kind === 'text') {
        const text = await file.text();
        lastInput.text = text;
        await handleText(text, file.name);
      } else if (kind === 'image') {
        status(`Images need Claude to read them.${claudeButton()}`, hooks.hasClaude() ? '' : 'warn');
        if (hooks.hasClaude()) await readWithClaude();
      } else {
        status('Use a PDF, HTML, TXT, PNG, or JPG file.', 'warn');
      }
    } catch (err) {
      console.error(err);
      status(`Could not read that file (${esc(err.message || 'unknown error')}). Try pasting the text instead.`, 'warn');
    }
  }

  async function readWithClaude() {
    if (!lastInput) return;
    status('Claude is reading your transcript… this can take up to a minute.');
    try {
      let body;
      if (lastInput.file && (lastInput.kind === 'pdf' || lastInput.kind === 'image')) {
        body = { file: { mediaType: lastInput.kind === 'pdf' ? 'application/pdf' : imageMediaType(lastInput.file), data: await fileToBase64(lastInput.file) } };
      } else {
        body = { text: lastInput.text || '' };
      }
      const res = await fetch('/api/transcript', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      const courses = cleanRecords(data.courses);
      if (!courses.length) { status('Claude did not find any courses in that file.', 'warn'); return; }
      apply(courses, `${lastInput.file?.name || 'pasted text'} (read by Claude)`, data.warnings || []);
      status(`Claude read <strong>${courses.length}</strong> course rows. Check the list below.`, 'ok');
    } catch (err) {
      status(esc(err.message || 'Claude could not read the transcript.'), 'warn');
    }
  }

  // drag and drop + file picker
  els.drop.addEventListener('click', (e) => { if (!e.target.closest('button')) els.file.click(); });
  els.drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.file.click(); } });
  els.drop.addEventListener('dragover', (e) => { e.preventDefault(); els.drop.classList.add('over'); });
  els.drop.addEventListener('dragleave', () => els.drop.classList.remove('over'));
  els.drop.addEventListener('drop', (e) => { e.preventDefault(); els.drop.classList.remove('over'); handleFile(e.dataTransfer.files[0]); });
  els.file.addEventListener('change', () => { handleFile(els.file.files[0]); els.file.value = ''; });
  els.pick.addEventListener('click', () => els.file.click());
  els.pasteToggle.addEventListener('click', () => { els.pasteBox.hidden = !els.pasteBox.hidden; if (!els.pasteBox.hidden) els.pasteText.focus(); });
  els.pasteGo.addEventListener('click', () => {
    const text = els.pasteText.value;
    if (!text.trim()) return;
    lastInput = { kind: 'text', text };
    handleText(text, 'pasted text');
  });
  els.sample.addEventListener('click', async () => {
    const text = await (await fetch('/samples/sample-transcript.txt')).text();
    lastInput = { kind: 'text', text };
    await handleText(text, 'the sample transcript (made-up student)');
  });
  els.clear.addEventListener('click', () => {
    hooks.setTranscript(null);
    status('Transcript cleared from this browser.');
  });
  els.status.addEventListener('click', (e) => { if (e.target.closest('[data-read-claude]')) readWithClaude(); });

  // edits in the body
  els.body.addEventListener('change', (e) => {
    const t = hooks.getTranscript();
    if (!t) return;
    if (e.target.id === 'program-select') { hooks.setTranscript({ ...t, programId: e.target.value }); return; }
    if (e.target.id === 'max-credits') { hooks.setTranscript({ ...t, maxCredits: Number(e.target.value) }); return; }
    const input = e.target.closest('[data-edit]');
    if (!input) return;
    const i = Number(input.dataset.i);
    const rec = { ...t.courses[i] };
    if (input.dataset.edit === 'credits') rec.credits = input.value === '' ? null : Math.max(0, Math.min(12, Number(input.value)));
    if (input.dataset.edit === 'grade') {
      rec.grade = input.value.trim().toUpperCase();
      rec.status = gradeStatus(rec.grade, rec.transfer ? 'transfer' : '');
      rec.repeatExcluded = false;
    }
    const courses = t.courses.slice();
    courses[i] = rec;
    hooks.setTranscript({ ...t, courses });
  });
  els.body.addEventListener('click', (e) => {
    const t = hooks.getTranscript();
    const del = e.target.closest('[data-del]');
    if (del && t) {
      const courses = t.courses.slice();
      courses.splice(Number(del.dataset.del), 1);
      hooks.setTranscript({ ...t, courses });
      return;
    }
    if (e.target.closest('[data-ask-plan]')) { hooks.askPlan(); return; }
    const chip = e.target.closest('.req-chip[data-code]');
    if (chip) hooks.onCode(chip.dataset.code);
  });
  els.body.addEventListener('submit', (e) => {
    if (e.target.id !== 't-add') return;
    e.preventDefault();
    const t = hooks.getTranscript();
    const f = new FormData(e.target);
    const code = normalizeCode(f.get('code'));
    if (!code || !t) { e.target.code.focus(); return; }
    const grade = String(f.get('grade') || '').trim().toUpperCase();
    const credits = f.get('credits') === '' ? null : Number(f.get('credits'));
    const rec = { code, title: '', credits: Number.isFinite(credits) ? credits : null, grade, term: 'Added by you', status: gradeStatus(grade), transfer: false, repeatExcluded: false };
    if (!REPEATABLE.has(code) && t.courses.some((c) => c.code === code && c.status === rec.status && c.grade === rec.grade)) return;
    hooks.setTranscript({ ...t, courses: [...t.courses, rec] });
  });
}
