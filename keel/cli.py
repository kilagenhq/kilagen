"""Command-line entry point.

Every rule lives here or in the modules it calls — never in a CI workflow. A
platform integration is a directory of thin proxies that invoke these verbs,
so supporting a new one costs a directory, not a port.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import subprocess
import sys
from collections.abc import Iterable
from datetime import date, timedelta
from pathlib import Path

import yaml

from . import SCHEMA_VERSION, __version__
from .libs import keel_lib

SCAFFOLD = keel_lib.KEEL / "scaffold"
SKILLS = keel_lib.KEEL / "ai" / "skills"
MANIFEST_NAME = ".kilagen-manifest.yml"

# The date every seeded document is written against. init rewrites those dates
# relative to the day the program is created, so the starter keeps the offsets
# its author intended — a gap found today, a review due in a year — instead of
# arriving pre-expired for everyone who installs it after this date.
STARTER_ANCHOR = date(2026, 1, 1)

# Frontmatter fields init re-anchors. Each is a date the starter chose relative
# to "the day this program began"; an absolute date would not belong in seed
# content at all.
STARTER_DATE_FIELDS = (
    "last_reviewed", "next_review", "found", "expires", "decided", "occurred",
)

_FM_DATE_RE = re.compile(
    r"^(?P<key>" + "|".join(STARTER_DATE_FIELDS) + r"): (?P<date>\d{4}-\d{2}-\d{2})[ \t]*$",
    re.MULTILINE,
)


class CommandError(Exception):
    """A failure worth reporting to the user without a traceback."""


# --------------------------------------------------------------------------
# helpers


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _reanchor_dates(text: str, today: date) -> str:
    """Shift a starter document's dates so they are relative to today.

    The offsets are what the starter actually encodes: a review a year out, a
    gap found the day the program began. Freezing them to a literal date would
    mean every program created after it opens with an overdue review and a
    stale gap — failing its own first check for no reason but the calendar.
    """
    def shift(match: re.Match) -> str:
        original = date.fromisoformat(match.group("date"))
        moved = today + timedelta(days=(original - STARTER_ANCHOR).days)
        return f"{match.group('key')}: {moved.isoformat()}"

    head, sep, rest = text.partition("\n---\n")
    if not sep:  # no frontmatter block: leave the file alone
        return text
    return _FM_DATE_RE.sub(shift, head) + sep + rest


def _options(kind: str) -> list[str]:
    """Available deployments or engines, read from the shipped scaffold."""
    root = SCAFFOLD / kind
    return sorted(d.name for d in root.iterdir() if d.is_dir()) if root.is_dir() else []


def _tree_plan(src: Path, prefix: Path | None = None) -> dict[Path, Path]:
    """Map destination-relative path -> source file, without writing anything.

    A README.md at the root of the source describes the option itself — what
    this deployment wires up, when to pick it — and stays behind. Copying it
    would overwrite the instance's own README.

    Byte-code is skipped. The seed contains a .py file, so `pip install`
    compiles it and leaves a __pycache__ beside it in site-packages; copying
    that would put a stale .pyc in the instance and, worse, record it in the
    manifest, where a later Python version changes its hash and `update
    config` reports a file the user never touched.
    """
    plan: dict[Path, Path] = {}
    if not src.is_dir():
        return plan
    for item in sorted(src.rglob("*")):
        if not item.is_file():
            continue
        if item.suffix in (".pyc", ".pyo") or "__pycache__" in item.parts:
            continue
        rel = item.relative_to(src)
        if rel == Path("README.md"):
            continue
        plan[prefix / rel if prefix else rel] = item
    return plan


def _write_plan(plan: dict[Path, Path], dest: Path) -> list[Path]:
    """Apply a plan, returning the destination-relative paths written.

    Every target is resolved and confirmed to be inside ``dest`` before
    anything is written. Today the only relative path that is not derived
    straight from the shipped tree is the ``skills_dir`` an engine declares,
    so this is a guard rather than a fix — but it is the difference between
    "nothing escapes because of how the inputs happen to look" and "nothing
    escapes because it cannot".
    """
    root = dest.resolve()
    for rel, source in sorted(plan.items()):
        target = (dest / rel).resolve()
        if not target.is_relative_to(root):
            raise CommandError(
                f"refusing to write outside {dest}: seed entry '{rel}' resolves to {target}"
            )
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return sorted(plan)


def _seed_plan(deployment: str, agent: str) -> dict[Path, Path]:
    """Everything the current package would copy for these choices."""
    plan = _tree_plan(SCAFFOLD / "base")
    plan |= _tree_plan(SCAFFOLD / "deployments" / deployment)
    engine_file = SCAFFOLD / "engines" / agent / "engine.yml"
    engine = {}
    if engine_file.is_file():
        engine = yaml.safe_load(engine_file.read_text(encoding="utf-8")) or {}
    skills_dir = engine.get("skills_dir")
    if skills_dir:
        plan |= _tree_plan(SKILLS, prefix=Path(skills_dir))
    return plan


def _write_manifest(target: Path, deployment: str, agent: str,
                    entries: dict[Path, dict]) -> None:
    """Record what was copied, so a later release can tell edited from untouched.

    Entries are passed in rather than recomputed from disk. Re-hashing every
    file here would record a user's edits as if the framework had written
    them, and the next upgrade would overwrite that work without a word.
    """
    manifest = {
        "kilagen_version": __version__,
        "schema_version": SCHEMA_VERSION,
        "deployment": deployment,
        "agent": agent,
        # as_posix: the manifest is committed and read on other machines, so a
        # backslash key written on Windows would make every file look new.
        "files": {rel.as_posix(): entries[rel] for rel in sorted(entries)},
    }
    (target / MANIFEST_NAME).write_text(
        yaml.safe_dump(manifest, sort_keys=False), encoding="utf-8"
    )


def _version_tuple(text: str) -> tuple[int, ...]:
    """Numeric prefix of a version string, for ordering. ('1.4.2' -> (1, 4, 2))

    Anything unparsable yields (), which sorts below every real version — so
    the placeholder written by a source-tree import never looks newer than an
    installed release.
    """
    parts: list[int] = []
    for chunk in str(text).split("."):
        digits = ""
        for ch in chunk:
            if not ch.isdigit():
                break
            digits += ch
        if not digits:
            break
        parts.append(int(digits))
    return tuple(parts)


def _read_manifest(target: Path) -> dict:
    path = target / MANIFEST_NAME
    if not path.is_file():
        raise CommandError(
            f"no {MANIFEST_NAME} in {target} — this is not a Kilagen instance"
        )
    manifest = yaml.safe_load(path.read_text(encoding="utf-8"))
    # An unreadable manifest is not an empty one. Treating it as {} makes every
    # seeded file look new, and `update config --apply` then writes the shipped
    # version over whatever the user had — which is precisely what the manifest
    # exists to prevent.
    if not isinstance(manifest, dict) or not isinstance(manifest.get("files"), dict):
        raise CommandError(
            f"{path} is unreadable, so update cannot tell your edits from ours "
            f"and refuses to write. Restore it from git, or re-run "
            f"'kilagen init --force' deliberately."
        )
    return manifest


# What a program starts measured against when nobody chooses: the two the
# starter content is written for.
DEFAULT_FRAMEWORKS = ("nist_csf", "pci_dss")

FRAMEWORK_URLS = {
    "nist_csf": "https://www.nist.gov/cyberframework",
    "pci_dss": "https://www.pcisecuritystandards.org/",
    "iso_27001": "https://www.iso.org/standard/27001",
    "iso_27017": "https://www.iso.org/standard/43757.html",
    "iso_27018": "https://www.iso.org/standard/76559.html",
    "soc2": "https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2",
}

# Who checks. Guidance frameworks assert nothing; the rest is the user's call,
# so only the one we know from the outside is stated.
DEFAULT_BINDING = {"nist_csf": "reference", "iso_27017": "reference", "iso_27018": "reference"}


def _program_config(name: str, frameworks: Iterable[str] | None = None) -> str:
    return (
        "# Identity and framework selection for this program.\n"
        f"name: {name}\n"
        "# owner/repo, or its github.com URL. Links each document back to its\n"
        "# source; leave empty for no source links.\n"
        "repo: \"\"\n"
        "\n"
        "# How far this content has been migrated. Managed by 'kilagen update content';\n"
        "# do not edit by hand.\n"
        f"schema_version: {SCHEMA_VERSION}\n"
        "\n"
        "# Compliance frameworks this program is measured against. Kilagen ships\n"
        "# the clause vocabularies, so declaring an id here is all it takes; run\n"
        "# 'kilagen check' to see the ids it knows. Remove the ones you are not\n"
        "# measured against — coverage is computed over these, and it is the only\n"
        "# coverage this program claims.\n"
        "#\n"
        "# To override a shipped edition, or to add a framework of your own, drop\n"
        "# the file at program/model/frameworks/<id>.yml; it wins over the shipped\n"
        "# one of the same id.\n"
        "#\n"
        "# binding says who checks: mandatory (a law, a regulator or a contract\n"
        "# requires it), voluntary (you audit yourself and assert conformity), or\n"
        "# reference (guidance you assert nothing against).\n"
        "frameworks:\n"
        + "".join(
            f"  - id: {fw}\n"
            + (f"    url: {FRAMEWORK_URLS[fw]}\n" if fw in FRAMEWORK_URLS else "")
            + f"    binding: {DEFAULT_BINDING.get(fw, 'mandatory')}\n"
            for fw in (frameworks or DEFAULT_FRAMEWORKS)
        )
    )


def _declared_schema_version(data: dict) -> int | None:
    """The declared schema_version as an int, or None when absent.

    Quoted in YAML (`schema_version: "3"`) it arrives as a string, and every
    comparison against it would raise TypeError instead of saying what is wrong.
    """
    declared = data.get("schema_version")
    if declared is None or isinstance(declared, int):
        return declared
    raise CommandError(
        f"program/config.yml declares schema_version: {declared!r}, which is not a "
        f"whole number. Write it unquoted, as 'schema_version: {SCHEMA_VERSION}'."
    )


def _require_schema_version() -> None:
    """Block when the content and the installed framework disagree.

    One content contract at a time: see keel/content/adrs/.
    """
    config = keel_lib.PROGRAM / "config.yml"
    if not config.is_file():
        raise CommandError(
            f"no program found at {keel_lib.PROGRAM} — run 'kilagen init' first"
        )
    data = yaml.safe_load(config.read_text(encoding="utf-8")) or {}
    declared = _declared_schema_version(data)
    if declared == SCHEMA_VERSION:
        return
    if declared is None:
        raise CommandError(
            "program/config.yml declares no schema_version; it predates versioned "
            "content. Add 'schema_version: 1' once you have checked the program "
            "against this framework."
        )
    if declared < SCHEMA_VERSION:
        raise CommandError(
            f"this program is at schema {declared}; kilagen {__version__} expects "
            f"{SCHEMA_VERSION}. Run: kilagen update content"
        )
    raise CommandError(
        f"this program is at schema {declared}, which kilagen {__version__} does "
        f"not understand (it expects {SCHEMA_VERSION}). Upgrade: pip install -U kilagen"
    )


# --------------------------------------------------------------------------
# commands


def _scope_frameworks(text: str, in_scope: Iterable[str]) -> str:
    """Drop framework mappings the program is not measured against.

    The starter's standard maps its requirements to NIST CSF and PCI DSS
    clauses. A program that chose neither would be born failing its own first
    check over references to frameworks it never declared — so the mapping
    goes, and the requirement is simply unmapped, which is the truth.
    """
    known = set(keel_lib.framework_files())
    drop = {fw for fw in known if fw not in set(in_scope)}
    if not drop:
        return text

    lines = text.split("\n")
    kept = []
    for line in lines:
        stripped = line.strip()
        key = stripped.split(":", 1)[0]
        if line.startswith(" ") and key in drop and stripped.startswith(key + ":"):
            continue
        kept.append(line)

    # A frameworks: block whose entries all went is now an empty mapping,
    # which is not what the schema means by one.
    result = []
    for index, line in enumerate(kept):
        if line.strip() == "frameworks:":
            indent = len(line) - len(line.lstrip())
            following = kept[index + 1] if index + 1 < len(kept) else ""
            if not following.strip() or (len(following) - len(following.lstrip())) <= indent:
                continue
        result.append(line)
    return "\n".join(result)


def _ask(question: str, default: str) -> str:
    """One prompt. Empty input takes the default, which is always shown."""
    try:
        answer = input(f"{question} [{default}]: ").strip()
    except EOFError:                       # piped stdin: take every default
        print()
        return default
    return answer or default


def _run_guided(args: argparse.Namespace) -> None:
    """Fill in the three answers that shape a new program.

    Interactive is the option, never the requirement: `kilagen init --name X`
    still asks nothing, which is what CI needs.
    """
    available = sorted(keel_lib.framework_files())
    print("\nThree questions. Enter takes the default.\n")
    args.name = _ask("Program name", args.name or "Security Program")
    print("\n  Frameworks Kilagen ships: " + ", ".join(available))
    chosen = _ask("Frameworks in scope, comma-separated", "nist_csf, pci_dss")
    picked = [fw.strip() for fw in chosen.split(",") if fw.strip()]
    unknown = [fw for fw in picked if fw not in available]
    if unknown:
        raise CommandError(
            f"unknown framework {', '.join(unknown)} — available: {', '.join(available)}"
        )
    args.frameworks = picked
    args.owner_title = _ask("Who owns the program by default", "Security Owner")
    print()


def cmd_init(args: argparse.Namespace) -> int:
    if getattr(args, "guided", False):
        _run_guided(args)
    if not args.name:
        raise CommandError("--name is required, or use --guided to be asked")

    target = Path.cwd().resolve()
    program = target / "program"
    scope = getattr(args, "frameworks", None) or DEFAULT_FRAMEWORKS

    # Argument errors first: an unusable flag should be reported whether or not
    # the directory happens to be initialised already.
    for kind, value in (("deployments", args.deployment), ("engines", args.agent)):
        available = _options(kind)
        if value not in available:
            raise CommandError(
                f"unknown {kind[:-1]} '{value}' — available: {', '.join(available)}"
            )
    if program.exists() and not args.force:
        raise CommandError(f"{program} already exists — refusing to overwrite (use --force)")

    # The seed's base layer is ordinary repository furniture — .gitignore,
    # .pre-commit-config.yaml, a tests/ directory — under names nobody
    # namespaced. init is documented as something you run inside a repository
    # you already own, so those names may well be taken, and copying over them
    # would replace work this tool never wrote.
    plan = _seed_plan(args.deployment, args.agent)
    occupied = sorted(
        str(rel) for rel, source in plan.items()
        if (target / rel).is_file()
        and (target / rel).read_bytes() != source.read_bytes()
    )
    if occupied and not args.force:
        raise CommandError(
            "these files already exist here and differ from what init would "
            "write. Move them aside, or re-run with --force to overwrite:\n  "
            + "\n  ".join(occupied)
        )
    if occupied:
        print("Overwriting (--force):")
        for rel in occupied:
            print(f"  {rel}")

    copied = _write_plan(plan, target)

    # The program layer is the user's, so it is generated rather than copied
    # and never appears in the manifest: upgrade must not touch it.
    program.mkdir(parents=True, exist_ok=True)
    (program / "config.yml").write_text(
        _program_config(args.name, scope), encoding="utf-8")

    # A folder means the document type and nothing else. All of them are
    # created up front: an empty folder is the menu of what this program can
    # hold, and it costs nothing.
    for doc_type in keel_lib.TYPES:
        (program / doc_type.folder).mkdir(exist_ok=True)

    # The vocabularies and the publishing contract are seeded from the shipped
    # starter rather than written here, so they stay editable data instead of
    # strings in the CLI.
    starter = keel_lib.KEEL / "content" / "starter"
    shutil.copytree(starter / "model", program / "model", dirs_exist_ok=True)
    shutil.copy2(starter / "publish.yml", program / "publish.yml")
    # Structure, not a table of contents: a list of documents would be stale
    # the day after it was written, and the dashboard is the index.
    shutil.copy2(starter / "program-README.md", program / "README.md")
    # Seeded empty but commented: the Schedule lens is useful without it, and
    # an instance that never learns the file exists never gets the recurring
    # half of the calendar. An empty activities list is valid.
    shutil.copy2(starter / "schedule.yml", program / "schedule.yml")

    # A new program is not an empty one: it arrives with the whole capability
    # menu as a checklist, two frameworks in scope — whose vocabularies ship
    # with the package rather than being copied here, so nobody types 93 ISO
    # controls by hand — and five draft documents that exercise the chain end
    # to end: a policy, the standard it authorises, the role that owns them,
    # and a gap and an exception filed against the same requirement so the
    # difference between the two is visible on day one.
    today = date.today()
    owner_title = getattr(args, "owner_title", None)
    for source in sorted((starter / "documents").glob("*.md")):
        doc_type = keel_lib.type_of_id(source.stem)
        folder = program / doc_type.folder
        if doc_type.dated:
            folder = folder / str(today.year)
        folder.mkdir(parents=True, exist_ok=True)
        text = _reanchor_dates(source.read_text(encoding="utf-8"), today)
        text = _scope_frameworks(text, scope)
        if owner_title and source.stem == "role-security-owner":
            # The id every seeded document points at stays; only the human
            # name changes, so nothing is left dangling.
            text = re.sub(r'^title:.*$', f'title: "{owner_title}"', text, count=1, flags=re.M)
        (folder / source.name).write_text(text, encoding="utf-8")

    _write_manifest(target, args.deployment, args.agent,
                    {rel: {"version": __version__, "sha256": _sha256(target / rel)}
                     for rel in copied})

    print(f"Initialised '{args.name}' in {target}")
    print(f"  deployment: {args.deployment}    agent: {args.agent}")
    print(f"  {len(copied)} files copied, tracked in {MANIFEST_NAME}")
    print("\nYour program starts as a map of what it could hold: the capability")
    print(f"menu as a checklist, {len(scope)} framework(s) in scope "
          f"({', '.join(scope)}), and five draft")
    print("documents that run the chain from policy to requirement to gap and exception.\n")
    print("  kilagen build && kilagen serve    see it at http://localhost:8000")
    return 0


def _check_frontmatter() -> int:
    from .libs import validate_frontmatter

    return validate_frontmatter.main()


def _check_refs() -> int:
    from .libs import validate_semantic_refs

    return validate_semantic_refs.main()


def _check_reviews(strict: bool = False) -> int:
    """Returns 1 when something needs attention — a warning, not a failure."""
    from .libs import check_reviews

    return check_reviews.main(strict=strict)


def _check_evidence(strict: bool = False) -> int:
    """Returns 1 when something needs attention — a warning, not a failure."""
    from .libs import check_evidence

    return check_evidence.main(strict=strict)


CHECKS = {
    "frontmatter": _check_frontmatter,
    "refs": _check_refs,
    "reviews": _check_reviews,
    "evidence": _check_evidence,
}

# The checks that report rather than fail: work to schedule, not a broken
# contract. A check a healthy program can never pass is one everybody learns
# to ignore, so --strict is how a CI asks for the opposite.
INFORMS = ("reviews", "evidence")


def cmd_check(args: argparse.Namespace) -> int:
    _require_schema_version()
    # No target means every check. Naming one narrows it; that is the only
    # difference, so a new check never becomes a new command.
    unknown = [t for t in args.target if t not in CHECKS]
    if unknown:
        raise CommandError(
            f"unknown check {', '.join(unknown)} — available: {', '.join(sorted(CHECKS))}"
        )
    targets = args.target or list(CHECKS)
    strict = getattr(args, "strict", False)
    errors, attention = [], False
    for name in targets:
        # Reviews are the one check that reports rather than fails: a document
        # falling due is work to schedule, not a broken contract. --strict is
        # for a CI that wants the opposite.
        if name in INFORMS:
            found = CHECKS[name](strict=strict)
            attention = attention or bool(found)
            if strict and found:
                errors.append(name)
            continue
        if CHECKS[name]():
            errors.append(name)

    print(f"\n{'=' * 60}")
    if errors:
        print(f"FAILED — errors in: {', '.join(errors)}")
    else:
        print("PASSED — no errors.")
    if attention and not strict:
        print("Some items need attention above. These checks inform; they do not fail.")
    return 1 if errors else 0


def cmd_collect_evidence(args: argparse.Namespace) -> int:
    """Run the collectors and record the pointers they come back with.

    A target of `update`, not a verb of its own: the shape is the same as
    `update content` — the framework edits your files and the diff is the
    review — and the CLI stays a closed set of verbs with open targets.
    """
    _require_schema_version()
    from .libs import collect_evidence

    return collect_evidence.main(apply=getattr(args, "apply", False))


def cmd_build(args: argparse.Namespace) -> int:
    _require_schema_version()
    from .libs import build_site

    # Validate before building: a site derived from invalid content is worse
    # than no site, because it looks authoritative.
    if args.target != "site":
        if _check_frontmatter() or _check_refs():
            return 1
    else:
        print("WARNING: building without validation. The site will be marked "
              "'built without validation' and must not be published as it is.",
              file=sys.stderr)
    build_site.VALIDATED = args.target != "site"
    return build_site.main()


def cmd_serve(args: argparse.Namespace) -> int:
    import functools
    import http.server

    site = keel_lib.REPO / "_site"
    if not site.is_dir():
        raise CommandError(f"no site at {site} — run 'kilagen build' first")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
    # Loopback, not "": the built site holds the whole program — open gaps,
    # live exceptions, evidence URLs — and there is no authentication in front
    # of it. Binding every interface would publish it to the local network.
    print(f"Serving {site} at http://localhost:{args.port}")
    http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()
    return 0


def cmd_upgrade(args: argparse.Namespace) -> int:
    """Compare the copied files against what this release would write.

    Three hashes decide each file: what is on disk, what the manifest recorded
    at copy time, and what the package holds now. A file whose disk hash still
    matches the manifest was never touched and is safe to replace; one that
    differs is the user's and is only ever reported.
    """
    target = Path.cwd().resolve()
    manifest = _read_manifest(target)
    recorded = manifest["files"]
    deployment = manifest.get("deployment", "github")
    agent = manifest.get("agent", "none")

    # Refuse to run backwards. An older release would see every file as
    # outdated and quietly replace it with its own older copy, which reads as
    # an upgrade and is the opposite of one.
    wrote_it = manifest.get("kilagen_version", "")
    if _version_tuple(wrote_it) > _version_tuple(__version__):
        raise CommandError(
            f"this instance was written by kilagen {wrote_it}, newer than the "
            f"installed {__version__}. Upgrading now would downgrade its files. "
            f"Run: pip install -U kilagen"
        )

    plan = _seed_plan(deployment, agent)

    updatable: dict[Path, Path] = {}
    modified, missing, added, dropped = [], [], [], []

    for rel, source in sorted(plan.items()):
        entry = recorded.get(str(rel))
        on_disk = target / rel
        if entry is None:
            added.append(rel)
            continue
        if not on_disk.is_file():
            missing.append(rel)
            continue
        if _sha256(on_disk) != entry.get("sha256"):
            modified.append(rel)
        elif _sha256(source) != entry.get("sha256"):
            updatable[rel] = source

    for name in sorted(recorded):
        if Path(name) not in plan:
            dropped.append(Path(name))

    def _list(title: str, items, note: str = "") -> None:
        if items:
            print(f"\n{title}{note}")
            for rel in items:
                print(f"  {rel}")

    print(f"Instance written by kilagen {manifest.get('kilagen_version')}; "
          f"installed: {__version__}")
    print(f"  deployment: {deployment}    agent: {agent}")

    _list(f"{len(updatable)} file(s) can be updated", sorted(updatable))
    _list(f"{len(modified)} file(s) you have edited", modified,
          " — left alone; re-apply your changes by hand if you want the new version")
    _list(f"{len(missing)} file(s) deleted from the instance", missing,
          " — not restored")
    _list(f"{len(added)} file(s) new in this release", sorted(added))
    _list(f"{len(dropped)} file(s) no longer shipped", dropped,
          " — remove them yourself once you are sure")

    if not (updatable or added):
        print("\nNothing to update.")
        return 0
    if not args.apply:
        print("\nNothing written. Re-run with --apply to update the files listed above.")
        return 0

    written = _write_plan({**updatable, **{rel: plan[rel] for rel in added}}, target)
    # Files this run did not write keep the hash recorded when they were last
    # written by the framework, so an edited file stays recognisably edited —
    # and a file the user deleted keeps its entry too. That record is the only
    # thing separating "deleted on purpose" from "never had it": drop it and
    # the next release classifies the file as new and puts it back.
    entries = {Path(name): entry for name, entry in recorded.items()}
    entries.update({rel: {"version": __version__, "sha256": _sha256(target / rel)}
                    for rel in written})
    _write_manifest(target, deployment, agent, entries)
    print(f"\nUpdated {len(written)} file(s). Review with: git diff")
    return 0


SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def cmd_new(args: argparse.Namespace) -> int:
    """Write one document from its template, in the right place.

    The seventeen templates used to sit in site-packages with no way to reach
    them from a terminal, so a new document started as a copy of whichever
    existing one was nearest — and inherited its fields.
    """
    _require_schema_version()
    doc_type = keel_lib.BY_NAME.get(args.type)
    if doc_type is None:
        raise CommandError(
            f"unknown type '{args.type}' — one of: "
            + ", ".join(t.name for t in keel_lib.TYPES)
        )
    if not SLUG_RE.match(args.slug):
        raise CommandError(
            f"'{args.slug}' is not a slug — lowercase letters, digits and hyphens, "
            f"starting with a letter or digit"
        )

    # Every id in the documentation is written with its prefix, so the first
    # instinct is to pass the whole id as the slug. That used to write
    # pol-pol-acceptable-use without a word. Absorbing the repeat silently
    # would be the other way to handle it, and the wrong one: the id is the
    # filename and the anchor other documents reference, so the one thing it
    # must not be is something the tool decided on its own. Only this type's
    # own prefix counts — "gap-management" is a perfectly good policy.
    if args.slug.startswith(f"{doc_type.prefix}-"):
        bare = args.slug[len(doc_type.prefix) + 1:]
        raise CommandError(
            f"'{args.slug}' already carries the '{doc_type.prefix}-' prefix that "
            f"new adds — the id would be '{doc_type.prefix}-{args.slug}'."
            + (f" Run: kilagen new {args.type} {bare}" if SLUG_RE.match(bare) else "")
        )

    template = keel_lib.KEEL / "content" / "templates" / f"{doc_type.name}.md"
    if not template.is_file():
        raise CommandError(f"no template ships for '{doc_type.name}'")

    today = date.today()
    doc_id = f"{doc_type.prefix}-{args.slug}"
    folder = keel_lib.PROGRAM / doc_type.folder
    if doc_type.dated:
        folder = folder / str(today.year)
    target = folder / f"{doc_id}.md"
    if target.exists():
        raise CommandError(f"{target.relative_to(keel_lib.REPO)} already exists")

    # The template's dates are anchored to the same day the starter's are, so
    # the same shift keeps "reviewed today, due in a year" true.
    text = _reanchor_dates(template.read_text(encoding="utf-8"), today)
    text = re.sub(r"^id:.*$", f"id: {doc_id}", text, count=1, flags=re.M)

    folder.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    print(f"Wrote {target.relative_to(keel_lib.REPO)}")
    print("Replace every REPLACE ME, then run: kilagen check")
    return 0


def cmd_migrate(args: argparse.Namespace) -> int:
    """Bring program/ content up to the contract this release expects."""
    from . import migrations

    config = keel_lib.PROGRAM / "config.yml"
    if not config.is_file():
        raise CommandError(f"no program found at {keel_lib.PROGRAM}")
    text = config.read_text(encoding="utf-8")
    declared = _declared_schema_version(yaml.safe_load(text) or {})

    if declared == SCHEMA_VERSION:
        print(f"Already at schema {SCHEMA_VERSION}. Nothing to migrate.")
        return 0
    if declared is None:
        raise CommandError(
            "program/config.yml declares no schema_version — add one before migrating"
        )
    if declared > SCHEMA_VERSION:
        raise CommandError(
            f"this program is at schema {declared}, ahead of kilagen {__version__} "
            f"(schema {SCHEMA_VERSION}). Upgrade: pip install -U kilagen"
        )

    steps = migrations.between(declared, SCHEMA_VERSION)
    if not steps:
        raise CommandError(
            f"no migration path from schema {declared} to {SCHEMA_VERSION}"
        )

    # The diff is the review, so it must not be mixed with unrelated work.
    # A repository with no commits has nothing to diff against, so the rule
    # has nothing to protect there — which is the case for an instance being
    # brought forward before its first commit. Outside a repository there is
    # no diff and no undo, so the guard refuses instead of falling silent.
    if args.apply:
        try:
            inside = subprocess.run(
                ["git", "rev-parse", "--is-inside-work-tree"],
                capture_output=True, text=True,
            ).stdout.strip() == "true"
        except FileNotFoundError:
            raise CommandError(
                "git is not on PATH, so this migration cannot be reviewed as a "
                "diff or undone. Install git, or migrate a copy of program/."
            ) from None
        if not inside:
            raise CommandError(
                f"{keel_lib.REPO} is not a git repository, so this migration "
                "could not be reviewed as a diff or undone. Run 'git init' and "
                "commit the program first."
            )
        has_head = subprocess.run(["git", "rev-parse", "--verify", "-q", "HEAD"],
                                  capture_output=True).returncode == 0
        status = subprocess.run(["git", "status", "--porcelain"],
                                capture_output=True, text=True)
        if status.returncode != 0:
            # An empty stdout from a *failed* git status is not a clean tree.
            # A held index.lock, a corrupt index or a dubious-ownership refusal
            # all land here, and treating them as clean turns the guard off at
            # exactly the moment something is already wrong.
            raise CommandError(
                "'git status' failed, so this migration's diff cannot be shown to "
                f"be reviewable: {status.stderr.strip() or 'no output'}"
            )
        dirty = status.stdout.strip()
        if dirty and has_head:
            raise CommandError(
                "the working tree has uncommitted changes; commit or stash them so "
                "the migration's diff stands on its own"
            )

    print(f"schema {declared} -> {SCHEMA_VERSION}\n")
    skipped: list[str] = []
    for step in steps:
        try:
            changed = step.apply(keel_lib.PROGRAM, dry_run=not args.apply)
        except migrations.MigrationError as exc:
            raise CommandError(f"{step.name} refused to run: {exc}") from None
        skipped += [line for line in changed if "SKIPPED" in line]
        print(f"  {step.name}")
        for line in changed:
            print(f"    {line}")
        if not changed:
            print("    (no files affected)")

    if not args.apply:
        print("\nNothing written. Re-run with --apply to migrate.")
        return 0

    if skipped:
        # Stamping the new version now would have the program claim a contract
        # that some of its documents were never brought up to.
        raise CommandError(
            f"{len(skipped)} document(s) could not be migrated, so the schema "
            f"version has not been stamped. Fix them and re-run:\n  "
            + "\n  ".join(skipped)
        )

    # Re-read: a migration may have rewritten config.yml itself, and stamping
    # the version onto the text read before it ran would silently undo that.
    config.write_text(
        re.sub(r"^schema_version:.*$", f"schema_version: {SCHEMA_VERSION}",
               config.read_text(encoding="utf-8"), count=1, flags=re.M),
        encoding="utf-8",
    )
    print("\nMigrated. Review with: git diff, then run: kilagen check")
    return 0


_UPDATE_TARGETS = {
    "config": cmd_upgrade,
    "content": cmd_migrate,
    "evidence": cmd_collect_evidence,
}

COMMANDS = {
    "init": cmd_init,
    "new": cmd_new,
    "check": cmd_check,
    "build": cmd_build,
    "serve": cmd_serve,
    "update": lambda args: _UPDATE_TARGETS[args.target](args),
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kilagen",
        description="Build and run a security program as Markdown and YAML in Git.",
    )
    parser.add_argument("--version", action="version", version=f"kilagen {__version__}")
    sub = parser.add_subparsers(dest="command", required=True, metavar="<command>")

    p = sub.add_parser("init", help="scaffold a program in the current repository")
    p.add_argument("--name", help="the organisation or program name")
    p.add_argument("--guided", action="store_true",
                   help="ask for the name, the frameworks and the default owner "
                        "instead of taking the defaults")
    p.add_argument("--deployment", default="github",
                   help="CI platform to wire up (default: github)")
    p.add_argument("--agent", default="claude",
                   help="agent integration to render (default: claude)")
    p.add_argument("--force", action="store_true",
                   help="proceed even if program/ already exists, or if the seed "
                        "would overwrite files this repository already has")

    p = sub.add_parser("new", help="write a document from its template")
    p.add_argument("type", metavar="TYPE",
                   help="the document type: " + ", ".join(t.name for t in keel_lib.TYPES))
    p.add_argument("slug", metavar="SLUG",
                   help="what it is about, in kebab-case and without the type "
                        "prefix: the id becomes <prefix>-<slug>")

    p = sub.add_parser("check", help="run the program's checks")
    # Validated in cmd_check rather than with choices=, which renders the
    # empty default as a bogus option in the error message.
    p.add_argument("target", nargs="*", metavar="TARGET",
                   help="one or more of: " + ", ".join(sorted(CHECKS))
                        + ". Defaults to all of them")
    p.add_argument("--strict", action="store_true",
                   help="fail on overdue reviews, expired exceptions and stale "
                        "gaps, which otherwise only report")

    p = sub.add_parser("build", help="build the site")
    p.add_argument("target", nargs="?", choices=["site"], metavar="TARGET",
                   help="site: skip validation and build _site/ only. "
                        "Defaults to validating first")

    p = sub.add_parser("serve", help="serve the built site")
    p.add_argument("--port", type=int, default=8000, help="port to listen on (default: 8000)")

    p = sub.add_parser("update", help="update what a previous release wrote")
    p.add_argument("target", choices=["config", "content", "evidence"], metavar="TARGET",
                   help="config: the files init copied into this repository; "
                        "content: program/ itself, when a release changes the schema; "
                        "evidence: run the collectors and record where the proof now lives")
    p.add_argument("--apply", action="store_true",
                   help="write the changes instead of only listing them")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return COMMANDS[args.command](args)
    except CommandError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
