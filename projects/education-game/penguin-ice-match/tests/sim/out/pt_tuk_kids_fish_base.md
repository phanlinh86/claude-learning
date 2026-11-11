## pt_tuk_kids fish_base — 288 sessions (58 s wall)

### Time (s)

| driver | age | n | done | session mean | p90 | max | chapter mean | p10–p90 | round mean | p90 | ≤3-round chapters |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0.9 | 4 | 32 | 32 | 243 | 249 | 253 | 59 | 56–61 | 11.5 | 14.2 | 0% |
| bot0.9 | 5 | 32 | 32 | 277 | 283 | 288 | 67 | 61–71 | 13.6 | 17.6 | 0% |
| bot0.9 | 7 | 32 | 32 | 309 | 321 | 325 | 75 | 72–79 | 15.7 | 19.3 | 0% |
| tapper | 4 | 32 | 32 | 418 | 455 | 467 | 102 | 81–128 | 26.9 | 47.4 | 58% |
| tapper | 5 | 32 | 32 | 481 | 540 | 612 | 118 | 87–154 | 35.3 | 66.2 | 93% |
| tapper | 7 | 32 | 32 | 629 | 721 | 825 | 155 | 114–207 | 48.3 | 81.7 | 99% |
| typical | 4 | 32 | 32 | 369 | 385 | 406 | 90 | 80–101 | 19.4 | 28.2 | 11% |
| typical | 5 | 32 | 32 | 388 | 420 | 425 | 95 | 82–109 | 21.5 | 31.5 | 25% |
| typical | 7 | 32 | 32 | 381 | 406 | 419 | 93 | 83–104 | 20.3 | 26.8 | 9% |

### Help, stars, checks

| driver | age | mismatch/round | rounds w/ hint | hints/round | idle/round | 3★/2★/1★ rounds | session stars | slow rounds >180 s | stuck | NaN | order bad | rewards not landed | fish leaps bad | home miss | fish under Talk (leaps) | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0.9 | 4 | 0.0 | 0% | 0.0 | 0.0 | 100%/0%/0% | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17 (0) | 0 |
| bot0.9 | 5 | 0.0 | 0% | 0.0 | 0.0 | 100%/0%/0% | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 (21) | 0 |
| bot0.9 | 7 | 0.0 | 0% | 0.0 | 0.0 | 100%/0%/0% | 52 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 59 (109) | 0 |
| tapper | 4 | 3.5 | 50% | 0.9 | 0.0 | 44%/35%/21% | 32 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 (0) | 0 |
| tapper | 5 | 5.6 | 60% | 1.5 | 0.0 | 34%/35%/31% | 27 | 1 | 0 | 0 | 0 | 3 | 0 | 0 | 20 (21) | 0 |
| tapper | 7 | 8.9 | 82% | 2.5 | 0.0 | 20%/33%/47% | 22 | 0 | 0 | 0 | 0 | 20 | 0 | 0 | 58 (132) | 0 |
| typical | 4 | 0.8 | 6% | 0.1 | 0.0 | 86%/14%/0% | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 19 (0) | 0 |
| typical | 5 | 0.9 | 4% | 0.0 | 0.0 | 94%/6%/0% | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 23 (21) | 0 |
| typical | 7 | 0.6 | 1% | 0.0 | 0.0 | 100%/0%/0% | 51 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 53 (102) | 0 |

### Voice model (main.js policy, 0.3 s + 72 ms/char)

| driver | age | lines started /min | talk share | requests colliding | 1st name heard fully | 2nd name heard fully | count lines heard fully | prompts cut / lost | idle false pauses (sessions) | name1 delay mean / max s | top cuts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0.9 | 4 | 45.4 | 94% | 92% | 12% | 0% | 2% | 8 / 0 | 0 | 0.0 / 0.0 | name<match 40.0, name<name 35.6, match<name 23.0 |
| bot0.9 | 5 | 46.6 | 94% | 90% | 21% | 0% | 5% | 7 / 0 | 0 | 0.0 / 0.0 | name<match 50.0, name<name 40.0, match<name 32.8 |
| bot0.9 | 7 | 49.1 | 95% | 89% | 26% | 0% | 5% | 11 / 0 | 0 | 0.0 / 0.0 | name<match 62.8, name<name 47.2, match<name 45.8 |
| tapper | 4 | 48.7 | 86% | 82% | 41% | 0% | 16% | 65 / 0 | 0 | 0.0 / 0.0 | name<mismatch 46.5, name<name 35.4, mismatch<name 32.7 |
| tapper | 5 | 51.4 | 86% | 81% | 45% | 0% | 20% | 41 / 0 | 0 | 0.0 / 0.0 | name<mismatch 66.8, mismatch<name 47.4, name<name 44.3 |
| tapper | 7 | 54.1 | 85% | 79% | 51% | 1% | 19% | 59 / 0 | 0 | 0.0 / 0.0 | name<mismatch 104.3, mismatch<name 76.6, name<name 57.6 |
| typical | 4 | 35.4 | 86% | 77% | 53% | 0% | 13% | 0 / 0 | 0 | 0.0 / 0.0 | name<match 38.7, name<name 24.0, match<name 18.1 |
| typical | 5 | 37.4 | 85% | 77% | 60% | 0% | 26% | 0 / 0 | 0 | 0.0 / 0.0 | name<match 46.1, match<name 28.6, name<name 23.6 |
| typical | 7 | 43.0 | 90% | 81% | 53% | 0% | 17% | 4 / 0 | 0 | 0.0 / 0.0 | name<match 60.5, match<name 43.8, name<name 32.4 |

### Voice line fate by kind (all present drivers)

| kind | requested | heard fully | cut | dropped | stale |
|---|---|---|---|---|---|
| name | 42646 | 22% | 78% | 0% | 0% |
| match | 12999 | 34% | 66% | 0% | 0% |
| mismatch | 8248 | 4% | 96% | 0% | 0% |
| tapName | 5386 | 52% | 48% | 0% | 0% |
| prompt | 4230 | 95% | 5% | 0% | 0% |
| peek | 4230 | 43% | 41% | 12% | 5% |
| praise | 4230 | 76% | 12% | 12% | 0% |
| chapter | 2304 | 100% | 0% | 0% | 0% |
| hint | 2026 | 0% | 10% | 89% | 0% |
| surprise | 1152 | 27% | 26% | 47% | 0% |
| talkQ | 1152 | 0% | 50% | 49% | 0% |
| talkResult | 1152 | 100% | 0% | 0% | 0% |
| golden | 392 | 27% | 73% | 0% | 0% |
| done | 288 | 0% | 0% | 0% | 0% |
| home | 82 | 5% | 95% | 0% | 0% |
| reward | 81 | 30% | 70% | 0% | 0% |
| idle | 19 | 0% | 100% | 0% | 0% |

Cut by (prompt / peek / hint / surprise / count-relevant name): peek<name 1732, praise<talkResult 502, surprise<name 299, prompt<name 195, hint<tapName 133, hint<name 77, idle<name 19

Dropped by: hint<name 1275, surprise<queue 537, hint<tapName 531, peek<name 494, praise<queue 438, praise<talkResult 68

config {} · voice {} · patch –
