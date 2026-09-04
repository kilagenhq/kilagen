"""Tests for the forward referential check in validate_frontmatter.py.

`_check_framework_mappings` is the pure core: each requirement framework mapping
(fw, clause) must (a) name a framework declared in config.yml and (b) resolve to
a clause present in that framework's vocab (program/frameworks/<fw>.yml).

Run from the repo root:

    python3 -m unittest keel.scripts.tests.test_validate_frameworks
"""

from __future__ import annotations

import json
import unittest

from jsonschema import Draft202012Validator

from kilagen.libs import keel_lib
from kilagen.libs import validate_frontmatter as vf

VOCAB_SCHEMA_PATH = keel_lib.KEEL / "schemas" / "framework-vocab.schema.json"


class CheckFrameworkMappingsTests(unittest.TestCase):
    def setUp(self):
        self.config_ids = {"mas_trm_2021", "mas_fsm_n22"}
        self.vocab = {"mas_trm_2021": ["13.1", "9.1"], "mas_fsm_n22": ["IV.2"]}

    def _rec(self, fw, clause, std="STD-x", ref="5.1"):
        return {"std_id": std, "ref": ref, "fw": fw, "clause": clause}

    def test_resolved_mapping_passes(self):
        errors = []
        vf._check_framework_mappings(errors, [self._rec("mas_trm_2021", "13.1")],
                                     self.config_ids, self.vocab)
        self.assertEqual(errors, [])

    def test_unknown_framework_errors(self):
        errors = []
        vf._check_framework_mappings(errors, [self._rec("mas_trm_2020", "13.1")],
                                     self.config_ids, self.vocab)
        self.assertEqual(len(errors), 1)
        self.assertIn("mas_trm_2020", errors[0])

    def test_unresolved_clause_errors(self):
        errors = []
        vf._check_framework_mappings(errors, [self._rec("mas_trm_2021", "99.9")],
                                     self.config_ids, self.vocab)
        self.assertEqual(len(errors), 1)
        self.assertIn("99.9", errors[0])

    def test_configured_framework_without_vocab_is_unresolved(self):
        errors = []
        # mas_fsm_n22 is configured but absent from this vocab -> clause can't resolve.
        vf._check_framework_mappings(errors, [self._rec("mas_fsm_n22", "IV.2")],
                                     self.config_ids, {"mas_trm_2021": ["13.1"]})
        self.assertEqual(len(errors), 1)
        self.assertIn("IV.2", errors[0])

    def test_unknown_framework_not_double_counted_as_clause(self):
        errors = []
        vf._check_framework_mappings(errors, [self._rec("nope", "x")],
                                     self.config_ids, self.vocab)
        self.assertEqual(len(errors), 1)  # framework error only
        self.assertIn("nope", errors[0])


class FrameworkVocabSchemaTests(unittest.TestCase):
    """The framework-vocab schema is the lint-layer gate for vocab files."""

    @classmethod
    def setUpClass(cls):
        cls.validator = Draft202012Validator(
            json.loads(VOCAB_SCHEMA_PATH.read_text(encoding="utf-8")))

    def _errors(self, doc):
        return [e.message for e in self.validator.iter_errors(doc)]

    def test_valid_vocab_passes(self):
        self.assertEqual(self._errors({"clauses": ["3.3", "4", "IV.2"]}), [])

    def test_duplicate_clause_is_rejected(self):
        # uniqueItems closes the silent set()-dedupe hole in compute_coverage_map.
        self.assertTrue(self._errors({"clauses": ["3.3", "3.3"]}))

    def test_non_string_clause_is_rejected(self):
        # An unquoted numeric clause (float/int) is caught at the schema layer.
        self.assertTrue(self._errors({"clauses": [13.6]}))

    def test_missing_clauses_key_is_rejected(self):
        self.assertTrue(self._errors({}))

    def test_unknown_top_key_is_rejected(self):
        self.assertTrue(self._errors({"clauses": ["1"], "clause": ["typo"]}))

    def test_top_level_list_is_rejected(self):
        self.assertTrue(self._errors(["1", "2"]))


class ValidateFrameworkCoverageRefsCompositionTests(unittest.TestCase):
    """End-to-end glue: validate_framework_coverage_refs composes config +
    vocab + mappings and feeds _check_framework_mappings. Stubs the three
    loaders so the real composition (set conversion, arg order) is exercised."""

    def setUp(self):
        self._orig = {k: getattr(vf, k) for k in
                      ("load_config", "load_framework_vocab", "scan_framework_mappings")}

    def tearDown(self):
        for k, v in self._orig.items():
            setattr(vf, k, v)

    def _wire(self, records, vocab):
        vf.load_config = lambda: {"frameworks": [{"id": "mas_trm_2021"}]}
        vf.load_framework_vocab = lambda: vocab
        vf.scan_framework_mappings = lambda: records

    def test_resolved_mapping_passes(self):
        self._wire([{"std_id": "STD-x", "ref": "1.1", "fw": "mas_trm_2021", "clause": "13.1"}],
                   {"mas_trm_2021": ["13.1"]})
        self.assertEqual(vf.validate_framework_coverage_refs(), [])

    def test_unresolved_clause_errors(self):
        self._wire([{"std_id": "STD-x", "ref": "1.1", "fw": "mas_trm_2021", "clause": "99.9"}],
                   {"mas_trm_2021": ["13.1"]})
        errors = vf.validate_framework_coverage_refs()
        self.assertEqual(len(errors), 1)
        self.assertIn("99.9", errors[0])

    def test_unknown_framework_errors(self):
        self._wire([{"std_id": "STD-x", "ref": "1.1", "fw": "iso_27001", "clause": "A.8"}],
                   {"mas_trm_2021": ["13.1"]})
        errors = vf.validate_framework_coverage_refs()
        self.assertEqual(len(errors), 1)
        self.assertIn("iso_27001", errors[0])


class ValidatorMainExitCodeTests(unittest.TestCase):
    """Locks the contract CI relies on: framework reference errors fail the build
    (exit 1). Other validators are stubbed so only the framework path is tested."""

    def setUp(self):
        self._orig = {k: getattr(vf, k) for k in
                      ("load_schema", "validate_frontmatter", "validate_capabilities",
                       "validate_id_uniqueness", "validate_framework_coverage_refs",
                       "get_warnings")}
        vf.load_schema = lambda name: {}
        vf.validate_frontmatter = lambda s: []
        vf.validate_capabilities = lambda s: []
        vf.validate_id_uniqueness = lambda: []
        vf.get_warnings = lambda: 0

    def tearDown(self):
        for k, v in self._orig.items():
            setattr(vf, k, v)

    def test_framework_ref_errors_fail_the_build(self):
        vf.validate_framework_coverage_refs = lambda: ["  STD-x req 1: bad clause"]
        self.assertEqual(vf.main(), 1)

    def test_all_clean_passes(self):
        vf.validate_framework_coverage_refs = lambda: []
        self.assertEqual(vf.main(), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
