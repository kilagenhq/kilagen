#!/usr/bin/env python3
"""Build the _site/ directory for GitHub Pages.

Scans ``program/`` for all documents and capabilities, reads lens taxonomies
from ``keel/content/lenses/``, and generates:

  1. ``_site/registry.json``   — structured data for the dashboard
  2. ``_site/`` directory      — dashboard + raw files for GitHub Pages

The registry.json contains all frontmatter metadata, capabilities, lens
taxonomies, and pre-calculated coverage. Document bodies are NOT included;
the dashboard fetches them on demand.

Invoked by the CLI; not runnable on its own:
    kilagen build
"""

import json
import shutil
import sys
from datetime import datetime, timezone

from .keel_lib import PROGRAM, REPO, KEEL, scan_all

SITE = REPO / "_site"


def build_registry_json(config, documents, capabilities, lenses, coverage, schedule=None, threat_history=None) -> dict:
    """Build the registry.json structure for the dashboard.

    Args:
        config: Instance config dict from ``load_config()``.
        documents: List of document dicts from ``scan_documents()``.
        capabilities: Capabilities dict from ``scan_capabilities()``.
        lenses: Lens taxonomy dict from ``scan_lenses()``.
        coverage: Coverage map from ``build_coverage()``.
        schedule: List of scheduled activity dicts from ``load_schedule()``.
        threat_history: Ordered threat-ranking snapshots from ``load_threat_history()``.

    Returns:
        Dict ready to be serialized as JSON into ``_site/registry.json``.
    """
    result = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "config": config,
        "documents": documents,
        "capabilities": capabilities,
        "lenses": lenses,
        "coverage": coverage,
    }
    if schedule is not None:
        result["schedule"] = schedule
    if threat_history is not None:
        result["threat_history"] = threat_history
    return result


def build_site(registry: dict):
    """Assemble the _site/ directory for GitHub Pages.

    Writes ``registry.json``, copies the dashboard, program content, and
    selected keel files. Also creates the root redirect and ``.nojekyll``.

    Args:
        registry: The registry dict from ``build_registry_json()``.
    """
    if SITE.exists():
        shutil.rmtree(SITE)
    SITE.mkdir()

    # registry.json
    (SITE / "registry.json").write_text(
        json.dumps(registry, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # Dashboard
    shutil.copytree(KEEL / "dashboard", SITE / "dashboard", ignore=shutil.ignore_patterns("node_modules", "tests", "*.config.js", "*.test.js", ".gitignore", ".node-version", "jsconfig.json"))

    # Program (raw .md files for on-demand body fetch)
    shutil.copytree(PROGRAM, SITE / "program")

    # keel (lenses, glossary, maturity, design for deep-link).
    #
    # The site layout is flat on purpose and is not the package layout: the
    # dashboard resolves framework material as ../keel/<name>, and its security
    # allowlist keys off those bare names. Authored material lives under
    # content/ in the package and is flattened here.
    keel_dest = SITE / "keel"
    keel_dest.mkdir()
    shutil.copytree(KEEL / "schemas", keel_dest / "schemas")
    for item in ["lenses", "templates", "glossary.md", "maturity.md", "design.md",
                 "compliance.md", "lenses.md", "instantiation.md", "README.md"]:
        src = KEEL / "content" / item
        if src.is_dir():
            shutil.copytree(src, keel_dest / item)
        elif src.is_file():
            shutil.copy2(src, keel_dest / item)

    # Root redirect
    (SITE / "index.html").write_text(
        '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=dashboard/"></head><body></body></html>\n',
        encoding="utf-8",
    )

    # .nojekyll
    (SITE / ".nojekyll").touch()


def main() -> int:
    data, warnings = scan_all(verbose=True)
    if warnings:
        print(f"\nERROR: {warnings} YAML warning(s) during scan — fix them before building.", file=sys.stderr)
        return 1

    print("Building registry.json...", end=" ", flush=True)
    registry = build_registry_json(**data)
    print("done")

    print("Building _site/...", end=" ", flush=True)
    try:
        build_site(registry)
    except OSError as exc:
        print(f"\nERROR: Failed to build _site/ — {exc}", file=sys.stderr)
        print("WARNING: _site/ may be in an inconsistent state.", file=sys.stderr)
        return 1
    print("done")

    print(f"\n  _site/registry.json  ({(SITE / 'registry.json').stat().st_size // 1024}KB)")
    print("  _site/               (ready for deploy or local server)")
    return 0

