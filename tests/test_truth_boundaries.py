"""The firewall: what this repository is structurally unable to claim.

Three products were deleted in the refactor — capability assessment, a gaps
register, and rich system profiles — because each answered a question about
the world with a hand-typed field. These tests are what stops them coming
back by accident, one convenient field at a time.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from kilagen.libs import generate_coverage, keel_lib
from kilagen.libs.validate_frontmatter import load_schema

SCHEMA = load_schema("frontmatter.schema.json")
SCHEMA_TEXT = json.dumps(SCHEMA)

# A posture is a compliance judgement. The only one a generator may assert is
# "nobody has assessed this", and only where nothing maps at all.
FORBIDDEN_POSTURE = {"met", "gap", "exception", "compliant", "non-compliant", "partial"}


class SchemaFirewallTests(unittest.TestCase):
    def test_no_type_accepts_a_maturity_field(self):
        self.assertNotIn("maturity", SCHEMA_TEXT)

    def test_no_type_accepts_a_singular_domain_field(self):
        for branch in SCHEMA["oneOf"]:
            self.assertNotIn("domain", branch["properties"],
                             f"{branch['title']} still has a singular domain")

    def test_a_type_with_a_closing_write_once_fact_declares_no_status(self):
        """One source for a state, or the two will disagree.

        A gap with `status: active` and `remediated: 2026-06-01` passed every
        check while coverage counted it closed. The fix is not a rule that
        compares them — it is that only one of them exists.
        """
        closing = {"remediated", "revoked"}
        for branch in SCHEMA["oneOf"]:
            if not closing & set(branch["properties"]):
                continue
            declared = [ref for ref in branch.get("allOf", [])
                        if ref.get("$ref", "").endswith("declared_status")]
            self.assertEqual(declared, [],
                             f"{branch['title']} closes on a write-once fact and "
                             f"still declares a status")

    def test_the_schema_is_closed(self):
        # unevaluatedProperties is what makes every deletion above stick: a
        # field nobody declared is refused rather than ignored.
        self.assertIs(SCHEMA["unevaluatedProperties"], False)

    def test_tracker_is_a_link_and_never_a_state(self):
        tracker = SCHEMA["$defs"]["tracker_url"]
        self.assertEqual(tracker["type"], "string")
        self.assertTrue(tracker["pattern"].startswith("^https?"))


class CoverageFirewallTests(unittest.TestCase):
    GENERATOR = Path(generate_coverage.__file__).read_text(encoding="utf-8")

    def test_the_generator_reads_no_register(self):
        # Coverage comes from requirement mappings and the clause vocabulary.
        # A register would make it a second place where gaps are stated.
        self.assertNotIn("gaps.yml", self.GENERATOR)

    def test_the_classifier_can_only_ever_emit_not_assessed(self):
        config = {"frameworks": [{"id": "fw"}]}
        documents = [{
            "id": "std-x", "type": "standard", "path": "standards/std-x.md",
            "requirements": [{"ref": "1", "text": "t", "frameworks": {"fw": ["1.1"]}}],
        }]
        coverage = generate_coverage.build_coverage(
            config, documents, {"fw": ["1.1", "1.2", "1.3"]})
        postures = {entry.get("posture") for entry in coverage["fw"].values()}
        coverages = {entry["coverage"] for entry in coverage["fw"].values()}
        self.assertLessEqual(coverages, {"mapped", "unmapped"})
        self.assertLessEqual(postures, {None, "not-assessed"})
        self.assertFalse(postures & FORBIDDEN_POSTURE)


class VocabularyFirewallTests(unittest.TestCase):
    def test_a_capability_carries_no_assessment(self):
        schema = load_schema("model-capabilities.schema.json")
        properties = schema["properties"]["capabilities"]["items"]["properties"]
        self.assertEqual(set(properties), {"id", "name", "domain", "description", "why"})

    def test_a_system_is_an_id_and_a_pointer_not_a_profile(self):
        schema = load_schema("model-systems.schema.json")
        properties = schema["properties"]["systems"]["items"]["properties"]
        self.assertEqual(set(properties), {"id", "name", "url"})


class VendorAssessmentTests(unittest.TestCase):
    """Third-party assessment is inside the boundary; the estate is not.

    The line is not the field, it is the field *without a review cycle*. A
    vnd-* document has an owner and a next_review, so its criticality and CIA
    are touched again every year. The same values on a systems.yml entry
    would rot silently, which is why they are refused there.
    """

    def branch(self, name):
        for b in SCHEMA["oneOf"]:
            if b["properties"]["type"]["const"] == name:
                return b
        raise AssertionError(f"no branch for {name}")

    def test_a_vendor_records_what_is_entrusted_to_it(self):
        props = self.branch("vendor")["properties"]
        for field in ("criticality", "cia", "rto", "rpo"):
            self.assertIn(field, props)

    def test_a_vendor_is_on_a_review_cycle(self):
        # Without this, the fields above would be exactly the thing the
        # boundary refuses: an assessment nobody ever revisits.
        self.assertIn({"$ref": "#/$defs/reviewed"}, self.branch("vendor")["allOf"])

    def test_cia_is_the_same_scale_as_every_other_rating(self):
        cia = SCHEMA["$defs"]["cia_object"]
        self.assertEqual(set(cia["required"]), {"confidentiality", "integrity", "availability"})
        for value in cia["properties"].values():
            self.assertEqual(value, {"$ref": "#/$defs/severity_enum"})
        self.assertIs(cia["additionalProperties"], False)

    def test_no_other_type_gained_an_estate_field(self):
        # business-process legitimately has criticality/rto/rpo — it is the
        # process, not the deployed system. Nothing else may.
        allowed = {"vendor", "business-process"}
        for branch in SCHEMA["oneOf"]:
            name = branch["properties"]["type"]["const"]
            if name in allowed:
                continue
            for field in ("criticality", "cia", "rto", "rpo"):
                self.assertNotIn(field, branch["properties"],
                                 f"{name} should not carry {field}")


class RegistryShapeTests(unittest.TestCase):
    def test_the_type_registry_is_the_only_list_of_types(self):
        # Every other module derives from keel_lib.TYPES, so a new type is one
        # entry rather than a sweep through the codebase.
        names = {t.name for t in keel_lib.TYPES}
        branches = {b["properties"]["type"]["const"] for b in SCHEMA["oneOf"]}
        self.assertEqual(names, branches)


if __name__ == "__main__":
    unittest.main(verbosity=2)
