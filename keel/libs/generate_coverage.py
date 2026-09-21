#!/usr/bin/env python3
"""Compute framework coverage — the one coverage this program is allowed to claim.

Coverage against a framework is computable honestly because the denominator is
external and finite: the framework publishes its clause list, and "which
requirement covers clause 8" has a true answer inside the repository.

What it reports per clause is which requirements map to it and, through those
requirements, which gaps are open and which exceptions are live. What it never
reports is whether the clause is *met* — that is a human judgement, and the
generator asserts a single posture, ``not-assessed``, and only where nothing
maps at all.

Pure computation: nothing here writes a file. The site build and the index
generator consume the result.
"""

from __future__ import annotations

from .keel_lib import (
    config_framework_ids,
    is_live_exception,
    is_open_gap,
    requirement_index,
    scan_framework_mappings,
)


def build_requirement_state(documents: list[dict]) -> dict[str, dict]:
    """Index every requirement with the gaps and exceptions filed against it.

    Returns:
        ``{requirement_key: {standard, ref, text, frameworks, gaps, exceptions}}``
        where ``gaps`` holds the ids of gaps still open and ``exceptions`` the
        ids of exceptions still live.
    """
    state = {
        key: {**value, "gaps": [], "exceptions": []}
        for key, value in requirement_index(documents).items()
    }
    for doc in documents:
        ref = doc.get("requirement")
        if not isinstance(ref, str) or ref not in state:
            continue
        if doc.get("type") == "gap" and is_open_gap(doc):
            state[ref]["gaps"].append(doc["id"])
        elif doc.get("type") == "exception" and is_live_exception(doc):
            state[ref]["exceptions"].append(doc["id"])
    for entry in state.values():
        entry["gaps"].sort()
        entry["exceptions"].sort()
    return state


def build_coverage(config: dict, documents: list[dict], vocab: dict[str, list[str]]) -> dict:
    """Classify every in-scope clause and attach what stands against it.

    A framework is covered only when it is both in scope (declared in
    ``config.yml``) and has a clause vocabulary; one without a vocabulary is
    skipped rather than flattered by a shrunken denominator.

    Returns:
        ``{framework_id: {clause_ref: {coverage, requirements, gaps, exceptions}}}``,
        clauses sorted lexicographically for stable diffs.
    """
    state = build_requirement_state(documents)

    inbound: dict[str, dict[str, list[str]]] = {}
    for record in scan_framework_mappings(documents):
        key = f"{record['std_id']}#{record['ref']}"
        inbound.setdefault(record["fw"], {}).setdefault(record["clause"], []).append(key)

    coverage: dict[str, dict] = {}
    for fw_id in config_framework_ids(config):
        clauses = vocab.get(fw_id)
        if not clauses:
            # Deliberate: coverage stays silent and `kilagen check` is what
            # names an unresolvable id as an error. The case this does not
            # cover — a vocabulary file that exists and fails to parse — warns
            # through keel_lib, and build_site checks those warnings after
            # loading rather than before.
            continue
        mapped = inbound.get(fw_id, {})
        entries: dict[str, dict] = {}
        for ref in sorted(set(clauses)):
            requirements = sorted(set(mapped.get(ref, [])))
            if not requirements:
                entries[ref] = {"coverage": "unmapped", "posture": "not-assessed",
                                "requirements": [], "gaps": [], "exceptions": []}
                continue
            gaps = sorted({g for key in requirements for g in state.get(key, {}).get("gaps", [])})
            exceptions = sorted({e for key in requirements for e in state.get(key, {}).get("exceptions", [])})
            entries[ref] = {"coverage": "mapped", "requirements": requirements,
                            "gaps": gaps, "exceptions": exceptions}
        coverage[fw_id] = entries

    return coverage


def summarize(coverage: dict) -> dict[str, dict[str, int]]:
    """Counts per framework, for the build's one-line report."""
    summary = {}
    for fw_id, clauses in coverage.items():
        summary[fw_id] = {
            "clauses": len(clauses),
            "mapped": sum(1 for c in clauses.values() if c["coverage"] == "mapped"),
            "contested": sum(1 for c in clauses.values() if c["gaps"] or c["exceptions"]),
        }
    return summary
