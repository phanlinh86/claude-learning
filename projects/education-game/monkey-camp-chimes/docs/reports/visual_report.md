# Visual QA report — Kiki's Camp Chimes (2026-11-10)

How it was tested: `tests/visual/screens.js` (Playwright Chromium, `isMobile` + `hasTouch`) took **344 screenshots**:
every screen (title, settings, chapter banner, play, wrong, right + note flying, lantern lit, hint hand, hedgehog,
bird, pause, song ask, song cascade, counting, night + fireflies, Talk, Talk right, level-done banner, session done)
× 4 viewports × EN/VI, plus every topic for ages 3–7 in its chapter mood (2 rounds in, so distractors are present), plus
every mood × colour bells / bell strings / plates (`PART=moods`). Viewports: iPhone 393×852 @3 (insets 59/0/34/0 css px),
852×393 @3 (0/59/21/59), iPad 820×1180 @2 and 1180×820 @2 (24/0/20/0). Insets were emulated by overriding
`--sa-t/r/b/l` on `:root` (feeds `#safeProbe` → `main.js readInsets`). Geometry per shot: `tests/out/visual/geometry-*.json`,
automatic checks: `issues-*.txt`. Best shots: `tests/visual/keep.txt`.

Automatic checks that **passed everywhere**: no chime overlaps Kiki's box, the fire box, the HUD or the bubble; nothing under
the notch / home bar; bubble never overlaps HUD or Kiki; no DOM text overflow (EN and VI) and no button < 44 css px; colour-pair
rule (ages < 5) never broken in any captured round; no page errors.

Logical scale `s` (css px per logical px): iPhone both orientations **0.546**, iPad portrait 1.139, iPad landscape 1.139.

---

## P1 — fix before release

### P1-1 Chimes are far below the 100 css px target on iPhone (both orientations, all ages)
| viewport | age | item (logical) | layout tier | chime drawn (css px) | hit diameter (css px) |
|---|---|---|---|---|---|
| iPhone portrait 393×852 | 3 | 129 | 0 | 70 | 100 |
| iPhone portrait | 4 | 112 | 1 | **61** | **89** |
| iPhone portrait | 5 | 104 | 3 | **57** | **83** |
| iPhone portrait | 6–7 | 96 | 3 | **52** | **78** |
| iPhone landscape 852×393 | 3–5 | 129 | 0 | 70 | 100 |
| iPhone landscape | 6–7 | 120 | 0 | 65 | 94 |
| iPad (both) | all | 112 | — | 128 | 185 |

Cause (`game/js/world.js computeLayout / layoutTier`): the tier is chosen so that **`maxChimes[age]` hooks** fit
(`nMax * spK * item <= usable`), not the chimes of the current round. In iPhone portrait `usable = 720 − 72 − 32 = 616`, so
age 4 (`maxChimes 4`): 129 × 1.3 × 4 = 671 > 616 → falls to 112; ages 5–7 (5 hooks) fall to `itemMin` at 1.18 ×. The
default age-4 game shows 3 chimes in most rounds but sizes them for 4. With 720 logical px across, 100 css px = 183 logical
px, so 4–5 chimes in one row can never reach 100 css px on a 393-px phone.
Suggested fix (in order of effort):
1. **Size per round**: in `_placeChimes`/`hooksFor`, recompute the item from the round's real `n`:
   `item = min(itemCap, usable / (n × spMin))` with `itemCap ≈ 150` on phones (`phone || tall`). 3 chimes in portrait →
   616 / 3.9 = 158 → **86 css px**; 2 chimes → 158 cap → 86 css px; landscape 3 chimes → 150 → 82 css px.
2. **Bigger hit circles on phones**: `hitPad` 14 → `hitPad = max(14, 92 − hitK × item)` when `s < 0.7` so the hit
   diameter is ≥ 183 logical (= 100 css px). Circles of neighbours then overlap, which is fine because "nearest centre wins"
   (`_chimeAt`) — but keep the hit circle clipped to the beam band.
3. Optional for ages 5–7 on iPhone portrait (5 chimes): a **two-height zig-zag** — alternate cords short/long by ≥ 1.1 × item
   (portrait has 300+ spare px, see P2-1), so neighbours do not touch horizontally and spacing can drop to ~0.95 × item →
   item ≈ 616 / (5 × 0.95) = 130 → 71 css px drawn, hit 100 css px with fix 2.

### P1-2 Counting strings are unreadable on iPhone (age 4 counting chapter, the core skill)
Shot: `ip-p-en-15-counting.png`, `pad-l-mood2-age4-count.png`. Measured box widths for strings n = 1/2/3/4 at item 112:
42 / 69 / 102 / 112 logical → on iPhone portrait **23 / 38 / 56 / 61 css px**; each little bell is ≈ 25 logical px =
**≈ 14 css px** tall. The brass (`#D8B26A`) bells sit on the khaki meadow / canvas tents in morning and sunset with very low
contrast (they almost vanish against the `#D9C9A8` tent).
Fix (`game/js/chime_art.js` STRING ~ line 356, plus world sizing): scale the mini-bell to ≥ 0.3 × size (≈ 34 logical; 2×
today's spacing) and lay the bells out as 1 row up to 3 and 2 rows for 4–5 so the box stays ≤ size × size; give the string
a backing (cream wooden tag `#FFF6E6` like the dots plates, or a 3 px dark-brass `#9C7838` outline + soft dark halo
`rgba(60,40,20,.35)`) so it reads against tan backgrounds. Together with P1-1 the bells reach ≈ 25 css px.

---

## P2 — should fix

### P2-1 iPhone portrait: a quarter of the screen is empty sky, and the scene is squeezed at the bottom
`ip-p-en-04-play.png`: bubble bottom y = 369 logical, garland y = 796, beam y = 858 (H = 1561). Between the bubble and the
garland there are **375–441 logical px (205–240 css px, ≈ 26 % of the screen)** of plain sky with only a small sun. Beam y is
chosen as low as possible (`beamY = max(beamMin, limit − hookDy − cr[1] − maxSize)` in `layoutTier`, portrait branch), while
`beamMin` would allow y = 461.
Fix: in portrait put the beam at `beamMin + 0.35 × (beamLow − beamMin)` (≈ 600) and let the cords grow
(`cordPort` [110, 190] → up to `[160, 330]` on `tall`) — long cords look natural for wind chimes and the chime row stays at
the same height above Kiki; or use the extra room for the zig-zag in P1-1.3. Also consider Kiki ×1.2 on `tall`
(`kikiHPort` 200 → 240): he is only 220 logical px (120 css px) tall on a 852-px screen.

### P2-2 Speech-bubble tail points at the sun, not at Kiki (portrait)
`.bubble::before/::after` (`game/css/style.css` 135–137) put the tail at left 38 px, pointing down. In portrait Kiki's head is
≈ 890 logical px (≈ 490 css px) below the bubble, and in the morning mood the sun disc (`weather.js` morning `sunX 0.2,
sunY 0.32`) sits right under the tail (`ip-p-en-04-play.png`), so it reads as "the sun is talking"; the small pale sun also looks
like a stray soap bubble. Fix: in portrait hide the tail and put a 44 px Kiki face icon (kiki_talk head) at the bubble's left
edge as a "speaker" avatar; and move the morning sun to `sunX 0.75` in portrait (or ≥ 160 px from the bubble).

### P2-3 Count numerals overlap ("3²")
`render.js` `burst('count')` (≈ line 442): each numeral lives 0.9 s but `countStep` is 0.5 s, and they spawn at almost the same
point (`main.js` case `count`: `e.y − 30`), so "2" is still visible up-right of "3" — reads like an exponent
(`pad-l-en-15-counting.png`, `ip-p-en-15-counting.png`). Fix: `life: 0.45` or kill the previous `num` fx when a new one
spawns; better, place each numeral over the bell that just lit (`e.x, e.y` of that little bell) and keep the final one 1 s.

### P2-4 iPad portrait VI title: star pill sits on the mini garland
`pad-p-vi-01-title.png`: the logo "Khỉ Kiki / Chuông Gió / Lửa Trại" wraps to 3 lines (171 px tall vs 2 lines in EN), the
`.title-info` pill ("0 · Tuổi 4") then overlaps the left post top and the red lantern of the title beam. Fix: either draw the
title beam relative to `domBoxes().logo` bottom (render title scene: beam top ≥ logo/pill bottom + 24) or cap the VI logo at
2 lines on iPad portrait (`.logo` font-size `min(90px, 11vw)` → the VI logo fits "Khỉ Kiki / Chuông Gió Lửa Trại").

### P2-5 Chapter banner repeats the bubble
`pad-l-en-03-banner.png`, all viewports: during `intro` the bubble shows "Colour Bells" while the banner below says
"Chapter 1 · Colour Bells". Fix: `main.js` case `level`: `CC.UI.say('')` (or hide the bubble) until the first `ask`.

---

## P3 — polish

- **Song cascade swings over the posts**: `ip-p-en-13-cascade.png` — the right-most chime swings to ≈ 0.8 rad and its body
  crosses the right post (iPhone portrait x ≈ 640/684 logical). Clamp θ in the cascade so the body stays ≥ `postR + 6` from
  the posts, or reduce `kSong` 0.5 → 0.4 for the outer chimes.
- **Lantern tassels touch the beam**: garland y = beam − 62 with sag 26; the middle lanterns' tassels overlap the beam top
  (`ip-p-en-13-cascade.png`). `garlandAbove` 62 → 72.
- **Age 3 "big & small"**: the small bell is 53 css px on iPhone (hit 79). Fine on iPad (2 flagged at 96 css px). With P1-1
  sizing (2 chimes) it reaches ≈ 72 css px.
- **Talk time on iPad**: panel 720 css wide but the 3 choices are 140×128 and the panel's lower half of the screen stays empty;
  choices could be 180×164 on iPad (`style.css` talk-choices `min-width`), the show-canvas larger.
- **Settings on iPad** use phone-size text (labels ≈ 20 px in a 640-px panel) — parent-facing, but could scale with the panel.
- **iPhone landscape bubble** wraps short prompts with a one-word orphan ("One more! Ring the red / bell!") because the bubble is
  narrowed beside the HUD to ≈ 560 logical px; acceptable, `text-wrap: balance` on `#bubbleText` would look nicer.
- **Night readability: OK.** All 7 answer colours on bells and plates are clearly readable on the night sky thanks to the warm rim
  light (`pad-l-mood3-age5-colors.png`, `-shapes.png`); blue `#3C8DE8` is the weakest against `#1E2A4A` but still distinct.
  Purple on the morning/sunset scene is fine. Brass strings are the only low-contrast item (P1-2).
- **Art contact sheets (`docs/art/`)**: chime set, Kiki frames (idle…dance, night variants) and env scenes look clean, on model,
  original. Kiki's bandana stays neutral. Nothing to fix; only the string sheet confirms P1-2 (bells ~22 % of the size box).

## What looks good
Notch handling (HUD, bubble, Kiki, chimes all inside the safe area in every shot), Kiki never overlaps the chimes or the fire,
the lit lantern garland is visible in every viewport and mood, VI text fits everywhere (bubble 2 lines max, Talk mic button 2
lines on iPhone), the done screen (lantern garland of the session + dancing Kiki + confetti), the pause panel, and the iPad
layouts in both orientations (128 css px chimes, balanced composition).
