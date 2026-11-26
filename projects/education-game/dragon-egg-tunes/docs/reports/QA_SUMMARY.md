# QA summary — Rio's Singing Eggs (2026-11-26)

## Functional QA (`tests/e2e/functional.js`, 4 devices + 10 bot sessions)
126/126 after adapting the suite to the demo phase: taps during the demo are harmless (real CDP touches), copy the tune →
right ×n → 3★, wrong → `wrong {replay}` → replay demo from the current step, 2nd miss → hint and no replay, poke Rio → replay
after the 3 s cooldown, beat demos with the stone tablet, rotation and pause mid-demo, voice log EN/VI (listen → names → your
turn, no raw keys), parent gate, `se:` storage, volume chain. No P1/P2. Fixed: P3-1 (`wrong.replay` flag set on the event
itself), P3-2 ("twice" for n = 2), P3-3 (stale CLAUDE.md).

## Visual QA (`tests/visual/screens.js`, ≈ 600 screenshots, 5 shapes × EN/VI × ages 3–7 × 4 moods)
Eggs sit inside their straw rings, nothing overlaps HUD/bubble, hit circles ≥ 100 css px, the spark starts at Rio's mouth.
Fixed: VI mic button overflow (P1), pods too small (P1: drawn radius 34 phone / 28 else, layout reserves the room), lilac UI
shell → straw/cocoa valley palette, letterbox colours, golden spark contrast + size, counting numeral beside the tablet in
portrait, beat pods show the number, sandy baby snake vs green froglet, triceratops never stops under an island, title
volcano/egg collision + iPad portrait title row, VI logo wrapping, pod colour vs morning sky, no cloud-land rainbow on the
done screen, portrait sun below the vine. Open (P3): iPad bubble a little tall, eggs could be ~20 % larger on iPad landscape,
duckling vs chick both pale yellow (beak and shape differ).

## High-speed playtest (`tests/sim/hs_playtest.js`, ≈ 9 000 sessions + real-page voice-flow runs)
0 stuck rounds / states, 0 judged events during demos (spammer ≈ 16 taps per demo, all brushes). Listening is ≈ 17–20 % of a
session; the longest stretch a child cannot act averages 4.4 s (p90 6.1 s). Age 4 typical: session 6.0 min (p90 6.4), chapter
87 s [76–96]. P1 fixed: VI note names fell behind the sparks → `demoGap {3:1.5, 4:1.4, 5:1.35, 6:1.05, 7:0.95}`, `demoLead 1.5`,
`demoLeadReplay 1.6`, `demoTail 0.9`, `introTime 3.5`, `chapterTimeLimit 68`, shorter wrong-again lines, "First, red!" cue
only at age 3 — real page VI: names dropped 4/19 → 0/16, "Your turn!" heard in full 3/11 → 9/9.
Open (P2, design choice): slow 3-year-old chapters p90 ≈ 120 s (session still ≤ 8 min); ages 5+ often play 3 rounds per chapter.
