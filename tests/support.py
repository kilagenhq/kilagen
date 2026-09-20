"""A real program in a temporary directory, for the tests that need one.

Most checks in this suite are about how documents relate to each other, and
the cheapest honest way to test that is against a program on disk rather than
a hand-built dict — the validators read files, and a fixture that does not
would prove something else.
"""

from __future__ import annotations

import shutil
import tempfile
import textwrap
import unittest
from pathlib import Path

from kilagen import SCHEMA_VERSION
from kilagen.libs import keel_lib

CONFIG = f"""\
name: Test Program
repo: ""
schema_version: {SCHEMA_VERSION}
frameworks:
  - id: pci_dss
    url: https://example.com/pci
"""

DOMAINS = """\
domains:
  - id: grc
    name: Governance
    description: Governance, risk and compliance.
    order: 1
  - id: iam
    name: Identity
    description: Identity and access management.
    order: 2
"""

CAPABILITIES = """\
capabilities:
  - id: iam.idp
    name: Identity Provider
    domain: iam
    description: Central authentication.
  - id: grc.policy-lifecycle
    name: Policy Lifecycle
    domain: grc
    description: Authoring and review of policies.
"""

SYSTEMS = """\
systems:
  - id: okta
    name: Okta
"""

PUBLISH = """\
destinations:
  confluence:
    space: SEC
defaults:
  policy: [confluence]
  decision: []
"""

PCI_VOCAB = """\
id: pci_dss
name: PCI DSS
clauses: ["7", "8", "9"]
"""

ROLE = """\
---
id: role-owner
type: role
title: "Owner"
description: The accountable role.
status: active
owner: role-owner
last_reviewed: 2026-01-01
next_review: 2030-01-01
---

# Owner
"""

STANDARD = """\
---
id: std-access-control
type: standard
title: "Access Control"
description: How access is granted and removed.
status: active
owner: role-owner
domains: [iam]
capabilities: [iam.idp]
systems: [okta]
last_reviewed: 2026-01-01
next_review: 2030-01-01
requirements:
  - ref: "1.1"
    text: Access is granted through an approved request.
    frameworks:
      pci_dss: ["7"]
  - ref: "1.2"
    text: Every user has a unique account.
    frameworks:
      pci_dss: ["8"]
---

# Access Control
"""

# The three corners of the triangle, all pointed at the same standard.
GAP = """\
---
id: gap-shared-accounts
type: gap
title: "Shared accounts"
description: Two hosts still use a shared local account.
owner: role-owner
requirement: std-access-control#1.2
source: audit
found: 2026-02-01
severity: medium
domains: [iam]
last_reviewed: 2026-02-01
next_review: 2030-01-01
---

# Shared accounts
"""

EXCEPTION = """\
---
id: exc-batch-account
type: exception
title: "Batch account"
description: A scheduled job uses a shared service account.
owner: role-owner
requirement: std-access-control#1.2
approved_by: [role-owner]
expires: 2030-06-01
risk_severity: low
last_reviewed: 2026-02-01
next_review: 2030-01-01
---

# Batch account
"""

DOCUMENTS = {
    "roles/role-owner.md": ROLE,
    "standards/std-access-control.md": STANDARD,
    "gaps/2026/gap-shared-accounts.md": GAP,
    "exceptions/2026/exc-batch-account.md": EXCEPTION,
}


class ProgramTestCase(unittest.TestCase):
    """Builds a valid program, and repoints keel_lib at it for the test.

    keel_lib resolves REPO and PROGRAM once, at import, from the working
    directory — so a test that only chdir'd would still be reading the
    framework's own checkout. Rebinding them is what makes each test see its
    own program.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        self.program = self.repo / "program"

        saved = (keel_lib.REPO, keel_lib.PROGRAM, keel_lib.MODEL,
                 keel_lib.SHIPPED_FRAMEWORKS)
        self.addCleanup(lambda: (
            setattr(keel_lib, "REPO", saved[0]),
            setattr(keel_lib, "PROGRAM", saved[1]),
            setattr(keel_lib, "MODEL", saved[2]),
            setattr(keel_lib, "SHIPPED_FRAMEWORKS", saved[3]),
        ))
        keel_lib.REPO, keel_lib.PROGRAM = self.repo, self.program
        keel_lib.MODEL = self.program / "model"
        # The shipped framework catalogue is real product data, so a fixture
        # that saw it would be testing the catalogue rather than the code.
        # Each test gets an empty one and seeds what it needs with `ship()`.
        self.shipped = self.repo / "shipped-frameworks"
        self.shipped.mkdir()
        keel_lib.SHIPPED_FRAMEWORKS = self.shipped
        keel_lib.reset_warnings()

        for doc_type in keel_lib.TYPES:
            (self.program / doc_type.folder).mkdir(parents=True, exist_ok=True)
        (keel_lib.MODEL / "frameworks").mkdir(parents=True, exist_ok=True)

        self.write("config.yml", CONFIG)
        self.write("publish.yml", PUBLISH)
        self.write("model/domains.yml", DOMAINS)
        self.write("model/capabilities.yml", CAPABILITIES)
        self.write("model/systems.yml", SYSTEMS)
        self.write("model/frameworks/pci_dss.yml", PCI_VOCAB)
        for rel, text in DOCUMENTS.items():
            self.write(rel, text)

    def write(self, rel: str, text: str) -> Path:
        """Write a file under program/, creating its directories."""
        path = self.program / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(text), encoding="utf-8")
        return path

    def ship(self, name: str, text: str) -> Path:
        """Put a framework in the shipped catalogue, as the package would."""
        path = self.shipped / name
        path.write_text(textwrap.dedent(text), encoding="utf-8")
        return path

    def remove(self, rel: str) -> None:
        path = self.program / rel
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()

    def edit(self, rel: str, old: str, new: str) -> Path:
        """Replace a fragment of an existing file, asserting it was there."""
        path = self.program / rel
        text = path.read_text(encoding="utf-8")
        assert old in text, f"{old!r} not found in {rel}"
        path.write_text(text.replace(old, new), encoding="utf-8")
        return path

    def documents(self) -> list[dict]:
        return keel_lib.scan_documents()
