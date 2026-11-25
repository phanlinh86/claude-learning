# Mochi's Icing Bakery — Voice, language and input

Files: `game/js/i18n.js` (`FT.I18N`), `game/js/voice.js` (`FT.Voice`), `game/js/input.js` (`FT.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 18 700 checks with the bakery content.js, self-contained): every key in both languages with identical key
sets **and identical `{params}`**, only known params, every `ui.*` key `index.html` / `ui.js` / `main.js` use, 3 wordings per
instruction / feedback line, every prompt × colour × stroke / shape / size / n 1–20 / animal / home / letter / a+b, every name
kind × value (DESIGN §6), Vietnamese diacritics present, no "màu màu" / "the the" / "a orange", no unfilled `{x}`, a
negative-word ban, no sea / Nini words left, `words()` (digits + no-diacritic forms) matched back by the matcher, exact
`sayPick / sayTraceDone / sayWrong / sayNeedPick / sayChipsDone / sayHome` lines plus a sweep of every thing × topic, garbage
events, speech text, the tap + trace input layer (coalesced samples, 600-sample trace, rotation mid-trace), parent hold gate,
voice queue / interrupt / unlock with a fake `speechSynthesis`, recognizer. **When the bakery `content.js` exists**
(it defines `FT.HOME_OF`) the test also renders every `promptKey` / pick / traceDone / Talk line + params that `makeRound` /
`makeTalk` produce for ages 3–7 and topic.

## 0. Wording principles (Mochi)
- **Mochi** is a cheerful little panda baker. EN "Mochi"; VI lines "Mochi", titles "Gấu Trúc Mochi". Title "Mochi’s Icing
  Bakery" / "Tiệm Bánh Quy Của Gấu Trúc Mochi"; logo "Mochi’s" / "Icing Bakery", "Gấu Trúc Mochi" / "Tiệm Bánh Quy".
  **TTS**: English voices say "Mochi" as written; Vietnamese voices get **"Mô Chi"** (`I18N.speech`; a VI voice reads the
  Latin "Mochi" with an English "ch") — the display text keeps "Mochi". VI speech also turns "sô-cô-la" into "sô cô la".
- **Bakery vocabulary**: icing / icing bag / pipe / follow the dots / cookie / chocolate chips / sprinkles / cooling rack —
  VI **kem / túi kem / vẽ (bắt kem) / vẽ theo chấm, miết theo / bánh quy / hạt sô-cô-la / cốm / giá bánh**.
- **Classifiers**: animals "con chó", shapes "hình tròn", letters "chữ B", numbers "số năm", homes "cái ao / cái hang / cái
  giỏ / cái chuồng / chuồng chó / tổ ong / tổ chim / bể cá", sizes "cái bánh to", chips "3 hạt sô-cô-la".
- **Say what to tap first**: every `p.colors` wording names the bag ("Tap the red icing! Let’s pipe a wave!" / "Bé ơi,
  chạm vào túi kem màu đỏ nhé, mình vẽ đường lượn sóng!"), tested (playtest P3-13: a 4-year-old otherwise draws on the cookie).
- **Colours**: `name('vi','color','red')` = **"màu đỏ"**; VI lines put `{color}` right after the noun ("túi kem {color}" →
  "túi kem màu đỏ") and **never write "màu {color}"** (tested). Bare form `{hue}` / `{bare:true}` = "đỏ".
- **Never negative**: a wrong tap names what was tapped, then the goal ("That’s yellow icing. Let’s find blue!", "Meow!
  That’s the cat. Where is the dog?"). Maths never gives the answer away. Off-path, trace taps, needPick, already are not
  mistakes. Banned words (tested): no / not / wrong / bad / fail / mistake / oops / fall / sorry / burnt … and sai / dở / tệ /
  hỏng / không đúng / chưa đúng / trật / đổ / ngã / không phải / nhầm / cháy.
- **Vietnamese for a 4-year-old**: every prompt has a "Bé ơi, … nhé!" wording; "nào!", "nè", "nhỉ?", "giỏi quá!".
- **Animal sounds** everywhere they help: prompt "Find the dog cookie! Woof woof!", pick "The dog! Woof woof!", wrong
  "Meow! That’s the cat…", home "Woof woof! The dog is home!" (`sound.<animal>`: Woof woof / Gâu gâu, Meow / Meo meo, Buzz
  buzz / Vo ve, Tweet tweet / Chíp chíp, Ribbit / Ộp ộp, Moo / Ụm bò, Hop hop / Nhảy tưng tưng, Blub blub / Lúp búp, Quack
  quack / Cạp cạp, Oink oink / Ụt ịt).

## 1. World event → line (main.js follows this table)
Speaking modes (as in sea paint): **prompt** = `speakPrompt(txt, {priority:true})` (protected until spoken; shown in the
bubble); **feedback** = `speak(txt, {interrupt: canInterrupt()})` (may cut a queued line, never a protected prompt);
**queue** = `speak(txt)` (waits; the voice queue keeps ≤ 2 waiting lines, oldest non-priority dropped, stale after 5 s);
**bubble** = `FT.UI.say(txt)` only. `ev2(e)` = the event + `{topic: world.topic, params: step.params}`; `step` =
`world.stepInfo` (the current step, with `path`, `color`, `mode`, `choices`).

| world event | line (helper / key) | mode | rate limit / rule |
|---|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n}) + '. ' + t('topic.'+topic)`, then `t('weather.'+w)` | interrupt, then queue | — |
| `round {surprise}` | `t('enter')` | bubble | — |
| `ask {promptKey, params, follow?, first?}` | `t(promptKey, params)` (after a right pick: `p.trace {what?}`) | **prompt** | remember the text for `pokeMochi` / idle repeats |
| ↳ first trace `ask` of a chapter, ages ≤ 4 | `t('trace.start')` | queue (after the prompt) | once per chapter; **skipped when the prompt already says it**: `!/shining|sparkly|chấm sáng|lấp lánh/i.test(promptText)` (playtest P2-11) |
| `pick {id, kind, color?}` | `sayPick(lang, {...ev2(e), choice})` — `choice` = `world.choices.find(c => c.id === e.id)` (has `nameKind/nameValue` or `ck`) | feedback | — |
| `wrong {kind:'bag'\|'cookie', got, want, streak}` | `sayWrong(lang, ev2(e))` | feedback | ≤ 1 per 1.5 s |
| `needPick {}` | `sayNeedPick(lang, {mode: step.mode, color: step.color})` | feedback | ≤ 1 per 2.5 s |
| `traceStart` | — (squeeze sound only) | — | — |
| `traceProgress {total}` | `t('trace.progress')` **only at total = 0.5, only for ages ≤ 4, and only when `world.path.len ≥ 450`** (short strokes / roads cut it 56 %: playtest P2-10) | queue, never interrupts | ≤ 1 per trace step |
| `strokeDone {i, n}` | `t('trace.stroke')` **only after the first stroke of a multi-stroke glyph** (`i === 0 && n > 1`); later strokes: the chime only (cut 88 %: playtest P3-15) | feedback | once per trace step |
| `traceDone` | `sayTraceDone(lang, Object.assign({topic}, step))` | interrupt (`interrupt: true`) | lift the prompt guard first |
| `offPath {n}` | `t('offPath')` | feedback | **≤ 1 per 4 s** |
| `traceTap` | `t('traceTap')` | feedback | ≤ 1 per 4 s (shares the offPath timer) |
| `tracePause` | — (the glowing start shows where to go on); optional `t('trace.pause')` if no `traceStart` follows within 3 s | queue | ≤ 1 per 6 s |
| `hint {target:'path'}` | `t('hint.path')` | queue | world cooldown 6 s |
| `hint {target:'choice', id}` | `t('hint')` (not when `e.idle`) | queue | world cooldown 6 s |
| `assist` | `t('assist')` | feedback | once per step |
| `chip {i, n}` | `sayCount(lang, i)` — **always**, every chip | queue, never interrupts; set `promptUntil = now + 700` | none: a fast child hears the newest numbers (queue ≤ 2) |
| `chipsDone {n}` | `sayChipsDone(lang, {n})` | queue (after the last count) | — |
| `already` | `t('already')` | queue if `canInterrupt()` | ≤ 1 per 2.5 s |
| `finish` | `t('finish')` ("Sprinkles!") | **bubble only, not spoken** (it was the 3rd praise line in a row: playtest P2-9) | once per round |
| `hop` | `t('hop')` | bubble only (the praise follows) | — |
| `home {animal}` | `sayHome(lang, {animal})` ("Woof woof! The dog is home!") | queue | once per round |
| `roundDone {stars}` | `t(stars >= 3 ? 'great' : 'praise')` | queue | skipped when praise started < 1.2 s ago |
| `birdIn` / round with `surprise:'bird'` | `t('surprise.bird')` | queue if `canInterrupt()` | once |
| `birdTap` | `t('bird.tap')` | feedback | first 2 taps only |
| `mouse` (the mouse peeks out of the sack) | `t('surprise.mouse')` — at the peek event, **not** right after the prompt (it was cut by the pick feedback: playtest P2-12) | speak if `canInterrupt()` | once per round (`mouseSaid`) |
| `mouseTap {taps}` | `t('mouse.tap')` | feedback | taps ≤ 2 |
| `pokeMochi` | repeat the prompt (> 3 s after asked, not still waiting to be spoken, or stuck > 6 s); otherwise optionally `t('pokeMochi')` | prompt | as sea paint |
| `idle {n}` | `t('idle') + ' ' + currentPrompt()` (n ≤ 4; n ≥ 5 → pause) | queue | world backoff 12 s × 1.5 ≤ 30 s |
| `talk` / `talkAsk` / `talkResult` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; `t('talk.right')` / `talkWrong(lang, choice)` | prompt / interrupt | as sea paint |
| `sessionDone {stars}` | `t('party')`, `t('session.done', {stars})` | interrupt, then queue | — |

Notes for main.js:
- **Interrupting lines**: pick, wrong, needPick, strokeDone, traceDone, offPath, traceTap, assist, birdTap, mouseTap (all via
  `feedback()` so a protected prompt is never cut; traceDone uses `interrupt: true` after lifting the guard, as `paint` did).
  **Queued**: trace.start, trace.progress, hint, chip counts, chipsDone, already, home, praise, surprises, idle.
  **Bubble only**: enter, finish ("Sprinkles!"), hop.
- Counting is never rate-limited and never interrupts: with the 2-line queue a child tapping 5 chips fast hears the last two
  numbers at worst, always in order; `chipsDone` comes after.
- `traceProgress` fires at 25 / 50 / 75 %; only the **50 % event for ages ≤ 4** gets a line. Older children trace in silence
  until `traceDone`.
- A trace step's `ask` comes with `promptKey:'p.trace'` and `params.what`. **i18n accepts all three forms**, so main may pass
  content's params unchanged:
  1. content's form: a kind word + the value: `{what:'stroke'|'shape'|'number'|'letter'|'road'|'home'|'animal'|'size'|'glyph',
     value?, stroke?|shape?|n?|letter?|home?|animal?}` → the value comes from `value`, else from the param named like the kind
     (`stroke`, `shape`, `n`, `letter`/`text`, `home`; `road` → the home of `animal`): "Now pipe the wave!", "Now pipe number
     seven!", "Now pipe the road to the kennel!";
  2. `{what:{nameKind, nameValue}}` (what main.js `promptParams` builds today) or `{what:{kind, text|shape|…}}`;
  3. a ready phrase string (`{what:'the road'}`) when it is not one of the kind words.
  A kind word without any value → the generic `p.trace.any` ("Now follow the dots!"), never "Now pipe stroke!".
- **aria-labels** (functional BUG-2): `ui.pause` ("Pause" / "Tạm dừng"), `ui.parentsHold` ("Parents: hold to open
  settings" / "Bố mẹ: nhấn giữ để mở cài đặt"), plus the existing `ui.quieter`, `ui.louder`, `ui.volume`, `ui.language`,
  `ui.play`, `ui.mic` ("Answer by voice" / "Nói để trả lời") for the mic button.
- Bubble rename: `ui.tapNini` → **`ui.tapMochi`**; key `pokeNini` → event `pokeMochi`. Sea keys (`surprise.fishy`,
  `fishy.tap`, `surprise.pearl`, `pearl.tap`, `alive.*`, `say.paint.*`, `needPaint`, `notThis`, `stepDone`, `p.tapPart`) are
  gone; `t()` returns the key itself for them.

## 2. API (`FT.I18N`)
All helpers never throw and never return '' or a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (a random variant). Raw params are named: `{color:'red'}`, `{stroke:'wave'}`, `{animal:'dog'}`, `{home:'nest'}`; objects `{kind,value}` / `{nameKind,nameValue}` are named; `got / want / label / what` objects are phrased |
| `name(lang, kind, value, opts?)` | kinds `color, hue, shape, stroke, size, animal ({size}), word, home, number, dots, letter, text, sum, diff, parity` |
| `words(lang, kind, value)` / `choiceWords(lang, choice)` | accepted spoken forms for Talk-time / mic answers (lower-case, + no-diacritic forms, digits and "số năm" for numbers); `choice` may be `{id, thing:{kind…}}`, `{kind:'cookie', ck}`, `{nameKind, nameValue}` |
| `phrase(lang, thing)` / `phrase(lang, kind, value)` | "the circle", "the dog", "the beehive", "the rainbow arch", "the big cookie", "letter D", "small b", "number five", "2 + 3", "yellow" · vi "hình tròn", "con chó", "tổ ong", "cầu vồng", "cái bánh to", "chữ D", "chữ b thường", "số năm", "màu vàng" |
| `sayPick(lang, ev)` | bag "Red icing!" / "Kem màu đỏ!"; shape "The triangle!"; animal "The dog! Woof woof!"; size "The big cookie!"; letter "Letter B!" / "Small b!"; count numeral "Number three!"; topic `initial` "D is for dog!" / "Chữ D, …"; `oddeven` "Seven is odd!"; `add`/`sub` with `ev.params {a,b}` "2 + 3 is five!" |
| `sayTraceDone(lang, step)` | stroke "A red wave! Beautiful!" / "Một đường lượn sóng màu đỏ! Đẹp quá!"; shape "A triangle! Beautiful icing!"; size (topic) "All around the big cookie! Beautiful!"; glyph number "A beautiful three!", letter "Letter B! Beautiful icing!", initial "D for dog! Beautiful!", sum "2 + 3 is five! Beautiful!", parity "Four is even! …"; road "The road to the kennel is ready!" |
| `sayWrong(lang, ev)` | bag "That’s yellow icing. Let’s find blue!"; cookie "That’s the circle. Where is the triangle?"; animal "Meow! That’s the cat. Where is the dog?"; size "That’s the small cookie. Where is the big cookie?"; maths "That’s number six. Let’s count again!"; parity "Four is even! Let’s look for another one!"; initial "That’s letter M. Listen: Dog! Let’s look again!" |
| `sayNeedPick(lang, {mode, color})` | "First tap the blue icing bag!" / "First find the right cookie down here!" / "Pick one down here first!" |
| `sayChipsDone(lang, {n})` | "Three chocolate chips! Yummy!" / "Ba hạt sô-cô-la! Ngon quá!" |
| `sayHome(lang, {animal} \| animal)` | `home.<animal>`: "Woof woof! The dog is home!" / "Gâu gâu! Cún về tới nhà rồi!" (≤ 48 chars) |
| `sound(lang, animal)` | "Woof woof!" / "Gâu gâu!" (`sound.<animal>`) |
| `sayCount(lang, i)` | "Zero!" … "Twenty!" (= `count.<i>`; beyond 20 the digits) |
| `talkWrong(lang, choice \| kind, value)` | "It is an oval! Good try!", "It is the beehive! Good try!", "It is the big one!", "Là số bảy đó! Bé cố gắng lắm!" |
| `speech(lang, text)` | TTS text (Voice.say calls it): EN letter names ("letter D" → "letter dee", "D is for", "D for", "starts with D", "Big G / small g"), + − =, " — " → ", "; VI "chữ B" → "chữ bờ", "Mochi" → "Mô Chi", "sô-cô-la" → "sô cô la" |
| `initialOf(lang, animal)` | `{word, first}`: en dog → D; vi ếch → **Ê** (the letter keeps its own marks, the tone goes), ong → O, mèo → M |
| `setChild(name)`, `has`, `keys`, `raw` | `{child}` default for every `t()`; key checks |
| constants | `langs, TOPICS, ANIMALS, HOMES, HOME_OF, STROKES, NAME_KINDS, PROMPTS, PARAMS (required params per key), NAME_TABLE, SOUNDS, LETTER_VI, WORD_LIST, MAX_COUNT (20)` |

### 2.1 Derived params
`{hue}` ← color · `{word}`, `{sound}` ← animal · `{home}` ← animal (for `p.road`, `trace.done.road`, `talk.home`) ·
`{lower}` ← letter (`p.lower` / `talk.lower` take the capital in `letter`) · `{expr}` ← a,b,op / text / sum / diff ·
`{num}` (number word) and `{chips}` ("chocolate chip(s)" / "hạt sô-cô-la") ← n. A missing required param switches to the
fallback key (`p.colors` → `p.colors.any` → `p.any`; `p.trace` / `p.road` → `p.trace.any`; `p.chips` → `p.chips.any`;
`say.pick.*` → `say.pick.any`; `trace.done.*` → `trace.done.any`; `wrong.animal` → `wrong.cookie` → `wrong.any`; `talk.*` →
`talk.*Any`).

### 2.2 Key list (+ required params)
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, pause, parentsHold, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice ("Mochi’s voice" / "Giọng của
  Mochi"), mic, done, stars, chapter {n}, allDone {stars}, welcome ({child}), micUnsupported, micDenied, voiceMissing,
  tapOrSay, listening ("Mochi is listening…"), tapMochi, tapHint, skip, gallery ("Our cookies"), langName.en, langName.vi`.
- **topic.\*** (one banner each): colors "Colourful Icing / Kem nhiều màu", shapes "Shape Cookies / Bánh quy hình khối",
  size "Big and Small / To và nhỏ", count "Counting Chips / Đếm hạt sô-cô-la", animals "Animal Cookies / Bánh quy con vật",
  letters "ABC Cookies / Bánh quy chữ cái", lower, initial, add, sub, oddeven.
- **weather.0..3**: "Spring blossoms outside!", "Sunny summer kitchen!", "Autumn leaves outside!", "Snow outside, cosy
  inside!" (+ VI).
- **Prompts** (3 wordings each): `p.colors {color, stroke}`, `p.colors.any {color}`, `p.shapes {shape}`, `p.size {size}`,
  `p.count {n}`, `p.chips {n}` (+ `.any`), `p.animals {animal}` (+ derived `{sound}`), `p.road {home}` (or `{animal}`),
  `p.letters {letter}`, `p.lower {letter}`, `p.initial {word}` (or `{animal}`), `p.add {a, b}`, `p.sub {a, b}`,
  `p.oddeven {parity}`, `p.trace {what}` (+ `p.trace.any`), `p.any`.
- **Pick**: `say.pick {color}` (bag), `say.pick.any`, `say.pick.shape {shape}`, `.size {size}`, `.animal {animal}`,
  `.home {home}`, `.label {label}`, `.parity {num, parity}`, `.initial {letter, word}`, `.sum {expr, ans}`.
- **Trace**: `trace.start`, `trace.progress`, `trace.stroke`, `trace.pause`, `offPath`, `traceTap`, `assist`, `hint.path`,
  `trace.done.{stroke {color, stroke}, shape {shape}, size {size}, number {num}, letter {label}, initial {letter, word},
  sum {expr, ans}, parity {num, parity}, road {home}, any}`.
- **Chips**: `count.0..20`, `chipsDone {num, chips}` (from `{n}`; + `.any`), `already`.
- **Feedback**: `wrong.bag {got, want}`, `wrong.cookie {got, want}`, `wrong.animal {got, want, sound}`, `wrong.math {got}`,
  `wrong.parity {num, parity}`, `wrong.initial {got, word}`, `wrong.any`, `needPick.bag {color}`, `needPick.cookie`,
  `needPick.any`, `hint`, `idle`.
- **Reward / story**: `finish`, `hop`, `home.<animal>` (10), `home.any {animal}`, `home.any.0`, `sound.<animal>` (10),
  `praise`, `great {child}`, `party`, `session.done {stars}`, `enter`, `surprise.bird`, `bird.tap`, `surprise.mouse`,
  `mouse.tap`, `pokeMochi`.
- **Talk**: `talk.intro, talk.right, talk.colors {color}, talk.shapes {shape}, talk.size {size}, talk.count` (no params:
  never says the answer), `talk.animals {animal}` (**"Where does the dog live?"** — choices are homes `{kind:'home', home}`),
  `talk.animalsFind {animal}` ("Where is the cow?" — choices are animals), `talk.home {home}` ("Who lives in the nest?"),
  `talk.letters {letter}, talk.lower {letter}, talk.initial {word}, talk.add {a,b}, talk.sub {a,b}, talk.oddeven {parity}`,
  the `*Any` fallbacks (`colorsAny, shapesAny, sizeAny, countAny, animalsAny, lettersAny, lowerAny, initialAny, calc,
  oddevenAny`), `talk.wrong(.a, .animal, .home, .size, .letter, .small, .number, .any)`.

### 2.3 Names (DESIGN §6)
| kind | EN | VI |
|---|---|---|
| color / hue | red blue yellow green orange purple pink | màu đỏ, màu xanh dương, màu vàng, màu xanh lá, màu cam, màu tím, màu hồng / bare: đỏ, xanh dương … |
| shape | circle, square, triangle, star, heart, rectangle, diamond, oval | hình tròn, hình vuông, hình tam giác, hình ngôi sao, hình trái tim, hình chữ nhật, hình thoi, hình bầu dục |
| stroke | line "straight line", wave, zigzag, arc "rainbow arch", loop, swirl, circle | đường thẳng, đường lượn sóng, đường zíc zắc, cầu vồng, vòng xoắn, hình xoáy ốc, vòng tròn |
| animal | dog cat bee bird frog cow rabbit fish duck pig (+size "big dog") | con chó, con mèo, con ong, con chim, con ếch, con bò, con thỏ, con cá, con vịt, con heo (+size "con chó to") |
| word (initial) | as animal (D C B B F C R F D P) | chó C, mèo M, ong O, chim C, ếch Ê, bò B, thỏ T, cá C, vịt V, heo H |
| home | kennel, beehive, nest, pond, barn, burrow, fish bowl, basket | chuồng chó, tổ ong, tổ chim, cái ao, cái chuồng, cái hang, bể cá, cái giỏ |
| size | big, small | to, nhỏ |
| number | zero … twenty | không … hai mươi (mười lăm, hai mươi) |
| letter | as written; speech "ay, bee, see…" | phonics as taught in kindergarten: a, bờ, cờ, dờ, đờ, e, ê, gờ, hờ, i, ca, lờ, mờ … (F ép, J gi, W vê kép, Z dét) |
| parity | odd, even | lẻ, chẵn |
| sum / diff | "two plus three" | "hai cộng ba", "bảy trừ hai" |

Content note (mechanics engineer): for the VI `initial` topic use `I18N.initialOf('vi', animal).first` (ếch → **Ê**, not
E) or `FT.WORDS.vi[i].initial`; the default `FT.WORDS` (set by i18n.js when content does not set one) has the 10 animals.

## 3. Input (`FT.Input`) — tap + trace
```
const detach = FT.Input.attach(canvas, { toLogical(cx, cy) → {x, y}, down(x, y, ev), move(x, y, ev), up(x, y, ev), cancel(), hover?(x, y) })
detach.cancel()   // end the active finger now (rotation, resize, pause) → cancel() once; that finger's later moves/ups dropped
detach.isActive() // a finger is down
detach.stats()    // { downs, moves, coalesced, ups, cancels }
detach()          // remove all listeners
FT.Input.kidProof()                                 // once at boot
FT.Input.holdButton(el, 2000, onDone, onProgress)   // parent gate (hold ⚙ 2 s)
FT.Input.COALESCE = true                            // deliver coalesced samples (tests may switch it off)
```
- **One active pointer.** Extra fingers are ignored (a palm on the iPad must not pipe icing). A new *primary* touch, a mouse
  press replacing a touch, or 6 s of silence (`STALE_MS`) means the old finger is gone → `cancel()`, then the new `down()`.
- **down** fires synchronously in `pointerdown` with **pointer capture**; the canvas has `touch-action: none` and every
  pointerdown / pointermove is `preventDefault`ed; `kidProof()` also blocks document touchmove (no scroll / rubber band /
  pull-to-refresh while tracing), pinch, double-tap zoom, long-press callout, text selection, Ctrl-wheel. An extra finger's
  touchstart is blocked **only on the game**: when it lands on `Input.UI_TARGETS` (`button, input, label, select, textarea,
  a, [role="button"], .screen, #hud, .no-game-input`) it is left alone, so its click still fires. iOS drops the click of a
  preventDefault'ed touchstart, so before this fix a thumb resting on the iPad blocked Pause / Play / Resume / Talk answers
  (functional OBS-1).
- **move is continuous and never throttled**: every pointermove of the active finger, synchronously. If the browser
  coalesced several samples into one event, `getCoalescedEvents()` samples are delivered one by one, in order (smooth fast
  strokes; `FT.Trace.track` never jumps a corner). Exact repeats of the previous point are dropped. The coalesced samples'
  own `pointerId` is ignored (Safari 18.2 reports a wrong one) — they belong to the parent event that passed the id check.
- **up** of that finger also when lifted over the HUD / bubble / outside the canvas (capture; window fallback, exactly once).
- **cancel** on `pointercancel`, `lostpointercapture` while down, window `blur`, page hidden, `detach.cancel()`. The world
  keeps the trace progress (a lift = `tracePause`).
- **HUD / menus filtered**: presses on `button, .screen, #hud, .no-game-input` never reach the world. Old iOS without
  PointerEvent: touch + mouse fallback with the same guarantees (touchmove of the active touch only).
- Handlers get **numbers** `(x, y, ev)` in logical px (never a point object); non-finite points are dropped (`up` → cancel).

main.js wiring (unchanged from sea paint): `down → world.pointerDown`, `move → world.pointerMove`, `up → world.pointerUp`,
`cancel → world.cancelDrag()`; on resize/rotation call `inputCancel.cancel()` then `world.cancelDrag()`.

## 4. Voice (`FT.Voice`) — unchanged engine, Mochi's voice
`init({lang, enabled})`, `unlock()` (in the first touchend/click), `say(text, {interrupt, priority, rate, pitch, lang})` →
Promise `{spoken, reason}`, `sayKey(key, params, opts)` (`.text`), `stop()`, `dropQueued()`, `isSpeaking()`,
`hasVoice(lang)`, `voiceName(lang)`, `setLang`, `setEnabled`, `setVolume(0..1)`, `onStart(text)` / `onEnd(text)` (talk
frames, music ducking), `onVoicesChanged(fn)`, `log` (mirrored to `FT.debug.voiceLog`), `spoken(lang, text)`;
`canListen()`, `listen({lang, choices:[{id, words}|{id, kind, value}], timeoutMs})` → `{id|null, transcript, reason}`,
`stopListening()`, `match()` / `matchDetail()` (fuzzy: exact tokens → no-diacritic tokens → number words → edit distance ≤ 1–2
for long words; the longest / latest form wins; ties = no answer).
- Best voice per language (Samantha / Ava / … for EN, Linh / Google tiếng Việt for VI; novelty voices avoided),
  **rate 0.9, pitch 1.2** (a young, warm panda; above ≈ 1.3 iOS voices go robotic, below ≈ 0.85 VI tones smear).
- Queue ≤ 2 waiting lines, oldest non-priority dropped; non-priority lines stale after 5 s; `interrupt` flushes + cancels
  and speaks after 50 ms (90 ms on iOS — `speak()` right after `cancel()` is dropped).
- iOS: unlock with a silent utterance inside the first gesture; a `not-allowed` error re-queues the line for the next
  unlock; watchdog when `onend` never fires; reset the synthesizer when the page becomes visible again; voices list polled
  (it fills late). Chrome desktop: pause/resume every 10 s (15 s cut-off).
- Mic: a fresh recognizer per `listen()`, interim results with a 450 ms settle, `maxAlternatives 5`, `audioSession` set to
  `play-and-record` while listening (Safari 16.4+) and restored after; off on iOS home-screen apps (no recognition there).

### 4.1 Current iOS notes (checked 2026-11)
- **Safari 18.2+ implements `PointerEvent.getCoalescedEvents()`** (WebKit bug 210454); its coalesced events can carry a
  wrong `pointerId` (Flutter engine PR #56719 works around it) → input.js trusts the parent event, not the samples' ids.
  Older iOS returns nothing / lacks the method → one move per event, as before.
- **Since iOS 18 some system voices are missing from `speechSynthesis.getVoices()`** (Apple forum thread 764438); when no VI
  voice is listed the utterance still gets `lang = 'vi-VN'` (iOS then uses its default VI voice if installed) and
  `hasVoice('vi')` is false → main shows `ui.voiceMissing` (Settings › Accessibility › Spoken Content › Voices).
- Speech still needs a user gesture on iOS (first `unlock()`), and `speechSynthesis` can get stuck after backgrounding —
  both handled as above.

Sources: [WebKit bug 210454](https://bugs.webkit.org/show_bug.cgi?id=210454),
[Flutter engine #56719](https://dart.googlesource.com/external/github.com/flutter/engine/+/23447c4674b0837ada66d29099147e05a695cec4),
[Apple forums: TTS voices missing since iOS 18](https://developer.apple.com/forums/thread/764438).
