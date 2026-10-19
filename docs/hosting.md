# GitHub Pages with Hostinger DNS

This public source repository uses GitHub Pages Free eligibility. The domain
`farzadwrites.com` stays registered at Hostinger; no Hostinger web-hosting or
website-builder package is required.

Only generated `public/` is uploaded by Actions. The approved canonical URL is
`https://farzadwrites.com/`; the initial origin was
`https://farzad528.github.io/fs-notes/`. The one authoritative base URL is
`config/_default/hugo.yaml`; do not put a second production URL in workflows.

## Release stages

1. Merge the checked implementation PR. Enable Pages with GitHub Actions as its
   source and explicitly approve the labeled demonstration launch.
2. Deploy and verify the project origin, including `/fs-notes/` paths, article,
   CSS/fonts, RSS, sitemap, and canonical URLs.
3. Verify `farzadwrites.com` in the owner's GitHub account using the TXT token
   shown in Profile Settings > Pages. Never invent the token.
4. Add `farzadwrites.com` as the repository's custom domain before pointing
   public DNS at GitHub. Review the exact DNS diff below with the owner.
5. Change the central base URL to `https://farzadwrites.com/` through a focused
   PR. GitHub Pages settings are authoritative; Actions publishing needs no
   `CNAME` file in the artifact.
6. Wait for DNS/certificate provisioning, enable Enforce HTTPS, and verify apex,
   `www` redirect, project-origin behavior, and live content.

The initial project-origin release completed on 19 October 2026, with real
HTTPS smoke in Actions run `39236136817`. The owner subsequently verified the
domain in GitHub and approved attachment/canonical deployment at 13:08 London.
The ownership TXT was observed on the authoritative Hostinger nameserver.
Do not store the verification token in public source. Domain routing and
certificate completion remain pending until their live results are observed.

Do not disable privacy/security controls or make a private editorial repository
public as a shortcut. This public repository began with fresh history.

## Exact proposed DNS changes

The owner's supplied DNS screen and public lookup showed the following parking
records on 18 October 2026. Re-read the current zone before applying anything.
These are **proposed**, not evidence of applied changes.

| Operation | Type | Host | Old value | New value | TTL |
|---|---|---|---|---|---|
| Replace parking A | A | @ | `2.57.91.91` | `185.199.108.153` | 300 |
| Add | A | @ | none | `185.199.109.153` | 300 |
| Add | A | @ | none | `185.199.110.153` | 300 |
| Add | A | @ | none | `185.199.111.153` | 300 |
| Replace | CNAME | www | `farzadwrites.com` | `farzad528.github.io` | 300 |
| Add ownership proof | TXT | `_github-pages-challenge-farzad528` | none | Exact GitHub-supplied token | 300 |

The owner added the TXT record and GitHub verified it on 19 October. Preserve
that existing TXT record; do not create a second token or delete the proof.
The A/CNAME routing changes above were previewed to the owner and remain
owner-operated in Hostinger. Read the current zone before editing.

GitHub's official current IPv6 records may optionally be added alongside IPv4:
`2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`,
`2606:50c0:8003::153`. Refresh the official documentation at application time.
Do not leave conflicting parking A/AAAA records in place.

Keep nameservers `aster.dns-parking.com` and `helios.dns-parking.com` if Hostinger
remains the authoritative DNS provider. Preserve unrelated MX/TXT, email,
verification, and other records. No wildcard record, DNS-zone reset, or
nameserver migration is needed. Set only the specific approved entries.

In hPanel: Domains > farzadwrites.com > DNS / Nameservers > DNS records. The
account owner signs in directly; do not paste passwords, payment details, or
registrar API keys into chat or GitHub.

DNS and certificate changes can take time. A domain purchase does not prove
site routing or HTTPS. Keep ownership verification while DNS points to Pages
to reduce takeover risk.

## Read-only diagnosis

```powershell
npm run pages-preflight -- --repo farzad528/fs-notes
npm run pages-preflight -- --repo farzad528/fs-notes --require-configured
npm run pages-preflight -- --repo farzad528/fs-notes --require-ready
```

The first command reports expected blockers without changing anything. The
second must pass before release artifact upload; it checks repository policy,
Actions source, canonical hostname/path, and custom-domain ownership. The third
also requires enforced, approved, unexpired certificate coverage. HTTP 404 means
unconfigured/inaccessible, not a proved plan decision.

After a deployed release:

```powershell
npm run smoke -- https://farzad528.github.io/fs-notes/
# After the approved domain cutover:
npm run smoke -- https://farzadwrites.com/
```

No real HTTPS success is claimed until these commands run against the actual
deployed site. See `launch-status.md` for observations.

## Official sources

- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages
- https://www.hostinger.com/support/1583249-how-to-manage-dns-records-at-hostinger/
