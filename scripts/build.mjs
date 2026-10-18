import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readConfig, normalizeBase, assertNode } from './lib.mjs';
import { validateContent } from './validate-content.mjs';
import { validatePublic } from './validate-public.mjs';
import { runHugo } from './hugo-runner.mjs';

export async function build({ root = ROOT, destination = path.join(root, 'public'), baseURL, quiet = false } = {}) {
  assertNode();
  const entries = await validateContent(root, { warn: !quiet });
  const base = normalizeBase(baseURL ?? (await readConfig(root)).baseURL);
  destination = path.resolve(destination);
  const relative = path.relative(root, destination);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !['public', '.test-work'].includes(relative.split(path.sep)[0])) {
    throw new Error('Build destination must be public/ or inside .test-work/ under the project.');
  }
  await fs.rm(destination, { recursive: true, force: true });
  await runHugo(['--environment', 'production', '--destination', destination, '--baseURL', base.href,
    '--cleanDestinationDir', '--gc', '--noBuildLock', '--panicOnWarning', '--printPathWarnings'], { root, quiet });
  const result = await validatePublic({ root, destination, baseURL: base.href, entries });
  if (!quiet) console.log(`Validated ${result.htmlPages} HTML pages, ${result.articles} published articles and ${result.references} references.`);
  return { ...result, entries, destination, baseURL: base.href };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch(error => { console.error(error.message); process.exitCode = 1; });
}
