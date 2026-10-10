#!/usr/bin/env bash
# 日本語フォント（M PLUS Rounded 1c, SIL OFL）を、ゲーム内で使っている文字だけにサブセット化する。
# 使い方: scripts/subset-font.sh <MPLUSRounded1c-Medium.ttf> <MPLUSRounded1c-ExtraBold.ttf>
# 必要: pip install fonttools brotli
# 元フォント: https://github.com/google/fonts/tree/main/ofl/mplusrounded1c
set -euo pipefail
cd "$(dirname "$0")/.."
chars=$(mktemp)
cat index.html src/*.ts > "$chars"
printf '%s' ' !"#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz{|}~…→×★、。「」（）！？：・ー〜' >> "$chars"
for pair in "$1:500" "$2:800"; do
  src=${pair%:*}; weight=${pair#*:}
  pyftsubset "$src" --text-file="$chars" --flavor=woff2 --layout-features='*' \
    --output-file="public/assets/fonts/mplus-rounded-1c-$weight.woff2"
done
rm "$chars"
ls -la public/assets/fonts
