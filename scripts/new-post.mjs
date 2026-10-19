import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stringify } from 'yaml';
import { ROOT, SLUG, AUTHOR, londonDate, assertNode } from './lib.mjs';

export async function newPost(slug, { root = ROOT, now = new Date() } = {}) {
  assertNode();
  if (typeof slug !== 'string' || !SLUG.test(slug)) throw new Error('Usage: npm run new-post -- stable-lowercase-slug');
  const directory = path.join(root, 'content', 'posts', slug);
  await fs.mkdir(path.dirname(directory), { recursive: true });
  try { await fs.mkdir(directory); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Post bundle already exists: ${slug}. Choose a new slug; existing files are never overwritten.`);
    throw error;
  }
  const timestamp = londonDate(now);
  const title = slug.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
  const meta = { title, slug, date: timestamp, publishDate: timestamp, draft: true, author: AUTHOR,
    description: 'Write a concise description before publishing.',
    excerpt: 'Write the explicit Markdown excerpt before publishing.', topics: [], lastmod: timestamp };
  const filename = path.join(directory, 'index.md');
  try { await fs.writeFile(filename, `---\n${stringify(meta)}---\n\n`, { flag: 'wx' }); }
  catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
  return filename;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) { console.error('Usage: npm run new-post -- stable-lowercase-slug'); process.exitCode = 1; }
  else newPost(process.argv[2]).then(file => console.log(`Created draft: ${path.relative(ROOT, file)}\nKeep the slug stable. Complete description, excerpt and body before publishing.`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
