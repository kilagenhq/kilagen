# Vendored runtime libraries

Third-party code, committed deliberately. The dashboard has no bundler: the
browser loads these as plain `<script>` tags from `index.html`, so they have to
exist as files next to it.

| File | Package | License |
|---|---|---|
| `marked.umd.min.js` | [marked](https://github.com/markedjs/marked) | MIT |
| `purify.min.js` | [DOMPurify](https://github.com/cure53/DOMPurify) | Apache-2.0 or MPL-2.0 |
| `js-yaml.min.js` | [js-yaml](https://github.com/nodeca/js-yaml) | MIT |

## Do not strip the banners

`marked.umd.min.js` and `purify.min.js` open with their own copyright and
license notice. Those notices are what the licenses require us to keep when
redistributing, and this package does redistribute them — they ship inside
every release. A minifier or a comment-stripping pass run over this directory
would break that. Copy the files verbatim; never process them.

`js-yaml.min.js` is the exception, and not in the way it used to be. The build
npm publishes carries **no banner at all**, so `scripts/vendor-libs.sh` writes
one as it copies. That line is ours: it exists so the shipped artefact can say
which version it is, which is how a stale copy is caught — and a stale copy sat
in this directory twice before it existed. Do not strip it either, keep the
root `NOTICE` entry (that is where the copyright actually lives), and re-check
for an upstream banner after a version bump, because the day js-yaml ships one
this stamping should stop.

## Refreshing

The versions are pinned in `../package.json`, which is what Dependabot watches.
After a bump:

```bash
./scripts/vendor-libs.sh
```

That reinstalls from the lockfile and copies the built files here. CI checks
that what is committed matches `package.json`, so a bump without a refresh
fails rather than shipping a stale library.
