# Functional QA — Koko's Cake Tower (2026-11-14)

Suite: `node tests/e2e/functional.js` (all 22 groups, ≈ 7.5–8.5 min, `JOBS=2`) — or `node tests/e2e/functional.js poke bee drag …`.
Real CDP touch (`Input.dispatchTouchEvent`) on isMobile + hasTouch contexts: iPhone 393×852 @3 and 852×393, iPad 820×1180 and
1180×820 @2. Exits 1 on any FAIL; results in `tests/out/functional/results.json` + screenshots.

## Result
**525 pass, 2 fail** (final run). Both failures are the same game bug (P3-1 below). Zero console errors on every page.

| group | pass | fail | | group | pass | fail |
|---|---|---|---|---|---|---|
| boot | 36 | 0 | | multi | 12 | 0 |
| lang | 10 | 0 | | talk | 38 | 0 |
| gate | 7 | 0 | | pause | 11 | 0 |
| settings | 10 | 0 | | visibility | 8 | 0 |
| flags | 7 | 0 | | rotate | 36 | 0 |
| volume | 12 | 0 | | idle | 7 | 0 |
| drag | 36 | 0 | | countup | 26 | 0 |
| wrong | 33 | 0 | | bot (ages 3–7 × EN/VI) | 121 | 0 |
| miss | 24 | 0 | | done | 11 | 0 |
| tap | 16 | 0 | | layout | 12 | 0 |
| poke | 25 | **2** | | bee (new) | 27 | 0 |

Covered: logo EN "Koko's / Cake Tower", VI "Koala Koko / Tháp Bánh Kem" (+ document.title, html lang, persistence); parent gate
(short tap / 1 s hold / slide-off do not open, 2 s hold opens with progress); settings + volume persistence, URL flags never
saved, audio chain + compressor; real correct / wrong / miss drags, tap ≠ drop, tap assist after hints, Koko poke (`'koko'`,
`pokeKoko`), multi-finger, touchcancel; Talk by tap; pause / resume / visibility (also mid-drag); rotation mid-drag (drag
cancelled, stale finger drops nothing, layers / cake / Koko inside) and mid-fall; count-up chapters; idle nudges + auto-pause;
full bot sessions ages 3–7 in both languages; done screen; per-ask layout audit; **bee tap** (real tap → `beeTap`, `loop`,
2nd tap ignored, not a mistake, flies away, play continues).

**New done-sequence check** (every finished cake: 4 in `drag`, ≈ 130 in `bot`): exactly
`towerDone → cherry → cherryOn → count 1…n → blow → candlesOut → sprinkles → roundDone`, `count.n` and `candlesOut.n` = layers,
`world.candles.length` = layers at `blow` and `candlesOut`, all candles lit at `blow`, duration `1.8 + 0.45·n` s game time
(± 0.25). All green.

## Game bugs

### P3-1 — A quick tap on the speech bubble right after another tap is swallowed (no prompt repeat)
- Repro: iPhone 393×852 portrait (also iPad portrait; landscape intermittent), any ask. Tap the grass (or Koko, or lift a finger
  from a layer), then tap the bubble within ≈ 320 ms → nothing is said (`#bubble` click never fires). Test:
  `poke/<dev>: bubble tapped 150 ms after another tap still repeats the prompt`. It also made the old Lulu bubble check flaky.
- Cause: `CK.Input.kidProof()` (`game/js/input.js`, the document `touchend` double-tap-zoom guard) calls `preventDefault()` on a
  touchend < 320 ms after the previous one unless the target is `button, a, input, … [role="button"]`. `#bubble` is a
  `<div role="status">`, so the synthetic `click` that `main.js` listens for (`$('bubble').addEventListener('click', repeatPrompt)`)
  is cancelled.
- Fix (either): exempt the bubble in the guard (add `.bubble` / `#bubble` to the `closest(...)` selector), or bind the bubble
  on `pointerup`/`touchend` instead of `click` in `bindUI()` (main.js) with the same `no-game-input` handling.
- Impact: low — a child tapping Koko and then the bubble already hears the prompt from the Koko tap; a lone bubble tap works.

## Doc issue (not code)
- `docs/MECHANICS.md` §4 "done": "Total `towerDone → roundDone` = 2.25 + 0.45·n s: 3.15 / 3.6 / 4.05 s for 2 / 4 / 5 layers".
  The code (`countAt 0.65, countStep 0.45, blowAfter 0.45, outAfter 0.45, sprinklesAfter 0.3, roundDoneAfter 0.4`) gives
  **1.8 + 0.45·n** = 2.7 / 3.6 / 4.05 s (measured 2.74 s at n = 2). The 4- and 5-layer numbers are right; fix the formula and
  the 2-layer value.

## Test fixes made (test bugs, not game bugs)
- Port Lulu → Koko: logo strings, `kokoScreen()`, `_hit → 'koko'`, `pokeKoko`, `layout.koko`, `LW/LH` (layer offset ≤ 0.18·LW,
  drawn box `bw × bh` in scene / ask audits), bananas / monkey → done-sequence check, bot counts `cherryOn / sprinkles /
  candlesOut` per cake, raw-key filter covers `bee. / blow. / cherry.`.
- Boot "on screen" check used the padded hit box (h = 2·(0.6·S + 14) > LH), which pokes below the screen edge on landscape
  phones / iPads; it now checks the drawn layer.
- Bot "≥ 12 cakes" was too strict: Talk may come early after ≥ 2 cakes (MECHANICS §2), age 7 EN had 11 → now ≥ 8.
- Bubble-repeat check now waits 450 ms after the previous touch (the P3-1 window); the quick case is its own check.
- New `bee` group; event hook records candle / tower counts on done events.
