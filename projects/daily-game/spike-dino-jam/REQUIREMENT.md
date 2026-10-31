# Spike's Dino Jam: game of the day, 2026-10-31

Rolled by `/build-game random` with the seed date 2026-10-31 (America/Los_Angeles).
Ingredients:
- genre: ~~memory-match cards with a timer~~ → **snake-style trail grower** (re-rolled with salt `r1`: memory-match was used on 2026-10-29)
- theme: **dinosaur valley**
- hero: **a hedgehog on a skateboard**
- item: **musical notes**
- twist: **tiny boss that throws soft pillows every 30 s**
- levels: **biomes**

No element was swapped: a skateboarding hedgehog collecting a growing "conga line" of musical notes in a dinosaur valley is a coherent, cute snake game, and the valley's biomes give each level its own world.

## Pitch
The dinosaurs of Lullaby Valley lost their song! Spike, a little hedgehog on a skateboard, carves around the valley collecting the musical notes that bounce out of the ferns. Every note hops onto the end of Spike's tail and follows him in a bouncy melody train, so the trail grows and grows. Don't skate into your own tail! And every 30 seconds Mumbles, a tiny grumpy baby pterodactyl, flaps over and drops soft fluffy pillows on you. Collect the whole song to wake the valley up and skate on to the next biome.

## Core loop
- Top-down (3/4) view of a valley clearing that fills the whole screen. Spike always rolls forward and turns smoothly (no grid), like a slot-car snake.
- 1–2 notes sit in the clearing at a time. Skating over one plays the next note of the biome's tune and adds it to the end of the trail.
- The trail follows Spike's exact path. Bumping into your own trail (not the first few notes) is a **bonk**: lose a heart, and the trail breaks there. The broken-off notes scatter and can be picked up again for a few seconds.
- The edges of the clearing are soft bushes and boulders: Spike bounces off them gently, no damage.
- **Kickflip** (action): Spike hops for 0.65 s and can jump over his own trail or a falling pillow. It recharges in ~3 s.
- **Mumbles the boss** appears every 30 s, flies across and throws 3 soft pillows. Each pillow shows a growing shadow where it will land. A pillow that lands on Spike makes him dizzy for a moment and knocks 3 notes off the end of his tail (they scatter, re-collectable). Pillows never cost a heart.
- Collect the whole song (10 / 14 / 18 / 22 notes) → biome cleared: the trail notes fly up in a happy chord, hearts bonus, next biome. After biome 4 the valley loops faster (endless).

## Controls
- **Steer:** arrow keys / WASD point Spike in that direction (he turns smoothly toward it), or move the mouse / hold a finger and Spike skates toward it.
- **Kickflip:** Space / Enter / right-click / on-screen skateboard button / a second finger.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Note = 10 + 2 × trail length (a long trail is worth more). Golden note (rare) = ×3 points. Song complete = hearts × 100. Dodging a pillow with a kickflip = +15.
- 3 hearts (Easy 5). Lose all hearts → game over. Best score saved per difficulty.

## Biomes (distinct backgrounds and ambient animation)
1. **Fern Meadow** (morning): bright green grass, fern clumps, flowers, butterflies, a sleepy long-neck dino peeking from the edge.
2. **Misty Swamp**: teal water patches, lily pads, mist drifting, fireflies, a little swamp dino.
3. **Red Rock Canyon**: warm sandstone ground, cacti, dust wisps blowing, a horned dino.
4. **Snowy Peaks**: snowy ground, pine trees, falling snow in depth layers, a fluffy mammoth-ish dino friend.

## Customisation
Change Pictures screen: replace Spike (hero), the note, the pillow, and each biome's ground picture.

## Audience and platform
- Family-friendly: nothing scary, nothing hurts. Bonks are "boing!", pillows are soft, Mumbles is grumpy-cute.
- Easy mode: slower, 5 hearts, shorter songs, longer kickflip and more forgiving tail.
- Browser (GitHub Pages, iPhone / iPad touch) + portable Windows 11 exe. Original art and synthesized sound only.
