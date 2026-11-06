# Momo's Toy Train — high-speed playtest report (2026-11-06)

Report-only: no file under `game/` was changed. Every proposal below was re-simulated by patching **inside the sim**
(CONFIG overrides, sim-side monkey-patches of `TT.World` / `TT.Content`, or string patches applied to the JS the
browser is served — `tests/sim/patches/*.json`).

## How it was played
| harness | what | volume |
|---|---|---|
| `tests/sim/hs_extra.js` (new) | headless, real input API, ages 3–7 × 12 children: `typical`, `slow3`, `high` (drops high), `rugdrop` (half of the drags let go on the rug), `nowhistle` (never taps the whistle), `taponly` (taps toys, never drags until a ghost hand shows dragging), `tapmost` (70 % taps), `tapper` (random), `spammer`, `bot0.5`, `bot0.8`, `bot1.0`; 5 viewports, EN/VI | 6 000 sessions base + 11 re-sims (≈ 9 000 more) |
| `tests/sim/variety_stats.js` (new) | content only: repetition between consecutive trains per age × topic | 1 500 chapters × 25 age/topic |
| `tests/sim/hs_voice_browser.js` (new) | **voice-faithful** real page: `?speed=1&bot=1`, voice ON, a *virtual clock* (performance.now / Date.now / timers / rAF advance 100 ms per frame ≈ 6×) and a fake `speechSynthesis` (250 ms + chars / 13.5 per s at rate 0.9). Every guard in main.js and the Voice queue runs exactly as on a phone. Paces: `bot` (TT.Bot, fast ≈ 5-year-old) and `child` (bot slowed to a 4-year-old: 1.8–3.6 s per cargo, 3.5–5.5 s after the prompt, whistle after 3–5 s, Talk after 4–7 s) | 10 sessions (bot) + 6 (child) + 6 (child, patched) |
| `tests/sim/voice_analyze.js` (new) | lines/min, speech share, heard / cut / never-spoken lines, prompts, count words in order, back-to-back repeats, `{`/undefined, English in VI | |
| `tests/sim/hs_browser_vp.js` (new) | real page at `?speed=8&bot=1&autostart=1&autorestart=1`, 2 full sessions per age × iPhone portrait 393×852, iPhone landscape 852×393, iPad landscape 1180×820, iPad portrait 820×1180 | 20 pages, 40 sessions, 640 trains |

## Headline numbers (base build)
| child (age 4) | session min (p90) | trains | chapter s | round s (p90) | ask→loaded s | loaded→whistle s | whistle→gone s | dead time % | stars 3/2/1 % | hints/rd | whistle nudge/auto % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 6.5 (7.0) | 13.3 | 95.7 | 25.6 (34.9) | 16.6 | 4.6 | 1.9 | 37 | 63/23/14 | 0.16 | 11 / 0 |
| slow3 | 10.6 (11.8) | 12.0 | 157 | 48.2 (72.3) | 37.5 | 6.4 | 1.9 | 26 | 45/21/34 | 0.85 | 60 / 0 |
| high | 7.2 (8.1) | 12.2 | 107 | 31.6 (46.7) | 22.6 | 4.6 | 1.9 | 32 | 66/22/11 | 0.97 | 13 / 0 |
| rugdrop | 7.6 (8.4) | 12.1 | 112 | 33.7 (50.6) | 24.7 | 4.6 | 1.9 | 30 | 67/23/11 | 1.26 | 14 / 0 |
| nowhistle | 7.1 (7.5) | 12.0 | 105 | 31.5 (40.3) | 15.1 | **12.0** | 1.9 | **54** | 64/23/14 | 0.16 | 100 / 100 |
| **taponly** | **never ends** | 0 | — | **stuck 100 % (> 300 s, 0 hints)** | — | — | — | — | — | 0 | — |
| tapmost | 8.7 (9.7) | 12.0 | 128 | 39.3 (62.3) | 30.4 | 4.5 | 1.9 | 26 | 68/21/11 | 0.15 | 12 / 0 |
| tapper / spammer | 6.6 / 3.8 | 13.4 / 16 | 97 / 55 | 26 / 12 | | | | | 37/8/55, 30/7/63 | 1.35 / 1.18 | 0 |
| bot 0.5 / 0.8 / 1.0 | 6.1 / 4.7 / 4.0 | 15.4 / 16 / 16 | 90 / 68 / 59 | 21 / 15 / 13 | 15.6 / 9.2 / 6.9 | 1.4 | 1.9 | 31 / 41 / 47 | 34/12/55, 60/21/18, 100/0/0 | 0.87 / 0.12 / 0 | 0 |

Ages 3–7 follow the same shape (full tables: `tests/sim/out/hsx_base.md`): typical sessions 6.2–6.6 min (p90 ≤ 7.0),
chapters 92–98 s, 0 rounds > 120 s; slow3 at ages 4–7 has 5–10 rounds > 120 s per 100 sessions (max 166 s, no stall).
Arrival is 1.6 s, round start → prompt 2.3–2.6 s, the warm-up (2 cars × 1 toy) takes a typical 4-year-old 11.8 s vs
18.7 s for later trains (perfect bot: 3.9 s). Real browser (40 sessions, 4 viewports): **0 console errors / page errors**
(only Chrome's autoplay warning for the AudioContext before a gesture, expected with `autostart`), every session finished,
0 `{`, `undefined`, `NaN` in 8 999 voice-log lines, 0 English words in VI mode, 33 back-to-back identical lines (≈ 0.8 per
session, P3). Chapter 1 over 3 sessions per page: 3 colours>shapes>colours, 4 colours>size>colours, 5 shapes>colours>shapes,
6 lower>letters>lower, 7 initial>count>initial (P2-3). (Headless Chromium has no safe-area insets; inset layouts are covered by
the headless viewports.)

## P1 — fix before kids play

**P1-1 A child who only taps toys is stuck forever.** `taponly` (taps cargo, never drags until it has *seen* the drag
ghost hand): 500/500 sessions stuck, 0 hints in > 300 s, because a tap is not a miss (no 2nd-miss hint) and every press
resets the idle timer (`_touch`), so the idle hint never comes either. Only the voice line `dragHint` plays every 9 s.
*Change (world.js, `pointerUp`, the tap branch):* count taps per round (`this._roundTaps`, reset in `_beginRound`) and,
when `++this._roundTaps >= cfg.tapHintAfter`, call `this._autoHint(it, true)` (idle-style: hand + glow, no extra "hint"
voice line — main already says `dragHint`). New `CONFIG.tapHintAfter = 2`. Re-sim (`--patch tapHint`):
| age 3 / 4 / 5 | taponly done % | taponly session min | tapmost session min | typical session min | typical hints/rd |
|---|---|---|---|---|---|
| base | 0 / 0 / 0 | ∞ | 8.6 / 8.7 / 8.3 | 6.3 / 6.5 / 6.6 | 0.35 / 0.16 / 0.09 |
| tapHintAfter 2 | **100 / 100 / 100** | 8.0 / 8.4 / 8.1 | 8.2 / 8.7 / 8.3 | 6.4 / 6.5 / 6.6 | 0.64 / 0.49 / 0.25 |
Optional (P2) for ages ≤ 4: `CONFIG.tapAssistAfter = 4` — the 4th tap in a round glides that toy into its car by itself
(counts as correct, no star change): taponly 8.4 → 6.4 min, tapmost 8.7 → 6.4 min, slow3 10.4 → 8.8 min; typical
gets 0.31 assists/round (it taps to hear names), so keep it to ages ≤ 4.

**P1-2 Momo talks ~85 % of the time and half of what she starts is cut off.** Child pace (a 4-year-old's speed), base:
30.5 lines/min, speech 83–89 % of the session, only 61–65 % of utterances heard to the end, 19–23 % cut before half
(audible fragments: "Re—"). The cause is redundant lines, mostly in sort rounds:
- `carDone` speaks "This car is ready! / All loaded here! / This car is done!" after **every** sort car — right on top of
  the "Yes! Red car!" line it duplicates; it is cut or never spoken 52 % of the time at child pace (100 % of 356 at bot pace) and pushes the real instruction
  ("All aboard! Tap the whistle!") back, which is then cut by the child's whistle tap (18 + 13 + 12 + 12 + 11 cuts in 6
  sessions).
- the grab name ("Red ball! Where does it go?") is cut after 0.2–0.4 s by the drop's correct line almost every time.
- wrong lines are 4.5–5.8 s ("Bounce! That's the orange car. Let's take the purple toy to the purple car!").
- Talk intro "Talk time! Momo has a question." (≈ 2.5 s) before the actual question.
*Changes (main.js / i18n.js), as tested (`tests/sim/patches/voice_v1.json`):*
1. main.js `carDone`: `if (c && c.need && lastAsk && lastAsk.mode === 'count') speak(line('sayCarDone', …))` (count
   cars keep "Three toy boats! Well counted!").
2. main.js `grab`: name the toy only when it already missed once: `if (canInterrupt() && (itemById(e.id) || {}).misses > 0) sayName(…)` (taps still name it).
3. main.js `wrong`: `got: curAge() >= 5 ? (c ? c.label : e.got) : null` — ages ≤ 4 hear "Boing! The blue toy wants the blue car!" (3.1 s).
4. main.js `round`: show `deal` in the bubble but do not speak it (chapter name + time-of-day line already greet).
5. i18n.js `talk.intro`: EN `'Talk time!'`, VI `'Giờ trò chuyện!'`.
Re-sim, child pace, ages 3–5 EN+VI:
| | lines/min | speech % of time | heard to the end % | cut before half % | prompts cut / never | count rounds with every count word heard |
|---|---|---|---|---|---|---|
| base | 30.3–30.9 | 83–89 | 61–65 | 19–23 | 5 / 4 of 83 | 13/14 |
| voice_v1 | 21.5–23.3 | 72–82 | 77–79 | 4–8 | **0 / 0 of 83** | 13/14 |
At bot pace (a fast child) the same build cuts 12–16 of 16 prompts with the first correct drop (the child already acted —
acceptable) and in one age-6 session the prompt queued behind chapter + weather + deal lines was flushed by the first
correct drop before it was ever spoken; change 4 removes that queue.

**P1-3 Count word cut by a surprise line.** "One!" was cut after 0.1 s by "Hee hee! Hello, bunny!" (the hitch arrives
`hitchAt` 2.5 s into the load, when counting starts; `correct` sets `promptUntil = 0`, so `canInterrupt()` is true).
*Change (main.js `correct`):* after `speak(countWord(e.count.i), {interrupt:true})` set `promptUntil = performance.now() + 900`
so surprise / hitchTap / balloonTap / full lines cannot cut a count word. (Count words were otherwise heard in order in
every count round, incl. two-car rounds "1 2 · 1 2 3 4".)

## P2 — make it better

**P2-1 Releases a little too high are lost.** The `high` child lets go 50–160 px above the car: 63–64 % of those are
misses (typical child: 42–47 % of its high drops). There is a 44 px dead band between the drop zone (`zoneUp 90`) and
the lowest resting toy (rug bottom = car top − 134). *Change (world.js `_drop`):* when neither the finger nor the toy is
in a zone, the toy has travelled ≥ `aimTravel` from home and the finger is over a car's x-span (± `zoneSide`) at most
`zoneUpFar` above its top → drop into that car. New `CONFIG.zoneUpFar = 130` (= the dead band, never reaches the rug),
`aimTravel = 120`. The rug layout is unchanged. Re-sim ages 3–5 (`--patch aim`):
| | high: high-drop miss % | high: miss/rd | high session min | typical: high-drop miss % | slow3 miss/rd | rugdrop false loads (wrong %) |
|---|---|---|---|---|---|---|
| base | 63–64 | 2.7–3.3 | 6.7–7.3 | 42–47 | 0.78–1.02 | 0 |
| zoneUpFar 130 | **35–37** | 1.3–1.6 | 6.5–6.7 | **5–10** | 0.47–0.65 | **0** |
| zoneUpFar 200 | 13–15 | 0.5–0.6 | 6.5–6.6 | 6–9 | 0.29–0.45 | **16–21 (stars lost)** — rejected |

**P2-2 A child who never taps the whistle waits 12 s every train** (54 % of `nowhistle` time is waiting).
*Change:* `CONFIG.whistleAuto 12 → 9` (keep `whistleNudge 6`). Re-sim: nowhistle session 7.1 → 6.6 min (age 3–5:
6.6/6.6/6.2), typical unchanged (6.5 min, nudge 11.6 %). Rejected: nudge 5 / auto 9 (typical nudged 15.5 %), nudge 4 /
auto 8 (typical nudged 61 % — Momo would nag nearly every train).

**P2-3 Chapter 1 ping-pongs between two topics forever** (`topicsFor`: `first` = the first pool topic ≠ last[0]).
Ages 3–7: chapter 1 is only ever pool[0] or pool[1] (age 4: colours / size; count and homes never open a session), and
30 % of sessions are identical to the one two sessions before (seen in the browser too: session 3 = session 1).
*Change (content.js `topicsFor`):* `var fr = pool.filter(t => last.indexOf(t) < 0); var first = fr.length ? fr[0] : <current rule>;`
(the topic left out last time opens the next session). Re-sim 300 children × 6 sessions: A-B-A repeats 30 → 7 %,
every topic opens chapter 1 (age 4: colours 566, size 486, homes 242, count 266, shapes 240 of 1 800), never the same
chapter 1 twice in a row.

**P2-4 Consecutive trains look the same.** Identical car-label set as the previous train: homes 17 % (age 3–4), colours
9–11 %, count 10–15 % (same need) and the same cargo toy in consecutive count trains 15 %. *Change (content.js
`makeRound`, in the retry loop next to the `prevKey` check):* reject a round whose label set (`key.split('#')[0]`) equals
the previous one (not for `size` / `oddeven`, which always have the same two cars) and a count round whose cargo sprite
equals the previous count round's (pass `prevToy`). Re-sim (`variety_stats.js --patch`): colours 9–11 → 0 %, homes ages
3–4 17 → 0 %, count same toy 15 → 0 %, same need 10–15 → 0 %; homes age 5 stays 33 % (4 cars = all 4 homes; consider
3 cars there).

**All P1-1 + P2-1 + P2-2 together** (`--patch aim,tapHint --config '{"whistleAuto":9,"zoneUpFar":130,"aimTravel":120,"tapHintAfter":2}'`,
age 4): typical 6.5 → 6.5 min (stars 63/23/14 → 61/25/14), high 7.2 → 6.6, nowhistle 7.1 → 6.5, slow3 10.6 → 10.0 (rounds
> 120 s 6 → 2 per 100 sessions), taponly stuck → 8.3 min, spammer 3.8 → 3.4; 0 stuck sessions for any model
(`tests/sim/out/hsx_combined.md`).

## P3 — polish
- `loaded` EN "All aboard! **Pull** the whistle!" and VI "Bé **kéo** còi đi!" / "Bé kéo còi nhé!" (kéo = drag): the action
  is a tap — use "Tap the whistle!" / "Bé bấm còi đi!" so the word matches the gesture.
- Back-to-back identical lines (33 in 40 browser sessions): two toys into the same car give "Yellow car, yes!" twice. In
  `speak`, if the text equals the last spoken line within 4 s, re-roll the variant (call `line()` again, ≤ 3 tries).
- Warm-up: the first train of every chapter is 2 cars × 1 toy (typical age 4: 11.8 s, bot 1.0: 3.9 s, 4× per session).
  For ages ≥ 4 in chapters 2–4 use 2 cars × 3 toys (1 + 2); chapter 1 keeps the 2-toy on-ramp.
- Dead time is 37 % of a typical round (arrive 1.6 + deal ≈ 0.9 + whistle wait 4.6 + depart 1.9 + clear 0.5 s): fine,
  the ride is the reward — but make the ride feel like one: let Momo cheer + the train toot once more halfway out, and let
  the bunny / balloon surprise come in 2 rounds per chapter (rounds 1 and 3) instead of 1 (`surpriseRound` → a list).
- slow3 at age 5 (4 cars): 10 rounds > 120 s / 100 sessions (max 166 s) — consider `shortBudget [∞, 25, 45, 60]` for ages ≤ 4
  sessions that pick age-5 content; not re-simulated.

## Game-designer view (for a 4-year-old)
What works: the loop is short and readable (≈ 26 s per train, 6.5 min per session, no fail state), the train
arriving / leaving with springy cars is a strong reward, counting is spoken in order, help (2nd-miss hint, idle hint,
whistle nudge + auto) always gets every engaged child to the end.
What would make it more fun: Momo talking less and only when it matters (P1-2), the train never asking "drag" to a child
who taps (P1-1), forgiving drops (P2-1), more variety between trains and sessions (P2-3, P2-4), and a bigger "we did it"
moment on departure (P3).

## Files
`tests/sim/hs_extra.js`, `variety_stats.js`, `hs_voice_browser.js`, `voice_analyze.js`, `hs_browser_vp.js`,
`patches/voice_v1.json`; outputs in `tests/sim/out/` (`hsx_*.md`, `variety_*.md`, `voice_*_dump.txt`, `hs_browser_vp.json`).

## Fixes applied (lead, QA round 1)
- **P1-1 tap-only child:** `tapHintAfter 2` (2nd tap in a round → hint + ghost hand), `tapAssistAfter 4` for ages ≤ 4 (the toy
  glides into its car). Unit test `QA1: two taps …`.
- **P1-2 chatty Momo:** carDone spoken only in count rounds; grab names only after the toy has missed; no "That's the X car."
  at ages ≤ 4; the deal line is shown, not spoken; `talk.intro` → "Talk time!" / "Giờ trò chuyện!".
- **P1-3:** `promptUntil = now + 900` after each count word.
- **P2-4:** `zoneUpFar 130`, `aimTravel 120`. **P2-5:** `whistleAuto 9`. **P2-6:** `topicsFor` opens with the topic left out last
  time. **P2-7:** re-roll repeated car-label sets and repeated counting toys (`prevToy`).
- **P3:** "Tap the whistle" / "bấm còi" everywhere; a line never repeats the one just spoken (re-roll); later chapters'
  warm-ups carry 3 toys at age ≥ 4; bigger send-off (Momo cheers, a second TOOT 0.65 s after departure).
- Re-sim after the fixes (`hs_playtest.js --n 40 --tag qa1`, 1 420 sessions): every model 100 % done, 0 NaN / stuck / off-screen;
  typical 6.3–6.6 min, perfect 4.5–5.1, slow-3 8.7–10.9.
