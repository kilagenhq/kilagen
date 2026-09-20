---
id: std-replace-me
type: standard
title: "REPLACE ME"
description: >
  REPLACE ME — one or two sentences an agent can use to decide relevance. This
  is the field retrieval leans on hardest.
status: draft
owner: role-replace-me
version: "1.0"
approved_by: [role-replace-me]
last_reviewed: 2026-01-01
next_review: 2027-01-01
requirements:                # the requirements themselves — text and mappings live here
  - ref: "1.1"
    text: >
      REPLACE ME — one enforceable sentence. This is what a gap or an exception
      is filed against, as <this-id>#1.1.
    how_demonstrated: REPLACE ME — the method, in one sentence.
    evidence:                # the proof itself: named links, never a committed file
      - name: "REPLACE ME"
        url: "https://example.com/replace-me"
        collected: 2026-01-01      # evidence has an implicit expiry; this is what dates it
        freshness: quarterly       # monthly | quarterly | semi-annually | annually | every-2-years | every-3-years
        # collector: replace-me    # collectors/<name>.py refreshes the url and the date
    frameworks:              # optional; omit for an internal requirement
      replace_me: ["REPLACE-ME"]
domains: []                  # ids from program/model/domains.yml — a document may declare several
capabilities: []             # ids from program/model/capabilities.yml
systems: []                  # ids from program/model/systems.yml
related: []                  # flat list of ids; the prefix says what each one is
# publish: [confluence]      # overrides the per-type default in program/publish.yml
# source_of_truth: https://example.com/replace-me   # the original lives there; this is the record
---

# REPLACE ME — Standard Title

## Scope

Which systems, environments and teams the requirements below bind.

## Requirements

The requirements live in the frontmatter, not here — that is what makes them
addressable. Use this section for context a requirement cannot carry: why the
line is drawn where it is, what is deliberately out of scope.

## Evidence

Where the proof lives for an audit. Link it with `evidence:` rather than
committing it.
