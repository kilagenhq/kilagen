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

Each file opens with its own copyright and license notice. Those notices are
what the licenses require us to keep when redistributing, and this package does
redistribute them — they ship inside every release. A minifier or a
comment-stripping pass run over this directory would break that. Copy the files
verbatim; never process them.

## Refreshing

The versions are pinned in `../package.json`, which is what Dependabot watches.
After a bump:

```bash
./scripts/vendor-libs.sh
```

That reinstalls from the lockfile and copies the built files here. CI checks
that what is committed matches `package.json`, so a bump without a refresh
fails rather than shipping a stale library.
