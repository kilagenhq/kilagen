"""Tests for the gaps JSON Schema and the validate_gaps wiring.

Two layers are covered here that test_gap_validators.py (the cross-reference
layer) does not:

  1. The schema itself (keel/schemas/gaps.schema.json) — field shape, the
     closed<=>closed_at conditional, and additionalProperties — validated with
     jsonschema directly against constructed gap dicts.
  2. validate_frontmatter.py's validate_gaps() — the structural wiring
     (absent file, empty file, parse error, field-path formatting).

It also pins the GAP_* enum constants in validate_semantic_refs.py to the
schema's enum $defs, so the two cannot silently drift.

Run via discovery (as CI does) or directly:

    python3 -m unittest discover -s tests
    python3 tests/test_gap_schema.py
"""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

from kilagen.libs import keel_lib
from kilagen.libs import validate_frontmatter as vf
from kilagen.libs import validate_semantic_refs as vsr

SCHEMA_PATH = keel_lib.KEEL / "schemas" / "gaps.schema.json"

SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _valid_gap(**overrides):
    """A schema-valid gap dict, with field overrides."""
    gap = {
        "id": "gap-mfa-not-enforced",
        "title": "MFA not enforced",
        "requirement": "STD-access-control#3.2",
        "domain": "iam",
        "owner": "role-security-eng",
        "source": "audit",
        "severity": "high",
        "tracker_id": "TS-1",
        "tracker": "https://example.test/TS-1",
        "opened": "2026-01-15",
        "status": "open",
        "status_updated": "2026-01-15",
    }
    gap.update(overrides)
    return gap


class GapSchemaTests(unittest.TestCase):
    def setUp(self):
        self.validator = Draft202012Validator(SCHEMA)

    def _errors(self, doc):
        return [e.message for e in self.validator.iter_errors(doc)]

    def test_empty_register_is_valid(self):
        self.assertEqual(self._errors({"gaps": []}), [])

    def test_valid_gap_passes(self):
        self.assertEqual(self._errors({"gaps": [_valid_gap()]}), [])

    def test_missing_required_field_is_rejected(self):
        gap = _valid_gap()
        del gap["requirement"]
        self.assertTrue(self._errors({"gaps": [gap]}))

    def test_unknown_field_is_rejected(self):
        self.assertTrue(self._errors({"gaps": [_valid_gap(severty="high")]}))

    def test_unknown_top_level_key_is_rejected(self):
        self.assertTrue(self._errors({"gaps": [], "extra": 1}))

    def test_bad_tracker_id_pattern_is_rejected(self):
        self.assertTrue(self._errors({"gaps": [_valid_gap(tracker_id="ts-1")]}))

    def test_empty_title_is_rejected(self):
        self.assertTrue(self._errors({"gaps": [_valid_gap(title="")]}))

    def test_loose_requirement_slug_is_rejected(self):
        # Boundary hyphen — should fail the tightened STD-slug pattern.
        self.assertTrue(self._errors({"gaps": [_valid_gap(requirement="STD--x#1")]}))

    def test_closed_requires_closed_at(self):
        # status: closed with no closed_at must fail.
        self.assertTrue(self._errors({"gaps": [_valid_gap(status="closed")]}))

    def test_closed_with_closed_at_passes(self):
        gap = _valid_gap(status="closed", closed_at="2026-02-01")
        self.assertEqual(self._errors({"gaps": [gap]}), [])

    def test_open_gap_must_not_carry_closed_at(self):
        # The symmetric rule: an open gap carrying closure fields is rejected.
        self.assertTrue(self._errors({"gaps": [_valid_gap(status="open", closed_at="2026-02-01")]}))

    def test_open_gap_must_not_carry_closure_note(self):
        self.assertTrue(self._errors({"gaps": [_valid_gap(status="open", closure_note="done")]}))

    def test_related_wrong_prefix_is_rejected(self):
        self.assertTrue(self._errors({"gaps": [_valid_gap(related={"risks": ["THR-x"]})]}))


class EnumDriftTests(unittest.TestCase):
    """Pin the GAP_* constants to the schema enums so they cannot drift apart."""

    def _schema_enum(self, def_name):
        return set(SCHEMA["$defs"][def_name]["enum"])

    def test_severity_enum_matches_schema(self):
        self.assertEqual(vsr.GAP_SEVERITIES, self._schema_enum("severity_enum"))

    def test_source_enum_matches_schema(self):
        self.assertEqual(vsr.GAP_SOURCES, self._schema_enum("source_enum"))

    def test_status_enum_matches_schema(self):
        self.assertEqual(vsr.GAP_STATUSES, self._schema_enum("status_enum"))


class ValidateGapsWiringTests(unittest.TestCase):
    """Exercise validate_frontmatter.py's validate_gaps() structural branches."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        # validate_gaps reads program/gaps.yml and loads the schema from
        # keel/schemas/ — both relative to REPO. Stage a copy of the real
        # schema so load_schema() resolves.
        (self.repo / "program").mkdir(parents=True)
        schemas = self.repo / "keel" / "schemas"
        schemas.mkdir(parents=True)
        shutil.copy(SCHEMA_PATH, schemas / "gaps.schema.json")
        self._orig = vf.REPO
        vf.REPO = self.repo
        keel_lib.REPO = self.repo
        self.schema = vf.load_schema("gaps.schema.json")

    def tearDown(self):
        vf.REPO = self._orig
        keel_lib.REPO = self._orig
        self._tmp.cleanup()

    def _write(self, text):
        (self.repo / "program" / "gaps.yml").write_text(text)

    def test_absent_file_is_ok(self):
        self.assertEqual(vf.validate_gaps(self.schema), [])

    def test_empty_file_is_reported(self):
        self._write("")
        errors = vf.validate_gaps(self.schema)
        self.assertEqual(len(errors), 1)
        self.assertIn("empty file", errors[0])

    def test_valid_register_passes(self):
        self._write("gaps: []\n")
        self.assertEqual(vf.validate_gaps(self.schema), [])

    def test_malformed_yaml_is_reported(self):
        self._write("gaps: [unterminated\n")
        errors = vf.validate_gaps(self.schema)
        self.assertEqual(len(errors), 1)
        self.assertIn("YAML parse error", errors[0])

    def test_closed_without_closed_at_is_reported_with_field_path(self):
        self._write(
            "gaps:\n"
            "  - id: gap-x\n"
            "    title: t\n"
            "    requirement: STD-access-control#3.2\n"
            "    domain: iam\n"
            "    owner: role-security-eng\n"
            "    source: audit\n"
            "    severity: high\n"
            "    tracker_id: TS-1\n"
            "    tracker: https://example.test/1\n"
            "    opened: 2026-01-01\n"
            "    status: closed\n"
            "    status_updated: 2026-01-02\n"
        )
        errors = vf.validate_gaps(self.schema)
        self.assertTrue(errors)
        self.assertTrue(any("gaps.yml" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
