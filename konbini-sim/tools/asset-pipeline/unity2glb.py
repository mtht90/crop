# Convert a Unity prefab (with its YAML meshes / FBX meshes / .mat materials)
# into a GLB, using Blender (bpy) for assembly and export.
#
# usage: python unity2glb.py -- <unity project root> <prefab path> <out.glb> [texsize]
#
# Coordinate conversion: Unity is left-handed Y-up. A Unity vector u maps to
# Blender (right-handed, Z-up) as C·u with C = [[-1,0,0],[0,0,-1],[0,1,0]];
# the glTF exporter then converts Blender Z-up to glTF Y-up.
import bpy, bmesh, sys, os, re, math, struct
import numpy as np
import yaml
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
ROOT, PREFAB, OUT = argv[0], argv[1], argv[2]
TEXSIZE = int(argv[3]) if len(argv) > 3 else 1024

C = Matrix(((-1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
C_INV = C.inverted()

# ------------------------------------------------------------------ GUID index
GUID = {}
for dp, _, fs in os.walk(ROOT):
    if '/.git' in dp:
        continue
    for f in fs:
        if f.endswith('.meta'):
            p = os.path.join(dp, f)
            with open(p, errors='ignore') as fh:
                for line in fh:
                    if line.startswith('guid:'):
                        GUID[line.split()[1]] = p[:-5]
                        break

DOC_RE = re.compile(r'^--- !u!(\d+) &(-?\d+)( stripped)?\s*$', re.M)


def load_unity_yaml(path):
    """Return {fileID: (classID, dict, stripped)}."""
    text = open(path, encoding='utf-8', errors='ignore').read()
    # keep long hex blobs as strings (YAML would read '12e45' as a float)
    text = re.sub(r'(m_IndexBuffer|_typelessdata): ([0-9a-fA-F]+)', r'\1: "\2"', text)
    out = {}
    parts = DOC_RE.split(text)
    # parts: [header, cls, id, stripped, body, cls, id, stripped, body, ...]
    for i in range(1, len(parts), 4):
        cls, fid, stripped, body = int(parts[i]), int(parts[i + 1]), bool(parts[i + 2]), parts[i + 3]
        try:
            data = yaml.safe_load(body) or {}
        except yaml.YAMLError:
            data = {}
        inner = next(iter(data.values())) if isinstance(data, dict) and data else {}
        out[fid] = (cls, inner if isinstance(inner, dict) else {}, stripped)
    return out


# ------------------------------------------------------------------ meshes
FMT = {0: ('f', 4), 1: ('e', 2), 2: ('B', 1), 3: ('b', 1), 4: ('H', 2), 5: ('h', 2), 6: ('B', 1), 7: ('b', 1), 8: ('H', 2), 9: ('h', 2), 10: ('I', 4), 11: ('i', 4)}
NORM = {2: 255.0, 3: 127.0, 4: 65535.0, 5: 32767.0}


def decode_unity_mesh(m):
    vd = m['m_VertexData']
    n = int(vd['m_VertexCount'])
    raw = bytes.fromhex(str(vd['_typelessdata']).strip())
    chans = vd['m_Channels']
    # stream layout
    streams = {}
    for ci, ch in enumerate(chans):
        dim = int(ch['dimension']) & 0xF
        if dim == 0:
            continue
        s = int(ch['stream'])
        size = FMT[int(ch['format'])][1] * dim
        streams.setdefault(s, 0)
        streams[s] = max(streams[s], int(ch['offset']) + size)
    stride = {s: v for s, v in streams.items()}
    base = {}
    off = 0
    for s in sorted(stride):
        base[s] = off
        off += stride[s] * n
        off = (off + 15) & ~15
    def read(ci):
        ch = chans[ci]
        dim = int(ch['dimension']) & 0xF
        if dim == 0:
            return None
        f = int(ch['format'])
        code, size = FMT[f]
        s = int(ch['stream'])
        arr = np.zeros((n, dim), dtype=np.float32)
        st = stride[s]
        b0 = base[s] + int(ch['offset'])
        for i in range(n):
            vals = struct.unpack_from('<' + code * dim, raw, b0 + i * st)
            arr[i] = vals
        if f in NORM:
            arr /= NORM[f]
        return arr
    pos = read(0)
    nrm = read(1) if len(chans) > 1 else None
    uv = read(4) if len(chans) > 4 else None
    ib = bytes.fromhex(str(m['m_IndexBuffer']).strip())
    idx32 = int(m.get('m_IndexFormat', 0)) == 1
    subs = []
    for sm in m['m_SubMeshes']:
        first = int(sm['firstByte'])
        cnt = int(sm['indexCount'])
        bv = int(sm.get('baseVertex', 0))
        if idx32:
            ids = np.frombuffer(ib, dtype='<u4', count=cnt, offset=first).astype(np.int64)
        else:
            ids = np.frombuffer(ib, dtype='<u2', count=cnt, offset=first).astype(np.int64)
        subs.append(ids + bv)
    return pos, nrm, uv, subs


MESH_CACHE = {}


def mesh_from_asset(path, file_id):
    key = (path, file_id)
    if key in MESH_CACHE:
        return MESH_CACHE[key]
    docs = load_unity_yaml(path)
    m = docs.get(file_id) or next((d for d in docs.values() if d[0] == 43), None)
    if not m:
        return None
    pos, nrm, uv, subs = decode_unity_mesh(m[1])
    me = bpy.data.meshes.new(m[1].get('m_Name', 'mesh'))
    # Unity -> Blender coordinates
    P = np.stack([-pos[:, 0], -pos[:, 2], pos[:, 1]], 1)
    faces, mat_idx = [], []
    for si, ids in enumerate(subs):
        tris = ids.reshape(-1, 3)[:, ::-1]  # handedness flip reverses winding
        faces.extend(tris.tolist())
        mat_idx.extend([si] * len(tris))
    me.from_pydata(P.tolist(), [], faces)
    me.polygons.foreach_set('material_index', mat_idx)
    if uv is not None:
        uvl = me.uv_layers.new(name='UVMap')
        loops = np.array([v for f in faces for v in f])
        uvs = uv[loops][:, :2].copy()
        uvl.data.foreach_set('uv', uvs.ravel())
    if nrm is not None:
        N = np.stack([-nrm[:, 0], -nrm[:, 2], nrm[:, 1]], 1)
        me.normals_split_custom_set_from_vertices(N.tolist())
    me.validate()
    MESH_CACHE[key] = (me, len(subs))
    return MESH_CACHE[key]


FBX_CACHE = {}


def mesh_from_fbx(path, file_id):
    """Look up a mesh inside an FBX via the .meta internalIDToNameTable."""
    meta = open(path + '.meta', errors='ignore').read()
    name = None
    m = re.search(r'-\s*first:\s*\n\s*43:\s*%d\s*\n\s*second:\s*(.+)' % file_id, meta)
    if m:
        name = m.group(1).strip()
    else:
        m = re.search(r'^\s*%d:\s*(.+)$' % file_id, meta, re.M)  # legacy fileIDToRecycleName
        if m:
            name = m.group(1).strip().strip('"').split('//')[-1]
    if path not in FBX_CACHE:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=path, use_anim=False)
        new = [o for o in bpy.data.objects if o not in before]
        FBX_CACHE[path] = {}
        for o in new:
            if o.type == 'MESH':
                me = o.data.copy()
                # bake FBX->Unity conventions: Unity mesh space is FBX space with x negated;
                # in Blender coords that equals a +90deg X rotation of the raw FBX data.
                sc = o.matrix_world.to_scale()
                me.transform(Matrix.Rotation(math.radians(90), 4, 'X') @ Matrix.Diagonal((sc[0], sc[0], sc[0], 1)))
                FBX_CACHE[path][o.name] = me
                FBX_CACHE[path][o.data.name] = me
            bpy.data.objects.remove(o, do_unlink=True)
    table = FBX_CACHE[path]
    me = table.get(name) if name else None
    if me is None and table:
        me = next(iter(table.values()))
    return (me, len(me.materials) or 1) if me else None


BUILTIN = {10202: 'cube', 10206: 'cylinder', 10207: 'sphere', 10209: 'plane', 10210: 'quad'}


def builtin_mesh(kind):
    key = ('builtin', kind)
    if key in MESH_CACHE:
        return MESH_CACHE[key]
    bm = bmesh.new()
    if kind == 'cube':
        bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    elif kind == 'cylinder':
        bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.5, radius2=0.5, depth=2.0, calc_uvs=True)
    elif kind == 'sphere':
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.5, calc_uvs=True)
    else:
        size = 10.0 if kind == 'plane' else 1.0
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2, calc_uvs=True)
        if kind == 'plane':
            pass  # Unity plane lies in XZ (Blender XY) facing up: grid already faces +Z
        else:
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    me = bpy.data.meshes.new(kind)
    bm.to_mesh(me)
    bm.free()
    MESH_CACHE[key] = (me, 1)
    return MESH_CACHE[key]


# ------------------------------------------------------------------ materials
MAT_CACHE = {}
IMG_CACHE = {}


def load_img(guid, colorspace):
    p = GUID.get(guid)
    if not p or not os.path.exists(p):
        return None
    key = (p, colorspace)
    if key in IMG_CACHE:
        return IMG_CACHE[key]
    try:
        img = bpy.data.images.load(p, check_existing=False)
    except RuntimeError:
        return None
    img.colorspace_settings.name = colorspace
    if img.size[0] > TEXSIZE or img.size[1] > TEXSIZE:
        s = TEXSIZE / max(img.size)
        img.scale(max(1, int(img.size[0] * s)), max(1, int(img.size[1] * s)))
    IMG_CACHE[key] = img
    return img


def prop(props, section, name):
    for e in props.get(section, []) or []:
        if isinstance(e, dict) and name in e:
            return e[name]
    return None


def material_from_ref(ref):
    guid = ref.get('guid') if isinstance(ref, dict) else None
    if not guid:
        return None
    if guid in MAT_CACHE:
        return MAT_CACHE[guid]
    path = GUID.get(guid)
    if not path or not path.endswith('.mat'):
        MAT_CACHE[guid] = None
        return None
    docs = load_unity_yaml(path)
    d = next((v[1] for v in docs.values() if v[0] == 21), {})
    sp = d.get('m_SavedProperties', {})
    mat = bpy.data.materials.new(d.get('m_Name', 'mat'))
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    col = prop(sp, 'm_Colors', '_Color') or prop(sp, 'm_Colors', '_BaseColor') or {'r': 1, 'g': 1, 'b': 1, 'a': 1}
    rgba = (float(col['r']), float(col['g']), float(col['b']), float(col.get('a', 1)))
    # Unity colours are sRGB; Blender wants linear
    lin = [c ** 2.2 for c in rgba[:3]]
    bsdf.inputs['Base Color'].default_value = (*lin, 1)
    metal = prop(sp, 'm_Floats', '_Metallic')
    gloss = prop(sp, 'm_Floats', '_Glossiness')
    if gloss is None:
        gloss = prop(sp, 'm_Floats', '_Smoothness')
    bsdf.inputs['Metallic'].default_value = float(metal or 0)
    bsdf.inputs['Roughness'].default_value = 1 - float(gloss if gloss is not None else 0.4)
    tex = prop(sp, 'm_TexEnvs', '_MainTex') or prop(sp, 'm_TexEnvs', '_BaseMap')
    img = load_img(tex['m_Texture'].get('guid'), 'sRGB') if tex and isinstance(tex.get('m_Texture'), dict) else None
    if img:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img
        if any(abs(c - 1) > 0.01 for c in rgba[:3]):
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1
            nt.links.new(t.outputs['Color'], mix.inputs[6])
            mix.inputs[7].default_value = (*lin, 1)
            nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        else:
            nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    nrm = prop(sp, 'm_TexEnvs', '_BumpMap')
    nimg = load_img(nrm['m_Texture'].get('guid'), 'Non-Color') if nrm and isinstance(nrm.get('m_Texture'), dict) else None
    if nimg:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = nimg
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    emi = prop(sp, 'm_Colors', '_EmissionColor')
    kw = ' '.join(d.get('m_ValidKeywords') or []) + ' ' + str(d.get('m_ShaderKeywords', ''))
    if emi and '_EMISSION' in kw and (float(emi['r']) + float(emi['g']) + float(emi['b'])) > 0.05:
        bsdf.inputs['Emission Color'].default_value = (float(emi['r']), float(emi['g']), float(emi['b']), 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    mode = prop(sp, 'm_Floats', '_Mode') or prop(sp, 'm_Floats', '_Surface')
    if (mode and float(mode) >= 2) or rgba[3] < 0.99 or 'Glass' in mat.name or 'transparent' in mat.name.lower():
        mat.blend_method = 'BLEND'
        bsdf.inputs['Alpha'].default_value = min(rgba[3], 0.35) if 'lass' in mat.name else rgba[3]
    MAT_CACHE[guid] = mat
    return mat


# ------------------------------------------------------------------ prefab

def trs_matrix(t):
    p = t.get('m_LocalPosition', {'x': 0, 'y': 0, 'z': 0})
    r = t.get('m_LocalRotation', {'x': 0, 'y': 0, 'z': 0, 'w': 1})
    s = t.get('m_LocalScale', {'x': 1, 'y': 1, 'z': 1})
    M = Matrix.Translation(Vector((float(p['x']), float(p['y']), float(p['z'])))) @ \
        Quaternion((float(r['w']), float(r['x']), float(r['y']), float(r['z']))).to_matrix().to_4x4() @ \
        Matrix.Diagonal((float(s['x']), float(s['y']), float(s['z']), 1))
    return C @ M @ C_INV


def build_prefab(path, parent, overrides=None, depth=0):
    docs = load_unity_yaml(path)
    go_of = {}
    for fid, (cls, d, stripped) in docs.items():
        if cls in (4, 224) and not stripped:
            go_of[fid] = d.get('m_GameObject', {}).get('fileID')
    objs = {}

    def make(fid, blender_parent):
        cls, t, _ = docs[fid]
        go = docs.get(t.get('m_GameObject', {}).get('fileID'), (None, {}, False))[1]
        if go and int(go.get('m_IsActive', 1)) == 0:
            return
        ob = bpy.data.objects.new(go.get('m_Name', 'node'), None)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = blender_parent
        M = trs_matrix(t)
        if overrides and fid == root_tf:
            M = overrides_apply(t, overrides)
        ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.matrix_basis = M
        objs[fid] = ob
        # mesh components
        mesh_ref, mats = None, []
        for comp in go.get('m_Component', []) or []:
            cid = comp.get('component', {}).get('fileID')
            if cid not in docs:
                continue
            ccls, cd, _ = docs[cid]
            if ccls == 33:
                mesh_ref = cd.get('m_Mesh')
            elif ccls in (23, 137):
                if int(cd.get('m_Enabled', 1)) == 0:
                    mats = None
                else:
                    mats = [material_from_ref(r) for r in cd.get('m_Materials', []) or []]
                if ccls == 137:
                    mesh_ref = cd.get('m_Mesh')
        if mesh_ref and mats is not None:
            src = None
            g = mesh_ref.get('guid')
            fidm = int(mesh_ref.get('fileID', 0))
            if g == '0000000000000000e000000000000000' and fidm in BUILTIN:
                src = builtin_mesh(BUILTIN[fidm])
            elif g in GUID:
                p = GUID[g]
                if p.lower().endswith(('.asset', '.mesh')):
                    src = mesh_from_asset(p, fidm)
                elif p.lower().endswith('.fbx'):
                    src = mesh_from_fbx(p, fidm)
            if src and src[0]:
                me = src[0].copy()
                me.materials.clear()
                for i in range(max(src[1], 1)):
                    me.materials.append(mats[min(i, len(mats) - 1)] if mats else None)
                mo = bpy.data.objects.new(ob.name + '_mesh', me)
                bpy.context.scene.collection.objects.link(mo)
                mo.parent = ob
        for ch in t.get('m_Children', []) or []:
            cf = ch.get('fileID')
            if cf in docs and not docs[cf][2]:
                make(cf, ob)

    def overrides_apply(t, ov):
        t2 = dict(t)
        for k, comps in ov.items():
            t2[k] = {**(t.get(k) or {}), **comps}
        return trs_matrix(t2)

    roots = [fid for fid, (cls, d, s) in docs.items() if cls in (4, 224) and not s and not (d.get('m_Father') or {}).get('fileID')]
    root_tf = roots[0] if roots else None
    for r in roots:
        make(r, parent)
    # nested prefab instances
    for fid, (cls, d, s) in docs.items():
        if cls != 1001 or depth > 4:
            continue
        mod = d.get('m_Modification', {})
        src = GUID.get((d.get('m_SourcePrefab') or {}).get('guid'))
        if not src:
            continue
        if src.lower().endswith('.fbx'):
            ov = {}
            for m in mod.get('m_Modifications', []) or []:
                pp = m.get('propertyPath', '')
                for key in ('m_LocalPosition', 'm_LocalRotation', 'm_LocalScale'):
                    if pp.startswith(key + '.'):
                        ov.setdefault(key, {})[pp.split('.')[1]] = float(m.get('value'))
            tp = (mod.get('m_TransformParent') or {}).get('fileID')
            import_fbx_model(src, objs.get(tp, parent), ov)
            continue
        if not src.endswith('.prefab'):
            continue
        ov = {}
        for m in mod.get('m_Modifications', []) or []:
            pp = m.get('propertyPath', '')
            for key in ('m_LocalPosition', 'm_LocalRotation', 'm_LocalScale'):
                if pp.startswith(key + '.'):
                    ov.setdefault(key, {})[pp.split('.')[1]] = float(m.get('value'))
        tp = (mod.get('m_TransformParent') or {}).get('fileID')
        par = objs.get(tp, parent)
        build_prefab(src, par, ov, depth + 1)


def fbx_material_map(path):
    """Material name -> .mat guid from the .fbx.meta externalObjects remap table."""
    meta = open(path + '.meta', errors='ignore').read()
    out = {}
    for m in re.finditer(r'type: UnityEngine:Material\s*\n\s*assembly:[^\n]*\n\s*name: ([^\n]+)\n\s*second: \{fileID: \d+, guid: ([0-9a-f]+)', meta):
        out[m.group(1).strip()] = m.group(2)
    return out


MAT_NAMES = {}
for g, p in GUID.items():
    if p.endswith('.mat'):
        MAT_NAMES.setdefault(os.path.basename(p)[:-4], []).append((p, g))


def mat_by_name(name, near):
    """Unity 'material search by name': prefer the closest folder."""
    cands = MAT_NAMES.get(name) or []
    if not cands:
        return None
    d = os.path.dirname(os.path.abspath(near))
    cands = sorted(cands, key=lambda pg: (not pg[0].startswith(d), -len(os.path.commonpath([pg[0], d]))))
    return cands[0][1]


def import_fbx_model(path, parent, ov):
    """Instance a whole FBX model (nested model prefab) under an empty."""
    holder = bpy.data.objects.new(os.path.basename(path), None)
    bpy.context.scene.collection.objects.link(holder)
    holder.parent = parent
    t = {'m_LocalPosition': {'x': 0, 'y': 0, 'z': 0}, 'm_LocalRotation': {'x': 0, 'y': 0, 'z': 0, 'w': 1}, 'm_LocalScale': {'x': 1, 'y': 1, 'z': 1}}
    for k, comps in ov.items():
        t[k] = {**t[k], **comps}
    holder.matrix_basis = trs_matrix(t)
    remap = fbx_material_map(path)
    gs = re.search(r'globalScale: ([0-9.]+)', open(path + '.meta', errors='ignore').read())
    if gs and float(gs.group(1)) != 1:
        holder.matrix_basis = holder.matrix_basis @ Matrix.Diagonal((float(gs.group(1)),) * 3 + (1,))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=False)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.parent = holder
        if o.type == 'MESH':
            for i, slot in enumerate(o.material_slots):
                nm = slot.material.name.split('.')[0] if slot.material else ''
                g = remap.get(nm) or remap.get(slot.material.name if slot.material else '') or mat_by_name(nm, path)
                m = material_from_ref({'guid': g}) if g else None
                if m:
                    slot.material = m


bpy.ops.wm.read_factory_settings(use_empty=True)
root = bpy.data.objects.new('root', None)
bpy.context.scene.collection.objects.link(root)
if PREFAB.lower().endswith('.fbx'):
    import_fbx_model(PREFAB, root, {})
else:
    build_prefab(PREFAB, root)
DECIMATE = float(argv[4]) if len(argv) > 4 else 1.0
if DECIMATE < 1:
    for o in bpy.data.objects:
        if o.type == 'MESH':
            mod = o.modifiers.new('dec', 'DECIMATE')
            mod.ratio = DECIMATE
# drop FBX helper meshes that were never linked
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='WEBP', export_image_quality=82, export_yup=True, export_apply=True)
print('WROTE', OUT, os.path.getsize(OUT))
