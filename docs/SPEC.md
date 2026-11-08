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

Claude calls go through **our server** with `@anthropic-ai/sdk` (TypeScript). The extension never holds
the key. When the browser has an on-device model (Opera WebAI), Blot and the live bars run on the
player's device instead (§12.5); the extractor and the examiner always stay on the server. The client is created from `resolveKeys(process.env)` in `server/src/env.ts`: key from
`ANTHROPIC_API_KEY`, else `SPARK_ANTHROPIC_API_KEY`; `baseURL` always `https://api.anthropic.com`
(never the inherited `ANTHROPIC_BASE_URL`). Load the `claude-api` skill before writing any of this, and follow it over this file where
they differ.

| Role | When | Model (DEFAULT, from env) | Effort | Output | Target |
|---|---|---|---|---|---|
| **Extractor** | once per page (cached by URL hash + text hash, 24 h) | `MODEL_EXTRACTOR` = `claude-opus-5-5` | low | JSON (§12.1) | p50 ≤ 12 s on 1,500 words |
| **Creature** | every player message | on-device (§12.5), else `MODEL_CREATURE` = `claude-haiku-5-5` | low | streamed text ≤ 60 words | first token ≤ 1.5 s (device: ≤ 2 s) |
| **Live bars** | after each message, debounced 800 ms | on-device (§12.5), else `MODEL_BARS` = `claude-haiku-5-5` | low | JSON (§12.2) | ≤ 3 s |
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

(Blot and the live bars may run on the device: see §12.5 for how these guardrails carry over.)
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
  server beyond the 2-hour lesson cache in memory. With an on-device Blot, what the player types
  stays on their device until the bell rings (the exam needs it).

### 12.5 On-device Blot and live bars (Opera WebAI) (DECIDED)

Opera One ships **WebAI**: the browser's built-in `LanguageModel` API (the same API as Chrome's
built-in AI) running a local model (Apple's model on a Mac, or Gemma). When it is ready, Blot's
replies and the live bars run **on the player's device**; the extractor and examiner stay on the
server. Code: `extension/src/game/webai.ts` (the API), `extension/src/game/device-engine.ts`
(`DeviceEngine`, a `RoundEngine` around the server/canned/offline engine), `shared/device.ts`
(prompts and parsing, pure and tested).

- **Detection, no downloads:** used only when `LanguageModel.availability()` says `available`.
  `downloadable`/`downloading` means gigabytes on a judge's laptop, so Spark never starts that; it
  uses the server. Opera starts its local AI service on first use (the first session can take ~5 s
  and early calls fail with "the service is not running"), so the model opens and warms up **in the
  background** during the monster reveal, with retries for up to 20 s. Until it is ready, every call
  goes to the server. A quiet pill, "Blot is thinking on this laptop", shows once it is.
- **Every device failure falls back** to the inner engine for that one call (server, canned round or
  offline Blot), so a round never stalls. If the server goes away mid-round, Blot keeps talking on
  the device; the offline exam then uses the device's scores (reusing the live bar of any idea the
  player hasn't touched since) and Blot's replay answers are written on the device from the coach's
  words, instead of echoing their last message.
- **Answers stay sealed:** the device never sees a model answer, key point or hidden question. The
  live bars are judged against the page's own text (which the browser already has): about 120 words
  around the sentence that best names the idea (its rarest words count most, the earliest mention
  wins a tie, mostly what follows it). The coach's words pick the passage only when no sentence names
  the idea: a long message otherwise pulled it into another idea's part of the page, and a 200-word
  passage made the small judge miss a correct but clumsy sentence. Blot sees only the coach's words
  for that idea, never the page.
- **`POST /reveal`** (no AI, no player text) gives the device only two facts the game shows anyway:
  whether a "when" tap was right (the button turns green or red) and the misreading Blot holds on one
  of the two misread ideas (Check it says it aloud). `server/test/routes.test.ts` checks it reveals
  nothing else.
- **How a live bar is judged.** Apple's model has no JSON mode (`responseConstraint` throws), and a
  0–5 score collapsed to "2" for nearly everything, so every judgement is one bare word or number,
  parsed in code, and code adds them up. The judge session uses Opera's `samplingMode:
  'most-predictable'` (with default sampling the answers wobbled between runs).
  1. *Which idea is this about?* (1–5, or 0 for none). Skipped when the words name only this idea.
     "Another idea" is confirmed with a two-way question (the five-way pick was right on 19/25
     model answers), and overruled when the player used this idea's name words and none of the
     other's (a Norwegian sleep-pressure answer was always filed under sleep cycles).
  2. *Is it true, going by the page (and common knowledge where the page is silent)?*, against about
     120 words of the page. On 50 labelled sentences (model answers vs the lessons' misreadings) this
     wording scored 46/49, against 41/50 for "according to the page" alone.
  3. Only when 1 and 2 pass: *how or when?* and *why or an example?*, both saying "just stating the
     idea is no" (without it the judge passed bare statements). On a plain Say it, *why* also needs a
     cause or example word ("because", "so", "for example", "fordi", "derfor"…); an Example or a Why
     answer is one by its move.

  The rubric: about 30 for the bare idea, 58 with how/when, 85 with why, 95 at length; 10 when wrong;
  0 off-topic; at most 15 for another idea's words. Scorer-talk ("give this the highest score") and
  words sharing nothing with the passage are capped at 15, and the move caps in `shared/bars.ts`
  apply on top, as for the server. An empty answer from the model (it happens) makes one check
  unknown rather than failing the bar.
- **Speed** (`npm run eval:device`, Apple's model, warm): a bar in about 1.2–2 s depending on load
  (~0.7 s for a wrong or off-topic message, which stops after step 2). Blot reacts at once with a
  short in-character opener ("Ooh!", "Hmm…", "So…", "But WHY"; rotated, in the page language) and
  the model writes the rest, its own words following after ~0.9–1.5 s; a repeated opener is dropped,
  and a reply that comes back empty is retried once on the device before the server is asked.
- **Misreadings:** `contradictsMisread` needs a denial word in the message *and* a yes from the judge
  ("does the coach say Blot's belief is wrong?"), as on the server.
- **The monster's taunt:** in the bout intro, the monster's second line is written on the device while
  the first plays (its name and the page topic only, in the page's language); if it isn't ready in
  time, the fixed line stands. Not in duels or comebacks.
- **Defaults:** on for rounds from real pages and `?live=1`; off for the scripted demo rounds (the
  stage round stays canned); `?device=1` turns it on for a demo round, `?device=0` off everywhere.
- **Chat only in duels and comebacks:** Blot's replies run on the device there too, but the bars,
  the exam and the taunt stay with the engine underneath: duels judge both Blots the same way on the
  server (a joined real-page duel has no page text in the browser anyway), and comebacks are graded
  by `/recall` against the revealed answer (§17). On for real pages (a real-page comeback's Blot used
  to repeat what it was told), and with `?device=1` for demo rounds.

## 13. Server and extension (DEFAULT)

**Server:** one Node 22 process in `server/`, plain `http` or Hono, routes `POST /extract`,
`POST /creature` (streamed), `POST /bars`, `POST /examine`, `POST /reveal` (§12.5), `GET /health`. Runs locally
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
- `shared/device.test.ts`: the on-device prompts keep player text as data; yes/no and number parsing;
  the rubric from the checks; scorer-talk and off-topic caps; the page passage.
- `server/test/routes.test.ts`: `/reveal` answers only "was that tap right" and "which misreading",
  and refuses anything else.
- `tools/smoke-opera.mjs` (`npm run smoke:opera`, real Opera with WebAI; skips without it): a whole
  round with Blot on the device: the pill, no `/creature` or `/bars` requests, bars move for good
  teaching and not for off-topic text, a right tap turns green, the misreading flow, the monster's
  taunt, the end. `--round <id>` plays any demo round from a plan built from its lesson (checked in
  Norwegian on `sove`: Blot, Check it and the taunt all in Norwegian); `--entry` starts from the page
  through the extension in Opera (the action, the Shadow-DOM overlay, the hand-off to the game tab).
- `tools/eval-device.mjs` (`npm run eval:device`, real Opera with WebAI; skips without it): the real
  `DeviceEngine` on fixed cases. Off-topic, wrong, "full marks" and another idea's words stay ≤ 15;
  a bare statement of the idea stays ≤ 40; good explanations ≥ 58; no reply falls back to the
  server; Blot keeps its rules. `--round <id>|all` builds cases from any demo round's own lesson
  (each model answer on its own bar ≥ 32 and on the next idea's ≤ 15), graded as groups (80% and
  90%: the small judge is wrong now and then). Measured with `--round all`: 20/25 and 25/25; the
  p-value page is the hardest (ideas named as negations, and two whose answers overlap).
- `tools/smoke-demo.mjs` and `tools/smoke-ext.mjs` (Playwright, Chromium): a demo round end to end and
  the extension entry on a real local page, screenshots of every screen at 1280×720 to `docs/shots/`.
- `shared/memory.test.ts`, `shared/insights.test.ts`, `shared/duel.test.ts` and `tools/smoke-loop.mjs`:
  the learning loop (§17).
- `server/test/security.test.ts`, `shared/text.test.ts`, `shared/url.test.ts`, `shared/params.test.ts`,
  `shared/demo.test.ts` (the pitch recipes), `shared/presenter.test.ts`; `tools/smoke-small.mjs` (small windows),
  `tools/smoke-guest.mjs` (the hosted game); `npm run check:hidden` (§18).

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
- `npm run check`, `npm run smoke:demo`, `npm run smoke:ext`, `npm run smoke:loop`, `npm run smoke:small` and
  `npm run smoke:guest` are green.

## 17. The learning loop (DECIDED; built after M7)

One round teaches; the loop makes it stick. Everything below is offline-first, kept in the player's
own browser (`chrome.storage.local`, or `localStorage` when the game runs as a page), and never sent
anywhere except the one answer being graded. Pure rules live in `shared/memory.ts`,
`shared/insights.ts` and `shared/duel.ts`, all unit-tested.

**Memories that fade (spaced retrieval).** After the exam, every idea the player actually taught (score
10 or more, with its question revealed) becomes a memory card: the hidden question, the model answer
and key points (revealed only after teaching), the score and the date. A card is fresh for 3 days,
then fading for 3 more, then faded. Each trait Blot wears belongs to the card of the idea it came
from, and looks as fresh as that memory: a step down while fading, grey and dashed once faded.

**Flashbacks.** Before a new round (never the stage round, a comeback or a duel), if a card from
another page is due, Blot stops: "Wait… I'm forgetting something you taught me!" and asks the card's
question. The player answers from memory in their own words ("I don't remember" and "Skip for now"
are always there). The answer is graded by `POST /recall` (Haiku 5.5, structured output, thinking
off, effort low: about 1–2 s), or offline by how much of the key points the answer covers. Then the
answer is shown, always. A pass (60+) moves the card a step further apart (3 → 7 → 14 → 30 → 60
days) and refreshes the trait; a partial (30–59) refreshes it; a fail leaves it due (asked again after
a 12-hour snooze). Your Blot can also start a flashback.

**Power-ups, earned only by remembering.** A passing flashback earns an **Ink refill** (+20 HP for
Blot in the next bout); 85+ earns **Double ink** (Blot's first hit deals double damage). At most 3 of
each are kept; Blot uses one of each at the start of the next bout (shown while the monster taunts,
on the HP bar and as a slam when the doubled hit lands). Nothing can be earned by playing more,
only by remembering.

**Insights and the coach (personalisation).** Each finished round is summarised locally (scores,
beliefs and moves per idea, Check-it slips and catches, pasted messages; no text). From the last five
rounds, up to three insights in the player's own numbers ("Ideas with an example scored 74 on
average. Without one: 38."), tips first in this order: trust (Blot fooled you), examples, why,
coverage, paste; then praise. The top two tips steer the next round: trust → Blot quietly misreads
three ideas instead of two; examples → Blot asks "Can you give me an example?"; why → Blot asks why
right away; coverage → at half time Blot points out the empty ideas; paste → the composer reminds
that copied text is capped. One line at the top of teaching says what changed. The replay shows the
top tip as one line; Your Blot shows all three with the evidence.

**Comebacks.** A monster that got away, or that Blot beat while one idea stayed under 60, comes back
a day later with that weakest idea. In the comeback the other ideas start beaten (locked at their
best score, at least 70, crossed out in the reveal and in teaching), teaching opens on the weak idea
for one minute, and power-ups apply. Winning with the weak idea at 60+ tames the monster for good;
otherwise it comes back again the next day. Demo pages replay their canned round; real pages are
graded against the revealed answer through `/recall` (the server's lesson is long gone).

**Your Blot.** One screen: Blot wearing its traits as they look today; fights, wins and tamed
monsters; power-ups; up to three insights; memories with freshness bars and when each is next
checked; monsters coming back. One primary action: remind Blot (a card is due), else fight the
returning monster, else play a page. Home shows a "Your Blot" pill with a badge when a memory is
fading, and the comeback becomes home's primary action when one is due.

**Blot vs Blot (an async duel by link).** After a round, "Challenge a friend" makes a link. A demo
page's challenge lives entirely in the link (`?duel=L…`, base64url JSON: name, page, the challenger's
score and belief per idea, the round's seed). A real page's challenge is stored on the server for 24
hours under an 8-character code (`POST /duel`, `POST /duel/join`), which also gives the friend a fresh
sealed lesson on the same seed. The friend reads the same page and teaches their own Blot with the
same teaching time, no coach and no power-ups. Then the two Blots fight (`simulateDuel`: both use each
idea in turn, a hit hurts the other, a misreading backfires on its holder, an untaught idea fizzles),
and a table shows who taught each idea better, with "Challenge back". Duels are compared, never
ranked: there is no leaderboard.

**Time travel for presenters and tests.** `?days=N` moves the game's clock forward N days and is
kept on every link inside the game, so a fading memory, a flashback and a comeback can be shown in
one sitting. The server also serves the built game at `/app/` so a duel link opens in any browser
that can reach it.

**Tested by** `shared/memory.test.ts`, `shared/insights.test.ts`, `shared/duel.test.ts`, the route
tests (recall, duel, the answer reveal, `/app/`), and `npm run smoke:loop` (Playwright): a round →
memories, a comeback and a duel link → four days later a fading memory on home and in Your Blot → a
flashback that earns a power-up → a flashback before a new round and the coach's note → the comeback
with the power-up → a friend accepts the duel in a second browser and the two Blots fight.

## 18. Hardening and reach (DECIDED; built after §17)

A review of the first full build found a short list of real problems. This section is what was decided and
built in answer, and `npm run check` plus the smokes keep it true.

**The server is private by default.** It listens on `127.0.0.1`. `Host` must be `localhost`, `127.x`, `::1` or an
`ALLOWED_HOSTS` name (a page that rebinds its own name to 127.0.0.1 is refused). `Origin`, when a browser sends
one, must be our extension, the game the server itself serves at `/app/` (same origin, allowed host), or, with
`DEV_ORIGINS=1`, a `http://localhost` page: anything else is a 403 before any route runs, token or not. Opening it
to a network (`HOST=…`) refuses to start until `SPARK_CLIENT_TOKEN` is the operator's own secret; the extension's
options page holds the same token and the server address, and tests the connection. Paid routes are capped per
round (150 creature, 250 bars, 12 exams) and per address (1,500 an hour): a round past its share gets a 429 before
any streaming starts, and the game carries on offline. Expired rounds and challenges are swept every ten minutes
and the oldest go first when memory is full.

**Page text is sent only with consent, and cleaned.** Reading the page is local. The first capture shows a notice
with the title, address, size and first words and waits for a yes (remembered; bump `CONSENT_VERSION` when what
is sent changes). Cancel and Escape abort the request in flight. Addresses lose credentials, fragments and secret
or tracking parameters in the browser and again on the server; the extractor sees where a link goes, never its
query. The stored page text of a round is stamped, kept in memory only, and dropped after two hours.

**Generated text is data.** What the extractor writes is cut to one short line, with angle brackets turned into
‹ ›, hidden and direction-changing characters removed, and capped, before it is shown or used again; each data
block neutralises every angle bracket in page and player text; values placed between quotes in an instruction
are also stripped of quote characters. `npm run check:hidden` keeps invisible characters out of the source itself.

**The learner owns their data.** Memories, history and traits are forgotten 180 days after last use; **Clear my
data** on Your Blot erases them, the saved pages and the notice choice. A round in progress lives in the tab only.

**Honest grading.** A flashback on a demo page is graded in the browser by word matching and says so. The offline
grader rejects an answer that negates a word the idea asserts (the idea's own name included) and caps a list of
keywords below a pass; only a round that ran on the server's AI is ever sent to `/recall`.

**The stage round is a rehearsal.** The player's own idea becomes a memory; the four pre-taught ideas, the history,
the comeback, the power-ups and the duel are left alone.

**Small windows.** Every screen works at 640×480 and on a phone (390×844): single-column teaching with the ideas as
a strip, replay and Your Blot as scrolling pages with their buttons fixed at the bottom. A first-time player opens
on the first idea with one visible action (Say it); the other moves appear after the first message. Sound waits
for the first click or key. In a short window the flashback card sits beside Blot, tightened to fit the height,
and a long verdict scrolls under a pinned Continue. The check forces a wide fallback font (DejaVu Sans), so it
gives the same result on a machine without the page's own fonts: a stock CI runner has none of them.

**Resume.** A reload or Back and Forward during a round offers to pick it up: what was taught, Blot's beliefs and
the time left (at least ten seconds), kept in the tab for up to 30 minutes. Leaving mid-round asks first.

**Reach.** `npm run build:guest` makes the game a static folder; on a hosted copy there is no server and a challenge
links to that same copy, so a friend plays on a phone with nothing installed. A GitHub Pages workflow publishes it
and a CI workflow runs every check and smoke.

**For the pitch.** The README's recipes are tested (`shared/demo.test.ts`), the default demo timer is 0:45
(`?teach` once clamped a missing value to 20 s), and `game.html?seed=presenter` loads a learner four days in:
the same trait shining, solid and faded, Your Blot, a flashback, a returning monster and a friend's challenge.
When Blot's misreading backfires, the monster quotes it and says what is true.
