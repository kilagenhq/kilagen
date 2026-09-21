
# Kilagen Dashboard

Single-page HTML dashboard for the security program.

## Deployment

The dashboard must be developed to be compatible with GitHub Pages (static files only, no server-side processing).

## How to run

From the repo root:

```bash
kilagen build && kilagen serve
```

Or manually:

```bash
kilagen build
python -m http.server 8000 -d _site
```

Open `http://localhost:8000/dashboard/`.

## Dependencies

Runtime libs are pinned in `package.json` so Dependabot can monitor CVEs, and the built UMD files **are committed** under `vendor/`, where `index.html` loads them as plain `<script>` tags — a fresh clone works with no install. There is no bundler and no build step for the JS. Refresh them with `./scripts/vendor-libs.sh` after a version bump; CI fails if `vendor/` and `package.json` disagree.

## Tests

```bash
cd keel/dashboard
npm ci
npm test
```

## Security

The dashboard enforces a strict CSP (no inline scripts, no eval, no external sources), sanitizes all markdown output with DOMPurify, validates every fetched path and external URL, and parses YAML in failsafe mode. No state is stored client-side. Vendor libs are pinned, committed under `vendor/`, and monitored by Dependabot.
