# hs_playtest sb28 — 1350 sessions (0 failed), config {"shortBudget":[1000000000,28,30,50]} (125 s)

| model | age | n | done % | session min (p90) | chapter s mean [p10–p90] | cut % | round s (p90) | trace s (p90) | rounds > 120 s (max s) | no progress > 60 s (max gap s) | stars 3/2/1 % | wrong / needPick per round | offPath / traceTap per round | hints choice / path per round (rounds with a hint %) | magic icing rounds % | pick assist rounds % | idle/round | talk right % | NaN / stuck / off / 2nd-miss-no-hint |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 150 | 100.0 | 7.1 (7.7) | 104.5 [84.1–128.3] | 96.2 | 30.5 (43.8) | 12.8 (20.6) | 0 (75.3) | 0 (49.1) | 63.6/22.9/13.5 | 0.55 / 0.22 | 0.33 / 0.17 | 0.26 / 0.41 (48.5) | 0.2 | 0.5 | 0.26 | 58.7 | 0 / 0 / 0 / 19 |
| slow3 | 4 | 150 | 100.0 | 7.2 (7.8) | 105.7 [85.0–131.3] | 97.2 | 31.0 (44.6) | 12.8 (21.7) | 0 (81.7) | 1 (62.0) | 68.6/20.8/10.6 | 0.46 / 0.20 | 0.28 / 0.15 | 0.23 / 0.43 (49.2) | 0.0 | 0.3 | 0.26 | 59.7 | 0 / 0 / 0 / 14 |
| slow3 | 5 | 150 | 100.0 | 7.6 (8.5) | 112.4 [86.5–140.6] | 97.8 | 33.3 (50.4) | 14.2 (24.3) | 0 (115.3) | 0 (45.8) | 67.7/20.0/12.3 | 0.49 / 0.18 | 0.32 / 0.21 | 0.24 / 0.55 (52.6) | 0.0 | 0.7 | 0.30 | 58.2 | 0 / 0 / 0 / 14 |
| typical | 3 | 150 | 100.0 | 5.7 (6.0) | 83.6 [75.7–92.0] | 23.3 | 19.5 (25.8) | 7.0 (10.7) | 0 (54.9) | 0 (32.0) | 74.0/19.4/6.6 | 0.33 / 0.09 | 0.14 / 0.10 | 0.11 / 0.08 (17.4) | 0.0 | 0.0 | 0.03 | 76.2 | 0 / 0 / 0 / 8 |
| typical | 4 | 150 | 100.0 | 5.6 (5.9) | 81.6 [73.6–91.3] | 20.2 | 18.8 (25.5) | 6.4 (9.9) | 0 (46.7) | 0 (28.1) | 83.3/13.5/3.2 | 0.20 / 0.09 | 0.16 / 0.05 | 0.06 / 0.08 (13.4) | 0.0 | 0.0 | 0.03 | 87.2 | 0 / 0 / 0 / 5 |
| typical | 5 | 150 | 100.0 | 5.3 (5.6) | 77.3 [68.3–90.2] | 11.5 | 17.3 (23.4) | 5.5 (7.9) | 0 (44.2) | 0 (22.7) | 88.9/9.2/1.9 | 0.13 / 0.04 | 0.09 / 0.05 | 0.03 / 0.04 (7.0) | 0.0 | 0.0 | 0.01 | 91.5 | 0 / 0 / 0 / 2 |
| wobbly | 3 | 150 | 100.0 | 5.7 (6.1) | 84.0 [75.4–94.2] | 31.0 | 20.0 (26.6) | 7.7 (12.5) | 0 (45.4) | 0 (27.5) | 75.3/18.7/6.1 | 0.31 / 0.10 | 0.24 / 0.11 | 0.10 / 0.11 (19.7) | 0.0 | 0.0 | 0.03 | 77.5 | 0 / 0 / 0 / 4 |
| wobbly | 4 | 150 | 100.0 | 5.6 (5.9) | 81.9 [73.6–91.7] | 23.3 | 19.1 (25.9) | 6.7 (10.9) | 0 (60.5) | 0 (27.9) | 83.9/13.2/2.9 | 0.19 / 0.09 | 0.21 / 0.05 | 0.05 / 0.09 (13.1) | 0.0 | 0.0 | 0.03 | 90.0 | 0 / 0 / 0 / 5 |
| wobbly | 5 | 150 | 100.0 | 5.3 (5.6) | 78.3 [70.1–88.4] | 15.7 | 17.7 (23.9) | 6.0 (9.0) | 0 (42.0) | 0 (19.9) | 87.7/10.8/1.5 | 0.14 / 0.05 | 0.09 / 0.07 | 0.02 / 0.05 (7.5) | 0.0 | 0.0 | 0.01 | 88.8 | 0 / 0 / 0 / 2 |

| model | age | round s p50 / p75 / p90 / p99 | rounds no-progress > 30 s % | talk right / wrong / Tumi-answered % | same round key back to back | same asked values back to back | animals sharing a home in a round |
|---|---|---|---|---|---|---|
| slow3 | 3 | 28.5 / 35.3 / 43.8 / 61.2 | 2.5 | 58.7 / 41.3 / 0.0 | 0 | 0 | 0 |
| slow3 | 4 | 28.8 / 36.1 / 44.6 / 62.3 | 1.8 | 59.7 / 40.3 / 0.0 | 0 | 0 | 0 |
| slow3 | 5 | 30.2 / 39.0 / 50.4 / 73.3 | 3.0 | 58.2 / 41.8 / 0.0 | 0 | 0 | 0 |
| typical | 3 | 18.1 / 21.2 / 25.8 / 36.2 | 0.1 | 76.2 / 23.8 / 0.0 | 0 | 0 | 0 |
| typical | 4 | 17.0 / 21.5 / 25.5 / 34.8 | 0.0 | 87.2 / 12.8 / 0.0 | 0 | 0 | 0 |
| typical | 5 | 15.5 / 18.8 / 23.4 / 32.3 | 0.0 | 91.5 / 8.5 / 0.0 | 0 | 0 | 0 |
| wobbly | 3 | 18.8 / 22.5 / 26.6 / 35.7 | 0.0 | 77.5 / 22.5 / 0.0 | 0 | 0 | 0 |
| wobbly | 4 | 17.3 / 21.8 / 25.9 / 35.9 | 0.0 | 90.0 / 10.0 / 0.0 | 0 | 0 | 0 |
| wobbly | 5 | 16.1 / 19.7 / 23.9 / 31.8 | 0.0 | 88.8 / 11.2 / 0.0 | 0 | 0 | 0 |

| age | content seen (all models) |
|---|---|
| 3 | animal (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:animals (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:colors (6): blue green orange purple red yellow<br>choice:count (6): 1 2 3 4 5 6<br>choice:shapes (5): circle heart square star triangle<br>choice:size (2): big small<br>count (5): 1 2 3 4 5<br>home (8): barn burrow coop hive kennel nest pond sty<br>numeral (6): 1 2 3 4 5 6<br>shape (5): circle heart square star triangle<br>trace:animals (8): barn burrow coop hive kennel nest pond sty<br>trace:colors (4): arc line wave zigzag<br>trace:count (5): 1 2 3 4 5<br>trace:shapes (5): circle heart square star triangle<br>trace:size (1): circle |
| 4 | animal (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:animals (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:colors (6): blue green orange purple red yellow<br>choice:count (6): 1 2 3 4 5 6<br>choice:shapes (5): circle heart square star triangle<br>choice:size (2): big small<br>count (5): 1 2 3 4 5<br>home (8): barn burrow coop hive kennel nest pond sty<br>numeral (6): 1 2 3 4 5 6<br>shape (5): circle heart square star triangle<br>trace:animals (8): barn burrow coop hive kennel nest pond sty<br>trace:colors (5): arc line loop wave zigzag<br>trace:count (5): 1 2 3 4 5<br>trace:shapes (5): circle heart square star triangle<br>trace:size (1): circle |
| 5 | animal (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:animals (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:colors (7): blue green orange pink purple red yellow<br>choice:count (6): 1 2 3 4 5 6<br>choice:letters (26): A B C D E F G H I J K L M N O P Q R S T U V W X Y Z<br>choice:shapes (8): circle diamond heart oval rect square star triangle<br>count (10): 1 2 3 4 5 6 7 8 9 10<br>home (8): barn burrow coop hive kennel nest pond sty<br>numeral (10): 1 2 3 4 5 6 7 8 9 10<br>shape (8): circle diamond heart oval rect square star triangle<br>trace:animals (8): barn burrow coop hive kennel nest pond sty<br>trace:colors (6): arc line loop swirl wave zigzag<br>trace:count (10): 1 2 3 4 5 6 7 8 9 10<br>trace:letters (26): A B C D E F G H I J K L M N O P Q R S T U V W X Y Z<br>trace:shapes (8): circle diamond heart oval rect square star triangle |

| model | age | topic | chapters | mean s | p90 s | round s | magic % |
|---|---|---|---|---|---|---|---|
| slow3 | 3 | animals | 134 | 96.5 | 113.8 | 27.4 | 0.0 |
| slow3 | 3 | colors | 131 | 96.3 | 112.0 | 27.4 | 0.0 |
| slow3 | 3 | count | 74 | 121.1 | 144.7 | 36.4 | 0.5 |
| slow3 | 3 | shapes | 133 | 107.9 | 128.9 | 32.0 | 0.3 |
| slow3 | 3 | size | 128 | 108.4 | 130.0 | 32.1 | 0.3 |
| slow3 | 4 | animals | 135 | 97.0 | 112.7 | 27.5 | 0.0 |
| slow3 | 4 | colors | 134 | 96.5 | 113.4 | 27.8 | 0.0 |
| slow3 | 4 | count | 127 | 124.6 | 146.8 | 37.6 | 0.0 |
| slow3 | 4 | shapes | 130 | 107.1 | 126.5 | 31.7 | 0.0 |
| slow3 | 4 | size | 74 | 103.6 | 120.5 | 30.7 | 0.0 |
| slow3 | 5 | animals | 132 | 95.9 | 113.3 | 27.4 | 0.0 |
| slow3 | 5 | colors | 74 | 98.6 | 115.2 | 28.4 | 0.0 |
| slow3 | 5 | count | 126 | 135.5 | 160.4 | 41.3 | 0.0 |
| slow3 | 5 | letters | 136 | 118.6 | 142.3 | 35.5 | 0.0 |
| slow3 | 5 | shapes | 132 | 108.3 | 127.8 | 32.1 | 0.0 |
| typical | 3 | animals | 134 | 81.2 | 88.5 | 17.9 | 0.0 |
| typical | 3 | colors | 131 | 81.8 | 90.2 | 18.1 | 0.0 |
| typical | 3 | count | 74 | 86.5 | 96.5 | 25.1 | 0.0 |
| typical | 3 | shapes | 133 | 86.1 | 94.1 | 20.1 | 0.0 |
| typical | 3 | size | 128 | 83.6 | 89.7 | 19.4 | 0.0 |
| typical | 4 | animals | 135 | 77.2 | 85.3 | 17.0 | 0.0 |
| typical | 4 | colors | 134 | 80.6 | 87.4 | 17.6 | 0.0 |
| typical | 4 | count | 127 | 86.8 | 98.3 | 23.6 | 0.0 |
| typical | 4 | shapes | 130 | 82.3 | 90.3 | 18.4 | 0.0 |
| typical | 4 | size | 74 | 81.5 | 88.7 | 18.1 | 0.0 |
| typical | 5 | animals | 132 | 71.1 | 77.8 | 15.3 | 0.0 |
| typical | 5 | colors | 74 | 76.3 | 79.9 | 16.6 | 0.0 |
| typical | 5 | count | 126 | 88.1 | 99.9 | 22.4 | 0.0 |
| typical | 5 | letters | 136 | 76.8 | 85.5 | 16.7 | 0.0 |
| typical | 5 | shapes | 132 | 74.1 | 80.5 | 16.0 | 0.0 |
| wobbly | 3 | animals | 134 | 81.5 | 89.6 | 18.1 | 0.0 |
| wobbly | 3 | colors | 131 | 81.2 | 88.4 | 18.0 | 0.0 |
| wobbly | 3 | count | 74 | 86.4 | 99.0 | 25.2 | 0.0 |
| wobbly | 3 | shapes | 133 | 86.4 | 97.3 | 21.4 | 0.0 |
| wobbly | 3 | size | 128 | 85.6 | 96.2 | 20.5 | 0.0 |
| wobbly | 4 | animals | 135 | 77.3 | 84.1 | 16.9 | 0.0 |
| wobbly | 4 | colors | 134 | 81.2 | 89.4 | 17.8 | 0.0 |
| wobbly | 4 | count | 127 | 86.1 | 98.8 | 23.9 | 0.0 |
| wobbly | 4 | shapes | 130 | 83.6 | 91.5 | 19.3 | 0.0 |
| wobbly | 4 | size | 74 | 81.4 | 89.9 | 18.3 | 0.0 |
| wobbly | 5 | animals | 132 | 72.7 | 79.9 | 15.7 | 0.0 |
| wobbly | 5 | colors | 74 | 77.6 | 83.0 | 16.9 | 0.0 |
| wobbly | 5 | count | 126 | 85.7 | 101.0 | 22.9 | 0.0 |
| wobbly | 5 | letters | 136 | 79.4 | 86.0 | 17.4 | 0.0 |
| wobbly | 5 | shapes | 132 | 76.0 | 81.8 | 16.5 | 0.0 |
