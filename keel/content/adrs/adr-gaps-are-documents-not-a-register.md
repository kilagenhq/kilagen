---
id: adr-gaps-are-documents-not-a-register
type: adr   # the framework's own convention, not a program document type
title: "A gap is a document against a requirement, not a row in a register"
description: >
  gaps.yml is replaced by a gap document type whose requirement reference must resolve
  and whose closure is recorded as write-once facts rather than a mirrored status.
status: active
owner: role-maintainer
decided: 2026-09-18
related: [adr-truth-boundaries, adr-lowercase-prefixed-ids]
---

# A gap is a document against a requirement, not a row in a register

## Context

Gaps lived in a single hand-maintained `gaps.yml`, one row each, with a `status:` field documented as "mirrors the tracker, nothing richer" and a `tracker_id` to correlate on.

The file had the problems a register always has. It is edited by many people at once and conflicts on every merge. It cannot carry the one thing a gap most needs — the explanation of what is actually missing and why it matters — because a YAML row is not a place to write prose. And its `status:` was, by its own documentation, a copy of a truth living in Jira.

Meanwhile the surrounding concepts were already documents. A requirement is a numbered item inside a standard. An exception is a document with an owner, an approver and an expiry date. Only the gap — the third corner of the same triangle — was a row.

## Decision

`gaps.yml` is deleted and `gap` becomes an ordinary document type.

```yaml
---
id: gap-mfa-admin-consoles
type: gap
requirement: std-access-control#3.2   # must resolve to a real requirement
source: audit                          # audit | pentest | risk-assessment | …
found: 2026-09-18
tracker: https://…/browse/SEC-12       # optional; lifecycle lives there
# remediated: 2026-11-02               # write-once closure facts
# superseded_by: exc-legacy-vpn-mfa
---
```

The triangle is now explicit and symmetric:

- **Requirement** — what we require. The norm.
- **Exception** (`exc-*`) — a deviation somebody with authority approved, with an expiry.
- **Gap** (`gap-*`) — a deviation nobody approved, pending remediation or conversion into an exception.

A gap is **open** when it carries neither `remediated:` nor `superseded_by:`. There is no status field to mirror. Closed gaps are kept forever: the history of what a requirement has failed at is audit evidence, and recurrence against the same requirement is a signal worth seeing.

`check` requires `requirement:` to resolve to a requirement that exists. A shortfall with no written requirement behind it cannot be filed as a gap, which is deliberate: either the standard is missing and should be written, or the thing was a risk, not a gap.

## Consequences

- Gaps merge like documents, which is to say they merge.
- Each gap has room for its own description, scope and evidence links, and appears in the Compliance lens under the requirement it falls short of, next to that requirement's live exceptions.
- Closure is append-only, so a closed gap cannot be reopened by editing a field — a recurrence is a new gap, which is the honest record.
- The requirement reference is a hard dependency: renaming a requirement number breaks `check` until the gaps are updated. That is the intended cost of making the link real.
