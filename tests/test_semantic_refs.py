"""References must resolve: facets, relations, roles, requirements, destinations."""

from __future__ import annotations

import unittest

from kilagen.libs import validate_semantic_refs as vsr
from kilagen.libs.keel_lib import load_model, load_publish
from tests.support import ProgramTestCase


class FacetTests(ProgramTestCase):
    def test_the_seeded_facets_resolve(self):
        self.assertEqual(vsr.check_facets(self.documents(), load_model()), [])

    def test_a_domain_outside_the_vocabulary_is_reported(self):
        self.edit("standards/std-access-control.md", "domains: [iam]", "domains: [iam, quantum]")
        errors = vsr.check_facets(self.documents(), load_model())
        self.assertTrue(any("'quantum' is not in" in e for e in errors), errors)

    def test_a_capability_outside_the_vocabulary_is_reported(self):
        self.edit("standards/std-access-control.md", "capabilities: [iam.idp]", "capabilities: [iam.telepathy]")
        errors = vsr.check_facets(self.documents(), load_model())
        self.assertTrue(any("iam.telepathy" in e for e in errors), errors)

    def test_a_system_outside_the_vocabulary_is_reported(self):
        self.edit("standards/std-access-control.md", "systems: [okta]", "systems: [okta, nowhere]")
        errors = vsr.check_facets(self.documents(), load_model())
        self.assertTrue(any("'nowhere' is not in" in e for e in errors), errors)

    def test_several_domains_on_one_document_are_fine(self):
        # The whole reason the singular field died: real documents span domains.
        self.edit("standards/std-access-control.md", "domains: [iam]", "domains: [iam, grc]")
        self.assertEqual(vsr.check_facets(self.documents(), load_model()), [])


class VocabularyCoherenceTests(ProgramTestCase):
    def test_the_seeded_vocabulary_is_coherent(self):
        self.assertEqual(vsr.check_vocabulary_coherence(load_model()), [])

    def test_a_capability_namespaced_under_an_unknown_domain_is_reported(self):
        self.edit("model/capabilities.yml", "  - id: iam.idp\n    name: Identity Provider\n    domain: iam",
                  "  - id: quantum.idp\n    name: Identity Provider\n    domain: quantum")
        errors = vsr.check_vocabulary_coherence(load_model())
        self.assertTrue(any("not in domains.yml" in e for e in errors), errors)

    def test_a_capability_whose_domain_contradicts_its_id_is_reported(self):
        self.edit("model/capabilities.yml", "  - id: iam.idp\n    name: Identity Provider\n    domain: iam",
                  "  - id: iam.idp\n    name: Identity Provider\n    domain: grc")
        errors = vsr.check_vocabulary_coherence(load_model())
        self.assertTrue(any("its id says 'iam'" in e for e in errors), errors)


class RelationTests(ProgramTestCase):
    def test_the_seeded_relations_resolve(self):
        self.assertEqual(vsr.check_relations(self.documents()), [])

    def test_a_dangling_related_id_is_reported(self):
        self.edit("standards/std-access-control.md", "status: active",
                  "status: active\nrelated: [pol-nonexistent]")
        errors = vsr.check_relations(self.documents())
        self.assertTrue(any("resolves to no document" in e for e in errors), errors)

    def test_an_id_with_no_type_prefix_is_reported(self):
        self.edit("standards/std-access-control.md", "status: active",
                  "status: active\nrelated: [the-old-wiki-page]")
        errors = vsr.check_relations(self.documents())
        self.assertTrue(any("no known type prefix" in e for e in errors), errors)

    def test_excepted_by_must_resolve_too(self):
        # The exception that closes a gap is a reference like any other: if it
        # does not resolve, the gap is closed by nothing.
        self.edit("gaps/2026/gap-shared-accounts.md", "severity: medium",
                  "severity: medium\nexcepted_by: exc-gone")
        errors = vsr.check_relations(self.documents())
        self.assertTrue(any("exc-gone" in e for e in errors), errors)


class RoleTests(ProgramTestCase):
    def test_the_seeded_ownership_resolves(self):
        self.assertEqual(vsr.check_roles(self.documents()), [])

    def test_an_unknown_owner_is_reported(self):
        self.edit("standards/std-access-control.md", "owner: role-owner", "owner: role-ghost")
        errors = vsr.check_roles(self.documents())
        self.assertTrue(any("role-ghost" in e for e in errors), errors)

    def test_an_unknown_approver_is_reported(self):
        self.edit("exceptions/2026/exc-batch-account.md",
                  "approved_by: [role-owner]", "approved_by: [role-owner, role-ghost]")
        errors = vsr.check_roles(self.documents())
        self.assertTrue(any("approved_by" in e and "role-ghost" in e for e in errors), errors)


class RequirementTests(ProgramTestCase):
    def test_the_seeded_triangle_resolves(self):
        self.assertEqual(vsr.check_requirements(self.documents()), [])

    def test_a_gap_against_an_unknown_standard_is_reported(self):
        self.edit("gaps/2026/gap-shared-accounts.md",
                  "requirement: std-access-control#1.2", "requirement: std-imaginary#1.1")
        errors = vsr.check_requirements(self.documents())
        self.assertTrue(any("std-imaginary" in e for e in errors), errors)

    def test_a_gap_against_an_unknown_requirement_number_lists_the_real_ones(self):
        # The error is the useful half of the rule: if the requirement does not
        # exist, either the standard needs writing or this was never a gap.
        self.edit("gaps/2026/gap-shared-accounts.md",
                  "requirement: std-access-control#1.2", "requirement: std-access-control#9.9")
        errors = vsr.check_requirements(self.documents())
        self.assertTrue(any("std-access-control has 1.1, 1.2" in e for e in errors), errors)

    def test_an_exception_is_held_to_the_same_rule(self):
        self.edit("exceptions/2026/exc-batch-account.md",
                  "requirement: std-access-control#1.2", "requirement: std-access-control#4.4")
        errors = vsr.check_requirements(self.documents())
        self.assertTrue(any("exc-batch-account" in e for e in errors), errors)


class PublishingTests(ProgramTestCase):
    def test_the_seeded_contract_is_consistent(self):
        self.assertEqual(vsr.check_publishing(self.documents(), load_publish()), [])

    def test_an_undeclared_destination_on_a_document_is_reported(self):
        self.edit("standards/std-access-control.md", "status: active",
                  "status: active\npublish: [sharepoint]")
        errors = vsr.check_publishing(self.documents(), load_publish())
        self.assertTrue(any("sharepoint" in e for e in errors), errors)

    def test_an_undeclared_destination_in_the_defaults_is_reported(self):
        self.edit("publish.yml", "  policy: [confluence]", "  policy: [sharepoint]")
        errors = vsr.check_publishing(self.documents(), load_publish())
        self.assertTrue(any("not a declared destination" in e for e in errors), errors)

    def test_a_default_keyed_by_a_non_type_is_reported(self):
        self.edit("publish.yml", "  decision: []", "  wiki-page: []")
        errors = vsr.check_publishing(self.documents(), load_publish())
        self.assertTrue(any("not a document type" in e for e in errors), errors)

    def test_keywords_need_no_declared_destination(self):
        self.edit("standards/std-access-control.md", "status: active",
                  "status: active\npublish: none")
        self.assertEqual(vsr.check_publishing(self.documents(), load_publish()), [])


class PublishResolutionTests(ProgramTestCase):
    def test_a_type_default_applies_when_the_document_is_silent(self):
        from kilagen.libs.keel_lib import publish_targets
        publish = load_publish()
        self.assertEqual(publish_targets({"type": "policy"}, publish), ["confluence"])

    def test_a_document_override_wins(self):
        from kilagen.libs.keel_lib import publish_targets
        publish = load_publish()
        self.assertEqual(publish_targets({"type": "policy", "publish": "none"}, publish), [])

    def test_all_expands_to_every_declared_destination(self):
        from kilagen.libs.keel_lib import publish_targets
        publish = load_publish()
        self.assertEqual(publish_targets({"type": "decision", "publish": "all"}, publish), ["confluence"])


class DateTests(ProgramTestCase):
    def test_the_seeded_dates_are_ordered(self):
        self.assertEqual(vsr.check_dates(self.documents()), [])

    def test_a_gap_remediated_before_it_was_found_is_reported(self):
        self.edit("gaps/2026/gap-shared-accounts.md", "severity: medium",
                  "severity: medium\nremediated: 2025-01-01")
        errors = vsr.check_dates(self.documents())
        self.assertTrue(any("remediated" in e and "before found" in e for e in errors), errors)


class BinaryTests(ProgramTestCase):
    def test_a_clean_program_holds_no_binaries(self):
        self.assertEqual(vsr.check_no_binaries(), [])

    def test_a_committed_pdf_is_reported(self):
        (self.program / "vendors" / "soc2.pdf").write_bytes(b"%PDF-1.4\n")
        errors = vsr.check_no_binaries()
        self.assertTrue(any("soc2.pdf" in e for e in errors), errors)

    def test_text_formats_are_allowed(self):
        (self.program / "vendors" / "notes.txt").write_text("fine")
        self.assertEqual(vsr.check_no_binaries(), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)


class BinarySmugglingTests(ProgramTestCase):
    """The three ways a binary used to get under program/ unnoticed."""

    def _binary(self, rel: str) -> None:
        path = self.program / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01\x00")

    def _errors(self):
        from kilagen.libs.validate_semantic_refs import check_no_binaries
        return check_no_binaries()

    def test_an_unexpected_extension_is_refused(self):
        self._binary("policies/diagram.png")
        self.assertTrue(any("diagram.png" in e for e in self._errors()))

    def test_a_binary_wearing_a_text_extension_is_refused(self):
        # The obvious way around a check that only reads names.
        self._binary("policies/evidence.md")
        errors = self._errors()
        self.assertTrue(any("evidence.md" in e for e in errors), errors)
        self.assertTrue(any("content is binary" in e for e in errors), errors)

    def test_a_binary_with_no_extension_is_refused(self):
        # "" was in the text allowlist, so this used to pass in silence.
        self._binary("policies/payload")
        self.assertTrue(any("payload" in e for e in self._errors()))

    def test_a_hidden_binary_is_refused(self):
        # Hidden files were skipped outright.
        self._binary("policies/.secret")
        self.assertTrue(any(".secret" in e for e in self._errors()))

    def test_real_text_still_passes(self):
        self.write("policies/pol-note.md", "---\ntype: policy\n---\n\nPlain text.\n")
        self.write("model/extra.yml", "a: 1\n")
        (self.program / "policies" / ".gitkeep").write_text("", encoding="utf-8")
        self.assertEqual(self._errors(), [])

    def test_utf8_prose_is_not_mistaken_for_binary(self):
        # Accents, CJK and emoji are multi-byte; none of them is binary.
        self.write("policies/pol-i18n.md", "---\ntype: policy\n---\n\nSeñal 日本語 🔐\n")
        self.assertEqual(self._errors(), [])
