# Launch state

Updated 19 October 2026, Europe/London.

| Item | Observed state |
|---|---|
| Public source | `https://github.com/farzad528/fs-notes`; fresh publication history without private editorial material. |
| Local checkout | `C:\dev\fs-notes-public`. |
| Initial launch | PR #1 merged with owner approval as `ee5983c`; project-origin deployment completed. |
| Live publication | `https://farzadwrites.com/`, with the clearly labeled Lorem ipsum pipeline demo. |
| Release evidence | https://github.com/farzad528/fs-notes/actions/runs/39236136817 succeeded in build, deployment, and actual live HTTPS smoke. |
| Launch gate | `SITE_LAUNCH_APPROVED=true`, enabled after explicit owner approval. |
| Registered domain | `farzadwrites.com` at Hostinger. |
| Ownership proof | Owner added the GitHub TXT record; authoritative DNS returned the supplied value and GitHub displayed Verified. |
| Canonical cutover | Owner approved domain attachment and canonical-URL deployment at 13:08 London on 19 October. Source base URL is now `https://farzadwrites.com/`. |
| Routing | Hostinger apex uses the four GitHub Pages IPv4 records; `www` CNAME is `farzad528.github.io`. Both authoritative DNS servers and a public resolver confirm the records. |
| HTTPS | Correct custom certificate approved for `farzadwrites.com` and `www.farzadwrites.com`, expiring 17 January 2027. Enforce HTTPS enabled. |
| Secure release evidence | https://github.com/farzad528/fs-notes/actions/runs/39270631113 completed successfully, including real HTTPS smoke. |

The original release displayed the demo on home and its stable
`/posts/pipeline-demo/` article route, with loaded fonts and correct canonical
URLs. The live smoke covered article, archive, RSS, sitemap, assets, and TLS.
Article publication dates were preserved.

The custom-domain update changes only the central base URL and release
documentation. It does not rewrite article copy, change established slugs, add
social profiles from other PRs, or modify the visual design. The shared Hugo URL
helpers generate root-relative assets and custom-domain metadata automatically.

The ownership TXT is public DNS evidence but is intentionally not committed
here. Preserve it in Hostinger. No nameserver reset, wildcard record, or email
record changes are required. The owner-applied A/CNAME changes are in `hosting.md`.

The deploy workflow separates configuration readiness from HTTPS readiness.
The build can proceed once the verified custom-domain configuration matches
the base URL, including the API's temporary HTTP address during certificate
provisioning. This permits only matching verified hostname/path configuration,
not a successful HTTP release or disabled final TLS validation.
The post-deployment HTTPS/smoke checks may remain blocked while
DNS or certificate provisioning is pending; that is not a successful domain
release. Re-run the trusted release after those prerequisites complete.

## Completed custom-domain HTTPS release

The owner saved Hostinger DNS on 19 October. GitHub continued serving its
default `*.github.io` certificate because custom certificate creation had not
started. Both authoritative nameservers and public DNS had correct routing,
and there was no CAA restriction.

The agent restarted GitHub's documented custom-domain provisioning procedure
by removing and immediately reattaching the domain while account-level verified
ownership and its TXT record remained intact. GitHub then approved the correct
certificate covering apex and `www`; Enforce HTTPS was enabled.

Live `pages-preflight --require-ready` and `smoke` passed. A fresh browser context
with certificate errors disallowed returned HTTP 200 for home and the demo
article with the `farzadwrites.com` certificate and TLS 1.3. HTTP apex, HTTP/HTTPS
`www`, and the original project URL all returned redirects to
`https://farzadwrites.com/`.

Trusted main workflow run `39270631113` succeeded in build, deployment, HTTPS
readiness, and live content smoke. No certificate validation was disabled to
declare success. If a browser retains an earlier certificate exception, restore
its security warnings and reopen the HTTPS site rather than bypassing warnings.
