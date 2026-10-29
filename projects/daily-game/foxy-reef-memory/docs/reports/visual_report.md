# Foxy's Reef Memory: visual / art-direction QA report

Date: 2026-10-29 · Build: `game/` as checked in today · Tester: visual QA agent

## How this was tested
- Menus at 1280×720, 1920×1080 and 800×600: `tests/visual/menus.js`
- In-game captures: `tests/visual/ingame.js`. The game clock is frozen (`setSpeed(0)`) and advanced by hand in 1/120 s steps, so frames in a contact sheet are exactly the stated time apart.
- Colour-vision simulation (Machado 2009: protan, deutan, tritan, greyscale): `tests/visual/cvd.py`
- Cupcake and Foxy timing (headless `RF.World`): `tests/visual/cupcake_time.js`
- Autumn banner vs. the real current: `tests/visual/autumn_banner.js`
- Contact-sheet builder: `tests/visual/sheet.py`
- All images and logs are in `tests/out/visual/`. Sheets are named `sheet_*.png`. `ingame_log.json` holds slide speeds and overlaps; `cupcake_timing.json` holds the cupcake timings.

Default run: `?mute=1&seed=42`. With seed 42, Autumn's current flows **left** (gravity `{x:-1}`).

---

## P1: must fix (they break the core twist or hide what the player has to memorise)

### P1-1 The Autumn banner arrow can point the wrong way
- **Evidence:** `banner_autumn.png`. The banner shows "→". The current actually pushes cards **left** (`ingame_log.json` → `level2.g = {x:-1}`; `sheet_slide_L2.png` shows the rows compacting to the left).
- **Cause:** `render.js:11` hard-codes `arrow: [1, 0]`, and `render.js:523` draws `si.arrow`. Meanwhile `world.js:146/210` picks the sign at random (`_autumnSign`) and flips it every lap. About half of all games teach the wrong direction for the one mechanic the player must follow.
- **Fix (`render.js:523`):**
  ```js
  const gv = this.world && this.world.gravity;
  const [ax, ay] = gv ? [Math.sign(gv.x), Math.sign(gv.y)] : si.arrow;
  ```
  Make the hint text match the direction. At `render.js:521`, use `const hint = b.s === 2 && gv ? (gv.x < 0 ? 'A current pushes shells LEFT!' : 'A current pushes shells RIGHT!') : si.hint;`.

### P1-2 No direction indicator during play
- **Evidence:** `season_*_mid.png`. Once the 1.95 s banner has gone, nothing on screen shows which way cards will slide. Kids who missed the banner (they were looking at Foxy) cannot predict the slide.
- **Fix (`render.js:474-480`, the season pill):** after the pill text, draw an arrow chip in the free space at the pill's right end (pill spans x 16–230):
  ```js
  const gv = w.gravity || {x:0,y:0};
  g.fillStyle = si.color; g.beginPath(); g.arc(206, 39, 15, 0, TAU); g.fill();
  if (gv.x || gv.y) { /* white arrow, lineWidth 4, round caps, from (206-gx*8, 39-gy*8) to (206+gx*8, 39+gy*8), 6 px head */ }
  else { g.fillStyle = '#fff'; g.fillRect(198, 37, 16, 4); }  // "still water" bar
  ```
  Optional: while any card has `moving === true`, draw 3 faint chevrons (alpha 0.35, white) on the tray edge the cards travel toward.

### P1-3 "Remember the sea friends!" covers the bottom row during the peek
- **Evidence:** `faces_peek_1280x720.png` and `faces_peek_800x600.png`. On 4-row boards (Summer, Autumn, Winter), the label at y = 470 sits across the faces of the bottom row (cards span y 405–493). This happens during the 2 s the player is meant to memorise them.
- **Fix (`render.js:505`):** move the label below the tray and make it slightly smaller:
  ```js
  const ly = Math.min(526, w.tray.y + w.tray.h + 16);
  this.text(label, w.tray.x + w.tray.w / 2, ly, 22, '#ffe14d', '#123a55', 'center', 6);
  ```
  The tray bottom is 509 on 4-row boards, so the label lands at y 525 on the seabed, clear of every card.

### P1-4 How to Play: broken markup and an unclear "gravity" tile
- **Evidence:** `menu_how_1280x720.png`. The grid has 6 children instead of 4 (logged by `menus.js`). The `.how-grid` `<div>` is never closed, so the keys line and the "OK, let's dive!" button become grid cells: the button sits off-centre in the right column and the keys text is squeezed into the left one.
- **Fix:** in `index.html`, add `</div>` at the end of line 82 to close `.how-grid`. The extra `</div>` on line 85 then closes `.panel` as intended.
- **Same tile (`index.html:82`):** the core-twist tile shows four random sea creatures, which explains nothing. Replace it with four mini season arrows: ↑ pink `#ff8fb8`, • yellow `#ffc23a`, ↔ orange `#ff8a3d`, ↓ blue `#8fd3ff`. Use 22×22 inline SVG chips in the existing `.how-ico.quad` grid, with the season name under each at `font-size:calc(var(--u)*1)`.

---

## P2: should fix (polish that a commercial casual game would have)

### P2-1 The banner sweeps over the deal
- **Evidence:** `sheet_intro.png` frames #9–#12. The deal starts at 1.2 s (`world.js:43 introDelay`). The banner leaves between 1.5 and 1.95 s (`render.js:513-515`). Cards fly up *through* the banner, and the banner slides across the half-dealt board.
- **Fix:** shorten the banner hold. In `render.js:514-515`, use `t < 1.0` (hold) and exit over `(t - 1.0) / 0.35`. In `render.js:122`, change `1.95` to `1.35`. Then set `world.js:43` `introDelay: 1.2` → `1.4`, so the board is clear when the first card lifts off.

### P2-2 The tray is padded twice and collides with the HUD (air meter, "Pairs left")
- **Evidence:** `zoom_airlow.png`, `dead_04.png`, `season_2_mid.png`. On 4-row boards the tray is drawn from y ≈ 85, but the air meter occupies y 78–104 and "Pairs left" is centred at y 86. The tray's corner cuts under the meter.
- **Cause:** `world.tray` already includes `trayPad: 16`, and `render.js:301` adds `pad = 16` again.
- **Fix:**
  - `render.js:301`: `pad = 16` → `pad = 6`. The tray top becomes y 95.
  - `render.js:488`: `y0 = 78, mh = 26` → `y0 = 68, mh = 22`. The meter now spans y 68–90; the HUD buttons end at y ≈ 62.
  - `render.js:496`: AIR label size 14 → 13.
  - `render.js:472`: "Pairs left" y 86 → 84.

### P2-3 Cupcakes hover over the cards for 3–4 s and are eaten about 6 s after the match
- **Evidence:** `cupcake_timing.json` shows 3.2 / 2.9 / 3.8 / 3.9 s over the tray and 5.7–6.0 s until "Yum!". The sheets `sheet_slide_L0/L2/L3.png` (late frames) show the cupcake bubble sitting on top of row-0 or column-0 cards, which hides a card back while the player is choosing. The reward also lands so late that it no longer feels connected to the match.
- **Fix (world tuning, for the mechanics owner):**
  - `world.js:629`: gain `0.3` → `0.9`.
  - `world.js:99`: `cupcakeDrift: 120` → `220`.
  - `world.js:104`: `cupcakeTopY: 110` → `150`.
  - `world.js:657`: Foxy starts fetching as soon as the cupcake leaves the tray, so change `t.x > Z.x1 + 70` → `t.x > (this.tray ? this.tray.x : Z.x1 + 70)`.
  - Target: eaten within ≤ 2 s of the pop.
- **Renderer stopgap (`render.js:386-391`):** while a cupcake's centre is inside `w.tray`, draw it at `globalAlpha 0.7`.

### P2-4 The level-clear celebration is thin and ends with ~0.8 s of empty tray
- **Evidence:** `sheet_clear.png` and `clear_06.png`. There is a text pop, a white flash and a few bubbles. Foxy cheers off to the side, the score jumps without counting, and frames #14–#16 show a dead, empty tray before the next banner.
- **Fix (`render.js:97-102`):**
  - Add 18 hearts from (585, 300) using the existing `heart` fx (speed 120–260, spread over the full TAU).
  - Add 40 sparks in `#ffe14d` and `#ffffff`.
  - Add a gold ring: `{k:'ring', x:585, y:300, max:0.8, color:'#ffe14d'}`.
  - Animate the score as a count-up. In `hud()`, keep `this._shownScore += Math.ceil((w.score - this._shownScore) * 0.15)` and draw `_shownScore`.
  - During `w.state === 'cleared'`, fade the tray out (`globalAlpha = clamp(w._clearT / 0.6, 0, 1)` in `drawTray`) so the hand-over to the next season reads as one motion.
  - Optional (world): steer Foxy toward (585, 300) during 'cleared' so she cheers centre-stage.

### P2-5 "Out of air" has almost no visual
- **Evidence:** `sheet_dead.png` and `dead_04.png`. There is a 25 % blue dim and a 0.25 s shake. Foxy floats up at 40 px/s and barely moves before the panel appears, and there is no message.
- **Fix:** in `render.js:104` (`'dead'`), add `this.texts.push({ text: 'Out of air!', x: 585, y: 280, life: 0, max: 1.4, size: 44, color: '#ffd1d1', big: true })`, plus `this.bubbles(w.fox.x, w.fox.y - 20, 10, 1.4)`. Optionally (world) set `foxSurfaceSpeed` 40 → 110 so she visibly rises.

### P2-6 "Air is low!" overlaps the meter and tray, and is hard to read on Autumn and Summer
- **Evidence:** `zoom_airlow.png`. It is 20 px pale pink (`#ffd1d1`) on golden water, drawn at (820, 130), on top of the meter's bottom edge and the tray corner.
- **Fix (`render.js:96`):** attach it to Foxy, so she "says" it:
  ```js
  { text: 'Air is low!', x: clamp(w.fox.x, 90, 250), y: w.fox.y - 70, size: 24, color: '#ff6b6b', max: 1.8 }
  ```
  Also pulse the meter outline red: in `hud()`, when `low`, stroke the meter pill with `rgba(255,90,90,pulse)` at lineWidth 3.

### P2-7 A custom background removes the underwater feel
- **Evidence:** `custom_ingame.png` and `sheet_custom_title_fit.png`. A beach photo shows as a dry beach with a sun. Only the rays are added, so nothing says "underwater".
- **Fix (`render.js:175-177`):** after `customBg(...)` succeeds, add a water wash: a vertical gradient from `rgba(40,170,210,0.28)` at y 0 to `rgba(10,60,110,0.38)` at y 540. Cache it like `_fogGrad`. Then draw `n + '_rays'` as now. The season's weather particles already sell the motion.

### P2-8 A photo hero is a static sticker and does not feel alive underwater
- **Evidence:** `sheet_custom_fox.png`. The round photo glides with a faint ring. Nothing paddles or wiggles, and it only squashes on eat or cheer.
- **Fix (`render.js:403-412`, inside `if (custom)`):**
  - Add a swim wobble: `g.rotate(Math.sin(this.time * 4.2) * 0.07)`.
  - Add a breathing squash: `sq *= 1 + 0.035 * Math.sin(this.time * 8.4)`.
  - Before the photo, draw two small orange flippers (`#ff8a3d`, ellipse 10×5, outline `#a63c0a` 2 px) at (−cw·0.42, ch·0.32) and (cw·0.30, ch·0.38). Rotate them ±0.5 rad with `Math.sin(this.time * 9)`.
  - Spawn the breath bubbles (`render.js:142`) from the helmet top (`y - ch*0.6`).
  - Do not mirror photos when swimming left (mirrored faces and text look wrong). At `render.js:402`, skip `g.scale(-1, 1)` when `custom`, and use `g.rotate(-0.12 * f.flipX)` as the facing cue instead.

---

## P3: nice to have

| # | Issue | Evidence | Location | Change |
|---|---|---|---|---|
| P3-1 | Flip and mismatch bubbles spawn on the face itself and cover the bottom of the creature | `sheet_flip.png` #3–#6 | `render.js:79`, `:93` | Spawn at `c.y + CH/2 + 6` (below the card) instead of `c.y + 30` / `c.y` |
| P3-2 | Mismatch feedback is only a 0.25 s wiggle; the cards then sit like a normal open pair | `sheet_mismatch.png` #4–#14 | `render.js:346-350` | While the pair is in `w._mismatch`, stroke a `#ff7a7a` 4 px outline at alpha 0.8 (same roundRect as the glow) |
| P3-3 | The renderer ignores `card.rot`, so the deal-in spin designed in `world.js:503` is never drawn | `sheet_intro.png` #10–#12 | `render.js:338` | Replace with `g.rotate(c.rot \|\| 0)`; world `rot` already includes the wiggle |
| P3-4 | "Yum!" and Foxy's helmet poke into the HUD band at the top-left (cupcakes park at y 110) | `fox_22.png` | `render.js:94` | `y: Math.max(130, e.y - 40)`; P2-3 (cupcakeTopY 150) also fixes it |
| P3-5 | Foxy's nose enters the left card column by up to 17 px on the Winter 6×4 board while fetching | `cupcake_timing.json` | `world.js:657` | Covered by P2-3 (fetch from the tray edge) or clamp `foxBounds.x1` to `tray.x - 60` while the tray exists |
| P3-6 | The air meter shows a 20 px red blob even at 0 air | `dead_04.png` | `render.js:492-493` | Draw the fill only when `frac > 0.01`, width `(mw-6)*frac`, radius `Math.min(10, width/2)` |
| P3-7 | "Level N" in the season pill is 12 px (≈10 px at 800×600) | `faces_peek_800x600.png` | `render.js:480` | Size 14, colour `#3f5a74` |
| P3-8 | The toast covers the panel's "Reset all / Done" buttons | `custom_menu_after.png` | `render.js:51` | Show the toast at the top: `toast.style.top = (oy + 70*s)+'px'`, and set `bottom: auto` in `style.css:286` |
| P3-9 | The title icon stays default Foxy after the hero is replaced | `custom_title.png` | `index.html:25`, `ui.js` `show('scrTitle')` | When `hasCustom('hero')`, set `#titleIcon.src = RF.Assets.thumb('hero')` |
| P3-10 | Menu buttons mix system emoji (🖼️ ❓ ⚙️) with flat SVG icons; emoji look different on Windows | `menu_title_*.png` | `index.html:30,32,33,48` | Replace with inline `svg.i` icons (picture, question-circle, gear), as Play and Restart already do |
| P3-11 | Dolphin (grey-blue) and whale (navy) are the closest pair for small kids; both are cetaceans facing right | `cvd_faces.png` | `assets/default/face_10.svg` | Recolour the dolphin body to `#8fa3b8` with a pale-pink belly `#f3d6dc`, to separate it from the navy whale in every CVD mode |
| P3-12 | Autumn tray backing `rgba(52,40,22,0.32)` reads muddy on golden water | `season_2_mid.png` | `render.js:304` | Use `rgba(70,40,10,0.26)` with a warmer edge `rgba(255,220,160,0.25)` |
| P3-13 | Change Pictures at 800×600: the "Whole picture / Round" chips are about 9 px | `sheet_menus_800x600.png` | `style.css:281` | `font-size: max(11px, calc(var(--u)*1.2))` on `.slot .shape button` and `.slot .tag` |
| P3-14 | The How to Play "air" tile uses a pale bubble on cream, which is nearly invisible | `menu_how_1280x720.png` | `index.html:81` | Use a mini air-meter graphic: a pill `#7fe3ff` on `#123a55`, with the bubble at the left |

---

## Slide readability (the core twist): measured
From `ingame_log.json`, one match per level with the pair chosen to cause the most movement:

| Level | Gravity | Cards moved | Peak speed | Overlap frames | Teleports |
|---|---|---|---|---|---|
| Spring 4×3 | up | 4 | 271 px/s | 0 | none |
| Autumn 5×4 | left (seed 42) | 8 | 271 px/s | 0 | none |
| Winter 6×4 | down | 6 | 271 px/s | 0 | none |

- The motion is smooth. The largest per-frame step is 10.8 px per 40 ms.
- Easing: accelerate → cruise → brake, then a soft ~2–3 px overshoot and settle.
- Each line moves as one block, and nothing overlaps or jumps.
- A one-cell slide takes about 0.5 s and a two-cell slide about 0.8 s. That is easy to follow for adults and older kids.
- Possible extra for little ones: Easy could set `slideMaxSpeed: 200`.
- The weak points are the **missing or wrong direction cues** (P1-1, P1-2), not the motion itself.

## Colour-blind check
`cvd_faces.png` shows original, protan, deutan, tritan and greyscale. Every creature has a unique silhouette, so the set still works when colours collapse: under protan and deutan, starfish, snail, turtle and crab all turn olive. Only P3-11 is worth tuning.

## What already looks great
- **The world:** four distinct, cohesive seasons with gentle parallax sway, god-rays, fish schools, jellyfish and sea snow (`sheet_seasons.png`). The season cross-fade is clean.
- **The title screen:** big outlined logo, bobbing badge, Foxy swimming in a live reef and chunky 3D buttons. It reads as a commercial casual game at every size, and the letterboxing is consistent at 1280, 1920 and 800 px.
- **The cards:** the clam-shell back is charming and readable, and the cream fronts give strong contrast. The 0.18 s squash flip is crisp (`sheet_flip.png`), and the match glow, pop, hearts and +10 feel juicy (`sheet_slide_L0.png` #0–#12).
- **The creature set:** cute, consistent line weight, readable at in-game size even at 800×600.
- **Foxy:** appealing character, smooth steering with no teleports, correct facing, and the eat, oops and cheer frames land.
- **The menus:** Settings, Pause, Game Over and Change Pictures share one warm panel style. The custom card back is cropped and rimmed neatly, and the round sticker for a photo hero looks clean in the menu preview.
- **Stability:** no page errors in any capture run.
