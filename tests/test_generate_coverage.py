"""Tests for the coverage.yml renderer in generate_coverage.py.

Orchestration (config x vocab x mappings -> map) is exercised by running the
generator against the real repo; this pins the rendering contract.

Run from the repo root:

    python3 -m unittest keel.scripts.tests.test_generate_coverage
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import yaml


from kilagen.libs import keel_lib
from kilagen.libs import generate_coverage as gen

COVERAGE_MAP = {
    "nist_csf": {
        "13.1": {"coverage": "mapped"},
        "9.5": {"coverage": "unmapped", "posture": "not-assessed"},
    }
}


class RenderCoverageYamlTests(unittest.TestCase):
    def test_do_not_edit_header_first_line(self):
        first = gen.render_coverage_yaml(COVERAGE_MAP).splitlines()[0]
        self.assertTrue(first.startswith("#"))
        self.assertIn("DO NOT EDIT", first)

    def test_roundtrips_to_the_coverage_map(self):
        self.assertEqual(yaml.safe_load(gen.render_coverage_yaml(COVERAGE_MAP)), COVERAGE_MAP)

    def test_unmapped_carries_not_assessed(self):
        loaded = yaml.safe_load(gen.render_coverage_yaml(COVERAGE_MAP))
        self.assertEqual(loaded["nist_csf"]["9.5"]["posture"], "not-assessed")
        self.assertNotIn("posture", loaded["nist_csf"]["13.1"])


class GeneratorMainTests(unittest.TestCase):
    """main() orchestration: writes coverage.yml and fails the run if any data
    was skipped (warn-and-skip surfaced via get_warnings, like the validator)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        (self.repo / "program" / "01-grc" / "compliance").mkdir(parents=True)
        self._orig = {k: getattr(gen, k) for k in
                      ("load_config", "load_framework_vocab", "scan_framework_mappings")}
        # The generator resolves the repository through keel_lib at call
        # time, so that is what a test has to move.
        self._orig_repo = keel_lib.REPO
        keel_lib.REPO = self.repo
        keel_lib._warnings = 0

    def tearDown(self):
        for k, v in self._orig.items():
            setattr(gen, k, v)
        keel_lib.REPO = self._orig_repo
        keel_lib._warnings = 0
        self._tmp.cleanup()

    def _coverage(self):
        return self.repo / "program" / "01-grc" / "compliance" / "coverage.yml"

    def test_clean_run_writes_coverage_and_returns_0(self):
        gen.load_config = lambda: {"frameworks": [{"id": "fw"}]}
        gen.load_framework_vocab = lambda: {"fw": ["1.1", "1.2"]}
        gen.scan_framework_mappings = lambda: [
            {"std_id": "STD-x", "ref": "1", "fw": "fw", "clause": "1.1"}]
        self.assertEqual(gen.main(), 0)
        data = yaml.safe_load(self._coverage().read_text())
        self.assertEqual(data["fw"]["1.1"], {"coverage": "mapped"})
        self.assertEqual(data["fw"]["1.2"], {"coverage": "unmapped", "posture": "not-assessed"})

    def test_returns_1_when_data_was_skipped(self):
        def warning_scan():
            keel_lib._warn("simulated skipped data")
            return []
        gen.load_config = lambda: {"frameworks": [{"id": "fw"}]}
        gen.load_framework_vocab = lambda: {"fw": ["1.1"]}
        gen.scan_framework_mappings = warning_scan
        self.assertEqual(gen.main(), 1)

    def test_in_scope_framework_without_vocab_warns_and_fails(self):
        gen.load_config = lambda: {"frameworks": [{"id": "fw_no_vocab"}]}
        gen.load_framework_vocab = lambda: {}
        gen.scan_framework_mappings = lambda: []
        self.assertEqual(gen.main(), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
