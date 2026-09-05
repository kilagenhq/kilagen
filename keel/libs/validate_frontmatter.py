#!/usr/bin/env python3
"""Validate frontmatter and registry YAML against JSON schemas, plus referential checks.

Checks performed:
  1. Every .md file with a ``type`` field in its frontmatter is validated
     against ``keel/schemas/frontmatter.schema.json``.
  2. Every ``capabilities.yml`` in a domain folder is validated against
     ``keel/schemas/capabilities.schema.json``.
  3. ``program/gaps.yml`` is validated against
     ``keel/schemas/gaps.schema.json``.
  4. Every ``program/frameworks/<id>.yml`` is validated against
     ``keel/schemas/framework-vocab.schema.json``.
  5. No two ``.md`` documents share the same ``id`` value. (Gap ``id``
     uniqueness within ``program/gaps.yml`` is enforced separately in
     ``validate_semantic_refs.py``.)
  6. Every requirement ``frameworks:`` mapping resolves — each framework id is
     declared in ``config.yml`` and each clause exists in that framework's
     vocabulary (``program/frameworks/<id>.yml``).

Exit codes:
  0 — all checks passed.
  1 — one or more validation errors found.
"""

from __future__ import annotations

import json
import sys

import yaml
from jsonschema import Draft202012Validator

from .keel_lib import (
    KEEL,
    REPO,
    SKIP_DIRS,
    StringLoader,
    config_framework_ids,
    extract_frontmatter,
    get_warnings,
    load_config,
    load_framework_vocab,
    reset_warnings,
    scan_framework_mappings,
)


def load_schema(name: str) -> dict:
    """Load and return a JSON Schema from ``keel/schemas/``.

    Args:
        name: File name relative to ``keel/schemas/``, e.g.
              ``"frontmatter.schema.json"``.

    Returns:
        Parsed JSON Schema as a dict.
    """
    # Schemas are framework data, not instance content: they come from the
    # installed package, which has no relation to where the program lives.
    path = KEEL / "schemas" / name
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"ERROR: Schema file not found: {path}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as exc:
        print(f"ERROR: Invalid JSON in {path}: {exc}", file=sys.stderr)
        sys.exit(1)


def load_yaml(text: str) -> dict | None:
    """Parse a YAML string using :class:`StringLoader`.

    Args:
        text: Raw YAML content.

    Returns:
        Parsed data as a dict, or ``None`` if the content is empty.

    Raises:
        yaml.YAMLError: If the YAML content is malformed.
    """
    return yaml.load(text, Loader=StringLoader)


def _branch_errors(error, fm: dict) -> list:
    """Narrow a top-level ``oneOf`` failure to the branch the document meant.

    The schema is seventeen document types in a ``oneOf``, so a single wrong
    field reports as "is not valid under any of the given schemas" with the
    whole frontmatter echoed back — every other branch also failed, for the
    uninteresting reason that the document is not a policy, a risk, or a
    vendor. The branch whose ``type`` const matches is the one the author
    intended, and only its errors describe the actual mistake.
    """
    branches = (error.schema or {}).get("oneOf") or []
    doc_type = fm.get("type")
    for index, branch in enumerate(branches):
        spec = (branch.get("properties") or {}).get("type") or {}
        if spec.get("const") != doc_type and doc_type not in (spec.get("enum") or []):
            continue
        # "type" itself is excluded: it matched, so any error on it is noise
        # from a branch that was never in the running.
        return [e for e in (error.context or [])
                if list(e.schema_path)[:1] == [index] and list(e.path)[:1] != ["type"]]
    return []


def validate_frontmatter(fm_schema: dict) -> list[str]:
    """Validate every ``.md`` frontmatter against the frontmatter JSON Schema.

    Only files whose frontmatter contains a ``type`` field are checked
    (plain markdown files without structured frontmatter are ignored).

    Args:
        fm_schema: The parsed ``frontmatter.schema.json``.

    Returns:
        List of human-readable error strings (empty if all valid).
    """
    validator = Draft202012Validator(fm_schema)
    errors = []
    md_files = [p for p in REPO.rglob("*.md") if not any(s in p.parts for s in SKIP_DIRS)]
    for path in sorted(md_files):
        try:
            fm = extract_frontmatter(path, raise_on_error=True)
        except yaml.YAMLError as exc:
            errors.append(f"  {path.relative_to(REPO)}: YAML parse error — {exc}")
            continue
        if fm is None or "type" not in fm:
            continue
        for e in validator.iter_errors(fm):
            for reported in _branch_errors(e, fm) or [e]:
                field = ".".join(str(p) for p in reported.absolute_path) \
                    if reported.absolute_path else "(root)"
                errors.append(f"  {path.relative_to(REPO)}: {field} — {reported.message}")
    return errors


def validate_capabilities(cap_schema: dict) -> list[str]:
    """Validate every domain ``capabilities.yml`` against the capabilities JSON Schema.

    Skips files inside ``keel/`` and other non-domain directories.

    Args:
        cap_schema: The parsed ``capabilities.schema.json``.

    Returns:
        List of human-readable error strings (empty if all valid).
    """
    validator = Draft202012Validator(cap_schema)
    errors = []
    for cap_file in sorted(REPO.rglob("capabilities.yml")):
        if any(s in cap_file.parts for s in SKIP_DIRS):
            continue
        try:
            data = load_yaml(cap_file.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            errors.append(f"  {cap_file.relative_to(REPO)}: YAML parse error — {exc}")
            continue
        if data is None:
            errors.append(f"  {cap_file.relative_to(REPO)}: empty file")
            continue
        errs = list(validator.iter_errors(data))
        for e in errs:
            field = ".".join(str(p) for p in e.absolute_path) if e.absolute_path else "(root)"
            errors.append(f"  {cap_file.relative_to(REPO)}: {field} — {e.message}")
    return errors


def validate_gaps(gap_schema: dict) -> list[str]:
    """Validate ``program/gaps.yml`` against the gaps JSON Schema.

    The gaps register is a single instance-level file; it is optional (an
    instance with no register yet simply has no file to check).

    Args:
        gap_schema: The parsed ``gaps.schema.json``.

    Returns:
        List of human-readable error strings (empty if valid or absent).
    """
    gaps_file = REPO / "program" / "gaps.yml"
    if not gaps_file.exists():
        return []
    validator = Draft202012Validator(gap_schema)
    errors = []
    try:
        data = load_yaml(gaps_file.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        return [f"  {gaps_file.relative_to(REPO)}: YAML parse error — {exc}"]
    if data is None:
        return [f"  {gaps_file.relative_to(REPO)}: empty file"]
    for e in validator.iter_errors(data):
        field = ".".join(str(p) for p in e.absolute_path) if e.absolute_path else "(root)"
        errors.append(f"  {gaps_file.relative_to(REPO)}: {field} — {e.message}")
    return errors


def validate_framework_vocab(vocab_schema: dict) -> list[str]:
    """Validate every ``program/frameworks/<id>.yml`` against the vocab JSON Schema.

    The framework vocabularies are an optional registry (a fresh program may
    have none). When present, each must be a mapping with a unique-string
    ``clauses`` list and no stray keys — the schema enforces the shape that
    ``load_framework_vocab`` otherwise has to defend against at runtime.

    Args:
        vocab_schema: The parsed ``framework-vocab.schema.json``.

    Returns:
        List of human-readable error strings (empty if valid or absent).
    """
    validator = Draft202012Validator(vocab_schema)
    errors = []
    fw_dir = REPO / "program" / "frameworks"
    if not fw_dir.is_dir():
        return errors
    for f in sorted(fw_dir.glob("*.yml")):
        try:
            data = load_yaml(f.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            errors.append(f"  {f.relative_to(REPO)}: YAML parse error — {exc}")
            continue
        if data is None:
            errors.append(f"  {f.relative_to(REPO)}: empty file")
            continue
        for e in validator.iter_errors(data):
            field = ".".join(str(p) for p in e.absolute_path) if e.absolute_path else "(root)"
            errors.append(f"  {f.relative_to(REPO)}: {field} — {e.message}")
    return errors


def validate_id_uniqueness() -> list[str]:
    """Check that no two documents in the repo share the same ``id``.

    Scans all ``.md`` files (excluding templates) and reports any
    duplicate ``id`` values found in frontmatter.

    Returns:
        List of human-readable error strings (empty if all unique).
    """
    ids: dict[str, str] = {}
    errors = []
    md_files = [p for p in REPO.rglob("*.md") if not any(s in p.parts for s in SKIP_DIRS)]
    for path in sorted(md_files):
        try:
            fm = extract_frontmatter(path, raise_on_error=True)
        except yaml.YAMLError:
            continue  # already reported by validate_frontmatter
        if fm is None or "id" not in fm:
            continue
        doc_id = fm["id"]
        rel = str(path.relative_to(REPO))
        if doc_id in ids:
            errors.append(f"  Duplicate ID '{doc_id}': {ids[doc_id]} and {rel}")
        else:
            ids[doc_id] = rel
    return errors


def _check_framework_mappings(errors: list, records: list, config_ids: set, vocab: dict) -> None:
    """Append errors for requirement framework mappings that don't resolve.

    Args:
        errors: Accumulator list, appended in place.
        records: ``{std_id, ref, fw, clause}`` mappings from
            ``scan_framework_mappings``.
        config_ids: Set of framework ids declared in ``config.yml``.
        vocab: Clause vocabularies from ``load_framework_vocab``.
    """
    for r in records:
        fw, clause = r["fw"], r["clause"]
        if fw not in config_ids:
            errors.append(
                f"  {r['std_id']} req {r['ref']}: unknown framework '{fw}' "
                "(not in config.yml frameworks)"
            )
            continue
        if clause not in vocab.get(fw, []):
            errors.append(
                f"  {r['std_id']} req {r['ref']}: clause '{fw}:{clause}' resolves "
                f"to no entry in program/frameworks/{fw}.yml"
            )


def validate_framework_coverage_refs() -> list[str]:
    """Forward check: every requirement framework mapping must resolve.

    Each ``frameworks:`` key must be a framework declared in ``config.yml``, and
    each clause must appear in that framework's vocabulary
    (``program/frameworks/<id>.yml``).

    Returns:
        List of human-readable error strings (empty if all valid).
    """
    config_ids = set(config_framework_ids(load_config()))
    vocab = load_framework_vocab()
    errors: list[str] = []
    _check_framework_mappings(errors, scan_framework_mappings(), config_ids, vocab)
    return errors


def main() -> int:
    """Run all validation checks and report results.

    Returns:
        0 if all checks passed, 1 if any errors were found.
    """
    reset_warnings()  # scope the warning counter to this run, not the process
    fm_schema = load_schema("frontmatter.schema.json")
    cap_schema = load_schema("capabilities.schema.json")
    gap_schema = load_schema("gaps.schema.json")
    vocab_schema = load_schema("framework-vocab.schema.json")

    all_errors = []

    print("Validating frontmatter...")
    fm_errors = validate_frontmatter(fm_schema)
    if fm_errors:
        all_errors.append("Frontmatter validation errors:")
        all_errors.extend(fm_errors)

    print("Validating capabilities.yml...")
    cap_errors = validate_capabilities(cap_schema)
    if cap_errors:
        all_errors.append("Capabilities validation errors:")
        all_errors.extend(cap_errors)

    print("Validating gaps.yml...")
    gap_errors = validate_gaps(gap_schema)
    if gap_errors:
        all_errors.append("Gaps validation errors:")
        all_errors.extend(gap_errors)

    print("Validating framework vocabularies...")
    vocab_errors = validate_framework_vocab(vocab_schema)
    if vocab_errors:
        all_errors.append("Framework vocabulary validation errors:")
        all_errors.extend(vocab_errors)

    print("Checking ID uniqueness...")
    id_errors = validate_id_uniqueness()
    if id_errors:
        all_errors.append("ID uniqueness errors:")
        all_errors.extend(id_errors)

    print("Checking framework coverage references...")
    fw_ref_errors = validate_framework_coverage_refs()
    if fw_ref_errors:
        all_errors.append("Framework reference errors:")
        all_errors.extend(fw_ref_errors)

    warnings = get_warnings()
    if all_errors or warnings:
        print(f"\n{'='*60}")
        if all_errors:
            print(f"FAILED — {len(fm_errors) + len(cap_errors) + len(gap_errors) + len(vocab_errors) + len(id_errors) + len(fw_ref_errors)} error(s)\n")
            for line in all_errors:
                print(line)
        if warnings:
            print(f"\nFAILED — {warnings} warning(s) emitted (see stderr); "
                  "data was silently skipped so validation may be incomplete.")
        return 1

    print("\nPASSED — all documents valid")
    return 0

