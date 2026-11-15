# Integration report — Nim's River Hop (integrator, 2026-11-15)

## What was wired
- `index.html` (title / meta / logo / script order per DESIGN §5), `manifest.webmanifest` + icons (rendered from
  `icon.svg` with `tools/render_icons.js`), `style.css` (warm woodland retheme: cream panels, mustard rims = Nim's scarf,
  warm-brown ink / logo outline; every mobile rule kept), `assets.js` (nim_* frames, fish / frog, env bank sprites, rock,
  dragonfly; bao / bird / kite / cushion / ground removed), `audio.js` (loud chain unchanged; every sound replaced per
  DESIGN §7, brook ambience + season extras, kalimba / marimba bed 0.22 ducked 0.07), `render.js` (rewritten), `ui.js`
  (Talk pictures via `NH.StoneArt`), `main.js` (river events → voice / sound / fx per VOICE §1.1), `README.md`, `CLAUDE.md`,
  `tests/e2e/smoke.js`, `tests/e2e/functional.js` (rewritten), new `tests/e2e/screens.js` (visual QA screenshots).
- Deleted: `docs/art/bao_*.png`, `docs/art/bubble_*.png`. `tools/animal_sheet.js` and `tests/sim/hs_browser.js` still work
  and were kept. `tests/out/` was already git-ignored by `tests/.gitignore`.

## Decisions / deviations from DESIGN §7 and MECHANICS §5
1. **Flying back particles are drawn after the banks, not before the river.** The river fills most of the screen, so petals,
   butterflies, dragonflies and snow drawn before it were invisible. Particles floating on the water (`onWater`) are drawn
   flat (y × 0.55) right after the ripples, under the stones, as MECHANICS says.
2. **The wipe curtain is drawn before the front particles**, so the weather's seasonal sweep (`wipeParticles`, layer
   `front`) shows on top of the curtain (MECHANICS §5: front = over everything incl. the sweep). The curtain is a soft
   seasonal haze band moving along `wipe.dir`; it covers the whole screen exactly at t = 0.5 (the world's swap).
3. **Banks are cached** as one screen-size bitmap per (layout, season, render scale), at most 3 kept (crossfade = 2). They
   are only cached once every asset has loaded (else drawn live).
4. **Nim's depth during a hop**: his sort key is the larger of the take-off y and the target y (+1), so neither the stone he
   leaves nor the one he lands on is drawn over him mid-air.
5. **Things that are counted / show their home / twinkle away are drawn after Nim** (untilted), with a soft light disc behind
   a counted sign so the dots read against his spines.
6. **`pokeNim`**: the world emits it while Nim starts his little poke hop, so `world.interactive` is already false when main
   reads the event. Main uses the event itself (`promptKey` present, not `busy`, phase play) to decide that the question is
   still open and repeats it (`askAgain(true)`). Same protection rules as VOICE §1.1 rule 4.
7. **countSeq wrong line**: `ev2` passes `need = want.count || row + 1` (VOICE §1 — `rule.value` is k).
8. **Fruit sizes**: fruits on Nim's back are drawn at 1.6 · fruitR scaled with Nim's height (the world's fruit is 2 · fruitR
   on the bank); while the fruit glides to its slot its size eases between the two, so nothing pops.
9. **Snow on stones** follows `weather.ambient.frost` (smooth during the autumn → winter crossfade) instead of `winter ? 1 : 0`.
10. **Title / done scenes** use the real `world.layout`: the title shows 2–3 decorative stones (one golden, things from the
    answer palette), a fish leaping now and then, the apple under the far-bank tree and Nim (`nim_title`) waving on the near
    bank. Main measures the DOM logo / tagline / ▶ / star line (`render.titleKeep`) and the done panel (`render.donePanel`)
    so the stones never sit under them. Done: Nim dances (`dance` / `cheer` beat) with the last 4 fruits of the session on
    his spines; the other fruits sit on glowing golden stones; confetti pops from a golden stone every ~1.5 s; the weather's
    party adds fireflies.
11. **Talk time picture** (the shown thing) stands on a small river stone on a patch of water; answers use `StoneArt.drawIcon`.
12. **Nim's ground shadow** only on the banks (stones have their own contact shading).
13. `weather.resize(W, H, world.layout)` is also called on each `round` event (the layout can change with the round's k × m).

## Integration bugs found in other modules
None needed a fix. (`tools/render_icons.js` only had a stale header comment from an older game; corrected.)

## Tests (2026-11-15)
- Unit: `run.js` 39/39, `i18n_voice.test.js` 74 379 checks, `stone_art.test.js` 11 446 checks — all green.
- `node tests/e2e/smoke.js`: PASS iPhone portrait + landscape (real touch tap → right / hop / land; bot sessions to done).
- `node tests/e2e/functional.js`: 82/82 (72 device tests on 4 shapes + 10 bot sessions ages 3–7 × EN/VI), 0 console errors.
- `node tests/e2e/screens.js`: title, play × 4 seasons (winter in VI), wrong + hint, mid-hop, bank roll, fruit on back,
  countSel count, Talk time, wipe, done on all four shapes → `tests/out/screens/` (reviewed).

## Known issues / notes for QA
- Landscape: when Nim stands on a top-row stone his head reaches under the speech-bubble band (MECHANICS §0.5); the DOM
  bubble is drawn over him for that moment.
- Landscape phones: at the end of the roll Nim stands close to the right screen edge (the world's `goal`, MECHANICS §0.6);
  his nose stays on screen.
- The frog falls back to a fish in crowded 4 × 3 rounds (MECHANICS §0.12); the functional frog test uses age 3.

## Fix round 1 (after functional QA, visual QA and the playtest)
| finding | fix |
|---|---|
| playtest P0: hammering one wrong stone never got help | `world._wrong`: the repeat wobble counts as no progress (≤ 1 / 0.9 s per stone) → hint + assist |
| playtest P2 / QA P3-2: mid-air taps became misses; a tap on airborne Nim hit a stone | only the next row's right stone is queued (kept for the whole hop); others wobble; Nim's box wins while he is airborne |
| QA P2-1/2/3, playtest P1s: speech queue drops, cut counts, silent fruit praise, prompt estimate | voice.js priority queue (≤ 6, prompt never dropped), tags + `dropTagged`; main.js guards from `onStart` / to the prompt's real end; wrong line priority; flavour lines dropped on `ask`; unstarted prompt dropped at the first `right`; `stick` praise queued; VI right lines short; countSeq hold 0.5 s |
| visual P1-1: Nim under the bubble (landscape phone) | per-row `rowA0` (Nim's head below the bubble / HUD), apex cap, + DOM bubble fades while Nim's art is under it (`UI.bubbleUnder`) |
| visual P2-1: Nim's face off screen (portrait edge column) | portrait across margin = max(0.55·S, Nim's extent + 6) |
| visual P2-2: shown thing over Nim's face | side offset 0.5·nimH + 0.55·ih + 8, never flipped onto him; above him when no side fits |
| visual P2-3: tiny dots (ages 6–7, phones) | phones cap countSel at 10; signs with ≥ 7 dots drawn 1.28× |
| playtest CONFIG | hintTime 5, assistAfter 5, shortBudget [∞, 24, 42, 58] (chapterMinRounds stays 3); fruit never repeats across chapters |
| visual P3 | amber golden stones (`#E9B860` / `#B98A3A`), Talk picture stone no longer cut, stick / uncurl bursts away from his face, the wipe carries a swirl of seasonal sprites, fixed Talk card sizes, balanced VI tagline |

Regression tests: `tests/unit/run.js` "fix1: …" (7 tests: hammer → hint + assist; mid-air taps; countSeq hold; landscape head
below the keeps on every stone; portrait edge + shown-thing offset; fruit never repeats + phone dot cap; CONFIG), `i18n_voice.test.js`
(priority flood keeps the prompt, `dropTagged`; VI mid-crossing right lines short), `stone_art.test.js` (amber gold, big dot signs),
`tests/e2e/functional.js` `voice_policy` (fake speechSynthesis: the fruit praise is spoken, count numbers are never dropped, the
question is heard).

Results after fix round 1 (2026-11-15): unit `run.js` 46/46, `i18n_voice` 74 383, `stone_art` 11 446 — all green; `smoke.js` PASS ×2;
`functional.js` 84/84 (incl. `voice_policy`); `tests/sim/hs_playtest.js --n 10` 485 sessions, 0 failed; `tests/sim/pt_playtest.js
--n 4` 240 sessions, 0 stuck (`hammerPure` now finishes every session); `tests/qa/qa_functional.js` green except the harness-timing
item QA already listed (chapters "stars undefined" read after the wipe swap; passes when re-run alone) — its assist check now reads
`NH.CONFIG.assistAfter`. Visual check: `node tests/e2e/screens_edges.js` (landscape top-row stone / mid-hop: 0 px under the bubble;
portrait edge column: 0 px off screen) + `tests/e2e/screens.js`.
Still open: the slow3 model (20–40 s look-aways) needs 8–9.6 min per session (target 8) — the rest is the child's own pauses.
