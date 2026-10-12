"""OpenStreetMap の地図データ（.osm）から、ゲームの町データ（town.json）を作る。

使い方: python3 tools/osm_to_town.py <入力.osm> <出力.json> [半幅x 半幅z]
- 座標はデータの中心を原点に、x = 東（m）、z = 南（m）。
- 道路は交差点で区切った「辺」と「交差点（節点）」のグラフにする。
- 建物は輪郭（多角形）、土地利用は面、川は線（幅つき）として出す。
地図データ © OpenStreetMap contributors（ODbL）
"""
import json
import math
import sys
import xml.etree.ElementTree as ET

src, dst = sys.argv[1], sys.argv[2]
HX = float(sys.argv[3]) if len(sys.argv) > 3 else 430
HZ = float(sys.argv[4]) if len(sys.argv) > 4 else 370

root = ET.parse(src).getroot()
b = root.find('bounds')
minlat, minlon, maxlat, maxlon = (float(b.get(k)) for k in ('minlat', 'minlon', 'maxlat', 'maxlon'))
clat, clon = (minlat + maxlat) / 2, (minlon + maxlon) / 2
KX = 111320 * math.cos(math.radians(clat))
KY = 110950


def proj(lat, lon):
    return ((lon - clon) * KX, -(lat - clat) * KY)


nodes, ntags = {}, {}
for n in root.iter('node'):
    nodes[n.get('id')] = proj(float(n.get('lat')), float(n.get('lon')))
    t = {x.get('k'): x.get('v') for x in n.iter('tag')}
    if t:
        ntags[n.get('id')] = t

ways = []
for w in root.iter('way'):
    t = {x.get('k'): x.get('v') for x in w.iter('tag')}
    refs = [nd.get('ref') for nd in w.iter('nd') if nd.get('ref') in nodes]
    ways.append((w.get('id'), t, refs))


def inside(p, pad=0):
    return -HX - pad <= p[0] <= HX + pad and -HZ - pad <= p[1] <= HZ + pad


def r2(v):
    return round(v, 2)


# ---------------- 道路 ----------------
ROAD = {
    'trunk': 9, 'primary': 8, 'secondary': 7.5, 'tertiary': 7, 'unclassified': 5.0, 'residential': 4.5,
    'living_street': 4, 'service': 3.6,
}
roads = []
for wid, t, refs in ways:
    hw = t.get('highway')
    if hw == 'construction':
        hw = t.get('construction', 'residential')
    if hw not in ROAD or len(refs) < 2:
        continue
    if t.get('service') in ('parking_aisle', 'drive-through'):
        continue
    if t.get('area') == 'yes':
        continue
    oneway = 1 if t.get('oneway') in ('yes', '1', 'true') else -1 if t.get('oneway') == '-1' else 0
    lanes = int(t.get('lanes', '0') or 0) if (t.get('lanes') or '').isdigit() else 0
    w = ROAD[hw]
    if oneway and hw in ('tertiary', 'secondary', 'primary', 'trunk'):
        w = 3.5 * max(1, lanes) + 1.0
    if t.get('width'):
        try:
            w = max(3, float(t['width'].split()[0]))
        except ValueError:
            pass
    if oneway == -1:
        refs = refs[::-1]
        oneway = 1
    name = t.get('name', '')
    for s in ('(建設中)', '建設中'):
        name = name.replace(s, '')
    roads.append({'refs': refs, 'cls': hw, 'w': w, 'ow': oneway, 'name': name, 'lanes': lanes,
                  'bridge': t.get('bridge') == 'yes', 'maxspeed': t.get('maxspeed')})

# 交差点：複数の道路が共有する点と端点
use = {}
for r in roads:
    for i, ref in enumerate(r['refs']):
        use[ref] = use.get(ref, 0) + (2 if i in (0, len(r['refs']) - 1) else 1)
gnode_idx, gnodes = {}, []


def gnode(ref):
    if ref not in gnode_idx:
        gnode_idx[ref] = len(gnodes)
        x, z = nodes[ref]
        sig = ntags.get(ref, {}).get('highway') == 'traffic_signals'
        gnodes.append([r2(x), r2(z), 1 if sig else 0])
    return gnode_idx[ref]


edges = []
for r in roads:
    refs = r['refs']
    start = 0
    for i in range(1, len(refs)):
        if use.get(refs[i], 0) >= 2 or i == len(refs) - 1:
            seg = refs[start:i + 1]
            pts = [nodes[x] for x in seg]
            # 範囲外の部分は捨てる（両端とも外なら捨てる。片方だけなら残す）
            if not any(inside(p, 30) for p in pts):
                start = i
                continue
            edges.append({
                'a': gnode(seg[0]), 'b': gnode(seg[-1]),
                'pts': [[r2(x), r2(z)] for x, z in pts],
                'cls': r['cls'], 'w': r['w'], 'ow': r['ow'], 'name': r['name'], 'lanes': r['lanes'],
                'br': r['bridge'], 'ms': r['maxspeed'],
                'sig': [[r2(nodes[x][0]), r2(nodes[x][1])] for x in seg[1:-1] if ntags.get(x, {}).get('highway') == 'traffic_signals'],
            })
            start = i

# 信号（交差点の点でなくても、近くの交差点に寄せて使う）
signals = [[r2(nodes[k][0]), r2(nodes[k][1])] for k, t in ntags.items() if t.get('highway') == 'traffic_signals' and k in nodes and inside(nodes[k], 30)]
crossings = [[r2(nodes[k][0]), r2(nodes[k][1])] for k, t in ntags.items() if t.get('highway') == 'crossing' and k in nodes and inside(nodes[k])]
bus = [[r2(nodes[k][0]), r2(nodes[k][1])] for k, t in ntags.items() if t.get('highway') == 'bus_stop' and k in nodes and inside(nodes[k])]

# ---------------- 建物・土地利用・川 ----------------
def area(pts):
    s = 0
    for i in range(len(pts)):
        x1, z1 = pts[i]; x2, z2 = pts[(i + 1) % len(pts)]
        s += x1 * z2 - x2 * z1
    return s / 2


buildings, areas, water = [], [], []
for wid, t, refs in ways:
    if len(refs) < 3:
        continue
    pts = [nodes[x] for x in refs]
    closed = refs[0] == refs[-1]
    if closed:
        pts = pts[:-1]
    if 'building' in t and closed:
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        if not inside((cx, cz)):
            continue
        if area(pts) < 0:
            pts = pts[::-1]
        lv = t.get('building:levels')
        buildings.append({'pts': [[r2(x), r2(z)] for x, z in pts], 'k': t['building'],
                          'lv': int(lv) if lv and lv.isdigit() else None, 'nm': t.get('name'),
                          'shop': t.get('shop') or t.get('amenity')})
        continue
    kind = t.get('landuse') or t.get('leisure') or t.get('natural') or (t.get('amenity') if t.get('amenity') in ('parking', 'school') else None)
    if kind and closed:
        if area(pts) < 0:
            pts = pts[::-1]
        areas.append({'k': kind, 'pts': [[r2(x), r2(z)] for x, z in pts]})
        continue
    if 'waterway' in t:
        w = {'river': 7, 'stream': 3, 'canal': 4, 'drain': 1.6, 'ditch': 1.2}.get(t['waterway'], 2)
        try:
            w = float(t.get('width', w))
        except ValueError:
            pass
        water.append({'k': t['waterway'], 'w': w, 'nm': t.get('name'), 'pts': [[r2(x), r2(z)] for x, z in pts]})

pois = []
for k, t in ntags.items():
    if k not in nodes or not inside(nodes[k]):
        continue
    kind = t.get('shop') or t.get('amenity')
    if kind and kind not in ('shelter', 'parking', 'vending_machine', 'bench'):
        pois.append({'k': kind, 'nm': t.get('name'), 'p': [r2(nodes[k][0]), r2(nodes[k][1])]})

out = {
    'meta': {'source': 'OpenStreetMap', 'attribution': '© OpenStreetMap contributors (ODbL)', 'center': [clat, clon]},
    'bounds': [-HX, -HZ, HX, HZ],
    'nodes': gnodes, 'edges': edges, 'signals': signals, 'crossings': crossings, 'bus': bus,
    'buildings': buildings, 'areas': areas, 'water': water, 'pois': pois,
}
json.dump(out, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'nodes {len(gnodes)} edges {len(edges)} buildings {len(buildings)} areas {len(areas)} water {len(water)} signals {len(signals)} pois {len(pois)}')
