"""Collectors: the shipped ones, and the inventory the dashboard reads.

A collector is somebody else's code that the CLI runs on request. The two
things worth pinning here are the resolution order — an instance's collector
beats a shipped one of the same name — and the fact that *cataloguing* them is
not running them. A build that imported every file it listed would execute
arbitrary code as a side effect of `kilagen build`.
"""

from __future__ import annotations

import unittest
from datetime import date
from pathlib import Path

from kilagen.libs import build_site, collect_evidence, keel_lib

from tests.support import ProgramTestCase

SHIPPED = keel_lib.KEEL / "collectors"


class ShippedCollectorTests(unittest.TestCase):
    def test_every_shipped_collector_defines_collect(self):
        for path in sorted(SHIPPED.glob("*.py")):
            if path.name.startswith("_"):
                continue
            module = collect_evidence.load(path.stem)
            self.assertTrue(callable(module.collect), path.name)

    def test_manual_returns_a_pointer_and_a_date_that_is_not_in_the_future(self):
        module = collect_evidence.load("manual")
        result = module.collect({"url": "https://drive.example.com/report.pdf"})
        self.assertEqual(result["url"], "https://drive.example.com/report.pdf")
        self.assertLessEqual(result["collected"], date.today().isoformat())
        # And it satisfies the contract the caller enforces.
        collect_evidence._validate(result, "manual")

    def test_manual_refuses_an_entry_with_nowhere_to_point(self):
        module = collect_evidence.load("manual")
        with self.assertRaises(ValueError):
            module.collect({"name": "A report with no url"})

    def test_okta_is_honest_about_being_a_template(self):
        module = collect_evidence.load("okta-access-review")
        with self.assertRaises(NotImplementedError):
            module.collect({"url": "https://example.com/x.csv"})


class InventoryTests(ProgramTestCase):
    """The index `kilagen build` writes into registry.json."""

    def _collectors_dir(self) -> Path:
        folder = self.repo / "collectors"
        folder.mkdir(exist_ok=True)
        return folder

    def test_shipped_collectors_are_indexed_with_their_summary(self):
        found = build_site.collector_inventory()
        self.assertIn("manual", found)
        self.assertEqual(found["manual"]["source"], "framework")
        self.assertEqual(found["manual"]["path"], "keel/collectors/manual.py")
        self.assertTrue(found["manual"]["summary"])
        self.assertFalse(found["manual"]["template"])

    def test_a_collector_that_only_raises_is_marked_a_template(self):
        found = build_site.collector_inventory()
        self.assertTrue(found["okta-access-review"]["template"])

    def test_an_instance_collector_is_indexed_as_its_own(self):
        (self._collectors_dir() / "drive-folder.py").write_text(
            '"""Record the newest export in a shared-drive folder."""\n\n'
            "def collect(config):\n"
            '    return {"url": config["url"], "collected": "2026-01-01"}\n',
            encoding="utf-8")
        found = build_site.collector_inventory()
        self.assertEqual(found["drive-folder"]["source"], "program")
        self.assertEqual(found["drive-folder"]["path"], "collectors/drive-folder.py")
        self.assertEqual(found["drive-folder"]["summary"],
                         "Record the newest export in a shared-drive folder.")

    def test_an_instance_collector_wins_over_a_shipped_one_of_the_same_name(self):
        """The same rule collect_evidence.collector_path applies at run time."""
        (self._collectors_dir() / "manual.py").write_text(
            '"""This program does it differently."""\n\n'
            "def collect(config):\n"
            '    return {"url": config["url"], "collected": "2026-01-01"}\n',
            encoding="utf-8")
        found = build_site.collector_inventory()
        self.assertEqual(found["manual"]["source"], "program")
        self.assertEqual(found["manual"]["summary"], "This program does it differently.")
        # And the resolver agrees, which is the point of testing both.
        self.assertEqual(collect_evidence.collector_path("manual", self.repo).parent.name,
                         "collectors")

    def test_the_resolver_follows_the_program_it_is_pointed_at(self):
        """`collector_path` with no root must read the current PROGRAM.

        It used to `from .keel_lib import PROGRAM`, which freezes the value at
        import time — so repointing `keel_lib.PROGRAM` (which is how every
        test, and `init`, moves the program) never reached it, and the default
        resolved against whatever directory the process started in.
        """
        (self._collectors_dir() / "local-only.py").write_text(
            '"""Only this program has it."""\n\ndef collect(config):\n    return {}\n',
            encoding="utf-8")
        found = collect_evidence.collector_path("local-only")
        self.assertEqual(found.parent, self.repo / "collectors")

    def test_cataloguing_a_collector_never_runs_it(self):
        """A build that imported what it lists would execute arbitrary code.

        Planting a module that raises on import proves the inventory reads it
        as text: if it imported, this test would error rather than fail.
        """
        (self._collectors_dir() / "hostile.py").write_text(
            '"""A collector that explodes the moment it is imported."""\n\n'
            'raise RuntimeError("imported")\n\n'
            "def collect(config):\n"
            "    return {}\n",
            encoding="utf-8")
        found = build_site.collector_inventory()
        self.assertIn("hostile", found)
        self.assertEqual(found["hostile"]["summary"],
                         "A collector that explodes the moment it is imported.")

    def test_private_modules_are_not_collectors(self):
        (self._collectors_dir() / "__init__.py").write_text("", encoding="utf-8")
        (self._collectors_dir() / "_helpers.py").write_text(
            '"""Shared bits, not a collector."""\n', encoding="utf-8")
        found = build_site.collector_inventory()
        self.assertNotIn("__init__", found)
        self.assertNotIn("_helpers", found)

    def test_a_module_with_no_docstring_gets_an_empty_summary(self):
        (self._collectors_dir() / "terse.py").write_text(
            "def collect(config):\n    return {}\n", encoding="utf-8")
        found = build_site.collector_inventory()
        self.assertEqual(found["terse"]["summary"], "")

    def test_the_inventory_travels_in_the_registry(self):
        registry = build_site.build_registry_json(
            {"name": "Test"}, [], {}, {}, {}, {})
        self.assertIn("collectors", registry)
        self.assertIn("manual", registry["collectors"])


class RewriteTests(unittest.TestCase):
    """`update evidence --apply` edits the user's own frontmatter in place.

    It works on text rather than round-tripping YAML, because reformatting a
    whole document to change two lines is not a diff anybody wants to review.
    The price of that choice is that every shape a person might have written
    has to be handled, so each one here is a shape that appears in real files.
    """

    FRESH = {"url": "https://new.example/report.pdf", "collected": "2026-09-21"}

    def _apply(self, text: str):
        return collect_evidence._rewrite(text, "manual", self.FRESH)

    def _entry(self, text: str, index: int = 0) -> dict:
        """Parse the result and hand back one evidence entry."""
        import yaml
        front = yaml.safe_load(text.split("---")[1])
        return front["requirements"][0]["evidence"][index]

    def test_it_replaces_the_pointer_and_the_date(self):
        text = ("---\nrequirements:\n- ref: '1.1'\n  evidence:\n  - name: A\n"
                "    url: https://old.example/a.pdf\n    collected: '2026-01-01'\n"
                "    collector: manual\n---\nbody\n")
        out, changed = self._apply(text)
        self.assertTrue(changed)
        entry = self._entry(out)
        self.assertEqual(entry["url"], self.FRESH["url"])
        self.assertEqual(str(entry["collected"]), self.FRESH["collected"])
        self.assertTrue(out.endswith("body\n"), "the body must be untouched")

    def test_it_adds_a_date_to_an_entry_that_never_had_one(self):
        text = ("---\nrequirements:\n- ref: '1.1'\n  evidence:\n  - name: A\n"
                "    url: https://old.example/a.pdf\n    collector: manual\n---\n")
        out, changed = self._apply(text)
        self.assertTrue(changed)
        self.assertEqual(str(self._entry(out)["collected"]), self.FRESH["collected"])

    def test_it_leaves_alone_an_entry_that_names_no_collector(self):
        text = ("---\nrequirements:\n- ref: '1.1'\n  evidence:\n"
                "  - name: A\n    url: https://old.example/a.pdf\n    collected: '2026-01-01'\n"
                "  - name: B\n    url: https://old.example/b.pdf\n    collected: '2026-02-02'\n"
                "    collector: manual\n---\n")
        out, _ = self._apply(text)
        self.assertEqual(self._entry(out, 0)["url"], "https://old.example/a.pdf")
        self.assertEqual(self._entry(out, 1)["url"], self.FRESH["url"])

    def test_it_keeps_one_kind_of_line_ending(self):
        """A file written on Windows must not come back half converted."""
        text = ("---\r\nrequirements:\r\n- ref: '1.1'\r\n  evidence:\r\n  - name: A\r\n"
                "    url: https://old.example/a.pdf\r\n    collected: '2026-01-01'\r\n"
                "    collector: manual\r\n---\r\n")
        out, changed = self._apply(text)
        self.assertTrue(changed)
        endings = {line.endswith("\r") for line in out.split("\n") if line}
        self.assertEqual(endings, {True}, "the rewrite left mixed line endings")

    def test_it_survives_indentation_nobody_else_uses(self):
        text = ("---\nrequirements:\n    - ref: '1.1'\n      evidence:\n"
                "          - name: A\n            url: https://old.example/a.pdf\n"
                "            collected: '2026-01-01'\n            collector: manual\n---\n")
        out, changed = self._apply(text)
        self.assertTrue(changed)
        self.assertEqual(self._entry(out)["url"], self.FRESH["url"])

    def test_a_name_with_a_colon_is_not_treated_as_a_key(self):
        text = ("---\nrequirements:\n- ref: '1.1'\n  evidence:\n"
                "  - name: 'Q3: the access review'\n    url: https://old.example/a.pdf\n"
                "    collected: '2026-01-01'\n    collector: manual\n---\n")
        out, _ = self._apply(text)
        self.assertEqual(self._entry(out)["name"], "Q3: the access review")
        self.assertEqual(self._entry(out)["url"], self.FRESH["url"])

    def test_it_reports_no_change_when_the_collector_returns_what_is_there(self):
        """Idempotence: running it twice must not produce a second diff."""
        text = ("---\nrequirements:\n- ref: '1.1'\n  evidence:\n  - name: A\n"
                f"    url: https://new.example/report.pdf\n    collected: '2026-09-21'\n"
                "    collector: manual\n---\n")
        out, changed = self._apply(text)
        self.assertFalse(changed, "nothing moved, so nothing should be rewritten")
        self.assertEqual(out, text)

    def test_an_entry_for_another_collector_is_not_touched(self):
        text = ("---\nrequirements:\n- ref: '1.1'\n  evidence:\n  - name: A\n"
                "    url: https://old.example/a.pdf\n    collector: somebody-else\n---\n")
        out, changed = self._apply(text)
        self.assertFalse(changed)
        self.assertEqual(out, text)


if __name__ == "__main__":
    unittest.main()
