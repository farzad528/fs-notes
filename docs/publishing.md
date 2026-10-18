# Publish approved copy

This is a public publishing repository. A `draft` flag excludes generated
output; it does not conceal Markdown, assets, PRs, logs, or old Git commits.
Keep editorial planning and unapproved drafts outside this repository.

## Prepare a new article

The owner supplies final copy with "Publish this final draft on FS Notes."
Choose a stable lowercase slug and preserve the exact wording. Derive a short
description and explicit Markdown excerpt from that copy, without adding
claims. Save the approved body and excerpt as UTF-8 files in a protected
temporary location outside the repository.

```powershell
npm run prepare-post -- --slug stable-slug --title "Approved title" --input C:\PRIVATE-INPUT\body.md --description "Description derived from approved copy." --excerpt C:\PRIVATE-INPUT\excerpt.md --publish
npm run check
```

Replace the example inputs with real files. The helper does not infer approval,
run Git, create PRs, merge, or deploy. `--publish` is an explicit approved-copy
choice. Without it the bundle is a draft, which must remain local until the
owner explicitly approves making its source public.

The helper preserves body bytes, computes actual London dates including DST,
and rejects conflicting slugs, missing metadata, unsafe HTML, and placeholders.
An approved first publication gets matching `date`, `publishDate`, and
`lastmod`. No scheduling is enabled.

The explicit excerpt is used on home and as the article lede. Do not remove an
approved opening paragraph just because it repeats the lede. Topics are public
labels when nonempty; leave `topics: []` unless labels are intended.

## Update an established article

```powershell
npm run prepare-post -- --slug existing-stable-slug --input C:\PRIVATE-INPUT\revised-body.md --update --publish
npm run check
```

Published updates preserve the slug, original publication dates, author,
topics, and existing assets; `lastmod` changes. Optional title, description, and
excerpt flags replace those fields. Published updates require `--publish` to
avoid accidentally unpublishing. Draft promotion records the real first
publication time. Scheduled targets require a deliberate scheduling workflow
and are rejected by this helper.

The helper uses a cooperative update lock, compares the original file before an
atomic replacement, and refuses detected concurrent edits. A stale lock needs
human inspection before removal. Do not use it to overwrite someone else's
active editing session.

## Review, merge, and deploy

Create a focused content branch/PR. Include the exact copy changes, anticipated
URL, London date, and actual validation results. Public PRs must contain only
approved public information. Do not add confidential source material as proof.

GitHub cloud agent cannot approve or merge its own PR; a human must do so.
An authenticated editor/CLI agent may complete the normal checked flow only
under explicit owner authority and existing rules. No admin bypass or weakened
protections.

The homepage automatically features the newest eligible publication. The
archive, RSS, sitemap, next-note selection, and article metadata update from
source; no domain change is needed when a new article is published.

Deployment runs for trusted `main` pushes/manual dispatch only, with
`SITE_LAUNCH_APPROVED=true`. A read-only preflight checks that the configured
Pages destination matches the central base URL. After deployment, HTTPS
readiness and the live crawler must pass before declaring the release live.

Report the actual article URL, date, and observed deployment result. A URL
printed by the intake helper is anticipated, not proof of a live page.

## Roll back

Revert the responsible commit through a focused PR and redeploy. Preserve the
established URL/date on corrections. Never rewrite public Git history to
pretend content was not published; credentials or private data accidentally
committed require an explicit incident response.
