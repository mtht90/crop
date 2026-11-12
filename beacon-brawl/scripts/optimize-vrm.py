#!/usr/bin/env python3
"""VRM (VRoid) のテクスチャを縮小・WebP 化して軽量化する。VRM 拡張などの JSON はそのまま保つ。
使い方: python3 scripts/optimize-vrm.py <入力.vrm> <出力.vrm> [最大辺px=1024]
"""
import io, json, struct, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
max_side = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
data = open(src, 'rb').read()
magic, version, _ = struct.unpack_from('<4sII', data, 0)
assert magic == b'glTF' and version == 2
jlen, _ = struct.unpack_from('<I4s', data, 12)
doc = json.loads(data[20:20 + jlen])
blen, _ = struct.unpack_from('<I4s', data, 20 + jlen)
binary = data[28 + jlen:28 + jlen + blen]

image_views = {img['bufferView']: img for img in doc.get('images', []) if 'bufferView' in img}
out = bytearray()
for i, bv in enumerate(doc['bufferViews']):
    chunk = binary[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    if i in image_views:
        im = Image.open(io.BytesIO(chunk))
        im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
        if max(im.size) > max_side:
            k = max_side / max(im.size)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=88, method=6)
        chunk = buf.getvalue()
        image_views[i]['mimeType'] = 'image/webp'
    while len(out) % 4: out.append(0)
    bv['byteOffset'] = len(out)
    bv['byteLength'] = len(chunk)
    out += chunk
while len(out) % 4: out.append(0)
doc['buffers'][0]['byteLength'] = len(out)
j = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
j += b' ' * (-len(j) % 4)
total = 12 + 8 + len(j) + 8 + len(out)
with open(dst, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, total))
    f.write(struct.pack('<I4s', len(j), b'JSON')); f.write(j)
    f.write(struct.pack('<I4s', len(out), b'BIN\0')); f.write(out)
print(f'{src.split("/")[-1]}: {len(data)/1e6:.1f}MB -> {total/1e6:.1f}MB')
