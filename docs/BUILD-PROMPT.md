Build: Spark

First unzip the attached Spark-starter.zip. It holds the updated CLAUDE.md, docs/SPEC.md and BUILD-PROMPT.md: replace the repo's CLAUDE.md, docs/SPEC.md and docs/BUILD-PROMPT.md with them (spark/CLAUDE.md to the repo root, spark/docs/SPEC.md to docs/SPEC.md, spark/BUILD-PROMPT.md to docs/BUILD-PROMPT.md), then re-add your earlier notes about server/src/env.ts (the Anthropic client is created from that module), delete the spark/ folder, and commit. Keep server/src/env.ts, its tests and .env.example. Read CLAUDE.md and docs/SPEC.md fully before writing any code: CLAUDE.md for the rules, docs/SPEC.md for the product. The product is Spark (codename spark): use that name in the UI, manifest, page titles and package names.

What you're building: a browser extension that turns any web page or AI answer into a monster made of the page's own words. The player beats it by teaching a small ink creature, Blot, the page's five key ideas in their own words; Blot then fights the monster automatically with only what it was taught, eats it on a win and keeps a trait. The aim is a product a jury remembers: funny, beautiful, and genuinely good at making an idea stick.

Priority

One thing matters most: a flawless 60-second demo of the core moment, the page's words forming a monster, then the bout. Polish that path (animation, timing, feel) before any breadth. Reliability over features: a cut feature beats a flaky one. Every milestone ends with the demo path still green.

Equally important: the UI must be effortless. A judge who has never seen Spark should understand each screen in about two seconds and know exactly what to do next, with no explanation from us. Every screen has one obvious primary action, big and clearly labelled; plain words, no jargon; at most a few controls visible at once; clear visual hierarchy; generous spacing; large tap targets; instant visible feedback on every click and keystroke; nothing that looks clickable but isn't; no dead ends (every screen has a clear way forward and back). It should feel like a polished, playful game, not a form or a dashboard. Follow SPEC §4.1. When in doubt, remove a control rather than add an explanation.

Ground rules

Built fresh. Every file, asset and line of code is created here. Never copy or import code, images or data from any earlier project or repo (the event rules forbid pre-made work). Demo pages are written fresh.

Secrets: the Anthropic key is the environment variable SPARK_ANTHROPIC_API_KEY in this cloud environment; read it only through server/src/env.ts and create the Anthropic client from that module (resolveKeys gives apiKey and baseURL). The base URL is always https://api.anthropic.com: ANTHROPIC_BASE_URL in this environment points at Claude Code's own gateway and the SDK would otherwise pick it up. The KIE key may instead be injected by the environment as an Authorization: Bearer header on requests to api.kie.ai; so send the header from KIE_API_KEY when it is set, and when it is not, still try the KIE request without one and treat a 401 as no KIE key. Locally, server/.env via dotenv supplies the Anthropic key and KIE_API_KEY. If a key is missing, say so once and continue in offline mode with placeholder art. Never print env values, never commit .env. npm run check:nokey fails if the built extension contains sk-ant or the literal value of any *_API_KEY env var.

Model names from env with defaults: MODEL_EXTRACTOR, MODEL_EXAMINER = claude-opus-5-5; MODEL_CREATURE, MODEL_BARS = claude-haiku-5-5.

Offline mode is a product feature. Every AI route falls back to canned demo/ data when the API errors or times out, with one small "offline mode" line in the UI; AI_STUB=1 forces that path.

Before any Anthropic API code, load the claude-api skill and follow it (structured outputs via output_config.format, explicit effort, no prefill, no temperature, stream the creature, check stop_reason).

Visuals: generated art comes from KIE (kie.ai); read its endpoints and response shapes from its docs (fetch them), never guess. npm run assets:gen (idempotent) generates and commits webp assets under extension/assets/ so the demo runs offline. If KIE is slow or fails, placeholders or CSS-drawn visuals stand in and the demo path still passes; no milestone depends on generated art. The monster is always drawn in code from the page's words.

§0 of SPEC may be blank: build generically (product Spark, creature Blot) and keep the challenge hook in one spot, shared/config.ts exporting PRODUCT_NAME = 'Spark' and CHALLENGE_HOOK = '' (a tagline under the title when non-empty). Nothing else depends on the challenge.

Milestones (in order; each check must pass before moving on)

M0 Skeleton. Monorepo (extension/, server/, shared/, demo/, docs/, tools/), TypeScript, esbuild, shared/types.ts, shared/config.ts, server with /health and AI_STUB, MV3 manifest (activeTab, scripting, storage, contextMenus, fixed ID via key) whose button opens game.html, .gitignore with .env, .env.example, scripts dev, build, test, check (typecheck + tests + check:nokey), smoke:demo, smoke:ext, assets:gen, Playwright chromium installed locally. Verify each default model ID with one cheap 10-token call; a rejected ID → the closest current model from the skill, written into .env.example. Verify the KIE endpoint the same way with one minimal request.
Check: npm run check exits 0; curl localhost:8787/health is 200; assets:gen with no KIE key writes every placeholder.

M1 Vertical slice, offline. Write demo/pages/tides.html (~900 words, 6 links, nav and footer) and a canned demo/rounds/tides.json (five ideas, scripted creature replies, bar values, examiner results). game.html?demo=tides plays the whole loop with no server: page → monster from its words → five bars and moves → bell → exam → bout (shared/bout.ts) → eating and one trait → replay with five rows and one source link. Plain but complete.
Check: npm run smoke:demo (Playwright opens that URL, drives one scripted round, asserts the screen roots appear in that order, no console errors, a screenshot per screen into docs/shots/) passes.

M2 The core moment, polished. Word positions from the demo page's DOM, the lift-and-swirl into a silhouette with progressive reveal (name, silhouette, attacks), the monster drawn from the page's words on canvas, the bout with HP bars, hit sparks, big idea names, backfire and fizzle, ink-burst K.O.; demo speed 1.5×; prefers-reduced-motion crossfades. Generate the art with KIE: arena, title backdrop, Spark logo, ink and glow textures; placeholders for anything that fails. Add the Web Audio sound effects (SPEC §4) and screen shake on big hits. Tune until "turn into a monster" to K.O. is one continuous 60-second show with no dead air. Do a UI pass on every screen against SPEC §4.1.
Check: smoke:demo adds timing assertions: monster formed within 6 s; bout 30–45 s at demo speed; no frame over 100 ms in the two set pieces (requestAnimationFrame timestamps on window.__frames); the smoke passes with no KIE key and kie.ai blocked.

M3 Extension entry, real pages. Toolbar button, right-click "Turn into a monster" (selection or page), Alt+Shift+B. The content script collects readable text (max 6,000 words, nav/footer stripped), the link list (max 200) and up to 300 visible word positions (Range.getClientRects()), mounts the Shadow-DOM overlay with the lift animation, and hands off via chrome.storage.session to a new game.html tab. Selected text wins over page text.
Check: npm run smoke:ext (Playwright persistent context with the unpacked extension, demo/pages/ served locally, opens tides.html, triggers the action, asserts the game tab's #monster is built from ≥ 100 of that page's words, AI_STUB=1) passes.

M4 Server, extractor, examiner, grounding. /extract (schema §12.1, URL validation against the link list, sealed lesson with a 2-hour in-memory TTL, cache by text hash), /examine (§12.3, sees only player messages and taps). Measure p50 of 5 calls per role on tides.html; if the extractor's p50 exceeds 12 s or the examiner's 20 s, set that role to the Sonnet model the claude-api skill names, in .env.example.
Check: npm test has validate, seal and bout green; npm run test:ai runs the three grounding cases (empty transcript → 0/5; unrelated sentences → 0/5; two ideas taught well → ≥ 60 on those, ≤ 15 on the rest) and passes.

M5 Teaching, real. /creature streamed (Haiku, ≤ 60 words, the page's language), /bars debounced 800 ms with contradictsMisread, caps and paste rule in shared/bars.ts, misreadings on 2 of 5 ideas, Check it ✓/✗, questions one at a time, "I don't know" → source card in a new tab with pause on visibilitychange and resume, timer 2:00/0:45, two-press bell, 400-char limit.
Check: bars.test.ts green (caps per move combination, paste detection, limit); smoke:demo on AI_STUB=1 drives all five moves, the misreading reveal, "I don't know", pause and resume; one real round reaches /examine with bars moving within 1 s of each sentence.

M6 Victory, loss, replay, persistence. Eating set piece ≤ 4 s, trait = highest idea, look by score tier, traits in chrome.storage.local and worn (last 6); loss path with rematch on the weakest idea; replay rows (said, believed, stronger), weakest idea with its one source link, Play again, Home.
Check: smoke:demo asserts the trait after a scripted win, the rematch button after a scripted loss, five replay rows, one <a> whose href is in the page's link list, and the previous trait worn on a second run.

M7 Reliability. Automatic offline fallback when the API fails mid-round (the page's canned round if one exists, else say so and offer demo mode); the stage round demo/rounds/stage.json, four ideas pre-taught and the fifth empty; npm run demo:bake bakes demo/rounds/*.json from one real run each for tides, pvalue, solar, sove, ai-answer (pages written first, fresh text); check:nokey on the release build.
Check: npm run check && npm run smoke:demo && npm run smoke:ext green; AI_STUB=1 and a network-blocked run (Playwright route abort on the server URL) both complete a round; three full rounds on real external pages (a news article, a docs page, a selected chat answer) complete; a final UI review of the docs/shots/ screenshots against SPEC §4.1 (one obvious primary action per screen, nothing confusing, nothing under 16 px), with anything that fails fixed.

Start with M0.
