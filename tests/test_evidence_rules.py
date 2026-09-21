"""The Python half of the shared freshness contract.

`tests/fixtures/evidence-freshness.json` states, once, when a piece of evidence
has gone stale. This asserts that `check_evidence` says so; the dashboard suite
asserts the same table against `modules/evidence.js`. Two implementations of
one rule drift, and they drift silently — the page calls an artefact good while
the check calls it expired — so the table is what stops them.
"""

from __future__ import annotations

import json
import re
import unittest
from datetime import date, timedelta
from pathlib import Path

from kilagen.libs import keel_lib
from kilagen.libs.check_evidence import FRESHNESS_DAYS, collect
from kilagen.libs.check_reviews import DEFAULT_STALE_GAP_DAYS

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "evidence-freshness.json"
SCHEMAS = keel_lib.KEEL / "schemas"


def _load():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _schema(name: str) -> dict:
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


class OneVocabularyOfPeriodicityTests(unittest.TestCase):
    """The same closed set, in every place that holds a copy of it.

    There are five: this module's FRESHNESS_DAYS, the dashboard's, the
    dashboard's FREQUENCY_MONTHS, and the enums in two schemas. They are not
    derived from each other, so they can only be kept honest by being compared.

    The direction that matters is the one the old test did not check. A period
    the *schema* allows and the *code* does not know makes `check_evidence`
    skip the entry — so evidence carrying it can never go stale, and the tool
    calls a permanently-expired artefact fine.
    """

    def _freshness_enum(self) -> set[str]:
        defs = _schema("frontmatter.schema.json")["$defs"]
        found = []

        def walk(node):
            if isinstance(node, dict):
                if "freshness" in node and isinstance(node["freshness"], dict):
                    found.append(set(node["freshness"].get("enum", [])))
                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)

        walk(defs)
        self.assertEqual(len(found), 1, "expected exactly one freshness enum")
        return found[0]

    def _recurrence_enum(self) -> set[str]:
        activity = _schema("schedule.schema.json")["$defs"]["activity"]
        return set(activity["properties"]["frequency"]["enum"])

    def test_the_schema_allows_exactly_what_the_code_knows(self):
        self.assertEqual(self._freshness_enum(), set(FRESHNESS_DAYS))

    def test_evidence_freshness_and_schedule_recurrence_are_one_vocabulary(self):
        self.assertEqual(self._freshness_enum(), self._recurrence_enum())

    def test_the_dashboard_knows_the_same_set(self):
        source = (keel_lib.KEEL / "dashboard" / "modules" / "constants.js").read_text(encoding="utf-8")
        block = re.search(r"export const FRESHNESS_DAYS = \{(.*?)\}", source, re.S)
        self.assertIsNotNone(block, "FRESHNESS_DAYS not found in constants.js")
        keys = set(re.findall(r"'?([a-z0-9-]+)'?\s*:", block.group(1)))
        self.assertEqual(keys, set(FRESHNESS_DAYS))

    def test_the_schedule_view_knows_the_same_set(self):
        source = (keel_lib.KEEL / "dashboard" / "modules" / "views" / "schedule.js").read_text(encoding="utf-8")
        block = re.search(r"const FREQUENCY_MONTHS = \{(.*?)\}", source, re.S)
        self.assertIsNotNone(block, "FREQUENCY_MONTHS not found in schedule.js")
        keys = set(re.findall(r"'?([a-z0-9-]+)'?\s*:", block.group(1)))
        self.assertEqual(keys, set(FRESHNESS_DAYS))

    def test_the_stale_gap_default_is_the_same_number_everywhere(self):
        config = _schema("config.schema.json")["properties"]["stale_gap_days"]
        self.assertEqual(config.get("default"), DEFAULT_STALE_GAP_DAYS)
        source = (keel_lib.KEEL / "dashboard" / "modules" / "views" / "schedule.js").read_text(encoding="utf-8")
        match = re.search(r"const DEFAULT_STALE_GAP_DAYS = (\d+)", source)
        self.assertIsNotNone(match, "DEFAULT_STALE_GAP_DAYS not found in schedule.js")
        self.assertEqual(int(match.group(1)), DEFAULT_STALE_GAP_DAYS)


class FreshnessContractTests(unittest.TestCase):
    def setUp(self):
        self.spec = _load()
        self.today = self.spec["today"]

    def test_the_table_covers_every_period_the_schema_allows(self):
        """A period nobody tested is a period nobody checked.

        Against the schema, not against the code: a period the schema permits
        and the code does not know is the dangerous direction, and comparing
        the fixture to the code could never see it.
        """
        allowed = OneVocabularyOfPeriodicityTests()._freshness_enum()
        covered = {c.get("freshness") for c in self.spec["cases"]}
        self.assertTrue(allowed.issubset(covered),
                        f"untested periods: {allowed - covered}")

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
