#!/usr/bin/env bash
# Runs the tuning variants with a reduced player set (faster), then the full recommended package.
# usage: bash tests/sim/sweep.sh
cd "$(dirname "$0")/../.."
P=bot:0.4,bot:0.6,bot:1,kid:young,kid,adult,spam:3,spam:5,spam:8,hugger
for v in base180 pps20 cd32 cd45 basket4 basket3 ceil40 ceil0soft easyFloat lives3easy combo4s; do
  node tests/sim/run.js --variant $v --rounds 90 --cap 180 --players $P > tests/sim/results/$v.txt 2>&1
  echo "$v done"
done
