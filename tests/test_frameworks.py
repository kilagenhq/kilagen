"""The shipped framework catalogue.

From the moment the product ships the vocabularies, their accuracy is ours:
a wrong clause is wrong for every instance at once, and it moves everybody's
coverage on the same day. These tests guard the properties that can be
checked mechanically — the ones that cannot are guarded by the rule written
into the schema and by review.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

from kilagen.libs import keel_lib
from kilagen.libs.validate_frontmatter import validate_frameworks_resolve
from tests.support import ProgramTestCase

CATALOGUE = keel_lib.KEEL / "content" / "frameworks"
SCHEMA = json.loads((keel_lib.KEEL / "schemas" / "framework-vocab.schema.json").read_text())

# What a 1.0 is expected to ship. A framework leaving the catalogue is a
# breaking change for anyone who declared it, so the list is asserted rather
# than discovered.
EXPECTED = {
    "nist_csf",
    "pci_dss",
    "pci_dss_4_0_1",
    "iso_27001",
    "iso_27017",
    "iso_27018",
    "soc2",
    "cis_v8",
    "hipaa_security",
}


def load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


class CatalogueTests(unittest.TestCase):
    def files(self):
        return sorted(CATALOGUE.glob("*.yml"))

    def test_the_catalogue_ships_the_frameworks_it_promises(self):
        self.assertEqual({p.stem for p in self.files()}, EXPECTED)

    def test_every_shipped_framework_validates(self):
        validator = Draft202012Validator(SCHEMA)
        for path in self.files():
            with self.subTest(framework=path.stem):
                errors = sorted(validator.iter_errors(load(path)), key=lambda e: list(e.path))
                self.assertEqual(
                    [], [f"{'.'.join(str(p) for p in e.path)}: {e.message}" for e in errors])

    def test_no_clause_appears_twice_in_a_framework(self):
        # A duplicate would inflate the denominator and be invisible in the UI.
        for fw_id, refs in keel_lib.load_framework_vocab(frameworks_dir=Path("/nonexistent")).items():
            with self.subTest(framework=fw_id):
                self.assertEqual(len(refs), len(set(refs)))

    def test_every_framework_says_what_it_is_and_where_the_text_lives(self):
        # description and resources are what make reference-not-copy work: we
        # hold the references, the publisher holds the words.
        for path in self.files():
            data = load(path)
            with self.subTest(framework=path.stem):
                self.assertTrue(data.get("name"))
                self.assertTrue(data.get("description"))
                self.assertTrue(data.get("granularity"),
                                "the denominator is half of any coverage figure")
                self.assertTrue(data.get("resources"),
                                "somebody has to be able to reach the normative text")
                for resource in data["resources"]:
                    self.assertTrue(resource["url"].startswith("https://"))

    def test_the_clause_counts_are_the_ones_the_editions_publish(self):
        counts = {fw: len(refs) for fw, refs
                  in keel_lib.load_framework_vocab(frameworks_dir=Path("/nonexistent")).items()}
        self.assertEqual(counts, {
            "cis_v8": 18,            # the 18 Controls; the 153 safeguards are a level down
            "hipaa_security": 22,    # the standards of 45 CFR Part 164 Subpart C
            "pci_dss_4_0_1": 12,     # same twelve as 4.0; what changed is beneath them
            "nist_csf": 22,    # CSF 2.0 categories
            "pci_dss": 12,     # top-level requirements
            "iso_27001": 93,   # Annex A, 2022 edition
            "soc2": 38,        # Common Criteria + A1 + C1
            "iso_27017": 7,    # the CLD cloud-specific controls
            "iso_27018": 25,   # Annex A extended control set
        })

    def test_a_group_colour_is_a_hex_value_and_only_nist_publishes_one(self):
        # Colour is identity, and only where the framework itself publishes
        # one. Inventing a palette per framework would make the wheel look
        # like a rating.
        coloured = set()
        for path in self.files():
            for group in load(path).get("groups") or []:
                if group.get("color"):
                    coloured.add(path.stem)
                    self.assertRegex(group["color"], r"^#[0-9a-fA-F]{6}$")
        self.assertEqual(coloured, {"nist_csf"})

    def test_exactly_one_group_may_sit_at_the_centre(self):
        for path in self.files():
            centres = [g for g in (load(path).get("groups") or []) if g.get("center")]
            with self.subTest(framework=path.stem):
                self.assertLessEqual(len(centres), 1)


class ResolutionTests(ProgramTestCase):
    """Shipped, overridden, or an error — never silently absent."""

    def test_an_unresolvable_framework_is_an_error_not_a_warning(self):
        self.write("config.yml", 'name: T\nrepo: ""\nschema_version: 1\n'
                                 'frameworks:\n  - id: pci_dsss\n')
        errors = validate_frameworks_resolve()
        self.assertEqual(len(errors), 1)
        self.assertIn("pci_dsss", errors[0])

    def test_the_error_lists_what_is_available(self):
        self.ship("iso_27001.yml", 'clauses: ["A.5.1"]\n')
        self.write("config.yml", 'name: T\nrepo: ""\nschema_version: 1\n'
                                 'frameworks:\n  - id: nope\n')
        errors = validate_frameworks_resolve()
        self.assertIn("iso_27001", errors[0])

    def test_a_shipped_framework_resolves_with_nothing_in_the_program(self):
        self.remove("model/frameworks/pci_dss.yml")
        self.ship("pci_dss.yml", 'clauses: ["1"]\n')
        self.assertEqual(validate_frameworks_resolve(), [])

    def test_an_instance_may_still_add_a_framework_of_its_own(self):
        self.write("config.yml", 'name: T\nrepo: ""\nschema_version: 1\n'
                                 'frameworks:\n  - id: house_rules\n')
        self.write("model/frameworks/house_rules.yml", 'clauses: ["HR.1"]\n')
        self.assertEqual(validate_frameworks_resolve(), [])


class MetaTests(ProgramTestCase):
    """The structure reaches the dashboard; coverage never sees it."""

    def test_meta_carries_groups_colour_and_resources(self):
        self.ship("pci_dss.yml", """\
            name: PCI DSS v4.0
            description: The card standard.
            resources:
              - name: PCI SSC
                url: https://www.pcisecuritystandards.org/
            groups:
              - id: access
                name: Access
                color: "#112233"
                center: true
                clauses:
                  - ref: "7"
                    name: Restrict Access
            """)
        self.remove("model/frameworks/pci_dss.yml")
        meta = keel_lib.load_framework_meta()["pci_dss"]
        self.assertEqual(meta["name"], "PCI DSS v4.0")
        self.assertEqual(meta["resources"][0]["url"], "https://www.pcisecuritystandards.org/")
        self.assertEqual(meta["groups"][0]["color"], "#112233")
        self.assertTrue(meta["groups"][0]["center"])
        self.assertEqual(meta["groups"][0]["clauses"][0]["name"], "Restrict Access")
        self.assertEqual(meta["source"], "shipped")

    def test_meta_marks_an_override_as_such(self):
        self.ship("pci_dss.yml", 'clauses: ["1"]\n')
        self.assertEqual(keel_lib.load_framework_meta()["pci_dss"]["source"], "override")

    def test_a_flat_vocabulary_reports_no_groups(self):
        meta = keel_lib.load_framework_meta()["pci_dss"]
        self.assertEqual(meta["groups"], [])
        self.assertEqual([c["ref"] for c in meta["clauses"]], ["7", "8", "9"])


class SeedTests(unittest.TestCase):
    def test_init_no_longer_copies_framework_vocabularies(self):
        # program/model/frameworks/ is the override directory now. Seeding it
        # would put 93 ISO controls in the user's repository for them to
        # maintain, which is the manual work this change exists to remove.
        starter = keel_lib.KEEL / "content" / "starter" / "model"
        self.assertFalse((starter / "frameworks").exists())
