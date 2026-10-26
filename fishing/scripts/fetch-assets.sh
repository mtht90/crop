#!/usr/bin/env bash
# 外部の無料素材（CC0）を public/assets に取得する。出典は CREDITS.md を参照。
set -euo pipefail
cd "$(dirname "$0")/.."
TEX=public/assets/textures
MOD=assets-src/polyhaven
mkdir -p "$TEX" "$MOD"

ph_tex() { # Poly Haven texture: name, maps...
  local name=$1; shift
  for map in "$@"; do
    local out="$TEX/${name}_${map}.jpg"
    [ -f "$out" ] || curl -fsSL -o "$out" "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${name}/${name}_${map}_1k.jpg"
  done
}

ph_model() { # Poly Haven glTF (1k) with its textures
  local name=$1
  local dir="$MOD/$name"
  [ -f "$dir/$name.gltf" ] && return
  mkdir -p "$dir"
  local json
  json=$(curl -fsSL "https://api.polyhaven.com/files/$name")
  python3 - "$json" "$dir" "$name" <<'PY'
import json, sys, urllib.request, os
data = json.loads(sys.argv[1]); out = sys.argv[2]; name = sys.argv[3]
g = data["gltf"]["1k"]["gltf"]
urllib.request.urlretrieve(g["url"], os.path.join(out, name + ".gltf"))
for rel, f in g.get("include", {}).items():
    p = os.path.join(out, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    urllib.request.urlretrieve(f["url"], p)
PY
  # gltf の参照名を固定名に揃える
  sed -i "s/${name}_1k\.bin/${name}.bin/" "$dir/$name.gltf" 2>/dev/null || true
  [ -f "$dir/${name}_1k.bin" ] && mv "$dir/${name}_1k.bin" "$dir/${name}.bin" || true
}

ph_tex aerial_grass_rock diff nor_gl
ph_tex forest_ground_04 diff
ph_tex coast_sand_01 diff nor_gl
ph_tex gray_rocks diff nor_gl
ph_tex weathered_planks diff nor_gl
ph_tex brown_mud_leaves_01 diff
ph_tex bark_brown_02 diff
# 汐見港・磯
ph_tex concrete_floor_02 diff
ph_tex coast_land_rocks_01 diff

ph_model barrel_03
ph_model fern_02

[ -f "$TEX/waternormals.jpg" ] || curl -fsSL -o "$TEX/waternormals.jpg" https://raw.githubusercontent.com/mrdoob/three.js/r169/examples/textures/waternormals.jpg
echo "assets ok（魚・植生モデルは scripts/fetch-sources.sh → scripts/convert-models.cjs）"
