## Real-page voice playtest (Chromium, iPhone portrait 393×852, bot skill 0.8, child name "Lan")

### A. speed 8, muted — requested lines (IM.Voice.say calls) per GAME minute

| age | lang | session (game s) | requests | /min | name1 | name2 | match | mismatch | prompt | praise | count lines | child name lines | vi "Túc" ok | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | en | 260 | 121 | 27.9 | 36 | 0 | 36 | 0 | 16 | 16 | 0 | 11 | – | 0 |
| 3 | vi | 261 | 120 | 27.6 | 36 | 0 | 36 | 0 | 16 | 16 | 0 | 6 | 4/4 | 0 |
| 4 | en | 261 | 138 | 31.8 | 40 | 0 | 40 | 0 | 16 | 16 | 7 | 9 | – | 0 |
| 4 | vi | 273 | 140 | 30.7 | 41 | 0 | 40 | 1 | 16 | 16 | 0 | 4 | 4/4 | 0 |
| 5 | en | 298 | 166 | 33.5 | 52 | 0 | 50 | 2 | 16 | 16 | 5 | 8 | – | 0 |
| 5 | vi | 297 | 162 | 32.8 | 50 | 0 | 50 | 0 | 16 | 16 | 0 | 10 | 4/4 | 0 |
| 7 | en | 357 | 180 | 30.2 | 66 | 0 | 64 | 2 | 16 | 16 | 15 | 7 | – | 0 |
| 7 | vi | 345 | 180 | 31.3 | 66 | 0 | 60 | 6 | 16 | 16 | 18 | 6 | 4/4 | 0 |

Sample (age 4 en, first count round):

```
 126.2 level     Chapter 3. Counting Fish
 126.2 level     Pitter-patter, a soft rain!
 128.7 prompt    Match each number with its fish!
 134.4 name1     One fish!
 135.1 match     One fish! Number one! A pair!
 136.2 name1     Two!
 136.9 match     Two fish! Number two! A pair!
 138.0 roundDone Wow, Lan, what a memory!
 139.6 prompt    Count the fish and find the number!
 145.2 name1     One, two, three, four fish!
 146.5 match     Four and four fish! A match!
 147.8 name1     Three!
 149.2 match     Three fish! Number three! A pair!
 150.3 roundDone You are so clever!
 151.9 prompt    Which number goes with the fish? Bob, bob! The blocks float on ice floes!
```

Sample (age 4 vi, start):

```
   2.5 prompt    Màu nào đi cùng màu nào nhỉ?
   8.0 name1     Màu tím!
   9.2 match     Màu tím và màu tím! Một cặp rồi!
  10.3 name1     Cá màu đỏ!
  11.2 match     Màu đỏ và màu đỏ! Một cặp rồi!
  12.3 roundDone Bé tìm cặp giỏi quá!
  13.9 prompt    Bé ơi, tìm hai khối cùng màu nhé!
  19.6 name1     Màu xanh lá!
  20.9 match     Màu xanh lá và màu xanh lá! Một cặp rồi!
  22.2 name1     Cá màu vàng!
  23.5 match     Hai chú cá màu vàng! Một cặp rồi!
  24.6 roundDone Bé tìm cặp giỏi quá!
  26.2 prompt    Bé ơi, tìm hai khối cùng màu nhé! Vèo vèo! Hai khối băng đổi chỗ. Bé nhìn kỹ nhé!
  33.9 name1     Cá màu đỏ!
  35.4 match     Hai chú cá màu đỏ! Một cặp rồi!
  36.7 name1     Màu xanh dương!
```

### B. speed 1, fake TTS (0.3 s + 72 ms/char) — what voice.js actually lets through

| age | lang | game s | requests | started /min | talk share | heard fully: name1 / name2 / match / mismatch / prompt / praise / count | prompts cut | top lost |
|---|---|---|---|---|---|---|---|---|
| 4 | en | 259 | 128 | 28.8 | 84% | 80% / – / 60% / – / 100% / 81% / 100% | 0 | match interrupted 16, name1 interrupted 7, talkQ interrupted 4, roundDone interrupted 3 |
| 4 | vi | 259 | 129 | 26.9 | 88% | 68% / – / 53% / – / 100% / 75% / – | 0 | match interrupted 17, name1 interrupted 12, roundDone interrupted 4, talkQ interrupted 4 |
| 3 | vi | 253 | 120 | 25.1 | 87% | 72% / – / 53% / – / 100% / 81% / – | 0 | match interrupted 15, name1 interrupted 5, name1 dropped 5, talkQ interrupted 4 |
| 7 | en | 356 | 188 | 29.9 | 84% | 73% / – / 38% / 0% / 100% / 100% / 80% | 0 | match interrupted 40, name1 interrupted 17, mismatch interrupted 6, talkQ interrupted 4 |

Sample timeline (B, age 4 en, first count / animals round with fates):

```
   2.5 prompt    end         Find two fish of the same colour!
   7.9 name1     end         Purple!
   9.2 match     interrupted Two purple fish! A pair!
  10.5 name1     end         Yellow!
  11.9 match     end         Two yellow fish! A pair!
  13.0 roundDone end         You found all the pairs!
  14.6 prompt    end         Find two fish of the same colour!
  20.1 name1     end         Yellow!
  21.4 match     end         Two yellow fish! A pair!
  22.5 name1     interrupted Green!
  23.8 match     end         Green and green! A pair!
  25.0 roundDone end         Great job, Lan!
  26.6 prompt    end         Find two fish of the same colour! Oh! Two blocks are sliding on the ice. Watch!
  34.3 name1     end         Green!
  35.9 match     end         Green and green! A pair!
```
