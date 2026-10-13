#!/usr/bin/env python3
"""GLB → 埋め込み glTF(JSON) 変換。アーティファクトの配信が .glb を扱えないため .json で配る。
使い方: python3 tools/glb2json.py assets/models/*.glb assets/env/*.glb
"""
import base64, json, os, struct, sys
for f in sys.argv[1:]:
    b = open(f, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]
    binc = b[off + 8: off + 8 + bl]
    j['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(binc).decode()
    out = os.path.splitext(f)[0] + '.json'
    open(out, 'w').write(json.dumps(j, separators=(',', ':')))
    print(out, os.path.getsize(out) // 1024, 'KB')
