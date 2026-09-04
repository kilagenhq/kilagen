# Glossary

Controlled vocabulary for the Kilagen framework. Each term has a short definition and, where relevant, a pointer to where it is used.

This glossary covers **framework concepts** — document types, structural terms, and universal security acronyms. It does not list capability definitions (those live in each domain's `capabilities.yml`) or regulatory terms specific to a jurisdiction (those live in `01-grc/`).

## Document types and prefixes

**ADR** (`ADR-NNNN-`). Architecture Decision Record. Immutable document capturing the why behind a design or tooling decision. Lives in `/adr/`.

**Standard requirement**. A numbered item within a standard (e.g. 5.1). Carries framework mappings (`frameworks:`) to regulatory clauses, feeding the auto-generated coverage map.

**Guideline** (`GL-`). Recommended practice with examples. Advisory, not enforceable. Lives in the owning domain's `guidelines/` subfolder.

**Incident** (`INC-YYYY-`). Immutable post-incident review (postmortem). Lives in `06-ir/postmortems/`.

**Playbook** (`PB-`). Incident response runbook with severity matrix, containment, eradication, and recovery steps. Lives in `06-ir/playbooks/`.

**Policy** (`POL-`). Board-approved principle stating the what and why. Lives in the owning domain's `policies/` subfolder.

**Process** (`PRO-`). Human step-by-step process. Lives in the owning domain's `processes/` subfolder.

**Risk** (`RSK-`). Entry in the risk register. Lives in `01-grc/risks/`.

**Runbook** (`RB-`). Executable process designed to be run by an agent with minimal human judgement. Lives in the owning domain's `runbooks/` subfolder.

**Standard** (`STD-`). Enforceable technical requirement. Auditable and testable. Lives in the owning domain's `standards/` subfolder.

**System** (`SYS-`). Ground truth of a current system or service. Lives in `/systems/` at the repo root, never inside a domain folder.

**Threat Model** (`TM-`). STRIDE/PASTA analysis of a feature or system. Lives in the owning domain's `threat-models/` subfolder.

**Vendor** (`VEN-`). Third-party risk profile. Lives in `01-grc/vendors/`.

## Framework concepts

**Capability**. A named, bounded security function within a domain (e.g. SAST, IdP, SIEM). Declared in `capabilities.yml` with a maturity level.

**Domain**. A functional area of the security program (e.g. IAM, AppSec, SecOps). Numbered `01-` to `10-` in the repo. Each domain has a `capabilities.yml` and optional subfolders for document types.

**Lens**. An alternative projection over the framework data for a different audience. Defined by a taxonomy file in `keel/lenses/` and `lenses:` tags in documents and capabilities.

**Maturity level**. How well a capability works, on a scale from L0 (nothing) to L5 (optimizing). See `maturity.md` for graduation criteria.

**Related**. The `related:` frontmatter object that expresses semantic links between documents by ID. CI validates that all referenced IDs exist.

## Universal acronyms

**AML**. Anti-Money Laundering. Regulatory requirements and processes to prevent financial crime.

**CMM**. Capability Maturity Model. Framework originally developed by Carnegie Mellon's SEI to measure process maturity. The L0-L5 maturity scale in this framework (see `maturity.md`) is adapted from CMM for security capabilities.

**CVE**. Common Vulnerabilities and Exposures. Standardized identifier for publicly known security vulnerabilities.

**HSM**. Hardware Security Module. Tamper-resistant device for cryptographic key storage and operations.

**IOC**. Indicator of Compromise. Observable artifact (IP, hash, domain) indicating a potential security breach.

**ISO 27001:2022**. International standard for Information Security Management Systems (ISMS). Annex A provides a control catalogue.

**JML**. Joiner-Mover-Leaver. Identity lifecycle process covering onboarding, role changes, and offboarding.

**MISP**. Malware Information Sharing Platform. Open-source threat intelligence platform for sharing IOCs.

**NIST CSF 2.0**. NIST Cybersecurity Framework version 2.0. Functions: Govern, Identify, Protect, Detect, Respond, Recover.

**OWASP**. Open Worldwide Application Security Project. Non-profit producing application security guidance including the Top 10.

**PCI DSS 4.0**. Payment Card Industry Data Security Standard version 4.0. Requirements for entities handling cardholder data.

**SDLC**. Software Development Lifecycle. The process of planning, creating, testing, and deploying software.

**SOC** (security operations). Security Operations Centre. Team and facility responsible for monitoring and responding to security events.

**SOC 2**. Service Organization Control 2. AICPA audit standard for service providers, based on Trust Services Criteria.

**STRIDE**. Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege. Microsoft threat modelling framework.

**TIP**. Threat Intelligence Platform. System for aggregating, enriching, and sharing threat intelligence (e.g. MISP).
