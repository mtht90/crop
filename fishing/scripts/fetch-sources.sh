#!/usr/bin/env bash
# 魚・植生モデルの元データ（外部の無料素材）を assets-src/ に取得する。
# 変換して public/assets に書き出すのは scripts/convert-models.cjs。出典は CREDITS.md。
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=assets-src
mkdir -p "$SRC"
get() { [ -f "$SRC/$2" ] || curl -fsSL -o "$SRC/$2" "$1"; }
OGA=https://opengameart.org/sites/default/files
# 魚：Polyy.AI「[FREE] 3D Fish Pack」low-poly LOD（CC0, itch.io の無料ダウンロード）
if [ ! -f "$SRC/polyyai/lod.zip" ]; then
  mkdir -p "$SRC/polyyai"
  B=https://polyyai.itch.io/3d-fish-pack
  JAR=$(mktemp)
  TOKEN=$(curl -fsSL -c "$JAR" -b "$JAR" "$B" | grep -o 'name="csrf_token" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//')
  URL=$(curl -fsSL -b "$JAR" -X POST --data-urlencode "csrf_token=$TOKEN" "$B/file/19147706?source=game_download" | python3 -c 'import sys,json;print(json.load(sys.stdin)["url"])')
  curl -fsSL -o "$SRC/polyyai/lod.zip" "$URL"
  rm -f "$JAR"
fi
[ -d "$SRC/polyyai/3D_Fish_Pack_LowPoly" ] || unzip -oq "$SRC/polyyai/lod.zip" -d "$SRC/polyyai"
get https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip kenney_nature.zip
get https://kenney.nl/media/pages/assets/pirate-kit/e6d4bb1525-1771333093/kenney_pirate-kit.zip kenney_pirate.zip
cd "$SRC"
for z in kenney_nature kenney_pirate; do
  [ -d "${z}_x" ] || unzip -oq "$z.zip" -d "${z}_x"
done
echo "sources ok"
