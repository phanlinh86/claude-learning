#!/bin/sh
# Config-override experiments for the playtest report (same seeds/matrix as x_base → paired comparison).
# Child models at ages 3–5, en+vi, 4 viewports, n 10 → 1 200 sessions per config.
cd "$(dirname "$0")/../.."
M="--drivers typical,careful4,toddler,slow3,unfocused --ages 3,4,5 --n 10 --seed0 90000"
run() { node tests/sim/pt_eval.js --name "$1" $M --config "$2" 2>/dev/null; }
run x_base '{}'
run x_nohint '{"hintAfterStreak":99,"idleHintFrom":99,"sameTapHint":99}'
run x_glow6 '{"hintGlowTime":6}'
run x_glow6s2 '{"hintGlowTime":6,"hintAfterStreak":2}'
run x_adapt30 '{"adaptSlowPlay":30}'
run x_p5 '{"pairsByAge":{"3":[2,2,2,3],"4":[2,2,3,3],"5":[2,3,3,4],"6":[3,3,4,5],"7":[3,4,4,5]}}'
# larger-n confirmation of the P1 hint bundle (paired seeds)
M2="--drivers typical,careful4,toddler --ages 3,4,5 --n 24 --seed0 120000"
node tests/sim/pt_eval.js --name y_base $M2 --config '{}' 2>/dev/null
node tests/sim/pt_eval.js --name y_hint $M2 --config '{"hintGlowTime":6,"hintAfterStreak":2}' 2>/dev/null
