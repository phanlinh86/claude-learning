# Rio's Singing Eggs — Mechanics (`SE.CONFIG`, rounds, demo, motion, events, render contract, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.4. The original
drum game's mechanics (still true wherever this file says nothing new) are in `docs/drums_ref/MECHANICS.md`.
Every number below is a key of `SE.CONFIG` (`game/js/world.js`) unless marked as a content table (`game/js/content.js`).

Tests: `node tests/unit/run.js [name part]` (62 tests, ≈ 40 s): layout on 16 viewports × 5 ages + 400 fuzzed viewports, ≈ 90 000
generated rounds (independent matcher + contour check), bounce physics, judging, beat mode, song, surprises, rotation, **the demo**
(timing / sparks / order, harmless taps, replay after a wrong, poke replay, beat demo, lanterns icon / hidden / now, rotation mid-demo),
determinism, full bot sessions per age 3–7 × 6 viewports with demos. Most judging tests build their world with `demo: false`
(`mkWorld`); `mkWorld({demo: true})` / `new SE.World()` play the demo.
Sim (report-only): `node tests/sim/hs_playtest.js [--n 20] [--ages 3,4,5,7] [--models typical,slow3,…] [--jobs 4] [--config '{…}']
[--tag x]` → `tests/sim/out/hs_<tag>.md` (git-ignored); exit 1 on a stuck round / state, NaN, an egg off screen, or **any judged event
during a demo**.

## 1. Conventions
Logical px (short side 720), seconds, radians, y DOWN, `tilt > 0` clockwise. Screen space = world space. `update(dt)` runs fixed
sub-steps of `step` 1/120 s (dt ≤ `maxFrame` 1 s); every moving field has a `_p` twin copied at the start of each sub-step → render
`v = _v + (v − _v)·w.alpha`. Same seed + same inputs on the same sub-steps → the same events at any frame size.

## 2. Round flow
`menu → intro (introTime 2.5) → round [enter → demo → play] → roundDone [song → out] → … → talk → levelDone (3.6) → … → sessionDone`.
- **enter** as the drum game (islands puff in 0.1 s apart, eggs fall in 0.14 s apart, land, ask ≥ `enterMin` 1.2 s).
- **demo** (`config.demo` true; `?nodemo=1` / tests: false → straight to play): Rio plays the tune from step `from` to the end.
  - Timeline: `demoStart` → lead (`demoLead` 1.3 s for the round's first demo, `demoLeadReplay` 0.9 s otherwise) → note k arrives at
    lead + `sparkTime` 0.45 + Σ gaps. Gap = `demoGap[age]` (3: 1.35 · 4: 1.25 · 5: 1.1 · 6: 0.95 · 7: 0.85) + `demoAnimalGap` 0.25 after an
    animal note; beat demo gap `demoBeatGap` 0.6. Each spark leaves `rioMouth()` sparkTime before its arrival (`spark` event), flies a
    parabola with its apex `sparkApex` 70 px above the higher end (never above ins.top + 8). On arrival: the egg is struck with kind
    `'demo'` (= song hop 26 px, ring 1, skin 1, animal eggs `sing`), the lantern swings, shows its icon 0.8 s (`demoShowIcon`) →
    `demoNote` (beat: `demoCount`, card.lit = k). `demoTail` 0.5 s after the last arrival → `demoEnd` → phase `play` → `ask {afterDemo}`.
  - Duration: first demo of n notes = 1.3 + 0.45 + (n − 1) × gap + 0.5 (age 4, 3 colours: 4.75 s); replay = 0.4 s shorter.
  - Rio: mood `beat` while a spark flies, `talk` 0.5 s after each arrival.
  - During the demo: `interactive` false, `answer()`, `hint()`, `prompt()` null; a touch on an egg = brush (`ring {brush}`), the sky =
    nothing (pointerDown → null), Rio = nothing; never soft / miss / hint / assist counts. A gesture that started in the demo stays a
    brush-only gesture after it (`g.demo`). Surprise timers and idle nudges pause (they run in `play`).
  - **Beat steps** each get their own demo: Rio sparks the big egg `need` times (card shows from the demo start, lights 1..need),
    `demoEnd` resets `card.lit` to 0 and the child counts (the card object is kept, no re-pop). The 2nd beat step's demo starts after
    the 1st step's `stepDone` gap (lead 0.9).
- **play** as the drum game (judge the core, brush the rim; beat taps; dots count run; hint / assist / idle).
  - **Wrong** in a find step: `wrong {…, replay}` (misses++), then after `replayDelay` 1.6 s a **replay demo** from the current step
    (remaining notes only: `demoStart {replay: true}`) — unless the hint glow / hand is on (2nd no-progress → hint as before, then no
    replay). A right note during the delay cancels it. A replay keeps `stepMisses` / `_noProg` (the hint still comes at the 2nd miss).
  - **Poke Rio** in play with the step open: if ≥ `pokeReplayCooldown` 3 s since the last demo ended → `pokeRio {replay: true}` +
    replay demo from the current step (beat: the count restarts); else `pokeRio {replay: false}` (repeat the question).
- **song / out / talk** unchanged (song wave left → right, volcano `cymbal` event 0.25 s after the last note, `songDone`, out).
- Chapter: `roundsPerLevel` 4; after ≥ `chapterMinRounds` 2 rounds a chapter past `chapterTimeLimit` **70 s** (was 75) goes to Talk
  time. A round starting later than `shortBudget` **[–, 26, 42, 56] s** (was 30 / 48 / 62) into the chapter is short (≤ 2 notes; beat
  1 step). Both tuned with the sim so a typical child's chapter stays ≤ 100 s (p90) with the demos.

## 3. Content (`content.js`, DESIGN §5.1)
- `SE.ANIMALS` = duck, chick, owl, frog, dino, snake. `SE.TOY_WORDS` (the 'initial' topic): EN duck, chick, owl, frog, dino, snake →
  D C O F D S (duck / dino share D: one per round); VI vịt, gà, cú, ếch, khủng long, rắn → V G C – K – (ếch = Ê, rắn = R are not in the VI
  letter pool, so VI initial rounds have ≤ 4 animals).
- **Tune length** = target eggs (`TUNE`, [lo, hi] per round index, the last repeats): age 3 [1] [1–2] [2] · age 4 [1] [2] [2–3] [3] ·
  age 5 [2] [3] · ages 6+ [3] [3–4]; short rounds ≤ 2. Caps: phones ages ≥ 5 ≤ 4 eggs; colours below 5 ≤ 3 colours (age 4 round 4 → 2
  + 1); VI initial pool 4. `oddeven` (findAll, age 7) keeps 2–3 targets + 1–2 others.
- **Distractors** (`distractorsFor`): warm-up none; age 3 one from round 3 (not chapter 1); age 4 one from round 2 (not chapter 1); 5+
  one from round 2; a 1-note tune always has one. Size rounds: 1 note → one of the big / small pair is the tune, its partner the
  distractor; 2 notes → the pair (+ a mid-size egg of another colour as the distractor).
- **Beat mode** (count, ages ≤ 4): one big egg; warm-up 1 step n ∈ {1, 2}; later 2 steps (1 when short) of distinct n ∈ 2–5 with one ≥ 3.
- **The tune** (`pickTune`): k distinct pentatonic notes (`SE.NOTES` C5 D5 E5 G5 A5 C6 D6) from a window k + 2 notes wide, ordered as
  a random `round.contour` 'up' | 'down' | 'updown' (k ≥ 3, peak inside) | 'one'. Beat mode: one note per step, same rule. Distractors
  get a free note. `validate` checks the contour (`contourOf`) and that every egg note differs. Exactly one matching egg per find step.

## 4. World fields the renderer draws (new / changed)
```
w.demo      null | { from, i (notes arrived), n, list [{id, step, k}], t, gap, lead, replay, beatN, mode 'tune'|'beat', first }
w.sparks[]  { x, y, _px, _py, vx, vy (flight velocity → trail direction), t, life 0.45, alpha 0..1 (fade-in 0.08 s),
              color (answer colour NAME | null = gold — like lantern.color), toId, i, lantern }   (≤ 6; only in the demo)
              → EggArt.drawSpark(ctx, x, y, size, { color: color ? PALETTE[color].light : gold, alpha, t })
w.lanterns[] { x, y, lit 0..1 (+_plit), color, swing (+_pswing), flash 0..1, icon: thing | null (beat mode → the card numeral),
              hidden: bool (age ≥ hiddenFromAge 6, not lit, not just played in the demo), now 0..1 (+_pnow; eases at 8 /s to 1 for
              the pod being sparked in the demo and for the next note in play) } → EggArt.drawGarland(ctx, layout.garland, lanterns, opt)
w.eggs[].sing 0..1   animal eggs: 1 on a demo / right / song strike, decays in singTime 0.9 s → drawEgg opt.sing = sing > 0
w.card       + step (the beat step it belongs to); shown during the beat demo (lit = sparks so far), reset to lit 0 at demoEnd
w.rio.mood   'beat' while a spark flies (rio_beat.svg = the blowing pose)
w.rioMouth() { x: rio.x + rioMouthX 0.22 × rio.w, y: rio.y − rioMouthY 0.72 × rio.h }  (rio.x = centre, rio.y = feet, rio.w = 0.62 h;
              tune the two fractions to the mouth point of rio_beat.svg in docs/art/rio_hand.json)
```
Everything else as `docs/drums_ref/MECHANICS.md` §3 (layout boxes, cushions = islands, garland = vine, cymbal = volcano, card = stone
tablet, notes, lamb = baby triceratops, bird, fireflies, hint hand). `layout.rio` / `rioBox` / `cymbal` / `cymbalBox` unchanged.

## 5. Events (every positional event carries x, y in logical px) — new / changed only
| event | payload | when |
|---|---|---|
| `round` | + `contour`, `demo` (bool) | the islands start to pop |
| **`demoStart`** | from, step, n (notes in this demo), replay, mode 'tune'\|'beat', need (beat), first (the round's first demo), x, y (Rio's mouth) | a demo starts: after enter, after a beat step's stepDone, a replay after a wrong, a poke replay |
| **`spark`** | id, i, n, x, y (mouth), x1, y1 (target), T 0.45 | a spark leaves Rio's mouth (whoosh) |
| **`demoNote`** | id, i (0-based in this demo), n, step, note, thing, color, lantern, nameKind, nameValue (find: the step's name; findAll: the egg's own), replay, x, y | a spark lands on a tune egg: it hops + sings, Rio names it |
| **`demoCount`** | id, i (1-based), n (= need), step, note, replay, x, y | beat demo: a spark lands on the big egg, the card lights dot i (say the number) |
| **`demoEnd`** | from, step, n, replay, mode, x, y (mouth) | 0.5 s after the last note; the `ask` follows in the same step |
| `ask` | + `echo: true`, `afterDemo` (the "Your turn!" ask), `replay` (the same step after a replay) | a step opens (first = the round's first ask only) |
| `wrong` | + `replay` (true when Rio will replay in 1.6 s) | after its dull `ring` |
| `pokeRio` | + `replay` (true: a replay demo starts right after); x, y = Rio's mouth | Rio tapped in play / enter |
No `ring` is emitted for demo strikes (`demoNote` / `demoCount` carry the note: play the egg's voice there). Taps during the demo emit
the usual `ring {brush, judged: false}`. All other events as the drum game (`eggIn`, `land`, `ring`, `right`, `count`, `beatNudge`,
`lantern`, `stepDone`, `soft`, `cymbalTap`, `hint`, `assistArmed`, `assist`, `idle`, `roundDone`, `songAsk`, `songNote`, `cymbal`,
`songDone`, `eggsOut`, `lamb`/`lambTap`, `bird`/`birdTap`, `fireflies`/`fireflyTap`, `talk`, `talkAsk`, `talkResult`, `levelDone`,
`sessionDone`). `right.lantern` = the note's place in the tune (findAll: the tapped egg's own pod). `w.songs[].notes` = the tune in step
order (any contour).

## 6. Test hooks
`eggHit(id)`, `rioHit()`, `cymbalHit()`, `stageHit()`, `lambHit()`, `birdHit()`, `fireflyHit()`, `answer()` (null during the demo),
`hint()` (null during the demo), **`demoInfo()`** → `{from, i, n, replay, mode, beatN}` | null, **`rioMouth()`** (`_rioMouth` alias kept).

## 7. SE.CONFIG keys added (demo)
`demo true, demoLead 1.3, demoLeadReplay 0.9, sparkTime 0.45, sparkApex 70, sparkFade 0.08, demoGap {3: 1.35, 4: 1.25, 5: 1.1, 6: 0.95,
7: 0.85}, demoAnimalGap 0.25, demoTail 0.5, demoBeatGap 0.6, replayDelay 1.6, pokeReplayCooldown 3, demoShowIcon 0.8, demoNowTail 0.35
(the pod's "now" after its spark lands), lanternNowRate 8, hiddenFromAge 6, singTime 0.9, rioMouthX 0.22, rioMouthY 0.72`.
Changed: `chapterTimeLimit 75 → 70`, `shortBudget [–, 30, 48, 62] → [–, 26, 42, 56]`.

## 8. Weather (`SE.Weather`, API unchanged)
Moods morning (valley mist, motes, a few crater embers) · noon (fern `leaf` particles on the breeze ×6, `butterfly` ×4, motes) ·
sunset (warm motes) · night (`firefly` ×11 tinted `#E8F7A0`, 4 crater embers). `fireAt(x, y)` = the volcano crater (main passes the
cymbal box top). Sky colours in `Weather.MOODS` belong to the environment artist.

## 9. Bot (`SE.Bot`)
As the drum bot, plus: **no touch while `world.phase === 'demo'`** (its think timer restarts after the demo).

## 10. Playtest (`hs_playtest.js --n 20 --ages 3,4,5,7`, 8 models, 576 sessions, 5 viewports, EN / VI, final CONFIG)
Exit 0: **0 failed / stuck rounds (> 120 s) / stuck states / NaN / eggs off screen; 0 judged events during demos** (spammer taps ≈ 16
times per demo — all brushes).
| model | age | session min (p90) | chapter s mean [p10–p90] | round s | demo s / round | replays / round | 3★ % |
|---|---|---|---|---|---|---|---|
| typical | 3 | 5.9 (6.4) | 86 [75–96] | 19.3 | 3.6 | 0.25 | 65 |
| typical | 4 | 6.2 (6.4) | 89 [81–100] | 20.5 | 4.2 | 0.16 | 75 |
| typical | 5 | 6.1 (6.4) | 87 [78–97] | 22.1 | 3.9 | 0.08 | 75 |
| typical | 7 | 5.8 (6.3) | 83 [67–94] | 18.8 | 3.6 | 0.03 | 84 |
| slow3 | 3 / 4 | 7.1 (8.0) / 6.9 (7.5) | 103 / 100 | 30 / 33 | 4.4 / 5.1 | 0.6 | 55 / 62 |
| bot0.8 | 3–7 | 4.0–5.3 | 57–76 | 12–17 | 3.1–4.2 | 0 | – |
| tapper / swiper / spammer | 3–7 | 4.8–6.7 (≤ 7.7) | 68–97 | 14–36 | 3.4–7.9 | 0.2–1.6 | – |
Max round 108 s (slow3 / swiper), absent: idles at 12 → 18 → 27 → 30 s after the ask, the round waits.

## 11. Deviations / notes for the lead
- Demo strikes emit no `ring` (avoid double sounds): main should play the egg's note on `demoNote` / `demoCount`.
- `pokeRio {replay: true}` is followed by `demoStart {replay: true}` in the same step: say "Listen again!" once, not the question.
- The cooldown for a poke replay counts from the end of the last demo (any demo), so "Your turn!" → an instant poke only repeats the
  question.
- Lantern `hidden` is recomputed every step (age ≥ 6); render just obeys it.
