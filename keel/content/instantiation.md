# Instantiating Kilagen

Kilagen has two layers:

- **`keel/`** — the reusable framework (design, schemas, templates, dashboard,
  validators), distributed as the `kilagen` package. This repository is its source.
- **`program/`** — the instance: your organization's security content (domains,
  systems, standards, `config.yml`). It lives in *your own* repository, not here.

You don't fork this repository. You install Kilagen and scaffold a `program/`
layer in a repo you own; the framework stays a versioned dependency you update
independently.

## Getting started

```bash
mkdir acme-security && cd acme-security
git init
pip install kilagen
kilagen init --name "Acme Corp"
```

`init` takes two choices, both of which accept `none`:

| Flag | Default | What it writes |
|---|---|---|
| `--deployment` | `github` | CI configuration for that platform. `none` writes nothing — run the commands yourself, from any CI or none at all. |
| `--ai` | `claude` | Agent skills rendered into the layout that tool expects. `none` writes nothing. |

Then:

```bash
kilagen check       # frontmatter, schemas and cross-references
kilagen build && kilagen serve  # regenerate artifacts, build the dashboard, preview it
```

A fresh program validates and builds cleanly. Add content as you go, copying
starting points from the templates the package ships.

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
