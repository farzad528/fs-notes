import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { ROOT, HUGO_VERSION, assertNode, exists } from './lib.mjs';

export async function hugoBinary(root = ROOT) {
  assertNode();
  const candidates = process.env.HUGO_BIN ? [path.resolve(process.env.HUGO_BIN)] : [
    path.join(root, '.tools', 'hugo', 'hugo.exe'), path.join(root, '.tools', 'hugo.exe'),
    path.join(root, '.tools', 'hugo', 'hugo'), path.join(root, '.tools', 'hugo'),
    ...(root === ROOT ? [] : [path.join(ROOT, '.tools', 'hugo', 'hugo.exe'), path.join(ROOT, '.tools', 'hugo', 'hugo')]), 'hugo'
  ];
  for (const candidate of candidates) {
    if (candidate !== 'hugo' && !await exists(candidate)) continue;
    const result = spawnSync(candidate, ['version'], { encoding: 'utf8', cwd: root, windowsHide: true });
    if (result.error) {
      if (result.error.code === 'ENOENT') continue;
      throw result.error;
    }
    if (result.status !== 0) throw new Error(`Hugo version check failed: ${result.stderr}`);
    if (!new RegExp(`\\bv${HUGO_VERSION.replaceAll('.', '\\.')}\\b`).test(result.stdout)) {
      throw new Error(`Hugo ${HUGO_VERSION} required; found ${result.stdout.trim()}`);
    }
    return candidate;
  }
  throw new Error(`Hugo ${HUGO_VERSION} not found. Install in .tools/hugo, set HUGO_BIN, or add it to PATH.`);
}

export async function runHugo(args, { root = ROOT, quiet = false } = {}) {
  const result = spawnSync(await hugoBinary(root), args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Hugo failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  if (!quiet) process.stdout.write(result.stdout + result.stderr);
  return result;
}

export async function serveHugo(args, root = ROOT) {
  const child = spawn(await hugoBinary(root), args, { cwd: root, stdio: 'inherit', windowsHide: true });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  return child;
}
