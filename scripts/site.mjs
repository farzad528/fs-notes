import { pathToFileURL } from 'node:url';
import { ROOT, readConfig, normalizeBase, assertNode } from './lib.mjs';

export async function baseURL(root = ROOT) {
  assertNode();
  return normalizeBase((await readConfig(root)).baseURL).href;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== 'base-url') {
    console.error('Usage: node scripts/site.mjs base-url');
    process.exitCode = 1;
  } else {
    baseURL().then(value => console.log(value)).catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
