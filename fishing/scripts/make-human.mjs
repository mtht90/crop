// MakeHuman の CC0 データ（素体・体型ターゲット・服・髪・肌・骨格・ウェイト）から、
// 骨入りの人物モデルを組み立てて、ゲームの読み込み形式（バッファと画像を埋め込んだ glTF JSON）に書き出す。
// 外部のプログラム（MakeHuman / MPFB / Blender）は使わず、データファイルだけを読む。
//
// node scripts/make-human.mjs <mpfb の data フォルダ> <MakeHuman システムアセットのフォルダ>
//   例: node scripts/make-human.mjs assets-src/makehuman/data assets-src/makehuman/system
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';

const [DATA, SYS] = process.argv.slice(2);
if (!DATA || !SYS) {
  console.error('usage: node scripts/make-human.mjs <mpfb-data> <system-assets>');
  process.exit(1);
}
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/assets/npc');

/** 釣り場の人。体型は MakeHuman のマクロ（0..1）、服・髪・肌はシステムアセットの名前 */
const PEOPLE = [
  // 釣り仲間ケンタ：20代の男性
  { id: 'kenta', gender: 1, age: 0.52, muscle: 0.6, weight: 0.45, skin: 'young_asian_male', hair: 'short02', hairColor: [0.1, 0.08, 0.07], clothes: ['male_casualsuit05', 'shoes02'], eyes: 'brown', brows: 'eyebrow001' },
  // 近所のおばあちゃんハル
  { id: 'haru', gender: 0, age: 0.97, muscle: 0.3, weight: 0.55, skin: 'old_asian_female', hair: 'bob02', hairColor: [0.62, 0.6, 0.58], clothes: ['female_elegantsuit01', 'shoes01'], eyes: 'brown', brows: 'eyebrow002' },
  // 漁師ゲンジ：60代の男性、作業着
  { id: 'genji', gender: 1, age: 0.8, muscle: 0.7, weight: 0.6, skin: 'middleage_asian_male', hair: 'short04', hairColor: [0.35, 0.34, 0.33], clothes: ['male_worksuit01', 'shoes04'], eyes: 'brown', brows: 'eyebrow006' },
  // 料理屋の大将ヒデ：40代の男性
  { id: 'hide', gender: 1, age: 0.66, muscle: 0.5, weight: 0.7, skin: 'middleage_asian_male', hair: 'short01', hairColor: [0.09, 0.08, 0.07], clothes: ['male_casualsuit06', 'shoes02'], eyes: 'brown', brows: 'eyebrow001' },
  // 水族館の飼育員サキ：20代の女性
  { id: 'saki', gender: 0, age: 0.5, muscle: 0.45, weight: 0.4, skin: 'young_asian_female', hair: 'ponytail01', hairColor: [0.09, 0.07, 0.06], clothes: ['female_casualsuit01', 'shoes03'], eyes: 'brown', brows: 'eyebrow009' },
];

// ---------------- 読み込み ----------------

function parseObj(file) {
  const v = [];
  const vt = [];
  const faces = [];
  let group = '';
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'vt') vt.push([+p[1], +p[2]]);
    else if (p[0] === 'g') group = p[1] ?? '';
    else if (p[0] === 'f') {
      const c = p.slice(1).map((s) => {
        const [a, b] = s.split('/');
        return [+a - 1, b ? +b - 1 : -1];
      });
      faces.push({ c, group });
    }
  }
  return { v, vt, faces };
}

function readTarget(rel) {
  const file = path.join(DATA, 'targets', rel + '.target.gz');
  if (!fs.existsSync(file)) return null;
  const out = [];
  for (const line of zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n')) {
    if (!line || line[0] === '#') continue;
    const p = line.trim().split(/\s+/);
    if (p.length >= 4) out.push([+p[0], +p[1], +p[2], +p[3]]);
  }
  return out;
}

/** macro.json の区間で値を2つの名前の重みに分ける */
function interp(parts, value) {
  const out = [];
  for (const pt of parts) {
    if (value > pt.lowest && value < pt.highest) {
      const k = (value - pt.lowest) / (pt.highest - pt.lowest);
      if (pt.low) out.push([pt.low, 1 - k]);
      if (pt.high) out.push([pt.high, k]);
    }
  }
  return out;
}

/** 体型ターゲットの重ね合わせ（人種×性別×年齢、性別×年齢×筋肉×体重） */
function macroStack(p) {
  const macro = JSON.parse(fs.readFileSync(path.join(DATA, 'targets/macrodetails/macro.json'), 'utf8')).macrotargets;
  const g = interp(macro.gender.parts, p.gender);
  const a = interp(macro.age.parts, p.age);
  const m = interp(macro.muscle.parts, p.muscle);
  const w = interp(macro.weight.parts, p.weight);
  const stack = [];
  for (const [an, aw] of a) for (const [gn, gw] of g) stack.push([`macrodetails/asian-${gn}-${an}`, gw * aw]);
  for (const [gn, gw] of g) for (const [an, aw] of a) for (const [mn, mw] of m) for (const [wn, ww] of w) stack.push([`macrodetails/universal-${gn}-${an}-${mn}-${wn}`, gw * aw * mw * ww]);
  return stack.filter((s) => s[1] > 0.01);
}

function parseMhclo(file) {
  const refs = [];
  const del = new Set();
  const scale = {};
  let mode = '';
  let obj = '';
  let material = '';
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const p = line.split(/\s+/);
    if (p[0] === 'obj_file') obj = p[1];
    else if (p[0] === 'material') material = p[1];
    else if (p[0] === 'x_scale' || p[0] === 'y_scale' || p[0] === 'z_scale') scale[p[0][0]] = [+p[1], +p[2], +p[3]];
    else if (p[0] === 'verts') mode = 'verts';
    else if (p[0] === 'delete_verts') mode = 'delete';
    // 他の項目（material など）は verts の途中にも出てくるので、数字の行の読み方は変えない
    else if (/^[a-z_]+$/.test(p[0])) continue;
    else if (mode === 'verts') {
      if (p.length === 1) refs.push({ v: [+p[0], +p[0], +p[0]], w: [1, 0, 0], d: [0, 0, 0] });
      else refs.push({ v: [+p[0], +p[1], +p[2]], w: [+p[3], +p[4], +p[5]], d: [+p[6], +p[7], +p[8]] });
    } else if (mode === 'delete') {
      for (let i = 0; i < p.length; i++) {
        if (p[i + 1] === '-') {
          for (let k = +p[i]; k <= +p[i + 2]; k++) del.add(k);
          i += 2;
        } else del.add(+p[i]);
      }
    }
  }
  return { refs, del, scale, obj, material, dir: path.dirname(file) };
}

function parseMhmat(file) {
  const out = { color: [1, 1, 1], transparent: false, backfaceCull: true };
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const p = raw.trim().split(/\s+/);
    if (p[0] === 'diffuseTexture') out.diffuse = path.join(path.dirname(file), p[1]);
    else if (p[0] === 'normalmapTexture') out.normal = path.join(path.dirname(file), p[1]);
    else if (p[0] === 'diffuseColor') out.color = [+p[1], +p[2], +p[3]];
    else if (p[0] === 'transparent') out.transparent = p[1] === 'True';
    else if (p[0] === 'backfaceCull') out.backfaceCull = p[1] !== 'False';
  }
  return out;
}

function findAsset(kind, name, ext) {
  const dir = path.join(SYS, kind, name);
  const f = fs.readdirSync(dir).find((x) => x.endsWith(ext));
  return f ? path.join(dir, f) : null;
}

// ---------------- 組み立て ----------------

async function imageUri(file, size, alpha) {
  const img = sharp(file).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true });
  const buf = alpha ? await img.png({ compressionLevel: 9, palette: false }).toBuffer() : await img.jpeg({ quality: 82 }).toBuffer();
  return `data:image/${alpha ? 'png' : 'jpeg'};base64,${buf.toString('base64')}`;
}

async function build(person, base, rig, weights) {
  // 1. 体型
  const P = base.v.map((x) => x.slice());
  for (const [rel, w] of macroStack(person)) {
    const t = readTarget(rel);
    if (!t) {
      console.warn('  missing target', rel);
      continue;
    }
    for (const [i, dx, dy, dz] of t) {
      P[i][0] += dx * w;
      P[i][1] += dy * w;
      P[i][2] += dz * w;
    }
  }
  // 頂点が属するグループ（関節の立方体）
  const groupVerts = new Map();
  for (const f of base.faces) {
    if (!groupVerts.has(f.group)) groupVerts.set(f.group, new Set());
    for (const [vi] of f.c) groupVerts.get(f.group).add(vi);
  }
  const meanOf = (idx) => {
    const s = [0, 0, 0];
    for (const i of idx) for (let k = 0; k < 3; k++) s[k] += P[i][k];
    return s.map((x) => x / Math.max(1, idx.length));
  };
  const pointOf = (spec) => {
    if (spec.strategy === 'CUBE') return meanOf([...(groupVerts.get(spec.cube_name) ?? [])]);
    if (spec.strategy === 'MEAN' || spec.strategy === 'VERTEX') return meanOf(spec.vertex_indices ?? [spec.vertex_index]);
    throw new Error('strategy ' + spec.strategy);
  };
  // 2. 骨格（MakeHuman 座標 dm、Y 上）→ m
  const S = 0.1;
  const ground = pointOf(rig.Root.head);
  const toM = (p) => [(p[0] - ground[0]) * S, (p[1] - ground[1]) * S, (p[2] - ground[2]) * S];
  const boneNames = Object.keys(rig);
  const heads = {};
  for (const b of boneNames) heads[b] = toM(pointOf(rig[b].head));
  // 親から先に並べる
  const order = [];
  const visit = (b) => {
    if (order.includes(b)) return;
    if (rig[b].parent) visit(rig[b].parent);
    order.push(b);
  };
  boneNames.forEach(visit);
  const boneIndex = Object.fromEntries(order.map((b, i) => [b, i]));

  // 3. 素体のウェイト（頂点ごと）
  const vw = Array.from({ length: P.length }, () => []);
  for (const [b, list] of Object.entries(weights)) {
    if (!(b in boneIndex)) continue;
    for (const [vi, w] of list) vw[vi].push([boneIndex[b], w]);
  }

  const meshes = [];
  // 服で隠れる素体の頂点は消す（突き抜け防止）
  const hidden = new Set();
  const clothes = person.clothes.map((c) => parseMhclo(findAsset('clothes', c, '.mhclo')));
  for (const c of clothes) for (const d of c.del) hidden.add(d);

  // 素体（body グループのみ）
  {
    const faces = base.faces.filter((f) => f.group === 'body' && !f.c.every(([vi]) => hidden.has(vi)));
    const skinMat = parseMhmat(findAsset('skins', person.skin, '.mhmat'));
    meshes.push({ name: 'body', pos: (vi) => P[vi], weights: (vi) => vw[vi], vt: base.vt, faces, mat: { ...skinMat, name: 'skin', color: [skinMat.color[0] * 0.95, skinMat.color[1] * 0.85, skinMat.color[2] * 0.78] } });
  }
  // 服・髪・目・眉・まつげ（mhclo で素体に沿わせる）
  const proxy = (clo, name, matOverride = {}) => {
    const obj = parseObj(path.join(clo.dir, clo.obj));
    if (obj.v.length !== clo.refs.length) console.warn(`  ${name}: obj ${obj.v.length} verts / mhclo ${clo.refs.length} refs`);
    const sc = {};
    for (const ax of ['x', 'y', 'z']) {
      const s = clo.scale[ax];
      const k = { x: 0, y: 1, z: 2 }[ax];
      sc[ax] = s ? Math.abs(P[s[0]][k] - P[s[1]][k]) / s[2] : 1;
    }
    const pos = clo.refs.map((r) => {
      const o = [0, 0, 0];
      for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[k] += P[r.v[j]][k] * r.w[j];
      return [o[0] + r.d[0] * sc.x, o[1] + r.d[1] * sc.y, o[2] + r.d[2] * sc.z];
    });
    const wts = clo.refs.map((r) => {
      const acc = new Map();
      for (let j = 0; j < 3; j++) for (const [b, w] of vw[r.v[j]]) acc.set(b, (acc.get(b) ?? 0) + w * r.w[j]);
      return [...acc.entries()];
    });
    const mat = { ...parseMhmat(path.join(clo.dir, clo.material)), name, ...matOverride };
    meshes.push({ name, pos: (vi) => pos[vi], weights: (vi) => wts[vi], vt: obj.vt, faces: obj.faces, mat });
  };
  clothes.forEach((c, i) => proxy(c, person.clothes[i]));
  proxy(parseMhclo(findAsset('hair', person.hair, '.mhclo')), 'hair', { tint: person.hairColor, transparent: true, backfaceCull: false });
  proxy(parseMhclo(findAsset('eyebrows', person.brows, '.mhclo')), 'brows', { transparent: true, backfaceCull: false, tint: person.hairColor.map((x) => Math.min(1, x * 1.6)) });
  proxy(parseMhclo(findAsset('eyelashes', 'eyelashes01', '.mhclo')), 'lashes', { transparent: true, backfaceCull: false });
  proxy(parseMhclo(path.join(SYS, 'eyes/low-poly/low-poly.mhclo')), 'eyes', { diffuse: path.join(SYS, 'eyes/materials', `${person.eyes}_eye.png`), transparent: false });

  // ---------------- glTF ----------------
  const chunks = [];
  let byteLen = 0;
  const bufferViews = [];
  const accessors = [];
  const pushView = (typed, target) => {
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (byteLen % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      byteLen += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: byteLen, byteLength: buf.length, ...(target ? { target } : {}) });
    chunks.push(buf);
    byteLen += buf.length;
    return bufferViews.length - 1;
  };
  const pushAccessor = (typed, type, componentType, count, extra = {}, target) => {
    accessors.push({ bufferView: pushView(typed, target), componentType, count, type, ...extra });
    return accessors.length - 1;
  };

  const images = [];
  const textures = [];
  const materials = [];
  const gltfMeshes = [];
  const nodes = [];
  const texCache = new Map();
  const tex = async (file, alpha) => {
    if (!file || !fs.existsSync(file)) return undefined;
    const key = file + alpha;
    if (!texCache.has(key)) {
      images.push({ uri: await imageUri(file, alpha ? 512 : 1024, alpha) });
      textures.push({ source: images.length - 1, sampler: 0 });
      texCache.set(key, textures.length - 1);
    }
    return texCache.get(key);
  };

  for (const m of meshes) {
    // (頂点, UV) の組ごとに頂点を分ける。四角形は三角形2つに
    const key = new Map();
    const pos = [];
    const uv = [];
    const joints = [];
    const wts = [];
    const src = [];
    const idx = [];
    const vert = (vi, ti) => {
      const k = vi * 100000 + (ti + 1);
      let i = key.get(k);
      if (i === undefined) {
        i = pos.length / 3;
        key.set(k, i);
        const p = m.pos(vi);
        pos.push(p[0] * S - ground[0] * S, p[1] * S - ground[1] * S, p[2] * S - ground[2] * S);
        const t = ti >= 0 ? m.vt[ti] : [0, 0];
        uv.push(t[0], 1 - t[1]);
        const w = m.weights(vi).slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = w.reduce((a, x) => a + x[1], 0) || 1;
        for (let j = 0; j < 4; j++) {
          joints.push(w[j] ? w[j][0] : 0);
          wts.push(w[j] ? w[j][1] / sum : 0);
        }
        if (!w.length) wts[wts.length - 4] = 1;
        src.push(vi);
      }
      return i;
    };
    for (const f of m.faces) {
      const c = f.c.map(([vi, ti]) => vert(vi, ti));
      for (let k = 1; k + 1 < c.length; k++) idx.push(c[0], c[k], c[k + 1]);
    }
    // 法線：同じ元頂点（UV の継ぎ目）で共有してなめらかに
    const nAcc = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
      const e1 = [pos[b * 3] - ax, pos[b * 3 + 1] - ay, pos[b * 3 + 2] - az];
      const e2 = [pos[c * 3] - ax, pos[c * 3 + 1] - ay, pos[c * 3 + 2] - az];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (const v of [a, b, c]) {
        const s = src[v];
        const acc = nAcc.get(s) ?? [0, 0, 0];
        acc[0] += n[0];
        acc[1] += n[1];
        acc[2] += n[2];
        nAcc.set(s, acc);
      }
    }
    const nor = new Float32Array(pos.length);
    for (let i = 0; i < src.length; i++) {
      const n = nAcc.get(src[i]) ?? [0, 1, 0];
      const l = Math.hypot(...n) || 1;
      nor.set([n[0] / l, n[1] / l, n[2] / l], i * 3);
    }
    const P32 = new Float32Array(pos);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P32.length; i += 3) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], P32[i + k]);
      max[k] = Math.max(max[k], P32[i + k]);
    }
    const count = P32.length / 3;
    const attributes = {
      POSITION: pushAccessor(P32, 'VEC3', 5126, count, { min, max }, 34962),
      NORMAL: pushAccessor(nor, 'VEC3', 5126, count, {}, 34962),
      TEXCOORD_0: pushAccessor(new Float32Array(uv), 'VEC2', 5126, count, {}, 34962),
      JOINTS_0: pushAccessor(new Uint8Array(joints), 'VEC4', 5121, count, {}, 34962),
      WEIGHTS_0: pushAccessor(new Float32Array(wts), 'VEC4', 5126, count, {}, 34962),
    };
    const indices = pushAccessor(new Uint32Array(idx), 'SCALAR', 5125, idx.length, {}, 34963);
    // 材質
    const mt = m.mat;
    const alpha = !!mt.transparent;
    const baseTex = await tex(mt.diffuse, alpha);
    const color = mt.tint ?? mt.color ?? [1, 1, 1];
    materials.push({
      name: mt.name,
      pbrMetallicRoughness: { baseColorFactor: [color[0], color[1], color[2], 1], metallicFactor: 0, roughnessFactor: m.name === 'eyes' ? 0.2 : 0.85, ...(baseTex !== undefined ? { baseColorTexture: { index: baseTex } } : {}) },
      ...(alpha ? { alphaMode: 'MASK', alphaCutoff: 0.45 } : {}),
      ...(mt.backfaceCull === false ? { doubleSided: true } : {}),
    });
    gltfMeshes.push({ name: m.name, primitives: [{ attributes, indices, material: materials.length - 1 }] });
  }

  // 骨のノード（回転なし、親からの相対位置）
  const jointNodes = order.map((b) => {
    const h = heads[b];
    const p = rig[b].parent ? heads[rig[b].parent] : [0, 0, 0];
    return { name: b, translation: [h[0] - p[0], h[1] - p[1], h[2] - p[2]] };
  });
  const firstJoint = nodes.length;
  nodes.push(...jointNodes);
  order.forEach((b, i) => {
    const kids = order.map((c, j) => (rig[c].parent === b ? firstJoint + j : -1)).filter((x) => x >= 0);
    if (kids.length) nodes[firstJoint + i].children = kids;
  });
  const ibm = new Float32Array(order.length * 16);
  order.forEach((b, i) => {
    const h = heads[b];
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -h[0], -h[1], -h[2], 1], i * 16);
  });
  const ibmAcc = pushAccessor(ibm, 'MAT4', 5126, order.length);
  const skin = { joints: order.map((_, i) => firstJoint + i), inverseBindMatrices: ibmAcc, skeleton: firstJoint };
  const meshNodes = gltfMeshes.map((_, i) => {
    nodes.push({ name: gltfMeshes[i].name, mesh: i, skin: 0 });
    return nodes.length - 1;
  });
  nodes.push({ name: person.id, children: [firstJoint, ...meshNodes] });
  const root = nodes.length - 1;
  const bin = Buffer.concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator: 'make-human.mjs (MakeHuman CC0 data)' },
    scene: 0,
    scenes: [{ nodes: [root] }],
    nodes,
    meshes: gltfMeshes,
    skins: [skin],
    materials,
    textures,
    images,
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString('base64')}` }],
  };
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `${person.id}.json`);
  fs.writeFileSync(out, JSON.stringify(gltf));
  const height = Math.max(...meshes[0].faces.flatMap((f) => f.c.map(([vi]) => (P[vi][1] - ground[1]) * S)));
  console.log(person.id, `${Math.round(fs.statSync(out).size / 1024)}KB`, `height ${height.toFixed(2)}m`, `bones ${order.length}`);
}

const base = parseObj(path.join(DATA, '3dobjs/base.obj'));
const rig = JSON.parse(fs.readFileSync(path.join(DATA, 'rigs/standard/rig.game_engine.json'), 'utf8'));
const weights = JSON.parse(fs.readFileSync(path.join(DATA, 'rigs/standard/weights.game_engine.json'), 'utf8')).weights;
const only = process.argv[4];
for (const p of PEOPLE) if (!only || only.split(',').includes(p.id)) await build(p, base, rig, weights);
