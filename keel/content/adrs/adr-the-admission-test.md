---
id: adr-the-admission-test
type: adr   # the framework's own convention, not a program document type
title: "The admission test for what enters the program"
description: >
  A document belongs in program/ only if it has an accountable owner, an expiry, a review
  and an auditor who could ask for it; general operational knowledge belongs in the wiki.
status: active
owner: role-maintainer
decided: 2026-09-18
related: [adr-truth-boundaries, adr-record-not-evidence]
---

# The admission test for what enters the program

## Context

Every documentation system drifts toward accepting everything. Somebody writes "how to create a group in the IdP", it is security-adjacent and well written, and there is no principle available to say no. The team wiki has no owner field, the security repository does, so the good page migrates here.

Repeat that a few dozen times and the program is a wiki with frontmatter. The review queue fills with pages nobody needs to review; the auditor's view fills with pages the auditor did not ask for; the ratio of owned documents to unowned ones falls quietly and nothing ever alerts.

The damage is not clutter. It is that every document in `program/` feeds the lenses, the review schedule and the compliance view, so an unowned document does not add coverage — it dilutes it.

## Decision

A document enters `program/` only if the security program **owns** it. Four questions, all of which must be yes:

1. Is somebody accountable for it, expressible as a `role-*` id?
2. Does it expire — is it wrong if nobody looks at it for a year?
3. Does it get reviewed, on a schedule?
4. Could an auditor ask for it by name?

Owner, review date and enforceability are the machinery Kilagen provides. A document that does not need that machinery does not belong in the repository, however good it is.

General operational knowledge — tool how-tos, tips, team onboarding, meeting notes — goes to the team wiki, linked from here when a document needs it.

## Consequences

- The document count stays low and every number computed from it stays meaningful.
- The boundary has to be defended by a person at review time; no validator can tell an owned process from an unowned one.
- Some good writing lives outside the repository and is linked rather than held. That is the same trade as `evidence:` — the record here, the bulk elsewhere.
- The test doubles as an editorial prompt. A page that fails only question 1 usually has an owner nobody has named yet, and naming them is the useful outcome.
