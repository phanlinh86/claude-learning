# House, treat & sign art — `game/js/house_art.js` → `BD.HouseArt` (character artist B)

Pure canvas code, grown from the river game's `stone_art.js` (thing / badge / hint-hand / snowflake / caching code). It is
node-safe at load (it only touches `document` on the first draw) and loads after `assets.js` (it reads
`BD.Assets.img('animals/<a>')` lazily). `stone_art.js` and `tests/unit/stone_art.test.js` are deleted.
**Integrator:** `index.html` still loads `js/stone_art.js` → change it to `js/house_art.js`. `render.js` and `ui.js` still call
`BD.StoneArt` → change them to `BD.HouseArt`.

## API (DESIGN §4.3, plus a few additions)
| Call | Notes |
|---|---|
| `drawHouse(ctx, S, opt)` | origin = door point (bottom-centre). `opt = { seed, color, sign, door, lit, glow, active, squash, snow, alpha, lang }` (all 0..1 except seed / squash; NaN-safe) |
| `houseBox(S, opt?)` | `{x0,y0,x1,y1,w,h, signC:[x,y], signR, signW, signH, chimney:[x,y], door:{x0,y0,x1,y1}, windows:[[x,y]…]}`; `opt.color` → signC / signR give the colour plaque |
| `drawThing(ctx, thing, size, opt)` | origin bottom-centre; kinds `treat shape cookies dots tile animal home blob`; `opt = { glow, wiggle, rot, alpha, count, shadow, direct, lang }` |
| `drawHomeBadge(ctx, home, r, opt)`, `drawSnowflake(ctx, r, rot, a)`, `drawHintHand(ctx, x, y, press, alpha, size?)` | kept from the river game (the hand's cuff is now Tupi's cream apron) |
| `drawIcon(ctx, choice, size)` | any thing, `{kind:'color'}`, `{kind:'number', n}`, `{kind:'home'}`, `{kind:'size', big, thing?}` (default: a pink cupcake), `{kind:'letter', text}` |
| `drawHeartPuff(ctx, r, a)` | centred, r = half width; pale pink-white (never reads as the pink answer) |
| `drawSprinkle(ctx, kind, r, rot)` | kind 0–2 = rods, 3–5 = dots; 6 pastels, all with HSL saturation ≤ 0.5 (checked by the test) |
| extras | `thingTop(thing, size)`, `dotLayout(n, numeral)`, `cookieLayout(n)`, `tileText(thing, lang)`, `variant(seed)`, `houseStyle(seed)` → `{roof, win, gum}`, `thingKey`, `pal`, `lineOf`, `contrast`, constants, `clearCache()`, `stats` |

### Deviations and decisions
- **Colour mode** happens when `opt.color` is set, **or** when `sign.kind === 'blob'`. The roof icing, the door, and a round
  cream plaque in the gable with the colour blob are drawn in the answer colour. The big board is used only in sign mode.
- **The cupcake's cherry** is a candied cherry in a darker tone of the frosting colour, not red. A red cherry on a blue cupcake
  would break the "one colour" rule.
- **Dots and tiles on a house** are drawn straight on the board, with no small plate inside it. Dots with a numeral show the
  numeral on the left, then a divider, then the dots on the right (two-digit numerals get a wider column). As loose things
  (cargo / Talk time), they keep the river game's cream plates on a post.
- **`'@odd'` / `'@even'` tile words** are looked up in this order: `thing.lang`, then `opt.lang`, then `BD.lang`, then
  `BD.I18N.word(lang, w)` if it exists, then the built-in EN "odd/even" and VI "lẻ/chẵn". Text that is too tall (for example
  "ẵ" with its stacked marks) is shrunk to fit the height as well as the width.
- **`active`** draws a soft white ring on the table and lifts the house 3 units. **`squash`** is scaleY about the door point;
  x widens by (1 − squash)/2.

## Sizes (design units, S = 100)
- The house is 122 × ≈109 including the gumdrop. That is about 1.0 × S without the eaves; the walls are 88 wide.
- The door is x ±12, y −27..0. The windows are at (±29, −19). The chimney puff point is (38, −98).
- The sign board is 74 × 60 (≥ 0.55·S, the test checks this). A sign thing is drawn at a box of up to 0.57·S, fitted to
  54 units of height.
- The colour plaque has r = 17 at (0, −63).
- Recommended in-game sizes: houses at S 146–170 (readable at ×0.54 on an iPhone, see `house_phone.png`); cargo things at
  size ≈ 64–80. Cookies for n ≤ 4 have r ≥ 13 units; for n 9–12, r ≥ 7 (≈ 5 px at size 72).

## Caching
- **Things** are drawn as a bitmap per `thingKey(thing, lang)` + `i` / `p` (animal image or placeholder), in device-px buckets
  of ×1.1 (stat names `thingBuilt` / `thingHit`). Count rings are drawn as vectors every frame.
- **The house body** (chimney, walls, unlit windows, door frame and interior, roof, snow, the board or plaque with its thing,
  gumdrop) is one bitmap. Its key is `h:<variant 0..44>:<colour>:<signKey(+i)>:<snow quarter>|<device px>`. The door panel,
  lit windows, glow, active ring, shadow and squash are drawn per frame.
- Path2D objects are cached by key, and the bitmap cache is cleared after 260 entries. Without `document`, everything is
  drawn as plain vectors.

## Limits
- There are 45 seeded styles (3 roofs × 3 window kinds × 5 calm gumdrops).
- Colour is the only cue in colour mode. Colour-blind safety relies on the content rules (no red + green, blue + purple, …
  below age 5). Shape cookies have very different silhouettes.
- Up to 12 dots / cookies and tiles of up to 6 characters are supported.
- On a gable roof, snow covers part of the eave colour; the colour still reads (`house_colors.png`, row 4).

## Checks
- Contact sheets are made with `node tools/house_sheet.js` → `docs/art/house_{colors,signs,3x,treats,cookies,states,phone}.png`.
- Two improvement rounds were done:
  1. Two-digit numerals on the board, thinner snow, bigger cookies with a slimmer plate rim, a bigger colour plaque.
  2. Cookie layouts tuned for counting (3 as a triangle, 5 as 2-1-2), a snow heap on the ridge (so the dome no longer looks
     like glass), `thing.lang` for tiles, the lemon and peach sprinkles toned down to ≤ 0.5 saturation.
- Unit test: `node tests/unit/house_art.test.js` → 15 053 checks pass.
