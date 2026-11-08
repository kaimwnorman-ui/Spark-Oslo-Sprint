// npm run dev: the server on http://localhost:8787 plus the extension build in watch mode.
import { spawn } from 'node:child_process';
import { ROOT } from './lib.mjs';

const procs = [
  // DEV_ORIGINS=1: also answer demo pages opened from http://localhost (game.html?demo=tides&live=1).
  spawn(process.execPath, ['--watch', '--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'server/src/main.ts'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, DEV_ORIGINS: '1' } }),
  spawn(process.execPath, ['tools/build.mjs', '--watch'], { cwd: ROOT, stdio: 'inherit' }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
