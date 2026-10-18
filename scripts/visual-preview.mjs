import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { stringify } from 'yaml';
import { ROOT, readConfig, normalizeBase } from './lib.mjs';
import { build } from './build.mjs';
import { preview } from './preview.mjs';
import { reviewFixtures, REVIEW_ARTICLE_SLUG, REVIEW_IMAGE, REVIEW_PARAGRAPH } from './review-fixtures.mjs';

export async function generateReview({ root = ROOT, port = 1314, quiet = false } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Review port must be an integer from 1 to 65535.');
  const reviewRoot = path.join(root, '.review', 'site');
  const base = normalizeBase((await readConfig(root)).baseURL);
  base.protocol = 'http:'; base.hostname = '127.0.0.1'; base.port = String(port);
  await fs.rm(reviewRoot, { recursive: true, force: true });
  await fs.mkdir(reviewRoot, { recursive: true });
  for (const directory of ['config', 'layouts', 'assets', 'static']) {
    await fs.cp(path.join(root, directory), path.join(reviewRoot, directory), { recursive: true });
  }
  await fs.mkdir(path.join(reviewRoot, 'content', 'about'), { recursive: true });
  const about = await fs.readFile(path.join(root, 'content', 'about', 'index.md'), 'utf8');
  const frontmatter = about.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) throw new Error('About needs YAML front matter for the local review.');
  const reviewAbout = `${frontmatter[0]}\n${REVIEW_PARAGRAPH}\n`;
  await fs.writeFile(path.join(reviewRoot, 'content', 'about', 'index.md'), reviewAbout);
  await fs.cp(path.join(root, 'content', 'archive'), path.join(reviewRoot, 'content', 'archive'), { recursive: true });
  for (const { meta, body } of reviewFixtures()) {
    const directory = path.join(reviewRoot, 'content', 'posts', meta.slug);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'index.md'), `---\n${stringify(meta)}---\n\n${body}`);
    if (meta.slug === REVIEW_ARTICLE_SLUG) await fs.writeFile(path.join(directory, 'delivery-loop.svg'), REVIEW_IMAGE);
  }
  await build({ root: reviewRoot, baseURL: base.href, quiet });
  return { root: reviewRoot, baseURL: base.href, articleURL: new URL(`posts/${REVIEW_ARTICLE_SLUG}/`, base).href };
}

export async function visualPreview({ root = ROOT, port = 1314, quiet = false } = {}) {
  const review = await generateReview({ root, port, quiet });
  const { server } = await preview({ root: review.root, port, baseURL: review.baseURL });
  return { ...review, server };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: { port: { type: 'string', default: '1314' }, help: { type: 'boolean', short: 'h' } }, strict: true });
    if (values.help) {
      console.log('Usage: npm run visual-preview -- [--port 1314]\nBuilds five local-only fixtures in ignored .review/site/ and serves them on 127.0.0.1.\nProduction content/ and public/ are never changed. No browser JavaScript is included.\nPress Ctrl+C to stop; rerun to regenerate fixtures. Remove .review/ to clean up.');
    } else {
      const { server, baseURL, articleURL } = await visualPreview({ port: Number(values.port) });
      console.log(`LOCAL-ONLY VISUAL REVIEW — never publish this output.\nHome: ${baseURL}\nArticle: ${articleURL}\nOutput: .review/site/public\nProduction content/ and public/ are untouched. Press Ctrl+C to stop.`);
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
