# QA fixes applied (2026-11-17)

Reports: `qa_functional.md`, `qa_visual.md`, `qa_playtest.md`. After the fixes: unit 25/25, i18n/voice 64 008/64 008,
fish art 36 311/36 311, smoke 2/2 (real touch tap on a moving fish), functional 82/82 (4 devices, 10 bot sessions, incl.
the new `rotate_mid_cast`), playtest sim targets met (toddler chapter ≈ 68 s typical / 83–86 s slow 3-year-old, session ≤ 7.1 min).

| finding | fix | where |
|---|---|---|
| P1 rotate in the cast wind-up → round stuck | the cast keeps its fish through a resize; any fallback un-hooks the fish | world.js (+ unit test) |
| P1 child who only taps Tibo / critters → stuck forever | those taps don't reset idle; every 2nd Tibo poke counts toward hint/assist; when assisted a Tibo tap catches the fish; assisted rounds 1★ | world.js CONFIG `pokeNoProgress 2, assistTibo, assistMaxStars 1` |
| P2 sloppy taps miss at ages 3–4 | `hitPad` 14 → 22 (nearest centre still wins) | world.js |
| P2 portrait lilies overlap | spots spread from the rock to the lake end, `layout.lilyS` pad scale | world.js, render.js |
| P2 bottom lane over the sand | lanes clamped above `layout.bedTop`; landscape 2 lanes (2–3 fish each), top lane below the lily pads | world.js |
| P2 low luminance contrast of some colour fish on the water | cream rim + thicker dark outline on every fish | fish_art.js |
| P2 portrait done screen hid the celebration | panel at the bottom, fish fountain leaps into the sky (under the top panel in landscape) | style.css, render.js |
| P2 title Tibo under DOM text | portrait: logo / ▶ in the open water; landscape: language chips next to the gear | style.css |
| P2 small Talk picture on phone landscape | 240 px picture column | style.css |
| P2 adaptive quality never stepped back up | steps up after 8 s without slow frames | main.js |
| P3 bubble tail pointing at nothing; count bubble ahead of the spots; float detached in the air; "10" touching the outline; small lilies; bronto clipped; HUD over the pause menu in Talk; release line every round; old Moka docs/comments | tail removed; bubble counts along; float on the line; smaller glyphs; 1.3× pink-tipped lilies; bronto inside the screen; `talking` class off while paused; release line now and then; README / CLAUDE.md / headers rewritten | css, main.js, fish_art.js, world.js, docs |
