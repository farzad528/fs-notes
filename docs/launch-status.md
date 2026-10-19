# Launch state

Updated 19 October 2026, Europe/London.

The owner requested a clean public publication repository with a labeled Lorem
ipsum demonstration of the article/deployment pipeline. The previous repository
was renamed privately; its history, editorial backlog, private runbooks, and
reference captures are not imported here.

| Item | Observed state |
|---|---|
| Public repository | `https://github.com/farzad528/fs-notes`, newly created with fresh history. |
| Launch PR | `https://github.com/farzad528/fs-notes/pull/1`, merged at 11:15 London on 19 October 2026. |
| Local public checkout | `C:\dev\fs-notes-public`. |
| Design | Supplied Margin layout, licensed self-hosted fonts; no design change in this split. |
| Demonstration | Explicitly labeled Lorem ipsum article, not a finished essay or customer claim. |
| Canonical first origin | `https://farzad528.github.io/fs-notes/`, deployed and observed live over HTTPS. |
| Pages settings | Actions source enabled on the new public repository; API reports enforced project-origin HTTPS. |
| Deployment approval | Owner explicitly approved merge/demo deployment; `SITE_LAUNCH_APPROVED=true`. |
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

## Observed first release

The owner approved merge/deploy on 19 October 2026. The exact checked PR head
was merged without bypass as `ee5983cbb4cbfa815f9f034f91a99bca5387d60a`.
Trusted main-push deployment completed successfully:
https://github.com/farzad528/fs-notes/actions/runs/39236136817.
Its build, Pages deployment, HTTPS readiness, and real live smoke jobs passed.

The live browser returned HTTP 200 for
https://farzad528.github.io/fs-notes/posts/pipeline-demo/ and displayed the
explicit temporary-demo label. Home features that article, fonts load, and
canonical URLs point to the deployed project origin. The demo retains its
original 18 October publication timestamp; deploying it did not rewrite dates.

DNS was re-read on 19 October: apex remains `2.57.91.91` and `www` points to
`farzadwrites.com`. No custom domain is attached in Pages and no registrar DNS
records were changed. Domain ownership TXT, approved routing changes, canonical
cutover, and the custom-domain HTTPS release remain separate pending work.
