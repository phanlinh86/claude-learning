# Bun's Dino Dig — Functional QA report (2026-11-08)

Suite: `node tests/e2e/functional.js [group …]` (Playwright Chromium, `isMobile` + `hasTouch` contexts, **real CDP touch
events** via `Input.dispatchTouchEvent` for every child action). Exits 1 on any FAIL; results in
`tests/out/functional/results.json`. A full run takes about 13 min (the bot sessions take 4 min of that).
Groups: `layout boot lang gate persist audio dig count help talk pause rotate multi surprise bots`.
Viewports: iPhone 393×852 @3 (`iphoneP`), 852×393 @3 (`iphoneL`), iPad 820×1180 @2 (`ipadP`), 1180×820 @2 (`ipadL`).

**Result: 519 / 520 checks pass. No P1 and no P2 issues. 1 failing check (P3), plus 3 more P3 notes.**
I saw zero console errors, page errors, failed requests or HTTP ≥ 400 in any group.

## What passed

| Area | What was checked (by touch unless noted) |
|---|---|
| Layout (all 4 viewports × ages 3–7) | Every topic in the age pool × levels 0–3 × rounds 0–3 × 2 rerolls = 160 rounds per age, 441–761 mounds per age/viewport, ≈ 12 000 tap points in total. Every `moundScreen(id)` point is inside the viewport, outside the DOM `#hud` and `#bubble` rects (the bubble was filled with the longest VI prompt, `p.shapes5` + "Tiếp nào!"), outside the logical `layout.hud / bubble / shelf` rects, and `elementFromPoint` gives `#game`. `moundTap(id)` hits that same mound (nearest centre wins). No hit circle sits half under a keep-out box. No mound reaches past the screen edges. Bun's tap point hits the canvas and no mound. |
| Boot / title | Title shown, loader gone, HUD hidden. Play ≥ 88 px. A real tap on Play starts chapter 1 and the `ask` comes. Pause button ≥ 44 px and hit-testable. A double tap on Play starts only one session (ad-hoc probe). |
| Language | Tapping the VI chip turns the title into Vietnamese and logs the welcome line as `vi`. After that, the bubble prompt and every voice-log line are `vi` with Vietnamese text. Going Pause → Home, then the settings EN chip, keeps both switches in step, and the new lines are all `en`. |
| Parent gate | On 3 viewports: a short tap and a 1 s hold do **not** open settings, a 2.3 s hold does, the game is not started, and Done can be reached. |
| Settings persistence | Age chip 6, VI, name "Mai" (typed) and the volume slider (a real tap at 30 % of the track) all survive a reload. The title shows the saved age and language, and `DD.Audio.volume` is restored. `?age=3&lang=en&speed=2&seed=4` apply for the session but are never written to `dd:settings`, even after a settings save and Play. Every storage key starts with `dd:`. |
| Audio | Not muted. The graph was recorded by hooking `AudioNode.connect`: sfx / music / amb → master → DynamicsCompressor (−18 dB, knee 12, ratio 4, 4 ms, 180 ms) → user gain → destination. User gain = volume × 1.6. Pause − − gives 80 % (gain 1.28); + + + stops at 100 %. 80 % survives a reload and the pause menu shows it. |
| Correct dig | One tap on the right mound → `dig → scoop ×N → reveal → found → hatch → hop → shelved`, in that order. The shovel keeps going by itself (3 scoops at age 4). The mound ends `empty` and the baby dino is on the shelf. The warm-up gives 3 stars. |
| Dig faster | Re-tapping the digging mound gives `dig {again: true, added: true}` with no `busy` and no miss. The reveal comes **0.95 s** after the first tap, against 1.60 s for a single tap. MECHANICS says 0.82 s, but CDP taps arrive about every 160 ms, not as fast as a real child. |
| Wrong dig | It gives `wrong {kind:'thing'}` with the right id. Misses go to 1, the round goes on (no fail state) and the egg stays `open`. The kind line names both colours and has no negative words. The round finishes by touch with **2 stars**, the HUD shows 3 + 2 = 5 = `world.stars`, and stars never go down. |
| already / busy / sand / soft | Tapping the open hole gives `already` (no miss, no dig). Tapping another mound while a dig runs gives `busy` (that mound stays buried). Tapping empty sand gives `sandTap` (no miss). A 1.3 s press on a mound gives `soft {hold}` and a 120 px drag gives `soft {drag}`; neither digs. An 8 px wobble still counts as a tap. |
| Bun / bubble | Tapping Bun more than 3 s after the ask gives `pokeBun`, and the prompt is logged again word for word. A bubble tap repeats the prompt and never reaches the canvas. With voice on but no TTS voices (headless), a Bun tap still repeats the prompt in EN and VI (ad-hoc probe). |
| Help | 1 sand tap: no hint. 2 taps: a `hint` on the right mound (glow + ghost hand). After 6 taps without progress (age 4), the next sand tap gives `assist` and digs the right mound, which is then found. Sand taps never count as misses. The idle nudge comes after about 12 s of game time. |
| Count | Tested ipadP age 4 EN, iphoneL age 5 VI, iphoneP age 6 EN. There are N + spares mounds. N taps give `found.count` 1..N, a re-tap on a dug hole gives `already` (not counted), the step ends at N, the spares stay buried, the count words are logged in the right language, and the round finishes. |
| Talk time | Opened by forcing `world._startTalk()`, because Talk normally comes after round 4 (the bot runs reach it naturally, 4 times per session). On all 4 viewports, in EN and VI, every choice is on screen, ≥ 60 px and hit-testable. The right answer gives `correct: true` and +1 star; another answer gives `correct: false`, a kind line and no star change. A second tap does not answer twice. Talk closes and play goes on. |
| Pause | The pause button pauses and freezes the world, and a tap on a mound while paused does not dig. Resume repeats the prompt. When paused mid-dig, the dig holds and completes after Resume. `visibilitychange` hidden pauses the game, and it stays paused when visible again until Resume; then a real tap digs. The pause button is reachable during Talk time, hiding the page pauses Talk, and Resume returns to Talk with its choices. |
| Rotation mid-dig | Tested 4 directions (iPhone P↔L, iPad P↔L). The layout re-flows. All mounds stay inside the new screen and their tap points stay clear of the HUD, bubble and shelf. The running dig completes (found + shelved) and the shelf items sit on the new shelf. A second rotation back during another dig works too, and the round finishes. Ad-hoc probes: rotating during the hop to the shelf lands the item on its slot; rotating during Talk keeps all choices on screen. |
| Second finger | A second finger on the right mound while finger 1 rests is ignored. Finger 1 on the right mound plus finger 2 on a wrong one gives exactly one dig and no wrong or busy. |
| Surprises | Forced with `w.cfg.surpriseTypes = ['mole'|'ptero']`, `_surpriseRound = 1`, `round = 1` (normally one surprise round per chapter, which the bots hit naturally 2–5 times per session). On all 4 viewports, both the mole and the pterosaur appear and can be tapped. The tap point is on screen, clear of the HUD and bubble, and on the canvas. A real tap gives `moleTap` / `pteroTap` and a logged line, with no change to stars, misses or no-progress, and no dig or sand tap. The round still finishes. |
| Bot sessions | Ages 3–7 × 4 viewports (20 sessions, EN/VI alternating) at `speed=8`. All reach the done screen in 26–38 s with 16 rounds and 4 Talk times. Play again is on screen. Stars only go up, and sessionDone = world = HUD = done panel. Voice lines are clean (no `{}`, `undefined`, `NaN`) and 100 % in the session language. |
| Done screen | Ad-hoc probe: Play again by touch restarts at chapter 1 with the HUD at 0. Home by touch shows the total stars, and `dd:progress` is saved. |

## Failures and notes

### P3-1: the compressor cannot be reached from `DD.Audio` / `DD.debug.audio()` (the only failing check)
- Repro: any viewport, `?seed=12&age=4&novoice=1` (not muted). Tap Play, then in the console run `Object.keys(DD.debug.audio())`.
- Expected (skill: "Functional QA checks the chain exists (`KB.debug` exposes the gains)"): every node of the chain can be inspected from the hook.
- Actual: `master`, `user`, `sfx`, `music` and `amb` are exposed, but the compressor is the local `const comp` in `game/js/audio.js` `ensure()` (line ≈ 32). The chain itself is correct: I checked it by hooking `AudioNode.prototype.connect` in an init script.
- Fix: `this.comp = comp;` in `ensure()`, as one line.

### P3-2: taps while the mounds pop up (`enter` phase, about 1 s at the start of every round) are dropped silently
- Repro: any viewport, `?mute=1&seed=5&age=4`. Tap Play, then tap a mound while it is still popping up.
- Expected: the child gets some feedback (the pat sound or a soft wobble), or the tap is kept and runs when the dig phase opens.
- Actual: `World.tap` returns null when `phase !== 'dig'` (`game/js/world.js` ≈ line 526), so there is no event and no sound. It is not a bug under the contract, but an eager 3-year-old's first tap of every round does nothing.
- Fix (optional): emit `soft {kind:'early'}` (main already plays `pat`), or queue the tap and replay it when `dig` starts.

### P3-3: the project `CLAUDE.md` still describes Nini's Sea Painting
- `bunny-dino-dig/CLAUDE.md` has the goal, stack, script order and test command (`pictures.test.js`) of the turtle paint game. The skill's Deliver step 3 asks for it to be updated.

### P3-4: the obsolete paint-game suite `tests/e2e/qa_functional.js` is still in the repo
- It calls `shellScreen`, `partScreen`, `niniScreen` and `sp:settings`, so it would fail against this game. Delete it, or keep only `functional.js` (this suite).

## Not verifiable here
- Real iOS Safari TTS / `speechSynthesis` voices (Chromium headless has 0 voices; voice behaviour was checked through `DD.debug.voiceLog`), `navigator.audioSession` (WebKit only), the microphone answer path, and real safe-area insets.

## Summary for the lead
- **No P1 / P2.** Every touch path works on all 4 viewports: dig, dig faster, wrong dig, already, busy, sand, soft, Bun, bubble, hint, assist, count, Talk, pause, visibility, rotation mid-dig, second finger, mole and pterosaur. So do settings, the gate, persistence, volume and the URL flags, and all 20 bot sessions at ages 3–7. Zero console errors or failed requests.
- **P3-1:** expose the compressor (`this.comp = comp` in `audio.js` `ensure()`). This is the only failing check.
- **P3-2 (optional):** taps during the ≈ 1 s `enter` phase are dropped with no feedback.
- **P3-3 / P3-4:** update the stale `CLAUDE.md` and remove the obsolete `tests/e2e/qa_functional.js`.

## Re-run after the QA fixes (lead)
All 520 checks pass after the round-1 fixes (assist test updated for `assistAfter` 4; compressor now exposed as `DD.Audio.comp`).
