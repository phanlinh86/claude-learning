## pt_tuk_kids soft300 — 384 sessions (51 s wall)

### Time (s)

| driver | age | n | done | session mean | p90 | max | chapter mean | p10–p90 | round mean | p90 | ≤3-round chapters |
|---|---|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 96 | 96 | 442 | 499 | 586 | 109 | 87–136 | 30.7 | 46.2 | 88% |
| slow3 | 4 | 96 | 96 | 475 | 533 | 556 | 117 | 92–143 | 34.6 | 55.4 | 98% |
| toddler | 3 | 96 | 96 | 376 | 401 | 416 | 92 | 80–105 | 19.6 | 29.3 | 5% |
| toddler | 4 | 96 | 96 | 385 | 415 | 448 | 94 | 82–105 | 20.9 | 30.4 | 17% |

### Help, stars, checks

| driver | age | mismatch/round | rounds w/ hint | hints/round | idle/round | 3★/2★/1★ rounds | session stars | slow rounds >180 s | stuck | NaN | order bad | rewards not landed | fish leaps bad | home miss | fish under Talk (leaps) | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 1.3 | 18% | 0.2 | 0.2 | 68%/29%/3% | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 39 (0) | 0 |
| slow3 | 4 | 1.7 | 21% | 0.3 | 0.2 | 65%/31%/4% | 33 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 43 (0) | 0 |
| toddler | 3 | 1.3 | 15% | 0.2 | 0.0 | 71%/28%/1% | 45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 49 (0) | 0 |
| toddler | 4 | 1.6 | 19% | 0.2 | 0.0 | 68%/30%/1% | 43 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 46 (0) | 0 |

### Voice model (main.js policy, 0.3 s + 72 ms/char)

| driver | age | lines started /min | talk share | requests colliding | 1st name heard fully | 2nd name heard fully | count lines heard fully | prompts cut / lost | idle false pauses (sessions) | name1 delay mean / max s | top cuts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 24.4 | 71% | 58% | 94% | 0% | 42% | 0 / 0 | 0 | 0.0 / 0.0 | name<match 24.8, name<mismatch 15.8, mismatch<name 5.6 |
| slow3 | 4 | 25.1 | 71% | 56% | 94% | 0% | 37% | 0 / 0 | 0 | 0.0 / 0.0 | name<match 27.1, name<mismatch 19.9, mismatch<name 6.4 |
| toddler | 3 | 36.9 | 86% | 84% | 27% | 0% | 8% | 0 / 0 | 0 | 0.0 / 0.0 | name<name 40.4, name<match 35.4, name<mismatch 20.1 |
| toddler | 4 | 38.9 | 88% | 84% | 31% | 0% | 8% | 0 / 0 | 0 | 0.0 / 0.0 | name<name 43.1, name<match 38.0, name<mismatch 24.2 |

### Voice line fate by kind (all present drivers)

| kind | requested | heard fully | cut | dropped | stale |
|---|---|---|---|---|---|
| name | 39410 | 28% | 72% | 0% | 0% |
| match | 12030 | 67% | 33% | 0% | 0% |
| mismatch | 7675 | 34% | 66% | 0% | 0% |
| prompt | 5288 | 100% | 0% | 0% | 0% |
| peek | 5288 | 82% | 6% | 1% | 11% |
| praise | 5288 | 88% | 1% | 11% | 0% |
| chapter | 3072 | 100% | 0% | 0% | 0% |
| talkQ | 1536 | 17% | 81% | 2% | 0% |
| talkResult | 1536 | 100% | 0% | 0% | 0% |
| surprise | 1522 | 48% | 2% | 50% | 0% |
| hint | 1093 | 2% | 33% | 65% | 0% |
| golden | 510 | 64% | 36% | 0% | 0% |
| idle | 492 | 31% | 69% | 0% | 0% |
| done | 384 | 0% | 0% | 0% | 0% |
| home | 39 | 13% | 87% | 0% | 0% |
| reward | 2 | 0% | 100% | 0% | 0% |

Cut by (prompt / peek / hint / surprise / count-relevant name): hint<name 361, idle<name 339, peek<name 337, surprise<name 36, praise<talkResult 28

Dropped by: surprise<queue 761, hint<name 706, praise<queue 606, peek<name 36

config {} · voice {} · patch softLimit
