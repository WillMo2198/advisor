#!/usr/bin/env python3
"""Two-route course advisor. Programs are loaded by scraping/scrape_programs.py."""

from __future__ import annotations

import argparse
import json
import re

from app.api import embed_query
from app.db import connect, normalize_code, semester_label, semantic_search

DEGREE_IN_SLUG = re.compile(r"(?:^|-)(bs|ms|mas)(?:-|$)")


def has_word(hay: str, word: str) -> bool:
    return re.search(rf"(^| ){re.escape(word)}( |$)", hay) is not None


def fold(text: str) -> str:
    text = text.lower().replace("-", " ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


# Longest program name in the line wins, then bs, mas, or ms.
def match_program(text: str, programs: list[tuple[str, str]]) -> tuple[str, str]:
    hay = fold(text)
    best: list[tuple[str, str]] = []
    best_len = 0
    for slug, name in programs:
        bare = re.sub(r"\([^)]*\)", " ", name)
        for needle in (fold(name), fold(bare), fold(slug)):
            if not needle or not has_word(hay, needle):
                continue
            if (
                len(needle.split()) == 1
                and hay != needle
                and not any(has_word(hay, degree) for degree in ("bs", "ms", "mas"))
            ):
                continue
            if len(needle) > best_len:
                best = [(slug, needle)]
                best_len = len(needle)
            elif len(needle) == best_len:
                best.append((slug, needle))
    if not best:
        return "", ""
    slugs = list(dict.fromkeys(slug for slug, _needle in best))
    if has_word(hay, "bs"):
        pool = [slug for slug in slugs if slug.endswith("bs") and len(DEGREE_IN_SLUG.findall(slug)) == 1]
    elif has_word(hay, "mas"):
        pool = [slug for slug in slugs if slug.endswith("mas") and len(DEGREE_IN_SLUG.findall(slug)) == 1]
    elif has_word(hay, "ms"):
        pool = [slug for slug in slugs if slug.endswith("ms") and len(DEGREE_IN_SLUG.findall(slug)) == 1]
    else:
        pool = [slug for slug in slugs if slug.endswith("bs") and len(DEGREE_IN_SLUG.findall(slug)) == 1]
    chosen = min(pool or slugs, key=len)
    needle = max(item for slug, item in best if slug == chosen)
    return chosen, needle


# Program slug, leftover interest, and whether the line is a browse.
def parse(text: str, programs: list[tuple[str, str]]) -> tuple[str, str, bool]:
    hay = fold(text)
    slug, needle = match_program(text, programs)
    browse = any(has_word(hay, word) for word in ("find", "search", "recommend", "courses about"))
    interest = hay
    if needle:
        interest = re.sub(rf"(^| ){re.escape(needle)}( |$)", " ", interest)
    for word in ("courses about", "recommend", "search", "find"):
        interest = re.sub(rf"(^| ){re.escape(word)}( |$)", " ", interest)
    interest = re.sub(r"\s+", " ", interest).strip()
    return slug, interest, browse


# Course is on the elective whitelist and is not already required.
def allowed(code: str, detail: str, required: set[str], satisfies: dict[str, str]) -> bool:
    if code in required:
        return False
    elective = json.loads(detail)
    if elective.get("any"):
        return True
    if code in (elective.get("codes") or []):
        return True
    if code in (elective.get("except") or []):
        return False
    parts = normalize_code(code).split()
    subject = parts[0] if parts else ""
    number = int(parts[1]) if len(parts) >= 2 and parts[1].isdigit() else 0
    text = satisfies.get(code, "")
    for category in elective.get("categories") or []:
        subjects = category.get("subjects") or []
        if subjects and subject not in subjects:
            continue
        if "min" in category and number < category["min"]:
            continue
        if "max" in category and number > category["max"]:
            continue
        attribute = category.get("attribute") or ""
        if attribute and attribute not in text:
            continue
        if subjects or "min" in category or "max" in category or attribute:
            return True
    return False


# One search, then keep hits that each pool allows.
def advise(conn, vector: list[float], semester: str, slug: str, limit: int) -> list[dict]:
    pools = conn.execute(
        "SELECT label, credits, rule, detail FROM program_pools WHERE program_slug = ?",
        (slug,),
    ).fetchall()
    required = {
        row["code"]
        for row in conn.execute(
            "SELECT code FROM program_required WHERE program_slug = ?",
            (slug,),
        )
    }
    hits = semantic_search(vector, semester, 40)
    codes = [normalize_code(hit.course_name) for hit in hits]
    if codes:
        marks = ",".join("?" for _ in codes)
        satisfies = {
            normalize_code(row["code"]): row["satisfies"] or ""
            for row in conn.execute(
                f"SELECT code, satisfies FROM catalog_courses WHERE code IN ({marks})",
                codes,
            )
        }
    else:
        satisfies = {}
    sections = []
    for pool in pools:
        kept = []
        seen = set()
        for hit in hits:
            code = normalize_code(hit.course_name)
            if code in seen or not allowed(code, pool["detail"], required, satisfies):
                continue
            seen.add(code)
            kept.append(hit)
            if len(kept) >= limit:
                break
        if not kept:
            continue
        sections.append({"label": pool["label"], "credits": pool["credits"], "courses": kept})
    return sections


def show_major(name: str, sections: list[dict]) -> None:
    if not sections:
        print(f"No elective pools were scraped for the {name}.")
        return
    print(f"Here are some different courses you can take in the {name}:")
    for section in sections:
        label = section["label"]
        if "free elective" in fold(label):
            text = "Here are some classes you can take as free electives."
        else:
            text = f"Here are some classes that count toward {label}."
        if section["credits"]:
            text += f" Your program lets you take {section['credits']} credit hours here."
        print(text + " Here are some options:")
        for hit in section["courses"]:
            print(f"  {hit.course_name}  {hit.title}")


def repl(conn, semester: str, limit: int) -> None:
    programs = [(row["slug"], row["name"]) for row in conn.execute("SELECT slug, name FROM programs")]
    if not programs:
        print("No programs loaded. Run python scraping/scrape_programs.py")
        return
    names = dict(programs)
    program = ""
    waiting = False
    pending = ""
    while True:
        try:
            line = input("advisor> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if line.lower() in ("quit", "exit"):
            return
        if not line:
            continue
        if waiting:
            slug, _needle = match_program(line, programs)
            if not slug:
                print("I don't know that program.")
                continue
            program = slug
            waiting = False
            interest = pending
            pending = ""
            show_major(names[program], advise(conn, embed_query(interest), semester, program, limit))
            continue
        slug, interest, browse = parse(line, programs)
        if slug:
            program = slug
        if browse and interest:
            print(f"Here are some courses related to {interest}:")
            for hit in semantic_search(embed_query(interest), semester, limit):
                print(f"  {hit.course_name}  {hit.title}")
        if interest and not browse:
            if not program:
                pending = interest
                waiting = True
                print("Which program?")
                continue
            show_major(names[program], advise(conn, embed_query(interest), semester, program, limit))
        elif browse and interest and program:
            show_major(names[program], advise(conn, embed_query(interest), semester, program, limit))
        elif slug and not interest:
            print(f"program {names.get(program, program)}")
        elif not browse:
            print("Say what you want to study, or name a program.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Talk to the course advisor.")
    parser.add_argument("--semester", default="fall")
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    conn = connect()
    repl(conn, semester_label(args.semester, args.year), max(1, args.limit))


if __name__ == "__main__":
    main()
