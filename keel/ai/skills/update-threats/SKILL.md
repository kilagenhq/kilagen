---
name: update-threats
description: >
  Update the threat catalog (THR-*) from industry reports. Fetches sources,
  analyses relevance to your organization, and generates a proposal for human review.
  Use /update-threats to propose, /update-threats apply <date> to apply.
disable-model-invocation: true
allowed-tools: Bash(python3:*), WebFetch, Read, Write, Edit, Glob, Grep
---

# Threat Catalog Update

Execute the threat catalog update process defined in the runbook below.

## Process definition

The runbook is the single source of truth for this workflow. Read it fully before starting.

!`cat program/01-grc/runbooks/RB-update-threat-catalog.md`

## Threat sources configuration

!`cat program/01-grc/threats/threat_sources.yml`

## Proposal output format

When generating the proposal (Phase 3), follow the template format exactly:

- See [proposal-template.md](references/proposal-template.md) for the full template structure.

## Key reminders

- All artefacts go to `evidence/threat-updates/<YYYY-MM-DD>/`, never committed to git.
- The proposal is the human review interface — make it clear and actionable.
- Never edit THR-*.md files in propose mode. Only apply mode writes to the catalog.
- After apply, remind the user to archive the `evidence/` contents per your organization's evidence-retention process.
