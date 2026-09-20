"""Ordered steps that bring a program's content up to a new schema version.

Two exist so far, one per contract change: ``m002`` brings schema 1 to 2 and
``m003`` brings 2 to 3. ``kilagen check`` tells users to run ``kilagen update
content`` when the versions disagree, and this is where that instruction leads.

To add one, drop a module named ``m<NNN>_<slug>.py`` here exposing:

    FROM_VERSION = 1
    TO_VERSION   = 2

    def apply(program: Path, dry_run: bool) -> list[str]:
        '''Return one human-readable line per file it would change.'''

``apply`` must be idempotent — running it twice is the same as running it
once — and must never invent a value it cannot know. For a newly required
field, write an obvious sentinel and let validation fail loudly on it; a
plausible guess in a compliance document is worse than a blank.
"""

from __future__ import annotations

import importlib
import pkgutil
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class Migration:
    name: str
    from_version: int
    to_version: int
    apply: Callable[..., list[str]]


def discover() -> list[Migration]:
    """All migration modules in this package, ordered by module name."""
    found = []
    for info in sorted(pkgutil.iter_modules(__path__), key=lambda i: i.name):
        if not info.name.startswith("m"):
            continue
        module = importlib.import_module(f"{__name__}.{info.name}")
        found.append(Migration(
            name=info.name,
            from_version=module.FROM_VERSION,
            to_version=module.TO_VERSION,
            apply=module.apply,
        ))
    return found


def between(current: int, target: int) -> list[Migration]:
    """The chain from current to target, or [] when it cannot be completed.

    An incomplete chain returns nothing rather than a partial run: applying
    half a migration path would leave the content in a state no version of the
    framework describes.
    """
    available = {m.from_version: m for m in discover()}
    chain: list[Migration] = []
    version = current
    while version < target:
        step = available.get(version)
        if step is None:
            return []
        chain.append(step)
        version = step.to_version
    return chain


__all__ = ["Migration", "between", "discover"]
