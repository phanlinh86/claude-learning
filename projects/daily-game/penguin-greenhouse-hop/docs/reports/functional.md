# Puddle's Greenhouse Hop — Functional QA report

Date: 2026-11-23 · QA: functional engineer (report-only for game code) · Build: working tree of `projects/daily-game/penguin-greenhouse-hop`.

## 1. Results

| Suite | Command (from the project folder) | Result |
|---|---|---|
| Unit (world / bot / weather) | `node tests/unit/run.js` | **37 / 37 PASS** (1.8 s) |
| Smoke (boot → keys → pointer → bot → big → 4 floors → game over → portrait) | `node tests/e2e/smoke.js` | **PASS**, no console errors (scores [1228], level 3, 214 m) |
| Shared mobile extras (volume slider, score card, 4 iPhone/iPad layouts) | `node ../../../shared/daily-mobile/test_extras.js .` | **EXTRAS PASSED** (27 / 27) |
| Functional, full | `node tests/e2e/functional.js` | **642 PASS · 2 FAIL · 12 WARN** (266 s) |
| Functional, quick | `node tests/e2e/functional.js --quick` | 380 PASS · 1 FAIL · 7 WARN (≈ 270 s; 2 layouts, floors to 2, no soak) |

`tests/e2e/functional.js` was rewritten for this game: the fork's wind group, `debug.gust`, `plank`, `clover_*` sprites, the 20-firefly lantern and the farm slot names are gone. New groups: **growth** (grow / setSize hooks, ×2 metres, size bonus + shrink, heavier steering) and **platforms** (leaf damped spring, basket pendulum, mushroom spring). Groups can be run one by one: `node tests/e2e/functional.js growth platforms`.

### Coverage by group (full run)

| Group | What it checks | Result |
|---|---|---|
| boot | title + bot demo, 0 console errors, all assets, every `PH.debug` hook incl. `grow`/`setSize`, no `wind`/`gust` left, no fork words in the page text, URL flags `autostart diff level speed mute debug` | all PASS |
| menus | How to Play / Settings / Change Pictures / Pause / Game over and all buttons; Esc / P / M / F11; Enter / Space; 0.7 s restart lock; game-over stats | **1 FAIL** (medal hint, I-1) |
| keys | hold ← → A D, latest key wins, release fallbacks, Space/Enter/↑/↓ ignored in play, pause clears input, auto-pause on `blur` and `visibilitychange`, held key steers again after Resume, bot owns the steer | all PASS |
| pointer | mouse hold halves, slide across the middle, right button ignored, HUD buttons never steer; touch (CDP multi-touch, 1024×768 DPR 2): two fingers, older finger lifted, second finger on Pause / Mute while steering, no ghost clicks, touch hints | all PASS |
| rules | auto-bounce, one-way shelf, firefly +10 / +1 lantern / +0.006 size, lantern 15 → heart, fall → heart + umbrella, game over at 0 hearts (no umbrella), **exact score identity** on a bot run (metres ×2 while big + 10·fireflies + floor bonus + size bonus) | PASS, 2 WARN (I-4, I-5) |
| growth | slow growth over time, `grow(0.35)` → grow steps 1,2,3 + one `big`, HUD "×2" + "Big Puddle!" pop-up, clamp at Easy 1.5, `setSize` silent and up to 2.5, top speed 5.0 → 3.64 at size 1.6, ×2 / ×1 metres, levelUp bonus 100 + size bonus 90 at 1.45, smooth shrink to 1.0, +1 heart, Fern visuals | all PASS |
| platforms | leaf bends (tip down), overshoots past 0 and settles, heavy Puddle bends deeper and flicks ×1.15, ≤ 0.35 rad; basket swings with period 1.99 s ± 10 %; basket landing counts a swing; mushroom spring 19.8 u/s, apex ≈ 7.6 u, "BOING!", `mushroom_up`; rim landing = normal bounce; Potting floor only pots/shelves | all PASS |
| levels | bot skill 1 at **?speed=16** climbs to floor 6 (zones 1,2,3,0,1) without errors; visuals / banner / weather / music per floor; floor bonus and size bonus per levelUp; loop goal 126.5; shrinks counted. Game seconds per floor: 45.8, 39.4, 38.5, 40.2, 52.2 | all PASS |
| settings | persistence under `pgh:` only, reload, `?mute=1` / `?diff` / `?speed` / `?level` / `?debug` never saved, M saves only the player's choice, best per difficulty, best saved under the run's own difficulty, Reset best needs two taps, **bot runs never save a best** | PASS, 1 WARN (I-7) |
| custom | six slots (hero, firefly, bg_potting, bg_fern, bg_balcony, bg_roof) via `setInputFiles`, cut-out → "Whole picture", photo → "Round", preview refresh, 6000×4000 image downscaled, text file and broken PNG refused with friendly toasts, drag & drop, reload, custom hero **grows with size**, custom backgrounds on all 4 floors, reset one / reset all (1.62 M chars of localStorage for six pictures) | all PASS |
| focus | Space/Enter start exactly once, HUD-mute focus, Pause → Space, game over Enter/Space/held Enter once, Enter during the lock swallowed, Menu focus, destructive buttons never focused, How-to "OK" doesn't also start, Esc / blur during the death fall ignored | all PASS |
| native | WebView2 bridge mocked: store load, Quit button, keys match the Go regex, `ffStoreSet → false` rollback, write races, F11 → `ffFullscreen`, `ffQuit`, fallback when `ffStoreAll` fails; static checks of `app/main.go` (storage path, port 48413 + fallbacks, mutex name, bindings, no fork names, port/name unique among daily games) | PASS, 1 WARN (I-8) |
| layout | 1280×720, 1920×1080, 960×600, iPhone 844×390 + 390×844 (DPR 3, notch emulated), iPad 1024×768 + 1366×1024 (DPR 2): canvas letterbox, no page scroll, every panel inside the window / scrolls, no overlapping buttons, HUD buttons + all 4 HUD pills (incl. size meter while big) inside the safe area and not overlapping, 44 px HUD buttons, toast, rotation | **1 FAIL** (I-2), 8 WARN (I-3, I-6) |
| soak | ?speed=16 bot, 372 s of game time, floors to 6, no errors, particles ≤ 72, platforms ≤ 21, fireflies ≤ 15, sprite cache 955, heap 7 MB, no best saved | all PASS |

## 2. Issues

### P2

**I-1 · Game-over medal hint still names the fork's first level ("Sunny Meadow")** — `game/js/ui.js:128` (comment on :125 too)
Repro: play, lose all hearts on floor 1 → game-over panel says *"Climb past the Sunny Meadow for a medal"*. This text is also copied onto the shareable Score Card. Kids are told to pass a level that doesn't exist.
Fix:
```js
// ui.js:125-128
const c = info.cleared;   // floors finished: 1 bronze, 2 silver, 3 gold, 4+ platinum
...
$('medalName').textContent = m === 'none' ? 'Climb past the Potting Shed for a medal' : m[0].toUpperCase() + m.slice(1) + ' medal';
```

**I-2 · Settings scrolls sideways on a notched iPhone in landscape (844×390)** — `game/css/style.css:296` (+ the extras volume row)
Repro: iPhone landscape with safe-area insets 47 px left/right → Settings. The panel is limited to `100vw − 16px − insets` (734 px) but the two-column grid is 11 px wider (`scrollWidth 739 > clientWidth 728`); the right column (Music toggle, Difficulty, Reset) is cut at the edge and the panel can be dragged sideways. `1fr 1fr` columns can't shrink below their content (the volume row: − button + 180 px slider + "100%" + + button).
Fix:
```css
@media (max-height:430px){
  #scrSettings .settings{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;min-width:0}
  #scrSettings .set{min-width:0}
  #scrSettings .set-volume .vol-wrap{min-width:0;flex:1 1 auto;justify-content:flex-end}
  #scrSettings .set-volume input[type=range]{width:auto;flex:1 1 60px;min-width:50px}
}
```

### P3

**I-3 · Fork leftovers in code, CSS and docs** (no runtime effect, but confusing for the next person)
- `game/css/style.css:298` — broken selector `#scrSettings   #scrSettings .menu{margin-top:6px}` never matches (the duplicated id). Fix: `#scrSettings .menu{margin-top:6px}`.
- `game/js/audio.js:133-153, 164` — an unused "gust bed": a second looping noise source + filter + panner runs for the whole session at gain 0 (wasted audio-thread work on old iPhones), plus `setWind()`. Fix: delete lines 140-145 and make `setWind(){}` a no-op (`stopMusic` may keep calling it).
- `game/js/render.js:217` comment "farmyard ground"; `render.js:318` stale comment "procedural little legs" → "greenhouse floor" / delete.
- `README.md` is entirely the fork's (Clover the frog, wind gusts, hay carts, trampoline, "Sunny Meadow → … → Snowy Rooftops", smoke test "wind gust") and `CLAUDE.md` likewise (date 2026-11-08, Clover, wind, trampoline). Fix: rewrite both from `REQUIREMENT.md` (Puddle, fireflies, growth twist, 4 greenhouse floors, umbrella rescue) and list the new test groups.
- `game/assets/default/firefly_*.svg`, `icon.svg` gradient ids `ffh0`/`iffh0` are harmless id names (not "Farm Frog Hop" text) — no change needed.

**I-4 · Full lantern at max hearts still promises "+1 heart"** — `game/js/world.js:466-471`, `game/js/render.js:378`
Repro: hearts full, catch the 15th firefly → "Lantern full! +1 heart" pop-up, heart pulse and heart-gain chime, but no heart is gained (correctly capped). Confusing for a child.
Fix (world.js):
```js
if (this.lantern >= C.lanternSize) {
  this.lantern = 0; this.stats.lanterns++;
  var gained = this.hearts < this.maxHearts;
  if (gained) this.hearts++;
  this._emit({ type: 'lantern', hearts: this.hearts, gained: gained });
  if (gained) this._emit({ type: 'heartGain', hearts: this.hearts });
}
```
render.js:378: `s: e.gained ? 'Lantern full! +1 heart' : 'Lantern full! +50'` (and optionally give +50 points in the world when not gained).

**I-5 · The umbrella throw is silent; "Umbrella boing!" almost never shows** — `game/js/main.js:255-266`, `game/js/render.js:361, 380`
`_fall()` throws Puddle up immediately (vy = bounceV·1.45) from below the umbrella; the umbrella `bounce` (sound `rescue` + "Umbrella boing!" text) only fires if she lands on it again, which the aimed rescue rarely does. Measured: sounds on a fall = `fall`, then the next platform's `bounce` — DESIGN §7's "boinggg + flap" never plays. Fix (main.js `handleEvents`):
```js
case 'rescue': if (sound) A.play('rescue'); break;
```
and in render.js `onEvents` `case 'rescue'` push `{ x, y: this.VH - 60, s: 'Umbrella boing!', t: 0, col: '#ffffff', down: true }`.

**I-6 · Change Pictures cards overflow on phones; Volume steppers are 36 px** (layout WARNs)
iPhone 390×844: 2 cards and 844×390: 3 cards have the "Whole picture / Round" shape buttons wider than the card (74 px card, 88 px content); the screen scrolls vertically (acceptable, Done reachable). `.vol-step` buttons (`game/js/extras.js:263`, shared file) are 36 px tall, below the 40–44 px touch target. Fix:
```css
@media (max-width:600px), (max-height:430px){
  .slot .shape{flex-wrap:wrap;justify-content:center}
  .slot .shape button{flex:1 1 100%;min-height:32px}
}
.set-volume .vol-step{width:44px;height:44px}   /* in style.css, overrides the shared extras style */
```

**I-7 · With `?diff=` in the URL, the Settings difficulty buttons do nothing for the next run** — `game/js/main.js:46`
`difficulty()` returns `urlDiff` first, so after tapping Normal the segment shows Normal but the next run is still Hard and the title best is Hard's. Test-flag only. Fix: in `setSetting`, `if (k === 'difficulty') this.urlDiff = null;`.

**I-8 · `Storage.del()` forgets the value even when the native delete fails** — `game/js/storage.js:52-60` (carried over from the fork, still open)
Fix:
```js
del(k) {
  const prev = this.cache[k]; delete this.cache[k];
  const seq = (this._seq[k] = (this._seq[k] || 0) + 1);
  const fail = () => { if (this._seq[k] === seq && prev !== undefined) this.cache[k] = prev; return false; };
  if (this.native) return Promise.resolve(window.ffStoreDel(k)).then(ok => ok === false ? fail() : true).catch(fail);
  try { localStorage.removeItem(PREFIX + k); return Promise.resolve(true); } catch (e) { return Promise.resolve(fail()); }
}
```

**I-9 · Bot/test runs show "NEW!" and a best they did not save** — `game/js/main.js:125`
With `?bot=1` (or after `PH.debug.setBot(true)`) a high score shows *NEW!* and *Best = score* on the panel and the score card, but nothing is stored. Fix: `best: this.botMode ? prev : Math.max(prev, w.score), newBest: newBest && w.score > 0 && !this.botMode`.

## 3. Windows wrapper review (`app/main.go`)

All good, nothing from the fork left:
- Storage: `%APPDATA%\PuddlesGreenhouseHop\data\<key>.txt` (atomic temp + rename, key regex `^[a-zA-Z0-9_-]{1,64}$`, 12 MB cap) — every key the game writes matches (checked). WebView2 profile `%LOCALAPPDATA%\PuddlesGreenhouseHop\WebView2`.
- Port **48413**, then 48423 / 48433 / 48443, then any free port; unique among the daily games (checked against every `*/app/main.go`).
- Single instance: mutex `Local\PuddlesGreenhouseHop.SingleInstance`, finds the window by the title "Puddle's Greenhouse Hop" (same string as the WebView title) and brings it forward.
- Bindings `ffStoreAll / ffStoreSet / ffStoreDel / ffFullscreen / ffQuit` match `storage.js` / `main.js`. Manifest identity `PuddlesGreenhouseHop`, PerMonitorV2 DPI. `tools/build.sh` outputs `dist/PuddlesGreenhouseHop.exe`.
- Not verified: building and running the exe on Windows (no Windows host here).

## 4. Notes for the team
- Gameplay feel at speed: the weak bot (skill 0.2–0.3) survives > 6 minutes on Normal/Hard without dying, so the "best score not saved by bots" test now ends the run itself.
- The world API matches DESIGN §5.1/§5.4 (incl. `grow`, `setSize`, `levelUp {bonus, sizeBonus, size}`); the deviations documented in MECHANICS §7 behave as described.
- Screenshots of every layout/screen: `tests/out/functional/*.png`.
