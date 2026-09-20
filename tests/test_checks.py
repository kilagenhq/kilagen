"""What fails the build, and what only reports.

The line matters more than it looks. A check a healthy program can never pass
is a check everybody learns to scroll past — and `kilagen check` in a real
program had been red since the day it was written, over gaps somebody was
already working on. Errors break the contract; deadlines are work to schedule.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import unittest

from kilagen import cli
from kilagen.libs import check_reviews

from tests.support import ProgramTestCase

OVERDUE_POLICY = """\
---
id: pol-stale
type: policy
title: "Stale policy"
description: Nobody has looked at this in years.
status: active
owner: role-owner
domains: [grc]
last_reviewed: 2020-01-01
next_review: 2020-06-01
---

# Stale policy
"""


def _run(fn, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()) as out:
        result = fn(*args, **kwargs)
    return result, out.getvalue()


class ReviewsInformTests(ProgramTestCase):
    def setUp(self):
        super().setUp()
        self.write("policies/pol-stale.md", OVERDUE_POLICY)

    def test_an_overdue_review_is_reported_without_the_word_failed(self):
        found, output = _run(check_reviews.main)
        self.assertEqual(found, 1)
        self.assertIn("OVERDUE reviews", output)
        self.assertIn("need attention", output)
        self.assertNotIn("FAILED", output)

    def test_strict_is_how_you_ask_for_the_opposite(self):
        found, output = _run(check_reviews.main, strict=True)
        self.assertEqual(found, 1)
        self.assertIn("FAILED", output)

    def test_check_passes_while_something_is_merely_overdue(self):
        args = argparse.Namespace(target=["reviews"], strict=False)
        status, output = _run(cli.cmd_check, args)
        self.assertEqual(status, 0)
        self.assertIn("PASSED — no errors.", output)
        self.assertIn("These checks inform; they do not fail.", output)

    def test_check_strict_fails_on_the_same_program(self):
        args = argparse.Namespace(target=["reviews"], strict=True)
        status, output = _run(cli.cmd_check, args)
        self.assertEqual(status, 1)
        self.assertIn("FAILED — errors in: reviews", output)

    def test_a_broken_reference_is_still_an_error(self):
        # The distinction is only about deadlines: content that does not
        # resolve fails, with or without --strict.
        self.write("policies/pol-dangling.md", """\
            ---
            id: pol-dangling
            type: policy
            title: "Dangling"
            description: Points at a document that does not exist.
            status: active
            owner: role-owner
            domains: [grc]
            related: [std-that-does-not-exist]
            last_reviewed: 2026-01-01
            next_review: 2030-01-01
            ---

            # Dangling
            """)
        args = argparse.Namespace(target=["refs"], strict=False)
        status, output = _run(cli.cmd_check, args)
        self.assertEqual(status, 1)
        self.assertIn("FAILED — errors in: refs", output)


class ErrorMessageTests(ProgramTestCase):
    """What `check` says when a document is wrong, which is the whole product.

    A message that lists seven legal fields as "not allowed" teaches people to
    stop reading messages.
    """

    def _errors(self):
        from kilagen.libs import validate_frontmatter as vf
        return vf.validate_documents(vf.load_schema("frontmatter.schema.json"))

    def test_a_missing_field_is_reported_as_missing_and_nothing_else(self):
        self.edit("standards/std-access-control.md", "last_reviewed: 2026-01-01\n", "")
        errors = self._errors()
        self.assertTrue(any("'last_reviewed' is a required property" in e for e in errors), errors)
        # The consequence of the branch failing, not a second problem.
        self.assertFalse(any("Unevaluated properties" in e for e in errors), errors)
        self.assertFalse(any("not allowed" in e for e in errors), errors)

    def test_an_unknown_field_names_the_type_and_only_the_unknown_fields(self):
        self.edit("standards/std-access-control.md", "status: active",
                  "status: active\nmascot: a keel\nrto: 4h")
        errors = [e for e in self._errors() if "std-access-control" in e]
        self.assertEqual(len(errors), 1, errors)
        self.assertIn("a standard has no field 'mascot', 'rto'", errors[0])
        # Every other field it carries is legal, and is not named.
        for legal in ("'status'", "'owner'", "'domains'", "'title'"):
            self.assertNotIn(legal, errors[0])


class ConfigSchemaTests(ProgramTestCase):
    """config.yml is the file every other check reads, so it has a schema."""

    def _errors(self):
        from kilagen.libs import validate_frontmatter as vf
        return vf.validate_config(vf.load_schema("config.schema.json"))

    def test_the_three_binding_levels_are_accepted(self):
        for level in ("mandatory", "voluntary", "reference"):
            self.edit("config.yml", "frameworks:",
                      f"frameworks:\n  - id: pci_dss\n    binding: {level}")
            self.assertEqual(self._errors(), [], level)
            self.edit("config.yml",
                      f"frameworks:\n  - id: pci_dss\n    binding: {level}", "frameworks:")

    def test_the_level_that_said_nothing_about_who_checks_is_gone(self):
        self.edit("config.yml", "frameworks:",
                  "frameworks:\n  - id: pci_dss\n    binding: comply-or-explain")
        errors = self._errors()
        self.assertTrue(any("comply-or-explain" in e for e in errors), errors)

    def test_a_field_nobody_declared_is_refused(self):
        self.edit("config.yml", "schema_version:", "mascot: a keel\nschema_version:")
        self.assertTrue(self._errors())


class RiskScoringTests(ProgramTestCase):
    """A risk names its scores the way the schema allows: by label.

    The check that derives severity from the two scores was written against
    integers, which the schema does not accept — so on real content it skipped
    every risk and proved nothing. The fixture here is a document that
    validates.
    """

    TAXONOMY = """\
        severity:
          likelihood:
            - {{ value: 1, label: Negligible }}
            - {{ value: 2, label: Low }}
            - {{ value: 3, label: Medium }}
            - {{ value: 4, label: High }}
            - {{ value: 5, label: Critical }}
          impact:
            - {{ value: 1, label: Negligible }}
            - {{ value: 2, label: Low }}
            - {{ value: 3, label: Medium }}
            - {{ value: 4, label: High }}
            - {{ value: 5, label: Critical }}
          bands:
            - {{ id: negligible, min: 1, max: 1 }}
            - {{ id: low, min: 2, max: 2 }}
            - {{ id: medium, min: 3, max: 7 }}
            - {{ id: high, min: 8, max: 14 }}
            - {{ id: critical, min: 15, max: 25 }}
        """

    RISK = """\
        ---
        id: rsk-takeover
        type: risk
        title: "Account takeover"
        description: Somebody else logs in.
        status: active
        owner: role-owner
        domains: [iam]
        likelihood: {likelihood}
        impact: {impact}
        severity: {severity}
        last_reviewed: 2026-01-01
        next_review: 2030-01-01
        ---

        # Account takeover
        """

    def setUp(self):
        super().setUp()
        self.write("model/risk-taxonomy.yml", self.TAXONOMY.replace("{{", "{").replace("}}", "}"))

    def _errors(self, likelihood, impact, severity):
        from kilagen.libs import validate_frontmatter as vf
        self.write("risks/rsk-takeover.md",
                   self.RISK.format(likelihood=likelihood, impact=impact, severity=severity))
        return vf.validate_risk_severity()

    def test_a_severity_that_matches_the_scores_is_accepted(self):
        # Low (2) x Medium (3) = 6, which is the medium band.
        self.assertEqual(self._errors("low", "medium", "medium"), [])

    def test_a_severity_that_contradicts_the_scores_is_reported(self):
        errors = self._errors("low", "medium", "critical")
        self.assertTrue(any("rsk-takeover" in e for e in errors), errors)

    def test_the_label_is_matched_however_it_is_capitalised(self):
        self.assertEqual(self._errors("Low", "Medium", "medium"), [])

    def test_an_unscored_risk_is_left_alone(self):
        from kilagen.libs import validate_frontmatter as vf
        self.write("risks/rsk-takeover.md", self.RISK
                   .replace("likelihood: {likelihood}\n", "")
                   .replace("impact: {impact}\n", "")
                   .format(severity="medium"))
        self.assertEqual(vf.validate_risk_severity(), [])


if __name__ == "__main__":
    unittest.main()
