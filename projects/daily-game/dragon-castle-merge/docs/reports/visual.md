# Visual QA — Ember's Glow Castle (2026-11-03)

Script: `tests/visual/capture.js` (`node tests/visual/capture.js`, ~3 min, 0 console errors). Every screenshot is in `tests/out/visual/`.
Prefixes: `L1280_` = 1280×720 desktop, `I1024_` = 1024×768 iPad (DPR 2, touch), `P390_` = 390×844 iPhone (DPR 2, touch).
Captured: title, how to play, settings, change pictures, pause, game over, level banner (all three sizes); the four places with a busy board; tier readability on each background plus deuteranopia, protanopia and greyscale checks; Ember's frames; contact sheets for a merge and cascade (50 ms per frame), Boo at combo 5, pumpkins rising, the refused column and the goal light; floating-text pile-ups; and custom photos for hero, item, helper and two backgrounds.

**Overall:** the art is strong and consistent. The lights read well on the dark glass on all four backgrounds, the frames are distinct, the merge has a clear fall, bounce, slide and pop, and Boo reads clearly. Most problems are **text collisions** and **layout clipping at non-16:9 sizes**.

---

## P1 — must fix

### P1-1 Ember's head is cut off on iPad landscape (1024×768, also any 4:3 landscape)
- Screenshots: `I1024_zone0.png`, `I1024_play_bot.png`, `I1024_title.png` (horns and top of the head are off-screen; the bob makes it worse).
- Cause: 4:3 gives a 960×720 view, so `cell` = 81 and `boardY` = 131. Ember is drawn `cell*1.75` = 142 tall with her centre at `emberY = boardY − 0.95·cell` = 54, so her top is at y ≈ −15. The fixed `topLandscape = 128` only works when the view is 540 tall.
- File: `game/js/world.js:279-280` (`computeLayout`).
- Fix: reserve Ember's height in proportion to the cell rather than as a fixed number of pixels:
  ```js
  var top = portrait ? C.topPortrait : C.topLandscape, pad = portrait ? C.padPortrait : C.padLandscape;
  var cell = M.floor(M.min((h - top - pad) / rows, (h - pad - 8) / (rows + 1.85), (w - C.sideMargin) / cols, C.maxCell));
  ```
  (1.85 = `emberAbove` 0.95 + 1.75 × 78/160 + the bob.) This gives 960×720 → cell 78, with Ember's top at y ≈ +8. 960×540 still gets cell 55, so nothing changes there.

### P1-2 Celebration texts are drawn on top of each other and become unreadable
- Screenshots: `L1280_boo_texts2.png` ("Combo ×6!" printed over "Combo ×5!", with "Boo is here to help!" half on top of both), `L1280_boo.png` (frames 1500–2100 ms), `L1280_goal_texts.png` ("+100" goal bonus on top of the merge "+80"), `L1280_goal.png` (goal line on top of "New: Candle!").
- Cause: `say()` only pushes up big texts younger than 0.4 s. A combo text is 0.4–1.5 s old when the next cascade adds another one at the same y (`boardY + 0.9·cell`, the same y as the Boo line). `pop()` never stacks: the merge points and the goal bonus are drawn at `e.y − 0.55·cell` and `e.y − 0.7·cell`.
- File: `game/js/render.js:284-288` (say), `:282-283` (pop), `:250`, `:252`, `:270`.
- Fix:
  1. Give replaceable texts a key, so a new combo text replaces the old one instead of stacking:
     ```js
     say(txt, x, y, col, size, key) {
       if (this._quiet()) return;
       if (key) this.texts = this.texts.filter(t => t.key !== key);
       const K = this._hudK;
       for (const t of this.texts) if (t.big && t.t < 1.2 && Math.abs(t.y - y) < (t.size + size) * 0.62 * K) t.y = y - (t.size + size) * 0.62 * K;
       this.texts.push({ txt, x, y, col, size, key, t: 0, life: 1.5, vy: -18, big: true }); if (this.texts.length > 24) this.texts.shift();
     }
     ```
     Call it as `say('Combo ×'+n+'!', …, 24, 'combo')`, and put Boo's line one row lower: `L.boardY + L.cell * 1.9` (line 252).
  2. Do the same stacking in `pop()`: `for (const t of this.texts) if (!t.big && t.t < 0.5 && Math.abs(t.x - x) < 40 && Math.abs(t.y - y) < size * 1.1) t.y -= size * 1.1;`
  3. In the goal case (line 267-271), skip the `newTier` text for the same tier. In `onEvents`, record `this._goalTier = e.tier` and have `newTier` return when `e.tier === this._goalTier`, or remove the `newTier` say when a `goal` event is in the same batch.

### P1-3 Goal message is wider than the board and runs under both HUD panels (landscape)
- Screenshot: `L1280_goal_texts.png`: "Candle! The castle glows!" spans x 405–875, crossing into the GOAL panel (ends at 423) and the SCORE panel (starts at 858).
- File: `game/js/render.js:269` and `drawFx` `:500-503`.
- Fix: shorten it to `'The castle glows!'` (the light's name is already in the goal panel), and in `drawFx` shrink any big text to fit the board: after setting the font, `const mw = g.measureText(t.txt).width, maxW = this.world.layout.boardW + 40; if (mw > maxW) g.font = '900 ' + Math.round(t.size * sc * this._hudK * maxW / mw) + 'px ' + FONT;`

---

## P2 — should fix

### P2-1 Portrait: Ember clipped at column 0 and board corner knobs clipped at the screen edge
- Screenshots: `P390_over.png`, `P390_over_moment.png` (Ember's left wing is off-screen at col 0); `P390_zone1.png` and `P390_banner.png` (right corner knobs are cut, and the frame touches the screen edge).
- Cause: in portrait the view is 560 wide with `sideMargin` 40, giving cell 104, boardX 20 and frame outer edge ≈ 5. The knob radius `fw·1.1` = 16 goes past the edge, and Ember (182 wide) at colX(0) = 72 starts at −19.
- File: `game/js/world.js:280` (`C.sideMargin`), `render.js:186,218`.
- Fix: use `(w - (portrait ? 96 : C.sideMargin)) / cols`. That gives cell 92, boardX 50, Ember's left edge at +16 and the knobs fully visible. Alternatively, clamp the drawn Ember in `drawEmber` (render.js:419) with `const xd = clamp(x, S*0.45 + 4, this.VW - S*0.45 - 4)` and keep the held light at the real `x`. The layout change is better.

### P2-2 Level banner hides the top two rows of a busy board for 2.6 s
- Screenshots: `L1280_zone2_banner.png`, `L1280_zone1_banner.png`, `P390_zone*_banner.png`. At 94 % alpha it covers rows 5–6, where a stack is about to overflow, right after a level-up (the board keeps its lights).
- File: `game/js/render.js:590-593`.
- Fix: put the banner in Ember's strip instead of over the board, and make it see-through:
  `const y = L.portrait ? L.boardY - L.cell * 1.9 : Math.max(this.ins.top + 60, L.boardY - L.cell * 0.15) - (1 - a) * 16;`, `const h = 78;` and `g.globalAlpha = a * 0.82;`. Also shorten its life from 2.6 s to 2.0 s (lines 298 and 589: `t > 1.6 ? (2.0 - t) / 0.4`).

### P2-3 Blue fireflies (tier 2) and pink fireflies (tier 3) look the same with red-green colour blindness
- Screenshots: `L1280_tiers_deut.png`, `L1280_tiers_prot.png`. Under both, pink #ff7ac8 turns lavender-grey and sits next to sky #5cc8ff. The only cue left is 2 vs 3 tiny bugs at a 47 px item size. Lantern (6) and pumpkin also both turn olive, but their outlines differ enough. Tier 4 (jar) vs 7 (star) and tier 1 vs 5 stay readable because of their shapes.
- Files: `game/assets/default/item_3.svg` (art), `render.js:392-393`.
- Fix (art): make tier 3 clearly a **triangle of 3 larger bugs** filling the 80 px circle (bug radius ≈ 15 instead of ≈ 11, centres at (48,26), (28,62), (68,62)). Change its main colour toward magenta-red `#ff5fa2` with a deep outline `#9c1f5c`, so it goes dark under deuteranopia while tier 2 stays light. Optional extra cue in the renderer: draw a faint tier-coloured socket under tiers 1–3 only, using `g.globalAlpha=.18; g.fillStyle=TIER[t].col; g.beginPath(); g.arc(0,0,s*0.44,0,TAU); g.fill();` before the sprite.

### P2-4 Custom item: tier 4 and tier 7 rings are the same yellow, and tiers 7–8 overflow the cell
- Screenshots: `L1280_custom_play.png`, `P390_custom_play.png`. The Jar ring is #ffd44a and the Star ring is #ffe14d, so they only differ by the pip count (4 vs 7 tiny dots). The moon (k = 1.10) and star rings touch or overlap the neighbouring rings.
- File: `game/js/render.js:383-385`.
- Fix: use a separate ring palette for custom pictures, `const RING = [null,'#b6f04a','#5cc8ff','#ff7ac8','#ffd44a','#ff9a3c','#ff5a5a','#b98cff','#ffffff'];`. Use `k = 0.74 + 0.03 * t` (max 0.98, ring radius ≤ 0.44 cell). From tier 5 up, draw a second inner ring (`g.arc(0,0,ss*0.44,…)` with `lineWidth = s*0.035`) so the higher tiers also differ by shape, not only by colour.

### P2-5 Title screen: the logo badge collides with the demo Ember, and the menu sits on top of the live board
- Screenshots: `L1280_title.png`, `I1024_title.png`, `P390_title.png`. The round icon is drawn on Ember's wing or on the board. The portrait logo touches both screen edges ("Ember's Glow" fills 375 of 390 px), and the demo pieces glow through behind the buttons.
- File: `game/css/style.css:161-162`, `:302-306`, `render.js:306-337` (title draw).
- Fix: hide the demo Ember on the title, either by skipping `drawEmber` when `mode === 'title'` (render.js:329: `if (mode !== 'title') this.drawEmber(g, w, mode);`) or by hiding `#titleIcon`. In `style.css` add `#scrTitle{background:radial-gradient(ellipse at 50% 55%, rgba(24,14,52,.55), rgba(24,14,52,.15) 70%)}`, and in the portrait block use `.logo{font-size:calc(var(--u)*7.6)} .title-wrap{padding:0 14px}`.

---

## P3 — polish

- **P3-1 Zone name and "rise in N" float outside the HUD panels** over busy backgrounds ("Garden Courtyard" over a castle window, "Star Tower" over the planet): `L1280_play_bot.png`, `L1280_zone3.png`. In `render.js:526,532,535,540`, make the left panel 236 tall with `_rise` at `top + 212`, and make the right panel 196 tall with the zone name at `rtop + 176`, so both sit inside their panels.
- **P3-2 "Tap a column…" hint is drawn over the lights** (`L1280_tiers_full.png`, `P390_refuse.png`, where it stays after a refused drop). In `render.js:541,556`, draw it at `L.boardY + L.cell * 0.5` and only while the board is nearly empty: `&& w.items.length < 4`.
- **P3-3 Rising pumpkins are drawn below and over the board frame** for about 80 ms (`P390_pumpkin_rise.png`, 800 ms frame). In `drawItems` (render.js:399), clip to the glass: `g.save(); g.beginPath(); g.rect(L.boardX, L.boardY - L.cell*3, L.boardW, L.boardH + L.cell*3); g.clip(); … g.restore();` (the top is left open for falls and the goal).
- **P3-4 Game over (portrait): the stats line wraps mid-phrase** ("Best combo: / 3", and the line ends with a trailing "·"), and the NEW! badge pokes out of the score box (`P390_over.png`, `L1280_over.png`). Put each stat in `<span style="white-space:nowrap">` in ui.js `showGameOver`, and in style.css change `.new-best{right:calc(var(--u)*-2.2);top:calc(var(--u)*-1.2)}`.
- **P3-5 Change Pictures (portrait): the Whole/Round chips stack into tall full-width buttons** (`P390_scrCustom.png`). In the portrait block, add `.slot .shape{flex-wrap:nowrap} .slot .shape button{flex:1;min-width:0;padding:2px 4px;font-size:12px}`.
- **P3-6 The goal flash washes out the whole screen** (`L1280_goal.png`, 960 ms frame, alpha 0.55). At render.js:268 and :336, cap it at `Math.min(0.35, this.flash*0.6)` for a softer kid-friendly glow.
- **P3-7 "Full!" sits on top of the top light of the refused column** (`L1280_refuse.png`). At render.js:263, draw it above the board instead: `L.boardY - L.cell * 0.25`.
- **P3-8 The `/* theme */` block in style.css:176-178 switches page and canvas backgrounds to blue** (#0f2347 / #1d3a6b), left over from another game. The letterbox and the moment before the first draw show navy instead of the violet palette. Change both to `#1b1438` and `#2a1d55`.

## Passed
- The 8 tiers have distinct shapes and read well on all four places (`*_tiers_zone0..3.png`). The glass panel keeps them clear of the backgrounds. Pumpkins read as blockers.
- Ember's idle/flap/drop/happy/oops frames are distinct and on-model (`*_ember_frames.png`). The refused drop shows oops, a red lane and "Full!".
- Merge motion (`L1280_merge_cascade.png`): the fall, a small bounce, the slide-in and the pop ring all read clearly, and the cascade (2+2→3, then 3×3→jar) with the pumpkin waking and rolling off is easy to follow.
- Boo (`*_boo.png`, `*_boo_carry.png`) enters from the corner, carries lights away with hearts and leaves cleanly. The goal light ascends with a halo.
- HUD panels never overlap the board or the pause and mute buttons at any of the three sizes. Buttons are 44 px or larger on touch.
- Custom backgrounds cover the screen and the board stays readable on top. The custom hero gets wings, and Boo as a photo works.
