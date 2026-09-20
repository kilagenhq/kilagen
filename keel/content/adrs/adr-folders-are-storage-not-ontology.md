---
id: adr-folders-are-storage-not-ontology
type: adr   # the framework's own convention, not a program document type
title: "Folders are storage, not ontology"
description: >
  A folder names the document type and nothing else; domain, capability, system and
  framework are multivalued frontmatter facets, and a subfolder may only mean a year
  partition.
status: active
owner: role-maintainer
decided: 2026-09-18
related: [adr-lowercase-prefixed-ids, adr-no-capability-assessment]
---

# Folders are storage, not ontology

## Context

The first layout used the filesystem to encode a taxonomy: ten numbered domain directories (`01-grc` … `10-data-security`), each with the same subfolders for standards, processes, runbooks and threat models.

Three taxonomies were competing for that one hierarchy — domain, system and team — and any single hierarchy loses. Organize by domain and a large company asks for sub-teams. Organize by team and the auditor asks for frameworks. Organize by system and the GRC documents have nowhere to live. An incident-response process touches IR and SecOps; the singular `domain:` field forced a choice and the chosen value was a lie half the time.

The layout also made every growth moment a decision: when a folder got big, somebody had to decide whether to split it, and by what.

## Decision

The folder names the **document type**. Nothing else.

Every other classification is frontmatter, multivalued, validated against a closed vocabulary in `program/model/`:

```yaml
domains: [ir, secops]
capabilities: [ir.triage]
systems: [okta, splunk]
```

A subfolder may only ever mean **partition**, never classification, and only for the dated types (`exceptions/`, `gaps/`, `incidents/`), which nest under the year they were opened from the very first file. Partitioning is a property of the type, fixed by `check`, so there is no user decision and no later reorganization.

The singular `domain:` field is removed.

## Consequences

- Navigation moves entirely into computed lenses. Nobody browses folders; browsing by type is one lens among several, and "everything about IAM" is a query over a facet rather than a directory listing.
- A document can honestly belong to two domains, which is what documents actually do.
- Adding a classification later — a team, a product line, a region — costs a vocabulary file and a facet, not a migration of the tree.
- `model/` becomes load-bearing: a facet value that is not in the vocabulary fails `check`, which is what keeps the facets from drifting into free text.
- The cost is one indirection. A person looking for "the IAM standards" no longer finds them in an `02-iam/standards/` directory; they use the Domains lens or grep the facet.
