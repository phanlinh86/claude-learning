#!/bin/sh
# Builds review montages from tests/out/visual (needs ImageMagick).   sh tests/visual/sheets.sh
cd "$(dirname "$0")/../out/visual" || exit 1
mkdir -p sheets
for d in motion/*/; do [ -d "$d" ] || continue; n=$(basename "$d"); montage "$d"*.png -tile 9x -geometry +3+3 -label '%t' -pointsize 14 -background '#333' -fill white "sheets/motion_$n.png"; done
for dev in iphoneP iphoneL ipadP ipadL; do for l in en vi; do
  montage screens/$dev-$l-*.png -tile 4x -geometry 600x600+4+4 -label '%t' -background '#222' -fill white "sheets/screens_${dev}_$l.png"; done; done
for dev in iphoneP iphoneL ipadP ipadL; do montage moods/$dev-*.png -tile 4x -geometry 700x700+4+4 -label '%t' -background '#222' -fill white "sheets/moods_$dev.png"; done
for dev in iphoneL-en iphoneP-vi ipadP-en ipadL-vi; do montage topics/$dev-*.png -tile 4x -geometry 700x700+4+4 -label '%t' -background '#222' -fill white "sheets/topics_$dev.png"; done
for dev in iphoneP iphoneL ipadP ipadL; do montage bloom/$dev-*.png -tile 4x -geometry 700x700+4+4 -label '%t' -background '#222' -fill white "sheets/bloom_$dev.png"; done
montage lumi/*.png -tile 7x -geometry 260x260+4+4 -label '%t' -background '#222' -fill white sheets/lumi.png
montage notch/*.png -tile 5x -geometry 600x600+4+4 -label '%t' -background '#222' -fill white sheets/notch.png
