// npm run assets:gen: Spark's generated art (SPEC §4) and the toolbar icons.
//
//   npm run assets:gen                 generate missing art with KIE, write every placeholder
//   npm run assets:gen -- --offline    placeholders only (no network)
//   npm run assets:gen -- --only logo  (re)generate one asset
//   npm run assets:gen -- --force      regenerate everything
//
// Idempotent: art that already exists as webp is kept. Every asset also gets a placeholder
// SVG drawn here in code, and extension/assets/assets.json says which file the game uses.
// KIE endpoints and response shapes come from docs.kie.ai (market quickstart, get task
// detail, nano-banana, gpt-image-2-text-to-image). Errors arrive as HTTP 200 with a `code`.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, ensureEnvProxy } from './lib.mjs';

await ensureEnvProxy();

const OUT = path.join(ROOT, 'extension', 'assets');
const ICONS = path.join(ROOT, 'extension', 'icons');
const KIE = 'https://api.kie.ai';
const args = process.argv.slice(2);
const offline = args.includes('--offline') || process.env.KIE_OFFLINE === '1';
const force = args.includes('--force');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

// Six colours (SPEC §4), kept in sync with extension/styles/game.css.
const C = { paper: '#f7f1e3', ink: '#1d1a2f', glow: '#5b4bff', accent: '#ff7a1a', warning: '#c8102e', success: '#1f7a4d' };

const NO_TEXT = 'No text, no letters, no words, no watermark, no signature.';
const ASSETS = [
  {
    name: 'arena',
    size: [1600, 900],
    model: 'google/nano-banana',
    input: { aspect_ratio: '16:9', output_format: 'png' },
    prompt: `A single blank notebook page seen from directly above, filling the entire frame edge to edge: warm off-white paper with faint blue ruled lines and a thin red margin line near the left edge. A desk lamp out of frame at the top left casts a soft warm glow across the page; the corners fall into a gentle, light vignette but stay clearly paper. A few tiny ink splatters near the corners. Bright, calm, cosy, lots of clean space for a game to be drawn on top. Painterly digital illustration. ${NO_TEXT}`,
    placeholder: arenaSvg,
  },
  {
    name: 'title',
    size: [1600, 900],
    model: 'google/nano-banana',
    input: { aspect_ratio: '16:9', output_format: 'png' },
    prompt: `Cream paper background with dramatic splashes and swirls of glossy black ink rising from the bottom edge, a few streaks of glowing violet ink and tiny orange sparks drifting upward like fireflies. Playful, energetic, bright. The centre and upper half stay mostly clean paper for a title. Flat painterly illustration. ${NO_TEXT}`,
    placeholder: titleSvg,
  },
  {
    name: 'logo',
    size: [512, 512],
    model: 'gpt-image-2-text-to-image',
    input: { aspect_ratio: '1:1', resolution: '1K', background: 'transparent' },
    prompt: 'A logo mark: one bold question mark painted with a single thick, glossy black ink brush stroke, with a small ink drip under its curve. The dot of the question mark is a bright orange-and-yellow spark with short rays. Centred, crisp edges, flat illustration, no other elements, transparent background. No letters other than the question mark, no words.',
    placeholder: logoSvg,
  },
  {
    name: 'ink',
    size: [512, 512],
    model: 'google/nano-banana',
    input: { aspect_ratio: '1:1', output_format: 'png' },
    prompt: `Seamless tileable texture of black ink wash on paper: soft feathered blots, fine splatter and flowing brush marks, high contrast black on off-white. Even coverage, no focal point. ${NO_TEXT}`,
    placeholder: inkSvg,
  },
  {
    name: 'glow',
    size: [512, 512],
    model: 'google/nano-banana',
    input: { aspect_ratio: '1:1', output_format: 'png' },
    prompt: `Soft glowing violet and blue ink particles and wisps floating on a pure black background, like luminous ink drifting in water, a few tiny orange sparks. Even coverage, good for blending as a light overlay. ${NO_TEXT}`,
    placeholder: glowSvg,
  },
];

// ---------------------------------------------------------------- placeholders (drawn in code)

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
}

function arenaSvg() {
  const lines = Array.from({ length: 26 }, (_, i) => `<line x1="0" x2="1600" y1="${120 + i * 30}" y2="${120 + i * 30}" stroke="#9db7d8" stroke-opacity=".5" stroke-width="2"/>`).join('');
  return svg(1600, 900, `
    <defs><radialGradient id="lamp" cx="30%" cy="20%" r="85%"><stop offset="0" stop-color="#fffaf0"/><stop offset=".55" stop-color="${C.paper}"/><stop offset="1" stop-color="#cbbd9a"/></radialGradient></defs>
    <rect width="1600" height="900" fill="url(#lamp)"/>${lines}
    <line x1="170" x2="170" y1="0" y2="900" stroke="#e07a7a" stroke-width="3" stroke-opacity=".7"/>
    <circle cx="1480" cy="90" r="14" fill="${C.ink}" fill-opacity=".5"/><circle cx="1510" cy="120" r="5" fill="${C.ink}" fill-opacity=".4"/>`);
}

function titleSvg() {
  const blobs = [[120, 860, 260], [420, 930, 220], [800, 960, 260], [1200, 920, 240], [1500, 860, 230]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.ink}"/>`).join('');
  const sparks = [[300, 600], [520, 520], [980, 560], [1250, 480], [1400, 640]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${C.accent}"/>`).join('');
  return svg(1600, 900, `<rect width="1600" height="900" fill="${C.paper}"/>${blobs}
    <path d="M0 760 C300 640 500 820 800 700 S1300 640 1600 740" stroke="${C.glow}" stroke-width="18" fill="none" stroke-linecap="round" opacity=".7"/>${sparks}`);
}

function logoSvg() {
  return svg(512, 512, `
    <path d="M176 176 C176 104 336 96 336 184 C336 248 256 252 256 312 L256 336" fill="none" stroke="${C.ink}" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M256 340 C252 360 262 372 258 384" stroke="${C.ink}" stroke-width="12" stroke-linecap="round" fill="none"/>
    <g transform="translate(256 430)"><circle r="30" fill="${C.accent}"/><circle r="15" fill="#ffd34d"/>
    ${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="0" y1="-40" x2="0" y2="-58" stroke="${C.accent}" stroke-width="9" stroke-linecap="round" transform="rotate(${a})"/>`).join('')}</g>`);
}

function inkSvg() {
  const dots = Array.from({ length: 40 }, (_, i) => {
    const x = (i * 97) % 512, y = (i * 211) % 512, r = 6 + ((i * 37) % 30);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.ink}" fill-opacity="${0.25 + ((i * 13) % 50) / 100}"/>`;
  }).join('');
  return svg(512, 512, `<rect width="512" height="512" fill="${C.paper}"/>${dots}`);
}

function glowSvg() {
  return svg(512, 512, `<defs><radialGradient id="g"><stop offset="0" stop-color="${C.glow}" stop-opacity=".9"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <rect width="512" height="512" fill="#000"/><circle cx="256" cy="256" r="240" fill="url(#g)"/><circle cx="330" cy="200" r="6" fill="${C.accent}"/>`);
}

function iconSvg(size) {
  // Toolbar icon: an ink blot with a drip holding a paper-coloured "?" whose dot is a spark.
  return svg(size, size, `<g transform="scale(${size / 128})">
    <path d="M64 8 C100 8 120 30 120 60 C120 92 100 112 76 114 L76 124 C76 128 70 128 70 124 L70 114 C40 114 8 96 8 62 C8 30 30 8 64 8 Z" fill="${C.ink}"/>
    <path d="M46 46 C46 26 82 24 82 48 C82 64 64 64 64 78" fill="none" stroke="${C.paper}" stroke-width="13" stroke-linecap="round"/>
    <circle cx="64" cy="96" r="10" fill="${C.accent}"/></g>`);
}

// ---------------------------------------------------------------- KIE (docs.kie.ai)

function kieHeaders() {
  const headers = { 'content-type': 'application/json' };
  // In the cloud the network proxy adds the key; locally it comes from KIE_API_KEY.
  if (process.env.KIE_API_KEY) headers.authorization = `Bearer ${process.env.KIE_API_KEY}`;
  return headers;
}

class NoKieKey extends Error {}

async function kie(method, pathAndQuery, body) {
  const res = await fetch(`${KIE}${pathAndQuery}`, {
    method,
    headers: kieHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  const code = json.code ?? res.status;
  if (code === 401 || res.status === 401) throw new NoKieKey('KIE says no key (401).');
  if (code !== 200) throw new Error(`KIE ${pathAndQuery} answered code ${code}: ${json.msg ?? res.statusText}`);
  return json.data;
}

async function generate(asset) {
  const { taskId } = await kie('POST', '/api/v1/jobs/createTask', {
    model: asset.model,
    input: { prompt: asset.prompt, ...asset.input },
  });
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const data = await kie('GET', `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
    if (data.state === 'success') {
      const urls = JSON.parse(data.resultJson).resultUrls ?? [];
      if (!urls[0]) throw new Error('KIE finished without a result URL.');
      return { url: urls[0], credits: data.creditsConsumed };
    }
    if (data.state === 'fail') throw new Error(`KIE generation failed (${data.failCode}): ${data.failMsg}`);
  }
  throw new Error('KIE took longer than 5 minutes.');
}

async function download(url) {
  const tryFetch = async (u) => {
    const res = await fetch(u, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };
  try {
    return await tryFetch(url);
  } catch {
    // Fall back to KIE's temporary download link (docs: common-api/download-url).
    const link = await kie('POST', '/api/v1/common/download-url', { url });
    return tryFetch(link);
  }
}

// ---------------------------------------------------------------- Chromium (webp + png)

let browserPromise = null;
async function page() {
  if (!browserPromise) {
    browserPromise = import('playwright').then(({ chromium }) => chromium.launch());
  }
  const browser = await browserPromise;
  return browser.newPage();
}

/** Resize and re-encode any image Chromium can decode to webp (alpha kept). */
async function toWebp(bytes, mime, [w, h]) {
  const p = await page();
  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
  const out = await p.evaluate(async ({ dataUrl, w, h }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // Cover-crop to the target ratio.
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale, sh = h / scale;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
    return canvas.toDataURL('image/webp', 0.86);
  }, { dataUrl, w, h });
  await p.close();
  return Buffer.from(out.split(',')[1], 'base64');
}

async function svgToPng(svgText, size) {
  const p = await page();
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svgText}</body></html>`);
  const png = await p.locator('svg').screenshot({ omitBackground: true });
  await p.close();
  return png;
}

function sniffMime(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return 'image/png';
}

// ---------------------------------------------------------------- main

mkdirSync(OUT, { recursive: true });
mkdirSync(ICONS, { recursive: true });

const manifestPath = path.join(OUT, 'assets.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
let kieUsable = !offline;
let saidNoKey = false;

for (const asset of ASSETS) {
  // 1. The placeholder is always written, so every asset has a fallback.
  const placeholder = `${asset.name}.svg`;
  writeFileSync(path.join(OUT, placeholder), asset.placeholder());
  const webp = `${asset.name}.webp`;
  const haveArt = existsSync(path.join(OUT, webp));
  const wanted = only ? only === asset.name : force || !haveArt;

  // 2. Real art from KIE when wanted and reachable.
  if (wanted && kieUsable) {
    try {
      process.stdout.write(`${asset.name}: generating with KIE (${asset.model})... `);
      const { url, credits } = await generate(asset);
      const bytes = await download(url);
      writeFileSync(path.join(OUT, webp), await toWebp(bytes, sniffMime(bytes), asset.size));
      console.log(`done (${credits ?? '?'} credits).`);
    } catch (err) {
      if (err instanceof NoKieKey) {
        kieUsable = false;
        if (!saidNoKey) console.log('\nNo KIE key: using placeholders.');
        saidNoKey = true;
      } else {
        console.log(`failed: ${err.message}. Keeping the placeholder.`);
      }
    }
  }
  manifest[asset.name] = existsSync(path.join(OUT, webp)) ? webp : placeholder;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
if (offline) console.log('Offline: wrote every placeholder.');

// Toolbar icons, drawn in code (needs Chromium; skipped if it is not installed).
try {
  for (const size of [16, 32, 48, 128]) {
    writeFileSync(path.join(ICONS, `icon${size}.png`), await svgToPng(iconSvg(size), size));
  }
  console.log('Icons: icon16/32/48/128.png');
} catch (err) {
  console.log(`Icons skipped (${err.message.split('\n')[0]}).`);
}

if (browserPromise) await (await browserPromise).close();
console.log(`assets.json: ${Object.entries(manifest).map(([k, v]) => `${k}=${v}`).join(', ')}`);
