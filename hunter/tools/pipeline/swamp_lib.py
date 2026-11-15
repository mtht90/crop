import bpy, sys, os
argv = sys.argv[sys.argv.index('--')+1:]
out = argv[0]; tex = argv[1]; files = argv[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
img = bpy.data.images.load(tex)
for f in files:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=f, use_anim=False)
    new = [o for o in bpy.data.objects if o not in before]
    stem = os.path.splitext(os.path.basename(f))[0].replace('EA_Swamp_', '').replace('EA_', '').replace('.', '_')
    root = bpy.data.objects.new(stem, None); bpy.context.scene.collection.objects.link(root)
    for o in new:
        if o.type in ('CAMERA','LIGHT'): bpy.data.objects.remove(o); continue
        if o.parent is None:
            o.parent = root
        o.location = (0,0,0) if o.parent is root else o.location
for m in bpy.data.materials:
    m.use_nodes = True
    nt = m.node_tree
    if any(n.type=='TEX_IMAGE' and n.image for n in nt.nodes): continue
    bsdf = next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'), None)
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.interpolation='Closest'
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Metallic'].default_value = 0.0
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=False, export_apply=True)
print('EXPORTED', out, os.path.getsize(out))
