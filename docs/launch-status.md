# Launch state

Recorded 18 October 2026, Europe/London.

The owner requested a clean public publication repository with a labeled Lorem
ipsum demonstration of the article/deployment pipeline. The previous repository
was renamed privately; its history, editorial backlog, private runbooks, and
reference captures are not imported here.

| Item | Observed state |
|---|---|
| Public repository | `https://github.com/farzad528/fs-notes`, newly created with fresh history. |
| Launch PR | `https://github.com/farzad528/fs-notes/pull/1`, open and unmerged. |
| Local public checkout | `C:\dev\fs-notes-public`. |
| Design | Supplied Margin layout, licensed self-hosted fonts; no design change in this split. |
| Demonstration | Explicitly labeled Lorem ipsum article, not a finished essay or customer claim. |
| Canonical first origin | `https://farzad528.github.io/fs-notes/`; configured URL is not proof of deployment. |
| Pages settings | Actions source enabled on the new public repository; API reports enforced project-origin HTTPS. |
| Deployment approval | `SITE_LAUNCH_APPROVED` remains unset; no article release or deployed smoke has occurred. |
| Domain | `farzadwrites.com`, registered at Hostinger according to owner-provided active-domain evidence. |
| DNS | Parking A `2.57.91.91`, `www` CNAME to apex last observed; no routing mutation applied by this implementation. |
| Domain cutover | Pending GitHub ownership TXT, Pages custom-domain configuration, approved DNS diff, and certificate readiness. |

The intake helper preserves exact approved Markdown, real London publication
times, stable update dates/slugs/assets, and explicit draft/publish authority.
Read-only preflight blocks mismatched Pages destinations. The workflow deploys
only a checked generated artifact from trusted `main` after launch approval.

Observed evidence for source commit `a896670`:

- `npm run check`: 63 local tests passed and strict production build rendered the
  one clearly labeled demo.
- Public CI: https://github.com/farzad528/fs-notes/actions/runs/39169386731
  completed successfully, including `npm ci` from public npm URLs.
- Read-only `pages-preflight --require-ready` passed against the configured
  project origin. This checks Pages API state, not a deployed HTTP response.
- Local production preview returned HTTP 200 at
  `http://localhost:4174/fs-notes/`; public-safe captures are in `docs/review/`.

Inspect the PR's latest checks after later revisions. Do not infer live content,
completed domain routing, or deployed TLS verification from build/API readiness.
