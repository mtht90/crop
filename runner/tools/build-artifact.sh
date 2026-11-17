#!/usr/bin/env bash
# Builds dist/artifact.html (single page with inlined JS/CSS) + compressed assets for claude.ai artifacts.
# Needs a node_modules with @gltf-transform/* + meshoptimizer for tools/glb-to-json.mjs ($TOOLS).
set -euo pipefail
TOOLS=${TOOLS:-tools}
rm -rf dist && npx vite build >/dev/null
rm -f dist/assets/textures/*.hdr
cp tools/glb-to-json.mjs "$TOOLS/" && node "$TOOLS/glb-to-json.mjs" dist/assets/models 2>&1 | grep -v -e prune -e quantize
for f in dist/assets/textures/*_sky.jpg; do python3 -c "
from PIL import Image;import sys;im=Image.open(sys.argv[1]);im.resize((2048,1024),Image.LANCZOS).save(sys.argv[1],quality=85)" "$f"; done
ffmpeg -loglevel error -y -i public/assets/audio/wind.mp3 -t 20 -b:a 96k dist/assets/audio/wind.mp3
python3 - <<'PY'
import re,glob
d='dist'; html=open(d+'/index.html').read()
js=open(glob.glob(d+'/assets/index-*.js')[0]).read()
css=open(glob.glob(d+'/assets/index-*.css')[0]).read()
body=re.sub(r'<script type="module"[^>]*></script>','',html.split('<body>')[1].split('</body>')[0])
head='''<title>VELOCITY RUN</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">'''
page=head+'\n<style>\n:root { color-scheme: dark; }\n'+css+'\n</style>\n'+body+'\n<script type="module">\n'+js.replace('</script','<\\/script')+'\n</script>\n'
open(d+'/artifact.html','w').write(page)
open(d+'/test.html','w').write('<!doctype html><html><head><meta charset="utf-8"></head><body>'+page+'</body></html>')
PY
rm dist/assets/index-*
du -sh dist
