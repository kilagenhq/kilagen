# Instantiating Kilagen

Kilagen has two layers:

- **`keel/`** — the reusable framework (design, schemas, templates, dashboard,
  validators), distributed as the `kilagen` package. This repository is its source.
- **`program/`** — the instance: your organization's security content. It lives
  in *your own* repository, not here.

You don't fork this repository. You install Kilagen and scaffold a `program/`
layer in a repo you own; the framework stays a versioned dependency you update
independently.

## Getting started

```bash
mkdir acme-security && cd acme-security
git init
pip install kilagen
kilagen init --name "Acme Corp"      # or --guided, to be asked
```

`init` takes two choices, both of which accept `none`:

| Flag | Default | What it writes |
|---|---|---|
| `--deployment` | `github` | CI configuration for that platform. `none` writes nothing — run the commands yourself, from any CI or none at all. |
| `--agent` | `claude` | Agent skills rendered into the layout that tool expects. `none` writes nothing. |

Then:

```bash
kilagen new standard encryption-at-rest   # a document from its template
kilagen check       # frontmatter, schemas and cross-references
kilagen build && kilagen serve  # build the dashboard and preview it
```

A fresh program validates and builds cleanly, and is not empty: it arrives with
the capability menu as a checklist, two frameworks in scope with their clause
vocabularies, and five draft documents that run the chain end to end — a policy,
the standard it authorises, the role that owns them, and a gap and an exception
filed against the same requirement.

Delete what you do not need; deleting is the edit.

## Where a document goes

The folder of its type, and nothing else:

```
program/
├── config.yml            your name, and the frameworks you are measured against
├── publish.yml           where documents are published, and which types by default
├── model/                the closed vocabularies every facet is validated against
├── policies/ standards/ processes/ runbooks/ playbooks/ guidelines/
├── decisions/ roles/ vendors/ threats/ threat-models/ risks/
└── exceptions/2026/ gaps/2026/ incidents/2026/     dated types, always by year
```

Everything else — which domain it belongs to, which capability it supports,
which systems it touches — is frontmatter, validated against `model/`. The
filename is the id, and `kilagen check` enforces it.

## What lives where

| Path | Layer | What it is |
|---|---|---|
| `program/` | Instance | Your security content, and the only thing you truly own. |
| `.github/`, `.pre-commit-config.yaml`, `.markdownlint-cli2.yaml`, `.lychee.toml`, `.gitignore`, `.nojekyll` | Instance | Written by `init` at the root, because each tool only looks there. |
| `.kilagen-manifest.yml` | Instance | What `init` copied, with a checksum per file. |
| Schemas, templates, dashboard, validators | Framework | Inside the installed package. Never copied into your repo. |

## Updating

```bash
pip install -U kilagen   # the framework: schemas, validators, dashboard
kilagen update config   # the configuration init copied into your repo
```

`update config` compares three things for each copied file — what is on disk, what
the manifest recorded, and what the new release ships. A file you never touched
is safe to replace and is listed as updatable; a file you edited is reported
and left alone, for you to reconcile by hand. It reports by default and only
writes with `--apply`. It never touches `program/`.

Pin the major version in your CI (`kilagen<1` today). A new major may change
what content must look like, and that should be a decision you make, not
something a scheduled build does to you.


## Making it look like yours

The dashboard ships Kilagen's palette. To use your own, write
`program/branding.css` and redefine as few of these nine tokens as you like —
`build` copies the file next to the stylesheet and loads it afterwards, so
nothing is forked and nothing is lost on upgrade.

```css
:root {
  --k-bg: #f7f8f6;          /* the page */
  --k-surface: #ffffff;     /* what lifts off it: cards, popovers */
  --k-ink: #1b1f22;         /* body text */
  --k-ink-muted: #5a6472;   /* secondary text */
  --k-accent: #0b6b57;      /* links, active state, the rule beside a requirement */
  --k-accent-ink: #ffffff;  /* text on top of the accent */
  --k-rule: #dcdfda;        /* borders and separators */
  --k-sev-critical: #b32222;
  --k-sev-high: #a8480f;
  --k-sev-medium: #8a5a10;
  --k-sev-low: #0b6b57;
}
.dark { /* the same tokens, for the dark theme */ }
```

Those eleven are the contract. Every other custom property in `app.css` is
internal and may change in any release.

Check your colours against the background you put them on: AA asks 4.5:1 of
body text and 3:1 of a badge or a rule. A palette that fails it is a dashboard
somebody cannot read.

## Migrating content

`program/config.yml` carries a `schema_version` recording how far your content
has been migrated. When a release expects a newer one, `validate` stops and
tells you:

```
this program is at schema 1; kilagen 2.0.0 expects 2. Run: kilagen update content
```

`update content` applies the ordered steps that release ships, then raises the version
in `config.yml`. It requires a clean working tree, so the resulting `git diff`
is the whole review. It reports by default and writes with `--apply`, like `update config`.

A migration never invents a value it cannot know: where a newly required field
has no derivable answer it writes an obvious placeholder and lists the affected
files, so validation fails loudly instead of a guess passing silently into a
compliance document.
