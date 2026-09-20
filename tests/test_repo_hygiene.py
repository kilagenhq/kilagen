#!/usr/bin/env python3
"""Checks about the repository itself, which the other suites cannot see.

Every other test reads the working tree. These read what Git actually holds,
because the two can disagree — and when they do, the machine that disagrees is
never the one the author is sitting at.
"""

from __future__ import annotations

import os
import subprocess
import unittest
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
