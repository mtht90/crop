"""Artifact では .glb/.gltf/.bin/.hdr を配信できないため、
モデルと空の HDR を「base64 テキスト（.txt）」に詰め直す。

- X.gltf + X.bin  → X.glb.txt（GLB を base64 化。テクスチャの jpg は外部参照のまま）
- model.glb 等     → model.glb.txt
- sky_1k.hdr       → sky_1k.hdr.txt
読み込み側は js/b64.js の loadB64() で ArrayBuffer に戻し、各ローダーの parse() に渡す。
使い方: python3 tools/pack_b64.py   （元ファイルは削除する）
"""
import base64
import glob
import json
import os
import struct

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.chdir(root)


def pad(b, fill):
    return b + fill * ((4 - len(b) % 4) % 4)


def gltf_to_glb(path):
    j = json.load(open(path, encoding='utf-8'))
    d = os.path.dirname(path)
    assert len(j['buffers']) == 1
    binfile = os.path.join(d, j['buffers'][0]['uri'])
    data = open(binfile, 'rb').read()
    del j['buffers'][0]['uri']
    js = pad(json.dumps(j, separators=(',', ':')).encode(), b' ')
    bn = pad(data, b'\0')
    total = 12 + 8 + len(js) + 8 + len(bn)
    glb = struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(bn), b'BIN\0') + bn
    return glb, [path, binfile]


def write_txt(out, data):
    open(out, 'w').write(base64.b64encode(data).decode())


for f in sorted(glob.glob('assets/models/*/*.gltf')):
    glb, olds = gltf_to_glb(f)
    write_txt(f[:-5] + '.glb.txt', glb)
    for o in olds:
        os.remove(o)
    print('model', f)
for f in sorted(glob.glob('assets/people/**/*.glb', recursive=True)):
    write_txt(f + '.txt', open(f, 'rb').read())
    os.remove(f)
    print('glb', f)
for f in glob.glob('assets/hdri/*.hdr'):
    write_txt(f + '.txt', open(f, 'rb').read())
    os.remove(f)
    print('hdr', f)
