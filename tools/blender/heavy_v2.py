"""HEAVY v5: round torso after robot-refs/2-heavy-mech.png, bulky rounded limbs (see build()). Was v3: siege juggernaut. Layered gunmetal armour over an orange hazard core,
sunken armoured head with a mono-rail sensor array, stacked slab pauldrons, hydraulic forearms ending in
big four-finger mecha fists, piston-braced columns on splayed armoured feet, reactor exhausts.
Run: blender --enable-event-simulate -noaudio -P heavy_v2.py -- [--fast] [--kit]"""
import bpy, math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix
from scout_v2 import *            # primitives, rig tagging (bone/slot/J), render
import scout_v2 as S, addons as A

V = Vector
GUN = mat('armor_white', (0.045, 0.05, 0.055), 0.45, 0.55, wear=True)    # shell: gunmetal
ORG = mat('armor_blue', (0.52, 0.16, 0.01), 0.48, wear=True)            # torso: hazard orange
YLW = mat('armor_red', (0.60, 0.42, 0.03), 0.48, wear=True)             # shorts: yellow trims
DRK = mat('armor_yellow', (0.03, 0.035, 0.04), 0.55, 0.6, wear=True)     # backpack: soot black
FR = mat('frame', (0.04, 0.042, 0.05), 0.5, 0.85)
ST = mat('steel', (0.5, 0.5, 0.52), 0.2, 1.0)
VIS = mat('glow', (0, 0, 0), 0.3, 0, (1.0, 0.08, 0.02), 22)   # red mono-slit
HOT = mat('glow_m', (0, 0, 0), 0.3, 0, (1.0, 0.55, 0.1), 10)   # leg heat vents (decalColor)
HEAVY_SLOTS = {'helmet': ['dome', 'slit', 'periscope'], 'arms': ['piledriver', 'shield', 'gatling'], 'bionics': ['reactor', 'plate', 'missiles'],
               'legs': ['piston', 'reverse', 'armored'], 'thrusters': ['booster', 'cans', 'vectored'], 'boots': ['tank', 'claw', 'stomper']}

def box(name, c, half, m, rx=0.0, ry=0.0, rz=0.0, bev=0.18):
    R = (Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X'))
    return S._box(name, V(c), (R.col[0], R.col[1], R.col[2]), half, m, bev)

def ell(name, c, r, m, n=20):
    """Smooth ellipsoid (loft of superellipse rings, e=2): r = (rx, ry, rz)."""
    rings = [(c[2] + r[2] * math.sin(a), c[0], c[1], max(0.004, r[0] * math.cos(a)), max(0.004, r[1] * math.cos(a))) for a in [(-0.5 + k / 8) * math.pi for k in range(9)]]
    return loft(name, rings, m, n=n, e=2.0)

def build():
    """HEAVY v5: torso after robot-refs/2-heavy-mech.png (rounded dome chest, small sunk head, round cylinder shoulder
    pods with disc sides, exposed mechanical waist of stacked rings / pistons / cables); limbs bulky and rounded
    (thick round plates, oversized forearms and fists, thick thighs / calves, big planted feet). Original design."""
    up, arm = [], []
    R2 = 2.3   # roundness of the armour lofts (2 = ellipse)
    # ---- pelvis: compact gearbox with rounded hip cups
    bone('Hips'); J['Hips'] = V((0, 0, 0.98))
    loft('pelvis', [(0.86, 0, 0, 0.2, 0.16), (0.96, 0, 0, 0.27, 0.2), (1.08, 0, 0, 0.25, 0.19)], FR, e=2.6)
    loft('pelvis_cap', [(1.04, 0, 0, 0.28, 0.215), (1.09, 0, 0, 0.27, 0.205)], GUN, e=2.4)
    loft('crotch_plate', [(0.80, 0, -0.17, 0.08, 0.04), (0.96, 0, -0.2, 0.15, 0.05), (1.05, 0, -0.21, 0.17, 0.05)], YLW, e=2.4)
    for s in (1, -1):
        loft(f'hip_skirt_{s}', [(0.82, 0.33 * s, -0.02, 0.05, 0.17), (0.96, 0.32 * s, -0.02, 0.07, 0.21), (1.06, 0.29 * s, -0.02, 0.05, 0.19)], GUN, e=R2)
        cyl(f'hip_skirt_lip_{s}', V((0.36 * s, -0.02, 0.84)), V((0.37 * s, -0.02, 0.86)), 0.15, YLW, n=24)
    # ---- exposed mechanical waist: stacked rings, pistons, cables (ref)
    bone('Spine'); J['Spine'] = V((0, 0, 1.12))
    up.append(loft('waist', [(1.04, 0, 0, 0.16, 0.13), (1.34, 0, 0, 0.18, 0.15)], FR, armor=False))
    for i in range(5):
        z = 1.08 + i * 0.055
        up.append(cyl(f'ab_ring_{i}', V((0, 0, z)), V((0, 0, z + 0.03)), 0.2 - (i % 2) * 0.025, ST if i % 2 else GUN, n=28))
    for k in range(6):
        a_ = k * math.pi / 3 + 0.5; d = V((math.cos(a_), math.sin(a_), 0))
        piston(f'waist_piston_{k}', V((0, 0, 1.06)) + d * 0.2, V((0, 0, 1.36)) + d * 0.23, r=0.02)
    for s in (1, -1):
        for k in range(3):  # cable bundles drooping from the chest into the hips
            p0, p1 = V((0.12 * s + 0.03 * k * s, -0.16, 1.34)), V((0.16 * s + 0.03 * k * s, -0.12, 1.06))
            up.append(cyl(f'cable_{s}_{k}', p0, p0.lerp(p1, 0.5) + V((0.04 * s, -0.05, 0)), 0.014, DRK, n=10))
            up.append(cyl(f'cable_b_{s}_{k}', p0.lerp(p1, 0.5) + V((0.04 * s, -0.05, 0)), p1, 0.014, DRK, n=10))
    # ---- dome chest: rounded barrel, flattened belly, seam bands, round glowing core
    up.append(loft('chest', [(1.30, 0, 0.02, 0.30, 0.24), (1.40, 0, -0.01, 0.44, 0.33), (1.58, 0, -0.03, 0.53, 0.40), (1.76, 0, -0.02, 0.52, 0.39),
                             (1.92, 0, 0.0, 0.42, 0.33), (2.02, 0, 0.02, 0.24, 0.2), (2.05, 0, 0.02, 0.08, 0.07)], ORG, e=2.2, n=32))
    for i, z in enumerate((1.47, 1.86)):  # rounded panel bands (seams) around the dome
        rx_, ry_ = (0.512, 0.39) if i == 0 else (0.465, 0.365)
        up.append(loft(f'chest_band_{i}', [(z - 0.008, 0, -0.025, rx_, ry_), (z + 0.008, 0, -0.025, rx_, ry_)], FR, e=2.2, n=32))
    up.append(cyl('core_ring', V((0, -0.36, 1.58)), V((0, -0.43, 1.58)), 0.1, ST, n=32))
    up.append(cyl('core', V((0, -0.41, 1.58)), V((0, -0.435, 1.58)), 0.075, VIS, n=32))
    for i in range(8):
        a_ = i * math.pi / 4; c_ = V((0.12 * math.cos(a_), -0.42, 1.58 + 0.12 * math.sin(a_)))
        up.append(box(f'core_clamp_{i}', c_, (0.018, 0.02, 0.012), GUN, ry=-a_, bev=0.4))
    for i in range(4): up.append(box(f'grille_{i}', (0, -0.36, 1.34 + i * 0.035), (0.14 - i * 0.012, 0.03, 0.008), FR, bev=0.3))
    up.append(loft('back_plate', [(1.36, 0, 0.3, 0.36, 0.08), (1.62, 0, 0.36, 0.42, 0.09), (1.88, 0, 0.3, 0.34, 0.08)], DRK, e=2.4))
    for s in (1, -1):
        up.append(cyl(f'stack_{s}', V((0.18 * s, 0.4, 1.4)), V((0.22 * s, 0.46, 2.12)), 0.06, FR, n=20))
        up.append(cyl(f'stack_cap_{s}', V((0.22 * s, 0.46, 2.09)), V((0.225 * s, 0.465, 2.16)), 0.075, ST, n=20))
        up.append(cyl(f'stack_glow_{s}', V((0.225 * s, 0.465, 2.155)), V((0.225 * s, 0.465, 2.165)), 0.05, VIS, n=16))
    # antenna mast (ref) on the dome
    up.append(cyl('mast', V((-0.14, 0.05, 1.98)), V((-0.14, 0.05, 2.22)), 0.018, FR, n=10)); up.append(cyl('mast_tip', V((-0.14, 0.05, 2.22)), V((-0.14, 0.05, 2.25)), 0.028, ST, n=12))
    # ---- head: small rounded helm sunk low in the dome's front, menacing visor slit
    bone('Head'); J['Head'] = V((0, -0.12, 1.86))
    up.append(ell('head', (0, -0.44, 1.8), (0.15, 0.13, 0.12), GUN, n=24))
    up.append(loft('visor_well', [(1.795, 0, -0.47, 0.135, 0.11), (1.845, 0, -0.47, 0.14, 0.115)], FR, e=2.2, arc=(-math.pi / 2 - 1.1, -math.pi / 2 + 1.1), thick=0.012, n=16))
    up.append(loft('eye_slit', [(1.81, 0, -0.475, 0.138, 0.113), (1.828, 0, -0.475, 0.14, 0.115)], VIS, e=2.2, arc=(-math.pi / 2 - 0.85, -math.pi / 2 + 0.85), thick=0.006, n=14))
    for s in (1, -1):
        up.append(box(f'brow_{s}', (0.07 * s, -0.55, 1.865), (0.075, 0.03, 0.016), GUN, rx=0.3, ry=0.35 * s, bev=0.4))
        up.append(cyl(f'head_vent_{s}', V((0.14 * s, -0.35, 1.81)), V((0.165 * s, -0.35, 1.81)), 0.04, FR, n=16))
    for i in range(3): up.append(box(f'mask_vent_{i}', (0, -0.56, 1.74 + i * 0.016), (0.05, 0.005, 0.004), ST, rx=-0.25, bev=0.2))
    slot('helmet', 'dome'); up.append(ell('h_dome', (0, -0.29, 1.95), (0.1, 0.09, 0.06), ST))
    slot('helmet', 'slit'); up.append(box('h_slit_crest', (0, -0.3, 1.98), (0.018, 0.11, 0.03), YLW))
    slot('helmet', 'periscope'); up.append(cyl('h_peri', V((0.1, -0.2, 1.9)), V((0.1, -0.2, 2.08)), 0.022, FR)); up.append(box('h_peri_eye', (0.1, -0.24, 2.08), (0.03, 0.05, 0.03), VIS))
    bone('Spine')
    slot('bionics', 'reactor'); up.append(cyl('b_reactor', V((0, 0.38, 1.62)), V((0, 0.52, 1.62)), 0.13, ST)); up.append(cyl('b_reactor_g', V((0, 0.52, 1.62)), V((0, 0.53, 1.62)), 0.1, VIS))
    slot('bionics', 'plate'); up.append(loft('b_plate', [(1.5, 0, -0.03, 0.57, 0.44), (1.7, 0, -0.03, 0.57, 0.44)], GUN, e=2.2, arc=(-math.pi / 2 - 0.6, -math.pi / 2 + 0.6), thick=0.025, n=14))
    slot('bionics', 'missiles'); up.append(ell('b_pod', (-0.3, 0.2, 2.02), (0.13, 0.15, 0.08), ORG))
    for i in range(3): up.append(cyl(f'b_tube{i}', V((-0.34 + i * 0.04, 0.06, 2.04)), V((-0.34 + i * 0.04, 0.05, 2.04)), 0.018, VIS))
    slot('thrusters', 'booster'); up.append(cyl('t_boost', V((0, 0.42, 1.3)), V((0, 0.6, 1.12)), 0.13, FR, r2=0.16))
    slot('thrusters', 'cans')
    for s in (1, -1): up.append(cyl(f't_can_{s}', V((0.16 * s, 0.42, 1.42)), V((0.16 * s, 0.47, 1.06)), 0.085, DRK))
    slot('thrusters', 'vectored')
    for s in (1, -1): up.append(cyl(f't_vec_{s}', V((0.34 * s, 0.38, 1.7)), V((0.47 * s, 0.55, 1.45)), 0.075, ST, r2=0.105))
    slot('body')
    # ---- arms: round shoulder pod (cylinder with disc side, ref) + bulky rounded limb armour, oversized fists
    bone('LeftArm'); J['LeftArm'] = V((0.56, 0, 1.68))
    pa, pb = V((0.46, 0, 1.74)), V((0.80, 0, 1.74))
    cyl('pauldron_L', pa, pb, 0.23, GUN, n=36)
    for i, (r_, w_, m_) in enumerate(((0.2, 0.025, ORG), (0.15, 0.04, FR), (0.1, 0.055, ST), (0.05, 0.07, FR))):  # disc side: stepped rings
        cyl(f'pauldron_disc{i}_L', pb, pb + V((w_, 0, 0)), r_, m_, n=32)
    for i in (-1, 1): cyl(f'pauldron_band{i}_L', pa.lerp(pb, 0.5 + 0.3 * i), pa.lerp(pb, 0.5 + 0.3 * i) + V((0.03, 0, 0)), 0.238, YLW if i < 0 else FR, n=36)
    sh, el, wr = V((0.68, 0, 1.6)), V((0.70, 0.03, 1.28)), V((0.70, -0.08, 0.95))
    ua = loft('bicep_L', [(0, 0, 0, 0.13, 0.13), (0.12, 0, 0, 0.16, 0.155), (0.27, 0, 0, 0.13, 0.13)], GUN, e=R2); place(ua, sh, el)
    cyl('bicep_band_L', sh.lerp(el, 0.72), sh.lerp(el, 0.78), 0.145, YLW, n=28)
    bone('LeftForeArm'); J['LeftForeArm'] = el.copy()
    joint('elbow_L', el, (1, 0, 0), 0.1, 0.22)
    ell('elbow_guard_L', el + V((0, 0.09, 0.02)), (0.1, 0.06, 0.08), GUN)
    fa = loft('forearm_L', [(-0.02, 0, 0, 0.13, 0.13), (0.12, 0, 0, 0.17, 0.17), (0.25, 0, 0, 0.165, 0.165), (0.33, 0, 0, 0.14, 0.14)], ORG, e=R2); place(fa, el, wr)
    fd = (wr - el).normalized(); fx = V((1, 0, 0)); fy = fd.cross(fx).normalized()
    cyl('forearm_cuff_L', el.lerp(wr, 0.88), el.lerp(wr, 0.97), 0.15, GUN, n=28)
    cyl('forearm_band_L', el.lerp(wr, 0.3), el.lerp(wr, 0.36), 0.175, GUN, n=28)
    piston('piston_arm_L', el + V((0.0, 0.16, 0.04)), wr + V((0, 0.15, 0.06)), r=0.026)
    slot('arms', 'piledriver'); cyl('a_pile_L', el + V((0.17, 0, -0.05)), wr + V((0.17, -0.03, -0.12)), 0.04, ST)
    slot('arms', 'shield'); box('a_shield_L', (0.9, -0.05, 1.12), (0.03, 0.22, 0.28), GUN)
    slot('arms', 'gatling')
    for i in range(3): cyl(f'a_gat{i}_L', el + V((0.18 + 0.03 * math.cos(i * 2.1), 0.03 * math.sin(i * 2.1) - 0.08, -0.06)), wr + V((0.18, -0.2, -0.05)), 0.016, FR)
    slot('body')
    S.build_hand('L', wr - fd * 0.01, fd, fingers=5, size=2.9, curl=1.05, armor_m=GUN, digit_m=FR, thick=1.35)
    arm = [o for o in ALL if o['bone'].startswith(('LeftArm', 'LeftFore', 'LeftHand', 'LeftF'))]
    up += arm; up += mirror(arm)
    # ---- legs: thick rounded thighs and calves, v4 knee joints / hubs / pistons, big rounded planted feet
    bone('LeftUpLeg')
    hip, knee, ank = V((0.24, 0, 0.92)), V((0.28, -0.08, 0.55)), V((0.30, 0.02, 0.2))
    J['LeftUpLeg'], J['LeftLeg'], J['LeftFoot'] = hip.copy(), knee.copy(), ank.copy()
    joint('hip_L', hip, (1, 0, 0), 0.1, 0.18)
    th = loft('thigh_L', [(0, 0, 0, 0.17, 0.17), (0.14, 0, -0.01, 0.2, 0.2), (0.28, 0, 0, 0.18, 0.18), (0.36, 0, 0, 0.14, 0.14)], GUN, e=R2); place(th, hip, knee)
    tdv = (knee - hip).normalized(); X_ = V((1, 0, 0)); ty = tdv.cross(X_).normalized()
    tp_ = loft('thigh_plate_L', [(0.06, 0, 0, 0.212, 0.212), (0.18, 0, 0, 0.222, 0.222), (0.3, 0, 0, 0.198, 0.198)], ORG, e=R2,
               arc=(-math.pi / 2 - 0.9, -math.pi / 2 + 0.9), thick=0.02, n=14); place(tp_, hip, knee)
    cyl('thigh_band_L', hip.lerp(knee, 0.82), hip.lerp(knee, 0.88), 0.19, YLW, n=28)
    piston('thigh_piston_L', hip + X_ * 0.2 - ty * 0.02, knee + X_ * 0.19 + tdv * -0.04, r=0.026)
    bone('LeftLeg')
    joint('knee_L', knee, (1, 0, 0), 0.12, 0.28)
    for sx_ in (-1, 1): joint(f'knee_hub{sx_}_L', knee + V((0.15 * sx_, 0, 0)), (1, 0, 0), 0.08, 0.03)
    ell('kneecap_L', knee + V((0, -0.15, 0.03)), (0.1, 0.05, 0.09), YLW)
    sh_ = loft('shin_L', [(-0.02, 0, 0, 0.15, 0.15), (0.1, 0, 0.02, 0.18, 0.19), (0.24, 0, 0, 0.17, 0.17), (0.35, 0, 0, 0.14, 0.14)], ORG, e=R2); place(sh_, knee, ank)
    sdv = (ank - knee).normalized(); sy = sdv.cross(X_).normalized()
    cp = loft('shin_calf_L', [(0.04, 0, 0.0, 0.188, 0.2), (0.16, 0, 0.02, 0.198, 0.212), (0.3, 0, 0, 0.18, 0.18)], GUN, e=R2,
              arc=(math.pi / 2 - 1.0, math.pi / 2 + 1.0), thick=0.022, n=14); place(cp, knee, ank)
    for i in range(3): box(f'shin_vent{i}_L', knee.lerp(ank, 0.55 + i * 0.075) + V((0, -0.175, 0)) - sy * 0.0, (0.08, 0.014, 0.01), HOT, bev=0.4)
    piston('shin_piston_L', knee + V((0.21, 0.02, -0.02)), ank + V((0.2, 0.03, 0.08)), r=0.026)
    piston('calf_piston_L', knee + V((0, 0.22, -0.02)), ank + V((0, 0.2, 0.06)), r=0.026)
    slot('legs', 'piston'); piston('l_piston_L', hip + V((0, -0.2, -0.05)), knee.lerp(ank, 0.5) + V((0, -0.2, 0)), r=0.03)
    slot('legs', 'reverse'); ell('l_rev_L', knee + V((0, 0.19, -0.05)), (0.09, 0.08, 0.14), GUN)
    slot('legs', 'armored'); loft('l_arm_L', [(0.5, 0.2, -0.05, 0.04, 0.16), (0.72, 0.21, -0.05, 0.05, 0.19), (0.88, 0.2, -0.05, 0.04, 0.15)], GUN, e=R2)
    slot('body')
    bone('LeftFoot')
    joint('ankle_L', ank, (1, 0, 0), 0.1, 0.22)
    for sx_ in (-1, 1): piston(f'ankle_piston{sx_}_L', knee.lerp(ank, 0.6) + V((0.16 * sx_, 0.1, 0)), ank + V((0.14 * sx_, -0.12, -0.1)), r=0.018)
    foot = loft('foot_L', [(-0.27, 0, 0.0, 0.18, 0.09), (-0.2, 0, 0.0, 0.23, 0.11), (0.1, 0, 0.02, 0.24, 0.12), (0.3, 0, -0.01, 0.2, 0.09), (0.4, 0, -0.03, 0.15, 0.06)], GUN, e=2.6)
    foot.matrix_world = Matrix.Translation(ank + V((0, -0.08, -0.13))) @ Matrix.Rotation(math.pi / 2, 4, 'X')  # loft z -> -y (toes forward)
    ell('ankle_guard_L', ank + V((0, -0.11, 0.0)), (0.13, 0.07, 0.07), ORG)
    for i, xo in enumerate((-0.12, 0.0, 0.12)): ell(f'foot_toe{i}_L', ank + V((xo * 1.25, -0.45, -0.16)), (0.07, 0.09, 0.055), YLW if i == 1 else GUN)
    ell('foot_heel_L', ank + V((0, 0.23, -0.15)), (0.17, 0.08, 0.06), GUN)
    box('sole_L', ank + V((0, -0.1, -0.205)), (0.24, 0.37, 0.022), FR, bev=0.5)
    slot('boots', 'tank'); box('bt_tread_L', ank + V((0.22, -0.06, -0.12)), (0.03, 0.26, 0.07), FR)
    slot('boots', 'claw')
    for i in (-1, 0, 1): box(f'bt_claw{i}_L', ank + V((0.11 * i, -0.47, -0.17)), (0.025, 0.07, 0.025), ST, rx=0.3)
    slot('boots', 'stomper'); ell('bt_stomp_L', ank + V((0, 0.0, 0.04)), (0.2, 0.2, 0.08), ORG)
    slot('body')
    mirror([o for o in ALL if o['bone'] in ('LeftUpLeg', 'LeftLeg', 'LeftFoot')])
    lean = Matrix.Translation((0, 0, 1.1)) @ Matrix.Rotation(0.12, 4, 'X').inverted() @ Matrix.Translation((0, 0, -1.1))
    up = [o for o in ALL if not o['bone'].startswith(('Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'))]
    for o in set(up): o.matrix_world = lean @ o.matrix_world
    for k_ in list(J):
        if not k_.startswith(('Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot')): J[k_] = lean @ J[k_]

def addon_pass():
    for o in S.ALL: S.bake_world(o)
    for o in S.ARMOR:
        if o.name.startswith(('chest', 'head', 'thigh', 'shin', 'forearm')):
            A.mm_fuse_loop(o, lambda e: len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.7, width=0.008, segments=4)
    names = {o.name: o for o in S.ALL}
    for nm in ('chest', 'shin_L', 'thigh_L'):
        o = names.get(nm)
        if not o: continue
        bb = S.bounds(o)
        for i in range(3):
            loc = (0, -0.5, 1.46 + i * 0.05) if nm == 'chest' else tuple(S.bounds(o)[0].lerp(S.bounds(o)[1], 0.5) + V((0.12, 0, -0.05 + i * 0.05)))
            bpy.ops.mesh.primitive_cube_add(size=1, location=loc); c = bpy.context.active_object
            c.scale = (0.5, 0.3, 0.014) if nm == 'chest' else (0.1, 0.1, 0.012); bpy.ops.object.transform_apply(scale=True)
            A.hops_boolean(o, c)
        S.sanitize(o, bb)
    for o in S.ARMOR + [x for x in S.ALL if x.name.startswith(('pauldron', 'foot', 'box', 'bicep', 'kneecap', 'back_plate', 'thigh_', 'shin_', 'brow_', 'horn_'))]:
        A.hops_bevel(o, width=0.005, segments=2, angle=35); A.apply_all(o)
    yield 0.1
    others = [o for o in bpy.data.objects if o.type == 'MESH']
    plan = [('chest_plate_1', 'F', 0.5, 0.5, 0.25, 0.012, 0.014, 'BOX', 0.06), ('chest', 'F', 0.3, 0.45, 0.012, 0.2, 0.014, 'BOX', 0.06), ('chest', 'F', 0.7, 0.45, 0.012, 0.2, 0.014, 'BOX', 0.06),
            ('back_plate', 'B', 0.5, 0.5, 0.012, 0.3, 0.014, 'BOX', 0.06), ('back_plate', 'B', 0.3, 0.7, 0.04, 0, 0.014, 'CIRCLE', 0.06), ('back_plate', 'B', 0.7, 0.7, 0.04, 0, 0.014, 'CIRCLE', 0.06),
            ('head', 'F', 0.5, 0.75, 0.15, 0.01, 0.01, 'BOX', 0.05)]
    for s in ('L', 'R'):
        out = 'R' if s == 'L' else 'L'
        plan += [(f'thigh_{s}', out, 0.5, 0.5, 0.012, 0.25, 0.014, 'BOX', 0.06), (f'shin_{s}', out, 0.5, 0.55, 0.05, 0, 0.014, 'CIRCLE', 0.06),
                 (f'forearm_{s}', out, 0.5, 0.5, 0.012, 0.2, 0.012, 'BOX', 0.06), (f'forearm_{s}', out, 0.5, 0.25, 0.1, 0.012, 0.012, 'BOX', 0.06)]
    if S.FAST: plan = plan[:4]
    bpy.context.preferences.view.smooth_view = 0
    for nm, face, u, v, w, h, d, shape, tol in plan:
        o = bpy.data.objects.get(nm)
        if o: yield from A.bc_cut(o, [x for x in others if x is not o and x.name in bpy.data.objects], face, u, v, w, h, d, shape, tol)
    A.bc_cleanup()
    for o in S.ARMOR:
        if o.name in bpy.data.objects: A.hops_weighted_normal(o); A.apply_all(o)
    import bmesh
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        bm = bmesh.new(); bm.from_mesh(o.data)
        for f in bm.faces: f.smooth = True
        for e in bm.edges: e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.52)
        bm.to_mesh(o.data); bm.free()

def main():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    build(); yield 0.1
    if '--preview' in S.argv:
        S.render(S.OUT.replace('.png', '-34.png'), tgt=(0, 0, 1.1), dist=6.2)
        S.render(S.OUT.replace('.png', '-closeup.png'), cam_az=-0.6, cam_el=0.15, res=(1500, 1200), tgt=(0.62, -0.2, 1.05), dist=2.2, lens=60, setup=False); return
    if '--skel' in S.argv if 'heavy' != 'scout' else '--skel' in argv:
        import v2export as X; X.write_skeleton('heavy', [o for o in bpy.data.objects if o.type == 'MESH']); return
    yield from addon_pass()
    print('TRIS', sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons), flush=True)
    bpy.ops.wm.save_as_mainfile(filepath='/workspace/private/heavy_v2.blend')
    import v2export as X
    X.turnaround('heavy', tgt_z=1.1, dist=6.2, slots=HEAVY_SLOTS)
    if '--kit' in S.argv: X.export_kit('heavy', HEAVY_SLOTS)

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
