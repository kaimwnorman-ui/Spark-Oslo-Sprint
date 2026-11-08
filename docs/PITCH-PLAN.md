# Spark pitch plan: Oslo Sprint 2026

Research and a slide-by-slide plan for two decks. Nothing is built yet. Each deck will be built as its own page
(Page 1: the 2-minute mini-pitch; Page 2: the 5-minute final), so they can be opened side by side and rehearsed
separately. Every number in this file has a source at the bottom; anything we could not verify is marked.

---

## 0. The brief, in one screen

| Fact | Detail | Source |
|---|---|---|
| Event | Oslo Sprint Hackathon, 6–8 Nov 2026, BI Startup Village, Nydalsveien 37. Volunteer-run (Ung Innovasjon), free, ages 15–29, teams of 1–4, ~200 participants. | oslosprint.org |
| Purpose, in their words | "vise hva vibe-coding kan levere: et ferdig produkt på under 48 timer" (show what vibe-coding can deliver: a finished product in under 48 hours). AI tools are "selve poenget" (the whole point). | oslosprint.org |
| What "finished" means | "Det gjør ingenting om produktet ikke er perfekt: målet er å visualisere ideen og vise frem hovedfunksjonene." Rule: "Ingen demo, ingen premie." | oslosprint.org |
| Deadline | Sunday 14:00: deliver the product. | oslosprint.org |
| **Round 1** | **14:15–17:00, "Minipitch", jury only: 2 minutes to pitch, 1 minute of questions.** Top 10 go to the final. | oslosprint.org |
| 17:00 | Finalists announced, with side-challenge winners. | oslosprint.org |
| **Final** | **18:00 "Pitchekonkurranse": finalists pitch on stage for the win, jury and audience.** Length not published; this plan assumes 5 minutes and is built to trim to 3 or 4. | oslosprint.org (length: assumption) |
| 21:00 | Prizes. First prize 50,000 NOK, paid by Opera. Side challenges: Wybe (robotics/AI), Holio (e-commerce). | oslosprint.org/sponsorer |
| Challenge | A "hovedutfordring" and side challenges were announced at Friday's kickoff. **Fill in the exact wording** (SPEC §0 is blank); if Spark fits it, that sentence goes on slide 1. | oslosprint.org (kickoff) |
| Competitor signal | Team "The Click" (Snakk, a spoken-Norwegian app) scripted exactly "2 minutes + 1 minute of questions", runs a live phone demo on a hotspot with a backup video, opens with a statistic, closes with a pilot ask, and notes "a lawyer is on the jury". That is the bar. | github.com/AkodLA/the-click |

### The jury (every member judges "ut fra sitt eget fagfelt", from their own field)

| Juror | Field | What they will measure Spark on | What the pitch must give them |
|---|---|---|---|
| **Henrik Lexow**, Senior AI Product Director, Opera; Opera's spokesperson at the Neon launch | Product, browser AI | Is this a real browser product? Does it use the browser well? Does it fit Opera's local-AI push? | The extension entry on a real page; Blot running on **Opera Web AI on the device** (PR #1), said in one sentence, shown with the "Blot is thinking on this laptop" pill. |
| **Chris Mansfeldt**, creative lead and product marketer, Opera (Lovie-winning "Tabfulness" campaign) | Brand, campaign, creative | Is it memorable, shareable, fun? Could it be a campaign? | The monster made of the page's own words; the one-line hook; the "Challenge a friend" link. |
| **Daniel Christensen**, ethical hacker, Telenor; "vurderer bidragene fra et sikkerhetsperspektiv" | Security | What leaves the browser, prompt injection, open ports, API-bill abuse | One slide: loopback-only server, first-use notice, URLs cleaned, page text is data not instructions, caps per round, Clear my data, no accounts, no analytics. |
| **Nils Holger Koefoed**, partner, Ro Sommernes | Legal | Data processing, consent, copyright of page text, minors | Consent before anything is sent; nothing stored beyond two hours server-side; the player owns their data; no accounts. Have a one-line answer on copyright (text is processed, never republished). |
| **August Sandmo** (Vaskeladden), **Einar Holt** and **Oscar Gangstad Westbye** (Wybe/Tenki Labs; Holt built Klasseplanen.no and Studdy), **Martin Schi Nordvold** (Holio) | Founders, AI infra, commercial | Who is the customer, who pays, why now, can it grow | A named first user and buyer; a pilot already asked for; a business model with real price anchors; "why now" tied to Opera Web AI (22 Oct 2026). |
| **Pål de Vibe**, Principal Data Engineer, Knowit, Databricks MVP | Data and platform engineering | Is the engineering sound, tested, reproducible? | "108 unit tests, five Playwright smokes, CI green on every push, offline mode, structured outputs." One line, not a slide. |
| **Andrea Claussen**, senior digital designer, Knowit Experience (IxDA award, "Apply or Die" game) | UX and visual design | Hierarchy, feedback, delight, consistency | The demo itself, at 1280×720, no console errors; the design rules (one primary action per screen, ≥16 px, ≥44 px targets). She built a game-based product: speak her language. |
| **Mi Le Hagen**, digital marketing lecturer (ex Google, LEGO) | Marketing, reach | How does it spread? Who tells whom? | The friend-challenge link; the guest game with nothing installed; one sentence on go-to-market via course coordinators and study groups. |

Takeaway: this jury is **nine lenses, not one rubric**. A pitch that only shows the fun loses the founders, the hacker and the
lawyer; a pitch that only talks business loses Opera's creative lead and the designer. Both decks must hit every lens at
least once, in the order of their weight for that round (round 1: wow + product + security; final: add business, proof and team).

---

## 1. What wins hackathons: the research, boiled down to rules

Synthesised from judge write-ups, organiser rubrics, winner retrospectives and pitch-coaching guides (sources at the end).
Each rule is paired with what it means for Spark.

| # | Rule (what the evidence says) | Applied to Spark |
|---|---|---|
| 1 | **The demo is the pitch.** Judges score what runs; "here's what it does" beats "here's what it would do"; slideware does not win (Klaviyo judges, AngelHack, dabit3). | ≥50% of both decks is the live product. Slides are backdrops between demo beats. |
| 2 | **Say what it is in the first sentence.** YC's own Demo Day guide: delaying "what you do" is "always a mistake". A judge forms a view in the first 15–30 s. | Line 1: "Spark turns any web page into a monster you beat by teaching an ink creature the page's ideas." Then the monster appears. |
| 3 | **Specific problem, specific person.** Vague problems are forgotten by the next team. The earlier judge-style review scored "Client" 3/10 because no first user or buyer was named. | Name the user (a first-year science student revising from AI answers) and the buyer (the course coordinator). One sentence, slide 1. |
| 4 | **Map every beat to a scoring lens.** Teams lose points by ignoring criteria. This jury judges by field. | The jury table above is the checklist. Each slide lists which juror it is for. |
| 5 | **One or two polished features beat five flaky ones.** An SIH winner kept two features; the runner-up's five included three that crashed. | Round 1: the 60-second moment + one glimpse of the loop. Final: add the loop live. Nothing else. |
| 6 | **Plan for the demo to fail.** Record the demo twice; walk it five times looking for breaks; pivot calmly to the recording. | Offline demo mode (no Wi-Fi needed), a recorded MP4 of the exact run, a second laptop with the same profile. |
| 7 | **Respect the clock.** Going over is the most common complaint; judges stop listening. | Scripts timed to 1:50 and 4:40 with marked cut points. |
| 8 | **Don't drown them in tech.** Judges want value, not architecture. One line of credibility is enough. | Tech is one line in round 1, one slide in the final (for de Vibe and Christensen). |
| 9 | **Don't overclaim.** Separate measured from expected; no made-up accuracy or market numbers. | Learning-science effect sizes quoted with authors; our own numbers labelled "measured in our tests"; no "retention up 40%". |
| 10 | **Know the judges and the sponsor.** A team that re-angled for the panel placed; sponsor alignment matters. | Opera pays the prize and seats two jurors. Opera shipped **Web AI** on 22 Oct 2026 with a sample extension, **"Got It?"**, that quizzes you on the article you just read. Spark is the deep, playful version of that idea and already runs Blot on Web AI. Say it. |
| 11 | **Rehearse against the clock with a judge-like audience; assign Q&A roles.** | Two full dress runs Sunday morning; one person owns user/business questions, one owns tech/security. |
| 12 | **End with a concrete ask, not "thank you".** Competitor closes with a pilot ask. | "One tutorial group, one week, we measure second-round completion." |

What the research does **not** support: long problem monologues, a team slide early, architecture diagrams in a 2-minute slot,
unsourced percentages, reading text off slides. (One guide notes judges "detect" text-heavy slides and tune out.)

---

## 2. Positioning decisions to make before building

**One-liner (pick one; A is recommended):**
- A. "Spark turns any web page into a monster. You beat it by teaching Blot, a small ink creature, what the page means. If you can't explain it, you can't win."
- B. "AI answers end curiosity at the answer. Spark starts it there." (current tagline; strong as a closing line, weak as an opener because it doesn't say what the product is)
- C. "Duolingo for anything you read on the web."  (clear but invites the Duolingo comparison; use only if a founder asks "what is it like?")

**The problem, with evidence we can stand behind:**
- Bastani et al. (PNAS 2025, ~1,000 high-school students): unrestricted ChatGPT raised practice scores 48% but, with access removed, students did **17% worse** on the exam than those who never had it; a tutor that guided reasoning instead of giving answers removed the harm. → "Getting the answer is not learning. Explaining it is."
- Studiebarometeret 2025 (cited by Kristiania): over 80% of Norwegian students have used GenAI tools.
- Learning by teaching: Fiorella & Mayer (2015) median d ≈ 0.7 for study-then-teach vs study alone; Kobayashi (2019) meta-analysis g = 0.56 for actually teaching, 0.35 for merely preparing to teach. Chase et al. (2009): learners work harder when a tutee depends on them (the "protégé effect"). → Blot is a teachable agent, by design, and the player knows up front they must teach (the effect vanishes when teaching is sprung on people afterwards).

**The user and buyer (say in the first 20 seconds):** first-year science students revising from articles and AI explanations; the buyer is the course coordinator running weekly tutorials. Market framing for the final only: 323,595 students in Norwegian higher education (SSB, 2025), 263,038 pupils and apprentices in upper secondary (SSB, 2025), 269 million tertiary students worldwide (UNESCO, 2024).

**Why now (final only):** Opera shipped Web AI on 22 Oct 2026 ("Prompt, Decision and Semantic Embeddings APIs", "no API key", page data "can stay on their device"), Chrome has the same Prompt API, and study-mode products (ChatGPT Study Mode, NotebookLM) have made "learn from a source" mainstream but still hand over answers. Spark is the first that makes you teach.

**Moat statement (judge review, adopted):** the learner's growing record of which ideas they can explain, where they go wrong and what they still remember, made visible in a companion that changes with that history.

**Business model (final only, keep to one slide):** free to play; Spark Plus at a Quizlet-Plus-level price (Quizlet Plus is ~US$7.99/month; Duolingo Super ~US$6.99/month) for unlimited real pages and flashbacks; course licences per seat for coordinators. State it as a hypothesis, not a forecast.

**The Opera angle, said once and precisely:** "Blot already runs on Opera Web AI, on the laptop: Blot's replies, the live bars and the taunt never leave the device. The extension loads unchanged in Opera." This depends on PR #1 (`yufei/webai-on-device`) being merged and working on the demo laptop with Opera One and Web AI enabled. If it isn't, cut the sentence; never claim it.

**What we don't say:** "AI-powered" without saying what the AI does; any retention percentage of our own; "no competitors"; "we're like Kirby".

---

## 3. The demo plan (shared by both decks)

The product is the slide. Everything below is what the audience sees on the projector between slides.

| Beat | URL / action | Time | Notes |
|---|---|---|---|
| D1 The page becomes a monster | `game.html?demo=stage&fast=1&teach=90` → **Turn into a monster** | 6 s | Words lift off, name, body, five attacks. The single most memorable 6 seconds we have; the first slide is nothing but a title so this gets the whole screen. |
| D2 Teach the fifth idea | **Teach Blot**; four ideas are already ticked "taught for you"; type one sentence for the glowing fifth (pre-written on a card: "Coast shapes tides: a funnel-shaped bay squeezes the same water higher.") | 15 s | The judge-style review noted jurors type slower than automation; the presenter types, not the juror, in round 1. |
| D3 The bout | Ring the bell twice | ~20 s at `fast=1` (30–45 s at normal demo speed) | Idea names slam on hits; the backfire quotes what Blot believed; K.O. ink burst. |
| D4 Eating and the trait | automatic | 4 s | Letters stream into Blot's mouth; a trait appears. |
| D5 The loop (round 1: one tab; final: three tabs) | Presenter kit `game.html?seed=presenter` in a fresh profile, tabs pre-opened: day-4 **Your Blot** (fading memory, insights), **Remind Blot** flashback, the **returning monster** reveal, the **friend's challenge** | 20–60 s | Say "the clock is simulated" out loud. |

Measured: the stage run reached the replay in ~70 s at normal speed in the judge review's browser run; `fast=1` cuts the bout to seconds (smoke:demo --fast reaches the replay in 18 s). **Decision:** round 1 uses `fast=1`; the final uses normal demo speed for the bout (it reads better from a stage) but `fast=1` for anything repeated.

Fallbacks, in order: (1) offline demo mode needs no network at all, so Wi-Fi is not a risk; (2) a screen recording of the exact run, two takes, on both laptops and a phone; (3) screenshots in the deck for every beat (`docs/shots/`). The rule from the research: a calm "let me show you the recording" costs nothing; a painful live recovery does.

---

## 4. PAGE 1: the 2-minute mini-pitch (Sunday 14:15–17:00, jury only, +1 min Q&A)

**Goal of this round:** be one of the 10. The jury sees ~40 teams in under three hours; memory and clarity beat completeness.
**Shape:** hook (15 s) → live demo (65 s) → the loop in one glance (25 s) → who, why us, ask (15 s). Slides: 6, mostly full-bleed. Target 1:50.

| # | Time | Slide (what's on screen) | Spoken line (≈ words) | Juror lens |
|---|---|---|---|---|
| 1 | 0:00–0:15 | **Title.** "Spark" + logo on paper; one line under it: *Turn any web page into a monster. Beat it by teaching.* Optional small line: the kickoff challenge, if Spark fits it. | "Spark turns any web page into a monster. You beat it by teaching Blot, a small ink creature, what the page means. It's for students revising from AI answers, because getting the answer isn't learning: explaining it is." (≈45) | Mansfeldt, founders (user named) |
| 2 | 0:15–1:20 | **Live demo** (D1–D4). Slide is just a frame; the product fills the projector. | "This is a real article on tides. Watch its own words lift off." (reveal) "Four ideas are taught; I'll teach the fifth in my own words." (type, bell) "Blot fights with only what it was taught. An idea taught wrong backfires. An idea never taught fizzles." (K.O., eating) "It eats the monster and keeps a trait." (≈70) | Lexow, Claussen, Mansfeldt |
| 3 | 1:20–1:45 | **"Four days later."** One screenshot strip or one pre-opened tab: Your Blot with a fading memory, the flashback question, the monster coming back. | "What you taught fades unless you can still explain it. Four days later Blot asks you again; a good answer earns a power-up, a missed idea brings the monster back. A link lets a friend's Blot fight yours." (≈45) | Holt/Westbye (moat), Hagen (spread) |
| 4 | 1:45–1:55 | **"Built this weekend, safely."** Three icons: *Runs in Chrome and Opera · Nothing leaves the browser without your yes · Blot thinks on your laptop with Opera Web AI* (last item only if PR #1 is live). | "Built here in 48 hours: a Chrome and Opera extension, nothing sent without consent, and Blot's replies run on the device with Opera's new Web AI." (≈30) | Christensen, Koefoed, Lexow |
| 5 | 1:55–2:00 | **The ask.** "One tutorial group. One week. We measure who comes back." + team names. | "We're asking for one tutorial group for one week. We're Spark." (≈15) | founders |

**Cut point if over:** drop slide 3's third sentence (the friend link). **If under:** nothing; stop early, it reads as confidence.

**The 1-minute Q&A, prepared answers (one owner each):**
- *Who pays?* (founders) Course coordinators per seat; students free, Plus for real pages. Hypothesis, to be tested in the pilot.
- *What's the AI doing?* (tech) Claude extracts five ideas and grades the teaching against the page only; Blot's chat and live bars run on-device in Opera; everything is a structured output and treated as data.
- *What leaves my browser?* (security) Nothing until you press "Send and continue" on a notice that shows exactly what goes; the server binds to loopback; URLs are stripped of tokens; page text is held two hours.
- *Is this not just a quiz app / NotebookLM / Study Mode?* Those give answers. Spark makes you give them, and remembers what you couldn't.
- *Does it work on a page in Norwegian?* Yes, `sove` is a Norwegian demo page; Blot answers in the page's language.
- *What breaks?* Honest: a page with no clear structure gets a weaker monster; the offline grader is word-matching and says so.

---

## 5. PAGE 2: the 5-minute final (18:00, stage, jury + audience)

**Goal of this round:** win. The jury now compares ten teams on everything: product, business, team, proof. The audience is in the room, so the show matters more, and so does a story.
**Shape:** hook (30 s) → full live demo at normal speed (85 s) → the loop live (70 s) → why it works, evidence (30 s) → Opera, privacy, security (35 s) → market and model (35 s) → what we built and who we are (20 s) → ask (15 s). Slides: 11. Target 4:40. Trims marked for 4:00 and 3:00.

| # | Time | Slide (what's on screen) | Spoken line (the beat, not verbatim) | Juror lens |
|---|---|---|---|---|
| 1 | 0:00–0:30 | **Title**, then a single stat: *"Students with unrestricted ChatGPT scored 17% worse once it was taken away." Bastani et al., PNAS 2025.* | The hook: everyone in this room learns from AI answers now. The answer arrives; the understanding doesn't. "Spark turns any page into a monster you can only beat by explaining it." Name the student and the coordinator. | all |
| 2 | 0:30–1:55 | **Live demo** D1–D4 at normal speed (bout 30–45 s). | Same narration as round 1, slower, with one laugh line at the backfire ("that's what happens when you half-know something"). | Lexow, Claussen, Mansfeldt |
| 3 | 1:55–3:05 | **The loop, live:** day-4 Your Blot → Remind Blot (answer the flashback) → the returning monster's reveal (weak idea glowing, others locked) → the friend's duel result. | "Teaching once isn't enough. What you taught fades" (show), "Blot asks again" (answer, power-up), "the monster comes back for the idea you were weakest on" (reveal), "and your friend's Blot can fight yours" (duel result). "Spark remembers what you couldn't explain. That record is the product." | founders (moat), Hagen (spread) |
| 4 | 3:05–3:35 | **"Why it works"**: three lines with authors. *Teaching beats studying (Fiorella & Mayer 2015, d≈0.7; Kobayashi 2019, g=0.56) · Learners work harder for a tutee (Chase 2009) · Guided AI protects learning; answer-giving AI harms it (Bastani 2025).* | "We didn't invent the learning science; we built a game around the strongest effect in it: you learn what you teach. Blot is a tutee you're responsible for." | founders, Koefoed (credibility) |
| 5 | 3:35–4:10 | **"In the browser, on your machine."** Left: Chrome and Opera logos, "loads unchanged". Right: the pill *"Blot is thinking on this laptop"* + *Opera Web AI, 22 Oct 2026*. Bottom row (security): *consent first · loopback only · URLs cleaned · page text is data, never instructions · nothing kept beyond 2 h · no accounts, no ads, Clear my data.* | "Opera just shipped Web AI so extensions can use AI on the device. Blot's chat and live bars already run there; what you type stays on your laptop until the bell rings. The server only sees what you approved, binds to localhost, and treats every page as data, not instructions." | Lexow, Christensen, Koefoed |
| 6 | 4:10–4:35 | **Market and model.** *323,595 students in Norwegian higher education · 263,038 in upper secondary (SSB 2025) · 269 M worldwide (UNESCO 2024).* Model: *Free to play · Plus (~79 NOK/mo, Quizlet-level) for real pages and flashbacks · course licences per seat.* | "Start with first-year science courses at BI and UiO; sell to coordinators who already fight the 'students outsource understanding' problem. Priced where Quizlet and Duolingo already are." Say "hypothesis". | founders, Nordvold, Hagen |
| 7 | 4:35–4:50 | **Built in 48 hours.** *Chrome MV3 extension · Node server · Claude for ideas and grading · Opera Web AI on-device · 108 tests, 5 Playwright smokes, CI green · offline mode · 5 demo pages incl. Norwegian.* Team: four names, one word each. | "All of it built here, with AI tools, tested on every push." (de Vibe gets his line.) | de Vibe, organisers ("vibe-coding") |
| 8 | 4:50–5:00 | **The ask.** *One tutorial group, one week. Measure: second-round completion within 7 days.* Closing line: "AI answers end curiosity at the answer. Spark starts it there." | | founders |

**Trims:** to 4:00, demo at `fast=1` (saves ~25 s) and merge slides 6 and 7. To 3:00, also cut the duel from slide 3 and slide 4 to one line.
**Audience moment (optional, if the stage format allows):** invite one juror to type the fifth idea in round 2. The stage round was built for that (four ideas pre-taught, K.O. guaranteed with a reasonable sentence). Only do it with normal speed and 90 s on the timer.

**Final-round Q&A bank (beyond the round-1 list):**
- *Why would a coordinator pay rather than tell students to use ChatGPT Study Mode?* Study Mode guides toward the answer; Spark records what each student could not explain, per idea, over weeks: that is a teaching signal coordinators don't have today.
- *Defensibility?* The per-learner history and the companion that wears it; plus the browser entry point (any page, selected AI answer), which a study app can't offer.
- *Copyright of page text?* Processed to extract ideas and grade teaching, like a reader; never stored beyond two hours, never republished; the source link goes back to the page.
- *Minors / GDPR?* No accounts, no analytics, no ads; data stays in the browser; consent before any send; Clear my data erases everything. (Koefoed may push: say "we'd need a DPIA before a school pilot" and leave it.)
- *Prompt injection?* Page text is wrapped as data with brackets neutralised, outputs are strict schemas, source URLs validated against the page's own link list. Christensen may ask for the demo of a hostile page; have `demo/pages/ai-answer.html` ready and know its "what padlock doesn't promise" idea.
- *Cost per round?* Two Claude calls on the server (extract, examine); everything else on-device or cached. Give a rough NOK number only if asked.
- *What didn't you finish?* Be honest: the offline grader is word-matching; the friend duel is a link, not accounts; one language model, no fine-tuning.

---

## 6. Deck design spec (both pages)

- **Format:** 16:9 at 1280×720 (the demo is tuned for it); export PDF as backup. Fonts ≥ 30 pt body, ≥ 60 pt headlines (Kawasaki's floor; the back of the room must read it).
- **Look:** the game's own world, so the slides and the product feel like one thing: paper background, ink text, ink-glow accent, the Spark logo, Blot as the only mascot. No stock photos, no gradients, no bullet walls. One idea per slide; the slide is a caption for what the presenter says, never the script.
- **Demo slides:** a thin paper frame with the slide number and nothing else, so the switch to the browser doesn't jolt.
- **Screenshots:** take fresh at 1280×720 from `docs/shots/` (`loop-05-your-blot`, `loop-06-flashback`, `loop-08-comeback`, `loop-15-duel-result`, `03-monster`, `09-bout`, `10-eating`, `11-trait`).
- **Sources on-slide:** author and year only (Bastani 2025); the full list lives in this file.
- **Speaker notes:** the spoken lines above, with the timings, in the notes of every slide.
- **Clicker-proof:** no builds or transitions that need a second click; every slide is one click.

---

## 7. Runbook for Sunday

| When | What |
|---|---|
| By Sat night | Decide: PR #1 in or out of the demo (test on the demo laptop with Opera One, Web AI enabled). Freeze `main`. Record the demo twice. |
| Sun 09:00 | Two laptops with identical fresh profiles: tab A `?demo=stage&fast=1&teach=90`, tab B the presenter kit (`?seed=presenter`), tabs C–F the day-4 pages. First-use notice accepted. Sound on, volume tested on the room's speakers. Reduced-motion off. |
| Sun 10:00 | Dress run 1 against the clock with someone not on the team playing a founder and a security juror. Fix. |
| Sun 12:00 | Dress run 2. Lock the script. Print the fifth-idea sentence on a card. |
| 14:00 | Deliver the product (link + repo + the recorded demo). |
| 14:15–17:00 | Round 1. Arrive with both laptops awake, HDMI/USB-C adapter in hand, browser in full screen, nothing else open. |
| 17:00–18:00 | If finalists: switch to deck 2, swap bout speed to normal, rehearse once more quietly. |

**Risk register:** projector resolution not 1280×720 (test at 09:00; the game works at 640×480 and on phones, checked by CI); audio muted by the venue (the K.O. still reads without sound); a juror types a wrong sentence in the stage round (Blot can lose: say "and that's the point" and show the rematch button); Opera Web AI model not warmed (opens during the reveal; if the pill doesn't show, don't mention it).

---

## 8. Inputs needed from you before the build

1. The kickoff's main challenge and side challenges, verbatim (and whether Spark is entered for Wybe's or Holio's).
2. Team: names, one-word roles, who presents which beat, who owns which Q&A.
3. Is PR #1 (Opera Web AI on-device) merged and working on the demo laptop? (Decides slide 4 / slide 5 wording.)
4. The final's actual time limit, when the organisers announce it at 17:00 (the plan trims to 3 or 4 minutes).
5. Any pilot conversation already had (a coordinator's name turns the ask from a request into traction).

---

## 9. Sources

**Event and jury:** [oslosprint.org](https://oslosprint.org/) (program, rules, FAQ), [oslosprint.org/juryen](https://oslosprint.org/juryen), [oslosprint.org/sponsorer](https://oslosprint.org/sponsorer); competitor pitch script: [AkodLA/the-click](https://github.com/AkodLA/the-click).
**Opera:** [Web AI: Local AI for the web, now in Opera (22 Oct 2026)](https://next.opera.com/blog/web-ai-local-ai/), [Web AI playgrounds and example extensions](https://next.opera.com/web-ai), [Opera ships Opera Neon](https://investor.opera.com/news-releases/news-release-details/opera-ships-opera-neon-ai-agentic-browser), [Opera's agentic-browser vision](https://blogs.opera.com/news/2025/07/why-ai-agentic-browsers-will-create-massive-productivity-gains-opera-neon/).
**How hackathons are won:** [How to Win a Hackathon, from a judge, mentor and participant](https://medium.com/thecapital/how-to-win-a-hackathon-from-a-judge-mentor-and-participant-perspective-b7bfe9cd20a1), [How to Give a Killer Pitch or Hackathon Demo (dabit3)](https://gist.github.com/dabit3/caef5eee4753dd7d23767bc31e70da28), [AngelHack: 10 tips for your demo](https://angelhack.com/blog/10-tips-to-help-you-rock-your-next-hackathon-demo/), [AngelHack: what repeat winners do](https://angelhack.com/blog/hackathon-tips-for-winners/), [Klaviyo: how to win an AI hackathon](https://klaviyo.tech/how-to-win-an-ai-hackathon-build-a-solution-that-actually-matters-aab49307587e), [SIH winner's retrospective](https://blogs.reskilll.com/what-i-learned-building-under-pressure-sih-winners-honest-retrospective/), [Reskilll: pitch in 3 minutes](https://reskilll.com/blogs/hackathon-demo-presentation-tips-pitch-3-minutes-win-2026/), [Colosseum: perfecting your submission](https://blog.colosseum.com/perfecting-your-hackathon-submission/), [HackHQ judging rubric](https://hackhq.io/planning-guide/judging), [HackathonHost judging criteria](https://hackathonhost.com/articles/hackathon-judging-criteria), [Reskilll: what judges look for](https://blogs.reskilll.com/what-hackathon-judges-look-for-complete-judging-criteria-breakdown-2026/), [Hacktribe: 5-minute deck structure](https://hacktribe.co/blog/how-to-build-a-hackathon-pitch-deck-practical-5-minute-structure), [Inknarrates: decks judges remember](https://www.inknarrates.com/post/hackathon-pitch-deck), [Jorge Ferreiro: pitch, judging and follow-up](https://jorgeferreiro.com/blog/part-4-pitch-hackathon-idea-and-followup), [HackerEarth: 10 tips](https://www.hackerearth.com/blog/10-tips-win-hackathon), [Mercari winner: explain it in three sentences](https://lostviolinist.medium.com/winning-and-losing-heres-what-i-learnt-from-hackathons-and-startup-competitions-ed328641c52d), [Browser-use: how to win hackathons](https://browser-use.com/posts/how-to-win-hackathons).
**Pitch craft:** [Guy Kawasaki: the only 10 slides](https://guykawasaki.com/the-only-10-slides-you-need-in-your-pitch/), [YC Demo Day guide (as quoted)](https://echai.ventures/startingup/r/a-guide-to-demo-day-presentations--h1-r079), [LTSE: Demo Day tips from YC founders](https://ltse.com/insights/demo-day-tips-from-past-yc-founders), [TechCrunch Disrupt 60-second demo tips](https://ellemorrill.substack.com/p/tips-for-your-60-second-techcrunch-disrupt-demo), [SlideModel: hackathon presentations](https://slidemodel.com/hackathon-presentation/).
**Learning science and AI:** [Bastani et al., Generative AI Can Harm Learning (PNAS 2025, preprint)](https://static1.squarespace.com/static/64398599b0c21f1705fb8fb3/t/66c7e970ae81b81a53295abc/1724377456931/ssrn-4895486+(4).pdf), [Knowledge at Wharton summary](https://knowledge.wharton.upenn.edu/article/without-guardrails-generative-ai-can-harm-education/), [ChatGPT as a cognitive crutch, 45-day retention RCT](https://www.sciencedirect.com/science/article/pii/S2590291125010186), [Kobayashi 2019, Learning by preparing-to-teach and teaching: a meta-analysis](https://onlinelibrary.wiley.com/doi/10.1111/jpr.12221), [Fiorella, Learning by Teaching (overview, UNH)](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-learning-by-teaching-fiorella.pdf), [The protégé effect (Chase et al.) overview](https://thelearnerlab.com/protege-effect/), [Nestojko, Bjork & Bjork 2014 (expecting to teach)](https://www.researchgate.net/publication/259823658_Role_of_Expectations_and_Explanations_in_Learning_by_Teaching), [Norwegian students and GenAI (Kristiania / Studiebarometeret)](https://aisel.aisnet.org/cgi/viewcontent.cgi?article=1006&context=siged2025).
**Market and pricing:** [SSB: students in higher education 2025](https://www.ssb.no/utdanning/hoyere-utdanning/statistikk/studenter-i-hoyere-utdanning), [SSB: upper secondary 2025](https://www.ssb.no/utdanning/videregaende-utdanning/statistikk/videregaende-opplaering-og-annen-videregaende-utdanning), [UNESCO global enrolment 269 M (2024)](https://www.aacrao.org/edge/emergent-news/global-he-enrolment-reaches-269-million-as-student-mobility-triples/), [Quizlet Plus pricing (third-party check of quizlet.com, Sep 2026)](https://brighterly.com/blog/quizlet-cost), [Duolingo Super pricing](https://www.thepricer.org/how-much-does-super-duolingo-cost/).

Unverified or secondary: the final's pitch length (not published); Kobayashi's study count (28 vs "39" in blogs); Quizlet and Duolingo prices (third-party trackers); the MIT "Your Brain on ChatGPT" EEG preprint (small N, not used on any slide).
