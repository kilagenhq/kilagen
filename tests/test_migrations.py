"""Tests for the migration chain in kilagen.migrations.

There are no real migrations yet, so this is the only thing exercising the
logic that decides whether a program can be brought forward at all. Getting it
wrong means either refusing a valid upgrade or — much worse — applying half a
path and leaving content in a shape no version of the framework describes.

Run from the repository root:

    python3 -m unittest discover -s tests
"""

from __future__ import annotations

import unittest

from kilagen import migrations


def _step(name: str, from_version: int, to_version: int) -> migrations.Migration:
    def apply(program, dry_run):  # pragma: no cover - never run here
        return []
    return migrations.Migration(name=name, from_version=from_version,
                                to_version=to_version, apply=apply)


class BetweenTests(unittest.TestCase):
    def setUp(self):
        self._real_discover = migrations.discover

    def tearDown(self):
        migrations.discover = self._real_discover

    def _available(self, *steps):
        migrations.discover = lambda: list(steps)

    def test_no_migrations_means_no_path(self):
        self._available()
        self.assertEqual(migrations.between(1, 2), [])

    def test_already_current_needs_no_steps(self):
        self._available(_step("m001", 1, 2))
        self.assertEqual(migrations.between(2, 2), [])

    def test_single_step(self):
        step = _step("m001", 1, 2)
        self._available(step)
        self.assertEqual(migrations.between(1, 2), [step])

    def test_chains_consecutive_steps_in_order(self):
        first, second = _step("m001", 1, 2), _step("m002", 2, 3)
        self._available(second, first)  # discovery order must not matter
        self.assertEqual([m.name for m in migrations.between(1, 3)], ["m001", "m002"])

    def test_gap_in_the_chain_yields_nothing(self):
        # 1 -> 2 exists and 3 -> 4 exists, but nothing covers 2 -> 3. Returning
        # the first step alone would strand the content at an intermediate
        # version, so the whole path is refused.
        self._available(_step("m001", 1, 2), _step("m003", 3, 4))
        self.assertEqual(migrations.between(1, 4), [])

    def test_starts_from_the_declared_version_not_the_first_step(self):
        self._available(_step("m001", 1, 2), _step("m002", 2, 3))
        self.assertEqual([m.name for m in migrations.between(2, 3)], ["m002"])

    def test_a_step_spanning_versions_is_honoured(self):
        # A single step may cover more than one version bump.
        wide = _step("m001", 1, 3)
        self._available(wide)
        self.assertEqual(migrations.between(1, 3), [wide])

    def test_none_are_shipped_today(self):
        # Schema 1 is the first contract: every program is already at it. When
        # this starts failing, a migration has landed and it needs its own test.
        self.assertEqual(self._real_discover(), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
