import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parse } from 'yaml';

const readWorkflow = async name => parse(await fs.readFile(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
const deploy = await readWorkflow('deploy');
const validate = await readWorkflow('validate');
const setup = parse(await fs.readFile(new URL('../.github/actions/setup-tools/action.yml', import.meta.url), 'utf8'));
const actions = workflow => Object.values(workflow.jobs).flatMap(job => job.steps ?? []);
const effectivePermissions = (workflow, job) => job.permissions ?? workflow.permissions;

test('deployment triggers only on main pushes or manually gated main runs', () => {
  assert.deepEqual(Object.keys(deploy.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(deploy.on.push, { branches: ['main'] });
  assert.equal(deploy.on.workflow_dispatch, null);
  assert.equal(deploy.jobs.build.if, "github.ref == 'refs/heads/main' && vars.SITE_LAUNCH_APPROVED == 'true'");
  assert.deepEqual(deploy.permissions, { contents: 'read' });
  assert.equal(deploy.concurrency['cancel-in-progress'], false);
});

test('build can read Pages configuration but cannot publish or mint OIDC credentials', () => {
  const build = deploy.jobs.build;
  assert.deepEqual(effectivePermissions(deploy, build), { contents: 'read', pages: 'read' });
  assert.equal(build.environment, undefined);
  const preflight = build.steps.find(step => step.run?.includes('pages-preflight'));
  assert(preflight);
  assert.equal(preflight.run, 'npm run pages-preflight -- --repo "$GITHUB_REPOSITORY" --require-configured');
  assert.deepEqual(preflight.env, { GH_TOKEN: '${{ github.token }}' });
  const checkIndex = build.steps.findIndex(step => step.run === 'npm run check');
  const uploadIndex = build.steps.findIndex(step => step.uses?.startsWith('actions/upload-pages-artifact@'));
  assert(build.steps.indexOf(preflight) < checkIndex);
  assert(checkIndex < uploadIndex);
  assert.deepEqual(build.steps[uploadIndex].with, { path: 'public', 'include-hidden-files': false });
});

test('only the dependent deployment job has Pages write, OIDC, and the protected environment', () => {
  const publishing = deploy.jobs.deploy;
  assert.equal(publishing.needs, 'build');
  assert.equal(publishing.if, undefined);
  assert.deepEqual(publishing.permissions, { pages: 'write', 'id-token': 'write' });
  assert.deepEqual(publishing.environment, { name: 'github-pages', url: '${{ steps.deployment.outputs.page_url }}' });
  assert.deepEqual(publishing.outputs, { page_url: '${{ steps.deployment.outputs.page_url }}' });
  assert.equal(publishing.steps.length, 1);
  assert.match(publishing.steps[0].uses, /^actions\/deploy-pages@[a-f0-9]{40}$/);
  assert.equal(publishing.steps[0].id, 'deployment');
  for (const [name, job] of Object.entries(deploy.jobs)) {
    if (name === 'deploy') continue;
    assert.equal(effectivePermissions(deploy, job)['id-token'], undefined);
    assert.notEqual(effectivePermissions(deploy, job).pages, 'write');
    assert.equal(job.environment, undefined);
    assert(!job.if?.includes('always()'));
  }
});

test('post-deploy checks enforce readiness and compare the deployed URL to central configuration', () => {
  const smoke = deploy.jobs.smoke;
  assert.equal(smoke.needs, 'deploy');
  assert.equal(smoke.if, undefined);
  assert.deepEqual(smoke.permissions, { contents: 'read', pages: 'read' });
  assert(smoke.steps.some(step => step.uses === './.github/actions/setup-tools'));
  const readiness = smoke.steps.find(step => step.run?.includes('pages-preflight'));
  assert(readiness);
  assert.equal(readiness.run, 'npm run pages-preflight -- --repo "$GITHUB_REPOSITORY" --require-ready');
  assert.deepEqual(readiness.env, { GH_TOKEN: '${{ github.token }}' });
  const live = smoke.steps.find(step => step.run?.includes('npm run smoke'));
  assert(live);
  assert.deepEqual(live.env, { DEPLOYED_URL: '${{ needs.deploy.outputs.page_url }}' });
  const commands = live.run.trim().split('\n');
  assert.deepEqual(commands, [
    'base_url="$(node scripts/site.mjs base-url)"',
    'test "${DEPLOYED_URL%/}/" = "$base_url"',
    'npm run smoke -- "$base_url"'
  ]);
  assert(smoke.steps.indexOf(readiness) < smoke.steps.indexOf(live));
});

test('pull request validation stays read-only and cannot invoke deployment', () => {
  assert.deepEqual(Object.keys(validate.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  assert.deepEqual(validate.permissions, { contents: 'read' });
  assert.equal(validate.on.pull_request, null);
  assert.deepEqual(validate.on.push, { branches: ['main'] });
  for (const job of Object.values(validate.jobs)) {
    assert.deepEqual(effectivePermissions(validate, job), { contents: 'read' });
    assert.equal(job.environment, undefined);
    assert.equal(job.uses, undefined);
  }
  assert(actions(validate).some(step => step.run === 'npm run check'));
  assert(!actions(validate).some(step => /deploy-pages|upload-pages-artifact/.test(step.uses ?? '')));
});

test('workflow actions are immutable and checkout never persists credentials', () => {
  const steps = [...actions(deploy), ...actions(validate), ...setup.runs.steps];
  for (const step of steps) {
    if (!step.uses) continue;
    if (step.uses.startsWith('./')) {
      assert.equal(step.uses, './.github/actions/setup-tools');
    } else {
      assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
    }
    if (step.uses.startsWith('actions/checkout@')) assert.equal(step.with?.['persist-credentials'], false);
  }
  for (const step of [...actions(deploy), ...actions(validate)]) {
    assert(!JSON.stringify(step.env ?? {}).includes('secrets.'));
  }
});
