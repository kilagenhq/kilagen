"""Checks on this program's own content.

These assert things about `program/` — what this organization has written —
rather than about the Kilagen framework, which ships with its own tests.

Each check skips when the content it covers does not exist yet. A program
starts small and fills up over time; "you have not written any standards yet"
is not a failure.

Run from the repository root:

    python3 -m unittest discover -s tests
"""

from __future__ import annotations

import unittest

import yaml
from jsonschema import Draft202012Validator

from kilagen.libs import keel_lib
from kilagen.libs.generate_coverage import build_coverage
from kilagen.libs.validate_frontmatter import load_schema

FRAMEWORKS_DIR = keel_lib.MODEL / "frameworks"

# Coverage says whether a clause has a requirement mapped to it. Whether that
# requirement is *met* is a human judgement and may never be generated.
FORBIDDEN_POSTURE = {"met", "gap", "exception", "compliant", "non-compliant"}


class CoveragePostureTests(unittest.TestCase):
    def test_coverage_asserts_no_compliance_judgment(self):
        documents = keel_lib.scan_documents()
        coverage = build_coverage(keel_lib.load_config(), documents,
                                  keel_lib.load_framework_vocab())
        declared = keel_lib.config_framework_ids(keel_lib.load_config())
        if not coverage:
            # Skip only when nothing is in scope. When frameworks *are*
            # declared and coverage came back empty, their vocabularies did not
            # resolve — and a skip here would switch off the guard using the
            # very failure it is meant to catch.
            if declared:
                self.fail(f"{len(declared)} framework(s) in scope but coverage is "
                          f"empty — their vocabularies did not resolve: "
                          f"{', '.join(sorted(declared))}")
            self.skipTest("no framework in scope has a clause vocabulary yet")
        for framework, clauses in coverage.items():
            for ref, entry in clauses.items():
                self.assertIn(entry["coverage"], {"mapped", "unmapped"},
                              msg=f"{framework}/{ref}: bad coverage {entry['coverage']!r}")
                posture = entry.get("posture")
                self.assertNotIn(posture, FORBIDDEN_POSTURE,
                                 msg=f"{framework}/{ref}: forbidden posture {posture!r}")
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


class TruthBoundaryTests(unittest.TestCase):
    """No document may mirror a truth this repository does not own.

    The schema already refuses the fields that existed when it was written.
    This is the guard against inventing a new one: a gap or a risk that grows
    a second state field alongside `tracker:` has started mirroring the
    tracker, whatever the field is called.
    """

    MIRRORS = {"tracker_status", "jira_status", "ticket_status", "maturity",
               "remediation_status", "progress"}

    def test_no_document_mirrors_a_tracker(self):
        offenders = []
        for doc in keel_lib.scan_documents():
            for field in self.MIRRORS & set(doc):
                offenders.append(f"{doc['path']}: {field}")
        self.assertEqual(offenders, [], "these fields mirror a truth the tracker owns")


if __name__ == "__main__":
    unittest.main(verbosity=2)
