---
id: STD-REPLACE-ME
title: "REPLACE ME"
description: >
  REPLACE ME — one or two sentences an LLM can use to decide relevance.
type: standard
status: draft
domain: grc                  # standards live centralized in 01-grc
owner: security-eng
version: "1.0"
approved_by: []              # array of role slugs that approved this standard
reviewed_by: ""              # role(s) that reviewed this standard (same shape as approved_by)
last_reviewed: 2026-01-01
next_review: 2027-01-01
applies_to: []               # domains where this standard's requirements apply (e.g. [appsec, infra])
requirements:                # requirement-level mappings
  - ref: "X.1"               # requirement number as used in the body
    domains: []               # which domains this requirement applies to (e.g. [appsec, infra])
    capabilities:             # which capabilities this requirement covers
      # appsec: [sast, sca]
    frameworks:               # omit frameworks for internal requirements
      mas_trm_2021: []
  - ref: "X.2"               # no frameworks = internal requirement
    domains: []
# gap_link:                  # optional — URL to ticket filter for open gaps
related:
  policies: [POL-information-security]
  standards: []              # cross-references to other standards
---

# REPLACE ME — Standard Title

## Purpose

What this standard achieves and why it exists.

## Scope

Systems, teams, and environments subject to this standard.

## Requirements

### Section Name

X.1 Requirement text...

X.2 Requirement text...

### Another Section

X.3 Requirement text...

## Evidence

| Requirement | Evidence | Source |
|---|---|---|
| X.1 | Description of evidence artifact | SYS-* or source |

## Revision History

| Version | Date | Approved by | Change |
|---|---|---|---|
| 1.0 | YYYY-MM-DD | Role | Initial version |
