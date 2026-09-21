---
id: adr-lowercase-prefixed-ids
type: adr   # the framework's own convention, not a program document type
title: "Lowercase prefixed ids, equal to the filename, with a flat related list"
description: >
  Ids are lowercase kebab-case carrying their type prefix and matching their filename;
  related is a flat list because the prefix already says the type.
status: active
owner: role-maintainer
decided: 2026-09-18
related: [adr-folders-are-storage-not-ontology, adr-gaps-are-documents-not-a-register]
---

# Lowercase prefixed ids, equal to the filename, with a flat related list

## Context

Ids were uppercase for most types (`POL-information-security`, `STD-access-control`) and lowercase for roles (`role-security-owner`). Two types were numbered as well as named (`ADR-0026-adopt-mpc-custody`, `INC-2026-phishing-campaign`).

Mixed case is a genuine defect, not a matter of taste. It reads badly next to the YAML and URLs it sits in, it has to be remembered in both directions, and on a case-insensitive filesystem — which is the default on macOS — a reference that differs only in case resolves locally and fails in Linux CI. That class of bug is invisible on the machine where the document was written.

Sequential numbering has its own cost: the number must be allocated, two branches allocate the same one, and it carries no information a date field does not carry better.

Separately, `related:` was a mapping grouped by target type:

```yaml
related:
  policies: [POL-information-security]
  exceptions: [EXC-legacy-vpn-mfa]
```

The grouping is redundant — the prefix already says what the target is — and worse, it can lie. The validator checked that each id existed, not that it sat under the matching group, so an exception filed under `policies:` passed CI and rendered wrong.

## Decision

Ids are **lowercase kebab-case and keep the type prefix**: `pol-information-security`, `std-access-control`, `gap-mfa-admin-consoles`. No sequential numbers; the dated types get their year from their partition folder and their dates from frontmatter.

The prefix stays even though the folder already names the type, because the id travels alone — through frontmatter references, a Jira ticket, a Confluence page, a conversation — and in none of those places does the folder exist.

**The filename is the id.** `standards/std-access-control.md` carries `id: std-access-control`. `check` enforces the match, and that the prefix agrees with the folder.

`related:` is a **flat list**:

```yaml
related: [pol-information-security, exc-legacy-vpn-mfa]
```

Grouping for display is computed from the prefixes at render time. A flat list cannot disagree with itself.

## Consequences

- One rule for every id, in one case, checkable by a regular expression.
- The filename↔id check makes the tree navigable by id, so finding a document from a reference needs no index.
- `related` gets shorter and can no longer misfile a reference.
- Ids must be unique across the whole program, so two incidents that would both be `inc-phishing-campaign` need distinguishing slugs. The year folder partitions storage, not the namespace.
- Any id, once published, is permanent. Renaming is superseding, through `supersedes` and `superseded_by`.
