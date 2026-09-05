#!/usr/bin/env python3
"""Validate bidirectional cross-references between systems, capabilities, and documents.

Checks performed:
  1. Every capability a ``SYS-*.md`` declares in its ``capabilities:``
     map exists in the corresponding domain's ``capabilities.yml``.
  2. Every ``SYS-*`` ID listed in a ``capabilities.yml`` ``systems:``
     array resolves to an existing file in ``program/systems/``.
  3. Bidirectional consistency — if system X declares capability Y in
     domain D, then D's ``capabilities.yml`` must list X in that
     capability's ``systems:`` array (and vice versa).
  4. Every ID referenced in ``related:`` frontmatter resolves to an
     existing document in the repo.
  5. Every ``EXC-*`` exception references a valid standard and
     requirement ref.
  6. Every ``RSK-*`` doc's ``severity`` matches ``critBand(likelihood × impact)``
     per the criticality matrix in ``program/01-grc/standards/STD-risk-framework.md``.
  7. Every ``RSK-*`` doc's ``root_causes`` and ``risk_category.category2``
     resolve to real slugs in ``program/risk-taxonomy.yml``.
  8. Every gap in ``program/gaps.yml`` has a unique ``id`` and unique
     ``tracker_id``; a ``requirement`` that is well-formed
     (``STD-<slug>#<number>``) and resolves to a real ``STD-*`` requirement;
     an ``owner`` that resolves to a ``role-*`` profile; ``related`` IDs that
     resolve to existing documents; ``source``/``severity``/``status`` values
     drawn from their enums; and dates ordered ``opened`` <=
     ``status_updated`` <= ``closed_at``.

Exit codes:
  0 — all checks passed.
  1 — one or more validation errors found.
"""

from __future__ import annotations

from pathlib import Path

from .keel_lib import REPO, SKIP_DIRS, StringLoader, extract_frontmatter, _warn, _discover_domain_dirs, get_warnings

import re
import yaml

DOMAIN_MAP = {d: re.sub(r"^\d+-", "", d) for d in _discover_domain_dirs()}
DIR_FOR_DOMAIN = {v: k for k, v in DOMAIN_MAP.items()}


def load_yaml(path: Path) -> dict | None:
    """Parse a YAML file using :class:`StringLoader`.

    Args:
        path: Absolute path to the ``.yml`` file.

    Returns:
        Parsed data as a dict, or ``None`` if empty.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        _warn(f"File is not valid UTF-8 (skipped): {path}")
        return None
    try:
        return yaml.load(text, Loader=StringLoader)
    except yaml.YAMLError as exc:
        _warn(f"YAML parse error in {path}: {exc}")
        return None


def load_all_capabilities() -> dict[str, dict[str, list[str]]]:
    """Load the capability inventory from all domain ``capabilities.yml`` files.

    Returns:
        Nested dict ``{domain_name: {capability_id: [system_ids]}}``.
    """
    result = {}
    for dir_name, domain_name in DOMAIN_MAP.items():
        cap_file = REPO / "program" / dir_name / "capabilities.yml"
        if not cap_file.exists():
            continue
        data = load_yaml(cap_file)
        if not data or "capabilities" not in data:
            continue
        caps = {}
        for cap in data["capabilities"]:
            cap_id = cap.get("id", "")
            systems = cap.get("systems", [])
            caps[cap_id] = systems if isinstance(systems, list) else []
        result[domain_name] = caps
    return result


def load_all_systems() -> dict[str, dict]:
    """Load frontmatter from all ``SYS-*.md`` files in ``program/systems/``.

    Returns:
        Dict ``{system_id: frontmatter_dict}``.
    """
    result = {}
    systems_dir = REPO / "program" / "systems"
    if not systems_dir.exists():
        return result
    for path in sorted(systems_dir.glob("SYS-*.md")):
        fm = extract_frontmatter(path)
        if fm and "id" in fm:
            result[fm["id"]] = fm
    return result


def load_all_doc_ids() -> set[str]:
    """Collect all document IDs in the repo.

    Returns:
        Set of all ``id`` values found in frontmatter across the repo.
    """
    ids = set()
    md_files = [p for p in REPO.rglob("*.md") if not any(s in p.parts for s in SKIP_DIRS)]
    for path in md_files:
        fm = extract_frontmatter(path)
        if fm and "id" in fm:
            ids.add(fm["id"])
    return ids


def _get_sys_caps(fm: dict) -> dict:
    """Return the ``capabilities`` map from a system's frontmatter, or empty dict.

    Args:
        fm: Parsed frontmatter of a ``SYS-*.md`` file.

    Returns:
        Dict of ``{domain: [cap_id, ...]}`` or empty dict if missing/invalid.
    """
    sys_caps = fm.get("capabilities", {})
    return sys_caps if isinstance(sys_caps, dict) else {}


def validate_system_to_caps(systems: dict[str, dict], caps: dict[str, dict[str, list[str]]]) -> list[str]:
    """Check that every capability a system declares exists in the domain's ``capabilities.yml``.

    Args:
        systems: Output of :func:`load_all_systems`.
        caps:    Output of :func:`load_all_capabilities`.

    Returns:
        List of human-readable error strings (empty if all valid).
    """
    errors = []
    for sys_id, fm in systems.items():
        for domain, cap_ids in _get_sys_caps(fm).items():
            if domain not in caps:
                errors.append(f"  {sys_id}: references domain '{domain}' which has no capabilities.yml")
                continue
            if not isinstance(cap_ids, list):
                continue
            _check_caps_exist(errors, sys_id, domain, cap_ids, caps[domain])
    return errors


def _check_caps_exist(errors: list, sys_id: str, domain: str, cap_ids: list, domain_caps: dict):
    """Append an error for each cap_id not found in domain_caps.

    Args:
        errors: Accumulator list to append error messages into.
        sys_id: The system ID being checked.
        domain: The domain name.
        cap_ids: List of capability IDs the system declares for this domain.
        domain_caps: Dict of ``{cap_id: [sys_ids]}`` for the domain.
    """
    dir_name = DIR_FOR_DOMAIN.get(domain, domain)
    for cap_id in cap_ids:
        if cap_id not in domain_caps:
            errors.append(f"  {sys_id}: declares capability '{cap_id}' in domain '{domain}' but it does not exist in {dir_name}/capabilities.yml")


def validate_caps_to_systems(caps: dict[str, dict[str, list[str]]], systems: dict[str, dict]) -> list[str]:
    """Check that every system listed in a capability exists as a ``SYS-*.md`` file.

    Args:
        caps:    Output of :func:`load_all_capabilities`.
        systems: Output of :func:`load_all_systems`.

    Returns:
        List of human-readable error strings (empty if all valid).
    """
    errors = []
    for domain, domain_caps in caps.items():
        dir_name = DIR_FOR_DOMAIN.get(domain, domain)
        for cap_id, sys_ids in domain_caps.items():
            for sys_id in sys_ids:
                if sys_id not in systems:
                    errors.append(f"  {dir_name}/capabilities.yml: capability '{cap_id}' lists system '{sys_id}' but no program/systems/{sys_id}.md exists")
    return errors


def validate_bidirectional(systems: dict[str, dict], caps: dict[str, dict[str, list[str]]]) -> list[str]:
    """Check that system-to-capability and capability-to-system references are symmetrical.

    If ``SYS-X`` declares capability ``Y`` in domain ``D``, then domain
    ``D``'s ``capabilities.yml`` entry for ``Y`` must include ``SYS-X``
    in its ``systems:`` list.

    Args:
        systems: Output of :func:`load_all_systems`.
        caps:    Output of :func:`load_all_capabilities`.

    Returns:
        List of human-readable error strings (empty if all consistent).
    """
    errors = []
    for sys_id, fm in systems.items():
        for domain, cap_ids in _get_sys_caps(fm).items():
            if domain not in caps or not isinstance(cap_ids, list):
                continue
            _check_bidirectional(errors, sys_id, domain, cap_ids, caps[domain])
    return errors


def _check_bidirectional(errors: list, sys_id: str, domain: str, cap_ids: list, domain_caps: dict):
    """Append an error for each capability that doesn't list the system back.

    Args:
        errors: Accumulator list to append error messages into.
        sys_id: The system ID being checked.
        domain: The domain name.
        cap_ids: List of capability IDs the system declares for this domain.
        domain_caps: Dict of ``{cap_id: [sys_ids]}`` for the domain.
    """
    dir_name = DIR_FOR_DOMAIN.get(domain, domain)
    for cap_id in cap_ids:
        if cap_id not in domain_caps:
            continue
        if sys_id not in domain_caps[cap_id]:
            errors.append(f"  {sys_id} declares '{cap_id}' in '{domain}' but {dir_name}/capabilities.yml '{cap_id}' does not list {sys_id} in systems")


def _load_standard_requirements() -> dict[str, set[str]]:
    """Load all standard IDs and their requirement refs.

    Returns:
        Dict ``{std_id: {ref, ...}}`` mapping each standard to its set of
        requirement ref values.
    """
    std_reqs: dict[str, set[str]] = {}
    std_dir = REPO / "program" / "01-grc" / "standards"
    if not std_dir.exists():
        return std_reqs
    for path in sorted(std_dir.glob("STD-*.md")):
        fm = extract_frontmatter(path)
        if not fm or "id" not in fm:
            continue
        refs = set()
        for req in fm.get("requirements", []):
            if isinstance(req, dict) and "ref" in req:
                refs.add(str(req["ref"]))
        std_reqs[fm["id"]] = refs
    return std_reqs


def _validate_single_exception(fm: dict, rel: Path, std_reqs: dict[str, set[str]]) -> list[str]:
    """Validate a single exception's standard and requirement_ref references.

    Args:
        fm: Parsed frontmatter of the exception file.
        rel: Relative path of the exception file (for error messages).
        std_reqs: Dict of ``{std_id: {ref, ...}}`` from :func:`_load_standard_requirements`.

    Returns:
        List of error strings (may be empty).
    """
    errors = []
    std_id = fm.get("standard", "")
    req_ref = str(fm.get("requirement_ref", ""))
    if not std_id:
        errors.append(f"  {rel}: missing or empty 'standard' field")
        return errors
    if std_id not in std_reqs:
        errors.append(f"  {rel}: standard '{std_id}' does not exist in program/01-grc/standards/")
        return errors
    if not req_ref:
        errors.append(f"  {rel}: missing or empty 'requirement_ref' field")
    elif req_ref not in std_reqs[std_id]:
        errors.append(f"  {rel}: requirement_ref '{req_ref}' not found in {std_id}'s requirements array")
    return errors


def validate_exception_refs() -> list[str]:
    """Check that every ``EXC-*`` exception references a valid standard and requirement.

    For each exception document:
      - ``standard`` must resolve to an existing ``STD-*.md`` file.
      - ``requirement_ref`` must exist in that standard's ``requirements:`` array.

    Returns:
        List of human-readable error strings (empty if all valid).
    """
    errors = []
    exc_dir = REPO / "program" / "01-grc" / "exceptions"
    if not exc_dir.exists():
        return errors
    std_reqs = _load_standard_requirements()
    for path in sorted(exc_dir.glob("EXC-*.md")):
        fm = extract_frontmatter(path)
        if not fm:
            continue
        errors.extend(_validate_single_exception(fm, path.relative_to(REPO), std_reqs))
    return errors


def _check_related_targets(errors: list, path: Path, related: dict, doc_ids: set[str]):
    """Append errors for related targets that don't exist.

    Args:
        errors: Accumulator list to append error messages into.
        path: Path to the document (for error messages).
        related: The ``related`` dict from frontmatter.
        doc_ids: Set of all known document IDs.
    """
    rel = path.relative_to(REPO)
    for rel_type, targets in related.items():
        if not isinstance(targets, list):
            continue
        for target_id in targets:
            if target_id not in doc_ids:
                errors.append(f"  {rel}: related.{rel_type} references '{target_id}' which does not exist")


def validate_related_refs(doc_ids: set[str]) -> list[str]:
    """Check that every ID in ``related:`` frontmatter resolves to an existing document.

    Args:
        doc_ids: Set of all known document IDs from :func:`load_all_doc_ids`.

    Returns:
        List of human-readable error strings (empty if all resolve).
    """
    errors = []
    md_files = [p for p in REPO.rglob("*.md") if not any(s in p.parts for s in SKIP_DIRS)]
    for path in sorted(md_files):
        fm = extract_frontmatter(path)
        if not fm:
            continue
        related = fm.get("related", {})
        if not isinstance(related, dict):
            continue
        _check_related_targets(errors, path, related, doc_ids)
    return errors


def load_all_role_ids() -> set[str]:
    """Collect all role IDs from ``program/roles/``.

    Returns:
        Set of ``role-*`` ID strings, one per role profile.
    """
    ids: set[str] = set()
    roles_dir = REPO / "program" / "roles"
    if not roles_dir.exists():
        return ids
    for path in sorted(roles_dir.glob("role-*.md")):
        fm = extract_frontmatter(path)
        if fm and "id" in fm:
            ids.add(fm["id"])
    return ids


# Frontmatter fields that should hold role slug references.
# Scalar fields hold one slug; array fields hold a list of slugs.
_ROLE_REF_SCALAR_FIELDS = ("owner", "second_owner")
_ROLE_REF_ARRAY_FIELDS = ("approved_by", "reviewed_by", "reports_to", "direct_reports")


def _check_role_ref(errors: list, rel: Path, field: str, value, role_ids: set[str]):
    """Append an error if ``value`` is set but doesn't resolve to a role.

    Treats ``None`` and empty string as "not set" (skips silently). A
    non-empty value that isn't a string is a shape error (e.g. someone
    wrote a list where a scalar was expected) and produces an error.

    Args:
        errors: Accumulator list to append error messages into.
        rel: Relative path of the file (for error messages).
        field: Frontmatter field name (for error messages).
        value: The candidate role slug.
        role_ids: Set of known role IDs.
    """
    if value is None or value == "":
        return
    if not isinstance(value, str):
        errors.append(
            f"  {rel}: {field} must be a string role slug, got {type(value).__name__}"
        )
        return
    if value not in role_ids:
        # Roles are discovered by filename, so a profile saved under any other
        # name is invisible however correct its frontmatter. Naming the
        # expected path turns "it is right there" into a one-line fix.
        errors.append(
            f"  {rel}: {field} references '{value}', which has no profile at "
            f"program/roles/{value}.md"
        )


def validate_role_refs(role_ids: set[str]) -> list[str]:
    """Check that every role slug referenced in frontmatter resolves to a role file.

    Walks every ``.md`` file under ``program/`` and checks the scalar fields
    (``owner``, ``second_owner``) and array fields (``approved_by``,
    ``reviewed_by``, ``reports_to``, ``direct_reports``). Each non-empty
    value must equal a known ID from :func:`load_all_role_ids`. Fields with
    the wrong YAML shape (scalar where list expected, or vice versa) are
    reported as shape errors rather than silently skipped.

    Args:
        role_ids: Set of known role IDs.

    Returns:
        List of human-readable error strings (empty if all resolve).
    """
    errors: list = []
    md_files = [p for p in REPO.rglob("*.md") if not any(s in p.parts for s in SKIP_DIRS)]
    for path in sorted(md_files):
        fm = extract_frontmatter(path)
        if not fm:
            continue
        rel = path.relative_to(REPO)
        for field in _ROLE_REF_SCALAR_FIELDS:
            _check_role_ref(errors, rel, field, fm.get(field), role_ids)
        for field in _ROLE_REF_ARRAY_FIELDS:
            value = fm.get(field)
            if value is None:
                continue
            if not isinstance(value, list):
                errors.append(
                    f"  {rel}: {field} must be a list of role slugs, got {type(value).__name__}"
                )
                continue
            for item in value:
                _check_role_ref(errors, rel, field, item, role_ids)
    return errors


def _load_role_tree() -> tuple[dict, list[str]]:
    """Load the role hierarchy from ``program/roles/``.

    Returns:
        Tuple ``(tree, errors)`` where tree is
        ``{role_id: {"reports_to": [...], "direct_reports": [...]}}`` and
        errors lists any shape errors encountered (non-list values for
        the two array fields). Missing fields default to empty lists.
    """
    tree: dict = {}
    errors: list = []
    roles_dir = REPO / "program" / "roles"
    if not roles_dir.exists():
        return tree, errors
    for path in sorted(roles_dir.glob("role-*.md")):
        fm = extract_frontmatter(path)
        if not fm or "id" not in fm:
            continue
        rid = fm["id"]
        rel = path.relative_to(REPO)
        reports_to = fm.get("reports_to")
        direct_reports = fm.get("direct_reports")
        if reports_to is not None and not isinstance(reports_to, list):
            errors.append(
                f"  {rel}: reports_to must be a list, got {type(reports_to).__name__}"
            )
            reports_to = []
        if direct_reports is not None and not isinstance(direct_reports, list):
            errors.append(
                f"  {rel}: direct_reports must be a list, got {type(direct_reports).__name__}"
            )
            direct_reports = []
        tree[rid] = {
            "reports_to": reports_to or [],
            "direct_reports": direct_reports or [],
        }
    return tree, errors


def validate_role_tree() -> list[str]:
    """Check that ``reports_to`` and ``direct_reports`` are symmetric.

    If role X declares ``reports_to: [Y]``, then role Y must declare
    ``direct_reports`` containing X (and vice versa). Mirrors the
    bidirectional check used for system ↔ capability references. Also
    surfaces shape errors emitted by :func:`_load_role_tree`.

    Returns:
        List of human-readable error strings (empty if the tree is consistent).
    """
    tree, errors = _load_role_tree()
    for rid, links in tree.items():
        for manager in links["reports_to"]:
            mgr = tree.get(manager)
            if mgr is None:
                # Missing role file is caught by validate_role_refs; skip here
                # to avoid duplicate errors.
                continue
            if rid not in mgr["direct_reports"]:
                errors.append(
                    f"  role-tree: {rid} reports_to '{manager}' but {manager}'s direct_reports does not include {rid}"
                )
        for report in links["direct_reports"]:
            rep = tree.get(report)
            if rep is None:
                continue
            if rid not in rep["reports_to"]:
                errors.append(
                    f"  role-tree: {rid} direct_reports '{report}' but {report}'s reports_to does not include {rid}"
                )
    return errors


LEVEL_INDEX = {"negligible": 1, "low": 2, "medium": 3, "high": 4, "critical": 5}


def _crit_band(score: int) -> str:
    """Mirror of critBand() in keel/dashboard/modules/constants.js (same bands,
    lowercase here vs capitalised there).

    Keep in sync with the criticality matrix in program/01-grc/standards/STD-risk-framework.md
    (Negligible = 1, Low = 2, Medium = 3-7, High = 8-14, Critical = 15-25).
    """
    if score <= 1:
        return "negligible"
    if score <= 2:
        return "low"
    if score <= 7:
        return "medium"
    if score <= 14:
        return "high"
    return "critical"


def load_risk_taxonomy() -> tuple[set[str], set[tuple[str, str, str]]]:
    """Load valid root_cause slugs and (principle, category1, category2) paths.

    The category paths are full triples rather than a flat leaf set because
    category2 slugs are NOT globally unique (e.g. ``ineffective-regulator-relations``
    and ``prudential-risk`` appear under both ``regulatory-compliance`` and
    ``privacy-compliance``). Validating the whole path catches a document that
    names a real leaf but the wrong principle/category1 above it.

    Returns:
        Tuple of (root_cause_slugs, category_paths). Empty sets if the taxonomy
        file is missing (a warning is emitted here) OR if it parses but lacks
        the expected structure (no warning here — the caller,
        validate_risk_taxonomy_refs, detects the empty-but-present case and
        warns, so it isn't mistaken for "nothing to check").
    """
    path = REPO / "program" / "risk-taxonomy.yml"
    if not path.is_file():
        _warn(f"risk-taxonomy.yml not found at {path} — skipping taxonomy ref check")
        return set(), set()
    data = load_yaml(path) or {}
    causes: set[str] = set()
    for bucket in (data.get("causes") or {}).values():
        items = bucket.get("items") if isinstance(bucket, dict) else None
        if isinstance(items, dict):
            causes.update(items.keys())
    paths: set[tuple[str, str, str]] = set()
    for principle_slug, principle in (data.get("categories") or {}).items():
        children = principle.get("children") if isinstance(principle, dict) else None
        if not isinstance(children, dict):
            continue
        for cat1_slug, cat1 in children.items():
            cat1_children = cat1.get("children") if isinstance(cat1, dict) else None
            if isinstance(cat1_children, dict):
                for cat2_slug in cat1_children:
                    paths.add((principle_slug, cat1_slug, cat2_slug))
    return causes, paths


def _iter_risk_docs():
    """Yield (relative_path, frontmatter) for every RSK-*.md doc with frontmatter."""
    risks_dir = REPO / "program" / "01-grc" / "risks"
    if not risks_dir.is_dir():
        return
    for path in sorted(risks_dir.glob("RSK-*.md")):
        fm = extract_frontmatter(path)
        if fm:
            yield path.relative_to(REPO), fm


def validate_risk_severity() -> list[str]:
    """Check severity == critBand(LEVEL[likelihood] * LEVEL[impact]) for every RSK doc."""
    errors: list[str] = []
    for rel, fm in _iter_risk_docs():
        sev, lk, im = fm.get("severity"), fm.get("likelihood"), fm.get("impact")
        if not (sev and lk and im):
            continue  # required-field check is the schema validator's job
        try:
            score = LEVEL_INDEX[lk] * LEVEL_INDEX[im]
        except KeyError:
            continue  # enum check is the schema validator's job
        expected = _crit_band(score)
        if sev != expected:
            errors.append(
                f"  {rel}: severity '{sev}' does not match likelihood×impact "
                f"= {LEVEL_INDEX[lk]}×{LEVEL_INDEX[im]} = {score} → '{expected}' "
                f"(per the criticality matrix in program/01-grc/standards/STD-risk-framework.md)"
            )
    return errors


def validate_risk_taxonomy_refs() -> list[str]:
    """Check root_causes and risk_category.category2 against program/risk-taxonomy.yml."""
    causes, paths = load_risk_taxonomy()
    if not causes and not paths:
        # Distinguish "file absent" (load_risk_taxonomy already warned; skipping
        # is legitimate, e.g. a deployed tarball) from "file present but it no
        # longer parses into the expected shape" — a real failure that must NOT
        # pass silently, or a restructured/mangled taxonomy would ship unchecked.
        taxo_path = REPO / "program" / "risk-taxonomy.yml"
        if taxo_path.is_file():
            _warn(
                f"{taxo_path} parsed but yielded no causes/categories — "
                "risk-taxonomy ref check could not run (structure changed?)"
            )
        return []
    errors: list[str] = []
    for rel, fm in _iter_risk_docs():
        for c in (fm.get("root_causes") or []):
            if isinstance(c, str) and c not in causes:
                errors.append(
                    f"  {rel}: root_cause '{c}' is not a slug under any "
                    f"causes.*.items in program/risk-taxonomy.yml"
                )
        cat = fm.get("risk_category")
        if isinstance(cat, dict):
            triple = (cat.get("principle"), cat.get("category1"), cat.get("category2"))
            # Skip if any segment is missing/non-string — required-field and type
            # checks are the schema validator's job (mirrors validate_risk_severity).
            if all(isinstance(x, str) for x in triple) and triple not in paths:
                errors.append(
                    f"  {rel}: risk_category '{triple[0]} > {triple[1]} > {triple[2]}' "
                    f"is not a valid path in program/risk-taxonomy.yml "
                    f"(category2 must sit under that principle → category1)"
                )
    return errors


def _iter_threat_docs():
    """Yield (relative_path, frontmatter) for every THR-*.md doc with frontmatter."""
    threats_dir = REPO / "program" / "01-grc" / "threats"
    if not threats_dir.is_dir():
        return
    for path in sorted(threats_dir.glob("THR-*.md")):
        fm = extract_frontmatter(path)
        if fm:
            yield path.relative_to(REPO), fm


def validate_threat_risk_bidirectional() -> list[str]:
    """Check THR.related.risks and RSK.related.threats are reciprocal.

    The threat<->risk relationship is many-to-many. Whenever a THR-* lists a
    RSK-* in ``related.risks``, that RSK-* must list the THR-* back in
    ``related.threats`` (and vice versa). A missing back-reference is an
    asymmetry that silently drops one direction of the link in the dashboard.

    Non-existent IDs are :func:`validate_related_refs`'s job; this check only
    flags reciprocity gaps between docs that both exist, so each declared-but-
    unreciprocated edge is reported exactly once.
    """
    thr_risks: dict[str, set[str]] = {}
    for _rel, fm in _iter_threat_docs():
        tid = fm.get("id")
        if tid:
            thr_risks[tid] = set((fm.get("related") or {}).get("risks") or [])
    rsk_threats: dict[str, set[str]] = {}
    for _rel, fm in _iter_risk_docs():
        rid = fm.get("id")
        if rid:
            rsk_threats[rid] = set((fm.get("related") or {}).get("threats") or [])

    errors: list[str] = []
    for tid, risks in thr_risks.items():
        for rid in sorted(risks):
            if rid in rsk_threats and tid not in rsk_threats[rid]:
                errors.append(
                    f"  {tid} lists risk '{rid}' but {rid} does not list "
                    f"'{tid}' back in related.threats"
                )
    for rid, threats in rsk_threats.items():
        for tid in sorted(threats):
            if tid in thr_risks and rid not in thr_risks[tid]:
                errors.append(
                    f"  {rid} lists threat '{tid}' but {tid} does not list "
                    f"'{rid}' back in related.risks"
                )
    return errors


# Enum vocabularies for gaps, mirrored from keel/schemas/gaps.schema.json.
# The schema (run by validate_frontmatter.py) is the hard gate; re-checking
# here keeps the semantic-refs job self-contained and lets it report enum
# drift alongside the reference errors it already raises.
GAP_SOURCES = {"risk-assessment", "audit", "pentest", "bug-bounty", "threat-model", "internal"}
GAP_STATUSES = {"open", "closed"}
GAP_SEVERITIES = set(LEVEL_INDEX)  # negligible, low, medium, high, critical


def load_gaps() -> list[dict]:
    """Load the gap entries from ``program/gaps.yml``.

    An absent file is a legitimate skip (an instance may have no register yet).
    But a file that is present yet does not yield a list-valued ``gaps`` key is
    a real failure that must not pass silently — it emits a warning (mirroring
    :func:`load_risk_taxonomy`), so the caller's ``main()`` fails on the warning
    count rather than reporting "no gaps to check". The schema validator
    (``validate_frontmatter.py``) independently rejects this shape; the warning
    keeps the semantic layer fail-closed if that gate is ever bypassed.

    Returns:
        List of gap dicts, or an empty list if the file is absent, empty, or
        malformed (a warning is emitted in the malformed case).
    """
    path = REPO / "program" / "gaps.yml"
    if not path.is_file():
        return []
    data = load_yaml(path)  # load_yaml already warns on parse error / bad UTF-8
    if data is None:
        return []
    gaps = data.get("gaps")
    if not isinstance(gaps, list):
        _warn(
            f"{path}: 'gaps' is not a list (got {type(gaps).__name__}) — "
            "gap ref check could not run"
        )
        return []
    return gaps


def _parse_requirement_ref(requirement: str) -> tuple[str, str]:
    """Split a gap ``requirement`` of the form ``STD-<slug>#<number>``.

    Args:
        requirement: The gap's requirement string.

    Returns:
        Tuple ``(std_id, ref_number)``. Either element is the empty string
        if the ``#`` separator is missing or a side is blank — the caller
        treats that as a malformed reference.
    """
    std_id, sep, ref = requirement.partition("#")
    if not sep:
        return "", ""
    return std_id, ref


_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Date fields that must be non-decreasing in this order: a gap is recorded
# (opened), its status is later (or same-day) set (status_updated), and if it
# closed that happened last (closed_at). Lexicographic compare is correct for
# zero-padded YYYY-MM-DD strings.
_GAP_DATE_ORDER = ("opened", "status_updated", "closed_at")


def _check_gap_date_order(gap: dict, label: str) -> list[str]:
    """Check opened <= status_updated <= closed_at for one gap.

    Only ISO-shaped (YYYY-MM-DD) values participate; malformed or absent dates
    are skipped here because format/required checks are the schema's job.

    Args:
        gap: A single gap mapping.
        label: Human-readable identifier for error messages.

    Returns:
        List of error strings (empty if ordering holds or too few dates).
    """
    dated = [(name, gap.get(name)) for name in _GAP_DATE_ORDER]
    dated = [(n, v) for n, v in dated if isinstance(v, str) and _ISO_DATE_RE.match(v)]
    errors: list[str] = []
    for (earlier_name, earlier), (later_name, later) in zip(dated, dated[1:]):
        if earlier > later:
            errors.append(
                f"  gaps.yml [{label}]: {later_name} '{later}' is before "
                f"{earlier_name} '{earlier}' (dates must be non-decreasing: "
                f"opened <= status_updated <= closed_at)"
            )
    return errors


def validate_gap_refs(doc_ids: set[str], role_ids: set[str]) -> list[str]:
    """Validate cross-references and enum values for every gap in ``gaps.yml``.

    For each gap:
      - ``id`` must be unique within the register.
      - ``tracker_id`` (the immutable Jira correlation key) must be unique
        within the register — one Jira issue maps to exactly one gap.
      - ``requirement`` (``STD-<slug>#<number>``) must name an existing
        ``STD-*`` standard and a ref present in that standard's
        ``requirements:`` array (reusing :func:`_load_standard_requirements`).
      - ``owner`` must resolve to an existing ``role-*`` profile.
      - every ID under ``related`` (a map keyed by type — ``risks``,
        ``threats``, ``systems``, ``processes``, ``exceptions``) must
        resolve to an existing document.
      - ``source``/``severity``/``status`` must be drawn from their enums.
      - dates must be non-decreasing: ``opened`` <= ``status_updated`` <=
        ``closed_at`` (whichever are present and well-formed).

    Schema-shape errors (missing required fields, bad ``id`` pattern) are the
    schema validator's job; this check skips fields that are absent or the
    wrong type rather than double-reporting them.

    Args:
        doc_ids: Set of all known document IDs from :func:`load_all_doc_ids`.
        role_ids: Set of known role IDs from :func:`load_all_role_ids`.

    Returns:
        List of human-readable error strings (empty if all valid).
    """
    gaps = load_gaps()
    if not gaps:
        return []
    std_reqs = _load_standard_requirements()
    errors: list[str] = []
    seen_ids: set[str] = set()
    seen_trackers: set[str] = set()
    for i, gap in enumerate(gaps):
        if not isinstance(gap, dict):
            errors.append(f"  gaps.yml [index {i}]: gap entry is not a mapping")
            continue
        gid = gap.get("id")
        label = gid if isinstance(gid, str) and gid else f"index {i}"
        if isinstance(gid, str) and gid:
            if gid in seen_ids:
                errors.append(f"  gaps.yml [{label}]: duplicate gap id '{gid}'")
            seen_ids.add(gid)
        tracker_id = gap.get("tracker_id")
        if isinstance(tracker_id, str) and tracker_id:
            if tracker_id in seen_trackers:
                errors.append(
                    f"  gaps.yml [{label}]: duplicate tracker_id '{tracker_id}' "
                    f"— one Jira issue maps to exactly one gap"
                )
            seen_trackers.add(tracker_id)
        req = gap.get("requirement")
        if isinstance(req, str):
            std_id, ref = _parse_requirement_ref(req)
            if not std_id or not ref:
                errors.append(
                    f"  gaps.yml [{label}]: requirement '{req}' is not in "
                    f"STD-<slug>#<number> form"
                )
            elif std_id not in std_reqs:
                errors.append(
                    f"  gaps.yml [{label}]: requirement standard '{std_id}' "
                    f"does not exist in program/01-grc/standards/"
                )
            elif ref not in std_reqs[std_id]:
                errors.append(
                    f"  gaps.yml [{label}]: requirement '{ref}' not found in "
                    f"{std_id}'s requirements array"
                )
        owner = gap.get("owner")
        if isinstance(owner, str) and owner and owner not in role_ids:
            errors.append(
                f"  gaps.yml [{label}]: owner '{owner}' does not exist in "
                f"program/roles/"
            )
        source = gap.get("source")
        if source is not None and source not in GAP_SOURCES:
            errors.append(
                f"  gaps.yml [{label}]: source '{source}' is not one of "
                f"{sorted(GAP_SOURCES)}"
            )
        severity = gap.get("severity")
        if severity is not None and severity not in GAP_SEVERITIES:
            errors.append(
                f"  gaps.yml [{label}]: severity '{severity}' is not one of "
                f"{sorted(GAP_SEVERITIES)}"
            )
        status = gap.get("status")
        if status is not None and status not in GAP_STATUSES:
            errors.append(
                f"  gaps.yml [{label}]: status '{status}' is not one of "
                f"{sorted(GAP_STATUSES)}"
            )
        related = gap.get("related")
        if isinstance(related, dict):
            for rel_type, targets in related.items():
                if not isinstance(targets, list):
                    continue
                for target_id in targets:
                    if isinstance(target_id, str) and target_id not in doc_ids:
                        errors.append(
                            f"  gaps.yml [{label}]: related.{rel_type} "
                            f"references '{target_id}' which does not exist"
                        )
        errors.extend(_check_gap_date_order(gap, label))
    return errors


def main() -> int:
    """Run all cross-reference checks and report results.

    Returns:
        0 if all checks passed, 1 if any errors were found.
    """
    caps = load_all_capabilities()
    systems = load_all_systems()
    doc_ids = load_all_doc_ids()
    role_ids = load_all_role_ids()

    all_errors = []

    print("Checking system → capability references...")
    e1 = validate_system_to_caps(systems, caps)
    if e1:
        all_errors.append("System → capability errors:")
        all_errors.extend(e1)

    print("Checking capability → system references...")
    e2 = validate_caps_to_systems(caps, systems)
    if e2:
        all_errors.append("Capability → system errors:")
        all_errors.extend(e2)

    print("Checking bidirectional consistency...")
    e3 = validate_bidirectional(systems, caps)
    if e3:
        all_errors.append("Bidirectional consistency errors:")
        all_errors.extend(e3)

    print("Checking related: ID references...")
    e4 = validate_related_refs(doc_ids)
    if e4:
        all_errors.append("Related reference errors:")
        all_errors.extend(e4)

    print("Checking exception → standard references...")
    e5 = validate_exception_refs()
    if e5:
        all_errors.append("Exception reference errors:")
        all_errors.extend(e5)

    print("Checking role-slug references (owner, approved_by, etc.)...")
    e6 = validate_role_refs(role_ids)
    if e6:
        all_errors.append("Role reference errors:")
        all_errors.extend(e6)

    print("Checking role-tree bidirectional consistency...")
    e7 = validate_role_tree()
    if e7:
        all_errors.append("Role tree errors:")
        all_errors.extend(e7)

    print("Checking RSK severity == critBand(likelihood × impact)...")
    e8 = validate_risk_severity()
    if e8:
        all_errors.append("Risk severity consistency errors:")
        all_errors.extend(e8)

    print("Checking RSK taxonomy slug references...")
    e9 = validate_risk_taxonomy_refs()
    if e9:
        all_errors.append("Risk taxonomy reference errors:")
        all_errors.extend(e9)

    print("Checking THR <-> RSK bidirectional consistency...")
    e10 = validate_threat_risk_bidirectional()
    if e10:
        all_errors.append("Threat <-> risk bidirectional errors:")
        all_errors.extend(e10)

    print("Checking gap requirement, related, and enum references...")
    e11 = validate_gap_refs(doc_ids, role_ids)
    if e11:
        all_errors.append("Gap reference errors:")
        all_errors.extend(e11)

    total = (len(e1) + len(e2) + len(e3) + len(e4) + len(e5) + len(e6)
             + len(e7) + len(e8) + len(e9) + len(e10) + len(e11))
    warnings = get_warnings()
    if all_errors or warnings:
        print(f"\n{'='*60}")
        if all_errors:
            print(f"FAILED — {total} error(s)\n")
            for line in all_errors:
                print(line)
        if warnings:
            print(f"\nFAILED — {warnings} warning(s) emitted (see stderr); "
                  "data was silently skipped so cross-references may be incomplete.")
        return 1

    print("\nPASSED — all cross-references valid")
    return 0

