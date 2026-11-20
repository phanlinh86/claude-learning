# Playtest sims — proposal

rounds per row: 100, cap 600 s, 960×540, dt 1/60

## bots — survival

| diff · player | n | over% | surv p10/50/90 s | score p10/50/90 | levels p50 (max) | clear floor 1/2/3/4 % | hearts left at door 1/2 p50 | hits/min | Dawn hits | 1st hit p10/p50 s |
|---|---|---|---|---|---|---|---|---|---|---|
| easy · bot skill 1 | 100 | 0 | 600/600/600 | 71440/73440/75490 | 8 (8) | 100/100/100/100 | 5/5 | 0.00 | 0.00 | 600/600 |
| easy · bot skill 0.8 | 100 | 0 | 600/600/600 | 71290/73190/75340 | 8 (8) | 100/100/100/100 | 5/5 | 0.04 | 0.02 | 197/600 |
| easy · bot skill 0.5 | 100 | 7 | 600/600/600 | 53240/56390/58990 | 8 (8) | 100/100/98/97 | 5/5 | 0.58 | 0.41 | 21/94 |
| easy · bot skill 0.3 | 100 | 47 | 266/600/600 | 19940/53870/57190 | 8 (8) | 100/100/95/85 | 4/4 | 1.05 | 0.75 | 14/51 |
| normal · bot skill 1 | 100 | 0 | 600/600/600 | 88090/90190/92040 | 8 (8) | 100/100/100/100 | 3/3 | 0.00 | 0.00 | 600/600 |
| normal · bot skill 0.8 | 100 | 1 | 600/600/600 | 86710/89320/91020 | 8 (8) | 100/100/100/100 | 3/3 | 0.17 | 0.16 | 40/295 |
| normal · bot skill 0.5 | 100 | 98 | 57/193/464 | 3540/17560/51110 | 2 (8) | 87/68/44/28 | 2/2 | 1.30 | 1.22 | 9/32 |
| normal · bot skill 0.3 | 100 | 99 | 51/114/245 | 2880/8760/23740 | 1 (8) | 82/35/17/3 | 2/1 | 1.88 | 1.60 | 8/28 |
| hard · bot skill 1 | 100 | 0 | 600/600/600 | 100790/103440/106140 | 8 (8) | 100/100/100/100 | 3/3 | 0.00 | 0.00 | 600/600 |
| hard · bot skill 0.8 | 100 | 2 | 600/600/600 | 99180/102100/104440 | 8 (8) | 100/100/100/100 | 3/3 | 0.20 | 0.18 | 43/182 |
| hard · bot skill 0.5 | 100 | 99 | 55/170/329 | 4340/19370/44290 | 2 (8) | 83/58/33/20 | 2/1 | 1.52 | 1.26 | 8/28 |
| hard · bot skill 0.3 | 100 | 100 | 34/98/191 | 2150/9640/21740 | 1 (4) | 64/22/7/1 | 2/2 | 2.24 | 1.88 | 6/22 |

## bots — scoring

| diff · player | 1st pt s | pts/min | leaves caught % | catches at ×2+ % | reach ×5 % games | taps/min | flips/min | bump share % |
|---|---|---|---|---|---|---|---|---|
| easy · bot skill 1 | 0.9 | 7328 | 77 | 100 | 100 | 19 | 19 | 0 |
| easy · bot skill 0.8 | 0.9 | 7313 | 76 | 100 | 100 | 19 | 19 | 100 |
| easy · bot skill 0.5 | 0.9 | 5633 | 55 | 100 | 100 | 10 | 10 | 100 |
| easy · bot skill 0.3 | 0.9 | 5368 | 54 | 99 | 100 | 10 | 10 | 100 |
| normal · bot skill 1 | 0.7 | 9021 | 71 | 100 | 100 | 23 | 23 | 0 |
| normal · bot skill 0.8 | 0.7 | 8914 | 70 | 99 | 100 | 23 | 23 | 100 |
| normal · bot skill 0.5 | 0.7 | 6115 | 57 | 96 | 100 | 18 | 18 | 100 |
| normal · bot skill 0.3 | 0.7 | 5216 | 55 | 93 | 100 | 17 | 17 | 100 |
| hard · bot skill 1 | 0.6 | 10348 | 71 | 100 | 100 | 27 | 27 | 0 |
| hard · bot skill 0.8 | 0.6 | 10205 | 70 | 99 | 100 | 27 | 27 | 100 |
| hard · bot skill 0.5 | 0.6 | 7192 | 60 | 96 | 100 | 24 | 24 | 100 |
| hard · bot skill 0.3 | 0.6 | 6086 | 58 | 93 | 95 | 22 | 22 | 100 |

## bots — level time (p50 of rounds that cleared it)

| diff · player | Boot Room (dawn) s | Greenhouse (noon) s | Map Library (sunset) s | Lantern Deck (night) s |
|---|---|---|---|---|
| easy · bot skill 1 | 62.2 | 68.2 | 72.2 | 76.2 |
| easy · bot skill 0.8 | 62.2 | 68.2 | 72.2 | 76.2 |
| easy · bot skill 0.5 | 62.2 | 68.2 | 72.2 | 76.2 |
| easy · bot skill 0.3 | 62.2 | 68.2 | 72.2 | 76.2 |
| normal · bot skill 1 | 62.2 | 68.2 | 72.2 | 76.2 |
| normal · bot skill 0.8 | 62.2 | 68.2 | 72.2 | 76.2 |
| normal · bot skill 0.5 | 62.2 | 68.2 | 72.2 | 76.2 |
| normal · bot skill 0.3 | 62.2 | 68.2 | 72.2 | 76.2 |
| hard · bot skill 1 | 62.2 | 68.2 | 72.2 | 76.2 |
| hard · bot skill 0.8 | 62.2 | 68.2 | 72.2 | 76.2 |
| hard · bot skill 0.5 | 62.2 | 68.2 | 72.2 | 76.2 |
| hard · bot skill 0.3 | 62.2 | 68.2 | 72.2 | 76.2 |

## bots — health

| diff · player | NaN frames | out-of-corridor frames | stall frames | longest rescue s |
|---|---|---|---|---|
| easy · bot skill 1 | 0 | 0 | 0 | 0.00 |
| easy · bot skill 0.8 | 0 | 0 | 0 | 0.00 |
| easy · bot skill 0.5 | 0 | 0 | 0 | 0.00 |
| easy · bot skill 0.3 | 0 | 0 | 0 | 0.00 |
| normal · bot skill 1 | 0 | 0 | 0 | 0.00 |
| normal · bot skill 0.8 | 0 | 0 | 0 | 0.00 |
| normal · bot skill 0.5 | 0 | 0 | 0 | 0.00 |
| normal · bot skill 0.3 | 0 | 0 | 0 | 0.00 |
| hard · bot skill 1 | 0 | 0 | 0 | 0.00 |
| hard · bot skill 0.8 | 0 | 0 | 0 | 0.00 |
| hard · bot skill 0.5 | 0 | 0 | 0 | 0.00 |
| hard · bot skill 0.3 | 0 | 0 | 0 | 0.00 |

## humans — survival

| diff · player | n | over% | surv p10/50/90 s | score p10/50/90 | levels p50 (max) | clear floor 1/2/3/4 % | hearts left at door 1/2 p50 | hits/min | Dawn hits | 1st hit p10/p50 s |
|---|---|---|---|---|---|---|---|---|---|---|
| easy · kid, struggling 4 y | 100 | 100 | 52/97/147 | 2510/6610/11690 | 1 (3) | 82/16/2/0 | 2/2 | 3.60 | 3.06 | 6/14 |
| easy · kid 4–6 (base) | 100 | 100 | 77/143/260 | 5070/11500/22060 | 2 (5) | 93/54/19/6 | 3/2 | 2.52 | 2.19 | 7/22 |
| easy · kid, steady 6 y | 100 | 94 | 126/276/477 | 9130/24190/46140 | 3 (8) | 100/88/67/48 | 4/3 | 1.66 | 1.47 | 7/34 |
| easy · casual adult | 100 | 0 | 600/600/600 | 63540/65540/67790 | 8 (8) | 100/100/100/100 | 5/5 | 0.22 | 0.21 | 34/188 |
| easy · hazards only (adult) | 100 | 0 | 600/600/600 | 51940/54260/56590 | 8 (8) | 100/100/100/100 | 5/5 | 0.23 | 0.23 | 38/171 |
| normal · kid, struggling 4 y | 100 | 100 | 14/27/42 | 320/1110/2780 | 0 (1) | 1/0/0/0 | 1/— | 6.39 | 2.99 | 4/7 |
| normal · kid 4–6 (base) | 100 | 100 | 18/32/60 | 630/1700/4430 | 0 (1) | 10/0/0/0 | 2/— | 4.88 | 2.85 | 4/10 |
| normal · kid, steady 6 y | 100 | 100 | 25/52/105 | 1140/3580/8760 | 0 (3) | 35/8/3/0 | 1/2 | 3.11 | 2.49 | 4/14 |
| normal · casual adult | 100 | 70 | 89/273/600 | 6600/29840/77190 | 3 (8) | 90/78/64/48 | 2/2 | 0.92 | 0.89 | 9/51 |
| normal · hazards only (adult) | 100 | 82 | 79/247/600 | 4950/22070/67560 | 3 (8) | 91/71/56/39 | 2/2 | 1.10 | 1.23 | 9/30 |
| hard · kid, struggling 4 y | 100 | 100 | 13/21/31 | 280/790/2090 | 0 (0) | 0/0/0/0 | —/— | 8.42 | 3.00 | 3/6 |
| hard · kid 4–6 (base) | 100 | 100 | 14/26/46 | 410/1520/3660 | 0 (1) | 1/0/0/0 | 2/— | 6.29 | 2.98 | 4/9 |
| hard · kid, steady 6 y | 100 | 100 | 17/37/81 | 740/2420/7810 | 0 (2) | 17/1/0/0 | 1/1 | 4.55 | 2.81 | 4/11 |
| hard · casual adult | 100 | 96 | 53/181/473 | 4550/19820/62550 | 2 (8) | 86/63/42/24 | 2/2 | 1.34 | 1.28 | 7/32 |
| hard · hazards only (adult) | 100 | 98 | 55/170/402 | 4570/16950/49190 | 2 (8) | 87/61/37/20 | 2/2 | 1.44 | 1.37 | 7/22 |

## humans — scoring

| diff · player | 1st pt s | pts/min | leaves caught % | catches at ×2+ % | reach ×5 % games | taps/min | flips/min | bump share % |
|---|---|---|---|---|---|---|---|---|
| easy · kid, struggling 4 y | 0.9 | 4148 | 62 | 97 | 97 | 23 | 22 | 78 |
| easy · kid 4–6 (base) | 0.9 | 4764 | 62 | 98 | 100 | 21 | 20 | 75 |
| easy · kid, steady 6 y | 0.9 | 5479 | 63 | 99 | 100 | 19 | 19 | 72 |
| easy · casual adult | 0.9 | 6563 | 67 | 100 | 100 | 14 | 14 | 77 |
| easy · hazards only (adult) | 0.9 | 5434 | 52 | 99 | 100 | 11 | 11 | 79 |
| normal · kid, struggling 4 y | 0.7 | 2920 | 56 | 76 | 61 | 26 | 25 | 63 |
| normal · kid 4–6 (base) | 0.7 | 3640 | 58 | 82 | 82 | 25 | 24 | 72 |
| normal · kid, steady 6 y | 0.7 | 4596 | 59 | 89 | 94 | 23 | 23 | 64 |
| normal · casual adult | 0.7 | 7106 | 60 | 97 | 100 | 20 | 20 | 84 |
| normal · hazards only (adult) | 0.7 | 6003 | 52 | 96 | 98 | 19 | 19 | 87 |
| hard · kid, struggling 4 y | 0.7 | 2900 | 54 | 72 | 46 | 29 | 27 | 57 |
| hard · kid 4–6 (base) | 0.6 | 3747 | 57 | 80 | 76 | 26 | 25 | 58 |
| hard · kid, steady 6 y | 0.6 | 4742 | 59 | 86 | 85 | 27 | 26 | 61 |
| hard · casual adult | 0.6 | 7377 | 59 | 96 | 99 | 25 | 25 | 81 |
| hard · hazards only (adult) | 0.6 | 6716 | 55 | 96 | 99 | 25 | 25 | 85 |

## humans — level time (p50 of rounds that cleared it)

| diff · player | Boot Room (dawn) s | Greenhouse (noon) s | Map Library (sunset) s | Lantern Deck (night) s |
|---|---|---|---|---|
| easy · kid, struggling 4 y | 62.2 | 68.2 | 72.2 | — |
| easy · kid 4–6 (base) | 62.2 | 68.2 | 72.2 | 76.2 |
| easy · kid, steady 6 y | 62.2 | 68.2 | 72.2 | 76.2 |
| easy · casual adult | 62.2 | 68.2 | 72.2 | 76.2 |
| easy · hazards only (adult) | 62.2 | 68.2 | 72.2 | 76.2 |
| normal · kid, struggling 4 y | 62.2 | — | — | — |
| normal · kid 4–6 (base) | 62.2 | — | — | — |
| normal · kid, steady 6 y | 62.2 | 68.2 | 72.2 | — |
| normal · casual adult | 62.2 | 68.2 | 72.2 | 76.2 |
| normal · hazards only (adult) | 62.2 | 68.2 | 72.2 | 76.2 |
| hard · kid, struggling 4 y | — | — | — | — |
| hard · kid 4–6 (base) | 62.2 | — | — | — |
| hard · kid, steady 6 y | 62.2 | 68.2 | — | — |
| hard · casual adult | 62.2 | 68.2 | 72.2 | 76.2 |
| hard · hazards only (adult) | 62.2 | 68.2 | 72.2 | 76.2 |

## humans — health

| diff · player | NaN frames | out-of-corridor frames | stall frames | longest rescue s |
|---|---|---|---|---|
| easy · kid, struggling 4 y | 0 | 0 | 0 | 1.37 |
| easy · kid 4–6 (base) | 0 | 0 | 0 | 1.70 |
| easy · kid, steady 6 y | 0 | 0 | 0 | 1.72 |
| easy · casual adult | 0 | 0 | 0 | 1.37 |
| easy · hazards only (adult) | 0 | 0 | 0 | 1.37 |
| normal · kid, struggling 4 y | 0 | 0 | 0 | 1.68 |
| normal · kid 4–6 (base) | 0 | 0 | 0 | 1.52 |
| normal · kid, steady 6 y | 0 | 0 | 0 | 1.68 |
| normal · casual adult | 0 | 0 | 0 | 1.53 |
| normal · hazards only (adult) | 0 | 0 | 0 | 1.60 |
| hard · kid, struggling 4 y | 0 | 0 | 0 | 1.55 |
| hard · kid 4–6 (base) | 0 | 0 | 0 | 1.63 |
| hard · kid, steady 6 y | 0 | 0 | 0 | 1.62 |
| hard · casual adult | 0 | 0 | 0 | 1.60 |
| hard · hazards only (adult) | 0 | 0 | 0 | 1.60 |

## exploits — survival

| diff · player | n | over% | surv p10/50/90 s | score p10/50/90 | levels p50 (max) | clear floor 1/2/3/4 % | hearts left at door 1/2 p50 | hits/min | Dawn hits | 1st hit p10/p50 s |
|---|---|---|---|---|---|---|---|---|---|---|
| easy · never taps | 100 | 100 | 31/43/56 | 500/1040/2030 | 0 (1) | 5/0/0/0 | 1/— | 6.87 | 4.94 | 6/10 |
| easy · flip on every landing | 100 | 100 | 27/39/56 | 1160/2350/4350 | 0 (1) | 5/0/0/0 | 1/— | 7.41 | 4.95 | 5/7 |
| easy · spam every 80 ms | 100 | 100 | 25/39/56 | 1030/2300/4330 | 0 (1) | 5/0/0/0 | 1/— | 7.49 | 4.94 | 6/8 |
| easy · spam 150 ms | 100 | 100 | 26/39/56 | 1120/2420/4400 | 0 (1) | 4/0/0/0 | 1/— | 7.48 | 4.95 | 6/8 |
| easy · spam 250 ms | 100 | 100 | 28/38/53 | 1120/2290/4360 | 0 (1) | 4/0/0/0 | 1/— | 7.53 | 4.94 | 6/7 |
| easy · spam 400 ms | 100 | 100 | 29/40/58 | 1300/2240/4250 | 0 (1) | 6/0/0/0 | 2/— | 7.14 | 4.91 | 6/7 |
| easy · spam 700 ms | 100 | 100 | 29/42/58 | 960/1970/3570 | 0 (1) | 7/0/0/0 | 1/— | 6.95 | 4.90 | 6/9 |
| easy · spam 1000 ms | 100 | 100 | 29/38/60 | 770/1540/3370 | 0 (1) | 10/0/0/0 | 1/— | 7.12 | 4.88 | 6/7 |
| normal · never taps | 100 | 100 | 11/16/23 | 110/300/740 | 0 (0) | 0/0/0/0 | —/— | 10.84 | 3.00 | 3/6 |
| normal · flip on every landing | 100 | 100 | 10/13/22 | 170/370/900 | 0 (0) | 0/0/0/0 | —/— | 12.09 | 3.00 | 3/4 |
| normal · spam every 80 ms | 100 | 100 | 9/14/20 | 180/420/940 | 0 (0) | 0/0/0/0 | —/— | 12.31 | 3.00 | 3/4 |
| normal · spam 150 ms | 100 | 100 | 9/14/20 | 160/420/1000 | 0 (0) | 0/0/0/0 | —/— | 12.24 | 3.00 | 3/4 |
| normal · spam 250 ms | 100 | 100 | 9/13/20 | 160/380/840 | 0 (0) | 0/0/0/0 | —/— | 12.77 | 3.00 | 3/4 |
| normal · spam 400 ms | 100 | 100 | 9/13/20 | 170/360/820 | 0 (0) | 0/0/0/0 | —/— | 12.86 | 3.00 | 3/4 |
| normal · spam 700 ms | 100 | 100 | 11/16/25 | 210/440/1040 | 0 (0) | 0/0/0/0 | —/— | 10.66 | 3.00 | 4/6 |
| normal · spam 1000 ms | 100 | 100 | 10/15/22 | 130/330/730 | 0 (0) | 0/0/0/0 | —/— | 11.34 | 3.00 | 3/4 |
| hard · never taps | 100 | 100 | 10/14/19 | 110/280/600 | 0 (0) | 0/0/0/0 | —/— | 12.79 | 3.00 | 3/5 |
| hard · flip on every landing | 100 | 100 | 9/12/18 | 180/350/780 | 0 (0) | 0/0/0/0 | —/— | 14.08 | 3.00 | 3/4 |
| hard · spam every 80 ms | 100 | 100 | 9/12/17 | 200/370/800 | 0 (0) | 0/0/0/0 | —/— | 14.04 | 3.00 | 3/4 |
| hard · spam 150 ms | 100 | 100 | 9/13/17 | 180/370/820 | 0 (0) | 0/0/0/0 | —/— | 13.99 | 3.00 | 3/4 |
| hard · spam 250 ms | 100 | 100 | 9/12/16 | 180/350/800 | 0 (0) | 0/0/0/0 | —/— | 14.36 | 3.00 | 3/4 |
| hard · spam 400 ms | 100 | 100 | 8/12/19 | 170/390/970 | 0 (0) | 0/0/0/0 | —/— | 13.73 | 3.00 | 3/4 |
| hard · spam 700 ms | 100 | 100 | 9/14/21 | 140/370/900 | 0 (0) | 0/0/0/0 | —/— | 12.52 | 3.00 | 3/5 |
| hard · spam 1000 ms | 100 | 100 | 10/13/19 | 120/300/620 | 0 (0) | 0/0/0/0 | —/— | 12.93 | 3.00 | 3/5 |

## exploits — scoring

| diff · player | 1st pt s | pts/min | leaves caught % | catches at ×2+ % | reach ×5 % games | taps/min | flips/min | bump share % |
|---|---|---|---|---|---|---|---|---|
| easy · never taps | 0.9 | 1684 | 46 | 87 | 52 | 0 | 0 | 69 |
| easy · flip on every landing | 1.4 | 3905 | 83 | 94 | 87 | 151 | 151 | 76 |
| easy · spam every 80 ms | 1.4 | 3822 | 82 | 94 | 84 | 672 | 154 | 75 |
| easy · spam 150 ms | 1.4 | 3816 | 83 | 94 | 86 | 380 | 154 | 75 |
| easy · spam 250 ms | 1.0 | 3796 | 82 | 94 | 86 | 233 | 150 | 76 |
| easy · spam 400 ms | 0.9 | 3870 | 80 | 94 | 89 | 148 | 142 | 79 |
| easy · spam 700 ms | 1.0 | 3046 | 68 | 93 | 79 | 85 | 83 | 79 |
| easy · spam 1000 ms | 1.4 | 2584 | 61 | 91 | 65 | 60 | 58 | 75 |
| normal · never taps | 0.7 | 1326 | 43 | 52 | 9 | 0 | 0 | 56 |
| normal · flip on every landing | 0.7 | 1961 | 61 | 56 | 16 | 147 | 147 | 69 |
| normal · spam every 80 ms | 0.7 | 2090 | 62 | 56 | 20 | 674 | 149 | 65 |
| normal · spam 150 ms | 0.7 | 2143 | 62 | 57 | 20 | 381 | 149 | 65 |
| normal · spam 250 ms | 0.7 | 1901 | 62 | 54 | 13 | 234 | 146 | 70 |
| normal · spam 400 ms | 0.8 | 1930 | 62 | 54 | 14 | 149 | 136 | 67 |
| normal · spam 700 ms | 1.1 | 1971 | 56 | 59 | 23 | 86 | 81 | 68 |
| normal · spam 1000 ms | 1.4 | 1507 | 48 | 52 | 10 | 62 | 57 | 66 |
| hard · never taps | 0.6 | 1470 | 43 | 50 | 3 | 0 | 0 | 50 |
| hard · flip on every landing | 0.7 | 2074 | 56 | 55 | 12 | 140 | 140 | 50 |
| hard · spam every 80 ms | 0.7 | 2064 | 56 | 55 | 14 | 674 | 143 | 52 |
| hard · spam 150 ms | 0.7 | 2050 | 56 | 55 | 14 | 381 | 142 | 51 |
| hard · spam 250 ms | 0.7 | 2008 | 56 | 53 | 12 | 234 | 136 | 50 |
| hard · spam 400 ms | 0.7 | 2159 | 58 | 55 | 15 | 149 | 130 | 54 |
| hard · spam 700 ms | 1.1 | 1861 | 49 | 54 | 14 | 87 | 78 | 55 |
| hard · spam 1000 ms | 2.4 | 1445 | 43 | 48 | 5 | 61 | 54 | 48 |

## exploits — health

| diff · player | NaN frames | out-of-corridor frames | stall frames | longest rescue s |
|---|---|---|---|---|
| easy · never taps | 0 | 0 | 0 | 1.37 |
| easy · flip on every landing | 0 | 0 | 0 | 1.35 |
| easy · spam every 80 ms | 0 | 0 | 0 | 1.37 |
| easy · spam 150 ms | 0 | 0 | 0 | 1.37 |
| easy · spam 250 ms | 0 | 0 | 0 | 1.37 |
| easy · spam 400 ms | 0 | 0 | 0 | 1.37 |
| easy · spam 700 ms | 0 | 0 | 0 | 1.37 |
| easy · spam 1000 ms | 0 | 0 | 0 | 1.37 |
| normal · never taps | 0 | 0 | 0 | 1.68 |
| normal · flip on every landing | 0 | 0 | 0 | 1.62 |
| normal · spam every 80 ms | 0 | 0 | 0 | 1.68 |
| normal · spam 150 ms | 0 | 0 | 0 | 1.68 |
| normal · spam 250 ms | 0 | 0 | 0 | 1.62 |
| normal · spam 400 ms | 0 | 0 | 0 | 1.68 |
| normal · spam 700 ms | 0 | 0 | 0 | 1.65 |
| normal · spam 1000 ms | 0 | 0 | 0 | 1.68 |
| hard · never taps | 0 | 0 | 0 | 1.65 |
| hard · flip on every landing | 0 | 0 | 0 | 1.60 |
| hard · spam every 80 ms | 0 | 0 | 0 | 1.65 |
| hard · spam 150 ms | 0 | 0 | 0 | 1.65 |
| hard · spam 250 ms | 0 | 0 | 0 | 1.65 |
| hard · spam 400 ms | 0 | 0 | 0 | 1.63 |
| hard · spam 700 ms | 0 | 0 | 0 | 1.60 |
| hard · spam 1000 ms | 0 | 0 | 0 | 1.60 |

## Timing window (ms of time-to-edge at the tap): latest safe tap per hazard, and the guaranteed-safe earliest tap

| diff | zone | speed u/s | vent AC | vent chimney | sign | gap 1.0 u | gap 1.8 u | earliest guaranteed |
|---|---|---|---|---|---|---|---|---|
| easy | dawn | 2.34 | 85 | 144 | 94 | -190 | -190 | 1058 |
| easy | night | 3.04 | 88 | 138 | 97 | -170 | -170 | 987 |
| normal | dawn | 3.00 | 183 | 233 | 192 | -175 | -175 | 990 |
| normal | night | 3.90 | 176 | 218 | 185 | -157 | -157 | 934 |
| hard | dawn | 3.45 | 194 | 227 | 202 | -164 | -164 | 958 |
| hard | night | 4.48 | 175 | 209 | 184 | -150 | -150 | 910 |

## Track density (per minute of play; wall lamps per floor)

| diff | dawn hazards / forced flips / gap % / leaves / lamps | noon hazards / forced flips / gap % / leaves / lamps | sunset hazards / forced flips / gap % / leaves / lamps | night hazards / forced flips / gap % / leaves / lamps |
|---|---|---|---|---|
| easy | 14.5 / 8.0 / 31 / 131 / 38.3 | 17.6 / 11.4 / 28 / 148 / 44.0 | 17.7 / 12.2 / 28 / 168 / 49.3 | 19.2 / 12.1 / 33 / 156 / 57.3 |
| normal | 26.4 / 14.5 / 63 / 188 / 48.7 | 31.7 / 18.2 / 36 / 203 / 56.0 | 31.3 / 22.4 / 49 / 194 / 63.7 | 33.3 / 21.0 / 57 / 233 / 73.7 |
| hard | 35.7 / 21.5 / 51 / 214 / 55.7 | 40.5 / 26.4 / 40 / 241 / 63.3 | 42.9 / 28.3 / 50 / 250 / 74.3 | 43.3 / 27.6 / 58 / 285 / 84.0 |

## Determinism

| diff | player | same seed twice | replay by sub-step = live |
|---|---|---|---|
| easy | bot05 | true | true (20040 vs 20040) |
| easy | kid | true | true (8980 vs 8980) |
| normal | bot05 | true | true (23640 vs 23640) |
| normal | kid | true | true (3410 vs 3410) |
| hard | bot05 | true | true (31400 vs 31400) |
| hard | kid | true | true (2700 vs 2700) |

## Frame rate

| run | n | over% | surv p10/50/90 s | score p10/50/90 | levels p50 (max) | clear floor 1/2/3/4 % | hearts left at door 1/2 p50 | hits/min | Dawn hits | 1st hit p10/p50 s | Boot Room (dawn) s | Greenhouse (noon) s | Map Library (sunset) s | Lantern Deck (night) s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot 0.5 normal @30 fps | 40 | 98 | 57/177/449 | 3560/15920/49550 | 2 (8) | 88/65/38/20 | 2/2 | 1.32 | 1.18 | 12/35 | 62.2 | 68.2 | 72.2 | 76.2 |
| bot 0.5 normal @60 fps | 40 | 98 | 57/177/449 | 3560/16020/49700 | 2 (8) | 88/65/38/20 | 2/2 | 1.31 | 1.18 | 12/35 | 62.2 | 68.2 | 72.2 | 76.2 |
| bot 0.5 normal @144 fps | 40 | 100 | 57/177/449 | 3560/16020/49700 | 2 (7) | 88/65/38/20 | 2/2 | 1.35 | 1.18 | 12/35 | 62.2 | 68.2 | 72.2 | 76.2 |

## Level time over two rounds (bot skill 1, mean s per level 1…12)

| diff | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | L11 | L12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | 62.2 | 68.2 | 72.2 | 76.2 | 61.7 | 68.2 | 72.2 | 76.2 | 61.6 | 68.2 | 72.2 | 76.2 |
| normal | 62.2 | 68.2 | 72.2 | 76.2 | 61.7 | 68.2 | 72.2 | 76.2 | 61.6 | 68.2 | 72.2 | 76.2 |
| hard | 62.2 | 68.2 | 72.2 | 76.2 | 61.7 | 68.2 | 72.2 | 76.2 | 61.6 | 68.2 | 72.2 | 76.2 |
