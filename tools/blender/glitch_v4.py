"""GLITCH v4 (hero pass): a sleek mesh predator instead of a shard cloud. Tall, narrow waist, broad angular chest,
digitigrade legs on blade feet, chevron visor slit, two swept-back blade fins, smooth dark glossy armour with a few
deliberate cyan (visor region) and magenta (decalColor region) seam lines. Ships as a normal kit (parts.glb) plus
<20 crisp shards (shards.json) that the runtime glitch shader animates on top. Stills add the glitch itself: one
forearm and one shin slice displaced sideways with hard cyan/magenta split edges, rim lights and a ground glow.
Run: blender --enable-event-simulate -noaudio -P glitch_v4.py -- [--fast] [--kit|--preview] --out=glitch-v4.png"""
import bpy, bmesh, math, sys, os, json, random
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix, Quaternion
from scout_v2 import *
import scout_v2 as S, addons as A

V = Vector
BK = mat('armor_white', (0.016, 0.018, 0.024), 0.16, 0.35, wear=True)   # glossy black armour (shell)
TS = mat('armor_blue', (0.026, 0.028, 0.036), 0.2, 0.4, wear=True)     # chest / helmet plates (torso)
DK = mat('frame', (0.008, 0.009, 0.011), 0.35, 0.7)                     # joints / under-suit
GC = mat('glow', (0, 0, 0), 0.3, 0, (0.15, 0.92, 1.0), 38)              # cyan seams + visor slit
GM = mat('glow_m', (0, 0, 0), 0.3, 0, (1.0, 0.1, 0.62), 32)             # magenta seams
GHC = mat('ghost_c', (0, 0, 0), 0.5, 0, (0.0, 0.9, 1.0), 5); GHM = mat('ghost_m', (0, 0, 0), 0.5, 0, (1.0, 0.05, 0.6), 5)  # stills-only split
GLITCH_SLOTS = {'helmet': ['smooth', 'skull', 'halo'], 'arms': ['block', 'blade', 'orbit'], 'bionics': ['wings', 'ring', 'spikes'],
                'legs': ['slim', 'block', 'digi'], 'thrusters': ['jets', 'trail', 'ring'], 'boots': ['block', 'hover', 'spike']}
TAG = {}

def tag(o, k): TAG.setdefault(k, []).append(o); return o

def blade(name, org, u, v, poly, th, m, bev=0.25):
    """Flat faceted plate: polygon (a, b) in the plane org + u*a + v*b, extruded th along u x v, crisp bevel."""
    org, u, v = V(org), V(u).normalized(), V(v).normalized(); n = u.cross(v).normalized()
    bm = bmesh.new()
    f = [bm.verts.new(org + u * a + v * b + n * th / 2) for a, b in poly]
    k = [bm.verts.new(org + u * a + v * b - n * th / 2) for a, b in poly]
    bm.faces.new(f); bm.faces.new(list(reversed(k)))
    for i in range(len(poly)):
        j = (i + 1) % len(poly); bm.faces.new((f[j], f[i], k[i], k[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(m)
    bv = o.modifiers.new('bv', 'BEVEL'); bv.width = th * bev; bv.segments = 2; bv.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='bv')
    o['_flat'] = 1; ALL.append(o); return o
plate = blade

def seam(name, a, b, m, r=0.0045): return cyl(name, V(a), V(b), r, m, n=8)

def build():
    up = []
    bone('Hips'); J['Hips'] = V((0, 0, 1.0))
    loft('pelvis', [(0.9, 0, 0.0, 0.07, 0.06), (0.97, 0, 0, 0.13, 0.095), (1.05, 0, 0, 0.12, 0.09), (1.1, 0, 0, 0.08, 0.07)], BK, e=2.3)
    plate('codpiece', (0, -0.1, 0.97), (1, 0, 0), (0, -0.25, 1), [(-0.06, 0.06), (0.06, 0.06), (0.025, -0.09), (-0.025, -0.09)], 0.02, TS)
    for s in (1, -1):
        plate(f'hipblade_{s}', (0.145 * s, 0.0, 0.99), (0, 1, 0), (0.3 * s, 0, 1), [(-0.1, 0.06), (0.1, 0.07), (0.07, -0.1), (-0.06, -0.08)], 0.018, TS)
    bone('Spine'); J['Spine'] = V((0, 0, 1.12))
    up.append(loft('waist', [(1.06, 0, 0, 0.07, 0.06), (1.16, 0, 0, 0.06, 0.055), (1.26, 0, 0, 0.085, 0.07)], DK, armor=False))
    for i in range(3):  # stacked ab plates over the wasp waist
        up.append(plate(f'ab{i}', (0, -0.072, 1.1 + i * 0.05), (1, 0, 0), (0, -0.15, 1), [(-0.05 + 0.006 * i, 0.02), (0.05 - 0.006 * i, 0.02), (0.04, -0.02), (-0.04, -0.02)], 0.014, BK))
    up.append(loft('chest', [(1.22, 0, 0.0, 0.1, 0.085), (1.38, 0, -0.015, 0.25, 0.15), (1.55, 0, -0.025, 0.4, 0.18), (1.66, 0, -0.01, 0.41, 0.16), (1.73, 0, 0.01, 0.28, 0.1)], BK, e=2.8))
    for s in (1, -1):
        up.append(plate(f'pec_{s}', (0.15 * s, -0.19, 1.5), (s, 0, 0), (0, -0.35, 1), [(-0.12, 0.11), (0.23, 0.13), (0.25, 0.03), (0.03, -0.13), (-0.12, -0.05)], 0.035, TS))
        up.append(seam(f'seam_pec_{s}', (0.035 * s, -0.235, 1.41), (0.33 * s, -0.19, 1.6), GC))
        up.append(seam(f'seam_side_{s}', (0.36 * s, -0.08, 1.58), (0.17 * s, -0.06, 1.27), GM))
        up.append(seam(f'seam_collar_{s}', (0.04 * s, -0.12, 1.705), (0.2 * s, -0.07, 1.69), GC, r=0.0035))
    up.append(plate('core', (0, -0.23, 1.42), (1, 0, 0), (0, -0.3, 1), [(0, 0.05), (0.035, 0), (0, -0.05), (-0.035, 0)], 0.02, GC))
    up.append(plate('spine_fin', (0, 0.17, 1.47), (0, 1, 0), (0, 0, 1), [(-0.02, 0.2), (0.12, 0.05), (0.06, -0.2), (-0.02, -0.15)], 0.014, TS))
    slot('bionics', 'wings')
    for s in (1, -1): up.append(plate(f'b_wing_{s}', (0.18 * s, 0.2, 1.6), (s, 0.5, 0.3), (0, 0.4, 1), [(0, 0.03), (0.42, 0.22), (0.46, 0.18), (0.1, -0.08)], 0.012, BK))
    slot('bionics', 'ring'); up.append(cyl('b_ring', V((0, 0.2, 1.4)), V((0, 0.21, 1.4)), 0.3, GC, n=32))
    slot('bionics', 'spikes')
    for i, s in ((0, 1), (1, -1), (2, 1), (3, -1)): up.append(plate(f'b_spk{i}', (0.07 * s, 0.17, 1.3 + i * 0.1), (0, 1, 0.3), (s, 0, 0), [(0, -0.02), (0.16, 0), (0, 0.02)], 0.012, BK))
    slot('thrusters', 'jets')
    for s in (1, -1): up.append(cyl(f't_jet_{s}', V((0.1 * s, 0.17, 1.45)), V((0.12 * s, 0.24, 1.2)), 0.035, DK, r2=0.05))
    slot('thrusters', 'trail'); up.append(plate('t_trail', (0, 0.19, 1.25), (1, 0, 0), (0, 0, 1), [(-0.03, 0.1), (0.03, 0.1), (0.01, -0.12), (-0.01, -0.12)], 0.02, GM))
    slot('thrusters', 'ring'); up.append(cyl('t_ring', V((0, 0.17, 1.4)), V((0, 0.24, 1.4)), 0.12, DK))
    slot('body')
    # head: compact angular helmet, chevron visor slit, two swept-back blade fins
    bone('Head'); J['Head'] = V((0, -0.02, 1.78))
    up.append(loft('neck', [(1.68, 0, 0, 0.045, 0.045), (1.8, 0, 0, 0.035, 0.04)], DK, armor=False))
    up.append(loft('helmet', [(1.78, 0, 0.0, 0.05, 0.065), (1.85, 0, -0.005, 0.082, 0.1), (1.93, 0, 0.01, 0.074, 0.105), (1.985, 0, 0.03, 0.035, 0.07)], BK, e=2.2))
    up.append(plate('face', (0, -0.1, 1.865), (1, 0, 0), (0, -0.3, 1), [(-0.085, 0.045), (0, 0.065), (0.085, 0.045), (0.06, -0.035), (0, -0.075), (-0.06, -0.035)], 0.03, TS))
    up.append(plate('visor', (0, -0.118, 1.873), (1, 0, 0), (0, -0.3, 1), [(-0.078, 0.024), (0, 0.0), (0.078, 0.024), (0.074, 0.01), (0, -0.016), (-0.074, 0.01)], 0.02, GC))
    for s in (1, -1):
        up.append(plate(f'fin_{s}', (0.062 * s, 0.0, 1.92), (0.42 * s, 1, 0.05), (0, -0.1, 1), [(-0.06, 0.0), (0.05, 0.045), (0.42, 0.2), (0.47, 0.205), (0.16, 0.0), (-0.03, -0.035)], 0.012, TS))
        up.append(seam(f'seam_fin_{s}', (0.064 * s, 0.03, 1.968), (0.24 * s, 0.43, 2.12), GC, r=0.003))
    slot('helmet', 'smooth'); up.append(plate('h_smooth', (0, -0.03, 1.985), (1, 0, 0), (0, 1, 0.2), [(-0.03, -0.06), (0.03, -0.06), (0.015, 0.08), (-0.015, 0.08)], 0.012, TS))
    slot('helmet', 'skull')
    for i in range(3): up.append(plate(f'h_skull{i}', (0, 0.0 + i * 0.04, 1.99), (1, 0, 0), (0, 1, 0), [(-0.03, -0.008), (0.03, -0.008), (0.03, 0.008), (-0.03, 0.008)], 0.01, GM))
    slot('helmet', 'halo'); up.append(cyl('h_halo', V((0, 0.08, 2.1)), V((0, 0.08, 2.108)), 0.14, GC, n=32))
    slot('body')
    # arms (left, mirrored)
    bone('LeftArm'); J['LeftArm'] = V((0.38, 0, 1.62))
    sh, el, wr = V((0.44, 0, 1.6)), V((0.5, 0.04, 1.3)), V((0.52, -0.06, 1.0))
    loft('pauldron_L', [(1.62, 0.44, 0.0, 0.09, 0.11), (1.7, 0.45, 0.0, 0.13, 0.14), (1.76, 0.43, 0.01, 0.08, 0.1)], BK, e=2.2)
    plate('pauldron_blade_L', (0.47, 0.0, 1.77), (1, 0, -0.45), (0, 1, 0), [(-0.12, -0.14), (0.12, -0.11), (0.17, 0.04), (0.07, 0.22), (-0.1, 0.13)], 0.03, TS)
    seam('seam_pauldron_L', (0.38, -0.14, 1.81), (0.6, -0.11, 1.7), GM)
    ua = loft('upperarm_L', [(0, 0, 0, 0.045, 0.045), (0.15, 0, 0, 0.055, 0.055), (0.3, 0, 0, 0.042, 0.042)], DK, armor=False); place(ua, sh, el)
    bone('LeftForeArm'); J['LeftForeArm'] = el.copy()
    tag(cyl('elbow_L', el + V((-0.04, 0, 0)), el + V((0.04, 0, 0)), 0.04, DK), 'fa')
    fa = loft('forearm_L', [(0, 0, 0, 0.045, 0.045), (0.09, 0, 0, 0.07, 0.068), (0.31, 0, 0, 0.05, 0.048)], BK, e=2.3); place(fa, el, wr); tag(fa, 'fa')
    tag(plate('fa_blade_L', el.lerp(wr, 0.45) + V((0.055, 0.0, 0)), (0, 0.25, -1), (0, 1, 0.25), [(-0.16, -0.01), (0.16, 0.0), (0.2, 0.05), (-0.1, 0.05)], 0.012, TS), 'fa')
    tag(seam('seam_fa_L', el + V((0.064, -0.03, -0.05)), wr + V((0.048, -0.02, 0.04)), GC), 'fa')
    slot('arms', 'block'); plate('a_block_L', el.lerp(wr, 0.5) + V((0, -0.06, 0)), (1, 0, 0), (0, -0.3, 1), [(-0.05, 0.1), (0.05, 0.1), (0.05, -0.1), (-0.05, -0.1)], 0.03, TS)
    slot('arms', 'blade'); plate('a_blade_L', wr + V((0.04, -0.05, -0.05)), (0, 0.1, -1), (0, -1, 0), [(-0.05, -0.02), (0.28, 0.0), (0.0, 0.03)], 0.008, GC)
    slot('arms', 'orbit')
    for i in range(3): plate(f'a_orb{i}_L', V((0.62, -0.02 + 0.04 * i, 1.08 + i * 0.07)), (1, 0, 0), (0, 0, 1), [(0, 0.02), (0.02, 0), (0, -0.02), (-0.02, 0)], 0.02, GM)
    slot('body')
    S.build_hand('L', wr, (wr - el).normalized(), fingers=5, size=1.3, curl=0.5, armor_m=BK, digit_m=DK, thick=0.85)
    arm = [o for o in ALL if o['bone'].startswith(('LeftArm', 'LeftFore', 'LeftHand', 'LeftF'))]
    up += arm; up += mirror(arm)
    # digitigrade legs on blade feet
    bone('LeftUpLeg'); hip, knee, ank = V((0.13, 0, 0.98)), V((0.16, -0.17, 0.62)), V((0.15, 0.1, 0.24))
    ball, toe = V((0.15, -0.04, 0.045)), V((0.15, -0.27, 0.02))
    J['LeftUpLeg'], J['LeftLeg'], J['LeftFoot'] = hip.copy(), knee.copy(), ank.copy()
    th = loft('thigh_L', [(0, 0, 0, 0.08, 0.085), (0.14, 0, 0, 0.092, 0.095), (0.4, 0, 0, 0.05, 0.055)], BK, e=2.3); place(th, hip, knee)
    plate('thigh_plate_L', hip.lerp(knee, 0.4) + V((0.0, -0.085, 0.0)), (1, 0, 0), (knee - hip).normalized(), [(-0.06, 0.13), (0.065, 0.12), (0.03, -0.15), (-0.03, -0.15)], 0.022, TS)
    seam('seam_thigh_L', hip + V((0.085, -0.03, -0.04)), knee + V((0.05, 0.0, 0.06)), GC)
    bone('LeftLeg')
    tag(cyl('knee_L', knee + V((-0.05, 0, 0)), knee + V((0.05, 0, 0)), 0.048, DK), 'shin')
    tag(plate('kneecap_L', knee + V((0, -0.05, 0.02)), (1, 0, 0), (0, -0.6, 1), [(-0.04, 0.05), (0.04, 0.05), (0.0, -0.11)], 0.03, TS), 'shin')
    sn = loft('shin_L', [(0, 0, 0, 0.055, 0.06), (0.12, 0, 0, 0.065, 0.075), (0.42, 0, 0, 0.038, 0.04)], BK, e=2.3); place(sn, knee, ank); tag(sn, 'shin')
    tag(plate('calf_blade_L', knee.lerp(ank, 0.4) + V((0, 0.07, 0)), (0, 0, 1), (0, 1, 0), [(-0.12, 0.0), (0.12, 0.0), (0.0, 0.06)], 0.012, TS), 'shin')
    tag(seam('seam_shin_L', knee + V((0.05, -0.01, -0.05)), ank + V((0.038, 0.0, 0.05)), GM), 'shin')
    slot('legs', 'slim'); plate('l_slim_L', hip.lerp(knee, 0.5) + V((0.09, 0, 0)), (0, 1, 0), (0, 0, 1), [(-0.03, 0.12), (0.03, 0.12), (0.01, -0.12)], 0.01, GC)
    slot('legs', 'block'); plate('l_block_L', hip.lerp(knee, 0.5) + V((0, -0.1, 0)), (1, 0, 0), (0, -0.2, 1), [(-0.08, 0.1), (0.08, 0.1), (0.07, -0.1), (-0.07, -0.1)], 0.04, TS)
    slot('legs', 'digi'); plate('l_digi_L', knee + V((0, 0.07, -0.12)), (0, 0, 1), (0, 1, 0), [(-0.1, 0), (0.1, 0), (0.0, 0.09)], 0.015, BK)
    slot('body')
    bone('LeftFoot')
    cyl('hock_L', ank + V((-0.04, 0, 0)), ank + V((0.04, 0, 0)), 0.04, DK)
    mt = loft('meta_L', [(0, 0, 0, 0.035, 0.04), (0.12, 0, 0, 0.042, 0.048), (0.22, 0, 0, 0.03, 0.032)], BK, e=2.3); place(mt, ank, ball)
    plate('foot_blade_L', ball + V((0, 0, -0.01)), (0, -1, 0), (1, 0, 0), [(-0.08, -0.04), (0.08, -0.045), (0.25, -0.006), (0.25, 0.006), (0.08, 0.045), (-0.08, 0.04)], 0.03, TS)
    plate('heel_spur_L', ank + V((0, 0.03, -0.05)), (0, 1, 0), (0, 0, 1), [(-0.02, 0.04), (0.06, -0.02), (0.13, -0.2), (0.0, -0.1)], 0.016, TS)
    seam('seam_toe_L', ball + V((0, 0.06, 0.012)), toe + V((0, 0.01, 0.006)), GC, r=0.0035)
    slot('boots', 'block'); plate('bt_block_L', ball + V((0, -0.02, -0.005)), (1, 0, 0), (0, -1, 0), [(-0.06, -0.12), (0.06, -0.12), (0.06, 0.12), (-0.06, 0.12)], 0.04, DK)
    slot('boots', 'hover'); cyl('bt_hover_L', ball + V((0, -0.02, -0.03)), ball + V((0, -0.02, -0.04)), 0.08, GC)
    slot('boots', 'spike'); plate('bt_spike_L', toe + V((0, -0.05, 0)), (0, -1, 0), (1, 0, 0), [(0, -0.012), (0.12, 0), (0, 0.012)], 0.01, GM)
    slot('body')
    for o in ALL:
        if o.type == 'MESH' and not o.get('_flat'): o.data.shade_smooth()
    leg = [o for o in ALL if o['bone'] in ('LeftUpLeg', 'LeftLeg', 'LeftFoot')]
    TAG['shin_R'] = [m for m in mirror(leg) if any(m.name == o.name.replace('_L', '_R') for o in TAG.get('shin', []))]
    lean = Matrix.Translation((0, 0, 1.12)) @ Matrix.Rotation(0.09, 4, 'X').inverted() @ Matrix.Translation((0, 0, -1.12))
    for o in set(up): o.matrix_world = lean @ o.matrix_world
    for k_ in list(J):
        if not k_.startswith(('Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot')): J[k_] = lean @ J[k_]

def _jb(bn): return J[bn] if bn in J else V((-J[bn.replace('Right', 'Left')].x, J[bn.replace('Right', 'Left')].y, J[bn.replace('Right', 'Left')].z))

SHARD_V = [(0, 1, 0), (0, -1, 0), (1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, 0, -1)]
SHARD_F = [(0, 2, 4), (0, 4, 3), (0, 3, 5), (0, 5, 2), (1, 4, 2), (1, 3, 4), (1, 5, 3), (1, 2, 5)]

def make_shards():
    """16 crisp shards: chips spalling off the two displaced slices, plus a short trail off the back. [bone, pos, euler, (hx,hy,hz), cat]"""
    rnd = random.Random(5); L = []
    fa = (J['LeftForeArm'] + (J['LeftHand'] if 'LeftHand' in J else J['LeftForeArm'] + V((0, -0.1, -0.3)))) * 0.5
    for i in range(6):
        L.append(('LeftForeArm', fa + V((0.09 + 0.05 * i + rnd.uniform(0, 0.02), rnd.uniform(-0.05, 0.05), rnd.uniform(-0.07, 0.07))), (rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)),
                  (0.018 - 0.0015 * i, 0.026 - 0.002 * i, 0.003), 2 if i in (1, 4) else 1))
    sn = V((-0.155, -0.04, 0.43))
    for i in range(5):
        L.append(('RightLeg', sn + V((-0.08 - 0.05 * i, rnd.uniform(-0.04, 0.04), rnd.uniform(-0.06, 0.06))), (rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)),
                  (0.017 - 0.0015 * i, 0.024 - 0.002 * i, 0.003), 2 if i == 2 else 1))
    for i in range(5):
        L.append(('Spine', V((0.12 + 0.13 * i, 0.3 + 0.16 * i, 1.55 - 0.03 * i)), (0.2 * i, 0.5, 0.3 * i), (0.012 - 0.0015 * i, 0.03 - 0.004 * i, 0.002), 2 if i % 2 else 1))
    return L

def shard_out(L):
    parts = {}; objs = []
    mats = [BK, DK, GC]
    for k, (bn, pos, eu, (hx, hy, hz), c) in enumerate(L):
        from mathutils import Euler
        q = Euler(eu).to_quaternion(); rel = pos - _jb(bn); gq = Quaternion((q.w, q.x, q.z, -q.y))
        parts.setdefault(bn, []).append([round(rel.x, 4), round(rel.z, 4), round(-rel.y, 4), hx, hy, hz, round(gq.x, 4), round(gq.y, 4), round(gq.z, 4), round(gq.w, 4), c])
        bm = bmesh.new(); R = q.to_matrix()
        vv = [bm.verts.new(pos + R @ V((x * hx, y * hy, z * hz))) for x, y, z in SHARD_V]
        for f in SHARD_F: bm.faces.new([vv[i] for i in f])
        me = bpy.data.meshes.new(f'shard{k}'); bm.to_mesh(me); bm.free(); me.materials.append(mats[c])
        o = bpy.data.objects.new(me.name, me); bpy.context.scene.collection.objects.link(o); objs.append(o)
    return {'version': 2, 'shard': 'octa', 'tris_total': len(L) * 8,
            'parts': [{'slot': 'body', 'opt': 'base', 'bone': b, 'shards': v} for b, v in sorted(parts.items())]}, objs

def _cut(o, co, no, keep_pos):
    """Bisect o (world plane co/no), keep one side, cap the hole."""
    mi = o.matrix_world.inverted(); lc = mi @ co; ln = (o.matrix_world.to_3x3().transposed() @ no).normalized()
    bm = bmesh.new(); bm.from_mesh(o.data)
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=lc, plane_no=ln, clear_inner=keep_pos, clear_outer=not keep_pos)
    bnd = [e for e in bm.edges if e.is_boundary]
    if bnd:
        bmesh.ops.holes_fill(bm, edges=bnd, sides=0)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free(); o.data.update()

def glitch_slice(objs, a, b, t0, t1, off):
    """Cut the [t0, t1] band of a limb out, push it sideways by `off`, and put hard cyan / magenta copies behind it."""
    d = (b - a).normalized(); p0, p1 = a.lerp(b, t0), a.lerp(b, t1)
    for o in objs:
        if o.type != 'MESH': continue
        band = o.copy(); band.data = o.data.copy(); bpy.context.scene.collection.objects.link(band)
        top = o.copy(); top.data = o.data.copy(); bpy.context.scene.collection.objects.link(top)
        _cut(o, p0, d, False)                       # o keeps the part before p0
        _cut(top, p1, d, True)                      # top keeps the part after p1
        _cut(band, p0, d, True); _cut(band, p1, d, False)
        if not band.data.polygons: bpy.data.objects.remove(band, do_unlink=True); continue
        band.location += off
        az = -0.6; rt, away = V((math.cos(az), math.sin(az), 0)), V((-math.sin(az), math.cos(az), 0))  # screen-right / away from camera
        for m, sx in ((GHC, 0.011), (GHM, -0.011)):
            g = band.copy(); g.data = band.data.copy(); g.data.materials.clear(); g.data.materials.append(m)
            for p in g.data.polygons: p.material_index = 0
            g.location += rt * sx + away * 0.025; g.visible_shadow = False; bpy.context.scene.collection.objects.link(g)

def stage():
    sc = bpy.context.scene
    def rim(name, loc, e, col, size=0.9):
        l = bpy.data.lights.new(name, 'AREA'); l.energy = e; l.size = size; l.color = col
        ob = bpy.data.objects.new(name, l); sc.collection.objects.link(ob); ob.location = loc
        ob.rotation_euler = (V((0, 0, 1.4)) - V(loc)).to_track_quat('-Z', 'Y').to_euler()
    rim('rim_glitch_c', (-1.7, 1.9, 2.4), 1100, (0.1, 0.85, 1.0))
    rim('rim_glitch_m', (1.9, 1.7, 1.9), 800, (1.0, 0.12, 0.7))
    # ground glow: radial emissive pool + a low cyan bounce
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=0.9, fill_type='NGON', location=(0, -0.02, 0.003)); gd = bpy.context.active_object
    m = bpy.data.materials.new('ground_glow'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); tc = nt.nodes.new('ShaderNodeTexCoord'); gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1.1, 1.1, 1.1)
    rp = nt.nodes.new('ShaderNodeValToRGB'); rp.color_ramp.elements[0].color = (0, 0, 0, 1); rp.color_ramp.elements[1].position = 0.9; rp.color_ramp.elements[1].color = (0.35, 0.3, 1.0, 1)
    rp.color_ramp.elements.new(0.55).color = (0.0, 0.5, 0.9, 1)
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.6
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], gr.inputs['Vector']); nt.links.new(gr.outputs['Color'], rp.inputs['Fac'])
    nt.links.new(rp.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
    m.blend_method = 'BLEND'; gd.data.materials.append(m); gd['_hide'] = 0
    l = bpy.data.lights.new('ground_bounce', 'POINT'); l.energy = 40; l.color = (0.3, 0.7, 1.0); l.shadow_soft_size = 0.5
    ob = bpy.data.objects.new('ground_bounce', l); sc.collection.objects.link(ob); ob.location = (0, -0.25, 0.12)

def main():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    build(); yield 0.1
    import v2export as X
    X.JOV = J
    L = make_shards(); data, sh_objs = shard_out(L)
    print('SHARDS', len(L), 'TRIS', len(L) * 8, flush=True)
    if '--kit' in S.argv:
        for o in sh_objs: bpy.data.objects.remove(o, do_unlink=True)
        X.export_kit('glitch', GLITCH_SLOTS, budget=26000)
        json.dump(data, open(f'{X.REPO}/public/robot/glitch/shards.json', 'w'), separators=(',', ':'))
        return
    if '--preview' in S.argv:
        hand = J['LeftHand'] if 'LeftHand' in J else J['LeftForeArm'] + V((0, -0.1, -0.3))
        glitch_slice(TAG['fa'], J['LeftForeArm'], hand, 0.38, 0.62, V((0.06, -0.05, 0)))
        glitch_slice(TAG['shin_R'], V((-0.16, -0.17, 0.62)), V((-0.15, 0.1, 0.24)), 0.35, 0.6, V((-0.055, 0.05, 0)))
        stage()
        S.render(S.OUT.replace('.png', '-34.png'), tgt=(0.05, 0.05, 1.08), dist=6.2)
        S.render(S.OUT.replace('.png', '-closeup.png'), cam_az=-0.45, cam_el=0.06, res=(1500, 1200), tgt=(0.05, -0.05, 1.6), dist=2.8, lens=60, setup=False)

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
