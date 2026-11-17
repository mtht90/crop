#!/usr/bin/env bash
# Downloads all external (CC0) source packs into $1 (default ./.asset-src).
# Then run: node tools/prepare-assets.mjs <srcdir> public/assets
set -euo pipefail
D=${1:-.asset-src}; mkdir -p "$D" && cd "$D"
OGA=https://opengameart.org/sites/default/files
get(){ [ -f "$2" ] || curl -sSL --retry 3 -o "$2" "$1"; }
unz(){ [ -d "$2" ] || { mkdir -p "$2"; unzip -q -o "$1" -d "$2"; }; }
# Quaternius – Universal Animation Library 1 & 2 (CC0)
get $OGA/universal_animation_librarystandard.zip ual.zip;           unz ual.zip ual
get $OGA/universal_animation_library_2standard.zip ual2.zip;        unz ual2.zip ual2
# Quaternius – Modular Sci-Fi MegaKit (CC0)
get $OGA/modular_scifi_megakitstandard.zip scifi.zip;               unz scifi.zip scifi
# Kenney – City Kit Commercial / Factory Kit / Nature Kit (CC0)
get $OGA/kenney_city-kit-commercial_2.1.zip city.zip;               unz city.zip city
get $OGA/kenney_factory-kit_3.0.zip factory.zip;                    unz factory.zip factory
get "$OGA/Nature%20Kit%20%282.1%29.zip" nature.zip;                 unz nature.zip nature
# Audio (CC0, OpenGameArt)
mkdir -p audio
for f in 01-footstep 02-footstep 03-footstep 04-footstep 05-footstep; do get $OGA/$f.ogg audio/$f.ogg; done
get $OGA/metal_steps.ogg audio/metal_steps.ogg
get "$OGA/wind%20background%20noise%202_01.mp3" audio/wind.mp3
get $OGA/ld47.mp3 audio/music_dnb.mp3
get $OGA/100-CC0-SFX_0.zip sfx.zip; unz sfx.zip sfx
# Poly Haven textures + HDRIs (CC0)
mkdir -p ph
for t in concrete_floor_worn_001 metal_plate rusty_metal_02 rocky_terrain_02 anti_slip_concrete; do
  for m in Diffuse nor_gl arm; do
    url=$(curl -s https://api.polyhaven.com/files/$t | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[process.argv[1]]["1k"].jpg.url))' $m)
    get "$url" ph/${t}_${m}.jpg
  done
done
for h in kloofendal_48d_partly_cloudy_puresky rogland_clear_night industrial_sunset_puresky qwantani_puresky; do
  get https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/${h}_1k.hdr ph/${h}_1k.hdr
  get https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/${h}.jpg ph/${h}.jpg
done
echo done
