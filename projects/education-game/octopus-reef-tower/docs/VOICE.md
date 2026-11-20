# Pip's Reef Tower — Voice, language and input

Files: `game/js/i18n.js` (`RT.I18N`), `game/js/voice.js` (`RT.Voice`), `game/js/input.js` (`RT.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 51 000 checks). They cover:
- every key in both languages, with identical key sets; every key the game code (main / ui / render / content / world /
  index.html) asks for exists
- every prompt key × every value, with all params filled; `p.sound` with `{animal}`, `{animal, sound: clue id}`,
  `{sound: clue id}` and `{sound: animal id}`
- every name kind × value: name, spoken forms, digits, no-diacritic forms
- every sea animal: name with classifier, bare name, spoken forms with and without diacritics, its clue
- `sayStack` / `sayWrong` / `sayTap`: exact lines, plus a sweep over all 11 topics
- **every round and Talk time the real `content.js` makes** (ages 3–7, both languages: 1 320 rounds, ≈ 17 000 lines),
  and `RT.ANIMAL_SOUND` = the clue ids i18n knows
- **no old-theme word in either language**: cake, koala, Koko, cherry, candle, bee, honey, Bzzz, sprinkle, candy,
  cookie, bake, frosting, layer, wish, Candy Village, the farm animals and their sounds; VI bánh, kem, nến, ong, kẹo,
  anh đào, cốm, Làng Kẹo, tầng bánh, vo ve, mèo, cún, heo, bò, cừu, thỏ, gấu … (letter-bounded, so "trong" ≠ "ong")
- garbage events, never-negative wording, Vietnamese diacritics present
- the EN/VI matcher (incl. "cá" vs "cá voi / cá ngựa / cá heo", "fish" vs "jelly fish"), the voice queue and interrupt
  with a fake `speechSynthesis`, the recognizer, the tap/drag input rules and the parent hold gate

The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from Koko's Cake Tower. All wording is new.

## 0. Wording principles (Pip)
- **Pip** is a cheerful little octopus girl (peach, cream spots, a mint diving mask on her forehead). Her name is
  written **and spoken** "Pip" in both languages. Vietnamese introduces her as "bạch tuộc Pip" ("Mình là bạch tuộc
  Pip"); the logo is "Pip’s / Reef Tower", vi "Bạch Tuộc Pip / Tháp San Hô".
- **Tapping is the verb.** A tap sends a block up in a bubble, so most prompts have a "Tap the …" / "Bé chạm vào …"
  wording (tested: ≥ 10 prompt keys per language); drag hints ("Let go over the tower!") stay for children who drag.
- **Short and concrete**: ≤ 13 words per key (tested), with the key word last ("Find the **red** block!").
- **Reaction lines are tiny**, so they never cut off the next prompt:
  - A landing is the name plus one sound / praise word: "Red! Plonk!". From the 2nd block on, a plain name (colour,
    shape, size, sea animal, letter) also counts the tower (DESIGN §6): "Red! Two blocks tall!" / "Màu đỏ! Tháp cao hai
    tầng rồi!" (`stack.tall`, ≤ 7 words EN / 9 VI, tested). Numbers, pearls, sums, clue, first-letter and small-letter
    lines never add the height, so two numbers never collide ("Five! Two blocks tall!").
  - A bounce is "Bloop! That’s blue. Find red!" (≤ 10 / 13 words; clue asks ≤ 12 / 13).
  - The finished tower is counted once, by `sayTowerDone` (≤ 12 words for 6 blocks).
- **Under-the-sea vocabulary**:
  - EN: tap / **block** / **tower** / on top / **starfish** / **pearls** / **bubbles** / **sea current** / **puffer fish**.
  - VI: chạm / **khối** / **tháp** / lên trên / **bạn sao biển** / **ngọc trai** / **bong bóng** / **dòng nước** / **cá nóc**.
  - Count tokens on blocks are glowing **pearls**, vi **viên ngọc** ("khối có ba viên ngọc"; "ngọc trai" also accepted).
  - Stars are only the score ("ngôi sao").
- **Classifiers**:
  - A block is "khối": "khối màu đỏ", "khối có hình ngôi sao", "khối số năm", "khối to".
  - Sea animals always take "con" ("con cua", "con cá voi"), colours take "màu", shapes "hình", letters "chữ".
- **Never negative.** A wrong block bonks off the tower and drifts home. Pip says the bounce word, names what bounced,
  then repeats the goal: "Bloop! That’s blue. Find red!" / "Tưng! Khối màu xanh dương. Tìm màu đỏ nhé!".
  - Maths and clue asks never give the answer away.
  - The test bans these words in every non-UI line and every generated line: no / not / wrong / bad / fail /
    incorrect / mistake / oops / fall / crash / broken, and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ /
    ngã / rơi mất. The tower never falls, and Pip never says it might. Rain is "Tí tách, mưa rơi trên sóng biển!".
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!". Every prompt key has a "Bé ơi /
  nhé! / nào!" wording (tested).
  - Bounce word: **"Tưng!"** (EN "Bloop!" / "Boing!"). Soft landing: **"Bụp!"** (EN "Plonk!"), animals "Tõm!" / "Splash!".
  - Praise uses **{child}** ("Bé Mai xây tháp giỏi quá!"). Every `great` / `idle` / `talk.right` / `session.done`
    list has a name variant and a no-name variant. With no name, the no-name variant is used, or "bé" / "friend".
- **3 wordings** for every prompt key, all different (tested).

### Sea animals (`animal` kind) and their clues
`RT.ANIMAL_SOUND` (content.js) keeps its name but holds **clue ids**; `p.sound` asks the clue ("Who has big claws?").
| id | EN | VI | clue id → question phrase EN / VI | short clue after a landing | also accepted by the mic |
|---|---|---|---|---|---|
| fish | fish | con cá | — (never asked by clue) | — | fishy, little fish · cá, cá con, chú cá, bạn cá |
| crab | crab | con cua | claws → has big claws / có đôi càng to | Big claws! / Đôi càng to! | crabby, claws, big claws · cua, chú cua, cua biển, đôi càng, càng to |
| turtle | turtle | con rùa | shell → carries a shell on its back / cõng mai trên lưng | A hard shell! / Chiếc mai cứng! | sea turtle, tortoise · rùa, rùa biển, mai rùa |
| whale | whale | con cá voi | spout → sprays water up high / phun nước lên cao | Whoosh, a water spout! / Phun nước lên cao! | big whale, water spout · cá voi, chú cá voi, phun nước |
| seahorse | seahorse | con cá ngựa | tail → has a curly tail / có đuôi xoăn | A curly tail! / Chiếc đuôi xoăn! | sea horse, horse, curly tail · cá ngựa, ngựa biển, đuôi xoăn |
| dolphin | dolphin | con cá heo | — | — | dolphy, porpoise · cá heo, chú cá heo, bạn cá heo |
| jellyfish | jellyfish | con sứa | — | — | jelly fish, jelly · sứa, sứa con, sứa biển |
| shrimp | shrimp | con tôm | — | — | shrimps, prawn · tôm, tôm con, con tép |

Notes on the animal table:
- **"cá" is a prefix** of "cá voi", "cá ngựa", "cá heo" (and "fish" of "jelly fish"). The matcher scores the LONGER
  form higher, and every "con / chú / bạn cá X" variant is listed, so "chú cá heo" → dolphin, "cá" → fish (tested in
  both directions, with and without diacritics).
- **Clues as answers**: a child may answer "big claws!" / "đôi càng!" — the clue words are accepted for their animal.
- **No-diacritic forms** ("con ca voi", "rua", "sua", "tom") are all accepted. "con" / "chú" alone match nothing.
- **No clue**: `p.sound` / `talk.sound` for fish, dolphin, jellyfish or shrimp falls back to `p.animals` /
  `talk.animalsAny`. `I18N.sound(lang, x)` / `clue(lang, x)` / `hasSound(x)` take an animal id, a sprite id
  (`animal_crab`) or a clue id.

## 1. API for main.js (exact event fields)
General API:
- `RT.I18N.t(lang, key, params, rng?)`
- `name(lang, kind, value)`, `sound(lang, animalOrClue)`, `clue(lang, animalOrClue)`, `hasSound(x)`, `words(lang, kind, value)`
- `has(lang, key)`, `speech(lang, text)`, `setChild(name)`, `talkWrong(lang, kind, value)`
- `phrase(lang, kind, value, block)`, `wordEntry(lang, id)`

Name kinds: `color, shape, size, animal, number, dots, stars, letter, text, sum, diff, parity, word`.

Tower helpers, all `(lang, ev, rng?)`. They never throw, and never return '' or a raw `{x}`:
- `sayStack(lang, ev)`: ev `{ n, nameKind, nameValue, block?, topic, promptKey, params }`. **`n` (tower height, as the
  world's `stack` event sends it) is now spoken** for plain names from n ≥ 2 ("Red! Two blocks tall!").
- `sayTowerDone(lang, n)`: "One, two, three, four! We reached the starfish!" / "Một, hai, ba, bốn! Tới bạn sao biển
  rồi!". Takes `n` or `{n}`; with no n it says `t('towerDone')`.
- `sayWrong(lang, ev)`: ev `{ nameKind, nameValue, want:{kind, value}, block?, topic, promptKey, params, streak }`.
- `sayTap(lang, ev)`: ev `{ nameKind, nameValue, block? }` (also used for `grab` and the tap that sends a block).
- `sayCount(lang, i)` = `t('count.' + i)` ("One!" … "Twelve!"), used for the pearl count.
- Aliases: `sayFound` / `sayGo` / `sayCorrect` = `sayStack`, `sayGrab` / `sayFlip` = `sayTap`, `sayMismatch` = `sayWrong`.

### Event keys (EN + VI) and aliases kept for older code
| key | EN [0] | VI [0] | alias (same text) |
|---|---|---|---|
| `crown` | Plop! The starfish is on top! | Bụp! Bạn sao biển lên đỉnh rồi! | `monkey` |
| `pearls` | Pearls! Let’s count them! | Ngọc trai nè! Mình cùng đếm nhé! | `candles` |
| `blow` | Bubbles… fffff! | Thổi bong bóng nào… phù! | — |
| `pearlsOut` | Pop, pop! Up go the pearls! | Bụp bụp! Ngọc trai bay lên rồi! | `candlesOut` |
| `sprinkles` (fish school) | Look, a fish parade! | Nhìn kìa, đàn cá bơi vòng vòng! | `bloom` |
| `clear` | Bye-bye, tower! Float away! | Tạm biệt tháp! Bay lên nào! | — |
| `surprise.puffer` | Look! A puffer fish is coming! | Nhìn kìa! Bạn cá nóc bơi tới! | `surprise.butterfly` |
| `puffer` | A puffer fish is visiting our tower! | Bạn cá nóc ghé thăm tháp rồi! | `butterfly.land` |
| `puffer.tap` | Puff! Look how round! Bye-bye, puffer fish! | Phồng! Tròn xoe luôn! Tạm biệt cá nóc! | `butterfly.tap` |
| `surprise.breeze` | A sea current is coming! | Có dòng nước chảy tới đó! | — |
| `gust` | Whoa, a current! I’ve got it! | Ui, dòng nước mạnh! Pip giữ tháp nè! | — |
| `ui.tapPip` | Tap Pip to hear it again | Chạm vào Pip để nghe lại nhé | `ui.tapLulu` |
| `stack.tall` (new) | {it}! {tall} blocks tall! | {it}! Tháp cao {tall} tầng rồi! | — (used inside `sayStack`) |

Key names main.js uses are unchanged; no new key is required in main.js.

### 1.0 World event → line
World events already carry `nameKind` / `nameValue` (DESIGN §5.2). main adds `topic`, `promptKey` and `params` of the
current ask, and optionally `block` (the piece's block). With `block`, content's `word` / `initial` are used.

| world event | line |
|---|---|
| `level` | `t('ui.chapter', {n}) + '. ' + t('topic.' + topic)`, then `t('weather.' + level)`: 0 "Sunny day under the sea!", 1 "Whoosh, a sea current! Hold on, tower!", 2 "Pitter-patter, rain on the waves!", 3 "Look, a rainbow above the waves!" |
| `round` (+ `surprise`) | `t('surprise.breeze')` / `t('surprise.puffer')` |
| `deal` (round start) | `t('deal')` "Let’s build a tower up to the starfish!" (only on the first deal of a round) |
| `ask` | `t(promptKey, params)` (protected prompt) |
| `grab` / `tapPiece` | `sayTap(lang, ev)` (short, never interrupts the prompt) |
| `miss` | `t('miss')` "Tap the block to send it up!" (rate-limited) |
| `stillDrag` | `t('stillDrag')` "Let go over the tower!" |
| `stack` | `sayStack(lang, ev)`; on the LAST block, say `sayTowerDone(lang, n)` instead |
| `wrong` | `sayWrong(lang, ev)`; after 2 misses `hint` follows → `t('hint')` |
| `idle` | `t('idle') + ' ' + prompt` |
| `pokePip` | repeat the prompt (`ui.tapPip` is the bubble hint) |
| `gust` | `t('gust')` |
| `puffer` / `pufferTap` | `t('puffer')` / `t('puffer.tap')` |
| `towerDone {n}` | `sayTowerDone(lang, n)` (interrupt) |
| `crown` | `t('crown')` when Pip is quiet |
| `count {i}` | optional `t('pearls')` once before i = 1, then `sayCount(lang, i)` per pearl (or chimes only) |
| `blow` | `t('blow')` "Bubbles… fffff!" (TTS says "fooo") |
| `pearlsOut` / `sprinkles` | optional `t('pearlsOut')` / `t('sprinkles')` |
| `roundDone` | star chime only; `t('great')` is available |
| `clearBlock` | optional `t('clear')` once |
| `talk` / `talkAsk` / `talkResult` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; `t('talk.right')` / `talkWrong(lang, kind, value)` |
| `sessionDone` | `t('party')` "Rainbow party time!", then `t('session.done', {stars})` |

UI keys: every `ui.*` key, including `ui.volume`, `ui.chapter`, `ui.welcome`, `ui.listening`, `ui.tapOrSay`,
`ui.micDenied`, `ui.micUnsupported`, `ui.holdForParents`, `ui.voice` ("Pip’s voice" / "Giọng của Pip"), `ui.tapPip`
and `ui.dragHint` (now "Tap a block to send it up to the tower").
- Logo `ui.logo1` / `ui.logo2`: "Pip’s" / "Reef Tower", vi "Bạch Tuộc Pip" / "Tháp San Hô".
- `ui.title`: "Pip’s Reef Tower" / "Tháp San Hô của Pip".

### 1.1 Prompt keys and params (each has 3 wordings; a missing param falls back to `p.any`)
| key | params | example EN / VI |
|---|---|---|
| `p.colors` | `{color}` | Find the red block! · Bé ơi, tìm khối màu đỏ nhé! |
| `p.shapes` | `{shape}` | Put the star block on top! · Bé ơi, đặt khối có hình ngôi sao lên trên nhé! |
| `p.countUp` | `{n}` | Count up! Block number 2! · Đếm lên nào! Bé tìm khối số 3 nhé! (every wording says count) |
| `p.count` | `{n}` | Find the block with 3 pearls! (1 → "1 pearl") · Bé tìm khối có 3 viên ngọc nhé! |
| `p.animals` | `{animal}` | Find the crab block! · Bé ơi, tìm khối có con rùa nhé! |
| `p.sound` | `{animal, sound: clue id}` (either is enough) | Who has big claws? Find that block! · Bé ơi, bạn nào có đôi càng to nhỉ? |
| `p.size` | `{size}` | Find the big block! · Bé ơi, tìm khối nhỏ nhé! |
| `p.letters` | `{letter}` | Find the letter B! · Bé ơi, tìm khối chữ B nhé! (TTS "chữ bờ") |
| `p.lower` | `{letter}` (capital) | Big letter B! Find its small letter! |
| `p.initial` | `{letter}` | Which one starts with the letter C? Tap it! · Bạn nào bắt đầu bằng chữ C? Bé chạm nhé! |
| `p.add` / `p.sub` | `{a, b}` (+ `op` '−') / `{text}` / `{expr}` | What is 2 + 3? Tap the answer! |
| `p.oddeven` | `{parity}` | Find an odd number! · Bé ơi, tìm số chẵn nhé! |

### 1.2 What Pip says when a block lands / bounces (short on purpose)
| topic | stack | wrong |
|---|---|---|
| colors | Red! Plonk! · (n ≥ 2) Red! Two blocks tall! / Màu đỏ! Tháp cao hai tầng rồi! | Bloop! That’s blue. Find red! / Tưng! Khối màu xanh dương. Tìm màu đỏ nhé! |
| shapes | Star! Yes! / Hình trái tim! Tháp cao ba tầng rồi! | Bloop! That’s an oval. Find the star! |
| count (pearls) | Three pearls! Plonk! / Ba viên ngọc! Bụp! | Bloop! That’s two pearls. Find three pearls! / Tưng! Hai viên ngọc. Tìm ba viên ngọc nhé! |
| count-up | Three! Plonk! / Số ba! Bụp! | Bloop! That’s three. Find number two! |
| animals | Crab! Splash! / Con cua! Tõm! · Fish! Two blocks tall! | Bloop! That’s the shrimp. Find the fish! / Tưng! Con tôm. Tìm con cá voi nhé! |
| clue (`p.sound`) | The crab! Big claws! / Con cua! Đôi càng to! | Bloop! That’s the fish. Who has big claws? / Tưng! Con cá. Bạn nào có đôi càng to nhỉ? |
| size | Big block! Plonk! / Khối nhỏ! Bụp! | Bloop! That’s the small one. Find the big one! / Tưng! Khối nhỏ. Tìm khối to nhé! |
| letters | Letter B! Plonk! (TTS "letter bee") / Chữ B! Bụp! | Bloop! That’s letter C. Find letter B! |
| lower | Small b! Plonk! / Chữ b thường! Bụp! | Bloop! That’s small d. Find small b! |
| initial | D is for dolphin! / Chữ R, rùa! | Bloop! S is for shrimp. Find letter C! / Tưng! Sứa, chữ S. Tìm chữ T nhé! |
| add / sub | 2 + 3 is five! / 7 − 3 bằng bốn! | Bloop! That’s six. What is 2 + 3? |
| oddeven | Seven is odd! / Tám là số chẵn! | Bloop! Four is even. Find an odd one! |

## 2. How voices are chosen
The voice list is read with `getVoices()` at init, on `voiceschanged`, and every 250 ms for 6 s (iOS fills the list
late). Each voice gets a score:
- the language prefix must match
- exact `en-US`/`vi-VN`: +6
- preferred names: en Samantha, Nicky, Karen, Ava…, Google US English, Microsoft Aria/Jenny; vi **Linh**, Google Tiếng
  Việt, Microsoft HoaiMy/An
- Enhanced/Premium/Natural: +12; Google off iOS: +8; local: +3
- Apple novelty voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma…): −60

**Utterances**: **rate 0.9, pitch 1.2** (`RT.Voice.RATE` / `PITCH`). That makes Pip, a little octopus girl, young and bright. Above ≈ 1.3
iOS voices sound robotic, and below rate 0.85 Vietnamese tones smear. `volume` = `Voice.setVolume()` (the game's volume
slider).

**Queue**:
- One line speaks, ≤ 2 wait. The oldest non-priority line is dropped, and non-priority lines older than 5 s are skipped.
- `interrupt` flushes + cancels, then speaks after 50–90 ms; `dropQueued()` drops the waiting lines.
- A watchdog ends lines iOS never ends. Chrome desktop gets a keep-alive. A hidden page stops speech.

**Spoken text** = `Voice.spoken(lang, text)` = `I18N.speech`:
- letters: "letter B" → "letter bee", vi "chữ B" → "chữ bờ"; "T is for" → "tee is for"
- + − =, and "…" → a pause
- "fffff" (Pip blowing bubbles) → "fooo"
- English letter B is spoken "bee" (the code rename bee → puffer had turned it into "puffer"; fixed and tested)

Every line is logged (`Voice.log`, `RT.debug.voiceLog`), also when muted.

## 3. Vietnamese letter names (kindergarten phonics, "đọc theo âm")
a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**.
The screen shows the letter ("chữ B") and the voice says the phonics name. The mic also accepts alphabet names (bê, xê…).

`initial` words: content.js owns the live list (`RT.WORDS`, sea animals). i18n has the same default:
- en: fish F, crab C, turtle T, whale W, seahorse S, dolphin D, jellyfish J, shrimp S
- vi: cá C, cua C, rùa R, cá voi C, cá ngựa C, cá heo C, sứa S, tôm T (no digraph words). Many start with C, so
  content.js keeps the initials unique inside one choice set.

`name(lang, 'word', x)` works with **any** id content uses: a word, an `id`, a `sprite`, an animal id, a word from the
other language (mapped through the shared id), or an `[{id, en, vi}]` list. An unknown id is shown readable
("crown_cloud" → "crown cloud").

## 4. Speech recognition (Talk time, optional)
`listen()` creates a **new** `SpeechRecognition || webkitSpeechRecognition` each time:
- en-US/vi-VN, interim results, 5 alternatives; TTS is stopped first
- a final match resolves at once; an interim match waits 450 ms; 7 s timeout
- `not-allowed` turns `canListen()` off for the session
- `navigator.audioSession.type = 'play-and-record'` while listening, restored afterwards

Matcher order: exact tokens > diacritic-free > number words as digits > edit distance on long words; a longer matching
form scores higher than a shorter one ("cá voi" beats "cá"), and at equal score the later word wins.
- `=word` forms match the whole utterance only (en "to" → 2, vi "không" → 0).
- Ties at the same position are ambiguous and match nothing.
- Choices `{id, kind, value}` use `words()`.
- `dots` choices accept "three pearls" / "three dots" / "three spots" / "ba viên ngọc" / "ba ngọc trai" / "ba chấm" /
  "ba hạt" and plain numbers.

## 5. iOS / Safari notes (re-checked 14 Nov 2026 for iOS 18 / 26 Safari and the Safari 27 notes)
**Speaking**
- `speechSynthesis` works in Safari tabs and Home-Screen web apps on iOS 17, 18 and 26.
- **iOS 26 regression**: the system ignores the voice the user picked in Settings for synthesized speech
  (`AVSpeechSynthesisVoice`, Apple forum thread 804648). We always set `utterance.voice` by name from `getVoices()`,
  so Pip's voice does not depend on that setting.
- **Safari 27 release notes**: Safari fixed a bug where `speechSynthesis.cancel()` also removed utterances queued by
  later `speak()` calls. Older Safari still has the bug, so we keep the 90 ms gap between `cancel()` and the next
  `speak()` on iOS for `interrupt`. Do not remove it.
- Downloaded Enhanced/Premium voices are still mostly missing from `getVoices()` (WebKit bug 290497). Samantha and Linh
  are built in. When `hasVoice('vi') === false`, show `ui.voiceMissing`.
- The first `speak()` must come from a gesture. `unlock()` in the first `touchend`/`click` speaks a silent `' '`, and a
  line refused with `not-allowed` is kept and spoken on the next `unlock()`. A `pointerdown` is not enough on every iOS version,
  so call `unlock()` on `pointerup`/`touchend` (main's first-gesture handler) — a TAP to send a block ends in exactly
  such a `pointerup`.
- After the app was in the background the synthesizer can be stuck paused. On `visibilitychange` back we `cancel()` +
  `resume()`.
- Safari ducks WebAudio while speaking, so keep the music duck gentle.

**Listening**
- `webkitSpeechRecognition` works in Safari tabs (it uses Siri dictation, so Siri/Dictation must be on, and most devices
  need a network connection). It is optional; taps always work.
- It does not work in Home-Screen web apps, so `canListen()` is false when standalone.
- **Known WebKit hang** (2025–2026 reports): after an HTML `<audio>` element has played, `start()` can show "listening"
  but never fire `onresult`, `onerror` or `onend`. Our protections:
  - the game's sound is Web Audio only (no `<audio>` elements)
  - each `listen()` uses a fresh recognizer
  - the 6–7 s timeout always resolves and aborts
  - the mic button stays tappable to try again

**General**
- iPadOS sends a desktop UA; we detect it via `MacIntel` + touch.
- These files use no regex look-behind (a SyntaxError on iOS < 16.4 would kill the script; tested).

Sources: [Apple forum: AVSpeechSynthesisVoice ignores user-selected voices in iOS 26](https://developer.apple.com/forums/thread/804648),
[Safari 27 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes.md),
[iOS Safari Web Speech API bug (recognition hang after `<audio>`)](https://www.technetexperts.com/ios-safari-web-speech-api-bug-fix/).

## 6. Input and kid-proofing (`RT.Input`) — built for TAPPING (and dragging)
- **Tap is the primary gesture** (DESIGN §5.2: a tap sends the block up in a bubble). Nothing in `RT.Input` waits,
  debounces or swallows a quick tap: `down` and `up` fire synchronously in `pointerdown` / `pointerup`, there is no
  click delay (`touch-action: none` on the canvas, `manipulation` elsewhere), and two quick taps in a row each get their
  own down/up. Tap vs drag (< 24 px, < 0.35 s) is decided by `RT.World.pointerUp`, not here.
- `attach(canvas, {toLogical, down, move, up, cancel, hover?})` returns `detach()` with **`detach.cancel()`** and
  **`detach.isActive()`**. Every handler gets **numbers** `(x, y, ev)` in logical px.
- **Every** `pointermove` of the same finger fires `move` synchronously — no throttling or rAF batching (tested with
  120 moves), so a drag's spring-follow and velocity see each point (60 Hz, 120 Hz on ProMotion). Coalesced sub-frame
  points are not replayed (same world time → zero dt → velocity spikes); `ev.timeStamp` is passed along.
- Pointer capture on the canvas: a drag that crosses the HUD, the speech bubble or leaves the canvas keeps flowing;
  without capture the window listeners deliver the active finger's moves/ups exactly once (tested).
- One active pointer: a second finger never steals a MOVING drag; a swallowed `pointerup` recovers on the next primary
  touch. **Still drag (playtest P1-2):** when the active finger moved < 20 px for 1.5 s (`Input.STILL_PX` /
  `STILL_MS`, e.g. an iPad thumb resting on a block), a new touch, even a second finger, takes over: `cancel()` for the
  old drag (block goes home), then `down()` for the new finger; the old finger's later moves/ups are ignored (tested).
  The world also cancels a drag held still for 6 s and emits `stillDrag`.
- `pointercancel` (canvas or window) / `lostpointercapture` / window `blur` / page hide → `cancel()` **once** (the world
  sends the block home), later moves/ups of that finger are ignored. An `up` whose point cannot be mapped → `cancel()`.
  **main should call `detach.cancel()` on resize / rotation / pause** so a late `up` of the old finger can never arrive
  at a re-laid-out world.
- Targets `button, .screen, #hud, .no-game-input` are ignored on press; touch + mouse fallback; a throwing handler is caught.
- `kidProof()` blocks pinch, double-tap zoom, callout, selection, rubber-band / pull-to-refresh, context menu,
  zoom/refresh keys; the canvas has `touch-action: none` (a drag never scrolls the page).
- `holdButton(el, ms, onDone, onProgress)`: the parent gate (a quick tap does nothing).

## 7. Adding a language
`i18n.js`: `LANGS`, `NAMES[xx]`, `SOUNDS[xx]` + `CLUE_SHORT[xx]` (clue phrases), `NUM[xx]`, letters, `WORDS[xx]`,
`WORD_LIST[xx]`, `DOT[xx]`, `STAR[xx]`, `LAYER[xx]` (the block classifier), a complete `STR[xx]` (identical key set —
tested), `CHILD_FALLBACK[xx]`; `voice.js`: `LANG_TAG`, `PREFERRED`. Run the unit test.
