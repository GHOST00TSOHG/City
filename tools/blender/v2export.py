"""Robots v2 shared pipeline: turnaround renders + game kit export (parts.glb, kit.json, skeleton.json entry).
Kit node naming follows src/robot/kit.ts: `<slot>__<option>__<Bone>`, vertices in bone space (bone rest = translation only).
Game frame: +Y up, +Z forward  <-  Blender (x, z, -y); the glTF exporter does the axis swap."""
import re
import bpy, bmesh, json, math, os
from mathutils import Vector, Matrix
import sys
S = sys.modules['__main__'] if hasattr(sys.modules['__main__'], 'J') else __import__('scout_v2')
import addons as A

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REGION = {'armor_white': 'shell', 'armor_blue': 'torso', 'armor_red': 'shorts', 'armor_yellow': 'backpack', 'frame': 'joints',
          'steel': 'chrome', 'screen': 'screen', 'glow': 'visor', 'glow_m': 'decalColor', 'rubber': 'rubber', 'glass': 'glass'}
ORDER = ['Hips', 'Spine', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot']
PARENT = {'Hips': None, 'Spine': 'Hips', 'Head': 'Spine', 'LeftArm': 'Spine', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm',
          'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg'}

def game(v): return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]

def joint_world(b):
    J = _J()
    if b in J: return J[b]
    if b.startswith('Right') and 'Left' + b[5:] in J:
        v = J['Left' + b[5:]]; return Vector((-v.x, v.y, v.z))
    return J.get('Spine', Vector())

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)

def turnaround(name, tgt_z=1.0, dist=5.2, extra=(), slots=None):
    """front / side / back / night stills into /workspace/robot-renders/<name>-{front,side,back,night}.png"""
    base = f'/workspace/robot-renders/{name}'
    if slots:  # stills show the default build (first option of every slot)
        for o in bpy.data.objects:
            if 'slot' in o and o['slot'] != 'body': o['_hide'] = o['opt'] != slots[o['slot']][0]
    S.render(base + '-front.png', cam_az=0.0, cam_el=0.06, tgt=(0, 0, tgt_z), dist=dist)
    S.render(base + '-side.png', cam_az=math.pi / 2, cam_el=0.06, tgt=(0, 0, tgt_z), dist=dist, setup=False)
    S.render(base + '-back.png', cam_az=math.pi, cam_el=0.06, tgt=(0, 0, tgt_z), dist=dist, setup=False)
    S.render(base + '-34.png', cam_az=-0.65, cam_el=0.1, tgt=(0, 0, tgt_z), dist=dist, setup=False)
    for a in extra: S.render(base + a[0], **a[1], setup=False)
    # night: kill key/fill, cold moon rim, emissives carry the read
    sc = bpy.context.scene
    for o in sc.objects:
        if o.type == 'LIGHT':
            if o.name.startswith(('key', 'fill')): o.data.energy *= 0.06
            elif o.name.startswith('rim'): o.data.energy *= 0.55; o.data.color = (0.45, 0.6, 1.0)
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.002, 0.003, 0.008, 1)
    S.render(base + '-night.png', cam_az=-0.5, cam_el=0.08, tgt=(0, 0, tgt_z), dist=dist, setup=False)

def export_kit(rtype, slots, budget=28500, screens=None, extra_meta=None):
    sc = bpy.context.scene
    objs = [o for o in sc.objects if o.type == 'MESH' and 'bone' in o]
    for o in objs: o.hide_render = False; o['_hide'] = False
    for o in sc.objects: o.select_set(False)
    # apply modifiers, make single-user
    for o in objs:
        if o.data.users > 1: o.data = o.data.copy()
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        for m in list(o.modifiers):
            try: bpy.ops.object.modifier_apply(modifier=m.name)
            except Exception: o.modifiers.remove(m)
        o.select_set(False)
    pre = {o.name: tris(o) for o in objs}; total = sum(pre.values())
    # decimate: small parts keep their shape, big shells take the cut
    small = sum(t for t in pre.values() if t < 80); big = total - small
    ratio = min(1.0, max(0.05, (budget - small) / max(big, 1)))
    for _ in range(3):
        if ratio >= 1: break
        for o in objs:
            if pre[o.name] < 80: continue
            m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.modifier_apply(modifier='dec'); o.select_set(False)
        now = sum(tris(o) for o in objs)
        if now <= budget: break
        pre = {o.name: tris(o) for o in objs}; small = sum(t for t in pre.values() if t < 80)
        ratio = max(0.05, (budget - small) / max(now - small, 1))
    # regions
    regmats = {}
    for o in objs:
        for i, ms in enumerate(o.material_slots):
            nm = (ms.material.name.split('.')[0] if ms.material else 'armor_white')
            r = REGION.get(nm, 'shell')
            if r not in regmats: regmats[r] = bpy.data.materials.get('R_' + r) or bpy.data.materials.new('R_' + r)
            ms.material = regmats[r]
    for r, m in regmats.items(): m.name = r
    # group under bone-space empties
    groups = {}
    for o in objs:
        key = (o['slot'], o['opt'], o['bone'])
        if key not in groups:
            e = bpy.data.objects.new('__'.join(key), None); sc.collection.objects.link(e)
            e.location = joint_world(o['bone']); groups[key] = e
            bpy.context.view_layer.update()   # fresh empty: make matrix_world valid before re-parenting
        mw = o.matrix_world.copy(); o.parent = groups[key]; o.matrix_world = mw
    bpy.context.view_layer.update()
    for o in sc.objects: o.select_set(False)
    for e in groups.values(): e.select_set(True)
    for o in objs: o.select_set(True)
    out = f'{REPO}/public/robot/{rtype}'; os.makedirs(out, exist_ok=True)
    for f in ('masks.webp', 'normal.webp', 'cubes.json'):
        if os.path.exists(f'{out}/{f}'): os.remove(f'{out}/{f}')
    bpy.ops.export_scene.gltf(filepath=f'{out}/parts.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_texcoords=False, export_normals=True, export_materials='EXPORT', export_animations=False)
    tr = {}
    for (sl, op, b), e in groups.items():
        k = f'{sl}:{op}'; tr[k] = tr.get(k, 0) + sum(tris(c) for c in e.children)
    meta = {'type': rtype, 'version': 2, 'slots': slots, 'pistons': [], 'tris': tr, 'tris_total': sum(tr.values()),
            'addons_used': dict(A.USED), 'screens': screens or {}}
    if extra_meta: meta.update(extra_meta)
    json.dump(meta, open(f'{out}/kit.json', 'w'), separators=(',', ':'))
    write_skeleton(rtype, objs)
    print('EXPORTED', rtype, 'tris', meta['tris_total'], flush=True)
    return meta

JOV = None   # set by a script run as __main__ (its globals are not in sys.modules)
def _J():
    """The populated rig dict, wherever the running robot script lives (__main__ under -P, or an imported module)."""
    if JOV is not None: return JOV
    for m in list(sys.modules.values()):
        j = getattr(m, 'J', None)
        if isinstance(j, dict) and 'LeftFoot' in j: return j
    return S.J

def write_skeleton(rtype, objs):
    J = _J()
    fingers = sorted([k for k in J if re.match(r'LeftF\d+_\d+$', k)])
    order = ORDER[:6] + fingers + ORDER[6:]
    par = dict(PARENT)
    for f in fingers:
        i, j = f[5:].split('_'); par[f] = 'LeftHand' if j == '0' else f'LeftF{i}_{int(j) - 1}'
    bones = {}
    for b in order:
        if b not in J: continue
        p = par[b]; v = J[b] - (J[p] if p else Vector())
        bones[b] = game(v)
    zs = [(o.matrix_world @ v.co).z for o in objs for v in o.data.vertices]
    path = f'{REPO}/src/robot/skeleton.json'; d = json.load(open(path))
    d[rtype] = {'height': round(max(zs), 3), 'sole': round(min(zs) - J['LeftFoot'].z, 3),
                'hand': round(J['LeftHand'].z - J['LeftForeArm'].z, 3), 'bones': bones, 'parents': {b: par[b] for b in bones}}
    txt = json.dumps(d, indent=1)
    open(path, 'w').write(txt)
