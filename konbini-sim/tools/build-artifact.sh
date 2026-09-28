#!/bin/bash
# Builds a self-contained hosted version: Google Fonts, no WebAssembly decoders,
# and a publish page with the JS/CSS inlined. Output: dist-artifact/
set -e
cd "$(dirname "$0")/.."
rm -rf dist-artifact
VITE_HOSTED=1 npx vite build --outDir dist-artifact --emptyOutDir >/dev/null
GT=${GT:-/home/user/ext/gt}
for f in dist-artifact/assets/anims/*.glb dist-artifact/assets/props/*.glb; do
  node $GT/decompress.mjs "$f" "$f"
done
node tools/make-publish-page.mjs dist-artifact
# host only serves web media types: give binary assets a served extension
find dist-artifact -name '*.glb' -o -name '*.hdr' | while read f; do mv "$f" "$f.wasm"; done
find dist-artifact -name '*.md' -delete
