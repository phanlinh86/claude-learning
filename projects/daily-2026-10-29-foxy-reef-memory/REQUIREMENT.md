# Foxy's Reef Memory: game of the day, 2026-10-29

Rolled by `/build-game random` (seed = date). Ingredients:
genre **memory-match cards with a timer** · theme **coral reef** · hero **a little fox** · item **cupcakes** ·
twist **gentle gravity changes per level** · levels **four seasons**.
No element was swapped. The fox wears a bubble diving helmet so she belongs underwater.

## Pitch
Foxy the little diving fox explores a coral reef where sea creatures hide under clam-shell cards.
Flip two shells. If they match, the pair pops into a cupcake bubble that Foxy happily gobbles.
Clear the reef before her air runs out!

## Core loop
- A grid of face-down shell cards rests on the reef floor.
- The player flips two cards. A **match** stays open, plays a happy animation, releases a **cupcake** that Foxy swims over to eat (+points), and the pair is removed. A **mismatch** wiggles both cards, then flips them back.
- **Gravity twist:** each level has its own gentle "water gravity" direction. When a pair is removed, the cards in that row or column slide gently into the gap in that level's direction. Movement is slow and visible, so a sharp memory can follow it.
  - Spring: cards float **up** (buoyant).
  - Summer: still water, no sliding.
  - Autumn: a current pushes cards **sideways**.
  - Winter: cards sink **down**.
- **Timer = Foxy's air bubble meter.** Each match refills a little air. When the air runs out, Foxy surfaces and the game ends.
- Clearing the board goes to the next season, with more pairs: Spring 6, Summer 8, Autumn 10, Winter 12. After Winter it loops with less air, for endless play.

## Controls
- Mouse click or touch tap on a card.
- Keyboard: arrow keys move a highlight, and Space or Enter flips the card.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- +10 per match, with a combo multiplier for consecutive matches without a mistake (x2, x3…).
- An air-left bonus when a board is cleared.
- Cupcakes eaten are shown as a counter, and best score is saved.
- Lose when the air meter reaches 0.

## Seasons (distinct backgrounds + ambient animation)
- **Spring:** turquoise water with pink coral, drifting plankton sparkles and tiny fish schools.
- **Summer:** bright shallows with sun rays from the surface, clownfish-style fish (original design) and bubbles.
- **Autumn:** golden-orange kelp forest with drifting kelp bits and a sideways current.
- **Winter:** deep cool blue with falling "sea snow" and glowing jellyfish.

## Customisation
On the Change Pictures screen the player can replace:
- the hero (Foxy);
- the cupcake treat;
- the card back;
- each season's background.

## Audience and platform
- Family-friendly; kids can play. Easy mode starts with a 2-second peek at all cards and more air.
- Browser (GitHub Pages) + portable Windows 11 exe.
- Original art and synthesized sound only.
