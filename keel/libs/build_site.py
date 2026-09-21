#!/usr/bin/env python3
"""Build the _site/ directory the dashboard is served from.

Produces:

  1. ``_site/registry.json`` — every document's frontmatter, the vocabularies,
     the publishing contract and the computed framework coverage. Document
     bodies are not included; the dashboard fetches them on demand.
  2. ``_site/`` — the dashboard, the raw program files, and the framework's
     own written material.

Invoked by the CLI; not runnable on its own:
    kilagen build
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import keel_lib
from .generate_coverage import build_coverage, build_requirement_state, summarize
from .keel_lib import (TYPES, extract_frontmatter, load_framework_meta,
                       load_framework_vocab, scan_all)

# Framework material the dashboard deep-links into. The site layout is flat on
# purpose and is not the package layout: the dashboard resolves this material
# as ../keel/<name>, and its security allowlist keys off those bare names.
KEEL_SITE_ITEMS = ["templates", "adrs", "glossary.md", "design.md",
                   "compliance.md", "instantiation.md", "README.md"]


def site_dir() -> Path:
    """Where the site is built — resolved at call time, never at import."""
    return keel_lib.REPO / "_site"


def framework_adrs() -> list[dict]:
    """Index the framework's own ADRs, so the dashboard can list them.

    They are shipped material, not program content, so they never enter the
    document scan — but the Reference page needs their titles and the sentence
    under each one, and the build is the only place that knows what it copied.
    """
    folder = keel_lib.KEEL / "content" / "adrs"
    if not folder.is_dir():
        return []
    entries = []
    for path in sorted(folder.glob("*.md")):
        if path.name == "README.md":
            continue
        fm = extract_frontmatter(path) or {}
        entries.append({
            "path": f"keel/adrs/{path.name}",
            "id": fm.get("id") or path.stem,
            "description": " ".join(str(fm.get("description", "")).split()),
            "title": fm.get("title") or path.stem,
            "decided": fm.get("decided", ""),
        })
    return entries


def tool_inventory() -> dict:
    """The vendored tool inventory, by capability.

    Reference material about other people's products, maintained in its own
    repository and snapshotted into a release (scripts/vendor-tools.sh). It
    never says what this organisation runs — that is the estate's truth — and
    it is never a recommendation.
    """
    folder = keel_lib.KEEL / "content" / "tools"
    if not folder.is_dir():
        return {}
    found = {}
    for path in sorted(folder.glob("*.yml")):
        data = keel_lib._load_yaml(path) or {}
        capability = data.get("capability")
        if capability and data.get("tools"):
            found[capability] = {"updated": str(data.get("updated", "")),
                                 "tools": data["tools"]}
    return found


def collector_inventory() -> dict:
    """The collectors this program can run, by name.

    A collector refreshes one piece of evidence and returns two facts: where
    the artefact now lives, and the day it was produced. Which ones exist is
    the one thing the dashboard cannot work out for itself — the evidence
    entries name the collectors they use, but a collector nobody has wired up
    yet is invisible from the content, and those are exactly the ones somebody
    browsing wants to find.

    Resolution is the two-layer rule ``collect_evidence`` uses: the instance's
    ``collectors/<name>.py`` wins over a shipped one of the same name.

    **Read as text, never imported.** Importing runs somebody else's code, and
    a build that executes the modules it is cataloguing is a build that can be
    made to do anything by adding a file. The docstring and a ``raise
    NotImplementedError`` are both plainly visible without running a line.
    """
    found: dict[str, dict] = {}
    # Shipped first, so an instance's collector of the same name overwrites it.
    sources = [("framework", keel_lib.KEEL / "collectors"),
               ("program", keel_lib.PROGRAM.parent / "collectors")]
    for source, folder in sources:
        if not folder.is_dir():
            continue
        for path in sorted(folder.glob("*.py")):
            if path.name.startswith("_"):
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            found[path.stem] = {
                "source": source,
                "path": f"collectors/{path.name}" if source == "program"
                        else f"keel/collectors/{path.name}",
                "summary": _module_summary(text),
                # A shipped module that only raises is the shape of a collector
                # rather than one: saying so beats letting somebody wire it up
                # and discover it at the next scheduled run.
                "template": "NotImplementedError" in text,
            }
    return found


def _module_summary(text: str) -> str:
    """The first line of a module docstring, which is written as a summary."""
    match = re.search(r'^\s*(?:"""|\'\'\')(.*?)(?:"""|\'\'\')', text, re.S)
    if not match:
        return ""
    first = match.group(1).strip().split("\n\n")[0]
    return " ".join(first.split())


def build_registry_json(config: dict, documents: list[dict], model: dict, publish: dict,
                        coverage: dict, requirements: dict,
                        schedule: list[dict] | None = None,
                        frameworks: dict | None = None) -> dict:
    """Assemble the structure the dashboard reads.

    ``types`` travels with it so the dashboard renders the type registry rather
    than keeping a second copy of it that can drift.
    """
    registry = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        # False when `kilagen build site` skipped the validators. The dashboard
        # says so on every page: a build that did not check its content should
        # not be able to look like one that did.
        "validated": VALIDATED,
        "config": config,
        "types": [{"name": t.name, "prefix": t.prefix, "folder": t.folder,
                   "dated": t.dated, "immutable": t.immutable} for t in TYPES],
        "documents": documents,
        "model": model,
        "publish": publish,
        "coverage": coverage,
        "requirements": requirements,
        # The structure and prose of each framework, kept apart from coverage
        # on purpose: a group, a colour or a description must never be able to
        # influence what coverage computes.
        "frameworks": frameworks if frameworks is not None else {},
        "framework_adrs": framework_adrs(),
        "tools": tool_inventory(),
        "collectors": collector_inventory(),
    }
    if schedule is not None:
        registry["schedule"] = schedule
    return registry


def build_site(registry: dict) -> None:
    """Assemble the _site/ directory."""
    site = site_dir()
    if site.exists():
        shutil.rmtree(site)
    site.mkdir()

    (site / "registry.json").write_text(
        json.dumps(registry, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    shutil.copytree(
        keel_lib.KEEL / "dashboard", site / "dashboard",
        ignore=shutil.ignore_patterns("node_modules", "tests", "*.config.js", "*.test.js",
                                      ".gitignore", ".node-version", "jsconfig.json"),
    )

    # program/branding.css, if the instance wrote one: copied next to app.css
    # and loaded after it, so redefining a public token is one line and no
    # fork. index.html links it unconditionally; a missing file is a 404 the
    # browser ignores, and one request beats generating two index pages.
    branding = keel_lib.PROGRAM / "branding.css"
    if branding.is_file():
        shutil.copy2(branding, site / "dashboard" / "branding.css")
        print("  program/branding.css  (instance palette)")

    # Raw .md files, so the dashboard can fetch a document body on demand.
    shutil.copytree(keel_lib.PROGRAM, site / "program")

    keel_dest = site / "keel"
    keel_dest.mkdir()
    shutil.copytree(keel_lib.KEEL / "schemas", keel_dest / "schemas")
    for item in KEEL_SITE_ITEMS:
        src = keel_lib.KEEL / "content" / item
        if src.is_dir():
            shutil.copytree(src, keel_dest / item)
        elif src.is_file():
            shutil.copy2(src, keel_dest / item)

    (site / "index.html").write_text(
        '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=dashboard/"></head><body></body></html>\n',
        encoding="utf-8",
    )
    (site / ".nojekyll").touch()


# Set by cmd_build before main() runs. `kilagen build site` skips validation,
# and the registry records that so the page can admit it.
VALIDATED = True


def main() -> int:
    data, warnings = scan_all(verbose=True)
    if warnings:
        print(f"\nERROR: {warnings} YAML warning(s) during scan — fix them before building.", file=sys.stderr)
        return 1

    print("Computing framework coverage...", end=" ", flush=True)
    vocab = load_framework_vocab()
    meta = load_framework_meta()
    # Re-check: the gate above ran before these two, so a framework file that
    # failed to parse warned into a counter nobody read again.
    late = keel_lib.get_warnings()
    if late:
        print()
        print(f"\nERROR: {len(late)} warning(s) loading the framework vocabularies "
              f"— fix them before building.", file=sys.stderr)
        for warning in late:
            print(f"  {warning}", file=sys.stderr)
        return 1
    coverage = build_coverage(data["config"], data["documents"], vocab)
    requirements = build_requirement_state(data["documents"])
    counts = summarize(coverage)
    print(", ".join(f"{fw} {c['mapped']}/{c['clauses']} mapped" for fw, c in counts.items()) or "no frameworks")

    print("Building registry.json...", end=" ", flush=True)
    registry = build_registry_json(
        data["config"], data["documents"], data["model"], data["publish"],
        coverage, requirements, data["schedule"], meta,
    )
    print("done")

    # publish: none keeps a document out of external destinations, never out
    # of the built site — the site is as public as the repository. Saying so
    # here is what stops somebody discovering it the expensive way.
    unpublished = [d["id"] for d in data["documents"]
                   if d.get("publish") == "none" and d.get("id")]
    if unpublished:
        print(f"  note: {len(unpublished)} document(s) marked 'publish: none' are still in "
              "_site/ — that field governs external destinations, not the dashboard "
              "(keel/adrs/adr-one-way-publishing.md)")

    print("Building _site/...", end=" ", flush=True)
    try:
        build_site(registry)
    except OSError as exc:
        print(f"\nERROR: Failed to build _site/ — {exc}", file=sys.stderr)
        print("WARNING: _site/ may be in an inconsistent state.", file=sys.stderr)
        return 1
    print("done")

    site = site_dir()
    print(f"\n  _site/registry.json  ({(site / 'registry.json').stat().st_size // 1024}KB)")
    print("  _site/               (ready for deploy or local server)")
    return 0
