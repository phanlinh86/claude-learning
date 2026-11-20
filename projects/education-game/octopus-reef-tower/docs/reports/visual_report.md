# Pip's Reef Tower — Visual QA report (2026-11-20)

Report-only pass (no game code changed). Tools: `tests/visual/rt_capture.js` (adapted: new tap-to-send **lift bubble**,
**sinking**, **pearls out**, **fish school**, **clear** frames + a **chapter banner per weather**), new
`tests/visual/rt_probe.js` (puffer facing vs swim direction, crown-on-jellyfish crops, no-notch HUD), `rt_analyze.js`
(contrast + layout geometry), `rt_sheet.py` (contact sheets / crops), `rt_compact.py`.

Coverage: 4 viewports (iPhone 393×852@3 P + L with 47 px notch / 21 px home-bar insets, iPad 820×1180@2 P + L with
24/20 px insets) × EN + VI × 19 screens (title, gear-hold, settings, banner, ask, drag, lift bubble, sinking, wrong
bounce, hint hand, pause, falling, landing, pearls lit, blow, pearls out, fish school, clear, Talk time, chapter stars,
session done) = 152 shots; 4 weathers × 4 viewports (banner + mid-round) + breeze hold + puffer = 48; every topic at
ages 3–7 × 4 viewports × EN/VI (ask frame; done frame on the tallest tower for EN + iPhone landscape VI) = 300; contrast
probe of all 7 answer colours on 4 moods × 2 devices. About 75 contact sheets / crops were inspected by eye.

**Result: no P1. 6 × P2, 9 × P3.** The analyser found **0 layout flags** (no bubble overflow, nothing under the HUD or
the bubble, no tray piece outside the safe area, Pip never over a tray piece, crown never in an unsafe inset).
Representative shots: `docs/reports/visual/` (24 PNGs, ≤ 1200 px, palette-compressed, 2.0 MB).

## What passes
- **Crown on the jellyfish**: the starfish sits ON the bell (bottom anchor 18 px below the bell top as in DESIGN §2, the
  lower arms overlap the bell rim by ≈ 6–8 px with a soft contact shadow; neither sunk in nor floating) — crop
  `23-crown-on-jellyfish-crop.png`, all 4 viewports.
- **Puffer facing**: `in` dx = −14.6 px/frame with `flip −1` (art faces LEFT = swim direction); `away` sets
  `flip = dir = +1` (mirrored, faces right while zooming right); `sit` faces the tower. Correct (world.js:1262, 1283).
- **Pip frames** (`docs/art/pip_sheet.png` + in game): same body/arms base, same feet anchor in all 10 frames, faces
  right; hold arms reach the tower; blow "o" lips point right. Consistent.
- **Tiled backgrounds**: seams only fall on screen on iPhone landscape (tile 1200 logical vs W 1561 → seams at x = 180 and
  1380 logical = 98 / 753 CSS px). Full-res crops at both seams, sunny + breezy: no visible seam (far / mid / ground).
  iPad L (W 1036) and both portraits (tile 1632) show a single tile.
- **Rays / surface**: rays soft, ≤ 0.35 alpha, sway; the surface band tiles cleanly; the island and home bar never cover
  HUD, bubble or play area (HUD top = 47 + 10 px in iPhone P; bubble x = 110 logical = 60 CSS px > 47 px inset in L).
- **Vietnamese text**: no clipped/overflowing text in the bubble, Talk time (choices 106–167 px wide, no overflow,
  "màu xanh dương" wraps to 2 lines inside its card), pause, done panel or title (logo2 `nowrap` holds). Exception: P2-3.
- **Answer colours vs every mood**: all 7 colours distinct from the sand ring by ΔE00 ≥ 15.6 (yellow, sunny iPad L) and
  every block carries its 5 px dark outline. Closest answer pair: yellow/orange ΔE00 18.5–19.0 (deutan 7.6, protan
  green/orange 8.5) — that is why `content.js` CLASH keeps them apart below age 5. Numbers in P2-5 / P3-1.

## P2 (should fix)

**P2-1 Counting pearls are tiny and sit on blocks whose content is already dots / numbers.** Pearl ball radius
`r = 0.19·h` (block_art.js:546) with `h = pearlH·LH = 40` logical → **15 logical px ≈ 8 CSS px on iPhone portrait**
(s = 0.546), 10 CSS px in iPhone L (LH 88 at 5 blocks), ≈ 17 CSS px on iPad. It is tucked 8 px from the block's left
edge (`pearlInset: 8`, world.js CONFIG) next to a same-size white "barnacle" dot in the bottom-right corner of every
block (block_art.js corner detail) — the child cannot tell which white dot is "the pearl" Pip is counting. On the
**count** topic the glowing pearl lands on blocks that already carry 1–10 white pearl dots (`20-…a4-count-done…png`),
and on **letters / numbers** it covers the glyph (the "1" of "10" is hidden in `19-…oddeven-done…png`).
Fix idea: draw the counting pearl ≥ 0.6·LH tall (≈ 25 CSS px on iPhone P) centred **on top of the block's top edge** (or
in front of the block centre with a dark halo ring), or move the barnacle detail off the front face for counting.

**P2-2 Count numerals 1…n next to blocks that show numbers/letters.** The floating count numerals are drawn at
`e.x + LW·0.75` (main.js:305) in the same dark teal as the block numerals (`#1F5E6B`, ≈ 45 CSS px). On add / sub /
oddeven / count / letters towers the screen shows "4 | 1", "9 | 2", "1 | 3", "10 | 4", "2 | 5" side by side
(`19-iphoneL-vi-a7-oddeven-done-numeral-clash.png`) — confusing exactly for the number topics. The "3" also overlaps the
tower's right edge by ≈ 3–5 px when the tower sways (`14-ipadP-vi-pearls-lit.png`). Fix idea: put the count numeral
on/above the pearl in a different colour (gold `#F5B83D` with white outline) or use `LW·0.85` + a pearl icon.

**P2-3 Settings in iPhone landscape: toggle row clipped behind the sticky Done button and the checkboxes shrink.**
Panel scrolls 39 px (EN) / 60 px (VI); the 4-column grid (style.css:108 `repeat(4, 1fr)` in `max-height: 500px`) makes
the labels wrap to 2–3 lines ("Trả lời bằng giọng nói"), the bottom line is hidden under Done, and the flex
checkboxes are squeezed to **18 / 23 / 16 px (EN) and 25 / 25 / 19 / 13 px (VI)** wide instead of 26 px
(style.css:102 lacks `flex: 0 0 26px`). `09-iphoneL-vi-settings-toggles-clipped.png`. Fix: `.toggle input { flex: 0 0
26px }` and `grid-template-columns: repeat(2, 1fr)` in the ≤ 430 px-tall media query (style.css:222), or drop the
sticky offset. Also iPhone portrait: the voice-info note ends 42 px (EN) / 59 px (VI) under the sticky Done
(`08-…settings-note-under-done.png`) — it is reachable by scrolling, but the only parent-facing hint about the missing VI
voice starts hidden.

**P2-4 Speech bubble very narrow in landscape.** `w = min(560, drop.x0 − 20 − bx)` (world.js:180) gives **241 logical
(274 CSS px) on iPad L** with 30 px font while 600+ px of water stays empty; VI prompts wrap to 3 lines
("Khối màu xanh / lá đâu nhỉ? Bé / chạm vào nhé!"). On iPhone L the box is 382 logical and VI grows it from the layout
height 122 → **174 logical** (+52). Nothing is covered (analyser: 0 flags), but it reads cramped and odd next to the
empty right half (`10-…`, `12-ipadL-vi-ask-narrow-bubble.png`). Fix idea: in landscape let the bubble use the free band
right of the jellyfish below the HUD, or allow up to `bubbleMaxW` when the tower is short (the goal sits at
x ≈ 414 logical; the bubble could start at the HUD's left edge and run leftwards).

**P2-5 Rain mood turns the sand muddy grey, which equals the luminance of green / orange / pink blocks.** The full-screen
`darkness` fill `rgba(40,70,100,0.15)` plus the rain tint (render.js:166–167) is drawn over the ground too: sand ring
becomes `#B4B1A2` (sunny `#EDDDBB`). WCAG block fill vs ring in rain: green **1.03–1.05**, orange **1.00–1.02**, pink
**1.01–1.03**, blue 1.44, yellow 1.41 (hue keeps ΔE00 ≥ 22, but for a colour-blind child only the outline remains:
yellow outline `#C99A12` vs rain sand = **1.20**, orange outline 1.87, pink 1.89). `17-ipadL-rain-muddy-sand.png`.
Fix: clip the darkness to the water above `groundTop` (or 0.06 over the sand) so the tray band stays ≈ `#E3D8BF`.

**P2-6 Pip overlaps the rainbow-party tower on the Session-done screen (landscape).** `_doneScene` (render.js:420–424)
places Pip at `tx − LW·0.6 − PIP.w·k·0.42` with `lh = min(360, 0.52·H)`; with the cheer pose (arms up) Pip's raised
right arm crosses the yellow / orange blocks by ≈ 10–15 CSS px on iPad L and ≈ 6 px on iPhone L, and the curled arm tips
lie over the rock (`13-ipadL-vi-session-done-pip-over-tower.png`, `11-…`). Fix: shift Pip left by ≈ 0.12·PIP.w·k (or tx
right by 30 px) in landscape.

## P3 (polish)

- **P3-1 Yellow on sunny sand**: fill vs ring WCAG 1.06–1.13 (ΔE00 15.6–18.2), outline `#C99A12` vs `#EDDDBB` = 1.93 —
  the weakest answer colour; it reads fine at full res thanks to the outline but a 1 px darker outer stroke
  (`#8A6A0A`) or the tray shadow a bit darker would help. (block_art.js colour-block outline.)
- **P3-2 Fish school too small/thin**: fish `len 22–32` logical (render.js:498) ≈ 12–17 CSS px on iPhone P, and with
  `n = 12·quality` only ~7–9 visible; it reads as confetti more than "a school swirling around the tower"
  (`06-…fish-school.png`). Try len 34–44 and n 14.
- **P3-3 Reward stars look like extra starfish** during the clear: the gold flying reward star + gold `pstar` confetti
  pass over the top block next to the starfish crown (`07-iphoneP-en-clear-extra-stars.png`) — use the HUD star with a
  white outline, or tint confetti stars away from `#F5B83D`.
- **P3-4 Wrong bounce arcs over Pip's head**: a left-slot wrong block drifting home passes over Pip's mask in iPhone P
  (`04-iphoneP-en-hint.png`, blue block at x ≈ 165–215 CSS, Pip's head right edge ≈ 180). Raise `homeApex` less or draw
  the drifting block behind Pip.
- **P3-5 Crown in the surface band** on 5-block towers in landscape: crown top 45 logical (iPhone L) / 101 (iPad L) —
  inside the 90-px wavy surface band; the starfish and its bubbles merge with the surface highlight
  (`24-iphoneL-done-towers-crop.png`). Acceptable; a 10–20 px lower `goalY` cap in landscape would separate them.
- **P3-6 Chapter name twice during the intro** in portrait: the bubble says "Shape Shells" while the banner shows
  "Chapter 3 · Shape Shells" right below (`16-iphoneP-banner-rain.png`). Bubble could say the weather line instead.
- **P3-7 Corner barnacle on sand blocks** (pink shell bottom-left on every sand block): on the **count** topic it is an
  extra round "thing" next to the dots a 3-year-old may count. Hide it on dot blocks (block_art.js `drawPearlDots`
  caller ~line 366).
- **P3-8 Chapter-stars card vs HUD**: in the capture "Ngôi sao × 12" while the HUD shows 2–3 (the harness jumps chapters
  via `_levelDone`, so it may be test-induced) — functional QA should confirm the card shows the chapter's stars.
- **P3-9 Docs drift**: `content.js` purple dark/light `#5E2A78/#C9A0DC` vs DESIGN §3 `#6840A8/#D2BDF3`; the clash rule is
  answer-vs-distractor only (e.g. iPad L ask: answer blue with orange + green; iPhone P: answer orange with blue +
  purple), DESIGN §3 says "never … in one choice set". Fine by the code comment (QA of the sister game) — update DESIGN.
  Stale CSS comment "Tháp Bánh Kem" at style.css:233.

## Test-harness notes (not game bugs)
- The column of tiny fish confetti under the jellyfish in the ask frames comes from `weather.burst('sprinkles')` of the
  towers the harness built a few game-seconds earlier (life 1.4–2.2 s); in real play it is gone before the next ask.
- `07-hint` / `06-wrong-bounce` captures are mid-arc frames; the breeze `hold` shot uses an artificial `omega += 0.6`.
- Re-run: `VQA_OUT=<scratch> node tests/visual/rt_capture.js [screens weather contrast topics]` (≈ 35 min for all),
  `node tests/visual/rt_probe.js`, `node tests/visual/rt_analyze.js`.
