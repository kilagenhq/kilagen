# Collectors

A collector refreshes one piece of evidence: it goes and gets the artefact that
proves a requirement, puts it wherever the organisation keeps such things, and
returns two facts — where it now lives, and the day it was produced.

```python
def collect(config: dict) -> dict:
    return {"url": "https://...", "collected": "2026-12-31"}
```

`config` is the evidence entry itself, so a collector can read its own `name`,
`url` and `freshness` without a second configuration file.

**A collector never writes into the repository.** Not the CSV, not the PDF, not
a copy of anything. The only thing recorded is the pointer and the date: a
committed blob is recoverable by hash long after it is deleted, and evidence is
the category most likely to carry personal data.

## Where they live

| Path | What it is |
|---|---|
| `keel/collectors/<name>.py` | Shipped with the framework |
| `collectors/<name>.py` | Written by the program, and wins over a shipped one of the same name |

Same two-layer rule as the framework vocabularies: override without forking.

## Running them

```sh
kilagen update evidence           # say what would change
kilagen update evidence --apply   # record the new pointers, then: git diff
```

Only entries that declare `collector:` are run. Everything else is evidence
somebody attached by hand, which is fine and stays fine.

## What ships

- **`manual.py`** — records that a person refreshed the evidence and stamps
  today's date. No credentials, no integration, and it works.
- **`okta-access-review.py`** — the shape of a real one, raising
  `NotImplementedError` until somebody writes it.
