# Dottie's Reef Parade: game of the day, 2026-11-17

Rolled by `/build-game random` with the seed date 2026-11-17 (America/Los_Angeles).
Ingredients:
- genre: ~~catcher with a basket~~ → **snake-style trail grower** (catcher was used on 11-15; salts r1–r17 all landed on a genre used in the last 14 days: collector 11-14, bubble popper 11-06, memory 11-13, whack 11-11, flyer 11-12, hopper 11-08, stack 11-04, brick-breaker 11-10; **r18** gave snake, last used 10-31)
- theme: **coral reef** (last used 10-29, outside the 14-day window)
- hero: **a chubby bird** → Dottie, a chubby puffin (puffins really do "fly" underwater with their wings)
- item: **stars** → sea stars
- twist: **golden rare item worth 5**
- levels: **four seasons**

No element was swapped: a diving puffin leading a parade of sea stars around a reef is coherent and cute, and the reef's four seasons give each level its own look.

## Pitch
The reef is getting ready for the Sea Star Parade! Dottie, a chubby little puffin, dives down and swims loops around the coral, gathering sea stars. Every star she touches tumbles in behind her and follows her exact path in a wiggly, glowing parade. Don't swim into your own parade! Now and then a rare **golden sea star** peeks out of the sand and scoots away: catch it before it hides and it counts as **5** stars at once.

## Core loop
- Top-down (3/4) view of a sandy clearing in the reef that fills the screen. Dottie always swims forward and turns smoothly (no grid).
- 2 sea stars sit on the sand at a time. Swimming over one plays the next note of the season's tune and adds it to the end of the parade.
- The parade follows Dottie's exact path. Bumping into it (not the first few stars) is a **bonk**: lose a heart, and the parade breaks there; the broken-off stars drift away and can be picked up again for a few seconds.
- The reef edges are soft coral: Dottie bounces off gently, no damage.
- **Flip** (action): Dottie does a little somersault up toward the surface for 0.65 s and can pass over her own parade. It recharges in about 3 s.
- **Golden sea star** (the twist): first at ~10 s, then about every 18 s when none is out. It scoots slowly away from Dottie for 9 s (blinks for the last 2 s), then burrows into the sand. Catch it: song +5, points ×5, a golden star joins the parade.
- Collect the season's song (10 / 12 / 14 / 16 stars on Normal) → season cleared: the parade spins up in a happy chord, hearts bonus, next season. After season 4 the reef loops faster (endless).

## Controls
- **Steer:** arrow keys / WASD point Dottie in that direction, or move the mouse / hold a finger and Dottie swims toward it.
- **Flip:** Space / Enter / right-click / on-screen flip button / a second finger.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Star = 10 + 2 × parade length. Golden star = ×5. Season complete = hearts × 100. Regrabbing a drifting star = 5.
- 3 hearts (Easy 5). Lose all hearts → game over. Best score saved per difficulty.

## Seasons (distinct backgrounds and ambient animation)
1. **Spring Bloom**: pale golden sand, pink and peach corals, anemones; tiny pink coral-spawn specks rising, little fish schools.
2. **Summer Shallows**: bright white-turquoise sand, rich coral colours; sun rays dancing, bubbles, a sea turtle peeking.
3. **Autumn Kelp**: warm amber sand, kelp and orange sponges; drifting kelp leaves that tumble in the current.
4. **Winter Glow**: cool blue-grey sand, icy rocks and soft blue corals; marine snow in depth layers, small glowing jellies.

## Customisation
Change Pictures screen: replace Dottie (hero), the sea star, and each season's sea-floor picture.

## Audience and platform
- Family-friendly: nothing scary, nothing hurts. Bonks are a "boing!" and a puff of bubbles.
- Easy mode: slower, 5 hearts, shorter songs, longer flip, more forgiving parade.
- Browser (GitHub Pages, iPhone / iPad touch, portrait and landscape) + portable Windows 11 exe. Original art and synthesized sound only.
