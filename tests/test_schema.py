"""The frontmatter law: what the schema accepts, and what it refuses.

The refusals matter more than the acceptances. Each one is a decision the
refactor made — no assessment fields, no mirrored tracker state, no grouped
relations — and a schema that quietly started accepting them again would undo
that decision without anyone noticing.
"""

from __future__ import annotations

import json
import unittest

import yaml
from jsonschema import Draft202012Validator

from kilagen.libs.keel_lib import BY_NAME, TYPES, StringLoader, type_of_id
from kilagen.libs.validate_frontmatter import load_schema

VALIDATOR = Draft202012Validator(load_schema("frontmatter.schema.json"))

POLICY = """\
id: pol-information-security
type: policy
title: Information Security Policy
description: What the organization requires of itself.
status: active
owner: role-ciso
last_reviewed: 2026-01-15
next_review: 2027-01-15
"""


def valid(text: str) -> bool:
    return not list(VALIDATOR.iter_errors(yaml.load(text, Loader=StringLoader)))


class BaselineTests(unittest.TestCase):
    def test_a_minimal_policy_is_valid(self):
        self.assertTrue(valid(POLICY))

    def test_every_type_in_the_registry_has_a_schema_branch(self):
        branches = {b["properties"]["type"]["const"]
                    for b in load_schema("frontmatter.schema.json")["oneOf"]}
        self.assertEqual(branches, {t.name for t in TYPES})

    def test_every_prefix_resolves_to_its_type(self):
        for doc_type in TYPES:
            self.assertIs(type_of_id(f"{doc_type.prefix}-example"), doc_type)

    def test_an_unknown_prefix_resolves_to_nothing(self):
        self.assertIsNone(type_of_id("wiki-how-to-reset-a-password"))


class IdTests(unittest.TestCase):
    def test_uppercase_ids_are_refused(self):
        self.assertFalse(valid(POLICY.replace("pol-information", "POL-information")))

    def test_an_id_without_its_type_prefix_is_refused(self):
        self.assertFalse(valid(POLICY.replace("pol-information-security", "information-security")))

    def test_an_id_with_the_wrong_prefix_for_its_type_is_refused(self):
        self.assertFalse(valid(POLICY.replace("pol-information-security", "std-information-security")))


class BannedFieldTests(unittest.TestCase):
    """Fields the refactor removed, which unevaluatedProperties keeps out."""

    def test_maturity_is_refused(self):
        self.assertFalse(valid(POLICY + "maturity: L3-integrated\n"))

    def test_the_singular_domain_field_is_refused(self):
        self.assertFalse(valid(POLICY + "domain: grc\n"))

    def test_grouped_related_is_refused(self):
        self.assertFalse(valid(POLICY + "related:\n  standards: [std-access-control]\n"))

    def test_flat_related_is_accepted(self):
        self.assertTrue(valid(POLICY + "related: [std-access-control]\n"))

    def test_an_invented_field_is_refused(self):
        self.assertFalse(valid(POLICY + "confidence_level: high\n"))


class OwnershipTests(unittest.TestCase):
    def test_owner_must_be_a_role_id(self):
        self.assertFalse(valid(POLICY.replace("owner: role-ciso", "owner: alice")))

    def test_owner_is_required(self):
        self.assertFalse(valid(POLICY.replace("owner: role-ciso\n", "")))


class LifecycleTests(unittest.TestCase):
    DECISION = """\
id: dec-lowercase-ids
type: decision
title: Lowercase ids
description: Why ids are lowercase.
status: active
owner: role-ciso
decided: 2026-03-04
"""

    def test_an_immutable_type_records_the_event_date(self):
        self.assertTrue(valid(self.DECISION))

    def test_an_immutable_type_refuses_a_review_cycle(self):
        # A decision cannot be revised, so a date that asks somebody to
        # revisit it would put a permanent false entry in the schedule.
        self.assertFalse(valid(self.DECISION + "next_review: 2027-03-04\n"))

    def test_a_reviewed_type_requires_both_dates(self):
        self.assertFalse(valid(POLICY.replace("next_review: 2027-01-15\n", "")))


class StandardTests(unittest.TestCase):
    STANDARD = """\
id: std-access-control
type: standard
title: Access Control
description: How access is granted.
status: active
owner: role-ciso
last_reviewed: 2026-01-15
next_review: 2027-01-15
requirements:
  - ref: "1.1"
    text: Access is granted through an approved request.
    frameworks:
      pci_dss: ["7"]
"""

    def test_a_standard_maps_frameworks_per_requirement(self):
        self.assertTrue(valid(self.STANDARD))

    def test_a_standard_may_not_map_frameworks_at_the_document_level(self):
        # Coverage is auditable because a clause resolves to a requirement, not
        # to "the document". A document-level map would break that.
        self.assertFalse(valid(self.STANDARD + 'frameworks:\n  pci_dss: ["8"]\n'))

    def test_a_standard_without_requirements_is_refused(self):
        without = self.STANDARD[:self.STANDARD.index("requirements:")]
        self.assertFalse(valid(without))

    def test_a_requirement_needs_its_text(self):
        self.assertFalse(valid(self.STANDARD.replace(
            "    text: Access is granted through an approved request.\n", "")))

    def test_only_a_requirement_may_map_to_a_framework(self):
        # A document-level tag rendered as a badge and fed nothing: coverage is
        # computed from requirements[].frameworks inside a standard, and only
        # from there. A field that implies a mapping nobody counts is worse
        # than a missing one.
        self.assertFalse(valid(POLICY + 'frameworks:\n  pci_dss: ["7"]\n'))


class TriangleTests(unittest.TestCase):
    GAP = """\
id: gap-shared-accounts
type: gap
title: Shared accounts
description: Two hosts share a local account.
owner: role-ciso
requirement: std-access-control#1.2
source: audit
found: 2026-02-01
"""

    def test_a_gap_is_valid_with_a_requirement_reference(self):
        self.assertTrue(valid(self.GAP))

    def test_a_gap_requires_its_requirement(self):
        self.assertFalse(valid(self.GAP.replace(
            "requirement: std-access-control#1.2\n", "")))

    def test_a_requirement_reference_must_be_lowercase(self):
        self.assertFalse(valid(self.GAP.replace("std-access-control#1.2",
                                                "STD-access-control#1.2")))

    def test_a_requirement_reference_needs_a_clause(self):
        self.assertFalse(valid(self.GAP.replace("std-access-control#1.2",
                                                "std-access-control")))

    def test_closure_is_a_write_once_date(self):
        self.assertTrue(valid(self.GAP + "remediated: 2026-06-01\n"))

    def test_a_gap_closed_by_an_exception_says_so_in_its_own_word(self):
        # `superseded_by` also meant "a newer version replaced this document",
        # which is a different relationship that happens to end the same way.
        self.assertTrue(valid(self.GAP + "excepted_by: exc-batch-account\n"))
        self.assertFalse(valid(self.GAP + "superseded_by: exc-batch-account\n"))

    def test_neither_side_of_the_triangle_carries_a_review_cycle(self):
        # A gap is due attention so many days after `found`, an exception ends
        # at `expires`. A second clock could only disagree with the first.
        self.assertFalse(valid(self.GAP + "last_reviewed: 2026-02-01\nnext_review: 2026-05-01\n"))

    def test_neither_side_of_the_triangle_may_declare_a_status(self):
        # Their state is computed from the write-once facts. A declared one
        # could only agree redundantly or disagree silently.
        self.assertFalse(valid(self.GAP + "status: active\n"))

    def test_an_exception_must_expire(self):
        exception = """\
id: exc-batch-account
type: exception
title: Batch account
description: A job uses a shared service account.
owner: role-ciso
requirement: std-access-control#1.2
approved_by: [role-ciso]
"""
        self.assertFalse(valid(exception))
        self.assertTrue(valid(exception + "expires: 2027-02-01\n"))


class EvidenceTests(unittest.TestCase):
    """Evidence demonstrates a requirement, so it lives inside one.

    Nobody asks for "the evidence of the Access Control Standard"; they ask for
    the evidence that entitlements are certified, which is a requirement.
    """

    STANDARD = """\
id: std-access-control
type: standard
title: Access control
description: Who may reach what.
status: active
owner: role-ciso
last_reviewed: 2026-01-01
next_review: 2027-01-01
requirements:
  - ref: "1.1"
    text: Every user has a unique account.
"""

    def _with(self, block):
        return valid(self.STANDARD + block)

    def test_evidence_is_a_named_link_on_a_requirement(self):
        self.assertTrue(self._with('    evidence:\n      - name: "SOC 2"\n        url: "https://example.com/soc2"\n'))

    def test_evidence_without_a_url_is_refused(self):
        self.assertFalse(self._with('    evidence:\n      - name: "SOC 2"\n'))

    def test_a_relative_path_is_not_evidence(self):
        # A path would mean the file is in the repository, which is the thing
        # the evidence field exists to avoid.
        self.assertFalse(self._with('    evidence:\n      - name: "SOC 2"\n        url: "./soc2.pdf"\n'))

    def test_a_document_may_no_longer_carry_evidence(self):
        self.assertFalse(valid(POLICY + 'evidence:\n  - name: "SOC 2"\n    url: "https://example.com/soc2"\n'))

    def test_evidence_can_say_when_it_was_collected_and_how_often_it_expires(self):
        self.assertTrue(self._with(
            '    evidence:\n      - name: "Access review"\n        url: "https://example.com/r"\n'
            '        collected: 2026-09-30\n        freshness: quarterly\n        collector: okta-access-review\n'))

    def test_freshness_is_the_same_closed_set_as_the_schedule(self):
        self.assertFalse(self._with(
            '    evidence:\n      - name: "Access review"\n        url: "https://example.com/r"\n'
            '        freshness: whenever\n'))

    def test_how_demonstrated_is_the_method_not_the_proof(self):
        self.assertTrue(self._with('    how_demonstrated: Quarterly access review export.\n'))
        self.assertFalse(self._with('    how_demonstrated:\n      - name: "SOC 2"\n'))


class PublishTests(unittest.TestCase):
    def test_publish_accepts_the_two_keywords_and_a_list(self):
        for value in ("none", "all", "[confluence]"):
            self.assertTrue(valid(POLICY + f"publish: {value}\n"), value)

    def test_publish_refuses_anything_else(self):
        self.assertFalse(valid(POLICY + "publish: maybe\n"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
