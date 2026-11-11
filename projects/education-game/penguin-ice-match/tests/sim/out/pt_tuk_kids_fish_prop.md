## pt_tuk_kids fish_prop — 288 sessions (56 s wall)

### Time (s)

| driver | age | n | done | session mean | p90 | max | chapter mean | p10–p90 | round mean | p90 | ≤3-round chapters |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0.9 | 4 | 32 | 32 | 243 | 249 | 251 | 59 | 57–61 | 11.5 | 14.1 | 0% |
| bot0.9 | 5 | 32 | 32 | 277 | 284 | 289 | 67 | 61–72 | 13.6 | 17.6 | 0% |
| bot0.9 | 7 | 32 | 32 | 314 | 324 | 327 | 76 | 73–81 | 15.8 | 19.3 | 0% |
| tapper | 4 | 32 | 32 | 419 | 462 | 467 | 103 | 81–131 | 26.8 | 47.4 | 57% |
| tapper | 5 | 32 | 32 | 481 | 540 | 612 | 118 | 87–155 | 35.2 | 66.5 | 93% |
| tapper | 7 | 32 | 32 | 625 | 697 | 725 | 154 | 112–201 | 47.8 | 81.8 | 100% |
| typical | 4 | 32 | 32 | 370 | 385 | 406 | 90 | 80–102 | 19.4 | 28.2 | 11% |
| typical | 5 | 32 | 32 | 389 | 422 | 426 | 95 | 82–109 | 21.5 | 31.5 | 25% |
| typical | 7 | 32 | 32 | 383 | 407 | 428 | 94 | 83–105 | 20.3 | 26.9 | 9% |

### Help, stars, checks

| driver | age | mismatch/round | rounds w/ hint | hints/round | idle/round | 3★/2★/1★ rounds | session stars | slow rounds >180 s | stuck | NaN | order bad | rewards not landed | fish leaps bad | home miss | fish under Talk (leaps) | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0.9 | 4 | 0.0 | 0% | 0.0 | 0.0 | 100%/0%/0% | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 (0) | 0 |
| bot0.9 | 5 | 0.0 | 0% | 0.0 | 0.0 | 100%/0%/0% | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 (0) | 0 |
| bot0.9 | 7 | 0.0 | 0% | 0.0 | 0.0 | 100%/0%/0% | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 44 (0) | 0 |
| tapper | 4 | 3.5 | 50% | 1.0 | 0.0 | 44%/35%/21% | 32 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 (0) | 0 |
| tapper | 5 | 5.6 | 60% | 1.5 | 0.0 | 34%/35%/31% | 27 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 17 (0) | 0 |
| tapper | 7 | 8.7 | 81% | 2.4 | 0.0 | 19%/34%/47% | 22 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 49 (0) | 0 |
| typical | 4 | 0.8 | 6% | 0.1 | 0.0 | 86%/14%/0% | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 (0) | 0 |
| typical | 5 | 0.9 | 4% | 0.0 | 0.0 | 94%/6%/0% | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 21 (0) | 0 |
| typical | 7 | 0.6 | 1% | 0.0 | 0.0 | 100%/0%/0% | 51 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 41 (0) | 0 |

### Voice model (main.js policy, 0.3 s + 72 ms/char)

| driver | age | lines started /min | talk share | requests colliding | 1st name heard fully | 2nd name heard fully | count lines heard fully | prompts cut / lost | idle false pauses (sessions) | name1 delay mean / max s | top cuts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0.9 | 4 | 45.4 | 94% | 92% | 11% | 0% | 2% | 6 / 0 | 0 | 0.0 / 0.0 | name<match 40.0, name<name 35.8, match<name 22.8 |
| bot0.9 | 5 | 46.7 | 94% | 90% | 20% | 0% | 5% | 4 / 0 | 0 | 0.0 / 0.0 | name<match 50.0, name<name 40.2, match<name 32.8 |
| bot0.9 | 7 | 48.7 | 94% | 89% | 27% | 0% | 5% | 8 / 0 | 0 | 0.0 / 0.0 | name<match 62.8, name<name 46.4, match<name 45.8 |
| tapper | 4 | 48.7 | 86% | 82% | 42% | 0% | 16% | 52 / 0 | 0 | 0.0 / 0.0 | name<mismatch 46.7, name<name 35.3, mismatch<name 32.9 |
| tapper | 5 | 51.3 | 86% | 81% | 45% | 0% | 20% | 44 / 0 | 0 | 0.0 / 0.0 | name<mismatch 66.5, mismatch<name 46.9, name<name 44.0 |
| tapper | 7 | 53.5 | 85% | 79% | 51% | 1% | 19% | 58 / 0 | 0 | 0.0 / 0.0 | name<mismatch 101.7, mismatch<name 75.1, name<name 56.3 |
| typical | 4 | 35.4 | 86% | 77% | 54% | 0% | 13% | 0 / 0 | 0 | 0.0 / 0.0 | name<match 38.7, name<name 23.6, match<name 18.3 |
| typical | 5 | 37.3 | 85% | 76% | 61% | 0% | 26% | 0 / 0 | 0 | 0.0 / 0.0 | name<match 46.1, match<name 28.3, name<name 23.0 |
| typical | 7 | 42.8 | 90% | 81% | 53% | 0% | 17% | 3 / 0 | 0 | 0.0 / 0.0 | name<match 60.5, match<name 43.8, name<name 32.8 |

### Voice line fate by kind (all present drivers)

| kind | requested | heard fully | cut | dropped | stale |
|---|---|---|---|---|---|
| name | 42438 | 22% | 78% | 0% | 0% |
| match | 12997 | 34% | 66% | 0% | 0% |
| mismatch | 8148 | 4% | 96% | 0% | 0% |
| tapName | 5315 | 51% | 49% | 0% | 0% |
| prompt | 4230 | 96% | 4% | 0% | 0% |
| peek | 4230 | 43% | 41% | 11% | 5% |
| praise | 4230 | 79% | 10% | 11% | 0% |
| chapter | 2304 | 100% | 0% | 0% | 0% |
| hint | 1981 | 1% | 10% | 89% | 0% |
| surprise | 1152 | 27% | 26% | 47% | 0% |
| talkQ | 1152 | 1% | 59% | 40% | 0% |
| talkResult | 1152 | 100% | 0% | 0% | 0% |
| golden | 392 | 28% | 72% | 0% | 0% |
| done | 288 | 0% | 0% | 0% | 0% |
| home | 87 | 6% | 94% | 0% | 0% |
| reward | 56 | 18% | 82% | 0% | 0% |
| idle | 19 | 0% | 100% | 0% | 0% |

Cut by (prompt / peek / hint / surprise / count-relevant name): peek<name 1740, praise<talkResult 413, surprise<name 299, prompt<name 175, hint<tapName 129, hint<name 79, idle<name 19

Dropped by: hint<name 1229, surprise<queue 538, hint<tapName 534, peek<name 474, praise<queue 414, praise<talkResult 47

config {} · voice {} · patch fishWait
