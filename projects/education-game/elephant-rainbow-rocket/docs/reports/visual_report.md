# Bim's Rainbow Rocket: visual QA report (2026-11-02)

**Scope.** I captured about 320 frames and kept 55 of them in `docs/reports/visual/`, at 1× CSS size.
- **Devices:** iPhone 393×852 @3 in portrait and landscape, iPad 820×1180 and 1180×820 @2, plus iPhone SE in landscape (667×375).
- **Safe areas:** I emulated notch and home-bar insets (`--sa-*` on `#safeProbe`). Dynamic Island phones got 59/34 px in portrait and 59/59/21 px in landscape. The iPad got 24/20 px. The unsafe zones show as a light red band in the shots.
- **Languages:** en and vi.
- **Coverage:**
  - every screen: title, settings, banner, ask, aim, fly, land, collect, boostReady, boost, pause, Talk, chapter stars, moon party;
  - the 4 times of day;
  - all 20 age × topic pairs (ages 3–7, ask frame of round 4, hop 2) on iPhone in portrait and landscape and on iPad in portrait;
  - one bot run at normal flow, so the transitions were not stepped by hand.

**Tools:** all scripts are in `tests/visual/`.

| Script | What it does |
|---|---|
| `rr_lib.js` | Freezes or steps the world and plays real `pointerDown` taps. Also measures geometry and samples the sky. |
| `rr_capture.js` | Captures sections `screens`, `chapters`, `topics` and `short`. |
| `rr_natural.js` | Runs the bot at speed 6 and captures boost, Talk, levelDone, night and party. |
| `rr_analyze.js` | Checks overlaps, hit sizes, bubble fit and contrast. Output: `tests/out/visual/analysis.txt`. |
| `rr_palette_cvd.js` | Computes ΔE00 under deuteranopia and protanopia (CVD) for the colour rows that are really generated. |

**Units.** "lp" means logical px (720 px short side). On the iPhone, 1 lp = 0.546 CSS px; on the iPad, 1 lp = 1.14 CSS px.

**Passes (no action needed):**
- **Placement.** No island or token sits under the HUD or the speech bubble, and none leaves the safe area, in any of the 120 ask frames.
- **Bubble text** never overflows, in either language. The longest Vietnamese prompts wrap to 2 lines at 20 px on phones and 30 px on iPad.
- **Island hit areas** are 180–240 lp: 98–131 CSS px on phones and 205–228 CSS px on iPad. The SE landscape minimum is 94 CSS px.
- **Pause buttons** are 64–78 CSS px tall. Talk choices are at least 90×110 CSS px.
- **Pictures read well:** shapes, letters (upper and lower case), animals and the dice stars up to 10.
- **Night:** the planets look lovely, with good colour contrast (yellow 9:1, green 5.6:1, blue 3.8:1, red 3.1:1 against the night sky).
- **Title screen** is well composed in both orientations and both languages.

---

## P1: must fix before shipping

### P1-1. Numbers 11 and up are unreadable: the star strip covers the numeral (ages 6–7: add, sub, odd/even, counting to 12)
- **Shots:** `visual/topics_iphoneP-en-a7-add.png` (15, 21, 20 and 18 all hidden), `visual/topics_iphoneL-en-a7-oddeven.png` ("12" and "13" show as "1?"), `visual/topics_iphoneL-vi-a7-sub.png`.
- **Measured:** in `sky_art.js` `paintToken` (`number`), the badge circle has radius `R = 0.34·size` with its centre at `−size + R`. The star strip is drawn on top, from the token bottom upwards. Its height is `ph = rows·st·1.02 + 0.35·st`, with `st = min(0.2·size, …)`.
  - For n ≥ 11 there are 3 rows, so `ph ≈ 0.68·size` while the badge sits in the top 0.70·size. The badge is 85–95 % covered.
  - The strip also caps at 12 stars (`Math.min(12, …)`), so 15 and 21 both show 12 stars. That is a wrong count on screen.
  - In the a7 add/sub/odd-even rows, 4 out of 4 tokens were unreadable at 11–21.
- **Cause:** `content.js` marks tokens that should show stars with `showStars` (count-up only), but `sky_art.js` decides with `token.n != null && n > 0`, which is true for every number token.
- **Fix:**
  - In `game/js/sky_art.js` (around line 433), change it to `hasStars = !!token.showStars && +token.n > 0 && +token.n <= 10`.
  - Also cap the strip at 2 rows and draw it *before* the badge, so a badge is never covered.
  - Re-check `tokenBox('number')` so it does not reserve star room when there are no stars.

### P1-2. At night in landscape, the planet straight above the rocket sits on the rocket's nose and canopy (iPhone and iPad)
- **Shots:** `visual/chapters_ipadL-count-L3.png`, `visual/topics_iphoneL-en-a3-animals.png`, `visual/topics_iphoneL-en-a7-oddeven.png`, `visual/chapters_iphoneL-colors-L3.png`.
- **Measured:** this happens in **every** night (chapter 4) landscape frame where an island lands in the rocket's column.

  | Frame | Planet body overlapping the rocket box |
  |---|---|
  | iPhone L, age 3 animals | 126.7 × 37.3 lp (≈ 20 CSS px) |
  | iPhone L, age 4 animals | 114.8 × 37.9 lp |
  | iPhone L, colours | 44.6 × 48.9 lp |
  | iPhone L, odd/even | 100.9 × 24.2 lp |
  | iPad L, count | 126.7 × 39.7 lp (≈ 45 CSS px) |
  | iPad L, shapes | 85.5 × 40.9 lp |
  | iPad L, colours | 91.6 × 40.8 lp |

  The planet's ring crosses Bim's helmet. The rocket's tap area (aim or poke Bim) and the island's tap area overlap there, so the child's tap is ambiguous.
  - Portrait and daytime clouds were never affected: a cloud is 0.55·w tall, a planet 0.8·w.
- **Cause:**
  - In `world.js` `_placeRow`, the island over the rocket must stay above `lim = padY − rocket.h − ih − rocketGap`, which is ≈ 214 lp on iPhone L at night (ih = 160).
  - `keepMin()` then pushes it *down* below the keep-out boxes. That is ≈ 154 + ts(100) + margin ≈ 265 lp, and `keepMin` wins.
  - The keep-out is large because `main.js` `measureHud()` merges the HUD and the bubble into **one** box spanning x 122 → 1442 lp (`hudKeep = {x:122, w:1320, h:145–154}`). That blocks the whole top band, including the free gap between the bubble and the HUD.
- **Fix:**
  - **(a)** In `main.js` `measureHud()`, return the HUD and the bubble as two boxes (`world.hudKeeps = [hud, bubble]`) and push both in `_placeRow`.
  - **(b)** In `_placeRow`, when `keepMin(x) > lim` for an `overRocket(x)` slot, discard that slot layout (choose a split that keeps no island in the rocket column, or shift the row sideways by `iw/2 + rw/2 + 10`).
  - **(c)** Optionally, scale planets to `planetFrac 0.7` in landscape.
  - Add a regression check: in `rr_analyze.js` the "island overlaps rocket" count must be 0.

### P1-3. In the iPhone portrait moon party, Bim is completely hidden behind the "You did it all!" panel
- **Shots:** `visual/natural_iphoneP-done.png` (you only see a faint Bim through the 94 % cream panel).
- **Measured:**
  - The panel covers CSS y 288–648, which is 528–1187 lp.
  - Bim is drawn at `by = 0.52·H` = 812 lp, with `bh = min(0.26·H, 300)` = 300 lp. So Bim spans y ≈ 524–812 lp, which is **100 % under the panel**.
  - The party's hero is missing on the main device. The iPad portrait is fine: the panel starts at 596 CSS px and Bim is above it.
- **Fix:**
  - In `game/js/render.js` `_doneScene`, for portrait use `by = min(H·0.52, panelTopLp − 12)`. Main can pass `#scrDone .done-panel` `getBoundingClientRect().top` converted to lp in the draw options. A simpler option is `by = H·0.36` with `bh = min(H·0.2, 260)`.
  - Alternatively, in `style.css`, set `@media (orientation: portrait) { #scrDone { padding-bottom: calc(var(--sa-b) + 8vh) } }` and put Bim above the panel.

---

## P2: should fix

### P2-1. The bubble keeps saying "Tap the rocket!" after the boost, through Talk time and the chapter-stars banner
- **Shots:**
  - `visual/screens_iphoneP-en-11-boost-late.png`: the rocket is already inside the cloud bank, but the bubble still says "Ready? Tap the rocket!".
  - `visual/natural_iphoneP-levelDone.png`: the "Stars × 13" banner sits under "Ready? Tap the rocket!".
  - `visual/natural_iphoneL-talk.png`.
- **Measured:** the natural bot run read `#bubbleText` at each state:

  | State | Bubble text |
  |---|---|
  | `boost` | "Tap the rocket! Blast off!" |
  | `talk` | "Ready? Tap the rocket!" |
  | `levelDone` | "Ready? Tap the rocket!" |

  The bubble was visible each time (no `hidden` class). A child who taps the rocket at that point gets nothing.
- **Fix:** in `game/js/main.js` `onEvent`:
  - on `boost`, call `RR.UI.say(T('boostGo'))` or `RR.UI.say('')`;
  - on `talk` and `levelDone`, call `RR.UI.say('')` (the chapter banner and the Talk panel carry the text);
  - on `level`, keep the topic name.

### P2-2. Moon party in landscape: the panel covers 4–5 of the 8 friends (iPhone), and Bim stands on the kitten (iPad)
- **Shots:** `visual/natural_iphoneL-done.png`, `visual/screens_ipadL-en-15-done.png`.
- **Measured (iPhone L):**
  - The panel covers CSS x 389–781, which is 713–1431 lp.
  - The friends are spread over x 395 → 1165 lp, at a step of 110 lp. That puts the pig, sheep, duck, lion and frog (x 725–1165) under the panel.
- **Measured (iPad L):** Bim is at `bx = 0.16·W` = 166 lp and friend 1 is at 133 lp, so their sprites overlap by about 60 lp.
- **Fix:**
  - In `render.js` `_doneScene`, in landscape, set the friends' range to `x0 = bx + bimW/2 + 24` and `x1 = panelLeftLp − 24` (pass the panel rect from `main.js`). Shrink the step: `step = min(110, (x1 − x0)/n)`, `s = min(90, step·0.95)`.
  - Alternatively, put the friends in 2 rows of 4 to the left of the panel.

### P2-3. Answer colours are below the DESIGN §3 "≥ 3:1 or dark outline" rule against the day skies; yellow and green are worst at sunset
- **Shots:** `visual/chapters_iphoneP-colors-L0.png` (morning), `visual/chapters_iphoneP-colors-L2.png` (sunset), `visual/screens_iphoneP-en-04-ask.png`.
- **Measured:** WCAG contrast of each island against the median of 12 sky samples around it (with islands and particles removed and the frame redrawn):

  | Colour | Morning / noon (base · dark outline) | Sunset (base · dark outline) | Night (base) |
  |---|---|---|---|
  | yellow | 1.1–1.2 · 2.0–2.1 | 1.4–1.5 · **1.2–1.3** | 9.0 |
  | green | – | **1.1** · 2.3 | 5.6 |
  | orange | 1.6 · 3.1 | – | – |
  | red | 2.9 · 5.3 | 2.1 · 3.9 | 3.1 |
  | blue | 2.6 · 5.2 | – | 3.8 |
  | purple | 2.4–2.5 · 4.7 | 1.8 · 3.5 | – |

  Hue still separates them for typical vision, so this is not a P1. But yellow and green lean on hue alone, and the dark outline of yellow (`#C99A12`) does not lift them to 3:1.
  - At night the dark outlines fade (1.6–1.9:1), but the bases are bright, so night is fine.
- **Fix:** in `game/js/sky_art.js` `drawIsland` (colour islands, moods 0–2):
  - add an outer 3 px ink ring `rgba(51,54,79,.55)` (≈ 4:1 on every day sky), plus the existing soft drop shadow;
  - or darken `COLORS.yellow.dark` to `#9A7400` and `COLORS.green.dark` to `#1F6B35`.
  - Re-run `node tests/visual/rr_capture.js chapters && node tests/visual/rr_analyze.js` and require `dark med ≥ 3`.

### P2-4. On iPad portrait the morning sun sits right behind the island row, beside the orange or yellow island
- **Shot:** `visual/screens_ipadP-en-04-ask.png`: the sun peeks out from behind the orange island in a colour question. A child may read it as a "yellow" target.
- **Measured:**
  - `render.js` `_sky` puts the sun at `ky(0.16) = 0.16·H + 230` (portrait `drop`), which is 396 lp on iPad P (H = 1036). Its 180 lp disc covers y ≈ 306–486 lp.
  - The island tops of the row are at `rowTop` ≈ 461–466 lp.
  - On iPhone P (H = 1561) the same formula gives 480 lp, well above the row at 650 lp, so the phone is fine.
  - At sunset on iPhone portrait, the low sun sits behind the rocket and canopy: `visual/topics_iphoneP-en-a5-letters.png`, `visual/chapters_iphoneP-colors-L2.png`.
- **Fix:** in `render.js` `_sky`, clamp the sun and moon: `ky = v => clamp(H·v + drop, top + 70, L.rowY − L.islandH − 120)`. At sunset, keep `sunX` away from the rocket's x, or draw the sun at 0.6 alpha behind the background clouds.

### P2-5. The HUD vanishes into the cloud bank during the boost (white on white)
- **Shot:** `visual/screens_ipadL-en-10-boost.png`: the star pill and the pause button lose their outline. Only the "II" glyph and the "1" stay visible.
- **Measured:**
  - `.hud-stars`, `.hud-dots` and `.icon-btn` use `rgba(255,255,255,.85/.6)` with only a 3 px drop shadow at 12 % black.
  - Against the cloud bank (`#FFFFFF`–`#EEF0FA`), the button edge contrast is about 1.05:1.
  - The pause button is the child's and parent's only way out during the 2 s boost.
- **Fix:** in `game/css/style.css`, give `.hud-stars, .hud-dots, .icon-btn` `border: 3px solid #bfd8ee` (the bubble's border) and `box-shadow: 0 3px 0 rgba(40,60,110,.25)`.

---

## P3: polish

1. **The bubble's tail points left into nothing.**
   - The `::before`/`::after` arrow sits at `left: −16px` and points at the left screen edge or notch, while Bim is in the rocket at the bottom or centre (all ask shots).
   - **Fix:** in `style.css` `.bubble::before/::after`, move the tail to the bottom edge (`top: 100%; left: <rocket x>`) and set `--tail-x` from `placeBubble()`. Alternatively, remove it.
2. **The iPad speech bubble is mostly empty.**
   - It is 651–765 × 139–141 CSS px for one line of 30 px text (`visual/screens_ipadP-en-04-ask.png`, `visual/chapters_ipadL-count-L3.png`).
   - **Fix:** use `min-height` instead of a fixed height (`ui.placeBubble`), or a 36–40 px font on iPad (`@media (min-width:768px) and (min-height:700px)`).
3. **Bim is small in the cockpit on phones.**
   - The rocket is 104 CSS px tall on iPhone L and 124 on iPhone P, so Bim's face is ≈ 35–45 CSS px. It is visible but small next to 100 px islands.
   - **Fix:** `CONFIG.rocketH` 190 → 210 in landscape phones (`layout.scale`), or draw Bim at 0.62 instead of 0.55 in `sky_art.drawRocket`.
4. **The small animal in "big & small" (age 3) is small.**
   - It is 39 CSS px on iPhone P and 33 on iPhone L (`visual/topics_iphoneL-vi-a3-size.png`). It is recognisable, but it is the smallest token in the game.
   - **Fix:** in `content.js`, size the small one at `scale 0.68` instead of 0.6, or `tokenFrac` × 1.1 for the size topic.
5. **The landing rocket briefly tucks under the speech bubble (iPad L).**
   - On landing on a top-row island before the climb, the rocket top is at 158 lp and the bubble bottom at 163 lp (`visual/screens_ipadL-en-08-collect.png`). Bim's cap touches the bubble for ≈ 0.8 s.
   - **Fix:** in `world.js` `_placeRow`, require `y − rocket.h ≥ bubble bottom + 8` for any island (the rocket lands on it).
6. **Talk time in Vietnamese portrait wraps unevenly.**
   - "màu xanh dương" makes the third choice 155 px wide, so the row breaks 2 + 1, and the mic button wraps to 2 lines (`visual/screens_iphoneP-vi-13-talk.png`).
   - **Fix:** in `style.css` `@media (max-width:430px)`, set `.talk-choices button { min-width: 0; flex: 1 1 0; }` and `.mic-btn { font-size: 17px }`.
7. **Talk colour question shows the answer as a picture.**
   - The question picture (a red cloud) appears as a matching picture inside the "red" choice, so the child can match pictures without knowing the word (`visual/screens_iphoneL-vi-13-talk.png`).
   - **Fix:** in `ui.openTalk`, show only the colour word (or a neutral swatch chip) in colour-Talk choices.
8. **Settings in iPhone landscape need scrolling.**
   - The "Answer by talking" toggle sits under the sticky Done button (62 px scroll, `visual/screens_iphoneL-vi-02-settings.png`). The checkboxes are 26 px, though the full row is tappable.
   - **Fix:** in `style.css` `@media (orientation: landscape) and (max-height: 430px)`, set `.set-grid { grid-template-columns: repeat(4, 1fr) }`.
9. **The moon sits under the HUD dots at night in landscape** (`visual/chapters_iphoneL-colors-L3.png`).
   - **Fix:** in `render.js` `_sky`, keep `moonX ≤ (W − ins.right − 470)/W` in landscape.
10. **Colour-blind margin below age 5.**
    - The forbidden pairs work: there is no blue+purple, red+green, yellow+orange or green+orange.
    - The weakest pairs that can still appear in one row at ages 3–4 are red–orange (ΔE00 15.3 deuteranopia) and green–yellow (ΔE00 12.4 protanopia, 18.5 deuteranopia). Both are noticeable but not comfortable (≥ 20 is comfortable). Example: `visual/screens_iphoneP-en-04-ask.png` (blue, orange, red).
    - **Fix:** in `content.js` `CLASH`, add `['red','orange']`. Adding `['yellow','green']` too would leave only 2 three-colour sets, so instead give the colour islands a secondary cue below age 5 (e.g. a tiny pattern on the puff highlights in `sky_art.drawIsland`).
11. **Landscape title.** The "★ 0 · Age 4" pill overlaps the drawn launch tower, and the logo crosses the sun (`visual/screens_iphoneL-vi-01-title.png`).
    - **Fix:** in `render.js` `_titleScene`, move the hills' tower x off centre, or drop the sun to `sunY 0.32` on the title.
12. **The project `CLAUDE.md` still describes "Dee's Forest Memory"** (memory cards, storage prefix `dm:`, the "Đi" rule). This is a docs fix in `CLAUDE.md`.

**Not covered:** hint glow, wrong-answer wobble and the drift / shooting-star surprise frames (the functional QA covers those).

Re-run: `node tests/visual/rr_capture.js && node tests/visual/rr_natural.js && node tests/visual/rr_analyze.js > tests/out/visual/analysis.txt && node tests/visual/rr_palette_cvd.js`.
