"""The two update verbs, exercised against a real instance.

`test_cli.py` covers the upgrade *classification* against a fake scaffold and
`test_migrations.py` covers migration *selection* with synthetic steps. Neither
runs the verbs, so until now `kilagen update content` had no coverage at all:
the version gate, the clean-tree requirement, the schema_version rewrite and
idempotence were only ever verified by hand.

The migration used here is injected, never shipped. `keel/migrations/` stays
empty because schema 1 is the first contract — a real one arriving is the
event that makes this test's fixture redundant, not wrong.

Run from the repository root:

    python3 -m unittest discover -s tests
"""

from __future__ import annotations

import argparse
import contextlib
import io
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml

import kilagen
from kilagen import cli, migrations
from kilagen.libs import keel_lib


def _quiet(fn, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()) as out:
        with contextlib.redirect_stderr(io.StringIO()) as err:
            result = fn(*args, **kwargs)
    return result, out.getvalue() + err.getvalue()


def _git(*args, cwd=None):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


class MigrateTests(unittest.TestCase):
    """`kilagen update content` against a program that is a schema behind."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.instance = Path(self._tmp.name).resolve()
        self._cwd = os.getcwd()
        self._paths = (keel_lib.REPO, keel_lib.PROGRAM)
        os.chdir(self.instance)
        keel_lib.REPO, keel_lib.PROGRAM = self.instance, self.instance / "program"

        _git("init", "-q", "-b", "main", ".", cwd=self.instance)
        _git("config", "user.email", "test@example.com", cwd=self.instance)
        _git("config", "user.name", "Test", cwd=self.instance)
        _quiet(cli.cmd_init, argparse.Namespace(
            name="Acme", deployment="none", agent="none", force=False))
        keel_lib.REPO, keel_lib.PROGRAM = self.instance, self.instance / "program"
        _git("add", "-A", cwd=self.instance)
        _git("commit", "-qm", "initial", cwd=self.instance)

        # A release that moves the contract forward, and the step that gets a
        # program there. Both are undone in tearDown.
        self.applied = []
        step = migrations.Migration(
            name="m002_test", from_version=1, to_version=2,
            apply=lambda program, dry_run: self._step(program, dry_run))
        self._real_discover = migrations.discover
        migrations.discover = lambda: [step]
        self._real_schema = kilagen.SCHEMA_VERSION
        kilagen.SCHEMA_VERSION = cli.SCHEMA_VERSION = 2

    def _step(self, program: Path, dry_run: bool) -> list[str]:
        marker = program / "migrated.txt"
        if marker.exists():
            return []                      # idempotent, as a migration must be
        if not dry_run:
            marker.write_text("schema 2\n")
            self.applied.append("wrote")
        return ["migrated.txt: created"]

    def tearDown(self):
        migrations.discover = self._real_discover
        kilagen.SCHEMA_VERSION = cli.SCHEMA_VERSION = self._real_schema
        os.chdir(self._cwd)
        keel_lib.REPO, keel_lib.PROGRAM = self._paths
        self._tmp.cleanup()

    def _config(self) -> dict:
        return yaml.safe_load((self.instance / "program" / "config.yml").read_text())

    def test_check_blocks_and_names_the_command_to_run(self):
        # The block is the only thing that tells a user a migration is due, so
        # the message has to carry the command. main() turns this into exit 2.
        with self.assertRaises(cli.CommandError) as caught:
            _quiet(cli.cmd_check, argparse.Namespace(target=[]))
        self.assertIn("kilagen update content", str(caught.exception))
        self.assertEqual(cli.main(["check"]), 2)

    def test_dry_run_reports_without_writing(self):
        status, output = _quiet(cli.cmd_migrate, argparse.Namespace(apply=False))
        self.assertEqual(status, 0)
        self.assertIn("migrated.txt", output)
        self.assertEqual(self.applied, [])
        self.assertFalse((self.instance / "program" / "migrated.txt").exists())
        self.assertEqual(self._config()["schema_version"], 1)

    def test_apply_is_refused_while_the_tree_is_dirty(self):
        """The diff is the review, so it must not be mixed with other work."""
        (self.instance / "scratch.txt").write_text("uncommitted\n")
        with self.assertRaises(cli.CommandError) as caught:
            _quiet(cli.cmd_migrate, argparse.Namespace(apply=True))
        self.assertIn("uncommitted changes", str(caught.exception))
        self.assertEqual(self._config()["schema_version"], 1)

    def test_apply_migrates_and_stamps_the_new_version(self):
        status, _ = _quiet(cli.cmd_migrate, argparse.Namespace(apply=True))
        self.assertEqual(status, 0)
        self.assertTrue((self.instance / "program" / "migrated.txt").is_file())
        self.assertEqual(self._config()["schema_version"], 2)

    def test_running_it_twice_is_a_no_op(self):
        _quiet(cli.cmd_migrate, argparse.Namespace(apply=True))
        status, output = _quiet(cli.cmd_migrate, argparse.Namespace(apply=True))
        self.assertEqual(status, 0)
        self.assertIn("Nothing to migrate", output)
        self.assertEqual(self.applied, ["wrote"])

    def test_a_program_ahead_of_the_framework_is_refused(self):
        """Downgrading someone's content is worse than refusing to run."""
        config = self.instance / "program" / "config.yml"
        config.write_text(config.read_text().replace("schema_version: 1", "schema_version: 3"))
        with self.assertRaises(cli.CommandError) as caught:
            _quiet(cli.cmd_migrate, argparse.Namespace(apply=True))
        self.assertIn("pip install -U kilagen", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
