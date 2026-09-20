"""The vendored tool inventory: its shape, and the line it must not cross.

Reference material about other people's products. The risk is not technical —
it is that a list of named vendors becomes an endorsement, or an inventory of
what somebody runs. Both are tested for here, because both are one careless
field away.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

from kilagen.libs import build_site, keel_lib

TOOLS = keel_lib.KEEL / "content" / "tools"
SCHEMA = json.loads((keel_lib.KEEL / "schemas" / "tools.schema.json").read_text())


def _files():
    return sorted(TOOLS.glob("*.yml"))


class InventoryShapeTests(unittest.TestCase):
    def test_every_shipped_file_validates(self):
        validator = Draft202012Validator(SCHEMA)
        for path in _files():
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            errors = [e.message for e in validator.iter_errors(data)]
            self.assertEqual(errors, [], f"{path.name}: {errors}")

    def test_the_filename_is_the_capability(self):
        for path in _files():
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            self.assertEqual(path.stem, data["capability"], path.name)

    def test_a_capability_matrix_is_refused(self):
        """The first version carries no per-tool feature matrix, on purpose.

        That is the part that goes stale every quarter and that a vendor will
        want to argue about.
        """
        self.assertNotIn("features", json.dumps(SCHEMA))
        self.assertNotIn("capabilities", SCHEMA["properties"])

    def test_the_only_verdict_is_the_licence_model(self):
        item = SCHEMA["properties"]["tools"]["items"]
        self.assertEqual(set(item["properties"]), {"name", "url", "license", "note"})
        self.assertEqual(set(item["properties"]["license"]["enum"]),
                         {"proprietary", "open-source"})
        # Nothing shaped like a score, a rank or a tier.
        for forbidden in ("rating", "score", "rank", "tier", "recommended", "best"):
            self.assertNotIn(forbidden, json.dumps(SCHEMA).lower())

    def test_every_url_is_https(self):
        for path in _files():
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            for tool in data["tools"]:
                self.assertTrue(tool["url"].startswith("https://"), tool["name"])

    def test_the_build_indexes_it_by_capability(self):
        indexed = build_site.tool_inventory()
        self.assertEqual(sorted(indexed), [p.stem for p in _files()])
        for capability, entry in indexed.items():
            self.assertTrue(entry["tools"], capability)
            self.assertTrue(entry["updated"], capability)


class BoundaryTests(unittest.TestCase):
    """It says what exists, never what this organisation runs."""

    def test_nothing_under_program_can_name_a_tool(self):
        frontmatter = json.dumps(
            json.loads((keel_lib.KEEL / "schemas" / "frontmatter.schema.json").read_text()))
        self.assertNotIn('"tools"', frontmatter)

    def test_the_inventory_is_not_part_of_the_seed(self):
        """`init` copies nothing from it: it is reference, not content."""
        from kilagen import cli

        plan = json.dumps([str(p) for p in Path(cli.SCAFFOLD).rglob("*")])
        self.assertNotIn("content/tools", plan)


if __name__ == "__main__":
    unittest.main()


class BrandingTests(unittest.TestCase):
    """The instance's own palette: eleven tokens, no fork."""

    PUBLIC_TOKENS = (
        "--k-bg", "--k-surface", "--k-ink", "--k-ink-muted", "--k-accent",
        "--k-accent-ink", "--k-rule", "--k-sev-critical", "--k-sev-high",
        "--k-sev-medium", "--k-sev-low",
    )

    def _css(self):
        return (keel_lib.KEEL / "dashboard" / "app.css").read_text(encoding="utf-8")

    def test_every_public_token_is_defined_in_both_themes(self):
        css = self._css()
        light = css[css.index(":root {"):css.index(".dark {")]
        dark = css[css.index(".dark {"):]
        for token in self.PUBLIC_TOKENS:
            self.assertIn(f"{token}:", light, f"{token} missing from the light palette")
            self.assertIn(f"{token}:", dark, f"{token} missing from the dark palette")

    def test_the_page_loads_the_instance_stylesheet_after_its_own(self):
        html = (keel_lib.KEEL / "dashboard" / "index.html").read_text(encoding="utf-8")
        self.assertLess(html.index('href="app.css"'), html.index('href="branding.css"'))

    def test_the_documentation_lists_exactly_the_public_tokens(self):
        docs = (keel_lib.KEEL / "content" / "instantiation.md").read_text(encoding="utf-8")
        for token in self.PUBLIC_TOKENS:
            self.assertIn(token, docs, f"{token} is contract but undocumented")
