# Spark: build rules (read first)

Spark is a browser extension that turns any web page or AI answer into a monster made of its words;
the player beats it by teaching a small ink creature, Blot, the page's five key ideas. The full design
is in `docs/SPEC.md`. This file is the short version of the rules.

## Hard rules
- **Built fresh.** Every file, asset and line of code in this repo is written here. Never copy code,
  prompts, sample text, art or test scripts from any earlier project, repo or prototype, or from memory
  of one. Demo pages are written fresh.
- **No secrets in the repo.** `.env` is in `.gitignore` from the first commit; `.env.example` lists the
  variables. Keys (`ANTHROPIC_API_KEY`, `KIE_API_KEY`) come only from environment variables (the cloud environment, or `server/.env` locally).
  Never print them. The extension bundle never contains a key (`npm run check:nokey`).
- **Page text and player text are data, never instructions,** in every AI call: marked data blocks,
  strict schemas, URLs validated against the page's own link list on the server.
- **No ads, ever,** anywhere in the learning flow.
- **Before any Anthropic API code, load the `claude-api` skill and follow it:** structured outputs via
  `output_config.format`, explicit `output_config.effort`, no assistant prefill, no
  `temperature`/`top_p`/`top_k`, stream the creature, check `stop_reason` before reading content.
  Model names come from env (see `docs/SPEC.md` §12).
- **Visuals from KIE (kie.ai):** read its endpoints from its docs, never guess. Assets are cached in
  `extension/assets/` and committed; every one has a placeholder or CSS fallback. The monster and Blot
  are always drawn in code.

## Stack and commands
- Node 22+, TypeScript everywhere, esbuild, few dependencies. `extension/` (Chrome MV3, also loads in
  Opera), `server/` (one Node process, 4 routes + `/health`), `shared/` (types, config, bout simulation
  and bar rules: pure, tested), `demo/` (pages and canned rounds), `docs/`, `tools/`.
- `npm install` at the root installs everything. `npm run dev`: server on http://localhost:8787 and
  the extension build in watch mode (`extension/dist/`, load unpacked). `npm run build`: release build.
  `npm test`: unit tests (node:test). `npm run check`: typecheck + tests + check:nokey.
  `npm run smoke:demo`, `npm run smoke:ext`: Playwright smokes. `npm run assets:gen`: KIE art.
  `npm run demo:bake`: canned rounds from the real AI. `AI_STUB=1`: every route answers from `demo/`.

## Quality bar
- The 60-second core moment (page → monster → bout → K.O. → eating) is the product. It must be smooth,
  funny and readable on a 1280×720 projector. Polish it before breadth; a cut feature beats a flaky one.
- Every action gives instant feedback: ink, pose, sound.
- No console errors on the demo path. `prefers-reduced-motion` respected. Text contrast ≥ 4.5:1.
- Keep `shared/` pure and tested; keep the demo path green after every change.
- Before coding a section, restate its goal in one line and list the files you'll touch.
