# Renders a character's head for piece strips with Blender (Cycles, CPU), for sources that only come as .blend
# or whose materials don't survive glTF export.
# usage: blender -b <file.blend|-> --python tools/blender_head.py -- <config.json> <out_dir>
# config: { "import": "model.glb" (optional), "keep": [names], "hide": [names], "hair": [names (color part)],
#           "eyes": [names (never tinted)], "clipZ": 1.45, "yaw": 0.2, "pitch": 0.12, "pad": 1.1, "id": "b_chan" }
# Writes <out>/<id>_color.png (normal look) and <id>_mask.png (R = color part, G = untinted details).
import bpy, sys, json, math, bmesh, mathutils, os
argv = sys.argv[sys.argv.index('--') + 1:]
cfg = json.load(open(argv[0])); out = argv[1]
os.makedirs(out, exist_ok=True)
if cfg.get('import'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=cfg['import'])
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = cfg.get('samples', 64)
sc.render.resolution_x = sc.render.resolution_y = cfg.get('res', 640); sc.render.resolution_percentage = 100
sc.render.film_transparent = True; sc.render.use_compositing = False; sc.use_nodes = False
sc.view_settings.view_transform = 'Standard'

def match(o, names):
    return any(n == o.name or (n.endswith('*') and o.name.startswith(n[:-1])) for n in names)

meshes = [o for o in sc.objects if o.type == 'MESH']
keep = cfg.get('keep')
for o in sc.objects:
    if o.type in ('LIGHT',): o.hide_render = True
for o in meshes:
    vis = (match(o, keep) if keep else True) and not match(o, cfg.get('hide', []))
    o.hide_render = not vis
vis = [o for o in meshes if not o.hide_render]

# cut everything under the chin (evaluated pose, baked into a copy)
clip = cfg.get('clipZ')
dg = bpy.context.evaluated_depsgraph_get()
baked = []
for o in vis:
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me.transform(o.matrix_world)
    bm = bmesh.new(); bm.from_mesh(me)
    if clip is not None:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < clip], context='VERTS')
    bm.to_mesh(me); bm.free()
    n = bpy.data.objects.new(o.name + '_bk', me); sc.collection.objects.link(n)
    n['src'] = o.name
    o.hide_render = True
    baked.append(n)

mn = mathutils.Vector((1e9,) * 3); mx = -mn
for o in baked:
    for v in o.data.vertices:
        mn = mathutils.Vector(map(min, mn, v.co)); mx = mathutils.Vector(map(max, mx, v.co))
ctr = (mn + mx) / 2

yaw, pitch = cfg.get('yaw', 0.2), cfg.get('pitch', 0.12)
cd = bpy.data.cameras.new('PC'); cam = bpy.data.objects.new('PC', cd); sc.collection.objects.link(cam); sc.camera = cam
cd.type = 'ORTHO'; cd.ortho_scale = max(mx.x - mn.x, mx.z - mn.z, mx.y - mn.y) * cfg.get('pad', 1.15); cd.clip_end = 1000
d = (mx - mn).length * 4
fwd = cfg.get('front', '-Y')  # which way the face looks
s = 1 if fwd == '+Y' else -1
cam.location = (ctr.x + math.sin(yaw) * d, ctr.y + s * math.cos(yaw) * d, ctr.z + math.sin(pitch) * d)
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()



# soft, flat-ish studio light like the three.js renders
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = cfg.get('ambient', 0.9)
def sun(rot, e):
    l = bpy.data.lights.new('s', 'SUN'); l.energy = e; l.angle = 0.6
    o = bpy.data.objects.new('s', l); sc.collection.objects.link(o); o.rotation_euler = rot
sun((math.radians(-50), 0, math.radians(15) + (0 if s < 0 else math.pi)), cfg.get('key', 2.2))

sc.render.filepath = f"{out}/{cfg['id']}_color.png"
bpy.ops.render.render(write_still=True)

# mask pass: emission only, no AA noise worth worrying about
def emit(col):
    m = bpy.data.materials.new('e'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = col
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs[0]); return m
hair, eyes, other = emit((1, 0, 0, 1)), emit((0, 1, 0, 1)), emit((0, 0, 0, 1))
partmat = cfg.get('hairMats', [])
for o in baked:
    src = o['src']
    for i, slot in enumerate(o.material_slots):
        mname = slot.material.name if slot.material else ''
        if src in cfg.get('hair', []) or mname in partmat: slot.material = hair
        elif src in cfg.get('eyes', []) or mname in cfg.get('eyeMats', []): slot.material = eyes
        else: slot.material = other
    if not o.material_slots: o.data.materials.append(other)
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0
sc.cycles.samples = 8; sc.view_settings.view_transform = 'Standard'
sc.render.filepath = f"{out}/{cfg['id']}_mask.png"
bpy.ops.render.render(write_still=True)
print('DONE', cfg['id'])
