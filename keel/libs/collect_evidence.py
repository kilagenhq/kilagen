#!/usr/bin/env python3
"""Run the collectors named on a requirement's evidence and refresh its pointer.

A collector goes and gets the artefact that proves a requirement — the access
review export, the pentest report, the configuration snapshot — puts it wherever
the organisation keeps such things, and comes back with two facts: where it now
lives, and the day it was produced.

**Those two facts are the only thing written into the repository.** Not the CSV,
not the PDF, not a copy of anything. A committed blob is recoverable by hash
long after it is deleted, the clone grows without bound, and evidence is exactly
the category most likely to hold personal data — which is why `check` refuses
binaries under `program/` and why this refuses to write one.

Resolution is the same two-layer rule the frameworks use: the instance's
``collectors/<name>.py`` wins, and ``keel/collectors/<name>.py`` is the
fallback, so a program can override a shipped collector without forking it.

Invoked by the CLI; not runnable on its own:
    kilagen update evidence [--apply]
"""

from __future__ import annotations

import importlib.util
import re
from datetime import date
from pathlib import Path
from types import ModuleType

from . import keel_lib
from .keel_lib import KEEL, scan_documents

# PROGRAM is read through the module rather than imported by name: a from-import
# freezes the value at import time, which is the one thing that makes a lib
# non-re-entrant. KEEL is the package's own directory and never moves, so it may
# be bound directly.

KEEL_COLLECTORS = KEEL / "collectors"
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class CollectorError(Exception):
    """A collector that could not be found, loaded, or believed."""


def collector_path(name: str, root: Path | None = None) -> Path:
    """Where a collector lives: the instance's first, then the shipped one."""
    root = root or keel_lib.PROGRAM.parent
    local = root / "collectors" / f"{name}.py"
    if local.is_file():
        return local
    shipped = KEEL_COLLECTORS / f"{name}.py"
    if shipped.is_file():
        return shipped
    raise CollectorError(
        f"no collector named {name} — expected collectors/{name}.py in this "
        f"repository, or one shipped with the framework")


def load(name: str, root: Path | None = None) -> ModuleType:
    """Import a collector module by name, without putting it on sys.path."""
    path = collector_path(name, root)
    spec = importlib.util.spec_from_file_location(f"kilagen_collector_{name.replace('-', '_')}", path)
    if spec is None or spec.loader is None:
        raise CollectorError(f"{path} is not importable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, "collect"):
        raise CollectorError(f"{path} defines no collect(config) function")
    return module


def _validate(result: object, name: str) -> dict:
    """A collector returns a pointer and a date, or it returns nothing useful."""
    if not isinstance(result, dict):
        raise CollectorError(f"{name} returned {type(result).__name__}, expected a dict")
    url = result.get("url")
    collected = str(result.get("collected", ""))
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        raise CollectorError(f"{name} returned no http(s) url")
    if not ISO_DATE.match(collected):
        raise CollectorError(f"{name} returned collected={collected!r}, expected YYYY-MM-DD")
    if collected > date.today().isoformat():
        raise CollectorError(f"{name} returned a date in the future ({collected})")
    return {"url": url, "collected": collected}


def _rewrite(text: str, name: str, fresh: dict) -> tuple[str, bool]:
    """Replace the url and collected of the entry that names this collector.

    Line by line, not with one regex over the whole file. The obvious pattern
    for "a list item and the keys under it" pairs a lazy quantifier with
    ``re.S``, and ``.*`` then matches newlines: on a document of any size that
    backtracks until it looks like a hang, which is exactly what it did.

    Text rather than a YAML round-trip, because the frontmatter of a program
    document is written by people and reformatting all of it to change two
    lines is not a diff anybody wants to review.
    """
    lines = text.split("\n")
    # Find the entry: a "- name:" line, then the keys indented under it, one of
    # which names this collector.
    for start in range(len(lines)):
        if not re.match(r"^\s*-\s+name:", lines[start]):
            continue
        indent = len(lines[start]) - len(lines[start].lstrip())
        end = start + 1
        while end < len(lines):
            line = lines[end]
            if not line.strip():
                break
            current = len(line) - len(line.lstrip())
            if current <= indent:
                break
            end += 1
        entry = lines[start:end]
        if not any(re.match(r"^\s*collector:\s*" + re.escape(name) + r"\s*$", x) for x in entry):
            continue

        changed = False
        seen_collected = False
        for i, line in enumerate(entry):
            # A file written on Windows has \r on every line, and `.*$` eats it.
            # Replacing a line without putting it back leaves one file with two
            # kinds of line ending, which turns a two-line change into a diff
            # that looks like something happened to the whole block.
            eol = "\r" if line.endswith("\r") else ""
            if re.match(r"^\s*url:", line):
                replacement = re.sub(r"^(\s*url:\s*).*$",
                                     lambda m: m.group(1) + fresh["url"] + eol, line)
                if replacement != line:
                    entry[i] = replacement
                    changed = True
            elif re.match(r"^\s*collected:", line):
                seen_collected = True
                replacement = re.sub(r"^(\s*collected:\s*).*$",
                                     lambda m: m.group(1) + "'" + fresh["collected"] + "'" + eol, line)
                if replacement != line:
                    entry[i] = replacement
                    changed = True
        if not seen_collected:
            pad = " " * (indent + 2)
            tail = "\r" if entry and entry[-1].endswith("\r") else ""
            entry.append(f"{pad}collected: '{fresh['collected']}'{tail}")
            changed = True
        if not changed:
            return text, False
        return "\n".join(lines[:start] + entry + lines[end:]), True

    return text, False


def main(apply: bool = False) -> int:
    documents = scan_documents()
    wanted = []
    for doc in documents:
        if doc.get("type") != "standard":
            continue
        for req in doc.get("requirements") or []:
            if not isinstance(req, dict):
                continue
            for item in req.get("evidence") or []:
                if isinstance(item, dict) and item.get("collector"):
                    wanted.append((doc, req, item))

    if not wanted:
        print("No evidence declares a collector. Nothing to run.")
        print("Add `collector: <name>` to an evidence entry, and a "
              "collectors/<name>.py beside program/.")
        return 0

    print(f"{len(wanted)} evidence entr{'y' if len(wanted) == 1 else 'ies'} "
          f"declare{'s' if len(wanted) == 1 else ''} a collector.\n")

    failures = 0
    for doc, req, item in wanted:
        name = item["collector"]
        where = f"{doc.get('id', '')}#{req.get('ref', '')} — {item.get('name', '')}"
        try:
            module = load(name)
            fresh = _validate(module.collect(dict(item)), name)
        except CollectorError as err:
            print(f"  {where}\n    FAILED — {err}")
            failures += 1
            continue
        except Exception as err:  # a collector is somebody else's code
            print(f"  {where}\n    FAILED — {name} raised {type(err).__name__}: {err}")
            failures += 1
            continue

        path = keel_lib.PROGRAM / doc["path"]
        text = path.read_text(encoding="utf-8")
        new_text, changed = _rewrite(text, name, fresh)
        if not changed:
            print(f"  {where}\n    unchanged ({fresh['collected']})")
            continue
        print(f"  {where}\n    -> {fresh['url']}  collected {fresh['collected']}")
        if apply:
            path.write_text(new_text, encoding="utf-8")

    print()
    if failures:
        print(f"{failures} collector(s) failed.")
    if apply:
        print("Written. Review with: git diff")
    else:
        print("Nothing written. Re-run with --apply to record the new pointers.")
    return 1 if failures else 0
