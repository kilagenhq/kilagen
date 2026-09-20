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

from support import ProgramTestCase

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


if __name__ == "__main__":
    unittest.main()
