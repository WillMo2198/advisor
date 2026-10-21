import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCredits } from '../scripts/programs-extra.mjs';
import { detectProgram, headerMajors } from '../public/js/core/detect.js';
import { parseTranscriptText } from '../public/js/core/transcript.js';
import { auditDegree } from '../public/js/core/audit.js';
import { buildIndex } from '../public/js/core/catalog.js';

const j = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const { programs } = j('data/programs.json');
const index = buildIndex(j('data/catalog.json'), j('data/sections.json'), j('data/forecast.json'));
const sampleText = readFileSync(new URL('../public/samples/sample-transcript.txt', import.meta.url), 'utf8');
const sample = parseTranscriptText(sampleText);

test('credit text like "3-4" or "(24-25)" reads as the first number', () => {
  assert.equal(parseCredits('3-4'), 3);
  assert.equal(parseCredits('(24-25)'), 24);
  assert.equal(parseCredits('120-121'), 120);
  assert.equal(parseCredits(''), 0);
});

test('every program has unique ids, a college, and groups that add up to the total', () => {
  assert.ok(programs.length >= 45);
  assert.equal(new Set(programs.map((p) => p.id)).size, programs.length);
  for (const p of programs) {
    assert.ok(p.college, `${p.id} has a college`);
    assert.equal(p.groups.reduce((s, g) => s + g.credits, 0), p.totalCredits, `${p.id} total`);
    for (const g of p.groups) assert.ok(['all', 'pick', 'hss', 'free'].includes(g.type), `${p.id}/${g.id} type`);
  }
});

test('every program can be audited without errors', () => {
  for (const p of programs) {
    const audit = auditDegree(p, sample.courses, { index, planned: [] });
    assert.equal(audit.totals.required, p.totalCredits, p.id);
    assert.ok(audit.totals.done >= 0 && audit.totals.remaining >= 0, p.id);
  }
});

test('detection reads the major from the transcript header', () => {
  assert.deepEqual(headerMajors('Major and Department: Mechanical Engineering, Mechanical Engineering\nCS 115'), ['Mechanical Engineering', 'Mechanical Engineering']);
  const found = detectProgram(sample.courses, programs, { headerText: sampleText });
  assert.equal(found.programId, 'bs-cs');
  assert.equal(found.confidence, 'high');
  const me = detectProgram([], programs, { headerText: 'Major: Mechanical Engineering' });
  assert.equal(me.programId, 'bs-mechanical-engineering');
  const fromClaude = detectProgram([], programs, { majors: ['Civil Engineering'] });
  assert.equal(fromClaude.programId, 'bs-civil-engineering');
});

test('detection falls back to courses, with lower confidence', () => {
  const found = detectProgram(sample.courses, programs, {});
  assert.ok(found);
  assert.notEqual(found.confidence, 'high');
  assert.ok(['bs-cs', 'bs-computer-information-systems'].includes(found.programId));
  assert.equal(detectProgram([], programs, {}), null);
});
