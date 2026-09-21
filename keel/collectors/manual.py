"""A person refreshed this evidence; record the day and leave the link alone.

The plainest possible collector, and the one that proves the machinery works.
It integrates with nothing, needs no credentials and cannot fail, which makes
it the right thing to run first: if `kilagen update evidence --apply` moves the
date on an entry that uses this, the whole loop — resolve, run, validate,
rewrite the frontmatter, show the diff — is working, and everything left to do
for a real integration is the integration itself.

It is also genuinely useful. Plenty of evidence is produced by somebody opening
a console, exporting a report and dropping it in a folder. That is a real
process; what it lacks is the record that it happened, which is the only part
this repository was ever going to hold.

    evidence:
      - name: Access review Q3 2026
        url: https://drive.example.com/evidence/2026-Q3/access-review.csv
        collected: 2026-09-30
        freshness: quarterly
        collector: manual
"""

from __future__ import annotations

from datetime import date


def collect(config: dict) -> dict:
    """Return where the artefact lives — unchanged — and today's date.

    Never writes into the repository: the caller records the pointer and the
    day, and the artefact itself stays where the organisation keeps it.
    """
    url = config.get("url")
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        raise ValueError(
            "manual collects nothing on its own: the entry needs the url of the "
            "artefact a person put there")
    return {"url": url, "collected": date.today().isoformat()}
