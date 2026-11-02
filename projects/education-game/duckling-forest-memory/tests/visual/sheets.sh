#!/bin/sh
# Review montages for Kitten's Balloon Farm from tests/out/visual (needs ImageMagick).   sh tests/visual/sheets.sh
cd "$(dirname "$0")/../out/visual" || exit 1
mkdir -p sheets
for dev in iphoneP iphoneL ipadP ipadL; do for l in en vi; do
  montage screens/$dev-$l-*.png -tile 5x -geometry 520x520+4+4 -label '%t' -background '#222' -fill white -quality 85 "sheets/screens_${dev}_$l.jpg"; done; done
for dev in iphoneP iphoneL ipadP ipadL; do montage moods/$dev-*-s5.png -tile 4x -geometry 600x600+3+3 -label '%t' -background '#222' -fill white -quality 85 "sheets/moods_$dev.jpg"; done
for dev in iphoneL-en iphoneP-vi ipadP-en ipadL-vi; do montage topics/$dev-*.png -tile 5x -geometry 520x520+3+3 -label '%t' -background '#222' -fill white -quality 85 "sheets/topics_$dev.jpg"; done
montage hits/*.png -tile 5x -geometry 480x480+3+3 -label '%t' -background '#222' -fill white -quality 85 sheets/hits.jpg
montage notch/*.png -tile 5x -geometry 480x480+3+3 -label '%t' -background '#222' -fill white -quality 85 sheets/notch.jpg
montage short/*.png -tile 5x -geometry 480x480+3+3 -label '%t' -background '#222' -fill white -quality 85 sheets/short.jpg
for f in sheets/*.jpg; do convert "$f" -resize '2200x>' "$f"; done
