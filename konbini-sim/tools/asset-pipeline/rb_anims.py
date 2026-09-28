# Bake a set of Rocketbox animation FBX files (MIT) into one GLB with named clips.
# usage: python rb_anims.py -- <out.glb> name=path.fbx [name=path.fbx ...]
import bpy, sys, os
argv = sys.argv[sys.argv.index("--")+1:]
out = argv[0]
pairs = [a.split("=", 1) for a in argv[1:]]
bpy.ops.wm.read_factory_settings(use_empty=True)
base = None
for name, path in pairs:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, use_anim=True)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    act = arm.animation_data.action
    act.name = name
    act.use_fake_user = True
    # drop fcurves for helper bones that the avatars don't have
    if base is None:
        base = arm
        base.name = "Bip01"
        for o in new:
            if o is not base:
                bpy.data.objects.remove(o, do_unlink=True)
    else:
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
names = {n for n, _ in pairs}
for a in list(bpy.data.actions):
    if a.name not in names:
        bpy.data.actions.remove(a)
# push every clip to its own NLA track so the exporter writes them all
ad = base.animation_data or base.animation_data_create()
ad.action = None
for a in bpy.data.actions:
    tr = ad.nla_tracks.new(); tr.name = a.name
    st = tr.strips.new(a.name, int(a.frame_range[0]), a)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True,
    export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_optimize_animation_size=True,
    export_anim_single_armature=True, export_yup=True, export_def_bones=False)
print("WROTE", out, os.path.getsize(out), [a.name for a in bpy.data.actions])
