# Blender (or `pip install bpy`) script: converts the OpenGameArt "Cute umbrella"
# .blend (CC0, by ege) into a GLB with the stick and canopy as separate meshes.
# Usage: python umbrella-export.py Umbrella.blend Texture.png umbrella_raw.glb
import sys

import bpy

src, tex, out = sys.argv[-3:]
bpy.ops.wm.open_mainfile(filepath=src)
o = bpy.data.objects['Cylinder']
bpy.context.view_layer.objects.active = o
o.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')
img = bpy.data.images.load(tex)
mat = bpy.data.materials.new('Umbrella')
mat.use_nodes = True
node = mat.node_tree.nodes.new('ShaderNodeTexImage')
node.image = img
mat.node_tree.links.new(node.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
for p in [x for x in bpy.data.objects if x.type == 'MESH']:
    p.data.materials.clear()
    p.data.materials.append(mat)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True)
