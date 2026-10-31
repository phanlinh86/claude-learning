# Puppy Garden Catch · Cún Con Hứng Quà — requirement

Rolled 2026-10-30 (seed = date in America/Los_Angeles) with `roll.py 2026-10-30 4`:
mechanic **catch the falling answer with a basket**, theme **rainy-day garden**, helper **a puppy**,
weather **sunny → breezy → rain → rainbow**, age **4** (3–5), skills colours · shapes · counting 1–5 · animals.
No element swapped (the mix is coherent: a puppy with a basket in a garden where gifts float down in bubbles).

## Pitch
Pip the puppy stands in a garden with a big basket. Magic bubbles float down from the clouds, each carrying a ball,
a shape, a fruit or an animal. Pip says what to catch ("Catch the RED ball!" / "Bé ơi, hứng quả bóng màu đỏ nhé!");
the child drags (or taps) to move Pip under the right bubble. Pop! — it drops into the basket. No losing, ever.

## Learning goals by age (4 chapters, easiest first)
| age | chapter 1 (sunny) | 2 (breezy) | 3 (rain) | 4 (rainbow) |
|---|---|---|---|---|
| 3 | colours (2 in the air) | shapes (2) | big & small | animals (2) |
| 4 (default) | colours (3) | shapes (3) | counting 1–5 | animals (3) |
| 5 | shapes, mixed colours (4) | counting 1–10 | capital letters | animals by their sound (4) |
| 6 | capital ↔ small letters | first letter of a word | adding within 10 | counting to 12 |
| 7+ | adding within 20 | taking away within 10 | first letter | odd & even |

## Core loop
1. Pip speaks the target (voice + speech bubble). Tap Pip or the bubble to hear it again.
2. Bubbles drift down slowly with a gentle sway (wind pushes them sideways in the breezy chapter).
3. The child moves Pip: drag anywhere (Pip follows the finger left/right) or tap where he should run.
   Tapping a bubble makes Pip say its name (a tap is not a move-and-catch decision).
4. Bubble touches the basket → pops → item drops into the basket.
   - Right: basket bounces, sparkles, praise ("Yes! The red ball!"), counting rounds count aloud.
   - Wrong: the item hops back out, a new bubble carries it up and away; kind words ("That one is blue. Let's find red!").
   - A right item that reaches the grass bounces softly and floats back up to try again (never a loss).
5. After 2 mistakes the right bubble glows golden and slows down (auto-hint, cooldown 6 s).

## How a round ends
When the basket holds the needed number of right items (warm-up round: 1; then 2–3; counting rounds: N).
Stars per round: 3 with no wrong catches, 2 with one, 1 otherwise. Stars only go up.
4 rounds per chapter (after ≥ 3 rounds, Talk time starts once the chapter passed 75 s), 4 chapters, then a celebration
and "Play again". Target session ≤ 8 min.

## Voice lines (examples)
- EN: "Catch the red ball!", "Catch 3 strawberries!", "Quack quack! Catch the duck!", "Yes! Red!", "One… two… three!",
  "Oops, that's a blue ball. Let's find red!", "Look, it's glowing!", "Wonderful, {name}!"
- VI: "Bé ơi, hứng quả bóng màu đỏ nhé!", "Hứng 3 quả dâu nào!", "Cạp cạp! Hứng con vịt nhé!", "Đúng rồi! Màu đỏ!",
  "Một… hai… ba!", "Ồ, đó là bóng màu xanh dương. Mình tìm màu đỏ nhé!", "Nhìn kìa, nó đang sáng lên!", "Giỏi quá, {name}!"

## Talk time (one per chapter)
Pip shows a thing and asks; 3 big picture choices (2 for big/small and odd/even) + a mic button:
colours "What colour is this ball?", shapes "What shape is this?", counting "How many?", animals "Who says moo?",
big/small "Is it big or small?", letters "Which letter is this?", etc. Re-asks every 12 s, glows the answer after
the 2nd re-ask, stops speaking after 3.

## Parent settings
Hold ⚙ for 2 s: age 3 / 4 / 5 / 6 / 7+, language English / Tiếng Việt (also on the title screen), child's name,
sound, music, Pip's voice, answer by talking. Stored on the device only.

## Platform
Safari on iPhone and iPad, portrait and landscape, notch-safe, Add-to-Home-Screen icon; any desktop browser.
Plain HTML5 canvas + JS, served by GitHub Pages; no network after load, no ads, nothing leaves the device.
