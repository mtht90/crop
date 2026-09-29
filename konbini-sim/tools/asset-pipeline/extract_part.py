# Split a GLB into loose parts and keep the tallest one (e.g. one pole out of a kit).
# usage: python extract_part.py -- in.glb out.glb
import bpy, sys
argv = sys.argv[sys.argv.index("--")+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
for o in list(bpy.data.objects):
    if o.type == 'MESH':
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.separate(type='LOOSE')
        bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.select_all(action='DESELECT')
parts = [o for o in bpy.data.objects if o.type == 'MESH']
def height(o):
    zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]
    return max(zs) - min(zs)
best = max(parts, key=height)
for o in parts:
    if o is not best:
        bpy.data.objects.remove(o, do_unlink=True)
# recentre on the floor
import mathutils
ws = [best.matrix_world @ v.co for v in best.data.vertices]
cx = sum(w.x for w in ws) / len(ws); cy = sum(w.y for w in ws) / len(ws); mz = min(w.z for w in ws)
best.data.transform(best.matrix_world); best.matrix_world = mathutils.Matrix.Identity(4)
best.data.transform(mathutils.Matrix.Translation((-cx, -cy, -mz)))
print('HEIGHT', height(best))
bpy.ops.export_scene.gltf(filepath=argv[1], export_format='GLB', export_image_format='WEBP')
