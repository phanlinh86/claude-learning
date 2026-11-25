# Functional QA report — Tumi's Flower Farm (2026-11-25)

Tester: functional QA (report-only, nothing under `game/` edited). Chromium via Playwright with real CDP touch, iPhone
393×852@3 / 852×393, iPad 820×1180 / 1180×820.

## Results
| Suite | Result |
|---|---|
| `node tests/e2e/functional.js` | 115/120 on the first run. The 5 failures were stale **test** asserts. After fixing them: `boot` + `lang` 29/29, all other groups passed on the first run, so **120/120** |
| `node tests/e2e/qa_functional.js` | **169/169** (1 INFO, see P3-1) |
| `node tests/unit/i18n_voice.test.js` | 19400/19401 on the first run (a stale case-sensitive assert). After the fix: **19401/19401** |
| `node tests/unit/run.js` | 42/42 |
| Extra probe: full bot sessions EN age 3 + 4, VI age 4 + 6 (iPhone P / iPad L) | all 4 reach `done`, 16 rounds, 16 rosettes; `FT.Assets.missing` = `[]`; 0 console errors / warnings / HTTP ≥ 400 |
| Voice log scan (117–136 lines per session) | 0 lines with `cookie / icing / Mochi / Mô Chi / bánh / chips / flour / mouse / { } / undefined / NaN / raw key`; every line is in the session language |
| DOM text scan (title, HUD, bubble, done screen, settings EN + VI) | no raw `ui.xxx` keys, no bakery words |
| "Tu Mi" | a stubbed `speechSynthesis` got `"Chào bé! Mình là rùa Tu Mi. Mình cùng trồng hoa nhé!"` (vi-VN) and `"Hi! I am Tumi. Let’s grow flowers!"` (en-US). All 10 VI strings that contain "Tumi" come out of `I18N.speech('vi')` with "Tu Mi" and no "Tumi" left |
| i18n | en and vi have the same set of keys; every `data-i18n` key in `index.html` and every `T('…')` key in main/ui exists |
| Re-theme leftovers | all 13 particle sprites, 16 env files and 16 characters load. Removed sprites (flour, steam, crumb, sprinkle_*, mochi_*, bird, sack, mouse) are not used anywhere. `'flour'` / `'crumb'` are only internal weather particle kinds or aliases (`flour` becomes `straw`) and draw existing sprites. Every `Audio.play()` name has a matching `case` |

## Tests fixed (stale after the re-theme)
- `tests/e2e/functional.js:79`: `/Mochi/.test(document.title)` changed to `/Tumi/`
- `tests/e2e/functional.js:106`: `/Bakery/.test(logo2)` changed to `/Flower Farm/`
- `tests/unit/i18n_voice.test.js:1106`: `/con chó/` changed to `/con chó/i`. The VI line `{sound} {animal} ở đâu nhỉ?` correctly
  capitalises the word after "Gâu gâu!", so it reads "Con chó".

## Findings
### P1: none
### P2: none
### P3
1. **A second finger on ⏸ during a trace does not pause the game** (qa_functional `pausetrace` INFO).
   - Repro: one finger traces, a second finger taps the pause button. Mode stays `play`.
   - Cause: Chromium never sends `click` for a touch that is not the primary one. This may be a Chromium-only effect and has not been checked on iOS.
   - Fix (optional): in `game/js/input.js` / `ui.js`, have the HUD buttons also react to `touchend`/`pointerup` on a non-primary touch. Or just test it on a real iPad.
2. **Stale bakery wording in test labels and comments only** (no effect on behaviour):
   - `functional.js:329` "tap on Mochi", `:376` "music + kitchen hum", `:406` "sack tap → mouseTap"
   - `qa_functional.js` "icing" / "cookie" / "Mochi" labels
   - `qa_functional.js:652` EN-word regex still lists `cookie|Yummy`
   - `render.js:449` comment "the mouse rises out of the flour"
   - Fix: rename the labels to garden / Tumi / chick / hay when convenient.
3. **VI title logo reads as one line in plain text**: "Rùa Tumi Nông Trại Hoa" (logo1 + logo2). This is fine visually because there are two
   spans, but screen readers read it without a pause. Optional: add `aria-label` "Nông Trại Hoa Của Rùa Tumi" on `h1.logo`
   (`game/index.html:50`).
