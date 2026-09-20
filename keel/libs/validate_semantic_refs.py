#!/usr/bin/env python3
"""Referential checks — the rules a JSON Schema cannot express.

The schema decides whether a field is well formed. This decides whether what
it names actually exists:

  1. Facets (``domains``, ``capabilities``, ``systems``) resolve to the closed
     vocabularies in ``program/model/``.
  2. The vocabularies are internally coherent — a capability's id is namespaced
     under a domain that exists, and agrees with its own ``domain:``.
  3. Every id in ``related``, ``supersedes`` and ``excepted_by`` resolves to
     a document that exists.
  4. Every role reference (``owner``, ``approved_by``, ``reviewed_by``,
     ``requested_by``, ``reports_to``) resolves to a role document.
  5. A gap's or an exception's ``requirement:`` resolves to a requirement that
     really exists inside that standard.
  6. Every ``publish:`` value names a destination declared in ``publish.yml``,
     and every default is keyed by a real document type.
  7. Write-once dates are ordered, and no document closes before it opened.
  8. ``program/`` holds no binaries — the repository is the record, and
     evidence lives behind a link.

Exit codes:
  0 — all references resolve.
  1 — one or more broken references found.
"""

from __future__ import annotations

from . import keel_lib
from .keel_lib import (
    BY_NAME,
    REQUIREMENT_RE,
    get_warnings,
    load_model,
    load_publish,
    model_ids,
    requirement_index,
    reset_warnings,
    scan_documents,
    type_of_id,
)

# Frontmatter fields that must name a role document.
_ROLE_FIELDS = ("owner", "reports_to", "requested_by")
_ROLE_LIST_FIELDS = ("approved_by", "reviewed_by")

# Extensions that are text as far as a security program is concerned. Anything
# else under program/ is treated as an artifact that belongs in storage.
# Extensions a text file may carry. "" covers .gitkeep and friends, whose
# whole name is the suffix — they are sniffed like everything else. ".css" is
# there for the one stylesheet a program may own, program/branding.css.
_TEXT_SUFFIXES = {".md", ".yml", ".yaml", ".json", ".txt", ".csv", ".css", ".gitkeep", ""}


def check_facets(documents: list[dict], model: dict) -> list[str]:
    """Every facet value must exist in its vocabulary."""
    ids = model_ids(model)
    errors: list[str] = []
    for doc in documents:
        for facet in ("domains", "capabilities", "systems"):
            values = doc.get(facet) or []
            if not isinstance(values, list):
                continue
            for value in values:
                if value not in ids[facet]:
                    errors.append(
                        f"  {doc['path']}: {facet}: '{value}' is not in "
                        f"program/model/{facet}.yml"
                    )
    return errors


def check_vocabulary_coherence(model: dict) -> list[str]:
    """The vocabularies must agree with themselves.

    A capability is namespaced ``<domain>.<capability>``, which is what makes
    it unique across the program — so the prefix has to be a domain that
    exists, and it has to be the same domain the entry declares.
    """
    domains = {d["id"] for d in model["domains"] if isinstance(d.get("id"), str)}
    errors: list[str] = []
    for cap in model["capabilities"]:
        cap_id = cap.get("id")
        if not isinstance(cap_id, str) or "." not in cap_id:
            continue
        prefix = cap_id.split(".", 1)[0]
        if prefix not in domains:
            errors.append(
                f"  model/capabilities.yml: '{cap_id}' is namespaced under "
                f"domain '{prefix}', which is not in domains.yml"
            )
        elif cap.get("domain") != prefix:
            errors.append(
                f"  model/capabilities.yml: '{cap_id}' declares domain "
                f"'{cap.get('domain')}' but its id says '{prefix}'"
            )
    return errors


def check_relations(documents: list[dict]) -> list[str]:
    """Ids in related / supersedes / excepted_by must resolve.

    The list is flat, so the target's type comes from its prefix — which is
    precisely why it cannot disagree with itself the way a grouped mapping could.
    """
    known = {doc["id"] for doc in documents if doc.get("id")}
    errors: list[str] = []
    for doc in documents:
        refs: list[str] = []
        for field in ("related", "supersedes"):
            value = doc.get(field) or []
            if isinstance(value, list):
                refs.extend(value)
            else:
                errors.append(
                    f"  {doc['path']}: {field}: expected a flat list of ids, got "
                    f"{type(value).__name__}"
                )
        if doc.get("excepted_by"):
            refs.append(doc["excepted_by"])
        for ref in refs:
            if not isinstance(ref, str):
                continue
            if type_of_id(ref) is None:
                errors.append(f"  {doc['path']}: '{ref}' carries no known type prefix")
            elif ref not in known:
                errors.append(f"  {doc['path']}: '{ref}' resolves to no document")
    return errors


def check_roles(documents: list[dict]) -> list[str]:
    """Ownership is expressed by roles, so every role reference must exist."""
    roles = {doc["id"] for doc in documents if doc.get("type") == "role"}
    errors: list[str] = []
    for doc in documents:
        refs = [(f, doc.get(f)) for f in _ROLE_FIELDS if doc.get(f)]
        for field in _ROLE_LIST_FIELDS:
            value = doc.get(field) or []
            if isinstance(value, list):
                refs.extend((field, v) for v in value)
        for field, ref in refs:
            if isinstance(ref, str) and ref not in roles:
                errors.append(
                    f"  {doc['path']}: {field}: '{ref}' resolves to no role in program/roles/"
                )
    return errors


def check_requirements(documents: list[dict]) -> list[str]:
    """A gap or exception must point at a requirement that exists.

    This is the hard edge of the triangle: a shortfall with no written
    requirement behind it cannot be filed, because either the standard is
    missing or the thing was a risk, not a gap.
    """
    index = requirement_index(documents)
    errors: list[str] = []
    for doc in documents:
        if doc.get("type") not in ("gap", "exception"):
            continue
        ref = doc.get("requirement")
        if not isinstance(ref, str):
            continue
        match = REQUIREMENT_RE.match(ref)
        if not match:
            errors.append(f"  {doc['path']}: requirement: '{ref}' is not <standard-id>#<ref>")
            continue
        if ref not in index:
            std_id = match.group(1)
            known = sorted(k.split("#", 1)[1] for k in index if k.startswith(std_id + "#"))
            detail = f"{std_id} has {', '.join(known)}" if known else f"{std_id} has no requirements, or does not exist"
            errors.append(f"  {doc['path']}: requirement: '{ref}' resolves to nothing — {detail}")
    return errors


def check_publishing(documents: list[dict], publish: dict) -> list[str]:
    """Every publish target must be a destination the contract declares."""
    declared = set(publish["destinations"])
    errors: list[str] = []
    for doc_type in publish["defaults"]:
        if doc_type not in BY_NAME:
            errors.append(f"  publish.yml: defaults: '{doc_type}' is not a document type")
    for doc_type, targets in publish["defaults"].items():
        for target in targets or []:
            if target not in declared:
                errors.append(
                    f"  publish.yml: defaults.{doc_type}: '{target}' is not a declared destination"
                )
    for doc in documents:
        value = doc.get("publish")
        if not isinstance(value, list):
            continue  # "none" / "all" / absent need no destination to exist
        for target in value:
            if target not in declared:
                errors.append(
                    f"  {doc['path']}: publish: '{target}' is not a destination "
                    "declared in program/publish.yml"
                )
    return errors


_DATE_ORDER = (
    ("last_reviewed", "next_review"),
    ("found", "remediated"),
    ("occurred", "resolved"),
    ("decided", "superseded_on"),
)


def check_dates(documents: list[dict]) -> list[str]:
    """A document may not close before it opened."""
    errors: list[str] = []
    for doc in documents:
        for earlier, later in _DATE_ORDER:
            a, b = doc.get(earlier), doc.get(later)
            if a and b and str(b) < str(a):
                errors.append(f"  {doc['path']}: {later} ({b}) is before {earlier} ({a})")
    return errors


# How much of a file to read before deciding whether it is text. The same
# trick file(1) uses: binary content betrays itself almost immediately.
_SNIFF_BYTES = 8192


def _looks_binary(path: Path) -> bool:
    """Decide from the content, not from the name.

    An extension is a claim, and this check exists precisely for the case
    where the claim is wrong — deliberately or by accident.
    """
    try:
        with path.open("rb") as handle:
            head = handle.read(_SNIFF_BYTES)
    except OSError:
        return False  # unreadable is a different problem, reported elsewhere
    if b"\x00" in head:
        return True
    try:
        head.decode("utf-8")
    except UnicodeDecodeError as exc:
        # A multi-byte character split by the read boundary is not binary.
        return exc.end < len(head) - 4
    return False


def check_no_binaries() -> list[str]:
    """The repository holds the record, not the evidence.

    Anything voluminous lives in external storage and is reached through an
    ``evidence:`` link, so a binary under ``program/`` is a mistake that a
    clone pays for forever.

    Two ways in, both closed here. An unexpected extension is refused on the
    name alone. A *familiar* extension is still opened and sniffed, because
    naming a PNG ``evidence.md`` is the obvious way around a check that only
    reads names — and so is giving it no extension at all, which the text
    allowlist used to wave through.
    """
    errors: list[str] = []
    program = keel_lib.PROGRAM
    if not program.is_dir():
        return errors
    for path in sorted(program.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(keel_lib.REPO)
        if path.suffix.lower() not in _TEXT_SUFFIXES:
            errors.append(
                f"  {rel}: binaries do not belong in program/ — "
                "link it from an evidence: entry instead"
            )
        elif _looks_binary(path):
            errors.append(
                f"  {rel}: the extension says text but the content is binary — "
                "link it from an evidence: entry instead"
            )
    return errors


def check_risk_taxonomy(documents: list[dict], model: dict) -> list[str]:
    """Risks classify against the taxonomy, so their citations must resolve."""
    taxonomy = model.get("risk_taxonomy") or {}
    if not taxonomy:
        return []
    categories = taxonomy.get("categories") or {}
    causes = taxonomy.get("causes") or {}
    cause_slugs = {
        slug
        for group in causes.values() if isinstance(group, dict)
        for slug in (group.get("items") or group.get("children") or {})
    }
    errors: list[str] = []
    for doc in documents:
        if doc.get("type") != "risk":
            continue
        category = doc.get("risk_category")
        if isinstance(category, dict):
            principle = categories.get(category.get("principle"))
            level1 = (principle or {}).get("children", {}).get(category.get("category1")) if principle else None
            level2 = (level1 or {}).get("children", {}) if isinstance(level1, dict) else {}
            if principle is None or level1 is None or category.get("category2") not in level2:
                errors.append(
                    f"  {doc['path']}: risk_category does not resolve to a path in "
                    "program/model/risk-taxonomy.yml"
                )
        for slug in doc.get("root_causes") or []:
            if slug not in cause_slugs:
                errors.append(
                    f"  {doc['path']}: root_causes: '{slug}' is not in the taxonomy's causes"
                )
    return errors


def main() -> int:
    """Run every referential check and report. Returns 0 when clean, 1 otherwise."""
    reset_warnings()
    documents = scan_documents()
    model = load_model()
    publish = load_publish()

    groups = (
        ("Facet references", check_facets(documents, model)),
        ("Vocabulary coherence", check_vocabulary_coherence(model)),
        ("Document relations", check_relations(documents)),
        ("Role references", check_roles(documents)),
        ("Requirement references", check_requirements(documents)),
        ("Publishing contract", check_publishing(documents, publish)),
        ("Date ordering", check_dates(documents)),
        ("Risk taxonomy references", check_risk_taxonomy(documents, model)),
        ("Binaries in program/", check_no_binaries()),
    )

    print(f"Checking {len(documents)} documents...")
    total = sum(len(errs) for _, errs in groups)
    warnings = get_warnings()

    if total or warnings:
        print(f"\n{'=' * 60}")
        if total:
            print(f"FAILED — {total} broken reference(s)\n")
            for label, errs in groups:
                if errs:
                    print(f"{label}:")
                    for line in errs:
                        print(line)
                    print()
        if warnings:
            print(f"FAILED — {warnings} warning(s) emitted (see stderr); "
                  "data was silently skipped so validation may be incomplete.")
        return 1

    print("\nPASSED — all references resolve")
    return 0
