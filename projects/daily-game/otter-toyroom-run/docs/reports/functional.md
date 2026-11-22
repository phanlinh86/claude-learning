# Functional QA — Otto's Playroom Dash (2026-11-22)

Tester: functional QA agent (report only, no game code changed).
Build tested: working tree of `projects/daily-game/otter-toyroom-run/` (file:// URL, headless Chromium via Playwright).

## How to run

```
node tests/e2e/functional.js [--quick] [--only=boot,menus,input,scoring,gravity,best,lifecycle,focus,settings,storage,pictures,layout,soak]
node tests/e2e/mobile.js [--quick]      # iPhone / iPad, real CDP touch, safe areas, rotation
node tests/e2e/mobile_qa.js [--quick]   # touch platform layer: kid-proofing, ghost clicks, multi-touch, app switch, bot ×8
```

Each prints PASS / FAIL / WARN lines and exits 1 on any FAIL. Screenshots go to `tests/out/{functional,mobile,mobile_qa}/` (gitignored).
`functional.js` was rewritten for this game: the forked Oasis Run checks for the boss, pillows, shells and pots are gone. It adds a
`gravity` group (jump apex and airtime measured in the browser for each biome, the gk ease, the take-off gravity kept in flight, the
ball hop, the weather) and a `storage` group (rollback in localStorage and in the native store). Pictures are loaded with
`setInputFiles`. `mobile.js` and `mobile_qa.js` were adapted from `../hedgehog-moon-pop/tests/e2e/`.

## Totals

| Suite | PASS | FAIL | WARN | Time |
|---|---|---|---|---|
| `tests/e2e/functional.js` (full) | 427 | 4 | 4 | ≈ 8 min |
| `tests/e2e/mobile.js` (6 devices + 2 notch layouts) | 153 | 4 | 1 | ≈ 3 min |
| `tests/e2e/mobile_qa.js` (4 devices, 30 s bot runs) | 128 | 0 | 4 | ≈ 4 min |
| `tests/unit/run.js` (existing) | 26 | 0 | — | 4 s |
| `tests/e2e/smoke.js` (existing) | clean, no console errors | | | |
| **Total** | **734** | **8** | **9** | |

The 8 FAILs come from **3 distinct bugs** (P2-1 ×2, P2-2 ×1, P3-1 ×5). No console errors in any suite.

Per group (functional): boot 11/0, menus 35/0, input 56/0, scoring 35/0, gravity 50/0, best 12/0, lifecycle 14/0, focus 14/**2**,
settings 18/0 (1 warn), storage 10/0 (2 warn), pictures 29/0, layout 133/**2**, soak 10/0 (1 warn).

### The twist, measured in the browser (`?level=N`, 3 jumps each, Space key)
| Biome | gk | apex measured / target | airtime measured / target |
|---|---|---|---|
| The Felt Meadow | 1.0 | 1.012 / 1.01 u | 0.658 / 0.66 s |
| Pillow Mountains | 0.7 | 1.130 / 1.13 u | 0.850 / 0.85 s |
| The Crayon Jungle | 1.25 | 0.946 / 0.95 u | 0.567 / 0.57 s |
| The Glow-Star Galaxy | 0.5 | 1.251 / 1.25 u | 1.058 / 1.06 s |

These checks all passed:
- After a natural biome change, gk eases with a smoothstep: it is 1.00 at +0.05 s, 0.85 at +0.6 s and 0.70 at +1.3 s, it only moves in one direction, and its peak rate stays within the limit.
- A jump taken during the ease keeps one take-off gravity while `world.g` changes under it.
- `gotoLevel` snaps gk.
- A ball's steady hop matches ballV²/2g in every biome.
- A ball bouncing above Otto passes over him.
- The weather's `fk` eases toward gk^0.75.
- A bot run at ×16 reached round 2 with the gravity sequence 0.7 → 1.25 → 0.5 → 1.0.
- The 75 s ×16 soak reached 17 biomes and every biome's gk was right. Objects stayed ≤ 27, particles ≤ 74 and caches ≈ 410.
- Otto's moon-jump apex stays on screen at every size and DPR tested, in the edge lanes as well.

## What works (highlights)
- **Menus:** boot, the title demo, How to Play, Settings, Pause (including Settings opened from Pause), Game Over and Change Pictures all work. Esc/P work everywhere. Restart, Main Menu and the music stop all behave.
- **Keys:** ←/→/A/D, ↑/W/Space. Auto-repeat changes only one lane or jumps once, and the jump buffer works.
- **Touch and mouse:** taps by thirds, swipes left/right/up, and down-swipe does nothing. A slow drag is not a swipe and a long hold is not a tap. Quick double swipe and quick double tap both give two lanes. HUD buttons never move or jump Otto, and the Resume tap doesn't leak into gameplay.
- **Scoring:**
  - Acorns: +10 for every kind; a combo event at 10 in a row; the combo resets when you miss an acorn of a row you started, but skipping a whole row keeps it.
  - Air acorns: jumping over a ground acorn misses it, and an air acorn needs the jump.
  - Hits: bumps on blocks, towers and balls, invulnerability, and towers can't be jumped.
  - Biomes: bonuses 100/200/400 (round 2), heart gain only below max, the round-2 goal ×1.1, and the platinum medal.
- **Pause:** blur and visibilitychange pause the game and suspend audio. There is no pause on the death frame. The 0.7 s restart lock holds for both Enter and the click.
- **Focus:** Space/Enter on focused Play, Resume, Restart, Settings, difficulty and toggles each fire once and never jump. After clicking the HUD mute button, Space jumps instead of pressing the button again.
- **Settings and storage:** everything is saved under `otr:` (settings, volume, best per difficulty, pictures), and nothing else is written. `?mute=1` and `?diff=` are never saved. Corrupt saved settings fall back to defaults. The best score goes to the difficulty the run started on. Reset needs two taps and un-arms after 3 s.
- **Pictures:** PNG/JPEG for the hero, acorn and backgrounds. Photo → round sticker, cut-out → whole picture, and both toggles work. A 6000×4000 JPEG is downscaled to ≤ 1600 px (background) or ≤ 512 px (character) in under 8 s. A portrait background keeps 1600 px. Bad inputs show a friendly toast: .txt, a broken PNG, a 0-byte file, and a full storage. An SVG with only a viewBox works. Custom art is drawn in play and the HUD, a changed picture shows at once (no stale sprite), Reset one / Reset all work, and pictures survive a reload.
- **Mobile:** the canvas fills the screen on every tested iPhone/iPad (no letterbox), and the backing store is ≤ 3.3 MP. HUD buttons are ≥ 44 px. With a simulated notch and home indicator, the HUD and pause panel stay inside the safe areas. Rotating mid-game (even with a finger down) keeps the run going. Pinch, double-tap zoom and long-press are blocked while panels still scroll. Ghost clicks are swallowed. The first touch unlocks audio. The manifest, the icons (180/192/512 at the right sizes) and the iOS meta tags are present.

---

## Issues

### P2-1 — Enter/Space in the Score Card modal restarts the game *under* the modal
- **Repro:**
  1. Desktop browser (or the Windows exe), where `navigator.share` is missing so the modal focuses **Save picture** (an `<a>`).
  2. Lose a run, then click **Score Card**.
  3. Press Enter or Space.
- **Result:** `startGame()` runs. The run starts behind the still-open Score Card modal. Its `.screen` covers the stage, so taps can't steer, and Otto runs into obstacles while the child looks at the card. Enter on the link also never saves the picture.
- **Test:** `focus` → "Enter on the focused Score Card button (scSave) …" and "Space on the focused 'Save picture' link …" (both FAIL: `{"mode":"playing","starts":1,"modal":true}`).
- **Where:** `game/js/main.js:184`. The game-over key handler only ignores a focused element when it is a `BUTTON`. An `<a>` (or anything inside `#scScreen`) falls through to `startGame()`.
- **Fix:**
  ```js
  if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) {
    const f = document.activeElement;
    if (document.querySelector('#scScreen:not(.hidden)')) return;                        // a modal owns the keys
    if (f && f !== document.body && f.id !== 'btnAgain' && f.closest('button, a, input, label, .screen')) return;
    e.preventDefault(); if (!e.repeat && this.canRestart()) this.startGame(); return;
  }
  ```
  For safety, also have `startGame()` / `toTitle()` hide `#scScreen`. The cleanest way is to export `close` from `extras.js` and call `window.DailyExtras.close?.()`. That way no path can leave the modal over a live run.

### P2-2 — Settings overflows sideways on short landscape phones (iPhone SE 667×375)
- **Repro:** open Settings at 667×375 (iPhone SE / 8 landscape).
- **Result:** the panel scrolls sideways (737 > 645 px). **Normal**, **Hard** and the Best-score **Reset** button are off-screen on the right, so a parent can't change the difficulty without finding a sideways scroll. At 844×390 it fits.
- **Test:** `layout` → "iPhoneSE-667x375@2 scrSettings fits" (FAIL); screenshot `tests/out/functional/layout_iPhoneSE-667x375@2_scrSettings.png`.
- **Where:** `game/css/style.css:296`. Under `@media (max-height:430px)`, `#scrSettings .settings{display:grid;grid-template-columns:1fr 1fr}` lets the Volume row added by `extras.js` (−, slider `min(28vw,180px)`, %, +) stretch column 1 to its min-content width. Column 2 is then pushed past the panel.
- **Fix** (inside the same media query):
  ```css
  #scrSettings .settings{grid-template-columns:repeat(2,minmax(0,1fr))}
  #scrSettings .set-volume input[type=range]{width:min(16vw,110px)}
  #scrSettings .set-volume .vol-step{width:32px;height:32px}
  ```
  An alternative is `#scrSettings .set-volume{grid-column:1/-1}`, which gives the Volume row the full width.

### P3-1 — Portrait phones: the biome progress pill sits under the Pause / Sound buttons
- **Repro:** start a run at 390×844 (or 375×667, or any notch portrait layout).
- **Result:** the "Biome 1 · Normal hops" pill overlaps the bottom of the round Pause/Sound buttons by 3 logical px (6 px on the iPhone SE). You can see it in `tests/out/functional/layout_iPhone-390x844@3_play.png`.
- **Tests:**
  - `layout` → "iPhone-390x844@3 canvas HUD pills …"
  - `mobile.js` → iphone-portrait, iphone-se-portrait, notch-portrait, and iphone-landscape after rotating to portrait

  That is 5 FAILs from one cause.
- **Where:** `game/js/render.js:533`, where `by = this.portrait ? y0 + 64 : y0 + 4` is a fixed offset. The DOM buttons are 44 css px, which is 63 logical px at 390 wide and 66 at 375.
- **Fix:** place the pill below the real button row:
  ```js
  const btnH = 44 / (this.cssScale || 1);   // the HUD buttons are min 44 css px
  ... by = this.portrait ? Math.max(y0 + 64, I.top + 10 + btnH + 8) : y0 + 4;
  ```
  The drawGravMsg / banner `topY` in portrait (`ins.top + 150`) still clears it.

### P3-2 — A second finger cancels the first finger's swipe
- **Repro:**
  1. Rest finger 1 on the road.
  2. Tap the left third with finger 2.
  3. Swipe finger 1 to the right.
- **Result:** the tap fires (left lane), but finger 1's swipe is ignored. Expected: back to the middle lane.
- **Test:** `mobile_qa.js` → "finger 1 still swipes after a second finger tapped" (WARN on all 4 devices).
- **Where:** `game/js/main.js:194` (`pointerdown`) overwrites `this._swipe` for any new pointer; `pointermove`/`up` then ignore finger 1 because the id doesn't match.
- **Fix:** keep a small `Map` of active pointers (`this._ptr.set(e.pointerId, {...})`) and run the swipe/tap logic per pointer. Clear the map on blur, pause and `pointercancel`. This matters little for adults, but small children often play with two thumbs.

### P3-3 — Storage rollback edge cases (native store / Windows exe)
- **What works:**
  - A failed write, a quota error and a rejected binding all roll back.
  - An older write that fails after a newer one succeeded doesn't wipe the newer value. The sequence-number logic in `storage.js:531-536` is right for that case.
- **Edge A:** two writes to the same key both fail, and the newer one fails first. The cache ends on the **older failed** value: we expected '0' and the cache held '1'. The newer write rolls back to `prev`, which is the older, still-pending value. The older write's failure is then ignored because it is no longer the latest. The player would see a setting that is not on disk.
- **Edge B:** `del()` (`storage.js:548-553`) removes the key from memory before the host answers and never restores it when `ffStoreDel` returns false. After a restart the "deleted" picture or best score comes back.
- **Tests:** `storage` → two WARNs.
- **Fix:**
  - Keep the last value confirmed on disk, `this._saved[k]`, which is set from `init()` and on every `ok === true`.
  - On the failure of the *latest* write, restore `_saved[k]`, or delete the key when it is undefined, instead of `prev`.
  - In `del()`, keep `prev` and restore it in the `.then(ok => …)` / `.catch` when the result is false and `this._seq[k]` is still this call's seq.

### P3-4 — iPhone SE portrait: Change Pictures needs a scroll to reach Done
- **Repro:** 375×667 portrait → Change Pictures.
- **Result:** the panel fits, but **Done** sits below the panel's visible height. A child must scroll (the scroll works; kid-proofing exempts panels).
- **Test:** `mobile.js` WARN.
- **Where:** `game/css/style.css` portrait block (`.slot .prev{height:calc(var(--u)*7.5)}`, line 155).
- **Fix:**
  ```css
  @media (orientation:portrait) and (max-height:700px){
    #scrCustom .slot .prev{height:calc(var(--u)*5.5)}
    #scrCustom .small{display:none}
  }
  ```

### P3-5 — `?diff=` test flag hides the Settings difficulty choice
- **What happens:** with `?diff=normal` in the URL, clicking Easy saves Easy but the highlight stays on Normal. `ui.js:93` highlights `game.difficulty()`, which prefers the URL flag. This only affects test URLs.
- **Test:** settings WARN.
- **Fix:** highlight `this.game.settings.difficulty` and show a small "(test override)" note when `game.urlDiff` is set.

### P3-6 — CSS typo: one rule never applies
- **Where:** `game/css/style.css:298`, `#scrSettings   #scrSettings .menu{margin-top:6px}`. This is a descendant selector of itself, so it never matches.
- **Fix:** `#scrSettings .menu{margin-top:6px}`.

### P3-7 — Stale project docs and leftovers
- **CLAUDE.md:** the project `CLAUDE.md` still describes **Pebble's Oasis Run**: `window.PO`, `por:` prefix, port 47671, shells, the Fizz boss. Rewrite it for Otto: `window.OD`, `otr:`, port 48313/48323/48333/48343, acorns, gravity per biome. Agents read this file first, so it is the most important leftover.
- **go.mod:** `app/go.mod` has the module name `nimbusbubblegarden`, from another game. It is harmless but confusing; rename it to `ottosplayroomdash`.
- **DESIGN.md:**
  - §8 asks for a `#rotate` prompt, but the game has none, and none is needed: both orientations are fully playable and `mobile.js` checks that nothing blocks either. Update DESIGN §8.
  - §5.1 says `jumpVexp ≈ 0.65`; the code uses 0.35, with the reason documented in MECHANICS §1. Align DESIGN.
- **MECHANICS §8:** it says skill 0.3 gives ≈ 1–2.5 hits per biome. In the browser at ×16, a Hard run with skill 0.4 lost only 2 hearts in 240 s of game time and never died. The soak now uses skill 0.1 to exercise autorestart. This is not a bug, but the documented skill curve looks too pessimistic.

---

## Wrapper review — `app/main.go`

Code read on Linux. It could not be compiled here: `proxy.golang.org` is unreachable, and `app/web/` is a build output that isn't present. **The exe is still not verified on Windows.**

| Area | Finding |
|---|---|
| Port | 127.0.0.1:**48313**, then 48323 / 48333 / 48343, then any free port (`:0`). This matches DESIGN. Loopback only. `Cache-Control: no-store`. OK. |
| Store bindings | `ffStoreAll` / `ffStoreSet(k,v) bool` / `ffStoreDel(k) bool` match `storage.js`: go-webview2 bindings return Promises, and `storage.js` treats `false` and rejections as failures. Keys are stored without the `otr:` prefix, and every key the game uses (`settings`, `volume`, `best_*`, `img_*`, `shape_*`) matches `^[a-zA-Z0-9_\-]{1,64}$`. OK. |
| Writes | Each value is written atomically: write `k.txt.tmp`, then `os.Rename` (MoveFileEx with replace on Windows). A mutex serialises writes. The 12 MB cap is far above the largest picture (≈ 1 MB JPEG). `Del` treats "not exists" as success. `All()` skips `.tmp` files and bad names. OK. |
| Single instance | Named mutex `Local\OttosPlayroomDash.SingleInstance`. A second launch brings the existing window to the front. OK. |
| Full screen / quit | `ffFullscreen` dispatches to the UI thread and remembers the window placement (restores maximized correctly). `ffQuit` calls Terminate. OK. Note: in the exe, Esc pauses but does not leave full screen; only F11 does. This is consistent with the browser. |
| Fallback | If WebView2 is missing, the game opens in the default browser on the same port, so the same origin keeps its localStorage. OK. |
| Minor (P3) | The `http.Serve` error is ignored (`go http.Serve(ln, mux)`). If the listener dies, the window goes blank with no message; log the error or show a message box. The module name is a leftover (P3-7). |

**Storage rollback in practice:** `storage.js` never shows the player a value that failed to save, for a single failed write, a full quota or a dead host. That is verified in the browser and against a stubbed `ffStore*` host, including the boot fallback when `ffStoreAll` rejects. The `extras.js` Volume row writes through `OD.Storage` in app mode, so it reaches the file store too. Only the two edge cases in P3-3 remain.
