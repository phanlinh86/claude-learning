# Playtest tables — tapbase (120 sessions, 0 absent-child runs; config {})

## Durations (game seconds)

| driver | age | n | done | session mean / p90 / max | ≤ 8 min | chapter mean / p10 / p90 / max | chapters 60–100 s | > 100 s | rounds / ch | round mean / p90 / max | stuck | err |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tapper | 3 | 20 | 100.0% | 625 / 816 / 875 | 15.0% | 156 / 103 / 237 / 338 | 7.5% | 92.5% | 3.0 | 47.6 / 89.0 / 192 | 0 | 0 |
| tapper | 4 | 20 | 100.0% | 1026 / 1621 / 1832 | 0.0% | 257 / 109 / 432 / 835 | 7.5% | 92.5% | 3.0 | 80.5 / 160.2 / 426 | 3 | 0 |
| tapper | 5 | 20 | 80.0% | 1397 / 1971 / 2334 | 0.0% | 389 / 131 / 684 / 1290 | 5.3% | 94.7% | 3.1 | 127.6 / 256.3 / 557 | 18 | 0 |
| spammer | 3 | 20 | 100.0% | 199 / 219 / 227 | 100.0% | 50 / 38 / 62 / 73 | 15.0% | 0.0% | 4.0 | 9.4 / 16.4 / 26 | 0 | 0 |
| spammer | 4 | 20 | 100.0% | 277 / 299 / 318 | 100.0% | 69 / 29 / 97 / 128 | 66.3% | 3.8% | 3.8 | 15.0 / 29.7 / 53 | 0 | 0 |
| spammer | 5 | 20 | 100.0% | 340 / 377 / 422 | 100.0% | 85 / 39 / 126 / 167 | 47.5% | 27.5% | 3.6 | 20.5 / 39.8 / 84 | 0 | 0 |

## Per-topic round time, child models (mean / p90 s)

| age | topic | typical | toddler | slow3 | dropsHighRim |
|---|---|---|---|---|---|


## Help, stars, input, Talk (all ages pooled per driver)

| driver | hints / round | rounds with a hint | min hint gap s | idle / session | min idle gap s | stars / session | rounds 3★ / 2★ / 1★ | wrong / drop | miss / drop | taps (→ drop) | quick flicks | Talk right |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tapper | 9.74 | 95.9% | 6.0 | 0.0 | – | 19.8 | 21.8% / 8.3% / 69.9% | 13.0% | 42.7% | 15530 (0) | 8262 | 31.8% |
| spammer | 1.86 | 81.8% | 6.0 | 0.0 | – | 24.4 | 22.7% / 5.5% / 71.8% | 27.8% | 22.6% | 7294 (0) | 15108 | 37.1% |

## Invariants (checked every 4th update while a round is on screen)

| driver | checks | resting seed outside screen | resting seeds overlap | resting in a drop zone | home unreachable (HUD/Lumi/edge) | NaN / overfull | min pack scale | exceptions | stuck rounds |
|---|---|---|---|---|---|---|---|---|---|
| tapper | 467437 | 0 | 0 | 0 | 0 | 0 | 0.85 | 0 | 21 |
| spammer | 100941 | 0 | 0 | 0 | 0 | 0 | 0.85 | 0 | 0 |

## Voice (main.js policy replayed through a voice.js queue model, game time)

| driver | lines asked / min | dropped by MAXQ / min | max pending (before trim) | stale drops / min | cut < 50 % / min | same line back-to-back < 2 s (per session) | count rounds: all numbers started / heard ≥ 60 % |
|---|---|---|---|---|---|---|---|
| tapper | 49.4 | 0.07 | 3 | 0.01 | 11.6 | 166.2 | 100.0% / 67.5% (126) |
| spammer | 94.4 | 0.33 | 3 | 0.00 | 50.9 | 44.9 | 100.0% / 24.4% (160) |

Top interruptions (cut ← by), child models + bots:



## Content variety (consecutive rounds inside one chapter)

| age | topic | pairs | identical pot set | share any label | mean labels shared | count: same seed colour | animals: same first target |
|---|---|---|---|---|---|---|---|
| 3 | animals | 104 | 2.9% | 38.5% | 20.7% |  | 8.7% |
| 3 | colors | 100 | 7.0% | 67.0% | 37.0% |  |  |
| 3 | shapes | 100 | 6.0% | 63.0% | 34.5% |  |  |
| 3 | size | 100 | 100.0% | 100.0% | 100.0% |  |  |
| 4 | animals | 96 | 1.0% | 75.0% | 33.0% |  | 14.6% |
| 4 | colors | 96 | 6.3% | 97.9% | 54.2% |  |  |
| 4 | count | 104 | 24.0% | 24.0% | 24.0% | 19.2% |  |
| 4 | shapes | 93 | 10.8% | 100.0% | 58.4% |  |  |
| 5 | animals | 88 | 0.0% | 97.7% | 43.2% |  | 5.7% |
| 5 | count | 102 | 10.8% | 10.8% | 10.8% | 17.6% |  |
| 5 | letters | 96 | 0.0% | 45.8% | 17.7% |  |  |
| 5 | shapes | 82 | 8.5% | 100.0% | 66.2% |  |  |

Ask mode: the same animal asked twice in a row inside a round: 0 of 1217 consecutive asks.

### Count targets N

| age | warm-up N | rounds 1–3 N |
|---|---|---|
| 4 | 1:45% 2:33% 3:23% | 2:21% 3:21% 4:34% 5:24% |
| 5 | 1:38% 2:33% 3:30% | 3:12% 4:5% 5:15% 6:17% 7:12% 8:19% 9:7% 10:15% |

## Absent child (no input: 10 min in round 2 of chapter 1, then 5 min in Talk time, then the bot finishes)

| age | runs | idle nudges in 10 min | first / 2nd / 3rd / later gaps s | idle lines spoken | talk re-asks in 5 min | talk re-asks spoken | answer glows | state kept + session finishes | errors |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 0 |  |  |  |  |  |  |  |  |
| 4 | 0 |  |  |  |  |  |  |  |  |
| 5 | 0 |  |  |  |  |  |  |  |  |

## Before / after

| metric | tapbase | tapprop |
|---|---|---|
| session mean s (typical) | – | – |
| session p90 s (toddler) | – | – |
| session p90 s (slow3) | – | – |
| ≤ 8 min (slow3) | 0.0% | 0.0% |
| chapters 60–100 s (typical) | 0.0% | 0.0% |
| chapter p90 (slow3) | – | – |
| idle / session (slow3) | – | – |
| hints / round (dropsHighRim) | 0.00 | 0.00 |
| miss / drop (dropsHighRim) | 0.0% | 0.0% |
| miss / drop (slow3) | 0.0% | 0.0% |
| stars (slow3) | – | – |
| back-to-back lines / session (tapper) | 166.2 | 2.3 |
| MAXQ drops / min (tapper) | 0.07 | 0.10 |
| errors + stuck (all) | 21 | 13 |
| absent child | tapbase | tapprop |
|---|---|---|
| idle nudges / 10 min | – | – |
| idle lines spoken / 10 min | – | – |
