# Kit's Toybox Beat: visual QA / art direction report

Date: 2026-11-01. Tool: `tests/visual/capture.js` (Playwright, frozen game clock advanced by hand, so frames are exact).
Run `node tests/visual/capture.js [screens tods boss bursts trans cvd custom measure]`. The script writes its output to `tests/out/visual/` (190 files plus `metrics.json`).
Sizes: desk 1280×720; phoneP 390×844 DPR3 with touch; phoneL 844×390 DPR3 with touch; iPad 1366×1024 DPR2 with touch.
There were no page errors in any run.

Overall: the art is charming and consistent. Kit, Baron Fluff, the toys and the four rooms all read well, and the night room with glowing coins is the strongest scene. Coin rolling and rotation look physically right (rotation = distance / radius, CCW while rolling left). Pillows follow a clean arc and the "oof" frame lands. The problems below are mostly about layout and overlap, not the art itself.

---

## P1 (fix before release)

### P1-1 The count-in numbers are drawn on top of the level banner, every level
- Evidence: `scr_*_count2.png` and `trans_desk_clear.png` (frames "ready L1"). The "3", "2" and "1" sit right on the banner title ("D2n", "M3n").
- Why: the banner lives for 2.2 s (`render.js:297`). The count-in clicks at about 0.7 / 1.4 / 2.1 s at 84 BPM (and sooner at faster tempos), so all three numbers fall inside the banner's life. The count is drawn at `y = max(top+hudH+50, (coinY0-110+top+hudH)/2+20)` (`render.js:581`), which is the banner title line (banner `cy-12`, `render.js:636-640`). The x position `ringX+(VW-ringX)*0.35` is also the banner's centre.
- Fix (choose one):
  - (a) Draw the count **inside the banner** in place of the hint once the count starts: when `this.count` is set, replace `hint` with a big "3 · 2 · 1" row at `cy+26`.
  - (b) Move the count onto the play band: centre it on the **upper ring** (`x = L.ringX + 90`, `y = L.coinY[0] - 70`) so the child looks where the coins will arrive.
  - (c) Shorten the banner to 1.4 s when `w.state==='ready'`, and start the count text below the banner (`y = cy + 92`).
  - (b) is the best for the gameplay. Keep the banner but fade it to 50 % alpha while `this.count` is set.

### P1-2 Baron Fluff hides under the Pause/Mute buttons (landscape and iPad) and on top of the window and "Here comes…" text (portrait)
- Evidence: `boss_desk_dawn_bounce.png`, where the top of the balloon is behind the Pause button at CSS (1130-1190, 15-80). Also `sheet_boss_desk.png`, `sheet_boss_ipad.png`, and `sheet_boss_phoneP.png`, where he is wedged into the window's top-right corner on top of the curtain rod and the "Here comes Baron Fluff!" text runs into him.
- Why: `render.js:98` sets `boss.y0 = top + FLUFF[1]*0.5` (= 134 logical on desk), but the anchor is the **basket centre**. The balloon top is 160×0.7 = 112 px above that, so it ends at y ≈ 22, which is inside the HUD row (0-76). `x1 = VW - I.right - 70` is right under the button group (`_hudBtn.l` ≈ 850 logical on desk).
- Fix:
  ```js
  const top = I.top + hudH;
  const btnL = this._hudBtn ? this._hudBtn.l : VW - 120;
  const boss = { x0: VW*0.55, x1: Math.min(VW - I.right - 70, btnL - 10),
                 y0: top + 112 + 8,                       // balloon top clears the HUD
                 y1: Math.max(top + 120 + 10, laneY[0] - 48) };  // basket bottom (+25) stays above the shelf
  ```
  - Portrait: hover beside the window, not on it. Use `x0 = win.x + win.w + 10` when that leaves ≥ 60 px; otherwise hover **below** the window (`y = win.y + win.h + 112`), where there is 150-250 px of empty wall (`scr_phoneP_play.png`).
  - Move the "Here comes Baron Fluff!" text (`render.js:254`) to `y = laneY[0] - 150` or put it in the banner style, so it never overlaps him.
  - Note: `bossXY()` is computed before `_measureHud`, so call `computeLayout` again after `_measureHud()` in `resize()` (`render.js:70` and `render.js:76`).

---

## P2 (important polish)

### P2-1 iPhone portrait: the play band is tiny and about 70 % of the screen is empty wall or floor
- Evidence: `sheet_tods_phoneP_*.png` and `scr_phoneP_play.png`. The CSS scale is 0.696 (`metrics.hud_phoneP`): Kit is 67 CSS px, a coin is 28 CSS px, a ring is 50 CSS px, and the pillow is 33×25 CSS px (`sheet_boss_phoneP.png` mid-air frames). The lanes sit at 0.49 and 0.67 of the height. The floor below (y > 0.72) and the wall above the window are empty.
- Fix: in portrait, scale the gameplay sprites by `P = 1.35`. That gives KIT 130, COIN 54, RING 97, PILLOW 65×49, FLUFF 150×188 and COIN_LIFT 24, by multiplying the constants in `render.js:20-21` through a `this.gs` factor set in `computeLayout`. Also move the lanes to `[0.52, 0.76]·VH` (`render.js:85`) and keep the floor toys at ≤ 120 (`render.js:203`, currently 170 in portrait).
- Alternative: use portrait `VW = 440` instead of 560 (`render.js:48`), which makes everything 1.27× larger for free. Check that the HUD still fits.

### P2-2 Coins have almost no luminance contrast with the walls and floors (only the outline carries them)
- Measured (`metrics.contrast_*`): the coin's mean colour is `#d39e28`. The WCAG luminance ratio of the coin against the mean background behind its path:

  | Level | Upper lane (wall) | Lower lane (floor) |
  |---|---|---|
  | Dawn | 1.35 | **1.00** (`#c0a08d`) |
  | Noon | 1.43 | **1.03** (`#bea687`) |
  | Sunset | 1.22 | 1.27 |
  | Night | 3.12 | 2.45 |

- On screen the coins still read thanks to the 3 px dark rim and the hue. Under deuteranopia/protanopia (`sheet_cvd.png`) the yellow coin and the dawn and noon floors become the same khaki, and the coin is then carried by the outline alone.
- Fix (render-only, cheap):
  - In `drawCoin` (`render.js:401`), before the sprite, draw a contact halo: `arc(x, y, s*0.56)` filled `rgba(60,30,20,.28)` on day levels, plus a 2 px `rgba(255,255,255,.75)` stroke at `s*0.53`. The coin then gets a light and a dark edge on any background.
  - Darken the lower track bed a little in `background()` (`render.js:210-212`): a band `fillRect(0, y-34, VW, 40)` with `rgba(70,40,30,.12)` on day levels, so the floor behind the coins is below the coin's luminance.
  - Optional art change: lighten the coin face towards `#ffd84a` (mean luminance up about 25 %).

### P2-3 The "reach" frame is never seen on a Perfect catch, and Kit arrives late on lane switches
- Evidence: `burst_desk_catch.png`, where the frames go idle → idle → **happy** with no reach. `burst_desk_laneswitch.png`: the coin is caught at t = 26.443 while Kit is still at `pos 0.79`. She reaches the upper lane about 75 ms later, so the coin visibly flies down to her mid-flight.
- Why: `world.js:563` checks `happy` before `reach`, and a Perfect sets `happy` immediately.
- Fix:
  - In the frame rule, show reach for the first 0.08 s even when happy: `k.reach < 0.08 ? 'reach' : k.happy > 0 ? 'happy' : …`. Or apply it in render only, by picking `kit_reach` when `k.reach < 0.08`.
  - On a tap that changes lane, ease faster: about 0.05 s instead of 0.09 s.
  - In `drawFly` (`render.js:542`), aim the coin at `L.coinY[lane]` rather than Kit's current y. The ring then "hands" the coin to Kit's arriving paw.

### P2-4 Losing all groove has no "rocket sputters" moment
- Evidence: `trans_phoneP_over.png`. From the `dead` event to the game-over panel (1.6 s), Kit keeps hovering with a full flame and an idle face. Only the white flash and the "Out of groove!" text show what happened.
- Fix: in `drawKit` (`render.js:482`), while `w.state==='dead'` or `KB.Game.deadT>=0`:
  - flame scale `fk *= max(0, 1 - deadT/0.6)` with a flicker (skip frames);
  - frame `kit_dizzy`;
  - Kit sinks gently to the floor: `y += easeOutBounce(min(1, deadT/0.9)) * (L.laneY[1] + 10 - y)`;
  - 3 grey `puffs` from the nozzle at 0.2 / 0.4 / 0.6 s.
  - The tone stays soft and funny, not hurt.

### P2-5 Menu text is too small on iPhone
Computed sizes on phoneP (390 wide):

| Element | Size |
|---|---|
| Game-over `.stats` (Perfect, Good, Miss, Best combo…) | **8.8 px** |
| `.medal-name` | 9.7 px |
| `.new-best` "NEW!" | 7.9 px |
| `.sc span` ("Score", "Best") | 12.1 px |
| `.set small` ("for wireless headphones") | 9.75 px |
| Change Pictures `.slot .shape button` | 11 px |

- Fix: add to `style.css`, in the `@media (pointer:coarse)` block (`style.css:249`):
  ```css
  .stats{font-size:max(13px,calc(var(--u)*1.45))}
  .medal-name,.sc span{font-size:max(13px,calc(var(--u)*1.6))}
  .new-best{font-size:max(11px,calc(var(--u)*1.3))}
  .set small{font-size:max(11px,.65em)}
  .slot .shape button{font-size:13px}
  ```

### P2-6 iPhone landscape: the Settings panel scrolls and "Done" is cut off
- Evidence: `scr_phoneL_settings.png` and `metrics.panels_phoneL.scrSettings.scroll = true`. The panel is 318 px tall in a 390 px viewport, and the Done button is clipped at the bottom.
- Fix: under `@media (max-height:430px)`:
  ```css
  .settings{gap:4px}
  .set{padding:4px 12px;min-height:40px}
  .panel h2{margin-bottom:4px;font-size:calc(var(--u)*3.4)}
  .menu{margin-top:6px}
  ```
  Or lay the settings out in 2 columns (`.settings{display:grid;grid-template-columns:1fr 1fr}`).

### P2-7 HUD text on phones is under 12 CSS px
- Evidence: `metrics.hud_phoneP`: the combo text and the level name ("Dawn") are 11.8 CSS px, and the groove bar is 11.1 px tall. The score is fine at 22.3 px. On phoneL they are 12.3 px.
- Fix: raise the floor of `_hudK` (`render.js:69`) to `clamp(0.95 / v.s, 1, 1.7)` so they come to about 14 px. The combo multiplier colour `#ff9de2` (×4) is weak on the 34 % plate over the dawn and sunset walls: make the plate `rgba(30,25,60,.5)` (`render.js:590`).

### P2-8 A custom photo wallpaper competes with the coins and tracks
- Evidence: `custom_desk_play.png` (night): a busy, saturated photo shows full-strength behind both lanes. The current calming is a 14 % white wash only (`render.js:156`).
- Fix: after drawing the photo, apply `g.filter='blur(2px) saturate(.75)'` when the browser supports it (fall back to none). Then wash it with the time of day's wall colour at 35 % (`TOD_INFO[b].wall`, alpha .35); on night use `rgba(20,24,60,.45)`. Draw the photo over the wall area only (`0..floorTop`), and keep the floor art so the lower track sits on boards.

---

## P3 (nice to have)

1. **Judgement words graze Kit's ears.** In 72 of 303 sampled frames (24 %, all sizes; `metrics.overlap_*`), the "Perfect!" box touches Kit's 96 px sprite box. Example from desk: word box (189, 337, 107×26) against Kit (110, 316, 96×96). The real overlap is the right ear tip at about 3-8 px. Words never cover a ring (0 hits) and "+N" never covers Kit (0 hits).
   - Fix: `x: x + 44` instead of `x + 30` for the judgement words (`render.js:240` and `:247`), and `x + 110` for "+N".
   - "Poof!" (`render.js:268`, `y = ky-70`) sits on the dizzy sparkles: use `ky - 84`.
2. **Missed coins roll through Kit's body** at full opacity (`burst_desk_miss.png`, t = 28.093-28.193). Fade from `n.time` rather than `tDone` (`render.js:443`). Or better, let the coin bump the ring rim and drop off the track: `y += k*k*40` with a small spin. Kit could show 0.25 s of `dizzy`-lite (ears down). Today she does not react at all.
3. **Low groove relies on colour plus blinking.** Under deuteranopia the red `#ff6b6b` and the amber `#ffc53d` both look yellow (`sheet_cvd_hud.png`). Add a shape cue below 25 %: shake the fuel-can icon ±2 px on each beat, or draw a "!" bubble next to it. Judgement words, gold coins (heart and rainbow ring) and pillows all differ in shape or text, so nothing else depends on colour alone.
4. **Crossfade ghosting.** During the 0.9 s dissolve (`trans_desk_clear.png`, fade 0.28-0.78), toys from both rooms show at once in the same spots (rocking horse and robot, drum and rings toy), and the mid-blend of pink and mint looks washed out. Pick the floor toys without the `(i + b)` rotation (`render.js:206`) so they stay put, or wipe left to right with a soft edge instead of an alpha blend.
5. **The custom hero looks static.** The bob is ±3 px and the squash ±2 % (`render.js:488` and `:503`). The 8-frame strip (`custom_desk_alive.png`) shows almost no motion. Use a bob of ±5 px and a squash of 1 ± 0.05 on the beat for custom heroes. Also draw a small rocket (the red body, 20×34) behind the custom picture so the flame has a source.
6. **The "Picture saved on this device!" toast stays into gameplay** for up to 2.2 s, over the floor lane (`custom_desk_play.png`). Call `KB.UI.toast` hide in `startGame()` (`main.js:100`).
7. **The portrait title is busy.** The logo and icon sit on the window. The tagline runs edge to edge (left 0, right 390). The demo game's "Perfect!" and Kit show between the buttons (`scr_phoneP_title.png`). Fixes:
   - `.tagline{padding:0 16px}`;
   - dim the canvas under the title screen (`.screen#scrTitle{background:rgba(40,30,70,.25)}`);
   - place `.title-wrap` lower so the window shows above the logo (portrait `margin-top:12vh`).
8. **Change Pictures on phones.** The "★ Your picture" tag renders at 16 px over 2 lines and makes the cards taller (`custom_phoneP_screen.png`). Use `.slot .tag{font-size:12px;white-space:nowrap}`. Also, the hero, coin and pillow default to "Round" after a pick, but the coin with a transparent PNG chose "Whole picture". That is fine, but say so in the tag.
9. **Pillows are small and pale in flight**: 48×36 lavender on the noon mint and dawn pink walls (`burst_desk_pillow.png`). Draw them at 1.2× while in the air, with a soft drop shadow (`shadowBlur 6`, `rgba(60,30,60,.3)`). The dotted aim line is good. Keep it.
10. **Emoji icons are missing in headless Linux** (🖼️ ⚙️ ❓ in `sheet_screens_desk.png`). They render on iOS and Windows. For full control, replace them with inline SVGs like the Play button.

---

## Checked and OK
- Every screen at every size fits without overflow. The only exception is the phoneL Settings scroll (P2-6). Every button is ≥ 44 px tall on touch, except `.seg`/`.slot` buttons at 34 px, which is acceptable inside panels.
- Touch hint chips show at the right edge on levels 1-2 at all touch sizes and stay clear of the coins.
- Times of day: every wallpaper, window sky and ambient effect is distinct (dawn shaft, noon bubbles, sunset fluff, night projector stars and night-light). Easy and Normal look the same apart from the timing, which is by design.
- Pillow lob: the arc and the pink pulse on the target ring read well; bounce-back plus the "oof" frame and "Bop! +250" work; the poof shows white puffs, the dizzy frame and sparkles. The feathers are hard to see on the white puffs, so tint the feathers `#fff4fb` with a 1 px `#c9a0c0` edge.
- Gold coin: the heart, the rainbow rim and the pink pulse ring all stay distinct under deuteranopia and protanopia.
