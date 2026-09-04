# Lenses — Alternative Projections

The repo is organized by operational domains — how engineers work day-to-day. But a security program also needs to be viewed through other perspectives: risk management lifecycle (NIST CSF), maturity, etc. These alternative projections over the same data are called **lenses**.

For overall framework design, see `design.md`.

## Structure

Each lens has two parts:

1. **Taxonomy file** in `keel/lenses/` — defines structure (groups, categories, names, colours). Describes a taxonomy (e.g. NIST CSF), not the program itself.
2. **`lenses` field** in documents and capabilities — tags that opt each item into lens categories. The mapping is distributed across content, not centralized.

## The `lenses` field

Optional on all document types and on each capability in `capabilities.yml`. Array of strings with format `<lens-id>:<tag>`:

```yaml
lenses: [nist:PR.AA, nist:DE.CM]
```

A document or capability can have multiple tags, including from the same lens.

## How the dashboard builds a lens view

1. Load taxonomy from `keel/lenses/<lens-id>.yml`.
2. Scan all documents and capabilities for matching `lenses` entries.
3. Group by tag → list of documents and capabilities per category.
4. Calculate coverage.

Adding `lenses: [nist:GV.PO]` to a document automatically places it in that category — no central file to update.

## Coverage calculation

**Categories with tagged capabilities:**

| Condition | Result |
|---|---|
| All capabilities L2+ | `covered` |
| All L0, but active documents exist | `partial` |
| All L0, no active documents | `gap` |
| Mix of levels, or any at L1 | `partial` |

**Document-only categories (no capabilities tagged):**

| Condition | Result |
|---|---|
| At least one active document | `covered` |
| At least one draft document | `partial` |
| No documents tagged | `gap` |

## Adding a new lens

1. Create `keel/lenses/<lens-id>.yml` with the taxonomy structure.
2. Add `<lens-id>:<tag>` entries to relevant documents and capabilities.
3. Create a dashboard module that loads the taxonomy and scans for tags.
4. Document the lens in this file.
