#!/bin/sh
# Builds review montages from tests/out/visual (needs ImageMagick).   sh tests/visual/sheets.sh
cd "$(dirname "$0")/../out/visual" || exit 1
mkdir -p sheets
for d in motion/*/; do n=$(basename "$d"); montage "$d"*.png -tile 8x -geometry +3+3 -label '%t' -pointsize 14 -background '#333' -fill white "sheets/motion_$n.png"; done
for dev in iphoneP iphoneL ipadP ipadL; do for l in en vi; do
  montage screens/$dev-$l-*.png -tile 5x -geometry 600x600+4+4 -label '%t' -background '#222' -fill white "sheets/screens_${dev}_$l.png"; done; done
montage moods/*.png -tile 4x -geometry 700x700+4+4 -label '%t' -background '#222' -fill white sheets/moods.png
for dev in iphoneL-en iphoneP-vi ipadP-en ipadL-vi; do montage topics/$dev-*.png -tile 4x -geometry 700x700+4+4 -label '%t' -background '#222' -fill white "sheets/topics_$dev.png"; done
montage notch/*.png -tile 4x -geometry 600x600+4+4 -label '%t' -background '#222' -fill white sheets/notch.png
