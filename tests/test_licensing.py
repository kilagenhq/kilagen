"""The licence boundary is mechanical, so it can be asserted.

Two licences live in this repository, split by one question: does the file end
up inside the user's repository? Everything that does is MIT-0, so a security
program carries no attribution obligation from its own scaffolding; everything
the instance merely invokes is Apache-2.0.

The split is only safe while it is computed rather than remembered. Adding
`scaffold/engines/cursor/` or a new starter directory would silently widen what
lands in someone's repository, and these tests are what makes that fail here
rather than in a licence audit.

Run from the repository root:

    python3 -m unittest discover -s tests
"""

from __future__ import annotations

import argparse
import contextlib
import io
import os
import tempfile
import re
import unittest
from pathlib import Path

from kilagen import cli
from kilagen.libs import keel_lib

ROOT = Path(__file__).resolve().parent.parent

# Every directory a file may be copied from into an instance. Each holds its
# own MIT-0 LICENSE; anything outside them is Apache-2.0.
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")

MIT0_DIRS = (
    keel_lib.KEEL / "scaffold",
    keel_lib.KEEL / "ai",
    keel_lib.KEEL / "content" / "templates",
    keel_lib.KEEL / "content" / "starter",
)


class LicenceFileTests(unittest.TestCase):
    def test_the_repository_carries_apache_and_a_notice(self):
        self.assertIn("Apache License", (ROOT / "LICENSE").read_text())
        # Section 4(d) requires the NOTICE to travel with every derivative.
        self.assertIn("Kilagen", (ROOT / "NOTICE").read_text())

    def test_every_mit0_directory_declares_it(self):
        for directory in MIT0_DIRS:
            licence = directory / "LICENSE"
            self.assertTrue(licence.is_file(), f"{directory} has no LICENSE")
            self.assertIn("MIT No Attribution", licence.read_text())

    def test_the_notice_credits_every_vendored_library(self):
        """Every redistributed library is credited where its copyright lives.

        js-yaml's upstream build carries no banner; the version line in our
        copy is written by `scripts/vendor-libs.sh` and is not a copyright
        notice, so NOTICE is where that credit has to be.

        The map is spelled out because a file name is not a package name:
        `purify.min.js` is DOMPurify. A new vendored file with no entry here
        fails the last assertion rather than passing silently.
        """
        packages = {
            "marked.umd.min.js": "marked",
            "purify.min.js": "DOMPurify",
            "js-yaml.min.js": "js-yaml",
        }
        notice = (ROOT / "NOTICE").read_text()
        vendored = sorted(p.name for p in (keel_lib.KEEL / "dashboard" / "vendor").glob("*.js"))
        self.assertEqual(vendored, sorted(packages), "vendor/ changed; update NOTICE and this map")
        for name, package in packages.items():
            self.assertIn(package, notice, f"{package} is redistributed but not in NOTICE")


class LicenceBoundaryTests(unittest.TestCase):
    """Nothing Apache-2.0 may reach an instance."""

    def _under_mit0(self, source: Path) -> bool:
        return any(source.is_relative_to(d) for d in MIT0_DIRS)

    def test_the_seed_plan_only_pulls_from_mit0_directories(self):
        offenders = []
        for deployment in cli._options("deployments"):
            for engine in cli._options("engines"):
                for rel, source in cli._seed_plan(deployment, engine).items():
                    if not self._under_mit0(source):
                        offenders.append(f"{deployment}/{engine}: {rel} <- {source}")
        self.assertEqual(offenders, [], "\n".join(offenders))

    def test_everything_init_writes_into_the_program_is_mit0(self):
        """The starter and the two seeded templates are copied, not invoked.

        Asserted by instantiating rather than by reading cmd_init, so a new
        `shutil.copy2` added there cannot escape the check.
        """
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        cwd, paths = os.getcwd(), (keel_lib.REPO, keel_lib.PROGRAM)
        self.addCleanup(lambda: (os.chdir(cwd),
                                 setattr(keel_lib, "REPO", paths[0]),
                                 setattr(keel_lib, "PROGRAM", paths[1])))
        os.chdir(tmp.name)
        with contextlib.redirect_stdout(io.StringIO()):
            cli.cmd_init(argparse.Namespace(
                name="Acme", deployment="github", agent="claude", force=False))

        # config.yml is the user's own output and carries no upstream
        # licence; everything else in program/ came from the seed.
        # Matched on content, not on name, because init both renames and
        # rewrites as it copies — the starter's dates are re-anchored to the
        # day the program was created, which changes the bytes without
        # changing where the text came from. Dates are normalised out of both
        # sides: a date is not the licensable expression.
        def normalised(path: Path) -> str:
            return DATE_RE.sub("DATE", path.read_text(encoding="utf-8", errors="replace"))

        mit0_text = {normalised(source)
                     for directory in MIT0_DIRS
                     for source in directory.rglob("*") if source.is_file()}

        copied = [p for p in (Path(tmp.name) / "program").rglob("*")
                  if p.is_file() and p.name != "config.yml"]
        self.assertTrue(copied, "init copied nothing into program/")
        for written in copied:
            self.assertIn(
                normalised(written), mit0_text,
                f"{written.relative_to(tmp.name)} landed in program/ but matches "
                f"no file in an MIT-0 directory",
            )


if __name__ == "__main__":
    unittest.main()
