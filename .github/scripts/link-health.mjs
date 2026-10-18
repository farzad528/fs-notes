import { readdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';
import YAML from 'yaml';

const urls = new Set();
const config = YAML.parse(await readFile('config/_default/hugo.yaml', 'utf8'));
const origin = new URL(config.baseURL).origin;
async function visitFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await visitFiles(file);
    else if (entry.name.endsWith('.html')) {
      const document = parse(await readFile(file, 'utf8'));
      const visit = (node) => {
        if (node.tagName === 'a') {
          const href = node.attrs.find((attr) => attr.name === 'href')?.value;
          if (href?.startsWith('https://') && new URL(href).origin !== origin) {
            urls.add(href.split('#')[0]);
          }
        }
        for (const child of node.childNodes ?? []) visit(child);
      };
      visit(document);
    }
  }
}

await visitFiles('public');
const report = ['# Link health', '', 'External responses are observations, not production outage decisions.', ''];
for (const url of [...urls].sort()) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'fs-notes-link-health/1.0' },
    });
    const result = `${response.status}${response.redirected ? ` -> ${response.url}` : ''}`;
    report.push(`- ${url}: ${result}`);
    console.log(`${url}: ${result}`);
    if (response.body) await response.body.cancel();
  } catch (error) {
    if (!(error instanceof TypeError) && error.name !== 'TimeoutError') throw error;
    const result = `request failed (${error.message}); investigate before changing content`;
    report.push(`- ${url}: ${result}`);
    console.warn(`${url}: ${result}`);
  }
}
if (!urls.size) report.push('No external article links in this production build.');
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report.join('\n')}\n`);
}
