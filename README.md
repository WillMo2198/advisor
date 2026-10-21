# advisor.

A course advisor for Illinois Tech. One search box, a prerequisite graph, a weekly schedule, a degree audit from your unofficial transcript, and a chat advisor powered by the Claude API.

- **Search** every course as you type: CRNs, rooms, professors, semesters, departments, titles, days (`mwf`), descriptions, codes (`cs440`), or a mix. Commas OR the parts together: `CS 331, MATH 251, MATH 474`.
- **Schedule** tab: saved sections and a weekly grid. The grid uses the layout from [pop.ai](https://github.com/johnchmura/pop.ai) (`src/schedule.js`): overlapping classes split a day into columns. Time conflicts are flagged.
- **Course Graph** tab: the prerequisite chain for the courses you searched, plus what they unlock. Solid = prerequisite, green = can be taken in the same term, dashed = one of several options. Click a node for details.
- **Chat** tab: ask advising questions. The server sends Claude the full course data and your context (completed courses, saved sections, conflicts, and prerequisite checks it already ran).
- **Degree** tab: upload your unofficial transcript (PDF, saved web page, text, or a screenshot). The app lists every requirement for the B.S. in Computer Science as done, in progress, or still needed, then builds a **semester-by-semester plan** using prerequisites and the CS department's tentative schedule of future courses (Spring 2027 – Fall 2028). Edit any row it read wrong. Ask the chat advisor to review the plan.
- **Recommended plan** (Degree tab): press **Build my plan with the advisor**. Claude writes a term-by-term plan from everything the app knows about the student: transcript and grades, courses in progress, saved sections, the forecast, and what they said in chat (interests, workload, goals). Each course gets a one-line reason. The app then **checks the plan** (prerequisites in order, forecast terms, credit limit, repeats, and whether it covers every requirement) and flags any problem on the course itself. Without an API key, or if Claude fails, the app's own rule-based plan is shown, with reasons too.
- **Future terms** on every CS course card, from that same forecast.
- **Completed courses** (in Filters): turns on “You can take this / Missing: …” checks everywhere, and the “Only courses I can take now” filter.
- **Dark mode**: the moon/sun button. It follows your system setting until you pick one.

## Quick start

Needs Node.js 18.17 or newer. No `npm install` needed (no dependencies).

```bash
cp .env.example .env        # then put your key in ANTHROPIC_API_KEY
npm start                   # open http://localhost:3000
```

No key? The app still runs. Chat switches to **offline mode** and answers prerequisite, “same term?”, unlocks, section, and conflict questions from the course data only.

Settings in `.env`: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `MAX_TOKENS`, `PORT`, `HOST`, `CHAT_RATE_LIMIT`, `ADVISOR_INSTRUCTIONS`.

## The advisor instructions

`advisor_instructions.txt` is the system prompt. It tells Claude it is an IIT course advisor, how to read prerequisite trees (and / or, `*` = same term, minimum grades), to flag sample data, to stay short and plain, and to send students to their real advisor or the Registrar for anything it cannot know. Edit it any time; the server reloads it on the next question.

Each request sends three system blocks:

1. `advisor_instructions.txt`
2. **COURSE DATA**: every course with its catalog prerequisite text and tree, what it unlocks, and its sections (cached with prompt caching, since it is the same every time)
3. **STUDENT CONTEXT**: this student's search, completed courses, saved sections, conflicts, and eligibility checks

## Transcripts and privacy

- Text PDFs, `.html`, and `.txt` files are read **in the browser** with [pdf.js](https://github.com/mozilla/pdf.js) (vendored in `public/vendor/pdfjs`, Apache-2.0). Nothing is sent to the server.
- Scanned PDFs and screenshots need Claude. The student presses **Read with Claude**, and the file goes to `/api/transcript`, which asks Claude for a JSON course list. The server does not store it.
- The parsed course list is saved only in that browser (localStorage). **Clear transcript** removes it.
- When the student uses chat, their course list goes with each question so Claude can see their progress.
- Try it without a real transcript: press **Try a sample** (a made-up student in `public/samples/sample-transcript.txt`).

## Data

| File | What it is |
|---|---|
| `data/catalog.json` | 52 real courses (all CS undergrad + bridge courses, and the MATH courses CS needs) from catalog.iit.edu, read October 2026. Each has `prereqText` (catalog wording) and `prereq` (the same rule as a tree). |
| `data/programs.json` | Degree requirements. Built from `scripts/programs-source.mjs`. 50 undergraduate programs, 2025–2026 catalog: the B.S. in Computer Science (`scripts/programs-source.mjs`) plus every other program from `data/source/programs/*.txt` (`scripts/programs-extra.mjs`). |
| `data/forecast.json` | The CS department's *Tentative Schedule of Future Computer Science Courses*, built from `data/source/future-cs-offerings.csv`. |
| `data/sections.json` | **Sample** Spring 2027 sections, only for CS courses the forecast lists for Spring 2027. CRNs, times, rooms, seats, and instructor names are made up. Same shape as pop.ai's export. |

### The prerequisite tree

```json
{ "type": "and", "children": [
  { "type": "or", "children": [ { "type": "course", "code": "CS 331" }, { "type": "course", "code": "CS 401" } ] },
  { "type": "or", "children": [ { "type": "course", "code": "MATH 474", "concurrent": true }, { "type": "course", "code": "MATH 475", "concurrent": true } ] }
] }
```

`buildIndex()` (in `public/js/core/catalog.js`) turns this into lookups: code → course, CRN → section, reverse edges (what each course unlocks), and the full ancestor chain. Three catalog rules are unclear as written (CS 450, CS 456, CS 484). The app's reading is stored in each course's `note` and shown in the UI and to Claude.

To change course data, edit `scripts/catalog-source.mjs` or `scripts/sections-source.mjs`, then run `npm run build:data` (it also checks the data).

### Update the future-course forecast

Replace `data/source/future-cs-offerings.csv` with the new sheet (first column the course, then one column per term like `S29`, `F29`, with `Y` where it runs) and run `npm run build:data`.

### Add or fix a degree program

Edit the matching file in `data/source/programs/` (the line format is at the top of `engineering.txt`) and run `npm run build:data`. The build prints warnings when a section's courses do not add up to its credits, and it checks that the groups add up to the total. The Computer Science program stays hand-written in `scripts/programs-source.mjs` (group types `all`, `pick`, `hss`, `free` are explained there).

The other programs were read from catalog.iit.edu pages and some were simplified (for example, specializations are optional and not counted in the total). Check them against the catalog before you rely on them.

### Program detection

When a student uploads a transcript, `public/js/core/detect.js` picks the program. It reads the major in the header first ("Major and Department: …"). If the header has none, it matches the courses. "Read with Claude" also returns the major it sees in the header. The student can change the program on the Degree tab, and that choice is kept.

### Use real sections from pop.ai

In your pop.ai checkout:

```bash
python scraping/scrape_descriptions.py
python scraping/scrape_courses.py spring 2027 -s CS MATH
python -c "from app.db import write_semester_files; write_semester_files('spring', 2027)"
```

Then here:

```bash
npm run import:pop -- ../pop.ai/www/data/spring_2027.json --subjects CS,MATH
npm start
```

This replaces `data/sections.json`. The sample-data notes go away. Prerequisite trees still come from `data/catalog.json`.

## Files

```
server.js                 web server, /api/chat (streams Claude), /api/health
advisor_instructions.txt  the advisor's system prompt
lib/claude.js             Claude Messages API streaming client (no SDK)
lib/context.js            builds COURSE DATA and STUDENT CONTEXT
lib/offline.js            answers when no API key is set
lib/transcript-ai.js      reads scanned or image transcripts with Claude
lib/plan-ai.js            the advisor's recommended plan (Claude), with a rule-based fallback
public/index.html         the page
public/css/styles.css     light + dark themes
public/js/app.js          search, results, filters, tabs
public/js/core/           shared with the server and tests:
  prereq.js               tree parse helpers, eligibility checks
  catalog.js              the index
  search.js               pop.ai-style instant search (+ comma lists)
  schedule.js             pop.ai schedule layout + conflict check
  graph.js                prerequisite graph + layered layout
  transcript.js           transcript text / PDF parser
  audit.js                degree audit (matches courses to requirements)
  planner.js              semester-by-semester plan (rule-based) with reasons
  plan-check.js           checks any plan: prerequisites, forecast, credits, coverage
  forecast.js             future-offerings CSV parser
public/js/ui/             schedule, graph, chat, and degree views
public/vendor/pdfjs/      pdf.js browser build (for reading transcript PDFs)
public/samples/           a made-up sample transcript
scripts/                  data sources, build, pop.ai import
test/                     node --test suites (core, offline, server with a fake Claude API)
```

## Tests

```bash
npm test
```

The server tests run a fake Claude API on a local port, so no key or network is needed.

## Limits

- Sections are sample data until you import from pop.ai.
- Minimum grades (“min. grade of C”) are shown but not checked; the app only knows a course is done.
- “Graduate standing” and “Instructor permission” cannot be checked.
- The degree audit guesses course attributes (H), (S), (N) from the subject and does not check the 36-credit (C) rule. It is a planning aid, not an official audit.
- The future-course forecast is tentative, and it only covers CS and CSP courses. Other subjects are assumed to run every term.
- Not an official Illinois Tech service. Students should confirm plans with their academic advisor.
