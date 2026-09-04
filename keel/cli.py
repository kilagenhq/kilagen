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
from pathlib import Path

import yaml

from . import SCHEMA_VERSION, __version__
from .libs import keel_lib

SCAFFOLD = keel_lib.KEEL / "scaffold"
SKILLS = keel_lib.KEEL / "ai" / "skills"
MANIFEST_NAME = ".kilagen-manifest.yml"

# Domains a fresh program starts with. Numbered because the framework
# discovers them by the NN- prefix; more can be added by hand later.
INITIAL_DOMAINS = ["01-grc"]


class CommandError(Exception):
    """A failure worth reporting to the user without a traceback."""


# --------------------------------------------------------------------------
# helpers


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _options(kind: str) -> list[str]:
    """Available deployments or engines, read from the shipped scaffold."""
    root = SCAFFOLD / kind
    return sorted(d.name for d in root.iterdir() if d.is_dir()) if root.is_dir() else []


def _tree_plan(src: Path, prefix: Path | None = None) -> dict[Path, Path]:
    """Map destination-relative path -> source file, without writing anything.

    A README.md at the root of the source describes the option itself — what
    this deployment wires up, when to pick it — and stays behind. Copying it
    would overwrite the instance's own README.
    """
    plan: dict[Path, Path] = {}
    if not src.is_dir():
        return plan
    for item in sorted(src.rglob("*")):
        if not item.is_file():
            continue
        rel = item.relative_to(src)
        if rel == Path("README.md"):
            continue
        plan[prefix / rel if prefix else rel] = item
    return plan


def _write_plan(plan: dict[Path, Path], dest: Path) -> list[Path]:
    """Apply a plan, returning the destination-relative paths written."""
    for rel, source in sorted(plan.items()):
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return sorted(plan)


def _seed_plan(deployment: str, agent: str) -> dict[Path, Path]:
    """Everything the current package would copy for these choices."""
    plan = _tree_plan(SCAFFOLD / "base")
    plan |= _tree_plan(SCAFFOLD / "deployments" / deployment)
    engine_file = SCAFFOLD / "engines" / agent / "engine.yml"
    engine = yaml.safe_load(engine_file.read_text(encoding="utf-8")) or {} \
        if engine_file.is_file() else {}
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
        "files": {str(rel): entries[rel] for rel in sorted(entries)},
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
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _program_config(name: str) -> str:
    return (
        "# Identity and framework selection for this program.\n"
        f"name: {name}\n"
        "repo: \"\"\n"
        "\n"
        "# How far this content has been migrated. Managed by 'kilagen update content';\n"
        "# do not edit by hand.\n"
        f"schema_version: {SCHEMA_VERSION}\n"
        "\n"
        "# Compliance frameworks this program maps to. Each id needs a matching\n"
        "# program/frameworks/<id>.yml holding its clause vocabulary.\n"
        "frameworks: []\n"
    )


def _require_schema_version() -> None:
    """Block when the content and the installed framework disagree (D-010)."""
    config = keel_lib.PROGRAM / "config.yml"
    if not config.is_file():
        raise CommandError(
            f"no program found at {keel_lib.PROGRAM} — run 'kilagen init' first"
        )
    data = yaml.safe_load(config.read_text(encoding="utf-8")) or {}
    declared = data.get("schema_version")
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


def cmd_init(args: argparse.Namespace) -> int:
    target = Path.cwd().resolve()
    program = target / "program"

    # Argument errors first: an unusable flag should be reported whether or not
    # the directory happens to be initialised already.
    for kind, value in (("deployments", args.deployment), ("engines", args.agent)):
        if value not in _options(kind):
            raise CommandError(
                f"unknown {kind[:-1]} '{value}' — available: {', '.join(_options(kind))}"
            )
    if program.exists() and not args.force:
        raise CommandError(f"{program} already exists — refusing to overwrite (use --force)")

    copied = _write_plan(_seed_plan(args.deployment, args.agent), target)

    # The program layer is the user's, so it is generated rather than copied
    # and never appears in the manifest: upgrade must not touch it.
    program.mkdir(parents=True, exist_ok=True)
    (program / "config.yml").write_text(_program_config(args.name), encoding="utf-8")
    # Seeded from the shipped templates rather than written here, so the
    # starting content stays editable data instead of strings in the CLI.
    for template in ("gaps.yml", "risk-taxonomy.yml"):
        shutil.copy2(keel_lib.KEEL / "content" / "templates" / template, program / template)
    for domain in INITIAL_DOMAINS:
        (program / domain).mkdir(exist_ok=True)
    for sub in ("systems", "roles", "frameworks"):
        (program / sub).mkdir(exist_ok=True)

    _write_manifest(target, args.deployment, args.agent,
                    {rel: {"version": __version__, "sha256": _sha256(target / rel)}
                     for rel in copied})

    print(f"Initialised '{args.name}' in {target}")
    print(f"  deployment: {args.deployment}    agent: {args.agent}")
    print(f"  {len(copied)} files copied, tracked in {MANIFEST_NAME}")
    print("\nNext: add your first standard under program/01-grc/, then run 'kilagen check'.")
    return 0


def _check_frontmatter() -> int:
    from .libs import validate_frontmatter

    return validate_frontmatter.main()


def _check_refs() -> int:
    from .libs import validate_semantic_refs

    return validate_semantic_refs.main()


def _check_reviews() -> int:
    from .libs import check_reviews

    return check_reviews.main()


def _check_artifacts() -> int:
    """Committed artifacts must match what this release would generate.

    Compares rather than regenerates: a check that writes is not a check, and
    this one runs in CI against a checkout that must stay untouched.
    """
    from .libs import generate_coverage, generate_registry

    stale = []

    expected = generate_coverage.render_coverage_yaml(generate_coverage.compute())
    path = generate_coverage.output_path()
    if not path.is_file() or path.read_text(encoding="utf-8") != expected:
        stale.append("program/01-grc/compliance/coverage.yml")

    expected, warnings = generate_registry.compute()
    if warnings:
        return 1
    path = generate_registry.output_path()
    if not path.is_file():
        stale.append("program/registry.md")
    elif generate_registry.strip_date(path.read_text(encoding="utf-8")) != \
            generate_registry.strip_date(expected):
        stale.append("program/registry.md")

    if stale:
        print("Generated artifacts are out of date:", file=sys.stderr)
        for name in stale:
            print(f"  {name}", file=sys.stderr)
        print("\nRun: kilagen build artifacts", file=sys.stderr)
        return 1
    print("Generated artifacts are up to date.")
    return 0


def _check_registry() -> int:
    """Refuse a commit that changes program/ content but leaves registry.md behind."""
    staged = subprocess.run(
        ["git", "diff", "--cached", "--name-only"],
        capture_output=True, text=True, check=True,
    ).stdout.split()
    content = [f for f in staged
               if f.startswith("program/") and f.endswith((".md", ".yml"))
               and f != "program/registry.md"]
    if not content:
        return 0

    # Nothing to stage if the registry itself has not been regenerated.
    dirty = subprocess.run(
        ["git", "diff", "--quiet", "HEAD", "--", "program/registry.md"]
    ).returncode
    if dirty == 0 or "program/registry.md" in staged:
        return 0

    print("\n  WARNING: program/registry.md has been updated but is not staged.")
    print("  Run: git add program/registry.md\n")
    return 1


CHECKS = {
    "frontmatter": _check_frontmatter,
    "refs": _check_refs,
    "reviews": _check_reviews,
    "artifacts": _check_artifacts,
    "registry": _check_registry,
}


def cmd_check(args: argparse.Namespace) -> int:
    _require_schema_version()
    # No target means every check. Naming one narrows it; that is the only
    # difference, so a new check never becomes a new command.
    unknown = [t for t in args.target if t not in CHECKS]
    if unknown:
        raise CommandError(
            f"unknown check {', '.join(unknown)} — available: {', '.join(sorted(CHECKS))}"
        )
    targets = args.target or [t for t in CHECKS if t != "registry"]
    status = 0
    for name in targets:
        status |= CHECKS[name]()
    return 1 if status else 0


def cmd_build(args: argparse.Namespace) -> int:
    _require_schema_version()
    from .libs import build_site, generate_coverage, generate_registry

    target = args.target or "all"

    # Validate before generating: artifacts derived from invalid content are
    # worse than no artifacts, because they look authoritative.
    if target == "all":
        if _check_frontmatter() or _check_refs():
            return 1
    if target in ("all", "artifacts"):
        if generate_coverage.main() or generate_registry.main():
            return 1
    if target in ("all", "site"):
        return build_site.main()
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    import functools
    import http.server

    site = keel_lib.REPO / "_site"
    if not site.is_dir():
        raise CommandError(f"no site at {site} — run 'kilagen build' first")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
    print(f"Serving {site} at http://localhost:{args.port}")
    http.server.ThreadingHTTPServer(("", args.port), handler).serve_forever()
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
    recorded = manifest.get("files") or {}
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
    # written by the framework, so an edited file stays recognisably edited.
    entries = {Path(name): entry for name, entry in recorded.items()
               if (target / name).is_file()}
    entries.update({rel: {"version": __version__, "sha256": _sha256(target / rel)}
                    for rel in written})
    _write_manifest(target, deployment, agent, entries)
    print(f"\nUpdated {len(written)} file(s). Review with: git diff")
    return 0


def cmd_migrate(args: argparse.Namespace) -> int:
    """Bring program/ content up to the contract this release expects."""
    from . import migrations

    config = keel_lib.PROGRAM / "config.yml"
    if not config.is_file():
        raise CommandError(f"no program found at {keel_lib.PROGRAM}")
    text = config.read_text(encoding="utf-8")
    declared = (yaml.safe_load(text) or {}).get("schema_version")

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
    dirty = subprocess.run(["git", "status", "--porcelain"],
                           capture_output=True, text=True).stdout.strip()
    if dirty and args.apply:
        raise CommandError(
            "the working tree has uncommitted changes; commit or stash them so "
            "the migration's diff stands on its own"
        )

    print(f"schema {declared} -> {SCHEMA_VERSION}\n")
    for step in steps:
        changed = step.apply(keel_lib.PROGRAM, dry_run=not args.apply)
        print(f"  {step.name}")
        for line in changed:
            print(f"    {line}")
        if not changed:
            print("    (no files affected)")

    if not args.apply:
        print("\nNothing written. Re-run with --apply to migrate.")
        return 0

    config.write_text(
        re.sub(r"^schema_version:.*$", f"schema_version: {SCHEMA_VERSION}",
               text, count=1, flags=re.M),
        encoding="utf-8",
    )
    print("\nMigrated. Review with: git diff, then run: kilagen check")
    return 0


COMMANDS = {
    "init": cmd_init,
    "check": cmd_check,
    "build": cmd_build,
    "serve": cmd_serve,
    "update": lambda args: (cmd_upgrade if args.target == "config" else cmd_migrate)(args),
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kilagen",
        description="Build and run a security program as Markdown and YAML in Git.",
    )
    parser.add_argument("--version", action="version", version=f"kilagen {__version__}")
    sub = parser.add_subparsers(dest="command", required=True, metavar="<command>")

    p = sub.add_parser("init", help="scaffold a program in the current repository")
    p.add_argument("--name", required=True, help="the organisation or program name")
    p.add_argument("--deployment", default="github",
                   help="CI platform to wire up (default: github)")
    p.add_argument("--agent", default="claude",
                   help="agent integration to render (default: claude)")
    p.add_argument("--force", action="store_true",
                   help="proceed even if program/ already exists")

    p = sub.add_parser("check", help="run the program's checks")
    # Validated in cmd_check rather than with choices=, which renders the
    # empty default as a bogus option in the error message.
    p.add_argument("target", nargs="*", metavar="TARGET",
                   help="one or more of: " + ", ".join(sorted(CHECKS))
                        + ". Defaults to every check except registry, which is "
                          "a pre-commit guard and needs staged changes")

    p = sub.add_parser("build", help="regenerate artifacts and build the site")
    p.add_argument("target", nargs="?", choices=["artifacts", "site"], metavar="TARGET",
                   help="artifacts: the committed coverage and registry files; "
                        "site: _site/ only. Defaults to validating and doing both")

    p = sub.add_parser("serve", help="serve the built site")
    p.add_argument("--port", type=int, default=8000, help="port to listen on (default: 8000)")

    p = sub.add_parser("update", help="update what a previous release wrote")
    p.add_argument("target", choices=["config", "content"], metavar="TARGET",
                   help="config: the files init copied into this repository; "
                        "content: program/ itself, when a release changes the schema")
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
