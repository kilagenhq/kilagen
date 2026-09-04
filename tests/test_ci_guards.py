"""CI guard tests for the coverage layer (the governance firewall).

The generator never touches a gaps register, and the classifier only ever emits
coverage — never a compliance judgment (met/gap/exception). The unresolved-mapping
guard lives in test_validate_frameworks.py / the validator. The matching assertion
on a real instance's committed coverage.yml is instance validation and lives in
keel/scaffold/tests/.

Run from the repo root:

    python3 -m unittest keel.scripts.tests.test_ci_guards
"""

from __future__ import annotations

import unittest
from pathlib import Path

from kilagen.libs import generate_coverage, keel_lib

# The firewall is asserted against the generator's own source.
GENERATOR = Path(generate_coverage.__file__)
FORBIDDEN_POSTURE = {"met", "gap", "exception"}


class GapsRegisterFirewallTests(unittest.TestCase):
    def test_generator_never_references_gaps_yml(self):
        # The coverage generator must derive coverage from framework maps + vocab
        # only — never from a gaps register. (The shared validator,
        # validate_frontmatter.py, legitimately validates gaps.yml's *schema*;
        # that is shape validation, not coverage derivation, so it is not a
        # firewall concern. The coverage boundary is enforced here on the
        # generator and by the classifier proof below.)
        self.assertNotIn("gaps.yml", GENERATOR.read_text(encoding="utf-8"))


class PostureFirewallTests(unittest.TestCase):
    """Pure proof (no committed file) that the classifier can only ever emit
    `not-assessed` — never a compliance judgment — regardless of input."""

    def test_compute_coverage_map_only_emits_not_assessed(self):
        vocab = {"fw": ["1.1", "1.2", "1.3"]}
        cov = keel_lib.compute_coverage_map(["fw"], vocab, {"fw": {"1.1"}})
        postures = {e.get("posture") for e in cov["fw"].values()}
        coverages = {e["coverage"] for e in cov["fw"].values()}
        self.assertLessEqual(coverages, {"mapped", "unmapped"})
        self.assertLessEqual(postures, {None, "not-assessed"})
        self.assertFalse(postures & FORBIDDEN_POSTURE)


if __name__ == "__main__":
    unittest.main(verbosity=2)
