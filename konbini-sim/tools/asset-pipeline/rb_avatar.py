# Convert a Microsoft Rocketbox avatar FBX (MIT) to a web-ready GLB.
# usage: python rb_avatar.py -- <avatar.fbx> <textures_dir> <out.glb> [texsize]
import bpy, sys, os
argv = sys.argv[sys.argv.index("--")+1:]
src, texdir, out = argv[0], argv[1], argv[2]
size = int(argv[3]) if len(argv) > 3 else 1024
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=False, use_anim=False)

# delete helpers / anim leftovers
for o in list(bpy.data.objects):
    if o.type == 'EMPTY':
        bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

texfiles = {f.lower(): os.path.join(texdir, f) for f in os.listdir(texdir)}

def load(name, colorspace, px):
    path = texfiles.get(name.lower())
    if not path:
        return None
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    if img.size[0] > px:
        img.scale(px, px)
    return img

def rough_from_spec(spec, px):
    """Rocketbox ships specular maps; glTF wants roughness (G channel)."""
    import numpy as np
    w, h = spec.size
    a = np.empty(w * h * 4, dtype=np.float32)
    spec.pixels.foreach_get(a)
    a = a.reshape(-1, 4)
    lum = a[:, 0] * 0.3 + a[:, 1] * 0.59 + a[:, 2] * 0.11
    r = np.clip(0.95 - lum * 0.5, 0.42, 1.0)
    outimg = bpy.data.images.new(spec.name + "_rough", w, h, alpha=False)
    o = np.stack([np.ones_like(r), r, np.zeros_like(r), np.ones_like(r)], 1)
    outimg.pixels.foreach_set(o.ravel())
    outimg.colorspace_settings.name = 'Non-Color'
    return outimg

for mat in bpy.data.materials:
    base = mat.name  # e.g. m002_body / m002_head / m002_opacity
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], outn.inputs[0])
    col = load(base + "_color.tga", 'sRGB', size)
    if col:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = col
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if base.endswith('opacity'):
            nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
    if base.endswith('opacity'):
        mat.blend_method = 'BLEND'
        bsdf.inputs['Roughness'].default_value = 0.8
        continue
    mat.blend_method = 'OPAQUE'
    nrm = load(base + "_normal.tga", 'Non-Color', size)
    if nrm:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = nrm
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    spec = load(base + "_specular.tga", 'Non-Color', size // 2)
    if spec:
        rimg = rough_from_spec(spec, size // 2)
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = rimg
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(t.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    else:
        bsdf.inputs['Roughness'].default_value = 0.7
    bsdf.inputs['Metallic'].default_value = 0.0

bpy.ops.export_scene.gltf(
    filepath=out, export_format='GLB', export_animations=False,
    export_image_format='WEBP', export_image_quality=80,
    export_skins=True, export_yup=True, export_apply=False)
print("WROTE", out, os.path.getsize(out))
