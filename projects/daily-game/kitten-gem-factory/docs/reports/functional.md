# Functional QA — Comet's Gem Factory

Date: 2026-11-13 · Tester: functional QA agent (report only, no game code changed)
Suite: `tests/e2e/functional.js` (Playwright + Chromium; it serves `game/` itself on a free port)

```
node tests/e2e/functional.js                 # everything (~5 min, the long bot run is 60 s)
node tests/e2e/functional.js --only=rules,custom --long=20
```
Output: PASS/FAIL per check, exit code 1 on any failure. Screenshots and `summary.json` go to `tests/out/functional/`.

## Summary

| Group | Checks | Result |
|---|---|---|
| boot + menus (title, How to Play, Settings, Change Pictures, Pause, Pause→Settings, Game Over; Esc/back) | 28 | all pass |
| input (mouse, keyboard, touch, HUD buttons never flip, tap right at "Go!") | 22 | all pass |
| rules (10×mult, combo, unseen vs seen miss on Easy/Normal/Hard, 3rd-tap close, level clear → Summer, time-out → game over panel, restart lock) | 27 | all pass |
| pause / auto-pause (blur, visibilitychange, nap) | 9 | all pass |
| settings + persistence (sfx/music/difficulty/mute, `?mute=1` never saved, best per difficulty, tainted runs, reset best) | 26 | all pass |
| focus / double-trigger (focused button + Space/Enter) | 10 | all pass |
| customisation (transparent PNG, opaque JPEG, 4000×3000 photo, .txt, corrupt PNG, custom pair on the board, hero, wall, reset) | 21 | all pass |
| layout at 7 sizes / DPRs (panels, cards on screen and tappable, HUD vs cards and HUD vs score/gauge/combo, touch targets, page overflow) | ~255 | all pass |
| long bot run `?bot=1&speed=16` 60 s + weak bot with 4 game overs and auto-restarts | 13 | **1 fail** |
| **Total** | **414** | **413 pass, 1 fail** |

Main results:
- Zero console errors, page errors or failed requests in every scenario.
- The rules match DESIGN §5 exactly: +10/+20/+30 for a combo, the clock refuels +4 s on Easy, and a miss on two cards never seen before keeps the streak. A miss with a seen card takes off 1 step on Easy, 2 on Normal and resets it on Hard. Clearing a season adds 5 points per second left plus 50 for a perfect season.
- Restart lock works: 25× Enter and 12× clicks on "Play Again" each start exactly one game.
- No focus double-trigger found. After you click the sound button, Space flips a card and does not toggle the sound again. Enter or Space on a focused Play, Restart, Resume or Menu button does exactly one thing.
- Best scores are saved per difficulty. They are never saved for `?bot`, `?speed`, `?level`, `?diff` or `debug.setSpeed()` runs. Reset needs two taps and disarms after 3 s.
- The 60 s run at speed 16 reached level 80 (20 years). Particles peaked at 200 (cap 260) and juice fx at 9. The JS heap was flat at about 10 MB, but headless Chromium only reports coarse buckets.
- A tap at `phaseT ≈ 0.008 s` after "Go!" flips the card (the card was still face up and closing).
- A 3.6 MB 4000×3000 photo used as the wall is shrunk to 1600×1200 and stored as a 0.27 MB data URL in about 1.1 s.

## Issues

### P2-1 Flying gems fill the sprite cache with about 100 sizes per gem (≈1 200 canvases, ~28 MB), rasterising SVG in the middle of frames
- **Repro:** `?bot=1&speed=16&mute=1`, then after 60 s run `CGF.Assets._cache.size` in the console. It reaches about 1 200 entries, and each gem kind has 80–100 of them. On an iPhone 14 (844×390 @3x, `px` 1.81) the cached canvases add up to **27.6 MB** after about 40 s and keep growing until each gem reaches about 100 sizes. In a real game this happens over the first few seasons.
- **Cause:** `game/js/render.js:437` shrinks a flyer continuously: `s = 56 * (1 - 0.45 * k)`. `_gemOnCard` → `_draw` → `CGF.Assets.sprite(key, s, s)` (`game/js/assets.js:218-232`) caches every size rounded to ¼ px. So almost every frame of a gem flight builds a new canvas and rasterises an SVG synchronously inside that frame. This undoes the idle-time prewarm and causes small hitches on phones. The cache has no size limit either.
- **Fix:** draw the flyer from one fixed sprite size and scale it with the context:
  ```js
  // render.js _flyers
  const k = ..., sc = 1 - 0.45 * k;
  g.save(); g.translate(x, y); g.rotate(r); g.scale(sc, sc);
  this._gemOnCard(f.kind, 56, 1);
  g.restore();
  ```
  As a safety net, cap `Assets._cache` (for example, when `size > 300` delete the oldest entries, since a `Map` keeps insertion order).

### P3-1 iPhone SE landscape, Winter board: the pause button touches the top-right card
- **Repro:** viewport 667×375 (touch), `?level=3` (6×4 board). `#btnPause` is at 564–608 × 9–53 css px and card 5 is at 519–581 × 52–114. The round button touches the card corner with 0 px clearance, and the card's 6 px tap margin (`tapPad`) sits under the button. A child aiming at the top-right corner of that card gets Pause instead. Every other size has clearance.
- **Where:** `game/css/style.css:72` / `:192` (`#hud` top = `--u*1.4`, buttons at least 44 px) together with `BOARD.y = 76` in `world.js:31`.
- **Fix:** on short screens, pull the HUD up into the safe area, for example `@media (max-height:430px){ #hud{ top:max(4px, env(safe-area-inset-top)) } }`. That leaves about 5 px of clearance. Another option is to push the HUD buttons right of `BOARD.x + BOARD.w` when the viewport is short.

### P3-2 Saved settings are not type-checked
- **Where:** `game/js/main.js:26`. `Object.assign(this.settings, CGF.Storage.getJSON('settings', {}))` copies whatever is stored. A hand-edited or old `cgf:settings` value (for example `{"sfx":"false"}` or a JSON string) turns into truthy strings or index keys. Only `difficulty` is validated.
- **Fix:** copy only known keys of the right type: `for (const k of ['sfx','music','muted']) if (typeof s[k] === 'boolean') this.settings[k] = s[k];`

### P3-3 (Windows app, `app/main.go`) MIME types come from the Windows registry
- **Where:** `app/main.go:234-239`. `http.FileServer` uses `mime.TypeByExtension`, and on Windows Go adds the registry's `HKCR\.ext\Content Type` on top of its built-in table. Machines whose registry maps `.js` to `text/plain` (a known Go issue) or `.svg` to something odd will serve wrong types. `.webmanifest` has no built-in type at all.
- **Fix:** set the type for the extensions the game uses before serving, for example `mime.AddExtensionType(".js", "text/javascript")`, and the same for `.css`, `.svg` (`image/svg+xml`), `.json` and `.webmanifest` (`application/manifest+json`). Also consider `w.Header().Set("X-Content-Type-Options", "nosniff")`.

### Code review notes (no action needed)
- `storage.js`: the write rollback with sequence numbers is correct. An older write that fails late cannot wipe a newer value, `del()` bumps the sequence too, and a failed `set` keeps the cache equal to the disk. A failed `del` keeps the value deleted in memory but not on disk, which is harmless (it reappears after a restart).
- `app/main.go`: the store writes atomically (temp file + rename), checks key names with a whitelist regexp and caps values at 12 MB, so a full disk makes JS roll back. The single-instance mutex, the port fallback and the full-screen placement restore look right. The loopback server only serves static files.
- Balance (for the playtester, not a bug): a bot with skill 0.3 on **Hard** still cleared 6 seasons before the test drained the clock. Hard may be easier than it is meant to be.

## Test-code notes
- The gap between cards counts as part of the cards on purpose (`tapPad` is half the gap), so the suite checks clicks outside the board instead of in the gaps.
- "Resume" is auto-focused on the Pause panel, so pressing Space there resumes. That is intended keyboard behaviour, and the suite blurs the button before testing that Space flips nothing while paused.
- Waits fast-forward with `CGF.Game.speed` directly, not `debug.setSpeed`, so the "best score saved" tests are not marked as test runs.
