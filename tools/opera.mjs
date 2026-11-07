// Opera with WebAI, for the on-device checks (npm run eval:device, npm run smoke:opera).
// They need a real Opera One with "Enable Web AI API" on and a model enabled on chrome://webai/,
// in a profile of its own. Without one they say so and skip (exit 0), so CI and Chromium stay green.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const OPERA = process.env.OPERA_PATH || '/Applications/Opera.app/Contents/MacOS/Opera';
export const OPERA_PROFILE = process.env.OPERA_PROFILE || join(homedir(), 'opera-webai-dev');

/** Why the Opera checks can't run here, or null when they can. */
export function operaMissing() {
  if (!existsSync(OPERA)) return `Opera not found at ${OPERA} (set OPERA_PATH)`;
  if (!existsSync(OPERA_PROFILE)) return `no Opera profile at ${OPERA_PROFILE} (set OPERA_PROFILE to a profile with WebAI switched on)`;
  return null;
}

/**
 * Opera with the unpacked extension loaded, in the WebAI profile. The profile reopens its last
 * session's tabs at launch, so every run used to add one more tab to the next (dozens by the end of
 * a night): close whatever it restored before the run opens its own page.
 */
export async function launchOpera(chromium, extDir) {
  const context = await chromium.launchPersistentContext(OPERA_PROFILE, {
    executablePath: OPERA,
    headless: false,
    viewport: { width: 1280, height: 720 },
    // Opera's AI service needs its components and background networking.
    ignoreDefaultArgs: ['--disable-component-update', '--disable-background-networking', '--disable-default-apps', '--disable-extensions'],
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  for (const page of context.pages()) await page.close().catch(() => {});
  return context;
}

/** The page text the game sees for a demo page (the same cleaning as the smokes). */
export function textOf(html) {
  return html
    .replace(/<(script|style|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
