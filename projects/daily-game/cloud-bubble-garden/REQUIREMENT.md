# Nimbus's Bubble Garden: game of the day, 2026-11-06

Rolled by `/build-game random` with the seed date 2026-11-06 (America/Los_Angeles).
Ingredients:
- genre: ~~drop-and-stack physics tower~~ (used 2026-11-04), ~~memory-match~~ (10-29), ~~catcher~~ (10-30), ~~fishing~~ (11-02), ~~memory-match~~, ~~one-button flyer~~ (10-28), ~~gravity-flip~~ (11-05), ~~gravity-flip~~ → **balloon / bubble popper** (salt `r8`)
- theme: **rainy-day garden**
- hero: **a cloud sprite**
- item: **gems**
- twist: **the hero slowly grows bigger**
- levels: **times of day (dawn, noon, sunset, night)**: the same rainy garden from a misty dawn to a glowing night.

Nothing swapped: a little cloud in a rainy garden who pops rain bubbles and grows as she drinks them is a coherent, kid-friendly picture, and the growth twist doubles as a risk/reward rule.

## Pitch
It's raining in the garden, and every puddle blows shiny bubbles with a gem inside. Nimbus the little cloud sprite floats after your finger and pops them: *bloop!* Each gem makes her a bit **bigger and fluffier**, and a bigger Nimbus earns more points per gem, but she also gets harder to steer around the prickly chestnut burrs that drop from the trees. When she is as big as she can get, she bursts into a happy **rain shower** that pops every bubble at once and makes the flowers bloom, then she starts small again.

## Core loop
- Bubbles rise from the puddles along the bottom of the garden, wobbling and drifting with the wind.
- Nimbus glides toward your finger / cursor (springy, a bit floaty). Touch a bubble to pop it; its gem flies into the gem jar.
- Every 4 gems Nimbus grows one size (1 → 5). Points per gem = 10 × size.
- At size 5, 4 more gems trigger the **rain shower**: all bubbles on screen pop, bonus points, flowers bloom, Nimbus shrinks back to size 1.
- Chestnut burrs first dangle at the top of the screen (a warning wiggle), then drop with gravity, bounce once on the lawn and roll away.

## Controls
- Touch: drag (or tap) anywhere: Nimbus floats to your finger (she floats slightly above it so your finger doesn't hide her).
- Mouse: Nimbus follows the cursor. Keyboard: arrows / WASD move her.
- Esc / P pause, M mute, F11 full screen.

## Score and lose
- Gem: +10 × size. Rain shower: +50 × (level + 1), plus the gems it pops. Level done: +100 × (zone + 1) × (loop + 1).
- Pops in quick succession build a **pop streak** (callouts only; it's fun, not a score rule).
- 3 hearts (Easy 5). A burr bump costs one heart **and shrinks Nimbus one size**, with a soft knock-back and 1.5 s of blinking safety. Each new time of day gives one heart back.
- No hearts → game over. Best score saved per difficulty. Bubbles that float away cost nothing.

## Levels: times of day
1. **Dawn**: lilac-pink sky, soft mist, light rain, sleepy tulips. Slow bubbles, very few burrs (easy for a 6-year-old).
2. **Noon**: bright drizzle with sunshine, a faint rainbow, sunflowers, swaying wind.
3. **Sunset**: orange-violet sky, warm rain, falling leaves, stronger gusts.
4. **Night**: deep blue sky, moon behind rain clouds, glowing lantern flowers and soft glow-worms; the bubbles shine.
Each level ends when the gem jar is full (≈ 60–80 s); a rainbow sweeps over and the sky crossfades to the next time of day. After Night it loops to Dawn, a bit faster (endless).

## Customisation
Change Pictures screen: Nimbus (hero), the gem, and each time of day's background.

## Audience and platform
- Family-friendly: soft, round, smiling, nothing scary; a burr bump is a soft "ouch-boing".
- Browser (GitHub Pages, iPhone/iPad touch, portrait and landscape) + portable Windows 11 exe. Original art and synthesized sound only.
