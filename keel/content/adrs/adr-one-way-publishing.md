---
id: adr-one-way-publishing
type: adr   # the framework's own convention, not a program document type
title: "Publishing flows one way, out of git"
description: >
  publish.yml declares destinations and a default per type, documents override it, and
  bidirectional sync with a wiki is rejected outright.
status: active
owner: role-maintainer
decided: 2026-09-18
related: [adr-truth-boundaries]
---

# Publishing flows one way, out of git

## Context

The people who need to read a policy are not the people who read a Git repository. A published program has to reach Confluence, an intranet, or whatever the organization already opens, and the question is what happens when somebody edits the page there.

Bidirectional sync is the obvious answer and a known tar pit. It needs conflict resolution between a Markdown file with git history and a rich-text page with its own revision model, round-trip fidelity for tables, macros and attachments, and an answer for the case where both sides changed. Every implementation converges on "the wiki wins sometimes", and at that point the repository is no longer the source of truth — it is one of two, which is none.

The second problem is quieter: a document nobody remembered to publish. If publishing is purely opt-in per document, the policy that most needs to be visible is exactly the one somebody forgot to tag.

## Decision

One direction, always: **git → destination**. A published page is a render, carrying a banner that says which document it came from and that edits belong in git. What flows back is human comment, collected as input for the owner, never merged as content.

The contract is a file plus a field:

```yaml
# publish.yml
destinations:
  confluence:
    space: SEC
defaults:            # per type — the safety net against the forgotten-publish hole
  policy: [confluence]
  guideline: [confluence]
  process: [confluence]
  adr: []            # never published unless a document opts in
```

A document overrides with `publish: none`, `publish: all`, or an explicit list. `check` validates every `publish:` value against the declared destinations, so a typo in a destination name fails in CI rather than silently publishing nowhere.

This decision ships the **contract only** — the file, the field and their validation. The tool that performs the sync is a separate product that consumes it.

### What `publish:` governs, and what it does not

`publish:` governs **external destinations** — the wiki, the intranet, whatever a sync tool pushes to. It does **not** govern the dashboard. `kilagen build` copies the whole of `program/` into `_site/`, so a document with `publish: none` is still in the built site and still in `registry.json`.

That is deliberate and not a loophole, because the site is exactly as public as the repository it is built from: anyone who can open the published dashboard can already read `program/` in git. Filtering the site would buy no confidentiality and would cost a great deal — a document would sit in the index with a body that 404s, or vanish from the index and take its own coverage, gaps and relations with it.

The rule that follows, and it matters: **`publish: none` is not a confidentiality control.** Nothing under `program/` is. Anything that must not be read by whoever can read the repository does not belong in the repository — it belongs behind an `evidence:` link, which is [adr-record-not-evidence](adr-record-not-evidence.md).

## Consequences

- Defaults per type mean a new policy is published because it is a policy, not because somebody remembered.
- Editing in the destination is a dead end by design, which will annoy somebody. The banner says so before they start.
- Shipping the contract before the tool costs one round of validation code that nothing exercises yet, and buys the ability to write `publish:` into documents and templates now instead of migrating them later.
- Adding a destination later is a `publish.yml` entry, because nothing about the contract is Confluence-specific.
