"""Tests for the upgrade classification in kilagen.cli.

Three hashes decide what happens to each copied file — what is on disk, what
the manifest recorded, and what the package holds now — and getting that wrong
means either silently overwriting a user's work or never updating anything.
These build a fake scaffold in a temp directory so the real one is untouched.

Run from the repository root:

    python3 -m unittest discover -s tests
"""

from __future__ import annotations

import argparse
import contextlib
import io
import os
import tempfile
import unittest
from pathlib import Path

import yaml

from kilagen import cli


def _args(**kwargs) -> argparse.Namespace:
    return argparse.Namespace(**kwargs)


def _quiet(fn, *args, **kwargs):
    """Run a command, swallowing the report it prints for the user."""
    with contextlib.redirect_stdout(io.StringIO()) as out:
        result = fn(*args, **kwargs)
    return result, out.getvalue()


class _ScaffoldFixture(unittest.TestCase):
    """A minimal scaffold and an instance initialised from it."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)

        self.scaffold = root / "scaffold"
        base = self.scaffold / "base"
        base.mkdir(parents=True)
        (base / "alpha.txt").write_text("alpha v1\n")
        (base / "beta.txt").write_text("beta v1\n")
        deployment = self.scaffold / "deployments" / "plain"
        deployment.mkdir(parents=True)
        (deployment / "ci.yml").write_text("ci v1\n")
        # Documentation for the option itself; must never reach the instance.
        (deployment / "README.md").write_text("about this deployment\n")
        engine = self.scaffold / "engines" / "none"
        engine.mkdir(parents=True)
        (engine / "engine.yml").write_text("name: None\n")

        self._real_scaffold = cli.SCAFFOLD
        cli.SCAFFOLD = self.scaffold

        self.instance = root / "instance"
        self.instance.mkdir()
        self._cwd = os.getcwd()
        os.chdir(self.instance)
        _quiet(cli.cmd_init,
               _args(name="Test", deployment="plain", agent="none", force=False))

    def tearDown(self):
        os.chdir(self._cwd)
        cli.SCAFFOLD = self._real_scaffold
        self._tmp.cleanup()

    def _manifest(self) -> dict:
        return yaml.safe_load((self.instance / cli.MANIFEST_NAME).read_text())

    def _release(self, rel: str, content: str) -> None:
        """Simulate a new framework release changing a shipped file."""
        (self.scaffold / "base" / rel).write_text(content)


class InitTests(_ScaffoldFixture):
    def test_option_readme_is_not_copied(self):
        self.assertFalse((self.instance / "README.md").exists())

    def test_manifest_records_every_copied_file(self):
        recorded = set(self._manifest()["files"])
        self.assertEqual(recorded, {"alpha.txt", "beta.txt", "ci.yml"})

    def test_program_layer_is_absent_from_the_manifest(self):
        # program/ is the user's; upgrade must never consider it.
        self.assertTrue((self.instance / "program" / "config.yml").is_file())
        self.assertFalse(any(f.startswith("program/") for f in self._manifest()["files"]))


class UpgradeTests(_ScaffoldFixture):
    def test_untouched_file_is_updated(self):
        self._release("alpha.txt", "alpha v2\n")
        _quiet(cli.cmd_upgrade, _args(apply=True))
        self.assertEqual((self.instance / "alpha.txt").read_text(), "alpha v2\n")

    def test_edited_file_is_left_alone(self):
        (self.instance / "alpha.txt").write_text("mine\n")
        self._release("alpha.txt", "alpha v2\n")
        _quiet(cli.cmd_upgrade, _args(apply=True))
        self.assertEqual((self.instance / "alpha.txt").read_text(), "mine\n")

    def test_edited_file_stays_edited_after_an_unrelated_upgrade(self):
        # Regression: rewriting the manifest used to re-hash every file from
        # disk, recording the user's edit as if the framework had written it.
        # The next upgrade then saw an untouched file and overwrote the work.
        (self.instance / "alpha.txt").write_text("mine\n")
        self._release("beta.txt", "beta v2\n")
        _quiet(cli.cmd_upgrade, _args(apply=True))

        self._release("alpha.txt", "alpha v2\n")
        _quiet(cli.cmd_upgrade, _args(apply=True))
        self.assertEqual((self.instance / "alpha.txt").read_text(), "mine\n")

    def test_new_file_in_a_release_is_added(self):
        (self.scaffold / "base" / "gamma.txt").write_text("gamma v1\n")
        _quiet(cli.cmd_upgrade, _args(apply=True))
        self.assertEqual((self.instance / "gamma.txt").read_text(), "gamma v1\n")
        self.assertIn("gamma.txt", self._manifest()["files"])

    def test_reports_without_writing_by_default(self):
        self._release("alpha.txt", "alpha v2\n")
        _quiet(cli.cmd_upgrade, _args(apply=False))
        self.assertEqual((self.instance / "alpha.txt").read_text(), "alpha v1\n")

    def test_deleted_file_is_not_restored(self):
        (self.instance / "beta.txt").unlink()
        _quiet(cli.cmd_upgrade, _args(apply=True))
        self.assertFalse((self.instance / "beta.txt").exists())

    def test_a_newer_instance_is_not_downgraded(self):
        # An older release would see every file as outdated and replace it
        # with its own older copy, which reads as an upgrade and is not one.
        manifest = self.instance / cli.MANIFEST_NAME
        manifest.write_text(
            manifest.read_text().replace(f"kilagen_version: {cli.__version__}",
                                         "kilagen_version: 99.0.0"))
        with self.assertRaises(cli.CommandError) as caught:
            cli.cmd_upgrade(_args(apply=True))
        self.assertIn("downgrade", str(caught.exception))

    def test_upgrade_outside_an_instance_is_refused(self):
        (self.instance / cli.MANIFEST_NAME).unlink()
        with self.assertRaises(cli.CommandError):
            cli.cmd_upgrade(_args(apply=False))


if __name__ == "__main__":
    unittest.main(verbosity=2)


class SeedContainmentTests(unittest.TestCase):
    """Nothing the seed plan names may be written outside the destination."""

    def test_a_traversing_entry_is_refused(self):
        from kilagen.cli import CommandError, _write_plan

        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "instance"
            dest.mkdir()
            source = Path(tmp) / "payload.txt"
            source.write_text("x", encoding="utf-8")
            with self.assertRaises(CommandError):
                _write_plan({Path("../escaped.txt"): source}, dest)
            self.assertFalse((Path(tmp) / "escaped.txt").exists())

    def test_an_absolute_entry_is_refused(self):
        from kilagen.cli import CommandError, _write_plan

        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "instance"
            dest.mkdir()
            source = Path(tmp) / "payload.txt"
            source.write_text("x", encoding="utf-8")
            outside = Path(tmp) / "absolute.txt"
            with self.assertRaises(CommandError):
                _write_plan({Path(outside): source}, dest)
            self.assertFalse(outside.exists())

    def test_an_ordinary_entry_still_lands(self):
        from kilagen.cli import _write_plan

        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "instance"
            dest.mkdir()
            source = Path(tmp) / "payload.txt"
            source.write_text("x", encoding="utf-8")
            _write_plan({Path("nested/file.txt"): source}, dest)
            self.assertEqual((dest / "nested" / "file.txt").read_text(), "x")


class NewDocumentTests(unittest.TestCase):
    """`kilagen new` against a real instance: the template, in the right place."""

    def setUp(self):
        from kilagen.libs import keel_lib

        self._tmp = tempfile.TemporaryDirectory()
        self.instance = Path(self._tmp.name).resolve()
        self._cwd = os.getcwd()
        self._paths = (keel_lib.REPO, keel_lib.PROGRAM)
        self.addCleanup(lambda: (os.chdir(self._cwd),
                                 setattr(keel_lib, "REPO", self._paths[0]),
                                 setattr(keel_lib, "PROGRAM", self._paths[1]),
                                 self._tmp.cleanup()))
        os.chdir(self.instance)
        keel_lib.REPO, keel_lib.PROGRAM = self.instance, self.instance / "program"
        _quiet(cli.cmd_init, _args(name="Acme", deployment="none", agent="none", force=False))
        keel_lib.REPO, keel_lib.PROGRAM = self.instance, self.instance / "program"

    def _new(self, doc_type, slug):
        return _quiet(cli.cmd_new, _args(type=doc_type, slug=slug))

    def test_it_lands_in_the_type_folder_with_a_coherent_id(self):
        self._new("standard", "encryption-at-rest")
        written = self.instance / "program" / "standards" / "std-encryption-at-rest.md"
        self.assertTrue(written.is_file())
        self.assertIn("id: std-encryption-at-rest", written.read_text(encoding="utf-8"))

    def test_a_dated_type_gets_this_year(self):
        from datetime import date

        self._new("gap", "tls-legacy")
        expected = (self.instance / "program" / "gaps" / str(date.today().year)
                    / "gap-tls-legacy.md")
        self.assertTrue(expected.is_file())

    def test_the_dates_are_anchored_to_today(self):
        from datetime import date

        self._new("policy", "acceptable-use")
        text = (self.instance / "program" / "policies" / "pol-acceptable-use.md").read_text()
        self.assertIn(f"last_reviewed: {date.today().isoformat()}", text)

    def test_an_unknown_type_lists_the_ones_that_exist(self):
        with self.assertRaises(cli.CommandError) as caught:
            self._new("memo", "x")
        self.assertIn("standard", str(caught.exception))

    def test_a_slug_that_is_not_a_slug_is_refused(self):
        with self.assertRaises(cli.CommandError):
            self._new("policy", "Acceptable Use")

    def test_it_refuses_to_overwrite(self):
        self._new("policy", "acceptable-use")
        with self.assertRaises(cli.CommandError) as caught:
            self._new("policy", "acceptable-use")
        self.assertIn("already exists", str(caught.exception))
