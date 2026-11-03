# Ember's Glow Castle: game of the day, 2026-11-03

Rolled by `/build-game random` with the seed date 2026-11-03 (America/Los_Angeles).
Ingredients:
- genre: ~~snake-style trail grower~~ → **merge-the-same-items board** (re-rolled with salt `r1`: the snake trail grower was used on 2026-10-31)
- theme: **haunted-but-cute castle**
- hero: **a baby dragon**
- item: **fireflies**
- twist: **a friendly helper that appears at combo 5**
- levels: **biomes**, read as the castle's four very different places (courtyard garden, crystal cellar, moonlit library, star tower). A castle has no real biomes, but its zones work the same way: each has its own look, weather and music.

## Pitch
The old castle on the hill is a little bit haunted (but only by very friendly ghosts) and its lights have all gone out. Ember the baby dragon is helping: she drops glowing fireflies onto the castle's glow-board. Two the same that touch merge into something brighter: fireflies → firefly jar → candle → lantern → star → moon. Chain merges in a row and Boo, the shy little castle ghost, swoops in to tidy the board. Light up the goal light in each part of the castle to move on.

## Core loop
- A board of 5 columns × 7 rows sits in the middle of the screen. Ember hovers above it, holding the next light; a small "next" preview shows the one after.
- Pick a column: the light drops with real gravity, lands and bounces softly.
- When two or more of the same light touch (up, down, left, right) they pull together into **one light of the next tier** where the new one landed. Items above fall down; new matches chain (cascades).
- Tiers: 1 green firefly · 2 blue fireflies · 3 pink fireflies · 4 firefly jar · 5 candle · 6 lantern · 7 star · 8 moon.

## Controls
- Mouse/touch: move or tap over a column; a tap (click) drops there.
- Keyboard: ←/→ (A/D) move Ember, Space/↓/Enter drops. 1–5 drop straight into a column.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Making tier *t* scores 5 × 2^(t−1), more for 3+ merges at once and a bonus while the combo runs.
- A column that is full refuses a light (unless its top light matches). When no column can take the next light, the game is over.
- Best score saved per difficulty.

## Twist: Boo at combo 5
Every merge in a row adds to the combo; a drop that merges nothing resets it. At combo 5 (and 10, 15…) Boo the shy ghost floats in and carries away the smallest lights (and sleeping pumpkins) to make room.

## Levels: four places in the castle
1. **Garden Courtyard**: dusky purple sky, hedges and a fountain; fireflies drift and leaves tumble. Goal: make a **candle**.
2. **Crystal Cellar**: glowing blue crystals, dripping water and sparkles. Sleepy pumpkins start falling in now and then; they wake up and roll away when a merge happens next to them. Goal: a **lantern**.
3. **Moonlit Library**: tall shelves, moonlight through tall windows, dust motes and drifting pages. Goal: a **star**.
4. **Star Tower**: the tower top under a starry sky with shooting stars. Goal: the **moon**.
When the goal light appears it floats up and lights the castle (and leaves the board). After the Star Tower, the castle loops (endless).

## Customisation
Change Pictures screen: Ember (hero), the light (one picture for all tiers, which grows and gets a coloured ring per tier), Boo (helper) and each place's background.

## Audience and platform
- Family-friendly "haunted": soft, cosy and funny, never scary. Ghosts smile, pumpkins snore.
- The first place must be easy for a 6-year-old (Easy: no pumpkins, low tiers only).
- Browser (GitHub Pages, iPhone/iPad touch) + portable Windows 11 exe. Original art and synthesized sound only.
