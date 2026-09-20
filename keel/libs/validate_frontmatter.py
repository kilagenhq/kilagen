#!/usr/bin/env python3
"""Validate documents and vocabularies against the JSON schemas, plus layout rules.

Checks performed:
  1. Every ``.md`` under a type folder is validated against
     ``keel/schemas/frontmatter.schema.json``.
  2. Layout: the filename equals the id, the id prefix agrees with the folder,
     and dated types sit under a four-digit year partition while every other
     type sits flat.
  3. No two documents share an ``id``.
  4. Each ``program/model/*.yml`` vocabulary is validated against its schema,
     and ``program/publish.yml`` against the publishing contract schema.
  5. Every ``program/model/frameworks/<id>.yml`` is validated against
     ``keel/schemas/framework-vocab.schema.json``.
  6. Every requirement ``frameworks:`` mapping resolves — the framework id is
     declared in ``config.yml`` and the clause exists in its vocabulary.

Exit codes:
  0 — all checks passed.
  1 — one or more validation errors found.
"""

from __future__ import annotations

import json
import sys

from jsonschema import Draft202012Validator

from . import keel_lib
from .keel_lib import (
    BY_FOLDER,
    YEAR_RE,
    config_framework_ids,
    extract_frontmatter,
    get_warnings,
    load_config,
    load_framework_vocab,
    reset_warnings,
    scan_documents,
    scan_framework_mappings,
    type_of_id,
)


def load_schema(name: str) -> dict:
    """Load and return a JSON Schema from ``keel/schemas/``."""
    # Schemas are framework data, not instance content: they come from the
    # installed package, which has no relation to where the program lives.
    path = keel_lib.KEEL / "schemas" / name
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"ERROR: Schema file not found: {path}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as exc:
        print(f"ERROR: Invalid JSON in {path}: {exc}", file=sys.stderr)
        sys.exit(1)


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
        if spec.get("const") != doc_type:
            continue
        # "type" itself is excluded: it matched, so any error on it is noise
        # from a branch that was never in the running.
        return [e for e in (error.context or [])
                if list(e.schema_path)[:1] == [index] and list(e.path)[:1] != ["type"]]
    return []


def _fields_allowed_for(schema: dict, doc_type: str) -> set:
    """Every field name the schema accepts for one document type.

    Computed from the schema rather than parsed out of an error message, so it
    cannot drift from what is actually validated.
    """
    names: set = set()

    def collect(sub: dict) -> None:
        names.update((sub.get("properties") or {}).keys())
        for item in sub.get("allOf") or []:
            ref = item.get("$ref")
            collect(schema["$defs"][ref.split("/")[-1]] if ref else item)

    for item in schema.get("allOf") or []:
        ref = item.get("$ref")
        collect(schema["$defs"][ref.split("/")[-1]] if ref else item)
    for branch in schema.get("oneOf") or []:
        if ((branch.get("properties") or {}).get("type") or {}).get("const") == doc_type:
            collect(branch)
    return names


def validate_documents(fm_schema: dict) -> list[str]:
    """Validate every document's frontmatter against the schema.

    Returns:
        List of human-readable error strings (empty if all valid).
    """
    validator = Draft202012Validator(fm_schema)
    errors: list[str] = []
    for path in keel_lib.document_files():
        rel = path.relative_to(keel_lib.REPO)
        fm = extract_frontmatter(path)
        if fm is None:
            errors.append(f"  {rel}: no YAML frontmatter — every document in a type folder needs one")
            continue
        if "type" not in fm:
            errors.append(f"  {rel}: frontmatter has no 'type' field")
            continue
        found = sorted(validator.iter_errors(fm), key=lambda e: list(e.path))

        # Does something other than "unknown field" already explain the
        # failure? If so, the unevaluated-properties report is a consequence
        # of it, not a second problem.
        incomplete = any(
            sub.validator != "unevaluatedProperties"
            for error in found if error.validator == "oneOf"
            for sub in _branch_errors(error, fm)
        )

        for error in found:
            if error.validator == "oneOf":
                narrowed = _branch_errors(error, fm)
                if narrowed:
                    for sub in narrowed:
                        field = ".".join(str(p) for p in sub.path) or "(document)"
                        errors.append(f"  {rel}: {field}: {sub.message}")
                    continue
                errors.append(f"  {rel}: 'type: {fm.get('type')}' is not a known document type")
                continue
            if error.validator == "unevaluatedProperties":
                # A branch that failed evaluates none of its properties, so
                # this fires on fields that are perfectly legal. When something
                # else already says what is wrong, it is pure noise; when it is
                # the only failure, only the fields this type really has no
                # place for are worth naming.
                if incomplete:
                    continue
                unknown = sorted(set(fm) - _fields_allowed_for(fm_schema, fm.get("type")))
                if not unknown:
                    continue
                errors.append(
                    f"  {rel}: (document): a {fm.get('type')} has no field "
                    + ", ".join(f"'{name}'" for name in unknown)
                )
                continue
            field = ".".join(str(p) for p in error.path) or "(document)"
            errors.append(f"  {rel}: {field}: {error.message}")
    return errors


# For a dated type, the frontmatter field that says when it opened — the year
# its partition has to match. An exception has no single such date (it is
# approved, not found), so its year folder is checked for shape only.
OPENED_FIELD = {"gap": "found", "incident": "occurred"}


def validate_layout() -> list[str]:
    """Check the three rules that tie a document to where it is stored.

    The filename is the id, the prefix agrees with the folder, and the year
    partition is a property of the type rather than a choice — a dated type is
    always one year directory deep, every other type is always flat.
    """
    errors: list[str] = []
    program = keel_lib.PROGRAM
    if not program.is_dir():
        return errors

    for entry in sorted(program.iterdir()):
        if entry.is_dir() and entry.name not in BY_FOLDER and entry.name not in keel_lib.NON_DOCUMENT_DIRS:
            errors.append(
                f"  program/{entry.name}/: not a document type. A folder names a type and "
                "nothing else — classify with a facet instead"
            )

    for path in keel_lib.document_files():
        rel = path.relative_to(keel_lib.REPO)
        parts = path.relative_to(program).parts
        folder, inner = parts[0], parts[1:]
        doc_type = BY_FOLDER[folder]

        stem = path.stem
        fm = extract_frontmatter(path) or {}
        doc_id = fm.get("id")
        if doc_id and doc_id != stem:
            errors.append(f"  {rel}: id '{doc_id}' does not match the filename '{stem}.md'")

        id_type = type_of_id(stem)
        if id_type is None:
            errors.append(f"  {rel}: filename carries no known type prefix")
        elif id_type is not doc_type:
            errors.append(
                f"  {rel}: a '{id_type.prefix}-' id does not belong in {folder}/ — "
                f"it belongs in {id_type.folder}/"
            )

        depth = len(inner) - 1  # directories between the type folder and the file
        if doc_type.dated:
            if depth != 1 or not YEAR_RE.match(inner[0]):
                errors.append(
                    f"  {rel}: {folder}/ is a dated type — every document sits under its "
                    "year, e.g. " + f"{folder}/2026/{stem}.md"
                )
            else:
                # The partition is not decorative: it must be the year the
                # document opened, which is a field the type already carries.
                opened_field = OPENED_FIELD.get(doc_type.name)
                opened = fm.get(opened_field) if opened_field else None
                if opened and str(opened)[:4] != inner[0]:
                    errors.append(
                        f"  {rel}: filed under {inner[0]}/ but {opened_field} says "
                        f"{str(opened)[:4]}"
                    )
        elif depth != 0:
            errors.append(
                f"  {rel}: {folder}/ takes no subfolders — a subfolder may only ever mean a "
                "year partition, and only for dated types"
            )
    return errors


def validate_id_uniqueness() -> list[str]:
    """No two documents may share an id, whatever their type or folder."""
    seen: dict[str, str] = {}
    errors: list[str] = []
    for doc in scan_documents():
        doc_id = doc.get("id")
        if not doc_id:
            continue
        if doc_id in seen:
            errors.append(f"  duplicate id '{doc_id}': {seen[doc_id]} and {doc['path']}")
        else:
            seen[doc_id] = doc["path"]
    return errors


_VOCABULARIES = (
    ("model/domains.yml", "model-domains.schema.json", True),
    ("model/capabilities.yml", "model-capabilities.schema.json", True),
    ("model/systems.yml", "model-systems.schema.json", False),
    ("model/risk-taxonomy.yml", "model-risk-taxonomy.schema.json", False),
    ("publish.yml", "publish.schema.json", False),
)


def validate_vocabularies() -> list[str]:
    """Validate the closed vocabularies and the publishing contract."""
    errors: list[str] = []
    for rel_name, schema_name, required in _VOCABULARIES:
        path = keel_lib.PROGRAM / rel_name
        if not path.is_file():
            if required:
                errors.append(f"  program/{rel_name}: missing — the facets are validated against it")
            continue
        data = keel_lib._load_yaml(path)
        if data is None:
            continue  # _load_yaml already warned
        validator = Draft202012Validator(load_schema(schema_name))
        for error in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
            field = ".".join(str(p) for p in error.path) or "(file)"
            errors.append(f"  program/{rel_name}: {field}: {error.message}")
    return errors


def validate_schedule(schema: dict) -> list[str]:
    """Validate program/schedule.yml, and resolve what it points at.

    The file is optional — a program with no recurring activities is
    legitimate — but one that exists must be right: it carries role and
    document references, and until now nothing checked either.
    """
    path = keel_lib.PROGRAM / "schedule.yml"
    if not path.is_file():
        return []
    data = keel_lib._load_yaml(path)
    if data is None:
        return []
    errors: list[str] = []
    validator = Draft202012Validator(schema)
    for error in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
        field = ".".join(str(p) for p in error.path) or "(file)"
        errors.append(f"  program/schedule.yml: {field}: {error.message}")
    if errors:
        # The reference checks below would report noise on a file that does
        # not even have the right shape.
        return errors

    known = {doc["id"] for doc in keel_lib.scan_documents() if doc.get("id")}
    domains = {d["id"] for d in keel_lib.load_model()["domains"] if isinstance(d.get("id"), str)}
    seen: set[str] = set()
    for activity in data.get("activities") or []:
        aid = activity.get("id", "?")
        if aid in seen:
            errors.append(f"  program/schedule.yml: duplicate activity id '{aid}'")
        seen.add(aid)
        owner = activity.get("owner")
        if owner and owner not in known:
            errors.append(f"  program/schedule.yml: {aid}: owner '{owner}' resolves to no role document")
        domain = activity.get("domain")
        if domain and domain not in domains:
            errors.append(f"  program/schedule.yml: {aid}: domain '{domain}' is not in model/domains.yml")
        for ref in activity.get("related") or []:
            if ref not in known:
                errors.append(f"  program/schedule.yml: {aid}: related '{ref}' resolves to no document")
    return errors


def validate_risk_severity() -> list[str]:
    """A risk's severity must be the band its own scores fall into.

    The rule used to be asserted by a test that parsed a markdown table out of
    a standard, and it died in the refactor without anyone noticing. Now the
    bands are vocabulary, so the rule belongs in the validator: severity is
    derived, and a hand-typed one that disagrees with the scores is the whole
    class of error this catches.
    """
    model = keel_lib.load_model()
    severity = keel_lib.severity_model(model)
    if not severity:
        return []
    errors: list[str] = []
    axis_lengths = {len(severity.get("likelihood") or []), len(severity.get("impact") or [])}
    if len(axis_lengths) > 1:
        errors.append("  model/risk-taxonomy.yml: likelihood and impact must have the "
                      "same number of points — the matrix is square")
    for doc in keel_lib.scan_documents():
        if doc.get("type") != "risk":
            continue
        likelihood = keel_lib.severity_point(doc.get("likelihood"), severity.get("likelihood"))
        impact = keel_lib.severity_point(doc.get("impact"), severity.get("impact"))
        if likelihood is None or impact is None:
            # Unscored, or scored with a word the axis does not define. The
            # schema decides whether the fields are required; a value that is
            # not on the axis is reported by the schema, not here.
            continue
        expected = keel_lib.severity_band(likelihood * impact, severity)
        if expected is None:
            errors.append(f"  {doc['id']}: score {likelihood * impact} falls in no band "
                          "in model/risk-taxonomy.yml")
        elif doc.get("severity") != expected:
            errors.append(f"  {doc['id']}: severity is '{doc.get('severity')}' but "
                          f"{likelihood} x {impact} = {likelihood * impact} bands as "
                          f"'{expected}'. Severity is derived, never typed.")
    return errors


def validate_framework_vocab(schema: dict) -> list[str]:
    """Validate every framework vocabulary this program can see.

    That is the shipped catalogue plus the instance's own overrides. A broken
    shipped file is our defect and a broken override is the user's, so both
    are reported — with the path saying which is which.
    """
    errors: list[str] = []
    validator = Draft202012Validator(schema)
    for fw_id, path in sorted(keel_lib.framework_files().items()):
        data = keel_lib._load_yaml(path)
        if data is None:
            continue
        shipped = path.parent == keel_lib.SHIPPED_FRAMEWORKS
        where = f"keel/content/frameworks/{path.name}" if shipped else f"program/model/frameworks/{path.name}"
        for error in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
            field = ".".join(str(p) for p in error.path) or "(file)"
            errors.append(f"  {where}: {field}: {error.message}")
    return errors


def validate_config(schema: dict) -> list[str]:
    """Validate program/config.yml against its schema.

    It is the file every other check reads — the frameworks in scope come from
    here — and until now it was the largest thing under program/ that nothing
    validated. A `binding:` nobody recognises is the cheap case; a typo in
    `schema_version` is not.
    """
    path = keel_lib.PROGRAM / "config.yml"
    if not path.is_file():
        return []
    data = keel_lib._load_yaml(path)
    if data is None:
        return ["  program/config.yml: is empty"]
    errors = []
    validator = Draft202012Validator(schema)
    for error in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
        field = ".".join(str(p) for p in error.path) or "(file)"
        errors.append(f"  program/config.yml: {field}: {error.message}")
    return errors


def validate_file_coverage() -> list[str]:
    """Report a file under program/ that no validator claims.

    Not "it is invalid" — "nothing here knows what it is", which is the state
    schedule.yml was in when a whole refactor passed it by.
    """
    return [
        f"  program/{name}: no validator claims this file. Either it belongs to "
        f"a document type folder, or the model has to learn about it"
        for name in keel_lib.unrecognised_program_files()
    ]


def validate_frameworks_resolve() -> list[str]:
    """Every framework declared in config.yml must resolve to a vocabulary.

    An id that resolves to nothing used to be skipped in silence, which meant
    a typo cost you a whole framework's coverage and said nothing. Now that
    the product ships the vocabularies, an unresolvable id is almost always a
    misspelling of one we have — so the message lists what is available.
    """
    available = keel_lib.framework_files()
    errors: list[str] = []
    for fw_id in keel_lib.config_framework_ids(keel_lib.load_config()):
        if fw_id in available:
            continue
        errors.append(
            f"  config.yml: framework '{fw_id}' resolves to no vocabulary. "
            f"Shipped with kilagen: {', '.join(sorted(available)) or '(none)'}. "
            f"To add your own, create program/model/frameworks/{fw_id}.yml"
        )
    return errors


def validate_framework_coverage_refs() -> list[str]:
    """Forward check: every requirement framework mapping must resolve.

    Each ``frameworks:`` key must be a framework declared in ``config.yml``, and
    each clause must appear in that framework's vocabulary.
    """
    config_ids = set(config_framework_ids(load_config()))
    vocab = load_framework_vocab()
    errors: list[str] = []
    for r in scan_framework_mappings(scan_documents()):
        fw, clause = r["fw"], r["clause"]
        if fw not in config_ids:
            errors.append(
                f"  {r['std_id']} req {r['ref']}: framework '{fw}' is not declared "
                "in program/config.yml"
            )
            continue
        if clause not in vocab.get(fw, []):
            source = keel_lib.framework_files().get(fw)
            where = f"{fw}.yml" if source is None else (
                f"keel/content/frameworks/{fw}.yml (shipped)"
                if source.parent == keel_lib.SHIPPED_FRAMEWORKS
                else f"program/model/frameworks/{fw}.yml"
            )
            errors.append(
                f"  {r['std_id']} req {r['ref']}: clause '{fw}:{clause}' resolves "
                f"to no entry in {where}"
            )
    return errors


_CHECKS = (
    ("Validating configuration", lambda schemas: validate_config(schemas["config"])),
    ("Checking every file is claimed by a validator", lambda schemas: validate_file_coverage()),
    ("Validating frontmatter", lambda schemas: validate_documents(schemas["frontmatter"])),
    ("Checking layout", lambda schemas: validate_layout()),
    ("Checking id uniqueness", lambda schemas: validate_id_uniqueness()),
    ("Validating vocabularies", lambda schemas: validate_vocabularies()),
    ("Validating framework vocabularies", lambda schemas: validate_framework_vocab(schemas["vocab"])),
    ("Resolving frameworks in scope", lambda schemas: validate_frameworks_resolve()),
    ("Validating the schedule", lambda schemas: validate_schedule(schemas["schedule"])),
    ("Checking risk severity against the matrix", lambda schemas: validate_risk_severity()),
    ("Checking framework references", lambda schemas: validate_framework_coverage_refs()),
)


def main() -> int:
    """Run every check and report. Returns 0 when clean, 1 otherwise."""
    reset_warnings()  # scope the warning counter to this run, not the process
    schemas = {
        "frontmatter": load_schema("frontmatter.schema.json"),
        "vocab": load_schema("framework-vocab.schema.json"),
        "schedule": load_schema("schedule.schema.json"),
        "config": load_schema("config.schema.json"),
    }

    all_errors: list[str] = []
    total = 0
    for label, check in _CHECKS:
        print(f"{label}...")
        found = check(schemas)
        if found:
            all_errors.append(f"{label.replace('Validating', 'Validation').replace('Checking', 'Check')} errors:")
            all_errors.extend(found)
            total += len(found)

    warnings = get_warnings()
    if all_errors or warnings:
        print(f"\n{'=' * 60}")
        if all_errors:
            print(f"FAILED — {total} error(s)\n")
            for line in all_errors:
                print(line)
        if warnings:
            print(f"\nFAILED — {warnings} warning(s) emitted (see stderr); "
                  "data was silently skipped so validation may be incomplete.")
        return 1

    print("\nPASSED — all documents valid")
    return 0
