"""OpenStreetMap のタイル（.osm を複数）から、広いワールドのデータを作る。

使い方: python3 tools/osm_to_world.py <osmタイルのフォルダ> <出力フォルダ>
出力:
  world.json          … 範囲・道路網（交差点と辺）・鉄道・信号・横断歩道・バス停・大きな土地利用
  tiles.json … 400m 四方ごとの建物・土地利用・川（キーは "i_j"）
座標は範囲の中心を原点に x = 東、z = 南（m）。地図データ © OpenStreetMap contributors（ODbL）
"""
import glob
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

src, dst = sys.argv[1], sys.argv[2]
TILE = 400.0
nodes, ntags, ways = {}, {}, {}
minlat = minlon = 1e9; maxlat = maxlon = -1e9
for fn in sorted(glob.glob(os.path.join(src, '*.osm'))):
    root = ET.parse(fn).getroot()
    b = root.find('bounds')
    if b is not None:
        minlat = min(minlat, float(b.get('minlat'))); minlon = min(minlon, float(b.get('minlon')))
        maxlat = max(maxlat, float(b.get('maxlat'))); maxlon = max(maxlon, float(b.get('maxlon')))
    for n in root.iter('node'):
        nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')))
        t = {x.get('k'): x.get('v') for x in n.iter('tag')}
        if t: ntags[n.get('id')] = t
    for w in root.iter('way'):
        if w.get('id') in ways: continue
        ways[w.get('id')] = ({x.get('k'): x.get('v') for x in w.iter('tag')}, [nd.get('ref') for nd in w.iter('nd')])
clat, clon = (minlat + maxlat) / 2, (minlon + maxlon) / 2
KX, KY = 111320 * math.cos(math.radians(clat)), 110950
P = {k: ((lon - clon) * KX, -(lat - clat) * KY) for k, (lat, lon) in nodes.items()}
HX, HZ = (maxlon - minlon) * KX / 2, (maxlat - minlat) * KY / 2
inside = lambda p, pad=0: -HX - pad <= p[0] <= HX + pad and -HZ - pad <= p[1] <= HZ + pad
r1 = lambda v: round(v, 1)


def area(pts):
    s = 0
    for i in range(len(pts)):
        x1, z1 = pts[i]; x2, z2 = pts[(i + 1) % len(pts)]
        s += x1 * z2 - x2 * z1
    return s / 2


# ---------------- 道路網 ----------------
ROAD = {'motorway': 10, 'trunk': 9, 'primary': 8, 'secondary': 7.5, 'tertiary': 7, 'unclassified': 5.0, 'residential': 4.5,
        'living_street': 4, 'service': 3.6, 'trunk_link': 6, 'primary_link': 6, 'secondary_link': 6, 'tertiary_link': 5}
roads = []
for wid, (t, refs) in ways.items():
    hw = t.get('highway')
    if hw == 'construction': hw = t.get('construction', 'residential')
    if hw not in ROAD: continue
    refs = [r for r in refs if r in P]
    if len(refs) < 2 or t.get('area') == 'yes': continue
    if t.get('service') in ('parking_aisle', 'drive-through'): continue
    if hw == 'service' and t.get('access') in ('private', 'no'): continue
    ow = 1 if t.get('oneway') in ('yes', '1', 'true') or t.get('junction') == 'roundabout' else -1 if t.get('oneway') == '-1' else 0
    lanes = int(t['lanes']) if (t.get('lanes') or '').isdigit() else 0
    w = ROAD[hw]
    if lanes: w = max(w, lanes * 3.25 + 0.8) if not ow else lanes * 3.3 + 0.8
    elif ow and hw in ('trunk', 'primary', 'secondary', 'tertiary'): w = 4.3
    if t.get('width'):
        try: w = max(3, float(t['width'].split()[0]))
        except ValueError: pass
    if ow == -1: refs = refs[::-1]; ow = 1
    roads.append({'refs': refs, 'cls': hw.replace('_link', ''), 'w': round(w, 1), 'ow': ow, 'name': (t.get('name') or '').replace('(建設中)', ''),
                  'br': 1 if t.get('bridge') in ('yes', 'viaduct') else 0, 'tn': 1 if t.get('tunnel') == 'yes' else 0,
                  'layer': int(t['layer']) if (t.get('layer') or '').lstrip('-').isdigit() else 0, 'ms': t.get('maxspeed'), 'lanes': lanes})
use = {}
for r in roads:
    for i, ref in enumerate(r['refs']):
        use[ref] = use.get(ref, 0) + (2 if i in (0, len(r['refs']) - 1) else 1)
gidx, gnodes = {}, []
def gnode(ref):
    if ref not in gidx:
        gidx[ref] = len(gnodes)
        x, z = P[ref]
        gnodes.append([r1(x), r1(z), 1 if ntags.get(ref, {}).get('highway') == 'traffic_signals' else 0])
    return gidx[ref]
edges = []
for r in roads:
    refs = r['refs']; start = 0
    for i in range(1, len(refs)):
        if use.get(refs[i], 0) >= 2 or i == len(refs) - 1:
            seg = refs[start:i + 1]
            pts = [P[x] for x in seg]
            if any(inside(p, 20) for p in pts):
                e = {'a': gnode(seg[0]), 'b': gnode(seg[-1]), 'pts': [[r1(x), r1(z)] for x, z in pts], 'cls': r['cls'], 'w': r['w'], 'ow': r['ow']}
                for k in ('name', 'br', 'tn', 'layer', 'ms', 'lanes'):
                    if r[k]: e[k] = r[k]
                sig = [[r1(P[x][0]), r1(P[x][1])] for x in seg[1:-1] if ntags.get(x, {}).get('highway') == 'traffic_signals']
                if sig: e['sig'] = sig
                edges.append(e)
            start = i

# ---------------- 鉄道 ----------------
rails = []
for wid, (t, refs) in ways.items():
    rw = t.get('railway')
    if rw not in ('rail', 'light_rail', 'tram') or t.get('service') in ('yard', 'siding', 'spur'): continue
    pts = [P[r] for r in refs if r in P]
    if len(pts) < 2 or not any(inside(p, 50) for p in pts): continue
    rails.append({'k': rw, 'pts': [[r1(x), r1(z)] for x, z in pts], 'br': 1 if t.get('bridge') in ('yes', 'viaduct') else 0,
                  'layer': int(t['layer']) if (t.get('layer') or '').lstrip('-').isdigit() else 0, 'hs': 1 if t.get('highspeed') == 'yes' else 0,
                  'el': 1 if t.get('electrified') in ('contact_line', 'yes') else 0})

# ---------------- 点の情報 ----------------
pt = lambda k: [r1(P[k][0]), r1(P[k][1])]
signals = [pt(k) for k, t in ntags.items() if t.get('highway') == 'traffic_signals' and k in P and inside(P[k], 20)]
crossings = [pt(k) for k, t in ntags.items() if t.get('highway') == 'crossing' and k in P and inside(P[k])]
bus = [pt(k) for k, t in ntags.items() if t.get('highway') == 'bus_stop' and k in P and inside(P[k])]
pois = []
for k, t in ntags.items():
    if k not in P or not inside(P[k]): continue
    kind = t.get('shop') or t.get('amenity')
    if kind and kind not in ('shelter', 'parking', 'vending_machine', 'bench', 'bicycle_parking', 'waste_basket', 'toilets', 'post_box', 'telephone'):
        pois.append({'k': kind, 'nm': t.get('name'), 'p': pt(k)})

# ---------------- タイルごと：建物・土地利用・川 ----------------
NI, NJ = math.ceil(2 * HX / TILE), math.ceil(2 * HZ / TILE)
tiles = {}
def tile_of(x, z):
    i = min(NI - 1, max(0, int((x + HX) // TILE))); j = min(NJ - 1, max(0, int((z + HZ) // TILE)))
    return f'{i}_{j}'
def T(key):
    if key not in tiles: tiles[key] = {'b': [], 'a': [], 'w': [], 'p': []}
    return tiles[key]
big_areas = []
nb = 0
for wid, (t, refs) in ways.items():
    refs = [r for r in refs if r in P]
    if len(refs) < 3: continue
    pts = [P[x] for x in refs]
    closed = refs[0] == refs[-1]
    if closed: pts = pts[:-1]
    if len(pts) < 3: continue
    if 'building' in t and closed:
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        if not inside((cx, cz)): continue
        if area(pts) < 0: pts = pts[::-1]
        if abs(area(pts)) < 5: continue
        lv = t.get('building:levels')
        b = {'p': [[r1(x), r1(z)] for x, z in pts], 'k': t['building']}
        if lv and lv.split('.')[0].isdigit(): b['lv'] = int(lv.split('.')[0])
        if t.get('name'): b['nm'] = t['name']
        if t.get('shop') or t.get('amenity'): b['s'] = t.get('shop') or t.get('amenity')
        if t.get('roof:shape'): b['rs'] = t['roof:shape']
        T(tile_of(cx, cz))['b'].append(b); nb += 1
        continue
    kind = t.get('landuse') or t.get('leisure') or t.get('natural') or (t.get('amenity') if t.get('amenity') in ('parking', 'school', 'university', 'hospital') else None)
    if kind and closed:
        if kind not in ('residential', 'farmland', 'grass', 'meadow', 'heath', 'park', 'parking', 'retail', 'commercial', 'industrial', 'construction', 'school', 'university', 'water', 'scrub', 'wood', 'forest', 'cemetery', 'orchard', 'vineyard', 'pitch', 'playground', 'railway', 'garden', 'farmyard', 'allotments', 'hospital', 'recreation_ground', 'religious', 'brownfield', 'greenfield'):
            continue
        if area(pts) < 0: pts = pts[::-1]
        xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
        a = {'k': kind, 'p': [[r1(x), r1(z)] for x, z in pts]}
        if max(xs) - min(xs) > TILE or max(zs) - min(zs) > TILE: big_areas.append(a)
        else: T(tile_of(sum(xs) / len(xs), sum(zs) / len(zs)))['a'].append(a)
        continue
    if 'waterway' in t and t['waterway'] in ('river', 'stream', 'canal', 'drain', 'ditch') and t.get('tunnel') not in ('culvert', 'yes'):
        w = {'river': 8, 'stream': 3, 'canal': 4, 'drain': 1.6, 'ditch': 1.2}[t['waterway']]
        try: w = float((t.get('width') or str(w)).split()[0])
        except ValueError: pass
        # 線を区切って、それぞれのタイルへ
        allp = [P[x] for x in refs]
        chain, key = [], None
        for i in range(len(allp) - 1):
            a, c = allp[i], allp[i + 1]
            k2 = tile_of((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
            if k2 != key and chain:
                T(key)['w'].append({'w': w, 'p': chain}); chain = []
            if not chain: chain = [[r1(a[0]), r1(a[1])]]
            chain.append([r1(c[0]), r1(c[1])]); key = k2
        if chain: T(key)['w'].append({'w': w, 'p': chain})
for po in pois:
    T(tile_of(*po['p']))['p'].append(po)

# ---------------- 地図に建物がない通りに家を建てる（実際の郊外のように道沿いに並べる） ----------------
import random
random.seed(7)
G = 20.0
grid_seg, grid_b, grid_w = {}, {}, {}
def gput(grid, x0, z0, x1, z1, item):
    for i in range(int(x0 // G), int(x1 // G) + 1):
        for j in range(int(z0 // G), int(z1 // G) + 1): grid.setdefault((i, j), []).append(item)
def gget(grid, x, z, r):
    out = set()
    for i in range(int((x - r) // G), int((x + r) // G) + 1):
        for j in range(int((z - r) // G), int((z + r) // G) + 1):
            for it in grid.get((i, j), ()): out.add(id(it)) or None
    return [it for i in range(int((x - r) // G), int((x + r) // G) + 1) for j in range(int((z - r) // G), int((z + r) // G) + 1) for it in grid.get((i, j), ())]
for e in edges:
    for a, b in zip(e['pts'], e['pts'][1:]):
        gput(grid_seg, min(a[0], b[0]) - e['w'], min(a[1], b[1]) - e['w'], max(a[0], b[0]) + e['w'], max(a[1], b[1]) + e['w'], (a, b, e['w']))
for key, td in tiles.items():
    for b in td['b']:
        xs = [p[0] for p in b['p']]; zs = [p[1] for p in b['p']]
        gput(grid_b, min(xs), min(zs), max(xs), max(zs), b)
    for w in td['w']:
        for a, c in zip(w['p'], w['p'][1:]): gput(grid_w, min(a[0], c[0]) - w['w'], min(a[1], c[1]) - w['w'], max(a[0], c[0]) + w['w'], max(a[1], c[1]) + w['w'], (a, c, w['w']))
no_build = [a for td in tiles.values() for a in td['a'] if a['k'] in ('farmland', 'park', 'grass', 'meadow', 'water', 'wood', 'forest', 'cemetery', 'school', 'university', 'pitch', 'parking', 'railway', 'industrial', 'scrub', 'orchard', 'construction', 'recreation_ground', 'religious', 'hospital')] + [a for a in big_areas if a['k'] not in ('residential',)]
for a in no_build:
    xs = [p[0] for p in a['p']]; zs = [p[1] for p in a['p']]
    a['bb'] = (min(xs), min(zs), max(xs), max(zs))
    gput(grid_w, a['bb'][0], a['bb'][1], a['bb'][2], a['bb'][3], ('area', a))
def pip(x, z, pts):
    c = False
    for i in range(len(pts)):
        x1, z1 = pts[i]; x2, z2 = pts[i - 1]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1: c = not c
    return c
def seg_dist(px, pz, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dz * dz or 1e-9
    t = max(0, min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2))
    return math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t)
def free(poly, cx, cz):
    for p in poly + [(cx, cz)]:
        for a, b, w in gget(grid_seg, p[0], p[1], 12):
            if seg_dist(p[0], p[1], a, b) < w / 2 + 1.2: return False
        for it in gget(grid_w, p[0], p[1], 12):
            if it[0] == 'area':
                if pip(p[0], p[1], it[1]['p']): return False
            elif seg_dist(p[0], p[1], it[0], it[1]) < it[2] / 2 + 2: return False
    for b in gget(grid_b, cx, cz, 25):
        bp = b['p']
        if any(pip(p[0], p[1], bp) for p in poly) or any(pip(p[0], p[1], poly) for p in bp): return False
        if min(math.hypot(p[0] - cx, p[1] - cz) for p in bp) < 4.5: return False
    return True
added = 0
for e in edges:
    if e['cls'] not in ('residential', 'unclassified', 'tertiary', 'living_street'): continue
    pts = e['pts']; cum = [0]
    for a, b in zip(pts, pts[1:]): cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    L = cum[-1]
    if L < 25: continue
    for side in (1, -1):
        s = 9 + random.random() * 4
        while s < L - 9:
            i = 1
            while i < len(cum) - 1 and cum[i] < s: i += 1
            a, b = pts[i - 1], pts[i]
            t = (s - cum[i - 1]) / max(1e-6, cum[i] - cum[i - 1])
            dx, dz = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dz) or 1; dx /= l; dz /= l
            nx, nz = dz * side, -dx * side
            px, pz = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            wfront = 7.5 + random.random() * 3.5; depth = 7 + random.random() * 3; back = e['w'] / 2 + 3.2 + random.random() * 3.2 + (2 if e['cls'] == 'tertiary' else 0)
            cx, cz = px + nx * (back + depth / 2), pz + nz * (back + depth / 2)
            poly = [(cx + dx * u + nx * v, cz + dz * u + nz * v) for u, v in ((-wfront / 2, -depth / 2), (wfront / 2, -depth / 2), (wfront / 2, depth / 2), (-wfront / 2, depth / 2))]
            if inside((cx, cz), -10) and random.random() < 0.72 and free(poly, cx, cz):
                if area(poly) < 0: poly = poly[::-1]
                b = {'p': [[r1(x), r1(z)] for x, z in poly], 'k': 'house', 'g': 1}
                T(tile_of(cx, cz))['b'].append(b); gput(grid_b, cx - 8, cz - 8, cx + 8, cz + 8, b); added += 1
            s += wfront + 2.5 + random.random() * 3
print('generated houses', added)

# 全タイルを1つのファイルにまとめる（配信するファイル数を減らす）
json.dump(tiles, open(os.path.join(dst, 'tiles.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
world = {
    'meta': {'source': 'OpenStreetMap', 'attribution': '© OpenStreetMap contributors (ODbL)', 'center': [clat, clon], 'tile': TILE, 'ni': NI, 'nj': NJ},
    'bounds': [r1(-HX), r1(-HZ), r1(HX), r1(HZ)], 'tiles': sorted(tiles.keys()),
    'nodes': gnodes, 'edges': edges, 'rails': rails, 'signals': signals, 'crossings': crossings, 'bus': bus, 'bigAreas': big_areas,
}
json.dump(world, open(os.path.join(dst, 'world.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'bounds {2*HX:.0f}x{2*HZ:.0f}m nodes {len(gnodes)} edges {len(edges)} rails {len(rails)} signals {len(signals)} buildings {nb} tiles {len(tiles)} big {len(big_areas)}')
