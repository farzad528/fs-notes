import { pathToFileURL } from 'node:url';
import { normalizeBase, parse, parseFragment, nodes, attr, articleData, xmlValues, rejectPlaceholder } from './lib.mjs';

export async function smoke(value) {
  const base = normalizeBase(value);
  if (base.protocol !== 'https:') throw new Error('Smoke checks require an HTTPS publication URL.');
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLS certificate verification must be enabled.');
  const pending = [base.href, new URL('about/', base).href, new URL('archive/', base).href,
    new URL('index.xml', base).href, new URL('sitemap.xml', base).href, new URL('robots.txt', base).href];
  const seen = new Set();
  const html = new Map();
  const anchors = [];
  const feeds = new Map();
  const enqueue = (raw, from, absolute = false) => {
    if (/^(?:mailto|tel):/i.test(raw)) return;
    if (absolute && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) throw new Error(`Feed URL must be absolute: ${raw}`);
    const url = new URL(raw, from);
    if (url.protocol !== 'https:') throw new Error(`Unsafe or mixed-content URL: ${url.href}`);
    rejectPlaceholder(url.href, 'Remote link');
    if (url.origin !== base.origin) return;
    if (!url.pathname.startsWith(base.pathname)) throw new Error(`URL escapes the publication base: ${url.href}`);
    if (url.hash) anchors.push({ url: `${url.origin}${url.pathname}`, hash: decodeURIComponent(url.hash.slice(1)) });
    url.hash = ''; url.search = '';
    pending.push(url.href);
  };
  const inspect = (document, from, absolute = false) => {
    for (const element of nodes(document)) {
      if (element.tagName === 'script') articleData(element, from);
      if (['iframe', 'object', 'embed', 'base'].includes(element.tagName)) throw new Error(`Unexpected active content at ${from}`);
      for (const attribute of element.attrs ?? []) if (/^on/i.test(attribute.name)) throw new Error(`Unsafe HTML at ${from}`);
      if (element.tagName === 'img' && !attr(element, 'alt')?.trim()) throw new Error(`Missing image alt at ${from}`);
      for (const name of ['href', 'src', 'poster']) {
        const raw = attr(element, name);
        if (raw != null) enqueue(raw, from, absolute);
      }
      if (attr(element, 'srcset')) for (const part of attr(element, 'srcset').split(',')) enqueue(part.trim().split(/\s+/)[0], from, absolute);
    }
  };
  while (pending.length) {
    const url = pending.shift();
    if (seen.has(url)) continue;
    if (seen.size >= 2000) throw new Error('Smoke crawl exceeds 2,000 URLs; inspect the publication before increasing the bound.');
    seen.add(url);
    let response;
    let current = url;
    for (let redirects = 0; redirects <= 5; redirects++) {
      response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      if (response.status >= 300 && response.status < 400) {
        const next = new URL(response.headers.get('location'), current);
        if (next.protocol !== 'https:' || next.origin !== base.origin || !next.pathname.startsWith(base.pathname)) throw new Error(`Unsafe redirect from ${current}: ${next.href}`);
        await response.body?.cancel();
        current = next.href;
        if (redirects === 5) throw new Error(`Too many redirects for ${url}`);
        continue;
      }
      break;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    if (current !== url) throw new Error(`Unexpected publication redirect: ${url} → ${current}`);
    const contentType = response.headers.get('content-type') ?? '';
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.length > 10_000_000) throw new Error(`Resource exceeds 10 MB smoke bound: ${url}`);
    if (contentType.includes('text/html')) {
      const text = new TextDecoder().decode(buffer);
      const document = parse(text);
      const canonical = nodes(document, 'link').filter(node => attr(node, 'rel') === 'canonical');
      if (canonical.length !== 1 || attr(canonical[0], 'href') !== url) throw new Error(`Wrong canonical at ${url}`);
      if (!nodes(document, 'meta').some(node => attr(node, 'name') === 'description' && attr(node, 'content'))) throw new Error(`Missing description at ${url}`);
      html.set(url, { text, ids: new Set(nodes(document).map(node => attr(node, 'id')).filter(Boolean)) });
      inspect(document, url);
      const structured = nodes(document, 'script').map(node => articleData(node, url));
      if (new URL(url).pathname.startsWith(new URL('posts/', base).pathname)) {
        if (structured.length !== 1 || structured[0].url !== url) throw new Error(`Missing or mismatched BlogPosting at ${url}`);
      } else if (structured.length) throw new Error(`Unexpected BlogPosting at ${url}`);
    } else if (contentType.includes('text/css')) {
      const css = new TextDecoder().decode(buffer);
      for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) enqueue(match[1], url);
    } else if (url.endsWith('/index.xml') || url.endsWith('/sitemap.xml') || url.endsWith('/robots.txt')) {
      const xml = new TextDecoder().decode(buffer);
      feeds.set(url, xml);
      if (url.endsWith('/sitemap.xml')) for (const location of xmlValues(xml, 'loc')) enqueue(location, base, true);
      if (url.endsWith('/index.xml')) {
        for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
          const link = xmlValues(match[1], 'link')[0];
          if (!link) throw new Error('RSS item is missing its article link.');
          enqueue(link, base, true);
          const content = xmlValues(match[1], 'description')[0];
          if (!content?.trim()) throw new Error('RSS item has no full content.');
          inspect(parseFragment(content), link, true);
        }
      }
    }
  }
  const rss = feeds.get(new URL('index.xml', base).href);
  const sitemap = feeds.get(new URL('sitemap.xml', base).href);
  const robots = feeds.get(new URL('robots.txt', base).href);
  if (!rss || !/<rss\b/.test(rss) || !/<channel>/.test(rss) || !/<\/rss>/.test(rss)) throw new Error('Invalid or missing RSS document.');
  if (!sitemap || !/<urlset\b/.test(sitemap) || !/<\/urlset>/.test(sitemap)) throw new Error('Invalid or missing sitemap.');
  if (!robots?.includes(new URL('sitemap.xml', base).href)) throw new Error('robots.txt sitemap differs from the publication URL.');
  const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => match[1]);
  const articleURLs = items.map(item => xmlValues(item, 'link')[0]);
  const locations = xmlValues(sitemap, 'loc');
  for (const item of items) {
    const link = xmlValues(item, 'link')[0];
    if (!link || !link.startsWith(new URL('posts/', base).href)) throw new Error('RSS item has an invalid article link.');
    const content = xmlValues(item, 'description')[0];
    if (!content?.trim()) throw new Error('RSS item has no full content.');
    if (!locations.includes(link)) throw new Error(`RSS article is absent from sitemap: ${link}`);
  }
  if (![base.href, new URL('about/', base).href, new URL('archive/', base).href].every(url => locations.includes(url))) throw new Error('Sitemap must include home, About and Archive.');
  const archive = html.get(new URL('archive/', base).href);
  if (!archive) throw new Error('Archive did not return HTML.');
  const archiveLinks = nodes(parse(archive.text), 'main').flatMap(main => nodes(main, 'li')).flatMap(item => nodes(item, 'a').map(link => new URL(attr(link, 'href'), base).href));
  if (JSON.stringify(archiveLinks) !== JSON.stringify(articleURLs)) throw new Error('Archive and RSS article order differs.');
  for (const { url, hash } of anchors) if (html.has(url) && !html.get(url).ids.has(hash)) throw new Error(`Broken anchor: ${url}#${hash}`);
  if (!html.has(base.href)) throw new Error('Home page did not return HTML.');
  if (!items.length) {
    if (!html.get(base.href).text.includes('Essays coming soon.')) throw new Error('Empty RSS requires the approved home empty state.');
    console.log('Empty publication verified: “Essays coming soon.” No article check required.');
  } else {
    for (const url of articleURLs) if (!html.has(url)) throw new Error(`Article did not return HTML: ${url}`);
    console.log(`Verified ${items.length} published articles and full-content RSS.`);
  }
  const sitemapArticles = locations.filter(location => location.startsWith(new URL('posts/', base).href));
  if (JSON.stringify([...sitemapArticles].sort()) !== JSON.stringify([...articleURLs].sort())) throw new Error('RSS and sitemap article lists differ.');
  console.log(`HTTPS/certificate, canonical, assets, internal links, RSS and sitemap passed (${seen.size} URLs).`);
  return { urls: seen.size, articles: items.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) { console.error('Usage: npm run smoke -- https://host/publication/'); process.exitCode = 1; }
  else smoke(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
