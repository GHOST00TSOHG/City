"""HEAVY v3 (rebuilt from scratch): siege juggernaut. Layered gunmetal armour over an orange hazard core,
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

def build():
    up, arm, leg = [], [], []
    # ---- pelvis: gearbox core with layered hip armour
    bone('Hips'); J['Hips'] = V((0, 0, 0.98))
    box('pelvis', (0, 0, 0.98), (0.24, 0.19, 0.12), FR)
    box('pelvis_cap', (0, 0, 1.08), (0.27, 0.21, 0.03), GUN, bev=0.4)
    loft('crotch_plate', [(0.80, 0, -0.17, 0.09, 0.04), (0.96, 0, -0.2, 0.15, 0.05), (1.05, 0, -0.21, 0.17, 0.05)], YLW, e=3)
    box('crotch_guard', (0, -0.235, 0.9), (0.07, 0.02, 0.08), GUN, rx=0.15, bev=0.4)
    for s in (1, -1):
        box(f'hip_skirt_{s}', (0.31 * s, -0.02, 0.95), (0.055, 0.21, 0.16), GUN, ry=0.28 * s)
        box(f'hip_skirt_lip_{s}', (0.355 * s, -0.02, 0.83), (0.04, 0.2, 0.03), YLW, ry=0.28 * s, bev=0.4)
        for i in range(2): cyl(f'hip_bolt_{s}_{i}', V((0.36 * s, -0.1 + 0.2 * i, 1.04)), V((0.375 * s, -0.1 + 0.2 * i, 1.04)), 0.014, ST, n=8)
    # ---- torso: armoured bunker in layers (core, chest slabs, abdominal bands, collar)
    bone('Spine'); J['Spine'] = V((0, 0, 1.12))
    up.append(loft('waist', [(1.05, 0, 0, 0.19, 0.15), (1.22, 0, 0, 0.23, 0.17)], FR, armor=False))
    for i in range(3): up.append(box(f'ab_band_{i}', (0, -0.17, 1.1 + i * 0.05), (0.15 - i * 0.01, 0.025, 0.02), GUN if i % 2 == 0 else ORG, rx=-0.1, bev=0.4))
    up.append(loft('chest', [(1.20, 0, 0, 0.34, 0.25), (1.40, 0, -0.02, 0.46, 0.31), (1.64, 0, -0.03, 0.50, 0.33), (1.80, 0, 0, 0.40, 0.29)], ORG, e=4.4))
    for s in (1, -1):
        up.append(box(f'chest_plate_{s}', (0.23 * s, -0.31, 1.55), (0.18, 0.045, 0.19), GUN, rz=-0.5 * s, rx=-0.12, bev=0.3))
        up.append(box(f'chest_plate_edge_{s}', (0.3 * s, -0.33, 1.38), (0.12, 0.03, 0.02), YLW, rz=-0.5 * s, rx=-0.12, bev=0.4))
        up.append(box(f'rib_plate_{s}', (0.43 * s, -0.12, 1.36), (0.05, 0.16, 0.13), GUN, rz=-0.2 * s, bev=0.3))
        for i in range(3): up.append(box(f'rib_slat_{s}_{i}', (0.47 * s, -0.12, 1.31 + i * 0.05), (0.012, 0.13, 0.008), FR, rz=-0.2 * s, bev=0.2))
    up.append(loft('collar', [(1.74, 0, 0.02, 0.36, 0.30), (1.93, 0, 0.04, 0.30, 0.26)], GUN, e=4.5, arc=(-math.pi * 1.0, 0.0), thick=0.045))
    for i in range(4): up.append(box(f'grille_{i}', (0, -0.355, 1.27 + i * 0.04), (0.14, 0.018, 0.01), FR, bev=0.3))
    up.append(box('back_plate', (0, 0.33, 1.52), (0.37, 0.05, 0.28), DRK))
    up.append(box('back_spine', (0, 0.385, 1.5), (0.06, 0.03, 0.3), GUN, bev=0.4))
    for s in (1, -1):
        up.append(cyl(f'stack_{s}', V((0.2 * s, 0.42, 1.35)), V((0.24 * s, 0.48, 2.1)), 0.058, FR, n=20))
        for i in range(3): up.append(cyl(f'stack_ring_{s}_{i}', V((0.2 * s, 0.42, 1.35)).lerp(V((0.24 * s, 0.48, 2.1)), 0.3 + i * 0.2), V((0.2 * s, 0.42, 1.35)).lerp(V((0.24 * s, 0.48, 2.1)), 0.33 + i * 0.2), 0.068, GUN, n=20))
        up.append(cyl(f'stack_cap_{s}', V((0.24 * s, 0.48, 2.07)), V((0.245 * s, 0.485, 2.15)), 0.074, ST, n=20))
        up.append(cyl(f'stack_glow_{s}', V((0.245 * s, 0.485, 2.145)), V((0.245 * s, 0.485, 2.155)), 0.05, VIS, n=16))
    up.append(cyl('core_ring', V((0, -0.355, 1.6)), V((0, -0.39, 1.6)), 0.09, ST, n=28))
    up.append(cyl('core', V((0, -0.37, 1.6)), V((0, -0.395, 1.6)), 0.065, VIS, n=28))
    for i in range(6):
        a_ = i * math.pi / 3; c_ = V((0.11 * math.cos(a_), -0.37, 1.6 + 0.11 * math.sin(a_)))
        up.append(box(f'core_clamp_{i}', c_, (0.02, 0.02, 0.012), GUN, rx=0, ry=-a_, bev=0.3))
    # ---- head: low armoured wedge sunk in the collar, sensor rail with eye array (no face)
    bone('Head'); J['Head'] = V((0, -0.12, 1.86))
    up.append(loft('head', [(1.80, 0, -0.12, 0.15, 0.14), (1.92, 0, -0.14, 0.18, 0.16), (2.02, 0, -0.13, 0.15, 0.14), (2.07, 0, -0.11, 0.08, 0.09)], GUN, e=4.5))
    for s in (1, -1):  # V-brow: two angled slabs meeting low in the middle, glaring
        up.append(box(f'brow_{s}', (0.085 * s, -0.31, 1.975), (0.1, 0.06, 0.022), GUN, rx=0.45, ry=0.32 * s, bev=0.2))
        up.append(box(f'horn_{s}', (0.16 * s, -0.17, 2.04), (0.022, 0.1, 0.03), YLW, rx=-0.5, ry=-0.4 * s, bev=0.2))
        up.append(box(f'eye_slit_{s}', (0.07 * s, -0.31, 1.94), (0.05, 0.005, 0.007), VIS, ry=-0.3 * s, bev=0.3))
    up.append(box('face_mask', (0, -0.3, 1.875), (0.1, 0.03, 0.04), FR, rx=-0.25, bev=0.2))
    for i in range(3): up.append(box(f'mask_vent_{i}', (0, -0.33, 1.86 + i * 0.016), (0.07, 0.005, 0.004), ST, rx=-0.25, bev=0.2))
    up.append(box('visor_well', (0, -0.29, 1.935), (0.17, 0.02, 0.022), FR, bev=0.3))
    up.append(box('cheek_guard', (0, -0.27, 1.86), (0.13, 0.045, 0.04), GUN, rx=-0.3, bev=0.3))
    for s in (1, -1):
        up.append(box(f'jaw_{s}', (0.09 * s, -0.25, 1.86), (0.07, 0.05, 0.05), FR, rz=-0.5 * s))
        up.append(cyl(f'head_vent_{s}', V((0.17 * s, -0.12, 1.92)), V((0.19 * s, -0.12, 1.92)), 0.04, FR, n=16))
    slot('helmet', 'dome'); up.append(loft('h_dome', [(1.98, 0, 0.0, 0.11, 0.11), (2.06, 0, 0.0, 0.08, 0.08), (2.09, 0, 0, 0.02, 0.02)], ST, e=2.2))
    slot('helmet', 'slit'); up.append(box('h_slit_crest', (0, -0.05, 2.04), (0.02, 0.16, 0.035), YLW))
    slot('helmet', 'periscope'); up.append(cyl('h_peri', V((0.09, 0.02, 1.98)), V((0.09, 0.02, 2.2)), 0.025, FR)); up.append(box('h_peri_eye', (0.09, -0.02, 2.2), (0.03, 0.05, 0.03), VIS))
    bone('Spine')
    slot('bionics', 'reactor'); up.append(cyl('b_reactor', V((0, 0.36, 1.75)), V((0, 0.52, 1.75)), 0.12, ST)); up.append(cyl('b_reactor_g', V((0, 0.52, 1.75)), V((0, 0.53, 1.75)), 0.09, VIS))
    slot('bionics', 'plate'); up.append(box('b_plate', (0, -0.42, 1.46), (0.34, 0.03, 0.2), GUN))
    slot('bionics', 'missiles'); up.append(box('b_pod', (-0.38, 0.12, 2.0), (0.13, 0.16, 0.08), ORG))
    for i in range(3): up.append(cyl(f'b_tube{i}', V((-0.42 + i * 0.04, -0.05, 2.0)), V((-0.42 + i * 0.04, -0.05, 2.0)) + V((0, -0.01, 0)), 0.018, VIS))
    slot('thrusters', 'booster'); up.append(cyl('t_boost', V((0, 0.4, 1.2)), V((0, 0.6, 1.05)), 0.12, FR, r2=0.15))
    slot('thrusters', 'cans')
    for s in (1, -1): up.append(cyl(f't_can_{s}', V((0.15 * s, 0.4, 1.35)), V((0.15 * s, 0.45, 1.0)), 0.08, DRK))
    slot('thrusters', 'vectored')
    for s in (1, -1): up.append(cyl(f't_vec_{s}', V((0.32 * s, 0.38, 1.6)), V((0.45 * s, 0.55, 1.35)), 0.07, ST, r2=0.1))
    slot('body')
    # ---- arms: stacked slab pauldrons, armoured bicep, hydraulic forearm, big mecha fist
    bone('LeftArm'); J['LeftArm'] = V((0.56, 0, 1.68))
    joint('shoulder_L', V((0.52, 0, 1.68)), (1, 0, 0), 0.1, 0.14)
    box('pauldron_L', (0.66, 0.0, 1.88), (0.22, 0.27, 0.15), GUN, ry=-0.28, bev=0.22)
    box('pauldron_top_L', (0.64, 0.0, 2.02), (0.17, 0.22, 0.03), GUN, ry=-0.28, bev=0.4)
    box('pauldron_stripe_L', (0.69, -0.26, 1.87), (0.18, 0.02, 0.045), YLW, ry=-0.28)
    for i in range(3): box(f'pauldron_hazard_{i}_L', (0.6 + i * 0.06, -0.275, 1.89 - i * 0.017), (0.012, 0.006, 0.04), FR, ry=-0.28 + 0.6, bev=0.2)
    box('pauldron_rim_L', (0.83, 0.0, 1.73), (0.05, 0.27, 0.1), ORG, ry=-0.28)
    box('pauldron_rim2_L', (0.86, 0.0, 1.63), (0.035, 0.24, 0.05), GUN, ry=-0.28, bev=0.4)
    sh, el, wr = V((0.66, 0, 1.62)), V((0.70, 0.03, 1.28)), V((0.70, -0.08, 0.95))
    cyl('upperarm_L', sh, el, 0.07, FR)
    box('bicep_L', (0.69, 0.0, 1.46), (0.1, 0.11, 0.12), GUN, bev=0.3)
    box('bicep_band_L', (0.69, 0.0, 1.37), (0.105, 0.115, 0.015), YLW, bev=0.4)
    bone('LeftForeArm'); J['LeftForeArm'] = el.copy()
    joint('elbow_L', el, (1, 0, 0), 0.08, 0.14)
    box('elbow_guard_L', el + V((0, 0.1, 0.02)), (0.08, 0.04, 0.07), GUN, rx=0.4, bev=0.4)
    fa = loft('forearm_L', [(0, 0, 0, 0.11, 0.12), (0.16, 0, 0, 0.15, 0.15), (0.31, 0, 0, 0.14, 0.13)], ORG, e=4); place(fa, el, wr)
    fd = (wr - el).normalized(); fx = V((1, 0, 0)); fy = fd.cross(fx).normalized()
    S._box('forearm_plate_L', el.lerp(wr, 0.5) + fx * 0.15, (fy, fx, fd), (0.11, 0.02, 0.13), GUN, bev=0.35)
    S._box('forearm_cuff_L', el.lerp(wr, 0.9) + fx * 0.0, (fx, fy, fd), (0.15, 0.15, 0.02), GUN, bev=0.35)
    piston('piston_arm_L', el + V((0, 0.14, 0.06)), wr + V((0, 0.12, 0.04)), r=0.028)
    slot('arms', 'piledriver'); cyl('a_pile_L', el + V((0.13, 0, -0.05)), wr + V((0.13, -0.03, -0.12)), 0.04, ST)
    slot('arms', 'shield'); box('a_shield_L', (0.86, -0.05, 1.12), (0.03, 0.22, 0.28), GUN)
    slot('arms', 'gatling')
    for i in range(3): cyl(f'a_gat{i}_L', el + V((0.14 + 0.03 * math.cos(i * 2.1), 0.03 * math.sin(i * 2.1) - 0.08, -0.06)), wr + V((0.14, -0.2, -0.05)), 0.016, FR)
    slot('body')
    S.build_hand('L', wr - fd * 0.01, fd, fingers=5, size=2.5, curl=0.55, armor_m=GUN, digit_m=FR, thick=1.25)
    arm = [o for o in ALL if o['bone'].startswith(('LeftArm', 'LeftFore', 'LeftHand', 'LeftF'))]
    up += arm; up += mirror(arm)
    # ---- legs: armoured columns, knee bastions, braced pistons, splayed armoured feet
    bone('LeftUpLeg')
    hip, knee, ank = V((0.24, 0, 0.92)), V((0.28, -0.08, 0.55)), V((0.30, 0.02, 0.2))
    J['LeftUpLeg'], J['LeftLeg'], J['LeftFoot'] = hip.copy(), knee.copy(), ank.copy()
    joint('hip_L', hip, (1, 0, 0), 0.09, 0.16)
    th = loft('thigh_L', [(0, 0, 0, 0.13, 0.13), (0.18, 0, 0, 0.155, 0.14), (0.34, 0, 0, 0.12, 0.11)], FR, e=6, n=8); place(th, hip, knee)
    tdv = (knee - hip).normalized(); ty = tdv.cross(V((1, 0, 0))).normalized()
    X_ = V((1, 0, 0)); tm = hip.lerp(knee, 0.5)
    S._box('thigh_plate_L', tm - ty * 0.165, (X_, ty, tdv), (0.16, 0.03, 0.16), ORG, bev=0.12)
    for sx_ in (1, -1):  # chamfered front facets either side of the plate
        S._box(f'thigh_facet_{sx_}_L', tm - ty * 0.135 + X_ * 0.165 * sx_, (X_, ty, tdv), (0.03, 0.02, 0.14), ORG, bev=0.12)
    S._box('thigh_side_L', tm + X_ * 0.17, (X_, ty, tdv), (0.03, 0.14, 0.16), GUN, bev=0.12)
    S._box('thigh_side_in_L', tm - X_ * 0.12, (X_, ty, tdv), (0.02, 0.1, 0.13), GUN, bev=0.12)
    S._box('thigh_back_L', tm + ty * 0.15, (X_, ty, tdv), (0.11, 0.02, 0.13), GUN, bev=0.12)
    piston('thigh_piston_L', hip + X_ * 0.17 - ty * 0.05, knee + X_ * 0.17 - ty * 0.02 + tdv * -0.04, r=0.026)
    bone('LeftLeg')
    joint('knee_L', knee, (1, 0, 0), 0.11, 0.26)
    for sx_ in (-1, 1): joint(f'knee_hub{sx_}_L', knee + V((0.14 * sx_, 0, 0)), (1, 0, 0), 0.075, 0.03)
    box('kneecap_L', knee + V((0, -0.14, 0.03)), (0.12, 0.055, 0.11), YLW, rx=0.2, bev=0.3)
    box('kneecap_spike_L', knee + V((0, -0.19, 0.05)), (0.05, 0.03, 0.06), GUN, rx=0.35, bev=0.4)
    sh_ = loft('shin_L', [(0, 0, 0, 0.11, 0.11), (0.18, 0, 0, 0.13, 0.13), (0.34, 0, 0, 0.12, 0.12)], FR, e=6, n=8); place(sh_, knee, ank)
    sdv = (ank - knee).normalized(); sy = sdv.cross(V((1, 0, 0))).normalized()
    sm = knee.lerp(ank, 0.45)
    S._box('shin_front_L', sm - sy * 0.15, (X_, sy, sdv), (0.15, 0.03, 0.17), ORG, bev=0.12)
    S._box('shin_plate_L', knee.lerp(ank, 0.32) - sy * 0.185, (X_, sy, sdv), (0.1, 0.012, 0.08), GUN, bev=0.2)
    for sx_ in (1, -1):
        S._box(f'shin_side_{sx_}_L', sm + X_ * 0.16 * sx_, (X_, sy, sdv), (0.025, 0.14, 0.16), ORG if sx_ > 0 else GUN, bev=0.12)
    S._box('shin_calf_L', sm + sy * 0.14, (X_, sy, sdv), (0.13, 0.03, 0.15), GUN, bev=0.12)
    for i in range(3): box(f'shin_vent{i}_L', knee.lerp(ank, 0.58 + i * 0.07) + V((0, -0.19, 0)), (0.09, 0.012, 0.01), HOT)
    piston('shin_piston_L', knee + V((0.2, 0.02, -0.02)), ank + V((0.2, 0.03, 0.08)), r=0.026)
    piston('calf_piston_L', knee + V((0, 0.19, -0.02)), ank + V((0, 0.19, 0.06)), r=0.026)
    slot('legs', 'piston'); piston('l_piston_L', hip + V((0, -0.16, -0.05)), knee.lerp(ank, 0.5) + V((0, -0.17, 0)), r=0.03)
    slot('legs', 'reverse'); box('l_rev_L', knee + V((0, 0.17, -0.05)), (0.08, 0.08, 0.14), GUN)
    slot('legs', 'armored'); box('l_arm_L', hip.lerp(knee, 0.5) + V((0.12, -0.05, 0)), (0.04, 0.17, 0.19), GUN)
    slot('body')
    bone('LeftFoot')
    joint('ankle_L', ank, (1, 0, 0), 0.095, 0.2)
    for sx_ in (-1, 1): piston(f'ankle_piston{sx_}_L', knee.lerp(ank, 0.6) + V((0.15 * sx_, 0.1, 0)), ank + V((0.13 * sx_, -0.12, -0.1)), r=0.018)
    box('foot_L', ank + V((0, -0.08, -0.12)), (0.2, 0.29, 0.08), GUN, bev=0.25)
    box('ankle_guard_L', ank + V((0, -0.1, 0.0)), (0.12, 0.06, 0.06), ORG, rx=0.4, bev=0.4)
    for i, xo in enumerate((-0.11, 0.0, 0.11)): box(f'foot_toe{i}_L', ank + V((xo * 1.3, -0.4, -0.15)), (0.06, 0.08, 0.05), YLW if i == 1 else GUN, rz=0.15 * (i - 1), bev=0.35)
    box('foot_heel_L', ank + V((0, 0.22, -0.15)), (0.16, 0.07, 0.05), GUN, bev=0.35)
    box('sole_L', ank + V((0, -0.09, -0.19)), (0.22, 0.34, 0.02), FR)
    slot('boots', 'tank'); box('bt_tread_L', ank + V((0.19, -0.06, -0.12)), (0.03, 0.26, 0.07), FR)
    slot('boots', 'claw')
    for i in (-1, 0, 1): box(f'bt_claw{i}_L', ank + V((0.1 * i, -0.42, -0.17)), (0.025, 0.07, 0.025), ST, rx=0.3)
    slot('boots', 'stomper'); box('bt_stomp_L', ank + V((0, 0.0, 0.04)), (0.19, 0.2, 0.07), ORG)
    slot('body')
    mirror([o for o in ALL if o['bone'] in ('LeftUpLeg', 'LeftLeg', 'LeftFoot')])
    lean = Matrix.Translation((0, 0, 1.1)) @ Matrix.Rotation(0.12, 4, 'X').inverted() @ Matrix.Translation((0, 0, -1.1))
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
