# Security policy

## Reporting a vulnerability

Report privately to **[hello@kilagen.com](mailto:hello@kilagen.com)**, or open a [private vulnerability report](https://github.com/kilagenhq/kilagen/security/advisories/new) on this repository. Please do not open a public issue for anything exploitable.

Include what you did, what happened, and the version (`kilagen --version`). A proof of concept helps; a working exploit is not required.

You can expect an acknowledgement within three working days and an assessment within ten. If a fix is warranted we will agree a disclosure date with you, and credit you in the release notes unless you would rather we did not.

## Supported versions

Before 1.0, only the latest release is supported. Fixes ship in a new release rather than as patches to older ones.

## Scope

In scope: the `kilagen` package and CLI, the dashboard it builds, the scaffolding `kilagen init` writes into your repository, and the workflows that scaffolding ships.

Two things are worth knowing before you report them, because they are design decisions rather than defects:

- **A built site is as public as wherever you deploy it.** `publish:` governs external destinations, not the dashboard, and nothing under `program/` is a confidentiality boundary. What must not be read by whoever can read the repository does not belong in the repository — it belongs behind an `evidence:` URL.
- **A collector is code you chose to run.** `kilagen update evidence` executes `collectors/<name>.py` from your own repository. Review a collector the way you would review any other code in it.

Out of scope: findings against a program's own content, and anything requiring an attacker who can already commit to your repository.
