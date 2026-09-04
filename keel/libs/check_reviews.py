#!/usr/bin/env python3
"""Check for documents with overdue ``next_review`` dates.

Scans all markdown files for ``next_review`` in frontmatter and reports
any that are past due. Exits with code 1 if overdue documents are found.

Invoked by the CLI; not runnable on its own:
    kilagen check reviews
"""

from datetime import date, timedelta

from .keel_lib import REPO, SKIP_DIRS, extract_frontmatter


def main() -> int:
    today = date.today().isoformat()
    soon = (date.today() + timedelta(days=30)).isoformat()
    overdue = []
    upcoming = []
    total = 0

    md_files = [p for p in REPO.rglob("*.md") if not any(s in p.parts for s in SKIP_DIRS)]
    for path in sorted(md_files):
        fm = extract_frontmatter(path)
        if not fm or "next_review" not in fm:
            continue
        total += 1
        nr = str(fm["next_review"])
        rel = path.relative_to(REPO)
        title = fm.get("title", fm.get("id", str(rel)))

        if nr < today:
            overdue.append((nr, title, str(rel)))
        elif nr <= soon:
            upcoming.append((nr, title, str(rel)))

    print(f"Checked {total} documents with next_review dates.")

    if upcoming:
        print(f"\nDue within 30 days ({len(upcoming)}):")
        for nr, title, rel in sorted(upcoming):
            print(f"  {nr}  {title}  ({rel})")

    if overdue:
        print(f"\n{'='*60}")
        print(f"OVERDUE — {len(overdue)} document(s) need review\n")
        for nr, title, rel in sorted(overdue):
            print(f"  {nr}  {title}  ({rel})")
        return 1

    print("\nPASSED — no overdue reviews")
    return 0

