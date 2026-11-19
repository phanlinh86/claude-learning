# Ziggy's Apple Castle: game of the day, 2026-11-19

Rolled by `/build-game random` with the seed date 2026-11-19 (America/Los_Angeles).
Ingredients:
- genre: ~~fishing with a timing reel~~ (used 2026-11-18) → ~~brick-breaker~~ (r1, used 11-10) → ~~top-down collector~~ (r2, used 11-14) → ~~snake trail~~ (r3, used 11-17) → **drop-and-stack physics tower** (salt `r4`, last used 11-04)
- theme: ~~city rooftops at night~~ (used 2026-11-05) → ~~jungle~~ (r1, used 11-11) → **haunted-but-cute castle** (salt `r2`, last used 11-03)
- hero: **a rocket kitten**
- item: **apples**
- twist: **a day-to-night cycle that changes visibility**
- levels: **times of day (dawn, noon, sunset, night)**
Nothing was swapped: the times-of-day levels and the day-to-night twist fit together (the light keeps fading inside each level toward the next one).

## Pitch
Ziggy the rocket kitten zooms over a friendly, not-at-all-scary castle on her little hover-rocket. Granny Boo, the castle's kind old ghost, wants to bake the biggest apple pie ever, so Ziggy stacks apple crates up the castle wall to reach her kitchen window. Tap to drop a crate. Land it right on top and the tower grows; too far over the edge and it tumbles. As the day goes from dawn to night it gets darker: every Perfect drop hangs a glowing lantern on the tower, so good stacking keeps your way lit.

## Core loop
- Ziggy's hover-rocket swings smoothly left and right above the tower, a crate hanging under her in a warm lantern glow.
- Tap / click / Space releases the crate. It falls with gravity, keeping a little of Ziggy's sideways speed.
- Close to the centre = **Perfect!** (snaps to centre, combo, a lantern lights up on that crate). Partly over = it stays, off-centre. Its centre past the edge = it tips over and tumbles away (lose a heart).
- Real stacking physics: centre-of-mass topples, a damped spring sway after each landing.
- Floating apples drift in the air between Ziggy and the tower; a falling crate that passes through one collects it.
- The camera rises with the tower.

## Controls
- One input: tap anywhere / click / Space / Enter / ↓ drops the crate.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Each crate that stays: +10. Perfect: +10 × combo (cap ×5).
- Apples: +5 each, **+10 when it is dark** (ambient light below 50 %: "glow apple").
- Every 5 apples Granny Boo bakes a pie: +1 heart (up to the max).
- 3 hearts (Easy 5). A crate that falls off, or a toppled part of the tower, costs one heart. No hearts → game over.
- Best score saved per difficulty.

## Twist: day to night, visibility
- Each level is a time of day, and inside each level the light keeps changing toward the next one as the tower grows: Dawn (soft pink light) → Noon (bright) → Sunset (orange, getting dim) → Night (dark blue, moonlit).
- A darkness layer covers the scene by `1 − light`. Light comes from Ziggy's lantern (around her and the hanging crate), from the lanterns that Perfect drops hang on crates, from glowing apples, and from the moon and castle windows.
- At sunset and night the tower edges are only easy to see where there is light, so Perfect drops (lanterns) make the next drops easier. Easy keeps a clear drop guide at all times.

## Levels: times of day
1. **Dawn: Garden Gate**: peach-pink sky, misty hedges, apple trees, sleepy smiling pumpkins. Blossom petals and mist drift. Goal: 10 crates.
2. **Noon: Sunny Courtyard**: bright blue sky, fluffy clouds, flags on the turrets. Falling autumn leaves. Goal: 12 crates.
3. **Sunset: Bat Ramparts**: orange-violet sky; cute bats flutter out of the towers. Goal: 14 crates.
4. **Night: Moon Tower**: deep blue sky, big smiling moon, fireflies, a shy little ghost peeking from a window, shooting stars. Goal: 16 crates.
Reaching the goal: Granny Boo floats down, waves, and takes the apples in through her window; then the next time of day starts with a fresh tower. After Night the day starts again (endless), a bit faster each loop.

## Customisation
Change Pictures screen: Ziggy (hero), the crate, the apple, and each time of day's background.

## Audience and platform
- Family-friendly: "haunted" means cosy and silly. Round, smiling ghosts, bats without fangs, nothing scary, no darkness so deep that a child can't see. The first level must be easy for a 6-year-old.
- Browser (GitHub Pages, iPhone/iPad touch, portrait and landscape) + portable Windows 11 exe. Original art and synthesized sound only.
