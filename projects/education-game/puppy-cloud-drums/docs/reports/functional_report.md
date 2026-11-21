# Functional QA: Bibi's Cloud Drums (2026-11-21)

Suite: `node tests/e2e/functional.js` (Playwright, `isMobile` + `hasTouch`, real CDP touch events, exits 1 on any failure).
Devices: iPhone 393×852 @3 and 852×393 @3, iPad 820×1180 @2 and 1180×820 @2, plus 10 full bot sessions
(ages 3–7 × EN/VI, `?bot=1&speed=8`).

## Result
| suite | result |
|---|---|
| `tests/e2e/functional.js` | **106 / 106 passed** (911 s). This covers 96 per-device tests (25 core × 4 devices, and the 23 extra tests run on iPhone portrait and iPad portrait) and 10 bot sessions. Zero console, page or HTTP errors. |
| `tests/e2e/smoke.js` | PASS (exit 0) |
| `tests/unit/run.js` | 55 passed, 0 failed |
| `tests/unit/i18n_voice.test.js` | 42 279 passed, 0 failed |
| `tests/unit/drum_art.test.js` | 6 551 passed, 0 failed |

## What changed in the e2e suite (only `tests/e2e/functional.js`)
- I took out the old chime world: `layout.beam`, hooks, `_clearOfDrums`, the `'beam'` soft kind, bell strings, swinging, and the "Khỉ Bibi / Chuông Gió" titles.
- `softPoint` now keeps clear of the drum hit circles, the cushion boxes, Bibi, the **cymbal box**, the surprises and the fireflies. `outside()` checks each drum body and its cushion.
- New tests:
  - `beat_count`: age 4 count, warm-up round plus one full round, real taps on the big drum. It checks:
    - a tap beside the drum is soft;
    - `count{beat:true}` events come in order and `card.lit` goes up with each one;
    - `right{beat, count.n}` comes exactly at the need-th beat, after the last `count`, never earlier;
    - a back-to-back double tap less than 0.2 s apart (in world time) only booms and does not count;
    - a beat in the gap after a finished count is not judged;
    - no `wrong`, no misses, 3★;
    - the voice log has "One!", "Two!" and the "Five! You beat it five times!" right line, with no raw keys;
    - the beat song is the big drum ×3, then the cymbal.
  - `beat_nudge`: a partial count, then a `beatNudge` 4 s later with the count line, and no generic `idle`.
  - `rotate_beat`: the partial count survives a rotation. The card switches above ↔ side, and the card and drum stay on screen without overlapping.
  - `animal_prompt`: finds a cow ask over the seeds. The prompt ("Who says moo? Boom the cow drum!" / "Listen: Moo! Where is the cow?") is in the bubble and the voice log. A real tap on the cow gives `right` and a "Moo … cow" line.
  - `song_tap`: a tap on a drum in song time starts a left → right wave with nothing judged.
  - `cymbal_tap`: 3 taps give 3 `cymbalTap` events. They are never soft, hint or no-progress, and the asked drum still works afterwards.
  - `checkCymbal`: added to every song test (swipe, tap, band press, auto). It checks for exactly one `cymbal`, 0.25 s after the last `songNote` and before `songDone`.
- Renamed `rotate_swinging` → `rotate_bouncing` (it uses band coordinates now). Bot speed is 8 by default.

## Bugs / findings
### P1: none

### P2-1: surprises are almost invisible at ages 3–4 (they leave at the song)
- **Repro:** in the e2e bot sessions, age 3 (EN and VI, two runs) made **0 surprise taps**; ages 5–7 made 1–3 per session. The surprises do spawn every chapter, but they leave at the song, before the bot (or a slow child) can tap them.
- **Measured** (headless sim, `CD.World` + `CD.Bot` skill 0.8, 8 seeds, 720×1561): seconds per round that a surprise is tappable.

  | age | lamb | bird | fireflies |
  |---|---|---|---|
  | 3 | 0.1–1.4 | 0–2.1 | **0.1** |
  | 4 | 0.1–5.5 | 0.4–7 | 0.2–2.4 |
  | 6 | 1.6–4 | 2.1–5.5 | 5–15 |

- **Where:** `world.js:656-661` (`_ask`): the spawn is capped at `notes × surpriseStepS (1.8) − 1`, so with 2 notes it arrives at about 2.6 s. The lamb then walks in at 70 px/s, and `lambHit` is null until it is on screen. Then `world.js:1139` (`_startSong` → `_surprisesLeave()`) sends it away as soon as the 2nd note lands.
- **Fix:** let surprises stay through song and out, and leave in `_nextRound`. `_clearRound(keep)` already supports a leaving lamb or bird. Alternatively, at ages ≤ 4 spawn 1 s after the first ask and start the lamb just inside the right edge. Also make the bot try sooner (`bot.js:133`, `chance(0.03)` per frame) so the playtest models measure this.

### P3-1: `CLAUDE.md` is stale
It still describes hanging chimes, pendulums, beam, posts and fire, "Bibi the little monkey" and "Chuông Gió Lửa Trại Của Khỉ Bibi". It also gives the old render order (fire, posts + beam, cords). The game, DESIGN §1 and i18n now say puppy / "Cún Bibi" / "Trống Mây", with cymbal, cushions and a star garland.
- **Fix:** rewrite Goal, Stack (the render order from MECHANICS §3) and the VI title.

### P3-2: the voice log is trimmed in place
`voice.js:116` splices `V.log` in place (600 → 500 lines), and `CD.debug.voiceLog` is the same array. Any test or tool that slices by a saved index silently loses lines after about 3 sessions (about 170 lines each), for example a Play-again loop.
- **Fix:** keep a running `V.logTotal` counter, or keep the debug mirror separate and uncapped while `?debug`/`?bot` is set.

### Notes (not game bugs)
- Under the full parallel suite, headless iPhone @3 frames stretched to about 0.3 s. Two back-to-back CDP touches once landed 0.35 s apart in world time, so the double-tap check now retries on a later step and still requires at least one verified fast double. When idle, headless frames are 16.7 ms median (iPhone @3) and 33 ms (iPad landscape @2), which is software rendering.
- The animal prompt variants are seeded. "Who says moo?" verbatim appeared on iPhone portrait; the other devices got "Listen: Moo! Where is the cow?". Both name the sound and the animal.
