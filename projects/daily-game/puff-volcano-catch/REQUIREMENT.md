# Puff's Volcano Catch: game of the day, 2026-10-30

Rolled by `/build-game random` with the seed date 2026-10-30 (America/Los_Angeles).
Ingredients:
- genre: **catcher with a basket**
- theme: **volcano island**
- hero: **a cloud sprite**
- item: **coins**
- twist: **combo meter that grows the score multiplier**
- levels: ~~planets~~ → **island zones** (swapped: a volcano island can't travel between planets; the four zones of the island give the same "new world each level" feel and stay coherent)

No genre or theme was used in the last 14 days (recent: one-button flyer, memory-match, top-down collector; themes: four seasons, coral reef, candy land).

## Pitch
Rumble, rumble… POP! Old Mount Bumble, the sleepy island volcano, has a tummy full of lost pirate coins and keeps burping them into the sky. Puff, a little cloud sprite with a woven basket, floats along the shore to catch them before they plop into the sand. Catch coin after coin to build your combo and multiply your score, but watch out for the warm sizzly rocks: catch one and it's "ouch!". Puff can puff out a quick **Cool Rain** that turns falling rocks into harmless steam.

## Core loop
- Static side view: the volcano stands in the middle of the island; Puff floats left/right near the bottom carrying a basket on two ropes.
- The volcano rumbles (crater glows, smoke puffs, a short telegraph), then launches 1–3 objects in high arcs (real gravity) that land across the whole shore.
- Coins: copper (1), silver (2), rare gold (5). Sizzly rocks appear from level 2 (very rare in level 1).
- Catch coins in the basket → combo +1. Combo thresholds raise the multiplier ×1 → ×5. A coin that lands on the ground resets the combo (no heart lost).
- Catch a sizzly rock → lose a heart and the combo. Rocks that land on the ground just fizzle.
- **Cool Rain** (action): a 1.2 s rain column above Puff turns rocks inside it into steam (+5 each). Recharges in ~7 s.
- Fill the coin pouch (20 / 25 / 30 / 35 coins) → zone cleared (bonus hearts × 100) → next zone. After zone 4 the island loops with faster, busier eruptions (endless).

## Controls
- **Move:** ← → / A D, or move the mouse / hold a finger anywhere and Puff floats toward it (horizontal follow).
- **Cool Rain:** Space / Enter / right-click / on-screen raindrop button / second finger.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- coin = value × 10 × multiplier; steamed rock = 5; zone clear = hearts × 100.
- 3 hearts (Easy 5). Lose all hearts → game over. Best score saved per difficulty.

## Zones (distinct backgrounds and ambient animation)
1. **Sunny Beach** (morning): turquoise sea, palm trees, sparkles on the water, seagull-shaped little clouds drifting.
2. **Jungle Slopes** (noon): green volcano slopes, big leaves and flowers, leaves twirling down, butterflies.
3. **Ash Fields** (sunset): grey-lilac ash dunes, orange sky, ash flakes drifting on the wind.
4. **Crater Rim** (night): starry sky, glowing lava rivers on the volcano, rising embers and fireflies.

## Customisation
Change Pictures screen: replace Puff (hero), the coin, the sizzly rock and each zone's background.

## Audience and platform
- Family-friendly: the volcano is a sleepy friendly mountain with a face of rocks, nothing burns; "ouch" is a soft bonk.
- Easy mode: slower, lower eruptions, 5 hearts, smaller pouches.
- Browser (GitHub Pages) + portable Windows 11 exe. Original art and synthesized sound only.
