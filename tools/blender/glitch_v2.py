"""GLITCH v3 (rebuilt): crisper surface-aligned shards over a hard predator silhouette, glow piping.
GLITCH v2: a predator built from data shards. A sharp proxy silhouette (swept horn crest, V visor, blade
shoulders, wasp waist, long bladed forearms, 4-claw shard hands, digitigrade legs) is sampled into ~3.4k
oriented plate shards. The proxy never ships: only shards.json (bone-local, game frame) does; the runtime
draws them as one instanced mesh with RGB split, datamosh, scanline slip, orbit-and-snap and blink-dash.
Run: blender --enable-event-simulate -noaudio -P glitch_v2.py -- [--fast] [--kit]"""
import bpy, math, sys, os, json, random
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix, Quaternion
from scout_v2 import *
import scout_v2 as S, addons as A

V = Vector
WH = mat('armor_white', (0.6, 0.6, 0.62), 0.3)
DK = mat('frame', (0.03, 0.032, 0.04), 0.4, 0.6)
GL = mat('glow', (0, 0, 0), 0.3, 0, (0.69, 0.29, 1.0), 26)
GLITCH_SLOTS = {'helmet': ['smooth', 'skull', 'halo'], 'arms': ['block', 'blade', 'orbit'], 'bionics': ['wings', 'ring', 'spikes'],
                'legs': ['slim', 'block', 'digi'], 'thrusters': ['jets', 'trail', 'ring'], 'boots': ['block', 'hover', 'spike']}
CAT = {'armor_white': 0, 'frame': 1, 'glow': 2}

def box(name, c, half, m, rx=0.0, ry=0.0, rz=0.0, bev=0.1):
    R = (Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X'))
    return S._box(name, V(c), (R.col[0], R.col[1], R.col[2]), half, m, bev)

def build():
    up = []
    bone('Hips'); J['Hips'] = V((0, 0, 1.02))
    box('pelvis', (0, 0, 1.02), (0.14, 0.1, 0.08), DK)
    for s in (1, -1): box(f'hipblade_{s}', (0.17 * s, 0.0, 0.98), (0.03, 0.12, 0.14), WH, ry=0.35 * s)
    bone('Spine'); J['Spine'] = V((0, 0, 1.12))
    up.append(loft('waist', [(1.08, 0, 0, 0.075, 0.07), (1.24, 0, 0, 0.095, 0.08)], DK, armor=False))
    up.append(loft('chest', [(1.22, 0, 0, 0.16, 0.13), (1.40, 0, -0.03, 0.30, 0.19), (1.58, 0, -0.04, 0.4, 0.21), (1.70, 0, 0, 0.28, 0.15)], WH, e=2.4))
    for s in (1, -1):
        up.append(box(f'pec_{s}', (0.13 * s, -0.2, 1.5), (0.13, 0.02, 0.1), WH, rz=-0.5 * s, rx=-0.25))
        up.append(box(f'rib_{s}', (0.17 * s, -0.12, 1.3), (0.05, 0.08, 0.012), DK, ry=0.6 * s))
    up.append(box('core', (0, -0.23, 1.4), (0.055, 0.03, 0.055), GL, ry=math.pi / 4))
    for s in (1, -1):  # glow piping tracing the V of the chest and the collar: keeps the outline readable through the shards
        up.append(box(f'pipe_chest_{s}', (0.16 * s, -0.205, 1.5), (0.004, 0.004, 0.14), GL, ry=0.9 * s, rx=-0.2))
        up.append(box(f'pipe_collar_{s}', (0.15 * s, -0.12, 1.69), (0.12, 0.004, 0.004), GL, rz=0.25 * s))
        up.append(box(f'pipe_side_{s}', (0.3 * s, -0.08, 1.45), (0.004, 0.004, 0.13), GL, ry=-0.25 * s))
    up.append(box('spine_fin', (0, 0.2, 1.45), (0.01, 0.08, 0.22), WH, rx=-0.2))
    slot('bionics', 'wings')
    for s in (1, -1): up.append(box(f'b_wing_{s}', (0.32 * s, 0.32, 1.62), (0.3, 0.012, 0.07), WH, rz=0.4 * s, ry=-0.5 * s))
    slot('bionics', 'ring'); up.append(cyl('b_ring', V((0, 0.24, 1.25)), V((0, 0.25, 1.25)), 0.32, GL, n=24))
    slot('bionics', 'spikes')
    for i, s in ((0, 1), (1, -1), (2, 1), (3, -1)): up.append(box(f'b_spk{i}', (0.08 * s, 0.22, 1.3 + i * 0.1), (0.01, 0.14, 0.02), DK, rx=0.6))
    slot('thrusters', 'jets')
    for s in (1, -1): up.append(cyl(f't_jet_{s}', V((0.1 * s, 0.2, 1.4)), V((0.12 * s, 0.26, 1.15)), 0.035, DK, r2=0.05))
    slot('thrusters', 'trail'); up.append(box('t_trail', (0, 0.22, 1.2), (0.05, 0.02, 0.1), GL))
    slot('thrusters', 'ring'); up.append(cyl('t_ring', V((0, 0.2, 1.35)), V((0, 0.27, 1.35)), 0.12, DK))
    slot('body')
    # head: narrow wedge, swept horn crest, V visor
    bone('Head'); J['Head'] = V((0, -0.02, 1.78))
    up.append(loft('neck', [(1.68, 0, 0, 0.04, 0.04), (1.80, 0, 0, 0.035, 0.035)], DK, armor=False))
    up.append(box('skull', (0, -0.01, 1.88), (0.085, 0.11, 0.08), WH, rx=0.15))
    up.append(box('jaw', (0, -0.08, 1.82), (0.06, 0.05, 0.035), DK, rx=-0.3))
    for s in (1, -1):
        up.append(box(f'visor_{s}', (0.045 * s, -0.135, 1.89), (0.06, 0.016, 0.014), GL, rz=0.0, ry=-0.45 * s))
        up.append(box(f'horn_{s}', (0.07 * s, 0.1, 2.0), (0.014, 0.22, 0.022), WH, rx=-0.5, rz=0.22 * s))
        up.append(box(f'cheek_{s}', (0.085 * s, -0.04, 1.86), (0.01, 0.07, 0.05), DK))
    slot('helmet', 'smooth'); up.append(box('h_smooth', (0, -0.04, 1.95), (0.07, 0.09, 0.02), WH))
    slot('helmet', 'skull')
    for i in range(3): up.append(box(f'h_skull{i}', (0, 0.0 + i * 0.05, 1.98), (0.04, 0.012, 0.03), GL))
    slot('helmet', 'halo'); up.append(cyl('h_halo', V((0, 0.06, 2.1)), V((0, 0.06, 2.11)), 0.15, GL, n=24))
    slot('body')
    # arms (left, mirrored): blade shoulder, long forearm blade, 4 shard claws
    arm = []
    bone('LeftArm'); J['LeftArm'] = V((0.38, 0, 1.62))
    arm.append(box('pauldron_L', (0.44, 0.02, 1.72), (0.15, 0.15, 0.05), WH, ry=-0.55))
    arm.append(box('pauldron_spike_L', (0.52, 0.1, 1.82), (0.02, 0.2, 0.016), WH, rx=-0.7, ry=-0.4))
    arm.append(box('pauldron_pipe_L', (0.46, -0.13, 1.7), (0.13, 0.004, 0.004), GL, ry=-0.55))
    sh, el, wr = V((0.44, 0, 1.6)), V((0.5, 0.04, 1.3)), V((0.52, -0.06, 1.0))
    arm.append(cyl('upperarm_L', sh, el, 0.04, DK))
    bone('LeftForeArm'); J['LeftForeArm'] = el.copy()
    fa = loft('forearm_L', [(0, 0, 0, 0.05, 0.05), (0.15, 0, 0, 0.07, 0.065), (0.31, 0, 0, 0.05, 0.05)], WH, e=2.6); place(fa, el, wr); arm.append(fa)
    arm.append(box('fa_blade_L', (0.58, 0.04, 1.14), (0.008, 0.06, 0.18), GL, rx=0.3))
    slot('arms', 'block'); arm.append(box('a_block_L', (0.54, -0.01, 1.16), (0.06, 0.07, 0.1), DK))
    slot('arms', 'blade'); arm.append(box('a_blade_L', (0.6, -0.12, 0.95), (0.006, 0.05, 0.25), WH, rx=0.25))
    slot('arms', 'orbit')
    for i in range(3): arm.append(box(f'a_orb{i}_L', (0.62, -0.02 + 0.04 * i, 1.08 + i * 0.07), (0.02, 0.02, 0.02), GL, rx=0.7, rz=0.7))
    slot('body')
    S.build_hand('L', wr, (wr - el).normalized(), fingers=5, size=1.35, curl=0.45, armor_m=WH, digit_m=DK, thick=0.9)
    arm = [o for o in ALL if o['bone'].startswith(('LeftArm', 'LeftFore', 'LeftHand', 'LeftF'))]
    up += arm; up += mirror(arm)
    # legs: digitigrade, reversed shin, blade toes
    leg = []
    bone('LeftUpLeg'); hip, knee, ank = V((0.13, 0, 0.98)), V((0.15, -0.14, 0.6)), V((0.15, 0.06, 0.2))
    J['LeftUpLeg'], J['LeftLeg'], J['LeftFoot'] = hip.copy(), knee.copy(), ank.copy()
    th = loft('thigh_L', [(0, 0, 0, 0.07, 0.08), (0.2, 0, 0, 0.085, 0.09), (0.38, 0, 0, 0.05, 0.06)], WH, e=2.6); place(th, hip, knee); leg.append(th)
    bone('LeftLeg')
    leg.append(box('knee_L', knee + V((0, -0.06, 0.02)), (0.04, 0.04, 0.07), DK, rx=0.3))
    sn = loft('shin_L', [(0, 0, 0, 0.05, 0.06), (0.2, 0, 0, 0.06, 0.07), (0.42, 0, 0, 0.04, 0.045)], WH, e=2.6); place(sn, knee, ank); leg.append(sn)
    leg.append(box('calf_glow_L', knee.lerp(ank, 0.5) + V((0, 0.06, 0)), (0.01, 0.01, 0.12), GL, rx=-0.5))
    leg.append(box('thigh_pipe_L', hip.lerp(knee, 0.5) + V((0.0, -0.09, 0)), (0.004, 0.004, 0.16), GL, rx=0.35))
    slot('legs', 'slim'); leg.append(box('l_slim_L', hip.lerp(knee, 0.5) + V((0.07, 0, 0)), (0.005, 0.05, 0.12), GL))
    slot('legs', 'block'); leg.append(box('l_block_L', hip.lerp(knee, 0.5) + V((0, -0.06, 0)), (0.08, 0.04, 0.1), DK))
    slot('legs', 'digi'); leg.append(box('l_digi_L', knee + V((0, 0.06, -0.12)), (0.03, 0.03, 0.08), WH))
    slot('body')
    bone('LeftFoot')
    leg.append(box('foot_L', ank + V((0, -0.09, -0.15)), (0.05, 0.14, 0.035), WH, rx=0.1))
    leg.append(box('heel_spur_L', ank + V((0, 0.08, -0.12)), (0.012, 0.07, 0.02), DK, rx=-0.5))
    slot('boots', 'block'); leg.append(box('bt_block_L', ank + V((0, -0.08, -0.17)), (0.06, 0.15, 0.025), DK))
    slot('boots', 'hover'); leg.append(cyl('bt_hover_L', ank + V((0, -0.05, -0.2)), ank + V((0, -0.05, -0.215)), 0.08, GL))
    slot('boots', 'spike'); leg.append(box('bt_spike_L', ank + V((0, -0.28, -0.17)), (0.01, 0.1, 0.012), WH))
    slot('body')
    mirror([o for o in ALL if o['bone'] in ('LeftUpLeg', 'LeftLeg', 'LeftFoot')])
    # predator lean: chest forward 6 deg
    lean = Matrix.Translation((0, 0, 1.12)) @ Matrix.Rotation(0.1, 4, 'X').inverted() @ Matrix.Translation((0, 0, -1.12))
    for o in set(up): o.matrix_world = lean @ o.matrix_world
    for k_ in list(J):
        if not k_.startswith(('Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot')): J[k_] = lean @ J[k_]

def shardify(n_total=3400, seed=7):
    """Area-weighted plate shards on every proxy surface; returns per (slot,opt,bone) parts and builds a Blender
    mesh of the shards for the stills."""
    import bmesh
    rnd = random.Random(seed); X = sys.modules.get('v2export')
    objs = [o for o in bpy.data.objects if o.type == 'MESH' and 'bone' in o]
    faces = []
    for o in objs:
        A.apply_all(o) if hasattr(A, 'apply_all') else None
        mw = o.matrix_world; m = o.data
        for p in m.polygons:
            vs = [mw @ m.vertices[i].co for i in p.vertices]
            nrm = ((mw.to_3x3() @ p.normal)).normalized(); area = p.area * mw.to_scale().x * mw.to_scale().y
            if area > 1e-7: faces.append((o, vs, nrm, area))
    tot = sum(f[3] for f in faces); parts = {}
    acc = 0.0; step = tot / n_total; nxt = rnd.random() * step
    def tri_pt(vs):
        a, b, c = vs[0], vs[rnd.randrange(1, len(vs) - 1)], None
        i = vs.index(b); c = vs[i + 1]
        u, v = rnd.random(), rnd.random()
        if u + v > 1: u, v = 1 - u, 1 - v
        return a + (b - a) * u + (c - a) * v
    geo = {}
    for o, vs, nrm, area in faces:
        acc += area
        while acc > nxt:
            nxt += step
            pt = tri_pt(vs); key = (o['slot'], o['opt'], o['bone'])
            mn = o.active_material.name if o.active_material else 'frame'
            c = CAT.get(mn.split('.')[0], 0 if mn.startswith('armor') else 1)
            s = 0.018 + rnd.random() * 0.024
            tng = nrm.cross(V((0, 0, 1)) if abs(nrm.z) < 0.9 else V((1, 0, 0))).normalized()
            tng = Quaternion(nrm, rnd.uniform(-0.25, 0.25)) @ tng
            bit = nrm.cross(tng)
            q = Matrix((tng, bit, nrm)).transposed().to_quaternion()  # local x=tangent, y=bitangent, z=normal
            hx, hy, hz = s * rnd.uniform(0.8, 1.2), s * rnd.uniform(1.2, 1.9), s * 0.26
            pos = pt - nrm * hz * 0.4
            bn = o['bone']; jb = J[bn] if bn in J else (lambda v: V((-v.x, v.y, v.z)))(J[bn.replace('Right', 'Left')])
            rel = pos - jb
            # game frame: (x, z, -y); quaternion basis change likewise
            gq = Quaternion((q.w, q.x, q.z, -q.y))
            parts.setdefault(key, []).append([round(rel.x, 4), round(rel.z, 4), round(-rel.y, 4), round(hx, 4), round(hy, 4), round(hz, 4),
                                              round(gq.x, 4), round(gq.y, 4), round(gq.z, 4), round(gq.w, 4), c])
            geo.setdefault(key, []).append((pos, q, (hx, hy, hz), c))
    return parts, geo, objs

SHARD_V = [(0, 1, 0), (0, -1, 0), (1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, 0, -1)]
SHARD_F = [(0, 2, 4), (0, 4, 3), (0, 3, 5), (0, 5, 2), (1, 4, 2), (1, 3, 4), (1, 5, 3), (1, 2, 5)]

def shard_meshes(geo):
    """One Blender mesh per (slot,opt,bone) of octahedral plate shards for the stills; tagged for turnaround."""
    import bmesh
    mats = [WH, DK, GL]; out = []
    for (sl, op, bn), lst in geo.items():
        bm = bmesh.new()
        for pos, q, (hx, hy, hz), c in lst:
            R = q.to_matrix()
            vv = [bm.verts.new(pos + R @ V((x * hx, y * hy, z * hz))) for x, y, z in SHARD_V]
            for f in SHARD_F:
                fa = bm.faces.new([vv[i] for i in f]); fa.material_index = c
        me = bpy.data.meshes.new(f'sh_{sl}_{op}_{bn}'); bm.to_mesh(me); bm.free()
        for m in mats: me.materials.append(m)
        o = bpy.data.objects.new(me.name, me); bpy.context.scene.collection.objects.link(o)
        o['slot'], o['opt'], o['bone'] = sl, op, bn; out.append(o)
    return out

def fx_dressing(shards):
    """Stills-only: orbiting loose shards, chromatic ghost (cyan/magenta offset copies), a datamosh slab."""
    import bmesh
    rnd = random.Random(3)
    cy = mat('ghost_c', (0, 0, 0), 0.5, 0, (0.0, 0.9, 1.0), 3); mg = mat('ghost_m', (0, 0, 0), 0.5, 0, (1.0, 0.05, 0.6), 3)
    for o in []:  # v3: RGB split moved to post (glitch_post.py) / runtime shader
        for m, dx in ((cy, 0.012), (mg, -0.012)):
            g = o.copy(); g.data = o.data.copy(); g.data.materials.clear(); g.data.materials.append(m)
            for p in g.data.polygons: p.material_index = 0
            g.location.x += dx; bpy.context.scene.collection.objects.link(g)
            bpy.context.view_layer.update()
            g.visible_shadow = False
            # keep the ghost sparse: drop 75% of its faces
            import bmesh
            bm = bmesh.new(); bm.from_mesh(g.data)
            dead = [f for i, f in enumerate(bm.faces) if (i // 8) % 4]
            bmesh.ops.delete(bm, geom=dead, context='FACES'); bm.to_mesh(g.data); bm.free()
    import bmesh
    bm = bmesh.new()
    for i in range(70):
        a = rnd.uniform(0, 6.28); r = rnd.uniform(0.45, 0.8); z = rnd.uniform(0.9, 1.9)
        c = V((math.cos(a) * r, math.sin(a) * r, z)); s = rnd.uniform(0.02, 0.05)
        R = Quaternion(V((rnd.random(), rnd.random(), rnd.random())).normalized(), rnd.uniform(0, 3)).to_matrix()
        vv = [bm.verts.new(c + R @ V((x * s, y * s * 1.6, z_ * s * 0.35))) for x, y, z_ in SHARD_V]
        for f in SHARD_F: fa = bm.faces.new([vv[k] for k in f]); fa.material_index = 0 if i % 5 else 1
    me = bpy.data.meshes.new('orbit_shards'); bm.to_mesh(me); bm.free(); me.materials.append(WH); me.materials.append(GL)
    o = bpy.data.objects.new('orbit_shards', me); bpy.context.scene.collection.objects.link(o)
    # trails: each of 26 orbit shards drags a fading arc of tiny glow flecks behind it
    tr = [mat(f'trail_{k}', (0, 0, 0), 0.5, 0, (0.69, 0.29, 1.0) if k % 2 else (0.0, 0.85, 1.0), 9 - k * 2) for k in range(4)]
    bm = bmesh.new(); rnd = random.Random(11)
    for i in range(26):
        a0 = rnd.uniform(0, 6.28); r = rnd.uniform(0.45, 0.75); z = rnd.uniform(1.0, 1.85); tilt = rnd.uniform(-0.25, 0.25)
        for j in range(14):
            a = a0 - j * 0.05; c = V((math.cos(a) * r, math.sin(a) * r, z + tilt * math.sin(a))); s = 0.012 * (1 - j / 16)
            vv = [bm.verts.new(c + V((x * s, y * s, z_ * s))) for x, y, z_ in SHARD_V]
            for f in SHARD_F: fa = bm.faces.new([vv[k] for k in f]); fa.material_index = min(3, j // 4)
        cc = V((math.cos(a0) * r, math.sin(a0) * r, z + tilt * math.sin(a0))); s = 0.035
        vv = [bm.verts.new(cc + V((x * s, y * s * 1.6, z_ * s * 0.35))) for x, y, z_ in SHARD_V]
        for f in SHARD_F: fa = bm.faces.new([vv[k] for k in f]); fa.material_index = 0
    me = bpy.data.meshes.new('orbit_trails'); bm.to_mesh(me); bm.free()
    for m in tr: me.materials.append(m)
    ot = bpy.data.objects.new('orbit_trails', me); bpy.context.scene.collection.objects.link(ot); ot.visible_shadow = False
    # blink-dash afterimage: a sparse magenta copy of the whole body left behind, dissolving into flecks
    gm = mat('dash_ghost', (0, 0, 0), 0.5, 0, (1.0, 0.1, 0.7), 2.2)
    for sh in [x for x in shards if x['slot'] == 'body']:
        g = sh.copy(); g.data = sh.data.copy(); g.data.materials.clear(); g.data.materials.append(gm)
        bpy.context.scene.collection.objects.link(g); g.location += V((1.25, 0.9, 0)); g.visible_shadow = False
        bm = bmesh.new(); bm.from_mesh(g.data)
        for f in bm.faces: f.material_index = 0
        dead = [f for i, f in enumerate(bm.faces) if (i // 8) % 5]
        bmesh.ops.delete(bm, geom=dead, context='FACES')
        for v in bm.verts: v.co += V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.02 * max(0, v.co.z - 0.4)
        bm.to_mesh(g.data); bm.free()

def main():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    build(); yield 0.1
    n = 1400 if S.FAST else 3800
    parts, geo, proxies = shardify(n)
    import v2export as X
    X.write_skeleton('glitch', proxies)
    if '--preview' in S.argv or '--core' in S.argv:  # stills: dark solid core under the shards = clear robot outline
        for o in proxies:
            if o.get('opt', 'base') != 'base' or o['slot'] != 'body': o.hide_render = True; o['_hide'] = 1; continue
            gl = o.active_material and o.active_material.name.startswith('glow')
            if not gl: o.data.materials.clear(); o.data.materials.append(DK)
            o['slot'] = 'core'
    else:
        for o in proxies: bpy.data.objects.remove(o, do_unlink=True)
    shards = shard_meshes(geo)
    ntri = sum(len(v) for v in geo.values()) * 8
    print('SHARDS', sum(len(v) for v in geo.values()), 'TRIS', ntri, flush=True)
    out = {'version': 2, 'shard': 'octa', 'tris_total': ntri,
           'parts': [{'slot': k[0], 'opt': k[1], 'bone': k[2], 'shards': v} for k, v in sorted(parts.items())]}
    if '--kit' in S.argv:
        json.dump(out, open(f'{X.REPO}/public/robot/glitch/shards.json', 'w'), separators=(',', ':'))
    fx_dressing(shards)
    if '--preview' in S.argv:
        S.render(S.OUT.replace('.png', '-34.png'), tgt=(0.15, 0.1, 1.15), dist=6.4)
        S.render(S.OUT.replace('.png', '-closeup.png'), cam_az=-0.45, cam_el=0.08, res=(1500, 1200), tgt=(0.05, -0.05, 1.62), dist=2.7, lens=60, setup=False); return
    bpy.ops.wm.save_as_mainfile(filepath='/workspace/private/glitch_v2.blend')
    X.turnaround('glitch', tgt_z=1.1, dist=5.6, slots=GLITCH_SLOTS)

_gen = None
def _run():
    global _gen
    try:
        if _gen is None: _gen = main()
        return next(_gen)
    except StopIteration: pass
    except Exception: import traceback; traceback.print_exc()
    print('ADDONS_USED', dict(A.USED), flush=True); bpy.ops.wm.quit_blender()
bpy.app.timers.register(_run, first_interval=1.5)
