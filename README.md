# fs notes

A static publication by Farzad Sunavala: notes on building, deploying, and
leading with AI. Hugo generates article pages, the latest-first homepage,
year archive, full-content RSS, metadata, and sitemap from Markdown.

**This repository is public.** Do not commit unpublished drafts or editorial
notes here. Only explicitly approved copy and a labeled demonstration article
belong in its publication content.

## Run locally

Use Node 24.19.0 and standard Hugo 0.168.0. On Windows:

```powershell
Set-Location C:\dev\fs-notes-public
& .\.github\scripts\install-hugo.ps1
npm ci
npm run check
npm run preview
```

The exact-output preview runs on localhost:4173. `npm run dev` previews drafts
locally; `npm run visual-preview` serves isolated Lorem ipsum review fixtures.
None of these commands makes source private if it has already been committed.

| Command | Purpose |
|---|---|
| `npm run prepare-post -- --help` | Create/update an article from exact approved Markdown; draft by default. |
| `npm run check` | Strict production build, content/link validation, publication and pipeline tests. |
| `npm run build` | Clean production build excluding drafts/future posts. |
| `npm run pages-preflight -- --repo farzad528/fs-notes` | Read-only Pages/configuration/HTTPS diagnosis. |
| `npm run smoke -- <HTTPS base URL>` | Inspect actual deployed pages, feeds, assets, canonical URLs, and TLS. |

The repository uses the supplied Margin design with self-hosted Newsreader,
Hanken Grotesk, and JetBrains Mono. Licenses are distributed in `static/fonts/`.
It requires no browser JavaScript, server, database, analytics, or comments.

## Publish through GitHub

Give an authenticated agent the final article and say:

```text
Publish this final draft on FS Notes.
Title: [title]
[approved article text]
```

The agent preserves the copy, creates a stable bundle, derives metadata and an
excerpt, validates the site, and opens a focused PR. A checked merge to `main`
deploys only when launch approval and Pages configuration permit it.
Cloud-agent mode requires a human merge. See [Publishing](docs/publishing.md).

The production canonical URL is `https://farzadwrites.com/`, registered at
Hostinger. The demo first launched at `https://farzad528.github.io/fs-notes/`.
Domain attachment, DNS routing, and HTTPS provisioning are distinct steps; see
the recorded [launch state](docs/launch-status.md) for the current cutover state.

See [Hosting](docs/hosting.md) for the exact record plan and
[Maintenance](docs/maintenance.md) for dependency updates and rollback.

The [launch PR](https://github.com/farzad528/fs-notes/pull/1) was merged with owner
approval on 19 October 2026. The initial Pages deployment and live smoke passed.
The owner approved the custom-domain cutover after verifying ownership.
