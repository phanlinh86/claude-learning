# Bop's Rainy Band — Mechanics (`RB.CONFIG`, layout, motion, events, playtest tuning)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (27 tests, ≈ 15 s; `node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 300] [--ages 3,4] [--models typical,slow3,…] [--jobs 2]
[--config '{…}'] [--tag x]` (high-speed playtest → `tests/sim/out/hs_<tag>.md`), `node tests/sim/determinism.js`,
`node tests/sim/content_stats.js [chapters]`, `node tests/sim/hs_browser.js` / `hs_browser_voice.js` (the real page in
Playwright, needs the lead's build). JSON reports are git-ignored.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). Each sub-step
  first copies `x, y, rot → _px, _py, _prot` (members, flying notes; the snail `_px/_py`). Render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, layout and surprises use the world's seeded `RB.RNG`; cosmetic randomness (sway phases, blinks, raindrop
  order) a second seeded generator. Same seed + the same inputs on the same sub-steps → the same events whatever the frame size
  (`tests/sim/determinism.js` replays recorded inputs at 1/30, 1/60 and 1/120 s frames for every age).

## 2. Public API (`RB.World`)
`new RB.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (a no-op when nothing changed),
`setAge(a)`, `setLang(l)` (both apply at the next `newSession`), `newSession({lastTopics})`, `startLevel(i)`, `update(dt)`,
`drainEvents()`, `skipTalk()`, `resetNudges()` (after a pause), `talkAnswer(choiceId)` → bool, `hint()` (manual, e.g. a tap on
the bubble) → member id | `'bigDrum'` | null, `replayBeats()` → bool (listen ask, phase `ask`: Bop plays the beats again — main
calls it for a bubble tap; a tap on Bop does it by itself).
**Input (one active pointer, logical px):** `pointerDown(x, y)` → member id | `'bigDrum'` | `'bop'` | `'snail'` | null (a press
only: the member shows a tiny press squash); `pointerMove(x, y)`; `pointerUp(x, y)` → `'play'` | `'wrong'` | `'locked'` |
`'drum'` | `'boom'` | `'pokeBop'` | `'snail'` | null; `cancelDrag()` (touchcancel / pause: the press is dropped, no event).
**A tap** = down + up within `tapTime 0.6 s` and `< max(tapMovePx 40, w.tapMoveMin)` px of travel; a slide or a held finger does
nothing (`pointerUp` → null).
**Queries:** `prompt()` → `{promptKey, params, mode, n}` | null (phases `ask` and `beats`), `answerId()` → id of the right member
(phase `ask`; null in mode drum and while Bop drums the beats), `memberHit(id)` / `bigDrumHit()` / `bopHit()` / `snailHit()` →
`{x, y (centre), w, h}`, `memberById(id)`, `slotOf(i)` (sheet slot), `interactive` (round + phase ask).
**Fields:** `layout, hudKeep, state, phase, level, levels, topic, weather (0..3 = level % 4), round, roundsPerLevel, ask, asks,
misses, askMisses, streak, stars, levelStars, roundStars, songs, talk, talkAnswered, alpha, time, stateTime, phaseTime, wind,
shower, surprise, cur (the round), members, flyNotes, sheet, countCard, bigDrum, bop, snail, hintHand, lastTopics, tapMoveMin`.
**Statics:** `RB.World.logicalSize(cssW, cssH)`, `computeLayout(W, H, ins, cfg, k, n, count)`, `slotsFor(stage, S, k, cfg)`, `kickFor`.

### States and phases
`menu → intro (2.5 s) → round → roundDone → round … → talk → levelDone (1.8 s) → intro (next chapter = next season) … → sessionDone`.
- `round` phases: `deal → ask | beats → play → ask | beats → … → play → song`, then **state `roundDone`, phase `clear`** (as the
  sister games: the `roundDone` *event* fires at the end of the song, stars show while the band hops off).
- `beats` (listen asks only): Bop drums n beats; member taps are ignored, a tap on Bop does nothing; then `ask`.
- Chapter = 4 songs; Talk time comes early once ≥ 3 songs are done (`chapterMinRounds`) and the chapter is > 80 s old
  (`chapterTimeLimit`). `roundsPerLevel` then becomes the songs played (the HUD dots fill). Talk re-asks every 12 s
  (`talkAsk {n}`), `talk.glowAnswer` from the 2nd re-ask.
- Surprise: one round per chapter, `surpriseRound 2` (the 3rd song, always played), type `['snail','shower'][(level + off) % 2]`
  with a random `off` per session (they alternate between chapters). A shower needs ≥ 3 notes (it comes after the 2nd), else snail.

## 3. Layout (`setViewport` → `w.layout`, DESIGN §2). Recomputed for every round (k members, n notes, count round?)
| key | rule |
|---|---|
| `W, H, ins, portrait, tall` | DESIGN short-side rule; `tall` = H/W > 1.6 |
| `groundY` | `H − ins.bottom − 24` (landscape) / `− 36` (portrait). Also `splashY` (weather) |
| `stage {x0, x1, y}` | landscape `x0 = ins.left + 380` (W < 1100: 350), `x1 = W − ins.right − 24`, `y = groundY − 74`; portrait `x0 = ins.left + 24`, `y = groundY − 330` (tall − 380) |
| `S` | member square: 150 (k ≤ 3) / 132 (k = 4), ×1.15 in tall portrait, shrunk to fit `k·S + (k−1)·24 ≤ x1 − x0 − 40`, never < 112 (960-wide landscape with 4 members: 118) |
| `slots` | member centres, `y = stage.y − 38 (stool) − S/2`; spaced `min((b − a)/(k − 1), S + 110)` (≥ S + 24 by the S rule), centred over `a = x0 + S/2 + 20 … b = x1 − S/2 − 20` |
| `bigDrum {x, y, r}` | landscape `(ins.left + 250, groundY − 92)`, r 92; portrait `(ins.left + 470, groundY − 100)`, r 100. Drawn 2r × 1.5r around the centre |
| `bop {x, y, h}` | FEET: landscape `(ins.left + 100, groundY − 4)`, h 300; portrait `(ins.left + 150, groundY − 4)`, h 320 |
| `sheet {x0, x1, y, noteR, slots}` | landscape `y = max(ins.top + 200, stage.y − S − 38 − 170)`, over the stage x range; portrait `y = bubble bottom + 60`; n slots ≤ 110 apart, centred. Portrait count rounds: `x1 = countCard.x − 16` (the card sits at the right of the sheet row) |
| `countCard {x, y, w, h, cx, cy}` | **top-left box + centre**, 180×150. Landscape centred on `bigDrum.x`, top `= max(bubble bottom + 12, bigDrum.y − 1.5r − 190)`; portrait right end of the sheet row (`cx = stage.x1 − 90`), top `= bubble bottom + 12` |
| `bubble` | landscape `x = ins.left + 24, y = ins.top + 18, w = min(560, W − ins.right − 200 − x), h = 122`; tall portrait `y = ins.top + 110, w = W − x − ins.right − 24, h = 124`; **short portrait (iPad, H/W ≤ 1.6): on the HUD row** `y = ins.top + 18, w = W − ins.right − 160 − 14 − x` (deviation, as the sister game: the 110 px bubble left no room for the sheet + card above the band at 720×960) |
| `hud` | `x = W − ins.right − 160, y = 0, w = 160 + ins.right, h = ins.top + 96` |
| `stoolH` | 38 (BandArt.drawStool at `(slot.x, stage.y − 38)`) |

Hit tests (`_hit`, in order): the snail (radius 70 around `(x, y − 40)`), the big drum's **drawn** body, the nearest member box
(`centre ± (0.6·S + 14)`, members `in` / `rest`), the big drum box + 20, Bop's box (`x ± 0.3·h`, `y − h … y`, + 20).
Drum assist: once the big drum was hinted in a drum ask, a tap on empty space within its box + 90 px also counts on it.
Unit-tested on 15 viewports × k 2–4 × n 2–5 × count: everything inside the safe area, no member / note / card under the HUD or
the bubble, spacing ≥ S + 24, S ≥ 112, the sheet ≥ 20 px above the band, the card off the members and notes, no member over the drum.

## 4. Motion (all springs integrated per sub-step; numbers in `RB.CONFIG`)
| what | model |
|---|---|
| **squash** `m.q` (sy = (1 − q)·breath, sx = (1 + 0.83q)·breath, bottom-anchored in y) | damped spring ω 22, ζ 0.35 towards `pressSquash 0.06` while a finger rests on it, else 0. Kicks use `kickFor(peak)` = the initial velocity that makes the spring peak there: play 0.18 (sy 0.82 / sx 1.15 at ≈ 0.07 s), overshoot to sy ≈ 1.05, settled ≈ 0.3 s (unit-tested); hop landing 0.2 (sy 0.8); wrong 0.09; raindrop 0.05; the band bobs 0.02 on every song beat |
| **hop in** | from `W + S` on ballistic arcs (g 1600, apex 120 px over the stool, ≈ 0.78 s per hop; 2 hops when the way is > 700 px), staggered 0.12 s, each landing squashes |
| **rest** | sway ±0.035 rad at 0.45 Hz, breathe ±2 % at 0.6 Hz (phase per member); hinted: wiggle ±0.1 rad at 2.2 Hz and a 8 px bounce × glow |
| **wrong wobble** `m.wob` | rotational spring ω 18, ζ 0.22, kick to ±0.25 rad (alternating side), < 0.05 rad after 0.6 s |
| **note flight** `w.flyNotes[]` | ballistic, fixed time 0.55 s, apex 90 px above the higher end (the sheet slot); g solved per flight: `g = 2(√d0 + √d1)²/T²`; spin 5.5 rad/s easing to 0 at landing. Lands → `sheet.notes[i].pop = 1` (→ 0 in 0.35 s; render scale 1 + 0.4·pop) |
| **big drum** | squash spring as members (sy = 1 − q, sx = 1 + 0.5q): drum tap 0.12, beat 0.1; `hit` 1 → 0 in 0.35 s |
| **hop off** | rightmost first, 0.12 s apart, arc to `W + S` (g 2400, apex 100, 0.58 s) |
| **hit / sing / glow** | `hit` 1 → 0 in 0.4 s (skin ripple); `sing` 1 for 0.7 s (animals); glow → 1 at 6/s while hinted (4 s), → 0 at 3/s |
| **ghost hand** | `w.hintHand {x, y, t, alpha, target}`: fingertip on the target, a tap every 0.9 s (14 px up → 4 px pressed), fades in 0.25 s / out 0.35 s, 4 s |
| **snail** | crawls from `W + 90` to `stage.x1 − 60` on the grass in front of the stage's right pot (`y = groundY − 2`) in 5 s with stretch pulses (sx 1 … 1.08 at 1.1 Hz); leaves after the song in 2.5 s (ease-in). **Deviation:** DESIGN says the stage's left end, but there is no free plank there (slot 0's stool starts 15 px from x0 at 960 wide) and the big drum / Bop stand left of the stage |
| **shower** | `w.shower` 0 → 1 in 0.4 s, holds to 4 s, → 0 in 0.6 s; Bop `umbrella` 2.5 s; 6 raindrops from 0.5 s, 0.55 s apart, on the members in a shuffled round robin (tiny squash, hit 0.4); `w.wind = 0.4·shower` |

## 5. Round flow and timing (`RB.CONFIG`)
| step | time |
|---|---|
| deal | `dealDelay 0.2` → hops (≈ 0.8–1.7 s) → all resting + `dealSettle 0.12` → ask 0 |
| pick ask | `ask` event; idle nudges after 12 s, ×1.5 up to 30 s (`idle {n}`; the 2nd idle hints, respecting `hintCooldown 6`) |
| right tap | `play` → note flies 0.55 s → `note`; phase `play` ≥ 0.6 s (and until the note landed) → next ask / song |
| wrong tap | `wrong`, member taps locked 0.6 s (`locked`); the 2nd miss on an ask always hints (`hint`), later misses hint with the 6 s cooldown |
| drum ask | the count card `{n, lit}` shows; each big-drum tap `drumTap {i, n}`; at i = n `drumDone` + a note from the drum; taps after that → `boom`. Band-drum taps → `boom {member: true}`; the 2nd one in an ask hints the big drum |
| listen ask | `ask` (Bop starts to speak) → phase `beats`: first beat after `beatLead 2.4 s`, `beat {i, n}` every 0.6 s, `beatsDone` 0.5 s after the last → phase `ask`. Replay lead 0.7 s. Right answer → the card shows n lit |
| song | `songStart` → after 0.5 s a `songNote` every 0.45 s (note pops, its member plays; drum notes: the big drum) → +0.45 s `songEnd` (Bop cheers, the snail leaves) → +0.6 s `roundDone {stars}` |
| clear | state `roundDone`: members hop off, a `clearNote` every 0.1 s, next round after ≥ 0.9 s |
| stars | 3 / 2 / 1 for 0 / 1 / ≥ 2 misses in the song; Talk + 1 |

## 6. Content (`RB.Content`, DESIGN §5.1)
- Notes per song (asks): age 3: 2,2,3,3 · 4: 2,3,4,4 · 5: 3,4,4,5 · 6–7: 4,4,5,5. **Counting songs** (`COUNT_NOTES`, deviation):
  3: 2,2,2,2 · 4: 2,3,3,3 · 5: 2,3,3,3 · 6–7: 3,3,3,3 — every counting note is a whole task (n taps or n beats + an answer); at the
  general table the count chapter took 105 s at age 4 and 150–160 s at ages 6–7 (sim), now in line with the other topics (§7).
- Members per song: age 3: 2; 4–5: 3; 6–7: 3 (4 from round 2); round 0: 2; size: 2; listen: 3 (age 3: 2); drum rounds: none
  asked, 2–3 plain band drums (`{kind:'text', text:'', plain:true, nameKind:'drum'}`) sit on the stage.
- Ask order: a shuffled permutation of the members first (every member is asked when n ≥ k), then random picks never equal to the
  previous ask. New band every round (`prevMembers`), the first ask never repeats the previous song's last prompt (drum asks
  excepted: counting up again is the point).
- Below age 5 the whole band is clash-free (no blue+purple, red+green, yellow+orange, green+orange; no pink); shapes ≤ 4 in
  different colours; age 5 shapes: two members share a colour. Pitches: colour → `RB.NOTE`, size big 53 / small 72, others the
  C-D-E-G-A pentatonic by slot; counting notes: `countNote(n)` (colour + pitch by n).
- Drum counts (`DRUM_RANGE`): 3: 1–3 · 4: 1–5 · 5: 1–6 · 6: 2–7 · 7: 3–8; round 0 counts up from the bottom (age 4: 1, 2), round 1
  ascending distinct (age 4: 2, 3, 4). Listen (`LISTEN_RANGE`): 3: 1–3 · 4: 1–5 · 5: 1–10 · 6: 2–12 · 7: 3–12; number drums show
  dots for n ≤ 5 at ages ≤ 5.
- `oddeven`: exactly one member of the "lonely" parity (asked by parity), the others are asked as sums (`p.add`).
- `initial`: animal members with distinct first letters (vi skips chó / chim: "ch" is its own sound).
- Unit test: every topic × age 3–7 × 200 seeds × 4 songs (44 000 rounds): exactly one match per pick / listen ask, no consecutive
  repeat, colour-blind sets, every member asked, the note / member tables, drum ranges.

## 7. Playtest — `node tests/sim/hs_playtest.js --n 300 --tag final` (9 150 sessions, 2 cores ≈ 6.5 min)
Child models (`tests/sim/lib.js`), all through the real input API with taps held 0.06–0.5 s and drifting a few px:
- **typical** per age: thinks 1.3–4.0 s after the ask (incl. hearing the prompt; a listen ask: after the beats), looks away
  3–10 s with p 0.05–0.1, right with p 0.65 (3) … 0.9 (7), follows a hint with p 0.85, slides instead of tapping with p 0.04–0.08,
  drums 0.3–1.0 s apart, miscounts (one short / one extra) with p 0.2 (≤ 4), taps a band drum first with p 0.1, pokes Bop p 0.05.
- **slow3**: a slow 3-year-old (thinks 3–8 s, right 55 %, slides 15 %, miscounts 30 %, distracted 15 %) — on every age's content.
- **perfect**: always right, thinks 0.8–1.4 s. **bot0.8**: `RB.Bot` (skill 0.8). **spammer**: 6 taps/s on members / drum / Bop.
  **tapper**: random taps anywhere on the screen every 0.3–1.5 s (never aims). **absent**: never touches (main auto-pauses on
  the 5th idle nudge of an ask).

Verdict:
- typical age 4: **chapter mean 94.3 s (target 60–100 ✓), session p90 409 s (≤ 480 ✓)**; ages 3 / 5 / 6 / 7: chapter 84 / 97 /
  99 / 97 s, session p90 366 / 420 / 427 / 420 s — every age ≤ 8 min at p90.
- engaged models (typical, perfect, bot0.8): no ask > 60 s, no song > 120 s, every session done. slow3 on age-5–7 content: a few
  long asks (≤ 14 of ≈ 25 000 asks), still every session done.
- no stuck state: every model that touches the screen keeps progressing; only **tapper** (random taps anywhere) at ages 5–7 has
  rare asks with no progress for 200 s (9 of the 900 tapper sessions at ages 5–7: a 4-member band on a 720×1556 screen, ≈ 5 % of the screen is the
  right member) and 184 of 900 tapper sessions at ages 5–7 hit the 25-min cap — random input is not play; at ages 3–4 every
  tapper session ends (638 / 810 s).
- every 2nd miss on an ask hinted (0 of 9 000+ without a hint); no NaN; max squash q 0.26, max wobble 0.247 rad (≤ 0.25 ✓).
- absent child → the 5th idle nudge at ≈ 121 s (12 + 18 + 27 + 30 + 30 + the deal).
- hints: typical age 4: 4 % of asks hinted (0.04 2-miss hints per ask, idle hints ≈ 0); slow3 12 %; spammer 42 % (locked 3.3 / ask).
- stars typical age 4: ★★★ 46 % / ★★ 32 % / ★ 23 % (3 / 2 / 1 for 0 / 1 / ≥ 2 misses).
- chapter mean by topic, typical age 4: colors 92.7 · animals 92.1 · shapes 92.8 · count 104.4 · size 89.9 s (count at the general
  note table was 105 s at age 4 and 147–160 s at ages 6–7 → `COUNT_NOTES`, drum ranges 6: 2–7 / 7: 3–8; now 109 / 111 s at 6–7).

Tuning history: v1 (`--n 40`): count chapters 146–160 s at ages 6–7, typical age-7 session p90 505 s, tapper stuck on drum asks
(a random tap hits the big drum ≈ 6 % of the time) → `COUNT_NOTES`, drum assist (`drumAssistPad 90` once the drum was hinted),
song tail 0.55 → 0.45 s, song hold 0.75 → 0.6 s, deal delay 0.3 → 0.2 s, settle 0.15 → 0.12 s.

| age | model | done | chapter mean (p10–p90) s | cut % | session mean / p90 s | song mean / p90 s | ask mean / p90 s | wrong / ask | hinted asks % (2-miss · idle · band-drum per ask) | ★★★/★★/★ % | stuck ask > 60 s / song > 120 s / no progress 200 s |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | typical | 300/300 | 84.0 (73.5–96.0) | 3 | 343 / 366 | 18.1 / 25.2 | 5.2 / 8.5 | 0.32 | 0 (0.00 · 0.00 · 0.00) | 42/40/17 | 0 / 0 / 0 |
| 3 | slow3 | 300/300 | 106.1 (91.0–122.8) | 64 | 432 / 464 | 27.6 / 38.5 | 9.5 / 15.8 | 0.40 | 1 (0.00 · 0.01 · 0.00) | 34/40/26 | 0 / 0 / 0 |
| 3 | perfect | 300/300 | 44.7 (41.2–54.0) | 0 | 186 / 198 | 8.9 / 10.5 | 1.4 / 1.6 | 0.00 | 0 (0.00 · 0.00 · 0.00) | 100/0/0 | 0 / 0 / 0 |
| 3 | tapper | 300/300 | 157.9 (100.0–231.6) | 94 | 639 / 857 | 48.2 / 87.0 | 18.1 / 41.3 | 0.91 | 34 (0.34 · 0.17 · 0.12) | 30/20/50 | 303 / 112 / 0 |
| 3 | spammer | 300/300 | 41.4 (34.4–53.0) | 0 | 173 / 187 | 8.0 / 11.9 | 0.9 / 2.3 | 0.91 | 29 (0.23 · 0.00 · 0.06) | 27/20/53 | 0 / 0 / 0 |
| 3 | bot0.8 | 300/300 | 52.0 (46.9–58.9) | 0 | 215 / 226 | 10.7 / 14.3 | 2.1 / 3.4 | 0.19 | 0 (0.00 · 0.00 · 0.00) | 62/31/7 | 0 / 0 / 0 |
| 4 | typical | 300/300 | 94.3 (82.4–108.9) | 11 | 384 / 409 | 21.1 / 31.2 | 4.5 / 8.0 | 0.28 | 4 (0.04 · 0.00 · 0.00) | 46/32/23 | 0 / 0 / 0 |
| 4 | slow3 | 300/300 | 122.7 (101.1–149.1) | 99 | 498 / 539 | 36.4 / 54.3 | 10.1 / 17.1 | 0.51 | 12 (0.11 · 0.01 · 0.00) | 30/27/43 | 0 / 0 / 0 |
| 4 | perfect | 300/300 | 55.2 (48.8–75.2) | 0 | 228 / 240 | 11.5 / 14.0 | 1.4 / 1.6 | 0.00 | 0 (0.00 · 0.00 · 0.00) | 100/0/0 | 0 / 0 / 0 |
| 4 | tapper | 300/300 | 200.7 (122.8–290.5) | 99 | 810 / 1077 | 63.2 / 116.2 | 18.3 / 41.9 | 1.47 | 44 (0.60 · 0.13 · 0.18) | 22/11/67 | 417 / 326 / 0 |
| 4 | spammer | 300/300 | 58.4 (43.3–85.5) | 0 | 241 / 268 | 12.3 / 20.7 | 1.4 / 3.4 | 1.57 | 42 (0.37 · 0.00 · 0.06) | 17/10/73 | 0 / 0 / 0 |
| 4 | bot0.8 | 300/300 | 65.3 (57.1–82.1) | 0 | 268 / 283 | 14.0 / 20.5 | 2.1 / 3.5 | 0.21 | 2 (0.02 · 0.00 · 0.00) | 55/29/16 | 0 / 0 / 0 |
| 5 | typical | 300/300 | 97.2 (86.4–110.9) | 14 | 396 / 420 | 22.0 / 32.1 | 3.7 / 6.1 | 0.19 | 2 (0.02 · 0.00 · 0.00) | 51/31/18 | 0 / 0 / 0 |
| 5 | slow3 | 300/300 | 144.2 (123.2–167.4) | 100 | 584 / 630 | 43.6 / 60.2 | 10.4 / 17.1 | 0.55 | 15 (0.14 · 0.02 · 0.00) | 23/22/56 | 3 / 2 / 0 |
| 5 | perfect | 300/300 | 63.1 (56.1–85.8) | 0 | 260 / 273 | 13.5 / 16.7 | 1.4 / 1.6 | 0.00 | 0 (0.00 · 0.00 · 0.00) | 100/0/0 | 0 / 0 / 0 |
| 5 | tapper | 296/300 | 234.5 (147.9–343.1) | 100 | 945 / 1260 | 74.7 / 131.5 | 18.5 / 43.7 | 1.56 | 44 (0.65 · 0.13 · 0.19) | 17/8/75 | 561 / 490 / 1 |
| 5 | spammer | 300/300 | 69.0 (53.4–100.9) | 2 | 283 / 318 | 15.0 / 23.3 | 1.5 / 3.8 | 1.72 | 44 (0.41 · 0.00 · 0.06) | 13/6/81 | 0 / 0 / 0 |
| 5 | bot0.8 | 300/300 | 75.2 (66.9–92.5) | 0 | 308 / 324 | 16.4 / 22.7 | 2.2 / 3.6 | 0.21 | 3 (0.03 · 0.00 · 0.00) | 49/30/21 | 0 / 0 / 0 |
| 6 | typical | 300/300 | 98.5 (87.5–112.6) | 20 | 401 / 427 | 22.7 / 32.1 | 3.4 / 5.5 | 0.15 | 2 (0.02 · 0.00 · 0.00) | 56/29/14 | 0 / 0 / 0 |
| 6 | slow3 | 300/300 | 168.9 (143.4–197.7) | 100 | 683 / 740 | 51.8 / 70.0 | 10.7 / 18.2 | 0.54 | 14 (0.13 · 0.02 · 0.00) | 21/18/61 | 7 / 6 / 0 |
| 6 | perfect | 300/300 | 69.6 (61.2–97.7) | 0 | 286 / 300 | 15.1 / 18.8 | 1.4 / 1.6 | 0.00 | 0 (0.00 · 0.00 · 0.00) | 100/0/0 | 0 / 0 / 0 |
| 6 | tapper | 222/300 | 288.2 (196.3–390.7) | 100 | 1160 / 1413 | 92.6 / 161.1 | 22.2 / 51.7 | 1.84 | 49 (0.79 · 0.17 · 0.27) | 15/5/80 | 1003 / 629 / 4 |
| 6 | spammer | 300/300 | 80.4 (63.2–105.9) | 8 | 329 / 364 | 18.1 / 29.3 | 1.9 / 4.8 | 2.17 | 50 (0.48 · 0.00 · 0.07) | 12/4/84 | 0 / 0 / 0 |
| 6 | bot0.8 | 300/300 | 82.7 (72.8–104.2) | 0 | 338 / 354 | 18.3 / 24.9 | 2.2 / 3.7 | 0.22 | 3 (0.03 · 0.00 · 0.00) | 44/32/24 | 0 / 0 / 0 |
| 7 | typical | 300/300 | 96.5 (84.1–114.1) | 24 | 393 / 420 | 22.4 / 33.1 | 3.3 / 5.3 | 0.09 | 1 (0.01 · 0.00 · 0.00) | 69/24/7 | 0 / 0 / 0 |
| 7 | slow3 | 300/300 | 177.0 (143.6–225.5) | 100 | 715 / 772 | 54.5 / 75.7 | 11.5 / 20.1 | 0.53 | 16 (0.13 · 0.04 · 0.00) | 24/17/59 | 14 / 17 / 0 |
| 7 | perfect | 300/300 | 72.9 (61.3–104.4) | 0 | 299 / 306 | 15.9 / 27.8 | 1.5 / 1.7 | 0.00 | 0 (0.00 · 0.00 · 0.00) | 100/0/0 | 0 / 0 / 0 |
| 7 | tapper | 198/300 | 301.3 (199.2–414.0) | 100 | 1212 / 1447 | 97.0 / 168.0 | 24.0 / 56.5 | 1.81 | 53 (0.79 · 0.17 · 0.44) | 19/4/77 | 1174 / 643 / 4 |
| 7 | spammer | 300/300 | 81.9 (62.8–112.1) | 14 | 335 / 370 | 18.8 / 30.3 | 2.0 / 4.9 | 2.08 | 52 (0.47 · 0.00 · 0.10) | 15/4/82 | 0 / 0 / 0 |
| 7 | bot0.8 | 300/300 | 85.3 (72.8–110.3) | 1 | 349 / 362 | 19.0 / 29.8 | 2.3 / 3.8 | 0.21 | 3 (0.03 · 0.00 · 0.00) | 47/30/24 | 0 / 0 / 0 |


## 8. Events (all with `x, y` where an effect can be placed)
`session {levels}` · `level {level, topic, weather}` · `round {round, topic, n, asks, mode, members, surprise}` ·
`deal {n, members[], x, y}` · `ask {ask, asks, promptKey, params, mode, n, answerId, nameKind, nameValue, first, x, y (next sheet
slot)}` · `beat {i, n, x, y}` · `beatsDone {n, x, y}` · `replayBeats {n, x, y}` · `play {memberId, x, y, item, pitch, nameKind,
nameValue, i, n, mode, promptKey, params, misses}` · `drumTap {i, n, x, y}` · `drumDone {i, n, x, y, pitch, color}` ·
`note {i, n, color, pitch, x, y}` · `wrong {memberId, x, y, item, block, pitch, nameKind, nameValue, want {kind, value, item,
memberId, color?, shape?, animal?, size?, n?, text?}, streak, misses, mode, promptKey, params}` · `locked {memberId, x, y}` ·
`hint {memberId | null, target (member id | 'bigDrum'), x, y, idle?}` · `idle {n, promptKey, params, mode, x, y}` ·
`boom {x, y, memberId?, member?, pitch?}` · `pokeBop {promptKey, params, mode, replay, x, y}` · `songStart {n, x, y}` ·
`songNote {i, n, memberId | null, pitch, color, x, y (note), mx, my (who plays)}` · `songEnd {n, x, y}` ·
`roundDone {round, stars, misses, x, y}` · `clearNote {i, color, x, y}` · `snail {x, y}` · `snailTap {x, y}` · `snailRing {x, y}` ·
`shower {dur, x, y}` · `raindrop {memberId, pitch, x, y}` · `showerEnd` · `talk {talk}` · `talkAsk {talk, n, glowAnswer}` ·
`talkResult {correct, choiceId, answerId}` · `levelDone {level, stars}` · `sessionDone {stars, songs}`.

## 9. Weather (`RB.Weather`, DESIGN §5.3)
`new RB.Weather({width, height, seed, groundY})`, `resize(W, H, groundY)`, `setWeather(i, {instant})` (0 spring, 1 summer, 2 autumn,
3 winter; 2.5 s crossfade), `setShower(k)` (eased ≈ 0.25 s), `setParty(on)` (= `setNight`), `update(dt)` (1/60 s steps),
`burst(x, y, {kind, n, color})` (`confetti`, `notes`, `puff`, `sparkle`, `stars`, `leaves`, `petals`, `snow`, `splash`, `pollen`).
Particles `{type (= sprite), x, y, size, rot, alpha, layer 'back'|'front', kind, color?, flipX?, sy?}` — `type` ∈ `drop, splash,
petal, leaf_a, leaf_b, snow, sparkle, star, puff, note_a, note_b, confetti_a, confetti_b`; `sy` = optional vertical stretch
(raindrops 1…1.6 by speed, splash rings 0.45: draw them as flat ellipses). Hard cap 160 (ambient ≤ 120, splashes only below the cap).
| season | sky | particles (×area scale) | ambient |
|---|---|---|---|
| spring | `#CFE6F0 → #F3F1E2` | 36 light drops (620–920 px/s) + 10 tinted petals | rain 0.45, sun 0.35 |
| summer | `#8FD0F2 → #E3F4FB` | 18 bright sparse drops (white tint) + 8 sparkles | rainbow 1, sun 1, rain 0.2 |
| autumn | `#E9C9A0 → #F6E6CB` | 24 slow small drizzle drops (480–680 px/s) + 16 tumbling leaves | rain 0.3, wind 20 |
| winter | `#C9D6E6 → #EEF2F7` | 56 snowflakes, no rain | snow 1, rain 0 |
| shower k | sky greyer, tint `rgba(120,135,160, 0.1k)`, sun ×(1 − 0.7k), wind + 30k | + up to 68 heavy drops (980–1160 px/s); winter: + 44 flurry flakes | rain → 1, darkness 0.2k |
Drops lean with the wind (`rot = −atan2(vx, vy)`) and end in a `splash` ring: back-layer drops 70–170 px above `splashY`, front
drops within 70 px of it.

## 10. `RB.CONFIG` (tuned values, `game/js/world.js`; `new RB.World({config})` overrides any key)
```
step: 1/120, maxFrame: 1, roundsPerLevel: 4, chapterTimeLimit: 80, chapterMinRounds: 3, introTime: 2.5, talkAfterAnswer: 1.6,
levelDoneTime: 1.8, talkAskTime: 12, talkGlowAfterAsks: 2, shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6,
groundLand: 24, groundPort: 36, memberS: 150, memberS4: 132, tallScale: 1.15, memberMin: 112, stageX0Land: 380,
stageX0Small: 350, smallW: 1100, stageEdge: 24, stageDyLand: 74, stageDyPort: 330, stageDyTall: 380, stoolH: 38,
slotEdge: 20, slotGap: 24, slotMaxGap: 110, bigDrumLand: {"dx":250,"dy":92,"r":92}, bigDrumPort: {"dx":470,"dy":100,"r":100},
bopLand: {"dx":100,"dy":4,"h":300}, bopPort: {"dx":150,"dy":4,"h":320}, sheetTopLand: 200, sheetAbove: 170,
sheetBelowBubble: 60, noteR: 34, noteGap: 110, cardW: 180, cardH: 150, cardAbove: 190, cardGap: 12, bubbleX: 24,
bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 122, bubbleYPort: 110, bubbleHPort: 124, hudW: 160,
hudH: 96, hitFrac: 0.6, hitPad: 14, drumPad: 20, drumAssistPad: 90, bopHalfW: 0.3, bopPad: 20, snailR: 70, tapMovePx: 40,
tapTime: 0.6, pressSquash: 0.06, hopG: 1600, hopApex: 120, hopFar: 700, hopPause: 0.05, dealStagger: 0.12, dealDelay: 0.2,
dealSettle: 0.12, outG: 2400, outApex: 100, outStagger: 0.12, squashOmega: 22, squashZeta: 0.35, landSquash: 0.2,
playSquash: 0.18, sxPerQ: 0.83, hitTime: 0.4, singTime: 0.7, wobOmega: 18, wobZeta: 0.22, wobPeak: 0.25, swayAmp: 0.035,
swayHz: 0.45, breatheAmp: 0.02, breatheHz: 0.6, wiggleAmp: 0.1, wiggleHz: 2.2, glowBounce: 8, noteTime: 0.55, noteApex: 90,
noteSpin: 5.5, popTime: 0.35, drumSquash: 0.12, drumHitTime: 0.35, beatSquash: 0.1, playTime: 0.6, beatLead: 2.4,
beatGap: 0.6, beatTail: 0.5, replayLead: 0.7, songLead: 0.5, songGap: 0.45, songTail: 0.45, songHold: 0.6, clearTime: 0.9,
clearNoteGap: 0.1, countCardRate: 5, hintAfterMisses: 2, hintCooldown: 6, wrongLock: 0.6, hintTime: 4, hintTap: 0.9,
idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2, softMissHint: 2, surpriseRound: 2,
surpriseTypes: ["snail","shower"], snailIn: 5, snailOut: 2.5, snailRing: 0.6, snailSize: 110, snailDx: 60, snailFrom: 90,
showerTime: 4, showerUp: 0.4, showerDown: 0.6, umbrellaTime: 2.5, raindrops: 6, raindropAt: 0.5, raindropGap: 0.55,
moodTime: {"happy":0.9,"cheer":1.6,"oops":0.8,"think":1.4,"talk":1,"drum":0.22,"drum_up":0.3,"umbrella":2.5}, lookRate: 6,
blink: [2.2,5], blinkTime: 0.13
```
