# Nini's Sea Painting — high-speed playtest report (2026-11-07)

Playtester: report-only (no `game/` file was changed). The `--config` / `--content` / `--patch` experiments run only inside the
sim process. New scripts: `tests/sim/hs_deep.js` (new child models and metrics, `--config`, `--content` for content-rule and world-patch
experiments), `tests/sim/hs_voice_text.js` (checks the text of every line at speed 8, then measures frame time), and
`tests/sim/voice_pacing.js` (pacing for `hs_voice_browser.js` runs; it matches lines by order and word overlap, because
`voice_analyze.js` matches by exact text and miscounts spoken letters and numbers such as "W" → "double you". It also looks for a
`correct` event that this game never sends, so it counts 0 counting rounds).

Runs:
- Headless: `hs_deep.js --n 200`, 7 child models × ages 3–7, **7 000 sessions** (1 400 per age). Then 12 re-simulations (≈ 9 000 more sessions).
  Viewports cycle through iPhone P/L, iPad P/L and iPad Air; EN and VI alternate.
- `hs_playtest.js --n 100`, the standard 7 models, base (`hs_final`) compared with the proposed config: 3 020 sessions.
- Browser at `?speed=8&bot=1&mute=1`: 20 full sessions (ages 3–7 × EN/VI × 2), full `SP.debug.voiceLog`.
- Browser with real speech timing (`hs_voice_browser.js --pace child`, virtual clock and fake TTS at ≈ 13.5 chars/s): 10 sessions,
  then 4 more with the proposed voice patch.
- Frame time at speed 1 on iPhone landscape (852×393 @3x), 2 × 20 s.

## 1. Verdict in one paragraph
The game is robust. All engaged models finish every session. No session got stuck, and no model or speed produced NaN, a page
error or a malformed line. For a typical 3–4-year-old a chapter takes **85 s** (93–96 % of chapters fall inside 60–100 s) and a
session **5.8 min** (p90 6.2). The two real problems are both about time spent waiting:
1. Nini talks for **82–93 % of the session**. The round end chains "finish" + "alive" + praise into 6–7 s of speech, so the alive
   line ("Look, it's swimming!") starts **1.6–2.5 s after the picture leaves**. In 31–77 % of rounds it is still playing when the next
   prompt is due.
2. A child who taps around (random tapper, ages 5–7) waits up to 169 s per round, because the assist only comes after 7 taps.

The pacing problem has a one-line fix and the waiting problem has a config fix. Both were re-simulated (§5). The other findings are
content variety at ages 6–7, the first chapter at age 4 not being "trivially easy", and taps on the empty sand being ignored.

## 2. Headless numbers (base, 200 sessions per cell)

### 2.1 Durations, stuck rounds and waiting
| model | age | session min (p90) | chapter s mean [p10–p90] | chapters in 60–100 s % | round s (p90) | rounds > 120 s (max s) | steps with a > 30 s no-progress gap % (max s) |
|---|---|---|---|---|---|---|---|
| typical | 3 | 5.8 (6.0) | 84.8 [76–96] | 96.4 | 19.4 (27.6) | 0 (53) | 0.0 (28) |
| typical | 4 | 5.8 (6.2) | 85.3 [71–98] | 93.8 | 19.7 (30.5) | 0 (60) | 0.0 (24) |
| typical | 5 | 5.7 (6.1) | 84.1 [71–98] | 93.5 | 18.7 (26.9) | 0 (47) | 0.0 (18) |
| typical | 6 / 7 | 5.1 / 4.6 | 74.8 / 67.8 | 99.9 / 85.5 | 16.1 / 14.4 | 0 / 0 | 0.0 / 0.0 |
| slow3 | 3 / 4 | 7.0 (7.6) / 7.3 (8.0) | 103 / 107 | 54 / 42 | 27.6 / 30.0 | 0 / 1 (151) | 4.7 / 5.4 (69 / 63) |
| slow3 | 5 / 6 / 7 | 8.3 (9.2) / 7.5 / 7.2 | 123 / 111 / 107 | 24 / 35 / 40 | 36.3 / 31.9 / 29.7 | 3 / 1 / 0 | 5.4 / 4.9 / 6.0 (max 88) |
| tapper | 3 / 4 | 6.9 / 7.6 (8.5) | 101 / 113 | 52 / 28 | 29.7 / 34.1 | 0 / 1 | 1.3 / 0.4 |
| tapper | 5 / 6 / 7 | **9.6 (10.6)** / 8.6 / 7.7 | 142 / 128 / 114 | 5 / 13 / 19 | 44.1 / 39.2 / 34.6 | **31 / 27 / 0 (max 169)** | 1.6 / 2.0 / 1.9 |
| spammer2 (double taps) | 3–7 | 4.8–5.6 | 70–83 | 81–97 | 15–19 | 0 | 0 |
| confused (wrong paint 50 %) | 3 / 4 / 5 | 5.8 / 5.8 / 5.8 | 85 / 86 / 85 | 96 / 93 / 91 | 19.8 / 19.9 / 19.2 | 0 | 0.0 (max 35) |
| dragger (35 % of taps move > 40 px) | 3 / 4 / 5 | 6.2 / 6.2 / 6.2 | 91 / 91 / 92 | 87 / 83 / 81 | 21.8 / 22.2 / 21.6 | 0 | 0.2 (max 51) |
| shellsOnly | 3–5 | **never finishes** | colours chapter 125–168 | – | 38–53 | 0 | – |
| shellsOnly | 6–7 | **never finishes** (chapter 1 has no shells) | – | – | – | – | – |

Notes:
- "Stuck" means 200 s without any state change. It happens only to shellsOnly, a child who never touches the picture: 200/200
  sessions at every age. In the colours chapter that child is helped through by the assist, because shell taps count as no-progress
  taps. In a round with no shells, taps on the empty sand do nothing at all: no hint and no assist (P1-3).
- Talk time: 0 % of questions were answered automatically by any model.

### 2.2 Feedback, help and stars (per round)
| model | age | stars 3/2/1 % | wrong | needPaint | notThis | already | rounds with a hint % | with an assist % |
|---|---|---|---|---|---|---|---|---|
| typical | 3 | 69/23/8 | 0.41 | 0.03 | 0.24 | 0.00 | 13.9 | 0 |
| typical | 4 | 77/17/6 | 0.30 | 0.04 | 0.26 | 0.03 | 9.9 | 0 |
| typical | 5 / 6 / 7 | 74 / 85 / 84 % 3★ | 0.35 / 0.17 / 0.18 | ≤ 0.02 | 0.14 / 0.11 / 0.06 | ≤ 0.05 | 6.4 / 2.8 / 2.3 | 0 |
| slow3 | 3–7 | 42–64 % 3★ | 0.66–1.15 | ≤ 0.10 | 0.35–0.57 | ≤ 0.08 | 29–40 | 0.2–0.8 |
| tapper | 3–7 | 25–64 % 3★ | 0.52–1.64 | 0–0.90 | 0.86–2.71 | 0.18–0.60 | 89–94 | 65–78 |
| spammer2 | 3–7 | 16–49 % 3★ | 1.3–4.0 | 0–1.58 | 1.35–1.98 | 1.1–2.9 | 59–81 | 24–39 |
| confused | 3 / 4 / 5 | 62 / 69 / 68 % 3★ | 0.65 / 0.57 / 0.68 | 0.02 | 0.24 | 0.03 | 21 / 18 / 16 | ≤ 0.3 |
| dragger | 3–5 | 68–78 % 3★ | 0.29–0.44 | 0.03 | 0.22 | 0.02 | 6–15 | 0 |

**Are kids confused?** No. A typical child gets a needPaint, notThis or already line **0.3 times per round**, and a confused child
0.3 times. These lines are rate-limited to one every 2.5 s, so even the tapper's 2.1 notThis per round produce at most about one
spoken line. The colour-confused child recovers through the 2-miss hint in 16–21 % of rounds and loses about 1 star in 6 rounds.

### 2.3 Surprises and variety (per session of 16 rounds)
| age (typical) | surprise rounds % | fishy shown / tapped | pearl shown / tapped | distinct pictures | pictures reused in session % | same template back-to-back | identical prompt repeated | same colour asked twice in a row % |
|---|---|---|---|---|---|---|---|---|
| 3 | 26 | 2.25 / 1.47 | 2.0 / 1.30 | 9.8 | 36 | 0 | 1.4 | 9.2 |
| 4 | 26 | 2.29 / 1.39 | 2.0 / 1.26 | 13.5 | 12 | 0 | 1.5 | 8.3 |
| 5 | 25 | 2.42 / 1.46 | 1.9 / 1.16 | 13.2 | 17 | 0 | 1.1 | 0 |
| 6 | 25 | 2.16 / 1.47 | 2.0 / 1.08 | 9.7 | 40 | 0 | 0.9 | 0 |
| 7 | 25 | 2.03 / 1.53 | 2.0 / 1.07 | **6.0** | **63** | 0 | 1.1 | 0 |

Surprises come at the right rate: 4 of 16 rounds, never the warm-up, and the fishy's second pass makes up for a missed first one.
The tapper hits the fishy in only 0.3 of about 3.6 passes. That is fine, because it is optional. The weakness is picture variety at
ages 6–7: the label and scene pools hold only 3 templates each.

### 2.4 First chapter (skill rule: "trivially easy at the default age")
| age | topic | chapter s | round s | steps / round | shells | wrong / round | 3★ % |
|---|---|---|---|---|---|---|---|
| 3 | colours | 92.2 | 24.4 | 1.52 | 2 | 0.55 | 60 |
| **4 (default)** | colours | **93.3** | 24.4 | **1.79** | **3** | 0.40 | **70** |
| 5 | shapes | 94.1 | 21.9 | 2.07 | 4 | 0.67 | 53 |
| 6 / 7 | lower / initial | 81.5 / 70.7 | 17.8 / 15.1 | 2.1 / 1.75 | 0 | 0.25 / 0.21 | 79 / 81 |

At age 4 the first chapter is the **longest chapter of the session** (count 73 s, shapes 89, animals 86). Every colour step needs
two taps plus a follow-up line, and rounds 1–3 already have 2–3 steps with 3 shells. It is not "trivially easy".

## 3. Browser, speed 8: text of every line (20 sessions, 2 800+ lines)
| age lang | sessions ok | lines / round | distinct lines | `{…}` | undefined / NaN | "màu màu" | EN words in VI | identical back-to-back | > 90 chars (max) | page errors |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 en / vi | 2/2, 2/2 | 9.1 / 9.1 | 188 / 191 | 0 | 0 | 0 | 0 | 0 | 0 (53 / 69) | 0 |
| 4 en / vi | 2/2, 2/2 | 10.3 / 9.7 | 197 / 184 | 0 | 0 | 0 | 0 | 0 | 0 (49 / 60) | 0 |
| 5 en / vi | 2/2, 2/2 | 10.1 / 10.0 | 188 / 183 | 0 | 0 | 0 | 0 | 0 | 0 (53 / 77) | 0 |
| 6 en / vi | 2/2, 2/2 | 8.9 / 9.1 | 154 / 145 | 0 | 0 | 0 | 0 | 0 | 0 (48 / 61) | 0 |
| 7 en / vi | 2/2, 2/2 | 8.0 / 8.3 | 137 / 141 | 0 | 0 | 0 | 0 | 0 | 0 (49 / 50) | 0 |

The text is clean. The only flag in a VI line was "Hi hi!", the fishy's giggle, which was a false positive. The speech forms are
right: "small ess", "double you is for whale", "Ni Ni".

## 4. Speech pacing (voice-faithful browser, a 4-year-old's pace)
| age lang | utterances / min | **speech % of session time** | first prompts heard fully % | cut by the child's own right tap / by other lines | count words heard % (last word) | **alive line starts after the alive event s** (mean, max) | **alive line still speaking when the next prompt is due %** | finish → alive → praise chain s |
|---|---|---|---|---|---|---|---|---|
| 3 en | 26.5 | 88 | 82 | 7 / 0 | – | 2.07 (3.2) | 63 | 6.7 |
| 3 vi | 25.4 | 93 | 70 | 10 / 1 | – | 2.47 (3.2) | 73 | 7.3 |
| 4 en | 27.4 | 82 | 100 | 3 / 0 | 100 (100) | 1.62 (2.5) | 31 | 6.0 |
| 4 vi | 25.8 | 91 | 95 | 3 / 0 | 100 (100) | ≈ 2 | 77 | ≈ 7 |
| 5–7 en/vi | 25–26 | 79–88 | 69–100 | 0–8 / 0 | 78–100 (≥ 75 at 5–6) | 1.8–2.0 | 38–64 | 6.2–8.4 |

- Prompts are protected: almost every cut prompt was cut by the child's own right tap (the paint line interrupts), which does no
  harm. Only 1 prompt in 10 sessions was cut by another line.
- Follow-ups ("Now tap the shining fin!") are heard fully only 57–75 % of the time, because the child taps first. That is harmless.
- Count words: at age 4 every count word was heard, including the final one. (Age 7 VI shows 40–60 %, but the matcher is unreliable on
  VI number words, so I do not count this as a finding.)
- **The real problem** is the round end: last paint line → "Nini finishes the rest!" (2.2–2.8 s) → "Look, it's swimming!" → praise.
  The alive line arrives after the picture has gone, overlaps the next picture's entry and pushes the next prompt back.

## 5. Re-simulations of the proposals
| # | change | effect (base → new) | verdict |
|---|---|---|---|
| A | `main.js` 'finish': bubble only, no speech (`--patch`) | alive-line lag 1.6–2.5 s → **0.04 s**; alive line over the next prompt 31–73 % → **0–7 %**; age-3 first prompts heard fully 82 → **100 %** (EN), 70 → **100 %** (VI); speech share 88 → 79 % (3 EN), 82 → 74 % (4 EN), 91 → 82 % (4 VI); round-end chain 6.0–7.3 → **5.1–5.2 s** | **adopt (P1)** |
| B | `{"assistAfterOld":5}` | tapper 5 / 6 rounds > 120 s **31 → 8, 27 → 12**; session age 5 9.6 (p90 10.6) → **8.6 (9.5)**, age 6 8.6 → 7.7, age 7 7.7 → 6.9; steps with a > 30 s gap 1.6–2.0 → 0.1–0.2 %; typical and slow3 unchanged | **adopt (P1)** |
| C | taps on the empty sand / water count as no-progress taps, with the assist (sim World patch) | shellsOnly: 0 % → **100 % sessions finished** (age 4: 7.5 min); tapper chapters −5…−17 s, sessions −0.4…−1.2 min, 3★ +3…+11 pts; typical unchanged (±0.3 s) | **adopt (P1)** |
| C′ | the same, hint only (no assist) | shellsOnly still never finishes | reject (C is better) |
| D | `{"tapMovePx":64,"tapTime":1.0}` | dragger chapters −2…−3 s, max no-progress gap 50 → 38 s (age 3) and 51 → 30 s (age 5); slow3 steps with a > 30 s gap 4.7 → 3.7 % (age 3); typical ±0.4 s | adopt (P2) |
| E | first chapter, ages ≤ 4: ≤ 2 steps, 2 shells in rounds 0–1 (`--content`) | age 4 typical 3★ 69.6 → 71.3 %, wrong 0.40 → 0.37; tapper 3★ 32 → 44 %, chapter 121 → 111 s; slow3 122 → 116 s; typical chapter length unchanged (93 s) | adopt (P2) |
| F | avoid every template used this session (fallback: the last 2) | reuse at age 3: 36 → 33 %, age 6: 40 → 38 %, age 7: 63 → 63 % (the pool is exhausted) | P2, only together with new templates |
| G | `{"idleHintFrom":1}` | hints in 29 → 47 % of slow3 rounds, no time saved, max gap not shorter | reject |
| H | `{"chapterTimeLimit":65}` (with B) | typical chapter 85 → 82 s (fewer rounds); slow3 / tapper sessions −0.0…−0.3 min | reject: it costs learning rounds and does not help slow kids |

Combined standard check (`hs_playtest.js --n 100 --config '{"assistAfterOld":5,"tapMovePx":64,"tapTime":1.0}'`, 3 020 sessions):
- tapper ages 5 / 6 / 7: sessions 9.6 / 8.5 / 7.8 → **8.4 / 7.7 / 6.9 min**; rounds > 120 s 6 / 8 / 0 → **0 / 3 / 0**.
- slow3: sessions −0.1…−0.2 min.
- typical, perfect, bot and spammer: unchanged within 0.1 min.
- 0 NaN, 0 stuck.

## 6. As a game for a 4-year-old
- **Fun / reward:** The loop is good. Tap a shell, the brush dips, the colour blooms from the finger, and the picture swims, scuttles
  or sails away. The alive animation (2.4 s) comes about every 20 s of effort, which is a good rhythm. Today the voice describes it 2 s
  late (fix A). The alive line is also generic ("it's swimming"). Naming the picture and the child would make it a reward (P2-3).
- **Clarity of what to tap:** It is clear. The target part shines, the right shell glows after 2 misses, and the ghost hand helps.
  needPaint, notThis and already are rare (0.3 per round). The one gap is a child tapping the sand or the water, which today gets
  nothing back (fix C).
- **Boredom over 16 rounds:** At age 4 it is OK, with 13.5 distinct pictures and no back-to-back repeats. At ages 6–7 it is weak:
  6–10 distinct pictures, and at age 7 63 % of rounds reuse a picture already seen. The same 3 label pictures (fish bubbles, buoy
  balloons, whale spout) carry letters, sums, take-away and odd/even.
- **Difficulty curve:** Typical 3★ is 69 % / 77 % / 74 % / 85 % / 84 % for ages 3–7. Ages 6–7 are a little easy (2–3 % of rounds
  need a hint), but there is no fail state and the targets are met, so I would not change it. Age 5 starts with the hardest chapter
  (4-shell shapes: 94 s, 53 % 3★, slow3 158 s). This breaks "easiest first" (P3-1).

## 7. Prioritized recommendations
### P1 — do now
1. **Stop speaking the "finish" line** (`game/js/main.js`, `case 'finish'`):
   `if (!finishSaid) { finishSaid = true; const f = T('finish'); SP.UI.say(f); speak(f); }` →
   `if (!finishSaid) { finishSaid = true; SP.UI.say(T('finish')); }`. The bubble still shows it; the brush sweep says it visually.
   Re-sim A: the alive line is in sync (0.04 s) and age-3 prompts are heard fully 100 %.
2. **`SP.CONFIG.assistAfterOld: 7 → 5`** (`game/js/world.js` line 73; MECHANICS §6). Re-sim B: tapper ages 5–6 rounds > 120 s
   −60…−75 %, sessions −0.8…−1.0 min, no effect on typical or slow children.
3. **Taps on the empty sand / water count as no-progress taps** (`game/js/world.js`, `P.tap`, end of the function):
   `if (onNini) return this._pokeNini();  return null;` →
   `if (onNini) return this._pokeNini();  if (this._noProg >= this._assistAfter()) return this._assist(x, y);  this._noProgress();  return null;`
   (the HUD and bubble never reach the world, so they are not affected). Re-sim C: a child who never touches the picture now
   finishes; the tapper saves up to 1.2 min; typical is unchanged.

### P2 — next
1. **`SP.CONFIG.tapMovePx: 40 → 64`, `tapTime: 0.6 → 1.0`.** Nothing in this game is a drag, so a looser tap only helps
   (re-sim D). Note: `main.js` line 82 still enforces ≥ 24 px via `tapMoveMin`, so 64 wins.
2. **An easier first chapter at ages ≤ 4** (`game/js/content.js`, `buildRound` case `'colors'`): pass `opt.level` from
   `World._beginRound`; when `level === 0 && age <= 4`, use `P = 2` for `roundIndex ≤ 1` and cap `k` at 2 (`stepsFor` → `Math.min(k, 2)`).
   Update `validate`'s `wantP` to match. Re-sim E: tapper 3★ +12 pts, slow3 −6 s per chapter.
3. **Name the picture in the alive line** (`game/js/i18n.js` lines 313–317 / 479–483, plus `main.js` `case 'alive'`, which passes
   `{thing: I18N.name(lang, 'animal' | 'thing', world.cur.templateId), child}`; this needs a `thing` name for sailboat, submarine,
   lighthouse, snail and the labels/scene templates). Example lines:
   EN `'alive.swim': ['Bye-bye, {thing}! Off it swims!', 'Look, your {thing} is swimming, {child}!', 'Swish! The {thing} swims away!']`,
   `'alive.scuttle': ['Bye-bye, {thing}! Scuttle, scuttle!', 'Look, your {thing} runs away, {child}!']`;
   VI `'alive.swim': ['Tạm biệt {thing}! Bơi đi nào!', 'Nhìn kìa bé {child}, {thing} bơi đi rồi!']`,
   `'alive.scuttle': ['Tạm biệt {thing}! Bò ngang, bò ngang!', 'Nhìn kìa, {thing} chạy mất rồi!']`.
   Keep each line under 45 characters so it fits inside the 2.4 s alive phase. Use the classifier ("con cua", "chiếc thuyền") from
   `name()`, and do not add a second "con".
4. **More label and scene pictures, plus session-wide template avoidance** (`pictures.js` + `content.js` `templatesFor`: prev =
   the session's `_prevPics`, falling back to the last 2). Add ≥ 3 `labels` templates (e.g. turtle eggs, jellyfish lanterns, a
   shell necklace) and ≥ 2 `scene` templates, so that ages 6–7 see ≥ 12 distinct pictures per session (today 6–10).

### P3 — later / watch
1. **Age 5 chapter order:** `SP.AGE_TOPICS[5]` starts with 4-shell shapes (the hardest: 94 s, 53 % 3★, slow3 158 s). Start with
   `count` or `letters` (77 / 84 s) and put shapes second.
2. Avoid asking the same (part, colour) twice in one session (1.1–1.5 identical prompts per session), and the same colour in
   consecutive steps (8–9 % at ages 3–4).
3. Slow kids at age 5 still run 8.3 min (p90 9.2). The proposed config and the chapter-limit changes do not fix this (re-sim H), and the
   profile is a 3-year-old set to age 5. Leave it.
4. **Performance:** On iPhone landscape @3x at speed 1, the game's JS draw takes **0.9 ms mean, p95 2 ms** per frame. In headless
   Chromium (software raster, 2 shared cores) rAF ran at 46–51 fps (p50 16.7 ms, p95 33 ms), and the adaptive quality stepped the
   backing store down from 1847×852 to 1334×615. That is a container artefact, but confirm on a real iPhone that `quality` stays at 1
   (`SP.debug.stats.slowFrames`).
5. `tests/sim/voice_analyze.js` needs fixing: it should match spoken forms (letters/numbers) and use `paint` + `count` events instead
   of `correct`. Until then use `voice_pacing.js`.

## 8. Reproduce
```
node tests/sim/hs_deep.js --n 200 --jobs 2 --tag base                       # 7 000 sessions, ≈ 21 min on 2 cores
node tests/sim/hs_deep.js --ages 5,6,7 --models tapper,slow3,typical --config '{"assistAfterOld":5}' --tag r3
node tests/sim/hs_deep.js --models shellsOnly,tapper,typical --content '{"offTap":"assist"}' --tag off
node tests/sim/hs_deep.js --ages 3,4 --content '{"l0MaxSteps":2,"l0Palette":2,"l0PaletteRounds":2}' --tag r1
node tests/sim/hs_playtest.js --n 100 --config '{"assistAfterOld":5,"tapMovePx":64,"tapTime":1.0}' --tag proposed
node tests/sim/hs_voice_text.js --sessions 2 --fps 20
node tests/sim/hs_voice_browser.js --pace child --tag child && node tests/sim/voice_pacing.js child
echo '[{"file":"main.js","old":"SP.UI.say(f); speak(f); }","new":"SP.UI.say(f); }"}]' > /tmp/nf.json
node tests/sim/hs_voice_browser.js --pace child --ages 3,4 --patch /tmp/nf.json --tag nf && node tests/sim/voice_pacing.js nf
```
