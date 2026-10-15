# advisor.

A course advisor for Illinois Tech. One search box, a prerequisite graph, a weekly schedule, and a chat advisor powered by the Claude API.

- **Search** every course as you type: CRNs, rooms, professors, semesters, departments, titles, days (`mwf`), descriptions, codes (`cs440`), or a mix. Commas OR the parts together: `CS 331, MATH 251, MATH 474`.
- **Schedule** tab: saved sections and a weekly grid. The grid uses the layout from [pop.ai](https://github.com/johnchmura/pop.ai) (`src/schedule.js`): overlapping classes split a day into columns. Time conflicts are flagged.
- **Course Graph** tab: the prerequisite chain for the courses you searched, plus what they unlock. Solid = prerequisite, green = can be taken in the same term, dashed = one of several options. Click a node for details.
- **Chat** tab: ask advising questions. The server sends Claude the full course data and your context (completed courses, saved sections, conflicts, and prerequisite checks it already ran).
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

## Data

| File | What it is |
|---|---|
| `data/catalog.json` | 52 real courses (all CS undergrad + bridge courses, and the MATH courses CS needs) from catalog.iit.edu, read October 2026. Each has `prereqText` (catalog wording) and `prereq` (the same rule as a tree). |
| `data/sections.json` | **Sample** Fall 2026 sections. CRNs, times, rooms, seats, and instructor names are made up. Same shape as pop.ai's export. |

### The prerequisite tree

```json
{ "type": "and", "children": [
  { "type": "or", "children": [ { "type": "course", "code": "CS 331" }, { "type": "course", "code": "CS 401" } ] },
  { "type": "or", "children": [ { "type": "course", "code": "MATH 474", "concurrent": true }, { "type": "course", "code": "MATH 475", "concurrent": true } ] }
] }
```

`buildIndex()` (in `public/js/core/catalog.js`) turns this into lookups: code → course, CRN → section, reverse edges (what each course unlocks), and the full ancestor chain. Three catalog rules are unclear as written (CS 450, CS 456, CS 484). The app's reading is stored in each course's `note` and shown in the UI and to Claude.

To change course data, edit `scripts/catalog-source.mjs` or `scripts/sections-source.mjs`, then run `npm run build:data` (it also checks the data).

### Use real sections from pop.ai

In your pop.ai checkout:

```bash
python scraping/scrape_descriptions.py
python scraping/scrape_courses.py fall 2026 -s CS MATH
python -c "from app.db import write_semester_files; write_semester_files('fall', 2026)"
```

Then here:

```bash
npm run import:pop -- ../pop.ai/www/data/fall_2026.json --subjects CS,MATH
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
public/index.html         the page
public/css/styles.css     light + dark themes
public/js/app.js          search, results, filters, tabs
public/js/core/           shared with the server and tests:
  prereq.js               tree parse helpers, eligibility checks
  catalog.js              the index
  search.js               pop.ai-style instant search (+ comma lists)
  schedule.js             pop.ai schedule layout + conflict check
  graph.js                prerequisite graph + layered layout
public/js/ui/             schedule, graph, and chat views
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
- Not an official Illinois Tech service. Students should confirm plans with their academic advisor.
