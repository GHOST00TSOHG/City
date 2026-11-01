"""
Robots v2 — Scout concept (gen 2, built from scratch; nothing reused from the gen-1 kit shapes).
Curved superellipse lofts + layered solidified armor shells, mechanical joints and pistons, then real add-on detail:
MESHmachine fuse (rounded cap transitions), Hard Ops booleans (inset vents) + bevels + weighted normals,
Boxcutter cuts driven through its modal tool (panel lines, recesses, ports). Needs a window + event simulation:
  xvfb-run -a -s "-screen 0 1920x1080x24" blender --enable-event-simulate -noaudio -P tools/blender/scout_v2.py -- [--fast]
Writes /workspace/robot-renders/scout-concept-v2.png and prints ADDONS_USED. Add-ons are never copied into the repo.
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix, Euler
sys.path.insert(0, os.path.dirname(__file__))
import addons as A

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAST = '--fast' in argv
OUT = '/workspace/robot-renders/' + next((a.split('=')[1] for a in argv if a.startswith('--out=')), 'scout-v2b.png')
TAU = math.tau

# ------------------------------------------------------------------ materials (Gundam tricolour, scout flavour)
def mat(name, col, rough=0.35, metal=0.0, emit=None, strength=6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = 0.25 if metal < 0.5 else 0.0
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = strength
    return m
WHITE = mat('armor_white', (0.56, 0.58, 0.61), 0.34)
BLUE = mat('armor_blue', (0.008, 0.03, 0.16), 0.30)
RED = mat('armor_red', (0.42, 0.01, 0.012), 0.32)
YEL = mat('armor_yellow', (0.75, 0.42, 0.02), 0.30)
FRAME = mat('frame', (0.05, 0.055, 0.065), 0.45, 0.85)
STEEL = mat('steel', (0.45, 0.46, 0.48), 0.22, 1.0)
SCREEN = mat('screen', (0.0, 0.02, 0.03), 0.15, 0.0, (0.1, 0.85, 1.0), 9)
GLOW = mat('glow', (0.0, 0.0, 0.0), 0.3, 0.0, (1.0, 0.25, 0.05), 14)

ARMOR, ALL = [], []
PALM_SIDE = -1 if '--palm-flip' in sys.argv else 1

def obj_from_bm(name, bm, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); ALL.append(o); return o

def se(t, e):  # superellipse coordinate
    c = math.cos(t); return math.copysign(abs(c) ** (2 / e), c)

def smooth_secs(secs, k=3):
    """Catmull-Rom between sections: long parts curve smoothly along their length without a subdivision blob."""
    if len(secs) < 3: return secs
    P = [secs[0]] + list(secs) + [secs[-1]]; out = []
    for i in range(1, len(P) - 2):
        for j in range(k):
            t = j / k
            out.append(tuple(0.5 * (2 * P[i][c] + (-P[i - 1][c] + P[i + 1][c]) * t + (2 * P[i - 1][c] - 5 * P[i][c] + 4 * P[i + 1][c] - P[i + 2][c]) * t * t
                                    + (-P[i - 1][c] + 3 * P[i][c] - 3 * P[i + 1][c] + P[i + 2][c]) * t ** 3) for c in range(5)))
    return out + [secs[-1]]

def loft(name, secs, m, n=None, e=3.4, arc=None, caps=True, thick=0.0, armor=True):
    """secs: [(z, cx, cy, rx, ry)] in local space (z = along the part). arc=(a0, a1) radians gives an open shell
    (0 = +x, -pi/2 = front -y) which is solidified to `thick` -> a curved armour plate."""
    n = n or (24 if armor else 32); secs = smooth_secs(secs) if armor else secs
    bm = bmesh.new(); rings = []
    a0, a1 = arc if arc else (0, TAU); cnt = n if not arc else n + 1
    for z, cx, cy, rx, ry in secs:
        r = []
        for i in range(cnt):
            t = a0 + (a1 - a0) * i / (n if arc else n)
            r.append(bm.verts.new((cx + rx * se(t, e), cy + ry * se(t - math.pi / 2, e), z)))
        rings.append(r)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(cnt - (1 if arc else 0)):
            j = (i + 1) % cnt; bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if caps and not arc:
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj_from_bm(name, bm, m)
    if thick:
        s = o.modifiers.new('solid', 'SOLIDIFY'); s.thickness = thick; s.offset = 1; s.use_even_offset = True
    if not armor:
        sub = o.modifiers.new('sub', 'SUBSURF'); sub.levels = sub.render_levels = 1
    A.apply_all(o) if A.available('HOps') else [bpy.context.view_layer.objects.__setattr__('active', o), bpy.ops.object.convert(target='MESH')]
    if armor: ARMOR.append(o)
    return o

def cyl(name, a, b, r, m, n=24, r2=None, armor=False):
    L = (b - a).length; r2 = r if r2 is None else r2
    o = loft(name, [(0, 0, 0, r, r), (L, 0, 0, r2, r2)], m, n=n, e=2.0, armor=armor)
    place(o, a, b); return o

def place(o, a, b, roll=0.0):
    d = (b - a).normalized(); q = d.to_track_quat('Z', 'Y')
    o.matrix_world = Matrix.Translation(a) @ q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, 'Z')

def joint(name, c, axis, r, w, m=FRAME):
    """Mechanical joint: hub cylinder + steel cap rings."""
    ax = Vector(axis).normalized() * w / 2
    cyl(name, c - ax, c + ax, r, m, n=28)
    cyl(name + '_capL', c - ax * 1.25, c - ax * 0.9, r * 0.62, STEEL, n=24)
    cyl(name + '_capR', c + ax * 0.9, c + ax * 1.25, r * 0.62, STEEL, n=24)

def piston(name, a, b, r=0.024):
    mid = a.lerp(b, 0.55)
    cyl(name + '_barrel', a, mid, r, FRAME, n=16); cyl(name + '_rod', a.lerp(b, 0.4), b, r * 0.55, STEEL, n=12)
    for p in (a, b):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r * 1.3, location=p, segments=16, ring_count=8)
        s = bpy.context.active_object; s.data.materials.append(STEEL); ALL.append(s)

def mirror(objs):
    out = []
    for o in objs:
        c = o.copy(); c.data = o.data.copy(); bpy.context.collection.objects.link(c)
        c.matrix_world = Matrix.Scale(-1, 4, (1, 0, 0)) @ o.matrix_world
        c.name = o.name.replace('_L', '_R'); out.append(c); ALL.append(c)
        if o in ARMOR: ARMOR.append(c)
    return out

# ------------------------------------------------------------------ hands: wrist, palm, articulated fingers
def _box(name, c, ax, half, m, bev=0.25):
    """Oriented beveled box: centre c, local axes ax=(X,Y,Z) unit vectors, half extents."""
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0)); o = bpy.context.active_object; o.name = name
    o.scale = half; bpy.ops.object.transform_apply(scale=True)
    M = Matrix((ax[0], ax[1], ax[2])).transposed().to_4x4(); M.translation = c; o.matrix_world = M
    bv = o.modifiers.new('bv', 'BEVEL'); bv.width = min(half) * bev; bv.segments = 2
    o.data.materials.append(m); ALL.append(o); return o

def build_hand(side, wr, fwd, fingers=5, size=1.0, curl=0.35, armor_m=None, digit_m=None, thick=1.0, palm_dir=None, thumb_dir=None):
    """Explicit hand frame: fwd = wrist->fingertips, palm_dir = palm normal (faces the thigh when
    standing), thumb_dir = thumb side (forward). Back-of-hand armor faces -palm_dir (outward).
    Segment names hand_<side>_f<i>_<j> map 1:1 onto rig finger bones Hand.<side>.F<i>.<j>."""
    V = Vector; k = size; out = []
    fwd = fwd.normalized()
    xs = 1 if side in ('L', 'H') else -1
    pn = (palm_dir or V((-xs, 0, 0))); pn = (pn - fwd * pn.dot(fwd)).normalized()
    ts = (thumb_dir or V((0, -1, 0))); ts = (ts - fwd * ts.dot(fwd) - pn * ts.dot(pn)).normalized()
    armor_m = armor_m or WHITE; digit_m = digit_m or FRAME
    out.append(cyl(f'wrist_{side}', wr - fwd * 0.012 * k, wr + fwd * 0.022 * k, 0.024 * k * thick, STEEL, n=16))
    W = 0.042 * k * thick; T = 0.016 * k; L = 0.075 * k
    pc = wr + fwd * (0.02 * k + L / 2)
    out.append(_box(f'palm_{side}', pc, (ts, pn, fwd), (W, T, L / 2), digit_m))
    # back-of-hand armor + knuckle plate on the outer face, overlapping the finger bases
    out.append(_box(f'handguard_{side}', pc - pn * (T + 0.004 * k) - fwd * 0.004 * k, (ts, pn, fwd), (W * 1.08, 0.006 * k, L * 0.46), armor_m))
    kc = wr + fwd * (0.02 * k + L + 0.004 * k) - pn * (T * 0.4)
    out.append(_box(f'knuckle_plate_{side}', kc - pn * 0.006 * k, (ts, pn, fwd), (W * 1.04, T * 0.9, 0.016 * k), armor_m))
    if fingers == 3: offs = [-0.6, 0.6]; seg = [0.042, 0.034, 0.03]; rad = 0.015 * thick
    else: offs = [-0.78, -0.26, 0.26, 0.78]; seg = [0.032, 0.025, 0.02]; rad = 0.0085 * thick
    digits = [(wr + fwd * (0.02 * k + L) + ts * (-o_) * W * 0.95, fwd, False) for o_ in offs]   # index nearest thumb
    # thenar mound on the palm's inner face at the thumb edge, thumb rising from it, opposed toward the palm
    mc = pc - fwd * L * 0.18 + ts * W * 0.8 + pn * T * 0.7
    mo = _box(f'thumb_mound_{side}', mc, (ts, pn, fwd), (W * 0.42, T * 0.75, L * 0.3), digit_m, bev=0.45)
    out.append(mo)
    tdir = (fwd * 0.55 + ts * 0.6 + pn * 0.35).normalized()
    digits.append((mc + ts * W * 0.3 + fwd * L * 0.12, tdir, True))
    for i, (b, d, thumb) in enumerate(digits):
        for j, Ls in enumerate(seg):
            if j or thumb:
                ax = d.cross(pn)
                if ax.length > 1e-4: d = (Quaternion_axis(ax.normalized(), -curl * (0.6 if thumb else 1.0)) @ d).normalized()
            Lj = Ls * k * (0.85 if thumb else 1.0)
            e2 = b + d * Lj
            out.append(cyl(f'hand_{side}_f{i}_{j}', b, e2, rad * k * (1 - 0.12 * j), digit_m if j < 2 else armor_m, n=8))
            bpy.ops.mesh.primitive_uv_sphere_add(radius=rad * k * 1.12, location=b, segments=10, ring_count=6)
            kn = bpy.context.active_object; kn.name = f'knuckle_{side}_{i}_{j}'; kn.data.materials.append(STEEL); ALL.append(kn); out.append(kn)
            b = e2
    return out

def Quaternion_axis(axis, ang):
    from mathutils import Quaternion
    return Quaternion(axis, ang)

def _roll_to(o, lat):
    """Spin a placed part about its own axis so its local +x lines up with `lat` (palm width across the hand)."""
    M = o.matrix_world; z = M.col[2].xyz.normalized(); x = M.col[0].xyz.normalized()
    want = (lat - z * lat.dot(z)).normalized(); ang = math.atan2(z.dot(x.cross(want)), x.dot(want))
    o.matrix_world = M @ Matrix.Rotation(ang, 4, 'Z')

# ------------------------------------------------------------------ SCOUT v2: tall, lean sprinter, reverse-jointed legs
def build():
    V = Vector
    # --- pelvis / waist (skirt armor plates around a dark frame core)
    loft('pelvis_core', [(0.92, 0, 0.01, 0.10, 0.08), (1.02, 0, 0, 0.15, 0.10), (1.10, 0, 0, 0.13, 0.09)], FRAME, armor=False)
    loft('skirt_front', [(0.86, 0, -0.03, 0.10, 0.12), (1.00, 0, -0.01, 0.15, 0.13), (1.07, 0, 0, 0.15, 0.12)], WHITE, arc=(-2.4, -0.74), thick=0.018)
    loft('crotch_plate', [(0.84, 0, -0.06, 0.05, 0.05), (0.97, 0, -0.08, 0.07, 0.05), (1.05, 0, -0.09, 0.08, 0.04)], RED, e=2.6)
    loft('skirt_rear', [(0.90, 0, 0.0, 0.11, 0.12), (1.07, 0, 0, 0.15, 0.13)], WHITE, arc=(0.5, 2.64), thick=0.016)
    sk = loft('skirt_side_L', [(0.80, 0.0, 0, 0.02, 0.09), (0.95, 0.0, 0, 0.025, 0.11), (1.06, 0, 0, 0.02, 0.10)], BLUE, e=4)
    sk.location = (0.19, 0.0, 0); sk.rotation_euler = (0, -0.12, 0)
    mirror([sk])
    loft('waist_core', [(1.06, 0, 0.0, 0.10, 0.075), (1.15, 0, 0.0, 0.075, 0.06), (1.24, 0, 0.0, 0.10, 0.075)], FRAME, armor=False)
    for i, z in enumerate((1.12, 1.165)):
        cyl(f'waist_ring_{i}', V((0, 0, z)), V((0, 0, z + 0.018)), 0.088, STEEL, n=28)
    for s_ in (1, -1):  # front skirt flaps over each thigh
        fl = loft(f'skirt_flap_{s_}', [(0, 0, 0, 0.075, 0.015), (0.10, 0, 0, 0.07, 0.014), (0.16, 0, 0.006, 0.055, 0.01)], WHITE, e=3.6)
        place(fl, V((0.085 * s_, -0.15, 1.03)), V((0.10 * s_, -0.20, 0.86))); 
        tr = loft(f'skirt_flap_trim_{s_}', [(0, 0, 0, 0.06, 0.006), (0.12, 0, 0, 0.05, 0.005)], YEL, e=4); place(tr, V((0.085 * s_, -0.168, 1.01)), V((0.10 * s_, -0.215, 0.875)))
    # --- upper body, leaning forward ~9 deg about the hips
    up = []
    up.append(loft('torso_core', [(1.22, 0, 0.0, 0.13, 0.095), (1.40, 0, -0.01, 0.20, 0.13), (1.58, 0, 0, 0.21, 0.13), (1.66, 0, 0.01, 0.13, 0.095)], FRAME, armor=False))
    up.append(loft('chest_plate', [(1.34, 0, -0.035, 0.18, 0.13), (1.46, 0, -0.07, 0.245, 0.155), (1.58, 0, -0.06, 0.25, 0.15), (1.66, 0, -0.02, 0.17, 0.115)], BLUE, n=4, e=2.0, arc=(-2.75, -0.39), thick=0.026))
    up.append(loft('chest_inner', [(1.38, 0, -0.08, 0.07, 0.13), (1.50, 0, -0.115, 0.09, 0.14), (1.60, 0, -0.095, 0.075, 0.12)], FRAME, n=4, e=2.0, arc=(-2.1, -1.04), thick=0.02))
    up.append(loft('abdomen', [(1.20, 0, -0.03, 0.10, 0.08), (1.30, 0, -0.05, 0.13, 0.095), (1.38, 0, -0.05, 0.15, 0.10)], WHITE, n=4, e=2.0, arc=(-2.6, -0.54), thick=0.02))
    up.append(loft('collar', [(1.62, 0, 0.0, 0.16, 0.12), (1.68, 0, 0.01, 0.12, 0.10)], YEL, n=8, e=2.0, arc=(-3.0, -0.14), thick=0.016))
    up.append(loft('back_plate', [(1.34, 0, 0.03, 0.15, 0.11), (1.50, 0, 0.04, 0.19, 0.13), (1.63, 0, 0.02, 0.15, 0.11)], WHITE, n=4, e=2.0, arc=(0.35, 2.79), thick=0.022))
    for x in (-0.06, 0.06):   # intake glow slits under the chest vents
        g = loft(f'intake_{x}', [(1.49, x, -0.225, 0.035, 0.01), (1.525, x, -0.23, 0.035, 0.01)], GLOW, e=4, armor=False); up.append(g)
    # thrusters (twin backpack nacelles, angled back)
    for s in (1, -1):
        t = loft(f'thruster_{s}', [(0, 0, 0, 0.045, 0.045), (0.08, 0, 0, 0.06, 0.06), (0.30, 0, 0, 0.05, 0.05), (0.36, 0, 0, 0.04, 0.04)], WHITE, e=2.4)
        place(t, V((0.09 * s, 0.24, 1.66)), V((0.13 * s, 0.30, 1.32))); up.append(t)
        n = cyl(f'nozzle_{s}', V((0.13 * s, 0.30, 1.32)), V((0.137 * s, 0.31, 1.27)), 0.035, FRAME, r2=0.05); up.append(n)
        f = loft(f'flame_{s}', [(0, 0, 0, 0.03, 0.03), (0.01, 0, 0, 0.032, 0.032)], GLOW, e=2, armor=False); place(f, V((0.137 * s, 0.31, 1.27)), V((0.14 * s, 0.315, 1.25))); up.append(f)
        up.append(cyl(f'pack_strut_{s}', V((0.05 * s, 0.10, 1.55)), V((0.09 * s, 0.24, 1.60)), 0.02, FRAME))
    # head: small helmet, big glowing screen face, V-fin
    up.append(cyl('neck', V((0, 0.0, 1.64)), V((0, -0.01, 1.73)), 0.04, FRAME))
    up.append(loft('helmet', [(1.70, 0, 0.01, 0.085, 0.09), (1.78, 0, 0, 0.105, 0.105), (1.86, 0, 0.0, 0.09, 0.095), (1.90, 0, 0.01, 0.05, 0.06)], WHITE, e=2.6))
    up.append(loft('face_screen', [(1.725, 0, -0.06, 0.08, 0.06), (1.78, 0, -0.07, 0.095, 0.065), (1.845, 0, -0.06, 0.08, 0.06)], SCREEN, arc=(-2.55, -0.59), thick=0.012, armor=False))
    up.append(loft('visor_frame', [(1.715, 0, -0.06, 0.088, 0.07), (1.73, 0, -0.065, 0.095, 0.072)], RED, arc=(-2.7, -0.44), thick=0.014))
    up.append(loft('brow', [(1.84, 0, -0.06, 0.09, 0.065), (1.87, 0, -0.05, 0.075, 0.06)], BLUE, arc=(-2.8, -0.34), thick=0.016))
    for s in (1, -1):  # V-fin
        fin = loft(f'vfin_{s}', [(0, 0, 0, 0.012, 0.006), (0.10, 0, 0, 0.008, 0.004), (0.16, 0, 0, 0.002, 0.002)], YEL, e=4)
        place(fin, V((0.015 * s, -0.105, 1.85)), V((0.13 * s, -0.08, 1.96))); up.append(fin)
        ear = cyl(f'ear_{s}', V((0.095 * s, 0, 1.79)), V((0.12 * s, 0, 1.79)), 0.03, FRAME); up.append(ear)
        ant = cyl(f'antenna_{s}', V((0.11 * s, 0.03, 1.80)), V((0.13 * s, 0.12, 1.98)), 0.005, STEEL, r2=0.002); up.append(ant)
    up.append(loft('crest', [(0, 0, 0, 0.015, 0.02), (0.03, 0, 0, 0.012, 0.015)], RED, e=3)); place(up[-1], V((0, -0.105, 1.85)), V((0, -0.11, 1.88)))
    # shoulders + arms (left, then mirrored)
    arm = []
    arm.append(joint('shoulder_L', V((0.27, 0.0, 1.55)), (1, 0, 0), 0.055, 0.08) or None)
    p = loft('pauldron_L', [(0, 0, 0, 0.115, 0.105), (0.06, 0, 0, 0.125, 0.112), (0.13, 0.01, 0, 0.10, 0.092), (0.18, 0.02, 0, 0.05, 0.055)], WHITE, e=2.5, arc=None, caps=True)
    p.matrix_world = Matrix.Translation((0.33, 0.0, 1.49)) @ Matrix.Rotation(-0.5, 4, 'Y'); arm.append(p)
    pr = loft('pauldron_trim_L', [(0, 0, 0, 0.118, 0.108), (0.03, 0, 0, 0.12, 0.11)], RED, e=2.8, arc=(-math.pi, 0.0), thick=0.012)
    pr.matrix_world = p.matrix_world @ Matrix.Translation((0, 0, -0.01)); arm.append(pr)
    sh, el, wr = V((0.33, 0.0, 1.46)), V((0.35, 0.03, 1.17)), V((0.35, -0.07, 0.93))
    arm.append(cyl('upperarm_L', sh, el, 0.038, FRAME))
    u = loft('upperarm_armor_L', [(0, 0, 0, 0.046, 0.044), (0.10, 0, 0, 0.062, 0.058), (0.26, 0, 0, 0.05, 0.046)], WHITE, n=8, e=2.0); place(u, sh, el); arm.append(u)
    ua = loft('upperarm_plate_L', [(0.02, 0, 0, 0.066, 0.062), (0.12, 0, 0, 0.07, 0.066), (0.2, 0, 0, 0.058, 0.054)], BLUE, n=4, e=2.0, arc=(-0.8, 0.8), thick=0.014); place(ua, sh, el); arm.append(ua)
    eg = loft('elbow_guard_L', [(0, 0, 0, 0.05, 0.03), (0.06, 0, 0, 0.04, 0.025), (0.09, 0, 0, 0.01, 0.01)], RED, n=6, e=2.0); place(eg, el + V((0, 0.03, 0.03)), el + V((0, 0.09, -0.04))); arm.append(eg)
    arm.append(joint('elbow_L', el, (1, 0, 0), 0.04, 0.07))
    f = loft('forearm_armor_L', [(0, 0, 0, 0.05, 0.05), (0.06, 0, 0.0, 0.068, 0.066), (0.17, 0, 0.0, 0.074, 0.07), (0.25, 0, 0, 0.05, 0.05)], WHITE, n=8, e=2.0); place(f, el, wr); arm.append(f)
    fg = loft('forearm_guard_L', [(0.03, 0, 0, 0.074, 0.072), (0.16, 0, 0, 0.08, 0.078), (0.21, 0, 0, 0.07, 0.068)], BLUE, n=4, e=2.0, arc=(-0.9, 0.9), thick=0.018); place(fg, el, wr); arm.append(fg)
    arm += build_hand('L', wr, (wr - el).normalized(), fingers=5, size=1.7, curl=0.35)
    arm = [a for a in arm if a] + [o for o in ALL if o.name.startswith(('shoulder_L', 'elbow_L'))]
    arm = list(dict.fromkeys(arm))
    up += arm + mirror(arm)
    # --- legs: reverse-jointed sprinter (thigh forward/down, shin back/down, long metatarsal, clawed foot)
    leg = []
    hip, knee, ank, ball = V((0.12, -0.01, 0.96)), V((0.15, -0.20, 0.60)), V((0.15, 0.13, 0.25)), V((0.15, 0.02, 0.06))
    leg.append(joint('hip_L', hip, (1, 0, 0), 0.06, 0.09))
    leg.append(cyl('thigh_frame_L', hip, knee, 0.045, FRAME))
    th = loft('thigh_armor_L', [(0.02, 0, 0, 0.07, 0.072), (0.12, 0, -0.005, 0.085, 0.085), (0.30, 0, 0, 0.072, 0.07), (0.39, 0, 0, 0.055, 0.055)], WHITE, n=10, e=2.2); place(th, hip, knee); leg.append(th)
    tp = loft('thigh_plate_L', [(0.06, 0, 0, 0.088, 0.088), (0.22, 0, 0, 0.092, 0.09), (0.33, 0, 0, 0.075, 0.074)], BLUE, arc=(1.2, 3.1), thick=0.014); place(tp, hip, knee); leg.append(tp)
    leg.append(joint('knee_L', knee, (1, 0, 0), 0.055, 0.1))
    kc = loft('kneecap_L', [(0, 0, 0, 0.07, 0.03), (0.05, 0, -0.01, 0.075, 0.04), (0.12, 0, 0, 0.04, 0.02)], RED, e=3.5); place(kc, knee + V((0, -0.05, 0.05)), knee + V((0, -0.07, -0.08))); leg.append(kc)
    leg.append(cyl('shin_frame_L', knee, ank, 0.04, FRAME))
    sa = loft('shin_armor_L', [(0.03, 0, 0, 0.075, 0.07), (0.12, 0, 0.0, 0.09, 0.08), (0.36, 0, 0, 0.07, 0.065), (0.47, 0, 0, 0.055, 0.05)], WHITE, e=3.0); place(sa, knee, ank); leg.append(sa)
    sg = loft('shin_blade_L', [(0.02, 0, 0, 0.095, 0.085), (0.14, 0, 0, 0.1, 0.09), (0.40, 0, 0, 0.078, 0.07)], WHITE, n=4, e=2.0, arc=(-2.6, -0.54), thick=0.02); place(sg, knee, ank); leg.append(sg)
    keel = loft('shin_keel_L', [(0.0, 0, 0, 0.012, 0.03), (0.10, 0, 0, 0.016, 0.05), (0.34, 0, 0, 0.012, 0.035), (0.44, 0, 0, 0.006, 0.01)], RED, e=2.2)
    place(keel, knee + V((0, -0.085, 0.0)), ank + V((0, -0.075, 0.0))); leg.append(keel)
    spike = loft('knee_spike_L', [(0, 0, 0, 0.045, 0.03), (0.06, 0, 0, 0.03, 0.02), (0.11, 0, 0, 0.004, 0.004)], WHITE, e=2.6)
    place(spike, knee + V((0, -0.06, 0.03)), knee + V((0, -0.19, 0.10))); leg.append(spike)
    fin = loft('thigh_fin_L', [(0, 0, 0, 0.008, 0.05), (0.18, 0, 0, 0.01, 0.07), (0.30, 0, 0, 0.006, 0.03)], BLUE, e=2.4)
    place(fin, hip + V((0.09, 0.0, -0.02)), knee + V((0.085, 0.03, 0.08))); leg.append(fin)
    calf = loft('calf_vent_L', [(0.12, 0, 0, 0.092, 0.084), (0.30, 0, 0, 0.082, 0.075)], BLUE, arc=(0.7, 2.44), thick=0.012); place(calf, knee, ank); leg.append(calf)
    leg.append(joint('ankle_L', ank, (1, 0, 0), 0.045, 0.085))
    leg.append(cyl('meta_frame_L', ank, ball, 0.035, FRAME))
    mt = loft('meta_armor_L', [(0.02, 0, 0, 0.06, 0.05), (0.12, 0, 0, 0.065, 0.055), (0.20, 0, 0, 0.05, 0.045)], WHITE, e=3.2); place(mt, ank, ball); leg.append(mt)
    leg.append(joint('ball_L', ball, (1, 0, 0), 0.035, 0.09))
    # foot: three toe claws + heel spur
    for i, dx in enumerate((-0.045, 0.0, 0.045)):
        L = 0.17 if i == 1 else 0.14
        toe = loft(f'toe_L{i}', [(0, 0, 0, 0.026, 0.02), (L * 0.6, 0, 0, 0.028, 0.02), (L, 0, 0.012, 0.012, 0.01)], BLUE if i == 1 else WHITE, e=3.0)
        a = ball + V((dx, 0, -0.025)); place(toe, a, a + V((dx * 0.5, -L, -0.025))); leg.append(toe)
        leg.append(cyl(f'claw_L{i}', a + V((dx * 0.5, -L, -0.025)), a + V((dx * 0.55, -L - 0.035, -0.03)), 0.01, STEEL, r2=0.002, n=10))
    heel = loft('heel_L', [(0, 0, 0, 0.025, 0.02), (0.09, 0, 0, 0.018, 0.015), (0.12, 0, 0, 0.006, 0.006)], RED, e=3); place(heel, ball + V((0, 0.02, -0.02)), ball + V((0, 0.14, -0.035))); leg.append(heel)
    # pistons: hip->shin (knee drive) and shin->heel (achilles)
    piston('piston_knee_L', hip + V((0.075, 0.03, -0.04)), knee.lerp(ank, 0.3) + V((0.075, 0.02, 0)))
    piston('piston_ankle_L', knee.lerp(ank, 0.5) + V((0, 0.08, 0)), ball + V((0, 0.07, 0.03)))
    leg += [o for o in ALL if o.name.startswith(('piston_', 'hip_L', 'knee_L', 'ankle_L', 'ball_L')) or o.type == 'MESH' and o.name.startswith('Sphere')]
    leg = [o for o in dict.fromkeys(leg) if o]; mirror(leg)
    # forward lean of the upper body
    lean = Matrix.Translation((0, 0, 1.1)) @ Matrix.Rotation(0.16, 4, 'X').inverted() @ Matrix.Translation((0, 0, -1.1))
    for o in set(up): o.matrix_world = lean @ o.matrix_world

# ------------------------------------------------------------------ add-on detail pass
def bake_world(o):
    """Bake transform into the mesh so add-ons and Boxcutter's ortho views work in world axes."""
    o.data = o.data.copy() if o.data.users > 1 else o.data
    o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)

def sanitize(o, bb):
    """Exact booleans on open shells can leave a few stray verts far away; drop anything outside the pre-cut bounds."""
    mn, mx = bb; bm = bmesh.new(); bm.from_mesh(o.data)
    bad = [v for v in bm.verts if any(v.co[i] < mn[i] - 0.03 or v.co[i] > mx[i] + 0.03 for i in range(3))]
    if bad: bmesh.ops.delete(bm, geom=bad, context='VERTS'); print('SANITIZED', o.name, len(bad), flush=True)
    bm.to_mesh(o.data); bm.free()

def bounds(o):
    vs = [v.co for v in o.data.vertices]; return (Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)]))

def addon_pass():
    for o in ALL: bake_world(o)
    names = {o.name: o for o in ALL}
    # MESHmachine: fuse the cap rims of closed lofts into smooth rounded transitions
    for o in ARMOR:
        if o.name.startswith(('helmet', 'pauldron_L', 'pauldron_R', 'thigh_armor', 'shin_armor', 'forearm_armor', 'thruster', 'meta_armor', 'kneecap')):
            A.mm_fuse_loop(o, lambda e: len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.7, width=0.006, segments=4)
    # Hard Ops booleans: inset vent slots (chest sides, thrusters, calves, thighs)
    def slots(target, centre, size, n, step, axis):
        for i in range(n):
            bpy.ops.mesh.primitive_cube_add(size=1, location=Vector(centre) + Vector(step) * i)
            c = bpy.context.active_object; c.scale = size; bpy.ops.object.transform_apply(scale=True)
            A.hops_boolean(target, c)
    lean = Matrix.Translation((0, 0, 1.1)) @ Matrix.Rotation(-0.16, 4, 'X') @ Matrix.Translation((0, 0, -1.1))
    for nm, tgt in (('chest_plate', None),):
        o = names[nm]; bb = bounds(o)
        for s in (1, -1):
            for i in range(3):
                bpy.ops.mesh.primitive_cube_add(size=1, location=lean @ Vector((0.13 * s, -0.20, 1.50 + i * 0.03)))
                c = bpy.context.active_object; c.scale = (0.06, 0.08, 0.012); c.rotation_euler = (-0.16, 0, 0); bpy.ops.object.transform_apply(scale=True, rotation=True)
                A.hops_boolean(o, c)
        sanitize(o, bb)
    for s, side in ((1, '_L'), (-1, '_R')):
        th = names.get('thigh_armor' + side)
        for nm in ('calf_vent' + side,):
            o = names[nm]; bb = bounds(o)
            for i in range(4):
                p = Vector((0.15 * s, -0.20, 0.60)).lerp(Vector((0.15 * s, 0.13, 0.25)), 0.35 + i * 0.07) + Vector((0, 0.09, 0))
                bpy.ops.mesh.primitive_cube_add(size=1, location=p); c = bpy.context.active_object; c.scale = (0.09, 0.05, 0.012); bpy.ops.object.transform_apply(scale=True)
                A.hops_boolean(o, c)
            sanitize(o, bb)
    # Hard Ops bevel + weighted normals on all armour
    for o in ARMOR:
        A.hops_bevel(o, width=0.0035, segments=2, angle=35)
        A.apply_all(o)
    yield 0.1
    # Boxcutter: panel lines, recesses and ports on the big plates (front = -Y, sides L/R)
    others = [o for o in bpy.data.objects if o.type == 'MESH']
    plan = [('chest_plate', 'F', 0.5, 0.30, 0.012, 0.12, 0.012, 'BOX', 0.06), ('chest_plate', 'F', 0.5, 0.80, 0.30, 0.012, 0.012, 'BOX', 0.06),
            ('chest_inner', 'F', 0.5, 0.55, 0.10, 0.012, 0.010, 'BOX', 0.05),
            ('abdomen', 'F', 0.5, 0.5, 0.20, 0.012, 0.012, 'BOX', 0.05), ('abdomen', 'F', 0.5, 0.5, 0.012, 0.07, 0.012, 'BOX', 0.05),
            ('back_plate', 'B', 0.5, 0.5, 0.012, 0.2, 0.012, 'BOX', 0.06), ('back_plate', 'B', 0.3, 0.6, 0.03, 0, 0.012, 'CIRCLE', 0.06), ('back_plate', 'B', 0.7, 0.6, 0.03, 0, 0.012, 'CIRCLE', 0.06),
            ('skirt_front', 'F', 0.5, 0.5, 0.012, 0.12, 0.012, 'BOX', 0.06), ('skirt_front', 'F', 0.5, 0.75, 0.22, 0.012, 0.012, 'BOX', 0.06),
            ('helmet', 'B', 0.5, 0.5, 0.012, 0.12, 0.010, 'BOX', 0.05)]
    for s in ('L', 'R'):
        out = 'R' if s == 'L' else 'L'  # outer side view (our +x is the robot's left; Blender RIGHT view looks from +x)
        out = 'R' if s == 'L' else 'L'
        plan += [(f'thigh_armor_{s}', out, 0.5, 0.5, 0.012, 0.22, 0.012, 'BOX', 0.06), (f'thigh_armor_{s}', out, 0.5, 0.62, 0.05, 0.03, 0.012, 'BOX', 0.12),
                 (f'shin_blade_{s}', 'F', 0.5, 0.55, 0.012, 0.12, 0.012, 'BOX', 0.12), (f'shin_blade_{s}', 'F', 0.5, 0.3, 0.09, 0.012, 0.012, 'BOX', 0.06),
                 (f'shin_armor_{s}', out, 0.5, 0.5, 0.025, 0, 0.012, 'CIRCLE', 0.05), (f'shin_armor_{s}', out, 0.5, 0.6, 0.012, 0.09, 0.012, 'BOX', 0.05),
                 (f'forearm_armor_{s}', out, 0.5, 0.5, 0.012, 0.12, 0.010, 'BOX', 0.05), (f'forearm_guard_{s}', out, 0.5, 0.5, 0.05, 0.012, 0.010, 'BOX', 0.05),
                 (f'upperarm_armor_{s}', out, 0.5, 0.5, 0.06, 0.012, 0.010, 'BOX', 0.05),
                 (f'pauldron_{s}', 'F', 0.5, 0.5, 0.012, 0.08, 0.012, 'BOX', 0.06), (f'pauldron_{s}', out, 0.5, 0.6, 0.12, 0.012, 0.012, 'BOX', 0.06),
                 (f'meta_armor_{s}', out, 0.5, 0.5, 0.012, 0.1, 0.010, 'BOX', 0.05)]
    if FAST: plan = plan[:4]
    bpy.context.preferences.view.smooth_view = 0
    for nm, face, u, v, w, h, d, shape, tol in plan:
        o = bpy.data.objects.get(nm)
        if not o: continue
        yield from A.bc_cut(o, [x for x in others if x is not o and x.name in bpy.data.objects], face, u, v, w, h, d, shape, tol)
    A.bc_cleanup()
    for o in ARMOR:
        if o.name in bpy.data.objects:
            A.hops_weighted_normal(o); A.apply_all(o)
    # crisp hard-surface shading: smooth inside a plate, sharp at chamfers, facets and cut walls
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        _sel = A._select([o], o)
        try: bpy.ops.mesh.customdata_custom_splitnormals_clear()
        except Exception: pass
        bm = bmesh.new(); bm.from_mesh(o.data)
        for f in bm.faces: f.smooth = True
        for e in bm.edges: e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.52)
        bm.to_mesh(o.data); bm.free()

# ------------------------------------------------------------------ concept render
def render(path, cam_az=-0.72, cam_el=0.12, res=(1200, 1500), tgt=(0, 0, 1.0), dist=4.9, lens=70, setup=True):
    sc = bpy.context.scene
    if not setup: return shoot(path, cam_az, cam_el, res, tgt, dist, lens)
    for o in bpy.data.objects: o.hide_set(False); o.hide_render = o.name.startswith(('Cutter', '_bc'))
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0)); fl = bpy.context.active_object
    fm = mat('floor', (0.012, 0.013, 0.016), 0.62); fm.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = 0.15; fl.data.materials.append(fm)
    world = sc.world or bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.012, 0.015, 0.022, 1); bg.inputs[1].default_value = 1.0
    def light(name, loc, energy, size, col):
        l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = col
        o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); o.visible_glossy = name.startswith('rim')
    light('key', (-2.2, -2.6, 3.0), 420, 2.2, (1, 0.96, 0.9))
    light('fill', (2.6, -1.6, 1.4), 90, 3.0, (0.75, 0.85, 1.0))
    light('rim', (1.4, 2.8, 2.6), 650, 1.5, (0.4, 0.75, 1.0))
    light('rim2', (-2.0, 2.4, 1.2), 400, 1.5, (1.0, 0.5, 0.35))
    shoot(path, cam_az, cam_el, res, tgt, dist, lens)

def shoot(path, cam_az, cam_el, res, tgt, dist, lens):
    sc = bpy.context.scene
    co = sc.camera or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if co.name not in sc.collection.objects: sc.collection.objects.link(co)
    co.data.lens = lens; tgt = Vector(tgt)
    co.location = tgt + Vector((math.sin(cam_az) * dist, -math.cos(cam_az) * dist, dist * math.sin(cam_el)))
    co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler(); sc.camera = co
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24 if FAST else 128; sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.resolution_percentage = 100
    sc.render.filepath = path; bpy.ops.render.render(write_still=True); print('RENDERED', path, flush=True)

def main():
    if '--hand-test' in argv: yield from hand_test(); return
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    build(); yield 0.1
    yield from addon_pass()
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    print('TRIS', tris, 'OBJECTS', len([o for o in bpy.data.objects if o.type == 'MESH']), flush=True)
    bpy.ops.wm.save_as_mainfile(filepath='/workspace/private/scout_v2.blend')
    render(OUT)
    render(OUT.replace('.png', '-closeup.png'), cam_az=-0.9, cam_el=0.1, res=(1500, 1200), tgt=(0.3, -0.12, 0.92), dist=1.6, lens=60, setup=False)

def hand_test():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    wr = Vector((0, 0, 1.0)); build_hand('L', wr, Vector((0, 0, -1)), fingers=5, size=1.7, curl=0.35)
    build_hand('H', Vector((0.4, 0, 1.0)), Vector((0, 0, -1)), fingers=3, size=2.2, curl=0.35)
    yield 0.1
    render(OUT, cam_az=-0.5, cam_el=0.15, res=(900, 700), tgt=(0.2, 0, 0.9), dist=1.6, lens=50)
    render(OUT.replace('.png', '-b.png'), cam_az=1.57, cam_el=0.15, res=(900, 700), tgt=(0.2, 0, 0.9), dist=1.6, lens=50, setup=False)

_gen = None
def _run():
    global _gen
    try:
        if _gen is None: _gen = main()
        return next(_gen)
    except StopIteration: pass
    except Exception: import traceback; traceback.print_exc()
    print('ADDONS_USED', dict(A.USED), flush=True)
    bpy.ops.wm.quit_blender()

bpy.app.timers.register(_run, first_interval=1.5)
