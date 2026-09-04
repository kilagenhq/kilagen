# Instance scaffold

Files here are **not active in this repository**. They are what `kilagen init`
copies into a new instance repo, where they become that repo's own
configuration.

```
base/           always copied — the checks any program runs
deployments/    one is chosen: the CI platform to wire up
engines/        one is chosen: the agent integration to render
```

## base/

Markdown lint, spell check and link check configuration, the pre-commit hooks,
`.gitignore`, and the instance's content tests. Generic, but not shared with
this repository: the ignore lists differ, and the registry-staleness hook only
makes sense where a `program/` exists.

## deployments/

A directory of thin proxies that call `kilagen` verbs. All the logic lives in
the CLI, so adding a platform means adding a directory here, not porting rules.
`github` wires up five workflows; `none` writes nothing, for a program on
another platform or on a laptop with no CI at all.

A `README.md` at the root of a deployment describes the option and is **not**
copied — it would overwrite the instance's own README.

## engines/

`engine.yml` declares where that tool expects to find agent skills. The skills
themselves live once, vendor-neutral, in the package under `ai/skills/`, and
`init` renders them into the declared layout. `none` declares no location, so
nothing is written.

## Adding one

Create the directory. A deployment is a file tree copied verbatim; an engine
is an `engine.yml` with a `skills_dir`. Neither needs code.
