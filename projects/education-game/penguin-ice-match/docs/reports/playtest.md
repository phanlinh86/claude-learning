# Tuk's Ice Match — high-speed playtest report (2026-11-11)

Report-only: nothing in `game/` was changed. All proposals below were re-simulated **inside the sim** (CONFIG copies,
voice-policy options and prototype patches in `tests/sim/pt_tuk_kids.js`), never in the game.

## How it was tested
| run | what | size |
|---|---|---|
| `node tests/sim/pt_tuk_kids.js --name base --n 6 --nb 20` | headless world (`tests/unit/load.js` pattern) · bots skill 0.3 / 0.6 / 0.9 × ages 3–7 · child models typical, toddler, slow3, tapper, **rubR** (random long swipes), **rubT** (typical child who plays every pair as a swipe A → B), **spamAll** (taps every 0.06–0.22 s in every phase incl. deal / peek / hide / resolve / glide, 25 % rub strokes), **dreamy** (looks away 15–45 s after each move), **absent** · en + vi × 4 viewports (iPhone P/L, iPad P/L) | **4 360 sessions** (2 400 bot, 1 920 child, 40 absent), 1 455 s wall |
| same harness, **voice model** in every session | mirror of `main.js onEvent` + `voice.js` (queue ≤ 2, stale 5 s, interrupt, prompt protection 0.3 s + 72 ms/char, name throttles) with the real `IM.I18N` lines, TTS 0.3 s + 72 ms/char | all sessions |
| `node tests/sim/pt_tuk_voice_browser.js A` | the **real page** at `?speed=8&bot=1&autostart=1&mute=1`, ages 3 / 4 / 5 / 7 × en / vi, iPhone portrait touch context; every `IM.Voice.say` tagged with the event being handled; child name "Lan" saved in settings | 8 whole sessions, 0 errors |
| `node tests/sim/pt_tuk_voice_browser.js B` | the real page at speed 1, not muted, **fake speechSynthesis** (same 0.3 s + 72 ms/char, real cancel/onend) → the real `voice.js` queue decides each line's fate | 4 whole sessions (4 en, 4 vi, 3 vi, 7 en) |
| re-sims | `rub_base/rub_prop` (720 + 720), `v0/v1/v2/v3` voice policies (4 × 576), `fish_base/fish_prop` (2 × 432), `soft_*` (3 × 384) | |
Outputs: `tests/sim/out/pt_tuk_kids_*.md|json`, `tests/sim/out/pt_tuk_voice_browser.md|json`.

## 1. Numbers (base, current game)

### Durations (s) — targets: toddler chapter 60–100, session ≤ 480
| driver | age 3 chapter / session mean / p90 | age 4 | age 5 | age 7 |
|---|---|---|---|---|
| bot 0.3 | 74 / 303 / 319 | 77 / 316 / 335 | 90 / 368 / 392 | 95 / 389 / 421 |
| bot 0.6 | 63 / 261 / 271 | 65 / 268 / 277 | 75 / 306 / 320 | 86 / 352 / 372 |
| bot 0.9 | 58 / 242 / 249 | 59 / 244 / 250 | 67 / 275 / 283 | 75 / 306 / 320 |
| **typical** | 95 / 390 / 411 | **92 / 374 / 397** ✓ | 95 / 386 / 403 | 92 / 377 / 405 |
| **toddler** | **94 / 383 / 414** ✓ | **94 / 386 / 411** ✓ | 99 / 404 / 434 | 109 / 443 / 500 |
| slow3 | 110 / 446 / **493** ✗ | 119 / 486 / **533** ✗ | 148 / 598 / 650 | 188 / 759 / 841 |
| tapper | 99 / 406 / 452 | 100 / 406 / 464 | 116 / 474 / 537 | 155 / 626 / 728 |
| spamAll | 60 / 249 / 266 | 65 / 267 / 287 | 82 / 334 / 364 | 94 / 385 / 438 |
| rubR | 92 / 376 / 446 | 102 / 417 / 504 | 124 / 503 / 620 | 175 / 710 / 971 |
| **rubT** | 96 / 357 / 397 (**12/48 not finished in 25 min**) | 108 / 351 / 382 (12/48 unfinished) | 147 / 589 / 1000 (30/48 unfinished) | 184 / 687 / 989 |
Round mean (typical 4) 19.6 s (p90 27.6); bots 11.6–23.8 s.

### Help, stars, integrity (age 4; other ages in `pt_tuk_kids_base.md`)
| driver | mismatch / round | rounds with a hint | idle nudges / round | 3★ / 2★ / 1★ rounds | session ★ (max ≈ 52) |
|---|---|---|---|---|---|
| bot 0.3 / 0.6 / 0.9 | 1.0 / 0.3 / 0.0 | 9 % / 0 % / 0 % | 0 | 84/16/1 · 99/1/0 · 100/0/0 % | 46 / 50 / 52 |
| typical | 0.8 | 5 % | 0.0 | 89 / 11 / 0 % | 49 |
| toddler | 1.7 | 22 % | 0.0 | 63 / 36 / 1 % | 43 |
| slow3 | 1.6 | 20 % | 0.2 | 66 / 31 / 3 % | 34 |
| tapper / spamAll | 3.4 / 3.9 | 51 % / 49 % | 0 | 44/32/24 · 43/35/22 % | 31 / 36 |
| rubR / rubT | 6.0 / 4.1 | 48 % / 26 % | 0 | 43/25/32 · 60/35/4 % | 34 / 33 |
| dreamy | 0.8 | 92 % (idle glow) | 3.7 | 84 / 15 / 0 % | 37 |
All 4 360 sessions: **0 NaN, 0 exceptions, 0 "no block can be turned" stuck states, 0 event-order errors** (every match was
`match → clink → melt(a) → melt(b) → reward`, fish `leap k = 1..n` in order with n splashes, every homes animal got
`homeArrive`). Rounds > 180 s: only rubT (15–55 per 48 sessions) and dreamy (by construction). spamAll: 0 reveals from
17 752 taps during deal, 46 916 during peek, 7 457 during hide, 28 009 during resolve/glide, 1 699 during the slide surprise;
reveals while a mismatch shows only after the 0.5 s third-tap delay — input gating is solid.
Absent child: first nudge 12 s into play, gaps 18 / 27 / 30 / 30 s (back-off ✓), idle glow from nudge 2, auto-pause at the 5th
(≈ 117 s into play) in 40 / 40.

### Voice (base) — model and real page agree
| | lines started / min | Tuk talking | 1st block name heard fully | 2nd name heard | count lines ("One, two, three fish!") heard | match line heard | prompts cut |
|---|---|---|---|---|---|---|---|
| model · typical 4 | 35.4 | 86 % | 54 % | **0 %** | **13 %** | 53 % | 0 |
| model · toddler 4 | 39.4 | 88 % | 30 % | 0 % | 6 % | — | 0 |
| model · slow3 4 | 24.8 | 70 % | 94 % | 0 % | 38 % | — | 0 |
| **real page, fake TTS** · age 4 en / 4 vi / 3 vi / 7 en | 43.0 / 43.5 / 41.1 / 46.4 | 91 / 92 / 91 / 91 % | 19 / 12 / 3 / 33 % | **0 %** | 0 / 0 / – / 9 % | 38 / 40 / 44 / 25 % | **0** |
| real page, speed 8 (requests only) | 41–47 requests per game minute at every age/lang | | | | count requests: age 4: 11, 5: 13, 7: 34 per session | | |
Line fate by kind (all present drivers, base): name 14 % heard / 86 % cut · match 38 % · mismatch 6 % · **hint 1 % (94 %
dropped)** · **surprise 27 % (47 % dropped)** · peek 44 % · praise 78 % · prompt 96 % (cuts only by bots/tapper/spam:
`prompt < name` 2 527 of 63 701, all from a prompt that waited in the queue — its protection window starts at the *request*).
Real page: vi lines say "Túc" 4/4 (bubble keeps "Tuk"), the child's name is in 6–16 praise lines per session, no
console errors, all 8 speed-8 sessions finished.

Example (real page, age 4 en, fates from the real voice.js queue):
```
  7.7 name1  interrupted  Red!
  7.8 name2  interrupted  Red!
  8.2 match  interrupted  Two red fish! A pair!
 19.0 name1  end          Purple!
 19.9 name2  interrupted  A purple fish!
 20.3 match  interrupted  Purple and purple! A pair!     ← cut by the next block's name
 21.4 name1  interrupted  A green fish!
```

## 2. Issues

### P1-1 Voice: Tuk talks ~90 % of the time and the lesson words are cut off
The 2nd block's name is requested on every pair and is **never** heard (the match/mismatch line follows 0.38 s later with
`interrupt`), the 1st name is cut by the 2nd flip, the count line is heard 6–15 % for 4-year-olds, the hint and surprise
lines are mostly dropped. A child hears "One, two, thr— Fi— Five and five fi— A green fish!". Too much talk, and the
important words lose.

**Proposed `game/js/main.js` changes** (re-simulated as policy *v3*; *v1* = same without (b2)/(d)):
- (a) `case 'flip'`: after the burst / `lastPraise` lines add `if (e.open === 2) { idleSaid = 0; break; }` — no 2nd name
  (the match / mismatch line names both blocks). Before the 1st name: `idleSaid = 0;` and set
  `nameUntil = performance.now() + 300 + 72 * line.length;` (new `let nameUntil = 0;`, `const canCutName = () => performance.now() > nameUntil;`).
- (b) `case 'match'`: `{ interrupt: true }` → `{ interrupt: canInterrupt() && canCutName() }` (b1: queue behind the 1st name;
  b2: never cut a running prompt). `case 'mismatch'`: drop the `nowW - lastWrongSay > 1500` throttle (it is now the only line for
  the 2nd block) and use `{ interrupt: canInterrupt() && canCutName() }`.
- (c) prompt protection from the real end: `function speak(text, opt) { if (!text) return; if (IM.Voice) return IM.Voice.say(text, opt || {}); }`
  and `function speakPrompt(txt, opt) { promptUntil = Infinity; const p = speak(txt, opt); if (p && p.then) p.then(() => { promptUntil = performance.now() + 150; }); else promptUntil = performance.now() + 300 + 72 * (txt || '').length; }`.
- (d) `case 'golden'`: `{ interrupt: true }` → `{ interrupt: canInterrupt() }` (it cut 40 prompts in v1).
- (e) `case 'peek'`: delete `speak(T('peek'))` (heard fully 44–62 %, usually after the peek is over; the prompt already says what to do).
- (f) `case 'round'`: `speakPrompt(txt + (e.surprise ? ' ' + T('surprise.' + e.surprise) : ''), { priority: true })` and delete the separate
  `speak(T('surprise.' + e.surprise))` (47–50 % dropped by the queue today).
- (g) hint after a mismatch: `handleEvents` → `evs.forEach((e, i) => onEvent(e, evs[i + 1]))`; in `case 'mismatch'`:
  `if (next && next.type === 'hint' && !next.idle) break;`; `case 'hint'`: `if (!e.idle) speak(T('hint'), { interrupt: canInterrupt() && canCutName(), priority: true });`.

| policy (sim, 576 sessions each) | lines / min typical 4 | Tuk talking | 1st name heard | count lines heard | match heard (all) | hint heard | prompts cut (typical 4 / all) | dreamy false pauses | max name delay |
|---|---|---|---|---|---|---|---|---|---|
| v0 = today | 35.6 | 86 % | 54 % | 15 % | 53 % | 2 % | 0 / 148 | 96 / 96 | 0 s |
| v1 = (a)(b1)(c)(e)(f)(g) | 24.8 | 79 % | 99 % | 99 % | 53 % | 26 % | 2 / 250 | 0 / 96 | 1.6 s |
| **v3 = v1 + (b2)(d) + matchGuard 1.2 s** | **24.6** | **79 %** | **98 %** | **98 %** | **57 %** | 26 % | **2 / 93** | **0 / 96** | 1.7 s |
| v2 = v1 + names wait for a whole match line | 24.1 | 81 % | 92 % | 93 % | 76 % | 25 % | 5 / 278 | 0 / 96 | 2.2 s |
matchGuard (optional, v3): in `case 'flip'` the 1st name uses `interrupt: canInterrupt() && performance.now() > matchUntil` with
`matchUntil = performance.now() + 1200` set on `match` (the "Five and five fish!" part is heard; the name waits ≤ 1.2 s).
Remaining talk is mostly the child's own pace (one name + one match line per pair). Update `tests/unit/i18n_voice.test.js`
/ functional tests that expect a name line on every flip.

### P1-2 Rubbing reveals the block you pass over, not the one you aim at
`pointerMove` reveals any frosted block the finger **enters**. A child who drags from a remembered block A to its partner B
(very common at 3–5: they slide instead of lifting) reveals whatever lies between: in rubT **79–82 % of aimed swipes revealed
a different block**, and the same plan repeats after the hint → loops: 15–55 rounds > 180 s per 48 sessions, 12–30 of 48
sessions unfinished after 25 min at ages 3–5. Rubbing does not make memory trivial (rubR random swipes reveal ≤ 2: 0 / 1 / 2 /
≥ 3 blocks = 0 / 28 / 71 / 1 %, and it is the slowest model with 6 mismatches per round) — it makes aiming unfair.

**Proposal "a rub is a rub" — `game/js/world.js`** (re-simulated: patch `rubDwell`):
- CONFIG (after `hitPad`): `rubPathK: 1.6,          // a swipe reveals a frosted block only after ≥ 1.6 × its long side of finger path inside it (a rub) …`
  and `rubRevealOnUp: true,     // … or when the stroke ENDS on it (drag-to); crossing a block on the way does nothing`.
- `P.pointerDown`: add `this._rubIn = 0;`.
- `P.pointerMove`: keep the guards; replace the body after `var c = this._hit(x, y, false), id = c ? c.id : null;` with
  `var fx = <previous finger x/y saved before overwriting>; if (id !== this._rubLast) { this._rubLast = id; this._rubIn = 0; } else if (c) this._rubIn += hyp(x - fx, y - fy);`
  then `if (!c || c.state !== 'down' || this._rubbed[id] || this.open.length >= 2) return null; if (this._rubIn < cfg.rubPathK * Math.max(c.w, c.h)) return null; return this._rubReveal(c);`
  (`_rubReveal` = the current reveal lines: `_rubbed[id] = 1`, idle reset, look, `_flipUp(c, 'rub')`).
- `P.pointerUp`: before clearing, `if (cfg.rubRevealOnUp && this.finger.down && this._rubbed && this.state === 'round' && !this.solved && this.phase === 'play' && !this._mis && this.open.length < 2) { var c = this._hit(this.finger.x, this.finger.y, false); if (c && c.state === 'down' && !this._rubbed[c.id]) this._rubReveal(c); }`.
- Bot (`bot.js`) needs no change (it ends its swipe on the target). Update unit test `rub: while the finger is down, entering…`
  (`tests/unit/run.js:465`): crossing B must reveal nothing, ending on C / rubbing back and forth over B reveals it.

| re-sim (720 sessions each) | rubT age 3 / 4 / 5 / 7 chapter | rubT unfinished | rubT mismatch / round (4 / 7) | rubR mismatch / round (4) | rubT aimed block revealed | typical, toddler, bots |
|---|---|---|---|---|---|---|
| today | 87 / 86 / 127 / 227 s | 16 of 96 | 2.1 / 21.5 | 7.0 | 21 % | — |
| **rubDwell** | **87 / 83 / 90 / 89 s** | **0** | **1.6 / 1.4** | **3.5** | **100 %** | identical (±1 s) |

### P2-1 Idle auto-pause fires on a child who is playing
`idleSaid` resets only at a new round, not when the child touches a block, so a slow / distracted child gets paused mid-round
(5th nudge of the round): dreamy model **240 / 240 sessions**, 2 854 pauses (typical / slow3: 0). Fix = (a) above
(`idleSaid = 0` on every `flip` and `tap`): v1/v3 → 0 false pauses, the absent child still pauses at ≈ 117 s.

### P2-2 The last pair's fish are hidden under the Talk panel
When the round end leads to Talk time, the dimmed Talk screen opens 2.0 s after the last match (roundEndDelay 0.4 +
roundDoneTime 1.6), but a `fishes` reward needs n × 0.35 s + ≈ 1 s: at ages 5–7 (count 1–10/12, odd/even) **21–132 fish
per 32 sessions never even jumped before Talk**, at age 4 the 5th fish is still in the air — the counted reward is the lesson.
**Proposal `world.js`**: CONFIG `roundDoneFishMax: 3,  // roundDone before Talk lasts until the last fish dived (≤ +3 s)`; in
`_endRound`, if the next step is Talk (`round + 1 >= roundsPerLevel` or the chapter limit will apply) and a reward has pieces
not `done`, use `roundDoneTime' = min(roundDoneTime + roundDoneFishMax, waiting × fishStagger + 1.3)` for this roundDone only.
Re-sim (patch `fishWait`, 432 sessions): un-jumped fish 21 / 109 / 132 → **0 / 0 / 0**; session time +0–5 s (age 7 bot 309 → 314 s).

### P2-3 Prompt protection starts at the request, not when the prompt is spoken
A prompt queued behind "You did it!" and the last match line loses its protection before it plays; fast players cut it
(`prompt < name` 2 527, `prompt < golden` 40, `prompt < match` 209 once names stop cutting matches). Fix (c) + (b2) + (d) above:
all-driver prompt cuts 148 (v0) / 250 (v1) → 93 (v3); typical 4-year-old 0–2.

### P3
- **Slow 3-year-old over 8 min**: slow3 p90 493 s (age 3), 533 s (age 4); chapters 110–119 s because 3 rounds are always
  played. Tried `sessionSoftLimit` (chapter may end after 2 rounds once the session passed 380 s / 300 s): −4 / −7 s only — not
  worth the code; leave as is (toddler and typical pass).
- **Spamming is the quickest way through** at ages 3–4 (spamAll chapter 60–65 s vs typical 92 s) with fewer stars (43 % 3★).
  Acceptable (no fail state); the voice fixes keep the talk from turning into noise for this child.
- "N fish jump one after another (**counted aloud**)" (REQUIREMENT / DESIGN): `main.js case 'leap'` only plays a sound. Proposed
  later: for count / odd-even rewards with n ≤ 5, short match line "A match!" and `speak(numberName(k))` on each `leap` (k = 1..n).
- Talk question waits behind praise lines; `homeArrive` line heard 9–14 % (cut by the next name); match lines for age ≤ 4 could
  be shorter ("Two red fish!").

## 3. Play evaluation (game designer)
**Fair for a 4-year-old? Yes.** Chapter 92 s, 89 % of rounds 3★, hints in 5 % of rounds, no stuck states, the first chapter is
2 colour pairs, mistakes cost nothing. Tapping is fast and reliable (reveal on touch-down, 0 dead taps during play).
**Fun?** The ice is the best part: blocks slide in like a train, frost cracks, matched blocks glide and *clink*, the hole and
fish leaping into the sea are a great payoff, homes rounds (seal → ice floe) are a real "aha". It feels different from a card
game in its *rewards* and in the cross-modal pairs; the core loop is still classic memory.
**What spoils it today:** Tuk never stops talking and you rarely hear a whole sentence (P1-1), and a child who drags her
finger gets the wrong block and can loop (P1-2) — the one gesture that is new in this game currently works against her.
**Make it better (in order):** 1) P1-1 voice diet; 2) P1-2 real rubbing — and make the rub *visible*: frost clears under the
finger in a trail and the crack sound grows as you rub, so rubbing is a delight rather than a fast tap; 3) count the fish aloud
as they leap (counting with the reward, not before it); 4) let the 3rd round's surprise be announced in the prompt (P1-1 f) so
a slide surprise is understood; 5) P2-2 so the counted fish are always seen.

## 4. Re-test against the real code (commit 6a84a07: voice v3 a–g, rubPathK / rubRevealOnUp, idle reset, roundDoneFishMax)
No sim patches this time: `pt_tuk_kids.js --name retest` (3 160 sessions, all models × ages 3–7) and `--name retest_typ`
(3 600: typical / toddler / careful4 × 240 per age); the voice *model* uses the v3 options (= the new main.js policy); the
real page was re-checked with `pt_tuk_voice_browser.js AB` (the event hook now also wraps `evs.forEach`, which main.js uses now).

| check | before | after (real code) |
|---|---|---|
| real page, fake TTS: lines started / min (4 en · 4 vi · 3 vi · 7 en) | 43.0 · 43.5 · 41.1 · 46.4 | **28.8 · 26.9 · 25.1 · 29.9** |
| real page: 1st name heard fully | 19 · 12 · 3 · 33 % | **80 · 68 · 72 · 73 %** (bot 0.8 is faster than a child; model typical 4: 98 %) |
| real page: count lines heard (4 en · 7 en) | 0 · 9 % | **100 · 80 %** |
| real page: match line heard | 38 · 40 · 44 · 25 % | 60 · 53 · 53 · 38 % |
| real page: 2nd-name requests / prompts cut | 39–66 per session / 0 | **0 / 0** |
| real page speed 8: requests per game minute (all ages, en + vi) | 41–47 | **28–34**; vi "Túc" 4/4; child's name in 4–11 praise lines; surprise now in the prompt; 0 errors, 8/8 sessions done |
| model typical 3 / 4 / 7: lines / min · Tuk talking | 32.0 / 35.4 / 43.4 · 83–90 % | 22.4 / 24.5 / 26.5 · 75–83 % |
| prompts cut (model, typical, 240 / age) | 0–5 | 11–48 per 240 sessions (age 7 most; ≤ 0.2 per session) |
| idle false auto-pauses (dreamy, 240 sessions) | 240 | **0**; absent child still pauses at ≈ 117 s into play, 40/40 |
| rubT unfinished / aimed block revealed | 16 of 96 (rub_base) / 21 % | **0 of 240 / 100 %**; rubT chapters 83–93 s at every age; rubR reveals 0 / 1 / 2 = 0 / 90 / 10 % |
| fish that never jumped before Talk (ages 5–7) | 21–132 per 32 sessions | **0** everywhere; 0–20 per 80 sessions still have the *last* fish in the air when Talk opens (P3) |
| NaN / errors / stuck / order errors | 0 | 0 |

Durations (s, mean / p90 / max, 240 sessions per cell):
| model | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|
| typical | 393 / 418 / 449 | 374 / 395 / 427 | 390 / 415 / 449 | 398 / 424 / **446** | 380 / 400 / 448 |
| toddler (chapter 92 / 95 at 3 / 4 ✓) | 378 / 407 / 435 | 388 / 413 / 451 | 403 / 438 / 504 | 418 / 456 / 522 | 449 / 496 / 566 |
| careful4 | 415 / 444 / 482 | 402 / 434 / 477 | 444 / 479 / 548 | 487 / 528 / 585 | 542 / 595 / 667 |
Typical age 6: max 446 s in 240 sessions (the 486 s sample is a rare tail; one 48-session run had a 510 s typical-5 outlier).
The 8-min target is met by every age-appropriate model (typical 3–7, toddler 3–4, careful4 3–4). Over target only for slow
child models playing older content (toddler / careful4 profiles at 6–7, slow3) — **no CONFIG change proposed**. If the parent
wants a hard cap anyway, the lever is `chapterTimeLimit: 75 → 65` (cuts the 4th round more often; not re-simulated as needed).

**Verdict: no P1/P2 left.** P3: Tuk still talks 75–88 % of the time for fast players (one name + one match line per pair is
the floor); 1st name heard 70 % for a typical 7-year-old (fast next tap); the last fish can still be mid-air when Talk opens
(`_fishLeft() + 0.2` → `+ 0.6` would cover it); counting the fish aloud on `leap` is still open.
