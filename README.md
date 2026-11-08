# Spark

[![CI](https://github.com/kaimwnorman-ui/Spark-Oslo-Sprint/actions/workflows/ci.yml/badge.svg)](https://github.com/kaimwnorman-ui/Spark-Oslo-Sprint/actions/workflows/ci.yml)

**AI answers end curiosity at the answer. Spark starts it there.**

Spark is a browser extension (Chrome MV3, also loads in Opera). Click it on any page, or select an AI
answer, and the page's own words lift off the screen and swirl into a monster. You beat it by teaching a
small ink creature, Blot, the page's five key ideas in your own words. Blot then fights the monster using
only what you taught it, eats it if it wins, and keeps a trait. The replay shows what you said, what Blot
believed and what would have been stronger, with one real page to go deeper.

Then the learning loop makes it stick: what you taught fades unless you remember it, Blot asks about
it again days later (a good answer earns a power-up for the next fight), monsters come back with the
idea you were weakest on, "Your Blot" shows what you struggle with in your own numbers, and a link lets
a friend's Blot fight yours.

The design is in [`docs/SPEC.md`](docs/SPEC.md) (the loop is §17, hardening and reach §18); the build
rules are in [`CLAUDE.md`](CLAUDE.md).

## Who it is for

These are hypotheses to test, not results:

- **First users:** first-year university science students who revise from web articles and AI explanations.
  They read, or are told, an explanation and rarely check whether they could explain it themselves.
- **First buyer:** the course coordinator who runs their weekly tutorials. Spark gives students a reason to
  come back to one specific misconception from an assigned reading.
- **The pilot measure, chosen in advance:** of ten students, how many finish a second round within seven days.

## Try it in 30 seconds (no extension, no server)

```bash
npm install
```

```bash
npm run build:dev
```

```bash
node tools/serve.mjs
```

Then open http://127.0.0.1:8790/game.html?demo=tides and press **Turn into a monster**. Demo rounds run
fully offline. Other pages: `?demo=pvalue`, `?demo=solar`, `?demo=sove` (Norwegian), `?demo=ai-answer`,
and `?demo=stage` (four ideas already taught: teach the last one live and land the knockout).

## Run the real thing

1. Put your keys in `server/.env` (see [`.env.example`](.env.example)): `ANTHROPIC_API_KEY`, and
   `KIE_API_KEY` if you want to regenerate the art. In the cloud environment the Anthropic key is
   `SPARK_ANTHROPIC_API_KEY` and the KIE key is added by the network proxy.
2. Start the server and the extension build in watch mode:

   ```bash
   npm run dev
   ```

3. In Chrome or Opera, open `chrome://extensions`, turn on Developer mode, **Load unpacked**, and pick
   `extension/dist/`. The extension ID is fixed (`mfkcdmkiehbhmcacmhmgofpcojipgknf`) by the public key in
   the manifest, so the server's CORS rule matches it.
4. On any article: click the Spark button, press **Alt+Shift+B**, or right-click → **Turn into a monster**.
   Select text first (an AI answer, a few paragraphs) to use just that. The first time, Spark shows exactly
   what it would send and asks (see "Your data" below); say yes once.

No key? The server runs in offline mode and the demo pages still work from their canned rounds.
`AI_STUB=1 npm run dev` makes every AI route answer from `demo/` (for tests and rehearsals).
`game.html?demo=tides&live=1` plays a demo page through the server, without the extension (`npm run dev`
allows it; with plain `npm run server` set `DEV_ORIGINS=1`).

## The learning loop in two minutes

Play `?demo=tides` once (teach three ideas, ring the bell). Then add `days=4` to jump four days ahead:

- http://127.0.0.1:8790/game.html?days=4: home shows a fading memory and the monster coming back.
- **Your Blot** (top left): insights from your own rounds, traits (tap one to see the idea that earned it),
  memories fading, power-ups, comebacks. **Remind Blot** asks a question from your round; answer from
  memory to earn a power-up.
- **Fight The Tide Serpent again**: the comeback. The ideas you beat are locked; teach the weak one,
  and Blot uses the power-up in the bout.
- **Challenge a friend** (on the replay) makes a link; open it in another browser (or a private
  window) to play the friend's side and watch the two Blots fight.

Everything is stored in the browser, offline. A demo page's flashback is graded in the browser by word
matching and says so; a real page's is graded by the AI (`/recall`) when the server is there. Word
matching rejects an answer that denies the idea ("Earth never spins") and a list of keywords, but it can
miss a good answer: it is a fallback, not a judge. `npm run smoke:loop` walks all of this and saves
screenshots to `docs/shots/loop-*.png`.

## Presenting

**The 60-second moment.** `?demo=tides&teach=90` → **Turn into a monster** → **Teach Blot** → teach three
ideas (**Say it**, then **Give an example**) → ring the bell twice → the bout → Blot eats the monster.
The default teaching time is 0:45; `&teach=90` gives more. Demo mode is 1.5x faster and works with Wi-Fi off.

**Which ideas win.** Two ideas on every page are ones Blot quietly misreads. Teach one of them and Blot
believes it wrong, so it backfires, unless you press **Check it** and ✗ and put Blot right. These three
ideas per page win (checked by `shared/demo.test.ts`, so this table cannot go stale); two ideas lose:

| Page | Teach these three | Blot's trap (skip, or catch with Check it) |
|---|---|---|
| `tides` | Two bulges · Spring and neap · Coast shapes tides | Difference in pull · Later every day |
| `pvalue` | Assume nothing happens · Not chance of error · Significant isn't important | The 0.05 line · Many tests, lucky hits |
| `solar` | Light frees electrons · Why light is wasted · Cool and well aimed | The built-in slope · Inverter changes current |
| `sove` | Den indre klokka · Søvnsyklusene · Søvn og hukommelse | Søvnpress og adenosin · Hjernens nattvask |
| `ai-answer` | Scrambling data in transit · Tamper detection · What padlock doesn't promise | Secret key handshake · Certificates prove identity |

**A sure knockout with a juror.** `?demo=stage`. The reveal ticks four ideas as already taught and makes
the fifth glow; the juror teaches it and the bout ends in a K.O. The stage round is a rehearsal: it
records no history or comeback, spends no power-ups and offers no duel, and only the idea the juror taught
becomes a memory.

**The presenter kit.** Open `game.html?seed=presenter` in a fresh browser profile (it never overwrites a
real learner). It loads a learner who played two pages a few days ago and lists six ready tabs: the same
trait shining (day 0), solid (day 4) and faded (day 7), Your Blot, a flashback, the returning monster and a
friend's challenge. The clock is simulated with `days=N`: say so out loud.

**A three-minute run.** 0:00 who it is for and why (the section above). 0:20 `?demo=stage&teach=90` through the
K.O. 1:35 the day-four tab: Your Blot, then **Remind Blot** and a flashback answer. 2:15 the comeback or the duel tab.
2:45 the pilot ask. Accept the first-use notice once before you present.

## Your data

Spark has no accounts, no analytics and no ads.

- **Reading happens in your tab.** Nothing leaves until you press **Send and continue** on the first-use
  notice, which shows the page's title, address, size and first words. After that, every capture shows a
  working Cancel that aborts the request.
- **What is sent, and where.** The page's text (up to 6,000 words), title and links go to your Spark server,
  which asks Anthropic's AI for the five ideas. The addresses are cleaned first: no password, no
  fragment, and no secret or tracking parameter (`token`, `utm_*`, `session`, …); the AI sees only where each
  link goes, never its query. While you teach, your messages go the same way; the examiner sees only your
  messages and taps. Anthropic processes them under its API terms.
- **How long the server keeps it.** A round's page text, about two hours (swept every ten minutes; the oldest
  rounds go first when the server is full). A real page's challenge, 24 hours. The extracted lesson, 24 hours
  (ideas and answers, not the page). Nothing is written to disk; logs hold the role, model, time and token
  counts, never text.
- **What your browser keeps.** Memories, history, traits, your name, and your yes to the notice: 180 days after
  they were last used. The page text of the current round: in the extension's session storage (memory only), for
  two hours at most. A round in progress: in the tab, until it closes.
- **Erase it.** Your Blot → **Clear my data** (two taps) removes all of the above from this browser.
- **Challenge links.** A demo page's challenge carries your name and scores inside the link, so send it only to
  people you trust; a real page's challenge is kept on the server for 24 hours.

## Running the server safely

The server listens on `127.0.0.1` only, so only this computer can reach it. It answers our extension, the game it
serves itself at `/app/`, and tools with no browser origin; every other web page gets a 403, and a request whose
`Host` is not `localhost`, `127.x` or `::1` is refused (so a page that rebinds its name to 127.0.0.1 cannot reach
it). Each round has its own cap on paid calls (150 Blot replies, 250 bar checks, 12 exams) and each address has an
hourly cap; past them the server answers 429 and the game carries on offline.

To open it to a network, set `HOST` (and `ALLOWED_HOSTS=name`): the server then refuses to start until
`SPARK_CLIENT_TOKEN` is your own long secret, and the extension's **options page** (Spark → Options) takes the same
token and the server address, with a **Test the connection** button. `DEV_ORIGINS=1` (set by `npm run dev` and the
smokes) also accepts pages opened from `http://localhost`.

## Let a friend play without installing anything

`npm run build:guest` writes `site/`: the game on its own, offline, no extension and no server. A challenge made on
a hosted copy links to that same copy, so a friend opens it on a phone with nothing installed
(`npm run smoke:guest` checks this, including that no request leaves the site).

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) publishes `site/` on every push to `main`. One-time
setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The game is then at
`https://kaimwnorman-ui.github.io/Spark-Oslo-Sprint/`. To make challenges made inside the extension point there
too, build the extension with `GUEST_GAME_URL=https://kaimwnorman-ui.github.io/Spark-Oslo-Sprint/game.html npm run build`.
A challenge for a real page lives on your server, so it opens the game your server serves (`/app/`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Server on http://localhost:8787 and the extension build in watch mode (`extension/dist/`). |
| `npm run build` | Release build of the extension. |
| `npm run build:guest` | The hosted guest game, a static folder in `site/`. |
| `npm test` | Unit tests: bar rules, the bout, memory, insights, duels, sealing, link and URL cleaning, the security rules, routes. |
| `npm run check` | Typecheck + tests + release build + `check:nokey` (no key can ship) + `check:hidden` (no invisible characters in the source). |
| `npm run smoke:demo` | Plays a demo round end to end in Chromium; screenshots to `docs/shots/`. Flags: `--lose`, `--no-art`, `--reduced`, `--live` (AI_STUB server), `--real` (real AI), `--blocked` / `--drop` (server cut off), `--fast`. |
| `npm run smoke:ext` | Loads the extension, checks the first-use notice, Cancel, the options page and token, and that the game tab's monster is built from the page's words. |
| `npm run smoke:loop` | The learning loop end to end: memories, flashback, coach, comeback, duel, resume after reload, the stage rehearsal, the presenter kit. |
| `npm run smoke:small` | Every screen in a 640×480 window and on a phone: each control reachable and not covered. |
| `npm run smoke:guest` | The hosted guest game on a public host name: a whole round, a challenge opened on a phone, no request leaves the site. |
| `npm run test:ai` | Grounding tests with the real examiner. |
| `npm run models:check` | One 10-token call per configured model. |
| `npm run measure` | Times 5 real calls per role (extractor, examiner). |
| `npm run assets:gen` | Generates the art with KIE (`-- --offline` writes only the code-drawn placeholders). |
| `npm run demo:bake` | Bakes `demo/rounds/*.json` from one real AI run per demo page, and the stage round. |

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `check` and every smoke above on each push. None of them
needs a key.

## Testing on real pages

`smoke:ext` can play a whole round on any page with the real AI, through the extension. Replace the URL
with a news article, a docs page, or a page holding a chat answer:

```bash
npm run smoke:ext -- --real --url "PAGE_URL" --name news
```

For a chat answer, add `--select` with a CSS selector for the answer, so only its text is used:

```bash
npm run smoke:ext -- --real --url "PAGE_URL" --select "ANSWER_SELECTOR" --name chat
```

The local AI-answer page works the same way, with the server's dev pages:
`npm run smoke:ext -- --real --url http://localhost:8787/pages/ai-answer.html --select article --name chat`
(start nothing else on port 8787 first; the test starts its own server). Screenshots go to
`docs/shots/<name>-*.png`. The test loads a throwaway copy of the extension with that one site added to its
host permissions, because Playwright cannot click the toolbar button (which is what grants `activeTab`).

## How it is built

- `extension/`: the MV3 extension. `src/background.ts` (toolbar, shortcut, context menu, `/extract`, Cancel),
  `src/content/main.ts` (reads the page, shows the first-use notice and runs the lift-off overlay in a closed
  Shadow DOM; the page is never changed), `src/options.ts` (server address and token), `src/game/` (the game tab:
  screens, Blot and the monster drawn in code, Web Audio sound).
- `server/`: one Node process (plain `node:http`, TypeScript run natively by Node 22). Routes
  `/extract`, `/creature` (streamed), `/bars`, `/examine`, `/health`, and for the loop `/recall`
  (grades a flashback), `/duel` and `/duel/join` (a real page's duel, kept 24 hours) and `/app/` (the
  built game, so a duel link opens in any browser). Lessons live in memory for 2 hours; the extension
  only ever gets a sealed lesson with the answers stripped (each idea's answer is revealed after the
  exam).
- `shared/`: types, config, the bout and duel simulations, bar rules, round rules, memory cards, insights,
  URL cleaning and text safety, the presenter seed. Pure and unit-tested.
- `demo/`: the demo pages (written for Spark) and their canned rounds.
- `tools/`: build, dev, smoke tests, art generation, model checks, baking.

### AI roles

| Role | Model | Notes |
|---|---|---|
| Extractor | `claude-sonnet-5-5` | Opus 5.5 measured p50 13.8 s against a 12 s target; Sonnet 5.5 p50 9.9 s with the same prompt. |
| Blot (creature) | `claude-haiku-5-5` | Streamed, first token ~0.4 s, only uses the player's own words. |
| Live bars | `claude-haiku-5-5` | ~2 s, same rubric as the examiner. |
| Examiner | `claude-opus-5-5` | p50 6.3 s; sees only the player's messages and taps (never Blot's replies). |
| Recall | `claude-haiku-5-5` | Grades one flashback answer against the revealed answer, ~1–2 s; offline fallback: word matching. |

All JSON roles use structured outputs, explicit effort and no sampling parameters. Page, player and generated text
are data, never instructions: every data block has its angle brackets neutralised so nothing can open or close a tag,
what the extractor writes is cut to one short line before it is used again, and source links are checked against the
page's own links.
