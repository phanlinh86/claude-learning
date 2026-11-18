# Gigi's Peekaboo Windows · Hươu Gigi Mở Cửa Sổ — requirement (2026-11-18)

Rolled with `/build-education-game random 4` (seed 2026-11-18, America/Los_Angeles): mechanic **jigsaw: drag pieces into the
matching shadow** (family *build*, printed `build+container` because the text says "into"), theme **busy city street**,
helper **a giraffe calf**, weather **sunny → breezy → rain → rainbow**, age 4 → skills colours · shapes · counting 1–5 · animals.
Recent games: Bo's Farm Parade [seek+container], Bao's Bubble Sky [trace+pop], Koko's Cake Tower [build], Nim's River Hop
[path+container], Moka's Fairy Tea Party [music+seek+container], Tibo's Dino Lake Fishing [pop+container].

**One swap (allowed by the skill):** mechanic *jigsaw* → **memory: open two windows to find a matching pair** (the roller's
own deterministic re-roll `--salt mechanic=c`, family *memory*). Reason: *jigsaw + busy city street* is exactly
Pom's Puzzle Town (2026-11-09, a jigsaw on a little town street), and a drag-into-a-shadow loop is the "dropping something
into something" pattern the parents asked us to ration (container already in 4 of the last 6 games). Memory was last used
on 2026-11-01 (Dee's Forest Memory, a card grid in a forest) — this one must feel different:
- the "cards" are **windows of a city apartment building** with wooden **shutters that swing open on hinges** (two doors,
  spring + overshoot), not cards that flip;
- **Gigi the giraffe calf stretches her long neck** up to peek into every window that opens (a springy neck that follows);
- a found pair **lights up**: warm lamp light, a flower box blooms under both windows, the two things inside bounce;
- a finished building **celebrates** (all windows glow, bunting and confetti from the roof) and then **the street scrolls**:
  Gigi trots along the pavement to the next building (parallax shops, lamp posts, traffic);
- the weather moves through a city day: sunny → breezy (kites, flapping awnings, leaves) → rain (rain on the windows,
  puddles, cosy lit windows) → rainbow.

## Pitch
Gigi the giraffe calf lives on Peekaboo Street, where every building has windows with little wooden shutters — and behind
each pair of shutters something is hiding. Gigi is so tall she can peek into any window! Tap a window: the shutters swing
open, Gigi stretches her neck to look and says what's inside ("A red umbrella!"). Find the other window with the same
thing and both windows light up and bloom with flowers. Open every pair and the whole building cheers — then off down the
street to the next one.

## Learning goals by age (4 chapters, easiest first; one weather per chapter)
| age | chapters (pairs) |
|---|---|
| 3 | colours (same thing, same colour) · shapes · big & small (the same animal big and small) · animals (two the same) |
| 4 (default) | colours · shapes · counting 1–5 (numeral ↔ that many dots) · **animal homes** (the animal ↔ its home: dog ↔ kennel, bird ↔ nest …) |
| 5 | shapes in mixed colours · counting 1–10 · capital letters · animal homes |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
| 7+ | first letter · adding within 20 · taking away within 10 · odd & even |
Topics rotate between sessions (≥ 5 per age, chapter 1 always the easiest).

## Core loop
1. A building slides in. Its windows open in a wave for a short **peek** ("Look carefully!") and close again ("Now they
   hide!").
2. The child taps a window: the shutters swing open, Gigi's neck stretches towards it, and she names what's inside.
3. Second window: same thing (pair) → both glow, flower boxes bloom, a two-note chime, Gigi happy-hops and says the pair
   ("Two red umbrellas!", "The dog lives in the kennel!", "Three — one, two, three!"). Different → both things wiggle,
   Gigi says kindly what they were ("An umbrella and a kite. Let's look again!"), the shutters close after a moment.
   Impatient third tap closes the two at once.
4. All pairs found → the building cheers (confetti from the roof), stars, Gigi trots to the next building.
5. After 4 buildings (or ≥ 3 and the chapter passed 80 s): **Talk time** — one question, 2–3 big picture choices + mic.
6. 4 chapters → celebration (the whole street lights up, rainbow, every building waves) → Play again.

## Stars
3 per round with few mismatches (≤ max(1, pairs − 1)), 2 with ≤ 2 × pairs, 1 otherwise; +1 for a right Talk answer. Only up.

## Kindness rules
No fail state, no timer. 3 mismatches in a row → one unfound pair glows and peeks open a crack. Idle nudges after 12 s,
backoff ×1.5 up to 30 s. Tap Gigi or the bubble to hear the question again. Surprises (one round per chapter, never the
warm-up, never a mistake): a **pigeon** lands on a window sill (tap → it coos and flutters off), a little **bus** rolls by
(tap → "beep beep!", passengers wave), a **balloon** floats up past the windows (tap → it twirls up with sparkles).

## Voice lines (examples)
- EN: "Find two windows that match!", "Find the colour pairs!", "Match the number with the dots!", "Who lives where? Find
  each animal's home!", "A red umbrella!", "Two red umbrellas — a pair!", "An umbrella and a kite. Let's look again!",
  "The bird lives in the nest!", "Look carefully!", "Now they hide!", "What a bright building, {child}!", "Rain! The windows
  are cosy.", "A rainbow over the street!"
- VI: "Bé ơi, tìm hai cửa sổ giống nhau nhé!", "Cái ô màu đỏ!", "Hai cái ô màu đỏ — một đôi!", "Cái ô và con diều. Mình
  xem lại nhé!", "Con chim sống trong tổ chim!", "Bé nhìn kỹ nhé!", "Giờ chúng trốn rồi!", "Ngôi nhà sáng rực rồi, {child}
  giỏi quá!", "Mưa rồi! Cửa sổ ấm áp ghê.", "Cầu vồng trên phố kìa!"

## Talk time (per chapter)
"What colour is this umbrella?", "Which one is the triangle?", "How many dots?", "Where does the bird live?" (home
pictures) — 2–3 picture choices for ages ≤ 5, optional mic.

## Parent settings (hold the gear 2 s)
Age 3–7+, language EN / VI, child's name, volume, sound effects, music, Gigi's voice, answer by talking.

## Platform
iPhone and iPad Safari (portrait + landscape, safe areas, Add to Home Screen), any desktop browser. GitHub Pages, no
network after load, original SVG / canvas art and synthesized sound only, nothing leaves the device.
