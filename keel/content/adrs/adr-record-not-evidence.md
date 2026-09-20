---
id: adr-record-not-evidence
type: adr   # the framework's own convention, not a program document type
title: "The repository holds the record; evidence is linked, never committed"
description: >
  No binaries in program/; each document is the summary and bulky artifacts live in
  external storage referenced through an evidence field whose shape check validates.
status: active
owner: role-maintainer
decided: 2026-09-18
related: [adr-the-admission-test, adr-truth-boundaries]
---

# The repository holds the record; evidence is linked, never committed

## Context

Security work generates heavy artifacts: a SOC 2 report, a pentest PDF, a forensics bundle, the diagram set behind a threat model, screenshots an auditor asked for. The obvious move is to commit them next to the document that discusses them.

Git is a poor place for them. Every version of every binary is kept forever, so the clone grows without bound and never shrinks; a file committed once is recoverable by hash long after it is deleted, which matters when the bundle holds incident data or personal information; and none of it diffs, reviews or greps. The repository stops being cheap to clone at exactly the moment the program gets serious.

There is also an access-control mismatch. Evidence often needs narrower access than the program itself, and a Git repository has one access boundary.

## Decision

**No binaries in `program/`.** `check` enforces it.

Each document is the record: the conclusions, the scope, the dates, the owner, the decisions taken. Anything voluminous lives in the storage the organization already runs and is referenced by frontmatter:

```yaml
evidence:
  - name: "Forensics bundle"
    url: "https://evidence.example.com/ir-2026-09/forensics-bundle"
```

`check` validates the **shape** of the link only. Whether the URL still resolves and who can open it is the storage system's problem, and saying so plainly is more honest than a liveness check that would go stale or need credentials.

## Consequences

- Clones stay small and the history stays reviewable.
- Sensitive material keeps its own access boundary, and a link can be revoked in a way a committed blob cannot.
- Links rot, and the repository will not tell you. The mitigation is the review cycle: a document with dead evidence links fails its next review, which is a human check that was going to happen anyway.
- Writing the summary is now mandatory rather than optional — "see the attached report" stops being an available shortcut, which is the point.
