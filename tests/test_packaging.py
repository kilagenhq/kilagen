"""Invariants a release must hold.

The instance CI pins the framework's major version. That pin lives in workflow
files inside the scaffold, four directories away from the version it tracks,
and nothing else notices when they drift apart. Releasing 1.0 while the seed
still says `kilagen<1` would silently freeze every instance on 0.x.

Run from the repository root:

    python3 -m unittest discover -s tests
"""

from __future__ import annotations

import re
import unittest

from kilagen import __version__
from kilagen.libs import keel_lib

WORKFLOWS = keel_lib.KEEL / "scaffold" / "deployments" / "github" / ".github" / "workflows"
PIN_RE = re.compile(r'pip install [^\n]*"(kilagen[^"]*)"')


def expected_pin(version: str) -> str:
    """The requirement an instance should pin, for a given framework version.

    Below 1.0 the pin is the whole 0.x line and promises nothing: semver
    exempts 0.x from compatibility, and this project is still moving. From 1.0
    the pin is a single major and the promise is real — breaking changes only
    ever land in a major, so staying inside one is staying safe.
    """
    major = int(version.split(".")[0])
    return "kilagen<1" if major == 0 else f"kilagen>={major},<{major + 1}"


class VersionPinTests(unittest.TestCase):
    def test_expected_pin_below_one(self):
        self.assertEqual(expected_pin("0.1.0"), "kilagen<1")
        self.assertEqual(expected_pin("0.9.3"), "kilagen<1")

    def test_expected_pin_from_one(self):
        self.assertEqual(expected_pin("1.0.0"), "kilagen>=1,<2")
        self.assertEqual(expected_pin("2.4.1"), "kilagen>=2,<3")

    def test_scaffold_workflows_pin_the_current_major(self):
        want = expected_pin(__version__)
        found = 0
        for workflow in sorted(WORKFLOWS.glob("*.yml")):
            for pin in PIN_RE.findall(workflow.read_text(encoding="utf-8")):
                found += 1
                self.assertEqual(
                    pin, want,
                    msg=(f"{workflow.name} pins '{pin}' but kilagen {__version__} "
                         f"expects '{want}' — update the seed's workflows"),
                )
        self.assertTrue(found, "expected the seed's workflows to pin kilagen")


if __name__ == "__main__":
    unittest.main(verbosity=2)
