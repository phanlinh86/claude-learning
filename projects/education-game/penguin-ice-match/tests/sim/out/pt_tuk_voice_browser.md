## Real-page voice playtest (Chromium, iPhone portrait 393×852, bot skill 0.8, child name "Lan")


### B. speed 1, fake TTS (0.3 s + 72 ms/char) — what voice.js actually lets through

| age | lang | game s | requests | started /min | talk share | heard fully: name1 / name2 / match / mismatch / prompt / praise / count | prompts cut | top lost |
|---|---|---|---|---|---|---|---|---|
| 4 | en | 262 | 196 | 43.0 | 91% | 19% / 0% / 38% / 0% / 100% / 75% / 0% | 0 | name2 interrupted 42, name1 interrupted 34, match interrupted 25, peek interrupted 8 |
| 4 | vi | 254 | 191 | 43.5 | 92% | 12% / 0% / 40% / 0% / 100% / 81% / 0% | 0 | name2 interrupted 41, name1 interrupted 36, match interrupted 24, peek interrupted 8 |
| 3 | vi | 245 | 176 | 41.1 | 91% | 3% / 0% / 44% / – / 100% / 69% / – | 0 | name2 interrupted 36, name1 interrupted 35, match interrupted 20, peek interrupted 7 |
| 7 | en | 339 | 268 | 46.4 | 91% | 33% / 0% / 25% / 0% / 100% / 88% / 9% | 0 | name2 interrupted 66, match interrupted 48, name1 interrupted 44, peek interrupted 6 |

Sample timeline (B, age 4 en, first count / animals round with fates):

```
   2.5 prompt    end         Which colours go together?
   3.5 peek      end         Peek! Look closely!
   7.7 name1     interrupted Red!
   7.8 name2     interrupted Red!
   8.2 match     interrupted Two red fish! A pair!
   9.4 name1     end         Yellow!
  10.3 name2     interrupted A yellow fish!
  10.7 match     end         Yellow and yellow! A pair!
  11.8 roundDone end         You did it, Lan!
  13.4 prompt    end         Find the colour pairs!
  14.4 peek      end         Watch carefully, Lan!
  19.0 name1     end         Purple!
  19.9 name2     interrupted A purple fish!
  20.3 match     interrupted Purple and purple! A pair!
  21.4 name1     interrupted A green fish!
  22.3 name2     interrupted Green!
```
