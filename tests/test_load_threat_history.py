"""Tests for keel_lib.load_threat_history().

Monkey-patches keel_lib._git to feed canned git output without touching a
real repo, then asserts the function's behavior on each documented branch:

  - Empty when git is unavailable (returns [] without raising).
  - Empty when git log returns nothing (no history yet).
  - Collapses no-op commits (same ranking yields one snapshot).
  - Skips commits where any file read fails (no partial snapshot).
  - Ignores threats missing the priority field (unranked, not error).
  - Warns and skips on malformed YAML in historical content.

Run from the repo root:

    python3 -m unittest keel.scripts.tests.test_load_threat_history

Or directly:

    python3 tests/test_load_threat_history.py
"""

from __future__ import annotations

import unittest


from kilagen.libs import keel_lib


def _doc(tid: str, *, priority=None, severity: str = "high", title: str | None = None) -> str:
    """Build minimal THR-*.md content, optionally with a priority field."""
    lines = [
        "---",
        f"id: {tid}",
        f'title: "{title or tid}"',
        "type: threat",
        "status: active",
        "domain: grc",
        "owner: role-ciso",
        f"severity: {severity}",
        "last_reviewed: 2026-01-01",
        "next_review: 2027-01-01",
    ]
    if priority is not None:
        lines.append(f"priority: {priority}")
        lines.append('priority_rationale: "test"')
    lines.append("---")
    lines.append(f"# {title or tid}")
    return "\n".join(lines) + "\n"


def _mock_git(responses: dict):
    """Build a fake _git that returns canned values keyed by command.

    Keys are either the git subcommand (``"log"``, ``"ls-tree"``) or
    ``f"show:{commit}:{path}"`` for per-file ``git show`` calls. Missing
    keys yield None, mirroring the real helper's failure mode.

    ``rev-parse`` defaults to a resolvable HEAD, since most tests describe a
    repository that has commits; pass it explicitly as None for an unborn one.
    """
    def fake_git(args, **_kwargs):
        if not args:
            return None
        cmd = args[0]
        if cmd == "show" and len(args) >= 2:
            return responses.get(f"show:{args[1]}")
        if cmd == "rev-parse":
            return responses.get("rev-parse", "0123456789abcdef\n")
        return responses.get(cmd)
    return fake_git


class TestLoadThreatHistory(unittest.TestCase):
    def setUp(self):
        self._real_git = keel_lib._git
        keel_lib._warnings = 0

    def tearDown(self):
        keel_lib._git = self._real_git

    def test_git_unavailable_returns_empty(self):
        keel_lib._git = lambda args, **_kwargs: None
        self.assertEqual(keel_lib.load_threat_history(), [])

    def test_unborn_head_returns_empty_without_warning(self):
        # A repository with no commits yet — the state right after
        # 'kilagen init'. There is no history to lose, so this must not warn:
        # warnings are fatal, and one here would fail the very first build.
        keel_lib._git = _mock_git({
            "rev-parse": None,
            "log": "aaa1111|2026-01-01T00:00:00+00:00\n",
        })
        self.assertEqual(keel_lib.load_threat_history(), [])
        self.assertEqual(keel_lib.get_warnings(), 0)

    def test_collapses_noop_commits(self):
        keel_lib._git = _mock_git({
            "log": "aaa1111|2026-01-01T00:00:00+00:00\nbbb2222|2026-02-01T00:00:00+00:00\n",
            "ls-tree": "program/01-grc/threats/THR-a.md\n",
            "show:aaa1111:program/01-grc/threats/THR-a.md": _doc("THR-a", priority=1),
            "show:bbb2222:program/01-grc/threats/THR-a.md": _doc("THR-a", priority=1),
        })
        snaps = keel_lib.load_threat_history()
        self.assertEqual(len(snaps), 1, f"expected 1 collapsed snapshot, got {len(snaps)}")
        self.assertEqual(snaps[0]["commit"], "aaa1111")

    def test_emits_snapshot_when_ranking_changes(self):
        keel_lib._git = _mock_git({
            "log": "aaa1111|2026-01-01T00:00:00+00:00\nbbb2222|2026-02-01T00:00:00+00:00\n",
            "ls-tree": "program/01-grc/threats/THR-a.md\nprogram/01-grc/threats/THR-b.md\n",
            "show:aaa1111:program/01-grc/threats/THR-a.md": _doc("THR-a", priority=1),
            "show:aaa1111:program/01-grc/threats/THR-b.md": _doc("THR-b", priority=2),
            "show:bbb2222:program/01-grc/threats/THR-a.md": _doc("THR-a", priority=2),
            "show:bbb2222:program/01-grc/threats/THR-b.md": _doc("THR-b", priority=1),
        })
        snaps = keel_lib.load_threat_history()
        self.assertEqual(len(snaps), 2)
        self.assertEqual(snaps[0]["threats"]["THR-a"]["priority"], 1)
        self.assertEqual(snaps[1]["threats"]["THR-a"]["priority"], 2)

    def test_skips_commit_on_partial_read(self):
        keel_lib._git = _mock_git({
            "log": "aaa1111|2026-01-01T00:00:00+00:00\n",
            "ls-tree": "program/01-grc/threats/THR-a.md\nprogram/01-grc/threats/THR-b.md\n",
            "show:aaa1111:program/01-grc/threats/THR-a.md": _doc("THR-a", priority=1),
            # THR-b deliberately absent — show returns None for it.
        })
        self.assertEqual(keel_lib.load_threat_history(), [])

    def test_ignores_threats_without_priority(self):
        keel_lib._git = _mock_git({
            "log": "aaa1111|2026-01-01T00:00:00+00:00\n",
            "ls-tree": "program/01-grc/threats/THR-a.md\nprogram/01-grc/threats/THR-b.md\n",
            "show:aaa1111:program/01-grc/threats/THR-a.md": _doc("THR-a", priority=1),
            "show:aaa1111:program/01-grc/threats/THR-b.md": _doc("THR-b"),
        })
        snaps = keel_lib.load_threat_history()
        self.assertEqual(len(snaps), 1)
        self.assertIn("THR-a", snaps[0]["threats"])
        self.assertNotIn("THR-b", snaps[0]["threats"])

    def test_warns_on_malformed_yaml(self):
        bad_doc = "---\n{ unbalanced\n---\n# x\n"
        keel_lib._git = _mock_git({
            "log": "aaa1111|2026-01-01T00:00:00+00:00\n",
            "ls-tree": "program/01-grc/threats/THR-a.md\n",
            "show:aaa1111:program/01-grc/threats/THR-a.md": bad_doc,
        })
        before = keel_lib.get_warnings()
        snaps = keel_lib.load_threat_history()
        self.assertEqual(snaps, [])
        self.assertGreater(keel_lib.get_warnings(), before)


if __name__ == "__main__":
    unittest.main()
