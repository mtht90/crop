import bpy, sys, os, argparse, re
argv = sys.argv[sys.argv.index('--')+1:]
p = argparse.ArgumentParser()
p.add_argument('inp'); p.add_argument('out')
p.add_argument('--texdirs', nargs='*', default=[])
p.add_argument('--maxtex', type=int, default=1024)
p.add_argument('--forcetex', default=None)
p.add_argument('--texmap', nargs='*', default=[])  # matname_substr=path
p.add_argument('--noanim', action='store_true')
p.add_argument('--keep', nargs='*', default=None)  # object names to keep (meshes)
p.add_argument('--drop', nargs='*', default=[])
p.add_argument('--blendobj', nargs='*', default=None)
p.add_argument('--keepcam', action='store_true')
a = p.parse_args(argv)
KEEPCAM=a.keepcam
bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(a.inp)[1].lower()
if ext == '.fbx': bpy.ops.import_scene.fbx(filepath=a.inp, use_anim=not a.noanim)
elif ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=a.inp)
elif ext == '.obj': bpy.ops.wm.obj_import(filepath=a.inp)
elif ext == '.dae': bpy.ops.wm.collada_import(filepath=a.inp)
elif ext == '.blend':
    bpy.ops.wm.open_mainfile(filepath=a.inp)
    try: bpy.ops.file.unpack_all(method='USE_LOCAL')
    except Exception as e: print('unpack', e)
# index textures
idx = {}
for d in a.texdirs:
    for root, _, files in os.walk(d):
        for f in files:
            idx.setdefault(f.lower(), os.path.join(root, f))
            idx.setdefault(os.path.splitext(f.lower())[0], os.path.join(root, f))
for img in list(bpy.data.images):
    if img.packed_file: continue
    fp = bpy.path.abspath(img.filepath)
    if not os.path.exists(fp):
        b = os.path.basename(fp.replace('\\', '/')).lower()
        if b not in idx: b = os.path.splitext(b)[0]
        if b in idx:
            img.filepath = idx[b]; img.reload(); print('relinked', b)
        else: print('MISSING', fp)
def mat_has_img(m):
    return m.use_nodes and any(n.type == 'TEX_IMAGE' and n.image for n in m.node_tree.nodes)
def give_tex(m, path):
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(path, check_existing=True)
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
tm = [x.split('=', 1) for x in a.texmap]
for m in bpy.data.materials:
    for sub, path in tm:
        if sub.lower() in m.name.lower() and not mat_has_img(m): give_tex(m, path); print('texmap', m.name)
    if a.forcetex and not mat_has_img(m): give_tex(m, a.forcetex); print('forcetex', m.name)
for img in bpy.data.images:
    if img.size[0] > a.maxtex or img.size[1] > a.maxtex:
        s = a.maxtex / max(img.size[0], img.size[1])
        img.scale(max(1, int(img.size[0]*s)), max(1, int(img.size[1]*s))); print('scaled', img.name)
for o in list(bpy.data.objects):
    if o.type == 'LIGHT' or (o.type=='CAMERA' and not KEEPCAM): bpy.data.objects.remove(o)
    elif o.type == 'MESH' and (any(d.lower() in o.name.lower() for d in a.drop) or (a.keep is not None and o.name not in a.keep)):
        bpy.data.objects.remove(o)
for act in bpy.data.actions:
    parts = [x for x in act.name.split('|') if x and x != 'Baked frames']
    act.name = parts[-1] if parts else act.name
if bpy.context.scene is None: pass
# ensure all objects linked to scene for blend files
sc = bpy.context.scene
for o in bpy.data.objects:
    if o.name not in sc.objects and o.users_collection == ():
        sc.collection.objects.link(o)
bpy.ops.export_scene.gltf(filepath=a.out, export_format='GLB', export_animations=not a.noanim,
    export_animation_mode='ACTIONS', export_apply=True, export_cameras=KEEPCAM, export_lights=False,
    export_image_format='AUTO', use_visible=False)
print('EXPORTED', a.out, os.path.getsize(a.out))
for act in bpy.data.actions: print(' ANIM', act.name, '%.2fs' % ((act.frame_range[1]-act.frame_range[0]) / sc.render.fps))
