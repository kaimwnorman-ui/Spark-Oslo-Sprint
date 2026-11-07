// Builds the unpacked extension into extension/dist/ (load it with "Load unpacked").
//   node tools/build.mjs            dev build (inline source maps)
//   node tools/build.mjs --watch    dev build, rebuild on change
//   node tools/build.mjs --release  minified release build
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, watch, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DIST, ROOT } from './lib.mjs';

const release = process.argv.includes('--release');
const watchMode = process.argv.includes('--watch');
const EXT = path.join(ROOT, 'extension');

function copyStatic() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
  cpSync(path.join(EXT, 'game.html'), path.join(DIST, 'game.html'));
  for (const file of readdirSync(path.join(EXT, 'styles'))) {
    cpSync(path.join(EXT, 'styles', file), path.join(DIST, file));
  }
  for (const [from, to] of [
    [path.join(EXT, 'icons'), path.join(DIST, 'icons')],
    [path.join(EXT, 'assets'), path.join(DIST, 'assets')],
    [path.join(ROOT, 'demo', 'pages'), path.join(DIST, 'demo', 'pages')],
    [path.join(ROOT, 'demo', 'rounds'), path.join(DIST, 'demo', 'rounds')],
  ]) {
    if (existsSync(from)) cpSync(from, to, { recursive: true });
  }
}

const common = {
  bundle: true,
  target: 'chrome116',
  minify: release,
  sourcemap: release ? false : 'inline',
  legalComments: 'none',
  logLevel: 'warning',
  define: { __DEV__: String(!release) },
};

const builds = [
  // ES modules: the service worker and the game tab.
  {
    ...common,
    entryPoints: {
      background: path.join(EXT, 'src/background.ts'),
      game: path.join(EXT, 'src/game/main.ts'),
    },
    outdir: DIST,
    format: 'esm',
  },
];
const contentEntry = path.join(EXT, 'src/content/main.ts');
if (existsSync(contentEntry)) {
  // Content scripts are injected as classic scripts.
  builds.push({ ...common, entryPoints: { content: contentEntry }, outdir: DIST, format: 'iife' });
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
copyStatic();

if (watchMode) {
  for (const options of builds) {
    const ctx = await esbuild.context({
      ...options,
      plugins: [{ name: 'static', setup: (b) => b.onEnd(() => copyStatic()) }],
    });
    await ctx.watch();
  }
  for (const dir of ['extension/styles', 'extension/assets', 'extension/game.html', 'extension/manifest.json', 'demo']) {
    const full = path.join(ROOT, dir);
    if (existsSync(full)) watch(full, { recursive: true }, () => copyStatic());
  }
  console.log('Watching: extension/dist/ rebuilds on change.');
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
  console.log(`Built extension/dist/ (${release ? 'release' : 'dev'}).`);
}
