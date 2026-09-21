# Kilagen

Git-native, AI-first framework to build and run a full security program — GRC and security engineering — as Markdown and YAML in a Git repository.

This repository is the **framework**. You do not run your security program from here: you instantiate it into your own repository, which gets a `program/` layer holding your organization's content.

For what that looks like when it is done, see [`kilagenhq/example-acme`](https://github.com/kilagenhq/example-acme) — a worked program of 49 requirements, eleven gaps and the evidence behind them, with [its dashboard published here](https://kilagenhq.github.io/example-acme/).

---

## Using Kilagen

You install the package and scaffold a program in a repository you own. You never clone this one.

```bash
mkdir acme-security && cd acme-security
git init
pip install kilagen
kilagen init --name "Acme Corp"      # or --guided, to be asked
```

`init` also takes `--deployment` (which CI to wire up, default `github`) and `--agent` (which agent integration to render, default `claude`). Both accept `none`. It records everything it copied, with a checksum per file, in `.kilagen-manifest.yml`.

Day to day:

| Command | What it does |
|---|---|
| `kilagen new <type> <slug>` | Writes a document from its template, in the folder of its type |
| `kilagen check` | Frontmatter, layout, vocabularies, cross-references, evidence freshness and what is falling due |
| `kilagen build` | Validate and build the dashboard |
| `kilagen build && kilagen serve` | The same, then serve it at `localhost:8000` |
| `kilagen check reviews` | What expires: reviews, exceptions, gaps left open |
| `kilagen check evidence` | What each requirement can prove, and what has gone stale |
| `kilagen update evidence` | Run the collectors and record where the proof now lives |

`check` takes a target — `frontmatter`, `refs`, `evidence` or `reviews` — and runs all four without one. `evidence` and `reviews` report rather than fail, which is what makes them worth running; `--strict` is how a CI asks for the opposite. `serve` takes `--port`.

Keeping up with new releases:

| Command | What it changes |
|---|---|
| `pip install -U kilagen` | The framework itself: schemas, validators, dashboard |
| `kilagen update config` | The configuration `init` copied into your repo. Reports by default, writes with `--apply`, and leaves anything you edited alone. Never touches `program/` |
| `kilagen update content` | Your `program/` content, when a release changes what content must look like. Never touches the configuration |

Full walkthrough in [`keel/content/instantiation.md`](https://github.com/kilagenhq/kilagen/blob/main/keel/content/instantiation.md).

---

## Working on Kilagen

This repository builds the package the section above installs.

```bash
git clone git@github.com:kilagenhq/kilagen.git
cd kilagen
./scripts/dev-setup.sh          # virtualenv, dependencies, git hooks, editable install
source .venv/bin/activate
```

| Command | What it does |
|---|---|
| `python -m unittest discover -s tests` | The framework's own test suite |
| `npm test --prefix keel/dashboard` | The dashboard's test suite |
| `pre-commit run --all-files` | Markdown lint and spell check, as CI runs them |
| `./scripts/vendor-libs.sh` | Refresh the dashboard's vendored libraries after a version bump |

The dashboard's runtime libraries are committed under `keel/dashboard/vendor/`, so a fresh clone works immediately. They are refreshed only when `package.json` moves, and CI fails if the two disagree.

To exercise a change end to end, instantiate a throwaway program against your working tree:

```bash
mkdir /tmp/probe && cd /tmp/probe && git init
kilagen init --name "Probe" && kilagen check && kilagen build && kilagen serve
```

Releasing:

1. Decide the version. A major means the rules changed: content that was valid
   before is not, and a migration ships with it. A validator that starts catching
   something it always should have is a minor.
2. Edit `version` in `pyproject.toml`. It is the only place: `kilagen --version`
   reads it from the installed metadata.
3. If the major changed, update the pin in the seed's workflows. A test fails
   if you forget, because a stale pin freezes every instance on the old major.
4. Move the release's entries out of `Unreleased` in `CHANGELOG.md`.
5. Verify, build, tag, publish:

```bash
python -m unittest discover -s tests && npm test --prefix keel/dashboard
rm -rf build dist *.egg-info      # setuptools caches the old file list in SOURCES.txt
python -m build
git tag v0.2.0 && git push --tags
```

---

- What Kilagen is and why it is shaped this way → [`keel/content/design.md`](https://github.com/kilagenhq/kilagen/blob/main/keel/content/design.md)
- The decisions behind it → [`keel/content/adrs/`](https://github.com/kilagenhq/kilagen/tree/main/keel/content/adrs/)
- Standards, requirements and framework coverage → [`keel/content/compliance.md`](https://github.com/kilagenhq/kilagen/blob/main/keel/content/compliance.md)
