"""Checks on this program's own content.

These assert things about `program/` — what this organization has written —
rather than about the Kilagen framework, which ships with its own tests.

Each check skips when the content it covers does not exist yet. A program
starts empty and fills up over time; "you have not written any standards yet"
is not a failure. Once the content exists, these run for real.

Run from the repository root:

    python3 -m unittest discover -s tests
"""

from __future__ import annotations

import re
import unittest

import yaml
from jsonschema import Draft202012Validator

from kilagen.libs import keel_lib
from kilagen.libs import validate_semantic_refs as vsr
from kilagen.libs.validate_frontmatter import load_schema

PROGRAM = keel_lib.PROGRAM
COVERAGE_YML = PROGRAM / "01-grc" / "compliance" / "coverage.yml"
FRAMEWORK_DOC = PROGRAM / "01-grc" / "standards" / "STD-risk-framework.md"
FRAMEWORKS_DIR = PROGRAM / "frameworks"

FORBIDDEN_POSTURE = {"met", "gap", "exception"}


class CoverageYmlPostureTests(unittest.TestCase):
    """coverage.yml records what is mapped, never whether it is compliant.

    The generator cannot emit a compliance judgment, but a committed file can
    be hand-edited. This is the guard on the file itself.
    """

    def test_coverage_yml_has_no_compliance_judgment(self):
        if not COVERAGE_YML.is_file():
            self.skipTest("no coverage.yml yet — run 'kilagen build'")
        data = yaml.safe_load(COVERAGE_YML.read_text(encoding="utf-8")) or {}
        for edition, clauses in data.items():
            for ref, entry in clauses.items():
                self.assertIn(entry.get("coverage"), {"mapped", "unmapped"},
                              msg=f"{edition}/{ref}: bad coverage {entry.get('coverage')!r}")
                posture = entry.get("posture")
                self.assertNotIn(posture, FORBIDDEN_POSTURE,
                                 msg=f"{edition}/{ref}: forbidden posture {posture!r}")
                if posture is not None:
                    self.assertEqual(posture, "not-assessed")


class CommittedVocabTests(unittest.TestCase):
    def test_committed_vocab_files_conform(self):
        files = sorted(FRAMEWORKS_DIR.glob("*.yml")) if FRAMEWORKS_DIR.is_dir() else []
        if not files:
            self.skipTest("no framework vocabularies declared yet")
        validator = Draft202012Validator(load_schema("framework-vocab.schema.json"))
        for f in files:
            data = yaml.load(f.read_text(encoding="utf-8"), Loader=keel_lib.StringLoader)
            errors = [e.message for e in validator.iter_errors(data)]
            self.assertEqual(errors, [], f"{f.name} violates the framework-vocab schema")


class CritBandMatrixTests(unittest.TestCase):
    def test_crit_band_matches_framework_doc_matrix(self):
        """The matrix documented here must agree with the framework's code.

        The criticality bands are framework constants mirrored as literals in
        Python and JavaScript. This parses the matrix in this program's risk
        framework standard and asserts every cell agrees, so editing the doc
        without the code fails CI instead of diverging silently.
        """
        if not FRAMEWORK_DOC.is_file():
            self.skipTest("no STD-risk-framework.md yet")
        text = FRAMEWORK_DOC.read_text(encoding="utf-8")
        # Data rows are likelihood rows: "| **5 Critical (Highly Likely)** | 5 Medium | ...".
        # The leading cell is the likelihood label, whose number is a level and
        # not a score, so it is dropped before parsing the five score cells.
        cell = re.compile(r"^\s*(\d+)\s+(Negligible|Low|Medium|High|Critical)\s*$")
        seen = {}
        for line in text.splitlines():
            if not re.match(r"^\|\s*\*\*\d+\s+\w+.*\(.*\)\*\*", line):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            for c in cells[1:]:
                m = cell.match(c)
                if m:
                    seen[int(m.group(1))] = m.group(2).lower()
        # Guard against a restructure silently emptying the check: a 5x5
        # likelihood x impact grid yields 14 distinct products.
        self.assertEqual(len(seen), 14,
                         msg=f"expected 14 distinct matrix scores, parsed {sorted(seen)}")
        for score, band in seen.items():
            self.assertEqual(vsr._crit_band(score), band,
                             msg=f"the matrix says score {score} -> {band}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
