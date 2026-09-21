# Kilagen — Framework Design

Kilagen runs the **normative layer** of a security program as Markdown and YAML in a Git repository: what the organization requires, what it decided, who approved it, when it was last reviewed, and which regulatory clauses it answers. The repository is the record; the dashboard and the framework-coverage view are projections of it.

It is deliberately not the other two things a GRC tool is usually asked to be — a posture self-assessment and a risk tracker. Those answer questions about the world and about ticket lifecycles, and a document repository answers neither honestly.

> **No PII.** This repository must never contain personal data beyond role-based attributions. Ownership fields (`owner`, `approved_by`, `reviewed_by`) reference role ids (e.g. `role-cto`) defined in `program/roles/`, not personal names. Never commit personal email addresses, phone numbers, government IDs, or other personal contact data.
>
> **Scope.** This repository contains the framework (`keel/`) only. The `program/` layer described throughout is the *instance* you build in your own repository — see `instantiation.md`.

## The admission test

A document enters `program/` only if the security program **owns** it: someone is accountable for it, it expires, it gets reviewed, and an auditor could ask for it. Owner, review date and enforceability are the machinery Kilagen provides; a document that does not need that machinery does not belong here.

General operational knowledge — how to create a group in the IdP, team onboarding, tips — belongs in the team wiki. Every document in `program/` feeds the lenses, the review schedule and the auditor's view, so unowned documentation does not add coverage, it dilutes it.

→ [adr-the-admission-test](adrs/adr-the-admission-test.md)

## Truth boundaries

Three systems hold three different truths. Kilagen owns one of them and refuses to mirror the others.

| Truth | Owner | In the repository |
|---|---|---|
| What we require, decided, approved, reviewed | **This repository** | The documents themselves |
| Whether a piece of work is open, assigned, in progress | The tracker | A `tracker:` URL, never a mirrored state |
| What is actually deployed, on which hosts, with which coverage | The estate (CMDB, scanners) | A `systems:` facet of ids, never a posture |

Corollaries, all enforced by `kilagen check`: no `maturity:` field, no status field that mirrors a tracker, and the only computed coverage is against frameworks — because there the denominator is external and finite, and the consumer is the auditor.

→ [adr-truth-boundaries](adrs/adr-truth-boundaries.md) · [adr-no-capability-assessment](adrs/adr-no-capability-assessment.md) · [adr-record-not-evidence](adrs/adr-record-not-evidence.md)

## Layout

A folder means **document type**, and nothing else. Every other classification — domain, capability, system, framework — is multivalued frontmatter validated against a closed vocabulary in `model/`. A subfolder may only ever mean *partition* (a year), never classification.

```
program/
├── config.yml
├── publish.yml           # publishing contract: destinations + defaults per type
├── model/                # closed vocabularies, referenced and never prose
│   ├── domains.yml
│   ├── capabilities.yml
│   ├── systems.yml
│   ├── risk-taxonomy.yml   # categories, causes, and the severity matrix
│   └── frameworks/         # empty by default — overrides for the shipped vocabularies
├── schedule.yml          # recurring activities that no single document owns
├── policies/ standards/ processes/ runbooks/ playbooks/ guidelines/
├── decisions/ roles/ vendors/ threats/ threat-models/ risks/
└── exceptions/2026/ gaps/2026/ incidents/2026/     # dated types, always partitioned
```

Rules `check` enforces: the year partition is a property of the type, not a choice; the filename is the id; the id prefix matches the folder; no binaries anywhere in `program/`.

→ [adr-folders-are-storage-not-ontology](adrs/adr-folders-are-storage-not-ontology.md) · [adr-lowercase-prefixed-ids](adrs/adr-lowercase-prefixed-ids.md)

## Document types

| Type | Prefix | What it is |
|---|---|---|
| Policy | `pol-` | The what and why. Approved, rarely changed. |
| Standard | `std-` | Numbered requirements, each carrying its framework mappings. |
| Process | `pro-` | Human step-by-step procedure. |
| Runbook | `rb-` | Executable procedure, agent-friendly. |
| Playbook | `pb-` | Incident-response procedure. |
| Guideline | `gl-` | Recommended practice. Advisory. |
| Decision | `dec-` | A decision and the reasoning behind it. Immutable. |
| Role | `role-` | The accountable role every owner field points at. |
| Vendor | `vnd-` | Third-party assessment, reassessed on its `next_review`. |
| Threat | `thr-` | Generic threat scenario. |
| Threat model | `tm-` | STRIDE/PASTA analysis of a system or feature. |
| Exception | `exc-` | An approved deviation from a requirement, with an expiry. |
| Gap | `gap-` | An unapproved shortfall against a requirement. |
| Incident | `inc-` | Post-incident record. Immutable. |
| Risk | `rsk-` | Optional. Content here, lifecycle in the tracker. |

**Requirement, exception, gap** are one triangle. A requirement inside a standard is the norm. An exception is a deviation someone with authority approved, with an expiry. A gap is a deviation nobody approved, pending remediation or conversion into an exception. A shortfall with no written requirement behind it is not a gap — either the standard is missing, or it was a risk.

→ [adr-gaps-are-documents-not-a-register](adrs/adr-gaps-are-documents-not-a-register.md)

## Frontmatter

Every document declares its identity (`id`, `type`, `title`, `description`), its lifecycle (`status`, `owner`, `version`, `last_reviewed`, `next_review` — immutable types carry a single date instead, and `gap` and `exception` carry no `status` at all because theirs is computed from write-once facts), its facets (`domains`, `capabilities`, `systems`, all multivalued, all validated against `model/`), and its relations (`related`, a flat list of ids whose types are derived from their prefixes).

Bulky material is never committed: `evidence:` carries named links to wherever it actually lives.

`schemas/frontmatter.schema.json` is the machine-readable source of truth; `templates/` is the readable one.

## Lenses

The repository is neutral and nobody navigates folders. Each lens is a computed projection of the same documents for one audience.

| Lens | Answers |
|---|---|
| Program | What documents exist? |
| Domains | What have we written about IAM? |
| Compliance | Clause → requirement → open gap or live exception. |
| Evidence | What can this program prove, and what has gone stale. |
| Schedule | What expires: reviews due, exceptions running out, gaps left unremediated. |
| Doc | One document, what it relates to, and the verb on each link. |

## Publishing

One direction, always: git → destination. A published page is a render carrying a "generated from `pol-x` — edit in git" banner. What comes back from a destination is human comment, collected as input, never merged as content. `publish.yml` declares the destinations and the default per type; a document overrides with `publish: none | all | [confluence]`. The framework ships the contract and its validation; the sync tool is a separate product.

→ [adr-one-way-publishing](adrs/adr-one-way-publishing.md)

## Decisions

The narrative above never grows. Every new decision about the framework is born as an ADR in `adrs/` and gets one line here. A program's own decisions are `decision` documents in its repository, not these.

| ADR | Decision |
|---|---|
| [adr-folders-are-storage-not-ontology](adrs/adr-folders-are-storage-not-ontology.md) | Folders name the document type; every classification is a facet. |
| [adr-truth-boundaries](adrs/adr-truth-boundaries.md) | The repository owns the norm; the tracker owns lifecycle; the estate owns reality. |
| [adr-no-capability-assessment](adrs/adr-no-capability-assessment.md) | No maturity, no capability coverage — capabilities are a checklist and a vocabulary. |
| [adr-gaps-are-documents-not-a-register](adrs/adr-gaps-are-documents-not-a-register.md) | A gap is a document against a requirement, closed by write-once facts. |
| [adr-the-admission-test](adrs/adr-the-admission-test.md) | Only owned, expiring, auditable documents enter `program/`. |
| [adr-one-way-publishing](adrs/adr-one-way-publishing.md) | Publishing flows out of git only; bidirectional sync is rejected. |
| [adr-lowercase-prefixed-ids](adrs/adr-lowercase-prefixed-ids.md) | Ids are lowercase, prefixed, equal to the filename; `related` is flat. |
| [adr-record-not-evidence](adrs/adr-record-not-evidence.md) | The repository holds the record; evidence is linked, never committed. |

## Related files

| File | What it covers |
|---|---|
| `instantiation.md` | Creating and updating your own program |
| `compliance.md` | Standards, requirements, framework coverage |
| `glossary.md` | Controlled vocabulary |
| `adrs/` | Every decision above, in full |
| `schemas/` | Frontmatter, vocabularies, publishing contract |
| `templates/` | A starting point for every document type |
