"""WORKER v2: beat-up utility rig. Tall, lanky, slouched; worn olive paint with a yellow replacement arm panel,
hazard-striped shoulders, rubber hoses, toolbelt, back-mounted crane boom, welder forearm on the right,
blinking work lights, single-lens box-cam head. 5 gloved fingers. Asymmetric: built per side, no mirror.
Run: blender --enable-event-simulate -noaudio -P worker_v2.py -- [--fast] [--kit]"""
import bpy, bmesh, math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix
from scout_v2 import *
import scout_v2 as S, addons as A

V = Vector
OLV = mat('armor_white', (0.17, 0.2, 0.08), 0.62, 0.05)     # shell: worn olive
YEL = mat('armor_blue', (0.75, 0.48, 0.02), 0.5)             # torso: replacement yellow panels
ORA = mat('armor_red', (0.62, 0.12, 0.02), 0.5)              # shorts: safety orange
GRY = mat('armor_yellow', (0.09, 0.095, 0.1), 0.55, 0.3)     # backpack: crane / tanks
FR = mat('frame', (0.04, 0.042, 0.05), 0.55, 0.8)
ST = mat('steel', (0.45, 0.45, 0.46), 0.3, 1.0)
RUB = mat('rubber', (0.012, 0.012, 0.014), 0.85)
LAMP = mat('glow', (0, 0, 0), 0.3, 0, (1.0, 0.62, 0.15), 18)    # amber work lights
LENS = mat('screen', (0, 0.01, 0.02), 0.1, 0, (0.24, 0.95, 1.0), 12)
WORKER_SLOTS = {'helmet': ['boxcam', 'welder', 'lamp'], 'arms': ['claw', 'drill', 'welder'], 'bionics': ['tanks', 'battery', 'reel'],
                'legs': ['cans', 'strut', 'ribbed'], 'thrusters': ['stacks', 'fans', 'rocket'], 'boots': ['stabilizer', 'wheels', 'clamp']}

def box(name, c, half, m, rx=0.0, ry=0.0, rz=0.0, bev=0.18):
    R = Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X')
    return S._box(name, V(c), (R.col[0], R.col[1], R.col[2]), half, m, bev)

def hose(name, pts, r=0.018):
    """Rubber hose: sagging Catmull-Rom through pts, built as short cylinders with ribs."""
    P = [V(p) for p in pts]; out = []
    for i in range(len(P) - 1):
        a, b = P[i], P[i + 1]
        for t in range(4):
            u0, u1 = t / 4, (t + 1) / 4
            sag = lambda u: V((0, 0, -0.03 * math.sin(math.pi * u)))
            out.append(cyl(f'{name}_{i}{t}', a.lerp(b, u0) + sag(u0), a.lerp(b, u1) + sag(u1), r, RUB, n=10))
    return out

def hazard(name, c, half, n=5, rz=0.0, ry=0.0):
    """Hazard stripe band: alternating yellow / black blocks along local x."""
    R = Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(ry, 3, 'Y')
    for i in range(n):
        x = -half[0] + (i + 0.5) * 2 * half[0] / n
        S._box(f'{name}_{i}', V(c) + R @ V((x, 0, 0)), (R.col[0], R.col[1], R.col[2]), (half[0] / n, half[1], half[2]), YEL if i % 2 == 0 else FR, 0.1)

def arm(s):
    side = 'L' if s > 0 else 'R'; B = 'Left' if s > 0 else 'Right'
    bone(B + 'Arm'); J[B + 'Arm'] = V((0.34 * s, 0.02, 1.64))
    joint(f'shoulder_{side}', V((0.32 * s, 0.02, 1.64)), (1, 0, 0), 0.06, 0.09)
    # mismatched: left pauldron olive and dented-flat, right one a yellow replacement
    box(f'pauldron_{side}', (0.42 * s, 0.02, 1.74), (0.13, 0.15, 0.08), OLV if s > 0 else YEL, ry=-0.35 * s, rz=0.06 * s)
    hazard(f'hz_sh_{side}', (0.43 * s, -0.135, 1.74), (0.12, 0.008, 0.03), rz=0, ry=-0.35 * s)
    box(f'worklight_{side}', (0.43 * s, -0.08, 1.84), (0.035, 0.025, 0.025), FR); box(f'worklight_lens_{side}', (0.43 * s, -0.106, 1.84), (0.025, 0.003, 0.018), LAMP, bev=0.3)
    sh, el, wr = V((0.42 * s, 0.02, 1.6)), V((0.45 * s, 0.07, 1.24)), V((0.45 * s, -0.04, 0.9))
    cyl(f'upperarm_{side}', sh, el, 0.04, FR)
    box(f'upperarm_panel_{side}', (0.45 * s, 0.02, 1.42), (0.055, 0.065, 0.12), OLV if s < 0 else YEL)
    bone(B + 'ForeArm'); J[B + 'ForeArm'] = el.copy()
    joint(f'elbow_{side}', el, (1, 0, 0), 0.05, 0.08)
    fa = loft(f'forearm_{side}', [(0, 0, 0, 0.06, 0.06), (0.17, 0, 0, 0.085, 0.08), (0.3, 0, 0, 0.07, 0.065)], OLV, e=3.2); place(fa, el, wr)
    if s < 0:  # right forearm: welder torch rig, always on
        cyl(f'welder_body_{side}', el.lerp(wr, 0.3) + V((-0.07, -0.05, 0)), el.lerp(wr, 0.9) + V((-0.08, -0.1, 0)), 0.025, ST, n=14)
        cyl(f'welder_tip_{side}', el.lerp(wr, 0.9) + V((-0.08, -0.1, 0)), el.lerp(wr, 1.05) + V((-0.08, -0.13, -0.02)), 0.01, LAMP, n=10)
        hose(f'hose_w_{side}', [el + V((-0.05, 0.08, 0.02)), el.lerp(wr, 0.5) + V((-0.06, 0.06, 0)), el.lerp(wr, 0.3) + V((-0.07, -0.04, 0))], 0.012)
    slot('arms', 'claw'); box(f'a_claw_{side}', tuple(el.lerp(wr, 0.6) + V((0.09 * s, 0, 0))), (0.02, 0.05, 0.1), ST)
    slot('arms', 'drill'); cyl(f'a_drill_{side}', el.lerp(wr, 0.5) + V((0.08 * s, -0.04, 0)), el.lerp(wr, 0.5) + V((0.08 * s, -0.25, 0)), 0.03, ST, r2=0.004)
    slot('arms', 'welder'); box(f'a_tank_{side}', tuple(el.lerp(wr, 0.4) + V((0.08 * s, 0.05, 0))), (0.03, 0.03, 0.08), ORA)
    slot('body')
    S.build_hand(side, wr, (wr - el).normalized(), fingers=5, size=1.9, curl=0.45, armor_m=OLV, digit_m=RUB, thick=1.25)

def leg(s):
    side = 'L' if s > 0 else 'R'; B = 'Left' if s > 0 else 'Right'
    hip, knee, ank = V((0.13 * s, 0, 0.98)), V((0.14 * s, -0.08, 0.56)), V((0.15 * s, 0.03, 0.15))
    bone(B + 'UpLeg'); J[B + 'UpLeg'], J[B + 'Leg'], J[B + 'Foot'] = hip.copy(), knee.copy(), ank.copy()
    joint(f'hip_{side}', hip, (1, 0, 0), 0.055, 0.1)
    cyl(f'thigh_core_{side}', hip, knee, 0.035, FR)
    th = loft(f'thigh_{side}', [(0.04, 0, 0, 0.065, 0.07), (0.2, 0, 0, 0.08, 0.085), (0.36, 0, 0, 0.065, 0.07)], OLV, e=3.4); place(th, hip, knee)
    slot('legs', 'cans'); cyl(f'l_can_{side}', hip.lerp(knee, 0.3) + V((0.08 * s, 0.05, 0)), hip.lerp(knee, 0.8) + V((0.08 * s, 0.05, 0)), 0.03, ORA)
    slot('legs', 'strut'); cyl(f'l_strut_{side}', hip + V((0.07 * s, -0.06, -0.05)), knee + V((0.06 * s, -0.06, 0.04)), 0.012, ST)
    slot('legs', 'ribbed')
    for i in range(4): cyl(f'l_rib{i}_{side}', hip.lerp(knee, 0.25 + i * 0.15), hip.lerp(knee, 0.29 + i * 0.15), 0.09, RUB, n=16)
    slot('body')
    bone(B + 'Leg')
    joint(f'knee_{side}', knee, (1, 0, 0), 0.055, 0.11)
    box(f'kneepad_{side}', tuple(knee + V((0, -0.08, 0))), (0.06, 0.03, 0.07), ORA if s > 0 else OLV)
    sh = loft(f'shin_{side}', [(0.04, 0, 0, 0.07, 0.075), (0.2, 0, 0, 0.085, 0.09), (0.38, 0, 0, 0.065, 0.07)], OLV, e=3.4); place(sh, knee, ank)
    hose(f'hose_k_{side}', [knee + V((0.06 * s, 0.07, 0.06)), knee.lerp(ank, 0.5) + V((0.08 * s, 0.08, 0)), ank + V((0.06 * s, 0.06, 0.05))], 0.011)
    if s > 0: hazard(f'hz_shin_{side}', tuple(knee.lerp(ank, 0.55) + V((0, -0.088, 0))), (0.06, 0.006, 0.02))
    bone(B + 'Foot')
    joint(f'ankle_{side}', ank, (1, 0, 0), 0.045, 0.09)
    box(f'boot_{side}', tuple(ank + V((0, -0.06, -0.08))), (0.09, 0.17, 0.06), FR)
    box(f'toecap_{side}', tuple(ank + V((0, -0.2, -0.09))), (0.085, 0.05, 0.05), ST)
    box(f'sole_{side}', tuple(ank + V((0, -0.06, -0.135))), (0.1, 0.18, 0.012), RUB)
    slot('boots', 'stabilizer'); box(f'bt_stab_{side}', tuple(ank + V((0.11 * s, -0.02, -0.11))), (0.03, 0.12, 0.02), ORA)
    slot('boots', 'wheels'); cyl(f'bt_wheel_{side}', ank + V((0.1 * s, 0.1, -0.09)), ank + V((0.13 * s, 0.1, -0.09)), 0.05, RUB)
    slot('boots', 'clamp'); box(f'bt_clamp_{side}', tuple(ank + V((0, -0.28, -0.11))), (0.06, 0.03, 0.02), ST, rx=0.4)
    slot('body')

def build():
    bone('Hips'); J['Hips'] = V((0, 0, 1.02))
    box('pelvis', (0, 0, 1.0), (0.17, 0.13, 0.09), FR)
    # toolbelt: belt + pouches + hammer + tape
    cyl('belt', V((0, 0, 1.06)), V((0, 0, 1.11)), 0.2, RUB, n=28)
    for i, (x, w) in enumerate(((0.17, 0.05), (-0.17, 0.06), (0.1, 0.035), (-0.06, 0.04))):
        box(f'pouch_{i}', (x, -0.17 if i > 1 else 0.0 + 0.02, 1.02), (w if i < 2 else w, 0.04 if i > 1 else 0.07, 0.06), ORA if i % 2 else GRY)
    cyl('hammer_handle', V((0.22, -0.04, 0.95)), V((0.22, -0.04, 1.13)), 0.01, FR); box('hammer_head', (0.22, -0.04, 0.94), (0.02, 0.05, 0.015), ST)
    cyl('tape', V((-0.24, 0.02, 1.02)), V((-0.27, 0.02, 1.02)), 0.04, YEL, n=16)
    bone('Spine'); J['Spine'] = V((0, 0, 1.14))
    loft('waist', [(1.1, 0, 0, 0.13, 0.1), (1.25, 0, 0, 0.15, 0.11)], FR, armor=False)
    loft('chest', [(1.22, 0, 0, 0.2, 0.15), (1.42, 0, -0.01, 0.27, 0.18), (1.62, 0, 0.0, 0.29, 0.19), (1.72, 0, 0.01, 0.22, 0.16)], OLV, e=3.8)
    box('chest_panel', (-0.09, -0.18, 1.48), (0.1, 0.02, 0.12), YEL, rz=0.15)          # mismatched patch
    box('chest_patch', (0.13, -0.17, 1.38), (0.06, 0.015, 0.05), GRY)
    for i in range(4): box(f'rivet_{i}', (-0.17 + i * 0.03, -0.205, 1.6), (0.006, 0.006, 0.006), ST)
    hazard('hz_chest', (0, -0.19, 1.28), (0.18, 0.01, 0.025), n=7)
    box('chest_light', (0.16, -0.185, 1.6), (0.025, 0.012, 0.02), LAMP)
    # back: frame + crane boom
    box('backframe', (0, 0.2, 1.48), (0.18, 0.05, 0.2), GRY)
    cyl('crane_base', V((0.08, 0.27, 1.55)), V((0.08, 0.3, 1.55)), 0.06, ST)
    cyl('crane_boom', V((0.08, 0.3, 1.55)), V((0.18, 0.35, 2.1)), 0.025, YEL, n=14)
    cyl('crane_jib', V((0.18, 0.35, 2.1)), V((0.14, 0.0, 2.2)), 0.018, YEL, n=12)
    cyl('crane_cable', V((0.14, 0.0, 2.19)), V((0.14, -0.02, 1.98)), 0.003, FR, n=6)
    box('crane_hook', (0.14, -0.02, 1.97), (0.012, 0.006, 0.02), ST)
    hose('hose_back', [V((-0.12, 0.25, 1.62)), V((-0.2, 0.18, 1.72)), V((-0.32, 0.05, 1.68))], 0.016)
    slot('bionics', 'tanks')
    for s in (1, -1): cyl(f'b_tank_{s}', V((0.09 * s - 0.03, 0.27, 1.3)), V((0.09 * s - 0.03, 0.27, 1.5)), 0.05, ORA)
    slot('bionics', 'battery'); box('b_batt', (-0.05, 0.3, 1.4), (0.12, 0.06, 0.1), YEL)
    slot('bionics', 'reel'); cyl('b_reel', V((-0.18, 0.27, 1.42)), V((-0.08, 0.27, 1.42)), 0.09, ORA)
    slot('thrusters', 'stacks')
    for s in (1, -1): cyl(f't_stack_{s}', V((0.12 * s, 0.25, 1.62)), V((0.13 * s, 0.27, 1.92)), 0.03, FR)
    slot('thrusters', 'fans'); cyl('t_fan', V((-0.05, 0.27, 1.65)), V((-0.05, 0.33, 1.65)), 0.11, GRY)
    slot('thrusters', 'rocket'); cyl('t_rocket', V((-0.05, 0.27, 1.3)), V((-0.05, 0.3, 1.0)), 0.06, ST, r2=0.08)
    slot('body')
    # head: box-cam on a neck, one big lens, two lamps, antenna, tilted (curious / tired)
    bone('Head'); J['Head'] = V((0, -0.03, 1.8))
    cyl('neck', V((0, 0, 1.72)), V((0, -0.03, 1.84)), 0.04, FR)
    box('head', (0, -0.05, 1.92), (0.13, 0.12, 0.09), OLV, rz=0.04, ry=0.08)
    box('head_visor_frame', (0, -0.175, 1.93), (0.11, 0.01, 0.06), FR, ry=0.08)
    cyl('lens_barrel', V((0.03, -0.17, 1.93)), V((0.03, -0.22, 1.93)), 0.045, FR, n=24)
    cyl('lens', V((0.03, -0.22, 1.93)), V((0.03, -0.225, 1.93)), 0.035, LENS, n=24)
    for s in (1, -1): box(f'head_lamp_{s}', (-0.07 + 0.03 * s, -0.18, 1.975), (0.012, 0.006, 0.01), LAMP)
    cyl('antenna', V((-0.1, 0, 2.0)), V((-0.13, 0.04, 2.2)), 0.004, ST, n=6)
    hazard('hz_head', (0, -0.05, 2.015), (0.12, 0.11, 0.006), n=6)
    slot('helmet', 'boxcam'); box('h_cam2', (0.09, -0.1, 2.04), (0.03, 0.04, 0.025), FR)
    slot('helmet', 'welder'); box('h_mask', (0, -0.19, 1.98), (0.12, 0.01, 0.04), GRY, rx=-0.3)
    slot('helmet', 'lamp'); cyl('h_lamp', V((0, -0.05, 2.02)), V((0, -0.05, 2.08)), 0.04, LAMP)
    slot('body')
    arm(1); arm(-1); leg(1); leg(-1)
    # slouch: upper body pitched forward + listed to the right (worn hip)
    upb = [o for o in S.ALL if not o['bone'].endswith(('UpLeg', 'Leg', 'Foot')) and o['bone'] != 'Hips']
    lean = Matrix.Translation((0, 0, 1.1)) @ Matrix.Rotation(0.04, 4, 'Y') @ Matrix.Rotation(0.2, 4, 'X').inverted() @ Matrix.Translation((0, 0, -1.1))
    for o in upb: o.matrix_world = lean @ o.matrix_world
    for k_ in list(J):
        if not k_.endswith(('UpLeg', 'Leg', 'Foot')) and k_ != 'Hips': J[k_] = lean @ J[k_]

def addon_pass():
    for o in S.ALL: S.bake_world(o)
    for o in S.ARMOR:
        if o.name.startswith(('chest', 'thigh', 'shin', 'forearm')):
            A.mm_fuse_loop(o, lambda e: len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.7, width=0.006, segments=3)
    names = {o.name: o for o in S.ALL}
    for nm in ('chest', 'thigh_L', 'shin_R'):
        o = names[nm]; bb = S.bounds(o); c0 = bb[0].lerp(bb[1], 0.5)
        for i in range(3):
            loc = c0 + (V((0.12, 0, -0.05 + i * 0.05)) if nm != 'chest' else V((0.2, 0, 0.05 + i * 0.04)))
            bpy.ops.mesh.primitive_cube_add(size=1, location=loc); c = bpy.context.active_object; c.scale = (0.1, 0.12, 0.012); bpy.ops.object.transform_apply(scale=True)
            A.hops_boolean(o, c)
        S.sanitize(o, bb)
    for o in S.ARMOR + [x for x in S.ALL if x.name.startswith(('pauldron', 'boot', 'head', 'backframe', 'kneepad'))]:
        A.hops_bevel(o, width=0.004, segments=2, angle=35); A.apply_all(o)
    yield 0.1
    others = [o for o in bpy.data.objects if o.type == 'MESH']
    plan = [('chest', 'F', 0.5, 0.75, 0.3, 0.012, 0.012, 'BOX', 0.06), ('chest', 'B', 0.5, 0.5, 0.012, 0.25, 0.012, 'BOX', 0.06),
            ('head', 'L', 0.5, 0.5, 0.03, 0, 0.01, 'CIRCLE', 0.05), ('head', 'R', 0.5, 0.5, 0.012, 0.1, 0.01, 'BOX', 0.05)]
    for s in ('L', 'R'):
        out = 'R' if s == 'L' else 'L'
        plan += [(f'thigh_{s}', out, 0.5, 0.5, 0.012, 0.2, 0.012, 'BOX', 0.06), (f'shin_{s}', out, 0.5, 0.4, 0.03, 0, 0.012, 'CIRCLE', 0.06), (f'forearm_{s}', out, 0.5, 0.5, 0.08, 0.012, 0.01, 'BOX', 0.05)]
    if S.FAST: plan = plan[:4]
    bpy.context.preferences.view.smooth_view = 0
    for nm, face, u, v, w, h, d, shape, tol in plan:
        o = bpy.data.objects.get(nm)
        if o: yield from A.bc_cut(o, [x for x in others if x is not o and x.name in bpy.data.objects], face, u, v, w, h, d, shape, tol)
    A.bc_cleanup()
    for o in S.ARMOR:
        if o.name in bpy.data.objects: A.hops_weighted_normal(o); A.apply_all(o)
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        bm = bmesh.new(); bm.from_mesh(o.data)
        for f in bm.faces: f.smooth = True
        for e in bm.edges: e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.52)
        bm.to_mesh(o.data); bm.free()

def main():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    build(); yield 0.1
    if '--skel' in S.argv if 'worker' != 'scout' else '--skel' in argv:
        import v2export as X; X.write_skeleton('worker', [o for o in bpy.data.objects if o.type == 'MESH']); return
    yield from addon_pass()
    print('TRIS', sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons), flush=True)
    bpy.ops.wm.save_as_mainfile(filepath='/workspace/private/worker_v2.blend')
    import v2export as X
    X.turnaround('worker', tgt_z=1.1, dist=5.8, slots=WORKER_SLOTS)
    if '--kit' in S.argv: X.export_kit('worker', WORKER_SLOTS)

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
