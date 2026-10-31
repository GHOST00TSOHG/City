"""
Procedural hard-surface mecha parts for the City robot (Gundam-style armour + DBZ-style bold crests).
Run:  blender -b --factory-startup --python tools/blender/robot_parts.py
Writes public/robot/parts/<slot>.glb (one file per slot) and tools/blender/robot_parts.blend.

Coordinates below are written in the GAME's frame (three.js: +Y up, +Z forward, metres) relative to the bone each
part attaches to, and converted to Blender (Z up, -Y forward) on creation, so the glTF exporter's +Y-up
conversion lands them back exactly in bone space. Bone frames match the procedural robot in src/robot/model.ts:
  Head: neck pivot, head sphere centre (0,0.10,0) r 0.135      Spine: torso centre (0,0.17,0), shoulders y 0.31 x ±0.2
  LeftArm: shoulder, upper arm runs to y -0.22                  LeftForeArm: elbow, hand at y -0.235
  LeftUpLeg: hip, thigh runs to y -0.27                         LeftLeg: knee, shin runs to y -0.27
  LeftFoot: ankle, sole at y -0.09, nozzle at (0,-0.12,-0.02) (kept clear so the boot flames still fit)
Object name = <slot>__<option>__<Bone>. Material names are colour regions the game tints:
  shell (primary armour) torso (secondary) joints (frame) backpack (accent) visor + decalColor (emissive glow)
"""
import bpy, bmesh, os, math
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'robot', 'parts')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

MATS = {}
def mat(name):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    base = {'shell': (0.9, 0.9, 0.88), 'torso': (0.85, 0.15, 0.1), 'joints': (0.08, 0.09, 0.1), 'backpack': (0.1, 0.3, 0.8), 'visor': (0.2, 1, 0.9), 'decalColor': (1, 0.8, 0.2)}[name]
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Roughness'].default_value = 0.4 if name in ('shell', 'torso', 'backpack') else 0.55
    b.inputs['Metallic'].default_value = 0.25 if name == 'joints' else 0.05
    if name in ('visor', 'decalColor'):
        b.inputs['Emission Color'].default_value = (*base, 1); b.inputs['Emission Strength'].default_value = 2.0
    MATS[name] = m; return m

def g2b(p): x, y, z = p; return Vector((x, -z, y))  # game (Y up, +Z fwd) -> Blender (Z up, -Y fwd)

PIECES = []  # (slot, option, bone, [(bm-mesh, material)])
def hull(pts, m, bevel=0.006):
    """Convex hull of points (game coords) -> chamfered hard-surface piece."""
    bm = bmesh.new()
    for p in pts: bm.verts.new(g2b(p))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.dissolve_limit(bm, angle_limit=0.02, verts=bm.verts, edges=bm.edges)
    if bevel:
        sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.5]
        bmesh.ops.bevel(bm, geom=sharp, offset=bevel, segments=1, profile=0.5, affect='EDGES', clamp_overlap=True)
    return (bm, m)

def box(c, s, m, taper=(1, 1), bevel=0.006, skew=(0, 0)):
    """Box centred c, size s; taper scales the top (+y) face in x,z; skew shifts the top face (x,z)."""
    cx, cy, cz = c; w, h, d = (v / 2 for v in s); pts = []
    for yy in (-1, 1):
        k = (taper[0], taper[1]) if yy > 0 else (1, 1); sx, sz = (skew if yy > 0 else (0, 0))
        for xx in (-1, 1):
            for zz in (-1, 1): pts.append((cx + xx * w * k[0] + sx, cy + yy * h, cz + zz * d * k[1] + sz))
    return hull(pts, m, bevel)

def cyl(c, r, h, m, n=12, axis='y', r2=None, bevel=0.004):
    r2 = r if r2 is None else r2; pts = []
    for i in range(n):
        a = 2 * math.pi * i / n; ca, sa = math.cos(a), math.sin(a)
        for t, rr in ((-h / 2, r), (h / 2, r2)):
            if axis == 'y': pts.append((c[0] + ca * rr, c[1] + t, c[2] + sa * rr))
            elif axis == 'z': pts.append((c[0] + ca * rr, c[1] + sa * rr, c[2] + t))
            else: pts.append((c[0] + t, c[1] + ca * rr, c[2] + sa * rr))
    return hull(pts, m, bevel)

def spike(base, tip, r, m, n=4):
    """Pointed spike from a small polygon around `base` to `tip`."""
    b, t = Vector(base), Vector(tip); ax = (t - b).normalized()
    u = ax.cross(Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0))).normalized(); v = ax.cross(u)
    pts = [tuple(b + (u * math.cos(2 * math.pi * i / n) + v * math.sin(2 * math.pi * i / n)) * r) for i in range(n)] + [tuple(t)]
    return hull(pts, m, 0.002)

def add(slot, opt, bone, pieces, mirror=False):
    PIECES.append((slot, opt, bone, pieces))
    if mirror:  # right side copy: mirror x
        R = []
        for bm, m in pieces:
            c = bm.copy(); bmesh.ops.scale(c, vec=(-1, 1, 1), verts=c.verts); bmesh.ops.reverse_faces(c, faces=c.faces); R.append((c, m))
        PIECES.append((slot, opt, bone.replace('Left', 'Right'), R))

S, T, J, A, V, D = (mat(n) for n in ('shell', 'torso', 'joints', 'backpack', 'visor', 'decalColor'))
mx = lambda pts: pts + [(-x, y, z) for x, y, z in pts]  # symmetric point set

# ---------------- HELMETS (Head) ----------------
def helmet_shell(m=S, top=0.27, w=0.15):
    # faceted angular dome around the head sphere; face left open at the front for the visor
    return hull(mx([(0.0, top, 0.02), (0.09, top - 0.02, 0.04), (0.06, top - 0.01, -0.09), (w, 0.15, 0.06), (w, 0.15, -0.08), (w - 0.01, 0.02, -0.06),
                    (w - 0.02, 0.0, 0.07), (0.07, -0.01, -0.13), (0.05, 0.22, 0.12), (0.10, 0.17, 0.12), (0.0, 0.08, -0.15)]), m)
def faceplate(m=T):
    return hull(mx([(0.05, 0.08, 0.14), (0.0, 0.03, 0.16), (0.07, 0.0, 0.11), (0.0, -0.01, 0.13), (0.09, 0.06, 0.1)]), m)
def eyes(m=V, w=0.095, y=0.115):
    return box((0, y, 0.135), (w * 2, 0.028, 0.03), m, taper=(1, 0.6), bevel=0.003)
add('helmet', 'kai', 'Head', [helmet_shell(), faceplate(T), eyes(),
    box((0, 0.2, 0.135), (0.04, 0.035, 0.03), T),  # forehead camera block
    hull([(0, 0.2, 0.15), (0.02, 0.19, 0.15), (0.17, 0.36, 0.1), (0.15, 0.37, 0.09), (0, 0.22, 0.14)], D, 0.002),  # V-fin
    hull([(0, 0.2, 0.15), (-0.02, 0.19, 0.15), (-0.17, 0.36, 0.1), (-0.15, 0.37, 0.09), (0, 0.22, 0.14)], D, 0.002),
    box((0.0, 0.05, 0.16), (0.05, 0.03, 0.02), J)])  # chin vent
add('helmet', 'saiyan', 'Head', [helmet_shell(T, 0.25), faceplate(S), eyes(V, 0.085, 0.11)] +
    [spike((x * 0.6, 0.22 - abs(x) * 0.2, 0.05 - abs(x) * 0.2), (x * 1.5, 0.43 - abs(x) * 0.5, -0.12 - abs(x) * 0.4), 0.045, D) for x in (-0.12, -0.06, 0.0, 0.06, 0.12)] +
    [spike((x, 0.16, -0.07), (x * 1.9, 0.22, -0.26), 0.04, D) for x in (-0.09, 0.09)])
add('helmet', 'oni', 'Head', [helmet_shell(S, 0.26, 0.16), faceplate(J), box((0, 0.12, 0.14), (0.14, 0.05, 0.03), V, taper=(0.7, 1), bevel=0.004),
    box((0, 0.03, 0.15), (0.08, 0.04, 0.02), T)] +
    [h for s in (1, -1) for h in (spike((s * 0.1, 0.22, 0.06), (s * 0.19, 0.3, 0.1), 0.03, T), spike((s * 0.19, 0.29, 0.1), (s * 0.2, 0.42, 0.16), 0.022, D))])

# ---------------- ARMS (LeftArm pauldron + LeftForeArm gauntlet, mirrored) ----------------
add('arms', 'strike', 'LeftArm', [box((0.04, 0.03, 0), (0.13, 0.1, 0.15), S, taper=(0.75, 0.85)), box((0.07, -0.02, 0), (0.09, 0.05, 0.16), T),
    box((0.012, -0.12, 0), (0.08, 0.12, 0.09), S, taper=(1.1, 1.1))], mirror=True)
add('arms', 'strike', 'LeftForeArm', [box((0.005, -0.12, 0.005), (0.1, 0.17, 0.1), S, taper=(1.2, 1.2)), box((0.05, -0.12, 0), (0.02, 0.12, 0.07), T),
    box((0, -0.235, 0.01), (0.085, 0.07, 0.08), J)], mirror=True)
add('arms', 'brawler', 'LeftArm', [hull([(0.12, 0.02, 0), (0.07, 0.11, 0.07), (0.07, 0.11, -0.07), (-0.03, 0.09, 0.09), (-0.03, 0.09, -0.09), (0.11, -0.07, 0.1), (0.11, -0.07, -0.1), (0.02, -0.05, 0.11), (0.02, -0.05, -0.11), (0.0, 0.12, 0)], T),
    box((0.135, 0.0, 0), (0.02, 0.1, 0.12), D, bevel=0.003), box((0.015, -0.13, 0), (0.09, 0.1, 0.1), S)], mirror=True)
add('arms', 'brawler', 'LeftForeArm', [box((0.005, -0.11, 0.0), (0.12, 0.17, 0.12), S, taper=(1.25, 1.25)), box((0, -0.25, 0.01), (0.13, 0.09, 0.12), T),
    box((0.0, -0.2, 0.075), (0.11, 0.03, 0.03), J)], mirror=True)
add('arms', 'blade', 'LeftArm', [box((0.04, 0.03, 0), (0.12, 0.09, 0.14), S, taper=(0.6, 0.8)), hull([(0.03, 0.07, 0.05), (0.03, 0.07, -0.06), (0.09, 0.21, -0.07), (0.1, 0.06, 0.0)], T, 0.003),
    box((0.012, -0.12, 0), (0.075, 0.12, 0.085), S)], mirror=True)
add('arms', 'blade', 'LeftForeArm', [box((0.005, -0.12, 0.005), (0.095, 0.17, 0.095), S, taper=(1.15, 1.15)),
    hull([(0.055, -0.05, 0.02), (0.055, -0.19, 0.03), (0.06, -0.3, 0.17), (0.06, -0.22, 0.2)], D, 0.002), box((0, -0.235, 0.01), (0.08, 0.06, 0.08), J)], mirror=True)

# ---------------- BIONICS (Spine: chest / shoulder add-ons) ----------------
chest = lambda m=S, d=0.15: hull(mx([(0.0, 0.33, d - 0.01), (0.12, 0.32, d - 0.04), (0.15, 0.22, d - 0.06), (0.11, 0.08, d - 0.05), (0.0, 0.06, d - 0.02), (0.13, 0.3, 0.02), (0.15, 0.18, 0.02), (0.0, 0.33, 0.05)]), m)
add('bionics', 'core', 'Spine', [chest(), cyl((0, 0.22, 0.155), 0.035, 0.03, V, n=10, axis='z'), cyl((0, 0.22, 0.145), 0.05, 0.03, J, n=10, axis='z'),
    box((0, 0.36, 0.03), (0.2, 0.04, 0.12), T, taper=(0.8, 0.8))] + [box((s * 0.075, 0.11, 0.14), (0.05, 0.03, 0.02), J) for s in (1, -1)])
add('bionics', 'aegis', 'Spine', [chest(T)] + [p for s in (1, -1) for p in (
    hull([(s * 0.2, 0.42, -0.05), (s * 0.3, 0.38, -0.06), (s * 0.33, 0.12, -0.04), (s * 0.24, 0.08, -0.03), (s * 0.2, 0.42, -0.1), (s * 0.31, 0.12, -0.09)], S),
    box((s * 0.29, 0.26, -0.035), (0.025, 0.12, 0.012), D, bevel=0.002), box((s * 0.16, 0.36, -0.07), (0.07, 0.05, 0.05), J))])
add('bionics', 'cannon', 'Spine', [chest(), box((0, 0.2, 0.15), (0.08, 0.06, 0.03), D, bevel=0.003),
    box((-0.17, 0.42, -0.1), (0.09, 0.08, 0.14), S), cyl((-0.17, 0.43, 0.06), 0.028, 0.32, J, n=10, axis='z'), cyl((-0.17, 0.43, 0.23), 0.04, 0.05, T, n=10, axis='z'),
    cyl((-0.17, 0.43, 0.26), 0.02, 0.01, V, n=10, axis='z'), box((-0.12, 0.37, -0.1), (0.04, 0.06, 0.06), J)])

# ---------------- LEGS (LeftUpLeg thigh, LeftLeg shin, mirrored) ----------------
add('legs', 'sprint', 'LeftUpLeg', [box((0.005, -0.14, 0.012), (0.12, 0.2, 0.12), S, taper=(0.9, 0.85)), box((0.065, -0.14, 0), (0.02, 0.14, 0.08), T)], mirror=True)
add('legs', 'sprint', 'LeftLeg', [box((0, -0.13, 0.015), (0.11, 0.22, 0.11), S, taper=(1.15, 1.2)), hull([(0, 0.04, 0.09), (0.035, -0.02, 0.07), (-0.035, -0.02, 0.07), (0, -0.04, 0.1), (0, 0.06, 0.05)], T, 0.003)], mirror=True)
add('legs', 'heavy', 'LeftUpLeg', [box((0.01, -0.14, 0.01), (0.15, 0.22, 0.15), S, taper=(1.05, 1.0)), box((0.085, -0.15, 0), (0.025, 0.12, 0.1), J)], mirror=True)
add('legs', 'heavy', 'LeftLeg', [box((0, -0.15, 0.012), (0.15, 0.24, 0.15), S, taper=(1.25, 1.25)), box((0, -0.02, 0.085), (0.11, 0.07, 0.03), T)] +
    [box((0.08 + 0.002 * i, -0.12 - i * 0.035, 0.0), (0.02, 0.018, 0.09), J, bevel=0.002) for i in range(3)], mirror=True)
add('legs', 'spike', 'LeftUpLeg', [box((0.005, -0.14, 0.012), (0.12, 0.21, 0.12), S, taper=(0.8, 0.9)), spike((0.06, -0.08, 0.0), (0.13, 0.0, -0.03), 0.025, T)], mirror=True)
add('legs', 'spike', 'LeftLeg', [box((0, -0.13, 0.015), (0.12, 0.22, 0.12), S, taper=(1.2, 1.25)), spike((0, -0.01, 0.07), (0, 0.11, 0.17), 0.035, T),
    hull([(0, -0.05, -0.06), (0, -0.2, -0.07), (0.0, -0.06, -0.15), (0.012, -0.12, -0.065), (-0.012, -0.12, -0.065)], D, 0.002)], mirror=True)

# ---------------- THRUSTERS (Spine back rockets) ----------------
bell = lambda x, y, z, r=0.04, h=0.08: [cyl((x, y, z), r * 0.6, h, J, n=12, r2=r), cyl((x, y - h / 2 - 0.005, z), r * 0.75, 0.012, V, n=12)]
add('thrusters', 'twin', 'Spine', [box((0, 0.24, -0.17), (0.24, 0.24, 0.1), A, taper=(0.85, 0.9))] + [p for s in (1, -1) for p in [box((s * 0.085, 0.16, -0.24), (0.08, 0.2, 0.08), S, taper=(0.8, 0.8))] + bell(s * 0.085, 0.02, -0.24)])
add('thrusters', 'wing', 'Spine', [box((0, 0.25, -0.16), (0.2, 0.22, 0.09), A)] + [p for s in (1, -1) for p in [
    hull([(s * 0.08, 0.3, -0.17), (s * 0.08, 0.22, -0.2), (s * 0.42, 0.52, -0.27), (s * 0.44, 0.47, -0.3), (s * 0.3, 0.3, -0.25)], S, 0.004),
    hull([(s * 0.2, 0.4, -0.23), (s * 0.42, 0.52, -0.27), (s * 0.4, 0.51, -0.25)], D, 0.0)] + bell(s * 0.07, 0.11, -0.2, 0.032, 0.06)])
halo = [cyl((0, 0.27, -0.24), 0.2, 0.02, A, n=24, axis='z', bevel=0.003), cyl((0, 0.27, -0.235), 0.17, 0.024, J, n=24, axis='z', bevel=0.0), box((0, 0.24, -0.17), (0.14, 0.18, 0.07), S)]
# the hull of two discs is a solid disc; cut the look with a dark inner disc and glow nozzles around the ring
add('thrusters', 'halo', 'Spine', halo + [p for i in range(6) for p in [cyl((math.cos(i * math.pi / 3 + math.pi / 6) * 0.19, 0.27 + math.sin(i * math.pi / 3 + math.pi / 6) * 0.19, -0.245), 0.03, 0.04, D, n=8, axis='z')]])

# ---------------- BOOTS (LeftFoot; sole at -0.09; keep nozzle (0,-0.12,-0.02) clear) ----------------
add('boots', 'jet', 'LeftFoot', [hull([(0.065, -0.09, -0.08), (-0.065, -0.09, -0.08), (0.06, -0.09, 0.1), (-0.06, -0.09, 0.1), (0, -0.08, 0.19), (0.06, 0.03, -0.07), (-0.06, 0.03, -0.07), (0.05, 0.0, 0.06), (-0.05, 0.0, 0.06)], S),
    box((0, -0.075, 0.07), (0.1, 0.02, 0.18), T), box((0, 0.04, 0), (0.12, 0.08, 0.12), S), cyl((0, -0.1, -0.02), 0.03, 0.03, J, n=10, r2=0.045)], mirror=True)
add('boots', 'talon', 'LeftFoot', [box((0, -0.035, -0.0), (0.12, 0.1, 0.15), S, taper=(1, 0.9)), box((0, 0.04, 0), (0.12, 0.08, 0.12), T)] +
    [spike((x, -0.07, 0.06), (x * 1.4, -0.09, 0.18), 0.022, J) for x in (-0.04, 0.0, 0.04)] + [spike((0, -0.07, -0.07), (0, -0.09, -0.15), 0.02, J), cyl((0, -0.1, -0.02), 0.03, 0.03, J, n=10, r2=0.045)], mirror=True)
add('boots', 'tank', 'LeftFoot', [box((0, -0.03, 0.035), (0.16, 0.13, 0.25), S), box((0, -0.085, 0.035), (0.165, 0.03, 0.255), J), box((0, 0.05, 0.0), (0.14, 0.09, 0.14), S, taper=(1.1, 1.1)),
    box((0.082, 0.0, 0.0), (0.02, 0.1, 0.1), T), box((-0.082, 0.0, 0.0), (0.02, 0.1, 0.1), T), box((0, -0.01, 0.16), (0.12, 0.05, 0.02), D, bevel=0.002), cyl((0, -0.1, -0.02), 0.035, 0.03, J, n=10, r2=0.05)], mirror=True)

# ---------------- build objects, one collection per slot, export ----------------
tri_total = {}
for slot in ('helmet', 'arms', 'bionics', 'legs', 'thrusters', 'boots'):
    col = bpy.data.collections.new(slot); bpy.context.scene.collection.children.link(col)
    for s, opt, bone, pieces in PIECES:
        if s != slot: continue
        bm = bmesh.new(); mats = []
        for pb, m in pieces:
            if m not in mats: mats.append(m)
            me_tmp = bpy.data.meshes.new('tmp'); pb.to_mesh(me_tmp)
            for p in me_tmp.polygons: p.material_index = mats.index(m)
            bm.from_mesh(me_tmp); bpy.data.meshes.remove(me_tmp); pb.free()
        me = bpy.data.meshes.new(f'{slot}__{opt}__{bone}'); bm.to_mesh(me); bm.free()
        for m in mats: me.materials.append(m)
        ob = bpy.data.objects.new(me.name, me); col.objects.link(ob)
        tri_total[(slot, opt)] = tri_total.get((slot, opt), 0) + sum(len(p.vertices) - 2 for p in me.polygons)
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in col.objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f'{slot}.glb'), use_selection=True, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT', export_normals=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tools', 'blender', 'robot_parts.blend'))
for k, v in sorted(tri_total.items()): print('TRIS', k, v)
