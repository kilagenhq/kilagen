#!/usr/bin/env python3
"""Report what has expired or is about to: reviews, exceptions, open gaps.

Three deadlines, one command. A document past its ``next_review`` is stale; an
exception past its ``expires`` has quietly become an unapproved deviation
again; a gap open for months is a remediation nobody is doing.

All three **inform**: they are work to schedule, not a broken contract, and a
check that a healthy program can never pass is a check everybody learns to
ignore. ``main`` returns 1 when it found something, which the CLI reports as a
warning — and turns into a failure only under ``--strict``.

Invoked by the CLI; not runnable on its own:
    kilagen check reviews [--strict]
"""

from __future__ import annotations

from datetime import date, timedelta

from .keel_lib import (get_warnings, is_open_gap, load_config, reset_warnings,
                       scan_documents)

# A gap that has been open this long is not being worked on; it is either a
# remediation that stalled or an exception nobody filed. Arbitrary but
# declared, and an instance with a real quarterly cycle can say so in
# config.yml rather than live with ours.
DEFAULT_STALE_GAP_DAYS = 90


def stale_gap_days(config: dict | None = None) -> int:
    """The instance's threshold, or ours. One reader, so the CLI and the
    dashboard cannot drift apart on what "stale" means."""
    if config is None:
        # No try: a config that cannot be read is reported by validate_config,
        # and swallowing it here would quietly substitute our threshold for the
        # one the instance set.
        config = load_config() or {}
    value = (config or {}).get("stale_gap_days")
    if value is None:
        return DEFAULT_STALE_GAP_DAYS
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        # Falling back here would report against a period nobody chose, under
        # a heading that reads as a fact.
        raise ValueError(
            f"config.yml: stale_gap_days must be a positive whole number, got {value!r}")
    return int(value)


def collect(documents: list[dict], today: str | None = None,
            stale_days: int | None = None) -> dict[str, list[tuple]]:
    """Sort documents into the three overdue buckets plus the upcoming one."""
    today = today or date.today().isoformat()
    stale_days = stale_days if stale_days is not None else stale_gap_days()
    soon = (date.fromisoformat(today) + timedelta(days=30)).isoformat()
    stale_before = (date.fromisoformat(today) - timedelta(days=stale_days)).isoformat()

    found = {"overdue": [], "upcoming": [], "expired": [], "stale_gaps": []}
    for doc in documents:
        label = (doc.get("id", ""), doc.get("title", ""), doc.get("path", ""))
        nr = doc.get("next_review")
        if nr:
            if str(nr) < today:
                found["overdue"].append((str(nr), *label))
            elif str(nr) <= soon:
                found["upcoming"].append((str(nr), *label))
        if doc.get("type") == "exception" and doc.get("expires") and not doc.get("revoked"):
            if str(doc["expires"]) < today:
                found["expired"].append((str(doc["expires"]), *label))
        # `found` is required on a gap, so a missing one is a schema error that
        # `check` reports. Comparing "" would make it sort as stale and print a
        # row with a blank date, which says nothing true.
        if doc.get("type") == "gap" and is_open_gap(doc) and doc.get("found") \
                and str(doc["found"]) <= stale_before:
            found["stale_gaps"].append((str(doc["found"]), *label))
    for bucket in found.values():
        bucket.sort()
    return found


def _report(title: str, rows: list[tuple], note: str = "") -> None:
    print(f"\n{title} ({len(rows)}):")
    if note:
        print(f"  {note}")
    for when, doc_id, doc_title, path in rows:
        print(f"  {when}  {doc_id}  {doc_title}  ({path})")


def main(strict: bool = False) -> int:
    """Print the report. Returns 1 when something needs attention, else 0.

    That is not an exit code: `cmd_check` decides what a finding means, and
    without ``--strict`` it means a warning.
    """
    reset_warnings()
    documents = scan_documents()
    found = collect(documents)
    # A document that could not be read is not in `documents`, so nothing it
    # says is overdue can be reported. The weekly watch runs only this check.
    warnings = get_warnings()
    reviewable = sum(1 for d in documents if d.get("next_review"))
    print(f"Checked {len(documents)} documents ({reviewable} on a review cycle).")

    if found["upcoming"]:
        _report("Reviews due within 30 days", found["upcoming"])

    attention = found["overdue"] + found["expired"] + found["stale_gaps"]
    if warnings:
        print(f"\nFAILED — {len(warnings)} document(s) could not be read and were "
              f"skipped, so this report is incomplete:")
        for warning in warnings:
            print(f"  {warning}")
        return 1
    if not attention:
        print("\nPASSED — nothing overdue")
        return 0

    print(f"\n{'=' * 60}")
    if found["overdue"]:
        _report("OVERDUE reviews", found["overdue"])
    if found["expired"]:
        _report("EXPIRED exceptions", found["expired"],
                "An expired exception is an unapproved deviation again — renew it, revoke it, or file the gap.")
    if found["stale_gaps"]:
        _report(f"Gaps open more than {stale_gap_days()} days", found["stale_gaps"],
                "Remediate it, or convert it into an approved exception with an expiry.")
    if strict:
        print(f"\nFAILED — {len(attention)} item(s) need attention (--strict)")
    else:
        print(f"\n{len(attention)} item(s) need attention — reported, not failed.")
    return 1
