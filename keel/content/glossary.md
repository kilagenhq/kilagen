# Glossary

The controlled vocabulary of the framework: document types, structural terms,
and the words this product uses with a narrower meaning than usual.

It does not list capability definitions — those are in
`program/model/capabilities.yml`, which is the instance's own vocabulary.

## Document types

Each type is a folder under `program/`, an id prefix, and a schema branch.

| Type | Prefix | What it is |
|---|---|---|
| Policy | `pol-` | What the organization intends, and who may issue standards. |
| Standard | `std-` | Numbered requirements, each carrying its framework mappings. |
| Process | `pro-` | A human step-by-step procedure. |
| Runbook | `rb-` | An executable procedure, written so an agent can follow it. |
| Playbook | `pb-` | An incident-response procedure. |
| Guideline | `gl-` | A recommended practice. Advisory, not enforceable. |
| Decision | `dec-` | A decision and its reasoning. Immutable; superseded, never edited. |
| Role | `role-` | The accountable role every ownership field points at. |
| Vendor | `vnd-` | A third-party assessment, reassessed on its `next_review`. |
| Threat | `thr-` | A generic threat scenario. |
| Threat model | `tm-` | A STRIDE/PASTA analysis of a system or feature. |
| Data asset | `da-` | An information asset and how it must be handled. |
| Business process | `bp-` | A business process and what breaks if it stops. |
| Risk | `rsk-` | A risk. Optional: content here, lifecycle in the tracker. |
| Exception | `exc-` | An approved deviation from a requirement, with an expiry. |
| Gap | `gap-` | An unapproved shortfall against a requirement. |
| Incident | `inc-` | A post-incident record. Immutable. |

## Structural terms

**Facet.** A classification carried in frontmatter and validated against a
closed vocabulary in `program/model/`: `domains`, `capabilities`, `systems`.
All are multivalued, because real documents span more than one.

**Domain.** A functional area of a security program — IAM, AppSec, SecOps. A
label on a document, never a folder.

**Capability.** A named, bounded security function within a domain, namespaced
`<domain>.<capability>`. It is the menu of what a program can build and the
facet documents are grouped by. It carries no assessment.

**System.** An id and a name. What is actually deployed, how it is configured
and who uses it is the estate's truth, not this repository's.

**Requirement.** A numbered item inside a standard, addressable as
`<standard-id>#<ref>`. Framework clauses map to it; gaps and exceptions are
filed against it.

**Lens.** A computed projection of the same documents for one audience —
Browse, Domains, Compliance, Schedule, Doc. The repository is neutral;
nobody navigates folders.

**Partition.** A year directory under a dated type (`gaps/2026/`). It splits
storage, never the namespace: ids stay unique across the whole program.

**Write-once fact.** A date that records that something happened and is never
revised: `remediated:`, `revoked:`, `decided:`, `occurred:`. Used wherever a
mutable status would otherwise mirror a truth the tracker owns.

**Evidence.** A named link to material held outside the repository. The record
lives here; the bulk does not, and no binary is committed.

## Coverage

**Coverage.** Whether a framework clause has a requirement mapped to it. The
only coverage computed, because a framework's clause list is an external,
finite denominator.

**Posture.** A judgement about whether a clause is *met*. The generator may
assert exactly one, `not-assessed`, and only where nothing maps at all.
Everything else is a human's to write down.

**Binding.** Who checks a framework: `mandatory` (a law, a regulator or a
contract requires it), `voluntary` (you audit yourself and assert conformity),
or `reference` (guidance you assert nothing against).

## Acronyms

**ADR** — Architecture Decision Record. The framework's own decisions about
itself, shipped in `keel/adrs/`. A program's own decisions are `decision`
documents (`dec-`) in its repository.
**CMDB** — Configuration Management Database; the inventory of what is deployed.
**GRC** — Governance, Risk and Compliance.
**IdP** — Identity Provider.
**SoD** — Segregation of Duties.
**STRIDE** — Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.
