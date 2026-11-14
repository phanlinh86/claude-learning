# Koko's Cake Tower — high-speed playtest report (2026-11-14)

Playtester: high-speed play agent. **No game file was changed.** Every proposal below was re-simulated by overriding
`CK.CONFIG` (`--config`), the content table (`--blocks`), main.js's speech calls (`--vopt`, in the sim's voice model) or with
a small harness-only code prototype (`--patch`, which wraps `CK.World.prototype` inside the sim process only).

## What was run
| run | what | size |
|---|---|---|
| `tests/sim/hs_pt2.js` (new) | headless sessions through the real input API. 12 child models: typical, slow3, thoughtful, dropHigh, **dropSide**, **rapidGrab**, spammer, tapper, **wrongFirst**, **wrongAlways**, absent, bot0.8. It also classifies every release, times the finale, measures the bee and the breeze, and runs a **voice-queue model of main.js + voice.js** | baseline 1 580 sessions (ages 3–7), 13 variant runs (≈ 2 800 sessions), final combined run 1 580 sessions |
| `tests/sim/hs_playtest.js` | the existing suite (15 models) | 1 380 sessions, all checks ✓ (`out/hs_pt_base.md`) |
| `tests/sim/hs_browser.js` | the real page with the bot at `?speed=8`, iPad landscape 1180×820 and iPhone portrait 393×852 | 4 sessions (ages 4 and 7) |
| `tests/sim/hs_browser_voice.js` | the real page at speed 8: every `CK.Voice.say` call | 8 sessions (ages 3–4, EN + VI) |
| `tests/sim/hs_browser_tts.js` (new) | the real page at **speed 1** with a **mock speechSynthesis** (en 12 / vi 14 chars/s + 0.25 s latency). The real voice.js queue decides what is heard, interrupted, dropped or stale | 1 chapter each, EN on iPad, VI on iPhone |
| `tests/sim/layout_check.js` (new) | slot layout for a CONFIG override on 10 viewports × 5 ages | `dropPad` 60 / 80 / 100 |
| `tests/sim/determinism.js`, `content_stats.js` | regression checks | all deterministic ✓ |

Reproduce: `node tests/sim/hs_pt2.js --n 30 --tag base` and the final run
`node tests/sim/hs_pt2.js --n 30 --config '{"freeSlipFrom":3,"idleMax":30,"gustAfter":1.1}' --patch fadeWrong,catchPad --blocks '{"5":[3,3,4,5],"6":[3,4,4,5],"7":[3,4,4,5]}' --vopt '{"noDeal":true,"noBlow":true}' --tag final`.
The tables are in `tests/sim/out/pt2_*.md`.

## Headline numbers (baseline, typical 4-year-old)
Chapter **92 s** (p90 106), session **376 s** (p90 406, max 430), cake 23 s, ask 5.7 s, 0.34 wrong drops per ask, hints on 8 % of
asks, stars ★★★/★★/★ 46/32/22 %. There are no stuck asks, no NaN, and every active model reaches the end of the session. Sway
stays at or below 0.104 rad (cap 0.12), the same in breezy chapters. The finale (towerDone → roundDone) takes **2.73 / 3.20 / 3.67 / 4.10 s**
for 2 / 3 / 4 / 5 layers, and roundDone → next prompt takes 2.3 s. Speed 8 on the real page: the world clock runs 7.9× real
time, so the main loop keeps up, and there were no console errors in 14 browser sessions.

## P1 — must fix

### P1-1 A child who keeps choosing the wrong layer can never finish the ask
Model `wrongAlways` is a toddler who always drags a wrong layer, often their favourite colour, while one is on the tray. It was
**stuck in 50/50 sessions** (ages 3–7), with about 255 wrong drops in one ask over 15 minutes. The hint glows on about every
2nd drop (cooldown 6 s), but nothing else changes, and the idle help never fires because the child is busy. That breaks "every
round must be completable" in practice.
**Change (code + CONFIG):** add `fadeWrongAfter: 3`. From the 3rd wrong drop of one ask, the wrong layers of that ask use the
existing `_out()` puff-away (the one just bounced goes when it lands home), so only the glowing right layer is left. Errorless
fading is standard practice for toddlers. Prototype: `hs_pt2.js --patch fadeWrong` (it wraps `_startAsk`, `_bounce` and `_rest`).
**Measured:** wrongAlways now finishes **50/50** sessions (session 321–364 s, ask mean 8–11 s, p90 13–17 s). typical, slow3 and
thoughtful are **unchanged** (identical numbers; they almost never reach 3 misses).

## P2 — should fix

### P2-1 The finale's voice runs behind the picture: "fffff" arrives after the candles are out
The count + cherry line ("One, two, three, four! We reached the cherry!") is always heard (100 %), and its numbers run 0.3 s
*ahead* of the visual count, which is good. That line lasts about 3.5 s (EN) / 2.9 s (VI). The blow line ("Make a wish… fffff!")
is queued behind it, so **its "fffff" is heard 2.5 s (EN, p90 2.8) / 2.1 s (VI) after Koko's puff**, and the candles go out
0.45 s after the puff. The real page with the mock TTS confirms this: the blow line starts 0.2–1.8 s after the `blow` event,
sometimes after `roundDone` while the stars are already flying. It is also the most repeated line: 16× per session with 2
wordings (`hs_browser_voice.js`: 32 of 317 lines).
The animation itself (2.7–3.7 s) is the right length for a 4-year-old. The problem is about 5 s of speech in 3 s of picture.
**Change (main.js, recommended):** don't speak `T('blow')` on `blow`. Koko's blow pose, the breath burst and the blow SFX already
say "fffff". If a spoken line is wanted, keep it only for the chapter's last (tallest) cake.
*Measured alternatives:* (a) speak the blow line at the last `count` + `blowAfter 1.5` → lag 1.4 / 1.1 s, finale +1.0 s,
cakes per chapter 3.46 → 3.27. (b) Count line "{count}!" only + blow line at the last count + `blowAfter: 1.3` → lag −0.1 / 0.0 s
(in sync), finale 3.1 → 3.9 s at age 4, but "We reached the cherry!" is lost. Option (a) is still out of sync. Option (b) costs
the goal line. So: drop the line.

### P2-2 Every chapter opens with a wall of talk before the instruction
The first prompt of each chapter starts **3.6 s (p90 4.5 s) after the layers are ready**: chapter name → weather line → `deal`
line ("Let's bake a cake up to the cherry!") → prompt. A 4-year-old sees the layers and starts dragging without the instruction.
**Change (main.js `round` case):** say `deal` only on the session's first cake (`e.round === 0 && world.level === 0`).
**Measured** (`--vopt noDeal`): first prompt of a chapter 3.6 → **1.4 s** (EN), 3.3 → **1.1 s** (VI). All prompts p90
start delay 2.6 → 1.1 s. Prompts heard in full 82 → 94 %.

### P2-3 Releases just beside the cake fly home
A child who aims a little wide (`dropSide`) **misses to the side on 25 % of releases. 78–88 % of those misses are within 40 px of
the drop-zone edge.** A rapid flicker misses 3–5 %, all within 40 px. "Dropped too high" never misses, because the zone is
open upwards. High drops fall 0.5 s (normal 0.35 s) and flings from the top inset 1.0 s, which is fine.
`dropPad` cannot grow: at `dropPad` 80 or 100 the iPad 4:3 landscape layout at age 4 loses a tray slot (`layout_check.js`).
**Change (code + CONFIG):** add `dropCatch: 40`. It is used only in the `pointerUp` release test (`x0 − 40 … x1 + 40`), and the
layout keeps `dropPad: 60`. Prototype: `--patch catchPad`.
**Measured:** dropSide side-misses 25 % → **3–5 %**, ask time 6.9 → 5.9 s (age 4), cakes per chapter 3.09 → 3.40. Wrong drops per
ask are unchanged (0.34 vs 0.35), so no accidental drops were added. rapidGrab misses → 0 %.

### P2-4 Older children lose half their cakes; the climax cake is almost never played
Because of `chapterMinRounds 2` + the pace prediction, the 4th (tallest) cake is cut in **52 %** of age-4 chapters, **88–98 %** at
ages 5–7, and in **100 %** for thoughtful, slow and tapping children aged 5–7. Thoughtful 6–7-year-olds play **2 of 4 cakes per
chapter** (8 cakes in a 5.5-minute session). Meanwhile, slow children at ages 5–7 still run past 8 minutes (slow3 session p90 504 /
604 / 626 s at ages 5 / 6 / 7). Raising the CONFIG limits instead (`chapterMinRounds 3`, `chapterTimeLimit 85`,
`chapterBudget 110`) gives more cakes, but slow3 at age 4 then reaches a session p90 of **579 s (> 8 min)**. So fix the content, not
the limits.
**Change (content.js `BLOCKS`):** `5: [3, 3, 4, 5]`, `6: [3, 4, 4, 5]`, `7: [3, 4, 4, 5]` (was 3,4,4,5 / 4,5,5,5 / 4,5,5,5). Optional:
`4: [2, 2, 3, 4]`. CONFIG stays as it is.
**Measured (final run):** cakes per chapter for thoughtful 6 / 7: 2.0 → **3.0**, typical 6 / 7: 2.95 / 3.02 → **3.36 / 3.69**,
typical 5: 3.11 → 3.27. slow3 session p90 at 5 / 6 / 7: 504 / 604 / 626 → **444 / 490 / 501 s**, and the typical session p90 stays
≤ 405 s. Optional age 4 (`v9blocks4`): typical chapters cut 52 → **35 %**, thoughtful 3.12 → 3.61 cakes per chapter, session p90
unchanged (403 s).
*Note:* the skill rule says "after ≥ 3 rounds, Talk once the chapter passes 75 s". The game uses ≥ 2 rounds / 80 s / budget 100,
and the sim shows ≥ 3 would break the 8-minute limit for slow children. Keep 2, but write the deviation down in MECHANICS.md.

## P3 — polish

| # | finding | change | measured effect |
|---|---|---|---|
| P3-1 | One-star cakes are common for toddlers: typical age 3 / 4: 22 % ★, slow3 31–34 % ★ (stars follow the 3/2/1 rule; the free slip only applies from 4 layers, which never happens at age 3) | `freeSlipFrom: 4 → 3` | ★★★/★★/★ typical 3: 32/45/22 → **54/36/10**, typical 4: 46/32/22 → **64/25/11**, slow3 4: 30/38/31 → 45/39/17 |
| P3-2 | The gust line ("Whoa, a breeze!") interrupts the layer-name praise in **every** breeze cake (720/720); only 36 % of the praise is heard | `gustAfter: 0.6 → 1.1` | praise heard before the cut 36 → 71 %, gust line still heard 93 % (1.5 s is too late: the gust line is then cut 53 %) |
| P3-3 | Idle back-off stops at 20 s; the skill rule says up to 30 s (gaps 12/18/20/20/20) | `idleMax: 20 → 30` (12/18/27/30/30) | absent child auto-pauses at 121 s instead of 94 s |
| P3-4 | The child's name is never praised at a cake end (`great[]` with `{child}` is unused); the last layer is never named, because the count line replaces "Yes, red!" | main.js: on `roundDone` of the chapter's last cake, queue `T('great')` | — |
| P3-5 | Repetition: the count + cherry line and the blow line have 2 wordings each and play 16× per session; at ages 3–4 the same answer comes twice in a row in 7–10 % of asks (0–1 % at 5+); at age 3 an identical pair (e.g. blue vs orange) can repeat inside one cake | add 3–4 more `towerDone.count` wordings; content: no repeated answer in consecutive asks for ages 3–4 | — |
| P3-6 | The bee line "A honey bee is visiting our cake!" is heard in full only 20–30 % of the time (the child's next answer or the bee tap cuts it) | shorten to "Bzzz! A bee!" / "Vo ve! Bạn ong!" | — |
| P3-7 | MECHANICS §4 gives the finale as `2.25 + 0.45·n`; the measured value is **1.8 + 0.45·n** (2.7 / 3.2 / 3.6 / 4.1 s) | doc fix | — |
| P3-8 | Frame rate in headless Chromium (software GL, dpr 2–3) at speed 8: ≈ 48 fps with 21 % of frames over 22 ms. The loop never falls behind (7.9× clock), but software GL says little about an iPhone GPU | check `CK.debug.stats.slowFrames` on a real iPhone at speed 1 | — |

## Things that are fine (no change)
- **Breeze (setBreeze):** never blocks play. Ask time in breezy chapters is the same as sunny (age 4: 5.8 vs 5.8 s), max θ is
  0.102–0.104 rad as in the other weathers, and no extra side-misses or wrong drops.
- **Bee:** 3 393 bee visits and 951 taps, and **0 grabs stolen** by its 64 px hit circle. Asks with a bee on screen take about the
  same time (5.6 vs 5.7 s). At age 3 the surprise is always the bee (2-layer cakes), 4 per session.
- **Hints:** a hint always comes on the 2nd miss, the 6 s cooldown holds (about one hint per 2 wrong drops for wrongAlways), idle
  hints come from the 1st idle, and Talk re-asks every 12 s and goes quiet after 3 (main.js `n ≤ 3`).
- **Count numbers:** spoken as one utterance, never dropped or cut (100 % of 9 800 finales), 0.3 s ahead of the glow. "We reached
  the cherry" is always heard. On the real page with the mock TTS, no line was **dropped** or **stale**. The losses are
  interruptions, mostly prompts cut by the bot's own fast answer, which is harmless.
- **Hint line** heard in full only 7–12 %: it is flushed when the child follows the glow and stacks. Harmless.
- **Warm-up cake:** 2 layers with 2 choices. Typical age 4: 0.29 wrong per ask and 5.3 s, against 0.35 and 5.8 s later. Easy but not
  trivial, which is right. At age 3 every cake has 2 choices, so the warm-up is as hard as the rest, and that is fine.
- **Determinism:** all 10 cases are the same on rerun and on 1/120 and 1/60 replay.

## Game-designer view (a 4-year-old)
- **Fun:** strong. The drag → jelly *flump* → wobble → cherry → candles → puff loop is one clear birthday-cake fantasy with a
  reward about every 23 s. The breeze and the bee add surprise without ever getting in the way.
- **Finale length:** the picture is the right length (2.7–3.7 s, plus 2.3 s before the next prompt). Making it longer would cost
  cakes, because about 30 % of the time is already spent watching. The problem is the voice: trim it (P2-1) rather than stretch
  the animation.
- **Pacing:** within the targets (chapter 92 s, session 6.3 min). The two pacing problems are the talk wall at each chapter start
  (P2-2) and the cut 4th cake (P2-4).
- **Variety:** the topics rotate well. About half of the asks in a session have a new answer, which is expected with 6 colours ×
  12 asks; see P3-5.

## Recommended change list (all re-simulated together in `pt2_final`)
1. CONFIG `fadeWrongAfter: 3` + code (P1-1)
2. main.js: no `blow` voice line, or only on the chapter's last cake (P2-1)
3. main.js: `deal` line only on the session's first cake (P2-2)
4. CONFIG `dropCatch: 40` + code in `pointerUp` (P2-3)
5. content `BLOCKS` 5: [3,3,4,5], 6–7: [3,4,4,5], optional 4: [2,2,3,4] (P2-4)
6. CONFIG `freeSlipFrom: 3`, `gustAfter: 1.1`, `idleMax: 30` (P3-1..3)

**Combined effect (final vs baseline, 1 580 sessions each):** 50/50 stubborn-child sessions now finish (was 0/50). Typical age 4
★★★ 46 → 64 %. dropSide side-misses 25 → 3–5 %. Cakes per chapter at 6–7 (thoughtful) 2.0 → 3.0. slow3 session p90 at 6–7:
604–626 → 490–501 s. First prompt of a chapter 3.6 → 1.4 s. Typical session p90 ≤ 417 s at every age (≤ 8 min ✓), toddler
chapters 92–93 s (60–100 ✓), no stuck ask, no NaN.
