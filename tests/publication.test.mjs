import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stringify, parse as parseYaml } from 'yaml';
import { ROOT, AUTHOR, files, londonDate, validateLondonDate, parse, nodes, attr, articleData, xmlValues, textContent } from '../scripts/lib.mjs';
import { build } from '../scripts/build.mjs';
import { validateContent } from '../scripts/validate-content.mjs';
import { validatePublic } from '../scripts/validate-public.mjs';
import { newPost } from '../scripts/new-post.mjs';
import { runHugo } from '../scripts/hugo-runner.mjs';
import { preview } from '../scripts/preview.mjs';
import { smoke } from '../scripts/smoke.mjs';
import { baseURL } from '../scripts/site.mjs';
import { generateReview } from '../scripts/visual-preview.mjs';
import { reviewFixtures, REVIEW_ARTICLE_SLUG } from '../scripts/review-fixtures.mjs';

async function fixture(t) {
  const work = path.join(ROOT, '.test-work');
  await fs.mkdir(work, { recursive: true });
  const root = await fs.mkdtemp(path.join(work, 'publication-'));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  for (const directory of ['config', 'layouts', 'assets', 'static']) await fs.cp(path.join(ROOT, directory), path.join(root, directory), { recursive: true });
  const configFile = path.join(root, 'config', '_default', 'hugo.yaml');
  const fixtureConfig = parseYaml(await fs.readFile(configFile, 'utf8'));
  fixtureConfig.baseURL = 'https://farzad528.github.io/fs-notes/';
  await fs.writeFile(configFile, stringify(fixtureConfig));
  await fs.mkdir(path.join(root, 'content', 'about'), { recursive: true });
  await fs.copyFile(path.join(ROOT, 'content', 'about', 'index.md'), path.join(root, 'content', 'about', 'index.md'));
  await fs.cp(path.join(ROOT, 'content', 'archive'), path.join(root, 'content', 'archive'), { recursive: true });
  return root;
}

function metadata(slug, extra = {}) {
  return { title: `Essay ${slug}`, slug, date: '2026-01-01T12:00:00+00:00', publishDate: '2026-01-02T12:00:00+00:00',
    draft: false, author: AUTHOR, description: `Description of ${slug}.`,
    excerpt: 'An explicit **Markdown** excerpt with an [inline link](/about/).\n\nA second paragraph.',
    topics: ['enterprise-ai'], lastmod: '2026-01-10T12:00:00+00:00', ...extra };
}

async function post(root, slug, extra = {}, body = '## A heading\n\nAn original fixture paragraph.\n') {
  const directory = path.join(root, 'content', 'posts', slug);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'index.md'), `---\n${stringify(metadata(slug, extra))}---\n\n${body}`);
  return directory;
}

const read = (root, relative) => fs.readFile(path.join(root, 'public', ...relative.split('/')), 'utf8');
const hasClass = (node, name) => (attr(node, 'class') ?? '').split(/\s+/).includes(name);
const postRows = document => nodes(document, 'article').filter(node => hasClass(node, 'post-row'));
const rowTitles = document => postRows(document).map(row => textContent(nodes(row).find(node => ['h2', 'h3'].includes(node.tagName))));
const primaryNav = document => nodes(document, 'nav').find(node => attr(node, 'aria-label') === 'Primary');

test('empty production has original identity, accessible metadata and no unintended routes', async t => {
  const root = await fixture(t);
  const result = await build({ root, quiet: true });
  assert.equal(result.articles, 0);
  const html = await read(root, 'index.html');
  assert.match(html, /Essays coming soon\./);
  assert.match(html, /Notes on building, deploying, and leading with AI\./);
  assert.equal(nodes(parse(html), 'script').length, 0);
  assert.equal(nodes(parse(html), 'h1').length, 1);
  assert.match(html, /href="#main"/);
  const about = await read(root, 'about/index.html');
  assert.match(about, /product leader at Microsoft/);
  assert.match(about, /do not represent those of my employer/);
  assert.equal(xmlValues(await read(root, 'index.xml'), 'item').length, 0);
  const archive = parse(await read(root, 'archive/index.html'));
  assert.equal(nodes(archive, 'li').length, 0);
  assert.equal(nodes(archive, 'h2').length, 0);
  assert.match(textContent(nodes(archive, 'main')[0]), /All notes\s+Essays coming soon/);
  assert(xmlValues(await read(root, 'sitemap.xml'), 'loc').includes('https://farzad528.github.io/fs-notes/archive/'));
  const paths = (await files(path.join(root, 'public'))).map(file => path.relative(path.join(root, 'public'), file).replaceAll('\\', '/'));
  assert(!paths.some(file => /(?:tags|topics|categories|posts\/index|page\/1|\.md|\.yaml|scripts|docs|editorial)/.test(file)));
});

test('deployment base URL comes only from central configuration', async t => {
  const root = await fixture(t);
  assert.equal(await baseURL(root), 'https://farzad528.github.io/fs-notes/');
  const config = path.join(root, 'config', '_default', 'hugo.yaml');
  await fs.writeFile(config, (await fs.readFile(config, 'utf8')).replace('https://farzad528.github.io/fs-notes/', 'https://notes.test/'));
  assert.equal(await baseURL(root), 'https://notes.test/');
  const result = await build({ root, quiet: true });
  assert.equal(result.baseURL, 'https://notes.test/');
});

test('visual review has five original local-only fixtures and never changes production content or output', async t => {
  const root = await fixture(t);
  await build({ root, quiet: true });
  const originalContent = await files(path.join(root, 'content'));
  const originalHome = await read(root, 'index.html');
  const review = await generateReview({ root, port: 1314, quiet: true });
  assert.equal(review.baseURL, 'http://127.0.0.1:1314/fs-notes/');
  assert.equal(review.articleURL, `http://127.0.0.1:1314/fs-notes/posts/${REVIEW_ARTICLE_SLUG}/`);
  assert.deepEqual(await files(path.join(root, 'content')), originalContent);
  assert.equal(await read(root, 'index.html'), originalHome);
  assert.equal(nodes(parse(await read(review.root, 'index.html')), 'article').length, 5);
  const scripts = nodes(parse(await read(review.root, `posts/${REVIEW_ARTICLE_SLUG}/index.html`)), 'script');
  assert.equal(scripts.length, 1);
  assert.equal(articleData(scripts[0], 'Review article')['@type'], 'BlogPosting');
  const words = reviewFixtures()[0].body.trim().split(/\s+/).length;
  assert(words >= 600 && words <= 800, `Representative article has ${words} words; expected 600–800.`);
  const reviewHome = await read(review.root, 'index.html');
  assert.match(reviewHome, /Lorem Ipsum/);
  assert(!reviewHome.includes('The Work After the Model'));
  assert.equal(nodes(parse(await read(review.root, `posts/${REVIEW_ARTICLE_SLUG}/index.html`)), 'a').filter(node => hasClass(node, 'chip')).length, 2);
  const reviewAbout = await read(review.root, 'about/index.html');
  assert.match(reviewAbout, /Lorem ipsum dolor sit amet/);
  assert(!reviewAbout.includes("I'm Farzad"));
  assert.equal(nodes(parse(await read(review.root, 'archive/index.html')), 'li').length, 5);
  for (const { meta } of reviewFixtures()) {
    const document = parse(await read(review.root, `posts/${meta.slug}/index.html`));
    assert.equal(textContent(nodes(document, 'h1')[0]), meta.title);
    assert.match(textContent(nodes(document, 'article')[0]), /Lorem ipsum/);
    assert(!textContent(nodes(document, 'article')[0]).includes('[Opening section'));
  }
});

test('every production surface excludes drafts, future articles and their bundle assets', async t => {
  const root = await fixture(t);
  await post(root, 'eligible', {}, '## A heading\n\nPublished marker PUBLISHED_ONLY.\n');
  for (const [slug, extra, marker] of [
    ['private-draft', { draft: true }, 'PRIVATE_DRAFT_MARKER'],
    ['scheduled', { publishDate: '2099-01-01T12:00:00+00:00' }, 'PRIVATE_FUTURE_MARKER']
  ]) {
    const directory = await post(root, slug, { ...extra, title: marker, excerpt: marker }, marker);
    await fs.writeFile(path.join(directory, 'private.txt'), marker);
  }
  await build({ root, quiet: true });
  for (const file of await files(path.join(root, 'public'))) {
    const bytes = await fs.readFile(file, 'utf8');
    assert(!bytes.includes('PRIVATE_DRAFT_MARKER'), file);
    assert(!bytes.includes('PRIVATE_FUTURE_MARKER'), file);
  }
  assert.match(await read(root, 'index.html'), /PUBLISHED_ONLY|Essay eligible/);
  for (const file of ['index.xml', 'sitemap.xml', 'archive/index.html', 'posts/eligible/index.html']) assert.match(await read(root, file), /eligible/);
  assert(!nodes(parse(await read(root, 'posts/eligible/index.html')), 'nav').some(node => attr(node, 'aria-label') === 'Next note'));
  await runHugo(['--environment', 'development', '--buildDrafts', '--destination', path.join(root, 'local'), '--noBuildLock'], { root, quiet: true });
  const local = await fs.readFile(path.join(root, 'local', 'posts', 'private-draft', 'index.html'), 'utf8');
  assert.match(local, /PRIVATE_DRAFT_MARKER/);
  assert.match(local, /DRAFT — LOCAL PREVIEW/);
});

test('publishDate ordering, six-post pagination, canonical and stable slugs work for project and root bases', async t => {
  const root = await fixture(t);
  for (let index = 1; index <= 6; index++) await post(root, `essay-${index}`, {
    date: `2026-01-0${7 - index}T12:00:00+00:00`,
    publishDate: `2026-01-${String(10 + index).padStart(2, '0')}T12:00:00+00:00`,
    lastmod: '2026-02-01T12:00:00+00:00'
  });
  for (const baseURL of ['https://farzad528.github.io/fs-notes/', 'https://notes.test/']) {
    await build({ root, baseURL, quiet: true });
    const home = await read(root, 'index.html');
    const page2 = await read(root, 'page/2/index.html');
    const titles = rowTitles(parse(home));
    assert.deepEqual(titles, ['Essay essay-6', 'Essay essay-5', 'Essay essay-4', 'Essay essay-3', 'Essay essay-2']);
    assert.equal(postRows(parse(home)).filter(node => hasClass(node, 'featured')).length, 1);
    assert.equal(nodes(postRows(parse(home))[0], 'h2').length, 1);
    assert.equal(nodes(parse(home), 'h3').length, 4);
    assert.match(page2, /Essay essay-1/);
    assert.equal(postRows(parse(page2)).length, 1);
    assert.equal(postRows(parse(page2)).filter(node => hasClass(node, 'featured')).length, 0);
    assert(!page2.includes('Latest note'));
    assert.match(page2, /Older notes/);
    assert.match(page2, new RegExp(`rel="canonical" href="${baseURL.replaceAll('.', '\\.')}page/2/"`));
    const feed = await read(root, 'index.xml');
    assert.equal(xmlValues(feed, 'item').length, 6);
    assert(feed.includes(`${baseURL}posts/essay-6/`));
    await post(root, 'essay-6', { title: 'A completely changed title', date: '2026-01-01T12:00:00+00:00',
      publishDate: '2026-01-16T12:00:00+00:00', lastmod: '2026-02-01T12:00:00+00:00' });
    await build({ root, baseURL, quiet: true });
    assert.match(await read(root, 'posts/essay-6/index.html'), /A completely changed title/);
    await post(root, 'essay-6', { date: '2026-01-01T12:00:00+00:00', publishDate: '2026-01-16T12:00:00+00:00', lastmod: '2026-02-01T12:00:00+00:00' });
  }
});

test('archive groups publication years and next-note cards use the same eligible order at both bases', async t => {
  const root = await fixture(t);
  await post(root, 'newest', { topics: ['Lorem ipsum', 'Dolor sit amet'] }, 'Lorem '.repeat(1000));
  await post(root, 'previous-year', {
    date: '2024-12-01T12:00:00+00:00', publishDate: '2025-12-31T23:59:00+00:00', lastmod: '2026-01-01T12:00:00+00:00'
  });
  await post(root, 'oldest', {
    date: '2024-01-01T12:00:00+00:00', publishDate: '2025-01-02T12:00:00+00:00', lastmod: '2025-01-02T12:00:00+00:00',
    topics: []
  });
  await post(root, 'private-between', {
    date: '2025-12-31T12:00:00+00:00', publishDate: '2026-01-01T12:00:00+00:00', draft: true
  });
  await post(root, 'future-next', { publishDate: '2099-01-01T12:00:00+00:00' });
  for (const baseURL of ['https://farzad528.github.io/fs-notes/', 'https://notes.test/']) {
    await build({ root, baseURL, quiet: true });
    const base = new URL(baseURL).pathname;
    const archive = parse(await read(root, 'archive/index.html'));
    assert.deepEqual(nodes(archive, 'h2').map(textContent), ['2026', '2025']);
    assert.deepEqual(nodes(archive, 'li').map(item => attr(nodes(item, 'a')[0], 'href')),
      ['newest', 'previous-year', 'oldest'].map(slug => `${base}posts/${slug}/`));
    assert.deepEqual(nodes(archive, 'time').map(node => attr(node, 'datetime')),
      ['2026-01-02T12:00:00+00:00', '2025-12-31T23:59:00+00:00', '2025-01-02T12:00:00+00:00']);
    for (const [slug, next] of [['newest', 'previous-year'], ['previous-year', 'oldest'], ['oldest', null]]) {
      const document = parse(await read(root, `posts/${slug}/index.html`));
      const card = nodes(document, 'nav').find(node => attr(node, 'aria-label') === 'Next note');
      assert.equal(card ? attr(nodes(card, 'a')[0], 'href') : null, next ? `${base}posts/${next}/` : null);
    }
    const article = parse(await read(root, 'posts/newest/index.html'));
    assert.deepEqual(nodes(article, 'a').filter(node => hasClass(node, 'chip')).map(node => attr(node, 'href')), [`${base}archive/`, `${base}archive/`]);
    assert(!nodes(parse(await read(root, 'posts/oldest/index.html'))).some(node => hasClass(node, 'tags-row')));
    const readingTime = textContent(nodes(article, 'div').find(node => hasClass(node, 'article-meta'))).match(/(\d+) min read/)[1];
    assert(Number(readingTime) > 1);
    const featured = postRows(parse(await read(root, 'index.html')))[0];
    assert(textContent(featured).includes(`${readingTime} min read`));
  }
});

test('replacement navigation, serif tagline, local fonts and redistributed licenses are preserved', async t => {
  const root = await fixture(t);
  await post(root, 'navigation');
  for (const baseURL of ['https://farzad528.github.io/fs-notes/', 'https://notes.test/']) {
    await build({ root, baseURL, quiet: true });
    const base = new URL(baseURL).pathname;
    for (const [route, current] of [['index.html', 'Notes'], ['about/index.html', 'About'], ['archive/index.html', null], ['posts/navigation/index.html', null], ['404.html', null]]) {
      const html = await read(root, route);
      const document = parse(html);
      const nav = primaryNav(document);
      assert.deepEqual(nodes(nav, 'a').map(textContent), ['Notes', 'About', 'RSS']);
      assert.deepEqual(nodes(nav, 'a').map(node => attr(node, 'href')), [base, `${base}about/`, `${base}index.xml`]);
      assert.deepEqual(nodes(nav, 'a').filter(node => attr(node, 'aria-current') === 'page').map(textContent), current ? [current] : []);
      assert.equal(nodes(document, 'header').filter(node => hasClass(node, 'site-header')).length, 1);
      assert(!/top-band|post-summary|site-subtitle|footer-content/.test(html));
      assert.equal(nodes(document, 'h1').length, 1);
      const preloads = nodes(document, 'link').filter(node => attr(node, 'rel') === 'preload');
      assert.deepEqual(preloads.map(node => attr(node, 'href')), [
        `${base}fonts/newsreader-latin-opsz-normal.woff2`, `${base}fonts/hanken-grotesk-latin-wght-normal.woff2`
      ]);
      for (const preload of preloads) {
        assert.equal(attr(preload, 'as'), 'font');
        assert.equal(attr(preload, 'type'), 'font/woff2');
        assert.equal(attr(preload, 'crossorigin'), 'anonymous');
      }
    }
    const home = parse(await read(root, 'index.html'));
    const heading = nodes(home, 'h1')[0];
    assert.equal(textContent(heading), 'Notes on building, deploying, and leading with AI.');
    assert.deepEqual(nodes(heading, 'em').map(textContent), ['leading']);
    const stylesheet = nodes(home, 'link').find(node => attr(node, 'rel') === 'stylesheet');
    const css = await read(root, attr(stylesheet, 'href').slice(base.length));
    assert(!/https?:|@import/.test(css));
    const fontURLs = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]);
    assert.equal(new Set(fontURLs).size, 4);
    for (const fontURL of fontURLs) assert(fontURL.startsWith('../fonts/'));
    const staticFonts = (await files(path.join(ROOT, 'static', 'fonts')));
    assert.equal(staticFonts.filter(file => file.endsWith('.woff2')).length, 4);
    assert.equal(staticFonts.filter(file => path.basename(file).startsWith('LICENSE')).length, 3);
    for (const original of staticFonts) {
      const published = path.join(root, 'public', 'fonts', path.basename(original));
      const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
      assert.equal(await hash(published), await hash(original));
      if (original.endsWith('.txt')) assert.match(await fs.readFile(published, 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
    }
  }
  const config = path.join(root, 'config', '_default', 'hugo.yaml');
  await fs.writeFile(config, (await fs.readFile(config, 'utf8')).replace('Notes on building, deploying, and leading with AI.', 'A <new> & leading notebook.'));
  await build({ root, quiet: true });
  assert.match(await read(root, 'index.html'), /A &lt;new&gt; &amp; <em>leading<\/em> notebook\./);
});

test('archive metadata and the exact public route inventory remain strict', async t => {
  const root = await fixture(t);
  const filename = path.join(root, 'content', 'archive', 'index.md');
  const original = await fs.readFile(filename, 'utf8');
  for (const source of [
    original.replace('type: archive', 'type: posts'),
    original.replace('draft: false', 'draft: true'),
    original.replace('type: archive', 'type: archive\npublishDate: 2026-01-01T12:00:00+00:00'),
    `${original}\nUnapproved archive prose.`
  ]) {
    await fs.writeFile(filename, source);
    await assert.rejects(validateContent(root, { warn: false }), /Archive must/);
  }
  await fs.writeFile(filename, original);
  const result = await build({ root, quiet: true });
  const validate = () => validatePublic({ root, baseURL: result.baseURL, entries: result.entries });
  const extra = path.join(root, 'public', 'unexpected.html');
  await fs.writeFile(extra, await read(root, '404.html'));
  await assert.rejects(validate(), /HTML routes/);
  await fs.rm(extra);
  const archive = path.join(root, 'public', 'archive', 'index.html');
  const html = await fs.readFile(archive, 'utf8');
  await fs.writeFile(archive, html.replace('</main>', '<ul><li><a href="/fs-notes/about/">Fake note</a></li></ul></main>'));
  await assert.rejects(validate(), /Archive must contain/);
});

test('rich Markdown and full-content RSS keep absolute bundle images, headings and safe text', async t => {
  const root = await fixture(t);
  const directory = await post(root, 'rich', { title: 'Quotes " & apostrophes', excerpt: 'One paragraph.\n\nA [safe link](/about/) in paragraph two.' }, `## A heading

[Jump](#a-heading) and [About](/about/).

An autolink: <https://www.microsoft.com/>.

![A small original fixture](image.svg)

- First
- Second

> A quotation.

| Column | Other |
| --- | --- |
| One | Two |

\`\`\`html
<script>alert("escaped source, not executable")</script>
\`\`\`
`);
  await fs.writeFile(path.join(directory, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#272320"/></svg>');
  await build({ root, quiet: true });
  const html = await read(root, 'posts/rich/index.html');
  const document = parse(html);
  const structured = nodes(document, 'script');
  assert.equal(structured.length, 1);
  const data = articleData(structured[0], 'Rich article');
  assert.equal(data.headline, 'Quotes " & apostrophes');
  assert.equal(data.author.name, AUTHOR);
  assert.equal(data.url, 'https://farzad528.github.io/fs-notes/posts/rich/');
  assert.equal(data.datePublished, metadata('rich').publishDate);
  assert.equal(data.dateModified, metadata('rich').lastmod);
  assert.equal(nodes(document, 'table').length, 1);
  assert.equal(nodes(document, 'blockquote').length, 1);
  assert.equal(nodes(document, 'ul').length, 1);
  assert.match(textContent(nodes(document, 'code')[0]), /<script>alert/);
  assert.equal(textContent(nodes(document, 'time')[0]), '2 January 2026');
  assert.equal(attr(nodes(document, 'time')[0], 'datetime'), metadata('rich').publishDate);
  const lede = nodes(document, 'div').find(node => hasClass(node, 'lede'));
  assert.equal(nodes(lede, 'p').length, 2);
  const tableRegion = nodes(document, 'div').find(node => hasClass(node, 'table-scroll'));
  assert.equal(attr(tableRegion, 'tabindex'), '0');
  assert.equal(attr(tableRegion, 'role'), 'region');
  assert.equal(attr(nodes(document, 'pre')[0], 'tabindex'), '0');
  const home = parse(await read(root, 'index.html'));
  const excerpt = nodes(home, 'div').find(node => attr(node, 'class') === 'excerpt');
  assert.equal(nodes(excerpt, 'p').length, 2);
  const feed = await read(root, 'index.xml');
  const item = feed.match(/<item>([\s\S]*?)<\/item>/)[1];
  const content = xmlValues(item, 'description')[0];
  assert.match(content, /https:\/\/farzad528\.github\.io\/fs-notes\/posts\/rich\/image\.svg/);
  assert.match(content, /<table>/);
  assert.match(content, /&lt;/);
  assert.throws(() => articleData(nodes(parse('<script>alert(1)</script>'), 'script')[0], 'Executable'), /scripts/);
  assert.throws(() => articleData(nodes(parse('<script type="application/ld+json" src="https://unsafe.test/"></script>'), 'script')[0], 'External'), /scripts/);
});

test('London offsets use named-zone rules for winter, summer and DST transitions', () => {
  assert.equal(londonDate(new Date('2026-01-15T12:34:56Z')), '2026-01-15T12:34:56+00:00');
  assert.equal(londonDate(new Date('2026-07-15T12:34:56Z')), '2026-07-15T13:34:56+01:00');
  assert.equal(londonDate(new Date('2026-03-29T00:59:59Z')), '2026-03-29T00:59:59+00:00');
  assert.equal(londonDate(new Date('2026-03-29T01:00:00Z')), '2026-03-29T02:00:00+01:00');
  assert.throws(() => validateLondonDate('2026-07-15T12:00:00+00:00', 'date'), /mismatched/);
  assert.throws(() => validateLondonDate('2026-02-30T12:00:00+00:00', 'date'), /invalid/);
  assert.throws(() => validateLondonDate('2026-01-15T12:00:00Z', 'date'), /explicit/);
});

test('new-post creates safe drafts with actual winter/summer London offsets and never overwrites', async t => {
  const root = await fixture(t);
  for (const [slug, now, expected] of [['winter', '2026-01-15T12:00:00Z', '+00:00'], ['summer', '2026-07-15T12:00:00Z', '+01:00']]) {
    const file = await newPost(slug, { root, now: new Date(now) });
    const source = await fs.readFile(file, 'utf8');
    const meta = parseYaml(source.split('---')[1]);
    assert.equal(meta.draft, true);
    assert(meta.date.endsWith(expected));
    assert.equal(meta.date, meta.lastmod);
    await assert.rejects(newPost(slug, { root }), /already exists/);
    assert.equal(await fs.readFile(file, 'utf8'), source);
  }
  await assert.rejects(newPost('../escape', { root }), /Usage/);
  assert.equal((await validateContent(root, { warn: false })).length, 2);
});

test('strict metadata failures reject missing fields, invalid dates, booleans, slugs and placeholders', async t => {
  const root = await fixture(t);
  const cases = [
    [{ title: '' }, /title/], [{ excerpt: '' }, /excerpt/], [{ draft: 'false' }, /boolean/],
    [{ topics: 'AI' }, /array/], [{ author: 'Other' }, /author/], [{ slug: 'different' }, /match/],
    [{ date: '2026-07-01T12:00:00+00:00' }, /offset/],
    [{ date: '2099-01-01T12:00:00+00:00' }, /future/],
    [{ lastmod: '2025-01-01T12:00:00+00:00' }, /expected/],
    [{ publishDate: '2025-01-01T12:00:00+00:00' }, /expected/],
    [{ description: 'See https://example.com/' }, /placeholder/],
    [{ excerpt: '<script>alert(1)</script>' }, /raw HTML/],
    [{ title: '</script><script>alert(1)</script>' }, /plain/],
    [{ url: '/changed/' }, /unsupported metadata/]
  ];
  for (const [extra, expected] of cases) {
    await post(root, 'invalid', extra);
    await assert.rejects(validateContent(root, { warn: false }), expected);
  }
  const directory = await post(root, 'invalid');
  const filename = path.join(directory, 'index.md');
  await fs.writeFile(filename, (await fs.readFile(filename, 'utf8')).replace(/^description:.*\n/m, ''));
  await assert.rejects(validateContent(root, { warn: false }), /missing description/);
  await post(root, 'invalid');
  await post(root, 'second', { slug: 'invalid' });
  await assert.rejects(validateContent(root, { warn: false }), /duplicate/);
});

test('missing alt, raw HTML, broken links, anchors and images fail publication checks', async t => {
  const root = await fixture(t);
  for (const [body, expected] of [
    ['![](missing.png)', /alt/], ['<img src="image.png" alt="test">', /raw HTML/],
    ['[Broken](/not-here/)', /broken internal/], ['[Broken](#missing-heading)', /broken anchor/],
    ['![Proper alt](missing.png)', /broken internal/], ['[Insecure](http://insecure.test/)', /mixed-content/],
    ['[Unsafe](javascript:alert)', /unsafe/]
  ]) {
    await post(root, 'failure', {}, body);
    await assert.rejects(build({ root, quiet: true }), expected);
  }
});

test('preview serves exact files at configured project prefix without canonical rewriting', async t => {
  const root = await fixture(t);
  await build({ root, quiet: true });
  const { server, url } = await preview({ root, port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), await read(root, 'index.html'));
  assert.equal((await fetch(new URL('/about/', url))).status, 404);
  assert.equal((await fetch(new URL('about/', url))).status, 200);
  assert.equal((await fetch(new URL('missing/', url))).status, 404);
});

test('smoke requires HTTPS and refuses disabled certificate verification', async () => {
  await assert.rejects(smoke('http://notes.test/'), /HTTPS/);
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try { await assert.rejects(smoke('https://notes.test/'), /certificate/); }
  finally { if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous; }
});

test('smoke crawls empty and populated publications, XML, assets and anchors without insecure TLS options', async t => {
  const root = await fixture(t);
  const baseURL = 'https://notes.test/journal/';
  const visited = new Set();
  t.mock.method(globalThis, 'fetch', async (value, options) => {
    assert.equal(options.redirect, 'manual');
    assert(options.signal instanceof AbortSignal);
    assert(!Object.hasOwn(options, 'dispatcher'));
    const url = new URL(value);
    assert.equal(url.origin, 'https://notes.test');
    visited.add(url.pathname);
    let relative = url.pathname.slice('/journal/'.length);
    if (url.pathname.endsWith('/')) relative += 'index.html';
    const filename = path.join(root, 'public', ...relative.split('/'));
    const type = { '.html': 'text/html', '.css': 'text/css', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.txt': 'text/plain' }[path.extname(filename)];
    let bytes;
    try { bytes = await fs.readFile(filename); }
    catch (error) { if (error.code === 'ENOENT') return new Response('Missing', { status: 404 }); throw error; }
    return new Response(bytes, { status: 200, headers: { 'Content-Type': type ?? 'application/octet-stream' } });
  });
  await build({ root, baseURL, quiet: true });
  assert.equal((await smoke(baseURL)).articles, 0);
  assert(visited.has('/journal/favicon.svg'));
  assert(visited.has('/journal/about/'));
  assert(visited.has('/journal/archive/'));
  for (const font of ['newsreader-latin-opsz-normal', 'newsreader-latin-opsz-italic', 'hanken-grotesk-latin-wght-normal', 'jetbrains-mono-latin-400-normal']) {
    assert(visited.has(`/journal/fonts/${font}.woff2`));
  }
  const directory = await post(root, 'remote', {}, '## A heading\n\n[Jump](#a-heading).\n\n![Original image](image.svg)\n');
  await fs.writeFile(path.join(directory, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await build({ root, baseURL, quiet: true });
  assert.equal((await smoke(baseURL)).articles, 1);
  assert(visited.has('/journal/posts/remote/image.svg'));
  const home = path.join(root, 'public', 'index.html');
  const original = await fs.readFile(home, 'utf8');
  await fs.writeFile(home, original.replace('</main>', '<img src="http://insecure.test/image.png" alt="Insecure"></main>'));
  await assert.rejects(smoke(baseURL), /mixed-content/);
  await fs.writeFile(home, original.replace('</main>', '<a href="/journal/missing/">Broken</a></main>'));
  await assert.rejects(smoke(baseURL), /HTTP 404/);
  await fs.writeFile(home, original.replace('</main>', '<a href="#missing">Broken anchor</a></main>'));
  await assert.rejects(smoke(baseURL), /Broken anchor/);
});
