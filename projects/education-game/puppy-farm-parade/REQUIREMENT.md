# Bo's Farm Parade · Cún Bo Tìm Bạn Lạc Đàn — requirement (2026-11-12)

Rolled with `/build-education-game random 4` (seed 2026-11-12, America/Los_Angeles). Yesterday's game (Tuk's Ice Match,
PR #40, *memory*) is not merged yet, so its index row and its `roll.py` fix (chime/bell/sing → *music*) were applied before
rolling; otherwise the roller would have repeated *memory* and *music*. Roll: mechanic **treasure dig: tap the sand to find the
answer** (family *seek*), theme **sunny farm**, helper **a puppy**, weather **morning → noon → sunset → starry night**, age 4 →
colours · shapes · counting 1–5 · animals. Recent families avoided: build, container, memory, music.

**One swap (mechanic, same family):** *treasure dig* → **odd one out** (`seek`: "a row of things, tap the one that does not
belong"). Reason: a dig game shipped four days ago (Bun's Dino Dig, 2026-11-08) and Mầm's Treasure Reef is also a dig;
odd-one-out has never been made, so the core loop really is new.

How it feels different from the last games: no flipping (yesterday), no hanging chimes, no dragging. The layout is **a parade
line marching along a farm path into a barn**; the gesture is **tap (or flick) the one that doesn't belong** — it boings out
of the line in a big hop onto a hay-bale stage; then the child **taps the barn doors** and the matching friends **march in
step into the barn**. The reward is the parade itself (synchronised hops, a weathervane spin and a star burst from the barn).

## Pitch
Bo the puppy is the farm's parade leader. A little parade marches in along the path — buckets, boots and toy tractors on
wooden wagons, shape blocks, apple crates or farm animals. "They're all red… but one! Which one is NOT red?" The child taps
the odd one: Bo barks "Woof!", the odd one hops out onto the hay bale, the others close the gap. "Open the barn!" — the doors
swing open and the parade hops inside in step. The day passes from a misty morning to a starry night with fireflies.

## Learning goals by age (4 chapters, easiest first)
| age | chapters |
|---|---|
| 3 | colours (3 members, 2 colours) · shapes (3) · big & small ("Which one is the little one?") · animals (2 the same + 1 different animal) |
| 4 (default) | colours ("not red": 3–5 members) · shapes ("not a circle") · counting 1–5 (apple crates: which crate has a different number; counted aloud) · animals (who does not live on the farm → it hops to its home) |
| 5 | shapes with mixed colours (odd shape among many colours) · counting 1–10 · capital letters (odd letter) · animals (4–5 members) |
| 6 | capital ↔ small letters (Aa aA a + one other letter) · first letter of a word · adding within 10 (all make 5 but one) · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even (all even but one) |

## Core loop
1. **enter** — the parade marches in from the left behind Bo, one member after another (animals walk with a bouncy step,
   objects ride little wooden wagons with spinning wheels), each springs into its place on the path. Warm-up round: 3
   members; then 4, 4, 5 at age 4 (first chapter 3, 3, 4, 4). Exactly ONE member is different (content self-checks).
2. **play** — Bo asks (voice + bubble). The child taps a member (a flick starting on it counts the same).
   - The odd one → **right**: Bo barks, the member boings out of the line in a ballistic hop and lands on the hay-bale stage
     with a squash; its name is said ("The blue bucket! It's not red."). Crates: Bo counts its apples aloud. Animals that
     don't live on the farm show their home badge (sea / ice / jungle / savanna). The others close the gap with springy steps.
   - A matching member → **wrong**: it does a little "no-no" wiggle and a small hop in place; Bo says kind words naming it
     ("That one is red, like its friends. Find the one that's not red!"). Counts as a mistake (stars only). Taps on empty
     ground → nothing but a tiny dust puff.
3. **gate** — "Open the barn!": a ghost hand points at the barn doors; tap the doors (or any member) → the doors swing open.
   After 4 s without a tap they open by themselves.
4. **march** — the friends hop into the barn in step (count of steps synchronised), Bo cheers, the weathervane spins, stars
   burst from the barn roof and fly to the HUD. The odd one waves and hops off the other way (to its home if it is an
   animal). The doors close.
5. After 4 rounds (or ≥ 3 rounds once the chapter passed 75 s): **Talk time** — one question, 2–3 big picture choices + mic.
6. 4 chapters (morning, noon, sunset, night) → celebration (all the friends parade out of the barn, Bo dances, confetti) → Play again.

## Stars
3 per round with no mistake, 2 with one, 1 otherwise; +1 for a right Talk-time answer. Stars only go up. An assisted round ≤ 2★.

## Kindness rules
No fail state, no timer. After 2 mistakes the odd one glows and the ghost hand taps it. Hint cooldown 6 s; idle nudges after
12 s, back off ×1.5 up to 30 s. Tapping Bo repeats the question. Surprises (one round per chapter, never the warm-up): a **chick**
scurries in and joins the end of the parade (tap → it peeps and flaps; it marches into the barn too), or a **rooster** stands on
the fence (tap → "cock-a-doodle-doo!"); at night **fireflies** come close (tap → they twinkle).

## Voice lines (examples)
- EN: "They're all red… but one! Which one is NOT red?", "The blue bucket! It's not red.", "Woof! You found it!",
  "That one is red, like its friends. Find the one that's not red!", "Which crate has a different number of apples?",
  "One, two, three, four apples! The others have two.", "Who doesn't live on the farm?", "The penguin lives on the ice!",
  "Open the barn!", "Hop, hop, hooray! Great parade, {child}!"
- VI: "Các bạn đều màu đỏ… trừ một bạn! Bạn nào không phải màu đỏ?", "Cái xô màu xanh dương! Nó không phải màu đỏ.",
  "Gâu gâu! Bé tìm ra rồi!", "Bạn này màu đỏ giống các bạn kia. Mình tìm bạn không phải màu đỏ nhé!",
  "Thùng nào có số táo khác các thùng kia?", "Một, hai, ba, bốn quả táo! Các thùng kia có hai quả.",
  "Bạn nào không sống ở nông trại?", "Chim cánh cụt sống ở xứ băng!", "Bé mở cửa chuồng nào!", "Nhảy nhảy, hoan hô! Đoàn diễu hành tuyệt quá!"

## Talk time (per chapter)
Show one member and ask "What colour is this?" / "Which one is the triangle?" / "How many apples?" / "Where does the
penguin live?" with 2–3 picture choices (pictures for ages ≤ 5: swatches, shapes, numerals with dots, home badges) + optional mic.

## Parent settings (hold the gear 2 s)
Age 3–7+, language EN / VI, child's name, volume, sound effects, music, Bo's voice, answer by talking.

## Platform
iPhone and iPad Safari (portrait + landscape, safe areas, Add to Home Screen), any desktop browser. GitHub Pages, no network
after load, original SVG / canvas art and synthesized sound only, nothing leaves the device.
