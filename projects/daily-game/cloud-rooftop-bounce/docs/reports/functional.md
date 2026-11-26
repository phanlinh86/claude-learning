# Functional QA: Wisp's Rooftop Bounce (2026-11-26)

Report only. No game, app or tools code was changed. The probes are in `tests/qa/probe.js`; run it with `node tests/qa/probe.js` (`SOAK=150` sets the soak length in seconds).

## Summary
| Suite | Result |
|---|---|
| `tests/unit/run.js` | 38/38 pass |
| `tests/e2e/smoke.js` | pass |
| `tests/e2e/functional.js` | 304/304 pass |
| `shared/daily-mobile/test_extras.js` | pass |
| `tests/qa/probe.js` (new) | 36/40 pass. The 4 failures are the 3 issues below |

**Issues: P1 0, P2 2, P3 2.**

### What the probes confirmed works
- Pressing Space or Enter after a mouse click on HUD Mute serves. It does not toggle the sound a second time.
- Magnet flows all pass:
  - Pausing with the pearl stuck freezes both the stuck timer and the magnet timer. After resume, Space lets the pearl go upward.
  - When the magnet ends while the pearl is stuck, the pearl is released at once (`magnetEnd` and then `release:auto`).
  - The pearl does not stick during the magnet's last 0.3 s.
  - A click or tap on HUD Mute, or in the gap between the HUD buttons, never releases the pearl.
  - A game over with the magnet on turns the magnet off and Wisp's face is not "magnet".
  - Clearing a zone with the magnet on leads to a normal serve in the next zone.
- Safe area on a landscape phone (844×390, DPR 3, simulated insets of 47/21 px): the HUD stays inside the right inset, its buttons are at least 44 px, and the play field clears both side insets.
- Portrait phone:
  - A blur behind the rotate card shows the Pause menu, and Resume brings the card back.
  - "Play upright anyway" works by touch with no ghost serve, and stays dismissed for later runs in the same session.
- `?mute=1` combined with Settings changes never saves `muted`, and the next normal visit is not muted. Volume persists across reloads.
- Change Pictures handles odd files:
  - an SVG with no size is saved at 150×150;
  - a 1×1 PNG is saved;
  - an empty file gets a friendly error;
  - the game then runs with no errors.
- The Score Card opens and closes 6 times with no errors, and Esc closes it.
- Pausing during the descend freezes it, and resume finishes the descend into zone 2. A blur on the title screen does not pause anything.
- Soak: 150 s of wall clock at 16× (about 40 min of game time), bot with skill 0.7 at 1024×768 DPR 2.
  - Zero errors.
  - Heap after GC stayed at 2.9 → 3.1 MB.
  - Peaks: 38 particles, 21 fx, 278 sprite cache entries, 3 background canvases, 3 falling items.
  - The bot saved no best score.
- `app/main.go` and `game/js/storage.js`:
  - Keys are validated, writes are atomic (a `.tmp` file, then rename) and serialised by a mutex.
  - The server listens on loopback only, `.tmp` leftovers are ignored by `All()`, and the single-instance mutex is correct.
  - Rollback on a failed `set` is guarded by a sequence number, so an older failure cannot undo a newer write.
  - No wrapper bugs found. One small gap is listed as a P3 below.

## Issues

### P2-1: Enter or Space with the Score Card open starts a new game behind the card
- **Repro:**
  1. Lose all hearts, then click **Score Card**. Focus moves to "Save picture", an `<a>`, whenever `navigator.share` is missing (desktop Chrome or Edge, and the exe).
  2. Press Enter (or Space).
- **Result:** `mode` becomes `playing`. The game runs and plays music under a modal that stays open. Closing the card drops the child into a live run.
- **Where:** `game/js/main.js:200`. The game-over key handler only skips focused elements that are `BUTTON`s, so the link at `game/js/extras.js:198` falls through to `startGame()`.
- **Fix:** in `main.js:200`, return early when any control other than Play Again has focus, or when the card is open:
  ```js
  if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) {
    const f = document.activeElement, card = document.getElementById('scScreen');
    if ((card && !card.classList.contains('hidden')) || (f && f !== document.body && f.id !== 'btnAgain')) return;
    ...
  ```
  Apply the same `f !== document.body && f.id !== 'btnPlay'` check on line 203 for consistency.

### P2-2: An iPad held upright gets the "Turn your phone sideways" card
- **Repro:** at 768×1024 or 1024×1366 (touch), tap Play.
- **Result:** the card "Turn your phone sideways for a bigger city!" covers the game and the world is frozen until the child taps "Play upright anyway". DESIGN §2 says "Portrait iPads play letterboxed", and the card's text talks about a phone.
- **Where:** `game/js/main.js:61`. `syncRotate()` only checks `isTouch && renderer.portrait`. It has no check for phone size. `tests/e2e/functional.js:748` expects this behaviour too, because its `S.name.includes('portrait')` test also matches "768x1024 iPad portrait".
- **Fix:** in `main.js:61` add a phone check, for example `&& Math.min(screen.width, screen.height) < 600` (or `Math.min(innerWidth, innerHeight) < 600`). Then limit the test at `functional.js:748` to phone sizes (`S.name === '390x844 portrait'`) and add a check that an iPad in portrait shows no card.

### P3-1: Test hook `clearBricks(0)` soft-locks the zone
- **Repro:** during play (or while the pearl is stuck), run `WRB.debug.clearBricks(0)`.
- **Result:** `bricksLeft() === 0`, but `phase` stays `play` forever. The pearl bounces in an empty field and the zone never clears.
- **Where:** `game/js/world.js:275`. `debugClear` kills bricks directly, but a zone clear only runs from a brick hit (`_hitBrick` calls `bricksLeft() === 0`).
- **Fix:** at the end of `debugClear`, add `if (this.bricksLeft() === 0 && this.phase === 'play') this._zoneClear();`. This affects tests and debugging only; players cannot reach it.

### P3-2: A failed delete in the exe is not rolled back
- **Where:** `game/js/storage.js:52`. `del()` removes the key from the cache before the native `wrStoreDel` finishes, and never restores it if the delete returns false (for example, a file locked by antivirus).
- **Result:** "Reset best" or "Reset picture" looks done this session, but the old value comes back after a restart. This breaks the "what you see is what's saved" promise that `set()` keeps.
- **Fix:** keep `prev`, and on `ok === false` (or a rejected promise) restore it when `this._seq[k]` is unchanged, the same way `set()` does.

## Notes (not bugs)
- On touch screens, Chromium's touch adjustment turns a tap in the 6 px gap between Pause and Mute into a tap on Pause. iOS does much the same. This is harmless.
- A bot with skill 0.7 on Easy never lost a game in about 40 min of game time, because of the 8 net saves and +1 heart per zone. The game-over and restart soak is covered by `functional.js`.
