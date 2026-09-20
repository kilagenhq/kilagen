"""Schema 1 -> 2: `adr` becomes `decision`, gaps lose `status`, `binding` is rescaled.

Three contract changes in one step, because they ship in the same release.

1. **The type `adr` is renamed `decision`** (`program/adrs/adr-x.md` ->
   `program/decisions/dec-x.md`). "ADR" is architecture jargon; what the type
   holds is a decision and the reasoning behind it, which is what an auditor
   asks for. Every reference to a renamed id is rewritten with it — including
   the ones in prose, since an id is unique and a stale one resolves to
   nothing. References to the framework's own ADRs (`keel/adrs/...`) are left
   alone: they are not program content and they did not move.

2. **`status` is deleted from every gap and exception.** Their state is
   computed from write-once facts — `remediated`/`superseded_by` and
   `revoked`/`expires` — and a declared status could only agree redundantly or
   contradict them silently. It did: a gap with `status: active` and a
   `remediated:` date passed every check while coverage counted it closed.

3. **`binding:` is rescaled to `mandatory` / `voluntary` / `reference`**, where
   the line between them is *who checks*. `comply-or-explain` said nothing
   about that: it covered both "we certify against this" and "we read it for
   ideas". The shipped guidance frameworks become `reference`; anything else
   that said `comply-or-explain` becomes `voluntary`, which is the reading
   that keeps the claim it already made.

Nothing here invents a value. Deleting a field that duplicated a derivation
loses no information, the rename is mechanical, and the one judgement call —
which half of `comply-or-explain` a framework meant — is reported line by line
so it can be corrected in one edit.
"""

from __future__ import annotations

import re
from pathlib import Path

FROM_VERSION = 1
TO_VERSION = 2

OLD_FOLDER = "adrs"
NEW_FOLDER = "decisions"
OLD_PREFIX = "adr-"
NEW_PREFIX = "dec-"

DERIVED_STATE_TYPES = ("gap", "exception")

# Frameworks Kilagen ships that are published as guidance: you use them, you do
# not certify against them. Everything else keeps the claim it was making.
REFERENCE_FRAMEWORKS = ("nist_csf", "iso_27017", "iso_27018")

_FRONTMATTER = re.compile(r"\A---\n(.*?\n)---\n", re.S)


def _split(text: str) -> tuple[str, str] | None:
    """Frontmatter and the rest, or None when there is no frontmatter."""
    match = _FRONTMATTER.match(text)
    if not match:
        return None
    return match.group(1), text[match.end():]


def _type_of(frontmatter: str) -> str:
    match = re.search(r"^type:\s*(\S+)\s*$", frontmatter, re.M)
    return match.group(1) if match else ""


def _renamed_ids(program: Path) -> dict[str, str]:
    """Old id -> new id, for every document still sitting in program/adrs/."""
    folder = program / OLD_FOLDER
    if not folder.is_dir():
        return {}
    return {path.stem: NEW_PREFIX + path.stem[len(OLD_PREFIX):]
            for path in sorted(folder.glob("*.md"))
            if path.stem.startswith(OLD_PREFIX)}


def _rewrite_ids(text: str, renamed: dict[str, str]) -> str:
    """Replace whole ids only, so `adr-x-2` is never hit by `adr-x`."""
    for old, new in renamed.items():
        text = re.sub(rf"(?<![\w-]){re.escape(old)}(?![\w-])", new, text)
    return text


def _drop_status(text: str) -> str:
    """Remove the `status:` line from the frontmatter, and only from there."""
    split = _split(text)
    if not split:
        return text
    frontmatter, body = split
    stripped = re.sub(r"^status:.*\n", "", frontmatter, count=1, flags=re.M)
    if stripped == frontmatter:
        return text
    return f"---\n{stripped}---\n{body}"


def apply(program: Path, dry_run: bool) -> list[str]:
    changed: list[str] = []
    renamed = _renamed_ids(program)

    # 1. Rewrite every file that mentions a renamed id, wherever it lives.
    if renamed:
        for path in sorted(program.rglob("*.md")) + sorted(program.rglob("*.yml")):
            text = path.read_text(encoding="utf-8")
            new_text = _rewrite_ids(text, renamed)
            if path.parent.name == OLD_FOLDER:
                new_text = re.sub(r"^type:\s*adr\s*$", "type: decision",
                                  new_text, count=1, flags=re.M)
            if new_text == text:
                continue
            if not dry_run:
                path.write_text(new_text, encoding="utf-8")
            changed.append(f"{path.relative_to(program)}: references updated")

        # 2. Move the documents themselves.
        destination = program / NEW_FOLDER
        for old_id, new_id in renamed.items():
            source = program / OLD_FOLDER / f"{old_id}.md"
            target = destination / f"{new_id}.md"
            changed.append(f"{OLD_FOLDER}/{old_id}.md -> {NEW_FOLDER}/{new_id}.md")
            if dry_run:
                continue
            destination.mkdir(parents=True, exist_ok=True)
            source.rename(target)

        if not dry_run:
            folder = program / OLD_FOLDER
            if folder.is_dir() and not any(folder.iterdir()):
                folder.rmdir()

    # 3. The publishing contract is keyed by type.
    publish = program / "publish.yml"
    if publish.is_file():
        text = publish.read_text(encoding="utf-8")
        new_text = re.sub(r"^(\s*)adr:", r"\1decision:", text, count=1, flags=re.M)
        if new_text != text:
            if not dry_run:
                publish.write_text(new_text, encoding="utf-8")
            changed.append("publish.yml: the adr default is now keyed decision")

    # 4. The binding scale.
    config = program / "config.yml"
    if config.is_file():
        text = config.read_text(encoding="utf-8")
        lines, framework = [], None
        for line in text.splitlines(keepends=True):
            match = re.match(r"^\s*-\s*id:\s*(\S+)", line)
            if match:
                framework = match.group(1)
            if re.match(r"^(\s*)binding:\s*comply-or-explain\s*$", line):
                replacement = "reference" if framework in REFERENCE_FRAMEWORKS else "voluntary"
                line = re.sub(r"comply-or-explain", replacement, line)
                changed.append(f"config.yml: {framework} binding comply-or-explain -> {replacement}")
            lines.append(line)
        new_text = "".join(lines)
        if new_text != text and not dry_run:
            config.write_text(new_text, encoding="utf-8")

    # 5. Gaps and exceptions lose their declared status.
    for path in sorted(program.rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        split = _split(text)
        if not split or _type_of(split[0]) not in DERIVED_STATE_TYPES:
            continue
        new_text = _drop_status(text)
        if new_text == text:
            continue
        if not dry_run:
            path.write_text(new_text, encoding="utf-8")
        changed.append(f"{path.relative_to(program)}: status removed (state is derived)")

    return changed
