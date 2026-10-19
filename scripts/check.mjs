import { spawnSync } from 'node:child_process';
import { ROOT } from './lib.mjs';
import { build } from './build.mjs';

try {
  await build();
  const result = spawnSync(process.execPath, ['--test', 'tests/*.test.mjs'], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Regression tests failed (${result.status}).`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
