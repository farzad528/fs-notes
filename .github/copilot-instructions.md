# fs writes public publication

Read `docs/publishing.md` for content tasks and `docs/hosting.md` for release work.

- This repository and every commit, issue, PR, and workflow log are public.
  Never add private drafts, editorial plans, credentials, customer information,
  unpublished source notes, or reference captures. Keep private work outside
  this repository, not merely behind `draft: true`.
- Preserve the supplied Margin layout and small static Hugo architecture.
  Keep the owner's simplified `fs writes | RSS` header and Connect profiles;
  do not restore About navigation or the removed notebook eyebrow.
  Keep bundled font licenses intact. No redesign, tracking, newsletter,
  database, or executable browser JavaScript without owner approval.
- Supplied final copy plus "publish" authorizes preparation of a focused content
  PR. Preserve the exact wording and argument. A draft or backlog idea is not
  permission to put source in this public repository.
- Use Markdown bundles under `content/posts/<stable-slug>/`. Generate home,
  archive, article, metadata, feeds, sitemap, and next-note links from source.
  Never edit generated HTML or hand-maintain a list of articles.
- Preserve established slugs and publication dates on updates; change `lastmod`.
  Use correct Europe/London offsets. Draft/future exclusion must apply to every
  generated route, feed, and asset.
- Use `npm run prepare-post` for explicit approved-copy intake, then
  `npm run check`. Keep normal copy longer/shorter warnings advisory.
- The canonical URL comes only from `config/_default/hugo.yaml`. Retain project
  prefix and custom-root support. Never invent domain ownership or DNS tokens.
- Keep deployment main-only, gated by `SITE_LAUNCH_APPROVED=true`, and protected
  by read-only Pages configuration checks before artifact upload. Only `public/`
  may be deployed. Never introduce a deployment PAT or bypass repository rules.
- In cloud-agent mode a human must review/merge. In authenticated CLI/editor
  mode use only real granted authority and the owner's explicit request.
- Do not invent product facts, social links, personal experiences, completed
  purchases, approvals, successful deployments, or continuous monitoring.
- Report the PR/live URL and actual remaining owner action. A local build is
  not a live release.
