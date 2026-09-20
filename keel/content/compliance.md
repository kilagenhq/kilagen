# Compliance — standards, requirements, and the only coverage this program claims

For the structural design, see [`design.md`](design.md).

## The two levels

A **policy** (`pol-*`) states what the organization intends and who has the
authority to issue standards. A **standard** (`std-*`) turns that into numbered
**requirements**, and the requirements are where the work is.

A requirement lives in the standard's frontmatter, not in its body:

```yaml
requirements:
  - ref: "1.2"
    text: Every user is identified by a unique account.
    evidence: An account inventory showing no shared administrative accounts.
    frameworks:
      pci_dss: ["8"]
      nist_csf: ["PR.AA"]
```

That is what makes it addressable. A framework clause maps to `1.2`, and a gap
or an exception is filed against `std-access-control#1.2` — never against "the
document".

## The traceability chain

```
PCI DSS clause 8            (from the shipped vocabulary, in scope via program/config.yml)
  ← mapped by std-access-control requirement 1.2
    → contested by gap-shared-admin-accounts   (nobody approved this)
    → and by exc-legacy-batch-account          (somebody did, until 2026-12-31)
```

Every arrow in that chain is checked. A clause that is not in the vocabulary, a
framework that is not in `config.yml`, a requirement reference that resolves to
nothing — each fails `kilagen check`.

## Requirement, gap, exception

| | Requirement | Gap | Exception |
|---|---|---|---|
| What it is | The norm | A deviation nobody approved | A deviation somebody approved |
| Where it lives | Inside a standard | `gaps/<year>/gap-*.md` | `exceptions/<year>/exc-*.md` |
| How it ends | Superseded | `remediated:` or `superseded_by:` | `expires:` or `revoked:` |
| Who owns the work | — | The tracker, via `tracker:` | The approver, until the expiry |

A shortfall with no written requirement behind it cannot be filed as a gap.
That is deliberate: either the standard is missing and should be written, or
the thing was a risk, not a gap. See
[`adrs/adr-gaps-are-documents-not-a-register.md`](adrs/adr-gaps-are-documents-not-a-register.md).

An exception's expiry is the point of it. On that date it stops authorizing
anything and the deviation is unapproved again — which the Schedule lens says
before it happens, not after.

## Coverage

`build` computes, for every clause of every in-scope framework: which
requirements map to it, which gaps against those requirements are open, and
which exceptions are live. That is the whole of it.

**Coverage is not compliance.** It records whether a clause is addressed by a
written requirement, never whether it is met — sufficiency is a human
judgement, and the generator asserts a single posture, `not-assessed`, and only
where nothing maps at all. A validator fails the build if anything ever writes
`met`, `gap` or `exception` into a computed posture.

This is the only coverage the program computes, because it is the only one with
an external, finite denominator: the framework publishes its clause list. See
[`adrs/adr-no-capability-assessment.md`](adrs/adr-no-capability-assessment.md).

## Putting a framework in scope

Kilagen ships the clause vocabularies, so there is nothing to write down:

1. Add it to `frameworks:` in `program/config.yml`, with its `binding` level.
2. Add `frameworks:` mappings to the requirements it bears on.

Coverage regenerates on the next `kilagen build`. An id that resolves to no
vocabulary is an error, and `kilagen check` lists the ids it does know.

### What ships, and at what granularity

| id | Edition | Clauses |
|---|---|---|
| `nist_csf` | NIST Cybersecurity Framework 2.0 | 22 categories |
| `pci_dss` | PCI DSS v4.0 | 12 top-level requirements |
| `iso_27001` | ISO/IEC 27001:2022 | 93 Annex A controls |
| `soc2` | SOC 2 Trust Services Criteria | 33 Common Criteria + A1 + C1 |
| `iso_27017` | ISO/IEC 27017:2015 | the 7 cloud-specific CLD controls |
| `iso_27018` | ISO/IEC 27018:2019 | 25 Annex A controls |

Each file records its own granularity, because the denominator is half of any
coverage figure. **The id is the edition**: when a publisher issues a new one it
becomes a new id, never an edit of an existing list — a coverage figure someone
published must not move underneath them.

### Overriding one, or adding your own

Drop a file at `program/model/frameworks/<id>.yml` and it wins over the shipped
edition of the same id. Same schema, and the same two shapes: a flat `clauses:`
list, or `groups:` when the framework publishes a structure. That is also how
you declare a framework Kilagen does not ship, including an internal one.

### Binding levels

The line between them is **who checks**.

- **`mandatory`** — a law, a regulator or a contract requires it. Somebody else audits you against it.
- **`voluntary`** — you audit yourself against it by choice, and assert conformity.
- **`reference`** — you use it as guidance and assert nothing.
