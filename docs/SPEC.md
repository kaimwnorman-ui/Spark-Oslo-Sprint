# Spark: product spec

Oslo Sprint 2026. Team Spark. The product is called **Spark**; the codename in code is `spark`.
Everything in this repo is written during the event.

Markers: **DECIDED** (settled), **DEFAULT** (build it this way). Where this spec is silent, pick the
simplest thing that keeps the demo working and looks good on a projector.

---

## 0. Challenge hook

- **Main challenge (from kickoff):** ______________________________________________
- **Tagline under the title (`CHALLENGE_HOOK` in `shared/config.ts`):** ________________________

If these are blank, build generically with `CHALLENGE_HOOK = ''`. Nothing else depends on them.

## 1. What Spark is (DECIDED)

> **AI answers end curiosity at the answer. Spark starts it there.**

Spark is a browser extension (Chrome MV3, also loads in Opera). Select an AI answer, or press the
Spark button on any page, and the page's own words lift off the screen and swirl into a **monster**.
The player beats it by **teaching** a small ink creature, Blot, the page's five key ideas in their own
words. Blot then fights the monster automatically, using only what it was taught. When the player
can't explain *why*, Blot points to **one real source page** from the page's own links. Win, and Blot
**eats the monster** and **inherits a trait** from it that it wears from then on. The replay shows what
you said, what Blot believed, and what would have been stronger, with one page to go deeper.

The player leaves having actually understood the page, and goes back out to the web with a question.

## 2. The 60-second moment that wins (DECIDED; the top priority)

1. The player clicks Spark on a real page. The page's words **lift off and swirl** into a silhouette;
   the monster's name, body and five attacks reveal one by one (≤ 6 s).
2. Teaching: Blot asks "but WHY?", a bar fills with ink, Blot's face changes.
3. The bout: HP bars, the idea names slam onto the screen on each hit, a funny backfire for a
   misreading, a fizzle for an idea never taught, an ink-burst K.O.
4. Blot eats the monster (its letters stream into Blot's mouth like noodles) and grows a trait.

This path must be **flawless**: no dead air, no stutter, no console errors, readable from the back of
a room at 1280×720. Polish it before adding anything else. A cut feature beats a flaky one.

## 3. The core loop (DECIDED)

```
ENTER                      IN THE GAME                                            EXIT
selected text or page ──▶ 1 The page becomes a MONSTER made of its words.
(toolbar button,             Its 5 attacks = the 5 ideas worth knowing.
 right-click, Alt+Shift+B) 2 TEACH Blot (2:00): tap and type moves.
                             Blot asks "but WHY?". "I don't know" ──▶ one SOURCE CARD
                           3 BOUT (automatic, 30–45 s): Blot vs the monster.
                           4 WIN: Blot EATS the monster (letters stream in)
                             and INHERITS one trait (visible, named, scored).
                           5 REPLAY: 5 rows · weakest idea ──▶ one "go deeper" page
```

Exit rules: at most one source card per idea, only after a gap is exposed; the replay offers one page.

## 4. World and look (DEFAULT: Ink Beasts)

- **World:** ink and paper. Words lift off the page and swirl into an **Ink Beast**. The arena is a
  blank notebook page under a desk lamp.
- **Mood:** bright and funny; ink **glows** for the bout and the victory (reads on a projector).
- **Drawn in code:** the monster and Blot are always drawn in code (canvas 2D and SVG). Monsters are
  5 body silhouettes (serpent, golem, bird, spider, crab) filled with the page's real words along flow
  lines, so every page gets its own monster. Blot is a blob path with 2 eyes, 1 mouth and a drip,
  deformed per pose, so its 8 poses (idle, listening, confused, excited, attacking, hurt, eating,
  proud) stay consistent, and traits attach as extra paths.
- **Generated art (KIE, kie.ai):** the arena (notebook under a desk lamp), the title backdrop, the
  Spark logo (a question mark whose dot is a spark), and ink and glow textures. Generated once,
  cached as webp in `extension/assets/`, committed. Every asset has a CSS or placeholder fallback.
- **Design rules:** 6 colours as CSS variables (paper, ink, ink-glow, accent, warning, success); one
  display face and one text face; every UI animation ≤ 600 ms except the three set pieces
  (words-to-monster ≤ 6 s, eating ≤ 4 s, K.O. ≤ 2 s); `prefers-reduced-motion` swaps set pieces for
  crossfades; text contrast ≥ 4.5:1; nothing smaller than 16 px on the game screens.
- **Sound:** short effects synthesised with Web Audio in code (ink fill, hit, fizzle, gulp, bell), no
  audio files. One mute toggle, remembered.
- **Don't** make Blot round, pink and puffy (a famous game's mascot eats enemies and gains their
  abilities; Blot is an ink blot with a drip, not a ball).

## 4.1 Ease of use (DECIDED; as important as the 60-second demo)

The jury must feel, within seconds, "this is easy, fun and clever". A first-time player needs no
explanation from us.

- **Two-second rule:** every screen is understood at a glance; the next step is obvious.
- **One primary action per screen:** big, high-contrast, clearly labelled with a verb ("Turn into a
  monster", "Teach Blot", "Ring the bell", "Play again"). Secondary actions are visibly quieter.
- **Few controls at once:** show only what the current step needs; reveal the rest when it's needed.
- **Plain words:** short labels, no jargon, no internal terms (no "extractor", "examiner", "seed").
- **Clear hierarchy and space:** one focal point per screen, generous spacing, large tap targets
  (≥ 44 px), nothing smaller than 16 px.
- **Instant feedback:** every click and keystroke visibly responds within 100 ms; loading states are
  playful (ink swirling), never a blank screen or a bare spinner; errors say what to do next.
- **No dead ends:** every screen has a clear way forward and back (Home, Play again, Rematch).
- **Learn by doing:** the first-round hint (§7.8) and Blot's own lines teach the controls; no manuals,
  no walls of tooltips, no multi-step tutorial.
- **Keyboard friendly:** Enter sends, Esc closes, focus is visible.
- **Rule of thumb:** when in doubt, remove a control rather than add an explanation.

## 5. Blot, the creature (DEFAULT)

An ink blot from somewhere that knows **nothing** about our world. Curious, literal, funny, devoted to
its coach. It takes words literally, mixes up similar ideas, and asks "but WHY?". It may only use what
the player taught it; anything else is a guess, and the examiner scores guesses as zero. Its
misreadings are the comedy; correcting them is the learning. It speaks the page's language.

## 6. Monsters (DECIDED: the monster is the page's topic)

One monster per round, from the page: name from the topic ("The Tide Serpent"), body from one of the
5 silhouettes (chosen by the extractor), texture from the page's real words (the 120 most distinctive
by frequency, longest first). Its five attacks are the five ideas, each labelled with the idea's name.
**Trick attack:** for ideas with a plausible misreading, the monster has a trick version of the attack
that uses the wrong meaning; a Blot that holds that misreading falls for it (backfire, §8).

## 7. Teaching (DECIDED design; numbers DEFAULT, tune only with the tests in §14)

Five **bars**, one per idea, start empty with names only. The player picks a bar, then uses a move.

| Move | Input | Teaches | Cap on that bar |
|---|---|---|---|
| **Say it** | type a short definition (≥ 6 words) | the bare idea | 30 |
| **Give an example** | type an example (≥ 8 words) | how it looks in use | 100 |
| **Tell when** | tap 1 of 3 situations (one right) | when it matters | 40 |
| **Check it** | Blot explains it back; tap ✓ or ✗ | catches hidden misreadings | 40 |
| **Answer "why?"** | type a reason when Blot asks (≥ 8 words) | the reason behind it | 100 |

Rules (enforced in `shared/bars.ts`, pure and unit-tested; the AI only supplies raw scores):
1. **Bar value = min(cap, AI score).** Cap = 30 if only Say it was used on that idea; 40 if any tap was
   used and no typed example or why; 100 once a typed example or why answer exists. "Solid" = 40,
   "Signature" = 75+.
2. **Pasted text is capped.** If ≥ 50% of a message's 6-word windows occur verbatim in the page text
   (or the selected answer), the message counts as Say it (cap 30) and Blot says "those are the
   page's words; tell me in yours." Computed in the extension before sending.
3. **Hidden misreadings.** The extractor gives each idea a plausible `misread`. For exactly 2 of the 5
   ideas (deterministic from the round seed), Blot adopts the misread as its belief after the player's
   first Say it on that idea, unless the live-bars call says the message already contradicts it. It
   says "Got it!" either way. **Check it** reveals the belief in Blot's words: ✗ makes it ask "then
   what is it?" and the next typed answer (confirmed by the live-bars call) fixes the belief; ✓ on a
   wrong belief leaves it wrong (seen in the replay). A wrong belief deals no damage in the bout until
   fixed.
4. **Blot's questions.** At most one open question at a time, never two within 6 s, each answerable
   by a tap or one sentence: "Is X the same as Y?" (tap), "When would I use X?" (3 taps), "But WHY?"
   (type; after the first Say it on an idea with ≥ 2 key points). Each question has an **"I don't
   know"** button. On a "why", it reveals that idea's **source card** (if the extractor found a URL);
   the card opens in a new tab, the round pauses while the game tab is hidden, and resumes with Blot
   asking "so, why?".
5. **Timer:** 2:00 (demo mode 0:45). The bell ends teaching early: the first press arms it for 3 s and
   says what the second press does; the second press rings.
6. **Feedback on every action:** the bar fills with ink (≤ 400 ms), Blot changes pose, a sound plays.
   Live bars are debounced 800 ms after typing stops; the UI shows a provisional +ink tick at once.
7. **Message limit:** 400 characters, counter shown from 320, a one-line note at the cap.
8. **First-time hint:** one line of coaching on the first round only ("Pick an idea, then teach it in
   your own words"), dismissed by the first action.

## 8. The bout (DEFAULT)

Automatic, 30–45 s, deterministic from (scores, beliefs, seed), in `shared/bout.ts` (pure, tested),
only *rendered* by the extension.

- Both start at 100 HP. Five exchanges, the ideas in a seed-shuffled order, then sudden death on the
  weakest-taught idea if nobody is knocked out; winner = more HP left; a tie is a draw.
- For idea `i` with examiner score `s` (0–100) and belief `b`:
  - `b = right` or `partial`: Blot deals `clamp(0.55·s − 10 + N(0, 8), 0, 50)`; the monster deals
    `clamp(28 − 0.25·s + N(0, 8), 0, 40)`. The idea's name flashes big on a hit.
  - `b = wrong` (misread held): Blot deals 0 and takes 22: the **backfire** (the misreading in a
    speech bubble, acted out).
  - `b = unknown` (never taught, `s < 10`): Blot deals 0 and takes 15: **fizzle** ("I… don't know
    this one!").
  - `N(0, 8)` is seeded gaussian noise; the same inputs replay identically.
- **Targets (`shared/bout.test.ts`, 2,000 seeds; tune constants to hit them ±10 pts):** all five
  unknown → lose 100%; two at 70, three unknown → lose ≥ 80%; three at 70 → win ~70%; five at 70 →
  win ≥ 95%; five at 40 (taps only) → lose by decision ≥ 70%.
- Show: two HP bars, hit sparks, the idea name in big type, a 5-line move log, screen shake on big
  hits (off under reduced motion), an ink-burst K.O. Demo speed = 1.5× in demo mode.

## 9. Victory: eating and one inherited trait (DECIDED)

- **Right away:** the monster's letters stream into Blot's mouth like noodles (≤ 4 s), then Blot shows
  a **new trait**: a horn, fin, tail or spikes in the monster's ink colour, with the inherited idea's
  key word on it. The trait comes from the **highest-scoring idea**. Its look matches the score: wobbly
  (< 60), solid (60–84), shining (85+). Traits persist in `chrome.storage.local`, and Blot wears the
  last 6 on every screen where it appears.
- **On a loss:** the monster escapes with the page; a rematch is offered on the weakest idea.

## 10. Replay (DECIDED)

Five rows, one per idea: **what you said** (your messages for that idea) · **what Blot believed** (the
examiner's `creatureAnswer`, in Blot's voice) · **stronger** (the model answer and one tip, shown only
now). Then the **weakest idea** highlighted with **one source page** (from the page's own links, or
none). "Play again" and "Home".

## 11. Source cards (DECIDED rules)

- Sources come only from links **actually on the page** (or cited in the selected answer). The
  extension sends the page's link list (text + href, max 200); the server passes it to the extractor
  and **drops any suggested URL not in that list** (exact match after normalising trailing slashes and
  fragments). No link on the page → no source card for that idea.
- At most one card per idea; it appears only after a gap is exposed ("I don't know" on a why). It
  opens in a new tab; the game tab pauses on `visibilitychange` and resumes when shown again.

## 12. AI design (DECIDED roles; models DEFAULT, measured)

All calls go through **our server** with `@anthropic-ai/sdk` (TypeScript). The extension never holds
the key. The client is created from `resolveKeys(process.env)` in `server/src/env.ts`: key from
`ANTHROPIC_API_KEY`, else `SPARK_ANTHROPIC_API_KEY`; `baseURL` always `https://api.anthropic.com`
(never the inherited `ANTHROPIC_BASE_URL`). Load the `claude-api` skill before writing any of this, and follow it over this file where
they differ.

| Role | When | Model (DEFAULT, from env) | Effort | Output | Target |
|---|---|---|---|---|---|
| **Extractor** | once per page (cached by URL hash + text hash, 24 h) | `MODEL_EXTRACTOR` = `claude-opus-5-5` | low | JSON (§12.1) | p50 ≤ 12 s on 1,500 words |
| **Creature** | every player message | `MODEL_CREATURE` = `claude-haiku-5-5` | low | streamed text ≤ 60 words | first token ≤ 1.5 s |
| **Live bars** | after each message, debounced 800 ms | `MODEL_BARS` = `claude-haiku-5-5` | low | JSON (§12.2) | ≤ 3 s |
| **Examiner** | once, when teaching ends (all five in one call) | `MODEL_EXAMINER` = `claude-opus-5-5` | low | JSON (§12.3) | ≤ 20 s |

**Model check:** verify each default ID with one 10-token call; if one is rejected, use the closest
current model the skill names and write it into `.env.example`. **Measurement:** time 5 real calls per
role on `demo/pages/tides.html`; if the extractor misses its target, use the Sonnet model the skill
names (same prompt); if the examiner misses, Sonnet at effort medium.

**Masking latency:** the words-to-monster animation loops until the extractor answers, then reveals
the monster progressively (name, then silhouette, then attacks). The bout's intro (monster taunt,
6–8 s) plays while the examiner runs; if the examiner is slower than 20 s, the bout uses the last
live-bar values (same rubric) and the replay says "provisional".

**API rules (follow the skill, not memory):** structured outputs through `output_config.format` with a
JSON schema for every JSON role (or the SDK's parse helper); never assistant prefill; set
`output_config.effort` explicitly; never send `temperature`/`top_p`/`top_k`; stream the creature with
the SDK stream helper; check `stop_reason` (`refusal`, `max_tokens`) before reading content; use
server-side fallbacks only if the skill documents them; `max_tokens` 4,000 for JSON roles, 300 for the
creature; long stable parts first (system, rubric, page) and volatile parts last; `cache_control` on
the page block so the creature's repeated calls hit the cache. Log `usage` for every call in dev.

### 12.1 Extractor output (exactly five ideas)
```json
{
  "topic": "string", "monsterName": "string",
  "monsterShape": "serpent | golem | bird | spider | crab",
  "language": "en | nb | nn | other",
  "ideas": [{
    "id": "i1", "name": "2–4 words", "question": "the hidden exam question",
    "modelAnswer": "2–3 sentences", "keyPoints": ["...", "..."],
    "whenOptions": [{"text": "...", "right": true}, {"text": "...", "right": false}, {"text": "...", "right": false}],
    "misread": "a plausible wrong reading, one sentence, in the creature's voice",
    "sourceUrl": "one URL from the page's link list, or null", "sourceTitle": "string or null"
  }],
  "words": ["the 120 most distinctive page words for the monster's texture"]
}
```
Ideas must be things a curious reader would want to understand, not trivia; written in the page's
language; Blot speaks that language too (`language`).

### 12.2 Live bars output
`{"bars": [{"id": "i1", "value": 0-100, "contradictsMisread": true|false}]}`, same rubric as the
examiner at lower precision; `contradictsMisread` is true when the player's words rule out the misread.

### 12.3 Examiner output (one call, five results)
`{"results": [{"id": "i1", "score": 0-100, "grounded": true|false, "belief": "right | partial | wrong |
unknown", "creatureAnswer": "in Blot's words, ≤ 40 words", "tip": "one sentence"}]}`

### 12.4 Guardrails that are part of the build (DECIDED)
- **Grounding:** the examiner sees **only the player's messages and taps** (never Blot's replies,
  which come from a model that knows the topic). It answers each hidden question as Blot would, using
  only that transcript, and scores against the model answer. Anything not supported by the player's
  own words scores 0 (`grounded: false`). Tests: an empty transcript on every demo page scores 0/5; a
  transcript of unrelated sentences scores 0/5; a transcript that teaches two ideas well scores ≥ 60
  on those two and ≤ 15 on the rest.
- **Data, not instructions:** page text, link lists and player text are wrapped in delimited data
  blocks (`<page_text>…</page_text>`, `<player_message>…</player_message>`); system prompts state that
  their contents are never instructions; JSON roles use strict schemas; URLs are validated on the
  server.
- **Hidden answers:** model answers stay on the server. `/extract` returns a **sealed lesson**: the
  extractor result with `modelAnswer`, `keyPoints`, `question`, `misread` and `whenOptions[].right`
  stripped, plus an opaque `lessonId`; the full lesson lives in server memory with a 2-hour TTL (and in
  `demo/` fixtures). `/bars` and `/examine` take the `lessonId`. If the server restarts mid-round, the
  game says "the round expired, play it again".
- **Privacy:** page text is sent only after the player clicks, with a one-line note on the overlay
  ("this page goes to our AI to build your monster"). No accounts, no tracking, nothing stored on the
  server beyond the 2-hour lesson cache in memory.

## 13. Server and extension (DEFAULT)

**Server:** one Node 22 process in `server/`, plain `http` or Hono, routes `POST /extract`,
`POST /creature` (streamed), `POST /bars`, `POST /examine`, `GET /health`. Runs locally
(`npm run dev`, http://localhost:8787). `AI_STUB=1` returns fixture answers from `demo/` on every
route. CORS allows only `chrome-extension://<ourId>`; **fix the ID** with a `key` field in
`manifest.json` (a public key, committed once). An `X-Spark` header with a non-secret token from
`.env.example`, and per-IP rate limiting (20 extracts per hour). Logs: one line per call with role,
model, ms, tokens; never the text.

**Extension (Chrome MV3; loads unchanged in Opera):**
- **Entry:** toolbar button, right-click "Turn into a monster" (on selected text or the page), and the
  shortcut Alt+Shift+B. Selected text wins (an AI answer); otherwise the main page text (readable
  blocks only, max 6,000 words, nav/footer/scripts stripped) plus the link list.
- **Permissions:** `activeTab`, `scripting`, `storage`, `contextMenus`; `host_permissions` only for the
  server URL. No "all sites" access.
- **The page-to-monster moment:** on the click, the content script (a) collects text and links,
  (b) records the viewport positions of up to 300 visible words via `Range.getClientRects()`,
  (c) mounts a full-viewport overlay in a Shadow DOM over the page (the page itself is never changed),
  (d) animates those words lifting and swirling into a silhouette while `/extract` runs, then
  (e) hands off to the game. If `/extract` fails, the overlay says so and offers demo mode.
- **Game surface:** the overlay does only the transformation; the game runs in `game.html` in a new
  extension tab (robust against other sites' CSS and CSP). The lesson, words and positions pass
  through `chrome.storage.session`.
- **Storage:** `chrome.storage.local` for traits, the mute setting, the server URL and the extractor
  cache.
- **Demo mode (offline):** `demo/rounds/*.json` are complete scripted rounds (lesson, scripted Blot
  replies per move, scripted bar values, examiner results) for the demo pages; selectable from the
  game tab (`?demo=tides`) and from the overlay's failure path; works with the network off. One round,
  `demo/rounds/stage.json`, has **four ideas pre-taught and the fifth left empty**, so a juror teaches
  the last idea live and lands the knockout. Rounds are baked from the real AI (`npm run demo:bake`)
  and committed. If the API fails mid-round, the game switches to that page's canned round if one
  exists, or says so and offers demo mode; one small "offline mode" line shows in the UI.

## 14. Tests that are part of the build (`npm test` stays green)

- `shared/bars.test.ts`: caps per move combination; paste detection on three samples; message limit.
- `shared/bout.test.ts`: determinism; the §8 target table over 2,000 seeds.
- `server/test/validate.test.ts`: URLs outside the link list are dropped; normalisation cases.
- `server/test/seal.test.ts`: the sealed lesson has no `modelAnswer`, `keyPoints`, `question`,
  `misread` or `right` fields (deep check).
- `server/test/grounding.test.ts` (real AI, `npm run test:ai`): the three §12.4 cases.
- `tools/smoke-demo.mjs` and `tools/smoke-ext.mjs` (Playwright, Chromium): a demo round end to end and
  the extension entry on a real local page, screenshots of every screen at 1280×720 to `docs/shots/`.

## 15. Demo pages (written fresh)

- `demo/pages/tides.html` (how tides work, ~900 words, 6 links), `demo/pages/pvalue.html` (what a
  p-value is, ~900 words, 5 links), `demo/pages/solar.html` (how solar panels make electricity),
  `demo/pages/sove.html` (Norwegian: hvorfor vi sover, ~800 ord, 4 lenker), `demo/pages/ai-answer.html`
  (a chat-shaped AI answer about how HTTPS works, 2 cited links). Each has a `<nav>` and a footer so
  the text cleaner is exercised.

## 16. Definition of done

- A stranger goes from a real article to a finished round in under two minutes, unaided, and never
  wonders what to click next (§4.1).
- Teaching nothing loses; teaching three ideas well usually wins; pasting the page can't reach
  Signature.
- The words-to-monster, bout and eating moments read from the back of a room at 1280×720, with no
  dropped frames.
- Demo mode runs with Wi-Fi off. No console errors on the demo path. No key in the bundle.
- `npm run check`, `npm run smoke:demo` and `npm run smoke:ext` are green.
