"""アーティファクト配信用に、配信できない形式を形式変換だけ行う (中身は無改変)。
  .glb  -> .gltf.json (バイナリを data URI で埋め込んだ glTF JSON)
  .gltf -> .gltf.json (名前変更のみ)
  .hdr  -> .hdr.b64.txt (base64 テキスト)
使い方: python3 -I tools/pack_web_formats.py assets
"""
import base64, json, os, struct, sys

def glb_to_json(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack('<4sII', b[:12])
    assert magic == b'glTF', path
    off, js, bin_ = 12, None, b''
    while off < length:
        clen, ctype = struct.unpack('<I4s', b[off:off + 8])
        data = b[off + 8:off + 8 + clen]
        if ctype == b'JSON': js = json.loads(data)
        elif ctype == b'BIN\x00': bin_ = data
        off += 8 + clen
    if js.get('buffers'):
        js['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(bin_).decode()
    return js

root = sys.argv[1]
for d, _, files in os.walk(root):
    for f in files:
        p = os.path.join(d, f)
        if f.endswith('.glb'):
            json.dump(glb_to_json(p), open(p[:-4] + '.gltf.json', 'w'), separators=(',', ':'))
            os.remove(p)
        elif f.endswith('.gltf'):
            os.rename(p, p + '.json')
        elif f.endswith('.hdr'):
            open(p + '.b64.txt', 'w').write(base64.b64encode(open(p, 'rb').read()).decode())
            os.remove(p)
        else:
            continue
        print('packed', p)
