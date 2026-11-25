# hs_playtest smoke — 8 sessions (0 failed), config {} (15 s)

| model | age | n | done % | session min (p90) | chapter s mean [p10–p90] | cut % | round s (p90) | trace s (p90) | rounds > 120 s (max s) | no progress > 60 s (max gap s) | stars 3/2/1 % | wrong / needPick per round | offPath / traceTap per round | hints choice / path per round (rounds with a hint %) | magic icing rounds % | pick assist rounds % | idle/round | talk right % | NaN / stuck / off / 2nd-miss-no-hint |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0.3 | 4 | 4 | 100.0 | 4.2 (4.4) | 61.9 [55.7–69.5] | 0.0 | 13.6 (17.5) | 3.4 (4.7) | 0 (21.2) | 0 (6.0) | 32.8/21.9/45.3 | 1.19 / 0.00 | 0.00 / 0.00 | 0.47 / 0.00 (45.3) | 0.0 | 0.0 | 0.00 | 43.8 | 0 / 0 / 0 / 0 |
| typical | 4 | 4 | 100.0 | 5.5 (5.8) | 81.0 [74.7–87.3] | 25.0 | 18.9 (26.0) | 6.4 (10.6) | 0 (38.5) | 0 (16.3) | 75.0/15.0/10.0 | 0.35 / 0.15 | 0.12 / 0.07 | 0.15 / 0.08 (23.3) | 0.0 | 0.0 | 0.03 | 93.8 | 0 / 0 / 0 / 2 |

| model | age | round s p50 / p75 / p90 / p99 | rounds no-progress > 30 s % | talk right / wrong / Tumi-answered % | same round key back to back | same asked values back to back | animals sharing a home in a round |
|---|---|---|---|---|---|---|
| bot0.3 | 4 | 13.0 / 15.2 / 17.5 / 21.2 | 0.0 | 43.8 / 56.3 / 0.0 | 0 | 0 | 0 |
| typical | 4 | 17.4 / 21.7 / 26.0 / 38.5 | 0.0 | 93.8 / 6.3 / 0.0 | 0 | 0 | 0 |

| age | content seen (all models) |
|---|---|
| 4 | animal (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:animals (10): bee bird cow dog duck frog hen pig rabbit sheep<br>choice:colors (6): blue green orange purple red yellow<br>choice:count (6): 1 2 3 4 5 6<br>choice:shapes (5): circle heart square star triangle<br>choice:size (2): big small<br>count (5): 1 2 3 4 5<br>home (7): barn coop hive kennel nest pond sty<br>numeral (6): 1 2 3 4 5 6<br>shape (5): circle heart square star triangle<br>trace:animals (7): barn coop hive kennel nest pond sty<br>trace:colors (5): arc line loop wave zigzag<br>trace:count (5): 1 2 3 4 5<br>trace:shapes (4): circle heart square star<br>trace:size (1): circle |

| model | age | topic | chapters | mean s | p90 s | round s | magic % |
|---|---|---|---|---|---|---|---|
| typical | 4 | animals | 4 | 78.2 | 82.7 | 16.9 | 0.0 |
| typical | 4 | colors | 3 | 83.0 | 86.6 | 18.4 | 0.0 |
| typical | 4 | count | 4 | 83.7 | 90.3 | 24.7 | 0.0 |
| typical | 4 | shapes | 3 | 78.5 | 82.3 | 17.1 | 0.0 |
| typical | 4 | size | 2 | 81.8 | 86.5 | 17.6 | 0.0 |
