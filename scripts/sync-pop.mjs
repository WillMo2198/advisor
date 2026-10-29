// Get real class sections from Pop and load them into the advisor.
//
//   npm run sync:pop                         the advisor's semester (Spring 2027 now)
//   npm run sync:pop -- fall 2026            another semester
//   npm run sync:pop -- spring 2027 --subjects CS,MATH
//
// Steps:
//   1. Makes pop/.venv (once) with what Pop's scraper needs: requests, pydantic, sqlite-vec.
//   2. Runs Pop's scraper: pop/scraping/scrape_courses.py (IIT Course Status Report).
//   3. Runs Pop's export: write_semester_files() -> pop/www/data/<season>_<year>.json.
//   4. Imports that file into data/sections.json (scripts/import-pop.mjs).
// Needs Python 3 and internet access to wildfly-prd.iit.edu.
// Afterwards, commit data/sections.json so the deployed site uses the real sections.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pop = join(root, 'pop');
const win = process.platform === 'win32';
const venvPython = join(pop, '.venv', win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python');

function fail(message) {
  console.error(`\nsync:pop stopped: ${message}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.error) return { ok: false, error: r.error };
  return { ok: r.status === 0, status: r.status };
}

// ----- arguments -----
const args = process.argv.slice(2);
const subjIdx = args.indexOf('--subjects');
const subjects = subjIdx >= 0 ? (args[subjIdx + 1] || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : [];
const positional = args.filter((a, i) => !a.startsWith('--') && i !== subjIdx + 1);
let [season, year] = positional;
if (!season) {
  // default: the semester the advisor schedules for (from the sample file)
  const sample = JSON.parse(readFileSync(join(root, 'data', 'sample-sections.json'), 'utf8'));
  [season, year] = sample.semester_name.toLowerCase().split(' ');
}
season = String(season).toLowerCase();
if (!['spring', 'summer', 'fall'].includes(season)) fail(`unknown semester "${season}". Use spring, summer, or fall.`);
if (!/^\d{4}$/.test(String(year || ''))) fail('give a 4-digit year, for example: npm run sync:pop -- spring 2027');
if (!existsSync(join(pop, 'scraping', 'scrape_courses.py'))) fail('pop/ is missing. It should be in this repo.');

// ----- 1. Python environment -----
if (!existsSync(venvPython)) {
  const candidates = win ? ['py', 'python'] : ['python3', 'python'];
  // Pop opens its database with the sqlite-vec extension, so Python must allow SQLite extensions
  const check = 'import sqlite3, sys; c = sqlite3.connect(":memory:"); c.enable_load_extension(True); print(sys.version.split()[0])';
  let base = null;
  for (const c of candidates) {
    const r = spawnSync(c, ['-c', check], { encoding: 'utf8' });
    if (r.status === 0) { base = c; console.log(`Using ${c} (Python ${r.stdout.trim()}).`); break; }
  }
  if (!base) {
    fail('no Python 3 that can load SQLite extensions was found. Pop needs one.\n'
      + '  On a Mac: brew install python   (Apple\'s built-in Python cannot load extensions)\n'
      + '  Then run npm run sync:pop again.');
  }
  console.log('Making pop/.venv for Pop\'s scraper (only the first time)...');
  if (!run(base, ['-m', 'venv', join(pop, '.venv')]).ok) fail('could not make pop/.venv.');
  if (!run(venvPython, ['-m', 'pip', 'install', '--quiet', 'requests', 'pydantic>=2', 'sqlite-vec>=0.1.6']).ok) {
    fail('could not install requests, pydantic, and sqlite-vec into pop/.venv.');
  }
}

// ----- 2. Pop's scraper -----
console.log(`\nRunning Pop's scraper for ${season} ${year}${subjects.length ? ` (${subjects.join(', ')})` : ''}...`);
const scrapeArgs = [join('scraping', 'scrape_courses.py'), season, String(year)];
if (subjects.length) scrapeArgs.push('-s', ...subjects);
if (!run(venvPython, scrapeArgs, { cwd: pop }).ok) {
  fail('Pop\'s scraper failed. Check your internet connection to wildfly-prd.iit.edu, and that IIT has published this semester.');
}

// ----- 3. Pop's export -----
console.log('\nExporting with Pop...');
const exportCode = `import sys; sys.path.insert(0, '.'); from app.db import write_semester_files; js, js_json = write_semester_files(${JSON.stringify(season)}, ${Number(year)}); print(js_json)`;
if (!run(venvPython, ['-c', exportCode], { cwd: pop }).ok) fail('Pop\'s export (write_semester_files) failed.');
const exported = join(pop, 'www', 'data', `${season}_${year}.json`);
if (!existsSync(exported)) fail(`Pop did not write ${exported}.`);

// ----- 4. import into the advisor -----
console.log('\nImporting into the advisor...');
const importArgs = [join(root, 'scripts', 'import-pop.mjs'), exported];
if (subjects.length) importArgs.push('--subjects', subjects.join(','));
if (!run(process.execPath, importArgs, { cwd: root }).ok) fail('the import failed.');

console.log('\nDone. The advisor now uses real Pop sections from data/sections.json.');
console.log('Restart the server (npm start). To put them on the live site, commit and push data/sections.json.');
console.log('To go back to the sample sections: npm run use:sample');
