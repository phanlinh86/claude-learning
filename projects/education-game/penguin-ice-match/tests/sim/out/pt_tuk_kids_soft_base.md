## pt_tuk_kids soft_base — 768 sessions (104 s wall)

### Time (s)

| driver | age | n | done | session mean | p90 | max | chapter mean | p10–p90 | round mean | p90 | ≤3-round chapters |
|---|---|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 96 | 96 | 452 | 508 | 586 | 111 | 89–139 | 30.8 | 46.2 | 88% |
| slow3 | 4 | 96 | 96 | 487 | 546 | 629 | 120 | 96–148 | 34.8 | 56.4 | 98% |
| tapper | 3 | 96 | 96 | 402 | 451 | 481 | 98 | 79–121 | 24.4 | 40.7 | 40% |
| tapper | 4 | 96 | 96 | 418 | 473 | 536 | 102 | 80–127 | 27.2 | 48.4 | 62% |
| toddler | 3 | 96 | 96 | 376 | 402 | 421 | 92 | 80–105 | 19.7 | 29.5 | 5% |
| toddler | 4 | 96 | 96 | 386 | 415 | 465 | 94 | 82–105 | 20.9 | 30.3 | 16% |
| typical | 3 | 96 | 96 | 392 | 418 | 459 | 96 | 83–109 | 20.9 | 30.7 | 13% |
| typical | 4 | 96 | 96 | 371 | 391 | 418 | 91 | 81–102 | 19.4 | 27.6 | 8% |

### Help, stars, checks

| driver | age | mismatch/round | rounds w/ hint | hints/round | idle/round | 3★/2★/1★ rounds | session stars | slow rounds >180 s | stuck | NaN | order bad | rewards not landed | fish leaps bad | home miss | fish under Talk (leaps) | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 1.3 | 17% | 0.2 | 0.2 | 68%/29%/3% | 35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 36 (0) | 0 |
| slow3 | 4 | 1.7 | 21% | 0.3 | 0.2 | 65%/31%/4% | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 40 (0) | 0 |
| tapper | 3 | 2.7 | 48% | 0.8 | 0.0 | 49%/34%/17% | 35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 36 (0) | 0 |
| tapper | 4 | 3.6 | 50% | 1.0 | 0.0 | 44%/33%/23% | 31 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 42 (0) | 0 |
| toddler | 3 | 1.3 | 15% | 0.2 | 0.0 | 71%/28%/1% | 45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 50 (0) | 0 |
| toddler | 4 | 1.6 | 19% | 0.2 | 0.0 | 69%/30%/1% | 43 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 47 (0) | 0 |
| typical | 3 | 0.9 | 7% | 0.1 | 0.0 | 81%/19%/0% | 46 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 48 (0) | 0 |
| typical | 4 | 0.8 | 6% | 0.1 | 0.0 | 89%/11%/0% | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 55 (0) | 0 |

### Voice model (main.js policy, 0.3 s + 72 ms/char)

| driver | age | lines started /min | talk share | requests colliding | 1st name heard fully | 2nd name heard fully | count lines heard fully | prompts cut / lost | idle false pauses (sessions) | name1 delay mean / max s | top cuts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 24.3 | 71% | 58% | 94% | 0% | 42% | 0 / 0 | 0 | 0.0 / 0.0 | name<match 25.4, name<mismatch 16.2, mismatch<name 5.8 |
| slow3 | 4 | 25.1 | 71% | 56% | 94% | 0% | 38% | 0 / 0 | 0 | 0.0 / 0.0 | name<match 27.9, name<mismatch 20.5, mismatch<name 6.6 |
| tapper | 3 | 46.6 | 87% | 82% | 38% | 0% | 16% | 74 / 0 | 0 | 0.0 / 0.0 | name<mismatch 38.0, name<name 30.9, name<match 30.3 |
| tapper | 4 | 48.8 | 86% | 82% | 41% | 0% | 13% | 168 / 0 | 0 | 0.0 / 0.0 | name<mismatch 47.0, name<name 35.1, mismatch<name 32.3 |
| toddler | 3 | 36.8 | 86% | 84% | 27% | 0% | 9% | 0 / 0 | 0 | 0.0 / 0.0 | name<name 40.5, name<match 35.4, name<mismatch 20.2 |
| toddler | 4 | 38.9 | 88% | 84% | 30% | 0% | 8% | 0 / 0 | 0 | 0.0 / 0.0 | name<name 43.2, name<match 38.1, name<mismatch 24.0 |
| typical | 3 | 32.1 | 83% | 75% | 55% | 0% | 19% | 0 / 0 | 0 | 0.0 / 0.0 | name<match 34.5, name<name 22.0, name<mismatch 14.3 |
| typical | 4 | 35.4 | 86% | 77% | 54% | 0% | 13% | 0 / 0 | 0 | 0.0 / 0.0 | name<match 39.0, name<name 23.5, match<name 18.5 |

### Voice line fate by kind (all present drivers)

| kind | requested | heard fully | cut | dropped | stale |
|---|---|---|---|---|---|
| name | 87924 | 25% | 75% | 0% | 0% |
| match | 25288 | 58% | 42% | 0% | 0% |
| mismatch | 18605 | 17% | 83% | 0% | 0% |
| prompt | 11018 | 98% | 2% | 0% | 0% |
| peek | 11018 | 68% | 18% | 5% | 9% |
| praise | 11018 | 81% | 5% | 13% | 0% |
| tapName | 8729 | 48% | 52% | 0% | 0% |
| chapter | 6144 | 100% | 0% | 0% | 0% |
| hint | 3694 | 1% | 21% | 78% | 0% |
| surprise | 3072 | 40% | 11% | 49% | 0% |
| talkQ | 3072 | 10% | 66% | 24% | 0% |
| talkResult | 3072 | 100% | 0% | 0% | 0% |
| golden | 1032 | 52% | 48% | 0% | 0% |
| done | 768 | 0% | 0% | 0% | 0% |
| idle | 577 | 28% | 72% | 0% | 0% |
| home | 143 | 8% | 92% | 0% | 0% |
| reward | 2 | 0% | 100% | 0% | 0% |

Cut by (prompt / peek / hint / surprise / count-relevant name): peek<name 1936, praise<talkResult 602, hint<name 509, idle<name 415, surprise<name 340, hint<tapName 275, prompt<name 242

Dropped by: hint<name 2128, surprise<queue 1501, praise<queue 1328, hint<tapName 745, peek<name 582, praise<talkResult 133

config {} · voice {} · patch –
