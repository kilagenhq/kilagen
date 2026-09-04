# Kilagen — Framework Design

> **No PII.** This repository must never contain personal data beyond role-based attributions. Ownership fields (`owner`, `second_owner`, `approved_by`, `reviewed_by`) reference role slugs (e.g. `role-cto`) defined in `program/roles/`, not personal names. Never commit personal email addresses, phone numbers, government IDs, or other personal contact data.
>
> **Scope of this repository.** This repo contains the framework (`keel/`) only.
> The `program/` layer referenced throughout this document is the *instance* you
> build in your own repository (see `instantiation.md`) — it is not included here.
> The layout below shows an instance's combined view (framework + program), not
> this repo's contents.

## Purpose

A single source of truth for a company's security program, serving (in priority order): AI agents, the security team, and auditors.

## Related files

This file covers the structural design. Detailed topics live in dedicated files to keep each one focused:

| File | What it covers |
|---|---|
| `compliance.md` | Two-level GRC model, standards and requirements, gaps vs exceptions, framework mappings, coverage |
| `lenses.md` | Alternative projections over program data (e.g. NIST CSF), the `lenses` field, coverage calculation |
| `instantiation.md` | How to instantiate, what lives where, root-level files, first steps |
| `maturity.md` | L0–L5 graduation criteria with examples |
| `glossary.md` | Controlled vocabulary — document types, framework concepts, acronyms |
| `schemas/` | JSON Schema for frontmatter, `capabilities.yml`, `gaps.yml`, and the framework clause vocabularies (`program/frameworks/*.yml`) — the machine-readable source of truth for all fields |
| `templates/` | Starter files for every document type — the human-readable source of truth for field usage |

## Design principles

1. **Functional domains over org chart.** Structure mirrors how security teams actually work. Consistent subfolders inside each domain mean agents learn the pattern once and apply it everywhere.
2. **Standards are centralised in `01-grc/standards/`.** They are governance documents, not operational ones. The full compliance model (policies → standards → requirements → framework mappings) is described in `compliance.md`.
3. **Systems live at the repo root.** All `SYS-*.md` live in `/systems/` regardless of domain. This handles multi-domain systems cleanly.
4. **Single home, many links.** Each doc lives in one owning domain. Relevance elsewhere is expressed via links and `related:` frontmatter, never duplication.
5. **On-demand subfolders.** A subfolder only exists when its first real file is committed. No `.gitkeep` placeholders.
6. **No empty stubs.** Missing file > empty file.
7. **Capabilities are first-class.** Each domain has `capabilities.yml` with maturity levels — the program-management layer. See section "Capability model" below.
8. **Humans write content; robots do bookkeeping.** Link-checking, registry regeneration, coverage generation, and schema validation are automated in CI.

## Repository layout

`keel/` is the reusable framework. `program/` is the instance content.

```
kilagen/
├── CLAUDE.md                   # AI entry point
├── README.md                   # Repo map
├── keel/                    # Reusable framework (design, schemas, templates, dashboard, scripts)
├── program/                    # Instance content
│   ├── config.yml
│   ├── 01-grc/                 # Policies, standards, risk, compliance
│   ├── 02-iam/                 # Identity, access, MFA
│   ├── 03-infra/               # Cloud, network, endpoint, patching
│   ├── 04-appsec/              # SDLC, threat models, secrets
│   ├── 05-secops/              # SOC, logging, detections, SIEM
│   ├── 06-ir/                  # IR plan, playbooks, runbooks
│   ├── 07-offensive/           # Pentest, bug bounty, red team
│   ├── 08-digital-assets/      # Custody, keys, smart contracts
│   ├── 09-awareness/           # Training, phishing, education
│   ├── 10-data-security/       # Classification, DLP, DSPM, KMS, backup
│   ├── schedule.yml            # Recurring security activities (annual calendar)
│   ├── gaps.yml                # Open/remediated gaps against STD-* requirements
│   ├── risk-taxonomy.yml       # Enterprise risk classification vocabulary (cited by RSK-*)
│   ├── frameworks/             # <id>.yml clause vocabularies (coverage denominator)
│   ├── systems/                # SYS-* — ALL systems live here
│   └── adr/                    # Architecture Decision Records
└── .github/workflows/          # CI
```

## Domain structure

Every domain folder follows the same convention:

```
XX-domain/
├── README.md         # Scope, cross-domain notes
├── capabilities.yml  # Source of truth for capabilities and maturity
├── standards/        # STD-*
├── processes/        # PRO-*
├── runbooks/         # RB-*
├── guidelines/       # GL-*
└── threat-models/    # TM-*
```

`README.md` and `capabilities.yml` always exist. Other subfolders appear on demand — create the subfolder together with its first file, never empty.

### Domain exceptions

**`01-grc/`** adds: `policies/` (POL-\*), `threats/` (THR-\*), `risks/` (RSK-\*), `compliance/` (auto-generated `coverage.yml`), and `exceptions/` (EXC-\*).

**`06-ir/`** adds `playbooks/` (PB-\*) and retains `runbooks/` (RB-\*) for non-incident operational procedures.

**`01-grc/`** also contains `vendors/` (VEN-\*) for third-party risk profiles.

**`08-digital-assets/`** adds `ceremonies/`, `wallet-operations/`, and `smart-contracts/`.

## Document types

Every document is one of these types, forming an abstract-to-concrete hierarchy:

| Type | Prefix | Purpose |
|---|---|---|
| Policy | `POL-` | The *what* and *why*. Board-approved. |
| Standard | `STD-` | Numbered requirements with framework mappings. In `01-grc/standards/`. |
| Process | `PRO-` | Human step-by-step process. |
| Runbook | `RB-` | Executable process (agent-friendly). |
| Playbook | `PB-` | Incident response runbook. In `06-ir/playbooks/`. |
| Threat | `THR-` | Generic threat scenario. In `01-grc/threats/`. |
| Threat Model | `TM-` | STRIDE/PASTA analysis of a feature or system. |
| Guideline | `GL-` | Recommended practice with examples. |
| System | `SYS-` | Operational view of a system. In `systems/`. |
| Vendor | `VEN-` | Third-party risk profile. In `01-grc/vendors/`. |
| Risk | `RSK-` | Risk register entry. In `01-grc/risks/`. |
| Exception | `EXC-` | Approved deviation from a requirement. In `01-grc/exceptions/`. |
| Data Asset | `DA-` | Information asset inventory entry. In `data-assets/`. |
| Business Process | `BP-` | Business process inventory with BIA data. In `business-processes/`. |
| Role | `role-` | Organizational role that owns artifacts (data, systems, processes, risks, documents). In `roles/`. Ownership fields (`owner`, `second_owner`, `approved_by`, `reviewed_by`) reference these via their `role-*` ids. |
| ADR | `ADR-NNNN-` | Architecture decision (immutable). |
| Incident | `INC-YYYY-` | Postmortem (immutable). |

**Where does this go?** Ask in order: stable principle → Policy; auditable requirement → Standard; approved deviation → Exception; human process → Process; executable → Runbook; recommended practice → Guideline; system state → System; third-party profile → Vendor; organizational role → Role; decision rationale → ADR.

### Version control and revision history

Not all document types carry the same audit burden. The table below defines which types require formal version tracking:

| Type | `version:` in frontmatter | Revision History section | Rationale |
|---|---|---|---|
| POL-\*, STD-\* | Yes | Yes | Formally approved documents; auditors require version traceability |
| PRO-\* | No | Yes | Operational procedures; revision history provides annual review evidence |
| GL-\* | No | No | Advisory content; `last_reviewed` in frontmatter is sufficient |
| Role | No | No | Role profiles; no `last_reviewed` — incumbent state lives in HR system via `managed_externally` |
| All others | No | No | Registry/inventory data tracked by `last_reviewed` only |

### Scheduled activities (`schedule.yml`)

`program/schedule.yml` tracks recurring security activities that are **not** document reviews — pentests, DR tests, audits, training, architecture reviews, etc. Document reviews are tracked separately via `last_reviewed` / `next_review` in each document's frontmatter.

Each activity has:

| Field | Description |
|---|---|
| `id` | Unique identifier (kebab-case) |
| `name` | Human-readable activity name |
| `frequency` | `annually`, `every-2-years`, `semi-annually`, `quarterly` |
| `owner` | Role responsible (e.g. `security-eng`, `cto`) |
| `domain` | Which security domain this activity belongs to |
| `last_completed` | Date when last executed (YYYY-MM-DD) |
| `tracker` | URL to the Jira task tracking this activity (optional) |
| `related` | List of document IDs that this activity relates to (optional) |

The next due date is computed automatically by the dashboard as `last_completed` + `frequency`. Only update `last_completed` when the activity is done.

The dashboard renders this as a quarterly grid in the **Schedule** view, showing completed, due, and overdue activities at a glance. Each quarter cell shows a color-coded date label indicating the activity status.

### Gaps register (`gaps.yml`)

`program/gaps.yml` records open and remediated gaps — unapproved shortfalls against a specific requirement. A gap is distinct from an exception (an approved deviation, `EXC-*`) and from a finding (a point-in-time observation that stays in the tracker until it is triaged into a requirement-level gap).

Each gap has:

| Field | Description |
|---|---|
| `id` | Unique identifier (kebab-case, `gap-` prefix) |
| `title` | Human-readable summary of the shortfall |
| `requirement` | The `STD-*` requirement the gap falls short of (`STD-<slug>#<number>`) |
| `domain` | Which security domain the gap belongs to |
| `owner` | Role responsible for remediation (e.g. `role-security-eng`) |
| `source` | How it was identified: `risk-assessment`, `audit`, `pentest`, `bug-bounty`, `threat-model`, `internal` |
| `severity` | Five-tier scale (`negligible`–`critical`), inherited from the risk framework |
| `tracker_id` | Immutable Jira issue key (e.g. `TS-123`) — the stable correlation key between the gap and the tracker (unique per gap) |
| `tracker` | URL to the Jira task tracking remediation |
| `opened` | Date the gap was recorded (YYYY-MM-DD) |
| `status` | `open` or `closed` — mirrors the tracker, nothing richer |
| `status_updated` | Date `status` was last set |
| `closed_at` | Date the gap was closed (optional) |
| `closure_note` | One-line note on what resolved it (optional) |
| `related` | Document IDs the gap relates to, keyed by type — `risks` (`RSK-*`), `threats` (`THR-*`), `systems` (`SYS-*`), `processes` (`PRO-*`), `exceptions` (`EXC-*`) (optional) |

The repository owns which gaps exist and what they relate to; the tracker owns their operational state. `tracker_id` is the immutable key the future sync correlates on — the `tracker` URL is human convenience and may change, but `tracker_id` does not. `status` mirrors open/closed only. Closed gaps are retained — never deleted — so the remediation record and recurrence against a requirement stay visible.

The dashboard derives compliance status from gaps, exceptions (`EXC-*`), and `capabilities.yml`, and projects it onto frameworks through lenses; no standard, framework, or maturity level is set by hand. Severity and treatment vocabulary are inherited from `STD-risk-framework`.

Schema: `schemas/gaps.schema.json`. Template: `templates/gaps.yml`.

### Systems vs. vendors

Both may exist for the same product — that is intentional. They serve different audiences:

- **`SYS-*`** = operator's view (config, integrations, capabilities). Lives at `/systems/` because one system often spans multiple domains.
- **`VEN-*`** = risk evaluator's view (tier, certs, data scope, contract). Lives at `01-grc/vendors/`.

They link to each other: `SYS-*` carries `vendor:` in frontmatter, `VEN-*` carries `system:`.

| Scenario | SYS-*? | VEN-*? |
|---|---|---|
| Third-party SaaS security tool | Yes | Yes |
| Free/OSS or bundled security tool | Yes | No |
| Self-hosted internal tool | Yes | No |
| Business app where security configures controls | Yes (`category: business-app`) | Yes |
| Business app with no security touchpoint | No | Yes |

## Capability model

A **capability** is a named, bounded security function within a domain (e.g. SAST in `04-appsec`, IdP in `02-iam`). Every domain declares its capabilities in `capabilities.yml` — the source of truth for what the domain covers and how mature it is.

Maturity = how well does it work?

| Value | Meaning |
|---|---|
| `L0-none` | Nothing exists. |
| `L1-ad-hoc` | Exists but depends on human memory. |
| `L2-defined` | Documented, tool chosen, unreliable execution. |
| `L3-integrated` | Wired into CI/pipelines, automatic. |
| `L4-measured` | Continuous metrics, alerts on degradation. |
| `L5-optimizing` | Feedback loop from incidents and threat models. |

Full graduation criteria: `maturity.md`. Schema: `schemas/capabilities.schema.json`. Template: `templates/capabilities.yml`.

**Connections:** `SYS-*` frontmatter carries a `capabilities:` map keyed by domain — CI validates against each domain's `capabilities.yml`. Domain READMEs contain only narrative; `capabilities.yml` is the single source of truth. Deep-dive content (vendor evals → ADR; migration plans → runbook; metrics → external dashboards).

## Risk taxonomy

`risk-taxonomy.yml` is the **enterprise** risk taxonomy — the controlled vocabulary for classifying *all* risks the business runs (financial, strategic, operational, compliance, legal, reputational, and information-security among them), calibrated to the instance, in two branches: **Categories** (the *kind* of risk, nested broad to specific) and **Causes** (the *root causes* that let an event develop).

Kilagen covers a **subset** of the enterprise picture:

- **`RSK-*` are information-security risks** — a subset of the operational-risk → information-security category branch in the taxonomy. Non-security enterprise risks (e.g. market, liquidity, strategic) sit in the taxonomy but have no `RSK-*` documents here.
- **`THR-*` are information-security threats** — the threat-actor / threat-event side of the same domain. A `THR-*` is what drives an `RSK-*`; the same underlying factor can appear both as a `root_cause` slug and a `THR-*` doc (they overlap by role, not membership).

`RSK-*` cite the taxonomy via `risk_category` and `root_causes`, and link the threats that drive them via `related.threats`. CI validates that cited entries resolve and that `THR-*`↔`RSK-*` links are reciprocal.

The dashboard renders the taxonomy in the **Risk Framework** view.

## ID scheme

IDs are **stable forever**. Slugs may change; IDs never do. Cross-references use IDs.

- **Slug-based** for most types: `POL-information-security`, `STD-vulnerability-management`, `SYS-github-advanced-security`.
- **Numbered** only for immutable time-series: `ADR-0026-adopt-mpc-custody`, `INC-2026-phishing-campaign`.
- Unique across the entire repo (CI enforces). Once created, never deleted or renamed — supersede instead.

## Frontmatter

Every document has YAML frontmatter validated in CI against `schemas/frontmatter.schema.json`. See `templates/` for full examples per type.

Key design decisions:

- **`description`** is the most important field for AI retrieval. Keep it action-oriented, 1-2 sentences.
- **`SYS-*` uses `domains:` (plural list)** instead of `domain:` (singular).
- **`EXC-*` uses its own status enum** (`active`, `expired`, `revoked`).
- **`INC-*` and `ADR-*` carry `immutable: true`.** CI blocks edits except via supersede.
- **Cross-referencing:** use relative markdown links in body text; use the `related:` frontmatter object for semantic refs by ID. CI validates both.

## CI and automation

- **Source of truth: this repo.** Not a wiki, not a shared drive.
- **Reviews** enforced by `next_review` frontmatter — weekly CI opens issues for overdue docs.
- **Coverage is classification only** — CI fails if `coverage.yml` carries a `met`/`gap`/`exception` posture, if the coverage generator reads or writes a gaps register, or if a requirement's framework clause resolves to no vocabulary entry.

| Workflow | Trigger | What it validates |
|---|---|---|
| lint | PR | markdownlint, codespell, frontmatter / capabilities / gaps / framework-vocab schemas, framework coverage references, generated-artifact freshness |
| link-check | PR + weekly | lycheeverse/lychee on all links |
| semantic-refs | PR | runs the script unit-test suite (incl. coverage/posture firewall guards), then: capability refs in SYS-* exist in capabilities.yml; systems refs resolve; related IDs resolve; gap `id`/`tracker_id` unique, `requirement`/`owner`/`related` resolve, enums valid, dates ordered (`opened` ≤ `status_updated` ≤ `closed_at`) |
| review-watch | weekly | reports overdue `next_review` documents (fails if any found) |

## How to add a new document

1. Pick the type and domain. Systems → `/systems/`. Vendors → `01-grc/vendors/`.
2. Copy the matching template from `keel/templates/`.
3. Choose a slug; CI validates uniqueness.
4. Fill frontmatter — especially `description`.
5. Link to related docs by ID.
6. For `SYS-*`: ensure every capability in its `capabilities:` map exists in the domain's `capabilities.yml`; update that file's `systems:` list.
7. Open PR. CI validates everything.

**Prefer writing nothing to writing a stub.**
