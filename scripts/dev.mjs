import path from 'node:path';
import { readConfig, normalizeBase } from './lib.mjs';
import { validateContent } from './validate-content.mjs';
import { serveHugo } from './hugo-runner.mjs';

try {
  await validateContent();
  const base = normalizeBase((await readConfig()).baseURL);
  base.protocol = 'http:'; base.hostname = 'localhost'; base.port = '1313';
  console.log(`Local draft preview: ${base.href} (localhost only; not the production output).`);
  await serveHugo(['server', '--environment', 'development', '--buildDrafts', '--bind', '127.0.0.1',
    '--baseURL', base.href, '--port', '1313', '--destination', path.join('.cache', 'hugo-dev'),
    '--disableFastRender', '--disableLiveReload', '--noBuildLock']);
} catch (error) { console.error(error.message); process.exitCode = 1; }
