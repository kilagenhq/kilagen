# Compliance Strategy — The Two-Level GRC Model

This document describes how the framework handles regulatory compliance. For overall framework design, see `design.md`.

## The two levels

1. **Policy** establishes objectives (what we want).
2. **Standard** implements those objectives with numbered requirements (what must be done and how we prove it).

Each standard contains requirements in the body text (e.g. 5.1, 5.2). Each requirement can carry framework mappings (`frameworks: {<id>: [clauses]}`) in the frontmatter `requirements:` array — the requirements are the single source of these mappings. The coverage map (`01-grc/compliance/coverage.yml`) is a **derived view**: generated from those mappings plus each framework's clause vocabulary, it classifies every clause of each in-scope framework that has a vocabulary file as mapped or unmapped but stores no mapping of its own (an in-scope framework with no vocabulary file is skipped with a warning, not classified). It records coverage, not whether a clause is met.

## Traceability chain

```
Regulatory clause NIST CSF PR.PS-01  (defined in program/frameworks/nist_csf.yml)
  ← mapped by STD-vulnerability-management req 5.1 (frameworks.nist_csf: ["PR.PS-01"])
    → requirement text + evidence in the standard body
      → applies_to: [appsec, infra] → capabilities: sast, sca, vuln-management
        → systems: SYS-github-advanced-security, SYS-trivy
```

## Standards and requirements

- A **Standard** (`STD-*`) lives in `01-grc/standards/`. Its body has a "Requirements" section with numbered entries and an "Evidence" section.
- A **Requirement** is a numbered item inside a standard. Requirements are not separate files. Each can optionally map to regulatory framework clauses. Requirements without mappings are internal.

Standards declare `applies_to:` listing which operational domains their requirements affect. The domains contain the runbooks, processes, and configurations that **implement** the requirements.

## Gaps and exceptions

A requirement that is not met is either a **gap** or an **exception**:

| | Gap | Exception |
|---|---|---|
| **What** | Not met — must be remediated | Approved deviation with compensating controls |
| **Lifecycle** | Open → remediate → close | Approve → review → renew, revoke, or expire |
| **Where** | External ticket system via `gap_link:` on the standard | `01-grc/exceptions/EXC-*.md` in the repository |
| **Status** | Ticket system states | `active`, `expired`, `revoked` |
| **Link** | `gap_link` on standard → ticket filter | `standard` + `requirement_ref` on exception → standard; `related.exceptions` on standard → exception |

When all gaps on a standard are resolved, `gap_link` is removed.

## Threats and risks

- **Threats** (`THR-*`) catalog generic threat scenarios relevant to the organization.
- **Risks** (`RSK-*`) evaluate impact if a threat materializes. When a risk reveals no standard covers a required area, that is a gap — tracked via `gap_link`.

## Framework mappings and coverage

Frameworks are declared in `config.yml`, not hard-coded.

- **Mappings** live on standard requirements: `frameworks: {<id>: [clause refs]}`, keyed by the framework's `config.yml` id.
- **Vocabulary** — each framework has a clause list at `program/frameworks/<id>.yml`. It holds clause references only; the regulatory text stays at the framework's `url`.
- **Scope** — the `config.yml` `frameworks:` list, with each entry's binding level, is what coverage is measured against.
- **Coverage** — `generate_coverage.py` writes `01-grc/compliance/coverage.yml`, keyed by framework id: each in-scope clause is `coverage: mapped` (one or more requirements map to it) or `coverage: unmapped` with `posture: not-assessed`. Always auto-generated; never edit by hand.
- **Adding a framework** — add it to `config.yml`, create `program/frameworks/<id>.yml`, and add `frameworks:` clauses to the relevant requirements; coverage regenerates.

### Coverage is not compliance

Coverage records only whether a clause has a mapping — never whether it is *met*. A requirement that maps to a clause may address it partially; sufficiency is a human assessment, not a generated fact. The generator therefore asserts a single posture, `not-assessed`, and only on unmapped clauses; `met`, `gap`, and `exception` are human judgments that live elsewhere (gaps via `gap_link`, exceptions as `EXC-*`).

### Framework binding levels

Each framework in `config.yml` declares a `binding` level:

- **`mandatory`** — a legal or regulatory requirement. Non-compliance is a violation.
- **`comply-or-explain`** — the regulator expects compliance but accepts justified deviations.
