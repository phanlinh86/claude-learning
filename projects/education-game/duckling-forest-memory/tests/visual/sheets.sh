#!/bin/sh
# Review montages for Dee's Forest Memory from tests/out/visual (needs ImageMagick).   sh tests/visual/sheets.sh
cd "$(dirname "$0")/../out/visual" || exit 1
mkdir -p sheets
for dev in iphoneP iphoneL ipadP ipadL; do for l in en vi; do
  montage screens/$dev-$l-*.png -tile 5x -geometry 520x520+4+4 -label '%t' -background '#222' -fill white -quality 85 "sheets/screens_${dev}_$l.jpg"; done; done
for dev in iphoneP iphoneL ipadP ipadL; do
  montage topics/$dev-en-a*.png -tile 4x -geometry 520x520+3+3 -label '%t' -background '#222' -fill white -quality 85 "sheets/topics_$dev.jpg"
  montage seasons/$dev-*.png -tile 4x -geometry 520x520+3+3 -label '%t' -background '#222' -fill white -quality 85 "sheets/seasons_$dev.jpg"
  montage rewards/$dev-*.png -tile 3x -geometry 600x600+3+3 -label '%t' -background '#222' -fill white -quality 85 "sheets/rewards_$dev.jpg"; done
montage notch/*.png -tile 5x -geometry 480x480+3+3 -label '%t' -background '#222' -fill white -quality 85 sheets/notch.jpg
montage short/*.png -tile 6x -geometry 480x480+3+3 -label '%t' -background '#222' -fill white -quality 85 sheets/short.jpg
montage flip/*.png -tile 3x -geometry 600x600+3+3 -label '%t' -background '#222' -fill white -quality 85 sheets/flip.jpg
for f in sheets/*.jpg; do convert "$f" -resize '2200x>' "$f"; done
