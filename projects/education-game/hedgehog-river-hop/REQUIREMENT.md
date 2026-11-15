# Nim's River Hop · Nhím Nim Nhảy Đá Qua Suối — requirement (2026-11-15)

Rolled with `/build-education-game random 4` (seed 2026-11-15, America/Los_Angeles): mechanic **stepping stones: hop across
the river by tapping the next stone in order** (family *path*), theme **bakery kitchen**, helper **a hedgehog**, weather
**spring → summer → autumn → winter**, age 4 → colours · shapes · counting 1–5 · animals (homes).
Recent families avoided: build, container, pop, seek, trace.

**Swap (one element): theme bakery kitchen → woodland brook.** A bakery kitchen has no river to hop across, and it would
be a near copy of yesterday's Candy Village cake game. A little brook in the woods through the seasons fits a hedgehog and
the stepping-stone mechanic.

How it feels different from the last games: no dragging (Koko's Cake Tower was drag-up-and-drop), nothing pops (Bao's
Bubble Sky), nothing goes into a container. The gesture is **tap the next stone to hop**: Nim jumps with a real ballistic
arc, the stone dips into the water and ripples spread. The screen is a **river crossing**: near bank → 2–4 rows of stones →
far bank. The reward animation is new: on the far bank Nim **curls into a ball, rolls over an apple and it sticks on his
spines**; his back fills up with fruit through the chapter. The stones he stood on glow into a **golden path** behind him.

## Pitch
Nim the little hedgehog wants to cross the brook to reach the apples on the other side. Stones lie in the water, each with
something on it: a red flower, a blue mushroom, a star cookie, a little duck. "Hop on the RED ones!" Tap the right stone in
the next row — boing! Nim leaps, the stone dips, splash, ripples. Row by row he crosses, then rolls into a spiky ball and
picks up an apple on his back. Blossoms in spring, dragonflies in summer, leaves floating downstream in autumn, snow in winter.

## Learning goals by age (4 chapters, easiest first; one season each)
| age | chapters |
|---|---|
| 3 | colours (2) · shapes (2) · big & small · animals (name / farm vs not) |
| 4 (default) | colours (3) · shapes (3) · counting 1–5 (hop the numbers in order 1 → 2 → 3, or "the stone with 4 dots") · animal homes (3) |
| 5 | shapes with mixed colours (4) · counting 1–10 · capital letters · animal homes (4) |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even |

## Core loop
1. **rise** — stones rise out of the water row by row with a splash (staggered, overshoot bob). Nim waits on the near bank.
   Warm-up round: 2 rows of 2 stones.
2. **play** — Nim asks (voice + bubble text). The child taps a stone in the NEXT row (only that row is active and gently
   glows its outline).
   - right → Nim crouches and hops (arc), lands with a squash, the stone dips and bobs, ripples + droplets, Nim names the
     thing ("A red flower!"). Count rounds count aloud. The stone turns golden. The other stones of that row sink away.
   - wrong → the stone wobbles and bobs (a "no-no" wiggle of the thing), Nim leans "hmm?"; kind words name it and repeat
     the goal. Nim never falls in.
   - a stone further ahead → a little ripple, Nim says "One at a time!" (not a mistake); water/bank → ripple; Nim → giggle +
     repeats the question.
3. **bank** — after the last row Nim hops onto the far bank, curls into a ball, rolls over the apple (or pear / berry /
   mushroom) and it sticks on his spines, uncurls, cheers. Stars fly to the HUD.
4. **wipe** — a seasonal swirl (petals / leaves / snow) sweeps across; the next crossing appears, Nim on the near bank.
5. After 4 rounds (or ≥ 3 once the chapter passed 75 s): **Talk time** — one question, 2–3 big picture choices + mic.
6. 4 chapters → celebration (Nim dances with a back full of fruit, fireflies / confetti) → Play again.

Counting: rounds 0 and 2 **count in order** ("Hop 1, 2, 3!") — each row has the next number (dots + numeral) among others;
rounds 1 and 3 **pick the number** ("Hop on the stones with 4 dots!") — every row has one stone with that many dots.

## Stars
3 per round with no mistake, 2 with one, 1 otherwise; +1 for a right Talk-time answer. Assisted rounds ≤ 2★. Stars only go up.

## Kindness rules
No fail state, no timer pressure. After 2 mistakes the right stone glows and the ghost hand taps it. Hint cooldown 6 s;
idle nudges after 12 s, back off ×1.5 up to 30 s. Surprises (one round per chapter, never the warm-up): a **fish** leaps
over the water (tap → it flips and splashes), a **frog** on a lily pad (tap → it croaks and hops), in winter big
**snowflakes** (tap → they twinkle). Never a mistake.

## Voice lines (examples)
- EN: "Let's cross the brook! Hop on the RED stones!", "Hop on the red ones!", "A red flower! Next row!", "That's a blue
  mushroom. Find a red one!", "Hop 1, 2, 3!", "One! Two! Three!", "Hop on the stones with 4 dots!", "Who lives on the
  farm? Hop on them!", "One at a time!", "Yum, an apple! Great job, {child}!"
- VI: "Mình qua suối nào! Bé chọn hòn đá có màu ĐỎ nhé!", "Bông hoa màu đỏ! Hàng tiếp theo nào!", "Đây là cây nấm màu xanh
  dương. Mình tìm cái màu đỏ nhé!", "Nhảy 1, 2, 3 nào!", "Một! Hai! Ba!", "Từng hòn một thôi bé ơi!", "Ai sống ở nông
  trại? Bé nhảy lên nào!", "Ôi, quả táo! Giỏi quá!"

## Talk time (one per chapter)
colours "What colour is this?" (paint blobs) · shapes "Which one is the {shape}?" · count "How many dots?" (numerals with
dots) · animals "Where does the {animal} live?" (home badges; age 3 "Who is this?"). Picture choices for ages ≤ 5.

## Parent settings (hold the gear 2 s)
Age 3–7+, language EN / VI (also on the title), child's name, sound, music, voice, microphone, volume (default 100 %).

## Platform
iPhone and iPad Safari (portrait and landscape, safe areas, Add to Home Screen) and any desktop browser. GitHub Pages,
no network after load, no data leaves the device, original art and synthesized sound only.
