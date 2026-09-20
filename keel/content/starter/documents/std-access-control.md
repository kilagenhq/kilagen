---
id: std-access-control
type: standard
title: "Access Control Standard"
description: >
  Requirements for granting, reviewing and revoking access to production systems
  and corporate applications.
status: draft
owner: role-security-owner
version: "0.1"
domains: [iam, grc]
capabilities: [iam.idp, iam.iga]
related: [pol-information-security]
last_reviewed: 2026-01-01
next_review: 2027-01-01
requirements:
  - ref: "1.1"
    text: >
      Access to production systems is granted only through an approved request
      that records the business justification.
    how_demonstrated: Approved access requests for the period under review.
    frameworks:
      nist_csf: ["PR.AA"]
  - ref: "1.2"
    text: >
      Every user is identified by a unique account; shared credentials are not
      used for administrative access.
    how_demonstrated: An account inventory showing no shared administrative accounts.
    frameworks:
      pci_dss: ["8"]
---

# Access Control Standard

Starter document. The requirements live in the frontmatter, not in this body —
that is what makes them addressable: a framework clause maps to `1.2`, and a gap
or an exception is filed against `std-access-control#1.2` rather than against
"the document".

Use this body for scope, context and how the requirements are evidenced.
Replace the two requirements with your own, or delete the file — but note that
the seeded gap and exception reference `1.2`, so delete those too.
