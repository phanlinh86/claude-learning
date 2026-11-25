# hs_playtest ctl — 1350 sessions (0 failed), config {} (123 s)

| model | age | n | done % | session min (p90) | chapter s mean [p10–p90] | cut % | round s (p90) | trace s (p90) | rounds > 120 s (max s) | no progress > 60 s (max gap s) | stars 3/2/1 % | wrong / needPick per round | offPath / traceTap per round | hints choice / path per round (rounds with a hint %) | magic icing rounds % | pick assist rounds % | idle/round | talk right % | NaN / stuck / off / 2nd-miss-no-hint |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 150 | 100.0 | 7.1 (7.8) | 105.4 [84.1–130.3] | 96.2 | 30.8 (44.7) | 12.7 (20.6) | 0 (87.6) | 0 (49.1) | 62.6/23.4/13.9 | 0.57 / 0.23 | 0.33 / 0.17 | 0.27 / 0.40 (49.0) | 0.2 | 0.5 | 0.26 | 58.8 | 0 / 0 / 0 / 19 |
| slow3 | 4 | 150 | 100.0 | 7.3 (7.9) | 107.2 [84.7–135.7] | 97.7 | 31.5 (45.7) | 12.7 (21.6) | 0 (81.7) | 1 (62.0) | 66.4/22.2/11.4 | 0.48 / 0.20 | 0.28 / 0.15 | 0.24 / 0.44 (49.5) | 0.0 | 0.2 | 0.28 | 61.7 | 0 / 0 / 0 / 13 |
| slow3 | 5 | 150 | 100.0 | 7.7 (8.5) | 113.3 [86.2–145.7] | 97.2 | 33.5 (51.3) | 14.0 (24.3) | 0 (111.4) | 0 (45.8) | 67.0/20.8/12.2 | 0.50 / 0.19 | 0.31 / 0.20 | 0.24 / 0.52 (51.2) | 0.0 | 0.7 | 0.29 | 58.8 | 0 / 0 / 0 / 13 |
| typical | 3 | 150 | 100.0 | 5.7 (6.0) | 83.7 [75.7–92.1] | 23.3 | 19.5 (25.8) | 7.1 (10.7) | 0 (54.9) | 0 (32.0) | 73.8/19.5/6.6 | 0.34 / 0.09 | 0.14 / 0.10 | 0.11 / 0.08 (17.6) | 0.0 | 0.0 | 0.03 | 76.7 | 0 / 0 / 0 / 8 |
| typical | 4 | 150 | 100.0 | 5.6 (5.9) | 81.8 [73.8–91.5] | 20.2 | 18.9 (25.6) | 6.4 (10.1) | 0 (46.7) | 0 (28.1) | 83.5/13.4/3.2 | 0.20 / 0.09 | 0.16 / 0.05 | 0.06 / 0.08 (13.6) | 0.0 | 0.0 | 0.03 | 87.8 | 0 / 0 / 0 / 5 |
| typical | 5 | 150 | 100.0 | 5.3 (5.6) | 77.2 [68.4–90.0] | 11.8 | 17.3 (23.5) | 5.5 (7.9) | 0 (44.2) | 0 (22.7) | 88.9/9.2/1.9 | 0.13 / 0.04 | 0.09 / 0.05 | 0.03 / 0.04 (7.0) | 0.0 | 0.0 | 0.01 | 91.3 | 0 / 0 / 0 / 2 |
| wobbly | 3 | 150 | 100.0 | 5.7 (6.1) | 84.1 [75.4–94.4] | 31.0 | 20.1 (26.8) | 7.7 (12.5) | 0 (45.4) | 0 (27.5) | 75.2/18.7/6.1 | 0.31 / 0.10 | 0.24 / 0.11 | 0.10 / 0.11 (19.7) | 0.0 | 0.0 | 0.03 | 77.5 | 0 / 0 / 0 / 4 |
| wobbly | 4 | 150 | 100.0 | 5.6 (5.9) | 81.9 [73.7–91.7] | 23.5 | 19.1 (25.8) | 6.7 (10.9) | 0 (60.5) | 0 (27.9) | 83.8/13.3/2.8 | 0.19 / 0.09 | 0.21 / 0.05 | 0.05 / 0.09 (13.2) | 0.0 | 0.0 | 0.03 | 90.0 | 0 / 0 / 0 / 5 |
| wobbly | 5 | 150 | 100.0 | 5.3 (5.6) | 78.3 [70.1–87.2] | 15.7 | 17.7 (23.9) | 6.0 (9.0) | 0 (41.3) | 0 (19.9) | 87.6/10.9/1.5 | 0.14 / 0.05 | 0.09 / 0.07 | 0.02 / 0.05 (7.5) | 0.0 | 0.0 | 0.01 | 88.5 | 0 / 0 / 0 / 2 |

| model | age | round s p50 / p75 / p90 / p99 | rounds no-progress > 30 s % | talk right / wrong / Tumi-answered % | same round key back to back | same asked values back to back | animals sharing a home in a round |
|---|---|---|---|---|---|---|
| slow3 | 3 | 28.7 / 35.8 / 44.7 / 61.9 | 2.6 | 58.8 / 41.2 / 0.0 | 0 | 0 | 0 |
| slow3 | 4 | 29.2 / 36.9 / 45.7 / 62.5 | 1.8 | 61.7 / 38.3 / 0.0 | 0 | 0 | 0 |
| slow3 | 5 | 30.4 / 39.6 / 51.3 / 72.9 | 2.5 | 58.8 / 41.2 / 0.0 | 0 | 0 | 0 |
| typical | 3 | 18.1 / 21.2 / 25.8 / 36.2 | 0.1 | 76.7 / 23.3 / 0.0 | 0 | 0 | 0 |
| typical | 4 | 17.1 / 21.7 / 25.6 / 34.8 | 0.0 | 87.8 / 12.2 / 0.0 | 0 | 0 | 0 |
| typical | 5 | 15.5 / 18.9 / 23.5 / 32.3 | 0.0 | 91.3 / 8.7 / 0.0 | 0 | 0 | 0 |
| wobbly | 3 | 18.8 / 22.6 / 26.8 / 36.0 | 0.0 | 77.5 / 22.5 / 0.0 | 0 | 0 | 0 |
| wobbly | 4 | 17.4 / 21.9 / 25.8 / 35.7 | 0.0 | 90.0 / 10.0 / 0.0 | 0 | 0 | 0 |
| wobbly | 5 | 16.1 / 19.7 / 23.9 / 31.8 | 0.0 | 88.5 / 11.5 / 0.0 | 0 | 0 | 0 |

| age | content seen (all models) |
|---|---|
| 3 | animal (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:animals (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:colors (6): blue green orange purple red yellow<br>choice:count (6): 1 2 3 4 5 6<br>choice:shapes (5): circle heart square star triangle<br>choice:size (2): big small<br>count (5): 1 2 3 4 5<br>home (8): barn burrow coop hive kennel nest pond sty<br>numeral (6): 1 2 3 4 5 6<br>shape (5): circle heart square star triangle<br>trace:animals (8): barn burrow coop hive kennel nest pond sty<br>trace:colors (4): arc line wave zigzag<br>trace:count (5): 1 2 3 4 5<br>trace:shapes (5): circle heart square star triangle<br>trace:size (1): circle |
| 4 | animal (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:animals (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:colors (6): blue green orange purple red yellow<br>choice:count (6): 1 2 3 4 5 6<br>choice:shapes (5): circle heart square star triangle<br>choice:size (2): big small<br>count (5): 1 2 3 4 5<br>home (8): barn burrow coop hive kennel nest pond sty<br>numeral (6): 1 2 3 4 5 6<br>shape (5): circle heart square star triangle<br>trace:animals (8): barn burrow coop hive kennel nest pond sty<br>trace:colors (5): arc line loop wave zigzag<br>trace:count (5): 1 2 3 4 5<br>trace:shapes (5): circle heart square star triangle<br>trace:size (1): circle |
| 5 | animal (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:animals (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:colors (7): blue green orange pink purple red yellow<br>choice:count (6): 1 2 3 4 5 6<br>choice:letters (26): A B C D E F G H I J K L M N O P Q R S T U V W X Y Z<br>choice:shapes (8): circle diamond heart oval rect square star triangle<br>count (10): 1 2 3 4 5 6 7 8 9 10<br>home (8): barn burrow coop hive kennel nest pond sty<br>numeral (10): 1 2 3 4 5 6 7 8 9 10<br>shape (8): circle diamond heart oval rect square star triangle<br>trace:animals (8): barn burrow coop hive kennel nest pond sty<br>trace:colors (6): arc line loop swirl wave zigzag<br>trace:count (10): 1 2 3 4 5 6 7 8 9 10<br>trace:letters (26): A B C D E F G H I J K L M N O P Q R S T U V W X Y Z<br>trace:shapes (8): circle diamond heart oval rect square star triangle |

| model | age | topic | chapters | mean s | p90 s | round s | magic % |
|---|---|---|---|---|---|---|---|
| slow3 | 3 | animals | 134 | 96.5 | 113.8 | 27.4 | 0.0 |
| slow3 | 3 | colors | 131 | 96.3 | 112.0 | 27.4 | 0.0 |
| slow3 | 3 | count | 74 | 127.8 | 152.0 | 38.7 | 0.5 |
| slow3 | 3 | shapes | 133 | 107.9 | 128.9 | 32.0 | 0.3 |
| slow3 | 3 | size | 128 | 108.4 | 130.0 | 32.1 | 0.3 |
| slow3 | 4 | animals | 135 | 97.3 | 116.5 | 27.9 | 0.0 |
| slow3 | 4 | colors | 134 | 96.5 | 113.4 | 27.8 | 0.0 |
| slow3 | 4 | count | 127 | 131.0 | 153.7 | 39.7 | 0.0 |
| slow3 | 4 | shapes | 130 | 107.1 | 126.5 | 31.7 | 0.0 |
| slow3 | 4 | size | 74 | 103.6 | 120.5 | 30.7 | 0.0 |
| slow3 | 5 | animals | 132 | 95.2 | 110.1 | 27.0 | 0.0 |
| slow3 | 5 | colors | 74 | 98.6 | 115.2 | 28.4 | 0.0 |
| slow3 | 5 | count | 126 | 141.1 | 165.4 | 43.2 | 0.0 |
| slow3 | 5 | letters | 136 | 118.1 | 141.9 | 35.4 | 0.0 |
| slow3 | 5 | shapes | 132 | 108.3 | 127.8 | 32.1 | 0.0 |
| typical | 3 | animals | 134 | 81.2 | 88.5 | 17.9 | 0.0 |
| typical | 3 | colors | 131 | 81.8 | 90.2 | 18.1 | 0.0 |
| typical | 3 | count | 74 | 87.1 | 98.5 | 25.3 | 0.0 |
| typical | 3 | shapes | 133 | 86.1 | 94.1 | 20.1 | 0.0 |
| typical | 3 | size | 128 | 83.6 | 89.7 | 19.4 | 0.0 |
| typical | 4 | animals | 135 | 77.6 | 85.4 | 17.1 | 0.0 |
| typical | 4 | colors | 134 | 80.6 | 87.4 | 17.6 | 0.0 |
| typical | 4 | count | 127 | 87.3 | 99.0 | 23.8 | 0.0 |
| typical | 4 | shapes | 130 | 82.3 | 90.3 | 18.4 | 0.0 |
| typical | 4 | size | 74 | 81.5 | 88.7 | 18.1 | 0.0 |
| typical | 5 | animals | 132 | 71.1 | 78.0 | 15.3 | 0.0 |
| typical | 5 | colors | 74 | 76.3 | 79.9 | 16.6 | 0.0 |
| typical | 5 | count | 126 | 87.7 | 99.9 | 22.4 | 0.0 |
| typical | 5 | letters | 136 | 76.9 | 85.5 | 16.7 | 0.0 |
| typical | 5 | shapes | 132 | 74.1 | 80.5 | 16.0 | 0.0 |
| wobbly | 3 | animals | 134 | 81.5 | 89.6 | 18.1 | 0.0 |
| wobbly | 3 | colors | 131 | 81.2 | 88.4 | 18.0 | 0.0 |
| wobbly | 3 | count | 74 | 87.4 | 100.9 | 25.5 | 0.0 |
| wobbly | 3 | shapes | 133 | 86.4 | 97.3 | 21.4 | 0.0 |
| wobbly | 3 | size | 128 | 85.6 | 96.2 | 20.5 | 0.0 |
| wobbly | 4 | animals | 135 | 77.2 | 84.0 | 16.9 | 0.0 |
| wobbly | 4 | colors | 134 | 81.2 | 89.4 | 17.8 | 0.0 |
| wobbly | 4 | count | 127 | 86.3 | 98.5 | 23.9 | 0.0 |
| wobbly | 4 | shapes | 130 | 83.6 | 91.5 | 19.3 | 0.0 |
| wobbly | 4 | size | 74 | 81.4 | 89.9 | 18.3 | 0.0 |
| wobbly | 5 | animals | 132 | 72.7 | 79.9 | 15.7 | 0.0 |
| wobbly | 5 | colors | 74 | 77.6 | 83.0 | 16.9 | 0.0 |
| wobbly | 5 | count | 126 | 85.8 | 101.0 | 23.0 | 0.0 |
| wobbly | 5 | letters | 136 | 79.3 | 85.8 | 17.4 | 0.0 |
| wobbly | 5 | shapes | 132 | 76.0 | 81.8 | 16.5 | 0.0 |
