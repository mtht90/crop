# Blender (or `pip install bpy`) helper for the katana assets (both CC0, OpenGameArt):
#   python katana-export.py -- blade Katana.fbx Katana_Base_Color.png katana_raw.glb   ("Katana" by pfunked)
#   python katana-export.py -- saya katana.blend saya_raw.glb                        (sheath from "Katana" by Clint Bellanger)
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1 :]
mode = args[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
if mode == 'blade':
    fbx, tex, out = args[1:4]
    bpy.ops.import_scene.fbx(filepath=fbx)
    img = bpy.data.images.load(tex)
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        mat = bpy.data.materials.new('Katana')
        mat.use_nodes = True
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = img
        mat.node_tree.links.new(node.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
        o.data.materials.clear()
        o.data.materials.append(mat)
else:
    src, out = args[1:3]
    with bpy.data.libraries.load(src) as (a, b):
        b.objects = [n for n in a.objects if n == 'Sheath']
    for o in b.objects:
        bpy.context.scene.collection.objects.link(o)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True)
