// npm run dev: the server on http://localhost:8787 plus the extension build in watch mode.
import { spawn } from 'node:child_process';
import { ROOT } from './lib.mjs';

const procs = [
  spawn(process.execPath, ['--watch', '--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'server/src/main.ts'], { cwd: ROOT, stdio: 'inherit' }),
  spawn(process.execPath, ['tools/build.mjs', '--watch'], { cwd: ROOT, stdio: 'inherit' }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
