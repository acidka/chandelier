#!/bin/sh
# bench/compare-m2.sh <run>  → <run>-vs-reference.png, <run>-diff.png, RMSE vs the M2 reference (needs ImageMagick)
R=$1; cd "$(dirname "$0")/.."; SP=bench/results/m2/$R; P=bench/results/m2/$R/M2-$R.png
W=$(magick identify -format %w "$P"); H=$(magick identify -format %h "$P")
magick bench/scenarios/design-from-image.jpg -crop 1140x1275+36+8 +repage -resize ${W}x${H}! $SP/ref-$R.png
magick \( $SP/ref-$R.png -gravity north -background white -splice 0x60 -font Arial -pointsize 40 -annotate +0+10 Reference \) \( "$P" -background white -flatten -gravity north -splice 0x60 -font Arial -pointsize 40 -annotate +0+10 "$R" \) -bordercolor "#888" -border 2 +append $SP/$R-vs-reference.png
magick $SP/ref-$R.png \( "$P" -background white -flatten \) -compose difference -composite -negate $SP/$R-diff.png
magick "$P" -background white -flatten $SP/flat-$R.png
printf "RMSE %s: " $R; magick compare -metric RMSE $SP/ref-$R.png $SP/flat-$R.png null: 2>&1; echo
rm -f $SP/ref-$R.png $SP/flat-$R.png
