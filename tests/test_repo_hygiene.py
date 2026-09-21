#!/usr/bin/env python3
"""Checks about the repository itself, which the other suites cannot see.

Every other test reads the working tree. These read what Git actually holds,
because the two can disagree — and when they do, the machine that disagrees is
never the one the author is sitting at.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class CaseDriftTests(unittest.TestCase):
    """A path Git spells differently from the disk is a Linux-only bug.

    macOS and Windows are case-insensitive, so a file renamed from
    `POL-thing.md` to `pol-thing.md` keeps working locally while Git goes on
    tracking the old name. Check out the same commit on Linux and the old name
    is what appears — and anything that resolves a type, an id or an import
    from the filename breaks there and only there.

    This happened: the starter's policy and standard were renamed to lowercase
    ids during the refactor, every local suite stayed green for weeks, and CI
    failed the first time the commit reached it with 49 errors whose message
    said nothing about filenames.
    """

    def test_git_and_the_disk_agree_on_every_filename(self):
        listed = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout

        drift = []
        for rel in filter(None, listed.split("\0")):
            directory, name = os.path.split(rel)
            try:
                entries = os.listdir(ROOT / directory if directory else ROOT)
            except FileNotFoundError:
                drift.append(f"{rel}: the directory Git tracks it in does not exist")
                continue
            if name in entries:
                continue
            same = [e for e in entries if e.lower() == name.lower()]
            if same:
                drift.append(f"{rel}: Git tracks this, the disk has {same[0]!r}")
            else:
                drift.append(f"{rel}: tracked but not on disk")

        self.assertEqual(drift, [], "\n".join(
            ["Git and the working tree disagree about these names. Fix with:",
             "  git mv -f <tracked> <what the disk says>", ""] + drift))


class WheelContentsTests(unittest.TestCase):
    """The artifact, not a proxy for it.

    The two tests below read MANIFEST.in and SOURCES.txt, which are inputs to
    the build rather than its output — `prune keel/collectors` on a later line
    would defeat the first, and the second can only fire on a dirty local tree.
    The failure that actually shipped was a directory missing from the wheel,
    and nothing looked in a wheel.

    Built through setuptools directly, so this needs no dependency the build
    does not already have and never touches the network.
    """

    # Not runtime data: build inputs, test files, and what pip compiles.
    EXCLUDED = (
        "keel/dashboard/node_modules/", "keel/dashboard/tests/",
        "keel/dashboard/package.json", "keel/dashboard/package-lock.json",
        "keel/dashboard/jsconfig.json", "keel/dashboard/.node-version",
    )
    EXCLUDED_SUFFIXES = (".test.js", ".config.js")

    @classmethod
    def setUpClass(cls):
        try:
            from setuptools import build_meta
        except ImportError:  # pragma: no cover - setuptools is a build require
            raise unittest.SkipTest("setuptools is not importable")
        cls._tmp = tempfile.TemporaryDirectory()
        cwd = os.getcwd()
        os.chdir(ROOT)
        try:
            name = build_meta.build_wheel(cls._tmp.name)
        finally:
            os.chdir(cwd)
        with zipfile.ZipFile(Path(cls._tmp.name) / name) as wheel:
            cls.names = set(wheel.namelist())

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def _expected(self) -> set[str]:
        tracked = subprocess.run(
            ["git", "ls-files", "-z", "keel"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.split("\0")
        return {
            f"kilagen/{name[len('keel/'):]}"
            for name in tracked
            if name
            and not name.startswith(self.EXCLUDED)
            and not name.endswith(self.EXCLUDED_SUFFIXES)
        }

    def test_every_runtime_file_the_source_tree_has_is_in_the_wheel(self):
        missing = sorted(self._expected() - self.names)
        self.assertEqual(missing, [], "\n".join(
            ["These files are in Git and not in the wheel, so an installed",
             "instance cannot reach them. Check MANIFEST.in:", ""] + missing))

    def test_the_wheel_carries_no_build_inputs(self):
        strays = sorted(
            name for name in self.names
            if name.startswith("kilagen/")
            and (name.startswith(tuple(f"kilagen/{e[len('keel/'):]}" for e in self.EXCLUDED))
                 or name.endswith(self.EXCLUDED_SUFFIXES)
                 or name.endswith((".pyc", ".pyo"))
                 or "__pycache__" in name))
        self.assertEqual(strays, [], "build inputs shipped to users")


class DistributionTests(unittest.TestCase):
    """What Git holds and what the wheel holds are a third place to disagree.

    The framework's data — templates, schemas, frameworks, the seed, the
    dashboard, the collectors — is not code and does not travel unless
    MANIFEST.in says so. An instance reaches all of it through the install, so
    a directory nobody grafted is simply absent at run time, and the whole
    development loop is blind to it: the repository uses an editable install,
    which reads the source tree.
    """

    def test_every_directory_under_keel_travels_in_the_package(self):
        manifest = (ROOT / "MANIFEST.in").read_text(encoding="utf-8")
        grafted = {line.split(None, 1)[1].strip()
                   for line in manifest.splitlines() if line.startswith("graft ")}
        # Declared as packages in pyproject, so their .py files travel as code.
        as_code = {"keel/libs", "keel/migrations"}

        missing = sorted(
            f"keel/{entry.name}"
            for entry in (ROOT / "keel").iterdir()
            if entry.is_dir() and not entry.name.startswith((".", "__"))
            and f"keel/{entry.name}" not in grafted | as_code
        )
        self.assertEqual(missing, [], "\n".join(
            ["These directories would not be installed. Add to MANIFEST.in:", ""]
            + [f"  graft {name}" for name in missing]))

    def test_packaging_metadata_does_not_hold_names_git_has_renamed(self):
        """A stale SOURCES.txt puts old filenames into the built wheel.

        setuptools treats `*.egg-info/SOURCES.txt` as a cache and keeps adding
        to it. A file renamed only in case — the rename in CaseDriftTests above
        — leaves the old spelling there, and on a case-insensitive filesystem
        the stale entry wins and ships. The result installs but does not run,
        because ids are resolved from filenames.

        Clean the artifact before building a release: `rm -rf build dist
        *.egg-info`.
        """
        tracked = set(subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.split("\0"))

        stale = []
        for sources in sorted(ROOT.glob("*.egg-info/SOURCES.txt")):
            for line in sources.read_text(encoding="utf-8").splitlines():
                name = line.strip()
                if name.startswith("keel/") and name not in tracked:
                    stale.append(f"{sources.parent.name}: {name}")

        self.assertEqual(stale, [], "\n".join(
            ["Stale packaging metadata names files Git does not track. A release",
             "built from this tree would ship them. Fix with:",
             "  rm -rf build dist *.egg-info", ""] + stale))


if __name__ == "__main__":
    unittest.main(verbosity=2)
