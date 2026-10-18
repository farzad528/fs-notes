import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, files, readConfig, normalizeBase, parse, parseFragment, nodes, attr, articleData, xmlValues, rejectPlaceholder } from './lib.mjs';

export async function validatePublic({ root = ROOT, destination = path.join(root, 'public'), baseURL, entries = [] }) {
  const base = normalizeBase(baseURL);
  const all = await files(destination);
  const documents = new Map();
  const errors = [];
  const references = [];
  const toURL = file => {
    let relative = path.relative(destination, file).replaceAll('\\', '/');
    if (relative.endsWith('index.html')) relative = relative.slice(0, -10);
    return new URL(relative, base);
  };
  const inspect = (document, from, label) => {
    const ids = new Set();
    for (const element of nodes(document)) {
      if (attr(element, 'id')) ids.add(attr(element, 'id'));
      if (element.tagName === 'script') {
        if (label.endsWith('.svg') || label === 'RSS content') errors.push(`${label}: scripts are unsupported.`);
        else articleData(element, label);
      }
      if (['iframe', 'object', 'embed', 'form', 'base'].includes(element.tagName)) errors.push(`${label}: unsupported active HTML ${element.tagName}.`);
      for (const attribute of element.attrs ?? []) {
        if (/^on/i.test(attribute.name) || attribute.name === 'srcdoc') errors.push(`${label}: unsafe HTML attribute ${attribute.name}.`);
      }
      if (element.tagName === 'img' && !attr(element, 'alt')?.trim()) errors.push(`${label}: image missing alt text.`);
      for (const name of ['href', 'src', 'poster']) {
        const raw = attr(element, name);
        if (raw != null) references.push({ raw, from, label });
      }
      const srcset = attr(element, 'srcset');
      if (srcset) for (const candidate of srcset.split(',')) references.push({ raw: candidate.trim().split(/\s+/)[0], from, label });
    }
    return ids;
  };
  for (const file of all) {
    const relative = path.relative(destination, file).replaceAll('\\', '/');
    if (/(?:^|\/)(?:config|docs|editorial|design|tests|scripts|node_modules|\.tools|resources|assets)(?:\/|$)|\.(?:md|ya?ml|mjs|json|lock|map|ps1|sh)$/i.test(relative)) errors.push(`Source leak: ${relative}`);
    if (/(?:^|\/)(?:tags|topics|categories|posts\/index\.html)(?:\/|$)/.test(relative)) errors.push(`Unexpected archive/taxonomy: ${relative}`);
    if (relative.endsWith('.svg')) {
      const svg = await fs.readFile(file, 'utf8');
      const document = parseFragment(svg);
      inspect(document, toURL(file), relative);
      if (/<foreignObject\b/i.test(svg)) errors.push(`${relative}: embedded HTML in SVG is unsupported.`);
    }
    if (relative.endsWith('.html')) {
      const html = await fs.readFile(file, 'utf8');
      rejectPlaceholder(html, relative);
      const url = toURL(file);
      const document = parse(html);
      documents.set(url.pathname, { file, document, ids: inspect(document, url, relative) });
      const entry = entries.find(item => item.eligible && new URL(`posts/${item.slug}/`, base).pathname === url.pathname);
      const structured = nodes(document, 'script').map(node => articleData(node, relative));
      if (entry) {
        if (structured.length !== 1) errors.push(`${relative}: article needs one BlogPosting.`);
        else if (structured[0].headline !== entry.title || structured[0].description !== entry.description
          || structured[0].url !== url.href || structured[0].datePublished !== entry.publishDate
          || structured[0].dateModified !== entry.lastmod) errors.push(`${relative}: BlogPosting differs from article metadata.`);
      } else if (structured.length) errors.push(`${relative}: unexpected article structured data.`);
      const canonicals = nodes(document, 'link').filter(node => attr(node, 'rel') === 'canonical');
      if (canonicals.length !== 1 || attr(canonicals[0], 'href') !== url.href) errors.push(`${relative}: canonical must be ${url.href}.`);
      if (!nodes(document, 'meta').some(node => attr(node, 'name') === 'description' && attr(node, 'content'))) errors.push(`${relative}: missing description.`);
      if (!nodes(document, 'main').some(node => attr(node, 'id') === 'main')) errors.push(`${relative}: missing main/skip target.`);
    }
    if (relative.endsWith('.css')) {
      const css = await fs.readFile(file, 'utf8');
      for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) references.push({ raw: match[1], from: toURL(file), label: relative });
    }
  }
  const feed = await fs.readFile(path.join(destination, 'index.xml'), 'utf8');
  const sitemap = await fs.readFile(path.join(destination, 'sitemap.xml'), 'utf8');
  const robots = await fs.readFile(path.join(destination, 'robots.txt'), 'utf8');
  if (!robots.includes(new URL('sitemap.xml', base).href)) errors.push('robots.txt: sitemap must use central base URL.');
  const eligible = entries.filter(entry => entry.eligible);
  const expectedArticles = eligible.map(entry => new URL(`posts/${entry.slug}/`, base).href);
  const feedItems = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => match[1]);
  const feedLinks = feedItems.map(item => xmlValues(item, 'link')[0]);
  if (JSON.stringify(feedLinks) !== JSON.stringify(expectedArticles)) errors.push('RSS items must match published posts, ordered by publishDate.');
  const locations = xmlValues(sitemap, 'loc');
  if (new Set(locations).size !== locations.length) errors.push('Sitemap has duplicate locations.');
  const expectedLocations = [base.href, new URL('about/', base).href, new URL('archive/', base).href, ...expectedArticles];
  if (JSON.stringify([...locations].sort()) !== JSON.stringify(expectedLocations.sort())) errors.push('Sitemap must contain only home, About, Archive and eligible articles.');
  const pageSize = (await readConfig(root)).pagination.pagerSize;
  const expectedHTML = [...expectedLocations, new URL('404.html', base).href,
    ...Array.from({ length: Math.max(0, Math.ceil(eligible.length / pageSize) - 1) }, (_, index) => new URL(`page/${index + 2}/`, base).href)
  ].map(value => new URL(value).pathname);
  if (JSON.stringify([...documents.keys()].sort()) !== JSON.stringify(expectedHTML.sort())) errors.push('HTML routes must be home, About, Archive, 404, eligible articles and their home pagination only.');
  const archive = documents.get(new URL('archive/', base).pathname);
  if (archive) {
    const links = nodes(archive.document, 'main').flatMap(main => nodes(main, 'li')).flatMap(item => nodes(item, 'a').map(link => new URL(attr(link, 'href'), base).href));
    if (JSON.stringify(links) !== JSON.stringify(expectedArticles)) errors.push('Archive must contain every eligible article in publishDate order only.');
  }
  for (const url of [...feedLinks, ...locations]) references.push({ raw: url, from: base, label: 'RSS/sitemap' });
  for (const item of feedItems) {
    const link = xmlValues(item, 'link')[0];
    const descriptions = xmlValues(item, 'description');
    if (!descriptions.length) errors.push('RSS item missing full content.');
    for (const body of descriptions) {
      const fragment = parseFragment(body);
      inspect(fragment, new URL(link), 'RSS content');
      for (const element of nodes(fragment)) {
        for (const name of ['href', 'src']) {
          const raw = attr(element, name);
          if (raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) errors.push(`RSS content: URL must be absolute: ${raw}`);
        }
      }
    }
  }
  for (const entry of entries) {
    const articlePath = new URL(`posts/${entry.slug}/`, base).pathname;
    if (documents.has(articlePath) !== entry.eligible) errors.push(`Publication gate failed for ${entry.slug}.`);
    if (!entry.eligible && all.some(file => path.relative(destination, file).replaceAll('\\', '/').startsWith(`posts/${entry.slug}/`))) errors.push(`Unpublished bundle asset leaked: ${entry.slug}.`);
  }
  for (const { raw, from, label } of references) {
    if (/^(?:mailto|tel):/i.test(raw)) continue;
    let url;
    try { url = new URL(raw, from); }
    catch { errors.push(`${label}: invalid URL ${raw}`); continue; }
    if (!['https:', 'http:'].includes(url.protocol)) { errors.push(`${label}: unsafe URL ${raw}`); continue; }
    if (base.protocol === 'https:' && url.protocol === 'http:') errors.push(`${label}: mixed-content URL ${raw}`);
    if (url.origin !== base.origin) continue;
    if (!url.pathname.startsWith(base.pathname)) { errors.push(`${label}: URL escapes project base: ${raw}`); continue; }
    let relative;
    try { relative = decodeURIComponent(url.pathname.slice(base.pathname.length)); }
    catch { errors.push(`${label}: invalid encoded URL ${raw}`); continue; }
    if (relative.includes('\\') || relative.split('/').includes('..')) { errors.push(`${label}: invalid path ${raw}`); continue; }
    const candidate = path.join(destination, relative, ...(url.pathname.endsWith('/') ? ['index.html'] : []));
    if (!all.includes(candidate)) { errors.push(`${label}: broken internal link/image ${raw}`); continue; }
    if (url.hash && documents.has(url.pathname)) {
      let id;
      try { id = decodeURIComponent(url.hash.slice(1)); }
      catch { errors.push(`${label}: invalid anchor ${raw}`); continue; }
      if (!documents.get(url.pathname).ids.has(id)) errors.push(`${label}: broken anchor ${raw}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { htmlPages: documents.size, articles: eligible.length, references: references.length };
}
