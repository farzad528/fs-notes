import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stringify, parse as parseYaml } from 'yaml';
import { ROOT, AUTHOR, files, parse, nodes, attr, xmlValues, textContent } from '../scripts/lib.mjs';
import { preparePost } from '../scripts/prepare-post.mjs';
import { build } from '../scripts/build.mjs';

const winter = new Date('2026-01-20T12:34:56Z');
const summer = new Date('2026-07-20T12:34:56Z');
const copy = { slug: 'stable-note', title: 'An approved "title": a note', body: 'An approved paragraph.\n',
  description: 'A description derived from the approved paragraph.', excerpt: 'An **approved** excerpt.\n' };

async function fixture(t, site = false) {
  const work = path.join(ROOT, '.test-work');
  await fs.mkdir(work, { recursive: true });
  const root = await fs.mkdtemp(path.join(work, 'intake-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(path.join(ROOT, 'config'), path.join(root, 'config'), { recursive: true });
  const configFile = path.join(root, 'config', '_default', 'hugo.yaml');
  const config = parseYaml(await fs.readFile(configFile, 'utf8'));
  config.baseURL = 'https://farzad528.github.io/fs-notes/';
  await fs.writeFile(configFile, stringify(config));
  await fs.mkdir(path.join(root, 'content'), { recursive: true });
  if (site) {
    for (const name of ['layouts', 'assets', 'static']) await fs.cp(path.join(ROOT, name), path.join(root, name), { recursive: true });
    for (const name of ['about', 'archive']) await fs.cp(path.join(ROOT, 'content', name), path.join(root, 'content', name), { recursive: true });
  }
  return root;
}

function split(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  assert(match);
  return { meta: parseYaml(match[1]), body: source.slice(match[0].length) };
}

const index = root => path.join(root, 'content', 'posts', copy.slug, 'index.md');
const options = root => ({ root, now: winter, ...copy });
async function source(root) { return fs.readFile(index(root), 'utf8'); }
async function noPost(root) {
  assert.equal(await fs.stat(index(root)).catch(error => { if (error.code === 'ENOENT') return null; throw error; }), null);
}
async function onlyIndex(root) {
  assert.deepEqual(await fs.readdir(path.dirname(index(root))), ['index.md']);
}
async function amend(root, extra) {
  const current = split(await source(root));
  await fs.writeFile(index(root), `---\n${stringify({ ...current.meta, ...extra })}---\n${current.body}`);
}

test('new intake preserves exact approved body bytes, frontmatter-like copy and excerpt whitespace', async t => {
  const root = await fixture(t);
  const body = '\r\n  "Quoted" copy: \'exact\'.  \r\n\r\n---\r\ntitle: Body text, not metadata\r\n---\r\nLast line  ';
  const excerpt = '  "Approved": **excerpt**.  \r\n\r\nSecond paragraph without a final newline';
  const result = await preparePost({ ...options(root), body, excerpt });
  const bytes = await fs.readFile(result.file);
  const parsed = split(bytes.toString('utf8'));
  assert.deepEqual(Buffer.from(parsed.body), Buffer.from(body));
  assert.equal(parsed.meta.excerpt, excerpt);
  assert.equal(parsed.meta.title, copy.title);
  assert.deepEqual(Object.keys(parsed.meta), ['title', 'slug', 'date', 'publishDate', 'draft', 'author', 'description', 'excerpt', 'topics', 'lastmod']);
  assert.equal(parsed.meta.author, AUTHOR);
  assert.deepEqual(parsed.meta.topics, []);
  assert.equal(result.draft, true);
  assert.equal(result.updated, false);
  assert.equal(result.url, 'https://farzad528.github.io/fs-notes/posts/stable-note/');
  await onlyIndex(root);
  assert.deepEqual(await fs.readdir(path.join(root, '.test-work')), []);
});

test('new drafts and explicit publications use actual London winter and summer timestamps', async t => {
  const root = await fixture(t);
  for (const [slug, now, publish, timestamp] of [
    ['winter-draft', winter, false, '2026-01-20T12:34:56+00:00'],
    ['winter-live', winter, true, '2026-01-20T12:34:56+00:00'],
    ['summer-draft', summer, false, '2026-07-20T13:34:56+01:00'],
    ['summer-live', summer, true, '2026-07-20T13:34:56+01:00']
  ]) {
    const result = await preparePost({ ...options(root), slug, now, publish });
    const { meta } = split(await fs.readFile(result.file, 'utf8'));
    assert.equal(meta.date, timestamp);
    assert.equal(meta.publishDate, timestamp);
    assert.equal(meta.lastmod, timestamp);
    assert.equal(meta.draft, !publish);
  }
});

test('anticipated route uses the central base URL and permalink rather than a hardcoded hostname', async t => {
  const root = await fixture(t);
  const file = path.join(root, 'config', '_default', 'hugo.yaml');
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace('https://farzad528.github.io/fs-notes/', 'https://notes.test/journal/').replace('/posts/:slug/', '/notes/:slug/'));
  assert.equal((await preparePost(options(root))).url, 'https://notes.test/journal/notes/stable-note/');
});

test('stable slug validation rejects traversal and implicit or malformed names before writing', async t => {
  const root = await fixture(t);
  for (const slug of [undefined, '', '../escape', '..\\escape', '/absolute', 'C:\\escape', 'Uppercase', 'two--hyphens', 'two words', 'trailing-']) {
    await assert.rejects(preparePost({ ...options(root), slug }), /stable lowercase slug/);
  }
  assert.deepEqual(await fs.readdir(path.join(root, 'content')), []);
});

test('new intake refuses existing bundles and conflicting case or file names without touching assets', async t => {
  for (const name of [copy.slug, 'Stable-Note', `${copy.slug}.md`, `${copy.slug}.html`]) {
    const root = await fixture(t);
    const posts = path.join(root, 'content', 'posts');
    await fs.mkdir(posts);
    if (name.includes('.')) await fs.writeFile(path.join(posts, name), 'existing file');
    else {
      await fs.mkdir(path.join(posts, name));
      await fs.writeFile(path.join(posts, name, 'private.bin'), 'existing asset');
    }
    await assert.rejects(preparePost(options(root)), /already exists/);
    assert.deepEqual(await fs.readdir(posts), [name]);
    if (!name.includes('.')) assert.equal(await fs.readFile(path.join(posts, name, 'private.bin'), 'utf8'), 'existing asset');
  }
});

test('empty, unsafe and malformed approved inputs fail before creating a bundle', async t => {
  const invalid = [
    [{ body: '' }, /Body/], [{ body: ' \r\n\t' }, /Body/], [{ title: undefined }, /Title/],
    [{ description: undefined }, /Description/], [{ excerpt: undefined }, /Excerpt/],
    [{ title: 'Title\nsecond line' }, /single-line/], [{ description: '<b>Description</b>' }, /raw HTML/],
    [{ title: '{{< unsafe >}}' }, /shortcodes/], [{ description: 'See https://example.com/' }, /placeholder/],
    [{ body: '<script>alert(1)</script>' }, /raw HTML/], [{ excerpt: '<!-- hidden -->' }, /raw HTML/],
    [{ body: '{{% include %}}' }, /shortcodes/], [{ excerpt: '{{< include >}}' }, /shortcodes/],
    [{ body: '[unsafe](javascript:alert)' }, /unsafe Markdown URL/],
    [{ excerpt: '[unsafe](data:payload)' }, /unsafe Markdown URL/],
    [{ body: '![](picture.png)' }, /alt text/], [{ excerpt: '![ ](picture.png)' }, /alt text/],
    [{ body: 'See https://placeholder.com/' }, /placeholder/],
    [{ publish: 'true' }, /booleans/], [{ now: 'invalid date' }, /valid instant/]
  ];
  for (const [extra, expected] of invalid) {
    const root = await fixture(t);
    await assert.rejects(preparePost({ ...options(root), ...extra }), expected);
    await noPost(root);
    assert.deepEqual(await fs.readdir(path.join(root, 'content')), []);
  }
});

test('published updates preserve first publication, stable slug, author, topics and assets', async t => {
  const root = await fixture(t);
  const created = await preparePost({ ...options(root), publish: true });
  await amend(root, { topics: ['enterprise-ai', 'Delivery'] });
  const before = split(await source(root)).meta;
  const asset = path.join(path.dirname(created.file), 'diagram.bin');
  const assetBytes = Buffer.from([0, 1, 2, 255]);
  await fs.writeFile(asset, assetBytes);
  const updated = await preparePost({ root, slug: copy.slug, body: 'Changed approved copy.', publish: true, update: true,
    title: 'A completely different approved title', now: summer });
  const { meta, body } = split(await source(root));
  for (const key of ['date', 'publishDate', 'slug', 'author', 'topics', 'description', 'excerpt']) assert.deepEqual(meta[key], before[key], key);
  assert.equal(meta.title, 'A completely different approved title');
  assert.equal(meta.lastmod, '2026-07-20T13:34:56+01:00');
  assert.equal(body, 'Changed approved copy.');
  assert.deepEqual(await fs.readFile(asset), assetBytes);
  assert.equal(updated.url, created.url);
  assert.equal(updated.updated, true);
  assert.equal(updated.draft, false);
  assert.deepEqual((await fs.readdir(path.dirname(created.file))).sort(), ['diagram.bin', 'index.md']);
});

test('draft updates stay drafts by default; explicit promotion records the real first publication', async t => {
  const root = await fixture(t);
  await preparePost(options(root));
  const draft = await preparePost({ root, slug: copy.slug, body: 'Revised draft.', update: true, now: summer });
  assert.equal(draft.draft, true);
  assert.equal(draft.metadata.title, copy.title);
  assert.equal(draft.metadata.date, '2026-01-20T12:34:56+00:00');
  assert.equal(draft.metadata.publishDate, draft.metadata.date);
  const promoted = await preparePost({ root, slug: copy.slug, body: 'Approved final copy.', update: true, publish: true,
    description: 'Updated derived description.', excerpt: '  Revised excerpt.\r\n', now: summer });
  assert.equal(promoted.draft, false);
  assert.equal(promoted.metadata.date, '2026-07-20T13:34:56+01:00');
  assert.equal(promoted.metadata.publishDate, promoted.metadata.date);
  assert.equal(promoted.metadata.lastmod, promoted.metadata.date);
  assert.equal(promoted.metadata.slug, copy.slug);
  assert.equal(promoted.metadata.description, 'Updated derived description.');
  assert.equal(promoted.metadata.excerpt, '  Revised excerpt.\r\n');
});

test('published updates cannot silently unpublish or backdate lastmod', async t => {
  const root = await fixture(t);
  await preparePost({ ...options(root), publish: true });
  const before = await source(root);
  await assert.rejects(preparePost({ ...options(root), update: true, now: summer }), /requires --publish/);
  await assert.rejects(preparePost({ ...options(root), update: true, publish: true, now: new Date('2026-01-19T12:00:00Z') }), /future/);
  assert.equal(await source(root), before);
  await onlyIndex(root);
});

test('scheduled published and draft targets are rejected without silently changing publishDate', async t => {
  for (const draft of [false, true]) {
    const root = await fixture(t);
    await preparePost(options(root));
    await amend(root, { draft, publishDate: '2099-01-01T12:00:00+00:00' });
    const before = await source(root);
    await assert.rejects(preparePost({ ...options(root), update: true, publish: true, now: summer }), /scheduling requires an explicit workflow/);
    assert.equal(await source(root), before);
    await onlyIndex(root);
  }
});

test('invalid existing frontmatter or body is refused and never repaired implicitly', async t => {
  for (const change of [
    text => text.replace('draft: true', 'unknown: value\ndraft: true'),
    text => text.replace('slug: stable-note', 'slug: different-slug'),
    text => text.replace('draft: true', 'draft: invalid'),
    text => text.replace('title:', 'title: duplicate\ntitle:'),
    text => text.replace('Farzad Sunavala', 'Someone Else'),
    () => 'No frontmatter.',
    text => `${text}<script>invalid</script>`
  ]) {
    const root = await fixture(t);
    await preparePost(options(root));
    await fs.writeFile(index(root), change(await source(root)));
    const before = await source(root);
    await assert.rejects(preparePost({ ...options(root), update: true, publish: true, now: summer }));
    assert.equal(await source(root), before);
    await onlyIndex(root);
  }
});

test('updates require an existing index and explicit --update even for a draft', async t => {
  const root = await fixture(t);
  await assert.rejects(preparePost({ ...options(root), update: true }), /requires an existing bundle/);
  await preparePost(options(root));
  const before = await source(root);
  await assert.rejects(preparePost(options(root)), /Use --update/);
  await assert.rejects(preparePost({ ...options(root), update: true, excerpt: '<div>unsafe</div>' }), /raw HTML/);
  assert.equal(await source(root), before);
  await onlyIndex(root);
});

test('failed atomic replacement leaves the existing index and assets intact and removes owned staging files', async t => {
  const root = await fixture(t);
  await preparePost(options(root));
  const before = await source(root);
  const asset = path.join(path.dirname(index(root)), 'asset.txt');
  await fs.writeFile(asset, 'Keep this asset.');
  t.mock.method(fs, 'rename', async () => { throw Object.assign(new Error('simulated rename failure'), { code: 'EIO' }); });
  await assert.rejects(preparePost({ ...options(root), update: true, now: summer }), /simulated rename failure/);
  t.mock.restoreAll();
  assert.equal(await source(root), before);
  assert.equal(await fs.readFile(asset, 'utf8'), 'Keep this asset.');
  assert.deepEqual((await fs.readdir(path.dirname(index(root)))).sort(), ['asset.txt', 'index.md']);
});

test('failed new write removes only its own partial index and bundle', async t => {
  const root = await fixture(t);
  const open = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (filename, ...args) => {
    const handle = await open(filename, ...args);
    if (filename === index(root)) handle.writeFile = async () => { throw Object.assign(new Error('simulated write failure'), { code: 'EIO' }); };
    return handle;
  });
  await assert.rejects(preparePost(options(root)), /simulated write failure/);
  t.mock.restoreAll();
  assert.deepEqual(await fs.readdir(path.join(root, 'content', 'posts')), []);
  assert.deepEqual(await fs.readdir(path.join(root, '.test-work')), []);
});

test('new-write failure never recursively removes another writer’s added asset', async t => {
  const root = await fixture(t);
  const open = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (filename, ...args) => {
    const handle = await open(filename, ...args);
    if (filename === index(root)) handle.writeFile = async () => {
      await fs.writeFile(path.join(path.dirname(filename), 'other-writer.txt'), 'Concurrent asset');
      throw new Error('simulated write failure');
    };
    return handle;
  });
  await assert.rejects(preparePost(options(root)), /simulated write failure/);
  t.mock.restoreAll();
  await noPost(root);
  assert.equal(await fs.readFile(path.join(path.dirname(index(root)), 'other-writer.txt'), 'utf8'), 'Concurrent asset');
});

test('concurrent external edits are detected instead of overwritten or rolled back', async t => {
  const root = await fixture(t);
  await preparePost(options(root));
  const external = `${await source(root)}\nExternal writer change.\n`;
  const open = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (filename, ...args) => {
    const handle = await open(filename, ...args);
    if (filename.endsWith('.tmp') && path.dirname(filename) === path.dirname(index(root))) await fs.writeFile(index(root), external);
    return handle;
  });
  await assert.rejects(preparePost({ ...options(root), update: true, now: summer }), /changed concurrently/);
  t.mock.restoreAll();
  assert.equal(await source(root), external);
  await onlyIndex(root);
});

test('an existing intake lock is respected and never removed by a second writer', async t => {
  const root = await fixture(t);
  await preparePost(options(root));
  const before = await source(root);
  const lock = path.join(path.dirname(index(root)), '.prepare-post.lock');
  await fs.writeFile(lock, 'Another intake owns this lock.', { flag: 'wx' });
  await assert.rejects(preparePost({ ...options(root), update: true, now: summer }), /locked by another intake/);
  assert.equal(await source(root), before);
  assert.equal(await fs.readFile(lock, 'utf8'), 'Another intake owns this lock.');
});

test('two simultaneous new intakes cannot clobber one another', async t => {
  const root = await fixture(t);
  const results = await Promise.allSettled([
    preparePost({ ...options(root), body: 'First exact copy.' }),
    preparePost({ ...options(root), body: 'Second exact copy.' })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert(['First exact copy.', 'Second exact copy.'].includes(split(await source(root)).body));
  await onlyIndex(root);
});

test('prepared approved publication appears once on every publication surface; draft and assets stay private', async t => {
  const root = await fixture(t, true);
  await preparePost({ ...options(root), publish: true });
  const hidden = await preparePost({ ...options(root), slug: 'private-intake', title: 'PRIVATE_INTAKE_MARKER',
    description: 'PRIVATE_INTAKE_MARKER', excerpt: 'PRIVATE_INTAKE_MARKER', body: 'PRIVATE_INTAKE_MARKER' });
  await fs.writeFile(path.join(path.dirname(hidden.file), 'private.txt'), 'PRIVATE_INTAKE_MARKER');
  const result = await build({ root, quiet: true });
  assert.equal(result.articles, 1);
  const read = name => fs.readFile(path.join(root, 'public', ...name.split('/')), 'utf8');
  const home = parse(await read('index.html'));
  assert.equal(nodes(home, 'article').length, 1);
  assert.equal(textContent(nodes(home, 'article')[0]).includes(copy.title), true);
  const article = parse(await read(`posts/${copy.slug}/index.html`));
  assert.deepEqual(nodes(article, 'h1').map(textContent), [copy.title]);
  const archive = parse(await read('archive/index.html'));
  assert.equal(nodes(archive, 'li').length, 1);
  assert.equal(attr(nodes(nodes(archive, 'li')[0], 'a')[0], 'href'), `/fs-notes/posts/${copy.slug}/`);
  const feed = xmlValues(await read('index.xml'), 'item');
  assert.equal(feed.length, 1);
  assert(feed[0].includes(copy.title));
  assert.equal(xmlValues(await read('sitemap.xml'), 'loc').filter(url => url === `https://farzad528.github.io/fs-notes/posts/${copy.slug}/`).length, 1);
  for (const file of await files(path.join(root, 'public'))) {
    assert(!file.includes('private-intake'), file);
    assert(!(await fs.readFile(file)).includes(Buffer.from('PRIVATE_INTAKE_MARKER')), file);
  }
});

async function cliFixture(t) {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'scripts'));
  for (const name of ['prepare-post.mjs', 'lib.mjs', 'validate-content.mjs']) await fs.copyFile(path.join(ROOT, 'scripts', name), path.join(root, 'scripts', name));
  const run = args => spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare-post.mjs'), ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true
  });
  return { root, run };
}

test('CLI help and missing, unknown, duplicate or valueless flags fail safely without writing', async t => {
  const { root, run } = await cliFixture(t);
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--publish.*--update/);
  assert.match(help.stdout, /No Git, network/);
  for (const args of [[], ['--unknown'], ['--slug'], ['--slug', 'stable-note', '--slug', 'duplicate'],
    ['--input', '--publish'], ['unexpected'], ['--slug', copy.slug, '--input', 'body.md'], ['--publish=false']]) {
    const result = run(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert(result.stderr.trim(), JSON.stringify(args));
    await noPost(root);
  }
});

test('CLI requires real UTF-8 files and preserves exact file copy with relative and absolute inputs', async t => {
  const { root, run } = await cliFixture(t);
  const args = ['--slug', copy.slug, '--title', copy.title, '--description', copy.description, '--input', 'body.md', '--excerpt', path.join(root, 'excerpt.md')];
  let result = run(args);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT.*body\.md/);
  await noPost(root);
  const body = '\r\n"Exact approved copy."  \r\n---\r\nfrontmatter: is body text\r\nLast line';
  await fs.writeFile(path.join(root, 'body.md'), body);
  result = run(args);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT.*excerpt\.md/);
  await fs.writeFile(path.join(root, 'excerpt.md'), Buffer.from([0xc3, 0x28]));
  result = run(args);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /valid UTF-8/);
  await noPost(root);
  await fs.writeFile(path.join(root, 'excerpt.md'), '  Approved excerpt.  \r\n');
  result = run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Created draft: content[\\/]posts[\\/]stable-note[\\/]index\.md/);
  assert.match(result.stdout, /Anticipated URL: https:\/\/farzad528\.github\.io\/fs-notes\/posts\/stable-note\//);
  assert.equal(split(await source(root)).body, body);
  assert.equal(split(await source(root)).meta.excerpt, '  Approved excerpt.  \r\n');
  result = run(['--slug', copy.slug, '--input', path.join(root, 'body.md'), '--update', '--publish']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Updated approved publication/);
  assert.equal(split(await source(root)).meta.draft, false);
  assert.equal(split(await source(root)).body, body);
});
