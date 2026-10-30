# Pip's Candy Dash: functional QA report

- **Suite:** `tests/e2e/functional.js` (Playwright + Chromium, 17 test groups, 241 checks)
- **Run:** `(cd game && python3 -m http.server 8801) &` then `node tests/e2e/functional.js [baseUrl] [--quick] [--only=name]`
- **Result (full run, 120 s long run at speed 16):** **239 / 241 PASS, 2 FAIL** (exit code 1)
- **Artifacts:** screenshots and `results.json` in `tests/out/functional/`; the full log of this run is `tests/out/functional/run.log`

Every tuning value the suite checks (speeds, dash/pop/bump numbers, slow/ice multipliers, jar sizes, difficulty presets, bear caps) is read from the live `CD.debug.world.cfg`, `CD.CONFIG` or `CD.DIFFICULTY`. No tuning number is hard-coded.

## Bugs

### B1: Sprite cache grows without limit for Pip (Medium: memory + frame hitches)
- **Repro:** `?speed=16&bot=1&autostart=1&autorestart=1`. Check `CD.Assets._cache.size` every 10 s. It climbs 142 → 194 → 233 → … → 351 entries (about 50 MB of canvases) and is still rising after 2 minutes. Almost all new entries are `pip_walk1/walk2/cheer/slide/hurt` at many different sizes.
- **Cause:** `render.js:363` calls `A.sprite('pip_' + fr, sz, sz)` with `sz = PIP * p.scale`, and `p.scale` is *smoothed* (it tweens on every grow, bump or Pop). The cache key is `Math.round(w*4)`, so nearly every frame of a size tween makes a new key, a new SVG rasterisation inside the frame (a hitch), and a cached canvas that is never evicted. `render.js:352/359` do the same for a custom hero (`A.fit('hero', sz*1.15, …)` → `custom:hero` at every size). A 1920×1080 backing store (px 2) is the worst case.
- **Fix:** rasterise each Pip frame once at its largest size and scale it when drawing:
  ```js
  // render.js drawPip(), default art
  const big = PIP * (1 + (w.cfg.scalePerSize || 0.15) * ((w.sizeMax || 5) - 1));   // 96
  const spr = A.sprite('pip_' + fr, big, big);
  if (spr) g.drawImage(spr, -sz / 2, -sz * PIP_FOOT, sz, sz);
  // custom hero: same idea
  const [bw, bh] = A.fit('hero', big * 1.15, big * 1.15), k = sz / big;
  g.drawImage(A.sprite('custom:hero', bw, bh), -bw * k / 2, -bh * k - 2, bw * k, bh * k);
  ```
  (Or quantise `sz` to the 5 size levels.) Add these to the idle pre-warm list. The long-run check "sprite cache bounded (≤ 200 entries)" then passes.

### B2: Changing difficulty mid-run saves the score under the wrong difficulty (Low)
- **Repro:** start on Normal, press Esc, go to Settings, pick **Hard**, return and resume, then lose. The Normal run's score is written to `best_hard` (and shown as the Hard best and "NEW!"), while `best_normal` stays untouched. The world itself still uses the Normal config (`cfg.heartsMax` 3, Normal jars).
- **Cause:** `main.js:104` builds the key from the *current* `this.settings.difficulty` at game-over time, not from the difficulty the run started with.
- **Fix:** in `startGame()` store `this.runDifficulty = this.settings.difficulty;`, then in `gameOver()` use `key = 'best_' + (this.runDifficulty || this.settings.difficulty)` and show the best for that key. Optionally add a hint on the pause-menu Settings: "Difficulty applies to the next game".

### Notes (no failing check; integrator's call)
- **N1: Hover ring (Low, visual).** `main.js:190` updates `renderer.pointer` on every *mouse* move during play, even when no button is held. `render.js:281` then draws the pulsing target ring under the cursor all the time, also while the player steers with the keys. That ring suggests Pip will walk there. Fix: draw the marker only when `CD.Game.pointerDown` is true (or keep `pointer` null until pointerdown).
- **N2: "Press SPACE" text on touch screens (Low, text).** `render.js:81` shows "Max size! Press SPACE to Pop!" on touch devices too. Use "Tap ★ to Pop!" when `'ontouchstart' in window`.
- **N3: `?level=N` banner (Info, test switch only).** `?level=N` emits a `biome` event for level 0 and then one for level N, so the backdrop and weather briefly hand over from the Meadow. This doesn't affect players.

## What was verified (all PASS)
- **Boot / menus:**
  - zero console or page errors in every group;
  - Title, How to Play, Settings and Change Pictures open and close by button and by Esc;
  - Quit is hidden in the browser and shown with `?app=1`;
  - the title runs a demo with the bot and weather.
- **Layout:**
  - at 800×600, 1280×720, 1366×768@1.5, 1920×1080 and 2560×1440@1.5: canvas letterboxed at 16:9 and centred; backing store = CSS size × DPR, capped at 1920×1080;
  - every menu (title, settings, customise, how, pause, game over) fits on screen with no clipped or scrolled-away buttons;
  - HUD buttons sit inside the canvas and above the gem jar;
  - ★ is hidden on non-touch and shown inside the canvas in a touch context;
  - a live resize keeps 16:9 and correct pointer mapping.
- **Keyboard:** arrows and WASD move Pip at `pipMaxSpeed`. Diagonals are normalised (not √2×). On release Pip drifts a little (≈ v²/2·brake) and stops. Walls clamp Pip. Walk and idle frames are correct.
- **Mouse:** holding the button sets the target. Pip arrives within `arriveStop` and overshoots by less than 4 px. Dragging re-targets Pip. Releasing stops following. Keys override a held mouse.
- **Touch** (CDP touch events):
  - a finger drag makes Pip follow and stop;
  - a second finger dashes without stealing the target;
  - lifting all fingers stops following;
  - tapping ★ dashes without setting a target;
  - ★ hides during pause.
- **Action:**
  - Space, Shift, right-click, second finger, ★ and Enter (in-game) all dash; the cooldown is respected;
  - the dash runs at `dashMul` speed with the slide frame;
  - **Pop!** at max size: size → 1, bears within `popRadius` stunned for `stunTime`, far bear not stunned, points = `popBase + popPerBear·n`; stunned bears are harmless.
- **Gems and bumps:**
  - gem points = `gemPointsPerSize × size`; grow, jar +1; `maxsize` at the cap; collision radius follows size; telegraphing gems can't be grabbed;
  - a bump: −1 heart, −1 size, `dropGems` taken from the jar as loose gems, `invulnTime`, hurt pose, knock-back, no chained hit;
  - loose gems return to the jar when picked up and vanish after `looseLife`.
- **Jar, gate and biomes:**
  - a full jar fires `jarfull` and `gateopen`, and gems stop spawning;
  - walking into the gate clears the biome: bonus = hearts × `clearBonusPerHeart`, then heal;
  - after `clearTime` the Chocolate River starts with banner, weather (ripples), backdrop and music season all switched; jar and size reset.
- **Zones:**
  - river chocolate = `slowMul` × speed; bridges, gate landing and bank are full speed;
  - cloud puffs: bounce event, hop, outward kick, outward drift when standing in one;
  - glacier ice: stop drift ≈ 1/`iceMul` × ground, slide frame while coasting, still stops.
- **Game over:**
  - the dead state lasts ~1.4 s before the panel; the panel shows the score, HUD hidden;
  - pause is disabled after death (Esc, button, blur); action keys are ignored while dead;
  - Enter/Space/button are locked for 0.7 s, then Play Again starts exactly once; Menu returns to the title.
- **Pause:**
  - Esc, P, button and blur all pause; nothing moves (world, bears, gems, weather, fx);
  - Settings from pause, and Esc back to pause;
  - keys released on blur (no stuck walking); a held mouse is released;
  - clicks and keys while paused do nothing;
  - HUD clicks (mute, pause/resume) never move Pip.
- **Settings:**
  - sound and music toggles reach `CD.Audio`; difficulty highlight;
  - persistence after reload;
  - Easy/Normal/Hard: every `CD.DIFFICULTY` key is applied to the new world (hearts, jar, bear count, bear multiplier); the title demo is always Normal;
  - M mutes (setting, engine, icon, toast) and the mute persists;
  - best score per difficulty, NEW! flag, a lower score never overwrites; Reset best clears all three and persists.
- **Change Pictures:**
  - hero, gem, bear and ground pictures through the real `#filePick` file chooser;
  - a cut-out stays "fit"; an opaque photo becomes a round sticker (transparent corners); Whole/Round buttons;
  - a 4000×3000 ground is stored ≤ 1280×720; a 3000×2000 hero is stored ≤ 512 px;
  - a .txt file and a broken PNG give friendly toasts with no crash;
  - everything renders in game, including the coloured red/green/orange bear rings (pixel probes, `17_custom_ingame.png`);
  - persistence, single Reset, Reset all.
- **Lap 2:** `gotoLevel(4)` gives Meadow lap 2 with bears, jar and gems from the config. Bears never exceed Pip's slowest speed. Glacier lap 2 works.
- **Focus:**
  - Space and Enter on the title start exactly once;
  - Space on a focused button or toggle activates that control;
  - Enter on the pause screen resumes; Enter in-game = dash.
- **Go bridge emulation** (`?app=1`, fake ffStore*/ffFullscreen/ffQuit that mirror `main.go`):
  - storage goes through the native store, not localStorage;
  - every key matches `keyRe` and every value is under 12 MiB;
  - pictures, settings and best reload;
  - F11 toggles native fullscreen; Quit calls `ffQuit`.
- **Long run** (speed 16, bot skill 0.5, autorestart, forced deaths): 8 games, levels up to 10 (lap 3), no errors. Bears, gems, weather particles (≤ 60), fx and texts stay bounded, and the JS heap is flat. Only the sprite cache keeps growing (B1).

## `app/main.go` review
No game-specific mistakes:
- port `127.0.0.1:47615` with a free-port fallback;
- the data dir `%APPDATA%\PipsCandyDash\data`, the WebView2 dir and the window title "Pip's Candy Dash" are all correct, and nothing is left over from a sister game;
- it binds all five functions the page uses and loads `index.html?app=1`;
- the store key regex accepts every key the game writes;
- writes are atomic (tmp + rename).

A minor point that already exists in the sister games: if port 47615 is busy, the fallback port changes the origin. That only matters for the no-WebView2 browser fallback, where localStorage would then be lost; the WebView2 path uses the native store.
