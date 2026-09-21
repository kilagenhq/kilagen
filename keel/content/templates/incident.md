---
# The research lives outside this repository — the timeline, the SIEM exports,
# the forensic notes, anything with personal data in it. Link to it with
# source_of_truth. What belongs here is the record of what the incident
# CHANGED: the decision it forced, the standard it moved, the gap it opened.
# An incident that changed nothing is a ticket, not a document.
id: inc-replace-me
type: incident
title: "REPLACE ME"
description: >
  REPLACE ME — one or two sentences an agent can use to decide relevance. This
  is the field retrieval leans on hardest.
status: draft
owner: role-replace-me
occurred: 2026-01-01        # the year folder must match this
severity: high              # negligible | low | medium | high | critical
# resolved: 2026-01-03
immutable: true
domains: []                  # ids from program/model/domains.yml — a document may declare several
capabilities: []             # ids from program/model/capabilities.yml
systems: []                  # ids from program/model/systems.yml
related: []                  # flat list of ids; the prefix says what each one is
# publish: [confluence]      # overrides the per-type default in program/publish.yml
# source_of_truth: https://example.com/replace-me   # the original lives there; this is the record
---

# REPLACE ME — Incident Title

## What happened

The sequence of events, with times.

## Impact

Who and what was affected, and for how long.

## Root cause

Why it was possible.

## What changed

The actions taken afterwards, each linked to the document that carries them.

Forensic bundles and log exports go in `evidence:` as links — never committed
here.
