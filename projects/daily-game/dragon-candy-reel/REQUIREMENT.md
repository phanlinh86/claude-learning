# Taffy's Candy Reel: game of the day, 2026-11-18

Rolled by `/build-game random` with the seed date 2026-11-18 (America/Los_Angeles).
Ingredients:
- genre: ~~lane runner~~ → **fishing with a timing reel** (salt `r14`; salts r1–r13 all landed on genres used in the last 14 days; fishing was last used on 2026-11-02)
- theme: ~~pirate islands~~ → **candy land** (salt `r1`: pirate islands was used on 2026-11-09; candy land last used 2026-10-29)
- hero: **a baby dragon**
- item: **snowflakes** (sugar snowflakes)
- twist: **wind gusts that change direction**
- levels: **weather (sunny, rain, wind, snow)**

Nothing was swapped: snowflakes made of coloured sugar fit candy land, and the windy weather level makes the twist strongest exactly where it belongs.

## Pitch
Taffy the baby dragon sits on a wafer-biscuit dock over the Fizzy Soda Lake in Candy Land. Sparkly **sugar snowflakes** float under the water inside soda bubbles. Hold to let the candy bobber sink, let go to let it float up, and touch a snowflake to hook it. Then reel it in with well-timed taps! But the **wind keeps changing direction**: gusts swing the line left and right and push the snowflakes along, so watch the little windsock. Sour gummies drift by too: bump one and *fizz*, the line snaps. Now and then a **golden snowflake** sparkles past: it is worth 5 pink ones.

## Core loop
- Side view. Taffy sits on the dock at the middle of the screen; the line goes from the rod tip into the water through a gap in the dock.
- Snowflakes in bubbles, decorative gummy fish and sour gummies swim across at different depths.
- **Roam:** hold to sink the bobber, let go and it floats up. The wind pushes the line sideways (more the deeper it is), so the bobber sways left or right of the gap. Touch a snowflake to hook it.
- **Reel:** a reel meter with a swinging needle and a green zone. Tap in the green: the snowflake comes up a step (Perfect gold centre: two steps). Tap outside: it slips down; three slips and it floats free. At the top Taffy flips it into the candy jar.
- **Wind:** about every 10 s a gust changes direction (a whoosh and the windsock swings 1.5 s before). Swimmers drift with the current; the line bows with the wind.
- Sour gummies: touching one while roaming snaps the line (lose one of three lines). They ignore the hook while you reel.

## Controls (one input)
- Keyboard: hold **Space** / **↓** / **S** to sink; press to tap the reel. Mouse/touch: hold anywhere to sink; tap anywhere to reel.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Strawberry snowflake (pink, shallow) 10, lime (green, middle) 20, grape (purple, deep) 30, **golden 50 (= 5 pink)**. +5 for each Perfect tap.
- Three lines (licorice spools). A sour-gummy bump snaps one; no lines left → game over. Clearing a level gives a line back (max 3).
- Best score saved per difficulty.

## Levels: weather (distinct backgrounds and ambient animation)
Each level needs 8 snowflakes (Easy 6, Hard 10).
1. **Sunny Shore**: bright sky, lollipop trees, cotton-candy clouds; light rays in turquoise soda; fizz bubbles. Gentle gusts.
2. **Sprinkle Rain**: soft grey-pink sky, rainbow sprinkles falling and plinking rings on the water.
3. **Windy Swirl**: fast clouds, candy-floss tufts and wrappers blowing; the strongest, most frequent gusts.
4. **Sugar Snow**: evening, sugar snow falling, warm lights in gingerbread houses; snowflakes glow.
After Sugar Snow the levels loop a bit faster (endless).

## Customisation
Change Pictures: replace Taffy (hero), the snowflake, the sour gummy, and each level's background.

## Audience and platform
- Family-friendly: nothing scary, nothing gets hurt. Sour gummies are pouty-cute; a snapped line goes "boing" with a fizz.
- Level 1 must be easy for a 6-year-old: wide green zone, slow needle, soft gusts, few gummies.
- Browser (GitHub Pages, iPhone / iPad touch, portrait and landscape) + portable Windows 11 exe. Original art and synthesized sound only.
