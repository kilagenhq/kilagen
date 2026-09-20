"""Storage rules: a folder is a type, a filename is an id, a subfolder is a year.

These are the checks that keep the filesystem from drifting back into being a
taxonomy. Each one is cheap to state and impossible to enforce in a schema,
because all three are about where a file sits rather than what it contains.
"""

from __future__ import annotations

import unittest

from kilagen.libs.keel_lib import TYPES
from kilagen.libs.validate_frontmatter import validate_id_uniqueness, validate_layout
from tests.support import GAP, ProgramTestCase


class LayoutTests(ProgramTestCase):
    def test_the_seeded_program_is_well_laid_out(self):
        self.assertEqual(validate_layout(), [])

    def test_the_filename_must_be_the_id(self):
        self.write("policies/pol-renamed.md", """\
            ---
            id: pol-something-else
            type: policy
            title: T
            description: D
            status: draft
            owner: role-owner
            last_reviewed: 2026-01-01
            next_review: 2030-01-01
            ---
            """)
        errors = validate_layout()
        self.assertTrue(any("does not match the filename" in e for e in errors), errors)

    def test_a_document_in_the_wrong_type_folder_is_reported(self):
        moved = (self.program / "standards" / "std-access-control.md").read_text()
        self.remove("standards/std-access-control.md")
        self.write("policies/std-access-control.md", moved)
        errors = validate_layout()
        self.assertTrue(any("belongs in standards/" in e for e in errors), errors)

    def test_a_dated_type_must_sit_under_a_year(self):
        gap = (self.program / "gaps" / "2026" / "gap-shared-accounts.md").read_text()
        self.remove("gaps/2026")
        self.write("gaps/gap-shared-accounts.md", gap)
        errors = validate_layout()
        self.assertTrue(any("is a dated type" in e for e in errors), errors)

    def test_the_year_must_match_the_date_the_document_opened(self):
        gap = (self.program / "gaps" / "2026" / "gap-shared-accounts.md").read_text()
        self.remove("gaps/2026")
        self.write("gaps/2024/gap-shared-accounts.md", gap)
        errors = validate_layout()
        self.assertTrue(any("filed under 2024/ but found says 2026" in e for e in errors), errors)

    def test_an_undated_type_takes_no_subfolders(self):
        standard = (self.program / "standards" / "std-access-control.md").read_text()
        self.remove("standards/std-access-control.md")
        self.write("standards/iam/std-access-control.md", standard)
        errors = validate_layout()
        self.assertTrue(any("takes no subfolders" in e for e in errors), errors)

    def test_a_folder_that_is_not_a_type_is_reported(self):
        # The whole point of the layout: somebody re-creating a domain
        # directory should be told to use a facet instead.
        (self.program / "02-iam").mkdir()
        errors = validate_layout()
        self.assertTrue(any("not a document type" in e for e in errors), errors)

    def test_the_model_directory_is_not_a_document_type(self):
        # model/ legitimately holds no documents.
        self.assertEqual(validate_layout(), [])


class IdUniquenessTests(ProgramTestCase):
    def test_ids_are_unique_across_the_program(self):
        self.assertEqual(validate_id_uniqueness(), [])

    def test_a_duplicate_id_in_another_folder_is_reported(self):
        # The year partition splits storage, not the namespace: the same gap id
        # in two different years is still a collision.
        self.write("gaps/2027/gap-shared-accounts.md",
                   GAP.replace("found: 2026-02-01", "found: 2027-02-01"))
        errors = validate_id_uniqueness()
        self.assertTrue(any("duplicate id 'gap-shared-accounts'" in e for e in errors), errors)


class RegistryTests(unittest.TestCase):
    def test_every_type_has_a_distinct_prefix_and_folder(self):
        self.assertEqual(len({t.prefix for t in TYPES}), len(TYPES))
        self.assertEqual(len({t.folder for t in TYPES}), len(TYPES))

    def test_only_the_three_dated_types_are_partitioned(self):
        self.assertEqual({t.name for t in TYPES if t.dated},
                         {"gap", "exception", "incident"})

    def test_only_records_of_events_are_immutable(self):
        self.assertEqual({t.name for t in TYPES if t.immutable}, {"decision", "incident"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
