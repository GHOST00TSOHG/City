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
    leg.append(cyl('ankle_strut_L', ank + V((0, 0.01, 0.03)), ank + V((0, -0.06, -0.13)), 0.034, DK))  # v3b: closes the shin-to-foot gap
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

def shardify(n_total=3400, seed=7, crack_n=40):
    """Area-weighted plate shards on every proxy surface; returns per (slot,opt,bone) parts and builds a Blender
    mesh of the shards for the stills."""
    import bmesh
    rnd = random.Random(seed); X = sys.modules.get('v2export')
    objs = [o for o in bpy.data.objects if o.type == 'MESH' and 'bone' in o]
    faces = []  # v3b: inverse-transpose normals so plates lie flat under non-uniform scale
    for o in objs:
        A.apply_all(o) if hasattr(A, 'apply_all') else None
        mw = o.matrix_world; m = o.data
        for p in m.polygons:
            vs = [mw @ m.vertices[i].co for i in p.vertices]
            nrm = (mw.inverted_safe().transposed().to_3x3() @ p.normal).normalized(); area = p.area * mw.to_scale().x * mw.to_scale().y
            if area > 1e-7: faces.append((o, vs, nrm, area, min(o.dimensions)))
    glows = [o.matrix_world.translation.copy() for o in objs if o.active_material and o.active_material.name.startswith('glow') and o['slot'] == 'body']
    tot = sum(f[3] for f in faces); parts = {}
    skin = math.sqrt(1.7 * tot / n_total / 2.6)  # v3c: tiles overlap ~1.7x -> closed dark surface
    acc = 0.0; step = tot / n_total; nxt = rnd.random() * step
    def tri_pt(vs):
        a, b, c = vs[0], vs[rnd.randrange(1, len(vs) - 1)], None
        i = vs.index(b); c = vs[i + 1]
        u, v = rnd.random(), rnd.random()
        if u + v > 1: u, v = 1 - u, 1 - v
        return a + (b - a) * u + (c - a) * v
    geo = {}
    for o, vs, nrm, area, mind in faces:
        acc += area
        while acc > nxt:
            nxt += step
            pt = tri_pt(vs); key = (o['slot'], o['opt'], o['bone'])
            mn = o.active_material.name if o.active_material else 'frame'
            c = CAT.get(mn.split('.')[0], 0 if mn.startswith('armor') else 1)
            # v3c: solid dark armour skin: flush, overlapping dark tiles sized from the area budget (no light "paper"
            # plates); glow parts keep small bright tiles; edge cracks are added separately in edge_cracks()
            gl = c == 2
            if not gl and any((pt - g).length < 0.05 for g in glows): continue
            if not gl: c = 1
            s = (0.012 + rnd.random() * 0.006) if gl else skin * rnd.uniform(0.9, 1.15)
            s = min(s, max(0.008, mind * 0.28))
            ax_ = (o.matrix_world.to_3x3() @ V((0, 0, 1))).normalized()
            tng = (ax_ - nrm * ax_.dot(nrm)); tng = tng.normalized() if tng.length > 1e-3 else nrm.cross(V((0, 0, 1)) if abs(nrm.z) < 0.9 else V((1, 0, 0))).normalized()
            tng = Quaternion(nrm, rnd.uniform(-0.05, 0.05)) @ tng
            bit = nrm.cross(tng)
            q = Matrix((tng, bit, nrm)).transposed().to_quaternion()  # local x=tangent, y=bitangent, z=normal
            hx, hy, hz = s, s * 1.3, s * (0.2 if gl else 0.04)
            pos = pt + nrm * hz * 0.1
            bn = o['bone']; jb = J[bn] if bn in J else (lambda v: V((-v.x, v.y, v.z)))(J[bn.replace('Right', 'Left')])
            rel = pos - jb
            # game frame: (x, z, -y); quaternion basis change likewise
            gq = Quaternion((q.w, q.x, q.z, -q.y))
            parts.setdefault(key, []).append([round(rel.x, 4), round(rel.z, 4), round(-rel.y, 4), round(hx, 4), round(hy, 4), round(hz, 4),
                                              round(gq.x, 4), round(gq.y, 4), round(gq.z, 4), round(gq.w, 4), c])
            geo.setdefault(key, []).append((pos, q, (hx, hy, hz), c))
    edge_cracks(objs, parts, geo, rnd, n=crack_n)
    return parts, geo, objs

def edge_cracks(objs, parts, geo, rnd, n=40):
    """v3c: a few dozen shallow light plates hinged on sharp armour edges, lifted slightly like cracked-off scale."""
    edges = []
    for o in objs:
        if o.get('opt', 'base') != 'base' or o['slot'] != 'body': continue
        mn = o.active_material.name if o.active_material else ''
        if not mn.startswith('armor'): continue
        mw = o.matrix_world; nm = mw.inverted_safe().transposed().to_3x3(); me = o.data
        ef = {}
        for p in me.polygons:
            for k in p.edge_keys: ef.setdefault(k, []).append(p)
        for (i, j), fs in ef.items():
            if len(fs) != 2 or fs[0].normal.angle(fs[1].normal, 0) < 0.6: continue
            a, b = mw @ me.vertices[i].co, mw @ me.vertices[j].co; L = (b - a).length
            if L < 0.03: continue
            nr = (nm @ (fs[0].normal + fs[1].normal)).normalized(); edges.append((o, a, b, nr, L))
    tot = sum(e[4] for e in edges)
    for k in range(n if edges else 0):
        r = rnd.random() * tot
        for o, a, b, nr, L in edges:
            r -= L
            if r <= 0: break
        pt = a.lerp(b, rnd.uniform(0.15, 0.85)); tng = (b - a).normalized(); bit = nr.cross(tng).normalized()
        tq = Quaternion(tng, rnd.uniform(0.12, 0.3) * (1 if rnd.random() < 0.5 else -1))   # lifted off the edge
        R = Matrix((tng, bit, nr)).transposed(); q = (tq.to_matrix() @ R).to_quaternion()
        s = rnd.uniform(0.022, 0.04); hx, hy, hz = s * 1.4, s * 0.8, s * 0.07
        pos = pt + nr * 0.006
        key = (o['slot'], o['opt'], o['bone']); bn = o['bone']
        jb = J[bn] if bn in J else (lambda v: V((-v.x, v.y, v.z)))(J[bn.replace('Right', 'Left')])
        rel = pos - jb; gq = Quaternion((q.w, q.x, q.z, -q.y))
        parts.setdefault(key, []).append([round(rel.x, 4), round(rel.z, 4), round(-rel.y, 4), round(hx, 4), round(hy, 4), round(hz, 4),
                                          round(gq.x, 4), round(gq.y, 4), round(gq.z, 4), round(gq.w, 4), 0])
        geo.setdefault(key, []).append((pos, q, (hx, hy, hz), 0))

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
    for o in []:  # v3: RGB split removed (old slice effect dropped in v5b)
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
    # v3c: no shard cloud. One thin dash trail behind the body: four streaks of tiny flecks from the shoulders and
    # hips, receding back-right and fading out
    tr = [mat(f'trail_{k}', (0, 0, 0), 0.5, 0, (0.69, 0.29, 1.0) if k % 2 else (0.0, 0.85, 1.0), 7 - k * 1.5) for k in range(4)]
    bm = bmesh.new(); rnd = random.Random(11); back = V((0.85, 0.75, 0.05)).normalized()
    for i, st in enumerate((V((0.3, 0.12, 1.62)), V((-0.3, 0.14, 1.6)), V((0.15, 0.1, 1.0)), V((-0.12, 0.12, 1.2)))):
        for j in range(22):
            t = j / 22; c = st + back * (0.08 + t * 0.9) + V((0, 0, -0.04 * t)) + V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.01
            sz = 0.009 * (1 - t * 0.7)
            vv = [bm.verts.new(c + V((x * sz * (2.2 if x else 1), y * sz, z_ * sz * 0.5))) for x, y, z_ in SHARD_V]
            for f in SHARD_F: fa = bm.faces.new([vv[k] for k in f]); fa.material_index = min(3, int(t * 4))
    me = bpy.data.meshes.new('dash_trail'); bm.to_mesh(me); bm.free()
    for m in tr: me.materials.append(m)
    ot = bpy.data.objects.new('dash_trail', me); bpy.context.scene.collection.objects.link(ot); ot.visible_shadow = False

def main():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    build(); yield 0.1
    n = 600 if S.FAST else 1400
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
        def rim(name, loc, e, col):
            l = bpy.data.lights.new(name, 'AREA'); l.energy = e; l.size = 0.8; l.color = col
            ob = bpy.data.objects.new(name, l); bpy.context.scene.collection.objects.link(ob); ob.location = loc
            ob.rotation_euler = (V((0, 0, 1.5)) - V(loc)).to_track_quat('-Z', 'Y').to_euler()
        rim('rim_glitch_c', (-1.6, 1.9, 2.3), 450, (0.1, 0.85, 1.0))  # cyan rim, back left
        rim('rim_glitch_m', (1.8, 1.6, 1.9), 300, (1.0, 0.15, 0.75))  # magenta kicker, back right
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
