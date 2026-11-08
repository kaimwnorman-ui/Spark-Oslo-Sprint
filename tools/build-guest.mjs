// npm run build:guest: the hosted guest game, a static folder (site/) for GitHub Pages or any static host.
// It is the game tab on its own: the demo pages, the duel links, Your Blot and the flashbacks, all offline.
// No extension files, no server, no key. A friend opens a challenge link here with nothing installed.
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const SITE = path.join(ROOT, 'site');
const EXT = path.join(ROOT, 'extension');

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });

await esbuild.build({
  entryPoints: { game: path.join(EXT, 'src/game/main.ts') },
  outdir: SITE,
  bundle: true,
  format: 'esm',
  // Phones and other browsers open duel links too.
  target: ['es2022', 'chrome100', 'safari15', 'firefox100'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
  define: { __DEV__: 'false', __GUEST_URL__: '""' },
});

cpSync(path.join(EXT, 'game.html'), path.join(SITE, 'game.html'));
for (const file of readdirSync(path.join(EXT, 'styles'))) cpSync(path.join(EXT, 'styles', file), path.join(SITE, file));
for (const [from, to] of [
  [path.join(EXT, 'icons'), path.join(SITE, 'icons')],
  [path.join(EXT, 'assets'), path.join(SITE, 'assets')],
  [path.join(ROOT, 'demo', 'pages'), path.join(SITE, 'demo', 'pages')],
  [path.join(ROOT, 'demo', 'rounds'), path.join(SITE, 'demo', 'rounds')],
]) {
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}

// The address of the site itself opens the game.
writeFileSync(
  path.join(SITE, 'index.html'),
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Spark</title><meta http-equiv="refresh" content="0; url=game.html"><link rel="canonical" href="game.html"></head><body><p><a href="game.html">Open Spark</a></p></body></html>\n',
);
// GitHub Pages: serve the files as they are.
writeFileSync(path.join(SITE, '.nojekyll'), '');

console.log('Built site/ (the hosted guest game).');
