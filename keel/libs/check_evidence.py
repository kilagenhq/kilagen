#!/usr/bin/env python3
"""Report requirements with no evidence, and evidence that has gone stale.

Evidence has an implicit expiry that nothing else in the model captures. A
quarterly access review proves something about the quarter it covers and
nothing about the one after it, so an `evidence:` entry with a `collected:`
date and a `freshness:` is the only thing that can say "this used to be true".

Like ``check reviews`` this **informs**. A requirement without evidence is not
a broken contract — it is a requirement nobody has been asked to prove yet,
and a check a healthy program can never pass is a check everybody learns to
ignore. ``--strict`` is how a CI asks for the opposite.

The third report is the vendor certification nobody dated: a claim about a
third party, copied by hand, with no record of when anyone checked it.

Invoked by the CLI; not runnable on its own:
    kilagen check evidence [--strict]
"""

from __future__ import annotations

from datetime import date, timedelta

from .keel_lib import get_warnings, reset_warnings, scan_documents

# How long a piece of evidence stays good, in the closed set schedule.yml
# already uses for recurrence. One vocabulary of periodicity, not two.
FRESHNESS_DAYS = {
    "monthly": 31,
    "quarterly": 92,
    "semi-annually": 183,
    "annually": 366,
    "every-2-years": 731,
    "every-3-years": 1096,
}


def collect(documents: list[dict], today: str | None = None) -> dict[str, list[tuple]]:
    """Sort every requirement and certification into what is missing or old."""
    today = today or date.today().isoformat()
    found: dict[str, list[tuple]] = {"unproven": [], "undated": [], "stale": [],
                                    "unscheduled": [], "uncertified": []}

    for doc in documents:
        path = doc.get("path", "")
        if doc.get("type") == "standard":
            for req in doc.get("requirements") or []:
                if not isinstance(req, dict):
                    continue
                key = f"{doc.get('id', '')}#{req.get('ref', '')}"
                evidence = req.get("evidence") or []
                if not evidence:
                    found["unproven"].append((key, str(req.get("text", ""))[:60], path))
                    continue
                for item in evidence:
                    if not isinstance(item, dict):
                        # An entry that is not a mapping cannot carry a url or
                        # a date, so it proves nothing. Counting it as evidence
                        # is how a requirement comes to look proven by a string.
                        found["unproven"].append(
                            (key, f"evidence entry is {type(item).__name__}, not a mapping", path))
                        continue
                    name = item.get("name", "")
                    collected = item.get("collected")
                    if not collected:
                        found["undated"].append((key, name, path))
                        continue
                    window = FRESHNESS_DAYS.get(item.get("freshness", ""))
                    if not window:
                        # No renewal period, or one this vocabulary does not
                        # know. Defaulting to a window would invent a fact; the
                        # honest answer is that nothing can say when this
                        # stopped being true. The dashboard already calls this
                        # state 'unscheduled' — the check used to skip it.
                        found["unscheduled"].append(
                            (key, f"{name} (freshness: {item.get('freshness') or 'none'})", path))
                        continue
                    try:
                        opened = date.fromisoformat(str(collected))
                    except ValueError:
                        found["undated"].append(
                            (key, f"{name} (collected: {collected!r} is not a date)", path))
                        continue
                    expires = (opened + timedelta(days=window)).isoformat()
                    if expires < today:
                        found["stale"].append((expires, f"{key} — {name}", path))

        if doc.get("type") == "vendor":
            for cert in doc.get("certifications") or []:
                if isinstance(cert, dict) and not cert.get("verified"):
                    found["uncertified"].append(
                        (doc.get("id", ""), cert.get("name", ""), path))

    for bucket in found.values():
        bucket.sort()
    return found


def _report(title: str, rows: list[tuple], note: str = "") -> None:
    print(f"\n{title} ({len(rows)}):")
    if note:
        print(f"  {note}")
    for row in rows:
        print("  " + "  ".join(str(cell) for cell in row))


def main(strict: bool = False) -> int:
    """Return 1 when something needs attention, 0 when nothing does.

    That is not an exit code: ``cmd_check`` decides what a finding means, and
    without ``--strict`` it means a warning.
    """
    reset_warnings()
    documents = scan_documents()
    found = collect(documents)
    # A document that could not be read was dropped from `documents`, so every
    # count below is of a smaller program than the one on disk. Saying PASSED
    # on that is saying "proven" about requirements nobody looked at.
    warnings = get_warnings()
    requirements = sum(len(d.get("requirements") or [])
                       for d in documents if d.get("type") == "standard")
    proven = requirements - len(found["unproven"])
    print(f"Checked {requirements} requirements ({proven} with evidence attached).")

    attention = (found["unproven"] + found["undated"] + found["stale"]
                 + found["unscheduled"] + found["uncertified"])
    if warnings:
        print(f"\nFAILED — {len(warnings)} document(s) could not be read and were "
              f"skipped, so this report is incomplete:")
        for warning in warnings:
            print(f"  {warning}")
        return 1
    if not attention:
        print("\nPASSED — every requirement can be proven")
        return 0

    print(f"\n{'=' * 60}")
    if found["stale"]:
        _report("STALE evidence", found["stale"],
                "Past its own freshness. It proved something once; it does not now.")
    if found["unproven"]:
        _report("Requirements with no evidence", found["unproven"],
                "What you say you do, with nothing attached to show it.")
    if found["undated"]:
        _report("Evidence with no collected date", found["undated"],
                "Without a date nothing can tell you when it stopped being true.")
    if found["unscheduled"]:
        _report("Evidence with no renewal period", found["unscheduled"],
                "It has a date and nothing to measure it against, so it can never go stale.")
    if found["uncertified"]:
        _report("Vendor certifications nobody dated", found["uncertified"],
                "A claim about somebody else needs the day it was checked.")

    print(f"\n{len(attention)} item(s) need attention — "
          + ("failing under --strict." if strict else "reported, not failed."))
    return 1
