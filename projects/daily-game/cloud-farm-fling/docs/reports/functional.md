# Functional QA — Nubi's Farm Fling (2026-11-24)

The suite `tests/e2e/functional.js` was ported from the fox game. It covers Finn → Nubi, raft → wagon, leaves → fireflies, gulls → crows, splash → plop and flutter → puff. The day–night checks were replaced by growth checks.

- Run it with `node tests/e2e/functional.js` (≈ 3 min 40 s) or `node tests/e2e/functional.js --quick` (≈ 2 min 50 s; 15 s soak, no 1920×1080 layout).
- It prints PASS/FAIL lines and exits with code 1 if any check fails.
- Screenshots go to `tests/out/func_*.png`. Results go to `tests/out/functional.json`.

## Results

| Suite | Result |
|---|---|
| Unit tests: `node tests/unit/run.js` | **29/29** pass (bot lands 98.5 / 99.0 / 95.9 % with skill 1) |
| Mobile extras: `node shared/daily-mobile/test_extras.js projects/daily-game/cloud-farm-fling` | **EXTRAS PASSED**: 26 checks, zero console errors |
| Functional, full run | **258/259** pass, 1 FAIL (P2-1 below) |
| Functional, `--quick` | **249/250** pass, same FAIL |

## What the functional suite covers

| Area | What it checks |
|---|---|
| boot | Title screen and the bot demo behind it; HUD hidden; no missing images; Play button focused; `getState()` returns nubi, wagon and flies |
| menus | How to Play, Settings, Change Pictures (6 cards), Pause, Restart, Main Menu, Game Over, Play Again; Esc and back buttons; Game Over stats show Fireflies, Waterings and Biggest Nubi |
| mouse and keyboard | Drag back pulls and release flings. Preview dots and the pull pose appear while aiming. Three taps in flight give one puff. A tap while Nubi still rises fast does not use up the puff. Tiny, short, there-and-back and right-button drags cancel. Arrow keys change angle and power, Space flings, a second Space puffs once. Held Space (auto-repeat) only flings. Keyboard aim followed by a plain tap does not fling. Mute and Pause buttons do not aim, fling or puff. Space or Enter on a focused button never acts twice. Esc during a drag cancels the pull. M toggles sound. Space on the title starts exactly one run. Restart lock after Game Over |
| touch at 844×390, DPR 3 | Drag and fling; one puff per flight; a tiny wiggle does nothing; HUD taps; a second finger tapping Pause while the first drags; no scroll or zoom |
| scoring | Firefly +1, golden firefly +3, watering +2, bullseye +3, streak +1 per step up to +4 (sequence 4/5/6/6/6), Big Shower +2 (size 1.38 does not count, 1.5 does), bull + big + streak = 8. A plop costs 1 heart and the streak. A flop on the bale is a free retry. A heart comes back every 12 fireflies on Easy, never above the maximum |
| growth | Slow growth while aiming (≈ GROW_RATE·t). Each firefly adds GROW_FLY to the target size (GROW_GOLD for a golden one), eased with no pop. Size is capped at 1.7; `setSize` clamps to [1, 1.7]. `grow` and `big` events fire. The pickup radius grows with size. Landing shrinks Nubi to 1 + (s−1)·RAIN_KEEP, eased and monotone. A plop removes PLOP_LOSS but never goes below 1. The same pull flies shorter when Nubi is big. The preview's last dot matches the real landing point. Size is kept on a new level |
| levels | 5 waterings → Sunflower Summer (one levelUp; renderer switches to the summer scene). After 20 waterings the run loops to Spring, round 2. Autumn has 1 crow and Winter 2. Bumping a crow bounces Nubi, shows the bonk pose and costs no heart |
| pause | Paused state is frozen; resume has no time jump; blur and a hidden tab auto-pause; the game stays paused when the tab is visible again |
| URL flags | `?size=1.5` affects only the run, not the title demo. `?size=9` is clamped to 1.7. `debug.setSize` sets the size and re-lays the fireflies. `?level=2&diff=hard` starts in Pumpkin Autumn |
| persistence | Every key starts with `cff:`. Sound, music and difficulty survive a reload. `?mute`, `?diff`, `?size` and `?speed` are never saved. Best score is kept per difficulty, and a mid-run difficulty change saves to the run's own difficulty. Reset needs two taps. Bot runs save no best and show no "NEW!" |
| pictures | Generated PNGs go in through `setInputFiles`. An opaque photo becomes a round sticker; a transparent cut-out stays whole. The Round / Whole picture buttons work. A .txt file and a corrupt PNG show friendly errors and leave the slot unchanged. A 6000×4000 background is downscaled to ≤ 1600 px; character pictures are ≤ 512 px. The game plays with custom pictures at size 1.7. Pictures persist across reloads; Reset one and Reset all work |
| layouts | 1280×720, 844×390 and 667×375 (DPR 3/2), 390×844 (DPR 3), 1024×768 and 1366×1024 (DPR 2), plus 1920×1080 in the full run. Each is checked for: panels fit or scroll, no horizontal page scroll, HUD ≥ 44 px and inside faked safe-area insets, a touch fling works on each touch layout, the rotate card on a phone held upright (game held; "Play upright anyway" resumes without flinging), and the pause and Game Over panels |
| performance | Winter, size 1.7, bot playing: frame work p95 is 2.2 ms (max 27 ms) |
| soak at ×16, skill 0.55, 60 s | 20 games, 213 shots, 142 landings, 532 fireflies. Size stays within 1.00–1.45; ≤ 160 particles; fx lists bounded; no stalls; no best score saved |
| errors | Zero console, page or frame errors in every section |

## Bugs

### P2-1: Settings panel overflows on small landscape phones (iPhone SE / 8, 667×375)

**Repro:** open the game at 667×375 with touch (`isMobile`), then open Settings. The right-hand column runs past the panel: the Music toggle, the Normal and Hard buttons and the Reset button are cut off (`scrollWidth` 737 > 645). At 844×390 it fits.

**Cause:** `game/css/style.css:296`, inside `@media (max-height:430px)`, sets `#scrSettings .settings{grid-template-columns:1fr 1fr}`. A `1fr` column cannot shrink below its content's minimum width. The Volume row that `extras.js` adds needs about 420 px (label, −, slider, %, +), so the left column becomes 422 px wide and pushes the right column out of the panel.

**Fix (verified by injecting the CSS at 568×320, 667×375, 844×390 and 932×430; nothing sticks out and nothing scrolls):**
```css
@media (max-height:430px){
  #scrSettings .settings{grid-template-columns:repeat(2,minmax(0,1fr))}
  #scrSettings .set-volume{grid-column:1/-1}
}
```
The suite now includes a 667×375 layout so this stays covered.

### P3-1: Dead CSS selector
`game/css/style.css:298` reads `#scrSettings   #scrSettings .menu{margin-top:6px}`. This is a copy-paste slip: the selector looks for `#scrSettings` inside itself, so it never matches. **Fix:** change it to `#scrSettings .menu{margin-top:6px}`.

### P3-2: Fox-game leftovers in the game, the wrapper and the docs
- `game/index.html:67`: the Game Over heading says "What a voyage!" (pirate / sea wording). **Fix:** use something like "What a shower!" or "Great watering!".
- `game/js/rng.js:1`: the header comment says "Finn's Island Fling". **Fix:** rename it to Nubi's Farm Fling.
- `app/go.mod:1`: `module finnsislandfling`. The exe name, port, mutex, title and AppData folder in `app/main.go` are all correct for Nubi. **Fix:** `module nubisfarmfling`. Only the module path is wrong; it does not change the build output.
- `README.md` is still entirely the fox game's README. Its play link points to `.../fox-island-fling/game/`, and it describes Finn, leaves, flutter, islands and `FinnsIslandFling.exe`. This one matters for the deploy, because anyone following the README opens the wrong game. **Fix:** rewrite it for Nubi with the link `.../daily-game/cloud-farm-fling/game/`.
- `CLAUDE.md` (project) is still the fox game's: it names Finn, the `fif:` prefix, port 47781 and `world.fox.rot`. **Fix:** rewrite it for Nubi: `cff:` prefix, ports 48513/23/33/43, `world.nubi.rot`, growth instead of day–night.

### Notes (not bugs)
- DESIGN §5 gives growth numbers marked "≈" (GROW_FLY 0.06, RAIN_KEEP 0.45, BUOY 0.35). The code uses tuned values (0.05, 0.4, 0.15), and the suite checks against `CONFIG`. If the mechanics engineer hasn't already, DESIGN §5 should be updated to match.
- The `fly` event's `size` field holds the new size *goal*, not the current eased size. That is fine for the HUD, but the field name is slightly misleading.
- In the soak (skill 0.55), Nubi never got bigger than 1.45×, so a weak player rarely sees the full 1.7×. That is a design observation for the playtester.
- Not verified: a real iPhone or iPad (real `env(safe-area-*)` insets, Safari audio unlock) and the Windows exe.
