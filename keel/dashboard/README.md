
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

Runtime libs are managed via `package.json` so Dependabot can monitor CVEs. They are not committed to the repo, `kilagen build` installs them from npm and copies the UMD builds into `vendor/` where `index.html` loads them as plain `<script>` tags. No bundler, no build step for the JS itself.

## Tests

```bash
cd keel/dashboard
npm ci
npm test
```

## Security

The dashboard enforces a strict CSP (no inline scripts, no eval, no external sources), sanitizes all markdown output with DOMPurify, validates every fetched path and external URL, and parses YAML in failsafe mode. No state is stored client-side. Vendor libs are pinned, vendored at build time, and monitored by Dependabot.
