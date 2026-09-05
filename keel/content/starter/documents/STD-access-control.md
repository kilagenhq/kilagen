---
id: STD-access-control
title: "Access Control Standard"
description: >
  Requirements for granting, reviewing and revoking access to production
  systems and corporate applications.
type: standard
status: draft
domain: grc
owner: role-security-owner
version: "0.1"
approved_by: [role-security-owner]
reviewed_by: [role-security-owner]
last_reviewed: 2026-01-01
next_review: 2027-01-01
applies_to: [iam]
requirements:
  - ref: "1.1"
    domains: [iam]
    frameworks:
      nist_csf: ["PR.AA"]
  - ref: "1.2"
    domains: [iam]
    frameworks:
      pci_dss: ["8"]
related:
  policies: [POL-information-security]
---

# Access Control Standard

Starter document. The two requirements below exist to show the traceability
chain end to end — a requirement mapped to a framework clause, which the
coverage view then counts. Replace them with your own, or delete the file.

## Requirements

1.1 Access to production systems is granted only through an approved request
that records the business justification.

1.2 Every user is identified by a unique account, and shared credentials are
not used for administrative access.
