# Visual QA report — Owlet's Snow Garden

Date: 2026-10-31 · Build: working tree of `game/` (not edited by QA).
Tools: `tests/visual/capture.js` (sections `screens moods topics bloom lumi notch motion`), `measure.js` (DOM geometry),
`colorblind.py` / `palette_cvd.py` (Machado 2009 deutan/protan), `sheets.sh` (montages). Output in `tests/out/visual/` (gitignored).

Coverage: 4 viewports (iPhone 393×852@3, 852×393@3, iPad 820×1180@2, 1180×820@2) × EN/VI × 12 screens (title, settings, banner,
round, pause, mid-bloom, round done, Talk, Talk answered, chapter done, chapter-3 banner, session done) + night session-done;
all 20 age×topic combos (ages 3–7) at night on 4 viewport/language pairs; 4 times of day × age 3/5 colour rounds; 10 planting
cases (half planted + mid-grow, fully bloomed; planters with 10 and 12 holes) × 4 viewports; Lumi's 7 frames at in-game size,
morning and night; notch insets (portrait 59/34 px, landscape 59/59/21 px, overlaid in red) EN/VI; grow motion sheet (50 ms steps).
Logical units below are game px (short side 720); CSS pt = logical × view.s (iPhone s = 0.546, iPad s = 1.139).

## What already works (no action)
- **Safe areas:** with the notch emulation, HUD (top 69 CSS px vs inset 59), bubble, Lumi (x 213 − half-width 101 > inset 108 logical)
  and all pots (x 176…1385 of 1561; portrait 32…688 of 720) stay inside the safe area; title, Talk and done panels too.
- **Vietnamese text fits:** bubble `scrollHeight == clientHeight` in all 30 measured cases (5 viewports incl. iPhone SE landscape × 2
  languages × ages 3/5/7); Talk panel never scrolls (scrollH == clientH), choices stay in 1 row; banners fit ("Chữ cái đầu tiên"
  is the longest topic name, `fitText` keeps it inside 560 px); buttons don't truncate.
- **Planting layering:** grow sheet (`sheets/motion_grow.png`) shows the seed landing with squash, sinking behind `pot_front`, stem
  spring and petal overshoot; signs are on the pot front so stems never cross them.
- **Night:** darkness tint (0.28) touches only hills/snow; seeds, pots, flowers and Lumi keep full colour; flowers get the soft glow.
- **Colour-blind rule:** 5 980 generated rounds — no blue+purple or red+green in any round below age 5 (colours/shapes/animals).
  Colour rounds only exist at ages 3–4. Deutan/protan simulation of an age-4 colour round (`cvd/ipadL-vi-a4-colors_*.png`)
  keeps purple/yellow/red separable.
- **Lumi frames:** idle/talk/blink/happy/cheer/think/oops all read at 96 CSS pt (iPhone) and 199–216 CSS pt (iPad), on pink
  morning and navy night; the white body has a grey `#7C8899` outline that holds on snow.

---

## P1 — fix before release

### P1-1 Resting seeds sit on top of growing flowers (all devices, every sort/count round)
Seen in `screens/iphoneP-*-06-blooming.png`, `screens/ipadP-en-06-blooming.png` (a yellow seed hides the red flower's head),
`moods/iphoneL-a5-L3-flowers.png` (red seed over the purple flowers), `bloom/iphoneL-count-a7-half.png` (3 seeds over planter flowers).
Numbers (pot w 230 → h 179): soil y = top + 43; head centre = soil − stemH 90 = top − 47; petal reach ≈ 0.63 × flowerSize 91 = 57
→ **flower top = pot.top − 104**. The seed band ends at `pot.top − playPotGap(44)`, so the bottom row of seeds overlaps the flower
heads by **≈ 60 logical px** (33 CSS pt on iPhone, 68 on iPad). Planter: stemH 95, flowerSize 93 → same overlap. Resting seeds are
drawn after the pots (`render.js _game`), so the new flower is hidden at its "Pop!" moment, and the flower appears to belong to the seed.
Fix (world.js `computeLayout` / `CONFIG`): make the gap depend on the flower height:
`playPotGap = max(44, stemH − 0.24·h + 0.65·flowerSize + 10)` ≈ **115** for a 230 pot (≈ 95 for 146 pots). In landscape phones
the band shrinks to 129 px tall; `_pack` already falls back to `playAlt` (L-shape below the bubble), which has 100+ px spare. If that is
too tight, also shorten stems: `stemH = clamp(0.42·h, 45, 80)` in `computeSlots` (flower top at pot.top − 79).

### P1-2 One-frame full-screen pink flash when adaptive quality steps down
9 of ~230 screenshots were a blank pink (`#F3B5C9` body background) canvas with only the DOM HUD/bubble on top
(e.g. `topics/iphoneP-vi-a6-lower.png`, `bloom/iphoneL-colors-a5-half.png`, `lumi/` sheet). Cause: `main.js adapt()` calls
`render.resize()` **after** `render.draw()` in the same rAF callback; setting `canvas.width` clears the canvas and nothing redraws it
until the next frame, so the cleared canvas is presented. On a busy iPhone this is exactly when frames are slow (up to 3 steps:
1.0 → 0.85 → 0.72 → 0.61), so children see 1–3 pink flashes per session.
Fix: in `adapt()` only set `pendingRs = renderScale()`; at the top of `frame()` (before `render.draw`) do
`if (pendingRs) { render.resize(view.W, view.H, pendingRs); pendingRs = 0; }` — or call `render.draw(...)` again right after the resize.

### P1-3 Size topic: the "big" pot shows small flowers and the "small" pot shows big ones; both pots are the same size
`bloom/ipadL-size-a3-full.png`: big pot (sign = big seed) has 3 slots → `flowerSize = min(96, 230·0.66/3·1.2) = 61`; small pot has
2 slots → 91. The pots are both w 230 (`topics/layout.jsonl`). The picture contradicts the lesson ("big seeds in the big pot").
Fix: (a) `content.js placeBaskets` / `world.js _beginRound` for `label.type === 'size'`: small pot w × 0.72 (≈ 166), big pot × 1.0;
(b) `render.js _flowerOf`: `hs = b.flowerSize · (it.scale || 1)` and `len · (it.scale || 1)^0.5` so big seeds grow big flowers
(1.3 × 61 = 79) and small seeds small ones (0.72 × 91 = 66 → use per-pot flowerSize from the smaller pot). Also the big seeds overlap
each other when packed in tall portrait (`topics/iphoneP-vi-a3-size.png`: two 235-px seeds overlap ≈ 25 px): pack with
`size × scale`, not base size, in `world.js packItems`.

### P1-4 iPhone portrait with 4 pots: signs too small to read (ages 4–5 animals/shapes, age 5 letters planters excluded)
`pot.w = min(230, (720 − 40)/4 − 24) = 146` → 80 CSS pt pots; sign plate `pw·0.5 = 73` → animal sticker `ih·1.12 = 45 logical =
24.6 CSS pt`, shape silhouette `ih·0.82 = 33 → 18 CSS pt` (`topics/iphoneP-vi-a5-animals.png`, `bloom/iphoneP-shapes-a5-*`).
DESIGN §4.2 asks animals to read at 64 px; the white hare/fox stickers on the beige board are the hardest. On iPad portrait the
same layout gives 51 CSS pt (borderline).
Fix: portrait only (world.js `computeLayout`): `potSideMargin 20 → 6`, `potGap 24 → 8` → pw = 169 (+16 %);
render.js `_plate(b, …, pw * 0.5)` → `pw * 0.64` and animal sticker `ih * 1.12` → `ih * 1.3` (may overhang the board a little — it is a
sticker) → sticker ≈ 76 logical = **41 CSS pt** iPhone / 87 iPad. If still small, cap portrait n at 3 for ages ≤ 4 (content `potsFor`
can take `layout.portrait`).

### P1-5 iPhone landscape session-done: the panel covers the cheering Lumi
`notch/iphoneL-vi-done.png`, `screens/iphoneL-vi-13-done-night.png`: `_doneLumi` draws Lumi h = min(0.38H, 380) = 274 with feet at
0.52H = 374 → logical y 100–374 = **CSS 55–204**; `#scrDone .done-panel` starts at CSS ≈ 108 (align-items: flex-end), so only the
ears and eyes show. Fix: style.css `@media (max-height: 430px) { #scrDone { align-items: center; justify-content: flex-end;
padding-right: calc(var(--sa-r) + 24px); } .done-panel { max-width: 440px; } }` and render.js `_doneLumi`: when `W/H > 1.6`
use `x = L.ins.left + 0.2·W, y = groundY, h = 0.55·H`.

---

## P2 — should fix

### P2-1 Session done has no "night garden full of glowing flowers" (DESIGN §7)
`screens/ipadL-vi-13-done-night.png`: the last round's flowers fade (`_leaveAll`) and the done screen shows **empty pots** with animal
stickers, which reads as "nothing grew". Fix: render.js `_game` — when `o.done`, skip `_pot` and draw a garden row: 7–9 flowers
(`drawFlower`, palette colours, flowerSize 90–110, stems 70–120, glow on since `_night = 1`) along `groundY` across the width, Lumi in
front. iPhone portrait done already composes well (Lumi + panel); the row of flowers would sit under the panel there — keep it.

### P2-2 Neighbour flowers overlap and cover each other's centre text
2-slot pots: slots ±38 px (`potSlotSpan 0.66 × 230 / 2 = 76` apart), both `stem: 1` (|idx − mid| = 0.5 < 0.6), head Ø ≈ 1.26 × 91 =
115 → **39 px (34 %) overlap**; in add rounds the right flower hides the left label ("15+1" reads "15+",
`bloom/iphoneL-add-a7-full.png`). Planter with 12 holes: spacing `1272·0.84/12 = 89`, head Ø 117 → 28 px overlap, alternating stems
only 1/0.9 (9.5 px) — counting 12 flowers that overlap is hard (`bloom/iphoneL-count-a7-*.png`).
Fix (world.js `computeSlots` + render.js `_flowerOf`): pots → `flowerSize = min(96, sxp·1.05)` and lean each stem outward
`sway += (slot.x − b.x)/b.w · 0.6` (±0.1 rad → heads ≈ 112 px apart); planter → `flowerSize = min(96, sxp·0.85)` and stems alternate
`1 / 0.72`. Draw taller stems first so centres of the shorter ones stay on top.

### P2-3 Tall iPhone portrait: ~30 % of the screen is empty sky, pots tiny
`screens/iphoneP-*-04-round.png`: H = 1561 logical; bubble ends at 254, seed band 664–1276, pots 1320–1499. Logical 254–664
(**≈ 225 CSS pt**) holds only a cloud and the sun; pots occupy the bottom 11 %. Seeds already get ×1.2 (139 px = 76 CSS pt).
Fix ideas (world.js `computeLayout`, tall branch): `potMaxW 230 → 290` for n ≤ 3 in portrait (pw = 290 → 158 CSS pt pots, bigger
signs); `groundOffset 70 → 150` so the garden sits higher; `portraitPlayMaxFrac 0.85 → 1.0`; move Lumi down beside the band
(`lumiYPort = play.y − 20`) with the bubble following, leaving the top for sky/aurora. Title portrait has the same empty top half and
no decorative pot (`_titleScene` draws it only in landscape) — add the pot to the right of Lumi in portrait (pw = 0.3W).

### P2-4 Sun (and sunset sun) sits inside the seed band, behind seeds
Weather `amb.sunY`: morning 0.34, sunset 0.46 (x 0.24) — landscape band is y 0.33–0.60 of H, so the sun is directly behind the seed
row (`sheets/moods_iphoneL.png` sunset; `screens/ipadP-en-06-blooming.png` purple seed on the sun). A yellow seed on the yellow sun has
fill contrast ≈ 1.0:1. Fix: render.js `_sky`: `y = Math.min(skyMax, H·sunY, layout.play.y − 0.45·size)` (keep the sun above the
band; in portrait it lands in the empty gap between bubble and band), or draw it at alpha 0.55 when it overlaps `w.playRect`.

### P2-5 Talk time with nothing to show leaves a blank hole (animals Talk)
`notch/iphoneP-*-talk.png`: `talk.show` is empty for "Where is the whale?", but `#talkShow` still takes 275×165 CSS px between title
and question. Fix: ui.js `openTalk`: `$('talkShow').classList.toggle('hidden', !(s.sprite || s.flower || s.shape || s.text || s.count))`.

### P2-6 Yellow + orange together in colour rounds/Talk at ages 3–4
`palette_cvd.py`: yellow–orange ΔE76 normal 32, deutan **12.4**, protan 20 — the weakest pair still allowed (blue–purple 4.5 and
red–green 14.3 are already blocked). It occurs in 150/300 age-4 colour rounds and 221/499 colour Talk choice sets.
Fix: content.js `safeColors` for age < 5 also drop one of yellow/orange when the round needs ≤ 3 colours (3 left = enough for n ≤ 3);
same for colour Talk choices.

### P2-7 Seeds over the navy night sky lose their outline (portrait night)
In portrait the whole seed band is over the navy sky (`topics/iphoneP-vi-*.png`). Fill vs sky `#2E3D73`: blue 3.0:1, red 2.7, purple
2.7; outlines (`#1F5BA8`, `#6840A8`, `#A8282E`) vs sky ≈ 1.5:1, so silhouettes go soft. Fix: render.js `_item` when
`this._night > 0.3`: draw a light halo first — `g.shadowColor = 'rgba(255,255,255,.55)'; g.shadowBlur = 10` (or a 3 px
`rgba(255,255,255,.5)` stroke of the seed outline) for resting/held seeds only.

---

## P3 — polish

1. **Bubble text small on phones:** `_fitBubble` gives 17 px (`r.h·0.3`, r.h = 57). In landscape the bubble ends at CSS 391–442 while
   the HUD starts at 621 → raise `bubbleMaxW` 620 → 820 for landscape and `fs = r.h·0.36` (20.5 px).
2. **Lumi talk frame barely differs from idle** (beak opening ≈ 6 px at 96 CSS pt): during speech add a 1.03 scale bob in `_lumi`,
   or open the beak wider in `lumi_talk.svg`. `oops` vs `idle` also differ only by brows.
3. **Moon behind the HUD star pill** at night in iPhone landscape (moonX 0.78, moonY 0.16): clamp `moonX·W < hud.x − 110` or use 0.62.
4. **Title:** sun overlaps the logo's last word in portrait (`screens/*P-*-01-title.png`); "★ 0 · Age 4" pill touches Lumi's ear
   tufts on iPad portrait. Move title sun to (0.82W, 0.1H) and give `.title-wrap` `padding-bottom: 12vh` in portrait.
5. **Mic button wraps in VI on iPhone portrait** ("Bé chạm hoặc nói đáp án nhé!", 2 lines): `@media (max-width: 430px) .mic-btn
   { font-size: 17px; }` or a shorter VI string.
6. **Done headline orphan** ("… Hoan / hô!") on landscape: `.done-panel h2 { text-wrap: balance; }`.
7. **Settings, iPhone landscape:** 4th toggle ("Trả lời bằng giọng nói") starts hidden under the sticky Done button (scrollable, but
   looks cut). Use `grid-template-columns: repeat(4, 1fr)` in the ≤ 500 px-height media query.
8. **Warm-up seed homes:** a seed often rests right above a *different* colour pot (`screens/ipadL-en-04-round.png`), nudging toddlers
   to the wrong pot. Prefer homes not vertically aligned with a non-matching pot (cost term in `_pack`) for ages 3–4.
9. **Count-plate dots** for N = 10–12 are ≈ 8 CSS pt on iPhone (`_dots`, d = ih·0.3 with 2 rows × 0.8). Fine for parents, small for
   kids; consider `ih·0.36`.

## Files
- Scripts: `tests/visual/capture.js`, `measure.js`, `colorblind.py`, `palette_cvd.py`, `sheets.sh`.
- Key evidence: `tests/out/visual/sheets/*.png`, `topics/layout.jsonl`, `bloom/bloom.jsonl`, `notch/notch.jsonl`.

## Fixes applied (lead + mechanics, 2026-10-31)
- P1-1 shorter stems (`stemH = clamp(0.42h, 45, 80)`) and `layout.playGap` keeps resting seeds clear of flower heads.
- P1-2 the adaptive-quality resize now happens at the start of a frame (no blank pink frame).
- P1-3 small pot is 0.72× the big one; seeds keep `size` and `scale` apart; flowers scale with the seed.
- P1-4 portrait pots wider (margin 6, gap 8); signs 0.6 × pot width, animal stickers 1.3× the board height.
- P1-5 short landscape phones: done panel on the right, cheering Lumi on the left.
- P2-1 session done shows a row of glowing night flowers. P2-2 flowerSize/lean so neighbours don't hide each other.
- P2-3 tall portrait: bigger pots for ≤ 3 pots and a raised ground. P2-4 sun/moon kept above the seed band.
- P2-5 Talk time hides the empty picture box for animals. P2-6 no yellow+orange together below age 5. P2-7 night halo on seeds.
- Not done (P3): bigger bubble text on phones, a more distinct talk frame for Lumi, portrait title pot, planter dot size.
