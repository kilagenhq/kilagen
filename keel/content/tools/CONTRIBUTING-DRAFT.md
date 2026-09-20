# Contributing to the tool inventory — DRAFT, not ready to publish

> This draft is the scaffolding, not the policy. Three questions below have no
> answer yet, and they are not technical ones. **Nothing is published until they
> are answered**, because the first file makes claims about real companies'
> products and the first pull request from a vendor arrives within the month.

## What this inventory is

One file per capability, listing tools that exist in that space. For each tool:
its name, its URL, whether it is proprietary or open source, and one line, in
our words, saying what it is.

## What it is not

- **Not a recommendation.** No rating, no rank, no "best for". The schema has
  no field for one, and that is deliberate.
- **Not exhaustive.** A missing tool is not a judgement about it.
- **Not a capability matrix.** Feature grids go stale every quarter and are what
  a vendor will want to argue about. Not in the first version.
- **Not an inventory of what anyone runs.** What you deploy is your estate's
  truth, and it never lives here.

## How it reaches a user

The inventory lives in this repository, and a Kilagen release vendors a
snapshot of it (`scripts/vendor-tools.sh`). An instance fetches nothing at build
time: it gets whatever shipped with the version it installed, and a newer list
arrives with `pip install -U kilagen`.

## Changing a file

- The filename is the capability id, and it must match the `capability:` inside.
- Move `updated:` when you review the list. A list with no recent date is a list
  nobody has checked.
- `note:` says **what a tool is**, never how good it is. One line, under 200
  characters, in our words — never copied from the vendor's marketing.
- `license:` has exactly two values: `proprietary` or `open-source`. Which
  open-source licence, and which edition is free, changes too often to assert.

## Open — these three are the maintainer's to answer

> [!danger] Nothing is published until these are written down
>
> 1. **Who approves a pull request from a vendor about their own product?**
>    It will happen in the first month.
> 2. **What is the inclusion criterion?** Without one, the answer to "why isn't
>    mine here?" is "because we forgot", which is worse than a strict rule.
> 3. **Can money buy a place here?** A "no" written on day one is worth far more
>    than a "no" improvised when the offer arrives.

Until all three are answered, this file stays a draft and the repository stays
closed.
