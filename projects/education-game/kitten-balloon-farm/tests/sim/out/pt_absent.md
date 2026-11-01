## pt_absent: absent child, 10 minutes without a touch (iPhone portrait)

config `{}` speech `{}`

| age | where | world events (idle / talkAsk) | main.js speaks | spoken at (s) | Miu talking total | after 10 min |
|---|---|---|---|---|---|---|
| 3 | round | 20 (first at 15 s) | 4 | 15, 33, 60, 90 | 20 s | state round, auto hints 0 |
| 3 | talk | 50 (first at 12 s) | 3 | 12, 24, 36 | 14 s | state talk, answer glows true, auto hints 0 |
| 4 | round | 20 (first at 15 s) | 4 | 15, 33, 60, 90 | 18 s | state round, auto hints 0 |
| 4 | talk | 50 (first at 12 s) | 3 | 12, 24, 36 | 15 s | state talk, answer glows true, auto hints 0 |
| 5 | round | 20 (first at 15 s) | 4 | 15, 33, 60, 90 | 19 s | state round, auto hints 0 |
| 5 | talk | 50 (first at 12 s) | 3 | 12, 24, 36 | 14 s | state talk, answer glows true, auto hints 0 |

The round never ends and nothing pauses: balloons keep bobbing, music keeps playing (main.js has no idle pause); after the last spoken line the game is silent for the rest of the 10 minutes.
