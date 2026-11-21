# Bristle's Moon Pop: functional QA report (2026-11-21)

## Summary
| Suite | Result |
|---|---|
| `node tests/e2e/functional.js` (rewritten for Moon Pop, 15 groups, 62 s bot run at ×16) | **317 pass / 6 fail**: 2 bugs (P2 How-to-Play layout, P2 stale thumbnail) and 1 P3 (vents re-shuffle) |
| `node tests/e2e/mobile_qa.js` | **66 pass / 1 fail** (the same How-to-Play bug). Before the fix to the script: 54 pass / 5 fail, because that one bug made the later checks fail too |
| `node shared/daily-mobile/test_extras.js projects/daily-game/hedgehog-moon-pop` | **27 / 27 pass** |

What `functional.js` covers:
- Boot with zero console errors.
- Every menu (title, How to Play, Settings, Change Pictures, pause, game over), with the back buttons and Esc.
- Keys ←/→ and A/D: coasting and the clamp at the edge of the range.
- Jump with Space / ↑ / W / Enter / Shift: apex and air time match the config, no double jump, the jump buffer works, holding a key jumps once.
- Mouse: following the cursor (overshoot < 6 px), a quick left click jumps, a long press does not, right-click jumps.
- Touch: a held finger steers, a quick tap jumps, a swipe does not jump, a second finger jumps, and the jump button jumps.
- Clicks on the HUD and menus never move or jump Bristle.
- Scoring: tiers 1/2/3, chain bonus and chain event, the streak multiplier at 8/20, an escaped bubble resets the streak, magnet pull and its range, pebble bonk and invulnerability.
- The full day dawn → noon → sunset → night → lap 2, reached by filling the box, plus `gotoLevel`.
- Pause and resume, plus auto-pause on blur and on visibilitychange.
- Every setting is saved: sound, music, volume, difficulty, length.
- `?mute=1` is never saved.
- Best scores: only saved with `?savebest=1`, kept per difficulty.
- The 0.7 s restart lock and spam / double-click.
- Focus and double-trigger bugs.
- Custom pictures: hero, cupcake, pebble and dawn background, a txt file, a corrupt file, an empty file, a 6000×4000 JPEG and PNG, reload, reset one, reset all.
- Layout at 960×540, 1280×720, 1920×1080, 844×390 (DPR 2 and 3, with simulated notch insets), 390×844, 1024×768 and 1366×1024. Checks: HUD inside the safe area with no overlaps, the jump button tappable and ≥ 66 px.
- Long bot run: no errors, score rising, particles < 180, items < 40, auto-restart works.

Change to `mobile_qa.js`: before tapping the How to Play OK button, it now checks that the button is on screen (as its own check), then scrolls it into view. The rest of the script was unchanged.

## Issues

### P2-1: How to Play: the "OK, let's pop!" button is below the fold on iPhone landscape
- **Repro:** 844×390 or 852×393 touch → How to Play. The panel scrolls (`overflow:auto`). The OK button sits at y 361–405, but the panel ends at y 385, so a tap lands on the panel. On a phone there is no Esc key, so a child is stuck until they find the scroll. Same in `mobile_qa` at iphone-landscape.
- **Where:** `game/css/style.css:103-106` (`.how-grid` / `.how p` sizes); the panel is `max-height:94vh` at `:26`.
- **Fix:** on short landscape screens, make the text smaller and keep the button visible:
```css
@media (orientation:landscape) and (max-height:500px){
  #scrHow .panel{display:flex;flex-direction:column;padding-top:calc(var(--u)*1.2);padding-bottom:calc(var(--u)*1.2)}
  #scrHow .panel h2{margin-bottom:calc(var(--u)*.6)}
  #scrHow .how-grid{overflow:auto;min-height:0;flex:1}          /* the cards scroll, the OK button never does */
  #scrHow .how{padding:calc(var(--u)*.7)}
  #scrHow .how p{font-size:calc(var(--u)*1.3);line-height:1.25}
  #scrHow .weather-line{display:none}
}
```

### P2-2: Change Pictures: replacing a photo keeps showing the OLD preview
- **Repro:** Change Pictures → Bristle → choose a blue photo, then choose a red photo. The card still shows the blue sticker, even though the game draws the red one.
- **Where:** `game/js/assets.js:182`. The thumbnail cache key is `slot|shape|WxH`, and every round sticker is 512×512, so the new picture gets the old key.
- **Fix:** clear the thumbnail cache whenever the source changes:
```js
// assets.js, in loadCustom() after this._cache.clear(), in setShape() and in clearCustom():
if (this._thumbs) delete this._thumbs[slotId];   // (loadCustom: this._thumbs = {};)
```

### P3-1: Resizing the window (Safari toolbar, Split View) re-shuffles the vents mid-level
- **Repro:** 844×390 touch, mid-level → viewport height 340 → back to 390. The vents go from `[212,572,734]` to `[334,588,802]`. The play range depends on the jump-button size, which depends on height, so any resize calls `_placeVents` with fresh random numbers. Puffing bubbles teleport and the seeded game stops being reproducible.
- **Where:** `game/js/world.js:342-343` (`setPlayRange` always re-places the vents); called from `game/js/main.js:81`.
- **Fix:** only move the vents that end up outside the new range:
```js
if (this.vents && this._info) {
  var lo = xMin + c.ventMargin, hi = xMax - c.ventMargin;
  if (this.vents.some(function (v) { return v.x < lo || v.x > hi; })) this._placeVents(this._info.vents);
  ...
```

### P3-2: Game over: the "NEW!" badge sticks out past the score panel (cosmetic)
- **Where:** `game/css/style.css:98` (`.new-best{right:calc(var(--u)*-3.2)}`). This is what makes the over-panel `scrollWidth` larger than its width on 844×390.
- **Fix:** `right:0;top:calc(var(--u)*-1.2)`, or put the badge before the number.

### P3-3: Wrapper still carries the sister game's name
- **Where:** `app/go.mod:1` says `module shellysskycatch`.
- **Fix:** `module bristlesmoonpop`, then run `go mod tidy`.

### P3-4: Wrapper: the native store RPC is still reachable from another origin (hardening)
- **Where:** `app/main.go:241-246`. The init script deletes the `ff*` globals on a foreign origin, but go-webview2 still answers raw `chrome.webview.postMessage({id,method:"ffStoreSet",params})` from any page in the WebView. Today the game has no links, so the risk is low.
- **Fix:** have the Go side check the origin, e.g. wrap each bound function so it refuses unless the page URL starts with `origin` (keep the URL from a `w.Bind("ffHello", …)` handshake). Or open no external links and keep this as a documented limitation.

## Reviewed with no bug found
- `main.js`: the input routing works. This includes the second finger, the jump-button finger never steering, quick-tap jump, HUD exclusion, the restart lock, Score Card gating, `?mute=1` staying session-only, best scores keyed by the run's difficulty, and level length applied exactly once per level (tested).
- `storage.js`: a failed write rolls the cache back, as it should.
- `assets.js`: huge images are downscaled before they are stored (512 / 1280×720); bad and empty files show friendly errors.
- `main.go`: writes are atomic (tmp then rename), keys are checked against a regex, and the port 47629 is unique among the sister games.
- Minor note: `DailyExtras.setVolume(0.5)` saves `"0.5"` while the slider saves `"0.50"`. This is harmless.
