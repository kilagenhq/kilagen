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
from unittest import mock

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
type: role
title: "Security Engineering"
description: >
  Accountable for technical security controls and their evidence.
status: active
owner: role-security-eng
domains: [grc]
role_type: individual
last_reviewed: 2026-01-01
next_review: 2099-01-01
---

# Security Engineering

Technical security controls.
"""

STANDARD = """---
id: std-production-access
type: standard
title: "Production Access Standard"
description: >
  Minimum requirements for access to production systems.
status: draft
owner: role-security-eng
version: "1.0"
domains: [iam]
approved_by: [role-security-eng]
last_reviewed: 2026-01-01
next_review: 2099-01-01
requirements:
  - ref: "1.1"
    text: Access is granted through an approved request.
---

# Production Access Standard

Define the minimum controls for access to production systems.
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
    rewriting every call site; the libs are single-command processes in real use.
    """
    keel_lib.REPO, keel_lib.PROGRAM = root, root / "program"
    keel_lib.MODEL = root / "program" / "model"
    for name, module in list(sys.modules.items()):
        if not name.startswith("kilagen.libs"):
            continue
        for attribute, value in (("REPO", root), ("PROGRAM", root / "program"),
                                 ("MODEL", root / "program" / "model")):
            if hasattr(module, attribute):
                setattr(module, attribute, value)


class RealInstanceTests(unittest.TestCase):
    """`kilagen init` from the shipped scaffold, then the full cycle."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.instance = Path(self._tmp.name).resolve()
        self._cwd = os.getcwd()
        self._paths = (keel_lib.REPO, keel_lib.PROGRAM, keel_lib.MODEL)
        os.chdir(self.instance)
        _repoint(self.instance)
        _quiet(cli.cmd_init, argparse.Namespace(
            name="Acme Corp", deployment="github", agent="claude", force=False))
        # init imports the generators, so re-apply after it has run.
        _repoint(self.instance)

    def tearDown(self):
        os.chdir(self._cwd)
        keel_lib.REPO, keel_lib.PROGRAM, keel_lib.MODEL = self._paths
        self._tmp.cleanup()

    def _add_content(self):
        program = self.instance / "program"
        (program / "roles" / "role-security-eng.md").write_text(ROLE)
        (program / "standards" / "std-production-access.md").write_text(STANDARD)
        _quiet(cli.cmd_build, argparse.Namespace(target="artifacts"))

    def test_a_fresh_instance_passes_its_own_checks(self):
        # The line init prints is "run kilagen check". It has to be true.
        status, output = _quiet(cli.cmd_check, argparse.Namespace(target=[]))
        self.assertEqual(status, 0, output)

    def test_init_writes_a_readme_about_the_structure_not_the_contents(self):
        readme = (self.instance / "program" / "README.md").read_text(encoding="utf-8")
        self.assertIn("A folder names a **document type**", readme)
        self.assertIn("kilagen new standard", readme)
        # A list of documents would be stale the day after it was written.
        self.assertNotIn("pol-information-security", readme)

    def test_init_generates_no_committed_artifacts(self):
        # A content change must not oblige anyone to regenerate a file. The
        # index is the dashboard; nothing under program/ is written by build.
        program = self.instance / "program"
        self.assertFalse((program / "indexes").exists())

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

    def test_the_program_arrives_with_one_capability_vocabulary(self):
        """The menu ships as a checklist, in one file, carrying no assessment.

        Ten files of capabilities with a maturity each was the shape of a
        self-assessment. One file of ids, names and descriptions is the shape
        of a vocabulary, which is all a capability is now.
        """
        model = self.instance / "program" / "model"
        self.assertEqual(sorted(p.name for p in model.glob("*.yml")),
                         ["capabilities.yml", "domains.yml", "risk-taxonomy.yml", "systems.yml"])

        domains = yaml.safe_load((model / "domains.yml").read_text())["domains"]
        capabilities = yaml.safe_load((model / "capabilities.yml").read_text())["capabilities"]
        self.assertEqual(len(domains), 10)
        self.assertTrue(capabilities)

        domain_ids = {d["id"] for d in domains}
        for capability in capabilities:
            self.assertEqual(set(capability) - {"why"},
                             {"id", "name", "domain", "description"}, capability["id"])
            self.assertIn(capability["domain"], domain_ids, capability["id"])
            self.assertTrue(capability["id"].startswith(capability["domain"] + "."),
                            capability["id"])

    def test_no_document_folder_is_a_domain(self):
        # The numbered domain directories are what the refactor removed. A
        # folder under program/ is a document type or model/.
        program = self.instance / "program"
        folders = {p.name for p in program.iterdir() if p.is_dir()}
        self.assertEqual(folders - {"model"},
                         {t.folder for t in keel_lib.TYPES})

    def test_the_seeded_program_demonstrates_the_triangle(self):
        """A standard, a gap and an exception against the same requirement.

        This is the distinction the product turns on, and a new user meets it
        on the first screen rather than in the documentation.
        """
        program = self.instance / "program"
        gap = next(program.glob("gaps/*/gap-*.md"))
        exception = next(program.glob("exceptions/*/exc-*.md"))
        gap_fm = keel_lib.extract_frontmatter(gap)
        exception_fm = keel_lib.extract_frontmatter(exception)
        self.assertEqual(gap_fm["requirement"], exception_fm["requirement"])

        index = keel_lib.requirement_index(keel_lib.scan_documents())
        self.assertIn(gap_fm["requirement"], index)

        # The gap is open because nothing closed it, not because a field says so.
        self.assertTrue(keel_lib.is_open_gap(gap_fm))
        self.assertNotIn("status", {k for k in gap_fm if k.endswith("_status")})

    def test_a_fresh_instance_has_nothing_overdue(self):
        """The starter's dates are relative to today, not frozen in the seed.

        A seeded review date in the past would make every new program open
        with an overdue document and a failing check — an own goal that gets
        worse the longer the release is on PyPI.
        """
        from kilagen.libs import check_reviews

        found = check_reviews.collect(keel_lib.scan_documents())
        self.assertEqual(found["overdue"], [])
        self.assertEqual(found["expired"], [])
        self.assertEqual(found["stale_gaps"], [])

    def test_the_seeded_standard_maps_to_both_frameworks(self):
        """The traceability chain has to resolve, not just look plausible.

        A mapping to a clause absent from the vocabulary, or to a framework
        absent from config.yml, fails validation — so this asserts the whole
        chain the starter exists to demonstrate: requirement to clause, clause
        to vocabulary, framework to config.
        """
        from kilagen.libs.generate_coverage import build_coverage

        coverage = build_coverage(keel_lib.load_config(), keel_lib.scan_documents(),
                                  keel_lib.load_framework_vocab())
        self.assertEqual(set(coverage), {"nist_csf", "pci_dss"})
        for framework, clauses in coverage.items():
            mapped = [c for c, v in clauses.items() if v["coverage"] == "mapped"]
            self.assertTrue(mapped, f"{framework} has no mapped clause")

    def test_seeded_documents_are_drafts(self):
        # A starter document that says "active" is a lie the user did not tell.
        for name in ("policies/pol-information-security.md",
                     "standards/std-access-control.md"):
            fm = keel_lib.extract_frontmatter(self.instance / "program" / name)
            self.assertEqual(fm["status"], "draft", name)

    def test_no_byte_code_is_copied_or_tracked(self):
        """`pip install` compiles the seed's .py file and leaves a __pycache__.

        Copying it is invisible — the seeded .gitignore hides it — until a
        Python upgrade changes the hash the manifest recorded and `update
        config` reports a file nobody edited.
        """
        manifest = yaml.safe_load(
            (self.instance / cli.MANIFEST_NAME).read_text())["files"]
        self.assertEqual([f for f in manifest if "__pycache__" in f or f.endswith(".pyc")], [])
        self.assertEqual(list(self.instance.rglob("*.pyc")), [])

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
                # What a GitHub-hosted runner already has on PATH.
                installed = {"python", "pip", "npm", "git", "gh"}
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

        The schema cannot see this one: `pol-information-security` is a
        perfectly well-formed policy id, so frontmatter validation passes and
        `kilagen check refs` then fails on a program that has no such policy —
        a first run that breaks on a value the author was never told to change.
        """
        pattern = re.compile(keel_lib.ID_RE.pattern)

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
            # Parsed, not grepped: an id named in a YAML comment is prose.
            frontmatter = keel_lib.extract_frontmatter(path) or {}
            offenders += [f"{path.name}: {hit}" for hit in ids(frontmatter)
                          if "replace-me" not in hit]
        self.assertEqual(offenders, [], "\n".join(offenders))

    def test_every_template_validates_as_it_ships(self):
        """A template is a valid document with REPLACE ME where the words go.

        The facets are empty lists rather than placeholder ids, so nothing in
        a template names a vocabulary entry that does not exist — which means
        the schema has no excuse to fail on any of them.
        """
        offenders = []
        for path in sorted(TEMPLATES.glob("*.md")):
            fm = keel_lib.extract_frontmatter(path)
            if not fm or "type" not in fm:
                continue
            for error in self.validator.iter_errors(fm):
                for real in cli_branch_errors(error, fm) or [error]:
                    field = "/".join(str(p) for p in real.path) or "(root)"
                    offenders.append(f"{path.name}: {field} — {real.message}")
        self.assertEqual(offenders, [], "\n".join(offenders))

    def test_every_type_in_the_registry_has_a_template(self):
        shipped = {path.stem for path in TEMPLATES.glob("*.md")}
        self.assertEqual(shipped, {t.name for t in keel_lib.TYPES})


def cli_branch_errors(error, fm):
    from kilagen.libs.validate_frontmatter import _branch_errors

    return _branch_errors(error, fm)


if __name__ == "__main__":
    unittest.main()


class GuidedInitTests(unittest.TestCase):
    """--guided is an option, never a requirement: init must still ask nothing."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.instance = Path(self._tmp.name).resolve()
        self._cwd = os.getcwd()
        self._paths = (keel_lib.REPO, keel_lib.PROGRAM, keel_lib.MODEL)
        self.addCleanup(lambda: (os.chdir(self._cwd),
                                 setattr(keel_lib, "REPO", self._paths[0]),
                                 setattr(keel_lib, "PROGRAM", self._paths[1]),
                                 setattr(keel_lib, "MODEL", self._paths[2]),
                                 self._tmp.cleanup()))
        os.chdir(self.instance)
        self._repoint()

    def _repoint(self):
        """keel_lib resolves these once, at import — before this program existed."""
        keel_lib.REPO = self.instance
        keel_lib.PROGRAM = self.instance / "program"
        keel_lib.MODEL = keel_lib.PROGRAM / "model"

    def _init(self, answers, **kwargs):
        args = argparse.Namespace(name=None, deployment="none", agent="none",
                                  force=False, guided=True, **kwargs)
        with mock.patch("builtins.input", side_effect=answers):
            status, output = _quiet(cli.cmd_init, args)
        self._repoint()
        return status, output

    def _config(self):
        return yaml.safe_load(
            (self.instance / "program" / "config.yml").read_text(encoding="utf-8"))

    def test_the_three_answers_shape_the_program(self):
        self._init(["Acme Corp", "iso_27001, soc2", "Head of Security"])
        config = self._config()
        self.assertEqual(config["name"], "Acme Corp")
        self.assertEqual([f["id"] for f in config["frameworks"]], ["iso_27001", "soc2"])
        role = (self.instance / "program" / "roles" / "role-security-owner.md").read_text()
        self.assertIn('title: "Head of Security"', role)
        # The id everything points at is untouched, so nothing dangles.
        self.assertIn("id: role-security-owner", role)

    def test_a_guided_program_passes_its_own_first_check(self):
        """Choosing other frameworks must not leave the seed mapping to absent ones."""
        self._init(["Acme Corp", "iso_27001", "Head of Security"])
        status, output = _quiet(cli.cmd_check, argparse.Namespace(target=[], strict=False))
        self.assertEqual(status, 0, output)

    def test_pressing_enter_three_times_gives_the_defaults(self):
        self._init(["", "", ""])
        config = self._config()
        self.assertEqual(config["name"], "Security Program")
        self.assertEqual([f["id"] for f in config["frameworks"]], ["nist_csf", "pci_dss"])

    def test_an_unknown_framework_is_refused_before_anything_is_written(self):
        with self.assertRaises(cli.CommandError) as caught:
            self._init(["Acme", "iso_9001", ""])
        self.assertIn("iso_9001", str(caught.exception))
        self.assertFalse((self.instance / "program").exists())
