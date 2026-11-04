# Juno's Moon Stack: game of the day, 2026-11-04

Rolled by `/build-game random` with the seed date 2026-11-04 (America/Los_Angeles).
Ingredients:
- genre: ~~rhythm tap on the beat~~ (used 2026-11-01) → ~~merge-the-same-items board~~ (used 2026-11-03) → **drop-and-stack physics tower** (salt `r2`)
- theme: ~~candy land~~ (used 2026-10-29) → **outer space** (salt `r1`)
- hero: **a little fox**
- item: **coins**
- twist: **the hero slowly grows bigger**
- levels: ~~four seasons~~ → **planets** (swapped: there are no seasons in outer space; "planets" is the table option that fits the theme)

## Pitch
Juno the little space fox flies a tiny hover-saucer over strange, friendly planets. Her job: build the tallest tower of cargo crates on every planet so the space ships can find the landing beacon. Tap to drop a crate from her tractor beam. Land it right on top and the tower grows; land it too far over the edge and it topples. Grab floating star-coins on the way down: every few coins Juno (and her crates) grow a little bigger.

## Core loop
- Juno's saucer swings smoothly left and right above the tower, a crate hanging from her tractor beam.
- Tap/click/Space releases the crate. It falls with the planet's gravity, keeping a little of the saucer's sideways speed.
- It lands on the top crate. Close to the centre = **Perfect!** (snaps to centre, combo). Partly over the edge = it stays where it landed, and the tower gets a little more crooked. Its centre past the edge = it tips over and tumbles away (lose a heart).
- Real stacking physics: if the crates above any crate lean too far past its edge (their centre of mass leaves its top), that top part topples. Perfect drops never make the tower lean.
- The camera rises with the tower. The tower sways a little after each landing (a damped spring), more when the drop was off-centre.

## Controls
- One input: tap anywhere / click / Space / Enter / ↓ drops the crate.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Each crate that stays: +10. Perfect: +10 × combo (combo grows with perfect drops in a row, capped at ×5).
- Star-coins: +5 each (collected by a falling crate passing through them).
- 3 hearts. A crate that falls off, or a toppled part of the tower, costs one heart. No hearts → game over.
- Best score saved per difficulty.

## Twist: Juno grows bigger
Every 5 coins Juno grows a step (up to 5 steps); her saucer and the crate she carries grow too (wider crates are easier to land, but the tower gets heavier and sways more). A missed crate makes her shrink back one step.

## Levels: planets
1. **Moon Base**: lavender-grey moon dust, Earth-like blue planet in the sky, low gravity (slow, gentle falls). Goal: 10 crates.
2. **Rusty Dunes**: a red-orange desert planet with two little moons; red dust drifts on the wind. Goal: 12 crates.
3. **Ring World**: the teal moon of a big ringed planet; floating ice crystals. Faster saucer. Goal: 14 crates.
4. **Comet Garden**: a pink-violet icy comet with glowing crystal flowers; shooting stars. Goal: 16 crates.
Reaching the goal plants a flag with a beacon on top; a rocket lands, then Juno flies to the next planet (new tower). After Comet Garden the planets loop, a bit faster each round (endless).

## Customisation
Change Pictures screen: Juno (hero), the crate (one picture for every crate), the star-coin, and each planet's background.

## Audience and platform
- Family-friendly: soft, round, smiling, nothing scary. The first planet must be easy for a 6-year-old (Easy: slow swing, wide crates, big perfect zone).
- Browser (GitHub Pages, iPhone/iPad touch) + portable Windows 11 exe. Original art and synthesized sound only.
