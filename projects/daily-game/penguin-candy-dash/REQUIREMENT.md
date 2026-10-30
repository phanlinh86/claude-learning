# Pip's Candy Dash: game of the day (second roll), 2026-10-29

Rolled by `/build-game random`. Today's first roll became *Foxy's Reef Memory*, so this game re-rolls every table (salt `r1`).
Ingredients:
- genre: **top-down collector with gentle chasers**
- theme: **candy land**
- hero: **a penguin**
- item: **gems** (candy gems)
- twist: **the hero slowly grows bigger**
- levels: **biomes**

No element was swapped.

## Pitch
Pip the little penguin waddles through Candy Land scooping up sparkling candy gems. Every gem makes Pip a little rounder and worth more points, but a round penguin is easier for the grumpy gummy bears to bump into! Fill the gem jar in each candy biome to open the gate home to the Ice-Cream Glacier.

## Core loop
- A top-down arena, one screen per biome. Candy gems pop up around the arena (a few at a time, with a sparkle telegraph).
- Pip moves smoothly with momentum and an ice-slide feel: a little drift, never slippery-frustrating.
- **Growing twist:** each gem makes Pip grow a little (size level 1 → 5).
  - Bigger Pip earns more per gem (×1 … ×5) but is slower to turn and an easier target.
  - At max size Pip can **"Pop!"**: press the action button to shrink back to small, spraying a burst of bonus sparkles and stunning nearby bears for a moment.
  - Being bumped also shrinks Pip one size.
- **Gentle chasers:** gummy bears waddle slowly after Pip. Different bears behave differently: a wanderer, a follower, and a "guard" that circles gems.
  - A bump costs one heart (3 hearts), shrinks Pip one size and drops a couple of gems, then gives 1.5 s of blinking safety.
  - Bears never move faster than Pip.
- Fill the biome's **gem jar** (e.g. 15 / 20 / 25 / 30 gems) → the gate opens → walk through to the next biome.
- Lose all hearts → game over. After the last biome the loop restarts with more bears (endless, with a gentle ramp).

## Controls
- **Move:** arrow keys / WASD, or hold the mouse or a finger where Pip should waddle (follow the pointer).
- **Action (Space / right-click / two-finger tap / on-screen button):** belly-slide dash (short burst, 1.2 s cooldown). At max size it becomes **Pop!** instead.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- gem = 10 × size multiplier;
- Pop! bonus = 50 + 10 per stunned bear;
- biome clear bonus = hearts left × 100.

Best score is saved. You lose when the hearts reach 0.

## Biomes (distinct floors, borders and ambient animation)
1. **Gumdrop Meadow:** mint grass with gumdrop bushes, lollipop trees and floating sugar sparkles.
2. **Chocolate River:** a cocoa-brown riverbank with wafer bridges, slow chocolate ripples and marshmallow stepping stones.
3. **Cotton Candy Clouds:** pastel pink and blue fluffy ground, drifting candy-floss puffs and a rainbow.
4. **Ice-Cream Glacier:** Pip's home, with scoops of ice-cream hills, sprinkles snowing down and wafer igloos.

## Customisation
On the Change Pictures screen the player can replace Pip (the hero), the gem, the gummy bear and each biome's ground picture.

## Audience and platform
- Family-friendly; kids can play. Bears are cute and grumpy, never scary, and bumps are soft "boing!"s.
- Easy mode: slower bears, 5 hearts and smaller jars.
- Browser (GitHub Pages) + portable Windows 11 exe.
- Original art and synthesized sound only.
