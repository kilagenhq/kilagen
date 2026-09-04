# Capability Maturity Model Reference

This scale applies to every capability in every domain's `capabilities.yml`. Values are stored with the ordinal and name combined (e.g. `L3-integrated`) so they are self-describing wherever they appear. The scale is adapted from CMM (Capability Maturity Model).

## L0-none

**No tooling or process exists.**

The capability is acknowledged in the domain's `capabilities.yml` but nothing has been built, bought, or documented for it.

Examples from the domain inventory:

- SOAR in `05-secops`: no platform deployed; ad-hoc scripts only.
- AI SOC triage in `05-secops`: under evaluation, no implementation.
- Internal red team in `07-offensive`: no dedicated team exists.

**Graduation criteria to L1:** a person or team has started working on the capability — even if only with manual scripts or a proof of concept.

## L1-ad-hoc

**Exists but depends on human memory. Scripts unmaintained.**

Someone has built or bought something, but it runs inconsistently. If that person leaves, the capability degrades.

Examples:

- IGA in `02-iam`: scripts extract access data and create tickets, but they depend on one engineer's local setup.
- Vendor risk management in `01-grc`: lives in a Google Sheet maintained manually.

**Graduation criteria to L2:** the process is documented, a tool is chosen, and there is a defined owner.

## L2-defined

**Process documented, tool chosen, executes but unreliably.**

There is a written process or runbook and a selected tool, but execution is inconsistent — it may fail silently, skip environments, or require manual triggering.

Examples:

- Detection engineering in `05-secops`: CrowdStrike built-in detections exist but no custom detection-as-code; coverage depends on vendor defaults.
- Smart contract SDLC in `08-digital-assets`: Slither, Echidna, and Foundry are proposed but not yet wired into CI.
- DAST in `04-appsec`: Nuclei runs weekly but only against the public surface; no full-crawl automated testing.

**Graduation criteria to L3:** the tool runs automatically on every relevant change or event, integrated into CI/CD or the operational pipeline.

## L3-integrated

**Wired into CI/pipelines, runs on every relevant change.**

The capability executes automatically as part of the standard workflow. No one has to remember to run it.

Examples:

- SAST in `04-appsec`: Semgrep runs in pre-commit hooks and CI on every repository.
- EDR in `03-infra`: CrowdStrike Falcon Sensor deployed on all endpoints with real-time detection.
- SIEM in `05-secops`: CrowdStrike LogScale ingests logs from all defined sources continuously.

**Graduation criteria to L4:** continuous metrics are collected (MTTR, false positive rate, coverage percentage), and alerts fire when the capability degrades.

## L4-measured

**Continuous metrics, alerts on degradation.**

The capability not only runs but is instrumented. You know how well it works, and you notice when it stops working well.

Examples:

- SAST at L4 would mean: coverage percentage per repo tracked in a dashboard, false positive rate measured weekly, alert if a repo stops running scans.
- EDR at L4 would mean: sensor deployment coverage tracked per fleet, alert if coverage drops below threshold, MTTR for endpoint isolation measured.

**Graduation criteria to L5:** metrics feed back into the capability itself — incident findings trigger new rules, threat model updates refine scan scope.

## L5-optimizing

**Active feedback loop from incidents and threat models.**

The capability continuously improves based on real-world signals. Postmortems create new detections. Threat models refine scan rules. Pentest findings update baselines.

Examples:

- Detection engineering at L5: every postmortem produces at least one new detection rule; rule efficacy is measured; stale rules are retired.
- SAST at L5: custom rules are written for each new threat model finding; false positives are tracked per rule and rules with high FP rates are tuned or removed.

**Graduation criteria:** none — L5 is the ceiling. The goal is to sustain the feedback loop.
