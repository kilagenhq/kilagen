"""Framework coverage, and the triangle it renders under each clause."""

from __future__ import annotations

import unittest

from kilagen.libs.generate_coverage import build_coverage, build_requirement_state, summarize
from kilagen.libs.keel_lib import (
    is_live_exception,
    is_open_gap,
    load_config,
    load_framework_vocab,
    requirement_index,
    scan_framework_mappings,
)
from tests.support import ProgramTestCase


class MappingTests(ProgramTestCase):
    def test_one_record_per_requirement_clause_pair(self):
        records = scan_framework_mappings(self.documents())
        self.assertEqual(
            sorted((r["ref"], r["fw"], r["clause"]) for r in records),
            [("1.1", "pci_dss", "7"), ("1.2", "pci_dss", "8")],
        )

    def test_requirements_are_indexed_by_standard_and_ref(self):
        index = requirement_index(self.documents())
        self.assertEqual(sorted(index), ["std-access-control#1.1", "std-access-control#1.2"])
        self.assertEqual(index["std-access-control#1.2"]["standard"], "std-access-control")


class CoverageTests(ProgramTestCase):
    def coverage(self):
        return build_coverage(load_config(), self.documents(), load_framework_vocab())

    def test_mapped_and_unmapped_clauses_are_classified(self):
        clauses = self.coverage()["pci_dss"]
        self.assertEqual(clauses["7"]["coverage"], "mapped")
        self.assertEqual(clauses["8"]["coverage"], "mapped")
        self.assertEqual(clauses["9"]["coverage"], "unmapped")

    def test_a_clause_names_the_requirements_that_cover_it(self):
        self.assertEqual(self.coverage()["pci_dss"]["8"]["requirements"],
                         ["std-access-control#1.2"])

    def test_an_unmapped_clause_asserts_only_that_it_was_not_assessed(self):
        self.assertEqual(self.coverage()["pci_dss"]["9"]["posture"], "not-assessed")

    def test_a_mapped_clause_asserts_no_posture_at_all(self):
        # Whether a mapped clause is *met* is a human judgement. The generator
        # has no business having an opinion.
        self.assertNotIn("posture", self.coverage()["pci_dss"]["7"])

    def test_a_framework_in_scope_that_resolves_nowhere_is_skipped(self):
        # Neither shipped nor overridden. Coverage stays silent; it is
        # 'kilagen check' that names the unresolvable id as an error.
        self.remove("model/frameworks/pci_dss.yml")
        self.assertEqual(self.coverage(), {})

    def test_a_shipped_vocabulary_needs_no_copy_in_the_program(self):
        # The product owns the frameworks; an instance only declares scope.
        self.remove("model/frameworks/pci_dss.yml")
        self.ship("pci_dss.yml", 'clauses: ["7", "8", "9", "10"]\n')
        self.assertEqual(sorted(self.coverage()["pci_dss"]), ["10", "7", "8", "9"])

    def test_an_override_wins_over_the_shipped_edition(self):
        # How an instance pins a different granularity, or fixes one of ours.
        self.ship("pci_dss.yml", 'clauses: ["1", "2"]\n')
        self.assertEqual(sorted(self.coverage()["pci_dss"]), ["7", "8", "9"])

    def test_groups_flatten_to_the_same_clause_list(self):
        # Coverage must not be able to see a group: a vocabulary written with
        # structure and the same one written flat produce identical coverage.
        self.remove("model/frameworks/pci_dss.yml")
        self.ship("pci_dss.yml", """\
            groups:
              - id: access
                name: Access
                clauses:
                  - ref: "7"
                    name: Restrict Access
                  - "8"
              - id: monitor
                name: Monitoring
                clauses: ["9"]
            """)
        clauses = self.coverage()["pci_dss"]
        self.assertEqual(sorted(clauses), ["7", "8", "9"])
        self.assertEqual(clauses["7"]["coverage"], "mapped")
        self.assertEqual(clauses["9"]["coverage"], "unmapped")

    def test_a_vocabulary_not_in_scope_is_skipped(self):
        # A framework nobody is measured against must not shrink or pad the
        # denominator of one they are.
        self.write("model/frameworks/soc2.yml", 'id: soc2\nname: SOC 2\nclauses: ["CC1.1"]\n')
        self.assertEqual(sorted(self.coverage()), ["pci_dss"])

    def test_clauses_are_ordered_for_a_stable_diff(self):
        clauses = list(self.coverage()["pci_dss"])
        self.assertEqual(clauses, sorted(clauses))


class TriangleTests(ProgramTestCase):
    """What stands against a requirement: open gaps and live exceptions."""

    def coverage(self):
        return build_coverage(load_config(), self.documents(), load_framework_vocab())

    def test_a_clause_shows_the_open_gap_and_the_live_exception(self):
        clause = self.coverage()["pci_dss"]["8"]
        self.assertEqual(clause["gaps"], ["gap-shared-accounts"])
        self.assertEqual(clause["exceptions"], ["exc-batch-account"])

    def test_a_clause_with_nothing_against_it_is_clean(self):
        clause = self.coverage()["pci_dss"]["7"]
        self.assertEqual((clause["gaps"], clause["exceptions"]), ([], []))

    def test_a_remediated_gap_stops_counting(self):
        self.edit("gaps/2026/gap-shared-accounts.md", "severity: medium",
                  "severity: medium\nremediated: 2026-06-01")
        self.assertEqual(self.coverage()["pci_dss"]["8"]["gaps"], [])

    def test_a_gap_excepted_by_an_exception_stops_counting(self):
        self.edit("gaps/2026/gap-shared-accounts.md", "severity: medium",
                  "severity: medium\nexcepted_by: exc-batch-account")
        self.assertEqual(self.coverage()["pci_dss"]["8"]["gaps"], [])

    def test_an_expired_exception_stops_counting(self):
        self.edit("exceptions/2026/exc-batch-account.md", "expires: 2030-06-01",
                  "expires: 2020-06-01")
        self.assertEqual(self.coverage()["pci_dss"]["8"]["exceptions"], [])

    def test_a_revoked_exception_stops_counting(self):
        self.edit("exceptions/2026/exc-batch-account.md", "risk_severity: low",
                  "risk_severity: low\nrevoked: 2026-05-01")
        self.assertEqual(self.coverage()["pci_dss"]["8"]["exceptions"], [])

    def test_the_requirement_state_carries_the_same_answer(self):
        state = build_requirement_state(self.documents())
        self.assertEqual(state["std-access-control#1.2"]["gaps"], ["gap-shared-accounts"])
        self.assertEqual(state["std-access-control#1.1"]["gaps"], [])

    def test_the_summary_counts_contested_clauses(self):
        counts = summarize(self.coverage())["pci_dss"]
        self.assertEqual((counts["clauses"], counts["mapped"], counts["contested"]), (3, 2, 1))


class StateTests(unittest.TestCase):
    """Open and live are computed from write-once facts, never read from a field."""

    def test_a_gap_is_open_until_a_fact_closes_it(self):
        self.assertTrue(is_open_gap({"type": "gap"}))
        self.assertFalse(is_open_gap({"type": "gap", "remediated": "2026-01-01"}))
        self.assertFalse(is_open_gap({"type": "gap", "excepted_by": "exc-x"}))

    def test_an_exception_is_live_until_it_expires_or_is_revoked(self):
        base = {"expires": "2030-01-01"}
        self.assertTrue(is_live_exception(base, today="2026-01-01"))
        self.assertFalse(is_live_exception({**base, "expires": "2025-01-01"}, today="2026-01-01"))
        self.assertFalse(is_live_exception({**base, "revoked": "2026-01-01"}, today="2026-01-01"))

    def test_an_exception_without_an_expiry_is_not_live(self):
        self.assertFalse(is_live_exception({}, today="2026-01-01"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
