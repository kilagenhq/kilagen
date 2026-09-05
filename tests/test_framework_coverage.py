"""Tests for the lean framework-coverage helpers in keel_lib.py.

The lean model keeps the existing requirement `frameworks: {id: [clauses]}` maps
and adds three helpers:

  * load_framework_vocab    — program/frameworks/<id>.yml -> {id: [clause refs]}
  * scan_framework_mappings — STD requirements' frameworks: -> [{std_id,ref,fw,clause}]
  * compute_coverage_map    — classify each in-scope clause mapped/unmapped

Run from the repo root:

    python3 -m unittest keel.scripts.tests.test_framework_coverage
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path


from kilagen.libs import keel_lib


class LoadFrameworkVocabTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        keel_lib._warnings = 0

    def tearDown(self):
        self._tmp.cleanup()

    def _write(self, name, body):
        (self.dir / name).write_text(body, encoding="utf-8")

    def test_keyed_by_filename_stem_clause_ref_lists(self):
        self._write("nist_csf.yml", "clauses:\n  - '13.1'\n  - '9.5'\n")
        self._write("iso_27001.yml", "clauses:\n  - 'A.8.3'\n")
        vocab = keel_lib.load_framework_vocab(self.dir)
        self.assertEqual(set(vocab), {"nist_csf", "iso_27001"})
        self.assertEqual(vocab["nist_csf"], ["13.1", "9.5"])

    def test_missing_directory_returns_empty(self):
        self.assertEqual(keel_lib.load_framework_vocab(self.dir / "nope"), {})

    def test_file_without_clauses_yields_empty_list(self):
        self._write("empty.yml", "# nothing\n")
        self.assertEqual(keel_lib.load_framework_vocab(self.dir), {"empty": []})

    def test_clause_refs_are_strings(self):
        # YAML may coerce 4 -> int; vocab must hold strings to match map clauses.
        self._write("soc2.yml", "clauses:\n  - 4\n  - 5\n")
        self.assertEqual(keel_lib.load_framework_vocab(self.dir)["soc2"], ["4", "5"])


STD_TEMPLATE = """\
---
id: {sid}
title: "t"
type: standard
status: active
domain: grc
requirements:
{reqs}
---
# {sid}
"""


class ScanFrameworkMappingsTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        keel_lib._warnings = 0

    def tearDown(self):
        self._tmp.cleanup()

    def _write_std(self, sid, reqs_yaml):
        (self.dir / f"{sid}.md").write_text(
            STD_TEMPLATE.format(sid=sid, reqs=reqs_yaml), encoding="utf-8")

    def test_one_record_per_framework_clause(self):
        self._write_std("STD-a",
                        "  - ref: \"1.1\"\n"
                        "    frameworks:\n"
                        "      nist_csf: [\"13.1\"]\n"
                        "      soc2: [\"IV.2\"]\n"
                        "  - ref: \"1.2\"\n"
                        "    frameworks:\n"
                        "      nist_csf: [\"9.1\"]\n"
                        "  - ref: \"1.3\"\n")
        records = keel_lib.scan_framework_mappings(self.dir)
        quads = {(r["std_id"], r["ref"], r["fw"], r["clause"]) for r in records}
        self.assertEqual(quads, {
            ("STD-a", "1.1", "nist_csf", "13.1"),
            ("STD-a", "1.1", "soc2", "IV.2"),
            ("STD-a", "1.2", "nist_csf", "9.1"),
        })

    def test_requirement_without_frameworks_emits_nothing(self):
        self._write_std("STD-b", "  - ref: \"1.1\"\n")
        self.assertEqual(keel_lib.scan_framework_mappings(self.dir), [])


class ComputeCoverageMapTests(unittest.TestCase):
    def setUp(self):
        self.vocab = {
            "nist_csf": ["9.5", "13.1"],
            "iso_27001": ["A.8.3"],
        }

    def test_mapped_and_unmapped_with_posture(self):
        cov = keel_lib.compute_coverage_map(
            ["nist_csf"], self.vocab, {"nist_csf": {"13.1"}})
        self.assertEqual(set(cov), {"nist_csf"})
        self.assertEqual(cov["nist_csf"]["13.1"], {"coverage": "mapped"})
        self.assertEqual(cov["nist_csf"]["9.5"],
                         {"coverage": "unmapped", "posture": "not-assessed"})

    def test_posture_only_on_unmapped(self):
        cov = keel_lib.compute_coverage_map(["nist_csf"], self.vocab, {"nist_csf": {"13.1"}})
        self.assertNotIn("posture", cov["nist_csf"]["13.1"])

    def test_clauses_sorted_by_ref(self):
        cov = keel_lib.compute_coverage_map(["nist_csf"], self.vocab, {})
        self.assertEqual(list(cov["nist_csf"]), ["13.1", "9.5"])

    def test_in_scope_without_vocab_skipped(self):
        self.assertEqual(keel_lib.compute_coverage_map(["soc2"], self.vocab, {}), {})

    def test_vocab_not_in_scope_skipped(self):
        cov = keel_lib.compute_coverage_map(["nist_csf"], self.vocab, {})
        self.assertNotIn("iso_27001", cov)


class ConfigFrameworkIdsTests(unittest.TestCase):
    def test_returns_ids_in_order(self):
        cfg = {"frameworks": [{"id": "nist_csf"}, {"id": "iso_27001"}]}
        self.assertEqual(keel_lib.config_framework_ids(cfg), ["nist_csf", "iso_27001"])

    def test_missing_frameworks_key(self):
        self.assertEqual(keel_lib.config_framework_ids({"name": "x"}), [])

    def test_entry_without_id_skipped(self):
        cfg = {"frameworks": [{"name": "no id"}, {"id": "ok"}]}
        self.assertEqual(keel_lib.config_framework_ids(cfg), ["ok"])

    def test_non_dict_entry_skipped(self):
        cfg = {"frameworks": ["bare", {"id": "ok"}]}
        self.assertEqual(keel_lib.config_framework_ids(cfg), ["ok"])


class VocabWarnTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        keel_lib._warnings = 0

    def tearDown(self):
        keel_lib._warnings = 0
        self._tmp.cleanup()

    def _write(self, name, body):
        (self.dir / name).write_text(body, encoding="utf-8")

    def test_non_string_clause_warns_but_still_loads(self):
        # Unquoted 13.6 parses as a float; warn yet still load it as "13.6".
        self._write("nist_csf.yml", "clauses:\n  - 13.6\n  - '9.1'\n")
        vocab = keel_lib.load_framework_vocab(self.dir)
        self.assertEqual(vocab["nist_csf"], ["13.6", "9.1"])
        self.assertEqual(keel_lib.get_warnings(), 1)

    def test_malformed_yaml_warns_and_skips(self):
        self._write("good.yml", "clauses:\n  - '1.1'\n")
        self._write("bad.yml", "clauses: [unclosed\n")
        vocab = keel_lib.load_framework_vocab(self.dir)
        self.assertIn("good", vocab)
        self.assertNotIn("bad", vocab)
        self.assertGreaterEqual(keel_lib.get_warnings(), 1)

    def test_top_level_list_warns_and_skips(self):
        # A bare YAML sequence at the top level would crash .get(); must warn
        # and degrade to an empty vocab, not raise.
        self._write("nist_csf.yml", "- '1.1'\n- '1.2'\n")
        vocab = keel_lib.load_framework_vocab(self.dir)
        self.assertEqual(vocab["nist_csf"], [])
        self.assertEqual(keel_lib.get_warnings(), 1)

    def test_non_list_clauses_warns_and_skips(self):
        # clauses: as a string would be iterated char-by-char, fabricating
        # phantom clauses; must warn and skip instead.
        self._write("nist_csf.yml", "clauses: '3.3'\n")
        vocab = keel_lib.load_framework_vocab(self.dir)
        self.assertEqual(vocab["nist_csf"], [])
        self.assertEqual(keel_lib.get_warnings(), 1)


class MappingWarnTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        keel_lib._warnings = 0

    def tearDown(self):
        keel_lib._warnings = 0
        self._tmp.cleanup()

    def _write_std(self, sid, reqs_yaml):
        (self.dir / f"{sid}.md").write_text(
            STD_TEMPLATE.format(sid=sid, reqs=reqs_yaml), encoding="utf-8")

    def test_scalar_clause_normalized_to_single_record(self):
        self._write_std("STD-a",
                        "  - ref: \"1.1\"\n"
                        "    frameworks:\n"
                        "      nist_csf: \"13.1\"\n")
        records = keel_lib.scan_framework_mappings(self.dir)
        self.assertEqual([(r["fw"], r["clause"]) for r in records],
                         [("nist_csf", "13.1")])
        self.assertEqual(keel_lib.get_warnings(), 0)

    def test_non_dict_frameworks_warns_and_skips(self):
        self._write_std("STD-b",
                        "  - ref: \"1.1\"\n"
                        "    frameworks: \"oops\"\n")
        records = keel_lib.scan_framework_mappings(self.dir)
        self.assertEqual(records, [])
        self.assertEqual(keel_lib.get_warnings(), 1)

    def test_non_list_non_string_clause_value_warns_and_skips(self):
        # A framework value that is a mapping (not a list or scalar string)
        # must warn and be skipped, not silently coerced into garbage records.
        self._write_std("STD-c",
                        "  - ref: \"1.1\"\n"
                        "    frameworks:\n"
                        "      nist_csf:\n"
                        "        nested: 1\n")
        records = keel_lib.scan_framework_mappings(self.dir)
        self.assertEqual(records, [])
        self.assertEqual(keel_lib.get_warnings(), 1)


class DeterminismTests(unittest.TestCase):
    """The CI staleness guard (regenerate + git diff) relies on byte-stable output."""

    def setUp(self):
        self.vocab = {"nist_csf": ["13.1", "9.5", "3.3"]}

    def test_compute_coverage_map_is_order_independent(self):
        inbound_a = {"nist_csf": {"13.1", "3.3"}}
        cov1 = keel_lib.compute_coverage_map(["nist_csf"], self.vocab, inbound_a)
        cov2 = keel_lib.compute_coverage_map(["nist_csf"], self.vocab, inbound_a)
        # Same inputs -> identical key order and content (stable lexicographic).
        self.assertEqual(list(cov1["nist_csf"]), list(cov2["nist_csf"]))
        self.assertEqual(list(cov1["nist_csf"]), ["13.1", "3.3", "9.5"])

    def test_render_coverage_yaml_is_idempotent(self):
        from kilagen.libs import generate_coverage as gen
        cov = keel_lib.compute_coverage_map(
            ["nist_csf"], self.vocab, {"nist_csf": {"13.1"}})
        self.assertEqual(gen.render_coverage_yaml(cov), gen.render_coverage_yaml(cov))


class ResetWarningsTests(unittest.TestCase):
    def test_reset_zeroes_counter(self):
        keel_lib._warn("noise")
        self.assertGreaterEqual(keel_lib.get_warnings(), 1)
        keel_lib.reset_warnings()
        self.assertEqual(keel_lib.get_warnings(), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
