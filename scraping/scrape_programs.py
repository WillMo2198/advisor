'''
Scrape academic programs

One listing page, then one GET per program page and one GET per catalog URL.
Catalog hashes are tabs in that same response, not extra requests.

Usage:
    python scraping/scrape_programs.py
    python scraping/scrape_programs.py --slug advanced-manufacturing-ms
'''

from __future__ import annotations

import argparse
import json
import re
import time
from collections import OrderedDict
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "www" / "data"
OUTPUT_PATH = DATA_DIR / "programs.json"

LISTING_URL = "https://www.iit.edu/academics/programs"
SITE = "https://www.iit.edu"
PAUSE = 0.4

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "pop.ai program scraper (educational)"
CATALOG_CACHE: dict[str, dict] = {}

SHOW_COURSE = re.compile(r"showCourse\(\s*this\s*,\s*'([^']+)'\s*\)")


# Collapse whitespace in a scraped string
def clean(value) -> str:
    if value is None:
        return ""
    text = str(value).replace("\xa0", " ").replace("\u200b", "")
    return re.sub(r"\s+", " ", text).strip()


# Drop empty strings, lists, and dicts from a value
def prune(value):
    if isinstance(value, dict):
        kept = {}
        for key, item in value.items():
            item = prune(item)
            if item is None or item == "" or item == [] or item == {}:
                continue
            kept[key] = item
        return kept
    if isinstance(value, list):
        return [item for item in (prune(item) for item in value) if item not in (None, "", [], {})]
    return value


# GET a page, pause, and return parsed HTML
def fetch(url: str) -> BeautifulSoup:
    response = SESSION.get(url, timeout=45)
    response.raise_for_status()
    time.sleep(PAUSE)
    return BeautifulSoup(response.text, "html.parser")


# Read a course code from a catalog cell
def course_code(cell) -> str:
    link = cell.find("a")
    if link is not None:
        onclick = link.get("onclick") or ""
        match = SHOW_COURSE.search(onclick)
        if match:
            return clean(match.group(1))
        if link.get("title"):
            return clean(link["title"])
    return clean(cell.get_text(" "))


# Collect absolute links from a node
def links_in(node, base: str) -> list[dict]:
    found = []
    for anchor in node.find_all("a", href=True):
        label = clean(anchor.get_text(" "))
        href = urljoin(base, anchor["href"].strip())
        if not label and not href:
            continue
        found.append({"label": label, "url": href})
    return found


# Join paragraph text, skipping link-only lines and details blocks
def prose_paragraphs(node) -> str:
    parts = []
    for paragraph in node.find_all("p"):
        if paragraph.find_parent("details"):
            continue
        text = clean(paragraph.get_text(" "))
        if not text:
            continue
        only_link = paragraph.find("a")
        if only_link is not None and clean(only_link.get_text(" ")) == text:
            continue
        parts.append(text)
    return "\n".join(parts)


# Read program cards from the academics listing
def parse_listing(soup: BeautifulSoup) -> list[dict]:
    programs = []
    for article in soup.select("article.program-large-list"):
        title_link = article.select_one("h2 a")
        if title_link is None or not title_link.get("href"):
            continue
        href = urljoin(SITE, title_link["href"])
        slug = urlsplit(href).path.rstrip("/").split("/")[-1]
        cells = {}
        for cell in article.select("div.cell"):
            eyebrow = cell.find("h3", class_="eyebrow")
            if eyebrow is None:
                continue
            cells[clean(eyebrow.get_text(" "))] = cell

        program_type = ""
        if "Program Type" in cells:
            label = cells["Program Type"].find("span", class_="h4")
            program_type = clean(label.get_text(" ") if label else cells["Program Type"].get_text(" "))

        degree = ""
        degree_name = ""
        if "Degree" in cells:
            degree_cell = cells["Degree"]
            tip = degree_cell.find(class_="tooltip-link")
            if tip is not None and tip.get("title"):
                degree_name = clean(tip["title"])
            for heading in degree_cell.find_all("h3"):
                heading.extract()
            degree = clean(degree_cell.get_text(" "))

        school = ""
        if "School" in cells:
            school_link = cells["School"].find("a")
            school = clean(school_link.get_text(" ") if school_link else cells["School"].get_text(" "))

        locations = [
            clean(item.get_text(" "))
            for item in article.select("ul.program-modality-list li")
            if clean(item.get_text(" "))
        ]
        contact = ""
        if "Contact Us" in cells:
            contact_cell = cells["Contact Us"]
            eyebrow = contact_cell.find("h3")
            if eyebrow is not None:
                eyebrow.extract()
            contact = clean(contact_cell.get_text(" "))

        attributes = [clean(item.get_text(" ")) for item in article.select("ul.program-listing-attributes li")]
        parts = urlsplit(href)
        programs.append({
            "name": clean(title_link.get_text(" ")),
            "slug": slug,
            "url": urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, "")),
            "program_type": program_type,
            "degree": degree,
            "degree_name": degree_name,
            "school": school,
            "locations": locations,
            "contact": contact,
            "stem_designated": any("STEM" in item for item in attributes),
            "meets_f1": any("F-1" in item for item in attributes),
        })
    return programs


# Fill contact, areas, and flags from the detail sidebar
def parse_sidebar(soup: BeautifulSoup, program: dict) -> None:
    meta = soup.select_one("article.program-detail__meta")
    if meta is None:
        return
    for item in meta.select(".program-detail__meta__item"):
        label_node = item.find("dt")
        value_node = item.find("dd")
        if label_node is None or value_node is None:
            continue
        label = clean(label_node.get_text(" "))
        if label == "Program Type" and not program.get("program_type"):
            program["program_type"] = clean(value_node.get_text(" "))
        elif label == "School" and not program.get("school"):
            link = value_node.find("a")
            program["school"] = clean(link.get_text(" ") if link else value_node.get_text(" "))
        elif label == "Program":
            areas = [clean(link.get_text(" ")) for link in value_node.find_all("a")]
            areas = [area for area in areas if area]
            if areas:
                program["program_areas"] = areas
        elif label == "Program Location" and not program.get("locations"):
            places = [clean(li.get_text(" ")) for li in value_node.select("li")]
            program["locations"] = [place for place in places if place] or [clean(value_node.get_text(" "))]
        elif label == "Contact Us":
            mail = value_node.find("a")
            contact = clean(mail.get_text(" ") if mail else value_node.get_text(" "))
            if contact:
                program["contact"] = contact
        elif label == "STEM Designated":
            program["stem_designated"] = (
                clean(value_node.get_text(" ")).lower().startswith("yes")
                or program.get("stem_designated", False)
            )
        elif label == "Meets F-1 Visa Requirements":
            program["meets_f1"] = (
                clean(value_node.get_text(" ")).lower().startswith("yes")
                or program.get("meets_f1", False)
            )


# Copy CIP, duration, and modes from JSON-LD
def parse_jsonld(soup: BeautifulSoup, program: dict) -> None:
    nodes = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text()
        if not raw or not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        pending = data if isinstance(data, list) else [data]
        for node in pending:
            if not isinstance(node, dict):
                continue
            graph = node.get("@graph")
            if isinstance(graph, list):
                pending.extend(item for item in graph if isinstance(item, dict))
                continue
            if node.get("@type") == "EducationalOccupationalProgram":
                nodes.append(node)
    if not nodes:
        return
    node = nodes[0]
    identifier = node.get("identifier") or {}
    if isinstance(identifier, dict) and identifier.get("value"):
        program["cip"] = clean(identifier.get("value"))
    if node.get("timeToComplete"):
        program["time_to_complete"] = clean(node.get("timeToComplete"))
    modes = node.get("educationalProgramMode") or []
    if isinstance(modes, str):
        modes = [modes]
    program["program_modes"] = [clean(mode) for mode in modes if clean(mode)]
    credential = node.get("educationalCredentialAwarded") or {}
    if isinstance(credential, dict):
        program["credential"] = clean(credential.get("credentialCategory"))
    elif credential:
        program["credential"] = clean(credential)
    prerequisites = []
    for item in node.get("programPrerequisites") or []:
        if isinstance(item, dict):
            text = clean(item.get("credentialCategory"))
        else:
            text = clean(item)
        if text:
            prerequisites.append(text)
    program["prerequisites"] = prerequisites


# Fill overview, admissions, and catalog links from the intro
def parse_intro(soup: BeautifulSoup, program: dict) -> list[dict]:
    hero = soup.select_one("section.hero p")
    if hero is not None:
        program["tagline"] = clean(hero.get_text(" "))

    article = soup.select_one("section.section--program-detail-intro article.full-wysiwyg")
    catalog_refs = []
    if article is None:
        return catalog_refs

    lead_heading = ""
    lead_parts = []
    overview_parts = []
    career_items = []
    tuition_parts = []
    tuition_links = []
    mode = "lead"
    for child in article.children:
        if getattr(child, "name", None) is None:
            continue
        if "lightcast-widget" in (child.get("class") or []):
            continue
        if child.name == "section" and "section--accordion" in (child.get("class") or []):
            mode = "after"
            continue
        if child.name == "h2":
            title = clean(child.get_text(" "))
            if title == "Program Overview":
                mode = "overview"
            elif title == "Career Opportunities":
                mode = "careers"
            elif title.startswith("Tuition"):
                mode = "tuition"
            elif mode == "lead" and not lead_heading:
                lead_heading = title
            continue
        if mode == "lead" and child.name == "p":
            text = clean(child.get_text(" "))
            if text:
                lead_parts.append(text)
        elif mode == "overview" and child.name == "p":
            text = clean(child.get_text(" "))
            if text:
                overview_parts.append(text)
        elif mode == "careers" and child.name == "ul":
            career_items.extend(
                clean(item.get_text(" ")) for item in child.find_all("li") if clean(item.get_text(" "))
            )
        elif mode == "tuition":
            if child.name == "p":
                text = clean(child.get_text(" "))
                if text:
                    tuition_parts.append(text)
            tuition_links.extend(links_in(child, SITE))

    if lead_heading:
        program["headline"] = lead_heading
    if lead_parts and not program.get("tagline"):
        program["tagline"] = lead_parts[0]
    program["overview"] = "\n".join(overview_parts)
    program["careers"] = career_items
    if tuition_parts or tuition_links:
        program["tuition"] = {"text": "\n".join(tuition_parts), "links": tuition_links}

    for accordion in article.select("div.accordion"):
        title_node = accordion.select_one(".accordion__button-text")
        content = accordion.select_one(".accordion__content")
        if title_node is None or content is None:
            continue
        title = clean(title_node.get_text(" "))
        if title == "Curriculum":
            program["curriculum_summary"] = prose_paragraphs(content)
            for ref in links_in(content, SITE):
                if "catalog.iit.edu" not in ref["url"]:
                    continue
                parts = urlsplit(ref["url"])
                ref["url"] = urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))
                catalog_refs.append(ref)
        elif title == "Admission Requirements":
            program["admission_requirements"] = {
                "text": prose_paragraphs(content),
                "links": links_in(content, SITE),
            }
    return catalog_refs


# Read question and answer pairs
def parse_faqs(soup: BeautifulSoup) -> list[dict]:
    heading = None
    for node in soup.find_all("h2"):
        if "Frequently Asked Questions" in clean(node.get_text(" ")):
            heading = node
            break
    if heading is None:
        return []
    article = heading.find_parent("article") or heading.parent
    faqs = []
    current = None
    for element in article.find_all(["h3", "p"]):
        if element.find_parent("script") is not None:
            continue
        if element.name == "h3":
            if current is not None:
                faqs.append(current)
            current = {"question": clean(element.get_text(" ")), "answer": ""}
            continue
        if current is None:
            continue
        text = clean(element.get_text(" "))
        if text:
            current["answer"] = (current["answer"] + "\n" + text).strip()
    if current is not None:
        faqs.append(current)
    return [item for item in faqs if item.get("question")]


# Read name and credit rows from a credit-rules table
def parse_requirements_table(table) -> list[dict]:
    rows = []
    for tr in table.find_all("tr"):
        if "hidden" in (tr.get("class") or []):
            continue
        cells = tr.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        name = clean(cells[0].get_text(" "))
        credits = clean(cells[1].get_text(" "))
        if not name or name == "Requirement":
            continue
        rows.append({"name": name, "credits": credits})
    return rows


# Read the hours cell and unwrap parentheses
def _row_hours(tr) -> str:
    hours_cell = tr.find("td", class_="hourscol")
    hours = clean(hours_cell.get_text(" ")) if hours_cell else ""
    wrapped = re.match(r"^\((.*)\)$", hours)
    return wrapped.group(1).strip() if wrapped else hours


# Build a course dict from a catalog row
def _course_from_row(tr) -> dict:
    code_cell = tr.find("td", class_="codecol")
    title_cell = code_cell.find_next_sibling("td") if code_cell is not None else None
    item = {
        "code": course_code(code_cell),
        "title": clean(title_cell.get_text(" ")) if title_cell else "",
    }
    hours = _row_hours(tr)
    if hours:
        item["credits"] = hours
    return item


# Split a course table into groups, choices, and alternatives
def parse_courselist(table) -> tuple[list[dict], str]:
    rows = [
        tr for tr in table.find_all("tr")
        if "hidden" not in (tr.get("class") or [])
    ]
    groups = []
    current = None
    choice = None
    total = ""

    # Start a nameless group when a row arrives before an area header
    def ensure():
        nonlocal current
        if current is None:
            current = {"name": "", "credits": "", "notes": [], "courses": [], "choices": []}
            groups.append(current)

    # Return the course an or-row should attach to
    def last_course():
        if choice is not None and choice["courses"]:
            return choice["courses"][-1]
        if current is not None and current["courses"]:
            return current["courses"][-1]
        return None

    for index, tr in enumerate(rows):
        classes = tr.get("class") or []
        if "listsum" in classes:
            cells = tr.find_all(["td", "th"])
            if cells:
                total = clean(cells[-1].get_text(" "))
            continue
        if "areaheader" in classes:
            label_cell = tr.find("td")
            current = {
                "name": clean(label_cell.get_text(" ") if label_cell else ""),
                "credits": _row_hours(tr),
                "notes": [],
                "courses": [],
                "choices": [],
            }
            groups.append(current)
            choice = None
            continue
        if "orclass" in classes:
            target = last_course()
            if target is None:
                continue
            target.setdefault("or", []).append(_course_from_row(tr))
            continue

        comment = tr.find(class_="courselistcomment")
        code_cell = tr.find("td", class_="codecol")
        if comment is not None and code_cell is None:
            followed_by_indent = False
            for nxt in rows[index + 1:]:
                nxt_classes = nxt.get("class") or []
                if "areaheader" in nxt_classes or "listsum" in nxt_classes:
                    break
                if nxt.find(class_="courselistcomment") and nxt.find("td", class_="codecol") is None:
                    break
                if nxt.find(class_="blockindent"):
                    followed_by_indent = True
                    break
            ensure()
            text = clean(comment.get_text(" "))
            if followed_by_indent:
                choice = {"text": text, "credits": _row_hours(tr), "courses": []}
                current["choices"].append(choice)
            elif text:
                choice = None
                current["notes"].append(text)
            continue

        if code_cell is None:
            continue
        ensure()
        item = _course_from_row(tr)
        if tr.find(class_="blockindent") and choice is not None:
            choice["courses"].append(item)
        else:
            choice = None
            current["courses"].append(item)
    return groups, total


# Walk headings and tables into degree options
def parse_options(container) -> list[dict]:
    options = []
    current = None

    # Begin a new option
    def start(name: str) -> None:
        nonlocal current
        current = {
            "name": clean(name),
            "requirements": [],
            "groups": [],
            "total_credits": "",
            "footnotes": [],
        }
        options.append(current)

    for element in container.find_all(["h2", "table", "dl"]):
        if element.name == "h2":
            start(element.get_text(" "))
            continue
        if current is None:
            start("")
        classes = element.get("class") or []
        if element.name == "dl" and "sc_footnotes" in classes:
            current["footnotes"].extend(
                clean(dd.get_text(" ")) for dd in element.find_all("dd") if clean(dd.get_text(" "))
            )
            continue
        if element.name != "table":
            continue
        if "sc_sctable" in classes:
            current["requirements"].extend(parse_requirements_table(element))
        elif "sc_courselist" in classes:
            groups, total = parse_courselist(element)
            current["groups"].extend(groups)
            if total:
                current["total_credits"] = total
    return [
        option for option in options
        if option["requirements"] or option["groups"] or option["footnotes"]
    ]


# Map a plan-grid row onto semester columns
def row_slots(tr) -> dict[int, object]:
    column = 0
    slots = {}
    for cell in tr.find_all(["td", "th"]):
        span = int(cell.get("colspan") or 1)
        slots[column] = cell
        column += span
    return slots


# Turn a plan-grid cell into a course or label
def plan_item(cell) -> dict | None:
    if cell is None:
        return None
    if "hourscol" in (cell.get("class") or []):
        return None
    link = cell.find("a", class_="bubblelink")
    text = clean(cell.get_text(" "))
    if link is not None:
        item = {"code": course_code(cell)}
    elif text:
        item = {"label": text}
    else:
        return None
    return item


# Read the sample plan years and semesters
def parse_sample_curriculum(container) -> dict:
    heading = container.find("h2")
    table = container.find("table", class_="sc_plangrid")
    result = {
        "title": clean(heading.get_text(" ")) if heading else "",
        "years": [],
        "total_credit_hours": "",
        "footnotes": [],
        "notes": [],
    }
    if table is None:
        return result

    semester_names = ["Semester 1", "Semester 2"]
    year = None
    for tr in table.find_all("tr"):
        classes = tr.get("class") or []
        slots = row_slots(tr)
        if "plangridyear" in classes:
            year = {
                "year": clean(tr.get_text(" ")),
                "semesters": [
                    {"name": semester_names[0], "courses": [], "total": ""},
                    {"name": semester_names[1], "courses": [], "total": ""},
                ],
            }
            result["years"].append(year)
            continue
        if "plangridterm" in classes:
            names = [
                clean(cell.get_text(" "))
                for cell in tr.find_all(["th", "td"])
                if "hourscol" not in (cell.get("class") or []) and clean(cell.get_text(" "))
            ]
            if len(names) >= 2:
                semester_names = names[:2]
                if year is not None:
                    year["semesters"][0]["name"] = semester_names[0]
                    year["semesters"][1]["name"] = semester_names[1]
            continue
        if "plangridtotal" in classes:
            text = clean(tr.get_text(" "))
            match = re.search(r"(\d+)\s*$", text)
            result["total_credit_hours"] = match.group(1) if match else text
            continue
        if year is None:
            continue
        if "plangridsum" in classes:
            left = slots.get(1)
            right = slots.get(3)
            year["semesters"][0]["total"] = clean(left.get_text(" ")) if left else ""
            year["semesters"][1]["total"] = clean(right.get_text(" ")) if right else ""
            continue
        for index, start in ((0, 0), (1, 2)):
            item = plan_item(slots.get(start))
            if item is None:
                continue
            hours = slots.get(start + 1)
            item["credits"] = clean(hours.get_text(" ")) if hours else ""
            year["semesters"][index]["courses"].append(item)

    for dl in container.find_all("dl", class_="sc_footnotes"):
        result["footnotes"].extend(
            clean(dd.get_text(" ")) for dd in dl.find_all("dd") if clean(dd.get_text(" "))
        )
    for paragraph in container.find_all("p"):
        if paragraph.find_parent("dl") is not None or paragraph.find_parent("table") is not None:
            continue
        text = clean(paragraph.get_text(" "))
        if text:
            result["notes"].append(text)
    return result


# Parse overview, requirements, and sample curriculum from one catalog page
def parse_catalog(soup: BeautifulSoup, label: str, url: str) -> dict:
    title_node = soup.select_one("#content h1") or soup.find("h1")
    catalog = {
        "label": label,
        "url": url,
        "title": clean(title_node.get_text(" ")) if title_node else "",
    }
    overview = soup.select_one("#textcontainer")
    requirements = soup.select_one("#programrequirementstextcontainer")
    if overview is not None:
        text = prose_paragraphs(overview)
        if text:
            catalog["overview"] = text
    if requirements is not None:
        catalog["options"] = parse_options(requirements)
    elif overview is not None and overview.find("table", class_="sc_courselist"):
        catalog["options"] = parse_options(overview)
    sample = soup.select_one("#samplecurriculumtextcontainer")
    if sample is not None and sample.find("table", class_="sc_plangrid") is not None:
        catalog["sample_curriculum"] = parse_sample_curriculum(sample)
    return catalog


# Return a cached catalog body and fetch the URL once
def load_catalog(url: str) -> dict:
    cached = CATALOG_CACHE.get(url)
    if cached is not None:
        return cached
    try:
        soup = fetch(url)
    except requests.RequestException as exc:
        print(f"    catalog failed: {exc}")
        body = {"url": url, "error": str(exc)}
        CATALOG_CACHE[url] = body
        return body
    body = parse_catalog(soup, "", url)
    body.pop("label", None)
    CATALOG_CACHE[url] = body
    return body


# Fetch a program page and attach its catalogs
def scrape_program(program: dict) -> dict:
    print(f" -> {program['slug']}")
    try:
        soup = fetch(program["url"])
    except requests.RequestException as exc:
        print(f"    detail failed: {exc}")
        program["error"] = str(exc)
        return program

    parse_sidebar(soup, program)
    parse_jsonld(soup, program)
    catalog_refs = parse_intro(soup, program)
    faqs = parse_faqs(soup)
    if faqs:
        program["faqs"] = faqs

    catalogs = []
    seen = set()
    for ref in catalog_refs:
        if ref["url"] in seen:
            continue
        seen.add(ref["url"])
        catalogs.append({**load_catalog(ref["url"]), "label": ref["label"]})
    if catalogs:
        program["catalogs"] = catalogs
    return program


# Group pruned programs by type
def group_programs(programs: list[dict]) -> dict:
    types: OrderedDict[str, list] = OrderedDict()
    for program in programs:
        key = program.get("program_type") or "Unknown"
        types.setdefault(key, []).append(prune(program))
    return {
        "source": LISTING_URL,
        "program_count": len(programs),
        "types": types,
    }


# Scrape the listing and write programs.json
def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape Illinois Tech academic programs into JSON.")
    parser.add_argument("--slug", action="append", default=[], help="Limit to this program slug; repeatable")
    args = parser.parse_args()

    print(f"Fetching {LISTING_URL}")
    listing = fetch(LISTING_URL)
    programs = parse_listing(listing)
    print(f"Found {len(programs)} programs.")
    if args.slug:
        wanted = set(args.slug)
        programs = [program for program in programs if program["slug"] in wanted]
        missing = wanted - {program["slug"] for program in programs}
        if missing:
            print(f"Slugs not on the listing: {', '.join(sorted(missing))}")
        print(f"Scraping {len(programs)} selected programs.")

    scraped = [scrape_program(program) for program in programs]
    payload = group_programs(scraped)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {payload['program_count']} programs to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
