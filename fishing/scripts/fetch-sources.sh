#!/usr/bin/env bash
# 魚・植生モデルの元データ（外部の無料素材）を assets-src/ に取得する。
# 変換して public/assets に書き出すのは scripts/convert-models.cjs。出典は CREDITS.md。
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=assets-src
mkdir -p "$SRC"
get() { [ -f "$SRC/$2" ] || curl -fsSL -o "$SRC/$2" "$1"; }
OGA=https://opengameart.org/sites/default/files
get https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb barramundi.glb
get $OGA/esox.zip esox.zip
get $OGA/catfish.zip catfish.zip
get $OGA/catfish_obj_0.zip catfish_obj.zip
get $OGA/biggoldfish.zip goldfish.zip
get "$OGA/Animated%20Fish%20Pack%20by%20%40Quaternius.zip" quaternius_fish.zip
get https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip kenney_nature.zip
get https://kenney.nl/media/pages/assets/pirate-kit/e6d4bb1525-1771333093/kenney_pirate-kit.zip kenney_pirate.zip
cd "$SRC"
for z in esox catfish catfish_obj goldfish quaternius_fish kenney_nature kenney_pirate; do
  [ -d "${z}_x" ] || unzip -oq "$z.zip" -d "${z}_x"
done
echo "sources ok"
