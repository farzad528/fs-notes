import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  evaluatePagesReadiness, validateRepositoryIdentifier, githubBinary,
  createGitHubApi, GitHubApiError, pagesPreflight, main
} from '../scripts/pages-preflight.mjs';

const NOW = '2026-10-18T21:30:00Z';
const repository = { full_name: 'writer/notes', private: false, default_branch: 'main' };
const project = {
  build_type: 'workflow', html_url: 'https://writer.github.io/notes/',
  cname: null, https_enforced: true
};
const custom = {
  build_type: 'workflow', html_url: 'https://notes.test/', cname: 'notes.test',
  protected_domain_state: 'verified', https_enforced: true,
  https_certificate: { state: 'approved', domains: ['notes.test'], expires_at: '2027-01-01' }
};
const evaluate = (overrides = {}) => evaluatePagesReadiness({
  repository, pages: project, baseURL: project.html_url, now: NOW, ...overrides
});
const evaluateCustom = (pages = {}, extra = {}) => evaluate({ pages: { ...custom, ...pages }, baseURL: custom.html_url, ...extra });
const mockApi = (pages = project, repo = repository) => endpoint => {
  assert.match(endpoint, /^\/repos\/writer\/notes(?:\/pages)?$/);
  return endpoint.endsWith('/pages') ? pages : repo;
};

async function cli(args = [], overrides = {}) {
  const output = [];
  const errors = [];
  const code = await main(['--repo', 'writer/notes', ...args], {
    api: mockApi(), readBaseURL: async () => project.html_url, now: () => NOW,
    stdout: text => output.push(text), stderr: text => errors.push(text), ...overrides
  });
  return { code, output: output.join('\n'), errors: errors.join('\n') };
}

test('matching project Pages configuration is ready without a custom-domain certificate', () => {
  assert.deepEqual(evaluate(), {
    repository: 'writer/notes', baseURL: project.html_url,
    configurationReady: true, ready: true, blockers: [], httpsPending: false
  });
  assert.equal(evaluate({ repository: { ...repository, permissions: { pull: true } } }).ready, true);
});

test('project origin and prefix are derived from the supplied repository, including user sites', () => {
  assert.equal(evaluate({
    repository: { ...repository, full_name: 'another/essays' },
    pages: { ...project, html_url: 'https://another.github.io/essays/' }, baseURL: 'https://another.github.io/essays'
  }).ready, true);
  assert.equal(evaluate({
    repository: { ...repository, full_name: 'Writer/writer.github.io' },
    pages: { ...project, html_url: 'https://writer.github.io/' }, baseURL: 'https://writer.github.io/'
  }).ready, true);
  for (const baseURL of ['https://writer.github.io/', 'https://other.github.io/notes/', 'https://writer.github.io/wrong/']) {
    const result = evaluate({ baseURL, pages: { ...project, html_url: baseURL } });
    assert.equal(result.configurationReady, false);
    assert.match(result.blockers.join('\n'), /project destination/);
  }
});

test('public main source and workflow publishing are mandatory, not inferred from permissions', () => {
  for (const repo of [
    { ...repository, private: true }, { ...repository, private: undefined },
    { ...repository, private: null }, { ...repository, default_branch: 'master' }
  ]) {
    const result = evaluate({ repository: repo });
    assert.equal(result.ready, false);
    assert.equal(result.configurationReady, false);
    assert.match(result.blockers.join('\n'), /public|main/);
  }
  const legacy = evaluate({ pages: { ...project, build_type: 'legacy' } });
  assert.equal(legacy.configurationReady, false);
  assert.match(legacy.blockers.join('\n'), /build_type must be workflow/);
});

test('verified custom-domain root with approved covering unexpired certificate is ready', () => {
  const result = evaluateCustom({ cname: 'NOTES.TEST.', html_url: 'https://NOTES.TEST' }, { baseURL: 'https://NOTES.TEST./' });
  assert.equal(result.baseURL, 'https://notes.test/');
  assert.equal(result.configurationReady, true);
  assert.equal(result.ready, true);
});

test('custom-domain path, hostname, CNAME, and verification mismatches block configuration', () => {
  const cases = [
    [{}, { baseURL: 'https://notes.test/notes/' }, /root path/],
    [{ cname: 'www.notes.test' }, {}, /CNAME must exactly match/],
    [{ cname: null }, {}, /CNAME must exactly match/],
    [{ cname: 'https://notes.test/' }, {}, /CNAME must exactly match/],
    [{ html_url: 'https://other.test/' }, {}, /html_url does not match/],
    [{ html_url: 'https://notes.test/notes/' }, {}, /html_url does not match/],
    [{ protected_domain_state: null }, {}, /ownership verification/],
    [{ protected_domain_state: 'pending' }, {}, /ownership verification/],
    [{ protected_domain_state: 'unverified' }, {}, /ownership verification/]
  ];
  for (const [pages, extra, message] of cases) {
    const result = evaluateCustom(pages, extra);
    assert.equal(result.configurationReady, false);
    assert.equal(result.ready, false);
    assert.match(result.blockers.join('\n'), message);
  }
  assert.equal(evaluate({ pages: { ...project, cname: 'notes.test' } }).configurationReady, false);
});

test('html_url must itself be valid HTTPS without credentials, query, fragment, or different prefix', () => {
  for (const html_url of [
    'http://writer.github.io/notes/', 'https://writer.github.io/notes/?x=1',
    'https://name:secret@writer.github.io/notes/', 'https://writer.github.io/notes/#about', 'not a URL'
  ]) assert.equal(evaluate({ pages: { ...project, html_url } }).configurationReady, false);
});

test('HTTPS pending does not prevent a configuration-only bootstrap but never passes readiness', () => {
  for (const https_enforced of [false, null, undefined]) {
    const result = evaluate({ pages: { ...project, https_enforced } });
    assert.equal(result.configurationReady, true);
    assert.equal(result.ready, false);
    assert.equal(result.httpsPending, true);
    assert.match(result.blockers.join('\n'), /HTTPS is not enforced/);
  }
  const firstDeployment = evaluateCustom({ https_enforced: false, https_certificate: null, status: null });
  assert.equal(firstDeployment.configurationReady, true);
  assert.equal(firstDeployment.ready, false);
  assert.equal(firstDeployment.httpsPending, true);
});

test('custom HTTPS fails closed on missing, unapproved, expired, malformed, or wrong-host certificate', () => {
  for (const [certificate, message] of [
    [undefined, /not available/],
    [null, /not available/],
    [{ ...custom.https_certificate, state: 'uploaded' }, /not approved/],
    [{ ...custom.https_certificate, state: 'issued' }, /not approved/],
    [{ ...custom.https_certificate, state: 'pending' }, /not approved/],
    [{ ...custom.https_certificate, domains: ['other.test'] }, /coverage/],
    [{ ...custom.https_certificate, domains: undefined }, /coverage/],
    [{ ...custom.https_certificate, domains: 'notes.test' }, /coverage/],
    [{ ...custom.https_certificate, expires_at: '2026-10-18' }, /expired/],
    [{ ...custom.https_certificate, expires_at: NOW }, /expired/],
    [{ ...custom.https_certificate, expires_at: '2026-02-30' }, /invalid/],
    [{ ...custom.https_certificate, expires_at: '2027-02-30T23:00:00Z' }, /invalid/],
    [{ ...custom.https_certificate, expires_at: Date.parse('2027-01-01') }, /invalid/],
    [{ ...custom.https_certificate, expires_at: 'not a date' }, /invalid/],
    [{ ...custom.https_certificate, expires_at: undefined }, /invalid/]
  ]) {
    const result = evaluateCustom({ https_certificate: certificate });
    assert.equal(result.configurationReady, true);
    assert.equal(result.ready, false);
    assert.equal(result.httpsPending, true);
    assert.match(result.blockers.join('\n'), message);
  }
});

test('a verified custom domain can bootstrap from the API HTTP URL without passing HTTPS readiness', () => {
  const pending = {
    html_url: 'http://notes.test/',
    https_enforced: false,
    https_certificate: null,
  };
  const report = evaluateCustom(pending);
  assert.equal(report.configurationReady, true);
  assert.equal(report.ready, false);
  assert.equal(report.httpsPending, true);
  assert.match(report.blockers.join('\n'), /HTTPS is not enforced/);
  for (const html_url of [
    'http://other.test/', 'http://notes.test/wrong/', 'http://notes.test/?x=1',
    'http://notes.test/#about', 'http://notes.test:8080/', 'http://user:pass@notes.test/',
  ]) assert.equal(evaluateCustom({ ...pending, html_url }).configurationReady, false);
  assert.equal(evaluateCustom({ ...pending, protected_domain_state: 'pending' }).configurationReady, false);
  assert.equal(evaluateCustom({ ...pending, https_enforced: true }).configurationReady, false);
  assert.equal(evaluate({ pages: { ...project, html_url: 'http://writer.github.io/notes/', https_enforced: false } }).configurationReady, false);
});

test('certificate evaluation is deterministic and needs explicit time; wildcards cover one label only', () => {
  const input = { repository, pages: custom, baseURL: custom.html_url, now: NOW };
  const original = structuredClone(input);
  assert.deepEqual(evaluatePagesReadiness(input), evaluatePagesReadiness(input));
  assert.deepEqual(input, original);
  assert.match(evaluateCustom({}, { now: undefined }).blockers.join('\n'), /freshness is unknown/);
  const pages = {
    ...custom, cname: 'www.notes.test', html_url: 'https://www.notes.test/',
    https_certificate: { ...custom.https_certificate, domains: ['*.notes.test'] }
  };
  assert.equal(evaluate({ pages, baseURL: pages.html_url }).ready, true);
  assert.equal(evaluate({ pages: { ...pages, cname: 'sub.www.notes.test', html_url: 'https://sub.www.notes.test/' }, baseURL: 'https://sub.www.notes.test/' }).ready, false);
  assert.equal(evaluateCustom({ https_certificate: { ...custom.https_certificate, domains: ['*.notes.test'] } }).ready, false);
});

test('strict repository identifiers and HTTPS bases reject malformed or unsafe input', () => {
  for (const name of [
    '', 'writer', 'writer/notes/extra', '../notes', '-writer/notes', 'writer-/notes', 'a--b/notes',
    'writer/..', 'writer/.', 'writer/a?x', 'writer/a#b', 'writer/a b', 'writer\\notes',
    'writer/notes\n', `${'a'.repeat(40)}/notes`, `writer/${'x'.repeat(101)}`
  ]) assert.throws(() => validateRepositoryIdentifier(name), /Invalid repository/);
  for (const name of ['writer/notes', 'a-b/notes.v2', 'writer/.github', 'writer/notes_2']) assert.equal(validateRepositoryIdentifier(name), name);
  for (const baseURL of [
    'http://notes.test/', 'https://user:secret@notes.test/', 'https://notes.test/?x=1', 'https://notes.test/#x',
    'file:///notes', 'not a URL', 'https://notes.test:8443/', 'https://127.0.0.1/', 'https://localhost/',
    'https://notes.test/?', 'https://notes.test/#'
  ]) assert.throws(() => evaluate({ baseURL }), /Invalid baseURL/);
});

test('unconfigured Pages and malformed responses never become ready', () => {
  const result = evaluate({ pages: null });
  assert.equal(result.configurationReady, false);
  assert.match(result.blockers.join('\n'), /404.*Plan eligibility is unknown/);
  for (const pages of [undefined, [], {}, 'bad', { build_type: 'workflow' }]) assert.throws(() => evaluate({ pages }), /Malformed Pages/);
  for (const repo of [null, [], {}, { full_name: 'invalid' }]) assert.throws(() => evaluate({ repository: repo }), /Malformed repository|Invalid repository/);
});

test('binary discovery honors GH_BIN, local tools, then PATH without executing discovery commands', () => {
  const root = path.resolve('.test-work');
  const explicit = path.join(root, 'custom', 'gh.exe');
  const local = path.join(root, '.tools', 'gh', 'bin', 'gh.exe');
  assert.equal(githubBinary({ root, env: { GH_BIN: explicit }, fileExists: name => name === explicit || name === local }), explicit);
  assert.equal(githubBinary({ root, env: {}, fileExists: name => name === local }), local);
  assert.equal(githubBinary({ root, env: {}, fileExists: () => false }), 'gh');
  assert.throws(() => githubBinary({ root, env: { GH_BIN: explicit }, fileExists: () => false }), /GH_BIN/);
});

test('API adapter executes only GET array arguments and preserves auth without logging it', () => {
  const calls = [];
  const env = { GITHUB_TOKEN: 'test-github-secret', GH_TOKEN: 'test-gh-secret', GH_HOST: 'other.test' };
  const api = createGitHubApi({
    env, fileExists: () => false,
    execute: (binary, args, options) => { calls.push({ binary, args, options }); return JSON.stringify(repository); }
  });
  assert.deepEqual(api('/repos/writer/notes'), repository);
  assert.deepEqual(api('/repos/writer/notes/pages'), repository);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.binary, 'gh');
    assert.deepEqual(call.args.slice(0, 5), ['api', '--hostname', 'github.com', '--method', 'GET']);
    assert.equal(call.options.env.GITHUB_TOKEN, env.GITHUB_TOKEN);
    assert.equal(call.options.env.GH_TOKEN, env.GH_TOKEN);
    assert.equal(call.options.env.GH_PROMPT_DISABLED, '1');
    assert.deepEqual(call.options.stdio, ['ignore', 'pipe', 'pipe']);
    assert.equal(call.options.shell, undefined);
    assert.equal(call.options.timeout, 30_000);
  }
  for (const endpoint of ['/user', '/repos/writer/notes/pages/builds', '/repos/writer/notes?x=1', '/repos/a--b/notes']) {
    assert.throws(() => api(endpoint), /Only repository|Invalid repository/);
  }
  assert.equal(calls.length, 2);
  assert.equal(env.GITHUB_TOKEN, 'test-github-secret');
});

test('API execution errors redact captured secrets and safely extract HTTP status', () => {
  for (const status of [403, 404, 500]) {
    const api = createGitHubApi({
      env: {}, fileExists: () => false,
      execute: () => { throw Object.assign(new Error('SECRET command'), { stderr: `token SECRET: request failed (HTTP ${status})`, stdout: 'SECRET response' }); }
    });
    assert.throws(() => api('/repos/writer/notes/pages'), error => {
      assert(error instanceof GitHubApiError);
      assert.equal(error.status, status);
      assert(!error.message.includes('SECRET'));
      return true;
    });
  }
  const missing = createGitHubApi({ env: {}, fileExists: () => false, execute: () => { throw Object.assign(new Error('secret'), { code: 'ENOENT' }); } });
  assert.throws(() => missing('/repos/writer/notes'), /GitHub CLI was not found/);
  for (const response of ['not JSON SECRET', '', 'null', '[]', '"SECRET"']) {
    const api = createGitHubApi({ env: {}, fileExists: () => false, execute: () => response });
    assert.throws(() => api('/repos/writer/notes'), /invalid JSON|malformed response/);
  }
});

test('preflight queries exactly the requested repository and Pages, with no other calls', async () => {
  const endpoints = [];
  const report = await pagesPreflight({
    repo: 'writer/notes', baseURL: project.html_url, now: NOW,
    api: endpoint => { endpoints.push(endpoint); return mockApi()(endpoint); }
  });
  assert.equal(report.ready, true);
  assert.deepEqual(endpoints, ['/repos/writer/notes', '/repos/writer/notes/pages']);
  await assert.rejects(pagesPreflight({ repo: 'writer/notes', baseURL: project.html_url, api: mockApi(project, { ...repository, full_name: 'other/notes' }) }), /mismatched repository/);
});

test('404 does not claim plan ineligibility and 403 explicitly requests permission and plan checks', async () => {
  for (const failAt of ['repository', 'pages']) {
    for (const status of [403, 404]) {
      const report = await pagesPreflight({
        repo: 'writer/notes', baseURL: project.html_url, now: NOW,
        api: endpoint => {
          if (failAt === 'repository' || endpoint.endsWith('/pages')) throw new GitHubApiError('controlled error', status);
          return repository;
        }
      });
      assert.equal(report.ready, false);
      assert.equal(report.configurationReady, false);
      assert.match(report.blockers.join('\n'), status === 404 ? /eligibility remains unknown/ : /contents:read and pages:read.*plan eligibility/);
    }
  }
  await assert.rejects(pagesPreflight({
    repo: 'writer/notes', baseURL: project.html_url, api: () => { throw new GitHubApiError('HTTP 500 failure', 500); }
  }), /500 failure/);
});

test('CLI reports ready and enforces configured versus HTTPS-ready gates independently', async () => {
  assert.equal((await cli(['--require-ready'])).code, 0);
  const pending = {
    api: mockApi({ ...custom, https_certificate: null, https_enforced: false }),
    readBaseURL: async () => custom.html_url
  };
  const diagnostic = await cli([], pending);
  assert.equal(diagnostic.code, 0);
  assert.match(diagnostic.output, /BLOCKED.*\nbaseURL: https:\/\/notes.test\/\nConfiguration: READY; HTTPS: PENDING\/BLOCKED/);
  assert.match(diagnostic.output, /Diagnostic only/);
  const privateSource = { api: mockApi(project, { ...repository, private: true }) };
  const blocked = await cli([], privateSource);
  assert.equal(blocked.code, 0);
  assert.match(blocked.output, /BLOCKED: writer\/notes/);
  assert.match(blocked.output, /Configuration: BLOCKED; HTTPS: NOT CONFIRMED/);
  assert.match(blocked.output, /requires a public source repository/);
  for (const flag of ['--require-configured', '--require-ready']) {
    assert.equal((await cli([flag], privateSource)).code, 1);
  }
  assert.equal((await cli(['--require-configured'], pending)).code, 0);
  assert.equal((await cli(['--require-ready'], pending)).code, 1);
  const pendingHTTP = {
    ...pending,
    api: mockApi({ ...custom, html_url: 'http://notes.test/', https_certificate: null, https_enforced: false }),
  };
  assert.equal((await cli(['--require-configured'], pendingHTTP)).code, 0);
  assert.equal((await cli(['--require-ready'], pendingHTTP)).code, 1);
  for (const flag of ['--require-configured', '--require-ready']) {
    assert.equal((await cli([flag], { api: mockApi({ ...project, build_type: 'legacy' }) })).code, 1);
  }
});

test('CLI JSON is structured, central baseURL is authoritative, and no base override exists', async () => {
  const result = await cli(['--json', '--require-ready']);
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.output), evaluate());
  const mismatch = await cli(['--require-configured'], { readBaseURL: async () => 'https://writer.github.io/other/' });
  assert.equal(mismatch.code, 1);
  assert.match(mismatch.output, /html_url does not match/);
  assert.equal((await cli(['--baseURL', project.html_url])).code, 1);
});

test('CLI default diagnostics expose 404 and 403 but strict gates block', async () => {
  for (const status of [403, 404]) {
    const options = { api: () => { throw new GitHubApiError('controlled', status); } };
    assert.equal((await cli([], options)).code, 0);
    for (const flag of ['--require-configured', '--require-ready']) assert.equal((await cli([flag], options)).code, 1);
  }
});

test('CLI help, invalid arguments, malformed data, missing gh, and unexpected errors are explicit', async () => {
  const output = [];
  assert.equal(await main(['--help'], { stdout: text => output.push(text), api: () => assert.fail('help must not call API'), readBaseURL: () => assert.fail('help must not read config') }), 0);
  assert.match(output.join('\n'), /require-configured.*require-ready/);
  assert.match(output.join('\n'), /public\/main/);
  for (const args of [
    ['--require-ready', '--require-configured'], ['--unknown'], ['--repo'], ['--repo', 'bad'],
    ['--repo', 'writer/notes', '--repo', 'writer/notes']
  ]) assert.equal((await cli(args)).code, 1);
  const errors = [];
  assert.equal(await main([], { stderr: text => errors.push(text) }), 1);
  assert.match(errors.join('\n'), /--repo OWNER\/REPO is required/);
  for (const response of [{}, null, []]) assert.equal((await cli([], { api: () => response })).code, 1);
  const badApi = createGitHubApi({ env: {}, fileExists: () => false, execute: () => 'not JSON SECRET' });
  const bad = await cli(['--json'], { api: badApi });
  assert.equal(bad.code, 1);
  assert.equal(JSON.parse(bad.output).ready, false);
  assert(!bad.output.includes('SECRET'));
  for (const error of [new GitHubApiError('HTTP 500 failure', 500), new Error('GitHub CLI was not found')]) {
    const failure = await cli([], { api: () => { throw error; } });
    assert.equal(failure.code, 1);
    assert.match(failure.errors, /BLOCKED:/);
  }
  let apiCalls = 0;
  assert.equal((await cli([], { readBaseURL: async () => 'http://notes.test/', api: () => { apiCalls++; } })).code, 1);
  assert.equal(apiCalls, 0);
});
