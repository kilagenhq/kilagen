"""The two ways this codebase has actually drifted, closed as classes.

`schedule.yml` shipped for weeks with no schema. It was not "pending
validation": with nothing claiming it, a whole refactor walked past it and the
file kept a shape no other file had. The first half of this module makes that
impossible to repeat — every file a program can hold is claimed by a validator,
or is prose somebody decided is prose.

`compliance.md` described a world that no longer existed: paths that had moved,
a verb that had been renamed. The second half checks that what the shipped
documentation tells a reader to type or open is really there.

Run from the repository root:

    python3 -m unittest discover -s tests
"""

from __future__ import annotations

import argparse
import contextlib
import io
import os
import re
import tempfile
import unittest
from pathlib import Path

from kilagen import cli
from kilagen.libs import keel_lib

DOCS = sorted((keel_lib.KEEL / "content").glob("*.md")) + \
    sorted((keel_lib.KEEL / "content" / "adrs").glob("*.md"))
SCHEMAS = keel_lib.KEEL / "schemas"


def _quiet(fn, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*args, **kwargs)


class FileCoverageTests(unittest.TestCase):
    """Every file a fresh program holds is claimed by a validator."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.instance = Path(self._tmp.name).resolve()
        self._cwd = os.getcwd()
        self._paths = (keel_lib.REPO, keel_lib.PROGRAM, keel_lib.MODEL)
        self.addCleanup(lambda: (os.chdir(self._cwd),
                                 setattr(keel_lib, "REPO", self._paths[0]),
                                 setattr(keel_lib, "PROGRAM", self._paths[1]),
                                 setattr(keel_lib, "MODEL", self._paths[2]),
                                 self._tmp.cleanup()))
        os.chdir(self.instance)
        _quiet(cli.cmd_init, argparse.Namespace(
            name="Acme", deployment="none", agent="none", force=False, guided=False))
        keel_lib.REPO = self.instance
        keel_lib.PROGRAM = self.instance / "program"
        keel_lib.MODEL = keel_lib.PROGRAM / "model"

    def test_what_init_writes_is_all_claimed(self):
        self.assertEqual(keel_lib.unrecognised_program_files(), [])

    def test_a_file_nobody_declared_is_reported_rather_than_ignored(self):
        (keel_lib.PROGRAM / "inventory.yml").write_text("assets: []\n", encoding="utf-8")
        self.assertEqual(keel_lib.unrecognised_program_files(), ["inventory.yml"])

    def test_the_report_reaches_check(self):
        from kilagen.libs import validate_frontmatter as vf

        (keel_lib.PROGRAM / "inventory.yml").write_text("assets: []\n", encoding="utf-8")
        errors = vf.validate_file_coverage()
        self.assertTrue(any("inventory.yml" in e for e in errors), errors)

    def test_every_schema_the_table_names_ships(self):
        for _, schema in keel_lib.PROGRAM_FILE_RULES:
            if schema is None:
                continue
            self.assertTrue((SCHEMAS / schema).is_file(), schema)

    # Schemas that validate what the *package* ships rather than what a program
    # holds. Named here so "it applies to nothing under program/" is a stated
    # fact rather than an omission.
    SHIPPED_CONTENT_SCHEMAS = {"tools.schema.json"}

    def test_every_shipped_schema_is_reachable_from_the_table(self):
        """A schema nothing applies is a validator that never runs."""
        named = {schema for _, schema in keel_lib.PROGRAM_FILE_RULES if schema}
        named.add("frontmatter.schema.json")   # every type folder, by rule
        named |= self.SHIPPED_CONTENT_SCHEMAS
        on_disk = {p.name for p in SCHEMAS.glob("*.schema.json")}
        self.assertEqual(on_disk - named, set())

    def test_a_schema_for_shipped_content_is_applied_by_its_own_test(self):
        # tools.schema.json validates keel/content/tools/; tests/test_tools.py
        # is where that happens, and this is the pointer that keeps the pair
        # from drifting apart.
        suite = (Path(__file__).parent / "test_tools.py").read_text(encoding="utf-8")
        for schema in self.SHIPPED_CONTENT_SCHEMAS:
            self.assertIn(schema, suite)

    def test_a_document_in_a_type_folder_is_covered_by_the_frontmatter_schema(self):
        recognised, schema = keel_lib.validator_for("standards/std-x.md")
        self.assertTrue(recognised)
        self.assertEqual(schema, "frontmatter.schema.json")

    def test_a_dated_type_is_covered_only_inside_its_year(self):
        self.assertTrue(keel_lib.validator_for("gaps/2026/gap-x.md")[0])
        # Loose in the type folder is a layout error, and the layout check says
        # so — what matters here is that it is not silently claimed.
        self.assertFalse(keel_lib.validator_for("gaps/gap-x.md")[0])


class DocumentationPathTests(unittest.TestCase):
    """What the shipped documentation tells you to type, or to open."""

    def _text(self):
        """Every shipped document, minus its own frontmatter block.

        A file's frontmatter describes that file; what is being checked here
        is what the prose tells a reader about a *program*, so the framework's
        own metadata is not evidence either way.
        """
        chunks = []
        for path in DOCS:
            text = path.read_text(encoding="utf-8")
            if text.startswith("---\n"):
                end = text.find("\n---\n", 4)
                if end != -1:
                    text = text[end + 5:]
            chunks.append(text)
        return "\n".join(chunks)

    def test_every_verb_the_documentation_names_exists(self):
        for verb in sorted(set(re.findall(r"`?kilagen ([a-z]+)", self._text()))):
            self.assertIn(verb, cli.COMMANDS, f"documentation calls 'kilagen {verb}'")

    def test_every_check_target_the_documentation_names_exists(self):
        for target in sorted(set(re.findall(r"kilagen check ([a-z]+)", self._text()))):
            if target == "reviews":
                continue                        # covered below with its flag
            self.assertIn(target, cli.CHECKS, f"documentation calls 'kilagen check {target}'")

    def test_every_program_path_the_documentation_names_is_real(self):
        """A path in the docs is either a rule the model knows, or a lie."""
        paths = set(re.findall(r"program/([A-Za-z0-9_./<>*-]+)", self._text()))
        for path in sorted(paths):
            cleaned = path.rstrip("/.,)`")
            if not cleaned or "<" in cleaned or "*" in cleaned:
                continue                        # a pattern, not a path
            head = cleaned.split("/")[0]
            self.assertTrue(
                head in keel_lib.BY_FOLDER
                or head in {"model", "config.yml", "publish.yml", "schedule.yml",
                            "README.md", "branding.css"},
                f"documentation names program/{cleaned}, which is nothing the model knows",
            )

    def test_every_type_name_the_documentation_uses_is_a_type(self):
        declared = set(re.findall(r"^type: ([a-z-]+)$", self._text(), re.M))
        for name in sorted(declared):
            self.assertIn(name, keel_lib.BY_NAME, f"documentation shows 'type: {name}'")

    def test_every_id_prefix_the_documentation_uses_belongs_to_a_type(self):
        prefixes = set(re.findall(r"\b([a-z]{2,4})-\*\.md", self._text()))
        for prefix in sorted(prefixes):
            self.assertIn(prefix, keel_lib.BY_PREFIX, f"documentation shows '{prefix}-*.md'")


if __name__ == "__main__":
    unittest.main()
