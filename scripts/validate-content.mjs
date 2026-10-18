import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { ROOT, AUTHOR, SLUG, exists, files, validateLondonDate, validateMarkdown, rejectPlaceholder } from './lib.mjs';

export async function validateContent(root = ROOT, { now = new Date(), warn = true } = {}) {
  const content = path.join(root, 'content');
  const entries = [];
  const slugs = new Set();
  for (const file of await files(content)) {
    const relative = path.relative(content, file).replaceAll('\\', '/');
    if (!relative.endsWith('.md')) continue;
    const source = await fs.readFile(file, 'utf8');
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatter) throw new Error(`${relative}: YAML front matter is required.`);
    const document = parseDocument(frontmatter[1], { uniqueKeys: true });
    if (document.errors.length) throw new Error(`${relative}: ${document.errors.map(e => e.message).join('; ')}`);
    const meta = document.toJS();
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error(`${relative}: front matter must be a mapping.`);
    const body = source.slice(frontmatter[0].length);
    validateMarkdown(body, relative);
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === 'string') rejectPlaceholder(value, `${relative} ${key}`);
    }
    if (relative === 'archive/index.md') {
      const allowed = new Set(['title', 'description', 'type', 'draft']);
      if (Object.keys(meta).some(key => !allowed.has(key)) || meta.type !== 'archive' || meta.draft !== false
        || !['title', 'description'].every(key => typeof meta[key] === 'string' && meta[key].trim() && !/[<>\r\n]/.test(meta[key]))
        || body.trim()) throw new Error('Archive must be an empty static page with title, description, type: archive and draft: false only.');
      continue;
    }
    if (relative === 'about/index.md') {
      if (typeof meta.title !== 'string' || typeof meta.description !== 'string') throw new Error('About needs title and description.');
      const date = validateLondonDate(meta.date, 'About date');
      const lastmod = validateLondonDate(meta.lastmod, 'About lastmod');
      if (date > now || lastmod > now || lastmod < date) throw new Error('About needs known nonfuture creation/update timestamps in order.');
      if (meta.draft !== false) throw new Error('About must explicitly set draft: false.');
      if (Object.hasOwn(meta, 'publishDate')) throw new Error('About uses its known creation date; do not invent a publishDate.');
      continue;
    }
    const bundle = relative.match(/^posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\/index\.md$/);
    if (!bundle) throw new Error(`${relative}: content must be About, Archive or a stable content/posts/<slug>/index.md bundle.`);
    const required = ['title', 'slug', 'date', 'publishDate', 'draft', 'author', 'description', 'excerpt', 'topics', 'lastmod'];
    for (const key of required) if (!Object.hasOwn(meta, key)) throw new Error(`${relative}: missing ${key}.`);
    const allowed = new Set(required);
    for (const key of Object.keys(meta)) if (!allowed.has(key)) throw new Error(`${relative}: unsupported metadata ${key}.`);
    for (const key of ['title', 'slug', 'author', 'description']) {
      if (typeof meta[key] !== 'string' || !meta[key].trim()) throw new Error(`${relative}: ${key} must be nonempty text.`);
    }
    if (!SLUG.test(meta.slug)) throw new Error(`${relative}: invalid slug.`);
    if (slugs.has(meta.slug)) throw new Error(`${relative}: duplicate slug ${meta.slug}.`);
    slugs.add(meta.slug);
    if (meta.slug !== bundle[1]) throw new Error(`${relative}: slug must match stable bundle name.`);
    if (meta.author !== AUTHOR) throw new Error(`${relative}: author must be ${AUTHOR}.`);
    if (typeof meta.draft !== 'boolean') throw new Error(`${relative}: draft must be a boolean.`);
    if (typeof meta.excerpt !== 'string' || !meta.excerpt.trim()) throw new Error(`${relative}: excerpt must be explicit nonempty Markdown.`);
    if (!meta.draft && (/^Write (?:a concise description|the explicit Markdown excerpt) before publishing\.$/.test(meta.description)
      || /^Write (?:a concise description|the explicit Markdown excerpt) before publishing\.$/.test(meta.excerpt))) {
      throw new Error(`${relative}: replace scaffold description and excerpt before publishing.`);
    }
    if (!Array.isArray(meta.topics) || meta.topics.some(topic => typeof topic !== 'string' || !topic.trim()) || new Set(meta.topics).size !== meta.topics.length) {
      throw new Error(`${relative}: topics must be an array of unique nonempty strings (or []).`);
    }
    validateMarkdown(meta.excerpt, `${relative} excerpt`);
    for (const key of ['title', 'description', 'author', ...meta.topics.map((_, i) => `topics.${i}`)]) {
      const value = key.startsWith('topics.') ? meta.topics[Number(key.split('.')[1])] : meta[key];
      if (/<\/?[A-Za-z][^>]*>|[\r\n]/.test(value)) throw new Error(`${relative}: ${key} must be plain single-line text.`);
    }
    const date = validateLondonDate(meta.date, `${relative} date`);
    const publishDate = validateLondonDate(meta.publishDate, `${relative} publishDate`);
    const lastmod = validateLondonDate(meta.lastmod, `${relative} lastmod`);
    if (date > now || lastmod > now) throw new Error(`${relative}: date and lastmod cannot be in the future; schedule using publishDate.`);
    if (publishDate < date || lastmod < date || (publishDate <= now && lastmod < publishDate)) {
      throw new Error(`${relative}: expected date <= publishDate and lastmod >= date (and >= published publishDate).`);
    }
    const words = body.trim().split(/\s+/).filter(Boolean).length;
    if (warn && (words < 250 || words > 700)) console.warn(`Warning: ${relative} has ${words} words; normal essays are 400-700, short ideas 250-400, longer arguments usually 800-1,200. Length is guidance, not a publication gate.`);
    entries.push({ ...meta, body, file, eligible: !meta.draft && publishDate <= now });
  }
  const posts = path.join(content, 'posts');
  if (await exists(posts)) {
    for (const entry of await fs.readdir(posts, { withFileTypes: true })) {
      if (!entry.isDirectory() || !await exists(path.join(posts, entry.name, 'index.md'))) {
        throw new Error(`content/posts/${entry.name}: each post must be a leaf bundle with index.md.`);
      }
    }
  }
  return entries.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
}
