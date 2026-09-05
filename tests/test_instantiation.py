"""End-to-end tests against a real instance built from the real scaffold.

Everything else in this suite exercises a part in isolation, and the parts were
all green while `kilagen init` produced a program that failed its own first
`kilagen check`. The gap was that nothing ever instantiated the shipped seed
and ran the cycle against it, which is what these tests do.

They are the reason the example repository is not on the critical path: a
change to the framework is proven here, against the working tree, without
publishing anything.

Run from the repository root:

    python3 -m unittest discover -s tests
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

import jsonschema
import yaml

from kilagen import cli
from kilagen.libs import keel_lib

SEEDED_WORKFLOWS = cli.SCAFFOLD / "deployments" / "github" / ".github" / "workflows"
TEMPLATES = keel_lib.KEEL / "content" / "templates"

# A role and a standard that reference each other: the smallest program that
# exercises frontmatter validation, role resolution and both generators.
ROLE = """---
id: role-security-eng
title: "Security Engineering"
description: >
  Accountable for technical security controls and their evidence.
type: role
status: active
domain: grc
role_type: lead
team: security
reports_to: []
direct_reports: []
managed_externally: null
---

# Security Engineering

## Scope

Technical security controls.

## Owned artifacts
"""

STANDARD = """---
id: STD-access-control
title: "Access Control Standard"
description: >
  Minimum requirements for access to production systems.
type: standard
status: draft
domain: grc
owner: role-security-eng
version: "1.0"
approved_by: [role-security-eng]
reviewed_by: [role-security-eng]
last_reviewed: 2026-01-01
next_review: 2099-01-01
applies_to: []
requirements:
  - ref: "1.1"
    domains: []
related:
  policies: []
  standards: []
---

# Access Control Standard

## Purpose

Define the minimum controls for access to production systems.

## Requirements

1.1 Access is granted through an approved request.
"""


def _quiet(fn, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()) as out:
        with contextlib.redirect_stderr(io.StringIO()) as err:
            result = fn(*args, **kwargs)
    return result, out.getvalue() + err.getvalue()


def _repoint(root: Path) -> None:
    """Point every already-imported lib at `root`.

    The libs do ``from .keel_lib import REPO, PROGRAM``, which binds a value
    at import. One command in one process never notices — the program exists
    before the module loads. A test suite does: the first test to import a
    validator freezes that test's temporary directory into it, and the next
    test scans a directory that has since been deleted.

    Not a defect in the shipped tool, so it is corrected here rather than by
    rewriting forty-five call sites; see the note in the roadmap.
    """
    keel_lib.REPO, keel_lib.PROGRAM = root, root / "program"
    for name, module in list(sys.modules.items()):
        if not name.startswith("kilagen.libs"):
            continue
        for attribute, value in (("REPO", root), ("PROGRAM", root / "program"),
                                 ("SITE", root / "_site")):
            if hasattr(module, attribute):
                setattr(module, attribute, value)


class RealInstanceTests(unittest.TestCase):
    """`kilagen init` from the shipped scaffold, then the full cycle."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.instance = Path(self._tmp.name).resolve()
        self._cwd = os.getcwd()
        self._paths = (keel_lib.REPO, keel_lib.PROGRAM)
        os.chdir(self.instance)
        _repoint(self.instance)
        _quiet(cli.cmd_init, argparse.Namespace(
            name="Acme Corp", deployment="github", agent="claude", force=False))
        # init imports the generators, so re-apply after it has run.
        _repoint(self.instance)

    def tearDown(self):
        os.chdir(self._cwd)
        keel_lib.REPO, keel_lib.PROGRAM = self._paths
        self._tmp.cleanup()

    def _add_content(self):
        (self.instance / "program" / "roles" / "role-security-eng.md").write_text(ROLE)
        standards = self.instance / "program" / "01-grc" / "standards"
        standards.mkdir(parents=True, exist_ok=True)
        (standards / "STD-access-control.md").write_text(STANDARD)
        _quiet(cli.cmd_build, argparse.Namespace(target="artifacts"))

    def test_a_fresh_instance_passes_its_own_checks(self):
        # The line init prints is "run kilagen check". It has to be true.
        status, output = _quiet(cli.cmd_check, argparse.Namespace(target=[]))
        self.assertEqual(status, 0, output)

    def test_init_writes_the_artifacts_check_artifacts_expects(self):
        self.assertTrue((self.instance / "program" / "registry.md").is_file())
        self.assertTrue((self.instance / "program" / "01-grc" / "compliance"
                         / "coverage.yml").is_file())

    def test_the_full_cycle_runs_on_a_real_program(self):
        self._add_content()
        for command, args in (
            (cli.cmd_check, argparse.Namespace(target=[])),
            (cli.cmd_build, argparse.Namespace(target=None)),
            (cli.cmd_upgrade, argparse.Namespace(apply=False)),
        ):
            status, output = _quiet(command, args)
            self.assertEqual(status, 0, f"{command.__name__}: {output}")

    def test_build_produces_a_servable_site(self):
        self._add_content()
        _quiet(cli.cmd_build, argparse.Namespace(target=None))
        site = self.instance / "_site"
        # index.html is a redirect into dashboard/; Pages 404s a directory
        # with no index, so its absence would be invisible until deploy.
        for expected in ("index.html", "registry.json", ".nojekyll",
                         "dashboard/index.html"):
            self.assertTrue((site / expected).is_file(), expected)

    def test_nothing_generated_escapes_gitignore(self):
        ignored = (self.instance / ".gitignore").read_text().split()
        for pattern in ("_site/", "__pycache__/", "node_modules/"):
            self.assertIn(pattern, ignored)


class SeededWorkflowTests(unittest.TestCase):
    """The commands the seeded workflows run must exist and be installable.

    A workflow calling a verb the CLI does not have, or a tool nothing
    installs, only fails once someone has a repository on GitHub. Reading the
    commands out of the YAML keeps this honest: it checks the file that ships,
    not a copy of what it is believed to say.
    """

    def _run_steps(self):
        for path in sorted(SEEDED_WORKFLOWS.glob("*.yml")):
            workflow = yaml.safe_load(path.read_text())
            for job in (workflow.get("jobs") or {}).values():
                for step in job.get("steps") or []:
                    if "run" in step:
                        yield path.name, step.get("name", "?"), step["run"]

    def test_every_kilagen_verb_invoked_exists(self):
        verbs = set(cli.COMMANDS)
        for name, step, script in self._run_steps():
            for call in re.findall(r"^\s*kilagen\s+([a-z]+)(?:\s+([a-z]+))?",
                                   script, re.M):
                verb, target = call
                self.assertIn(verb, verbs, f"{name} / {step}")
                if verb == "check" and target:
                    self.assertIn(target, cli.CHECKS, f"{name} / {step}")

    def test_every_command_used_is_installed_by_an_earlier_step(self):
        for path in sorted(SEEDED_WORKFLOWS.glob("*.yml")):
            workflow = yaml.safe_load(path.read_text())
            for job in (workflow.get("jobs") or {}).values():
                installed = {"python", "pip", "npm", "git"}
                for step in job.get("steps") or []:
                    script = step.get("run")
                    if not script:
                        continue
                    if step.get("name", "").startswith("Install"):
                        # "pip install codespell==2.4.1" -> codespell
                        for pkg in re.findall(r"(?:pip|npm) install[^\n]*?"
                                              r"([A-Za-z][A-Za-z0-9_-]+)"
                                              r"(?:[=@<>][^\s\"']*)?\s*$",
                                              script, re.M):
                            installed.add(pkg)
                        if "kilagen" in script:
                            installed.add("kilagen")
                        continue
                    command = script.strip().split()[0]
                    self.assertIn(
                        command, installed,
                        f"{path.name} / {step.get('name')}: '{command}' is run "
                        f"but no earlier step installs it",
                    )


class ShippedTemplateTests(unittest.TestCase):
    """Filling in every placeholder must be enough to produce a valid document.

    Templates cannot validate as they ship — a domain of REPLACE-ME is not a
    domain — so the rule enforced here is narrower and is the one an author
    relies on: every field the schema rejects must visibly be a placeholder.
    A default like `owner: security-eng` breaks it, because nothing tells the
    author that value is wrong.
    """

    def setUp(self):
        schema = json.loads(
            (keel_lib.KEEL / "schemas" / "frontmatter.schema.json").read_text())
        self.validator = jsonschema.Draft202012Validator(schema)

    def test_no_template_names_a_document_that_will_not_exist(self):
        """Cross-references have to be placeholders too.

        The schema cannot see this one: `POL-information-security` is a
        perfectly well-formed policy id, so frontmatter validation passes and
        `kilagen check refs` then fails on a program that has no such policy —
        a first run that breaks on a value the author was never told to change.
        """
        pattern = re.compile(
            r"^(?:POL|STD|PRO|RB|PB|TM|THR|GL|SYS|VEN|RSK|ADR|INC|EXC|DA|BP)"
            r"-[A-Za-z0-9-]+$")

        def ids(value):
            """Every id-shaped string in a parsed frontmatter value."""
            if isinstance(value, str):
                return [value] if pattern.match(value) else []
            if isinstance(value, list):
                return [i for v in value for i in ids(v)]
            if isinstance(value, dict):
                return [i for v in value.values() for i in ids(v)]
            return []

        offenders = []
        for path in sorted(TEMPLATES.glob("*.md")):
            # Parsed, not grepped: an id named in a YAML comment is prose, and
            # a numeric segment (ADR-0000-REPLACE-ME) is still a placeholder.
            frontmatter = keel_lib.extract_frontmatter(path) or {}
            offenders += [f"{path.name}: {hit}" for hit in ids(frontmatter)
                          if "REPLACE" not in hit]
        self.assertEqual(offenders, [], "\n".join(offenders))

    def test_every_remaining_error_is_on_a_placeholder(self):
        offenders = []
        for path in sorted(TEMPLATES.glob("*.md")):
            fm = keel_lib.extract_frontmatter(path)
            if not fm or "type" not in fm:
                continue
            for error in self.validator.iter_errors(fm):
                for real in cli_branch_errors(error, fm):
                    if "REPLACE" not in json.dumps(real.instance, default=str):
                        field = "/".join(str(p) for p in real.path) or "(root)"
                        offenders.append(f"{path.name}: {field} — {real.message}")
        self.assertEqual(offenders, [], "\n".join(offenders))


def cli_branch_errors(error, fm):
    from kilagen.libs.validate_frontmatter import _branch_errors

    return _branch_errors(error, fm)


if __name__ == "__main__":
    unittest.main()
