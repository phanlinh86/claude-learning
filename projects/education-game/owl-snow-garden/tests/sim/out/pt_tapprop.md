# Playtest tables — tapprop (120 sessions, 0 absent-child runs; config {"potPadUp":120,"playPotGap":74,"chapterTimeLimit":60})

## Durations (game seconds)

| driver | age | n | done | session mean / p90 / max | ≤ 8 min | chapter mean / p10 / p90 / max | chapters 60–100 s | > 100 s | rounds / ch | round mean / p90 / max | stuck | err |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tapper | 3 | 20 | 100.0% | 588 / 785 / 834 | 25.0% | 147 / 101 / 206 / 292 | 8.8% | 91.3% | 3.0 | 45.1 / 79.4 / 164 | 0 | 0 |
| tapper | 4 | 20 | 100.0% | 887 / 1322 / 1446 | 0.0% | 222 / 85 / 356 / 581 | 17.5% | 82.5% | 3.1 | 68.2 / 142.3 / 322 | 2 | 0 |
| tapper | 5 | 20 | 90.0% | 1364 / 2093 / 2352 | 0.0% | 355 / 120 / 589 / 1177 | 9.0% | 91.0% | 3.1 | 116.9 / 235.5 / 576 | 11 | 0 |
| spammer | 3 | 20 | 100.0% | 190 / 206 / 216 | 100.0% | 48 / 37 / 59 / 81 | 8.8% | 0.0% | 4.0 | 8.8 / 14.6 / 35 | 0 | 0 |
| spammer | 4 | 20 | 100.0% | 251 / 263 / 286 | 100.0% | 63 / 28 / 88 / 104 | 68.8% | 1.3% | 3.7 | 13.9 / 27.7 / 62 | 0 | 0 |
| spammer | 5 | 20 | 100.0% | 297 / 328 / 347 | 100.0% | 74 / 39 / 102 / 139 | 61.3% | 11.3% | 3.5 | 18.1 / 33.8 / 80 | 0 | 0 |

## Per-topic round time, child models (mean / p90 s)

| age | topic | typical | toddler | slow3 | dropsHighRim |
|---|---|---|---|---|---|


## Help, stars, input, Talk (all ages pooled per driver)

| driver | hints / round | rounds with a hint | min hint gap s | idle / session | min idle gap s | stars / session | rounds 3★ / 2★ / 1★ | wrong / drop | miss / drop | taps (→ drop) | quick flicks | Talk right |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tapper | 8.62 | 95.0% | 6.0 | 0.0 | – | 19.5 | 22.5% / 5.1% / 72.5% | 14.1% | 41.2% | 13765 (0) | 7279 | 33.6% |
| spammer | 1.66 | 78.7% | 6.0 | 0.0 | – | 24.0 | 22.8% / 5.7% / 71.4% | 31.6% | 16.7% | 6315 (0) | 13113 | 37.5% |

## Invariants (checked every 4th update while a round is on screen)

| driver | checks | resting seed outside screen | resting seeds overlap | resting in a drop zone | home unreachable (HUD/Lumi/edge) | NaN / overfull | min pack scale | exceptions | stuck rounds |
|---|---|---|---|---|---|---|---|---|---|
| tapper | 421342 | 0 | 0 | 0 | 0 | 0 | 0.70 | 0 | 13 |
| spammer | 89683 | 0 | 0 | 0 | 0 | 0 | 0.70 | 0 | 0 |

## Voice (main.js policy replayed through a voice.js queue model, game time)

| driver | lines asked / min | dropped by MAXQ / min | max pending (before trim) | stale drops / min | cut < 50 % / min | same line back-to-back < 2 s (per session) | count rounds: all numbers started / heard ≥ 60 % |
|---|---|---|---|---|---|---|---|
| tapper | 31.4 | 0.10 | 3 | 0.08 | 3.5 | 2.3 | 100.0% / 100.0% (127) |
| spammer | 66.8 | 0.34 | 3 | 0.00 | 30.4 | 11.2 | 100.0% / 28.7% (160) |

Top interruptions (cut ← by), child models + bots:



## Content variety (consecutive rounds inside one chapter)

| age | topic | pairs | identical pot set | share any label | mean labels shared | count: same seed colour | animals: same first target |
|---|---|---|---|---|---|---|---|
| 3 | animals | 101 | 1.0% | 34.7% | 17.8% |  | 10.9% |
| 3 | colors | 100 | 4.0% | 57.0% | 30.5% |  |  |
| 3 | shapes | 100 | 9.0% | 65.0% | 37.0% |  |  |
| 3 | size | 100 | 100.0% | 100.0% | 100.0% |  |  |
| 4 | animals | 97 | 1.0% | 79.4% | 35.1% |  | 13.4% |
| 4 | colors | 89 | 6.7% | 96.6% | 52.8% |  |  |
| 4 | count | 107 | 22.4% | 22.4% | 22.4% | 23.4% |  |
| 4 | shapes | 89 | 12.4% | 100.0% | 63.3% |  |  |
| 5 | animals | 83 | 2.4% | 98.8% | 44.0% |  | 12.0% |
| 5 | count | 100 | 8.0% | 8.0% | 8.0% | 13.0% |  |
| 5 | letters | 95 | 0.0% | 40.0% | 15.4% |  |  |
| 5 | shapes | 80 | 8.8% | 100.0% | 66.6% |  |  |

Ask mode: the same animal asked twice in a row inside a round: 0 of 1177 consecutive asks.

### Count targets N

| age | warm-up N | rounds 1–3 N |
|---|---|---|
| 4 | 1:23% 2:28% 3:50% | 2:26% 3:28% 4:29% 5:17% |
| 5 | 1:40% 2:30% 3:30% | 3:8% 4:10% 5:11% 6:17% 7:13% 8:20% 9:7% 10:14% |

## Absent child (no input: 10 min in round 2 of chapter 1, then 5 min in Talk time, then the bot finishes)

| age | runs | idle nudges in 10 min | first / 2nd / 3rd / later gaps s | idle lines spoken | talk re-asks in 5 min | talk re-asks spoken | answer glows | state kept + session finishes | errors |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 0 |  |  |  |  |  |  |  |  |
| 4 | 0 |  |  |  |  |  |  |  |  |
| 5 | 0 |  |  |  |  |  |  |  |  |
