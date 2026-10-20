import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL('../', import.meta.url));
const compiler = require.resolve('typescript/bin/tsc'),
  config = fileURLToPath(new URL('../packages/ssbp/tsconfig.json', import.meta.url));
const initial = spawnSync(process.execPath, [compiler, '-p', config], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (initial.status !== 0) process.exit(initial.status ?? 1);

const children = [
  spawn(process.execPath, [compiler, '-p', config, '--watch', '--preserveWatchOutput'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  }),
  spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host',
      '127.0.0.1',
    ],
    { cwd: new URL('../packages/viewer/', import.meta.url), stdio: 'inherit', windowsHide: true },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 0);
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
