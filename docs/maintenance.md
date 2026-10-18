# Maintain the publication

Node 24.19.0, standard Hugo 0.168.0, parse5 8.0.1, and yaml 2.9.1 are pinned.
The lockfile uses public npm URLs; no corporate package-feed credential is
required. The bundled entities dependency is 8.1.0. Licenses: Hugo Apache-2.0,
parse5 MIT, yaml ISC, entities BSD-2-Clause; bundled fonts SIL OFL 1.1.

The Windows installer and Linux CI setup verify pinned Hugo archive checksums
before extraction. Actions are pinned to immutable commits. Review upstream
changes before updating versions/checksums and keep dependency PRs separate
from article PRs.

Dependabot requests grouped weekly npm/Actions updates after its configuration
is on the default branch. Weekly external-link reporting is opt-in through
`LINK_HEALTH_ENABLED=true`; a timeout is not automatically a production outage.
No continuous agent monitor is configured.

For CSS/template changes, compare at 390x1000, 768x1000, and 1440x1000 after fonts
load. Check keyboard focus, JavaScript-disabled reading, and long table/code
content. Keep private reference captures outside this public repository.

On maintenance requests, inspect recent builds, live links, TLS certificate,
dependencies, registrar expiry, and ownership. Keep registrar account recovery,
MFA, renewal, privacy, and lock settings owner-controlled. Do not record personal
registrant details or billing receipts in public source.

Roll back by reverting a bad commit in a PR and redeploying a known-good build.
Keep an owner-controlled backup independent of GitHub, for example an encrypted
Git bundle and a published `public/` snapshot. Git history is not an independent
account backup.
