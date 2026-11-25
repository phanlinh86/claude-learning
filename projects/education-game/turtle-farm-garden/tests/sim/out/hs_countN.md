# hs_playtest countN — 900 sessions (0 failed), config {} (95 s)

| model | age | n | done % | session min (p90) | chapter s mean [p10–p90] | cut % | round s (p90) | trace s (p90) | rounds > 120 s (max s) | no progress > 60 s (max gap s) | stars 3/2/1 % | wrong / needPick per round | offPath / traceTap per round | hints choice / path per round (rounds with a hint %) | magic icing rounds % | pick assist rounds % | idle/round | talk right % | NaN / stuck / off / 2nd-miss-no-hint |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| slow3 | 5 | 150 | 100.0 | 7.6 (8.5) | 112.4 [87.2–143.6] | 97.0 | 33.2 (49.3) | 13.9 (23.9) | 0 (83.8) | 0 (45.8) | 66.5/20.9/12.6 | 0.52 / 0.19 | 0.32 / 0.20 | 0.25 / 0.51 (51.9) | 0.0 | 0.8 | 0.28 | 59.7 | 0 / 0 / 0 / 12 |
| slow3 | 6 | 150 | 100.0 | 7.9 (8.6) | 116.1 [91.7–145.3] | 100.0 | 34.8 (50.5) | 15.5 (25.2) | 0 (98.9) | 0 (47.9) | 66.7/22.6/10.7 | 0.48 / 0.21 | 0.35 / 0.24 | 0.25 / 0.55 (53.2) | 0.0 | 0.9 | 0.30 | 61.3 | 0 / 0 / 0 / 9 |
| slow3 | 7 | 150 | 100.0 | 7.8 (8.6) | 114.9 [91.6–143.5] | 100.0 | 34.4 (48.9) | 15.9 (26.5) | 0 (106.6) | 0 (49.0) | 63.2/22.5/14.3 | 0.55 / 0.23 | 0.37 / 0.24 | 0.27 / 0.59 (56.9) | 0.0 | 0.5 | 0.31 | 57.8 | 0 / 0 / 0 / 18 |
| typical | 5 | 150 | 100.0 | 5.3 (5.5) | 77.1 [68.5–91.9] | 10.2 | 17.2 (23.0) | 5.4 (7.6) | 0 (40.0) | 0 (20.3) | 88.6/9.6/1.8 | 0.13 / 0.04 | 0.09 / 0.05 | 0.03 / 0.04 (6.3) | 0.0 | 0.0 | 0.01 | 91.3 | 0 / 0 / 0 / 2 |
| typical | 6 | 150 | 100.0 | 5.2 (5.4) | 75.5 [66.4–92.3] | 7.2 | 16.6 (22.5) | 5.6 (7.7) | 0 (45.8) | 0 (17.2) | 91.4/7.9/0.7 | 0.09 / 0.04 | 0.11 / 0.06 | 0.01 / 0.05 (5.9) | 0.0 | 0.0 | 0.01 | 95.7 | 0 / 0 / 0 / 0 |
| typical | 7 | 150 | 100.0 | 4.9 (5.3) | 71.9 [63.9–85.8] | 2.5 | 15.5 (20.6) | 5.2 (7.0) | 0 (40.6) | 0 (19.9) | 91.7/7.5/0.8 | 0.09 / 0.04 | 0.11 / 0.07 | 0.02 / 0.05 (6.0) | 0.0 | 0.0 | 0.01 | 95.3 | 0 / 0 / 0 / 2 |

| model | age | round s p50 / p75 / p90 / p99 | rounds no-progress > 30 s % | talk right / wrong / Tumi-answered % | same round key back to back | same asked values back to back | animals sharing a home in a round |
|---|---|---|---|---|---|---|
| slow3 | 5 | 30.5 / 39.4 / 49.3 / 68.4 | 2.4 | 59.7 / 40.3 / 0.0 | 0 | 0 | 0 |
| slow3 | 6 | 32.2 / 40.5 / 50.5 / 74.5 | 2.9 | 61.3 / 38.7 / 0.0 | 0 | 0 | 0 |
| slow3 | 7 | 32.4 / 40.0 / 48.9 / 70.4 | 2.3 | 57.8 / 42.2 / 0.0 | 0 | 0 | 0 |
| typical | 5 | 15.5 / 18.8 / 23.0 / 31.3 | 0.0 | 91.3 / 8.7 / 0.0 | 0 | 0 | 0 |
| typical | 6 | 15.0 / 18.0 / 22.5 / 31.9 | 0.0 | 95.7 / 4.3 / 0.0 | 0 | 0 | 0 |
| typical | 7 | 14.3 / 15.8 / 20.6 / 29.1 | 0.0 | 95.3 / 4.7 / 0.0 | 0 | 0 | 0 |

| age | content seen (all models) |
|---|---|
| 5 | animal (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:animals (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:colors (7): blue green orange pink purple red yellow<br>choice:count (6): 1 2 3 4 5 6<br>choice:letters (26): A B C D E F G H I J K L M N O P Q R S T U V W X Y Z<br>choice:shapes (8): circle diamond heart oval rect square star triangle<br>count (8): 1 2 3 4 5 6 7 8<br>home (8): barn burrow coop hive kennel nest pond sty<br>numeral (8): 1 2 3 4 5 6 7 8<br>shape (8): circle diamond heart oval rect square star triangle<br>trace:animals (8): barn burrow coop hive kennel nest pond sty<br>trace:colors (6): arc line loop swirl wave zigzag<br>trace:count (8): 1 2 3 4 5 6 7 8<br>trace:letters (26): A B C D E F G H I J K L M N O P Q R S T U V W X Y Z<br>trace:shapes (8): circle diamond heart oval rect square star triangle |
| 6 | choice:add (10): 1 2 3 4 5 6 7 8 9 10<br>choice:count (6): 1 2 3 4 5 6<br>choice:initial (26): A B C D E F G H I J K L M N O P Q R S T U V W X Y Z<br>choice:letters (26): A B C D E F G H I J K L M N O P Q R S T U V W X Y Z<br>choice:lower (24): a b c d e f g h j k m n o p q r s t u v w x y z<br>count (10): 1 2 3 4 5 6 7 8 9 10<br>numeral (10): 1 2 3 4 5 6 7 8 9 10<br>trace:add (9): 2 3 4 5 6 7 8 9 10<br>trace:count (10): 1 2 3 4 5 6 7 8 9 10<br>trace:initial (11): B C D F G H O P R S V<br>trace:letters (26): A B C D E F G H I J K L M N O P Q R S T U V W X Y Z<br>trace:lower (24): a b c d e f g h j k m n o p q r s t u v w x y z |
| 7 | choice:add (20): 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20<br>choice:count (6): 1 2 3 4 5 6<br>choice:initial (26): A B C D E F G H I J K L M N O P Q R S T U V W X Y Z<br>choice:oddeven (20): 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20<br>choice:sub (11): 0 1 2 3 4 5 6 7 8 9 10<br>count (10): 1 2 3 4 5 6 7 8 9 10<br>numeral (21): 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20<br>trace:add (19): 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20<br>trace:count (10): 1 2 3 4 5 6 7 8 9 10<br>trace:initial (11): B C D F G H O P R S V<br>trace:oddeven (20): 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20<br>trace:sub (10): 0 1 2 3 4 5 6 7 8 9 |

| model | age | topic | chapters | mean s | p90 s | round s | magic % |
|---|---|---|---|---|---|---|---|
| slow3 | 5 | animals | 132 | 96.7 | 115.2 | 27.3 | 0.0 |
| slow3 | 5 | colors | 74 | 98.6 | 115.2 | 28.4 | 0.0 |
| slow3 | 5 | count | 126 | 136.8 | 163.2 | 41.7 | 0.0 |
| slow3 | 5 | letters | 136 | 116.7 | 140.9 | 34.9 | 0.0 |
| slow3 | 5 | shapes | 132 | 108.3 | 127.8 | 32.1 | 0.0 |
| slow3 | 6 | add | 128 | 106.4 | 134.3 | 31.6 | 0.0 |
| slow3 | 6 | count | 131 | 139.8 | 168.1 | 42.7 | 0.0 |
| slow3 | 6 | initial | 138 | 112.5 | 137.9 | 33.6 | 0.0 |
| slow3 | 6 | letters | 74 | 113.9 | 135.4 | 34.0 | 0.0 |
| slow3 | 6 | lower | 129 | 106.7 | 126.9 | 31.7 | 0.0 |
| slow3 | 7 | add | 138 | 111.6 | 133.7 | 33.3 | 0.0 |
| slow3 | 7 | count | 74 | 144.3 | 167.3 | 44.2 | 0.0 |
| slow3 | 7 | initial | 125 | 113.9 | 132.5 | 34.0 | 0.0 |
| slow3 | 7 | oddeven | 136 | 113.9 | 136.4 | 34.1 | 0.0 |
| slow3 | 7 | sub | 127 | 103.5 | 123.4 | 30.6 | 0.0 |
| typical | 5 | animals | 132 | 70.7 | 76.6 | 15.1 | 0.0 |
| typical | 5 | colors | 74 | 76.3 | 79.9 | 16.6 | 0.0 |
| typical | 5 | count | 126 | 88.5 | 98.6 | 22.0 | 0.0 |
| typical | 5 | letters | 136 | 76.2 | 83.7 | 16.6 | 0.0 |
| typical | 5 | shapes | 132 | 74.1 | 80.5 | 16.0 | 0.0 |
| typical | 6 | add | 128 | 70.5 | 77.2 | 15.0 | 0.0 |
| typical | 6 | count | 131 | 89.8 | 99.6 | 21.7 | 0.0 |
| typical | 6 | initial | 138 | 71.7 | 79.2 | 15.4 | 0.0 |
| typical | 6 | letters | 74 | 73.1 | 84.0 | 15.7 | 0.0 |
| typical | 6 | lower | 129 | 71.5 | 79.3 | 15.3 | 0.0 |
| typical | 7 | add | 138 | 69.9 | 77.6 | 14.9 | 0.0 |
| typical | 7 | count | 74 | 88.7 | 97.6 | 20.6 | 0.0 |
| typical | 7 | initial | 125 | 70.6 | 79.2 | 15.1 | 0.0 |
| typical | 7 | oddeven | 136 | 70.4 | 78.4 | 15.0 | 0.0 |
| typical | 7 | sub | 127 | 67.0 | 74.5 | 14.2 | 0.0 |
