---
# System frontmatter — uses domains (plural) instead of domain (singular).
# Systems live in /systems/, not inside domain folders.
#
# category determines the depth of this document:
#   security-tool  — security operates the tool day-to-day (full doc)
#   business-app   — security only configures controls like SSO, logs, access reviews (lighter doc)
#   infrastructure — platform where security applies controls (hardening, monitoring)
#
# Single-domain example:
#   domains: [appsec]
#   capabilities:
#     appsec: [sast]
#
# Multi-domain example:
#   domains: [infra, secops, ir]
#   capabilities:
#     infra: [edr, cspm, cwpp]
#     secops: [siem]
#     ir: [dfir-tooling]
#
id: SYS-REPLACE-ME
title: "REPLACE ME"
description: >
  REPLACE ME — one or two sentences an LLM can use to decide relevance.
type: system
category: security-tool      # security-tool | business-app | infrastructure
status: draft
domains:                     # array of domains this system serves
  - REPLACE-ME
capabilities:                # keys must be a subset of domains above
  REPLACE-ME: []             # array of capability IDs from that domain's capabilities.yml
vendor: REPLACE-ME           # vendor name (lowercase, kebab-case)
deployment: saas             # saas | iaas | self-hosted | hybrid
url:                         # optional — primary console / admin URL
owner: role-REPLACE-ME        # primary IT owner per STD-asset-management §1.5 (role-* slug)
second_owner: role-REPLACE-ME # backup IT owner per STD-asset-management §1.23 (role-* slug)
last_reviewed: 2026-01-01
next_review: 2027-01-01
related:                     # optional — remove section if unused
  policies: []
  standards: []
  runbooks: []
---

# REPLACE ME — System Title

## Purpose

What this system does and why it was chosen.

## Configuration

Key configuration details, deployment topology, and integrations.

## Integrations

Other systems and services this system connects to.

## Operational details

| Aspect | Detail |
|---|---|
| Owner | ... |
| On-call | ... |
| Upgrade cadence | ... |
| Cost model | ... |

## Known limitations

Gaps, scaling limits, or missing features relevant to security.

## Related

Links to related policies, standards, controls, and runbooks.
