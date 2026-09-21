# The security program

This directory is the program: what this organisation requires, what it
decided, who approved it, when it was last reviewed, and which framework
clauses it answers. It is the record — the dashboard is a projection of it.

## Where a document goes

A folder names a **document type** and nothing else. Everything else — which
domain it belongs to, which capability it supports, which systems it touches —
is frontmatter, validated against `model/`.

```text
config.yml           the program's name, and the frameworks it is measured against
publish.yml          where documents are published, and which types by default
schedule.yml         recurring work no single document owns: pentests, DR tests, audits
model/               the closed vocabularies every facet is validated against
policies/ standards/ processes/ runbooks/ playbooks/ guidelines/
decisions/ roles/ vendors/ threats/ threat-models/ risks/ data-assets/
business-processes/
gaps/2026/ exceptions/2026/ incidents/2026/     dated types, always by year
```

The filename is the id, and the id carries its type as a prefix:
`standards/std-access-control.md` holds `id: std-access-control`.

## Writing one

```bash
kilagen new standard encryption-at-rest   # from the template, in the right place
kilagen check                             # what is wrong, and where
kilagen build && kilagen serve            # read it as a site
```

## The three rules worth knowing

- **A requirement is addressable.** A standard's requirements are numbered, so
  a framework clause maps to `std-access-control#1.2` and a gap is filed
  against that same reference.
- **A gap is open until a fact closes it.** `remediated:` or `excepted_by:`,
  both written once. There is no status field to keep in sync — the same is
  true of an exception, which is live until it is revoked or it expires.
- **Nothing here is confidential.** The built site is as public as this
  repository. What must not be read by whoever can read the repo does not go
  in the repo: it goes behind an `evidence:` link.

## Making it look like yours

Write `program/branding.css` and redefine any of the eleven public colour
tokens; `build` loads it after the dashboard's own stylesheet. The list is in
`instantiation.md`, under Reference in the built site.

Full documentation ships with the framework: `kilagen build` copies it into
the site under Reference.
