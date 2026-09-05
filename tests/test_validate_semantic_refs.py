"""Tests for the role-ref and role-tree checks in validate_semantic_refs.py.

The validators are not an installed package yet, so we load them through
``importlib`` by path, together with the companion ``keel_lib`` module.

Run from the repo root:

    python3 -m unittest keel.scripts.tests.test_validate_semantic_refs

Or directly:

    python3 tests/test_validate_semantic_refs.py
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

# Load keel_lib and the validator as modules by path, so the tests do not
# depend on the package being installed.


from kilagen.libs import keel_lib
from kilagen.libs import validate_semantic_refs as vsr


ROLE_DOC_TEMPLATE = """\
---
id: {id}
title: "{title}"
description: "test"
type: role
status: active
domain: grc
role_type: lead
reports_to: {reports_to}
direct_reports: {direct_reports}
---
# {title}
"""

POLICY_DOC_TEMPLATE = """\
---
id: {id}
title: "{title}"
description: "test"
type: policy
status: active
domain: grc
owner: {owner}
approved_by: {approved_by}
last_reviewed: 2026-01-01
next_review: 2027-01-01
---
# {title}
"""


def _write_role(roles_dir: Path, rid: str, *, reports_to="[]", direct_reports="[]"):
    (roles_dir / f"{rid}.md").write_text(
        ROLE_DOC_TEMPLATE.format(id=rid, title=rid, reports_to=reports_to, direct_reports=direct_reports)
    )


def _write_policy(policies_dir: Path, pid: str, *, owner="role-cto", approved_by="[role-cto]"):
    (policies_dir / f"{pid}.md").write_text(
        POLICY_DOC_TEMPLATE.format(id=pid, title=pid, owner=owner, approved_by=approved_by)
    )


class CheckRoleRefTests(unittest.TestCase):
    """Direct tests of the pure ``_check_role_ref`` helper."""

    def setUp(self):
        self.role_ids = {"role-cto", "role-ceo"}

    def test_empty_string_skips_silently(self):
        errors: list = []
        vsr._check_role_ref(errors, Path("x.md"), "owner", "", self.role_ids)
        self.assertEqual(errors, [])

    def test_none_skips_silently(self):
        errors: list = []
        vsr._check_role_ref(errors, Path("x.md"), "owner", None, self.role_ids)
        self.assertEqual(errors, [])

    def test_known_slug_passes(self):
        errors: list = []
        vsr._check_role_ref(errors, Path("x.md"), "owner", "role-cto", self.role_ids)
        self.assertEqual(errors, [])

    def test_unknown_slug_errors(self):
        errors: list = []
        vsr._check_role_ref(errors, Path("x.md"), "owner", "role-typo", self.role_ids)
        self.assertEqual(len(errors), 1)
        self.assertIn("role-typo", errors[0])
        # The message has to name the path, because roles are found by
        # filename and "it does not exist" is false when it is simply
        # saved under another name.
        self.assertIn("program/roles/role-typo.md", errors[0])

    def test_non_string_value_is_shape_error(self):
        errors: list = []
        vsr._check_role_ref(errors, Path("x.md"), "owner", ["role-cto"], self.role_ids)
        self.assertEqual(len(errors), 1)
        self.assertIn("must be a string role slug", errors[0])
        self.assertIn("list", errors[0])


class FakeRepoMixin:
    """Test mixin that points the validator at a temporary repo layout.

    Both ``keel_lib.REPO`` and ``vsr.REPO`` are patched because the validator
    imports the constant by name (``from keel_lib import REPO``), so they're
    independent references after import.
    """

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        (self.repo / "program" / "roles").mkdir(parents=True)
        (self.repo / "program" / "01-grc" / "policies").mkdir(parents=True)
        self._orig_keel_repo = keel_lib.REPO
        self._orig_vsr_repo = vsr.REPO
        keel_lib.REPO = self.repo
        vsr.REPO = self.repo
        # Reset the warning counter so it doesn't bleed between tests.
        keel_lib._warnings = 0

    def tearDown(self):
        keel_lib.REPO = self._orig_keel_repo
        vsr.REPO = self._orig_vsr_repo
        self._tmp.cleanup()


class ValidateRoleRefsIntegrationTests(FakeRepoMixin, unittest.TestCase):
    def test_valid_refs_pass(self):
        roles = self.repo / "program" / "roles"
        policies = self.repo / "program" / "01-grc" / "policies"
        _write_role(roles, "role-cto")
        _write_policy(policies, "POL-1", owner="role-cto", approved_by="[role-cto]")
        role_ids = vsr.load_all_role_ids()
        errors = vsr.validate_role_refs(role_ids)
        self.assertEqual(errors, [], msg=f"unexpected errors: {errors}")

    def test_unknown_owner_is_reported(self):
        roles = self.repo / "program" / "roles"
        policies = self.repo / "program" / "01-grc" / "policies"
        _write_role(roles, "role-cto")
        _write_policy(policies, "POL-1", owner="role-typo", approved_by="[role-cto]")
        role_ids = vsr.load_all_role_ids()
        errors = vsr.validate_role_refs(role_ids)
        self.assertEqual(len(errors), 1)
        self.assertIn("role-typo", errors[0])

    def test_scalar_approved_by_is_shape_error(self):
        roles = self.repo / "program" / "roles"
        policies = self.repo / "program" / "01-grc" / "policies"
        _write_role(roles, "role-cto")
        # approved_by as bare scalar instead of list — was previously skipped
        # silently; now must be reported.
        _write_policy(policies, "POL-1", owner="role-cto", approved_by="role-cto")
        role_ids = vsr.load_all_role_ids()
        errors = vsr.validate_role_refs(role_ids)
        self.assertEqual(len(errors), 1, msg=f"errors: {errors}")
        self.assertIn("must be a list", errors[0])


class ValidateRoleTreeIntegrationTests(FakeRepoMixin, unittest.TestCase):
    def test_symmetric_tree_passes(self):
        roles = self.repo / "program" / "roles"
        _write_role(roles, "role-ceo", direct_reports="[role-cto]")
        _write_role(roles, "role-cto", reports_to="[role-ceo]")
        errors = vsr.validate_role_tree()
        self.assertEqual(errors, [], msg=f"unexpected: {errors}")

    def test_asymmetric_tree_is_reported(self):
        roles = self.repo / "program" / "roles"
        # role-cto says it reports to role-ceo, but role-ceo doesn't list
        # role-cto as a direct report.
        _write_role(roles, "role-ceo")
        _write_role(roles, "role-cto", reports_to="[role-ceo]")
        errors = vsr.validate_role_tree()
        self.assertEqual(len(errors), 1, msg=f"errors: {errors}")
        self.assertIn("role-cto", errors[0])
        self.assertIn("role-ceo", errors[0])

    def test_scalar_reports_to_is_shape_error(self):
        roles = self.repo / "program" / "roles"
        # reports_to as scalar instead of list — was previously coerced to []
        # silently; now must be reported.
        (roles / "role-cto.md").write_text(
            ROLE_DOC_TEMPLATE.format(
                id="role-cto", title="role-cto",
                reports_to="role-ceo",  # bare scalar
                direct_reports="[]",
            )
        )
        errors = vsr.validate_role_tree()
        # There may be additional bidirectional errors triggered by the
        # coerced-empty list, but the shape error is the key signal.
        shape_errors = [e for e in errors if "must be a list" in e]
        self.assertEqual(len(shape_errors), 1, msg=f"errors: {errors}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
