---
id: gap-replace-me
type: gap
title: "REPLACE ME"
description: >
  REPLACE ME — one or two sentences an agent can use to decide relevance. This
  is the field retrieval leans on hardest.
owner: role-replace-me
requirement: std-replace-me#1.1   # the requirement fallen short of — must resolve
source: internal                  # audit | pentest | risk-assessment | bug-bounty | threat-model | internal
found: 2026-01-01                 # the year folder must match this
severity: medium
# tracker: https://example.com/browse/REPLACE-ME
# source_url: https://example.com/report   # the report or scan that found it
# remediated: 2026-06-01          # write-once: closes the gap
# excepted_by: exc-replace-me     # write-once: an approved exception closed it instead
domains: []                  # ids from program/model/domains.yml — a document may declare several
capabilities: []             # ids from program/model/capabilities.yml
systems: []                  # ids from program/model/systems.yml
related: []                  # flat list of ids; the prefix says what each one is
# publish: [confluence]      # overrides the per-type default in program/publish.yml
# source_of_truth: https://example.com/replace-me   # the original lives there; this is the record
---

# REPLACE ME — Gap Title

## What is missing

The shortfall, in terms of the requirement it falls short of.

## Why it matters

The exposure it creates.

## Closing it

A gap is open until one of two write-once facts closes it: `remediated:` with
the date it was fixed, or `excepted_by:` naming the exception that
authorized it. There is no status field — the remediation work's lifecycle
belongs to the tracker.

Closed gaps are kept forever; the record is audit evidence.
