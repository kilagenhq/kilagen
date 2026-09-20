"""The Python half of the shared freshness contract.

`tests/fixtures/evidence-freshness.json` states, once, when a piece of evidence
has gone stale. This asserts that `check_evidence` says so; the dashboard suite
asserts the same table against `modules/evidence.js`. Two implementations of
one rule drift, and they drift silently — the page calls an artefact good while
the check calls it expired — so the table is what stops them.
"""

from __future__ import annotations

import json
import unittest
from datetime import date, timedelta
from pathlib import Path

from kilagen.libs.check_evidence import FRESHNESS_DAYS, collect

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "evidence-freshness.json"


def _load():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


class FreshnessContractTests(unittest.TestCase):
    def setUp(self):
        self.spec = _load()
        self.today = self.spec["today"]

    def test_the_table_covers_every_period_the_schema_allows(self):
        """A period nobody tested is a period nobody checked."""
        covered = {c.get("freshness") for c in self.spec["cases"]}
        self.assertTrue(set(FRESHNESS_DAYS).issubset(covered),
                        f"untested periods: {set(FRESHNESS_DAYS) - covered}")

    def test_the_table_exercises_every_verdict(self):
        seen = {c["verdict"] for c in self.spec["cases"]}
        self.assertEqual(seen, set(self.spec["verdicts"]))

    def test_check_evidence_agrees_with_the_table(self):
        """Run each case through `collect` and read back which bucket it fell in."""
        for case in self.spec["cases"]:
            item = {"name": "Artefact", "url": "https://example.com/a.pdf"}
            for key in ("collected", "freshness"):
                if case.get(key):
                    item[key] = case[key]
            documents = [{
                "type": "standard", "id": "std-x", "path": "standards/std-x.md",
                "requirements": [{"ref": "1.1", "text": "One", "evidence": [item]}],
            }]
            found = collect(documents, today=self.today)

            with self.subTest(**case):
                if case["verdict"] == "undated":
                    self.assertEqual(len(found["undated"]), 1)
                    self.assertEqual(found["stale"], [])
                elif case["verdict"] == "stale":
                    self.assertEqual(len(found["stale"]), 1, "should have expired")
                    self.assertEqual(found["stale"][0][0], case["expires"])
                else:
                    # `current` and `no-window` are both "nothing to report".
                    self.assertEqual(found["stale"], [])
                    self.assertEqual(found["undated"], [])
                # A requirement with evidence attached is never unproven.
                self.assertEqual(found["unproven"], [])

    def test_the_expiry_in_the_table_is_collected_plus_the_period(self):
        for case in self.spec["cases"]:
            if not case.get("expires"):
                continue
            window = FRESHNESS_DAYS[case["freshness"]]
            expected = (date.fromisoformat(case["collected"]) + timedelta(days=window))
            with self.subTest(**case):
                self.assertEqual(case["expires"], expected.isoformat())


if __name__ == "__main__":
    unittest.main()
