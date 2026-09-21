"""Schema 2 -> 3: evidence belongs to a requirement, and supersession is derived.

The field-by-field audit behind this release found the same disease in several
places: a field that is declared where nothing reads it, or declared twice so
the two copies can disagree. Everything here is one of those two.

1. **`evidence:` leaves the document and joins the requirement.** Nobody asks
   for "the evidence of the Access Control Standard"; they ask for the evidence
   that entitlements are certified, which is `std-access-control#1.5`. The
   document-level field was available on all seventeen types and meaningful on
   about six, and the only thing that consumed it — the audit pack — wanted it
   per requirement anyway.

2. **`requirements[].evidence` was never evidence.** It was a sentence about
   *how* compliance is shown, which is the method and not the proof, and the
   audit view mixed it into the same list as the links. It becomes
   `how_demonstrated:` and `evidence:` becomes the list of links beside it.

3. **`managed_externally:` becomes `source_of_truth:` and stops being
   role-only.** It said "the original lives elsewhere", which is true of a role
   whose holder HR decides, of a guideline copied from an engineering handbook,
   and of a threat model whose diagrams live in a drawing tool. It was rendered
   as a link nowhere at all.

4. **`superseded_by:` meant two different things.** On any document it meant "a
   newer version replaced this"; on a gap it meant "an approved exception
   closed this", which is a different relationship that happens to end the same
   way. The gap keeps it under its own name, `excepted_by:`, and everywhere
   else the field is derived from the other side's `supersedes:` — one fact,
   one place. Before deleting it, the reciprocal is written where it is
   missing, so no edge is lost.

5. **`status: superseded` goes with it.** Being superseded is not an opinion to
   declare: if something supersedes you, you are superseded. The value becomes
   `retired`, which is what a replaced document is.

6. **Four fields nobody wrote and nothing rendered are deleted**:
   `requested_by`, `reviewed_by`, `priority_rationale` and `severity_matrix`.

7. **Document-level `frameworks:` is deleted.** It existed on sixteen types and
   fed nothing: coverage is computed only from `requirements[].frameworks`
   inside a standard. It rendered as a badge, which made it worse than dead —
   it implied a mapping that no coverage figure counted.

8. **`gap` and `exception` lose the review cycle.** Each already has its own
   clock — a gap is stale so many days after `found`, an exception ends at
   `expires` — and a second one could only disagree with the first.

9. **`certifications:` on a vendor becomes a dated claim.** It is an assertion
   about somebody else, copied by hand; without the day it was checked it is
   the weakest thing in the model. The migration keeps every name and reports
   which ones now need a date, because inventing one would be the same lie in
   a new field.

Nothing here guesses. The one judgement — what a `status: superseded` document
becomes — is reported line by line, and a document-level `evidence:` that
cannot be placed mechanically is left in place and named, so `check` fails
loudly rather than the migration quietly discarding a link.
"""

from __future__ import annotations

import re
from pathlib import Path

from ..libs.keel_lib import write_text_atomic

FROM_VERSION = 2
TO_VERSION = 3

_FRONTMATTER = re.compile(r"\A---\n(.*?\n)---\n", re.S)

# Deleted outright: nobody wrote them and nothing rendered them.
DEAD_FIELDS = ("requested_by", "reviewed_by", "priority_rationale", "severity_matrix")

# The review cycle belongs to types that have no other clock.
OWN_CLOCK_TYPES = ("gap", "exception")


def _split(text: str) -> tuple[str, str] | None:
    match = _FRONTMATTER.match(text)
    if not match:
        return None
    return match.group(1), text[match.end():]


def _join(frontmatter: str, body: str) -> str:
    return f"---\n{frontmatter}---\n{body}"


def _type_of(frontmatter: str) -> str:
    match = re.search(r"^type:\s*(\S+)\s*$", frontmatter, re.M)
    return match.group(1) if match else ""


def _id_of(frontmatter: str) -> str:
    match = re.search(r"^id:\s*(\S+)\s*$", frontmatter, re.M)
    return match.group(1) if match else ""


def _scalar(frontmatter: str, key: str) -> str | None:
    """The value of a top-level scalar key, or None."""
    match = re.search(rf"^{re.escape(key)}:[ \t]*(.*)$", frontmatter, re.M)
    if not match:
        return None
    return match.group(1).strip().strip("'\"")


def _drop_block(frontmatter: str, key: str) -> tuple[str, str | None]:
    """Remove a top-level key and everything indented under it.

    Returns the frontmatter and the removed text, so the caller can report what
    it took away rather than making it vanish.
    """
    pattern = re.compile(rf"^{re.escape(key)}:.*\n(?:[ \t]+.*\n|[ \t]*-.*\n)*", re.M)
    match = pattern.search(frontmatter)
    if not match:
        return frontmatter, None
    return frontmatter[:match.start()] + frontmatter[match.end():], match.group(0)


def _rename_key(frontmatter: str, old: str, new: str) -> str:
    return re.sub(rf"^{re.escape(old)}:", f"{new}:", frontmatter, count=1, flags=re.M)


def _documents(program: Path) -> list[Path]:
    return sorted(program.rglob("*.md"))


def _reciprocal_supersedes(program: Path, dry_run: bool, changed: list[str]) -> None:
    """Write `supersedes:` on the new document wherever only the old one knew.

    The edge is about to live in one place, so it has to exist there first.
    """
    declared: dict[str, list[str]] = {}
    for path in _documents(program):
        split = _split(path.read_text(encoding="utf-8"))
        if not split:
            continue
        frontmatter, _ = split
        if _type_of(frontmatter) == "gap":
            continue
        target = _scalar(frontmatter, "superseded_by")
        if target:
            declared.setdefault(target, []).append(_id_of(frontmatter))

    for path in _documents(program):
        text = path.read_text(encoding="utf-8")
        split = _split(text)
        if not split:
            continue
        frontmatter, body = split
        doc_id = _id_of(frontmatter)
        wanted = declared.get(doc_id)
        if not wanted:
            continue
        existing = re.search(r"^supersedes:\n((?:[ \t]*-.*\n)+)", frontmatter, re.M)
        already = set()
        if existing:
            already = {line.strip().lstrip("- ").strip().strip("'\"")
                       for line in existing.group(1).splitlines()}
        missing = [w for w in wanted if w not in already]
        if not missing:
            continue
        lines = "".join(f"- {w}\n" for w in sorted(already | set(missing)))
        if existing:
            frontmatter = frontmatter[:existing.start()] + f"supersedes:\n{lines}" + frontmatter[existing.end():]
        else:
            frontmatter = frontmatter + f"supersedes:\n{lines}"
        if not dry_run:
            write_text_atomic(path, _join(frontmatter, body))
        changed.append(f"{path.relative_to(program)}: supersedes {', '.join(missing)} "
                       "(the other side declared it and now the edge lives here)")


def apply(program: Path, dry_run: bool) -> list[str]:
    changed: list[str] = []

    _reciprocal_supersedes(program, dry_run, changed)

    for path in _documents(program):
        text = path.read_text(encoding="utf-8")
        split = _split(text)
        if not split:
            continue
        frontmatter, body = split
        original = frontmatter
        doc_type = _type_of(frontmatter)
        where = path.relative_to(program)

        # 3. The original lives elsewhere.
        if re.search(r"^managed_externally:", frontmatter, re.M):
            value = _scalar(frontmatter, "managed_externally")
            if value in (None, "null", "~", ""):
                frontmatter, _ = _drop_block(frontmatter, "managed_externally")
                changed.append(f"{where}: managed_externally was empty, removed")
            else:
                frontmatter = _rename_key(frontmatter, "managed_externally", "source_of_truth")
                changed.append(f"{where}: managed_externally -> source_of_truth")

        # 4/5. Supersession is derived from the other side.
        if doc_type == "gap":
            if re.search(r"^superseded_by:", frontmatter, re.M):
                frontmatter = _rename_key(frontmatter, "superseded_by", "excepted_by")
                changed.append(f"{where}: superseded_by -> excepted_by (an exception closed it)")
        elif re.search(r"^superseded_by:", frontmatter, re.M):
            target = _scalar(frontmatter, "superseded_by")
            frontmatter, _ = _drop_block(frontmatter, "superseded_by")
            changed.append(f"{where}: superseded_by removed, derived from {target}.supersedes")

        if re.search(r"^status:\s*superseded\s*$", frontmatter, re.M):
            frontmatter = re.sub(r"^status:\s*superseded\s*$", "status: retired",
                                 frontmatter, count=1, flags=re.M)
            changed.append(f"{where}: status superseded -> retired (being superseded is derived)")

        # 6. Fields nobody wrote and nothing rendered.
        for dead in DEAD_FIELDS:
            frontmatter, removed = _drop_block(frontmatter, dead)
            if removed:
                changed.append(f"{where}: {dead} removed (declared, never read)")

        # 7. A document-level framework mapping fed no coverage figure.
        if doc_type != "standard":
            frontmatter, removed = _drop_block(frontmatter, "frameworks")
            if removed:
                changed.append(f"{where}: document-level frameworks removed "
                               "(coverage only ever counted requirements[].frameworks)")

        # 8. Two types already carry their own clock.
        if doc_type in OWN_CLOCK_TYPES:
            for field in ("last_reviewed", "next_review"):
                frontmatter, removed = _drop_block(frontmatter, field)
                if removed:
                    changed.append(f"{where}: {field} removed ({doc_type} has its own clock)")

        # 1/2. Evidence moves to where it is asked for.
        frontmatter = _move_evidence(frontmatter, where, changed)

        # 9. A claim about a third party gets somewhere to put its date.
        if doc_type == "vendor":
            frontmatter = _date_certifications(frontmatter, where, changed)

        if frontmatter != original and not dry_run:
            write_text_atomic(path, _join(frontmatter, body))

    return changed


def _move_evidence(frontmatter: str, where: Path, changed: list[str]) -> str:
    """Requirement-level rename, then the document-level block.

    A document-level `evidence:` with exactly one entry and no `source_of_truth`
    becomes one; anything else is left where it is and reported, because the
    requirement it belongs to is a judgement the migration cannot make.
    """
    # requirements[].evidence was a sentence, not a link. The indent must be
    # spaces or tabs, never `\s`: `\s` matches a newline, so under re.M the
    # group can start on a blank line and swallow it — which would rename a
    # document-level `evidence:` the branch below is meant to handle by hand.
    renamed = re.sub(r"^([ \t]+)evidence:([ \t]+\S)", r"\1how_demonstrated:\2", frontmatter, flags=re.M)
    if renamed != frontmatter:
        frontmatter = renamed
        changed.append(f"{where}: requirements[].evidence -> how_demonstrated (it is the method, not the proof)")

    block = re.search(r"^evidence:\n((?:[ \t]+.*\n)+)", frontmatter, re.M)
    if not block:
        return frontmatter

    entries = re.findall(r"-\s*name:\s*(.+)\n\s*url:\s*(\S+)", block.group(1))
    if len(entries) == 1 and not re.search(r"^source_of_truth:", frontmatter, re.M):
        name, url = entries[0]
        url = url.strip().strip("'\"")
        frontmatter = frontmatter[:block.start()] + frontmatter[block.end():]
        frontmatter = frontmatter + f"source_of_truth: {url}\n"
        changed.append(f"{where}: the one evidence link ({name.strip()}) became source_of_truth")
        return frontmatter

    changed.append(f"{where}: NEEDS YOU — document-level evidence: cannot be placed "
                   "mechanically. Move each entry to the requirement it demonstrates, "
                   "or to source_of_truth. check will fail until you do.")
    return frontmatter


def _date_certifications(frontmatter: str, where: Path, changed: list[str]) -> str:
    """`- ISO 27001` becomes `- name: ISO 27001`, and says which need a date."""
    block = re.search(r"^certifications:\n((?:[ \t]*-.*\n)+)", frontmatter, re.M)
    if not block:
        return frontmatter
    names = [line.strip().lstrip("-").strip().strip("'\"")
             for line in block.group(1).splitlines() if line.strip().startswith("-")]
    if not names or any(n.startswith("name:") for n in names):
        return frontmatter
    rebuilt = "certifications:\n" + "".join(f"- name: {n}\n" for n in names)
    frontmatter = frontmatter[:block.start()] + rebuilt + frontmatter[block.end():]
    changed.append(f"{where}: certifications now take a verified date — "
                   f"{len(names)} to date ({', '.join(names)})")
    return frontmatter
