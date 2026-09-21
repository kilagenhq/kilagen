# Contributing

Thanks for looking. Kilagen is early, so the most useful contribution right now is telling us where it breaks or where the model does not fit what you actually do.

## Before you write code

Open an issue first for anything that changes the content contract — a new document type, a new field, a change to what `check` accepts. Those are the decisions that are expensive to reverse, and they are argued in `keel/content/adrs/` rather than in a diff. A bug fix or a documentation fix needs no preamble.

## Setting up

```bash
git clone git@github.com:kilagenhq/kilagen.git
cd kilagen
./scripts/dev-setup.sh          # virtualenv, dependencies, git hooks, editable install
source .venv/bin/activate
```

## Before you open a pull request

```bash
python -m unittest discover -s tests
npm test --prefix keel/dashboard
pre-commit run --all-files
```

All three must pass; CI runs the same three. Then exercise the change end to end against a throwaway program:

```bash
mkdir /tmp/probe && cd /tmp/probe && git init
kilagen init --name "Probe" && kilagen check && kilagen build
```

## What we look for

- **A test that would have failed before.** Better still, a test that closes the whole class — the suite already has a few that cannot be defeated by adding one more case, and those are the ones worth writing.
- **Comments that earn their place.** Say why, not what, and only where the code cannot say it itself. A note about a trap — why something cannot be done the obvious way — is always welcome.
- **No new runtime dependencies** without a reason in the issue. The package depends on PyYAML and jsonschema; the dashboard depends on nothing at runtime beyond three vendored libraries.
- **Accessibility holds.** The dashboard is WCAG 2.1 AA and the suite checks it. Anything clickable must be reachable by keyboard.

## Commits

One logical change per commit, and a message that says what changed and why. The subject line is a sentence in the imperative, under about seventy characters.

## Licence

Contributions are accepted under [Apache-2.0](LICENSE), except under the directories `kilagen init` copies into a user's repository (`keel/scaffold/`, `keel/ai/`, `keel/content/templates/`, `keel/content/starter/`), which are MIT-0 so that a generated program carries no attribution obligation. Each of those directories has its own `LICENSE`.
