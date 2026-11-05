# Playtest sims — baseline

rounds per row: 100, cap 600 s, 960×540, dt 1/60

## bots — survival

| diff · player | n | over% | surv p10/50/90 s | score p10/50/90 | levels p50 (max) | reach Noon/Sunset/Night/Loop % | batt. left at Dawn/Noon arch p50 | hits/min | Dawn hits | 1st hit p10/p50 s |
|---|---|---|---|---|---|---|---|---|---|---|
| easy · bot skill 1 | 100 | 0 | 600/600/600 | 39690/41940/43540 | 8 (8) | 100/100/100/100 | 5/5 | 0.00 | 0.00 | 600/600 |
| easy · bot skill 0.8 | 100 | 0 | 600/600/600 | 39640/41740/43340 | 8 (8) | 100/100/100/100 | 5/5 | 0.12 | 0.07 | 82/463 |
| easy · bot skill 0.5 | 100 | 40 | 268/600/600 | 13590/32290/34790 | 8 (8) | 100/100/96/88 | 4/4 | 0.97 | 0.90 | 12/46 |
| easy · bot skill 0.3 | 100 | 93 | 121/276/489 | 5440/14490/25490 | 3 (8) | 99/89/74/48 | 4/3 | 1.60 | 1.50 | 10/30 |
| normal · bot skill 1 | 100 | 0 | 600/600/600 | 15950/16870/18130 | 8 (8) | 100/100/100/100 | 3/3 | 0.00 | 0.00 | 600/600 |
| normal · bot skill 0.8 | 100 | 0 | 600/600/600 | 15730/16700/17910 | 8 (8) | 100/100/100/100 | 3/3 | 0.17 | 0.16 | 50/267 |
| normal · bot skill 0.5 | 100 | 97 | 48/184/432 | 730/3390/9220 | 2 (8) | 81/62/41/25 | 2/2 | 1.39 | 1.48 | 8/27 |
| normal · bot skill 0.3 | 100 | 100 | 37/100/233 | 580/1580/4150 | 1 (7) | 64/29/11/3 | 2/1 | 2.08 | 1.94 | 7/18 |
| hard · bot skill 1 | 100 | 0 | 600/600/600 | 18000/19380/20650 | 8 (8) | 100/100/100/100 | 3/3 | 0.00 | 0.00 | 600/600 |
| hard · bot skill 0.8 | 100 | 1 | 600/600/600 | 17720/19060/20400 | 8 (8) | 100/100/100/100 | 3/3 | 0.24 | 0.23 | 38/207 |
| hard · bot skill 0.5 | 100 | 100 | 35/121/315 | 650/2460/8780 | 1 (8) | 71/46/28/15 | 2/2 | 1.66 | 1.65 | 7/26 |
| hard · bot skill 0.3 | 100 | 100 | 31/59/187 | 470/1100/4020 | 0 (3) | 46/21/6/0 | 1/1 | 2.50 | 2.28 | 6/19 |

## bots — scoring

| diff · player | 1st pt s | pts/min | own caught % | wrong hit % | purity % | catches at ×2+ % | reach ×5 % games | taps/min | flips/min | bump share % |
|---|---|---|---|---|---|---|---|---|---|---|
| easy · bot skill 1 | 0.9 | 4173 | 73 | 59 | 73 | 99 | 100 | 16 | 16 | 0 |
| easy · bot skill 0.8 | 0.9 | 4156 | 72 | 59 | 73 | 99 | 100 | 16 | 16 | 100 |
| easy · bot skill 0.5 | 0.9 | 3286 | 57 | 57 | 69 | 99 | 100 | 13 | 13 | 100 |
| easy · bot skill 0.3 | 0.9 | 3003 | 56 | 56 | 68 | 99 | 100 | 13 | 13 | 100 |
| normal · bot skill 1 | 0.7 | 1696 | 64 | 45 | 76 | 37 | 82 | 23 | 23 | 0 |
| normal · bot skill 0.8 | 0.7 | 1679 | 64 | 45 | 76 | 37 | 80 | 23 | 23 | 100 |
| normal · bot skill 0.5 | 0.7 | 1210 | 57 | 58 | 68 | 27 | 10 | 19 | 19 | 100 |
| normal · bot skill 0.3 | 0.7 | 1051 | 55 | 57 | 68 | 26 | 4 | 18 | 18 | 100 |
| hard · bot skill 1 | 0.6 | 1934 | 66 | 50 | 74 | 35 | 80 | 26 | 26 | 0 |
| hard · bot skill 0.8 | 0.6 | 1911 | 65 | 50 | 74 | 35 | 79 | 26 | 26 | 100 |
| hard · bot skill 0.5 | 0.6 | 1404 | 60 | 61 | 68 | 27 | 12 | 24 | 24 | 100 |
| hard · bot skill 0.3 | 0.6 | 1215 | 57 | 60 | 68 | 25 | 6 | 22 | 22 | 100 |

## bots — level time (p50 of rounds that cleared it)

| diff · player | Dawn s | Noon s | Sunset s | Night s |
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
| hard · bot skill 0.3 | 62.2 | 68.2 | 72.2 | — |

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

| diff · player | n | over% | surv p10/50/90 s | score p10/50/90 | levels p50 (max) | reach Noon/Sunset/Night/Loop % | batt. left at Dawn/Noon arch p50 | hits/min | Dawn hits | 1st hit p10/p50 s |
|---|---|---|---|---|---|---|---|---|---|---|
| easy · kid, struggling 4 y | 100 | 100 | 41/56/102 | 1240/1940/4240 | 0 (1) | 40/0/0/0 | 1/— | 4.94 | 4.34 | 5/13 |
| easy · kid 4–6 (base) | 100 | 100 | 52/104/173 | 1790/4290/8340 | 1 (3) | 79/23/3/0 | 2/1 | 3.37 | 3.12 | 5/13 |
| easy · kid, steady 6 y | 100 | 100 | 103/171/368 | 4590/8690/19890 | 2 (7) | 97/70/31/16 | 3/2 | 2.18 | 2.16 | 6/20 |
| easy · casual adult | 100 | 0 | 600/600/600 | 34140/36040/38040 | 8 (8) | 100/100/100/100 | 5/5 | 0.51 | 0.57 | 13/80 |
| easy · colour-ignorer (adult) | 100 | 3 | 600/600/600 | 35390/37590/39690 | 8 (8) | 99/99/98/97 | 5/5 | 0.46 | 0.52 | 13/90 |
| easy · hazards only (adult) | 100 | 1 | 600/600/600 | 29640/31340/33090 | 8 (8) | 100/100/100/100 | 5/4 | 0.54 | 0.59 | 17/77 |
| normal · kid, struggling 4 y | 100 | 100 | 15/23/41 | 160/330/610 | 0 (0) | 0/0/0/0 | —/— | 7.14 | 3.00 | 4/7 |
| normal · kid 4–6 (base) | 100 | 100 | 17/29/55 | 180/440/800 | 0 (1) | 4/0/0/0 | 2/— | 5.53 | 2.94 | 4/8 |
| normal · kid, steady 6 y | 100 | 100 | 25/44/111 | 290/680/1900 | 0 (2) | 23/5/0/0 | 1/1 | 3.49 | 2.63 | 4/14 |
| normal · casual adult | 100 | 79 | 48/241/600 | 670/4790/14610 | 3 (8) | 79/70/57/43 | 2/2 | 1.06 | 1.40 | 10/31 |
| normal · colour-ignorer (adult) | 100 | 63 | 61/433/600 | 1240/9220/14920 | 6 (8) | 89/80/74/62 | 2/2 | 0.89 | 1.06 | 8/44 |
| normal · hazards only (adult) | 100 | 81 | 51/257/600 | 820/4630/13190 | 3 (8) | 86/71/57/44 | 2/2 | 1.13 | 1.38 | 7/31 |
| hard · kid, struggling 4 y | 100 | 100 | 10/18/28 | 120/270/480 | 0 (0) | 0/0/0/0 | —/— | 9.71 | 3.00 | 3/6 |
| hard · kid 4–6 (base) | 100 | 100 | 13/23/40 | 150/380/750 | 0 (1) | 2/0/0/0 | 1/— | 6.94 | 2.98 | 3/9 |
| hard · kid, steady 6 y | 100 | 100 | 17/39/60 | 260/670/1290 | 0 (1) | 8/0/0/0 | 1/— | 4.50 | 2.88 | 3/9 |
| hard · casual adult | 100 | 98 | 52/162/400 | 910/3420/9630 | 2 (8) | 86/52/37/25 | 2/2 | 1.43 | 1.34 | 7/33 |
| hard · colour-ignorer (adult) | 100 | 91 | 53/188/511 | 930/4220/12940 | 2 (8) | 85/66/45/29 | 2/2 | 1.30 | 1.40 | 6/30 |
| hard · hazards only (adult) | 100 | 98 | 42/123/383 | 700/2610/8980 | 1 (8) | 76/48/32/19 | 2/2 | 1.53 | 1.64 | 6/26 |

## humans — scoring

| diff · player | 1st pt s | pts/min | own caught % | wrong hit % | purity % | catches at ×2+ % | reach ×5 % games | taps/min | flips/min | bump share % |
|---|---|---|---|---|---|---|---|---|---|---|
| easy · kid, struggling 4 y | 0.9 | 2320 | 59 | 58 | 69 | 93 | 100 | 23 | 22 | 80 |
| easy · kid 4–6 (base) | 0.9 | 2692 | 60 | 58 | 69 | 96 | 99 | 21 | 20 | 79 |
| easy · kid, steady 6 y | 0.9 | 3094 | 61 | 60 | 69 | 98 | 100 | 19 | 19 | 77 |
| easy · casual adult | 0.9 | 3604 | 62 | 52 | 72 | 99 | 100 | 16 | 15 | 88 |
| easy · colour-ignorer (adult) | 0.9 | 3752 | 65 | 69 | 67 | 99 | 100 | 18 | 18 | 84 |
| easy · hazards only (adult) | 0.9 | 3134 | 53 | 54 | 68 | 99 | 100 | 14 | 14 | 90 |
| normal · kid, struggling 4 y | 0.7 | 873 | 56 | 54 | 70 | 22 | 1 | 26 | 25 | 69 |
| normal · kid 4–6 (base) | 0.7 | 878 | 57 | 56 | 69 | 22 | 0 | 23 | 22 | 72 |
| normal · kid, steady 6 y | 0.7 | 975 | 57 | 57 | 69 | 25 | 2 | 22 | 22 | 72 |
| normal · casual adult | 0.7 | 1330 | 57 | 52 | 71 | 30 | 20 | 20 | 20 | 88 |
| normal · colour-ignorer (adult) | 0.7 | 1355 | 59 | 63 | 67 | 27 | 21 | 22 | 22 | 85 |
| normal · hazards only (adult) | 0.7 | 1180 | 51 | 54 | 68 | 27 | 15 | 19 | 19 | 88 |
| hard · kid, struggling 4 y | 0.6 | 910 | 54 | 54 | 70 | 19 | 0 | 29 | 28 | 68 |
| hard · kid 4–6 (base) | 0.6 | 1001 | 56 | 57 | 69 | 21 | 0 | 27 | 26 | 72 |
| hard · kid, steady 6 y | 0.6 | 1104 | 57 | 57 | 69 | 25 | 3 | 26 | 25 | 70 |
| hard · casual adult | 0.6 | 1397 | 56 | 54 | 69 | 29 | 19 | 25 | 25 | 85 |
| hard · colour-ignorer (adult) | 0.6 | 1427 | 57 | 60 | 68 | 27 | 19 | 26 | 26 | 83 |
| hard · hazards only (adult) | 0.6 | 1294 | 54 | 55 | 68 | 27 | 12 | 25 | 25 | 86 |

## humans — level time (p50 of rounds that cleared it)

| diff · player | Dawn s | Noon s | Sunset s | Night s |
|---|---|---|---|---|
| easy · kid, struggling 4 y | 62.2 | — | — | — |
| easy · kid 4–6 (base) | 62.2 | 68.2 | 72.2 | — |
| easy · kid, steady 6 y | 62.2 | 68.2 | 72.2 | 76.2 |
| easy · casual adult | 62.2 | 68.2 | 72.2 | 76.2 |
| easy · colour-ignorer (adult) | 62.2 | 68.2 | 72.2 | 76.2 |
| easy · hazards only (adult) | 62.2 | 68.2 | 72.2 | 76.2 |
| normal · kid, struggling 4 y | — | — | — | — |
| normal · kid 4–6 (base) | 62.2 | — | — | — |
| normal · kid, steady 6 y | 62.2 | 68.2 | — | — |
| normal · casual adult | 62.2 | 68.2 | 72.2 | 76.2 |
| normal · colour-ignorer (adult) | 62.2 | 68.2 | 72.2 | 76.2 |
| normal · hazards only (adult) | 62.2 | 68.2 | 72.2 | 76.2 |
| hard · kid, struggling 4 y | — | — | — | — |
| hard · kid 4–6 (base) | 62.2 | — | — | — |
| hard · kid, steady 6 y | 62.2 | — | — | — |
| hard · casual adult | 62.2 | 68.2 | 72.2 | 76.2 |
| hard · colour-ignorer (adult) | 62.2 | 68.2 | 72.2 | 76.2 |
| hard · hazards only (adult) | 62.2 | 68.2 | 72.2 | 76.2 |

## humans — health

| diff · player | NaN frames | out-of-corridor frames | stall frames | longest rescue s |
|---|---|---|---|---|
| easy · kid, struggling 4 y | 0 | 0 | 0 | 1.77 |
| easy · kid 4–6 (base) | 0 | 0 | 0 | 1.77 |
| easy · kid, steady 6 y | 0 | 0 | 0 | 1.72 |
| easy · casual adult | 0 | 0 | 0 | 1.58 |
| easy · colour-ignorer (adult) | 0 | 0 | 0 | 1.57 |
| easy · hazards only (adult) | 0 | 0 | 0 | 1.73 |
| normal · kid, struggling 4 y | 0 | 0 | 0 | 1.68 |
| normal · kid 4–6 (base) | 0 | 0 | 0 | 1.65 |
| normal · kid, steady 6 y | 0 | 0 | 0 | 1.67 |
| normal · casual adult | 0 | 0 | 0 | 1.67 |
| normal · colour-ignorer (adult) | 0 | 0 | 0 | 1.62 |
| normal · hazards only (adult) | 0 | 0 | 0 | 1.65 |
| hard · kid, struggling 4 y | 0 | 0 | 0 | 1.62 |
| hard · kid 4–6 (base) | 0 | 0 | 0 | 1.58 |
| hard · kid, steady 6 y | 0 | 0 | 0 | 1.58 |
| hard · casual adult | 0 | 0 | 0 | 1.63 |
| hard · colour-ignorer (adult) | 0 | 0 | 0 | 1.60 |
| hard · hazards only (adult) | 0 | 0 | 0 | 1.43 |

## exploits — survival

| diff · player | n | over% | surv p10/50/90 s | score p10/50/90 | levels p50 (max) | reach Noon/Sunset/Night/Loop % | batt. left at Dawn/Noon arch p50 | hits/min | Dawn hits | 1st hit p10/p50 s |
|---|---|---|---|---|---|---|---|---|---|---|
| easy · never taps | 100 | 100 | 24/33/46 | 290/690/1290 | 0 (0) | 0/0/0/0 | —/— | 8.87 | 5.00 | 5/6 |
| easy · flip on every landing | 100 | 100 | 18/24/34 | 450/990/1740 | 0 (0) | 0/0/0/0 | —/— | 11.89 | 5.00 | 5/6 |
| easy · spam every 80 ms | 100 | 100 | 19/25/37 | 540/990/1890 | 0 (0) | 0/0/0/0 | —/— | 11.36 | 5.00 | 5/6 |
| easy · spam 150 ms | 100 | 100 | 19/25/35 | 540/990/1790 | 0 (0) | 0/0/0/0 | —/— | 11.45 | 5.00 | 5/6 |
| easy · spam 250 ms | 100 | 100 | 19/25/35 | 490/1140/1840 | 0 (0) | 0/0/0/0 | —/— | 11.52 | 5.00 | 5/6 |
| easy · spam 400 ms | 100 | 100 | 18/26/35 | 490/990/1690 | 0 (0) | 0/0/0/0 | —/— | 11.55 | 5.00 | 5/6 |
| easy · spam 700 ms | 100 | 100 | 20/29/39 | 490/940/1840 | 0 (0) | 0/0/0/0 | —/— | 10.18 | 5.00 | 5/6 |
| easy · spam 1000 ms | 100 | 100 | 20/31/48 | 410/940/1890 | 0 (1) | 1/0/0/0 | 1/— | 9.29 | 4.99 | 5/8 |
| normal · never taps | 100 | 100 | 9/15/21 | 80/140/270 | 0 (0) | 0/0/0/0 | —/— | 11.74 | 3.00 | 3/4 |
| normal · flip on every landing | 100 | 100 | 8/12/18 | 90/160/260 | 0 (0) | 0/0/0/0 | —/— | 14.37 | 3.00 | 3/4 |
| normal · spam every 80 ms | 100 | 100 | 9/12/18 | 80/180/290 | 0 (0) | 0/0/0/0 | —/— | 13.99 | 3.00 | 3/4 |
| normal · spam 150 ms | 100 | 100 | 9/12/19 | 80/170/310 | 0 (0) | 0/0/0/0 | —/— | 13.66 | 3.00 | 3/4 |
| normal · spam 250 ms | 100 | 100 | 8/12/18 | 90/170/300 | 0 (0) | 0/0/0/0 | —/— | 14.13 | 3.00 | 3/4 |
| normal · spam 400 ms | 100 | 100 | 8/13/18 | 90/180/300 | 0 (0) | 0/0/0/0 | —/— | 13.53 | 3.00 | 3/4 |
| normal · spam 700 ms | 100 | 100 | 10/15/21 | 100/190/310 | 0 (0) | 0/0/0/0 | —/— | 11.77 | 3.00 | 3/5 |
| normal · spam 1000 ms | 100 | 100 | 10/14/20 | 80/160/270 | 0 (0) | 0/0/0/0 | —/— | 12.38 | 3.00 | 3/4 |
| hard · never taps | 100 | 100 | 9/13/17 | 80/150/250 | 0 (0) | 0/0/0/0 | —/— | 13.64 | 3.00 | 3/4 |
| hard · flip on every landing | 100 | 100 | 8/11/17 | 110/190/280 | 0 (0) | 0/0/0/0 | —/— | 15.24 | 3.00 | 3/4 |
| hard · spam every 80 ms | 100 | 100 | 8/11/14 | 100/160/280 | 0 (0) | 0/0/0/0 | —/— | 16.30 | 3.00 | 3/4 |
| hard · spam 150 ms | 100 | 100 | 8/10/14 | 90/160/260 | 0 (0) | 0/0/0/0 | —/— | 16.40 | 3.00 | 3/4 |
| hard · spam 250 ms | 100 | 100 | 9/12/16 | 100/190/290 | 0 (0) | 0/0/0/0 | —/— | 14.88 | 3.00 | 3/4 |
| hard · spam 400 ms | 100 | 100 | 9/11/17 | 110/180/310 | 0 (0) | 0/0/0/0 | —/— | 15.13 | 3.00 | 3/4 |
| hard · spam 700 ms | 100 | 100 | 8/11/18 | 70/140/230 | 0 (0) | 0/0/0/0 | —/— | 14.74 | 3.00 | 3/4 |
| hard · spam 1000 ms | 100 | 100 | 9/12/16 | 50/130/230 | 0 (0) | 0/0/0/0 | —/— | 14.54 | 3.00 | 3/4 |

## exploits — scoring

| diff · player | 1st pt s | pts/min | own caught % | wrong hit % | purity % | catches at ×2+ % | reach ×5 % games | taps/min | flips/min | bump share % |
|---|---|---|---|---|---|---|---|---|---|---|
| easy · never taps | 0.9 | 1279 | 47 | 47 | 68 | 83 | 68 | 0 | 0 | 77 |
| easy · flip on every landing | 0.9 | 2591 | 83 | 82 | 69 | 87 | 88 | 151 | 151 | 84 |
| easy · spam every 80 ms | 1.4 | 2550 | 83 | 82 | 69 | 87 | 91 | 673 | 154 | 83 |
| easy · spam 150 ms | 1.4 | 2553 | 83 | 82 | 69 | 87 | 90 | 380 | 154 | 82 |
| easy · spam 250 ms | 0.9 | 2601 | 84 | 80 | 69 | 87 | 89 | 233 | 149 | 83 |
| easy · spam 400 ms | 0.9 | 2488 | 81 | 82 | 68 | 87 | 89 | 148 | 141 | 84 |
| easy · spam 700 ms | 1.1 | 2157 | 71 | 66 | 70 | 87 | 86 | 86 | 83 | 84 |
| easy · spam 1000 ms | 1.4 | 1943 | 62 | 60 | 69 | 87 | 84 | 61 | 58 | 79 |
| normal · never taps | 0.7 | 634 | 46 | 45 | 70 | 14 | 0 | 0 | 0 | 62 |
| normal · flip on every landing | 0.7 | 856 | 62 | 62 | 71 | 14 | 0 | 145 | 145 | 67 |
| normal · spam every 80 ms | 0.7 | 877 | 61 | 62 | 70 | 15 | 0 | 674 | 150 | 71 |
| normal · spam 150 ms | 0.7 | 873 | 62 | 61 | 70 | 15 | 0 | 381 | 149 | 70 |
| normal · spam 250 ms | 0.7 | 869 | 62 | 61 | 71 | 14 | 0 | 235 | 144 | 68 |
| normal · spam 400 ms | 0.8 | 843 | 62 | 62 | 70 | 13 | 0 | 149 | 137 | 70 |
| normal · spam 700 ms | 1.1 | 782 | 56 | 54 | 70 | 15 | 0 | 87 | 80 | 68 |
| normal · spam 1000 ms | 1.4 | 684 | 49 | 51 | 69 | 14 | 0 | 62 | 57 | 69 |
| hard · never taps | 0.6 | 722 | 46 | 42 | 72 | 14 | 0 | 0 | 0 | 56 |
| hard · flip on every landing | 0.7 | 949 | 59 | 55 | 72 | 15 | 0 | 141 | 141 | 61 |
| hard · spam every 80 ms | 0.7 | 952 | 59 | 55 | 73 | 15 | 0 | 674 | 143 | 62 |
| hard · spam 150 ms | 0.7 | 926 | 58 | 55 | 73 | 14 | 0 | 381 | 142 | 61 |
| hard · spam 250 ms | 0.7 | 953 | 58 | 56 | 72 | 15 | 0 | 235 | 140 | 63 |
| hard · spam 400 ms | 0.8 | 1001 | 60 | 57 | 73 | 16 | 0 | 149 | 134 | 66 |
| hard · spam 700 ms | 1.1 | 731 | 48 | 48 | 70 | 11 | 0 | 87 | 78 | 66 |
| hard · spam 1000 ms | 2.4 | 675 | 43 | 46 | 69 | 14 | 0 | 62 | 55 | 61 |

## exploits — health

| diff · player | NaN frames | out-of-corridor frames | stall frames | longest rescue s |
|---|---|---|---|---|
| easy · never taps | 0 | 0 | 0 | 1.78 |
| easy · flip on every landing | 0 | 0 | 0 | 1.68 |
| easy · spam every 80 ms | 0 | 0 | 0 | 1.77 |
| easy · spam 150 ms | 0 | 0 | 0 | 1.77 |
| easy · spam 250 ms | 0 | 0 | 0 | 1.68 |
| easy · spam 400 ms | 0 | 0 | 0 | 1.77 |
| easy · spam 700 ms | 0 | 0 | 0 | 1.77 |
| easy · spam 1000 ms | 0 | 0 | 0 | 1.73 |
| normal · never taps | 0 | 0 | 0 | 1.62 |
| normal · flip on every landing | 0 | 0 | 0 | 1.68 |
| normal · spam every 80 ms | 0 | 0 | 0 | 1.55 |
| normal · spam 150 ms | 0 | 0 | 0 | 1.55 |
| normal · spam 250 ms | 0 | 0 | 0 | 1.68 |
| normal · spam 400 ms | 0 | 0 | 0 | 1.68 |
| normal · spam 700 ms | 0 | 0 | 0 | 1.68 |
| normal · spam 1000 ms | 0 | 0 | 0 | 1.65 |
| hard · never taps | 0 | 0 | 0 | 1.60 |
| hard · flip on every landing | 0 | 0 | 0 | 1.63 |
| hard · spam every 80 ms | 0 | 0 | 0 | 1.63 |
| hard · spam 150 ms | 0 | 0 | 0 | 1.63 |
| hard · spam 250 ms | 0 | 0 | 0 | 1.63 |
| hard · spam 400 ms | 0 | 0 | 0 | 1.63 |
| hard · spam 700 ms | 0 | 0 | 0 | 1.65 |
| hard · spam 1000 ms | 0 | 0 | 0 | 1.65 |

## Timing window (ms of time-to-edge at the tap): latest safe tap per hazard, and the guaranteed-safe earliest tap

| diff | zone | speed u/s | vent AC | vent chimney | sign | gap 1.0 u | gap 1.8 u | earliest guaranteed |
|---|---|---|---|---|---|---|---|---|
| easy | dawn | 2.34 | 152 | 194 | 160 | -190 | -190 | 1058 |
| easy | night | 3.04 | 138 | 180 | 147 | -170 | -170 | 987 |
| normal | dawn | 3.00 | 183 | 233 | 192 | -175 | -175 | 990 |
| normal | night | 3.90 | 176 | 218 | 185 | -157 | -157 | 934 |
| hard | dawn | 3.45 | 194 | 227 | 202 | -164 | -164 | 958 |
| hard | night | 4.48 | 175 | 209 | 184 | -150 | -150 | 910 |

## Track density (per minute of play; gates per level)

| diff | dawn hazards / forced flips / gap % / fireflies / gates | noon hazards / forced flips / gap % / fireflies / gates | sunset hazards / forced flips / gap % / fireflies / gates | night hazards / forced flips / gap % / fireflies / gates |
|---|---|---|---|---|
| easy | 20.9 / 8.7 / 29 / 133 / 5.0 | 22.0 / 13.2 / 31 / 149 / 6.3 | 22.2 / 16.1 / 30 / 159 / 6.7 | 23.4 / 15.0 / 29 / 175 / 7.0 |
| normal | 29.9 / 14.8 / 37 / 190 / 5.7 | 29.9 / 20.2 / 52 / 203 / 6.7 | 31.3 / 20.8 / 52 / 197 / 6.7 | 34.4 / 20.7 / 45 / 224 / 7.0 |
| hard | 38.6 / 19.9 / 38 / 219 / 5.3 | 41.6 / 24.3 / 51 / 245 / 6.3 | 41.6 / 26.0 / 55 / 250 / 6.7 | 43.3 / 27.8 / 61 / 258 / 7.3 |

## Determinism

| diff | player | same seed twice | replay by sub-step = live |
|---|---|---|---|
| easy | bot05 | true | true (13540 vs 13540) |
| easy | kid | true | true (3490 vs 3490) |
| normal | bot05 | true | true (5290 vs 5290) |
| normal | kid | true | true (280 vs 280) |
| hard | bot05 | true | true (6040 vs 6040) |
| hard | kid | true | true (140 vs 140) |

## Frame rate

| run | n | over% | surv p10/50/90 s | score p10/50/90 | levels p50 (max) | reach Noon/Sunset/Night/Loop % | batt. left at Dawn/Noon arch p50 | hits/min | Dawn hits | 1st hit p10/p50 s | Dawn s | Noon s | Sunset s | Night s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot 0.5 normal @30 fps | 40 | 95 | 44/159/397 | 720/2730/8660 | 2 (8) | 83/58/33/20 | 2/1 | 1.50 | 1.50 | 8/27 | 62.2 | 68.2 | 72.2 | 76.2 |
| bot 0.5 normal @60 fps | 40 | 93 | 44/159/401 | 730/2750/8730 | 2 (8) | 83/58/33/20 | 2/1 | 1.47 | 1.50 | 8/27 | 62.2 | 68.2 | 72.2 | 76.2 |
| bot 0.5 normal @144 fps | 40 | 93 | 50/176/532 | 750/3010/12060 | 2 (8) | 85/63/38/25 | 2/1 | 1.41 | 1.45 | 8/27 | 62.2 | 68.2 | 72.2 | 76.2 |

## Level time over two rounds (bot skill 1, mean s per level 1…12)

| diff | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | L11 | L12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | 62.2 | 68.2 | 72.2 | 76.2 | 61.7 | 68.2 | 72.2 | 76.2 | 61.6 | 68.2 | 72.2 | 76.2 |
| normal | 62.2 | 68.2 | 72.2 | 76.2 | 61.7 | 68.2 | 72.2 | 76.2 | 61.6 | 68.2 | 72.2 | 76.2 |
| hard | 62.2 | 68.2 | 72.2 | 76.2 | 61.7 | 68.2 | 72.2 | 76.2 | 61.6 | 68.2 | 72.2 | 76.2 |
