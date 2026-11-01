"""GLITCH v5: faithful rebuild of the floating-cubes reference. A humanoid whose skin is small white / light-grey voxel
cubes (Lego-like, stepped tiers) over a dark glossy gunmetal skeleton of cables, pistons and joints. Irregular missing
patches (heaviest at the back of the head, neck, shoulders and arms) show the machinery. A smooth pale human face
plate (brow, closed downcast eyes, nose, lips, chin) on a slightly bowed head. Cubes break off the head and shoulders
and drift up and out (stills: ~450 baked cubes; game: one GPU-instanced cloud, glitch.ts).
Regions (garage slots): cubes white = shell, cubes grey = shorts, face plate = torso, machinery = joints,
cable sheaths = backpack, faint joint glow = visor, floating cubes = decalColor (runtime cloud).
Everything is modelled; the reference image is never used as a texture.
Ships: parts.glb (machinery + face + hands) and shards.json ('shard': 'cube', cube skin + cloud emitters).
Run: blender --enable-event-simulate -noaudio -P glitch_v5.py -- [--fast] [--kit|--preview] [--closeup] --out=glitch-v5.png"""
import bpy, bmesh, math, sys, os, json, random
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix, Quaternion, noise
from scout_v2 import *
import scout_v2 as S

V = Vector
for _n in ('armor_white','armor_red','armor_blue','frame','armor_yellow','glow'):
    _m = bpy.data.materials.get(_n)
    if _m:
        _t = _m.node_tree; _t.nodes.clear(); _p = _t.nodes.new('ShaderNodeBsdfPrincipled'); _p.name = 'Principled BSDF'
        _t.links.new(_p.outputs[0], _t.nodes.new('ShaderNodeOutputMaterial').inputs[0])
SK = mat('armor_white', (0.8, 0.8, 0.79), 0.38, 0.0)                    # white cubes (shell)
SG = mat('armor_red', (0.36, 0.37, 0.4), 0.42, 0.0)                     # light-grey cubes (shorts)
FACE = mat('armor_blue', (0.62, 0.58, 0.55), 0.45, 0.0)                 # face plate (torso)
DK = mat('frame', (0.018, 0.019, 0.023), 0.16, 0.92)                    # dark glossy gunmetal machinery (joints)
CB = mat('armor_yellow', (0.03, 0.031, 0.036), 0.28, 0.7)               # cable sheaths / ribbed tubes (backpack)
GL = mat('glow', (0, 0, 0), 0.3, 0, (0.62, 0.45, 1.0), 4)               # faint joint glow (visor)
GLITCH_SLOTS = {'helmet': ['bare', 'crest', 'halo'], 'arms': ['cables', 'pistons', 'plated'], 'bionics': ['spine', 'vents', 'ring'],
                'legs': ['bare', 'plated', 'pistons'], 'thrusters': ['none', 'jets', 'ring'], 'boots': ['flat', 'plated', 'hover']}
HC, HR = V((0, 0.006, 1.79)), V((0.079, 0.099, 0.113))   # head ellipsoid (untilted)
TILT = 0.3                                              # downcast head pitch (rad)
SKIN = []                                               # (obj, cube size, region) sampling shells, not exported

def skin(o, c, region): o['_skin'] = 1; SKIN.append((o, c, region)); return o

def ellip(name, c, r, m, seg=32, ring=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=c, segments=seg, ring_count=ring); o = bpy.context.active_object
    o.name = name; o.scale = r; bpy.ops.object.transform_apply(scale=True); o.data.materials.append(m); ALL.append(o); return o

def box(name, c, half, m, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=2, location=c); o = bpy.context.active_object; o.name = name
    o.scale = half; bpy.ops.object.transform_apply(scale=True)
    if rot: o.rotation_euler = rot
    o.data.materials.append(m); ALL.append(o); o['_flat'] = 1; return o

def g(X, Z, x0, z0, sx, sz): return math.exp(-0.5 * (((X - x0) / sx) ** 2 + ((Z - z0) / sz) ** 2))

def face_disp(X, Z):
    ax = abs(X); d = 0.0
    nz = max(0.0, min(1.0, (0.035 - Z) / 0.07)) ** 1.3 if Z > -0.034 else math.exp(-0.5 * ((Z + 0.034) / 0.006) ** 2)
    d += 0.027 * math.exp(-0.5 * (X / (0.0095 + 0.004 * nz)) ** 2) * nz                       # nose ridge -> tip
    d += 0.009 * g(ax, Z, 0.013, -0.031, 0.007, 0.007)                                       # alae
    d += -0.010 * g(ax, Z, 0.033, 0.013, 0.017, 0.013)                                       # eye sockets
    d += 0.006 * g(ax, Z, 0.033, 0.009, 0.012, 0.006)                                        # closed lids (bulge)
    d += -0.0028 * g(ax, Z, 0.034, 0.003, 0.013, 0.0016)                                     # downcast lash line
    d += 0.007 * g(ax, Z, 0.03, 0.034, 0.022, 0.007)                                         # brow ridge
    d += 0.006 * g(ax, Z, 0.046, -0.024, 0.017, 0.02)                                        # cheekbones
    d += 0.010 * g(X, Z, 0, -0.052, 0.019, 0.006) - 0.003 * g(X, Z, 0, -0.046, 0.003, 0.006)  # upper lip + philtrum
    d += -0.0045 * g(X, Z, 0, -0.059, 0.02, 0.0016)                                          # mouth line
    d += 0.009 * g(X, Z, 0, -0.066, 0.017, 0.006) - 0.003 * g(X, Z, 0, -0.077, 0.015, 0.004)  # lower lip + groove
    d += 0.013 * g(X, Z, 0, -0.093, 0.021, 0.013)                                            # chin
    return d

def face_plate():
    NT, NP = 60, 72; bm = bmesh.new(); rows = []
    for j in range(NP + 1):
        ph = -1.08 + 1.62 * j / NP; r = []
        for i in range(NT + 1):
            th = -1.02 + 2.04 * i / NT
            x, y, z = math.sin(th) * math.cos(ph), -math.cos(th) * math.cos(ph), math.sin(ph)
            X, Z = HR.x * x, HR.z * z
            jaw = 1 - 0.3 * min(1, max(0, (-Z - 0.02) / 0.08))
            fall = max(0.0, math.cos(th)) ** 2
            p = HC + V((X * jaw, HR.y * y * (1 - 0.12 * (1 - jaw)), Z)) + V((0, -face_disp(X, Z) * fall, 0))
            r.append(bm.verts.new(p))
        rows.append(r)
    for a, b in zip(rows, rows[1:]):
        for i in range(NT): bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))   # winding gives outward (-Y) normals; open sheet, so no recalc
    o = obj_from_bm('face_plate', bm, FACE)
    for p in o.data.polygons: p.use_smooth = True
    print('FACE normal y', sum(p.normal.y for p in o.data.polygons) / len(o.data.polygons), flush=True)
    return o

def in_face(p):
    u = V(((p.x - HC.x) / HR.x, (p.y - HC.y) / HR.y, (p.z - HC.z) / HR.z))
    th = math.atan2(u.x, -u.y); ph = math.asin(max(-1, min(1, u.z / max(u.length, 1e-6))))
    return abs(th) < 0.98 and -1.1 < ph < 0.5 - 0.15 * abs(th)

def mirror_skin(objs):
    info = {o.name: (c, r) for o, c, r in SKIN}
    for o, m in zip(objs, mirror(objs)):
        if o.name in info: SKIN.append((m, *info[o.name]))

def ribs(name, a, b, r, n, m=CB):
    for k in range(n):
        t = (k + 0.5) / n; c = a.lerp(b, t); d = (b - a).normalized() * 0.006
        cyl(f'{name}{k}', c - d, c + d, r, m, n=14)

def build():
    # ---------------- torso
    bone('Hips'); J['Hips'] = V((0, 0, 0.98))
    skin(loft('s_pelvis', [(0.86, 0, 0.0, 0.13, 0.095), (0.95, 0, 0, 0.155, 0.1), (1.05, 0, 0, 0.14, 0.09)], SK), 0.048, 'torso')
    loft('m_pelvis', [(0.87, 0, 0.0, 0.11, 0.08), (1.04, 0, 0, 0.12, 0.075)], DK, armor=False)
    bone('Spine'); J['Spine'] = V((0, 0, 1.12))
    skin(loft('s_torso', [(1.05, 0, 0, 0.135, 0.088), (1.16, 0, 0, 0.125, 0.085), (1.3, 0, -0.005, 0.165, 0.105), (1.43, 0, -0.005, 0.185, 0.11), (1.51, 0, 0.005, 0.16, 0.1), (1.56, 0, 0.01, 0.08, 0.07)], SK), 0.036, 'torso')
    loft('m_torso', [(1.04, 0, 0, 0.11, 0.07), (1.3, 0, 0, 0.14, 0.088), (1.48, 0, 0, 0.15, 0.09), (1.56, 0, 0.01, 0.07, 0.06)], DK, armor=False)
    for k in range(11):  # spinal column down the back
        z = 1.02 + k * 0.05; cyl(f'vert{k}', V((0, 0.075, z)), V((0, 0.075, z + 0.022)), 0.026, DK, n=16)
        cyl(f'vdisc{k}', V((0, 0.075, z + 0.024)), V((0, 0.075, z + 0.032)), 0.018, STEEL, n=12)
    for s in (1, -1):
        for k in range(4): cyl(f'rib{k}_{s}', V((0.03 * s, 0.08, 1.24 + k * 0.06)), V((0.13 * s, -0.02, 1.2 + k * 0.065)), 0.007, CB, n=8)
        S.piston(f'chest_pst_{s}', V((0.05 * s, -0.07, 1.18)), V((0.12 * s, -0.06, 1.44)), r=0.014)
    cyl('neck_glow', V((0, 0.01, 1.555)), V((0, 0.01, 1.565)), 0.06, GL, n=24)
    slot('bionics', 'spine')
    for k in range(5): box(f'b_dorsal{k}', V((0, 0.105, 1.2 + k * 0.06)), (0.012, 0.012, 0.012), SK)
    slot('bionics', 'vents')
    for s in (1, -1): box(f'b_vent_{s}', V((0.06 * s, 0.1, 1.35)), (0.01, 0.02, 0.07), DK)
    slot('bionics', 'ring'); cyl('b_ring', V((0, 0.12, 1.36)), V((0, 0.13, 1.36)), 0.11, GL, n=28)
    slot('thrusters', 'none'); cyl('t_stub', V((0, 0.09, 1.1)), V((0, 0.11, 1.1)), 0.015, DK, n=10)
    slot('thrusters', 'jets')
    for s in (1, -1): cyl(f't_jet_{s}', V((0.07 * s, 0.1, 1.4)), V((0.08 * s, 0.15, 1.2)), 0.025, DK, r2=0.035)
    slot('thrusters', 'ring'); cyl('t_ring', V((0, 0.1, 1.3)), V((0, 0.14, 1.3)), 0.08, DK, n=24)
    slot('body')
    # ---------------- neck + head
    bone('Head'); J['Head'] = V((0, 0.0, 1.6))
    skin(loft('s_neck', [(1.55, 0, 0.01, 0.05, 0.05), (1.7, 0, 0.012, 0.042, 0.045)], SK), 0.017, 'neck')
    loft('m_neck', [(1.54, 0, 0.012, 0.03, 0.03), (1.72, 0, 0.012, 0.028, 0.03)], DK, armor=False)
    for k in range(7):  # neck cables, skull base -> collar
        a = -1.1 + k * 0.36; ca, sa = math.cos(a), math.sin(a)
        cyl(f'ncab{k}', V((0.034 * sa, 0.012 + 0.03 * ca, 1.72)), V((0.07 * sa, 0.02 + 0.055 * ca, 1.55)), 0.0065, CB, n=8)
    S.piston('neck_pst', V((0, 0.05, 1.7)), V((0, 0.07, 1.56)), r=0.009)
    ellip('m_skull', HC, HR * 0.88, DK)
    for k in range(5): cyl(f'skull_rib{k}', HC + V((-0.07, 0.02 + k * 0.015, 0.03 - k * 0.012)), HC + V((0.07, 0.02 + k * 0.015, 0.03 - k * 0.012)), 0.004, CB, n=6)
    skin(ellip('s_head', HC, HR, SK, 40, 22), 0.0135, 'head')
    face_plate()
    slot('helmet', 'bare'); cyl('h_jack', HC + V((0, 0.08, -0.06)), HC + V((0, 0.1, -0.07)), 0.008, DK, n=8)
    slot('helmet', 'crest')
    for k in range(5): box(f'h_crest{k}', HC + V((0, -0.03 + k * 0.025, 0.118)), (0.008, 0.01, 0.008), SK)
    slot('helmet', 'halo'); cyl('h_halo', HC + V((0, 0.06, 0.17)), HC + V((0, 0.06, 0.175)), 0.1, GL, n=32)
    slot('body')
    # ---------------- left arm (mirrored)
    bone('LeftArm'); sh, el, wr = V((0.205, 0.0, 1.49)), V((0.24, 0.03, 1.21)), V((0.255, 0.0, 0.96)); J['LeftArm'] = sh.copy()
    skin(ellip('s_delt_L', sh + V((0.02, 0, 0.005)), V((0.07, 0.075, 0.07)), SK), 0.026, 'shoulder')
    ellip('m_delt_L', sh + V((0.015, 0, 0)), V((0.055, 0.058, 0.055)), DK)
    ua = loft('s_uarm_L', [(0, 0, 0, 0.05, 0.05), (0.15, 0, 0, 0.048, 0.048), (0.28, 0, 0, 0.04, 0.04)], SK); place(ua, sh, el); skin(ua, 0.03, 'arm')
    m = loft('m_uarm_L', [(0, 0, 0, 0.032, 0.032), (0.28, 0, 0, 0.026, 0.026)], DK, armor=False); place(m, sh, el)
    ribs('uarm_rib_L', sh, el, 0.036, 6)
    S.piston('uarm_pst_L', sh + V((0.0, -0.05, -0.03)), el + V((0.0, -0.035, 0.03)), r=0.011)
    cyl('uarm_cab_L', sh + V((0.03, 0.04, -0.02)), el + V((0.02, 0.03, 0.02)), 0.006, CB, n=8)
    cyl('sh_glow_L', sh + V((0.06, 0, 0)), sh + V((0.066, 0, 0)), 0.03, GL, n=20)
    bone('LeftForeArm'); J['LeftForeArm'] = el.copy()
    S.joint('elbow_L', el, (1, 0, 0), 0.034, 0.075)
    fa = loft('s_farm_L', [(0, 0, 0, 0.042, 0.042), (0.08, 0, 0, 0.045, 0.044), (0.25, 0, 0, 0.033, 0.032)], SK); place(fa, el, wr); skin(fa, 0.03, 'arm')
    m = loft('m_farm_L', [(0, 0, 0, 0.026, 0.026), (0.25, 0, 0, 0.02, 0.02)], DK, armor=False); place(m, el, wr)
    ribs('farm_rib_L', el.lerp(wr, 0.15), wr, 0.03, 5)
    for k, a in enumerate((0.6, 2.2, 4.0)): cyl(f'farm_cab{k}_L', el + V((0.03 * math.cos(a), 0.03 * math.sin(a), -0.02)), wr + V((0.022 * math.cos(a), 0.022 * math.sin(a), 0.02)), 0.005, CB, n=8)
    slot('arms', 'cables'); cyl('a_cab_L', el + V((0.045, -0.01, -0.03)), wr + V((0.035, -0.01, 0.03)), 0.007, DK, n=8)
    slot('arms', 'pistons'); S.piston('a_pst_L', el + V((0.04, -0.03, -0.02)), wr + V((0.035, -0.02, 0.04)), r=0.01)
    slot('arms', 'plated'); box('a_plate_L', el.lerp(wr, 0.45) + V((0.04, 0, 0)), (0.012, 0.03, 0.06), SK)
    slot('body')
    S.build_hand('L', wr, (wr - el).normalized(), fingers=5, size=1.15, curl=0.75, armor_m=CB, digit_m=DK, thick=0.9, palm_dir=V((-1, 0, 0)), thumb_dir=V((0, -1, 0)))
    arm = [o for o in ALL if o['bone'].startswith(('LeftArm', 'LeftFore', 'LeftHand', 'LeftF'))]
    mirror_skin(arm)
    # ---------------- left leg (mirrored)
    bone('LeftUpLeg'); hip, knee, ank = V((0.095, 0, 0.93)), V((0.105, -0.015, 0.52)), V((0.105, 0.015, 0.1))
    ball, toe = V((0.105, -0.09, 0.035)), V((0.105, -0.17, 0.025))
    J['LeftUpLeg'], J['LeftLeg'], J['LeftFoot'] = hip.copy(), knee.copy(), ank.copy()
    th = loft('s_thigh_L', [(0, 0, 0, 0.078, 0.08), (0.15, 0, 0, 0.072, 0.074), (0.4, 0, 0, 0.05, 0.052)], SK); place(th, hip, knee); skin(th, 0.056, 'leg')
    m = loft('m_thigh_L', [(0, 0, 0, 0.055, 0.055), (0.4, 0, 0, 0.034, 0.034)], DK, armor=False); place(m, hip, knee)
    S.piston('thigh_pst_L', hip + V((0.04, -0.06, -0.05)), knee + V((0.02, -0.045, 0.05)), r=0.013)
    slot('legs', 'bare'); cyl('l_cab_L', hip + V((0.07, 0.02, -0.06)), knee + V((0.045, 0.02, 0.05)), 0.006, CB, n=8)
    slot('legs', 'plated'); box('l_plate_L', hip.lerp(knee, 0.45) + V((0, -0.075, 0)), (0.045, 0.012, 0.08), SK)
    slot('legs', 'pistons'); S.piston('l_pst_L', hip + V((-0.05, 0.03, -0.06)), knee + V((-0.03, 0.04, 0.05)), r=0.011)
    slot('body')
    bone('LeftLeg'); S.joint('knee_L', knee, (1, 0, 0), 0.04, 0.09)
    sn = loft('s_shin_L', [(0, 0, 0, 0.05, 0.055), (0.12, 0, 0, 0.055, 0.062), (0.42, 0, 0, 0.034, 0.036)], SK); place(sn, knee, ank); skin(sn, 0.052, 'leg')
    m = loft('m_shin_L', [(0, 0, 0, 0.034, 0.034), (0.42, 0, 0, 0.024, 0.024)], DK, armor=False); place(m, knee, ank)
    S.piston('calf_pst_L', knee + V((0, 0.05, -0.06)), ank + V((0, 0.04, 0.06)), r=0.012)
    bone('LeftFoot'); S.joint('ankle_L', ank, (1, 0, 0), 0.03, 0.07)
    ft = loft('s_foot_L', [(0, 0, 0, 0.045, 0.04), (0.1, 0, 0, 0.05, 0.035), (0.21, 0, 0, 0.04, 0.022)], SK); place(ft, ank + V((0, 0.05, -0.05)), toe); skin(ft, 0.04, 'foot')
    box('m_sole_L', V((0.105, -0.055, 0.012)), (0.05, 0.12, 0.012), DK)
    slot('boots', 'flat'); box('bt_flat_L', V((0.105, -0.055, 0.003)), (0.052, 0.122, 0.003), CB)
    slot('boots', 'plated'); box('bt_plate_L', toe + V((0, 0.02, 0.025)), (0.045, 0.04, 0.02), SK)
    slot('boots', 'hover'); cyl('bt_hover_L', V((0.105, -0.05, 0.004)), V((0.105, -0.05, 0.0)), 0.07, GL, n=24)
    slot('body')
    leg = [o for o in ALL if o['bone'] in ('LeftUpLeg', 'LeftLeg', 'LeftFoot')]
    mirror_skin(leg)
    for o in ALL:
        if o.type == 'MESH' and not o.get('_flat') : o.data.shade_smooth()

def _jb(bn): return J[bn] if bn in J else V((-J[bn.replace('Right', 'Left')].x, J[bn.replace('Right', 'Left')].y, J[bn.replace('Right', 'Left')].z))

DROP = {'head': 0.3, 'neck': 0.5, 'shoulder': 0.42, 'arm': 0.36, 'torso': 0.22, 'leg': 0.16, 'foot': 0.1}

def voxelize():
    """Cube skin: surface-sample each skin shell, snap to its cube grid, add stepped tiers / slabs, punch noise patches."""
    rnd = random.Random(11); cubes = []; seen = set(); emit = []
    for o, c, reg in SKIN:
        me = o.data; me.calc_loop_triangles(); M = o.matrix_world; N3 = M.to_3x3()
        cells = {}
        for t in me.loop_triangles:
            a, b, cc = (M @ me.vertices[i].co for i in t.vertices); nrm = (N3 @ t.normal).normalized()
            area = ((b - a).cross(cc - a)).length / 2; k = max(1, int(area / (c * c) * 5))
            for _ in range(k):
                u, v = rnd.random(), rnd.random()
                if u + v > 1: u, v = 1 - u, 1 - v
                p = a + (b - a) * u + (cc - a) * v
                key = (round(p.x / c), round(p.y / c), round(p.z / c))
                if key not in cells: cells[key] = nrm
        bn = o['bone']
        for key, nrm in cells.items():
            p = V(key) * c
            if reg == 'head' and in_face(p): continue
            w = DROP[reg] + (0.22 if reg in ('head', 'torso') and p.y > HC.y + 0.01 and (reg == 'head' or p.z > 1.3) else 0)
            if reg == 'torso' and p.z > 1.42: w += 0.12
            n = noise.noise(p * (1 / (c * 4.5)) + V((3.1, 7.7, 1.3)))
            if n < (w - 0.5) * 1.6: continue
            gk = (bn, key, c)
            if gk in seen: continue
            seen.add(gk)
            grey = rnd.random() < 0.35
            h = [c * 0.47] * 3
            if rnd.random() < 0.3: h[rnd.choice((0, 1, 2))] *= rnd.choice((1.5, 2.0))           # slabs
            cubes.append([bn, p, h, 1 if grey else 0, reg])
            if rnd.random() < 0.16:                                                             # stepped tier
                ax = max(range(3), key=lambda i: abs(nrm[i])); off = V((0, 0, 0)); off[ax] = c * (1 if nrm[ax] > 0 else -1)
                cubes.append([bn, p + off * 0.85, [c * 0.45] * 3, 1 if rnd.random() < 0.6 else 0, reg])
            if reg in ('head', 'neck', 'shoulder') and rnd.random() < 0.35: emit.append((bn, p.copy(), reg))
    return cubes, emit

def tilt_head(cubes, emit):
    T = Matrix.Translation(J['Head']) @ Matrix.Rotation(TILT, 4, 'X') @ Matrix.Translation(-J['Head'])
    for o in [o for o in bpy.context.scene.objects if o.get('bone') == 'Head']: o.matrix_world = T @ o.matrix_world
    q = Matrix.Rotation(TILT, 4, 'X').to_quaternion()
    for cb in cubes:
        cb.append(q if cb[0] == 'Head' else Quaternion())
        if cb[0] == 'Head': cb[1] = T @ cb[1]
    return [(b, T @ p if b == 'Head' else p, r) for b, p, r in emit]

def shard_json(cubes, emit):
    parts = {}
    for bn, p, (hx, hy, hz), cat, reg, q in cubes:
        rel = p - _jb(bn); gq = Quaternion((q.w, q.x, q.z, -q.y))
        parts.setdefault(bn, []).append([round(rel.x, 4), round(rel.z, 4), round(-rel.y, 4), round(hx, 4), round(hy, 4), round(hz, 4), round(gq.x, 4), round(gq.y, 4), round(gq.z, 4), round(gq.w, 4), cat])
    em = [[bn, round((p - _jb(bn)).x, 4), round((p - _jb(bn)).z, 4), round(-(p - _jb(bn)).y, 4)] for bn, p, r in emit]
    return {'version': 2, 'shard': 'cube', 'tris_total': len(cubes) * 12, 'cube_head': 0.0135,
            'parts': [{'slot': 'body', 'opt': 'base', 'bone': b, 'shards': v} for b, v in sorted(parts.items())], 'emit': em}

def cube_mesh(name, items):
    """items: (centre, half(3), mat index, quat) -> one mesh"""
    bm = bmesh.new()
    for c, h, mi, q in items:
        R = q.to_matrix(); vs = [bm.verts.new(c + R @ V((x * h[0], y * h[1], z * h[2]))) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
        for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            fc = bm.faces.new([vs[i] for i in f]); fc.material_index = mi
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(SK); me.materials.append(SG)
    bv = None; o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    b = o.modifiers.new('bv', 'BEVEL'); b.width = 0.0012; b.segments = 1
    return o

def cloud(emit, n=460):
    rnd = random.Random(4); items = []; hc = J['Head'] + V((0, 0.0, 0.17))
    for _ in range(n):
        bn, p, reg = rnd.choice(emit)
        out = (p - (hc if reg != 'shoulder' else p - V((0.0, 0.0, -0.1)))).normalized()
        d = (out * 0.9 + V((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), rnd.uniform(0.1, 1.0)))).normalized()
        t = rnd.random() ** 1.6
        dist = 0.015 + t * (0.42 if reg == 'head' else 0.3)
        s = 0.0105 * 0.5 * (1 - 0.7 * t) * rnd.uniform(0.7, 1.15)
        q = Quaternion(V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized(), rnd.uniform(-0.25, 0.25))
        items.append((p + d * dist, [s] * 3, 1 if rnd.random() < 0.3 else 0, q))
    return cube_mesh('cloud', items)

def stage(sc):
    for o in bpy.data.objects:
        o.hide_render = bool(o.get('_skin')) or o.get('opt', 'base') not in ('base', GLITCH_SLOTS.get(o.get('slot'), ['base'])[0])
    world = sc.world or bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.03, 0.006, 0.05, 1); bg.inputs[1].default_value = 1.0
    def light(name, loc, energy, size, col, tgt=(0, 0, 1.5)):
        l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = col
        o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
        o.rotation_euler = (V(tgt) - V(loc)).to_track_quat('-Z', 'Y').to_euler()
    light('key', (2.4, -1.8, 2.6), 520, 2.4, (1.0, 0.95, 0.9))         # soft white key, face side
    light('warm', (1.2, -1.4, 1.2), 90, 1.2, (1.0, 0.7, 0.45))           # warm face bounce (ref)
    light('rim', (-1.6, 2.4, 2.4), 700, 1.8, (0.62, 0.35, 1.0))          # purple rim
    light('fill', (-2.4, -1.2, 1.4), 120, 3.0, (0.45, 0.25, 0.8))        # purple fill
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0)); fl = bpy.context.active_object
    fl.data.materials.append(mat('floor', (0.03, 0.01, 0.045), 0.5))

def main():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    build(); yield 0.1
    import v2export as X
    X.JOV = J
    cubes, emit = voxelize(); emit = tilt_head(cubes, emit)
    data = shard_json(cubes, emit)
    print('CUBES', len(cubes), 'TRIS', len(cubes) * 12, 'EMIT', len(emit), {r: sum(1 for c in cubes if c[4] == r) for r in DROP}, flush=True)
    if '--kit' in S.argv:
        for o, _, _ in SKIN: bpy.data.objects.remove(o, do_unlink=True)
        X.export_kit('glitch', GLITCH_SLOTS, budget=max(4000, 30000 - len(cubes) * 12))
        json.dump(data, open(f'{X.REPO}/public/robot/glitch/shards.json', 'w'), separators=(',', ':'))
        return
    if '--preview' in S.argv:
        cube_mesh('skin_cubes', [(p, h, cat, q) for bn, p, h, cat, reg, q in cubes]); cloud(emit)
        sc = bpy.context.scene; stage(sc)
        if '--closeup' not in S.argv:
            S.shoot(S.OUT.replace('.png', '-34.png'), -0.65, 0.08, (1200, 1500), V((0, 0, 1.05)), 5.4, 70)
        S.shoot(S.OUT.replace('.png', '-closeup.png'), 1.42, 0.05, (1200, 1240), V((0.0, -0.01, 1.66)), 1.45, 60)

_gen = None
def _run():
    global _gen
    try:
        if _gen is None: _gen = main()
        return next(_gen)
    except StopIteration: pass
    except Exception: import traceback; traceback.print_exc()
    bpy.ops.wm.quit_blender()
bpy.app.timers.register(_run, first_interval=1.5)
