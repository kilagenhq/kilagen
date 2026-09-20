"""Fetch the quarterly access review export from Okta. Not implemented.

This is the shape of a real collector, shipped so the contract can be read
rather than described. Filling it in means three things, in this order:

1. **Get the artefact.** Okta's API can produce the report; the credential for
   it belongs in the environment, never in this file and never in `program/`.
2. **Put it where evidence lives.** The organisation's document store, with the
   access boundary evidence needs — which is narrower than the one this
   repository has, and is the whole reason the artefact does not live here.
3. **Return the pointer and the date.** Two facts. That is all that is written
   back, and a collector that writes a file into the repository is a bug, not a
   feature: a committed blob survives its own deletion, and evidence is the
   category most likely to carry personal data.

    def collect(config: dict) -> dict:
        return {"url": "...", "collected": "2026-12-31"}
"""

from __future__ import annotations


def collect(config: dict) -> dict:
    raise NotImplementedError(
        "okta-access-review is a template, not a working collector. See the "
        "module docstring for what filling it in involves, and collectors/manual.py "
        "for a collector that runs today.")
