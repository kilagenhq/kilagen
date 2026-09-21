"""Shared helpers for kilagen: paths, the type registry, and reading program/."""

from __future__ import annotations

import os
import re
import sys
from datetime import date
from fnmatch import fnmatch
from pathlib import Path

import yaml


class StringLoader(yaml.SafeLoader):
    """YAML loader that preserves dates as strings.

    Without this, PyYAML coerces ISO dates (e.g. ``2026-06-15``) to
    ``datetime`` objects, which breaks the string comparisons used by the
    schema (which expects strings), the review checks and the generators.
    """
    pass


StringLoader.yaml_implicit_resolvers = {
    k: [(t, r) for t, r in v if t != "tag:yaml.org,2002:timestamp"]
    for k, v in StringLoader.yaml_implicit_resolvers.items()
}


class DocType:
    """One document type: what it is called, where it lives, how it is dated.

    Attributes:
        name: The ``type:`` value in frontmatter (e.g. ``"standard"``).
        prefix: The id prefix (e.g. ``"std"``).
        folder: The directory under ``program/`` that stores it.
        dated: Whether instances are partitioned by year (``gaps/2026/gap-x.md``).
        immutable: Whether the type records an event instead of a review cycle.
    """

    __slots__ = ("name", "prefix", "folder", "dated", "immutable")

    def __init__(self, name, prefix, folder, *, dated=False, immutable=False):
        self.name = name
        self.prefix = prefix
        self.folder = folder
        self.dated = dated
        self.immutable = immutable

    def __repr__(self):
        return f"DocType({self.name!r})"


# The single registry every other module derives from. A folder means the
# document type and nothing else; a subfolder may only ever mean a year.
TYPES: tuple[DocType, ...] = (
    DocType("policy", "pol", "policies"),
    DocType("standard", "std", "standards"),
    DocType("process", "pro", "processes"),
    DocType("runbook", "rb", "runbooks"),
    DocType("playbook", "pb", "playbooks"),
    DocType("guideline", "gl", "guidelines"),
    DocType("role", "role", "roles"),
    DocType("vendor", "vnd", "vendors"),
    DocType("threat", "thr", "threats"),
    DocType("threat-model", "tm", "threat-models"),
    DocType("data-asset", "da", "data-assets"),
    DocType("business-process", "bp", "business-processes"),
    DocType("risk", "rsk", "risks"),
    DocType("exception", "exc", "exceptions", dated=True),
    DocType("gap", "gap", "gaps", dated=True),
    DocType("decision", "dec", "decisions", immutable=True),
    DocType("incident", "inc", "incidents", dated=True, immutable=True),
)

BY_NAME = {t.name: t for t in TYPES}
BY_PREFIX = {t.prefix: t for t in TYPES}
BY_FOLDER = {t.folder: t for t in TYPES}

# Longest prefix first: "role" must win over a hypothetical "ro", and the loop
# below relies on the order to resolve an id to exactly one type.
_PREFIX_ORDER = sorted(BY_PREFIX, key=len, reverse=True)

ID_RE = re.compile(r"^(" + "|".join(t.prefix for t in TYPES) + r")-[a-z0-9][a-z0-9-]*$")
REQUIREMENT_RE = re.compile(r"^(std-[a-z0-9][a-z0-9-]*)#([0-9]+(?:\.[0-9]+)*)$")
YEAR_RE = re.compile(r"^\d{4}$")


def type_of_id(doc_id: str) -> DocType | None:
    """Return the DocType an id belongs to, derived from its prefix."""
    if not isinstance(doc_id, str):
        return None
    for prefix in _PREFIX_ORDER:
        if doc_id.startswith(prefix + "-"):
            return BY_PREFIX[prefix]
    return None


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
MODEL = PROGRAM / "model"

# Directories under program/ that hold no documents.
NON_DOCUMENT_DIRS = {"model"}

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
    """Reset the warning counter to zero, so the contract is per-run."""
    global _warnings
    _warnings = 0


def _load_yaml(path: Path) -> dict | None:
    """Read and parse one YAML file, warning (and returning None) on failure."""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        _warn(f"File is not valid UTF-8 (skipped): {path}")
        return None
    except OSError as exc:
        _warn(f"Could not read {path}: {exc}")
        return None
    try:
        return yaml.load(text, Loader=StringLoader)
    except yaml.YAMLError as exc:
        _warn(f"YAML parse error in {path}: {exc}")
        return None


def write_text_atomic(path: Path, text: str) -> None:
    """Replace a file's contents, or leave them untouched.

    ``write_text`` truncates first, so an interruption between truncation and
    write leaves an empty document. Every caller here is rewriting a document
    a person wrote, so the failure has to be "nothing happened".
    """
    temporary = path.with_name(f"{path.name}.kilagen-tmp")
    try:
        temporary.write_text(text, encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def extract_frontmatter(path: Path, *, raise_on_error: bool = False) -> dict | None:
    """Extract YAML frontmatter from a markdown file.

    Args:
        path: Absolute path to the markdown file.
        raise_on_error: If True, let ``yaml.YAMLError`` propagate instead of
            logging a warning and returning None.

    Returns:
        Parsed frontmatter as a dict, or None if the file has no valid
        frontmatter block.
    """
    try:
        # utf-8-sig: a BOM is what Notepad and several Windows editors write,
        # and it sits in front of the opening `---`. Without this the document
        # has no frontmatter as far as every check is concerned, and nothing
        # says why.
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        _warn(f"File is not valid UTF-8 (skipped): {path}")
        return None
    if not text.startswith("---"):
        _warn(f"File does not open with a '---' frontmatter block (skipped): {path}")
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


# Fields carried into the registry for every document, with an empty default.
_CORE_FIELDS = ("id", "type", "title", "description", "status", "owner")

# Everything else is copied through when present, so a type-specific field
# reaches the dashboard without this module growing a branch for it. The
# schema is what decides which of them are legal on which type.
_SKIP_IN_PASSTHROUGH = set(_CORE_FIELDS)


def _build_entry(rel_path: Path, fm: dict) -> dict:
    """Build a registry entry from a path relative to program/ and frontmatter."""
    entry = {"path": rel_path.as_posix()}
    for key in _CORE_FIELDS:
        entry[key] = fm.get(key, "")
    for key, value in fm.items():
        if key in _SKIP_IN_PASSTHROUGH or value is None:
            continue
        entry[key] = value
    doc_type = BY_NAME.get(fm.get("type"))
    if doc_type is not None:
        entry["folder"] = doc_type.folder
    return entry


def scan_documents() -> list[dict]:
    """Scan program/ for documents, one type folder at a time.

    Only the folders the type registry names are read, so a stray directory
    under ``program/`` contributes nothing rather than silently becoming a
    document source. Dated types are read one year-partition deep.

    Returns:
        List of registry entries, sorted by path.
    """
    docs = []
    for path in document_files():
        fm = extract_frontmatter(path)
        if not fm or "type" not in fm:
            continue
        docs.append(_build_entry(path.relative_to(PROGRAM), fm))
    docs.sort(key=lambda d: d["path"])
    return docs


def document_files() -> list[Path]:
    """Every markdown file under a type folder, whatever its content.

    Used by the validators, which must report a file that has no frontmatter
    at all — something ``scan_documents`` skips by design.
    """
    files = []
    if not PROGRAM.is_dir():
        return files
    for doc_type in TYPES:
        folder = PROGRAM / doc_type.folder
        if folder.is_dir():
            files.extend(p for p in sorted(folder.rglob("*.md")) if p.name != "README.md")
    return files


def load_config() -> dict:
    """Load program/config.yml, falling back to defaults when absent."""
    cfg_path = PROGRAM / "config.yml"
    if not cfg_path.exists():
        return _DEFAULT_CONFIG
    return _load_yaml(cfg_path) or _DEFAULT_CONFIG


def load_model() -> dict:
    """Load the closed vocabularies in program/model/.

    Returns:
        ``{"domains": [...], "capabilities": [...], "systems": [...],
        "risk_taxonomy": {...}}``. A missing file yields an empty collection;
        the validators are what report it as an error.
    """
    model = {"domains": [], "capabilities": [], "systems": [], "risk_taxonomy": {}}
    for key, filename, list_key in (
        ("domains", "domains.yml", "domains"),
        ("capabilities", "capabilities.yml", "capabilities"),
        ("systems", "systems.yml", "systems"),
    ):
        path = MODEL / filename
        if not path.is_file():
            continue
        data = _load_yaml(path)
        if not isinstance(data, dict):
            if data is not None:
                _warn(f"{path.name}: top level is {type(data).__name__}, expected a mapping — skipped")
            continue
        items = data.get(list_key) or []
        if not isinstance(items, list):
            _warn(f"{path.name}: '{list_key}' is {type(items).__name__}, expected a list — skipped")
            continue
        model[key] = [i for i in items if isinstance(i, dict)]
    taxonomy_path = MODEL / "risk-taxonomy.yml"
    if taxonomy_path.is_file():
        data = _load_yaml(taxonomy_path)
        if isinstance(data, dict):
            model["risk_taxonomy"] = data
    return model


def severity_model(model: dict) -> dict:
    """The scoring half of the risk taxonomy: the two axes and the bands.

    Empty when the taxonomy declares none, which is legitimate — a program
    that does not score risks numerically simply has no matrix.
    """
    severity = (model.get("risk_taxonomy") or {}).get("severity")
    return severity if isinstance(severity, dict) else {}


def severity_point(name, axis: list) -> int | None:
    """The numeric value of a point on a scoring axis, named by its label.

    A risk says `likelihood: low`, because that is what the schema allows —
    the axis is where a label is bound to a number. Reading the label is
    therefore the only way to score a document that validates; requiring an
    integer meant the scoring code never ran on real content at all.
    """
    if not isinstance(name, str):
        return None
    for point in axis or []:
        if not isinstance(point, dict):
            continue
        if str(point.get("label", "")).strip().lower() == name.strip().lower():
            value = point.get("value")
            return value if isinstance(value, int) else None
    return None


def severity_band(score: int, severity: dict) -> str | None:
    """Which band a likelihood x impact score falls into.

    Returns None when no band covers the score, which the validator reports:
    a hole in the bands is a hole in the standard, not something to paper over.
    """
    for band in severity.get("bands") or []:
        if not isinstance(band, dict):
            continue
        low, high = band.get("min"), band.get("max")
        if isinstance(low, int) and isinstance(high, int) and low <= score <= high:
            return band.get("id")
    return None


def model_ids(model: dict) -> dict[str, set[str]]:
    """Reduce the vocabularies to the id sets the facets are checked against."""
    return {
        "domains": {d["id"] for d in model["domains"] if isinstance(d.get("id"), str)},
        "capabilities": {c["id"] for c in model["capabilities"] if isinstance(c.get("id"), str)},
        "systems": {s["id"] for s in model["systems"] if isinstance(s.get("id"), str)},
    }


def load_publish() -> dict:
    """Load program/publish.yml — the publishing contract.

    Returns:
        ``{"destinations": {...}, "defaults": {...}}``, empty when the file is
        absent (a program that publishes nowhere is legitimate).
    """
    path = PROGRAM / "publish.yml"
    if not path.is_file():
        return {"destinations": {}, "defaults": {}}
    data = _load_yaml(path)
    if not isinstance(data, dict):
        if data is not None:
            _warn("publish.yml: top level is not a mapping — skipped")
        return {"destinations": {}, "defaults": {}}
    destinations = data.get("destinations") or {}
    defaults = data.get("defaults") or {}
    if not isinstance(destinations, dict):
        _warn("publish.yml: 'destinations' is not a mapping — skipped")
        destinations = {}
    if not isinstance(defaults, dict):
        _warn("publish.yml: 'defaults' is not a mapping — skipped")
        defaults = {}
    return {"destinations": destinations, "defaults": defaults}


def publish_targets(doc: dict, publish: dict) -> list[str]:
    """Resolve where one document is published.

    The document's own ``publish:`` wins; otherwise the per-type default in
    ``publish.yml`` applies, which is what stops a new policy from going
    unpublished because nobody remembered to tag it.
    """
    override = doc.get("publish")
    if override == "none":
        return []
    if override == "all":
        return sorted(publish["destinations"])
    if isinstance(override, list):
        return list(override)
    return list(publish["defaults"].get(doc.get("type"), []))


def load_schedule() -> list[dict]:
    """Load program/schedule.yml — recurring activities that are not reviews."""
    path = PROGRAM / "schedule.yml"
    if not path.is_file():
        return []
    data = _load_yaml(path)
    if not data:
        return []
    activities = data.get("activities", [])
    if not isinstance(activities, list):
        _warn(f"schedule.yml 'activities' must be a list, got {type(activities).__name__}")
        return []
    return activities


SHIPPED_FRAMEWORKS = KEEL / "content" / "frameworks"


def _clause_refs(clauses) -> list[str]:
    """Flatten a clause list to refs, whichever of the two shapes it uses.

    A clause is either the bare ref or ``{ref, name, description}``. Coverage
    only ever needs the ref, so this is where the two shapes stop being two.
    """
    refs = []
    for c in clauses or []:
        if isinstance(c, dict):
            ref = c.get("ref")
            if isinstance(ref, str) and ref:
                refs.append(ref)
            continue
        if not isinstance(c, str):
            _warn(f"clause {c!r} is {type(c).__name__}, not a quoted string — "
                  "quote it (e.g. \"13.60\") to avoid numeric collapse")
        refs.append(str(c))
    return refs


def _parse_framework_file(path: Path) -> dict | None:
    """Read one framework file into ``{meta, refs}``, or None when unusable."""
    data = _load_yaml(path)
    if data is None:
        return None
    if not isinstance(data, dict):
        _warn(f"{path.name}: top level is {type(data).__name__}, expected a "
              "mapping with a 'clauses:' or 'groups:' list — skipped")
        return None

    groups = data.get("groups")
    clauses = data.get("clauses")
    if groups is not None and not isinstance(groups, list):
        _warn(f"{path.name}: 'groups' is {type(groups).__name__}, expected a list — skipped")
        groups = None
    if clauses is not None and not isinstance(clauses, list):
        # A string/dict here would be iterated char-by-char / key-by-key,
        # fabricating phantom clauses with no warning. Refuse it.
        _warn(f"{path.name}: 'clauses' is {type(clauses).__name__}, expected a "
              "list of clause-ref strings — skipped")
        clauses = None

    refs: list[str] = []
    meta_groups = []
    if groups:
        for group in groups:
            if not isinstance(group, dict):
                _warn(f"{path.name}: a group is {type(group).__name__}, expected a mapping — skipped")
                continue
            group_refs = _clause_refs(group.get("clauses"))
            refs.extend(group_refs)
            meta_groups.append({
                "id": group.get("id", ""),
                "name": group.get("name", ""),
                "description": group.get("description", ""),
                "color": group.get("color", ""),
                "center": bool(group.get("center")),
                "clauses": _clause_entries(group.get("clauses")),
            })
    else:
        refs = _clause_refs(clauses)

    meta = {
        "name": data.get("name", ""),
        "description": data.get("description", ""),
        "granularity": data.get("granularity", ""),
        "resources": [r for r in (data.get("resources") or []) if isinstance(r, dict)],
        "groups": meta_groups,
    }
    if not meta_groups:
        meta["clauses"] = _clause_entries(clauses)
    return {"meta": meta, "refs": refs}


def _clause_entries(clauses) -> list[dict]:
    """Normalise clauses to ``{ref, name, description}`` for the dashboard."""
    entries = []
    for c in clauses or []:
        if isinstance(c, dict):
            ref = c.get("ref")
            if not isinstance(ref, str) or not ref:
                continue
            entries.append({"ref": ref, "name": c.get("name", ""),
                            "description": c.get("description", "")})
        elif isinstance(c, str):
            entries.append({"ref": c, "name": "", "description": ""})
        else:
            entries.append({"ref": str(c), "name": "", "description": ""})
    return entries


def framework_files(frameworks_dir: Path | None = None,
                    shipped_dir: Path | None = None) -> dict[str, Path]:
    """Resolve every framework id to the file that defines it.

    The product ships the frameworks; an instance only declares which ones are
    in scope. ``program/model/frameworks/<id>.yml`` still wins where it exists,
    which is how an instance overrides a shipped edition or adds one of its
    own — but nobody has to type 93 ISO controls to get coverage.

    Args:
        frameworks_dir: The instance's override directory. Defaults to
            ``program/model/frameworks/``. Injectable for testing.
        shipped_dir: The package's catalogue. Defaults to
            ``keel/content/frameworks/``. Injectable for testing.

    Returns:
        ``{framework_id: path}``, overrides shadowing shipped editions.
    """
    if frameworks_dir is None:
        frameworks_dir = MODEL / "frameworks"
    if shipped_dir is None:
        shipped_dir = SHIPPED_FRAMEWORKS
    resolved: dict[str, Path] = {}
    for source in (shipped_dir, frameworks_dir):
        if not source or not source.is_dir():
            continue
        for f in sorted(source.iterdir()):
            if f.suffix == ".yml":
                resolved[f.stem] = f
    return resolved


def load_framework_vocab(frameworks_dir: Path | None = None,
                         shipped_dir: Path | None = None) -> dict[str, list[str]]:
    """Load clause vocabularies, flattened to refs.

    The clause set is the denominator of the only coverage this program
    computes, so this deliberately returns nothing but refs: whether a file
    declares its clauses flat or inside ``groups:``, coverage sees one list and
    cannot tell the difference.

    Returns:
        Dict keyed by framework id, value the list of clause-ref strings.
    """
    vocab: dict[str, list[str]] = {}
    for fw_id, path in framework_files(frameworks_dir, shipped_dir).items():
        parsed = _parse_framework_file(path)
        vocab[fw_id] = parsed["refs"] if parsed else []
    return vocab


def load_framework_meta(frameworks_dir: Path | None = None,
                        shipped_dir: Path | None = None) -> dict[str, dict]:
    """Load the structure and prose of every framework, for the dashboard.

    Separate from ``load_framework_vocab`` on purpose: coverage must not be
    able to see a group, a colour or a description, because none of them is
    allowed to influence what it computes.
    """
    override_dir = frameworks_dir or MODEL / "frameworks"
    meta: dict[str, dict] = {}
    for fw_id, path in framework_files(frameworks_dir, shipped_dir).items():
        parsed = _parse_framework_file(path)
        if parsed:
            entry = dict(parsed["meta"])
            entry["source"] = "override" if path.parent == override_dir else "shipped"
            meta[fw_id] = entry
    return meta


def config_framework_ids(config: dict) -> list[str]:
    """Return the in-scope framework ids declared in ``config.yml``."""
    return [f["id"] for f in (config.get("frameworks") or [])
            if isinstance(f, dict) and "id" in f]


def requirement_index(documents: list[dict]) -> dict[str, dict]:
    """Index every requirement inside every standard, keyed ``std-id#ref``.

    This is what makes ``requirement:`` on a gap or an exception a real
    reference rather than a string: it either resolves here or it fails.
    """
    index: dict[str, dict] = {}
    for doc in documents:
        if doc.get("type") != "standard":
            continue
        std_id = doc.get("id", "")
        for req in doc.get("requirements") or []:
            if not isinstance(req, dict) or "ref" not in req:
                continue
            key = f"{std_id}#{req['ref']}"
            index[key] = {"standard": std_id, "ref": str(req["ref"]),
                          "text": req.get("text", ""), "frameworks": req.get("frameworks") or {}}
    return index


def scan_framework_mappings(documents: list[dict]) -> list[dict]:
    """Extract every requirement ``frameworks:`` mapping from the standards.

    The single mapping extraction, reused by the coverage generator and the
    forward referential check — there is no second parser.

    Returns:
        List of ``{std_id, ref, fw, clause}`` records.
    """
    records: list[dict] = []
    for doc in documents:
        if doc.get("type") != "standard":
            continue
        std_id = doc.get("id", "")
        for req in doc.get("requirements") or []:
            if not isinstance(req, dict):
                continue
            ref = str(req.get("ref", ""))
            frameworks = req.get("frameworks")
            if frameworks is None:
                continue
            if not ref:
                # `<std>#` resolves to nothing in the requirement index, and a
                # clause pointed at it renders "mapped" by a requirement that
                # does not exist. Warn rather than emit it: the warning contract
                # fails the run, which is the honest outcome.
                _warn(f"{std_id}: a requirement maps frameworks but has no ref "
                      f"— its clauses are not counted as mapped")
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


# Everything that may exist under program/, and what validates it.
#
# This table is the anti-drift device. `schedule.yml` proved the rule the hard
# way: a file with no validator is not "pending validation", it is outside the
# model — the refactor skipped it entirely and nobody noticed for three weeks.
# Anything here with a schema is checked; anything with None is prose, and
# saying so is a decision rather than an oversight. A file that matches
# nothing at all is reported.
PROGRAM_FILE_RULES: tuple[tuple[str, str | None], ...] = (
    ("config.yml", "config.schema.json"),
    ("publish.yml", "publish.schema.json"),
    ("schedule.yml", "schedule.schema.json"),
    ("README.md", None),                       # orientation, written by init
    ("branding.css", None),                    # optional: the instance's own palette
    ("model/domains.yml", "model-domains.schema.json"),
    ("model/capabilities.yml", "model-capabilities.schema.json"),
    ("model/systems.yml", "model-systems.schema.json"),
    ("model/risk-taxonomy.yml", "model-risk-taxonomy.schema.json"),
    ("model/frameworks/*.yml", "framework-vocab.schema.json"),
)


def validator_for(relative: str) -> tuple[bool, str | None]:
    """What validates a file under program/, by its path relative to program/.

    Returns ``(recognised, schema_name)``. A document in a type folder is
    covered by the frontmatter schema; everything else has to be in the table.
    """
    for pattern, schema in PROGRAM_FILE_RULES:
        if fnmatch(relative, pattern):
            return True, schema

    parts = relative.split("/")
    doc_type = BY_FOLDER.get(parts[0])
    if doc_type and relative.endswith(".md"):
        depth = 3 if doc_type.dated else 2
        if len(parts) == depth:
            return True, "frontmatter.schema.json"
    return False, None


def unrecognised_program_files() -> list[str]:
    """Files under program/ that no validator claims."""
    if not PROGRAM.is_dir():
        return []
    found = []
    for path in sorted(PROGRAM.rglob("*")):
        if not path.is_file() or path.name.startswith("."):
            continue
        # as_posix, not str: on Windows str() yields backslashes, and both the
        # fnmatch patterns and the folder split below are written with "/".
        relative = path.relative_to(PROGRAM).as_posix()
        recognised, _ = validator_for(relative)
        if not recognised:
            found.append(relative)
    return found


def is_open_gap(doc: dict) -> bool:
    """A gap is open until a write-once fact closes it.

    There is no status to read: either it was remediated, or an approved
    exception superseded it, or it is still open.
    """
    return not doc.get("remediated") and not doc.get("excepted_by")


def is_live_exception(doc: dict, today: str | None = None) -> bool:
    """An exception is live until it is revoked or it expires.

    Two signals, both write-once facts. There is no status to read: a third
    signal could only contradict these two, which is exactly what it used to do.
    """
    if doc.get("revoked"):
        return False
    expires = doc.get("expires")
    if not expires:
        return False
    return str(expires) >= (today or date.today().isoformat())


def scan_all(*, verbose: bool = False) -> tuple[dict, int]:
    """Run the full scan: documents, model, config, publish, schedule.

    Coverage is computed by the coverage generator, not here — it needs the
    document set and the vocabularies this function returns.

    Returns:
        Tuple of (data_dict, warning_count).
    """
    reset_warnings()

    if not PROGRAM.is_dir():
        _warn(f"program/ directory not found at {PROGRAM} — no documents to scan")

    if verbose:
        print("Scanning documents...", end=" ", flush=True)
    documents = scan_documents()
    if verbose:
        print(f"{len(documents)} found")

    if verbose:
        print("Loading model...", end=" ", flush=True)
    model = load_model()
    if verbose:
        print(f"{len(model['domains'])} domains, {len(model['capabilities'])} capabilities, "
              f"{len(model['systems'])} systems")

    config = load_config()
    publish = load_publish()

    if verbose:
        print("Loading schedule...", end=" ", flush=True)
    schedule = load_schedule()
    if verbose:
        print(f"{len(schedule)} activities")

    return {
        "documents": documents,
        "model": model,
        "config": config,
        "publish": publish,
        "schedule": schedule,
    }, get_warnings()
