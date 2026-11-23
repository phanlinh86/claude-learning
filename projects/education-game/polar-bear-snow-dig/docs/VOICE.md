# Nuka's Snow Dig — Voice, language and input

Files: `game/js/i18n.js` (`NK.I18N`), `game/js/voice.js` (`NK.Voice`), `game/js/input.js` (`NK.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 21 000 checks, self-contained): every key in both languages with identical
key sets **and identical `{params}`**, every `ui.*` key that `index.html` / `ui.js` / `main.js` use, 3 wordings per
instruction (prompts, `enter`, `rub`, `fly`, `slide`, surprises, found lines …), Vietnamese lines carry diacritics, every
prompt × colour / shape / size × kind × animal / n 1–12 (EN "fish" is its own plural), every name kind × value (DESIGN §6),
the DESIGN §5.1 initials, `thingPhrase` for every thing kind, no `màu màu`, no unfilled `{param}`, no "a orange" / "a owl",
a negative-word ban, an **old-theme ban** (no egg / stone / bone / dino / valley / sand / shovel / mound / Bun / hatch /
mole / ptero, no trứng / khủng long / xương / cát / thung lũng / xẻng / hòn đá / tấm đá / chuột chũi / đom đóm — in any
line, and no Bun / dino / egg / hatch in the three source files), `sayHatch` is gone, `words()` matched back by the
matcher, exact `sayFound / sayWrong / sayCountDone` lines plus a sweep of every thing × topic, every Talk choice kind,
garbage events, speech text (vi "Nuka" → "Nu Ca"), the input layer (fake DOM, every move forwarded), parent hold gate,
voice queue / interrupt / unlock / volume with a fake `speechSynthesis`, recognizer.
The test also loads the real `content.js` and renders every `promptKey` / Talk key + params, the found line of every
target drift and the wrong line of every other drift that `makeRound` / `makeTalk` produce for ages 3–7 in EN + VI.
The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from the sister games; the wording is new.

## 0. Wording principles (Nuka)
- **Nuka** is a chubby, cheerful polar bear cub in a brown knitted scarf. EN "Nuka"; VI lines "Nuka", titles **"Gấu
  Nuka"** ("Mình là gấu Nuka"). Title "Nuka’s Snow Dig" / "Gấu Nuka Đào Tuyết"; logo lines "Nuka’s" / "Snow Dig",
  "Gấu Nuka" / "Đào Tuyết".
- **TTS of "Nuka" — decision: Vietnamese speech says "Nu Ca"; English keeps "Nuka".** English voices read /ˈnuːkə/
  well. For vi-VN voices (Linh, Google Tiếng Việt, HoaiMy) "Nuka" is a foreign Latin word: "ka" is not a Vietnamese
  spelling (k only stands before i / e / ê / y), so the voice may clip it, stress it oddly or spell it — the same
  problem the paint game had with "Nini" (fixed as "Ni Ni"). "Nu Ca" is two ordinary level-tone syllables (nu + ca) that
  every Vietnamese voice reads smoothly as "nu-ca", which is how the name should sound. **Space, not hyphen** ("Nu-ca"):
  a hyphen makes some voices pause oddly or say "gạch ngang". Only the whole word is rewritten (`Nukaa` stays);
  the screen always shows "Nuka". Implemented in `speech('vi')` (`RE_NUKA`), so every `Voice.say` gets it (tested on
  every vi line that names Nuka).
- **Dig vocabulary**: rub / swish / dig up / Hooray! — vi **xoa / xoa xoa / đào / đào … lên / Hoan hô!**. Snow drift =
  **"đống tuyết"**. Rubbing is the new core gesture, so instructions teach it ("Rub a snow drift!", "Bé xoa đống tuyết
  nhé!"), but a tap still digs, so no line ever says a tap is not enough.
- **Things with classifiers** (DESIGN §6): hat **"cái mũ len"**, gem **"viên đá băng"** (+ shape: "viên đá băng hình
  tam giác", "viên đá băng hình ngôi sao"), fish **"con cá"**, toys "con cáo / con thỏ / con tuần lộc / con hải mã /
  con cá voi / con chó / con ngỗng / con cú", the toy itself "thú bông" (plush), tablet **"khối băng"** (named by its
  text: "chữ B", "số năm"), seal pup **"hải cẩu con"**, tern **"chim nhạn biển"**. Shape names keep "hình" for star /
  heart so "viên đá băng hình …" always reads as a shape gem; the matcher still accepts bare "ngôi sao", "sao",
  "trái tim", "tim".
- **EN "fish"**: singular and plural are both "fish" ("Dig up 3 fish!", "Three fish! Hooray!", "How many fish?"); the
  derived param is `{fish}` (plural-aware table `FISH`, so another noun could be dropped in).
- **Colours**: `name('vi','color','red')` = **"màu đỏ"**; VI lines put `{color}` right after the noun ("cái mũ len
  {color}" → "cái mũ len màu đỏ") and **never write "màu {color}"** (tested). The bare form (`hue`, `{bare:true}`) is
  "đỏ" — used in the found line "Cái mũ len đỏ — ấm quá!".
- **Never negative**: a wrong dig names what was dug, then the goal ("That’s a blue hat. Let’s find the red one!" / "Đây
  là cái mũ len màu xanh dương. Mình tìm cái mũ len màu đỏ nhé!"). Maths never gives the answer away. `already`, `busy`,
  `sandTap`, `soft`, rubbing empty snow are not mistakes. Tested word ban: no / not / wrong / bad / fail / mistake / oops
  / fall / sorry … and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ / ngã / không phải / nhầm (seasons
  say "autumn", never "fall").
- **Vietnamese for a 4-year-old**: every prompt has a "Bé ơi, … nhé!" wording; "nào!", "nè", "nhỉ?", "giỏi quá!".
- **Initials (age 6–7, DESIGN §5.1)**: EN fox F, hare H, reindeer R, walrus W, whale W, dog D, goose G, owl O; VI words
  without classifier cáo C, thỏ T, tuần lộc T, hải mã H, cá voi C, chó C, ngỗng N, cú C (never a tone mark). Several
  share a letter, so content.js keeps the initials in one round distinct per language.

## 1. API (`NK.I18N`) — for main.js
All helpers never throw and never return '' or a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (a random variant). Raw params are named: `{color:'red'}`, `{shape:'star'}`, `{animal:'fox'}`, `{kind:'fish'}`, `{n:3}`; objects `{kind,value}` / `{nameKind,nameValue}` are named / phrased |
| `ask(lang, promptKey, params, {next?, rng?})` | the step prompt; `next:true` → "Next one! Find the red hat!" (`p.next` + prompt) for the 2nd step |
| `sayFound(lang, {thing, topic, params, count?}, rng?)` | `found` → hat "A red hat — so cosy!" / "Cái mũ len đỏ — ấm quá!"; gem "The star gem!" (shapes5: "The blue star!"); toy "The fox! Hello!"; fish "A fish! Hooray!", size "The big fish! Hooray!"; tablet "Letter B! Super!", "Small b!", "Five! Super!"; topic `initial` "F is for fox!" / "Chữ N, ngỗng!"; `oddeven` "Seven is odd!"; `add`/`sub` with `params {a,b}` "Five! 2 + 3 is five!"; **count** (`count {i,n}`) → just "Three!". Also accepts a bare thing |
| `sayWrong(lang, {thing, got, want, topic, params}, rng?)` | `wrong` → "That’s a blue hat. Let’s find the red one!", "That’s a circle. Let’s find the triangle!", shapes5 "That’s a red star. Let’s find the blue star!", "That’s the small fish. Let’s find the big one!", "That’s an owl. Let’s find the fox!", "That’s letter D. Let’s find letter B!"; maths "That’s number six. Let’s count again!"; parity "Four is even! Let’s look for another one!"; initial "Goose starts with G! Let’s look again!" |
| `sayCount(lang, i)` | "Zero!" … "Twenty!" (= `count.<i>`; beyond 20 the digits) |
| `sayCountDone(lang, n, rng?)` | "Three fish! Hooray!" / "Ba con cá! Hoan hô!" (at `stepDone` of a count step) |
| `talkWrong(lang, choice)` / `talkWrong(lang, kind, value)` | missed Talk answer: "It is blue! Good try!", "It is an oval! Good try!", "It is the walrus! Good try!", "It is the big one! Good try!", "Là số bảy đó! Bé cố gắng lắm!" |
| `choiceWords(lang, choice)` | spoken forms for a Talk choice `{id, thing:{kind…}, value}` (hat/blob → colour, gem → shape, toy → animal, number/dots → number, letter, size, fish → "fish"/"cá") — pass as `Voice.listen({choices:[{id, words}]})` |
| `name(lang, kind, value, opts?)` | kinds `color, hue, shape, size, animal ({size}), word, thing, number, dots, letter, text, sum, diff, parity` |
| `words(lang, kind, value)` | accepted spoken forms (lower-case, + no-diacritic forms, digits and "số năm" for numbers) |
| `thingPhrase(lang, thing, {art, color, size, bare, noGem})` | "a red hat", "the star gem", "the big fish", "the fox", "an owl" / "cái mũ len màu đỏ", "viên đá băng hình ngôi sao", "con cá to", "con cáo". `noGem` (EN: "the blue star" without "gem"); the old `noStone` is still accepted |
| `phrase(lang, {nameKind, nameValue, kind?})` | "the circle", "the small fish", "letter D", "small b", "number five", "2 + 3" · vi "hình tròn", "con cá nhỏ", "chữ D", "chữ b thường", "số năm" |
| `speech(lang, text)` | TTS text (Voice.say calls it): letter names ("letter D" → "letter dee", "O is for" → "oh is for", "starts with W" → "double you", "Big B / small b"), + − =, " — " → ", ", "…" → ".", vi "chữ B" → "chữ bờ", **vi "Nuka" → "Nu Ca"**; EN "Nuka" unchanged |
| `initialOf(lang, animal)` | `{word, first}` ("ngỗng", "N") |
| `setChild(name)`, `has`, `keys`, `raw`, `kindValue(choice)` | `{child}` default for every `t()`; key checks; a choice → `[kind, value]` |
| constants | `langs, TOPICS, ANIMALS, THING_KINDS (hat, gem, fish, toy, tablet), NAME_KINDS, PROMPTS, PARAMS (required params per key), NAME_TABLE, LETTER_VI, WORD_LIST, MAX_COUNT (20)` |

**Removed**: `sayHatch` and the `hatch` key (no hatch in this game; main.js's `line('sayHatch', e)` already returns ''
when the helper is missing and `speak('')` is a no-op, and the world no longer emits `hatch` — delete that case when
convenient). `ui.tapBun` → **`ui.tapNuka`** (nothing in index.html / ui.js / main.js used it).

### 1.1 Event fields the helpers read (main passes the world event, plus what it knows)
- **`found {id, thing, count?}`** — pass `{...e, topic: world.topic, params: step.params}` (the step that was answered).
  `thing` is the drift's thing (`{kind, color?, shape?, animal?, text?, size?, nameKind, nameValue}`). The `params`
  matter for shapes5 (colour in the name) and add/sub ("2 + 3 is five!").
- **`wrong {id, kind:'thing', got, want, streak}`** — pass `{...e, thing: mound.thing, topic: world.topic, params:
  step.params}`. Without `thing` the line falls back to bare names ("That’s blue. Let’s find red!").

### 1.2 World event → line (DESIGN §5.2) — what main.js should do
**Speech policy** (skill rule, proven in the playtests): *feedback interrupts* unless the prompt is still protected (the
guard in `speakPrompt` lasts until the prompt has actually been spoken); *round-done praise and hints queue*; *count words
queue* (no interrupt — a fast child must hear the newest number, the queue keeps ≤ 2 waiting); *skip a new praise if one
started < 1.2 s ago*. Speech is disabled for `speed > 1` (log only). **Rubbing makes many events per second — none of
`rub`, `dig {again}`, `scoop`, `fling`, `slidePuff` may speak more than the rules below say.**

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n:level+1}) + '. ' + t('topic.'+topic)` (banner + voice), then `t('weather.'+weather)` — 0 spring "Spring! The snow is melting!", 1 summer "Summer — the sun stays up all night!", 2 autumn "Autumn colours!", 3 winter "Winter night — look, the northern lights!" | interrupt (new chapter), weather queued |
| `round {round, surprise}` | `t('enter')` "New snow drifts!" — shown in the bubble; spoken only when no prompt follows within ~1 s | queue; dropped when the `ask` comes |
| `ask {promptKey, params, mode, step, first}` | `ask(lang, promptKey, params, {next: !first})` — bubble + voice; remember it for `pokeBun` / `idle` | **protected prompt**: `speakPrompt` with `{priority: true}`; the guard lasts until it has actually been spoken |
| `rubDemo {id, x, y}` (first round of the first chapter, the hint hand rubs once) | `t('rub')` "Rub the snow! Swish, swish!" / "Bé xoa xoa tuyết nào!" — **queued after the prompt**, never over it | queue (after the protected prompt) |
| `rub {id, x, y, dir, result}` (one per stroke) | — (snow flung towards `dir` + "shff" sound only) | never spoken |
| `dig {id, again, rub, assist}` | optional: the **first** dig of the session that was a TAP (`!rub && !again`) may queue `t('rub')` once, to teach rubbing (never more than once per session, never while the prompt is protected) | queue, low priority |
| `scoop {id, i, n}` | `t('scoop')` **only** on the first scoop of the first dig of a chapter, never while the prompt is protected | queue, low priority (drop if anything waits) |
| `puff`, `fling`, `sandLand`, `sandTap`, `soft`, `busy` | — (sound / snow puffs only; `t('busy')` exists for the bubble if wanted) | |
| `reveal {id, thing}` | — (the "pop" sound; the line comes with `found` / `wrong`) | |
| `found {id, thing, count?}` | `sayFound(lang, {...e, topic, params})`; count steps → "One!", "Two!" … | interrupt (feedback); **count words queue** (no interrupt) |
| `twirl {id, thing}` (a right hat spins) | — (the found line "A red hat — so cosy!" already covers it; "twinkle" sound) | |
| `hop {id, float, slot}` (the find floats up to the aurora) | `t('fly')` "Up to the northern lights!" — **rarely**: only for the first find of a chapter and only if nothing is speaking or waiting | queue, low priority (drop if busy) |
| `shelved {id, slot}` | — (ribbon "chime") | |
| `stepDone {step}` | count step: `sayCountDone(lang, step.need)` "Three fish! Hooray!"; otherwise nothing | queue |
| `wrong {…}` | `sayWrong(lang, {...e, thing, topic, params})`; after the 2nd miss the hint follows | interrupt unless the prompt is protected (then queue) |
| `already {id}` | `t('already')` (not a mistake) | queue, skip if the same line < 3 s ago |
| `pokeBun` (tap on Nuka) | repeat the current prompt (> 3 s after it was asked and not still waiting to be spoken) | interrupt |
| `hint {id}` | `t('hint')` | **queue** |
| `assist` | `t('hint')` (variant "Nuka will help! This one!") | queue |
| `idle {n}` | `t('idle') + ' ' + currentPromptText` | queue |
| `seal` / `sealTap` | `t('surprise.seal')` "Look! A little seal!" / `t('seal.tap')` | queue / interrupt (tap feedback), never over a protected prompt |
| `tern` / `ternTap` | `t('surprise.tern')` "Look up! A little tern!" / `t('tern.tap')` | same |
| `roundDone {round, stars, misses}` | `t('great')` (0 misses) or `t('praise')` | **queue** (never cut the last count word); skip if a praise started < 1.2 s ago |
| `slide {dist}` (belly-slide in `cheer`) | `t('slide')` "Wheee! Belly slide!" / "Trượt bụng nè, vui quá!" — only when the round-done praise has finished (or ~1 in 2 rounds), never stacked | queue, low priority (drop if anything waits) |
| `slidePuff` | — (snow puff + swoosh) | |
| `shelfLeave` (chapter end, finds rise and fade) | — | |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))` | interrupt; protected like a prompt |
| `talkAsk {n}` | repeat the Talk question | interrupt |
| `talkResult {right, id}` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice)` | interrupt |
| `levelDone` | `t('great')` | queue |
| `sessionDone {stars}` | `t('party')` "Look at our northern lights!", then `t('session.done', {stars})` | interrupt, then queue |

### 1.3 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice ("Nuka’s voice" / "Giọng của
  Nuka"), mic, done, stars, chapter {n}, allDone {stars}, welcome ({child}: "Hi Mai! I am Nuka. Let’s dig in the snow!" /
  "Chào bé Mai! Mình là gấu Nuka. Mình cùng đào tuyết nhé!"), micUnsupported, micDenied, voiceMissing, tapOrSay,
  listening ("Nuka is listening…"), tapNuka, tapHint ("Rub a snow drift to dig" / "Bé xoa đống tuyết để đào nhé"),
  skip, gallery ("Our treasures"), langName.en, langName.vi`.
- **topic.\*** (one banner each): colors "Colourful Hats" / "Mũ len sắc màu", shapes "Shape Gems" / "Đá băng hình
  khối", size "Big and Small" / "To và nhỏ", count "Counting Fish" / "Đếm con cá", animals "Toy Animals" / "Thú bông",
  letters "Ice Letters" / "Khối băng chữ cái", lower, initial, add, sub, oddeven.
- **weather.0..3** (spring, summer, autumn, winter): "Spring! The snow is melting!" / "Mùa xuân rồi! Tuyết đang tan kìa!",
  "Summer — the sun stays up all night!" / "Mùa hè — mặt trời thức suốt đêm luôn!", "Autumn colours!" / "Mùa thu nhiều
  màu quá!", "Winter night — look, the northern lights!" / "Đêm mùa đông — nhìn kìa, ánh sáng bắc cực!".
- **Prompts** (3 wordings; required params → else the fallback): `p.colors {color}` "Find the {color} hat!" / "Bé ơi, tìm
  cái mũ len {color} nhé!", `p.shapes {shape}` "Dig up the {shape}!", `p.shapes5 {shape, color}` (→ `p.shapes`), `p.size
  {size, kind}` (kind = fish / hat / gem / toy; toy + `{animal}` names the animal; → `p.sizeAny {size}` "Find the big
  one!"), `p.animals {animal}` "Where is the {animal}?", `p.count {n}` "Dig up {n} fish!" / "Bé ơi, đào {n} con cá
  nhé!" (`{fish}`), `p.letters {letter}`, `p.lower {letter}` (capital shown, `{lower}` derived), `p.initial {letter}`,
  `p.add {a, b}`, `p.sub {a, b}`, `p.oddeven {parity}`; `p.any`; `p.next` ("Next one!" / "Tiếp nào!").
- **Lines**: `scoop`, **`rub`**, **`fly`**, **`slide`**, `found.{hat, gem, fish, toy} {thing}`, `found.label {label}`,
  `found.parity {num, parity}`, `found.initial {letter, word}`, `found.sum {expr, ans}`, `found.any`, `countDone {n}`
  (`{num} {fish}`), `wrong.thing {got, want}`, `wrong.math {got}`, `wrong.parity {num, parity}`, `wrong.initial {word,
  first}`, `wrong.any`, `already`, `busy`, `stepDone`, `enter`, `surprise.seal`, `seal.tap`, `surprise.tern`,
  `tern.tap`, `hint`, `idle`, `praise`, `great {child}`, `party`, `session.done {stars}`, `count.0..20`.
- **Talk** (content.js `makeTalk` → `promptKey 'talk.<topic>'`): `talk.intro, talk.right`; `talk.colors` "What colour is
  this hat?" (a hat is shown; ignores `{color}`), `talk.colorsWhich {color}` "Which hat is red?"; `talk.shapes {shape}`
  "Which one is the triangle?" (→ `talk.shapesAny` "What shape is this gem?"); `talk.size {size, kind}` "Which fish is
  small?" (→ `talk.sizeOne` → `talk.sizeAny`); `talk.count` "How many fish?" / "Có mấy con cá nào?" (never says n; →
  `talk.countAny`); `talk.animals {animal}` "Where is the fox?" (→ `talk.animalsAny` "Who is this?"); `talk.letters
  {letter}` (→ `lettersAny`), `talk.lower {letter}`, `talk.initial {word|animal}` (→ `initialAny`), `talk.add / talk.sub
  {a, b}` (→ `talk.calc`), `talk.oddeven {parity}` (→ `oddevenAny`); `talk.wrong(.a, .animal, .size, .letter, .small,
  .number, .any)`.

### 1.4 Names (DESIGN §6)
| kind | EN | VI |
|---|---|---|
| color / hue | red blue yellow green orange purple pink | màu đỏ, màu xanh dương, màu vàng, màu xanh lá, màu cam, màu tím, màu hồng / bare: đỏ, xanh dương … |
| shape | circle, square, triangle, star, heart, rectangle (rect), diamond, oval | hình tròn, hình vuông, hình tam giác, hình ngôi sao, hình trái tim, hình chữ nhật, hình thoi, hình bầu dục |
| animal | fox, hare, reindeer, walrus, whale, dog, goose, owl (+size "big fox") | con cáo, con thỏ, con tuần lộc, con hải mã, con cá voi, con chó, con ngỗng, con cú (+size "con cáo to") |
| word (initial) | as animal: F H R W W D G O | cáo C, thỏ T, tuần lộc T, hải mã H, cá voi C, chó C, ngỗng N, cú C |
| thing | hat, gem, fish, toy, ice block | cái mũ len, viên đá băng, con cá, thú bông, khối băng |
| size | big, small | to, nhỏ |
Spoken extras (`words`): "bunny"/"rabbit" (hare), "deer"/"rain deer", "geese", "husky", "doggy", "hoot", "snowy owl",
"arctic fox" … / "cún", "con nai"/"nai" (reindeer), "con moóc"/"moóc" (walrus), "cú mèo", "thỏ trắng", "cáo tuyết";
things "beanie", "mũ", "nón len", "đá băng", "cá". "xanh" alone is ambiguous (no match), "con" alone matches nothing.
Vietnamese letter names use kindergarten phonics: b → bờ, c → cờ, k → ca, q → quờ, y → i dài … (`LETTER_VI`).

## 2. Voice (`NK.Voice`) — unchanged proven engine
`init({lang, enabled})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`say(text, {interrupt, priority, rate, pitch, lang}) → Promise<{spoken, reason}>`, `sayKey(key, params, opts)` (promise
`.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`, `voiceName(lang)`, `onStart(display)` / `onEnd`,
`onVoicesChanged(fn)`, `log` (+ `NK.debug.voiceLog`, also when muted), `spoken(lang, text)`, `RATE` 0.9 / `PITCH` 1.2,
`canListen()`, `listen({lang, choices:[{id, words}|{id, kind, value}], timeoutMs}) → Promise<{id|null, transcript, reason?}>`,
`stopListening()`, `isListening()`, `onListen(bool)`, `match(transcripts, choices, lang)`, `matchDetail(...)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium +12; novelty voices (Fred, Albert, Zarvox …) −60. Lists are read
  at init, on `voiceschanged` and polled for 6 s (iOS fills late).
- Nuka: **rate 0.9, pitch 1.2** (a small bright bear cub; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears Vietnamese tones).
- Volume: `setVolume(v)` → every utterance's `u.volume` (follows the game's volume setting; skill "Loud, clear sound"
  rule). TTS loudness itself is the phone's media volume.
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped, non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50–90 ms; watchdog for missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s,
  Chrome cuts utterances at ~15 s); page hidden → stop. Before `unlock()` only the newest line is kept.

## 3. iOS / Safari findings (re-checked 7–8 Nov 2026)
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+, still WebKit-only; W3C Audio Session draft) — `Audio.unlock()`
  (lead) sets it. While the mic listens `voice.js` switches to `'play-and-record'` and restores the previous type afterwards
  (otherwise speech goes to the earpiece / gets quiet).
- **First utterance inside a gesture**: iOS speaks nothing until a `speak()` happens inside a user gesture. `unlock()` in the
  first `pointerup`/`touchend`/`click` speaks a silent `' '`; a line refused with `not-allowed` is kept and spoken on the next
  `unlock()`; lines queued before the first tap are re-timestamped (not "stale").
- **Vietnamese voice "Linh"**: built into iOS/iPadOS (vi-VN), so `getVoices()` lists it even when nothing was downloaded;
  `voice.js` sets `utterance.voice` by name. If a parent wants a better one: **Settings › Accessibility › Spoken Content ›
  Voices › Vietnamese** (download Linh Enhanced if offered). Note the iOS 26 regression: the voice chosen in Spoken Content
  is ignored by web speech and downloaded Enhanced voices are often missing from `getVoices()` — so we never rely on the
  default voice. `hasVoice('vi') === false` (no vi voice at all, e.g. some Android / desktop browsers) → show `ui.voiceMissing`.
- **Speech recognition** (`webkitSpeechRecognition`) works in Safari tabs only when **Siri & Dictation** are enabled (it
  usually needs a network) and is **missing in Home-Screen (standalone) mode** → `canListen()` false there; `not-allowed`
  turns it off for the session. Vietnamese recognition (`vi-VN`) works but returns words often without diacritics or with the
  wrong tone ("mầu đổ") — the matcher compares stripped forms too. Apple's on-device SpeechAnalyzer (iOS 26) is native-only.
  The mic is optional: **tap answers always work**; main hides the mic when `!canListen()`.
- Reported WebKit hang: `start()` after an `<audio>` element played may never fire events → we never use `<audio>`, create a
  fresh recognizer per `listen()`, and a 7 s timeout always resolves.
- After backgrounding, the synthesizer can stay paused: on `visibilitychange` back we `cancel()` + `resume()`.
- iPadOS reports a desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`. No regex look-behind in these files (iOS < 16.4).
Sources: MDN `AudioSession.type`; W3C Audio Session WD; Apple Developer Forums thread 804648 ("AVSpeechSynthesisVoice ignores
user-selected voices in iOS 26"); WebKit "Safari 26" release notes; Apple support "Hear iPhone speak the screen" (Spoken Content).

## 4. Input (`NK.Input`) — one finger: TAP and RUB
```js
const detach = NK.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px
  down:   (x, y, ev) => world.pointerDown(x, y),
  move:   (x, y, ev) => world.pointerMove(x, y),  // EVERY move of the active finger, unthrottled: the RUB is measured here
  up:     (x, y, ev) => world.pointerUp(x, y),   // the world judges the tap AT RELEASE; a press that rubbed is never a tap
  cancel: ()         => world.cancelDrag(),
  hover:  (x, y)     => {}                       // optional, mouse without a button
});
detach.cancel();    // main: on resize / rotation / pause → one cancel(), the rest of that finger is dropped
detach.isActive();  // a finger (or mouse button) is down
detach();           // remove all listeners
```
**Callbacks receive two NUMBERS `(x, y)` in logical px, then the raw event — never a point object.** Non-finite points are
dropped; an `up` without a mappable point becomes `cancel()`.
- **One active pointer.** `down` fires synchronously inside `pointerdown` (canvas `touch-action: none`, `preventDefault`,
  **pointer capture**), every `pointermove` of that finger reaches `move`, `up` arrives exactly once — also when lifted
  outside the canvas / over the HUD (capture + window fallback, no double delivery). Quick taps in a row each give down + up
  (a child hammering a drift to dig faster gets every scoop).
- **Rub (checked for this game, no change needed)**: `pointermove` of the active pointer is forwarded synchronously,
  in order and **unthrottled** (no rAF batching, no distance filter — tested: 120 moves → 120 `move()` calls), with
  pointer capture so a rub that strays over the HUD / bubble keeps reporting. main.js wires `move → world.pointerMove`
  (only in `play` mode and not for the bot, which dispatches its own moves). iOS delivers touch `pointermove` at the
  display rate (60 / 120 Hz, coalesced), i.e. every ~8–25 px during a fast rub — fine for `rubStroke` ≈ 70 px and
  `rubMinSeg` ≈ 26 px reversals, so `getCoalescedEvents()` is not used (it would only multiply calls).
- **Extra fingers are ignored** (a resting second hand never digs by accident). Recovery when the active finger is known
  to be gone (iOS swallowed its `pointerup`): a new `isPrimary` touch, a mouse press replacing a touch, the touch-fallback's
  active touch missing from `e.touches`, or silence ≥ `Input.STALE_MS` (6 s) → `cancel()` for the old, `down()` for the new.
- `pointercancel` (canvas or window), `lostpointercapture` while down, window `blur`, page hidden → `cancel()` once.
- Targets `button, .screen, #hud, .no-game-input` (`Input.IGNORE`) are skipped on press. Touch + mouse fallback when
  `PointerEvent` is missing. A throwing handler is caught and logged.
- `kidProof()` (idempotent): blocks pinch (`gesturestart`), double-tap zoom, long-press callout / selection / image drag,
  rubber-band & pull-to-refresh, context menu, Ctrl/⌘ zoom and refresh keys.
- `holdButton(el, ms = Input.HOLD_MS (2000), onDone, onProgress(p 0..1))` → `off()`: the parent gate; a quick tap or
  sliding off does nothing.

## 5. Adding a language / a thing
- New animal / thing kind: `ANIMALS` / `THING_KINDS`, `NAMES.*.animal|word|thing`, `WORDS.*`, `WORD_LIST`, a `found.<kind>` key, the `sayFound` / `kvRaw` branch, and run the test.
- New language: `LANGS`, `NAMES[xx]` (all kinds), `FISH`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, `WORD_LIST[xx]`, a
  complete `STR[xx]` (identical key set and params — tested), `CHILD_FALLBACK[xx]`, `thingPhrase` word order, the helper-name TTS fix in `speech()`;
  `voice.js`: `LANG_TAG`, `PREFERRED`.
