---
name: draft-document
description: >
  Draft a new document for this security program — a policy, standard, gap,
  exception, risk or any other type — so that it is valid, correctly filed and
  connected to what already exists. Use when asked to write, add or draft a
  document in program/.
allowed-tools: Bash(kilagen:*), Read, Write, Edit, Glob, Grep
---

# Draft a document

## Before writing anything

Read `_site/registry.json` if it exists — `kilagen build` writes it, and it is the authoritative index of every document, the vocabularies and the framework coverage. Do not guess what exists.

Then read the template for the type you are about to write: `kilagen new <type> <slug>` writes it into the right folder for you, already carrying every required field. Use the verb rather than creating the file by hand; the folder a document belongs in is decided by its type, and `new` knows it.

## The rules that are easy to get wrong

- **A folder is a document type and nothing else.** Domain, capability and system are frontmatter facets, not directories. A document goes in the folder of its type, never in a folder named after a domain.
- **The id equals the filename**, is lowercase, and carries its type's prefix.
- **`gaps/`, `exceptions/` and `incidents/` nest under a year**, which must match the date the document opened.
- **Every facet value must already exist** in `program/model/` — `domains.yml`, `capabilities.yml`, `systems.yml`. If the right value is not there, say so and ask; do not invent a vocabulary entry to make a document validate.
- **A gap and an exception have no `status`.** Their state is derived: a gap is open until `remediated:` or `excepted_by:` is written, an exception is live until `revoked:` or `expires:`. Never add a status field to either.
- **`evidence:` points outside the repository.** It is `[{name, url}]`. Never commit the artefact itself — the repository holds the record, not the proof.
- **`tracker:` is a URL**, never a copy of a ticket's state.

## Do not invent facts

This is a compliance repository: a plausible guess in it is worse than a blank. If you do not know a date, an owner or a severity, leave the template's `REPLACE ME` in place and list what you need. A reviewer can fill a blank; they cannot see a value you made up.

## Before you finish

```bash
kilagen check
```

Fix every error it reports. Warnings about reviews are information, not failures. Then say what you wrote, what you left for the user to fill in, and which existing documents you linked it to.
