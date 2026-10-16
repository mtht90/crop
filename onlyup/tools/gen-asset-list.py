#!/usr/bin/env python3
"""Poly Haven API から glTF モデルの URL と依存ファイル一覧を取得して js/asset-models.js を生成する。"""
import json, urllib.request, pathlib
MODELS = ['ocean_buoy', 'wooden_crate_01', 'Barrel_01', 'cardboard_box_01', 'utility_box_02', 'Television_01',
          'Sofa_01', 'ArmChair_01', 'barrel_03', 'metal_tool_chest', 'steel_frame_shelves_01', 'propane_tank',
          'old_tyre', 'covered_car', 'metal_office_desk', 'ceiling_fan', 'marble_bust_01', 'horse_statue_01',
          'moon_rock_01', 'moon_rock_03', 'moon_rock_05']
out = {}
for m in MODELS:
    req = urllib.request.Request(f'https://api.polyhaven.com/files/{m}', headers={'User-Agent': 'skyward-asset-list/1.0'})
    d = json.load(urllib.request.urlopen(req))
    g = d['gltf']['1k']['gltf']
    out[m] = {'gltf': g['url'], 'include': {k: v['url'] for k, v in g['include'].items()}}
p = pathlib.Path(__file__).resolve().parent.parent / 'js' / 'asset-models.js'
p.write_text('// 自動生成: tools/gen-asset-list.py （Poly Haven CC0 モデル）\nexport const PH_MODELS = ' + json.dumps(out, indent=1) + ';\n', encoding='utf-8')
print('wrote', p, len(out))
