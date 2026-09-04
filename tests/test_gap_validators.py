"""Tests for the gap cross-reference checks in validate_semantic_refs.py.

The validators are not an installed package yet, so we load them through
importlib by path, mirroring test_risk_validators.py.

Run via discovery (as CI does) or directly — note ``-m unittest <dotted.path>``
does NOT work because ``keel`` is not a valid Python package name:

    python3 -m unittest discover -s tests
    python3 tests/test_gap_validators.py
"""

from __future__ import annotations

import tempfile
import textwrap
import unittest
from pathlib import Path


from kilagen.libs import keel_lib
from kilagen.libs import validate_semantic_refs as vsr

# Default role inventory the gaps' owner field resolves against.
ROLES = {"role-security-eng"}


STD_TEMPLATE = """\
---
id: {id}
title: "{id}"
description: "test"
type: standard
status: active
domain: grc
requirements:
{requirements}
---
# {id}
"""


class _GapRepoMixin:
    """Point keel_lib.REPO and vsr.REPO at a temp repo with standards/ + gaps.yml."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self.standards = self.repo / "program" / "01-grc" / "standards"
        self.standards.mkdir(parents=True)
        self._orig_keel_repo = keel_lib.REPO
        self._orig_vsr_repo = vsr.REPO
        keel_lib.REPO = self.repo
        vsr.REPO = self.repo
        keel_lib._warnings = 0

    def tearDown(self):
        keel_lib.REPO = self._orig_keel_repo
        vsr.REPO = self._orig_vsr_repo
        self._tmp.cleanup()

    def _write_std(self, sid="STD-access-control", refs=("3.1", "3.2")):
        body = "\n".join(f'  - ref: "{r}"\n    summary: "req {r}"' for r in refs)
        (self.standards / f"{sid}.md").write_text(
            STD_TEMPLATE.format(id=sid, requirements=body))

    def _write_gaps(self, yaml_text: str):
        (self.repo / "program" / "gaps.yml").write_text(textwrap.dedent(yaml_text))

    def _gap(self, **overrides):
        """Render one valid gap as YAML list-item lines, with overrides applied."""
        fields = {
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
        fields.update(overrides)
        lines = [f"  - id: {fields.pop('id')}"]
        for k, v in fields.items():
            lines.append(f"    {k}: {v}")
        return "\n".join(lines)


class LoadGapsTests(_GapRepoMixin, unittest.TestCase):
    def test_missing_file_returns_empty(self):
        self.assertEqual(vsr.load_gaps(), [])

    def test_empty_registry_returns_empty(self):
        self._write_gaps("gaps: []\n")
        self.assertEqual(vsr.load_gaps(), [])

    def test_parses_entries(self):
        self._write_std()
        self._write_gaps("gaps:\n" + self._gap() + "\n")
        gaps = vsr.load_gaps()
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0]["id"], "gap-mfa-not-enforced")

    def test_non_list_gaps_warns_and_returns_empty(self):
        # Present-but-malformed must NOT pass silently — it warns, so main()
        # fails on the warning count rather than reporting "no gaps".
        self._write_gaps("gaps:\n  not: a-list\n")
        self.assertEqual(vsr.load_gaps(), [])
        self.assertGreaterEqual(keel_lib.get_warnings(), 1)

    def test_malformed_yaml_returns_empty_and_warns(self):
        # load_yaml warns on a parse error; load_gaps degrades to [].
        self._write_gaps("gaps: [unterminated\n")
        self.assertEqual(vsr.load_gaps(), [])
        self.assertGreaterEqual(keel_lib.get_warnings(), 1)


class ParseRequirementRefTests(unittest.TestCase):
    def test_splits_std_and_number(self):
        self.assertEqual(vsr._parse_requirement_ref("STD-access-control#3.2"),
                         ("STD-access-control", "3.2"))

    def test_missing_separator_returns_blanks(self):
        self.assertEqual(vsr._parse_requirement_ref("STD-access-control"), ("", ""))

    def test_blank_number_treated_as_malformed(self):
        std, ref = vsr._parse_requirement_ref("STD-access-control#")
        self.assertEqual((std, ref), ("STD-access-control", ""))


class ValidateGapRefsTests(_GapRepoMixin, unittest.TestCase):
    def test_valid_gap_passes(self):
        self._write_std()
        self._write_gaps("gaps:\n" + self._gap() + "\n")
        doc_ids = {"STD-access-control"}
        self.assertEqual(vsr.validate_gap_refs(doc_ids, ROLES), [])

    def test_empty_registry_passes(self):
        self._write_gaps("gaps: []\n")
        self.assertEqual(vsr.validate_gap_refs(set(), ROLES), [])

    def test_unknown_standard_is_reported(self):
        self._write_std()
        gap = self._gap(requirement="STD-nonexistent#1.1")
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs(set(), ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("does not exist", errors[0])

    def test_unknown_requirement_number_is_reported(self):
        self._write_std()
        gap = self._gap(requirement="STD-access-control#9.9")
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs(set(), ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("not found in", errors[0])

    def test_malformed_requirement_is_reported(self):
        self._write_std()
        gap = self._gap(requirement="STD-access-control")
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs(set(), ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("STD-<slug>#<number>", errors[0])

    def test_duplicate_id_is_reported(self):
        self._write_std()
        # Same id, distinct tracker_id — isolates the duplicate-id error.
        g1 = self._gap(tracker_id="TS-1")
        g2 = self._gap(tracker_id="TS-2")
        self._write_gaps("gaps:\n" + g1 + "\n" + g2 + "\n")
        errors = vsr.validate_gap_refs(set(), ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("duplicate gap id", errors[0])

    def test_duplicate_tracker_id_is_reported(self):
        self._write_std()
        # Distinct id, same tracker_id — one Jira issue must map to one gap.
        g1 = self._gap(id="gap-a", tracker_id="TS-9")
        g2 = self._gap(id="gap-b", tracker_id="TS-9")
        self._write_gaps("gaps:\n" + g1 + "\n" + g2 + "\n")
        errors = vsr.validate_gap_refs(set(), ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("duplicate tracker_id", errors[0])

    def test_bad_source_enum_is_reported(self):
        self._write_std()
        gap = self._gap(source="hunch")
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs(set(), ROLES)
        self.assertTrue(any("source 'hunch'" in e for e in errors))

    def test_bad_severity_enum_is_reported(self):
        self._write_std()
        gap = self._gap(severity="catastrophic")
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs(set(), ROLES)
        self.assertTrue(any("severity 'catastrophic'" in e for e in errors))

    def test_bad_status_enum_is_reported(self):
        self._write_std()
        gap = self._gap(status="in-progress")
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs(set(), ROLES)
        self.assertTrue(any("status 'in-progress'" in e for e in errors))

    def test_unresolved_related_id_is_reported(self):
        self._write_std()
        gap = self._gap() + "\n    related:\n      risks:\n        - RSK-ghost"
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs({"STD-access-control"}, ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("related.risks", errors[0])
        self.assertIn("RSK-ghost", errors[0])

    def test_resolved_related_ids_across_keys_pass(self):
        self._write_std()
        gap = (self._gap()
               + "\n    related:"
               + "\n      risks:\n        - RSK-real"
               + "\n      systems:\n        - SYS-okta"
               + "\n      processes:\n        - PRO-access-management"
               + "\n      exceptions:\n        - EXC-legacy")
        self._write_gaps("gaps:\n" + gap + "\n")
        doc_ids = {"STD-access-control", "RSK-real", "SYS-okta",
                   "PRO-access-management", "EXC-legacy"}
        self.assertEqual(vsr.validate_gap_refs(doc_ids, ROLES), [])

    def test_unresolved_process_id_is_reported(self):
        self._write_std()
        gap = self._gap() + "\n    related:\n      processes:\n        - PRO-ghost"
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs({"STD-access-control"}, ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("related.processes", errors[0])
        self.assertIn("PRO-ghost", errors[0])

    def test_unknown_owner_is_reported(self):
        self._write_std()
        gap = self._gap(owner="role-ghost")
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs({"STD-access-control"}, ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("owner 'role-ghost'", errors[0])

    def test_status_updated_before_opened_is_reported(self):
        self._write_std()
        gap = self._gap(opened="2026-02-01", status_updated="2026-01-01")
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs({"STD-access-control"}, ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("non-decreasing", errors[0])

    def test_closed_at_before_status_updated_is_reported(self):
        self._write_std()
        gap = self._gap(opened="2026-01-01", status_updated="2026-01-02",
                        status="closed", closed_at="2025-12-31")
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs({"STD-access-control"}, ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("closed_at", errors[0])

    def test_in_order_dates_pass(self):
        self._write_std()
        gap = self._gap(opened="2026-01-01", status_updated="2026-02-01",
                        status="closed", closed_at="2026-03-01")
        self._write_gaps("gaps:\n" + gap + "\n")
        self.assertEqual(vsr.validate_gap_refs({"STD-access-control"}, ROLES), [])

    def test_multiple_faults_in_one_gap_all_reported(self):
        # Guards against a future refactor turning the checks into early
        # returns: a single gap with several independent faults must surface
        # all of them, not just the first.
        self._write_std()
        gap = self._gap(source="hunch", severity="catastrophic", owner="role-ghost")
        self._write_gaps("gaps:\n" + gap + "\n")
        errors = vsr.validate_gap_refs({"STD-access-control"}, ROLES)
        joined = "\n".join(errors)
        self.assertIn("source 'hunch'", joined)
        self.assertIn("severity 'catastrophic'", joined)
        self.assertIn("owner 'role-ghost'", joined)
        self.assertGreaterEqual(len(errors), 3)

    def test_non_mapping_gap_entry_is_reported(self):
        # A list item that isn't a mapping (e.g. a bare string) is flagged with
        # its index, not silently skipped.
        self._write_std()
        self._write_gaps('gaps:\n  - "just a string"\n')
        errors = vsr.validate_gap_refs(set(), ROLES)
        self.assertEqual(len(errors), 1)
        self.assertIn("not a mapping", errors[0])


if __name__ == "__main__":
    unittest.main()
