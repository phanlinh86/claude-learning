# Visual QA: Pip's Oasis Glow (2026-11-27)

**Captured with** `node tests/visual/capture.js [screens|moments|motion|cvd|custom]`. It wrote 97 images to `tests/out/visual/` (gitignored). The capture freezes real time (`Game.speed = 0`) and steps the sim at 1/120 s, so every frame is deterministic.

**Viewports:** desk 1280×720 (DPR 1), phone 844×390 (DPR 3, touch), iPad 1024×768 and 768×1024 (DPR 2, touch).

**Contact sheets** (JPEG, 0.9 MB in total) are in `docs/reports/img/`:
- `hop_sheet.jpg`
- `tongue_sheet.jpg`
- `dizzy_sheet.jpg`
- `friend_sheet.jpg`
- `pageturn.jpg`
- `overlays_sheet.jpg`: phone banner, phone night, back-row "+20", custom pictures, half-up readability and greyscale night.

All coordinates below are logical stage px (960×540). "Phone" means 844×390, where k = 0.722 CSS px per logical px.

## Summary
The art is warm, cute and consistent, and nothing in it is scary. The "woken" face reads as "huh?", not as fright. Awake and napping friends are easy to tell apart, even at phone size and in greyscale.

The main problems are about timing and overlap:
- The firefly reaches the jar before Pip has landed.
- The chapter banner sits over the back row.
- The HUD jar badge sits on Pip's eyes.
- Some texts and "z" bubbles sit on Pip or on the friends.

---

## P1: fix before release

### 1. The boop resolves at tap time, 0.5 s before Pip lands
**Where:** `world.js:462-470`, with `render.js:177-182` drawing the result.

**What happens** (`hop_sheet.jpg`, `friend_sheet.jpg`): when the child taps, these all fire at t = 0:
- the `boop` event
- the friend's `booped` happy face
- the "+10" text
- the sparkle ring
- the flyer that zooms to the jar

Pip only lands at **t ≈ 0.55 s** for a front-row hole (0.50 s for the back row). His tongue then flicks at **empty paws**. In the 0.05–0.20 s frames you can see the firefly already flying up past Pip while he is still on his way.

**Why it matters:** the story "Pip hops, boops and catches it" turns into "the firefly flies away by itself, then Pip licks a happy friend." A 4-year-old learns from that cause and effect.

**Fix:** keep the scoring decision at tap time (fair), but defer the visible part to `pipLand`:
- the `booped` face, rings, texts and flyer
- the flyer should start at Pip's mouth, (x + 28, y − 40)

Until then, keep the friend in `up` and holding the firefly. If Pip is retargeted mid-air, resolve the earlier target's visuals right away.

### 2. The chapter banner covers the back-row faces and Pip's feet for 1.5 s
**Where:** `render.js:505-528`.

**What happens** (`phone_banner_L2_0.6.png`, `overlays_sheet` top-left): the card is centred at **y = 182** and is 76 high, so it spans **y 144–220**, plus a shadow down to 226 and ribbon tails down to 216. It is fully opaque from 0.3 s to 1.2 s and fades out by 1.6 s.
- **Chapters 3 and 4** (back row y 280, s 0.74): the head top is at 280 − 112·0.74 = **197** and the eyes at about **205–225**. All three back-row faces are hidden. Only ears and chins show, and a firefly holder can pop there during the banner. In the screenshot, the jerboa napper's nightcap and closed eyes, which are the cue to *not* tap, are hidden.
- **Chapter 2** (back row y 315, s 0.84): the head top is at 221, so the eyes are just clear, but the ears are covered.
- **Pip's lily pad** (y 105–167) and his feet (y 132) are under the card in every chapter.

**Fix:** move the card into the empty sky band. Use **y ≈ 86** with h 64, just below the HUD at y 0–70 and clear of the pad, or put it in the bottom band. Shorten the opaque time to 0.9 s. Another option is to hold friends back (no pops) while `banner.t < 1.2`.

### 3. The jar badge sits on Pip's eyes the whole time he is at home (16:9 screens)
**Where:** `render.js:485-501`, with Pip drawn at `render.js:404`.

**What happens** (desk and phone `play_L*`, `phone_half_up.png`): the badge is a disc at (480, 38) with radius R + 3 = **33**, so its bottom edge is at **y 71**. Pip's left eye (art circle cx 89, cy 46, r 15) is drawn at x 487, **y 57–80**. More than half of the eye sits under the 55 %-alpha pill and the jar glass, so Pip looks like he wears the jar as a hat.
- `hudDy()` (`render.js:69`) moves the HUD up only when there is a top letterbox. On iPad 4:3 and portrait the overlap is gone. On phone landscape and desktop 16:9 it stays.

**Fix** (any one of these):
- Move Pip's home and pad down 18 px (HOME y 150, pad 154).
- Shrink the badge to R 24 at cy 32 (bottom edge 59).
- Shift the jar badge to x 600 or so, beside the hearts.

The first is cleanest because it also frees the dizzy stars (P2 item 3).

---

## P2: should fix

### 1. Pop-up texts land on Pip or on the HUD (back-row holes)
**Where:** `render.js:180` and `render.js:186`.

**What happens** (`desk_boop_backrow.png`, `dizzy_sheet.jpg`):
- **"+N":** placed at `max(100, e.y − 150)` and then rises 46. For back-row holes (e.y ≈ 230–260) it spends its life at **y 100 → 54**. That covers Pip's head and touches the jar ring. "+20 ×2" sits exactly on Pip's face.
- **"Shh… napping!":** placed at `max(100, e.y − 120)`. For the back-middle hole it rises from y ≈ 150 to 104, across Pip's pad and his belly.

**Fix:** put boop texts *beside* the friend (x ± 90 s, y = head point − 20), or clamp to y ≥ 180 with no rise when |x − 480| < 120. Draw "Shh" below the friend's chin (y = hole.y − 20 s).

### 2. The tongue is drawn straight through the friend's face
**Where:** `render.js:408-416`.

**What happens** (`tongue_sheet.jpg`): Pip lands on the head point (y = hole.y − 112 s). The tongue then runs from his mouth *down* to the paws at hole.y − 31 s, a 6 px pink line crossing the friend's eyes and nose for 0.18 s. This is a side effect of P1 item 1, since the firefly is already gone.

In addition:
- the mouth origin ignores Pip's squash and tilt
- the line width does not scale with s

**Fix:** once P1 item 1 is done, hide the friend's held firefly at `pipLand` and draw the tongue to it *around* the face (control point offset sideways by 40 s). Alternatively, have Pip land beside the head (+50 s in x) so the tongue points down-left past the cheek.

### 3. The dizzy stars are hidden under the jar badge
**Where:** `render.js:417-422`.

The three sparkles circle (480 ± 30, **y − 96 = 36 ± 8**). That is exactly the jar badge, which is drawn later in `_hud`, so the stars are behind it. Only slivers show in `dizzy_sheet.jpg`. The fix from P1 item 3 solves this; otherwise draw the stars at y − 70 and after the HUD.

### 4. Pool ripples are never visible
**Where:** `weather.js:31`, `weather.js:156`, `render.js:255-256`.

- The ambient ripples spawn in POOL x 405–555, y 130–154.
- The `pipHome` ripples are at (480, 136) with rx ≤ 34 and ry ≤ 10.
- The lily pad is 176×62 centred at (480, 136), i.e. x 392–568, y 105–167.

The pad covers all of them, because `_ripples()` is drawn before `_pad()`. `ripples_sheet` shows 2–3 live ripples and none on screen.

**Fix:**
- Spawn ambient ripples on open water (x 300–390 or 570–660, y 120–160).
- For `pipHome`, draw 2 rings starting at rx 92, larger than the pad, growing to 130.
- Or draw the rings after the pad, clipped to outside the pad ellipse.

### 5. "z" bubbles drift onto the next friend up
**Where:** `render.js:365` and `render.js:368-377`.

They start at (hole.x + 34 s, y0 + 20 s) and travel +22 s in x and −46 s in y. For a front-row napper this ends on the **back-row neighbour's firefly and paws**:
- iPad L1: hole 4 napper → hole 0 friend
- desk L0: hole 3 → hole 0
- L2/L3: hole 6 → hole 3

For a mid-row napper it ends on the neighbour's belly. A child can read that as "that one is asleep too." The navy-and-white "z" stays legible, but it is ambiguous.

**Fix:** start at (hole.x + 46 s, y0 + 34 s), rise at most 28 s, and clip to the friend's own column (hole.x ± 70 s).

### 6. During the page turn, old and new burrows mix
**Where:** `render.js:258`, `render.js:261-262`, `render.js:323`.

**What happens** (`pageturn.jpg`, 0.2 s and 0.5 s): on the old page, which is clipped to the left of the edge, the old chapter's burrow backs show, e.g. 6 spring reed holes. The burrow fronts, though, are drawn per hole in world space with the **new** chapter's key and layout, e.g. 8 palm baskets. Result: baskets pasted half over reed holes at different x positions. The near frame and sky turn correctly.

**Fix** (either):
- Draw the critters and fronts layer twice: the old layout clipped left of the edge, the new layout right of it. Friends are cleared between chapters, so only the burrow fronts are needed for the old page.
- Or pre-render the old layout's fronts into `prev.front`.

### 7. Custom pictures: the "napping" cue is weak and the z placement is wrong
**Where:** `render.js:351-355` and `render.js:365`.

**What happens** (`phone_custom_play_L0.png`, `desk_custom_hop.png`):
- A custom napper is the same photo at alpha 0.75, with no nightcap or closed eyes. On a busy photo background, 0.75 vs 1.0 is hard to see on a phone.
- The z uses the default 150-high box (y0), but the custom image is fitted to 120 and bottom-anchored at bottom − 18 s. So the z float 30 s above the picture and onto the friend behind (see the back-left firefly in the phone shot).

**Fix:**
- Draw a small nightcap triangle (the same SVG cap, if it can be split out) and a navy tint (multiply rgba(60,64,130,.35)) on custom nappers.
- Anchor the z to the custom picture's top-right corner.

### 8. The iPad portrait floor repeat shows hard seams
**Where:** `render.js:122`.

On 768×1024 (`ipadP_play_L2.png`), the floor band (file y 380–540) is repeated every 160 k − 1 px. That leaves two visible horizontal edges at about screen y 735 and 860 (CSS px), where a lighter band meets a darker one. The sky above the stage is also about 40 % of the screen with no content. The sunset sun is cut off, and the cloud streak at the left edge is cut square.

**Fix:**
- Fill below the stage with `info.ground` plus a soft vertical gradient and a few tufts instead of tiling the band.
- Raise the stage (oy factor 0.55 → 0.45).

---

## P3: polish

1. **Title screen, "two frogs" stacking.** The DOM icon `#titleIcon` (rounded square, about 112 CSS px) sits over the demo Pip on his pad. On phone and iPad portrait the frog in the icon overlaps the live Pip's head, so you see two frogs stacked (`phone_title.png`, `ipadP_title.png`). Fix by hiding Pip in title mode, or by giving the title a 0.35 dark scrim behind the logo. On iPad portrait the tagline also wraps to two lines over the pond.
2. **Canvas HUD shows behind the game-over dim.** At game over the canvas HUD (score pill, jar) still draws behind the dim, so the score appears twice. Skip `_hud` when `mode === 'over'` (`render.js:268`).
3. **Ambient night fireflies look collectible.** They are `glow`, rgba(230,255,170). In chapter 4 they drift through the play band (y 260–540) and look like the collectible fireflies, which may tempt taps. Keep them at y < 250 or at the screen edges, or use a cooler green #b8ffcf with no yellow core.
4. **The nightcap loses contrast in greyscale.** In greyscale the cap (#6f86e0) has about the same luminance as the fennec and jerboa fur (`phone_L3_gray.png`). Readability still holds through closed eyes, the z bubbles and the lack of glow and firefly, but a white pom-pom band 2× thicker, or a darker cap (#4a55b8), would make the shape pop for every vision type. Deutan and protan simulations are fine: the cue never relies on hue.
5. **Mid row hides back-row burrows in chapters 3 and 4.** In the centre column (holes 1, 4, 7 at x 480), the mid-row friend's body covers the back-row burrow entirely, and the front friend's ears touch the mid friend's firefly (about 12 px gap at s 0.87). It is still readable. Optional: offset the mid row centre to x 490 and the back row to y 272.
6. **The return hop overshoots the jar band a little.** The return-hop apex is at about y 112, which is fine. With the custom hero, the 6 px green ring (radius about 53) reaches y 30 at the apex and brushes the jar badge (`desk_custom_hop.png`). Cosmetic.

## Checked and OK
- **Awake vs napping at phone size:** the nightcap, closed "^^" eyes and z show by h ≈ 0.45, while the firefly (at friend-local y 94) is still under the rim. The child sees the cue before the firefly (`phone_half_up.png`).
- **Gold firefly:** reads as special at 40 px (crown plus sparkles, warmer glow at 9 Hz).
- **HUD contrast:** white on the pill is OK in all chapters:
  - sunset pill rgba(80,36,60,.55) over #eea58e gives about 6:1
  - night pill rgba(20,18,50,.6) gives about 12:1
  - spring and palms about 5:1

  The ×2 in #ffe27a is fine. The empty heart is pale but distinct.
- **Letterbox:** filled with scenery on every viewport (sky cover, foliage quarters in the corners, tiled floor), except the iPad portrait seam (P2 item 8).
- **Motion:**
  - The hop is a clean parabola with a stretch in flight and a squash on landing (1.0 → 0.16 over 0.17 s).
  - The return hop is higher and slower.
  - The pop rise has a small overshoot (h 1.04) and settles by 0.16 s.
  - The booped wobble is a damped cosine.
  - The tumbleweed rolls without slipping: about 70 px/s at ω ≈ 4.5 rad/s, so r ≈ 15.5, which matches the 30 px sprite.
  - The night ambience (14 glows, 8 twinkle stars) is calm.
- **Nothing scary:** the woken face is "o-mouth, big eyes". The dizzy swirl eyes are friendly. The shake is 0.22 s at 24 px max.
- **Screens:** how to play, settings, customise and pause are all legible at phone size. The customise grid fits at 844×390 (the "The Morning Sp…" label is truncated, which is acceptable).
- **Console:** no errors during capture.
