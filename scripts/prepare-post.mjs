import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { stringify } from 'yaml';
import { ROOT, AUTHOR, SLUG, assertNode, londonDate, validateLondonDate, validateMarkdown, readConfig, normalizeBase } from './lib.mjs';
import { validateContent } from './validate-content.mjs';

const usage = `Usage: npm run prepare-post -- --slug stable-slug --title "Approved title" --input BODY.md --description "Derived description" --excerpt EXCERPT.md [--publish] [--update]

Inputs are explicit UTF-8 files; body and excerpt wording are never rewritten.
New posts are drafts unless --publish explicitly selects approved final copy.
--update requires an existing stable bundle; title, description and excerpt may be omitted.
Published updates require --publish. Scheduling is not supported.
No Git, network, merge or deployment operations are performed.`;

async function statOrNull(filename) {
  try { return await fs.lstat(filename, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function directory(filename, create = false) {
  if (create) {
    try { await fs.mkdir(filename); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const stat = await statOrNull(filename);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
    throw new Error(`Expected a real directory, not a file or symbolic link: ${filename}`);
  }
  return stat;
}

function utf8(bytes, label) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch (error) {
    if (error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') throw new Error(`${label}: input must be valid UTF-8.`, { cause: error });
    throw error;
  }
}

function nonempty(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}: explicit nonempty text is required.`);
  validateMarkdown(value, label);
}

function plain(value, label) {
  nonempty(value, label);
  if (/[<>\r\n]/.test(value)) throw new Error(`${label}: use plain single-line text.`);
}

function sameStat(a, b) {
  // Windows can update ctime on reads; identity, mtime and exact bytes guard content changes.
  return b && ['dev', 'ino', 'size', 'mtimeNs'].every(key => a[key] === b[key]);
}

async function snapshot(filename) {
  const before = await statOrNull(filename);
  if (!before || !before.isFile() || before.isSymbolicLink()) throw new Error(`Expected an existing regular index.md: ${filename}`);
  const bytes = await fs.readFile(filename);
  if (!sameStat(before, await statOrNull(filename))) throw new Error('Post changed concurrently while being read; retry with the current copy.');
  return { stat: before, bytes };
}

async function unchanged(filename, original) {
  const current = await snapshot(filename);
  if (!sameStat(original.stat, current.stat) || !original.bytes.equals(current.bytes)) {
    throw new Error('Post changed concurrently; nothing was overwritten. Retry with the current copy.');
  }
}

async function validateSource(work, slug, source, now) {
  const bundle = path.join(work, 'content', 'posts', slug);
  await fs.mkdir(bundle, { recursive: true });
  await fs.writeFile(path.join(bundle, 'index.md'), source);
  const [entry] = await validateContent(work, { now, warn: false });
  const { body, file, eligible, ...meta } = entry;
  return meta;
}

function anticipatedURL(config, slug) {
  const base = normalizeBase(config.baseURL);
  const pattern = config.permalinks?.posts;
  if (typeof pattern !== 'string' || !pattern.startsWith('/') || !pattern.endsWith('/')
    || !pattern.includes(':slug') || /[:?#\\]/.test(pattern.replaceAll(':slug', ''))
    || pattern.includes('//') || pattern.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Central config must provide a supported posts permalink using :slug.');
  }
  return new URL(pattern.replaceAll(':slug', slug).slice(1), base).href;
}

async function conflicts(posts, slug) {
  if (!await directory(posts)) return [];
  return (await fs.readdir(posts)).filter(name => {
    const lower = name.toLowerCase();
    return lower === slug || lower === `${slug}.md` || lower === `${slug}.html`;
  });
}

async function writeNew(posts, bundle, filename, source) {
  await directory(path.dirname(posts), true);
  await directory(posts, true);
  const names = await conflicts(posts, path.basename(bundle));
  if (names.length) throw new Error(`Conflicting post name already exists: ${names.join(', ')}. Use --update for an existing index.md.`);
  try { await fs.mkdir(bundle); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Post bundle already exists; existing files and assets are never overwritten.', { cause: error });
    throw error;
  }
  let handle;
  let complete = false;
  try {
    handle = await fs.open(filename, 'wx');
    await handle.writeFile(source, 'utf8');
    await handle.sync();
    complete = true;
  } finally {
    if (handle) await handle.close();
    if (!complete) {
      if (handle) await fs.unlink(filename);
      // Never recursively remove a bundle: another writer may have added assets.
      try { await fs.rmdir(bundle); }
      catch (error) { if (!['ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
    }
  }
}

async function replaceIndex(bundle, filename, source, original) {
  const staged = path.join(bundle, `.prepare-post-${randomUUID()}.tmp`);
  const handle = await fs.open(staged, 'wx');
  try {
    try { await handle.writeFile(source, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await unchanged(filename, original);
    await fs.rename(staged, filename);
  } finally {
    try { await fs.unlink(staged); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export async function preparePost({ slug, title, body, description, excerpt, publish = false, update = false,
  root = ROOT, now = new Date() } = {}) {
  assertNode();
  if (typeof slug !== 'string' || !SLUG.test(slug)) throw new Error('An explicit stable lowercase slug is required (letters, digits and single hyphens only).');
  if (typeof publish !== 'boolean' || typeof update !== 'boolean') throw new Error('publish and update must be booleans.');
  now = new Date(now);
  if (!Number.isFinite(now.valueOf())) throw new Error('now must be a valid instant.');
  const timestamp = londonDate(now);
  validateLondonDate(timestamp, 'Publication timestamp');
  nonempty(body, 'Body');
  root = path.resolve(root);
  await directory(root);
  const content = path.join(root, 'content');
  const posts = path.join(content, 'posts');
  await directory(content);
  await directory(posts);
  const bundle = path.join(posts, slug);
  const filename = path.join(bundle, 'index.md');
  const names = await conflicts(posts, slug);
  if (!update && names.length) throw new Error(`Post bundle or conflicting name already exists: ${names.join(', ')}. Use --update for an existing index.md.`);
  if (update && (names.length !== 1 || names[0] !== slug || !await directory(bundle))) {
    throw new Error('--update requires an existing bundle with the exact stable slug and no conflicting names.');
  }
  const url = anticipatedURL(await readConfig(root), slug);
  let lock;
  const lockfile = path.join(bundle, '.prepare-post.lock');
  if (update) {
    try { lock = await fs.open(lockfile, 'wx'); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('Post is locked by another intake; nothing was overwritten. Resolve a stale lock only after checking its owner.', { cause: error });
      throw error;
    }
  }
  let work;
  try {
    const original = update ? await snapshot(filename) : null;
    if (update) await validateContent(root, { now, warn: false });
    await directory(path.join(root, '.test-work'), true);
    work = await fs.mkdtemp(path.join(root, '.test-work', 'prepare-post-'));
    let meta;
    if (update) {
      meta = await validateSource(work, slug, utf8(original.bytes, filename), now);
      if (validateLondonDate(meta.publishDate, 'Existing publishDate') > now) {
        throw new Error('Existing publishDate is in the future; scheduling requires an explicit workflow and is not supported by prepare-post.');
      }
      if (!meta.draft && !publish) throw new Error('A published update requires --publish; refusing to silently unpublish.');
      if (meta.draft && publish) meta.date = meta.publishDate = timestamp;
      meta = { ...meta, draft: !publish, lastmod: timestamp };
      if (title !== undefined) meta.title = title;
      if (description !== undefined) meta.description = description;
      if (excerpt !== undefined) meta.excerpt = excerpt;
    } else {
      meta = { title, slug, date: timestamp, publishDate: timestamp, draft: !publish, author: AUTHOR,
        description, excerpt, topics: [], lastmod: timestamp };
    }
    plain(meta.title, 'Title');
    plain(meta.description, 'Description');
    nonempty(meta.excerpt, 'Excerpt');
    const source = `---\n${stringify(meta)}---\n${body}`;
    await validateSource(work, slug, source, now);
    if (update) await replaceIndex(bundle, filename, source, original);
    else await writeNew(posts, bundle, filename, source);
    return { file: filename, url, draft: meta.draft, updated: update, metadata: meta };
  } finally {
    if (work) await fs.rm(work, { recursive: true, force: true });
    if (lock) { await lock.close(); await fs.unlink(lockfile); }
  }
}

async function cli(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(usage); return; }
  const options = {};
  const values = new Set(['slug', 'title', 'input', 'description', 'excerpt']);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const key = flag.slice(2);
    if (!flag.startsWith('--') || (!values.has(key) && !['publish', 'update'].includes(key))) throw new Error(`Unknown argument: ${flag}\n${usage}`);
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate argument: ${flag}`);
    if (values.has(key)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
      options[key] = value;
    } else options[key] = true;
  }
  if (!options.slug || !options.input) throw new Error(`--slug and --input are required.\n${usage}`);
  if (!options.update && (!options.title || !options.description || !options.excerpt)) {
    throw new Error('New posts require --title, --description and an explicit --excerpt file.');
  }
  const body = utf8(await fs.readFile(path.resolve(options.input)), options.input);
  const excerpt = options.excerpt === undefined ? undefined : utf8(await fs.readFile(path.resolve(options.excerpt)), options.excerpt);
  const result = await preparePost({ ...options, body, excerpt });
  console.log(`${result.updated ? 'Updated' : 'Created'} ${result.draft ? 'draft' : 'approved publication'}: ${path.relative(ROOT, result.file)}\nAnticipated URL: ${result.url}\nNo Git or deployment operations performed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
