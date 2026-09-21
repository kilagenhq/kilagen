---
id: adr-no-capability-assessment
type: adr   # the framework's own convention, not a program document type
title: "Capabilities are a checklist and a vocabulary, not an assessment"
description: >
  Capability coverage and maturity levels are removed; capabilities survive as the menu
  of what a program can build and as the facet that groups documents by domain.
status: active
owner: role-maintainer
decided: 2026-09-18
related: [adr-truth-boundaries, adr-folders-are-storage-not-ontology]
---

# Capabilities are a checklist and a vocabulary, not an assessment

## Context

Capabilities carried two computed products: a maturity level per capability (`L0-none` … `L5-optimizing`) and a coverage roll-up — how many capabilities in a domain were covered, partially covered or missing.

Both are self-assessment. Both were hand-typed into YAML.

The coverage number has a worse problem than staleness: it has no denominator. "SAST: covered" — on which repositories? All of them, the three that matter, or the one where the pilot ran? The repository cannot know. What the roll-up actually measured was *whether a document existed mentioning the capability*, presented as a statement about the security program. A percentage computed that way is theater: it moves when someone writes a page and does not move when someone deploys a scanner.

Maturity fails differently. The level is a considered human judgement, which is exactly why it is made once, at a workshop, and never revisited.

Framework coverage is the counter-example that clarifies the rule. Its denominator is published by somebody else and is finite, the mapping is a fact about documents in this repository, and an auditor consumes the result.

## Decision

Capability assessment is removed: no `maturity:` field, no covered/partial/gap states, no program-gap roll-up, and none of the views that rendered them.

Capabilities are demoted to two honest roles:

1. **A starter checklist** — the menu of what a security program can build, seeded by `init` so a new program has somewhere to start.
2. **A navigation vocabulary** — the facet behind "everything we have written about IAM".

The domains and their capabilities collapse from one file per domain into a single `model/capabilities.yml`, which is what a vocabulary should be. A capability page may state plainly that what is actually deployed is measured in the estate, not here.

`maturity.md` survives only as an essay about maturity, if it survives at all. It is not schema.

## Consequences

- The dashboard loses its most colorful pages and stops being able to answer "how are we doing", which it was never able to answer truthfully.
- Nobody has to maintain a maturity level per capability that rots.
- A user who wants a maturity assessment can still run one; it just does not live here, and the repository does not pretend the answer is derivable from its own contents.
- The Domains lens gets simpler and more useful, because it is now navigation rather than a scorecard with navigation attached.
