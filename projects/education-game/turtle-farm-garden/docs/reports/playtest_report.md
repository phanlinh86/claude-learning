# Tumi's Flower Farm — high-speed playtest report (2026-11-25)

Report-only: `game/js` was **not** edited. Only `tests/sim/*` changed (listed at the end). Every proposed change was
re-simulated by overriding `FT.CONFIG` (`--config`) or by sim-only string patches (`SIM_PATCH` / `--patch`).

## Verdict
The game is in good shape for a 4-year-old. Every target is met: typical age-4 session **5.5 min (p90 5.8)**, chapter
**81 s [73–91]**, 0 NaN, 0 stuck states, 0 rounds > 120 s, 40/40 browser sessions with 0 console errors and 0 missing assets.
The trace is **well tuned for ages 3–4**. There is a strictness cliff between ages 4 and 5. The Vietnamese prompts are too
long (≈ 6.5 s for a colour prompt), so lines get dropped. Recommended changes: 2 CONFIG lines, 1 content line, 3 VI text lines.

## 1. Headless sims — `node tests/sim/hs_playtest.js --n 300 --ages 3,4,5,6,7 --models typical,slow3,wobbly,perfect,tapper,spammer,bot0.3,bot0.6,bot1,absent`
13 520 sessions, 0 failed (1 224 s on 2 cores). Every 2nd pair of sessions now plays the 5th pool topic (the real game rotates topics).

| model | age | session min (p90) | chapter s mean [p10–p90] | round s p50 / p90 / p99 | trace s (p90) | stars 3/2/1 % | path hints / round | magic water rounds % | talk right / wrong / Tumi-answered % |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 5.7 (6.0) | 83.6 [76–92] | 18.1 / 26.0 / 35.7 | 7.1 (10.7) | 74/19/7 | 0.08 | 0 | 78 / 22 / 0 |
| **typical** | **4** | **5.5 (5.8)** | **81.4 [73–91]** | 16.9 / 25.5 / 35.3 | 6.3 (9.9) | 84/13/3 | 0.08 | 0 | 88 / 12 / 0 |
| typical | 5 / 6 / 7 | 5.3 / 5.1 / 4.9 | 77 / 75 / 72 | 15.5 / 14.9 / 14.2 (p50) | 5.4 / 5.6 / 5.2 | 88 / 92 / 92 % 3★ | ≤ 0.05 | 0 | 92 / 95 / 95 right |
| wobbly | 3 / 4 / 5–7 | 5.7 / 5.6 / 5.0–5.4 | 84 / 82 / 74–79 | 18.7 / 17.4 / 15–16 | 7.6 / 6.8 / 5.8–6.2 | 74 / 84 / 88–93 % 3★ | ≤ 0.12 | 0 | ≈ typical |
| slow3 | 3 / 4 | 7.2 (7.9) / 7.3 (7.9) | 106 / 107 [85–136] | 29 / 45 / 65 | 12.8 (21.4) | 63–66 % 3★ | 0.41–0.43 | 0.0–0.1 | 60 / 40 / 0 |
| slow3 | 5 / 6 / 7 | 7.6 / 8.0 / 7.8 (p90 ≤ 8.8) | 113–118 | 31–33 / 50–52 / 73–78 | 13.7–16.0 | 64–66 % 3★ | 0.50–0.60 | 0 | 58–61 right |
| tapper | 3–7 | 7.0–7.6 (p90 ≤ 8.0) | 103–113 | 31–34 / 37–41 / 46–51 | 15–19 | 51–60 % 3★ | 1.0 | 100 (by design) | 79–95 right |
| spammer | 3–7 | 5.4–5.6 | 80–82 | 17–18 / ≤ 21 / ≤ 27 | 6–7 | 38–54 % 3★ | 0.5–0.7 | 100 (by design) | 77–95 right |
| perfect | 3–7 | 4.1–4.4 | 60–64 | 13 / ≤ 19 / ≤ 22 | 3.3–4.0 | 100 | 0 | 0 | 100 |
| bot0.3 / 0.6 / 1 | 3–7 | 4.0–4.2 / 3.7–3.9 / 3.4–3.6 | 59–62 / 54–57 / 49–52 | ≤ 18.6 p90 | ≈ 3–4 | 30–39 / 59–63 / 100 % 3★ | 0 | 0 | ≈ skill |
| absent | 3–7 | — (never finishes, by design) | | | | | | | idle nudges at 15.5, 33.5, 60.5, 90.5, 120.5, 150.5 s |

- **Stuck**: 0 stuck states, **0 rounds > 120 s** (max 116 s, slow3 age 7), 0 NaN (including `ic.bloom`, `c.grow`,
  butterflies). Rounds with no progress for more than 60 s happened only for slow3: 0 / 1 / 1 / 0 / 3 out of ≈ 1 200 rounds per
  age (max 71 s). Gaps over 30 s: 1.9–2.8 % of slow3 rounds and 0 % for every other model.
- **Hints and help**: magic water is **0 % for every model that slides** (typical / wobbly / slow3 ≤ 0.1 %). It carries the
  tapper and the spammer, as intended. Typical age 4 sees a hint in 12.5 % of rounds. Talk time: Tumi never had to answer herself (0 %).
- **"2nd miss without a hint"**: typical 2–10 per 300 sessions, slow3 24–35. All of these fall inside the 6 s hint cooldown
  (by design, MECHANICS §13).
- **Bag off-screen**: tapper 1–2 frames in 300 sessions. Negligible.
- **Content variety** (new columns): **0** identical round keys back to back, **0** identical asked values back to back, **0**
  rounds with two animals sharing a home. Ages 3–5 see all 10 animals, all 8 homes, 5 shapes (3–4) or 8 shapes (5), and
  numerals 1–6 (3–4), 1–10 (5) or 0–20 (7). Letters: all 26, and lower case 24 (no i / l).
  **Gap**: at ages 6–7 the carrot count **N = 4 never comes up** (counts 1 2 3 5 6 … 12). `countN` gives r0 1–2, r1 2–3 and
  later rounds 5–12.
- **Chapters**: the count chapter is the longest at every age (typical 87–90 s against 67–82 s for the others; slow3 129–146 s),
  because it has 3 steps per round. slow3 has 96–100 % of chapters cut to 3 rounds (`chapterTimeLimit` 68 s). This works as intended.

## 2. Browser at high speed — `node tests/sim/hs_browser_vp.js --ages 3,4,5,6,7 --sessions 2`
`?speed=8&bot=1&autostart=1&autorestart=1&mute=1&age=N&seed=K` on iPhone portrait 393×852@3, iPhone landscape 852×393@3,
iPad landscape 1180×820@2 and iPad portrait 820×1180@2, alternating EN and VI. That is 20 pages × 2 sessions.

- **40 / 40 sessions completed**. Each session took 3.6–4.0 sim-min (bot 0.8) and 16 rounds. `FT.Assets.missing` was **[]**
  everywhere. **0 console or page errors**, and no warnings apart from Chromium's headless AudioContext autoplay notice (now
  filtered). The world stayed finite. The voice log had 0 `{}` / undefined / NaN, **0 identical lines back to back** and
  **0 English words in VI** lines. Chapters rotate between sessions (session 2 plays the 5th pool topic).
- **Frame time** (this sandbox: 2 vCPU, no GPU, software canvas): p50 16.7 ms, p95 33 ms, max 67–200 ms (one-off spikes).
  14–23 % of frames were over 22 ms. A 12 s check at speed 1 gave the same p50 (16.7 ms). Adaptive quality dropped the render
  scale to 0.52–0.72 within 12 s on every viewport. This is a CPU-raster limit of the sandbox, not proof of a problem.
  **Check on a real iPhone or iPad** (Safari's canvas is GPU-backed). If `FT.debug.render().quality` falls below 1 on a
  device, profile `render.js`.

## 3. Voice pacing — `node tests/sim/hs_voice_browser.js --ages 3,4,7 --langs en,vi --pace child` + `voice_pacing.js`
The game ran at speed 1 on a virtual clock, with a fake TTS at about 15 chars/s, and the bot was slowed to a 4-year-old's pace.

| age lang | utterances / min | speech % of time | first prompts heard fully | follow-ups heard | lines dropped | count words heard (last) |
|---|---|---|---|---|---|---|
| 3 en / 4 en / 7 en | 21–24 | 76–78 | 94–100 % | 100 % | 5–6 | 100 % (100) |
| 3 vi | 21 | **88** | 100 % | **67 %** | **11** | – |
| 4 vi | 23 | **86** | 94 % | **67 %** | **38** | **83 % (75)** |
| 7 vi | 20 | 79 | 100 % | 94 % | 2 | – |

- No line spam: 0 back-to-back repeats in the browser runs (1 in the voice run: "that's letter O", from two different wrong taps).
- **VI prompts are too long**. The average VI colour prompt is **6.3–6.6 s** (EN 4.5 s). Examples: "Bé trồng hoa màu vàng
  thành hàng lượn sóng được không nào? Bé chạm vào gói hạt giống màu vàng nhé!" = 7.5 s, and the 2nd chips prompt is 4.7 s.
  So the queue drops lines, the follow-up "kéo theo các chấm" gets cut when the child starts tracing, and the first carrot
  word ("Một!") is spoken 0.9 s late because the child taps before the prompt ends.
- Cut lines are mostly the trace-progress cheers ("Keep going!", "Nhìn kìa, mầm lên rồi!") stopped by the trace finishing.
  This is harmless.
- **Re-sim with shorter VI lines** (`--patch`, text below): VI 3 dropped 11 → **0**, follow-ups 67 → **100 %**. VI 4 dropped
  38 → **3**, follow-ups 67 → **85 %**, count words 83 → **100 % (last 100 %)**. Colour prompt 6.4 → **4.5 s** (the same as EN).

## 4. Is it right for a 4-year-old?
**Trace tolerance (`CONFIG.tol`).** The age-4 band is well judged and should not change:
- *Not too strict*: typical offPath 0.15 / round, path hints 0.08 / round, magic water 0 %. A fixed 35–45 px wobble (`dev35`,
  `dev45c`), corner cutting and lifting all trace without help. A finger that runs steadily **60 px beside the dots** ("drops
  high", `par60`) needs magic water in only 3 % of rounds at age 4.
- *Not too loose*: `loose_check.js` shows a straight swipe fails numerals (7 % complete), letters (21 %), arcs, loops and
  shapes. It does complete 73 % of waves and 82 % of zigzags. Those are the two-pair rows (74 px tall, ±37 < tol), and that is
  fine at 4.
- *The cliff at 5+*: for the same sloppy-but-trying finger, magic water jumps 3 % (age 4) → **40 %** (5) → 80 % (6) → 100 % (7).
  A 45 px offset at age 7 already needs magic water in 24 % of rounds. Tol drops 64 → 55 (−14 %) in one year while the
  lower-case letters and numerals at 5+ get smaller.

**Rounds and reward cadence.** Typical age 4: a rosette every ≈ 17 s (p90 26 s), a new season / chapter every ≈ 80 s with
Talk time, and the session is 5.5 min. That suits a 4-year-old's attention span. A slow toddler gets a reward every ≈ 31 s
(p90 46 s). That is acceptable, but the count chapter is the long one at 125–131 s. Stars are kind: typical 84 % 3★. Even
bot 0.3 gets 3★ in a third of rounds, and Talk mistakes cost nothing.

## 5. Recommended changes (exact) and before / after

### CONFIG (`game/js/world.js`, `FT.CONFIG`)
```js
tol: { 3: 72, 4: 64, 5: 60, 6: 54, 7: 48 },   // was { 3: 72, 4: 64, 5: 55, 6: 50, 7: 45 } — smooth the 4 → 5 cliff
shortBudget: [1e9, 28, 30, 50],               // was [1e9, 1e9, 30, 50] — a slow round 0 makes round 1 short (count skips the pick)
```
| re-sim (`hs_child2.js --n 60` / `hs_playtest.js --n 150`) | before | after |
|---|---|---|
| `par60` magic water rounds, age 5 / 6 / 7 | 40 / 80 / 100 % | **21 / 46 / 94 %** |
| `par45` magic water rounds, age 7 | 24 % | **6 %** |
| typical / `dev45c` / backwards, ages 5–7: trace s, offPath / trace | 5.1–5.7 s, 0.01–0.10 | unchanged (± 0.1 s, ± 0.01) |
| loose check ages 5–7: straight swipe completes letters / numbers | 19–22 % / 8–13 % | unchanged |
| slow3 count chapter, age 3 / 4 / 5 | 128 / 131 / 141 s | **121 / 125 / 136 s** |
| slow3 session, age 4 (p90) | 7.3 (7.9) min | 7.2 (7.8) |
| typical / wobbly ages 3–5: session, chapter, stars | 5.3–5.7 min, 77–84 s | unchanged (≤ 0.2 s) |
(Downside of the tol change: at age 6 a straight swipe would complete the zigzag. Colours are not in the age-6/7 pool, so
this does not matter.)

### Content (`game/js/content.js` `countN`), so 4 carrots are asked at ages 6–7
```js
} else { lo = 5; hi = 12; }   →   } else { lo = 4; hi = 12; }
```
Re-sim: counts 1–12 are all seen. Chapter length is unchanged (count rounds dominate only round 2; chapterTimeLimit cuts).

### Voice (`game/js/i18n.js`, vi): shorter prompts (owner: voice / i18n; re-simulated above)
```js
'p.colors': ['Bé chạm gói hạt {color} nhé! Mình trồng một {stroke}!',
  'Mình trồng một {stroke} nhé! Chạm gói hạt {color} nào!',
  'Chạm gói hạt {color} nào! Bé trồng một {stroke} nhé!'],
// p.chips 2nd:    'Bé ơi, mình đếm nhé! Bé chạm vào đất để nhổ {n} {chips} nào!'  →  'Mình đếm nhé! Bé nhổ {n} {chips} nào!'
// trace.start 2nd: 'Bé đặt ngón tay lên chấm sáng rồi kéo theo các chấm nào!'       →  'Bé đặt tay lên chấm sáng rồi kéo nhé!'
```
Optional (not simulated): speech fills 76–88 % of play time (about 22 lines / min). Saying the trace-progress cheer only at
50 % (not at 25 / 50 / 75 %) would give the child quieter moments. Those cheers are the lines that get cut most.

### Lower priority (content geometry, ages 5+)
The two-pair colour rows (74 px tall) can be iced by a straight swipe at any tolerance: wave 78 %, zigzag 77 % at age 5. If
age 5 colours should teach the stroke, use one large pair at 5+ (as the swirl already does).

## Sim changes (tests/sim only)
- `hs_playtest.js`: content-variety tracking (same key / same asked values back to back, home clashes, every animal / home /
  shape / numeral / count / trace value seen per age), round-duration p50/p75/p90/p99, no-progress > 30 s %, Talk outcomes
  split into right / wrong / Tumi-answered, and the 5th-pool-topic rotation (`rotate`).
- `lib.js`: `SIM_PATCH=file.json` applies sim-only string patches to the loaded game code (used for `countN`).
- `hs_browser_vp.js`: adds `&mute=1`, records rAF frame times (p50/p95/max), `FT.Assets.missing`, world finiteness, Talk
  auto-answers and sim minutes; separates errors from warnings (filters the headless AudioContext notice); farm words in the
  EN-in-VI check (it used the bakery words).
- `hs_voice_browser.js` records `follow`, `i`, `what` on events, and `voice_pacing.js` detects follow-ups by `follow` (it used
  the stale bakery key `p.tapPart`, so follow-ups showed as 0).
Outputs are in `tests/sim/out/` (`hs_base`, `sb28`, `ctl`, `countN`, `c2_sloppy_*`, `hs_browser_vp.json`, `voice_child.json`,
`voice_vishort.json`).
