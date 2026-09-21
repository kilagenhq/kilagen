# Kilagen

Git-native, AI-first security-program framework. Two layers: `keel/` (the reusable framework) and `program/` (the instance — your organization's content, added when you instantiate).

## Orientation

| What you need | Where to look |
|---|---|
| What Kilagen is, what enters a program, and why | `keel/content/design.md` |
| The decisions behind it, one per file | `keel/content/adrs/` |
| How to instantiate the framework | `keel/content/instantiation.md` |
| Standards, requirements, framework coverage | `keel/content/compliance.md` |
| Controlled vocabulary | `keel/content/glossary.md` |
| JSON Schema for frontmatter and the vocabularies | `keel/schemas/` |
| A template per document type | `keel/content/templates/` |

## When an instance exists

Once a `program/` layer has been added, `kilagen build` writes
`_site/registry.json` — every document with its frontmatter, the coverage and
the vocabularies. That is the authoritative index of what exists. Do not rely
on assumptions; read it.

A folder under `program/` names a document type and nothing else. Where does a
new document go? The folder of its type — everything else is frontmatter.
