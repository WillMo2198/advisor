"""Write an elective whitelist onto each program group.

Choice lists become codes. Otherwise the group's notes, plus the one
footnote that shares its name, become subject categories.
"""

from __future__ import annotations

import json
import re
from typing import NamedTuple

GENERIC = {
    "elective",
    "electives",
    "course",
    "courses",
    "credit",
    "credits",
    "hour",
    "hours",
    "select",
    "the",
    "a",
    "of",
    "and",
}
WORDS = (
    ("food science", "FDSN"),
    ("material science", "MS"),
    ("computer science", "CS"),
    ("biology", "BIOL"),
    ("chemistry", "CHEM"),
    ("physics", "PHYS"),
    ("psychology", "PSYC"),
    ("math", "MATH"),
)
NUMBER_RANGE = re.compile(r"(\d{3})\s*[-:]\s*(\d{3})")
TWO_LEVEL_BAND = re.compile(
    r"(\d{3})\s*-?\s*level\s+or\s+(?:[A-Z]{2,5}\s+)?(\d{3})\s*-?\s*level",
    re.I,
)
OR_LEVEL_BAND = re.compile(r"(\d{3})\s*-\s*or\s+(\d{3})\s*-?\s*level", re.I)
MINIMUM_LEVEL = re.compile(r"(\d{3})\s*-?\s*level\s+(?:or higher|and above|or above)", re.I)
PLUS_LEVEL = re.compile(r"(\d{3})\s*\+")
HUNDRED_LEVEL = re.compile(r"(\d{3})\s*-?\s*level", re.I)
COURSE_CODE = re.compile(r"\b([A-Z]{2,5})?\s*(\d{3})(?:\s*[-:]\s*(\d{3}))?\b")
EXCEPT_SPLIT = re.compile(r"\b(?:except|excluding)\b", re.I)
CANNOT = re.compile(r"\bcannot\b", re.I)
SELECT_ONLY = re.compile(r"select [\d\s\-to]+(credit hours|credits|courses)?")
CREDIT_CAPS = ("up to", "a maximum of", "credit limits", "only one", "limited to")


class Level(NamedTuple):
    start: int
    end: int
    low: int
    high: int | None


def fold(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (text or "").lower())).strip()


def prefixes_in(text: str, prefixes: set[str]) -> list[tuple[int, str]]:
    found = []
    lowered = text.lower()
    for phrase, code in WORDS:
        start = 0
        while True:
            at = lowered.find(phrase, start)
            if at < 0:
                break
            before = lowered[at - 1] if at else " "
            after_char = lowered[at + len(phrase)] if at + len(phrase) < len(lowered) else " "
            if not before.isalpha() and not after_char.isalpha():
                rest = lowered[at + len(phrase) :].lstrip()
                if phrase == "computer science" and rest.startswith(("elective", "department")):
                    start = at + len(phrase)
                    continue
                found.append((at, code))
            start = at + len(phrase)
    for match in re.finditer(r"\b([A-Z]{2,5})\b", text):
        code = match.group(1)
        if code in prefixes:
            found.append((match.start(), code))
    found.sort()
    return found


def levels_in(text: str) -> list[Level]:
    spans = []
    patterns = (
        (NUMBER_RANGE, "range"),
        (TWO_LEVEL_BAND, "band"),
        (OR_LEVEL_BAND, "band"),
        (MINIMUM_LEVEL, "min"),
        (PLUS_LEVEL, "min"),
        (HUNDRED_LEVEL, "hundred"),
    )
    occupied = []
    for pattern, kind in patterns:
        for match in pattern.finditer(text):
            if any(not (match.end() <= lo or match.start() >= hi) for lo, hi in occupied):
                continue
            occupied.append((match.start(), match.end()))
            low = int(match.group(1))
            if kind == "range":
                spans.append(Level(match.start(), match.end(), low, int(match.group(2))))
            elif kind == "band":
                spans.append(Level(match.start(), match.end(), low, int(match.group(2)) + 99))
            elif kind == "min":
                spans.append(Level(match.start(), match.end(), low, None))
            else:
                spans.append(Level(match.start(), match.end(), low, low + 99))
    return spans


def codes_in(text: str) -> list[str]:
    found = []
    last = ""
    for match in COURSE_CODE.finditer(text):
        subject, number, end = match.group(1), match.group(2), match.group(3)
        if subject:
            last = subject
        if not last:
            continue
        if end and 0 < int(end) - int(number) <= 20:
            found.extend(f"{last} {n}" for n in range(int(number), int(end) + 1))
        else:
            found.append(f"{last} {int(number)}")
    return found


# Departments in the line, each with the nearest level, plus an attribute when the line names one.
def categories_from(text: str, prefixes: set[str]) -> list[dict]:
    depts = prefixes_in(text, prefixes)
    spans = levels_in(text)
    grouped: dict[tuple, list[str]] = {}
    for pos, code in depts:
        level = None
        if spans:
            level = min(spans, key=lambda span: min(abs(pos - span.start), abs(pos - span.end)))
        key = (level.low, level.high) if level else (None, None)
        bucket = grouped.setdefault(key, [])
        if code not in bucket:
            bucket.append(code)
    categories = []
    for (low, high), subjects in grouped.items():
        category: dict = {"subjects": subjects}
        if low is not None:
            category["min"] = low
        if high is not None:
            category["max"] = high
        categories.append(category)
    marker = None
    if "(P)" in text:
        marker = "(P)"
    elif "(T)" in text:
        marker = "(T)"
    elif "(M)" in text:
        marker = "(M)"
    if marker:
        if categories:
            for category in categories:
                category["attribute"] = marker
        else:
            categories.append({"attribute": marker})
    if "natural science" in text.lower() or "(N)" in text:
        categories.append({"attribute": "Natural Science (N)"})
    return categories


# Allowed categories from the positive part, banned codes from except or cannot.
def parse_text(text: str, prefixes: set[str], required_subjects: set[str]) -> tuple[list[dict], list[str]]:
    categories = []
    banned = []
    for sentence in re.split(r"(?<=[.])\s+", text):
        if CANNOT.search(sentence):
            banned.extend(codes_in(sentence))
            for _pos, code in prefixes_in(sentence, prefixes):
                if code in required_subjects:
                    categories.append({"subjects": [code]})
            continue
        parts = EXCEPT_SPLIT.split(sentence, maxsplit=1)
        if len(parts) > 1:
            banned.extend(codes_in(parts[1]))
        head = parts[0]
        lowered = head.lower()
        if any(phrase in lowered for phrase in CREDIT_CAPS) and not levels_in(head):
            continue
        categories.extend(categories_from(head, prefixes))
    return categories, banned


def choice_codes(group: dict) -> list[str]:
    codes = []
    for choice in group.get("choices") or []:
        for course in choice.get("courses") or []:
            code = " ".join(str(course.get("code") or "").split()).upper()
            if code and code not in codes:
                codes.append(code)
            for alt in course.get("or") or []:
                alt_code = " ".join(str(alt.get("code") or "").split()).upper()
                if alt_code and alt_code not in codes:
                    codes.append(alt_code)
    return codes


# A free elective is any, a listed group is codes, otherwise categories.
def build_elective(group: dict, footnote: str, prefixes: set[str], required: set[str]) -> dict | None:
    name = fold(group.get("name") or "")
    if "free elective" in name:
        return {"any": True}
    codes = choice_codes(group)
    if codes:
        return {"codes": codes}
    if "elective" not in name:
        return None
    lines = [
        note
        for note in (group.get("notes") or [])
        if note
        and not SELECT_ONLY.fullmatch(fold(note) or "x")
    ]
    if footnote:
        lines.append(footnote)
    categories = []
    banned = []
    seen = set()
    for line in lines:
        found, extra = parse_text(line, prefixes, required)
        banned.extend(extra)
        for category in found:
            key = json.dumps(category, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            categories.append(category)
    if not categories:
        return None
    elective: dict = {"categories": categories}
    cleaned = list(dict.fromkeys(banned))
    if cleaned:
        elective["except"] = cleaned
    return elective


# Writes elective onto each group from its note and matching footnote.
def annotate(data: dict, prefixes: set[str]) -> int:
    written = 0
    for items in data["types"].values():
        for program in items:
            required = set()
            for catalog in program.get("catalogs") or []:
                for option in catalog.get("options") or []:
                    for group in option.get("groups") or []:
                        for course in group.get("courses") or []:
                            code = " ".join(str(course.get("code") or "").split()).upper()
                            if code:
                                required.add(code.split()[0])
                            for alt in course.get("or") or []:
                                alt_code = " ".join(str(alt.get("code") or "").split()).upper()
                                if alt_code:
                                    required.add(alt_code.split()[0])
            for catalog in program.get("catalogs") or []:
                for option in catalog.get("options") or []:
                    groups = option.get("groups") or []
                    open_groups = []
                    for index, group in enumerate(groups):
                        if choice_codes(group):
                            continue
                        words = {word for word in fold(group.get("name") or "").split() if word not in GENERIC}
                        if words:
                            open_groups.append((index, words))
                    scores: dict[int, int] = {}
                    assigned: dict[int, str] = {}
                    for note in option.get("footnotes") or []:
                        best = None
                        best_score = 0
                        note_words = set(fold(note).split())
                        for index, words in open_groups:
                            if words <= note_words and len(words) > best_score:
                                best = index
                                best_score = len(words)
                        if best is not None and best_score > scores.get(best, 0):
                            scores[best] = best_score
                            assigned[best] = note
                    for index, group in enumerate(groups):
                        group.pop("elective", None)
                        elective = build_elective(group, assigned.get(index, ""), prefixes, required)
                        if elective:
                            group["elective"] = elective
                            written += 1
    return written


# Program, required-code, and pool rows for SQLite.
def rows_from(data: dict) -> tuple[list[tuple], list[tuple], list[tuple]]:
    programs = []
    required_rows = []
    pool_rows = []
    for program_type, items in data["types"].items():
        for program in items:
            slug = program["slug"]
            programs.append((slug, program.get("name") or "", program_type))
            required = set()
            seen = set()
            for catalog in program.get("catalogs") or []:
                for option in catalog.get("options") or []:
                    for group in option.get("groups") or []:
                        for course in group.get("courses") or []:
                            code = " ".join(str(course.get("code") or "").split()).upper()
                            if code:
                                required.add(code)
                            for alt in course.get("or") or []:
                                alt_code = " ".join(str(alt.get("code") or "").split()).upper()
                                if alt_code:
                                    required.add(alt_code)
                        elective = group.get("elective") or {}
                        if not elective.get("any") and not elective.get("codes") and not elective.get("categories"):
                            continue
                        label = group.get("name") or "Electives"
                        detail = json.dumps(elective)
                        key = (label, detail)
                        if key in seen:
                            continue
                        seen.add(key)
                        pool_rows.append((slug, label, group.get("credits") or "", "elective", detail))
            required_rows.extend((slug, code) for code in sorted(required))
    return programs, required_rows, pool_rows
