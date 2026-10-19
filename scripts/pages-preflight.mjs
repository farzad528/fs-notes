import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { ROOT, assertNode, normalizeBase } from './lib.mjs';
import { baseURL as configuredBaseURL } from './site.mjs';

const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}';
const REPOSITORY = new RegExp(`^${OWNER}/[A-Za-z0-9._-]{1,100}$`);
const HELP = `Usage: npm run pages-preflight -- --repo OWNER/REPO [--require-configured | --require-ready] [--json]

Read-only GitHub.com GET requests; baseURL comes from config/_default/hugo.yaml.
Uses GH_BIN, .tools/gh/bin/gh.exe, or gh on PATH; keeps existing authentication.
No repository, Pages, certificate, DNS, or authentication settings are changed.

  --require-configured  Exit 1 unless public/main, workflow source, destination,
                        and custom-domain ownership match (HTTPS may be pending).
  --require-ready       Exit 1 unless configuration AND enforced, valid HTTPS pass.
  --json                Print the report as JSON, without writing a file.
  --help, -h            Show this help.

Without a requirement flag, expected blocked states are diagnostic (exit 0).
Invalid input, missing gh, malformed responses, and unexpected API errors exit 1.
Custom certificates require approved state, hostname coverage, and future expiry.
This checks API readiness, not DNS propagation or deployed content.`;

export function validateRepositoryIdentifier(value) {
  if (typeof value !== 'string' || !REPOSITORY.test(value) || ['.', '..'].includes(value.split('/')[1])) {
    throw new Error('Invalid repository identifier; use exactly OWNER/REPO with GitHub account and repository names.');
  }
  return value;
}

function hostname(value) {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  const host = value.toLowerCase().replace(/\.$/, '');
  if (host.length > 253 || isIP(host) || !host.includes('.')
    || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return host;
}

function httpsBase(value) {
  let base;
  try { base = normalizeBase(value); }
  catch { throw new Error('Invalid baseURL; use an HTTPS URL without credentials, query, or fragment.'); }
  if (base.protocol !== 'https:' || base.port || !hostname(base.hostname) || /[?#]/.test(base.href)) {
    throw new Error('Invalid baseURL; use an HTTPS hostname on the standard port without credentials, query, or fragment.');
  }
  base.hostname = hostname(base.hostname);
  return base;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function instant(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  const calendarDate = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(calendarDate) || new Date(calendarDate).toISOString().slice(0, 10) !== value.slice(0, 10)) return NaN;
  return parsed;
}

function covers(domain, host) {
  if (typeof domain !== 'string') return false;
  if (!domain.startsWith('*.')) return hostname(domain) === host;
  const suffix = hostname(domain.slice(2));
  return suffix !== null && host.endsWith(`.${suffix}`) && host.split('.').length === suffix.split('.').length + 1;
}

// The caller supplies time explicitly so the evaluator has no clock, I/O, or environment dependencies.
export function evaluatePagesReadiness({ repository, pages, baseURL, now } = {}) {
  if (!object(repository)) throw new Error('Malformed repository response: expected a JSON object.');
  const name = validateRepositoryIdentifier(repository.full_name);
  const base = httpsBase(baseURL);
  const blockers = [];
  if (repository.private !== false) blockers.push('Repository visibility is not confirmed public; this deployment requires a public source repository. Verify its visibility with the owner.');
  if (repository.default_branch !== 'main') blockers.push('The repository default branch must be main; verify the intended source branch before deployment.');
  const result = { repository: name, baseURL: base.href, configurationReady: false, ready: false, blockers, httpsPending: false };
  if (pages === null) {
    blockers.push('Pages is not configured or is not visible to this credential (HTTP 404); verify Pages settings and access. Plan eligibility is unknown, not disproved.');
    return result;
  }
  if (!object(pages) || typeof pages.build_type !== 'string' || typeof pages.html_url !== 'string') {
    throw new Error('Malformed Pages response: expected build_type and html_url in a JSON object.');
  }
  if (pages.build_type !== 'workflow') blockers.push('Pages build_type must be workflow; verify that GitHub Actions is the Pages publishing source.');

  const [owner, repo] = name.split('/');
  const projectHost = `${owner.toLowerCase()}.github.io`;
  const projectPath = repo.toLowerCase() === projectHost ? '/' : `/${repo}/`;
  const customDomain = !base.hostname.endsWith('.github.io');
  if (!customDomain) {
    if (base.hostname !== projectHost || base.pathname !== projectPath) {
      blockers.push(`baseURL must match this repository's project destination https://${projectHost}${projectPath}, or an owned custom-domain root.`);
    }
    if (pages.cname !== null && pages.cname !== undefined && pages.cname !== '') {
      blockers.push('Pages has a custom CNAME but baseURL targets github.io; reconcile the canonical destination before deployment.');
    }
  } else {
    if (base.pathname !== '/') blockers.push('A custom-domain baseURL must use the root path /, not a repository prefix.');
    if (hostname(pages.cname) !== base.hostname) {
      blockers.push(`Pages CNAME must exactly match the canonical baseURL hostname ${base.hostname}; do not deploy to a different domain.`);
    }
    if (pages.protected_domain_state !== 'verified') {
      blockers.push('Custom-domain ownership verification is needed: protected_domain_state must be verified; ask the account owner to verify the domain.');
    }
  }
  try {
    if (httpsBase(pages.html_url).href !== base.href) blockers.push('Pages html_url does not match the normalized central baseURL; reconcile the canonical destination before deployment.');
  } catch {
    blockers.push('Pages html_url is not a valid canonical HTTPS destination; verify Pages settings against the central baseURL.');
  }
  result.configurationReady = blockers.length === 0;
  const configurationBlockers = blockers.length;
  if (pages.https_enforced !== true) blockers.push('HTTPS is not enforced; wait for provisioning and have the owner enable Enforce HTTPS in Pages settings.');
  if (customDomain || pages.https_certificate != null) {
    const certificate = pages.https_certificate;
    if (!object(certificate)) {
      blockers.push('An approved HTTPS certificate is not available; wait for GitHub Pages certificate provisioning.');
    } else {
      if (certificate.state !== 'approved') blockers.push('The HTTPS certificate is not approved; wait for GitHub Pages to approve provisioning.');
      if (!Array.isArray(certificate.domains) || !certificate.domains.some(domain => covers(domain, base.hostname))) {
        blockers.push('The HTTPS certificate does not confirm coverage of the canonical hostname; verify the certificate domains in Pages settings.');
      }
      const expiry = typeof certificate.expires_at === 'string' ? instant(certificate.expires_at) : NaN;
      const evaluatedAt = instant(now);
      if (!Number.isFinite(expiry)) blockers.push('The HTTPS certificate expiry is missing or invalid; verify certificate provisioning in Pages settings.');
      else if (!Number.isFinite(evaluatedAt)) blockers.push('Certificate freshness is unknown; supply an explicit evaluation time (now) or run the CLI.');
      else if (expiry <= evaluatedAt) blockers.push('The HTTPS certificate has expired; resolve certificate renewal before release.');
    }
  }
  result.httpsPending = blockers.length > configurationBlockers;
  result.ready = result.configurationReady && !result.httpsPending;
  return result;
}

export class GitHubApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

export function githubBinary({ root = ROOT, env = process.env, fileExists = fs.existsSync } = {}) {
  if (env.GH_BIN) {
    const binary = path.resolve(root, env.GH_BIN);
    if (!fileExists(binary)) throw new Error('GH_BIN does not point to an existing GitHub CLI executable.');
    return binary;
  }
  for (const binary of [path.join(root, '.tools', 'gh', 'bin', 'gh.exe'), path.join(root, '.tools', 'gh', 'bin', 'gh')]) {
    if (fileExists(binary)) return binary;
  }
  return 'gh';
}

export function createGitHubApi({ root = ROOT, env = process.env, execute = execFileSync, fileExists = fs.existsSync } = {}) {
  const binary = githubBinary({ root, env, fileExists });
  return endpoint => {
    const match = /^\/repos\/([^/]+\/[^/]+)(\/pages)?$/.exec(endpoint);
    if (!match) throw new Error('Only repository and Pages GET endpoints are supported.');
    validateRepositoryIdentifier(match[1]);
    let output;
    try {
      output = execute(binary, ['api', '--hostname', 'github.com', '--method', 'GET', endpoint], {
        cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30_000,
        maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...env, GH_PROMPT_DISABLED: '1' }
      });
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('GitHub CLI was not found; set GH_BIN, install .tools/gh/bin/gh.exe, or add gh to PATH.');
      const status = Number(/\bHTTP[ \t]+([45]\d\d)\b/.exec(String(error.stderr ?? ''))?.[1]) || undefined;
      // Never echo subprocess messages, stdout, stderr, headers, or environment: they can contain credentials.
      throw new GitHubApiError(`GitHub API GET ${endpoint} failed${status ? ` (HTTP ${status})` : ''}; verify connectivity, access, and existing authentication.`, status);
    }
    let data;
    try { data = JSON.parse(output); }
    catch { throw new Error(`GitHub API GET ${endpoint} returned invalid JSON.`); }
    if (!object(data)) throw new Error(`GitHub API GET ${endpoint} returned a malformed response; expected a JSON object.`);
    return data;
  };
}

export async function pagesPreflight({ repo, baseURL, api, now } = {}) {
  validateRepositoryIdentifier(repo);
  const base = httpsBase(baseURL).href;
  let repository;
  try {
    repository = await api(`/repos/${repo}`);
    if (!object(repository) || typeof repository.full_name !== 'string'
      || repository.full_name.toLowerCase() !== repo.toLowerCase()) {
      throw new Error('Malformed or mismatched repository response; the requested repository identity was not confirmed.');
    }
    const pages = await api(`/repos/${repo}/pages`);
    return evaluatePagesReadiness({ repository, pages, baseURL: base, now });
  } catch (error) {
    if (!(error instanceof GitHubApiError) || ![403, 404].includes(error.status)) throw error;
    const blocker = error.status === 403
      ? 'GitHub API access is blocked (HTTP 403); verify contents:read and pages:read permissions, existing authentication, organization policy, public source visibility, and Pages plan eligibility with the owner. Do not create a privileged PAT.'
      : repository
        ? 'Pages is unconfigured or inaccessible (HTTP 404); verify Pages settings and credential access. Pages plan eligibility remains unknown; 404 is not proof of ineligibility.'
        : 'Repository is unavailable (HTTP 404); verify its identifier, public source visibility, and existing credential access. Pages plan eligibility remains unknown.';
    return { repository: repo, baseURL: base, configurationReady: false, ready: false, blockers: [blocker], httpsPending: false };
  }
}

function argumentsFor(argv) {
  const options = { repo: null, requireConfigured: false, requireReady: false, json: false, help: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (seen.has(argument)) throw new Error(`Duplicate option: ${argument}`);
    seen.add(argument);
    if (argument === '--repo') options.repo = validateRepositoryIdentifier(argv[++index]);
    else if (argument === '--require-configured') options.requireConfigured = true;
    else if (argument === '--require-ready') options.requireReady = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown option: ${argument}. Use --help.`);
  }
  if (options.requireConfigured && options.requireReady) throw new Error('--require-configured and --require-ready are mutually exclusive.');
  if (!options.help && !options.repo) throw new Error('--repo OWNER/REPO is required. Use --help.');
  return options;
}

export async function main(argv = process.argv.slice(2), {
  api, readBaseURL = configuredBaseURL, now = () => Date.now(),
  stdout = text => console.log(text), stderr = text => console.error(text)
} = {}) {
  let options;
  try {
    options = argumentsFor(argv);
    if (options.help) { stdout(HELP); return 0; }
    assertNode();
    const baseURL = httpsBase(await readBaseURL()).href;
    const report = await pagesPreflight({ repo: options.repo, baseURL, api: api ?? createGitHubApi(), now: now() });
    if (options.json) stdout(JSON.stringify(report, null, 2));
    else {
      stdout(`${report.ready ? 'READY' : 'BLOCKED'}: ${report.repository}\nbaseURL: ${report.baseURL}\nConfiguration: ${report.configurationReady ? 'READY' : 'BLOCKED'}; HTTPS: ${report.httpsPending ? 'PENDING/BLOCKED' : report.ready ? 'READY' : 'NOT CONFIRMED'}`);
      for (const blocker of report.blockers) stdout(`- ${blocker}`);
      if (!options.requireConfigured && !options.requireReady && !report.ready) stdout('Diagnostic only (exit 0); deployment must use --require-configured and final release must use --require-ready.');
    }
    return (options.requireConfigured && !report.configurationReady) || (options.requireReady && !report.ready) ? 1 : 0;
  } catch (error) {
    if (options?.json || argv.includes('--json')) {
      stdout(JSON.stringify({ repository: options?.repo ?? null, baseURL: null, configurationReady: false, ready: false, blockers: [error.message], httpsPending: false }, null, 2));
    } else stderr(`BLOCKED: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
