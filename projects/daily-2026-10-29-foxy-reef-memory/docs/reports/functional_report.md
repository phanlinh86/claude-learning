# Foxy's Reef Memory: functional QA report

- Suite: `tests/e2e/functional.js` (Playwright/Chromium, 15 test groups). It is based on the Family Flappy suite.
- Run it with `(cd game && python3 -m http.server 8791) & node tests/e2e/functional.js [baseUrl] [--quick] [--only=name]`.
- Screenshots are in `tests/out/functional/` and per-check results are in `tests/out/functional/results.json`.
- **Result (full run, 150 s long run): 234 / 239 checks passed, 5 failed.** The 5 failures come from 2 bugs.

Note: `game/` changed while the tests were running (index.html, style.css, world.js and render.js were edited at about 01:59–02:00). Everything below was re-checked against the code as it stood after those edits. The Autumn banner arrow bug (B3) was found in the first run and was already fixed by that edit; it now passes.

## Bugs

### B1: How to Play panel: the "OK, let's dive!" button is cut off at 16:9 (Medium)
- **Repro:** open the game at 1280×720 (also 1366×768 at 1.5×, 1920×1080, and 2560×1440 at 1.5×) and click How to Play. The panel needs scrolling and its only button sits below the bottom edge (see `tests/out/functional/02_how.png`). It fits at 800×600 because that window is taller than 16:9. A child sees no button, and Esc is the only way out.
- **Root cause:** `game/css/style.css:29` sets `.panel.wide{width:calc(var(--u)*62)}`. With the 2-column `.how-grid` (`style.css:103`) and the icon column, each text column is only about 209 px wide at 1280×720. The 4th card's longer text (`game/index.html:82`, "…The arrow in the season badge shows which way…") wraps to 9 lines, so that grid row is 269 px tall. The panel content is 743 px against a 665 px limit (`max-height:94vh`, `style.css:26`).
- **Fix (either one is enough; both is best):**
  1. Widen the panel: `.panel.wide{width:calc(var(--u)*80)}`. 80u is 80 % of the canvas width. This gives the text about 1.5× more width, so the 4th card drops to about 6 lines and the panel fits. I verified this by injecting the rule into a test page: the panel is 609 px tall at 1280×720 (limit 665), and it also fits at 1920×1080, 800×600 and 1024×768 with no scrolling.
  2. Shorten the 4th text by dropping "The arrow in the season badge shows which way." The badge and the banner already say it. Optionally also tighten `.how{padding:calc(var(--u)*.8)}`.
  - Check: `node tests/e2e/functional.js --only=layout` must report no `scrHow` issue at any size.

### B2: Easy mode doesn't give the 2-second peek that REQUIREMENT.md promises (Low–Medium, requirement deviation)
- **Repro:** start fresh (clear storage), go to Settings, pick Easy and play. You get `world.cfg.peekTime === 1` (a 1 s peek), not 2 s.
- **Root cause:** `game/js/main.js:10-13`. `difficultyOverrides()` always overwrites `peekTime` with the Settings value ("the Settings 'Peek at start' choice always wins"). The default Settings value is `peek: 1` (`main.js:24`), so `RF.DIFFICULTY.easy.peekTime = 2` (`world.js:110`) can never take effect. The same default also gives **Normal** a 1 s peek. MECHANICS.md tuned Normal with no peek (`peekTime: 0`), so Normal is easier than designed. In the first long run a skill-0.3 bot played 96 levels at speed 16 without dying, whereas MECHANICS.md §6 and `tests/unit/run.js:613` (no peek) expect deaths around levels 23–36.
- **Fix:** add an "Auto" peek that follows the difficulty, and make it the default.
  ```js
  // main.js
  settings: { …, peek: 'auto' },
  function difficultyOverrides(d, peek) {
    const o = Object.assign({}, (RF.DIFFICULTY && RF.DIFFICULTY[d]) || {});
    if (peek !== 'auto') o.peekTime = peek;          // explicit choice wins; Auto = preset (Easy 2 s, Normal/Hard 0)
    return o;
  }
  ```
  - In `index.html:102` add `<button data-v="auto">Auto</button>` to `#setPeek`.
  - In `ui.js:40` change the handler to `v => game.setSetting('peek', v === 'auto' ? 'auto' : parseInt(v, 10))`.
  - In `ui.js:65` compare with `String(s.peek) === b.dataset.v`.
  - Saved settings that already hold `peek: 1` keep it. That's acceptable: only new players get Auto.
  - Check: the `REQUIREMENT: Easy mode starts with a 2-second peek` check passes, and the `peek N s on easy/normal` checks still pass.

### B3: Autumn banner arrow ignored the real current direction (Low; FIXED during the run, verified)
- The Autumn current is ±1 depending on the seed and flips every lap (`world.js:210`). The first run showed the banner arrow fixed at "right" (`SEASON_INFO[2].arrow = [1,0]`) while level 3 pushed left (seed 31). `render.js` `drawBanner()` now reads `world.gravity` and says "LEFT!"/"RIGHT!". The check `Autumn banner says the way the current really pushes (both laps)` passes on both laps.

### Minor / cosmetic (no test failure)
- `game/js/storage.js:2` comment still says `%APPDATA%\FamilyFlappy\data`. It should be `FoxyReefMemory`. The code itself is right, because the Go host decides the folder.
- `tools/build.sh:5` comment says `# projects/flappy`.

## `app/main.go` review
It is the Family Flappy wrapper with the names changed: window title, `%APPDATA%\FoxyReefMemory\data`, WebView2 data folder `%LOCALAPPDATA%\FoxyReefMemory\WebView2`, and the manifest identity. It uses its **own loopback port 47614** (Flappy uses 47613), so both games can run at once. The store key regex `^[a-zA-Z0-9_\-]{1,64}$` accepts every key the game writes (`settings`, `best_<diff>`, `img_<slot>`, `shape_<slot>`); the native-bridge test checks this. I found nothing game-specific that's wrong.

## What was tested (all passing unless listed above)
| Area | Checks |
|---|---|
| Boot / screens | Zero console or page errors. Title buttons, Quit hidden in the browser, HUD hidden, reef + Foxy animate behind the menu. How to Play / Settings / Change Pictures open and close (button + Esc). |
| Play flow | Play → `playing`/`ready`/`deal`, banner shown, cards not yet dealt. Clicks during the deal are ignored. Playing after 2.1 s of game time (peek off). Cards land face-down on their cells. Events season → deal → play. |
| Real mouse on cards | Screen coordinates are computed from card x,y and the canvas rect. Flip; second click on the same card ignored; water click ignored; a click during the second flip is ignored. Match → +10, combo 1, air +3, both pop to gone, cupcake released, Foxy swims there and eats it (1–6 s, eat frame). Second match → combo 2, +20. Mismatch → combo 0, oops frame, flips back after 0.8 s. A third click closes the mismatch early and flips the new card. Tapping a shown mismatched card only closes the pair. |
| Gravity per season | Spring: up. Summer: no slide and no cell changes. Autumn: sideways along the row in the sign of gravity.x. Winter: down. Mid-slide the card is between cells, and a real click at its animated position hits it (refused while it moves). It settles in about 0.6–0.7 s. Clicking its new cell then flips it. |
| Keyboard | Arrows/WASD show and move the cursor, which clamps at the edges. Space/Enter flip the card under the cursor. The first Space after a mouse click only shows the cursor. Auto-repeat is ignored. The cursor never lands on an empty cell. |
| Air / game over | Drains 1 s per second. Low-air event below 25 % and Foxy looks worried. Dead → panel after about 1.2 s, Foxy floats up, stats include the season reached. Play Again with Space / Enter / button is locked for 0.7 s (even with the button focused) and then starts exactly once. Menu goes back to the title. |
| Pause | Esc / P / HUD button / window blur / hidden tab all pause. Nothing moves while paused (world, air, Foxy, cards, weather, effects). Board input is ignored while paused. Settings from pause → Esc returns to pause. Restart. Pausing during the intro resumes into the intro. Pause is disabled after death (Esc, blur). Main Menu stops the music. |
| HUD never flips cards | Mute/pause clicks and pointerdown on `#hud` never reach `tapAt`. Space after clicking mute doesn't toggle it again. |
| Settings | `RF.DIFFICULTY` easy/normal/hard values reach `world.cfg`. Peek 0/1/2/3 s is measured exactly on both Easy and Normal (cards face-down before play), and clicks during the peek are ignored. Sound/music/difficulty/peek persist through reload and the UI reflects them. `?mute=1` isn't persisted. M mutes (icon + toast + persists). Reset best clears every difficulty. Best score is kept per difficulty; NEW! never shows for 0. |
| Change Pictures | Hero/treat/card back/Spring background chosen through `#filePick` (the real file chooser). The custom card back is drawn on face-down cards (pixel probe). The custom hero is drawn and moves; the eat frame squashes it. Cut-out → whole picture; opaque photo → Round by default; Round button. Everything persists through reload. Replacing the card back with a same-size picture updates the cards. Per-slot reset, Reset all (default back drawn again). Text-file toast and corrupt-image toast. 4000×3000 images are downscaled to ≤512 px for characters and ≤1280×720 for backgrounds. |
| Lap 2+ | Level 5 = Spring lap 2 (air 48 s, refill 2.4). Autumn's current flips each lap. Winter lap 2 is 6×4. The air floor is 0.3 (level 41: 18 s). The backdrop and weather follow the season. A bot clears Winter → Spring lap 2 with score kept and backdrop/weather/music switched, air bonus = round(air)×2. The game-over panel shows "lap 2" and a Platinum medal. |
| Layout | 800×600, 1280×720, 1366×768 at 1.5×, 1920×1080, 2560×1440 at 1.5×: 16:9 letterbox centred, backing store ≤1920×1080. Menus fit except How to Play (B1). HUD buttons sit inside the canvas, above the air meter and the Winter board. Live resize; a corner click on a card still hits after resizing. |
| App bridge | Native store detected, nothing written to localStorage, keys valid for Go, picture and settings reload, F11 → `ffFullscreen(true/false)`, Quit → `ffQuit`. |
| Long run | Speed 16, bot skill 0.3, autorestart, 150 s (≈ 2400 s of game time): 0 errors. Max 24 cards, 2 cupcakes, 77 particles, 33 fx, 54 cache entries. Heap flat at 9.5 MB. 4 game-over → auto-restart cycles (forced every other sample, because the bot doesn't die on its own; see B2). Reached level 26 (lap 7). |
