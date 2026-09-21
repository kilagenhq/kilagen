"""Tests for the migration chain, and for the migrations themselves.

The chain decides whether a program can be brought forward at all. Getting it
wrong means either refusing a valid upgrade or — much worse — applying half a
path and leaving content in a shape no version of the framework describes.

Run from the repository root:

    python3 -m unittest discover -s tests
"""

from __future__ import annotations

import argparse
import contextlib
import io
import unittest

from kilagen import SCHEMA_VERSION, cli, migrations
from kilagen.libs import keel_lib

from tests.support import ProgramTestCase


def _step(name: str, from_version: int, to_version: int) -> migrations.Migration:
    def apply(program, dry_run):  # pragma: no cover - never run here
        return []
    return migrations.Migration(name=name, from_version=from_version,
                                to_version=to_version, apply=apply)


class BetweenTests(unittest.TestCase):
    def setUp(self):
        self._real_discover = migrations.discover

    def tearDown(self):
        migrations.discover = self._real_discover

    def _available(self, *steps):
        migrations.discover = lambda: list(steps)

    def test_no_migrations_means_no_path(self):
        self._available()
        self.assertEqual(migrations.between(1, 2), [])

    def test_already_current_needs_no_steps(self):
        self._available(_step("m001", 1, 2))
        self.assertEqual(migrations.between(2, 2), [])

    def test_single_step(self):
        step = _step("m001", 1, 2)
        self._available(step)
        self.assertEqual(migrations.between(1, 2), [step])

    def test_chains_consecutive_steps_in_order(self):
        first, second = _step("m001", 1, 2), _step("m002", 2, 3)
        self._available(second, first)  # discovery order must not matter
        self.assertEqual([m.name for m in migrations.between(1, 3)], ["m001", "m002"])

    def test_gap_in_the_chain_yields_nothing(self):
        # 1 -> 2 exists and 3 -> 4 exists, but nothing covers 2 -> 3. Returning
        # the first step alone would strand the content at an intermediate
        # version, so the whole path is refused.
        self._available(_step("m001", 1, 2), _step("m003", 3, 4))
        self.assertEqual(migrations.between(1, 4), [])

    def test_starts_from_the_declared_version_not_the_first_step(self):
        self._available(_step("m001", 1, 2), _step("m002", 2, 3))
        self.assertEqual([m.name for m in migrations.between(2, 3)], ["m002"])

    def test_a_step_spanning_versions_is_honoured(self):
        # A single step may cover more than one version bump.
        wide = _step("m001", 1, 3)
        self._available(wide)
        self.assertEqual(migrations.between(1, 3), [wide])

    def test_every_shipped_migration_is_covered_here(self):
        # A migration nobody tests is a rewrite of somebody's repository that
        # nobody tried. The count is the reminder.
        self.assertEqual([m.name for m in self._real_discover()],
                         ["m002_decisions_and_derived_state",
                          "m003_evidence_and_derived_supersession"])

    def test_the_chain_reaches_the_version_this_release_speaks(self):
        chain = migrations.between(1, SCHEMA_VERSION)
        self.assertEqual([m.name for m in chain],
                         ["m002_decisions_and_derived_state",
                          "m003_evidence_and_derived_supersession"])


SCHEMA_1_DECISION = """\
---
id: adr-totp-second-factor
type: adr
title: "TOTP as the second factor"
description: Why TOTP was chosen, and why it no longer is.
status: superseded
owner: role-owner
decided: 2024-02-08
immutable: true
related: [std-access-control]
---

# TOTP as the second factor

Superseded by `adr-phishing-resistant-authentication`.
"""

SCHEMA_1_INCIDENT = """\
---
id: inc-phishing
type: incident
title: "Phishing run against finance"
description: Someone clicked.
status: active
owner: role-owner
occurred: 2026-03-01
severity: high
immutable: true
related: [adr-totp-second-factor]
---

# Phishing run against finance
"""


class MigrationTwoTests(ProgramTestCase):
    """Schema 1 -> 2 against a program on disk, not a hand-built dict."""

    def setUp(self):
        super().setUp()
        (self.program / "adrs").mkdir(exist_ok=True)
        self.write("adrs/adr-totp-second-factor.md", SCHEMA_1_DECISION)
        self.write("incidents/2026/inc-phishing.md", SCHEMA_1_INCIDENT)
        self.step = migrations.between(1, 2)[0]

    def _apply(self, dry_run=False):
        return self.step.apply(self.program, dry_run=dry_run)

    def test_a_decision_moves_folder_file_id_and_type(self):
        self._apply()
        moved = self.program / "decisions" / "dec-totp-second-factor.md"
        self.assertTrue(moved.is_file())
        self.assertFalse((self.program / "adrs").exists())
        text = moved.read_text()
        self.assertIn("id: dec-totp-second-factor", text)
        self.assertIn("type: decision", text)

    def test_every_reference_travels_with_it(self):
        self._apply()
        incident = (self.program / "incidents/2026/inc-phishing.md").read_text()
        self.assertIn("related: [dec-totp-second-factor]", incident)
        self.assertNotIn("adr-totp-second-factor", incident)

    def test_a_framework_adr_path_is_not_a_program_id(self):
        # keel/adrs/ is shipped material that did not move. Rewriting a path
        # into it would break the link this migration was meant to preserve.
        self.write("policies/pol-quoting-the-framework.md", """\
            ---
            id: pol-quoting-the-framework
            type: policy
            title: "Quoting the framework"
            description: Cites an upstream ADR by path.
            status: active
            owner: role-owner
            domains: [grc]
            last_reviewed: 2026-01-01
            next_review: 2030-01-01
            ---

            See keel/adrs/adr-record-not-evidence.md.
            """)
        self._apply()
        text = (self.program / "policies/pol-quoting-the-framework.md").read_text()
        self.assertIn("keel/adrs/adr-record-not-evidence.md", text)

    def test_a_gap_and_an_exception_lose_their_status(self):
        self._apply()
        for rel in ("gaps/2026/gap-shared-accounts.md",
                    "exceptions/2026/exc-batch-account.md"):
            text = (self.program / rel).read_text()
            self.assertNotIn("status:", text, rel)

    def test_a_status_in_the_body_is_left_alone(self):
        # The field is frontmatter; the word is ordinary English.
        self.edit("gaps/2026/gap-shared-accounts.md", "# Shared accounts",
                  "# Shared accounts\n\nThe status: unchanged prose.")
        self._apply()
        text = (self.program / "gaps/2026/gap-shared-accounts.md").read_text()
        self.assertIn("The status: unchanged prose.", text)

    def test_the_publishing_contract_is_rekeyed(self):
        self.write("publish.yml", "destinations:\n  confluence:\n    space: SEC\n"
                                  "defaults:\n  policy: [confluence]\n  adr: []\n")
        self._apply()
        self.assertIn("decision: []", (self.program / "publish.yml").read_text())

    def test_binding_is_rescaled_to_who_checks(self):
        self.write("config.yml", (
            "name: Test Program\nschema_version: 1\nframeworks:\n"
            "  - id: pci_dss\n    binding: mandatory\n"
            "  - id: soc2\n    binding: comply-or-explain\n"
            "  - id: nist_csf\n    binding: comply-or-explain\n"))
        self._apply()
        config = (self.program / "config.yml").read_text()
        self.assertIn("  - id: pci_dss\n    binding: mandatory", config)
        # You certify against SOC 2; you read NIST CSF.
        self.assertIn("  - id: soc2\n    binding: voluntary", config)
        self.assertIn("  - id: nist_csf\n    binding: reference", config)

    def test_a_dry_run_writes_nothing(self):
        before = {p: p.read_text() for p in self.program.rglob("*.md")}
        lines = self._apply(dry_run=True)
        self.assertTrue(lines)
        self.assertTrue((self.program / "adrs/adr-totp-second-factor.md").is_file())
        for path, text in before.items():
            self.assertEqual(path.read_text(), text, path)

    def test_running_it_twice_changes_nothing_the_second_time(self):
        self._apply()
        after_first = {str(p.relative_to(self.program)): p.read_text()
                       for p in self.program.rglob("*.md")}
        self.assertEqual(self._apply(), [])
        after_second = {str(p.relative_to(self.program)): p.read_text()
                        for p in self.program.rglob("*.md")}
        self.assertEqual(after_first, after_second)

    def test_the_migrated_program_validates(self):
        """The point of the whole exercise: this release accepts what the chain produced.

        Not just this one step. A program on schema 1 runs every migration up to
        the version this release speaks, and what comes out the far end has to
        satisfy the schema that ships with it — otherwise the chain is a path to
        content nothing can read.
        """
        from kilagen.libs import validate_frontmatter as vf

        for step in migrations.between(1, SCHEMA_VERSION):
            step.apply(self.program, dry_run=False)
        schema = vf.load_schema("frontmatter.schema.json")
        self.assertEqual(vf.validate_documents(schema), [])
        self.assertEqual(vf.validate_layout(), [])
        self.assertEqual(vf.validate_id_uniqueness(), [])


class SchemaVersionGateTests(ProgramTestCase):
    """check does not migrate on its own; it says what to run."""

    def test_content_behind_the_package_is_told_to_migrate(self):
        self.edit("config.yml", f"schema_version: {SCHEMA_VERSION}", "schema_version: 1")
        with self.assertRaises(cli.CommandError) as caught:
            cli.cmd_check(argparse.Namespace(target=["frontmatter"], strict=False))
        self.assertIn("kilagen update content", str(caught.exception))

    def test_content_ahead_of_the_package_says_to_upgrade_the_package(self):
        self.edit("config.yml", f"schema_version: {SCHEMA_VERSION}", "schema_version: 99")
        with self.assertRaises(cli.CommandError) as caught:
            cli.cmd_check(argparse.Namespace(target=["frontmatter"], strict=False))
        self.assertIn("pip install -U kilagen", str(caught.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)


SCHEMA_2_STANDARD = """\
---
id: std-access-control
type: standard
title: "Access control"
description: Who may reach what.
status: active
owner: role-owner
last_reviewed: 2026-01-01
next_review: 2027-01-01
requirements:
  - ref: "1.1"
    text: Every user has a unique account.
    evidence: An account inventory showing no shared accounts.
evidence:
  - name: "Access review"
    url: "https://example.com/review"
---

# Access control
"""

SCHEMA_2_GAP = """\
---
id: gap-shared-accounts
type: gap
title: "Shared accounts"
description: Two hosts share a local account.
owner: role-owner
requirement: std-access-control#1.1
source: audit
found: 2026-02-01
severity: high
superseded_by: exc-batch-account
last_reviewed: 2026-02-01
next_review: 2026-05-01
frameworks:
  pci_dss: ["8"]
---

# Shared accounts
"""

SCHEMA_2_ROLE = """\
---
id: role-owner
type: role
title: "Owner"
description: Carries the program.
status: active
owner: role-owner
managed_externally: https://example.com/org-chart
reviewed_by: role-owner
last_reviewed: 2026-01-01
next_review: 2027-01-01
---

# Owner
"""

SCHEMA_2_VENDOR = """\
---
id: vnd-okta
type: vendor
title: "Okta"
description: The identity provider.
status: active
owner: role-owner
vendor_name: Okta
tier: critical
certifications:
  - ISO/IEC 27001
  - SOC 2 Type II
last_reviewed: 2026-01-01
next_review: 2027-01-01
---

# Okta
"""

SCHEMA_2_DECISION_OLD = """\
---
id: dec-totp
type: decision
title: "TOTP"
description: Why TOTP was chosen.
status: superseded
owner: role-owner
decided: 2024-02-08
immutable: true
superseded_by: dec-phishing-resistant
---

# TOTP
"""

SCHEMA_2_DECISION_NEW = """\
---
id: dec-phishing-resistant
type: decision
title: "Phishing-resistant authentication"
description: What replaced TOTP.
status: active
owner: role-owner
decided: 2026-02-08
immutable: true
---

# Phishing-resistant authentication
"""


class MigrationThreeTests(ProgramTestCase):
    """Schema 2 -> 3 against a program on disk.

    A migration nobody tests is a rewrite of somebody's repository that nobody
    tried, so every branch that edits a file has a case here.
    """

    def setUp(self):
        super().setUp()
        self.write("standards/std-access-control.md", SCHEMA_2_STANDARD)
        self.write("gaps/2026/gap-shared-accounts.md", SCHEMA_2_GAP)
        self.write("roles/role-owner.md", SCHEMA_2_ROLE)
        self.write("vendors/vnd-okta.md", SCHEMA_2_VENDOR)
        self.write("decisions/dec-totp.md", SCHEMA_2_DECISION_OLD)
        self.write("decisions/dec-phishing-resistant.md", SCHEMA_2_DECISION_NEW)
        self.step = migrations.between(2, 3)[0]

    def _apply(self, dry_run=False):
        return self.step.apply(self.program, dry_run=dry_run)

    def _text(self, rel):
        return (self.program / rel).read_text()

    def test_a_requirement_keeps_its_sentence_under_the_right_name(self):
        self._apply()
        text = self._text("standards/std-access-control.md")
        self.assertIn("how_demonstrated: An account inventory", text)

    def test_the_one_document_level_link_becomes_the_source_of_truth(self):
        self._apply()
        text = self._text("standards/std-access-control.md")
        self.assertIn("source_of_truth: https://example.com/review", text)
        self.assertNotIn("\nevidence:\n", text)

    def test_a_gap_closed_by_an_exception_says_excepted_by(self):
        self._apply()
        text = self._text("gaps/2026/gap-shared-accounts.md")
        self.assertIn("excepted_by: exc-batch-account", text)
        self.assertNotIn("superseded_by:", text)

    def test_a_gap_loses_the_second_clock_and_the_empty_mapping(self):
        self._apply()
        text = self._text("gaps/2026/gap-shared-accounts.md")
        self.assertNotIn("last_reviewed:", text)
        self.assertNotIn("next_review:", text)
        self.assertNotIn("frameworks:", text)
        self.assertIn("found: 2026-02-01", text)

    def test_the_original_elsewhere_gets_its_real_name(self):
        self._apply()
        text = self._text("roles/role-owner.md")
        self.assertIn("source_of_truth: https://example.com/org-chart", text)
        self.assertNotIn("managed_externally:", text)
        self.assertNotIn("reviewed_by:", text)

    def test_a_certification_gains_somewhere_to_put_its_date(self):
        self._apply()
        text = self._text("vendors/vnd-okta.md")
        self.assertIn("- name: ISO/IEC 27001", text)
        self.assertIn("- name: SOC 2 Type II", text)

    def test_supersession_survives_as_one_declaration(self):
        self._apply()
        old = self._text("decisions/dec-totp.md")
        new = self._text("decisions/dec-phishing-resistant.md")
        # The edge moves to the side that is still being edited...
        self.assertIn("supersedes:\n- dec-totp", new)
        # ...and the old document stops declaring its own death twice.
        self.assertNotIn("superseded_by:", old)
        self.assertIn("status: retired", old)

    def test_a_dry_run_writes_nothing(self):
        before = self._text("gaps/2026/gap-shared-accounts.md")
        lines = self._apply(dry_run=True)
        self.assertTrue(lines)
        self.assertEqual(self._text("gaps/2026/gap-shared-accounts.md"), before)

    def test_running_it_twice_is_running_it_once(self):
        self._apply()
        after_first = {p: p.read_text() for p in self.program.rglob("*.md")}
        self._apply()
        self.assertEqual({p: p.read_text() for p in self.program.rglob("*.md")},
                         after_first)
