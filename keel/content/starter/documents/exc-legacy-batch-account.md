---
id: exc-legacy-batch-account
type: exception
title: "Shared batch account on the reporting host"
description: >
  A scheduled job on the reporting host authenticates with a shared service
  account that cannot be made unique before the platform is retired.
owner: role-security-owner
requirement: std-access-control#1.2
approved_by: [role-security-owner]
expires: 2026-12-31
risk_severity: low
compensating_controls:
  - "The account cannot log in interactively."
  - "Its activity is logged and reviewed monthly."
domains: [iam]
---

# Shared batch account on the reporting host

Starter document — delete it, or replace it with a real exception.

An exception is the other kind of deviation from the same requirement: one that
somebody with authority **approved**, in writing, with an expiry. That expiry is
the point. On `expires:` this becomes an unapproved deviation again, and the
Schedule lens says so before it happens.

Compare it with `gap-shared-admin-accounts`: same standard, same requirement,
opposite side of the line.
