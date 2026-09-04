"""Tests for the risk-severity band logic and the THR<->RSK bidirectional
check in validate_semantic_refs.py.

The validators are not an installed package yet, so we load them through
importlib by path, mirroring test_validate_semantic_refs.py.

Run from the repo root:

    python3 -m unittest keel.scripts.tests.test_risk_validators

Or directly:

    python3 tests/test_risk_validators.py
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent


from kilagen.libs import keel_lib
from kilagen.libs import validate_semantic_refs as vsr


# The single source of truth for the criticality matrix bands, score 1..25.
# The dashboard's critBand() (constants.js) must mirror this exactly, only
# capitalised — see keel/dashboard/tests/constants.test.js. The framework
# doc program/01-grc/standards/STD-risk-framework.md states the same bands in prose.
EXPECTED_BANDS = {
    **{1: "negligible"},
    **{2: "low"},
    **{s: "medium" for s in range(3, 8)},     # 3-7
    **{s: "high" for s in range(8, 15)},      # 8-14
    **{s: "critical" for s in range(15, 26)}, # 15-25
}

RSK_TEMPLATE = """\
---
id: {id}
title: "{id}"
description: "test"
type: risk
status: draft
domain: grc
severity: {severity}
likelihood: {likelihood}
impact: {impact}
related:
  threats: {threats}
---
# {id}
"""

THR_TEMPLATE = """\
---
id: {id}
title: "{id}"
description: "test"
type: threat
status: active
domain: grc
related:
  risks: {risks}
---
# {id}
"""

# A minimal but structurally-faithful taxonomy. Crucially, the leaf
# 'data-breach-pii' lives ONLY under operational-risk > information-security,
# so declaring it under compliance-risk > privacy-compliance must fail the
# full-path check even though the leaf slug itself is real.
TAXONOMY = """\
categories:
  operational-risk:
    label: "Operational Risk"
    children:
      information-security:
        label: "Information Security"
        children:
          data-breach-pii:       "Data Breach - PII"
          compromised-integrity: "Compromised integrity"
  compliance-risk:
    label: "Compliance Risk"
    children:
      privacy-compliance:
        label: "Privacy Compliance"
        children:
          prudential-risk: "Prudential risk"
causes:
  systems:
    label: "Systems"
    items:
      misconfiguration: "Misconfiguration"
      software-failure:  "Software failure"
"""


class CritBandTests(unittest.TestCase):
    """Pure boundary tests for _crit_band — the band edges are the rot-prone bit."""

    def test_band_edges(self):
        cases = {
            1: "negligible",
            2: "low",
            3: "medium", 7: "medium",      # medium lower/upper edge
            8: "high", 14: "high",          # high lower/upper edge
            15: "critical", 25: "critical", # critical lower edge / max
            6: "medium", 10: "high", 20: "critical",  # mid-band sanity
        }
        for score, expected in cases.items():
            self.assertEqual(vsr._crit_band(score), expected, msg=f"score {score}")

    def test_full_matrix_matches_expected_vector(self):
        # Cross-encoding guard: every achievable score (1..25) maps to the
        # single-source EXPECTED_BANDS. constants.test.js asserts the JS
        # critBand against the same vector, so the two implementations can't
        # silently drift from each other or from the framework doc.
        for score in range(1, 26):
            self.assertEqual(vsr._crit_band(score), EXPECTED_BANDS[score], msg=f"score {score}")


class _RiskRepoMixin:
    """Point keel_lib.REPO and vsr.REPO at a temp repo with risks/ + threats/."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self.risks = self.repo / "program" / "01-grc" / "risks"
        self.threats = self.repo / "program" / "01-grc" / "threats"
        self.risks.mkdir(parents=True)
        self.threats.mkdir(parents=True)
        self._orig_keel_repo = keel_lib.REPO
        self._orig_vsr_repo = vsr.REPO
        keel_lib.REPO = self.repo
        vsr.REPO = self.repo
        keel_lib._warnings = 0

    def tearDown(self):
        keel_lib.REPO = self._orig_keel_repo
        vsr.REPO = self._orig_vsr_repo
        self._tmp.cleanup()

    def _write_rsk(self, rid, *, severity, likelihood, impact, threats="[]"):
        (self.risks / f"{rid}.md").write_text(
            RSK_TEMPLATE.format(id=rid, severity=severity, likelihood=likelihood,
                                impact=impact, threats=threats))

    def _write_thr(self, tid, *, risks="[]"):
        (self.threats / f"{tid}.md").write_text(
            THR_TEMPLATE.format(id=tid, risks=risks))

    def _write_taxonomy(self, content=TAXONOMY):
        # Program-level artifact at the program root (risks/ already created program/).
        (self.repo / "program" / "risk-taxonomy.yml").write_text(content)

    def _write_rsk_taxo(self, rid, *, root_causes=None, risk_category=None):
        """Write an RSK doc carrying only the taxonomy-relevant fields.

        Severity fields are omitted on purpose — validate_risk_taxonomy_refs
        does not look at them, and required-field checks belong to the schema
        validator (mirrors test_missing_fields_skipped).
        """
        lines = ["---", f"id: {rid}", f'title: "{rid}"', "type: risk",
                 "status: draft", "domain: grc"]
        if root_causes is not None:
            lines.append("root_causes: [" + ", ".join(root_causes) + "]")
        if risk_category is not None:
            principle, cat1, cat2 = risk_category
            lines += ["risk_category:", f"  principle: {principle}",
                      f"  category1: {cat1}", f"  category2: {cat2}"]
        lines += ["---", f"# {rid}", ""]
        (self.risks / f"{rid}.md").write_text("\n".join(lines))


class ValidateRiskSeverityTests(_RiskRepoMixin, unittest.TestCase):
    def test_matching_severity_passes(self):
        # high(4) x medium(3) = 12 -> high
        self._write_rsk("RSK-a", severity="high", likelihood="high", impact="medium")
        self.assertEqual(vsr.validate_risk_severity(), [])

    def test_negligible_is_reachable(self):
        # negligible(1) x negligible(1) = 1 -> negligible
        self._write_rsk("RSK-a", severity="negligible", likelihood="negligible", impact="negligible")
        self.assertEqual(vsr.validate_risk_severity(), [])

    def test_mismatch_is_reported_once(self):
        # medium(3) x high(4) = 12 -> high, but doc claims critical
        self._write_rsk("RSK-a", severity="critical", likelihood="medium", impact="high")
        errors = vsr.validate_risk_severity()
        self.assertEqual(len(errors), 1, msg=f"errors: {errors}")
        self.assertIn("RSK-a", errors[0])
        self.assertIn("high", errors[0])  # expected band

    def test_missing_fields_skipped(self):
        # No likelihood/impact -> skipped (schema validator's job).
        (self.risks / "RSK-a.md").write_text(
            "---\nid: RSK-a\ntype: risk\nseverity: high\n---\n# RSK-a\n")
        self.assertEqual(vsr.validate_risk_severity(), [])

    def test_unknown_enum_skipped(self):
        # Bogus likelihood -> KeyError branch -> skipped (schema validator's job).
        self._write_rsk("RSK-a", severity="high", likelihood="bogus", impact="medium")
        self.assertEqual(vsr.validate_risk_severity(), [])


class ValidateThreatRiskBidirectionalTests(_RiskRepoMixin, unittest.TestCase):
    def test_symmetric_passes(self):
        self._write_thr("THR-a", risks="[RSK-a]")
        self._write_rsk("RSK-a", severity="high", likelihood="high", impact="medium", threats="[THR-a]")
        self.assertEqual(vsr.validate_threat_risk_bidirectional(), [])

    def test_thr_without_back_ref_is_reported(self):
        self._write_thr("THR-a", risks="[RSK-a]")
        self._write_rsk("RSK-a", severity="high", likelihood="high", impact="medium", threats="[]")
        errors = vsr.validate_threat_risk_bidirectional()
        self.assertEqual(len(errors), 1, msg=f"errors: {errors}")
        self.assertIn("THR-a", errors[0])
        self.assertIn("RSK-a", errors[0])
        self.assertIn("related.threats", errors[0])

    def test_rsk_without_back_ref_is_reported(self):
        self._write_thr("THR-a", risks="[]")
        self._write_rsk("RSK-a", severity="high", likelihood="high", impact="medium", threats="[THR-a]")
        errors = vsr.validate_threat_risk_bidirectional()
        self.assertEqual(len(errors), 1, msg=f"errors: {errors}")
        self.assertIn("related.risks", errors[0])

    def test_nonexistent_id_is_not_this_checks_job(self):
        # THR references a RSK that doesn't exist -> existence is
        # validate_related_refs's job; this check must stay silent.
        self._write_thr("THR-a", risks="[RSK-ghost]")
        errors = vsr.validate_threat_risk_bidirectional()
        self.assertEqual(errors, [], msg=f"errors: {errors}")

    def test_empty_related_does_not_crash(self):
        self._write_thr("THR-a", risks="[]")
        self._write_rsk("RSK-a", severity="high", likelihood="high", impact="medium", threats="[]")
        self.assertEqual(vsr.validate_threat_risk_bidirectional(), [])

    def test_many_to_many_partial_reciprocation_reports_only_missing_edge(self):
        # THR-a links two risks; only RSK-1 links back. Each edge is evaluated
        # independently, so exactly the RSK-2 edge is flagged — not RSK-1.
        self._write_thr("THR-a", risks="[RSK-1, RSK-2]")
        self._write_rsk("RSK-1", severity="high", likelihood="high", impact="medium", threats="[THR-a]")
        self._write_rsk("RSK-2", severity="high", likelihood="high", impact="medium", threats="[]")
        errors = vsr.validate_threat_risk_bidirectional()
        self.assertEqual(len(errors), 1, msg=f"errors: {errors}")
        self.assertIn("RSK-2", errors[0])
        self.assertNotIn("RSK-1", errors[0])

    def test_one_risk_many_threats_all_reciprocal_passes(self):
        # RSK-a ←→ THR-1, THR-2 in both directions: genuine M:N, no errors.
        self._write_rsk("RSK-a", severity="high", likelihood="high", impact="medium", threats="[THR-1, THR-2]")
        self._write_thr("THR-1", risks="[RSK-a]")
        self._write_thr("THR-2", risks="[RSK-a]")
        self.assertEqual(vsr.validate_threat_risk_bidirectional(), [])


class LoadRiskTaxonomyTests(_RiskRepoMixin, unittest.TestCase):
    def test_parses_causes_and_full_paths(self):
        self._write_taxonomy()
        causes, paths = vsr.load_risk_taxonomy()
        self.assertEqual(causes, {"misconfiguration", "software-failure"})
        self.assertIn(("operational-risk", "information-security", "data-breach-pii"), paths)
        self.assertIn(("compliance-risk", "privacy-compliance", "prudential-risk"), paths)
        # The leaf is bound to its real parents, not floating free.
        self.assertNotIn(("compliance-risk", "privacy-compliance", "data-breach-pii"), paths)

    def test_missing_file_warns_and_returns_empty(self):
        # No taxonomy written -> warns (loud) and yields empty sets.
        causes, paths = vsr.load_risk_taxonomy()
        self.assertEqual((causes, paths), (set(), set()))
        self.assertGreater(keel_lib._warnings, 0)


class ValidateRiskTaxonomyRefsTests(_RiskRepoMixin, unittest.TestCase):
    def test_valid_path_and_cause_pass(self):
        self._write_taxonomy()
        self._write_rsk_taxo("RSK-a", root_causes=["misconfiguration"],
                             risk_category=("operational-risk", "information-security", "data-breach-pii"))
        self.assertEqual(vsr.validate_risk_taxonomy_refs(), [])

    def test_unknown_root_cause_is_reported(self):
        self._write_taxonomy()
        self._write_rsk_taxo("RSK-a", root_causes=["not-a-real-cause"])
        errors = vsr.validate_risk_taxonomy_refs()
        self.assertEqual(len(errors), 1, msg=f"errors: {errors}")
        self.assertIn("not-a-real-cause", errors[0])

    def test_unknown_category2_leaf_is_reported(self):
        self._write_taxonomy()
        self._write_rsk_taxo("RSK-a",
                             risk_category=("operational-risk", "information-security", "ghost-leaf"))
        errors = vsr.validate_risk_taxonomy_refs()
        self.assertEqual(len(errors), 1, msg=f"errors: {errors}")
        self.assertIn("ghost-leaf", errors[0])

    def test_real_leaf_under_wrong_parent_is_reported(self):
        # 'data-breach-pii' is a real leaf, but under operational-risk, not
        # compliance-risk/privacy-compliance. Full-path validation catches it;
        # the old leaf-only check would have passed this silently.
        self._write_taxonomy()
        self._write_rsk_taxo("RSK-a",
                             risk_category=("compliance-risk", "privacy-compliance", "data-breach-pii"))
        errors = vsr.validate_risk_taxonomy_refs()
        self.assertEqual(len(errors), 1, msg=f"errors: {errors}")
        self.assertIn("data-breach-pii", errors[0])

    def test_missing_taxonomy_file_skips_silently_but_warns(self):
        # File absent: a deployed tarball legitimately lacks it. No errors, but
        # load_risk_taxonomy warns so the skip can't masquerade as "all clean".
        self._write_rsk_taxo("RSK-a", root_causes=["misconfiguration"])
        self.assertEqual(vsr.validate_risk_taxonomy_refs(), [])
        self.assertGreater(keel_lib._warnings, 0)

    def test_present_but_empty_taxonomy_warns(self):
        # File exists but parses to no causes/categories (mangled/restructured):
        # must warn loudly rather than pass as "nothing to check".
        self._write_taxonomy("# only a comment, no categories or causes\n")
        self._write_rsk_taxo("RSK-a",
                             risk_category=("operational-risk", "information-security", "data-breach-pii"))
        self.assertEqual(vsr.validate_risk_taxonomy_refs(), [])
        self.assertGreater(keel_lib._warnings, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
