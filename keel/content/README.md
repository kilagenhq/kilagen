# keel

The reusable framework: everything needed to structure, validate and read a
security program, independent of any organization's content.

## Written material

Links point at siblings, so they resolve both in the package and in the built
site — the two layouts differ, and only these files sit together in both.

- [`design.md`](design.md) — what Kilagen is, what enters a program, and why. The summary; the ADRs are the detail.
- [`adrs/`](adrs/) — the framework's own decisions about itself. A program's decisions are `decision` documents (`dec-`) in its own repository.
- [`compliance.md`](compliance.md) — standards, requirements, and the only coverage this program claims.
- [`instantiation.md`](instantiation.md) — creating and updating your own program.
- [`glossary.md`](glossary.md) — the controlled vocabulary.
- `templates/` — a starting point for every document type.
- `starter/` — what a new program is seeded with.

## The rest of the package

- `schemas/` — JSON Schema for frontmatter, the vocabularies and the publishing contract.
- `dashboard/` — the client-side application that renders the program.
- `libs/` — validators, generators and the site builder, invoked through the `kilagen` command.
- `scaffold/` — what `kilagen init` copies into an instance.
- `ai/` — agent skills, rendered into whichever tool an instance selected.

## Instance content

An organization's own material lives in `program/`, in that organization's
repository, never here. Its identity and framework selection sit in
`program/config.yml`.
