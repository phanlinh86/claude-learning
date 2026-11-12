# Fix round after QA (2026-11-12)

This covers the findings in `qa_functional.md`, `qa_visual.md` and `qa_playtest.md`. Each line gives the finding, what changed, and how the change was checked.
Files changed: `game/js/{main,world,content,i18n,render,parade_art,ui,audio}.js`, `game/css/style.css`, `tools/art_animals.py`
(and the `animals/monkey*.svg` files it regenerated), the tests (`tests/unit/*.js`, `tests/e2e/functional.js`, `tests/visual/screens.js`,
`tests/sim/hs_voiceflow.js`) and the docs (`MECHANICS.md`, `VOICE.md`, `integration.md`, `CLAUDE.md`).

## Test results
| suite | result |
|---|---|
| `node tests/unit/run.js` | **39 / 39** (5 new tests: odd-slot spread, age-4 counting / colour balance, prompt + busy poke + hint flag, gate 2.5 s + Talk give-up 38 s, grand parade / wagon face / rooster) |
| `node tests/unit/i18n_voice.test.js` | **47 898 / 0** (new: `p.sizeBig`, length check on the first wrong wording, `sayWrongHint`) |
| `node tests/unit/parade_art.test.js` | **12 060 / 0** (new: pennant, mirrored pennant, `appleN`) |
| `node tests/e2e/smoke.js` | **PASS** iPhone portrait + landscape |
| `node tests/e2e/functional.js` (run alone) | **84 / 84** in 599 s |
| `TESTS=bo_tap_mid_count,bubble_tap_mid_hop,bubble_tap_enter node tests/qa/qa_touch.js` | **12 / 12** on 4 devices (all failed before) |
| `ONLY=ipp TESTS=pause_each_phase node tests/qa/qa_touch.js` | PASS; hop resume says "Yes! The purple flower is not red.", talk-answered resume says nothing |
| `ONLY=ipp node tests/qa/qa_extra.js` | double-tap Resume: **0 canvas events** on 4 devices (before: `soft` + no-progress) |
| `node tests/sim/pt_playtest.js --n 150 --ages 3,4,7 --models typical,nogate,pos1,leftfirst,careful --voice v3 --tag fix` | see the playtest rows below |
| `node tests/visual/screens.js` (now 6 devices incl. 360×780 and iPad Pro, with new hop / gate / night-colour / done shots and checks) | **no geometry issues** |

## Functional QA
| finding | change | verified |
|---|---|---|
| P1-1 Bo / bubble tap mid-hop re-asks and cuts the count run | `world.prompt()` returns null unless `interactive`. `_pokeBo` emits `{busy:true}` outside play / gate. main `pokeBo`: when not interactive, `bo.poke` plays only if nothing is speaking (it never interrupts). `repeatPrompt` requires `world.interactive && lastAsk` | qa_touch `bo_tap_mid_count` / `bubble_tap_mid_hop`: 4/4 + 4/4 PASS, said `[]` during `round/hop`. Unit test "prompt() only while answerable" |
| P2-1 bubble tap during enter says the question twice | `bubbleTap`: in the gate it says `gateShort` + shows the hand; otherwise it repeats only while interactive. `repeatPrompt` no longer builds a prompt from `world.prompt()` | `bubble_tap_enter` 4/4 PASS: the question is said once |
| P3-1 resume after a Talk answer re-asks | `resume()` asks only `if (!world.talkAnswered)` | `pause_each_phase` talk-answered: said `[]` |
| P3-2 pause in the hop loses the right line | main keeps `lastRight {text, count, name}`. On resume in `hop` it says the right line again (for a count run, the crate's name, since the apples are already lit) | `pause_each_phase` hop: "Yes! The purple flower is not red." |
| P3-3 double tap on Resume reaches the canvas | `blockInput()`: canvas `down` is ignored for 250 ms after Play / Play again / Resume | qa_extra: no events after a double-tap Resume on 4 devices |
| P3-4 name filter keeps the letters inside stripped tags | `ui.js cleanName`: removes `<tags>` and `{…}` placeholders, then any stray `<>{}`, collapses spaces, trims, max 16 characters (diacritics kept) | `Mầm Đức<b>{x}` → `Mầm Đức` (checked in node) |
| P3-5 timing-sensitive e2e tests | `functional.js`: new `waitEv` helper (waits for world events). `tap_wrong` runs at speed 0.25 during the double tap and waits for `wrong` / `wiggle` events. `rotate_mid_hop` runs at speed 0.15, waits until the layout changed, then asserts the member is still `hop`, then waits for `stage` | functional 84/84 (run alone) |

## Visual QA
| finding | change | verified |
|---|---|---|
| P1-1 hop apex goes behind the bubble | `hopMinY = max(ins.top + item + 10, bubbleBottom + 1.02·item + 16)` (a body bound, no longer a feet bound). Portrait stage `y ≥ hopMinY + 40` (arc room) but never lower than `line.y − item − 92·s − 8` | `screens.js` new mid-hop frame + check (body top vs bubble where x overlaps): **0 issues on 6 devices**. Layout table: iPad Pro portrait room 40 px (stage 429), iPad portrait 95, iPad landscape 81, iPhone landscape 82. Looked at `pro-p-vi-1a-hop.png`: the bucket arcs well below the bubble |
| P1-2 Bo covers the first member on iPad landscape with 5 members | landscape `x0 = max(bo.x + 120, boBox right + 0.62·item)`, so with 5 members the item-100 tier takes over | iPad landscape age 7, 5 members: first body left edge 212 vs Bo box right 199 (before: 13 % covered). `screens.js` Bo-cover threshold 12 % → 5 %: 0 issues. Looked at `pad-l-age7-oddeven-r3.png`: "12" is clear of Bo |
| P2-1 apple size gives the count away | `drawCrate` takes `opt.appleN` and uses the radius of `appleLayout(appleN)`. render passes the round's largest n | Looked at `pad-l-age4-count-r2.png`: the 3-apple and 5-apple crates have the same apple size. Art test `appleN` |
| P2-2 portrait 5-member size | `linePortSide 64`, `portX1Door −40` (x1 = door.x + 40) → **item 120** for 5 members on 393×852, 360×780, 820×1180 (was 100; age 6: 116). New `x1Clear = door.l − 0.5·item − 4`: k members that fit left of it at spK stand there, so after the gap closes the doors are free | gate screenshots `ip-p-age4-colors-r3-gate.png` / pad-p: rightmost member edge 561 < door.l 568. `screens.js` gate check "member covers the barn doors": 0 issues. Unit test "doors clear". **Limit:** while a 5-member round is played, the 5th member still stands in front of the doors. Five 120-px members plus the barn do not fit in 720 px |
| P2-3 landscape celebration panel hides the parade | landscape `#scrDone`: a compact top-centre grid (title + stars, then the two buttons side by side) | `ip-l-vi-7-done.png`: the panel spans 2–38 % of the height, and the barn, vane, path and marching friends are visible. `screens.js` check (panel vs doors / path): 0 issues |
| P2-4 rooster on the roof / vane | `_roosterSpot` skips x within barn ± roosterR when the fence is less than 120 px above the barn top | unit test over 18 viewports × 20 spots |
| P2-5 letter pennant in first-letter rounds | `drawPennant` draws a cream flag on a stick at the member's back, with an un-mirrored letter. render passes it when `rule.kind === 'initial'` | `pad-l-age6-initial-r2.png`: P P H P P flags. Art tests. **Design note:** the flags make the odd one visible by letter alone (see "Not done") |
| P2-6 low contrast (yellow on the day path, purple at night) | cream sticker outline (`LW + 6`, `#FFF8EA`, α 0.9) behind every painted member (obj / block / crate / tile). It turns to the warm rim `#FFD38A` at night | `pad-l-en-4n-night-colors.png`: purple and yellow flowers both clearly outlined on the night path |
| P3-1 hay lit at night | `drawStage`: a multiply `#B9A6A0` × 0.45·night layer over the bale (the rim stays warm) | night shot: the bale is dimmed, not a lamp |
| P3-2 hay stage floats | trestle legs (16 px) plus a contact shadow, `stageBale` 92 in the layout | `pro-p-vi-1a-hop.png`: the bale stands on legs with a shadow |
| P3-3 wagons flip when closing the gap | wagons keep `face = 1` | unit test (2 s of gap closing) |
| P3-4 vane looks like a broken stick | cos clamp ±0.08 → ±0.25, plus a warm night rim (3 offset shadow passes) | night shots: the vane reads against the sky |
| P3-5 monkey leg | the near leg is drawn before the body (its hip hides under the belly) and `animals/monkey*.svg` were regenerated (the other files are byte-identical) | rendered frames: the parallelogram is gone |
| P3-8 one-line bubble in a 3-line box | `#bubble` min-height = 55 % of the reserved box | `pro-p-vi-1a-hop.png`, `ip-p-…-gate.png`: short bubbles |
| P3-9 bubble grows past its box | `_fitBubble` shrinks the font (min 13 px) until the bubble fits the box the world reserved | no "bubble text overflows" in `screens.js` (6 devices × EN/VI) |
| P3-10 VI wrapping | `text-wrap: balance` on the logo spans and the Talk title. At ≤ 380 px wide, smaller chips (52 px, 0 12 px padding) | `and-p-vi-0-title.png`: "Cún Bo / Tìm Bạn / Lạc Đàn" |

## Playtest
| finding | change | verified (sim, 150 sessions/model, ages 3 / 4 / 7) |
|---|---|---|
| P1-1 the odd slot can be guessed | `buildRound`: `rng.pick` over all slots, excluding only a slot that held the odd one in both of the last 2 rounds (`prevOddSlots`, reset per session). The 55 % inner rule and the "never the previous slot" rule are removed | spread at age 4: n=3 33/34/33, n=4 24/24/24/28, n=5 18/21/19/20/21. "Inside, not last" exploit **59.3 → 28.9 %** (chance 27.8). Always-2nd 27.5 %. Same slot twice in a row 20.9 %, never 3. Unit test: each slot within ±3 points of 1/n over 6 000 rounds |
| P1-2 nobody touching → > 8 min | `talkGiveUp 12 → 2` (re-ask every 12 s, glow from the 2nd re-ask, quiet after the 3rd; Bo answers 2 s later, so an unanswered Talk lasts 38 s). New `gateWaitAfterAuto 2.5` | nogate: **age 3 7.7 min (p90 7.9), age 4 7.5 (7.7), age 7 7.3 (7.5)** (was 8.4–8.6). Typical age 4: 5.2 min, unchanged |
| P1-3 talk load | `ask`: `.first` only in round 0. `roundDone`: no line. `parade`: one praise only after a missed round or in round 3. No march line. `gateAsk` is spoken only in chapter 1 round 0; `gateHint` → `gateShort` only in chapter 1; later gates are silent. `gateHandAfter 1.2 → 2.0` | speech model (v3 = this policy), typical age 4: **62.3 % talking, 13.1 lines/min** (was 83.5 % / 18.1). Question heard in full before the first tap 72.9 % (was 18.9). Gate line after the doors opened 0.72 per session (was 12.1). e2e bot sessions: 56–63 voice lines per session |
| P2-1 hint line almost never heard | the miss that triggers the hint (`wrong.hint` flag from the world) says one short pointer line (`sayWrongHint`: "The boot, like its friends! Look at the glowing one!"). Other hints (3 soft presses, or a rate-limited wrong line) use `priority: true` | unit test (flag on the 2nd miss). i18n tests. The sim's speech model still replays the old hint (it does not know about `sayWrongHint`), so its "hint dropped" column is not meaningful now |
| P2-2 long wrong lines | the first wording of every `wrong.*` is shortened in EN and VI (e.g. "The boot is red like its friends! Which one isn’t red?" (54), "Chiếc ủng màu đỏ giống các bạn! Bạn nào khác màu nhỉ?" (53)). Each still names the tapped thing, says it matches its friends, then gives the goal | i18n test: first wording ≤ 58 characters for 10 typical rule × member cases in both languages. Longest typical lines: EN 57, VI 57. Long names can still reach 68 ("The watering can is purple…") |
| P2-3 the same wild animal / odd colour in a chapter | `usedOdd` per chapter (world), `round.oddValue`. `farm` and `colors` pick from the values not used yet | sim: same odd colour / wild animal in a row **0.0 %** (was 15.9 / 24.4). Unit content sweep: never twice in a chapter |
| P2-4 the same ceremony every round | round 3 is the grand parade: `parade {grand}`, Bo `dance` 2.2 s, `fanfareBig` (the fanfare plus a second rising phrase and a bark), 40 confetti pieces with a 2.6 s life, 24 sparkles | unit test (grand in round 3, not in round 1). Audio list in functional `audio_chain` includes `fanfareBig` |
| P3-1 oval / diamond at age 4 | `shapesFor(4)` = circle, square, triangle, star, heart, rect | content sweep asserts no oval / diamond at 4 |
| P3-2 age-4 counting has too many apples | `countFor(…, topic)`: age-4 `count` uses 3 3 4 4 | unit test. Sim count gap at age 4: mean 2.52, gap 2 in 62 % |
| P3-3 always the same opening chapter | `topicsFor`: chapter 1 alternates between the pool's 2 easiest topics. The left-out topic stays among chapters 2–4, which are sorted easiest first | sim: same 1st topic as last session **0 %** (was 65 %). Unit test |
| P3-4 odd colours unbalanced | the odd colour is picked first (uniform, not used yet), then a friends' colour without a clash | unit test: each of the 6 colours is odd in > 11 % of 3 000 age-4 rounds |
| P3-5 size rounds always ask for the little one | rounds 1 and 3 ask "Which one is the big one?" (`p.sizeBig`, rule size = small, one big among little ones), EN + VI, 3 wordings + `.first` | i18n + content tests |

## Other
- `tests/sim/hs_voiceflow.js`: the stale `'ring'` event (from the chime game) became the first `right` / `wrong` event, so "question heard before the first touch" is measured again.
- Docs: `MECHANICS.md` (CONFIG table, layout table, events, content), `VOICE.md` §1.1 (new line policy table + keys), `integration.md`, and the voice-rule line in `CLAUDE.md`.

## Not done / notes
- **Portrait 5-member play**: the 5th member stands in front of the barn doors while the round is played. The doors are clear once the gap closes, which is the only time they are needed. Getting ≈ 120-px members and visible doors at the same time is not possible on a 720-logical-px-wide screen.
- **Letter pennants** (P2-5, as asked): they show each member's initial, so a child can find the odd one by letter shape alone without saying the names. If that is too easy, show them only after the first miss or with the hint. That is one condition in `render.js` (`pen`).
- The playtest sim's speech model (`--voice v3`) approximates the new policy. It does not model `sayWrongHint` or the priority hint, so it under-reports the hint being heard.
- Not requested and not changed: visual P3-6 (wind pump behind the iPad portrait bubble), P3-7 (empty tall-portrait sky), P3-11 (done-screen crab drawn over the door frame), P3-12 (CVD margins, informational).
- Real-device TTS / audio is still unverified (headless Chromium only).
