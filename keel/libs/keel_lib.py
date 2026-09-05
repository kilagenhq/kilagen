"""Shared helpers for kilagen scripts."""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

import yaml


class StringLoader(yaml.SafeLoader):
    """YAML loader that preserves dates as strings.

    Without this, PyYAML coerces ISO dates (e.g. ``2026-06-15``) to
    ``datetime`` objects, which breaks string-based date comparisons
    used by ``check_reviews.py`` and registry generation.
    """
    pass


StringLoader.yaml_implicit_resolvers = {
    k: [(t, r) for t, r in v if t != "tag:yaml.org,2002:timestamp"]
    for k, v in StringLoader.yaml_implicit_resolvers.items()
}

# The framework's own files are located relative to this module, so they are
# found both from an installed package and from an editable install of the
# source tree. Never derive instance paths from here: once installed, this
# points into site-packages.
KEEL = Path(__file__).resolve().parent.parent


def _discover_repo() -> Path:
    """Locate the instance repository root, walking up from the working directory.

    A repository is marked by ``program/config.yml`` (an instantiated program)
    or, failing that, ``.git`` (a repository not instantiated yet — the
    framework's own checkout matches here). Falls back to the working
    directory, where the validators report the absent ``program/`` themselves.
    """
    cwd = Path.cwd().resolve()
    for candidate in (cwd, *cwd.parents):
        if (candidate / "program" / "config.yml").is_file():
            return candidate
        if (candidate / ".git").exists():
            return candidate
    return cwd


REPO = _discover_repo()
PROGRAM = REPO / "program"

def _discover_domain_dirs() -> list[str]:
    """Return sorted list of domain directory names (e.g. ``["01-grc", ...]``).

    Evaluated lazily on first call to avoid crashing at import time if
    ``program/`` does not exist yet.
    """
    if not PROGRAM.is_dir():
        return []
    return sorted(
        d.name for d in PROGRAM.iterdir()
        if d.is_dir() and re.match(r"\d{2}-", d.name)
    )

SKIP_FILES = {"README.md", "capabilities.yml", "registry.md", "registry.json"}
SKIP_DIRS = {".git", ".github", "node_modules", ".claude", "keel", "_migration", "evidence", "_site"}

_DEFAULT_CONFIG = {"name": "Security Program", "repo": ""}

_warnings = 0

def _warn(msg: str):
    """Print a warning to stderr and increment the global warning counter."""
    global _warnings
    _warnings += 1
    print(f"  WARNING: {msg}", file=sys.stderr)


def get_warnings() -> int:
    """Return the number of warnings emitted via _warn since the last reset.

    Validator entry points should treat a non-zero count as a failure: a
    warning means data was silently skipped (e.g. unparsable YAML), so
    downstream checks ran against an incomplete view of the repo.
    """
    return _warnings


def reset_warnings() -> None:
    """Reset the warning counter to zero.

    Entry-point ``main()`` functions call this on entry so the "non-zero
    warnings = this run skipped data" contract is per-run rather than
    per-process. Without it, an in-process caller that runs two validators
    back-to-back would see the first run's warnings leak into the second.
    """
    global _warnings
    _warnings = 0

# Fields always present in every document entry (with empty-string default).
_CORE_FIELDS = ("id", "title", "type", "domain", "status", "description", "owner", "last_reviewed", "next_review")

# Optional fields copied as-is from frontmatter when present (truthy check).
_OPTIONAL_FIELDS = (
    "lenses", "related", "applies_to", "domains", "capabilities", "capability",
    "category", "vendor", "deployment", "severity", "likelihood", "impact",
    "gap_link", "version", "approved_by", "immutable", "vendor_name", "tier",
    "certifications", "standard",
    "requirement_ref", "expires", "risk_severity", "requested_by",
    "decision_date", "incident_date", "resolved_date",
    "governance", "managed_externally", "classification",
    "retention_justification", "business_function",
    "priority", "priority_rationale",
    "second_owner", "role_type", "team", "reports_to", "direct_reports",
    "reviewed_by",
    "treatment", "control_effectiveness", "root_causes", "risk_category",
)

# Optional fields where False/0/null is a valid value, so we check `is not None`.
_OPTIONAL_FIELDS_NULLABLE = ("regulator_reportable", "pii", "customer_facing", "retention_years", "rto")


def extract_frontmatter(path: Path, *, raise_on_error: bool = False) -> dict | None:
    """Extract YAML frontmatter from a markdown file.

    Args:
        path: Absolute path to the markdown file.
        raise_on_error: If True, let ``yaml.YAMLError`` propagate instead
            of logging a warning and returning None. Useful for validation
            scripts that need to report parse errors inline.

    Returns:
        Parsed frontmatter as a dict, or None if the file has no valid
        frontmatter block.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        _warn(f"File is not valid UTF-8 (skipped): {path}")
        return None
    if not text.startswith("---"):
        return None
    try:
        end = text.index("---", 3)
    except ValueError:
        _warn(f"File has opening '---' but no closing '---' (skipped): {path}")
        return None
    try:
        return yaml.load(text[3:end], Loader=StringLoader)
    except yaml.YAMLError as exc:
        if raise_on_error:
            raise
        _warn(f"YAML parse error in {path}: {exc}")
        return None


def _extract_frameworks(requirements: list) -> dict:
    """Build a frameworks index from a list of requirement dicts.

    Args:
        requirements: The ``requirements`` list from a standard's frontmatter.
            Each item may be a dict with a ``frameworks`` mapping of
            ``{fw_key: [clause, ...]}``.

    Returns:
        Dict keyed by framework key (e.g. ``"nist_csf"``), with lists of
        clause strings as values.
    """
    frameworks: dict[str, list] = {}
    for req in requirements:
        if not isinstance(req, dict):
            continue
        for fw_key, clauses in req.get("frameworks", {}).items():
            frameworks.setdefault(fw_key, []).extend(clauses)
    return frameworks


def _build_entry(path: Path, fm: dict) -> dict:
    """Build a document entry dict from a file path and its parsed frontmatter.

    Args:
        path: Path to the markdown file, relative to ``program/``.
        fm: Parsed YAML frontmatter dict.

    Returns:
        Document metadata dict with core fields, optional fields, and
        derived frameworks index.
    """
    entry = {"path": str(path)}
    for key in _CORE_FIELDS:
        entry[key] = fm.get(key, "")
    for key in _OPTIONAL_FIELDS:
        if fm.get(key):
            entry[key] = fm[key]
    for key in _OPTIONAL_FIELDS_NULLABLE:
        if fm.get(key) is not None:
            entry[key] = fm[key]
    if fm.get("requirements"):
        entry["requirements"] = fm["requirements"]
        entry["frameworks"] = _extract_frameworks(fm["requirements"])
    return entry


def scan_documents() -> list[dict]:
    """Scan program/ for all .md documents with frontmatter.

    Walks the ``program/`` tree, extracts frontmatter from every ``.md`` file
    that has a ``type`` field, and returns a flat list of metadata dicts.
    Skips README.md, capabilities.yml, and generated files.

    Returns:
        List of dicts, one per document. Each dict contains at minimum:
        path, id, title, type, domain, status. Optional fields (lenses,
        requirements, related, etc.) are included when present.
    """
    docs = []
    for root, dirs, files in os.walk(PROGRAM):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in sorted(files):
            if not f.endswith(".md") or f in SKIP_FILES:
                continue
            path = Path(root) / f
            fm = extract_frontmatter(path)
            if not fm or "type" not in fm:
                continue
            docs.append(_build_entry(path.relative_to(PROGRAM), fm))
    return docs


def scan_capabilities() -> dict:
    """Scan all capabilities.yml files in domain directories.

    Returns:
        Dict keyed by domain directory name (e.g. ``"01-grc"``). Each value
        is the parsed YAML content of that domain's ``capabilities.yml``,
        which includes a ``capabilities`` list and a ``domain`` string.
    """
    caps = {}
    for d in _discover_domain_dirs():
        cap_file = PROGRAM / d / "capabilities.yml"
        if not cap_file.exists():
            continue
        try:
            data = yaml.load(cap_file.read_text(encoding="utf-8"), Loader=StringLoader)
        except yaml.YAMLError as exc:
            _warn(f"YAML parse error in {cap_file}: {exc}")
            continue
        if data and data.get("capabilities"):
            caps[d] = data
    return caps


def scan_lenses() -> dict:
    """Scan keel/lenses/ for lens taxonomy files.

    Returns:
        Dict keyed by lens id (e.g. ``"nist"``). Each value is the
        parsed YAML content including ``functions`` with nested ``categories``.
    """
    lenses = {}
    lenses_dir = KEEL / "content" / "lenses"
    if not lenses_dir.exists():
        return lenses
    for f in sorted(lenses_dir.iterdir()):
        if f.suffix != ".yml":
            continue
        try:
            data = yaml.load(f.read_text(encoding="utf-8"), Loader=StringLoader)
        except yaml.YAMLError as exc:
            _warn(f"YAML parse error in {f}: {exc}")
            continue
        if data and data.get("id"):
            lenses[data["id"]] = data
    return lenses


def load_framework_vocab(frameworks_dir: Path | None = None) -> dict[str, list[str]]:
    """Load clause vocabularies from ``program/frameworks/<id>.yml``.

    Each file is keyed by its filename stem (the framework id, matching a
    ``config.yml`` framework id) and holds a flat ``clauses:`` list of clause
    reference strings — the authoritative clause set for that framework edition.
    Reference-not-copy: clause refs only; the text lives at the framework's
    ``url`` in ``config.yml``.

    Args:
        frameworks_dir: Directory to scan. Defaults to ``program/frameworks/``.
            Injectable for testing.

    Returns:
        Dict keyed by framework id, value the list of clause-ref strings.
    """
    if frameworks_dir is None:
        frameworks_dir = PROGRAM / "frameworks"
    vocab: dict[str, list[str]] = {}
    if not frameworks_dir.is_dir():
        return vocab
    for f in sorted(frameworks_dir.iterdir()):
        if f.suffix != ".yml":
            continue
        try:
            data = yaml.load(f.read_text(encoding="utf-8"), Loader=StringLoader)
        except yaml.YAMLError as exc:
            _warn(f"YAML parse error in {f}: {exc}")
            continue
        if data is not None and not isinstance(data, dict):
            # A bare list/scalar at the top level would otherwise crash on
            # .get(); flag it and treat as no vocab (fail-closed) rather than
            # raising an uncaught AttributeError.
            _warn(f"{f.name}: top level is {type(data).__name__}, expected a "
                  "mapping with a 'clauses:' list — skipped")
            vocab[f.stem] = []
            continue
        clauses = (data or {}).get("clauses", [])
        if clauses is None:
            clauses = []
        if not isinstance(clauses, list):
            # A string/dict here would be iterated char-by-char / key-by-key,
            # fabricating phantom clauses with no warning. Refuse it.
            _warn(f"{f.name}: 'clauses' is {type(clauses).__name__}, expected a "
                  "list of clause-ref strings — skipped")
            vocab[f.stem] = []
            continue
        refs = []
        for c in clauses:
            if not isinstance(c, str):
                _warn(f"{f.name}: clause {c!r} is {type(c).__name__}, not a quoted "
                      "string — quote it (e.g. \"13.60\") to avoid numeric collapse")
            refs.append(str(c))
        vocab[f.stem] = refs
    return vocab


def scan_framework_mappings(standards_dir: Path | None = None) -> list[dict]:
    """Extract every requirement ``frameworks:`` mapping from the standards.

    The single mapping extraction, reused by the coverage generator and the
    forward referential check — there is no second parser.

    Args:
        standards_dir: Directory of ``STD-*.md``. Defaults to
            ``program/01-grc/standards/``. Injectable for testing.

    Returns:
        List of ``{std_id, ref, fw, clause}`` records — one per
        (requirement, framework, clause).
    """
    if standards_dir is None:
        standards_dir = PROGRAM / "01-grc" / "standards"
    records: list[dict] = []
    if not standards_dir.is_dir():
        return records
    for path in sorted(standards_dir.glob("STD-*.md")):
        fm = extract_frontmatter(path)
        if not fm:
            continue
        std_id = fm.get("id", path.stem)
        for req in fm.get("requirements", []) or []:
            if not isinstance(req, dict):
                continue
            ref = str(req.get("ref", ""))
            frameworks = req.get("frameworks")
            if frameworks is None:
                continue
            if not isinstance(frameworks, dict):
                _warn(f"{std_id} req {ref}: 'frameworks' is "
                      f"{type(frameworks).__name__}, expected a mapping "
                      "{id: [clauses]} — skipped")
                continue
            for fw, clauses in frameworks.items():
                if isinstance(clauses, str):
                    clauses = [clauses]  # tolerate a single-clause scalar shorthand
                elif not isinstance(clauses, list):
                    _warn(f"{std_id} req {ref}: framework '{fw}' value is "
                          f"{type(clauses).__name__}, expected a list of clause "
                          "refs — skipped")
                    continue
                for clause in clauses:
                    records.append({"std_id": std_id, "ref": ref, "fw": fw, "clause": str(clause)})
    return records


def compute_coverage_map(in_scope_ids: list[str], vocab: dict[str, list[str]],
                         inbound: dict[str, set]) -> dict:
    """Classify each in-scope clause as mapped or unmapped.

    A framework is covered only when it is both in scope (declared in
    ``config.yml``) and has a vocab file. A clause is ``mapped`` when at least
    one requirement maps to it, else ``unmapped`` with ``posture: not-assessed``
    — the only posture a generator may assert.

    Args:
        in_scope_ids: Framework ids declared in config.yml.
        vocab: Clause vocabularies from ``load_framework_vocab``.
        inbound: ``{framework_id: {clause refs mapped by some requirement}}``.

    Returns:
        ``{framework_id: {clause_ref: {coverage, [posture]}}}`` — clauses sorted
        lexicographically by ref string (for stable diffs, not numeric order),
        frameworks in ``in_scope_ids`` order. Frameworks without vocab are
        skipped; the caller is expected to warn about those.
    """
    coverage: dict[str, dict] = {}
    for fw_id in in_scope_ids:
        clauses = vocab.get(fw_id)
        if not clauses:
            continue
        mapped = inbound.get(fw_id, set())
        entries: dict[str, dict] = {}
        for ref in sorted(set(clauses)):
            if ref in mapped:
                entries[ref] = {"coverage": "mapped"}
            else:
                entries[ref] = {"coverage": "unmapped", "posture": "not-assessed"}
        coverage[fw_id] = entries
    return coverage


def config_framework_ids(config: dict) -> list[str]:
    """Return the in-scope framework ids declared in ``config.yml``.

    The single definition of "in scope", shared by the coverage generator and
    the forward referential check so the two cannot diverge. Malformed entries
    (non-dict, or missing ``id``) are skipped.

    Args:
        config: Parsed ``config.yml`` (as returned by ``load_config``).

    Returns:
        List of framework ids, in ``config.yml`` order.
    """
    return [f["id"] for f in (config.get("frameworks") or [])
            if isinstance(f, dict) and "id" in f]


def load_config() -> dict:
    """Load program/config.yml.

    Returns:
        Dict with at least ``name`` and ``repo`` keys. Falls back to
        sensible defaults if the file is missing or unparsable.
    """
    cfg_path = PROGRAM / "config.yml"
    if not cfg_path.exists():
        return _DEFAULT_CONFIG
    try:
        data = yaml.load(cfg_path.read_text(encoding="utf-8"), Loader=StringLoader)
        return data or _DEFAULT_CONFIG
    except yaml.YAMLError as exc:
        _warn(f"YAML parse error in {cfg_path}: {exc}")
        return _DEFAULT_CONFIG


def load_schedule() -> list[dict]:
    """Load program/schedule.yml — recurring security activities.

    Returns:
        List of activity dicts, or empty list if file is missing.
    """
    sched_path = PROGRAM / "schedule.yml"
    if not sched_path.exists():
        return []
    try:
        data = yaml.load(sched_path.read_text(encoding="utf-8"), Loader=StringLoader)
    except UnicodeDecodeError:
        _warn(f"File is not valid UTF-8 (skipped): {sched_path}")
        return []
    except yaml.YAMLError as exc:
        _warn(f"YAML parse error in {sched_path}: {exc}")
        return []
    except OSError as exc:
        _warn(f"Could not read {sched_path}: {exc}")
        return []
    if not data:
        return []
    activities = data.get("activities", [])
    if not isinstance(activities, list):
        _warn(f"schedule.yml 'activities' must be a list, got {type(activities).__name__}")
        return []
    return activities


THREATS_DIR_REL = (PROGRAM / "01-grc" / "threats").relative_to(REPO).as_posix()


def _git(args: list[str], *, warn_on_error: bool = True) -> str | None:
    """Run a git command in the repo, returning stdout or None on failure.

    Returns None on FileNotFoundError (git binary missing — legitimate for
    deployed tarballs) or CalledProcessError (git returned non-zero — stderr
    is logged via _warn to surface real failures like corrupt packs or
    missing refs). Other exceptions propagate.

    Pass ``warn_on_error=False`` for probes where a non-zero exit is an
    expected answer rather than a failure.
    """
    try:
        out = subprocess.run(
            ["git", "-C", str(REPO), *args],
            capture_output=True, text=True, check=True,
        )
        return out.stdout
    except FileNotFoundError:
        return None
    except subprocess.CalledProcessError as exc:
        if not warn_on_error:
            return None
        detail = (exc.stderr or "").strip() or f"rc={exc.returncode}"
        _warn(f"git {' '.join(args)} failed: {detail}")
        return None


def _parse_frontmatter_text(text: str | None, *, context: str = "<text>") -> dict | None:
    """Parse YAML frontmatter from raw markdown text (e.g. ``git show`` output).

    Args:
        text: Raw markdown content.
        context: Identifier surfaced in warnings, e.g. ``"THR-foo.md@abc1234"``,
            so a parse failure inside historical git data can be traced back
            to the commit and file that produced it.
    """
    if not text or not text.startswith("---"):
        return None
    try:
        end = text.index("---", 3)
    except ValueError:
        _warn(f"Frontmatter has opening '---' but no closing '---' (skipped): {context}")
        return None
    try:
        return yaml.load(text[3:end], Loader=StringLoader)
    except yaml.YAMLError as exc:
        _warn(f"YAML parse error in {context}: {exc}")
        return None


def load_threat_history() -> list[dict]:
    """Reconstruct threat priority/severity rankings over time from git history.

    Walks commits that touched ``program/01-grc/threats/`` (oldest first) and,
    at each commit, reads every ``THR-*.md``'s ``priority``/``severity``/``title``
    via ``git show``. Emits one snapshot per commit where the priority ranking
    actually changed — commits that left the ranking unchanged are collapsed.

    Returns:
        Ordered list of ``{"date", "commit", "threats": {id: {...}}}`` snapshots,
        or an empty list if git is unavailable (e.g. a deployed tarball) or no
        threat history exists. The view treats an empty list as "baseline only".
    """
    snapshots: list[dict] = []
    prev_key = None

    # An unborn HEAD — a repository with no commits yet — has no history to
    # reconstruct. That is the normal state right after 'kilagen init', so it
    # must not count as skipped data; warning here would fail the first build.
    if _git(["rev-parse", "--verify", "--quiet", "HEAD"], warn_on_error=False) is None:
        return snapshots

    # --first-parent: follow only mainline commits, so reconstruction matches what
    # reviewers actually merged. Without it, --reverse over a non-linear log can
    # emit interleaved branch-side states that never existed on main.
    log = _git(["log", "--reverse", "--first-parent", "--format=%H|%cI", "--", THREATS_DIR_REL])
    if not log:
        # Stay silent only when git is genuinely unavailable (deployed tarball).
        # If .git exists yet the log returned nothing, _git already warned via
        # CalledProcessError; we don't double-warn here.
        return snapshots
    for line in log.strip().splitlines():
        if "|" not in line:
            continue
        commit, iso = line.split("|", 1)
        tree = _git(["ls-tree", "-r", "--name-only", commit, THREATS_DIR_REL])
        if tree is None:
            # ls-tree failing for a commit the log just listed is an inconsistency
            # (corrupt pack, missing object). _git already warned with the git
            # stderr; skip this commit's snapshot rather than emit a partial one.
            continue
        threats: dict[str, dict] = {}
        read_failed = False
        for path in tree.strip().splitlines():
            name = path.rsplit("/", 1)[-1]
            if not (name.startswith("THR-") and name.endswith(".md")):
                continue
            raw = _git(["show", f"{commit}:{path}"])
            if raw is None:
                # git is present (log/ls-tree succeeded) yet a file it just listed
                # could not be read — skip the whole commit rather than emit a
                # snapshot with a missing threat, which would key the ranking on
                # a partial set and fabricate a spurious move/retirement.
                # _git already warned via CalledProcessError.
                read_failed = True
                break
            fm = _parse_frontmatter_text(raw, context=f"{path}@{commit[:7]}")
            # No priority is legitimate for commits predating the priority field —
            # the threat is simply unranked then, so it is absent from the ranking.
            if not fm or fm.get("priority") is None:
                continue
            tid = fm.get("id") or name[:-3]
            threats[tid] = {
                "priority": fm.get("priority"),
                "severity": fm.get("severity"),
                "title": fm.get("title") or tid,
                "rationale": fm.get("priority_rationale"),
            }
        if read_failed or not threats:
            continue
        # Collapse no-op commits: key on the id->priority ranking.
        key = tuple(sorted((tid, t["priority"]) for tid, t in threats.items()))
        if key == prev_key:
            continue
        prev_key = key
        snapshots.append({"date": iso[:10], "commit": commit[:7], "threats": threats})
    return snapshots


def compute_coverage(caps_for_cat: list[dict], docs_for_cat: list[dict]) -> str:
    """Compute coverage status for a single lens category.

    Args:
        caps_for_cat: Capabilities tagged with this category's lens tag.
        docs_for_cat: Documents tagged with this category's lens tag.

    Returns:
        One of ``"covered"``, ``"partial"``, or ``"gap"`` based on capability
        maturity levels and document statuses.
    """
    levels = []
    for c in caps_for_cat:
        mat = c.get("maturity", "L0-none")
        try:
            levels.append(int(mat[1]))
        except (IndexError, ValueError):
            levels.append(0)

    active_docs = sum(1 for d in docs_for_cat if d.get("status") == "active")
    non_active_docs = sum(1 for d in docs_for_cat if d.get("status") != "active")

    if levels:
        if all(l >= 2 for l in levels):
            return "covered"
        if all(l == 0 for l in levels):
            return "partial" if active_docs > 0 else "gap"
        return "partial"

    if active_docs > 0:
        return "covered"
    if non_active_docs > 0:
        return "partial"
    return "gap"


def build_coverage(documents: list[dict], all_caps: dict, lenses: dict) -> dict:
    """Build coverage map for all lens categories.

    Args:
        documents: List of document dicts as returned by ``scan_documents()``.
        all_caps: Capabilities dict as returned by ``scan_capabilities()``.
        lenses: Lens taxonomy dict as returned by ``scan_lenses()``.

    Returns:
        Dict keyed by lens tag (e.g. ``"nist:PR.PS"``). Each value is a dict
        with ``status``, ``capabilities`` (count), and ``documents`` (count).
    """
    tagged_caps = {}
    tagged_docs = {}

    for doc in documents:
        for tag in doc.get("lenses", []):
            tagged_docs.setdefault(tag, []).append(doc)

    for domain_dir, data in all_caps.items():
        for cap in data.get("capabilities", []):
            for tag in cap.get("lenses", []):
                tagged_caps.setdefault(tag, []).append(cap)

    coverage = {}
    for lens_id, lens_data in lenses.items():
        prefix = lens_data.get("tag_prefix", lens_id)
        for fn in lens_data.get("functions", []):
            for cat in fn.get("categories", []):
                tag = prefix + ":" + cat["id"]
                caps_list = tagged_caps.get(tag, [])
                docs_list = tagged_docs.get(tag, [])
                coverage[tag] = {
                    "status": compute_coverage(caps_list, docs_list),
                    "capabilities": len(caps_list),
                    "documents": len(docs_list),
                }
    return coverage


def scan_all(*, verbose: bool = False) -> tuple[dict, int]:
    """Run the full scan pipeline: documents, capabilities, lenses, config, coverage.

    Args:
        verbose: If True, print progress to stdout.

    Returns:
        Tuple of (data_dict, warning_count). The data dict has keys
        ``documents``, ``capabilities``, ``lenses``, ``config``, and
        ``coverage``, ready to be passed to generators.
    """
    global _warnings
    _warnings = 0

    if not PROGRAM.is_dir():
        _warn(f"program/ directory not found at {PROGRAM} — no documents to scan")

    if verbose:
        print("Scanning documents...", end=" ", flush=True)
    documents = scan_documents()
    if verbose:
        print(f"{len(documents)} found")

    if verbose:
        print("Scanning capabilities...", end=" ", flush=True)
    capabilities = scan_capabilities()
    if verbose:
        total = sum(len(d.get("capabilities", [])) for d in capabilities.values())
        print(f"{total} across {len(capabilities)} domains")

    if verbose:
        print("Loading lenses...", end=" ", flush=True)
    lenses = scan_lenses()
    if verbose:
        print(f"{len(lenses)} lens(es)")

    config = load_config()

    if verbose:
        print("Loading schedule...", end=" ", flush=True)
    schedule = load_schedule()
    if verbose:
        print(f"{len(schedule)} activities")

    if verbose:
        print("Loading threat history...", end=" ", flush=True)
    threat_history = load_threat_history()
    if verbose:
        print(f"{len(threat_history)} snapshot(s)")

    if verbose:
        print("Computing coverage...", end=" ", flush=True)
    coverage = build_coverage(documents, capabilities, lenses)
    if verbose:
        covered = sum(1 for c in coverage.values() if c["status"] == "covered")
        partial = sum(1 for c in coverage.values() if c["status"] == "partial")
        gaps = sum(1 for c in coverage.values() if c["status"] == "gap")
        print(f"{covered} covered, {partial} partial, {gaps} gaps")

    return {
        "documents": documents,
        "capabilities": capabilities,
        "lenses": lenses,
        "config": config,
        "coverage": coverage,
        "schedule": schedule,
        "threat_history": threat_history,
    }, _warnings
