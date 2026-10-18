# Launch state

Recorded 18 October 2026, Europe/London.

The owner requested a clean public publication repository with a labeled Lorem
ipsum demonstration of the article/deployment pipeline. The previous repository
was renamed privately; its history, editorial backlog, private runbooks, and
reference captures are not imported here.

| Item | Observed state |
|---|---|
| Public repository | `https://github.com/farzad528/fs-notes`, newly created with fresh history. |
| Local public checkout | `C:\dev\fs-notes-public`. |
| Design | Supplied Margin layout, licensed self-hosted fonts; no design change in this split. |
| Demonstration | Explicitly labeled Lorem ipsum article, not a finished essay or customer claim. |
| Canonical first origin | `https://farzad528.github.io/fs-notes/`; configured URL is not proof of deployment. |
| Domain | `farzadwrites.com`, registered at Hostinger according to owner-provided active-domain evidence. |
| DNS | Parking A `2.57.91.91`, `www` CNAME to apex last observed; no routing mutation applied by this implementation. |
| Domain cutover | Pending GitHub ownership TXT, Pages custom-domain configuration, approved DNS diff, and certificate readiness. |

The intake helper preserves exact approved Markdown, real London publication
times, stable update dates/slugs/assets, and explicit draft/publish authority.
Read-only preflight blocks mismatched Pages destinations. The workflow deploys
only a checked generated artifact from trusted `main` after launch approval.

Local and remote command evidence is recorded in the implementation PR. Do not
infer live HTTPS, completed routing, or deployment from a successful build.
