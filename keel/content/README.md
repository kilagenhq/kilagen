# keel

The reusable framework for building a security program: everything needed to
structure, validate and visualize one, independent of any organization's content.

## Written material

Links below point at siblings, so they resolve both in the package and in the
built site — the two layouts differ, and only these files sit together in both.

- [`design.md`](design.md) — the authoritative specification for repository structure, document types and conventions.
- [`glossary.md`](glossary.md) — controlled vocabulary for framework terms used across domains.
- [`maturity.md`](maturity.md) — the L0–L5 maturity scale that applies to every capability.
- [`compliance.md`](compliance.md) — the compliance model and how framework clauses are mapped.
- [`lenses.md`](lenses.md) — what a lens is and how alternative projections work.
- [`instantiation.md`](instantiation.md) — how to create and update your own program.
- `lenses/` — the lens taxonomies themselves (e.g. NIST CSF 2.0).
- `templates/` — starting points for every document type.

## The rest of the package

- `schemas/` — JSON Schema for frontmatter, capabilities, gaps and framework vocabularies.
- `dashboard/` — the client-side application that renders the program.
- `libs/` — validators, generators and the site builder, invoked through the `kilagen` command.
- `scaffold/` — what `kilagen init` copies into an instance.
- `ai/` — agent skills, rendered into whichever tool an instance selected.

## Instance content

An organization's own material — policies, standards, systems — lives in
`program/`, in that organization's repository, never here. Its identity and
framework selection sit in `program/config.yml`.
