# Mochi's Icing Bakery: high-speed playtest report

High-speed playtester, 2026-11-19. This report only measures and recommends. It changes no game code.
I added these scripts under `tests/sim/`:
- `hs_child2.js`: new child models, per-trace metrics, and sim-only patches.
- `loose_check.js`: how loose the tracker is.
- `voice_icing.js`: voice pacing, matched to this game's events.

Outputs are in `tests/sim/out/` (the `.json` files are git-ignored).

## Verdict
The game is in good shape for an engaged child:
- The typical age-4 chapter takes **86–87 s**. The session takes **5.9 min (p90 6.2)**.
- 0 NaN, 0 stuck states, and 0 rounds over 120 s for every model the mechanics team used.
- A child who slides almost never gets magic icing (0 % of traces for the typical, wobbly and slow 3-year-old models; 0.4 % for "lifts often").
- Tracing is **not too strict** for a 4-year-old's 25–45 px wobble on a phone.

The new child models found **three input holes** where a child does something natural and gets **silence and no help**.
One of them can lock a round for **minutes**:
1. **(P1) A slide that makes no progress counts for nothing.** A child whose finger runs steadily beside the last short bit of a stroke never triggers `offPath` (each try is under 0.6 s) and never gets a traceTap. So no help escalates and magic never turns on. Only the 8 s path hint repeats, forever.
   - The par65 model (65 px steady bias) on mixed devices, ages 5 / 6 / 7: **15 / 49 / 109 rounds with no progress for over 60 s**, the longest **656 / 690 / 778 s**, session p90 **12.5 / 16.4 / 21.3 min**.
2. **(P1) Dragging the icing bag from Mochi's paw onto the cookie does nothing.** The press starts off the tray, so it becomes a `soft` drag: a pat sound, no words, and it is not counted for hints.
   - 93–96 % of farBag first tries are ignored.
   - Trace time goes 6.2 → **10.8 s** at age 4 and 6.8 → 12.7 s at age 3.
   - **47–63 %** of traces at ages 3–4 need the ghost hand.
3. **(P1) Dragging the right choice (bag / cookie) onto the tray does nothing.** Same cause: a `soft` drag that is silent and not counted.
   - Pick time 5.7 → **8.1 s** at age 4 and 9.9 s at age 3.
   - 1.2–1.6 ignored drags per pick, with gaps of up to 53 s.

Re-simulated, all fixes together (table §6):
- 0 rounds with no progress for over 60 s for every model (the longest gap is now ≤ 39 s).
- farBag hints 47 → 15 %; dragPick pick 8.1 → 5.4 s.
- Typical age-4 chapter **87 → 81 s**, session **5.9 → 5.5 min**.
- Every model that did not need a fix is unchanged.

## 1. What ran
| run | sessions | what |
|---|---|---|
| `hs_playtest --n 60` (pt_base) | 2 120 | 8 lib models × ages 3–7 × 5 viewports × EN/VI (repeats the mechanics team's numbers) |
| `hs_child2` models | 2 100 | typical, lifter, backwards, farBag, farTray, dragPick, cornerCut × ages 3–7 |
| `hs_child2` devphone / parphone | 1 600 + 1 080 | phone viewports only: wobble 25–75 px, steady bias 30–85 px, ages 3–5 |
| `hs_child2` patched / par_* / after2 | 2 400 + 2 700 + 1 440 | sim-only code patches (§5) and the CONFIG changes |
| `hs_playtest` E0–E3 | 2 880 | flow CONFIG options (shortBudget, chapterTimeLimit) |
| `hs_child2` before / after | 4 220 + 4 220 | 14 models × 5 ages, the final before / after comparison |
| `loose_check.js` | ≈ 9 000 paths | how loose the tracker is (straight swipe, corner smoothing, parallel offset) |
| `hs_browser.js` (real page, `?speed=8&bot=1`) | 10 | ages 3–7, iPad landscape + iPhone portrait |
| `hs_voice_browser.js --pace child` (virtual clock, fake TTS ≈ 13.5 chars/s) | 10 + 10 | ages 3–7 × EN/VI, before and after the voice patch |

**Total: ≈ 25 000 headless sessions and 30 real-page sessions.**
- Real page: 10/10 sessions done, 0 page errors, 3.4–3.9 min with the bot at skill 0.8. This matches headless bot0.8 (3.4–3.7 min).

## 2. Baseline numbers (current build, `hs_pt_base`, `c2_models`)
| model | age | session min (p90) | chapter s mean [p10–p90] | round s (p90) | trace s (p90) | stars 3/2/1 % | offPath / traceTap per round | rounds with a hint % | magic rounds % |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 6.0 (6.3) | 87.6 [78–98] | 19.7 (26.2) | 6.8 (10.4) | 73/21/7 | 0.12 / 0.08 | 18 | 0 |
| typical | 4 | 5.9 (6.2) | 86.2 [74–100] | 19.5 (27.2) | 6.2 (9.4) | 83/13/3 | 0.14 / 0.06 | 13 | 0 |
| typical | 5 / 6 / 7 | 5.5 / 5.3 / 4.7 | 80 / 78 / 69 | 17.8 / 17.2 / 14.7 | 5.7 / 5.5 / 5.1 | 88 / 91 / 91 % 3★ | ≤ 0.10 / 0.07 | 5–7 | 0 |
| wobbly | 3–7 | 6.0 → 4.9 | 88 → 72 | 19.8 → 15.4 | 7.0 → 5.8 | 69–91 % 3★ | ≤ 0.13 / 0.10 | 6–19 | 0 |
| slow3 | 3 / 4 | 7.0 (7.7) / 7.5 (**8.1**) | 104 / 111 (90 % of chapters cut at 3 rounds) | 29.7 / 31.9 | 12.3 / 12.4 | 61 / 67 % 3★ | 0.28 / 0.13 | 46–48 | 0 |
| slow3 | 5 / 6 / 7 | 7.9 (**8.5**) / 7.9 (**8.7**) / 7.6 (**8.3**) | 113–117 | 33–35 | 14–16 | 56–68 % 3★ | ≤ 0.39 / 0.23 | 51–55 | 0 |
| lifter (lifts every 50–130 px) | 3 / 4 | 7.0 (7.6) / 6.6 (7.0) | 103 / 97 | 27.6 / 25.3 | **14.7 / 12.1** | 71 / 83 % 3★ | 0.05 / 0.43 | 25 / 18 (per trace) | 0.4 / 0 |
| backwards (first try from the far end) | 3 / 4 | 6.3 / 6.1 | 92 / 90 | 22.6 / 21.5 | 9.6 / 8.6 (shapes **13.3 / 12.3**) | 70 / 85 % 3★ | 0.97 / 0.73 per trace | 29 / 20 | 0 |
| farBag (first try drags the bag from Mochi's paw) | 3 / 4 | 6.4 / 6.3 | 94 / 93 | 24.9 / 24.0 | **12.7 / 10.8** | 72 / 85 % 3★ | 0.09 / 0.06 per trace, **0.94 ignored drags** | **63 / 47** | 0 |
| farTray (presses the cookie centre, slides to the start) | 3 / 4 | 5.9 / 5.8 | 86 / 85 | 19.1 / 19.3 | 6.5 / 5.9 | 70 / 84 % 3★ | 0.14 / 0.01 | 6 / 5 | 0 |
| dragPick (drags the right choice onto the tray 50 % of the time) | 3 / 4 | 6.3 / 6.2 | 93 / 91 | 23.2 / 21.6 | 7.0 / 6.3 | 70 / 83 % 3★ | pick **9.9 / 8.1 s**, 1.56 / 1.23 ignored drags per pick | 7 / 8 | 0 |
| cornerCut (path smoothed ±35 px) | 3–7 | = typical | = typical | = typical | 4.9–6.5 | = typical | 3–5 % traces offPath | 4–7 | 0 |
| tapper | 3–7 | 7.0–7.8 (p90 ≤ 8.3) | 103–115 | 31–35 | 15–19 | 46–59 % 3★ | 0 / 4–6 | 100 | 100 (by design) |
| spammer | 3–7 | 5.4–5.7 | 79–84 | 17–18.5 | 6–7 | 34–48 % 3★ | 0 / 4.3–6 | 100 | 100 (by design) |
| perfect / bot0.8 | 3–7 | 3.9–4.5 / 3.4–3.7 | 57–66 / 49–54 | 12.6–14.6 / 10.4–11.7 | 3.3–3.8 / 2.9–3.4 | 100 / 78–82 % 3★ | 0 | 0 / 3–4 | 0 |
| absent | 3–7 | – | – | – | – | – | – | idle nudges at 15.5, 33.5, 60.5, 90.5, 120.5, 150.5 s | – |

Chapter s by topic (typical):
- **Age 4:** colours 87.7 · shapes 84.5 · count **95.2 (p90 105)** · animals 77.4.
- **Age 3:** colours 89.1 · shapes 90.6 · size 86.8 · animals 82.3.
- **slow3, age 4:** count **129 s** (the slowest chapter: pick + trace + chips).

## 3. Is tracing too strict or too loose? (phones, logical px, short side 720)
On screen the tolerance is `tol × tray.s`. At age 4 that is iPhone portrait **63**, iPhone landscape **67**, iPad landscape 46–54, iPad Air 61 logical px.

Phone logical px are physically small: 1 px ≈ 0.09 mm on iPhone, against 0.22 mm on iPad. So the age-4 tolerance is **≈ 5.7–6.1 mm on a phone** but 10–12 mm on an iPad. **The phone is the strict device.**

**Wobble** (`dev<N>`, a smooth sideways wobble of N px at its peak plus ±5 px noise, iPhone P + L, 80 sessions each):

| wobble peak px | 25 | 35 | 45 | 55 | 65 | 75 |
|---|---|---|---|---|---|---|
| age 4: traces with offPath % / trace s | 3.0 / 6.2 | 4.0 / 6.2 | 1.8 / 6.2 | 1.7 / 6.2 | 1.7 / 6.3 | 1.7 / 6.2 |
| age 3: traces with offPath % / trace s | 4.4 / 7.0 | 4.3 / 7.0 | 2.3 / 7.0 | 1.5 / 7.0 | 1.6 / 7.0 | 1.6 / 6.9 |

Corner cutting (`c`, ±30 px smoothing) changes nothing.

**Conclusion:** a 25–45 px (2.3–4 mm) wobble, even 75 px, costs **nothing**. The forward window (`look` 90) catches up every time the finger swings back across the dots.

**A steady sideways bias is what actually fails.** Real causes are the fat-finger contact offset and a child tracing beside the dots so she can see them. Model `par<N>`: a steady bias of N px plus a 12 px wobble (`c2_par_base`, iPhone P + L):

| bias px | age 3: traces with offPath % / magic % | age 4 | age 5 |
|---|---|---|---|
| 45 | 7 / 0 | 7 / 0 | 4 / 0 |
| 55 | 8 / 0 | 8 / 0 | **24** / 0 |
| 65 | 7 / 0 | **27** / 0.6 | **90 / 44** (7 rounds > 60 s) |
| 75 | **37** / 3 | **92 / 49** | 100 / 99 (25 rounds > 60 s, max **414 s**) |
| 45 + 30 px wobble | 6 / 0 | 8 / 0 | 9 / 0 |

So the cliff sits at roughly tolerance − 10 px.
- At age 4 on a phone, a sustained bias of **60–65 px (≈ 5.5 mm)** already fails.
- At age 5, 50–55 px fails.

That leaves only about 1.5 mm of headroom over the 45 px upper end of a 4-year-old's typical deviation.

**With `tol {3:72, 4:64, 5:55, 6:50, 7:45}` plus slideNoProg** (`c2_par_slide_tol`):

| bias px | age 4 traces with offPath % | age 4 magic % | age 4 trace s | age 5 traces with offPath % | age 5 magic % | age 5 trace s |
|---|---|---|---|---|---|---|
| 65 | 27.7 → **10.5** | 0.8 → 0 | 7.8 → 6.8 | 95 → **60** | 70 → **7** | 18 → 11 |
| 75 | 96 → **50** | 66 → **8** | 14.5 → 9.6 | – | – | – |

**Too loose?** (`loose_check.js`, every generated path, the tracker alone):
- A straight swipe from start to end completes **100 % of waves** at every age, and **77–91 %** of the zigzags (ages 3–5; this includes the small 74 px-tall pair strokes).
- The single wave's 110 px height means a straight swipe is never more than 55 px off it, which is inside the tolerance.
- Letters and numbers stay honest: a straight swipe completes only 6–26 % of them (the one-line glyphs), and a 1.2 × tol parallel offset fails 100 %.
- The tolerance bump does not change any of this (`loose_tol.md`).
- For colours this is acceptable: the learning goal is the colour.

## 4. Voice load (real page, virtual clock, fake TTS; bot slowed to a typical 4-year-old's pace)
`voice_pt_child.md` (before) → `voice_pt_child_v2.md` (with the §5 P2-voice patch applied to the served `main.js` only):

| metric | ages 3–4 before | ages 3–4 after | ages 5–7 before | ages 5–7 after |
|---|---|---|---|---|
| utterances / min | 24.5–26.1 | **21.5–23.2** | 22.7–24.6 | **19.9–22.6** |
| speech % of the session | 83–93 % | **75–87 %** | 78–87 % | **72–79 %** |
| busiest 10 s | 6–7 lines | 5–7 | 6–8 | 5–8 |
| prompts heard in full | EN 89–94 %, **VI 76–86 %** | EN 91–94 %, **VI 83–91 %** | 65–100 % ¹ | 74–97 % ¹ |
| prompt start lag (ask → voice) mean / p90 | 1.68 / 3.82 s | **1.20 / 2.93 s** | 1.33 / 2.81 s | **0.92 / 1.71 s** |
| lines dropped (said but never spoken) per session | 4–10 | **1–6** | 5–28 ¹ | 5–26 ¹ |
| count words heard | 92–100 % | 92–100 % | 88–100 % | 94–100 % |
| traceDone praise heard | 100 % | 100 % | 67–88 % ¹ | 67–88 % ¹ |
| round praise heard | 100 % | 100 % | 100 % | 100 % |
| identical lines back to back / the same prompt twice in a row | 0 / 0 | 0 / 0 | ≤ 1 / 0 | ≤ 1 / 0 |

¹ Ages 6–7 under-count: letter lines are spoken with letter names ("F" → "eff"), so my text match misses them. I checked the dump by hand and those lines were spoken.

Per round at ages 3–4 (before), Mochi talks for these events:
- prompt 7.0 s
- traceDone 2.5 s
- **finish ("Sprinkles!") 1.8 s**
- round praise 1.5 s
- pick 1.5 s
- "Yummy!" 0.5 s, **cut 56 %**

That means about 5.8 s of praise back to back while the cookie hops (finish + hop ≈ 2.6 s). The next prompt waits behind it, up to 4.7 s.

Other things the dump shows:
- `wrong` lines are cut 76–100 % by the child's next (right) tap. The child hears "That’s blue icing. Let’s find yel—". The name of what was tapped is heard; that is acceptable.
- `strokeDone` lines ("Now the next line!") are cut 88 % in multi-stroke letters.
- The mouse line "Who is peeking out of the flour sack?" was queued right after the prompt and cut 3× in VI and 1× in EN by the pick feedback.
- No line spam: offPath + traceTap lines ≤ 1 per 4 s, hint lines ≤ 0.2 / min. Counting is always queued and heard (the misses are a fast child's overlapping numbers).

## 5. Recommended changes (exact) with before → after numbers
Every change was re-simulated with sim-only monkeypatches (`hs_child2.js --patch …`) or `--config`.
- Voice changes: `--patch tests/sim/patches/voice_pt.json`.
- Final combined comparison: `c2_before` vs `c2_after` (+ `c2_after2` with offAfterNear).

### P1: input holes (world.js)
1. **slideNoProg.** In `P._traceUp`, a press-slide-release on the tray that made **no progress** and moved ≥ `traceTapMove` (20 px) now counts like `offPath`:
   - Add `if (!p.prog && p.moved >= cfg.traceTapMove && !this._magic && this._lastOffT < p.t) { this._offN++; this._lastOffT = this.time; this._emit({type:'offPath', n:this._offN, slide:true, x:p.lx, y:p.ly, hx, hy}); this._traceNoProg(); }` before `return null`.
   - So the 2nd gives a hint and the 4th (≤ 4) / 6th turns on magic.
   - par65 ages 5 / 6 / 7: rounds > 60 s **15 / 49 / 109 → 0 / 0 / 0**, longest gap 656 / 690 / 778 → 39 / 34 / 38 s, session p90 12.5 / 16.4 / 21.3 → 7.1 / 7.1 / 6.6 min.
   - par75 age 5 (phones): 25 rounds > 60 s (max 414 s) → 0 (max 35 s).
   - Typical / wobbly / slow3 unchanged; magic for sliding models stays 0–0.6 %.
2. **anyPress.** In `P.pointerDown`, during an interactive trace step a press off the tray becomes a trace press (`_traceDown`) when it lands on the resting bag. The sim rule: within 90 px of `(layout.bag.x, layout.bag.y − 40)`, or anywhere that is not Mochi's body, the bird or the mouse.
   - farBag ages 3 / 4 / 5: trace s **12.7 / 10.8 / 9.9 → 7.5 / 6.9 / 6.5**, traces with a path hint **63 / 47 / 33 → 10 / 10 / 6 %**, ignored drags 0.94 → 0.11 per trace.
   - tapper / spammer unchanged (sessions ±0.2 min).
3. **dragPick.** In `P.pointerUp`, during a pick step, a press that started on a choice, moved ≥ `tapMovePx` and is released over the tray (pad 90) calls `_tapChoice(choice)`. A wrong one is a normal, kind "wrong".
   - dragPick ages 3 / 4: pick **9.9 / 8.1 → 6.0 / 5.4 s**, ignored drags 1.56 / 1.23 → 0, longest no-progress gap 53 / 40 → 21 / 17 s, 3★ rounds 70 / 83 → 87 / 93 %.
   - Also count a `soft` drag in a pick step as `_noProgress()` so the hint still comes.

### P2: tracing comfort (world.js / trace.js / CONFIG)
4. **offAfterNear.** In `P._stepTraceHelp`, accumulate `_offT` only after this press has once been on the dots (`if (!st.off) p.near = true; … && p.near`). Without it, anyPress makes the drag from the bag say "Follow the dots!" in 48–61 % of farBag traces.
   - farBag ages 3–5: offPath per trace 0.66–0.89 → **0.02–0.06**.
   - The child who never reaches the dots is still caught by slideNoProg on release.
5. **bothWays (closed outlines only).** For a `shape` / size-circle path (one closed stroke, no progress yet), set the direction from the finger's first 40 px of movement after a press within `1.4 tol` of the start. Going the other way round reverses the resampled points; the start stays the same.
   - Open strokes, letters and numbers keep their stroke order on purpose.
   - backwards ages 3 / 4 / 5: traces with offPath **74 / 63 / 56 → 37 / 45 / 36 %**, trace s 9.6 / 8.6 / 8.0 → 7.8 / 7.7 / 7.1, path hints 29 / 20 / 10 → 12 / 13 / 7 %.
   - Typical unchanged.
6. **`CONFIG.tol` {3: 66 → 72, 4: 58 → 64, 5: 50 → 55, 6: 46 → 50, 7: 42 → 45}** (≈ +10 %; a phone age-4 tolerance of 6.3–6.7 mm).
   - See the bias table in §3: 65 px bias at age 4: 28 → 10 % offPath traces; age 5: magic 70 → 7 %.
   - Not looser where it matters: letters / numbers by straight swipe still 6–26 %, a 1.2 tol offset still fails.
   - Typical / wobbly unchanged (offPath traces 13–15 % at 3–4).
   - The alternative is a phone-only floor: `max(tol·s, ≈ 38 CSS px)`, set from main.js.

### P2: flow (CONFIG + content.js)
7. **`CONFIG.shortBudget` [∞, ∞, 44, 58] → [∞, ∞, 30, 50]** and **`CONFIG.chapterTimeLimit` 75 → 68** (`hs_E0` vs `hs_E2`, 80 sessions × typical / slow3 / tapper × ages 3–5).

   | | before | after |
   |---|---|---|
   | typical age 4 chapter s (p90) | 86.2 (99.5) | **81.3 (91.9)** |
   | first chapter (colours) at age 4 | 87.7 | **80.5** (round 2 becomes one pair) |
   | count at age 4 | 95.2 (p90 105.4) | **86.1 (96.6)** |
   | typical age 4 session | 5.9 (6.2) | **5.5 (5.8)** |
   | age 3 colours | 89.1 | 80.7 |
   | age 3 session | 5.9 | 5.6 |
   | slow3 age 4 session p90 | 8.0 | 8.0 (mean 7.5 → 7.3) |
   | stars | | unchanged |
   | chapters with Talk after 3 rounds (typical age 4) | 12 % | 22 % |

   Making round 1 short as well (`[∞, 28, 30, 50]`) only took slow3's counting chapter from 129 → 124 s, so I don't recommend it.
8. **Topic order, `content.js` `topicsFor`:** sort all four by pool order. Replace `return [first].concat(fresh.concat(old).slice(0, 3).sort(ord));` with `return [first].concat(fresh.concat(old).slice(0, 3)).sort(ord);`.
   - Today, at age 3, **50 %** of later sessions open with `count`, the hardest age-3 topic (slow3 129 s). Ages 4–7 open with their pool's last topic 11–14 % of the time.
   - After: 0 %, and all 5 pool topics still appear within 3 sessions (100 %).
   - Example age 3: colors>shapes>size>animals | shapes>size>animals>count | colors>shapes>animals>count …

### P2: voice (main.js), re-simulated with `tests/sim/patches/voice_pt.json` (§4)
9. `finish`: show the bubble only. Delete `if (canInterrupt()) speak(T('finish'));` (the sprinkle sound and the "Sprinkles!" bubble stay). This is the 3rd praise line in a row.
10. `traceProgress`: add `&& world.path && world.path.len >= 450` to the 50 % "Yummy!" rule. Today it is cut 56 % on short strokes and roads.
11. `ask`: queue `trace.start` only when the prompt does not already say it. Add `&& !/shining|sparkly|chấm sáng|lấp lánh/i.test(txt)`.
12. Mouse: say `surprise.mouse` at the `mouse` peek event (`if (!mouseSaid && canInterrupt())`), not right after the prompt.

Together (9–12) at ages 3–4:
- utterances / min **25 → 22**
- speech share **83–93 → 75–87 %**
- prompt start lag **1.68 → 1.20 s** (p90 3.82 → 2.93 s)
- VI prompts heard in full **76–86 → 83–91 %**
- dropped lines 4–10 → 1–6
- praise / count / traceDone heard unchanged (100 / 92–100 / 100 %)

### P3: content and wording (from playing it in my head as a 4-year-old)
13. **`p.colors`:** 2 of the 3 wordings never say what to do first. EN "Let’s pipe a red wave!" / "Can you make a red wave?"; VI "Bé ơi, mình vẽ một cầu vồng màu vàng nhé!" / "Bé vẽ được một đường lượn sóng màu tím không nào?". A 4-year-old will try to draw on the cookie and get needPick. Change to:
    - "Let’s pipe a {color} {stroke}! Tap the {color} icing!"
    - "Can you make a {color} {stroke}? Tap the {color} icing bag!"
    - VI: append "Bé chạm vào túi kem {color} nhé!"
14. **Wave:** a straight swipe completes 100 % of waves (single wave h 110 → amplitude 55 < tol). If you want real wave practice, change `content.js` l. 229 single-pair `h` for `wave` from 110 → **170**. A straight swipe then reaches only 3–4 % of the wave at tol 50–72; the zigzag at 110 is already fine. Otherwise leave it: the learning goal there is the colour.
15. **`trace.stroke`** on multi-stroke glyphs is cut 88 %. Say it only after the 1st stroke of a glyph; the chime carries the rest.

### Left as is (checked)
- **Magic icing thresholds.** A sliding child gets magic in 0 % (typical, wobbly, slow3, cornerCut, farTray) to 0.6 % (lifter at age 3) of traces. It carries the tapper / spammer (by design).
- **The hint cooldown and idle backoff** behave as specified (absent child: 15.5, 33.5, 60.5, 90.5, 120.5 s).
- **The tapper at age 6** has session p90 8.2–8.3 min, which is a child who never slides; I accept it.
- **slow3 at ages 5–7** has p90 8.3–8.7 min. That is a slow 3-year-old given 5–7-year-old content, a stress case.

## 6. Final before / after (all P1 + P2 world / CONFIG changes; `c2_before` vs `c2_after` / `c2_after2`, 60 sessions × 5 viewports × EN/VI per row)
| model | age | session min (p90) | chapter s (p90) | trace s (p90) | traces with a path hint % | magic traces % | rounds > 60 s without progress (max s) |
|---|---|---|---|---|---|---|---|
| typical | 4 | 5.9 (6.3) → **5.5 (5.8)** | 87.2 (98.7) → **81.2 (92.3)** | 6.2 → 6.2 | 6.1 → 6.9 | 0 → 0 | 0 (23) → 0 (23) |
| typical | 3 | 5.9 (6.2) → 5.6 (5.9) | 87.4 → 82.7 | 6.8 → 6.8 | 5.9 → 6.0 | 0 → 0 | 0 → 0 |
| slow3 | 3 / 4 | 7.0 / 7.4 → 6.9 / 7.3 | 103 / 110 → 101 / 107 | 12.2 / 12.6 → 12.3 / 12.5 | 28 / 33 → 29 / 34 | 0 → 0–0.1 | 0 → 0 |
| farBag | 4 | 6.3 → **5.6** | 93.1 → **82.3** | **10.8 → 6.9** (7.6 with offAfterNear) | **47 → 10** (15) | 0 → 0 | 0 → 0 |
| dragPick | 4 | 6.2 → **5.6** | 90.7 → **82.3** | 6.3 → 6.3 | 7.8 → 7.3 | 0 → 0 | 0 (40) → 0 (17) |
| backwards | 4 | 6.1 → **5.7** | 90.1 → **84.2** | 8.6 → 7.7 | 20 → 13 | 0 → 0 | 0 → 0 |
| lifter | 3 | 7.0 (7.6) → 6.8 (7.3) | 103 → 100 | 14.7 → 15.1 | 25 → 27 | 0.4 → 0.6 | 0 → 0 |
| par65 | 5 / 6 / 7 | 9.0 (12.5) / 11.4 (16.4) / 14.8 (21.3) → **6.5 (7.1) / 6.8 (7.1) / 6.2 (6.6)** | 134 / 169 / 228 → 95 / 100 / 91 | 29 / 42 / 63 → 15 / 19 / 17 | 92 / 100 / 100 → 72 / 98 / 100 | 75 / 98 / 100 → 52 / 91 / 100 | **15 / 49 / 109 (656 / 690 / 778) → 0 / 0 / 0 (39 / 34 / 38)** |
| tapper / spammer | 3–7 | 6.9–7.8 / 5.3–5.7 → same ±0.2 | same | same | same | 99.4–100 → same | 0 → 0 |
| perfect | 3–7 | 3.9–4.5 → 3.9–4.4 | 57–66 → 57–64 | same | 0 | 0 | 0 |

## 7. Playing it as a 4-year-old
- **Is the start dot obvious?** Yes. It is a glowing ring with a chevron, and the voice says "Press on the shining dot!" in every first-trace prompt.
  - But the **icing bag in Mochi's paw is the biggest, most "grabbable" thing** next to the cookie. Right after "Tap the red icing" the bag flies into her paw, so grabbing it again and pulling it onto the cookie is the natural move. Today that silently does nothing (finding 2).
- **Does the voice say what to do?** Mostly. 2 of 3 colour prompts don't say to tap a bag (P3-13).
- **Mochi talks a lot.** She speaks for about 85 % of the session at ages 3–4. The praise chain at the end of a round runs ≈ 6 s; after the voice patch, ≈ 4 s.
- **How long are the rounds?** About 20 s at age 4.
  - Steps per round: colours 2 (rounds 0–1) or 4 (rounds 2–3, two pairs), shapes / animals 2, counting 3 (pick + trace + chips).
  - The two-pair colour rounds in chapter 1 are the main reason chapter 1 runs longer than the shapes / animals chapters. Making round 2 short (P2-7) brings it down to 80 s.
- **Is the hop reward satisfying?** Yes. Gleam, then sprinkles rain, then a crouch and a hop, a flip onto the rack slot, a settle bounce, and the rack fills with 4 cookies per chapter. Animals walk home and jump for joy first; that is the best moment.
  - The spoken "Sprinkles!" on top of the traceDone praise and the round praise is one line too many (P2-9).
- **Is it boring after 4 rounds?** Not within a chapter: the strokes, shapes, animals and numbers change every round (0 % asked twice in a row for shapes / animals / letters; 1.6 % for colours at age 3; 7.6–8.3 % for count; 15–18 % for size, which only has two values). The surprise round, Talk time and a new season each chapter break things up. Over sessions the topic rotation covers all 5 pool topics within 3 sessions.

## 8. How to re-run
```
node tests/sim/hs_playtest.js --n 60 --jobs 2 --tag pt_base
node tests/sim/hs_child2.js --n 60 --models typical,farBag,dragPick,backwards,par65 --tag before
node tests/sim/hs_child2.js --n 60 --models typical,farBag,dragPick,backwards,par65 \
  --patch anyPress,dragPick,bothWays,slideNoProg,offAfterNear \
  --config '{"tol":{"3":72,"4":64,"5":55,"6":50,"7":45},"shortBudget":[1e9,1e9,30,50],"chapterTimeLimit":68}' --tag after
node tests/sim/hs_child2.js --n 60 --ages 3,4,5 --vps iphoneP,iphoneL --models par45,par55,par65,par75 --tag parphone
node tests/sim/loose_check.js 30 [--tol '{…}']
NODE_PATH=$(npm root -g) node tests/sim/hs_voice_browser.js --pace child --tag pt_child [--patch tests/sim/patches/voice_pt.json --tag pt_child_v2]
node tests/sim/voice_icing.js pt_child
NODE_PATH=$(npm root -g) node tests/sim/hs_browser.js --sessions 2
```
Once the fixes are in the game, the `--patch` names in `hs_child2.js` must be dropped. Otherwise they patch an already-patched world: harmless for `dragPick` and `anyPress`, but `slideNoProg` would double-count.
