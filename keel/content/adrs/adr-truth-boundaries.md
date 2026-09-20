---
id: adr-truth-boundaries
type: adr   # the framework's own convention, not a program document type
title: "Truth boundaries between the repository, the tracker and the estate"
description: >
  The repository owns the normative record, the tracker owns lifecycle and the estate
  owns what is deployed; no field may mirror a truth the repository does not own.
status: active
owner: role-maintainer
decided: 2026-09-18
related: [adr-no-capability-assessment, adr-gaps-are-documents-not-a-register, adr-record-not-evidence]
---

# Truth boundaries between the repository, the tracker and the estate

## Context

A security program touches three systems of record, and only one of them is this repository.

The repository knows what the organization requires, what it decided, who approved it and when it was last reviewed. Those are facts *about documents*, and the repository is naturally their source of truth: they are written here, reviewed here, and the audit trail is the git history.

The tracker knows whether a piece of work is open, assigned or done. The estate — CMDB, scanners, identity provider, cloud APIs — knows what is actually deployed.

Every field that copies one of the other two truths into the repository is stale from the moment it is typed. The first layout had several: `maturity:` on every capability, a `status:` on every gap mirroring its Jira ticket, rich system profiles describing configuration the CMDB already held.

Each one degrades in the same way. Nobody updates it, so it drifts; nobody trusts it, so nobody updates it. The document is then worse than having no field at all, because a wrong answer is consumed as an answer.

## Decision

The repository owns the normative record and mirrors nothing.

- **No `maturity:` field.** How well a capability works is a fact about the world, hand-typed and never re-typed.
- **No status field that mirrors a tracker.** A document may carry a `tracker:` URL — that is a pointer, not a copy. Where a lifecycle needs to be recorded in the repository, it is recorded as **write-once facts** (`remediated: 2026-11-02`), never as a mutable state that has to stay in sync.
- **Systems are vocabulary ids**, not profiles. `model/systems.yml` holds an id, a name and optionally a URL into the real inventory.
- **The only computed coverage is against frameworks.** There the denominator is external and finite — PCI DSS has a clause list — the question "which requirement covers clause 8" has a true answer inside the repository, and the consumer is real: the auditor.

`check` enforces the boundary, so a future field cannot quietly reintroduce a mirror.

## Consequences

- Several views disappear along with the data behind them: maturity, capability coverage, program gaps, the system detail page.
- What survives is smaller and true. A requirement, its open gaps and its live exceptions are all facts the repository owns outright.
- Integration is deferred, not denied. `model/systems.yml` is the seam where an estate tool will one day write; a tracker-coherence check that compares a `tracker:` link against the document's write-once facts is possible later, over an API, without changing the model.
- A standalone user with no tracker loses a little: they get a URL field where they might have wanted a workflow. That is the right trade — a bad workflow in YAML is worse than an honest link.
