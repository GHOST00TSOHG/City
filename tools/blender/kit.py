"""
Shared hard-surface kit + bake/export pipeline for the City robot types (scout / heavy / worker / glitch core).
Used by tools/blender/robot_types.py. Blender 4.2 headless, no add-ons, no paid assets.

Coordinates are written in the GAME frame (+Y up, +Z forward, metres) in the space of the bone a piece hangs on,
converted to Blender (Z up, -Y forward) on creation; the glTF exporter's +Y-up conversion lands them back in bone space.
Bone offsets come from src/robot/skeleton.json (same file the game reads), so parts always fit the runtime skeleton.

Object name = <slot>__<option>__<Bone> (slot 'body' = always-on base body, bone 'P<n>' = runtime piston).
Material name = paint region (the game tints shell/joints/torso/shorts/backpack/visor/decalColor; screen/chrome/rubber/glass
are fixed finishes; decal samples the decal atlas through UV1).
"""
import bpy, bmesh, math, os, json
from mathutils import Vector, Matrix, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SKEL = json.load(open(os.path.join(ROOT, 'src', 'robot', 'skeleton.json')))
REGIONS = ['shell', 'joints', 'torso', 'shorts', 'backpack', 'visor', 'decalColor', 'screen', 'chrome', 'rubber', 'decal', 'glass']
PREVIEW = {'shell': (0.05, 0.05, 0.055), 'joints': (0.02, 0.02, 0.022), 'torso': (0.09, 0.09, 0.1), 'shorts': (0.03, 0.03, 0.03), 'backpack': (0.9, 0.3, 0.04),
           'visor': (1, 0.35, 0.05), 'decalColor': (1, 0.4, 0.05), 'screen': (1, 0.35, 0.08), 'chrome': (0.8, 0.8, 0.82), 'rubber': (0.015, 0.015, 0.015),
           'decal': (1, 0.4, 0.05), 'glass': (0.01, 0.012, 0.02)}

def g2b(p): return Vector((p[0], -p[2], p[1]))

def reset():
    # clear data in place (read_factory_settings would unload the add-ons and the GUI window they need)
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for x in list(coll): coll.remove(x)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)
    global MATS; MATS = {}

MATS = {}
def mat(name):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*PREVIEW[name], 1)
    b.inputs['Roughness'].default_value = {'chrome': 0.18, 'glass': 0.08, 'rubber': 0.85, 'joints': 0.5}.get(name, 0.55)
    b.inputs['Metallic'].default_value = {'chrome': 1.0, 'joints': 0.6}.get(name, 0.15)
    if name in ('visor', 'decalColor', 'screen'):
        b.inputs['Emission Color'].default_value = (*PREVIEW[name], 1); b.inputs['Emission Strength'].default_value = 3.0
    MATS[name] = m; return m

# ---------------------------------------------------------------- primitives (each returns (bmesh, region))
def _xf(pts, c, rot):
    if not rot or rot == (0, 0, 0): return [Vector(p) for p in pts]
    R = Euler(rot, 'XYZ').to_matrix(); cv = Vector(c)
    return [R @ (Vector(p) - cv) + cv for p in pts]

ADDONS = False  # set by robot_types.py when Hard Ops + MESHmachine are live (virtual-display run)
ARMOR = ('shell', 'torso', 'backpack', 'shorts')

def hull(pts, region='shell', bev=0.006, seg=1, rot=None, c=(0, 0, 0), angle=0.5):
    meta = {}
    if ADDONS and bev >= 0.005:
        # add-on mode: big radii become MESHmachine fillets, the rest is left sharp for the Hard Ops bevel pass
        if bev >= 0.014 and region in ARMOR: meta['fillet'] = bev
        bev = 0
    bm = bmesh.new()
    for p in _xf(pts, c, rot): bm.verts.new(g2b(p))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.dissolve_limit(bm, angle_limit=0.01, verts=bm.verts, edges=bm.edges)
    if bev:
        sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > angle]
        bmesh.ops.bevel(bm, geom=sharp, offset=bev, segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
    return (bm, region, meta)

def box(c, s, region='shell', bev=0.008, seg=2, taper=(1, 1), skew=(0, 0), rot=None, taperb=(1, 1)):
    """Box centred c, size s. taper scales the top (+y) face in x,z (taperb the bottom); skew shifts the top face."""
    cx, cy, cz = c; w, h, d = (v / 2 for v in s); pts = []
    for yy in (-1, 1):
        k = taper if yy > 0 else taperb; sx, sz = (skew if yy > 0 else (0, 0))
        for xx in (-1, 1):
            for zz in (-1, 1): pts.append((cx + xx * w * k[0] + sx, cy + yy * h, cz + zz * d * k[1] + sz))
    return hull(pts, region, bev, seg, rot, c)

def wedge(c, s, region='shell', bev=0.008, seg=2, front=0.5, rot=None):
    """Box whose front-top edge is chamfered back by `front` of the depth (armour plate look)."""
    cx, cy, cz = c; w, h, d = (v / 2 for v in s); pts = []
    for xx in (-1, 1):
        pts += [(cx + xx * w, cy - h, cz - d), (cx + xx * w, cy - h, cz + d), (cx + xx * w, cy + h, cz - d), (cx + xx * w, cy + h, cz + d - 2 * d * front), (cx + xx * w, cy + h - 2 * h * front * 0.6, cz + d)]
    return hull(pts, region, bev, seg, rot, c)

def cyl(c, r, h, region='shell', n=16, axis='y', r2=None, bev=0.005, seg=1, rot=None):
    r2 = r if r2 is None else r2; pts = []
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n; ca, sa = math.cos(a), math.sin(a)
        for t, rr in ((-h / 2, r), (h / 2, r2)):
            if axis == 'y': pts.append((c[0] + ca * rr, c[1] + t, c[2] + sa * rr))
            elif axis == 'z': pts.append((c[0] + ca * rr, c[1] + sa * rr, c[2] + t))
            else: pts.append((c[0] + t, c[1] + ca * rr, c[2] + sa * rr))
    return hull(pts, region, bev, seg, rot, c, angle=0.9)

def sphere(c, r, region='shell', n=12, sy=1.0, sz=1.0, cut=None):
    """Faceted ellipsoid (hull of rings). cut = keep y >= cut (dome)."""
    pts = []
    for j in range(n // 2 + 1):
        v = math.pi * j / (n // 2); y = math.cos(v); rr = math.sin(v)
        if cut is not None and y < cut: y = cut
        for i in range(n): a = 2 * math.pi * i / n; pts.append((c[0] + math.cos(a) * rr * r, c[1] + y * r * sy, c[2] + math.sin(a) * rr * r * sz))
    return hull(pts, region, 0.003 if cut is not None else 0, 1, angle=0.6)

def ring(c, r, t, w, region='chrome', n=20, axis='z'):
    """Torus-ish band (open ring) made of n box segments."""
    out = []
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n; pts = []
        for a in (a0, a1):
            for rr in (r - t / 2, r + t / 2):
                for ww in (-w / 2, w / 2):
                    x, y = math.cos(a) * rr, math.sin(a) * rr
                    pts.append((c[0] + x, c[1] + y, c[2] + ww) if axis == 'z' else (c[0] + ww, c[1] + x, c[2] + y) if axis == 'x' else (c[0] + x, c[1] + ww, c[2] + y))
        out.append(hull(pts, region, 0))
    return out

def tube(path, r, region='rubber', n=6):
    """Cable / hose along a polyline (game coords)."""
    bm = bmesh.new(); rings = []; P = [Vector(p) for p in path]
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        u = t.cross(Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))).normalized(); v = t.cross(u)
        rings.append([bm.verts.new(g2b(p + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * r)) for k in range(n)])
    for a, b in zip(rings, rings[1:]):
        for k in range(n): bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    return (bm, region, {'nobevel': True})

def bolt(c, axis='z', r=0.009, h=0.006, region='chrome'):
    return cyl(c, r, h, region, n=6, axis=axis, bev=0.0015)

def bolts(points, axis='z', r=0.008, region='chrome'):
    return [bolt(p, axis, r, region=region) for p in points]

def slats(c, w, h, n, axis='z', depth=0.012, region='joints', gap=0.6):
    """Vent slats: n thin bars stacked in y, protruding along axis."""
    out = []; step = h / n
    for i in range(n):
        y = c[1] - h / 2 + step * (i + 0.5)
        s = (w, step * gap, depth) if axis == 'z' else (depth, step * gap, w)
        out.append(box((c[0], y, c[2]), s, region, bev=0.0015, seg=1))
    return out

def decal(c, size, cell, axis='z', region='decal', rot=0.0):
    """Flat quad facing +axis (or -axis with a '-' prefix) carrying UV1 into the 4x4 decal atlas cell (col,row)."""
    bm = bmesh.new(); w, h = size[0] / 2, size[1] / 2; s = -1 if axis.startswith('-') else 1; ax = axis[-1]
    corners = [(-w, -h), (w, -h), (w, h), (-w, h)]
    ca, sa = math.cos(rot), math.sin(rot)
    vs = []
    for x, y in corners:
        x, y = x * ca - y * sa, x * sa + y * ca
        if ax == 'z': p = (c[0] + x * s, c[1] + y, c[2])
        elif ax == 'x': p = (c[0], c[1] + y, c[2] - x * s)
        else: p = (c[0] + x, c[1], c[2] - y * s)
        vs.append(bm.verts.new(g2b(p)))
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new('decal')
    col, row = cell; u0, v0 = col / 4, 1 - (row + 1) / 4
    for loop, (uu, vv) in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]): loop[uvl].uv = (u0 + (0.02 + uu * 0.96) / 4, v0 + (0.02 + vv * 0.96) / 4)
    return (bm, region, {'nobevel': True})

def piston(length, r_house, r_rod, rod=False, region_h='joints'):
    """Hydraulic piston along +Y from the origin. Housing: fat cylinder with collar; rod: chrome with an eye end."""
    if rod: return [cyl((0, length * 0.5, 0), r_rod, length, 'chrome', n=10, bev=0.002), cyl((0, 0, 0), r_rod * 1.8, r_rod * 2.2, region_h, n=10, axis='x')]
    return [cyl((0, length * 0.5, 0), r_house, length, region_h, n=12, bev=0.004), cyl((0, length * 0.98, 0), r_house * 1.15, 0.018, 'chrome', n=12, bev=0.002),
            cyl((0, 0, 0), r_house * 1.25, r_house * 2.2, region_h, n=10, axis='x')]

def mirror_x(pieces):
    out = []
    for bm, m, meta in pieces:
        c = bm.copy(); bmesh.ops.scale(c, vec=(-1, 1, 1), verts=c.verts); bmesh.ops.reverse_faces(c, faces=c.faces); out.append((c, m, dict(meta)))
    return out

def panelize(bm, min_area=0.004, thick=0.006, depth=0.0025):
    """Inset big flat faces and sink them slightly: real panel seams that catch AO and edge wear."""
    faces = [f for f in bm.faces if f.calc_area() > min_area and len(f.verts) >= 4]
    if not faces: return
    r = bmesh.ops.inset_individual(bm, faces=faces, thickness=thick, depth=-depth, use_even_offset=True)

# ---------------------------------------------------------------- scene assembly
class Kit:
    def __init__(self, rtype):
        self.type = rtype; self.sk = SKEL[rtype]; self.pieces = []; self.pistons = []
        b = self.sk['bones']
        self.local = dict(b)
        for k, v in list(b.items()):
            if k.startswith('Left'): self.local['Right' + k[4:]] = [-v[0], v[1], v[2]]
        par = {'Hips': None, 'Spine': 'Hips', 'Head': 'Spine', 'LeftArm': 'Spine', 'RightArm': 'Spine', 'LeftForeArm': 'LeftArm', 'RightForeArm': 'RightArm',
               'LeftUpLeg': 'Hips', 'RightUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'RightLeg': 'RightUpLeg', 'LeftFoot': 'LeftLeg', 'RightFoot': 'RightLeg'}
        self.parent = par; self.world = {}
        def w(n):
            if n in self.world: return self.world[n]
            p = par[n]; v = Vector(self.local[n]) + (w(p) if p else Vector())
            self.world[n] = v; return v
        for n in par: w(n)

    def add(self, slot, opt, bone, pieces, mirror=False):
        pieces = [p for x in pieces for p in (x if isinstance(x, list) else [x])]
        self.pieces.append((slot, opt, bone, pieces))
        if mirror: self.pieces.append((slot, opt, bone.replace('Left', 'Right'), mirror_x(pieces)))

    def add_piston(self, slot, opt, a_bone, a_piv, b_bone, b_piv, r=0.03, mirror=True):
        """Runtime piston: housing pivots on a_bone at a_piv and aims at b_piv on b_bone; rod does the reverse."""
        A, B = self.world[a_bone] + Vector(a_piv), self.world[b_bone] + Vector(b_piv); L = (B - A).length
        for side in ([1, -1] if mirror else [1]):
            ab, bb = (a_bone, b_bone) if side > 0 else (a_bone.replace('Left', 'Right'), b_bone.replace('Left', 'Right'))
            ap, bp = (list(a_piv), list(b_piv)) if side > 0 else ([-a_piv[0], a_piv[1], a_piv[2]], [-b_piv[0], b_piv[1], b_piv[2]])
            i = len(self.pistons)
            self.pistons.append({'slot': slot, 'opt': opt, 'a': ab, 'ap': ap, 'b': bb, 'bp': bp, 'objA': f'P{2 * i}', 'objB': f'P{2 * i + 1}'})
            self.pieces.append((slot, opt, f'P{2 * i}', piston(L * 0.62, r, r * 0.5)))
            self.pieces.append((slot, opt, f'P{2 * i + 1}', piston(L * 0.75, r, r * 0.5, rod=True)))

    def _armor_pass(self, pb, meta, region):
        """Add-on pass on one armour piece: MESHmachine fillet on its top rim, Hard Ops boolean panel grooves."""
        import addons as A
        me = bpy.data.meshes.new('piece'); pb.to_mesh(me); pb.free(); ob = bpy.data.objects.new('piece', me); bpy.context.scene.collection.objects.link(ob)
        zs = [v.co.z for v in me.vertices]; zmin, zmax = min(zs), max(zs); h = zmax - zmin
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
        if meta.get('fillet') and h > meta['fillet'] * 4:
            w = min(meta['fillet'], h * 0.2)
            bm = bmesh.new(); bm.from_mesh(me)  # support loops so Fuse has rails + projected loops to work with
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, zmax - 2.5 * w), plane_no=(0, 0, 1))
            top = [f for f in bm.faces if all(v.co.z > zmax - 1e-4 for v in f.verts)]
            if top: bmesh.ops.inset_region(bm, faces=top, thickness=2.5 * w, use_even_offset=True)
            bm.to_mesh(me); bm.free()
            if not A.mm_fuse_loop(ob, lambda e: all(v.co.z > zmax - 1e-4 for v in e.verts) and len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.6, width=w, segments=4):
                pass  # Fuse refused this piece: the Hard Ops bevel pass still rounds it
        dx, dy = max(xs) - min(xs), max(ys) - min(ys)
        if h > 0.09 and min(dx, dy) > 0.05:
            for f in ((0.66,) if h < 0.2 else (0.33, 0.7)):
                z = zmin + h * f; bm = bmesh.new(); bm.from_mesh(me)
                cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
                sec = [g.co.copy() for g in cut['geom_cut'] if isinstance(g, bmesh.types.BMVert)]; bm.free()
                if len(sec) < 3: continue
                sx = [v.x for v in sec]; sy = [v.y for v in sec]; d = 0.0035; gh = 0.0045
                cb = bmesh.new()
                outer = bmesh.ops.create_cube(cb, size=1.0)['verts']
                bmesh.ops.scale(cb, vec=(max(sx) - min(sx) + 0.04, max(sy) - min(sy) + 0.04, gh), verts=outer)
                inner = bmesh.ops.create_cube(cb, size=1.0)['verts']
                bmesh.ops.scale(cb, vec=(max(sx) - min(sx) - 2 * d, max(sy) - min(sy) - 2 * d, gh * 1.01), verts=inner)
                bmesh.ops.reverse_faces(cb, faces=list({f for v in inner for f in v.link_faces}))
                bmesh.ops.translate(cb, vec=((min(sx) + max(sx)) / 2, (min(sy) + max(sy)) / 2, z), verts=cb.verts)
                cm = bpy.data.meshes.new('groove'); cb.to_mesh(cm); cb.free(); co = bpy.data.objects.new('groove', cm); bpy.context.scene.collection.objects.link(co)
                if not A.hops_boolean(ob, co, 'difference'): bpy.data.objects.remove(co)
        bm = bmesh.new(); bm.from_mesh(ob.data); bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
        return bm

    def build(self, panel=True):
        """bmesh pieces -> one Blender object per (slot, option, bone); returns tri counts per (slot, option)."""
        import addons as A
        tris = {}; self.objs = []
        col = bpy.data.collections.new(self.type); bpy.context.scene.collection.children.link(col)
        grouped = {}
        for slot, opt, bone, pieces in self.pieces: grouped.setdefault((slot, opt, bone), []).extend(pieces)
        for (slot, opt, bone), pieces in grouped.items():
            bm = bmesh.new(); bm.loops.layers.uv.new('UVMap'); bm.loops.layers.uv.new('decal'); mats = []
            for pb, region, meta in pieces:
                if ADDONS and region in ARMOR: pb = self._armor_pass(pb, meta, region)
                elif panel and region in ARMOR: panelize(pb)
                m = mat(region)
                if m not in mats: mats.append(m)
                me_tmp = bpy.data.meshes.new('tmp'); pb.to_mesh(me_tmp)
                for p in me_tmp.polygons: p.material_index = mats.index(m)
                bm.from_mesh(me_tmp); bpy.data.meshes.remove(me_tmp); pb.free()
            me = bpy.data.meshes.new(f'{slot}__{opt}__{bone}'); bm.to_mesh(me); bm.free()
            for m in mats: me.materials.append(m)
            if 'UVMap' not in me.uv_layers: me.uv_layers.new(name='UVMap')
            if 'decal' not in me.uv_layers: me.uv_layers.new(name='decal')
            me.uv_layers.active_index = 0
            ob = bpy.data.objects.new(me.name, me); col.objects.link(ob); self.objs.append(ob)
            me.shade_smooth()
            if ADDONS and A.hops_bevel(ob, width=0.006, segments=1 if slot == 'body' else 2, angle=32):
                A.hops_weighted_normal(ob); A.apply_all(ob)
            else: me.set_sharp_from_angle(angle=math.radians(38))
            ob['bone'] = bone
            tris[(slot, opt)] = tris.get((slot, opt), 0) + sum(len(p.vertices) - 2 for p in me.polygons)
        self.tris = tris; return tris

    # ---- UV atlas + bakes
    def unwrap(self):
        objs = self.objs
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.mode_set(mode='EDIT')
        for o in objs:
            bm = bmesh.from_edit_mesh(o.data); dec = [i for i, m in enumerate(o.data.materials) if m.name == 'decal']
            for f in bm.faces: f.select = True  # decals get atlas UVs too, so AO / grime / edge wear paint over them
            bmesh.update_edit_mesh(o.data)
        bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.uv.pack_islands(margin=0.004, rotate=True, shape_method='CONCAVE')
        bpy.ops.object.mode_set(mode='OBJECT')

    def bake(self, out_dir, builds, size=2048):
        sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24
        sc.render.bake.margin = 6; sc.cycles.use_denoising = False
        if not sc.world: sc.world = bpy.data.worlds.new('W')
        sc.world.light_settings.distance = 0.35
        imgs = {k: bpy.data.images.new(f'{self.type}_{k}', size, size, alpha=False, float_buffer=False) for k in ('ao', 'edge', 'grime', 'normal')}
        imgs['normal'].colorspace_settings.name = 'Non-Color'
        for k in ('ao', 'edge', 'grime'): imgs[k].colorspace_settings.name = 'Non-Color'
        orig = {o.name: [s.material for s in o.material_slots] for o in self.objs}
        bk = bpy.data.materials.new('BAKE'); bk.use_nodes = True; nt = bk.node_tree; N = nt.nodes; L = nt.links
        for n in list(N): N.remove(n)
        out = N.new('ShaderNodeOutputMaterial'); img = N.new('ShaderNodeTexImage'); N.active = img; img.select = True
        tc = N.new('ShaderNodeTexCoord'); geo = N.new('ShaderNodeNewGeometry')
        for o in self.objs:
            for s in o.material_slots: s.material = bk
        def run(kind):
            done = set()
            for i, bd in enumerate(builds):
                vis = self.pose(bd); sel = [o for o in vis if o.name not in done]
                if not sel: continue
                bpy.ops.object.select_all(action='DESELECT')
                for o in sel: o.select_set(True); done.add(o.name)
                bpy.context.view_layer.objects.active = sel[0]
                bpy.ops.object.bake(type=kind, use_clear=(i == 0))
            self.unpose()

        def emit(node_out):
            em = N.new('ShaderNodeEmission'); L.new(node_out, em.inputs['Color']); L.new(em.outputs[0], out.inputs['Surface']); return em
        # AO
        img.image = imgs['ao']; diff = N.new('ShaderNodeBsdfDiffuse'); L.new(diff.outputs[0], out.inputs['Surface'])
        run('AO')
        # EDGE: 1 - dot(rounded bevel normal, true normal) => bright on convex edges; noise breaks it up
        bev = N.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.014; bev.samples = 8
        dp = N.new('ShaderNodeVectorMath'); dp.operation = 'DOT_PRODUCT'; L.new(bev.outputs[0], dp.inputs[0]); L.new(geo.outputs['Normal'], dp.inputs[1])
        inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; L.new(dp.outputs['Value'], inv.inputs[1])
        mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.use_clamp = True; mul.inputs[1].default_value = 9.0; L.new(inv.outputs[0], mul.inputs[0])
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 38; nz.inputs['Detail'].default_value = 8; nz.inputs['Roughness'].default_value = 0.7
        L.new(tc.outputs['Object'], nz.inputs['Vector'])
        ramp = N.new('ShaderNodeMapRange'); ramp.inputs['From Min'].default_value = 0.35; ramp.inputs['From Max'].default_value = 0.65
        L.new(nz.outputs['Fac'], ramp.inputs['Value'])
        m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; m2.use_clamp = True; L.new(mul.outputs[0], m2.inputs[0]); L.new(ramp.outputs[0], m2.inputs[1])
        mx = N.new('ShaderNodeMath'); mx.operation = 'MULTIPLY_ADD'; L.new(mul.outputs[0], mx.inputs[0]); mx.inputs[1].default_value = 0.35; L.new(m2.outputs[0], mx.inputs[2])
        img.image = imgs['edge']; emit(mx.outputs[0])
        run('EMIT')
        # GRIME: cavity (local AO) x blotchy noise + vertical rust/oil streaks running down from edges
        ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.06; ao.only_local = True; ao.samples = 8
        cav = N.new('ShaderNodeMath'); cav.operation = 'SUBTRACT'; cav.inputs[0].default_value = 1.0; L.new(ao.outputs['AO'], cav.inputs[1])
        cavp = N.new('ShaderNodeMath'); cavp.operation = 'MULTIPLY'; cavp.use_clamp = True; cavp.inputs[1].default_value = 2.2; L.new(cav.outputs[0], cavp.inputs[0])
        mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (14, 14, 1.2); L.new(tc.outputs['Object'], mp.inputs['Vector'])
        st = N.new('ShaderNodeTexNoise'); st.inputs['Scale'].default_value = 3.0; st.inputs['Detail'].default_value = 4; L.new(mp.outputs[0], st.inputs['Vector'])
        str_ = N.new('ShaderNodeMapRange'); str_.inputs['From Min'].default_value = 0.52; str_.inputs['From Max'].default_value = 0.75; L.new(st.outputs['Fac'], str_.inputs['Value'])
        bl = N.new('ShaderNodeTexNoise'); bl.inputs['Scale'].default_value = 9; bl.inputs['Detail'].default_value = 6; L.new(tc.outputs['Object'], bl.inputs['Vector'])
        blr = N.new('ShaderNodeMapRange'); blr.inputs['From Min'].default_value = 0.45; blr.inputs['From Max'].default_value = 0.7; L.new(bl.outputs['Fac'], blr.inputs['Value'])
        a1 = N.new('ShaderNodeMath'); a1.operation = 'MULTIPLY'; L.new(blr.outputs[0], a1.inputs[0]); a1.inputs[1].default_value = 0.35
        a2 = N.new('ShaderNodeMath'); a2.operation = 'MULTIPLY'; L.new(str_.outputs[0], a2.inputs[0]); a2.inputs[1].default_value = 0.45
        s1 = N.new('ShaderNodeMath'); s1.operation = 'ADD'; L.new(cavp.outputs[0], s1.inputs[0]); L.new(a1.outputs[0], s1.inputs[1])
        s2 = N.new('ShaderNodeMath'); s2.operation = 'ADD'; s2.use_clamp = True; L.new(s1.outputs[0], s2.inputs[0]); L.new(a2.outputs[0], s2.inputs[1])
        img.image = imgs['grime']; emit(s2.outputs[0])
        run('EMIT')
        # NORMAL: rounded edges (bevel normal) + fine hammered / scratch detail baked into a tangent-space map
        pb = N.new('ShaderNodeBsdfPrincipled'); bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.002
        sc_ = N.new('ShaderNodeMapping'); sc_.inputs['Scale'].default_value = (1, 1, 1); L.new(tc.outputs['Object'], sc_.inputs['Vector'])
        dn = N.new('ShaderNodeTexNoise'); dn.inputs['Scale'].default_value = 120; dn.inputs['Detail'].default_value = 4; L.new(sc_.outputs[0], dn.inputs['Vector'])
        vor = N.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = 60; L.new(tc.outputs['Object'], vor.inputs['Vector'])
        vr = N.new('ShaderNodeMapRange'); vr.inputs['From Min'].default_value = 0.0; vr.inputs['From Max'].default_value = 0.03; L.new(vor.outputs['Distance'], vr.inputs['Value'])
        hh = N.new('ShaderNodeMath'); hh.operation = 'MULTIPLY_ADD'; L.new(dn.outputs['Fac'], hh.inputs[0]); hh.inputs[1].default_value = 0.6; L.new(vr.outputs[0], hh.inputs[2])
        L.new(hh.outputs[0], bump.inputs['Height']); bev2 = N.new('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.01; bev2.samples = 8
        L.new(bev2.outputs[0], bump.inputs['Normal']); L.new(bump.outputs[0], pb.inputs['Normal']); L.new(pb.outputs[0], out.inputs['Surface'])
        img.image = imgs['normal']; sc.render.bake.normal_space = 'TANGENT'
        run('NORMAL')
        for o in self.objs:
            for s, m in zip(o.material_slots, orig[o.name]): s.material = m
        bpy.data.materials.remove(bk)
        # combine AO / edge / grime into one RGB mask; save normal
        import numpy as np
        px = lambda im: np.array(im.pixels[:], dtype=np.float32).reshape(size, size, 4)
        a, e, g = px(imgs['ao']), px(imgs['edge']), px(imgs['grime'])
        m = np.stack([a[..., 0], e[..., 0], g[..., 0], np.ones((size, size), np.float32)], -1)
        mk = bpy.data.images.new(f'{self.type}_masks', size, size, alpha=False); mk.colorspace_settings.name = 'Non-Color'
        mk.pixels[:] = m.ravel(); os.makedirs(out_dir, exist_ok=True)
        for im, name in ((mk, 'masks.png'), (imgs['normal'], 'normal.png')):
            im.filepath_raw = os.path.join(out_dir, name); im.file_format = 'PNG'; im.save()
        self.bake_imgs = {'masks': mk, 'normal': imgs['normal']}

    def export(self, path):
        bpy.ops.object.select_all(action='DESELECT')
        for o in self.objs: o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT',
                                  export_normals=True, export_texcoords=True, export_image_format='NONE')

    def pose(self, build):
        """Place every object of `build` ({slot: option}; body always) at its rest-pose bone position, hide the rest."""
        for o in self.objs:
            slot, opt, bone = o.name.split('__')
            show = slot == 'body' or build.get(slot) == opt
            o.hide_render = not show; o.hide_viewport = False
            if bone.startswith('P'):
                pi = int(bone[1:]) // 2; P = self.pistons[pi]; A = self.world[P['a']] + Vector(P['ap']); B = self.world[P['b']] + Vector(P['bp'])
                s, t = (A, B) if int(bone[1:]) % 2 == 0 else (B, A)
                q = Vector((0, 0, 1)).rotation_difference(g2b(t - s))
                o.matrix_world = Matrix.Translation(g2b(s)) @ q.to_matrix().to_4x4()
            else: o.matrix_world = Matrix.Translation(g2b(self.world[bone]))
        return [o for o in self.objs if not o.hide_render]

    def unpose(self):
        for o in self.objs: o.matrix_world = Matrix.Identity(4); o.hide_render = False

    # ---- preview render (Cycles) of a build in rest pose, using the baked maps like the game shader does
    def preview(self, build, path, paint=None, cam=(0.55, -0.1), res=(720, 960), samples=48):
        sc = bpy.context.scene; paint = paint or {}
        self.pose(build)
        # materials -> preview finishes driven by baked masks
        for name, m in MATS.items():
            nt = m.node_tree; N = nt.nodes; L = nt.links; b = N['Principled BSDF']
            if 'masks' in N: continue
            uvn = N.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
            mi = N.new('ShaderNodeTexImage'); mi.name = 'masks'; mi.image = self.bake_imgs['masks']; L.new(uvn.outputs[0], mi.inputs[0])
            ni = N.new('ShaderNodeTexImage'); ni.image = self.bake_imgs['normal']; L.new(uvn.outputs[0], ni.inputs[0])
            nm = N.new('ShaderNodeNormalMap'); L.new(ni.outputs[0], nm.inputs['Color']); L.new(nm.outputs[0], b.inputs['Normal'])
            if name == 'decal':
                du = N.new('ShaderNodeUVMap'); du.uv_map = 'decal'; di = N.new('ShaderNodeTexImage'); di.image = bpy.data.images.load(os.path.join(ROOT, 'public', 'robot', 'decals.png'))
                L.new(du.outputs[0], di.inputs[0]); b.inputs['Emission Strength'].default_value = 0
                # painted-in: same AO / grime as the paint under it, chipped away where the edge-wear mask shows bare metal
                sp = N.new('ShaderNodeSeparateColor'); L.new(mi.outputs[0], sp.inputs[0])
                inv = N.new('ShaderNodeMapRange'); inv.inputs['From Min'].default_value = 0.35; inv.inputs['From Max'].default_value = 0.7; inv.inputs['To Min'].default_value = 1; inv.inputs['To Max'].default_value = 0
                L.new(sp.outputs['Green'], inv.inputs['Value']); al = N.new('ShaderNodeMath'); al.operation = 'MULTIPLY'; L.new(di.outputs['Alpha'], al.inputs[0]); L.new(inv.outputs[0], al.inputs[1])
                L.new(al.outputs[0], b.inputs['Alpha'])
                dc = N.new('ShaderNodeRGB'); dc.outputs[0].default_value = (*paint.get('decalColor', PREVIEW['decalColor']), 1)
                gm = N.new('ShaderNodeMix'); gm.data_type = 'RGBA'; gm.blend_type = 'MULTIPLY'; L.new(sp.outputs['Blue'], gm.inputs['Factor']); L.new(dc.outputs[0], gm.inputs[6]); gm.inputs[7].default_value = (0.25, 0.2, 0.15, 1)
                am = N.new('ShaderNodeMix'); am.data_type = 'RGBA'; am.blend_type = 'MULTIPLY'; am.inputs['Factor'].default_value = 1.0; L.new(gm.outputs[2], am.inputs[6]); L.new(sp.outputs['Red'], am.inputs[7])
                L.new(am.outputs[2], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.55; b.inputs['Metallic'].default_value = 0.1
                continue
            if name in ('visor', 'decalColor', 'screen'):
                c_ = paint.get(name, PREVIEW[name]); b.inputs['Emission Color'].default_value = (*c_, 1); b.inputs['Base Color'].default_value = (*c_, 1)
                b.inputs['Emission Strength'].default_value = 2.2 if name == 'screen' else 6
            if name in ('visor', 'decalColor', 'screen', 'decal'): continue
            sp = N.new('ShaderNodeSeparateColor'); L.new(mi.outputs[0], sp.inputs[0])
            col = paint.get(name, PREVIEW[name])
            base = N.new('ShaderNodeRGB'); base.outputs[0].default_value = (*col, 1)
            # wear: edge mask reveals bare steel on painted regions
            wr = N.new('ShaderNodeMapRange'); wr.inputs['From Min'].default_value = 0.45; wr.inputs['From Max'].default_value = 0.8; L.new(sp.outputs['Green'], wr.inputs['Value'])
            mixw = N.new('ShaderNodeMix'); mixw.data_type = 'RGBA'; L.new(wr.outputs[0], mixw.inputs['Factor']); L.new(base.outputs[0], mixw.inputs[6]); mixw.inputs[7].default_value = (0.42, 0.42, 0.43, 1)
            gm = N.new('ShaderNodeMix'); gm.data_type = 'RGBA'; gm.blend_type = 'MULTIPLY'; L.new(sp.outputs['Blue'], gm.inputs['Factor']); L.new(mixw.outputs[2], gm.inputs[6]); gm.inputs[7].default_value = (0.25, 0.2, 0.15, 1)
            am = N.new('ShaderNodeMix'); am.data_type = 'RGBA'; am.blend_type = 'MULTIPLY'; am.inputs['Factor'].default_value = 1.0; L.new(gm.outputs[2], am.inputs[6]); L.new(sp.outputs['Red'], am.inputs[7])
            L.new(am.outputs[2], b.inputs['Base Color'])
            if name not in ('chrome', 'glass', 'rubber'):
                L.new(wr.outputs[0], b.inputs['Metallic'])
                rr = N.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = 0.45; rr.inputs['To Max'].default_value = 0.85; L.new(sp.outputs['Blue'], rr.inputs['Value']); L.new(rr.outputs[0], b.inputs['Roughness'])
        h = self.sk['height']
        camd = bpy.data.cameras.new('C'); camd.lens = 70; cam_o = bpy.data.objects.new('C', camd); sc.collection.objects.link(cam_o)
        ang, el = cam; dist = h * 2.25
        cam_o.location = (math.sin(ang) * dist, -math.cos(ang) * dist, h * 0.55 + dist * math.sin(el + 0.12))
        tgt = Vector((0, 0, h * 0.52)); cam_o.rotation_euler = (tgt - cam_o.location).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam_o
        if 'K' not in bpy.data.objects:
            for nm_, loc, e, col in (('K', (2.5, -3, 4), 900, (1, 0.95, 0.9)), ('F', (-3.5, -2, 2.5), 300, (0.75, 0.85, 1)), ('R', (0, 4, 3.5), 900, (1, 0.6, 0.35))):
                ld = bpy.data.lights.new(nm_, 'AREA'); ld.energy = e; ld.size = 2.5; ld.color = col; lo = bpy.data.objects.new(nm_, ld); lo.location = loc
                lo.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); sc.collection.objects.link(lo)
            fl = bpy.data.meshes.new('floor'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=8); bm.to_mesh(fl); bm.free()
            fo = bpy.data.objects.new('floor', fl); sc.collection.objects.link(fo); fm = bpy.data.materials.new('floorm'); fm.use_nodes = True
            fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.18, 0.18, 0.19, 1); fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.35; fl.materials.append(fm)
            sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.06, 0.065, 0.075, 1)
        sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
        sc.render.resolution_x, sc.render.resolution_y = res; sc.render.film_transparent = False
        sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'Medium High Contrast'
        sc.render.filepath = path; bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam_o)
        self.unpose()

    def write_meta(self, out_dir, slots, extra=None):
        import addons as A
        meta = {'addons_used': dict(A.USED), 'type': self.type, 'pistons': self.pistons, 'tris': {f'{s}:{o}': t for (s, o), t in self.tris.items()}, 'slots': slots}
        if extra: meta.update(extra)
        json.dump(meta, open(os.path.join(out_dir, 'kit.json'), 'w'), indent=1)
