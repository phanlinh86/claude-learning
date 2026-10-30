---
name: build-education-game
description: Build a polished educational mobile game (iPhone/iPad web, GitHub Pages) for a child of a given age, in English or Vietnamese, with voice. Default input "random" rolls a game for ages 3–5.
---

# Build Education Game

Input: `random` (default), `random <age>`, `random <age> <hint>` (e.g. `random 5 space`, `random 3 count`), or a written
education-game requirement. Output: a touch-first browser game that plays on iPhone and iPad (portrait and landscape),
speaks to the child in **English or Vietnamese**, is committed under `projects/education-game/<slug>/`, merged to main,
served by GitHub Pages, and listed in `projects/education-game/EDUCATION_GAMES.md`.

This skill extends `build-game` (read `/build-game` once if it is available: same team, phases and pitfalls).
What changes: **mobile-first** instead of a Windows exe, **learning goals by age**, **voice in two languages**, and
**no losing**. You are the lead developer and integrator; agents design, build parts and test; you own the contract,
the integration and every fix. Phases: Explore → Plan → Build → Check → Deliver → Iterate.

## Random mode (default)
Ask no questions; it must run unattended (also from a scheduled task).
1. Today's date in the user's time zone with the current-time tool (not the shell clock). The date is the seed.
2. Read `projects/education-game/EDUCATION_GAMES.md` (create it if missing) to avoid repeats.
3. Roll: `python3 .claude/skills/build-education-game/roll.py "$DATE" $AGE $HINT`. If the mechanic or theme appeared in
   the last 14 days, re-roll that table with `--salt mechanic=r1` (`r2`, …).
4. Sanity-check: you may swap ONE element if the mix is incoherent (e.g. the helper doesn't fit the theme). Say which and why.
5. Map the age to 4 chapter topics (one per weather/time-of-day stage). Proven table (Dino Nest Sort):
   | age | chapters |
   |---|---|
   | 3 | colours (2 targets) · shapes (2) · big & small · animal homes (2) |
   | 4 | colours (3) · shapes (3) · counting 1–5 · animal homes (3) |
   | 5 | shapes with mixed colours (4) · counting 1–10 · capital letters · animal homes (4) |
   | 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
   | 7+ | adding within 20 · taking away within 10 · first letter · odd & even |
   Adapt the topics to the rolled mechanic (a tapping game asks "pop the RED balloon", a feeding game "feed 3 apples").
6. Write `projects/education-game/<slug>/REQUIREMENT.md`: name in both languages, pitch, learning goals per age,
   core loop, how a round ends, stars, voice lines, Talk-time question, parent settings, platform.
7. Announce in 2–3 lines (name, pitch, rolled ingredients), append a row to `EDUCATION_GAMES.md`, continue without waiting.

## Education rules (non-negotiable)
- **No fail state, no timer pressure.** Wrong answers bounce back gently with kind words; after 2 misses the right target
  glows (auto-hint). Stars only go up: 3 per round without mistakes, 2 with one, 1 otherwise.
- **Voice first, text second.** Every instruction is spoken; a speech bubble shows the same words. Tap the helper to repeat.
  Say the item's name on pick-up, count aloud, praise with the child's name, never negative words.
- Huge touch targets (items ≥ 100 logical px at short side 720, hit radius = 0.6 × size + 14, drop zones +30 px sides and
  +90 px upwards — kids drop high). One active finger; extra fingers are ignored.
- Every generated round must be completable (the generator self-checks); the first chapter at the default age is trivially easy.
- Short sessions: 4 chapters × 5 rounds (~5–8 minutes) then a celebration and "Play again" with new random content.
- **Parent gate:** settings (age 3–7+, language, child's name, sound, music, voice, microphone) open only after holding
  the gear for 2 s. Language may also be switched on the title screen.
- Original, gentle, kid-safe art and sound only. No ads, no network after load, no data leaves the device.

## Mobile translation of build-game (what to change)
| build-game (desktop) | education game (mobile) |
|---|---|
| fixed 960×540 letterbox | **short side = 720 logical px**, long side = clamp(720 × aspect, 960, 1600): portrait and landscape both fill the screen; letterbox only beyond the clamp |
| keyboard + mouse | Pointer Events with `touch-action:none`, pointer capture, one active pointer, `pointercancel` → cancel drag |
| Go + WebView2 exe | GitHub Pages only: `viewport-fit=cover`, `apple-mobile-web-app-capable`, `manifest.webmanifest`, 180/192/512 PNG icons (render the SVG icon with Playwright: `tools/render_icons.js`) |
| window edges | **safe areas**: read `env(safe-area-inset-*)` from a hidden probe element's padding, convert to logical px, pass to `World.setViewport(W, H, ins)`; HUD and bubble respect them |
| kid-proof Ctrl+R etc. | also block pinch (`gesturestart`), double-tap zoom, long-press callout/selection, rubber-band scroll (`touchmove` preventDefault except `.scroll`), `100dvh` stage |
| audio unlock on first click | iOS: resume AudioContext **and** play a silent buffer inside the first `touchend`/`click`; same gesture calls `speechSynthesis` once (Voice.unlock) |
| 1920×1080 backing cap | cap ≈ 3.2 MP on touch devices (iPad Pro / iPhone Pro), adaptive quality steps down when frames stay > 22 ms |
| custom pictures screen | dropped; customisation = child's name + age + language |
| blur → pause | `visibilitychange` → pause, suspend audio, stop speech |
DOM for text (bubble, menus, Talk time) so Vietnamese diacritics render crisply; canvas for the scene.
Fonts: `ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui` (iOS has ui-rounded built in).

## Voice and language (proven approach)
- `i18n.js`: `t(lang, key, params)` with arrays of variants, `name(lang, kind, value)` for every answer kind (colour, shape,
  animal, fruit, home, number 0–20, letter, sum, diff, parity, word), `words(lang, kind, value)` = accepted spoken forms
  (with and without diacritics, digits). Vietnamese: warm "bé ơi … nhé!", classifiers ("con vịt", "quả táo"), letter names
  as taught in Vietnamese kindergartens. Unit-test that every key exists in both languages.
- `voice.js`: Web Speech `speechSynthesis`, best local voice per language (vi-VN "Linh", en "Samantha"/Google), rate ≈ 0.9,
  pitch ≈ 1.15, queue ≤ 2 with interrupt for feedback, `voiceschanged` handling, Chrome 15 s pause workaround, a log of every
  line (tests read it even when muted). Listening: `SpeechRecognition || webkitSpeechRecognition` with fuzzy
  matching; optional, tap always works; hide the mic when unsupported or permission is denied.
- One **Talk time** question per chapter: show an item, ask (voice + text), 2–3 big picture/number choices + mic button.
- Duck the music while the helper speaks; disable speech when `speed > 1` (tests) — log only.

## Team (launch in parallel, in the background; each prompt points at `docs/DESIGN.md`, names its files, forbids others)
Write `docs/DESIGN.md` FIRST: layout rules for any aspect + insets, art style + exact palette (answer colours must be
distinct from the helper and the background), asset table (viewBox, anchors, frames with identical bodies), content rules per
topic/age, `World` API/fields/events, `Weather`, `Bot`, `I18N`/`Voice`/`Input` APIs, test hooks.
- **Character artist A** (helper frames: idle/blink/talk/happy/cheer/think/oops; answer items; containers in back/front halves
  so items sit *inside*; label sign; stars; full-bleed app icon) and **character artist B** (animals/fruit/home badges with a
  white sticker border). Each does web research for reference via a sub-agent (or WebSearch itself), writes 100 % original SVG
  from a generator script in `tools/`, renders Playwright contact sheets at in-game size and 3× on light/grass/dark, and does
  ≥ 2 improvement rounds.
- **Environment artist:** horizontally tileable bottom-anchored layers (far/mid/ground), sun/clouds/rainbow, particles,
  seam test + composed scenes at 1556×720, 960×720, 720×1556 in all 4 moods.
- **Mechanics engineer:** `rng.js`, `content.js` (pure round generator per topic/age), `world.js` (fixed steps ≤ 1/120 s,
  `_px/_py/_prot` + `alpha` for interpolation), `weather.js`, `bot.js`, node unit tests, `docs/MECHANICS.md`. Motion must be
  physical: spring-follow drag with pendulum tilt, ballistic arc into the next free slot with apex, landing squash + container
  spring, wrong-drop shake + arc home, staggered back-overshoot appear, idle bob/wiggle.
- **Voice & input engineer:** `i18n.js`, `voice.js`, `input.js` (kidProof, holdButton parent gate), tests, `docs/VOICE.md`
  with current iOS findings.
- You build `index.html`, `css/style.css`, `storage.js`, `assets.js`, `audio.js` (WebAudio synth, music per mood, rain
  ambience, ducking), `render.js`, `ui.js`, `main.js` against the contract while they work.

## Check (test team, report-only, in parallel)
- **Functional QA:** Playwright with `isMobile/hasTouch` contexts (iPhone 393×852 @3, landscape 852×393, iPad 820×1180 and
  1180×820 @2): boot, title, language switch, parent gate (short tap must NOT open), settings persistence (URL flags never
  saved), real touch drags (`page.touchscreen` / dispatched pointer events) for correct, wrong and miss, count mode, Talk time
  by tap, pause/resume, visibility pause, rotate mid-round (items stay inside, drag cancels cleanly), full bot sessions per age,
  zero console errors. `tests/e2e/functional.js` exits non-zero on failure.
- **Visual QA:** screenshots of every screen × 4 viewports × both languages, every topic/age, notch insets (emulate with CSS
  `--sa-*` overrides), contrast of answer colours on every mood, text fitting in Vietnamese, P1/P2/P3 list with exact values.
- **High-speed playtester:** headless sims of thousands of sessions per age × bot skill + child models (random tapper, slow
  3-year-old, "drops high", spammer); round duration, stuck rounds, hint frequency, stars distribution; exact CONFIG changes,
  re-simulated.
After each report: fix, re-run unit + smoke + functional until green, commit.

## Deliver
1. Branch `education-game/<slug>`, commit with the session's attribution lines, push. The user asked for main: open a PR
   and merge it with REST (`gh api repos/O/R/pulls --input pr.json`, `gh api -X PUT repos/O/R/pulls/N/merge`); GraphQL may be blocked.
2. Pages URL: `https://<owner>.github.io/<repo>/projects/education-game/<slug>/game/`. Verify it with WebFetch (allow a few
   minutes for the Pages build); browsers cache ~10 min.
3. Update `EDUCATION_GAMES.md` (date, name EN/VI, mechanic, theme, ages, folder, link), the project `README.md` and `CLAUDE.md`.
4. Hand over: link, "Add to Home Screen" tip (Safari → Share → Add to Home Screen), how to turn on a Vietnamese voice on iOS
   (Settings → Accessibility → Spoken Content → Voices → Vietnamese), what's unverified (real-device TTS/mic), and offer once to
   make it a daily scheduled task ("Run /build-education-game random 4 and deliver it").

## Pitfalls (learned)
- iOS speaks nothing unless the first utterance happens inside a user gesture; speech recognition needs Siri/Dictation
  enabled and may be missing in home-screen mode — always keep tap answers.
- Never speak on every event at high frequency: queue ≤ 2, drop stale lines, interrupt only for feedback.
- HUD/menu taps must not reach the canvas (filter `button, .screen, #hud, .no-game-input`).
- Rotation mid-drag: cancel the drag, re-layout, re-pack resting items into the new play rect.
- Items in a container must be drawn between the container's back and front halves, flying items in front until they drop in.
- Keep the background calmer and yellower than the answer colours; the helper must not share an answer colour.
