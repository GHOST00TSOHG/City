"""HEAVY v2: siege frame. Low and wide, slab shoulders, head sunk into the chest bunker, mono-slit visor,
hydraulic pistons everywhere, 3-digit clamp hands, stub legs on elephant feet, twin exhaust stacks.
Run: blender --enable-event-simulate -noaudio -P heavy_v2.py -- [--fast] [--kit]"""
import bpy, math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix
from scout_v2 import *            # primitives, rig tagging (bone/slot/J), render
import scout_v2 as S, addons as A

V = Vector
GUN = mat('armor_white', (0.16, 0.17, 0.18), 0.42, 0.35)    # shell: gunmetal
ORG = mat('armor_blue', (0.62, 0.20, 0.01), 0.36)            # torso: hazard orange
YLW = mat('armor_red', (0.70, 0.50, 0.03), 0.35)             # shorts: yellow trims
DRK = mat('armor_yellow', (0.03, 0.035, 0.04), 0.5, 0.6)     # backpack: soot black
FR = mat('frame', (0.04, 0.042, 0.05), 0.5, 0.85)
ST = mat('steel', (0.5, 0.5, 0.52), 0.2, 1.0)
VIS = mat('glow', (0, 0, 0), 0.3, 0, (1.0, 0.08, 0.02), 22)   # red mono-slit
HEAVY_SLOTS = {'helmet': ['dome', 'slit', 'periscope'], 'arms': ['piledriver', 'shield', 'gatling'], 'bionics': ['reactor', 'plate', 'missiles'],
               'legs': ['piston', 'reverse', 'armored'], 'thrusters': ['booster', 'cans', 'vectored'], 'boots': ['tank', 'claw', 'stomper']}

def box(name, c, half, m, rx=0.0, ry=0.0, rz=0.0, bev=0.18):
    R = (Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X'))
    return S._box(name, V(c), (R.col[0], R.col[1], R.col[2]), half, m, bev)

def build():
    up, arm, leg = [], [], []
    # ---- pelvis: armoured gearbox, wide
    bone('Hips'); J['Hips'] = V((0, 0, 0.98))
    box('pelvis', (0, 0, 0.98), (0.26, 0.2, 0.13), FR)
    loft('crotch_plate', [(0.80, 0, -0.17, 0.10, 0.04), (0.98, 0, -0.2, 0.16, 0.05), (1.06, 0, -0.2, 0.18, 0.05)], YLW, e=3)
    for s in (1, -1):
        box(f'hip_skirt_{s}', (0.3 * s, -0.02, 0.95), (0.06, 0.2, 0.15), GUN, ry=0.25 * s)
    # ---- torso bunker (huge chest, head sunk into it)
    bone('Spine'); J['Spine'] = V((0, 0, 1.12))
    up.append(loft('waist', [(1.05, 0, 0, 0.2, 0.16), (1.22, 0, 0, 0.24, 0.18)], FR, armor=False))
    up.append(loft('chest', [(1.18, 0, 0, 0.36, 0.26), (1.40, 0, -0.02, 0.48, 0.32), (1.66, 0, -0.03, 0.52, 0.34), (1.82, 0, 0, 0.40, 0.30)], ORG, e=4.2))
    for s in (1, -1): up.append(box(f'chest_plate_{s}', (0.24 * s, -0.31, 1.52), (0.17, 0.04, 0.2), GUN, rz=-0.55 * s, rx=-0.12))
    up.append(loft('collar', [(1.74, 0, 0.02, 0.36, 0.30), (1.92, 0, 0.04, 0.30, 0.26)], GUN, e=4.5, arc=(-math.pi * 1.0, 0.0), thick=0.04))  # bunker lip around the head
    for i in range(4):
        up.append(box(f'grille_{i}', (0, -0.36, 1.30 + i * 0.045), (0.16, 0.02, 0.012), FR, bev=0.3))
    up.append(box('back_plate', (0, 0.33, 1.52), (0.38, 0.05, 0.28), DRK))
    # exhaust stacks + reactor core glow
    for s in (1, -1):
        up.append(cyl(f'stack_{s}', V((0.2 * s, 0.42, 1.35)), V((0.24 * s, 0.48, 2.12)), 0.06, FR, n=20))
        up.append(cyl(f'stack_cap_{s}', V((0.24 * s, 0.48, 2.08)), V((0.245 * s, 0.485, 2.16)), 0.075, ST, n=20))
        up.append(cyl(f'stack_glow_{s}', V((0.245 * s, 0.485, 2.155)), V((0.245 * s, 0.485, 2.165)), 0.05, VIS, n=16))
    up.append(cyl('core', V((0, -0.37, 1.58)), V((0, -0.40, 1.58)), 0.07, VIS, n=24))
    up.append(cyl('core_ring', V((0, -0.36, 1.58)), V((0, -0.395, 1.58)), 0.095, ST, n=24))
    # ---- head: low wedge, sunk, mono-slit
    bone('Head'); J['Head'] = V((0, -0.12, 1.86))
    up.append(loft('head', [(1.80, 0, -0.12, 0.15, 0.14), (1.92, 0, -0.14, 0.18, 0.16), (2.02, 0, -0.13, 0.15, 0.14), (2.07, 0, -0.11, 0.08, 0.09)], GUN, e=4.5))
    up.append(box('brow', (0, -0.3, 1.985), (0.2, 0.07, 0.035), GUN, rx=0.5))
    up.append(box('visor', (0, -0.3, 1.935), (0.16, 0.014, 0.012), VIS, bev=0.4))
    for s in (1, -1):
        up.append(box(f'jaw_{s}', (0.07 * s, -0.27, 1.86), (0.08, 0.05, 0.05), FR, rz=-0.5 * s))
    # helmet variants
    slot('helmet', 'dome'); up.append(loft('h_dome', [(1.98, 0, 0.0, 0.11, 0.11), (2.06, 0, 0.0, 0.08, 0.08), (2.09, 0, 0, 0.02, 0.02)], ST, e=2.2))
    slot('helmet', 'slit'); up.append(box('h_slit_crest', (0, -0.05, 2.04), (0.02, 0.16, 0.035), YLW))
    slot('helmet', 'periscope'); up.append(cyl('h_peri', V((0.09, 0.02, 1.98)), V((0.09, 0.02, 2.2)), 0.025, FR)); up.append(box('h_peri_eye', (0.09, -0.02, 2.2), (0.03, 0.05, 0.03), VIS))
    # bionics variants (on the chest/shoulder line)
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
    # ---- arms: slab pauldrons, piston-driven forearms, clamp hands
    bone('LeftArm'); J['LeftArm'] = V((0.56, 0, 1.68))
    arm.append(joint('shoulder_L', V((0.52, 0, 1.68)), (1, 0, 0), 0.1, 0.14) or None)
    arm.append(box('pauldron_L', (0.66, 0.0, 1.86), (0.22, 0.27, 0.17), GUN, ry=-0.28, bev=0.22))
    arm.append(box('pauldron_stripe_L', (0.69, -0.25, 1.86), (0.18, 0.02, 0.05), YLW, ry=-0.28))
    arm.append(box('pauldron_rim_L', (0.82, 0.0, 1.72), (0.05, 0.26, 0.1), ORG, ry=-0.28))
    sh, el, wr = V((0.66, 0, 1.62)), V((0.70, 0.03, 1.28)), V((0.70, -0.08, 0.95))
    arm.append(cyl('upperarm_L', sh, el, 0.075, FR))
    arm.append(box('bicep_L', (0.69, 0.0, 1.46), (0.1, 0.11, 0.13), GUN))
    bone('LeftForeArm'); J['LeftForeArm'] = el.copy()
    arm.append(joint('elbow_L', el, (1, 0, 0), 0.08, 0.14) or None)
    fa = loft('forearm_L', [(0, 0, 0, 0.11, 0.12), (0.16, 0, 0, 0.15, 0.15), (0.32, 0, 0, 0.14, 0.13)], ORG, e=4); place(fa, el, wr); arm.append(fa)
    piston('piston_arm_L', el + V((0, 0.14, 0.06)), wr + V((0, 0.12, 0.04)), r=0.03)
    slot('arms', 'piledriver'); arm.append(cyl('a_pile_L', el + V((0.13, 0, -0.05)), wr + V((0.13, -0.03, -0.12)), 0.04, ST))
    slot('arms', 'shield'); arm.append(box('a_shield_L', (0.86, -0.05, 1.12), (0.03, 0.22, 0.28), GUN))
    slot('arms', 'gatling')
    for i in range(3): arm.append(cyl(f'a_gat{i}_L', el + V((0.14 + 0.03 * math.cos(i * 2.1), 0.03 * math.sin(i * 2.1) - 0.08, -0.06)), wr + V((0.14, -0.2, -0.05)), 0.016, FR))
    slot('body')
    S.build_hand('L', wr, (wr - el).normalized(), fingers=3, size=2.6, curl=0.4, armor_m=GUN, digit_m=FR, thick=1.6)
    arm = [o for o in ALL if o['bone'].startswith(('LeftArm', 'LeftFore', 'LeftHand', 'LeftF'))]
    up += arm; up += mirror(arm)
    # ---- legs: short thick columns, knee rams, elephant feet
    bone('LeftUpLeg')
    hip, knee, ank = V((0.24, 0, 0.92)), V((0.28, -0.08, 0.55)), V((0.30, 0.02, 0.2))
    J['LeftUpLeg'], J['LeftLeg'], J['LeftFoot'] = hip.copy(), knee.copy(), ank.copy()
    leg.append(joint('hip_L', hip, (1, 0, 0), 0.09, 0.16) or None)
    th = loft('thigh_L', [(0, 0, 0, 0.13, 0.13), (0.2, 0, 0, 0.16, 0.15), (0.36, 0, 0, 0.13, 0.12)], GUN, e=4); place(th, hip, knee); leg.append(th)
    bone('LeftLeg')
    leg.append(joint('knee_L', knee, (1, 0, 0), 0.09, 0.2) or None)
    leg.append(box('kneecap_L', knee + V((0, -0.13, 0.02)), (0.12, 0.05, 0.1), YLW, rx=0.2))
    sh_ = loft('shin_L', [(0, 0, 0, 0.15, 0.15), (0.18, 0, 0, 0.19, 0.18), (0.34, 0, 0, 0.17, 0.16)], ORG, e=4.2); place(sh_, knee, ank); leg.append(sh_)
    for i in range(3): leg.append(box(f'shin_vent{i}_L', knee.lerp(ank, 0.35 + i * 0.12) + V((0, -0.17, 0)), (0.1, 0.012, 0.012), FR))
    slot('legs', 'piston'); piston('l_piston_L', hip + V((0, -0.16, -0.05)), knee.lerp(ank, 0.5) + V((0, -0.17, 0)), r=0.03)
    slot('legs', 'reverse'); leg.append(box('l_rev_L', knee + V((0, 0.17, -0.05)), (0.08, 0.08, 0.14), GUN))
    slot('legs', 'armored'); leg.append(box('l_arm_L', hip.lerp(knee, 0.5) + V((0.12, -0.05, 0)), (0.04, 0.17, 0.19), GUN))
    slot('body')
    bone('LeftFoot')
    leg.append(joint('ankle_L', ank, (1, 0, 0), 0.08, 0.16) or None)
    leg.append(box('foot_L', ank + V((0, -0.06, -0.12)), (0.17, 0.25, 0.08), GUN, bev=0.25))
    leg.append(box('foot_toe_L', ank + V((0, -0.3, -0.15)), (0.16, 0.06, 0.05), YLW))
    leg.append(box('sole_L', ank + V((0, -0.06, -0.19)), (0.18, 0.27, 0.02), FR))
    slot('boots', 'tank'); leg.append(box('bt_tread_L', ank + V((0.19, -0.06, -0.12)), (0.03, 0.26, 0.07), FR))
    slot('boots', 'claw')
    for i in (-1, 0, 1): leg.append(box(f'bt_claw{i}_L', ank + V((0.1 * i, -0.38, -0.17)), (0.025, 0.07, 0.025), ST, rx=0.3))
    slot('boots', 'stomper'); leg.append(box('bt_stomp_L', ank + V((0, 0.0, 0.04)), (0.19, 0.2, 0.07), ORG))
    slot('body')
    mirror([o for o in ALL if o['bone'] in ('LeftUpLeg', 'LeftLeg', 'LeftFoot')])
    # hunch: upper body pitched forward 7 deg, menacing
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
    for o in S.ARMOR + [x for x in S.ALL if x.name.startswith(('pauldron', 'foot', 'box', 'bicep', 'kneecap', 'back_plate'))]:
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
