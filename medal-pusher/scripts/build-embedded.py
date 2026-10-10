#!/usr/bin/env python3
"""dist/ を、.hdr/.bin を配信できないホスト（Claude のアーティファクト等）向けに変換する。
使い方: python3 scripts/build-embedded.py dist out_dir
- .hdr / .bin を base64 で assets/embedded.js に埋め込み（実行時に three.js のキャッシュへ登録）
- CSS をページに埋め込み、doctype/head/body を外す
"""
import base64, glob, json, os, re, shutil, sys

src, out = sys.argv[1], sys.argv[2]
shutil.rmtree(out, ignore_errors=True)
shutil.copytree(src, out)
h = open(f'{out}/index.html').read()
css_href = re.search(r'<link rel="stylesheet" crossorigin href="\./(assets/[^"]+)">', h).group(1)
css = open(f'{out}/{css_href}').read()
css = re.sub(r'url\(\.\./assets/', 'url(./assets/', css)
css = re.sub(r'url\(\./(?!assets/)', 'url(./assets/', css)
h = h.replace(re.search(r'<link rel="stylesheet"[^>]+>', h).group(0), '<style>' + css + '</style>')
os.remove(f'{out}/{css_href}')
emb = {}
for f in glob.glob(f'{out}/assets/**/*.hdr', recursive=True) + glob.glob(f'{out}/assets/**/*.bin', recursive=True):
    emb['./' + os.path.relpath(f, out)] = base64.b64encode(open(f, 'rb').read()).decode()
    os.remove(f)
open(f'{out}/assets/embedded.js', 'w').write('window.__EMBEDDED_FILES=' + json.dumps(emb) + ';')
for tag in ['<!doctype html>', '<html lang="ja">', '</html>', '<head>', '</head>', '<body>', '</body>']:
    h = h.replace(tag, '')
h = re.sub(r'<meta[^>]+>\s*', '', h)
h = h.replace('<script type="module"', '<script src="./assets/embedded.js"></script>\n    <script type="module"', 1)
open(f'{out}/index.html', 'w').write(h)
files = {}
for f in sorted(glob.glob(f'{out}/**/*', recursive=True)):
    if os.path.isfile(f) and not f.endswith('/index.html'):
        k = os.path.relpath(f, out)
        files[k] = {'from': k, 'contentType': 'application/json'} if k.endswith('.gltf') else k
json.dump(files, open(os.path.join(os.path.dirname(os.path.abspath(out)), 'files.json'), 'w'))
print(len(files), 'files; embedded:', list(emb))
