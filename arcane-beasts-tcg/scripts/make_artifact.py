#!/usr/bin/env python3
"""Turn the `vite build --mode artifact` output into a claude.ai Artifact page.

The page (artifact/index.html) carries the app's JS and CSS inline; images,
audio and effect sheets stay as separate files published next to it under
the same relative paths (assets/...).
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist-artifact')
OUT = os.path.join(ROOT, 'artifact')

html = open(os.path.join(DIST, 'index.html'), encoding='utf-8').read()
js_files = re.findall(r'<script type="module" crossorigin src="\./(assets/[^"]+\.js)"></script>', html)
css_files = re.findall(r'<link rel="stylesheet" crossorigin href="\./(assets/[^"]+\.css)">', html)
assert len(js_files) == 1, js_files
js = open(os.path.join(DIST, js_files[0]), encoding='utf-8').read().replace('</script', '<\\/script')
css = ''.join(open(os.path.join(DIST, c), encoding='utf-8').read() for c in css_files)
assert 'url(' not in re.sub(r'url\((data:|"data:|#)', '', css) or True

FONTS = ('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Dela+Gothic+One'
         '&family=M+PLUS+1p:wght@500;700;900&family=M+PLUS+Rounded+1c:wght@700;800&display=swap')

page = f'''<title>ARCANE BEASTS</title>
<meta name="theme-color" content="#060a1c">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
:root {{ color-scheme: dark; }}
html, body {{ background: #060a1c; color: #eef1ff; }}
{css}
</style>
<div id="root"></div>
<script type="module">
{js}
</script>
'''

if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)

# copy the static game assets (everything in dist-artifact/assets except the bundle)
bundle = set(js_files + css_files)
files = {}
for dirpath, _, names in os.walk(os.path.join(DIST, 'assets')):
    for n in names:
        rel = os.path.relpath(os.path.join(dirpath, n), DIST).replace(os.sep, '/')
        if rel in bundle:
            continue
        dst = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(DIST, rel), dst)
        files[rel] = rel
json.dump(sorted(files), open(os.path.join(OUT, 'files.json'), 'w'), indent=0)
size = sum(os.path.getsize(os.path.join(OUT, f)) for f in files)
print(f'page {len(page)/1e6:.2f} MB, {len(files)} asset files, {size/1e6:.1f} MB')
