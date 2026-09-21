# Changelog

Notable changes to the `kilagen` package.

This project follows [semantic versioning](https://semver.org).

## 0.1.0 — 2026-09-21

### Added

- The framework, the CLI and the dashboard: six verbs (`init`, `new`, `check`, `build`, `serve`, `update`) over a program held as Markdown and YAML.
- Six framework vocabularies ship with the package — PCI DSS v4.0.1, ISO/IEC 27001, SOC 2, NIST CSF, ISO/IEC 27017, ISO/IEC 27018 — plus CIS v8 and the HIPAA Security Rule. An instance declares an id; it does not copy a list.
- `kilagen check evidence`: what each requirement can prove, and what has gone stale.
- `kilagen update evidence`: run the collectors named on a requirement and record where the proof now lives.

### Content contract

`schema_version` is **3**. Two migrations ship with it, run by `kilagen update content`:

- `m002` (1 → 2) renames the type `adr` to `decision`, deletes `status` from every gap and exception — their state is computed from write-once facts, and a declared status could only agree redundantly or contradict silently — and rescales `binding` to `mandatory` / `voluntary` / `reference`.
- `m003` (2 → 3) moves `evidence:` from the document to the requirement it proves, renames a requirement's old `evidence:` prose to `how_demonstrated:`, derives supersession from the `supersedes:` on the newer document instead of a `superseded_by:` on the older one, and renames a gap's `superseded_by:` to `excepted_by:`, which meant something different from the other two uses of that name.

A migration refuses rather than overwriting a document it did not write, and refuses to stamp the new version when it could not migrate something.
