// advisor. — main app: loads data, runs search, and wires the three tabs.

import { buildIndex, creditNumber } from './core/catalog.js';
import { search, highlightPieces } from './core/search.js';
import { normalizeCode, treeToText, evaluate, missingParts } from './core/prereq.js';
import { esc, $, $$, store, linkCodes, debounce } from './ui/util.js';
import { renderSchedule, wireSchedule } from './ui/schedule-view.js';
import { renderGraph, renderDetail, wireGraphHover } from './ui/graph-view.js';
import { createChat } from './ui/chat.js';

// ---------- state ----------
const DEFAULT_OPTIONS = {
  searchDescriptions: true,
  searchSections: true,
  detail: 3,
  showDependents: true,
  showBridge: false,
  showExternal: false,
  showLinks: true,
  collapseSections: true,
};
const DEFAULT_FILTERS = { subjects: [], levels: [], days: [], offered: false, open: false, eligible: false };

const state = {
  index: null,
  query: '',
  results: [],
  focus: [],
  keywords: [],
  shown: 25,
  expanded: new Set(), // course codes whose sections are fully shown
  compactOpen: new Set(), // course codes opened from a compact result
  options: { ...DEFAULT_OPTIONS, ...store.get('options', {}) },
  filters: { ...DEFAULT_FILTERS, ...store.get('filters', {}) },
  saved: store.get('saved', []),
  completed: store.get('completed', []),
  tab: store.get('tab', 'schedule'),
  graphSelected: null,
};

const els = {
  search: $('#search'),
  results: $('#results'),
  defaults: $('#default-content'),
  examples: $('#examples'),
  dataNote: $('#data-note'),
  optionsBtn: $('#options-btn'),
  filtersBtn: $('#filters-btn'),
  optionsPanel: $('#options-panel'),
  filtersPanel: $('#filters-panel'),
  filtersCount: $('#filters-count'),
  completedChips: $('#completed-chips'),
  completedInput: $('#completed-input'),
  schedule: {
    list: $('#saved-list'),
    summary: $('#saved-summary'),
    grid: $('#schedule-grid'),
    unscheduled: $('#unscheduled'),
    foot: null,
  },
  graph: { focus: $('#graph-focus'), scroll: $('#graph-scroll'), detail: $('#graph-detail') },
};

// ---------- theme ----------
function effectiveTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function updateThemeButton() {
  const btn = $('#theme-toggle');
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  btn.setAttribute('aria-label', `Switch to ${next} mode`);
  btn.title = `Switch to ${next} mode`;
}
$('#theme-toggle').addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  store.set('theme', next);
  updateThemeButton();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', updateThemeButton);
updateThemeButton();

// ---------- helpers ----------
const known = (code) => !!state.index?.has(code);
const completedSet = () => new Set(state.completed);
const plannedCourses = () => new Set(state.saved.map((crn) => state.index.crnMap.get(crn)?.course).filter(Boolean));

function hl(text) {
  return highlightPieces(text, state.keywords).map((p) => (p.match ? `<mark>${esc(p.text)}</mark>` : esc(p.text))).join('');
}

function eligibilityBadge(course) {
  const done = completedSet();
  if (done.has(course.code)) return '<span class="badge ok">✓ Completed</span>';
  if (!done.size) return '';
  const planned = plannedCourses();
  planned.delete(course.code);
  const st = evaluate(course.prereq, { completed: done, current: planned });
  if (st === 'met') return '<span class="badge ok">You can take this</span>';
  const missing = missingParts(course.prereq, { completed: done, current: planned }).join('; ');
  if (st === 'unknown') return `<span class="badge warn">Needs: ${esc(missing)}</span>`;
  return `<span class="badge no">Missing: ${esc(missing)}</span>`;
}

// The subject page of the official catalog (for example catalog.iit.edu/courses/cs/).
function catalogUrl(code) {
  return `https://catalog.iit.edu/courses/${encodeURIComponent(code.split(' ')[0].toLowerCase())}/`;
}

// ---------- filters ----------
function courseMatchesFilters(course) {
  const f = state.filters;
  if (f.subjects.length && !f.subjects.includes(course.subject)) return false;
  if (f.levels.length && !f.levels.includes(course.level)) return false;
  if (f.offered && !course.sections.length) return false;
  if (f.open && !course.sections.some((s) => s.available == null || s.available > 0)) return false;
  if (f.days.length) {
    const ok = course.sections.some((s) => s.meetings.some((m) => m.days && m.days !== 'TBA')
      && s.meetings.every((m) => !m.days || m.days === 'TBA' || [...m.days].every((d) => f.days.includes(d))));
    if (!ok) return false;
  }
  if (f.eligible) {
    const done = completedSet();
    if (done.has(course.code)) return false;
    const planned = plannedCourses();
    planned.delete(course.code);
    if (evaluate(course.prereq, { completed: done, current: planned }) !== 'met') return false;
  }
  return true;
}
function activeFilterCount() {
  const f = state.filters;
  return (f.subjects.length ? 1 : 0) + (f.levels.length ? 1 : 0) + (f.days.length ? 1 : 0) + (f.offered ? 1 : 0) + (f.open ? 1 : 0) + (f.eligible ? 1 : 0);
}

// ---------- search + results ----------
function runSearch() {
  const q = state.query;
  if (!q.trim()) {
    state.results = [];
    state.focus = [];
    state.keywords = [];
  } else {
    const r = search(state.index, q, {
      searchDescriptions: state.options.searchDescriptions,
      searchSections: state.options.searchSections,
      filter: courseMatchesFilters,
    });
    state.results = r.results;
    state.focus = r.focus;
    state.keywords = r.keywords;
  }
  state.shown = 25;
  state.expanded.clear();
  state.compactOpen.clear();
  renderResults();
  renderGraphTab();
}

function sectionRow(s) {
  const added = state.saved.includes(s.crn);
  const meetings = s.meetings.map((m) => {
    const when = [m.days && m.days !== 'TBA' ? m.days : '', m.time && m.time !== 'TBA' ? m.time : ''].filter(Boolean).join(' ') || 'Time TBA';
    const who = m.instructors.length ? ` · ${m.instructors.join(', ')}` : '';
    return `${hl(when)} · ${hl(m.where || 'TBA')}${hl(who)}`;
  }).join('<br>');
  const seats = s.available == null ? '' : `<span class="seats${s.available <= 0 ? ' full' : ''}">${s.available <= 0 ? 'Full' : `${s.available} open`}</span> · `;
  return `<div class="section-row">
      <div class="section-main">
        <div class="section-top">${hl(s.scheduleType || 'Section')}${s.bucket && s.bucket !== 'Class' ? ` (${hl(s.bucket)})` : ''} <span class="muted small">· CRN ${hl(s.crn)}</span></div>
        <div class="section-sub">${seats}${meetings}</div>
      </div>
      <button type="button" class="add-btn${added ? ' added' : ''}" data-add="${esc(s.crn)}" aria-pressed="${added}">${added ? '✓ Added' : 'Add'}</button>
    </div>`;
}

function courseCard(course) {
  const detail = state.compactOpen.has(course.code) ? 3 : Number(state.options.detail);
  const head = `<div class="course-head">
      <span class="course-code">${hl(course.code)}</span>
      <span class="course-title">${hl(course.title)}</span>
      ${detail > 1 ? `<span class="course-credits">${esc(course.credits || '?')} credit${course.credits === '1' ? '' : 's'}</span>` : ''}
    </div>`;
  if (detail === 1) {
    return `<article class="course compact" data-expand="${esc(course.code)}" tabindex="0" title="Click to expand ${esc(course.code)}">${head}</article>`;
  }
  const badges = [eligibilityBadge(course), course.satisfies ? `<span class="badge">${hl(course.satisfies)}</span>` : '', course.bridge ? '<span class="badge">Graduate bridge course</span>' : '']
    .filter(Boolean).join('');
  let html = `<article class="course${detail === 2 ? ' compact' : ''}" ${detail === 2 ? `data-expand="${esc(course.code)}" tabindex="0"` : ''}>${head}`;
  if (badges) html += `<div class="badges">${badges}</div>`;
  html += `<p class="desc">${state.options.searchDescriptions ? hl(course.description) : esc(course.description)}</p>`;
  if (detail === 2) return `${html}</article>`;

  html += `<p class="meta-line"><b>Prerequisites:</b> ${course.prereqText ? linkCodes(course.prereqText, known) : 'None'}</p>`;
  if (course.note) html += `<p class="meta-line">${esc(course.note)}</p>`;
  if (course.dependents.length) {
    html += `<p class="meta-line"><b>Unlocks:</b> ${course.dependents.map((d, i, a) => `<span class="nw"><button type="button" class="code-link" data-code="${esc(d.code)}">${esc(d.code)}</button>${i < a.length - 1 ? ',' : ''}</span>`).join(' ')}</p>`;
  }

  if (course.sections.length) {
    const many = state.options.collapseSections && course.sections.length >= 5 && !state.expanded.has(course.code);
    const list = many ? course.sections.slice(0, 3) : course.sections;
    html += `<div class="sections" aria-label="${esc(state.index.semester)} sections">${list.map(sectionRow).join('')}</div>`;
    if (many) html += `<button type="button" class="toggle-sections" data-more="${esc(course.code)}">Show all ${course.sections.length} sections</button>`;
  } else {
    html += `<p class="meta-line">No ${esc(state.index.semester)} sections in this data.</p>`;
  }

  const done = completedSet().has(course.code);
  html += `<div class="course-actions">
      <button type="button" class="btn" data-graph="${esc(course.code)}">Show graph</button>
      <button type="button" class="btn" data-ask="${esc(course.code)}">Ask advisor</button>
      <button type="button" class="btn${done ? ' on' : ''}" data-complete="${esc(course.code)}" aria-pressed="${done}">${done ? '✓ Completed' : 'Mark completed'}</button>
      ${state.options.showLinks && !course.stub ? `<a class="btn" href="${catalogUrl(course.code)}" target="_blank" rel="noopener noreferrer" title="Open the ${esc(course.subject)} page of the IIT catalog">Catalog ↗</a>` : ''}
    </div>`;
  return `${html}</article>`;
}

function renderResults() {
  const q = state.query.trim();
  els.defaults.hidden = !!q;
  els.results.hidden = !q;
  if (!q) { els.results.innerHTML = ''; return; }
  const total = state.results.length;
  const filters = activeFilterCount();
  if (!total) {
    els.results.innerHTML = `<div class="results-head"><span>No results</span></div>
      <p class="empty">Nothing matched “${esc(q)}”${filters ? ` with ${filters} filter${filters === 1 ? '' : 's'} on. <button type="button" class="link-btn" data-reset-filters>Clear filters</button>` : '.'}
      Try a course code like <button type="button" class="code-link" data-code="CS 331">CS 331</button> or a word like “graphics”.</p>`;
    return;
  }
  const shown = state.results.slice(0, state.shown);
  els.results.innerHTML = `<div class="results-head">
      <span>${total} result${total === 1 ? '' : 's'}${filters ? ` · ${filters} filter${filters === 1 ? '' : 's'} on` : ''}</span>
      <button type="button" data-clear>Clear search</button>
    </div>
    ${shown.map((r) => courseCard(r.course)).join('')}
    ${total > state.shown ? `<button type="button" class="btn more-btn" data-show-more>Show ${Math.min(25, total - state.shown)} more</button>` : ''}`;
}

function setQuery(text, { focusInput = true } = {}) {
  state.query = text;
  els.search.value = text;
  updateHash();
  runSearch();
  if (focusInput) els.search.focus();
  window.scrollTo({ top: 0 });
}

const updateHash = debounce(() => {
  const url = state.query.trim() ? `#q=${encodeURIComponent(state.query.trim())}` : location.pathname + location.search;
  history.replaceState(null, '', url);
}, 300);

// ---------- saved + completed ----------
function toggleSaved(crn) {
  const i = state.saved.indexOf(crn);
  if (i >= 0) state.saved.splice(i, 1);
  else state.saved.push(crn);
  store.set('saved', state.saved);
  renderAfterChange();
}
function toggleCompleted(code) {
  const c = normalizeCode(code);
  if (!c) return;
  const i = state.completed.indexOf(c);
  if (i >= 0) state.completed.splice(i, 1);
  else state.completed.push(c);
  state.completed.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  store.set('completed', state.completed);
  renderCompletedChips();
  if (state.filters.eligible) runSearch(); else { renderResults(); renderGraphTab(); }
}
function renderAfterChange() {
  if (state.filters.eligible) runSearch(); else renderResults();
  renderScheduleTab();
  renderGraphTab();
}

function renderCompletedChips() {
  els.completedChips.innerHTML = state.completed.map((c) => `<span class="chip${known(c) ? '' : ' unknown'}">${esc(c)}<button type="button" data-uncomplete="${esc(c)}" aria-label="Remove ${esc(c)}">×</button></span>`).join('');
}

// ---------- tabs ----------
let scheduleLayout = null;
function setTab(tab) {
  if (!['schedule', 'chat', 'graph'].includes(tab)) tab = 'schedule';
  state.tab = tab;
  store.set('tab', tab);
  for (const t of $$('.tab')) {
    const on = t.dataset.tab === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  }
  $('#view-schedule').hidden = tab !== 'schedule';
  $('#view-chat').hidden = tab !== 'chat';
  $('#view-graph').hidden = tab !== 'graph';
  $('#chat-fab').classList.toggle('hide', tab === 'chat');
  if (tab === 'schedule') scheduleLayout?.place();
  if (tab === 'graph') renderGraphTab();
}

function renderScheduleTab() {
  scheduleLayout = renderSchedule({ index: state.index, savedCrns: state.saved, els: els.schedule });
}

function graphFocus() {
  if (state.focus.length) return state.focus.slice(0, 6);
  if (state.query.trim() && state.results.length) return state.results.slice(0, 3).map((r) => r.course.code);
  return [...plannedCourses()].slice(0, 6);
}
function renderGraphTab() {
  if (state.tab !== 'graph') return;
  renderGraph({
    index: state.index,
    focus: graphFocus(),
    options: state.options,
    completed: completedSet(),
    planned: plannedCourses(),
    els: els.graph,
    selected: state.graphSelected,
  });
}

// ---------- events ----------
function wire() {
  // search box (instant, like pop.ai)
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    updateHash();
    runSearch();
  });
  els.search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setQuery('');
  });
  $('#logo-link').addEventListener('click', (e) => { e.preventDefault(); setQuery(''); });

  // options / filters panels
  const togglePanel = (btn, panel, other, otherBtn) => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) { other.hidden = true; otherBtn.setAttribute('aria-expanded', 'false'); }
  };
  els.optionsBtn.addEventListener('click', () => togglePanel(els.optionsBtn, els.optionsPanel, els.filtersPanel, els.filtersBtn));
  els.filtersBtn.addEventListener('click', () => togglePanel(els.filtersBtn, els.filtersPanel, els.optionsPanel, els.optionsBtn));

  for (const input of $$('[data-opt]', els.optionsPanel)) {
    const key = input.dataset.opt;
    if (input.type === 'radio') input.checked = Number(input.value) === Number(state.options[key]);
    else input.checked = !!state.options[key];
    input.addEventListener('change', () => {
      state.options[key] = input.type === 'radio' ? Number(input.value) : input.checked;
      store.set('options', state.options);
      if (key === 'searchDescriptions' || key === 'searchSections') runSearch();
      else { renderResults(); renderGraphTab(); }
    });
  }

  // filter chips
  const subjects = [...new Set(state.index.list.map((c) => c.subject))];
  const levels = [...new Set(state.index.list.map((c) => c.level))].sort();
  const seg = (el, values, key, label) => {
    el.innerHTML = values.map((v) => `<button type="button" data-val="${esc(v)}" aria-pressed="${state.filters[key].includes(v)}">${esc(label(v))}</button>`).join('');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const v = typeof values[0] === 'number' ? Number(b.dataset.val) : b.dataset.val;
      const list = state.filters[key];
      const i = list.indexOf(v);
      if (i >= 0) list.splice(i, 1); else list.push(v);
      b.setAttribute('aria-pressed', String(i < 0));
      filtersChanged();
    });
  };
  seg($('#f-subject'), subjects, 'subjects', (s) => s);
  seg($('#f-level'), levels, 'levels', (l) => `${l}s`);
  seg($('#f-days'), ['M', 'T', 'W', 'R', 'F'], 'days', (d) => d);
  for (const [id, key] of [['f-offered', 'offered'], ['f-open', 'open'], ['f-eligible', 'eligible']]) {
    const box = $(`#${id}`);
    box.checked = !!state.filters[key];
    box.addEventListener('change', () => { state.filters[key] = box.checked; filtersChanged(); });
  }
  $('#f-reset').addEventListener('click', resetFilters);

  // completed courses input
  const addCompleted = () => {
    const parts = els.completedInput.value.split(/[,;]+/).map(normalizeCode).filter(Boolean);
    for (const c of parts) if (!state.completed.includes(c)) state.completed.push(c);
    state.completed.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    store.set('completed', state.completed);
    els.completedInput.value = '';
    renderCompletedChips();
    if (state.filters.eligible) runSearch(); else { renderResults(); renderGraphTab(); }
  };
  els.completedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCompleted(); }
    if (e.key === 'Backspace' && !els.completedInput.value && state.completed.length) toggleCompleted(state.completed[state.completed.length - 1]);
  });
  els.completedInput.addEventListener('blur', () => { if (els.completedInput.value.trim()) addCompleted(); });
  els.completedChips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-uncomplete]');
    if (b) toggleCompleted(b.dataset.uncomplete);
  });

  // one click handler for result cards, graph detail, and the empty states
  document.addEventListener('click', (e) => {
    const t = e.target;
    const by = (attr) => t.closest(`[${attr}]`);
    let el;
    if ((el = by('data-add'))) return toggleSaved(el.dataset.add);
    if ((el = by('data-complete'))) return toggleCompleted(el.dataset.complete);
    if ((el = by('data-graph'))) { state.graphSelected = el.dataset.graph; if (!state.focus.includes(el.dataset.graph)) setQuery(el.dataset.graph, { focusInput: false }); setTab('graph'); return; }
    if ((el = by('data-ask'))) { setTab('chat'); chat.ask(`Tell me about ${el.dataset.ask}. What do I need before I can take it, and what does it lead to?`); return; }
    if ((el = by('data-search'))) return setQuery(el.dataset.search);
    if ((el = by('data-more'))) { state.expanded.add(el.dataset.more); return renderResults(); }
    if ((el = by('data-show-more'))) { state.shown += 25; return renderResults(); }
    if ((el = by('data-clear'))) return setQuery('');
    if ((el = by('data-reset-filters'))) return resetFilters();
    if (t.closest('#chat-log')) return; // chat handles its own code links
    if ((el = t.closest('.code-link'))) return setQuery(el.dataset.code);
    if ((el = by('data-expand')) && !t.closest('button, a')) {
      state.compactOpen.add(el.dataset.expand);
      return renderResults();
    }
    return undefined;
  });
  els.results.addEventListener('keydown', (e) => {
    const el = e.target.closest('[data-expand]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); state.compactOpen.add(el.dataset.expand); renderResults(); }
  });

  // tabs (click + arrow keys)
  const tabs = $$('.tab');
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setTab(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      setTab(next.dataset.tab);
      next.focus();
    });
  });

  $('#chat-fab').addEventListener('click', () => {
    setTab('chat');
    $('#right').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#chat-input').focus({ preventScroll: true });
  });

  // graph: click a node to see its details
  els.graph.scroll.addEventListener('click', (e) => {
    const node = e.target.closest('.gnode');
    if (!node) return;
    state.graphSelected = node.dataset.code;
    for (const g of $$('.gnode', els.graph.scroll)) g.classList.toggle('selected', g.dataset.code === state.graphSelected);
    renderDetail({ index: state.index, code: state.graphSelected, completed: completedSet(), planned: plannedCourses(), els: els.graph });
  });
  els.graph.scroll.addEventListener('keydown', (e) => {
    const node = e.target.closest('.gnode');
    if (node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  wireGraphHover(els.graph.scroll);

  wireSchedule(els.schedule, {
    onRemove: (crn) => toggleSaved(crn),
    onOpenCourse: (code) => setQuery(code),
  });

  // keep schedule blocks aligned when the layout changes size
  // and re-fit the graph when its panel width changes
  const refitGraph = debounce(renderGraphTab, 150);
  let graphWidth = 0;
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => scheduleLayout?.place()).observe(els.schedule.grid);
    new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w && Math.abs(w - graphWidth) > 30) { graphWidth = w; refitGraph(); }
    }).observe(els.graph.scroll);
  } else {
    window.addEventListener('resize', () => { scheduleLayout?.place(); refitGraph(); });
  }

  window.addEventListener('hashchange', () => {
    const q = readHash();
    if (q !== state.query.trim()) setQuery(q, { focusInput: false });
  });
}

function filtersChanged() {
  store.set('filters', state.filters);
  const n = activeFilterCount();
  els.filtersCount.hidden = !n;
  els.filtersCount.textContent = n;
  runSearch();
}
function resetFilters() {
  state.filters = { ...DEFAULT_FILTERS, subjects: [], levels: [], days: [] };
  for (const b of $$('.seg button', els.filtersPanel)) b.setAttribute('aria-pressed', 'false');
  for (const id of ['f-offered', 'f-open', 'f-eligible']) $(`#${id}`).checked = false;
  filtersChanged();
}

function readHash() {
  const m = /[#&]q=([^&]*)/.exec(location.hash);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch { return ''; }
}

function renderExamples() {
  const idx = state.index;
  const firstSection = idx.list.flatMap((c) => c.sections)[0];
  const crn = idx.crnMap.has('10161') ? '10161' : firstSection?.crn || '10161';
  const room = firstSection?.meetings[0]?.where?.split(' ')[0]?.toLowerCase() || 'stuart';
  const prof = firstSection?.meetings[0]?.instructors[0]?.split(' ').pop()?.toLowerCase() || 'staff';
  const examples = [
    ['CRNs', crn],
    ['Places', room === 'internet' ? 'stuart' : room],
    ['Professors', prof],
    ['Semesters', idx.semester.toLowerCase()],
    ['Departments', 'math'],
    ['Course titles', 'computer graphics'],
    ['Days of the week', 'mwf'],
    ['Course descriptions', 'compiler'],
    ['Course abbreviations', 'cs 440'],
    ['Combinations of the above', 'cs 331, math 251, math 474'],
  ];
  els.examples.innerHTML = examples.map(([label, ex], i) => `<li><button type="button" data-search="${esc(ex)}">
      <span class="ex-num">${String(i + 1).padStart(2, '0')}</span>
      <span><span class="ex-label">${esc(label)}</span> <span class="ex-sample">- e.g. ${esc(ex)}</span></span>
    </button></li>`).join('');
}

// ---------- chat ----------
let chat;

// ---------- start ----------
async function start() {
  let catalog;
  let sections;
  try {
    [catalog, sections] = await Promise.all([
      fetch('/data/catalog.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('/data/sections.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ]);
  } catch {
    $('#content').innerHTML = '<p class="data-note">Could not load the course data. Start the app with <code>npm start</code> and open the address it prints.</p>';
    return;
  }
  state.index = buildIndex(catalog, sections);
  const idx = state.index;

  // drop saved CRNs that no longer exist (for example after importing new data)
  state.saved = state.saved.filter((crn) => idx.crnMap.has(String(crn))).map(String);
  store.set('saved', state.saved);

  $('#intro-semester').textContent = idx.semester;
  $('#schedule-title').textContent = `${idx.semester} Schedule`;
  if (idx.sample) {
    els.dataNote.hidden = false;
    els.dataNote.textContent = `Course and prerequisite data come from the Illinois Tech catalog. The ${idx.semester} sections (CRNs, times, rooms, instructors, seats) are sample data for this demo.`;
  }
  const foot = document.createElement('p');
  foot.className = 'saved-foot';
  foot.textContent = 'Sample sections — confirm times and seats in the Course Status Report before you register.';
  $('.saved-card').appendChild(foot);
  els.schedule.foot = foot;

  renderExamples();
  renderCompletedChips();
  const n = activeFilterCount();
  els.filtersCount.hidden = !n;
  els.filtersCount.textContent = n;

  chat = createChat({
    els: {
      log: $('#chat-log'), form: $('#chat-form'), input: $('#chat-input'), send: $('#chat-send'),
      clear: $('#chat-clear'), mode: $('#mode-badge'),
    },
    known,
    getContext: () => ({
      query: state.query,
      savedCrns: state.saved,
      completed: state.completed,
      focus: state.focus.length ? state.focus : state.results.slice(0, 3).map((r) => r.course.code),
    }),
    onCodeClick: (code) => setQuery(code),
  });

  wire();
  renderScheduleTab();
  setTab(state.tab);

  const q = readHash();
  if (q) setQuery(q, { focusInput: false });
  else els.search.focus({ preventScroll: true });
}

start();

// for debugging in the console
window.advisor = { state, creditNumber, treeToText };
