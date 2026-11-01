"""
Optional Hard Ops / Boxcutter / MESHmachine layer for the robot kit.

The add-ons are licensed to Luis and live ONLY in the box's Blender user dir (~/.config/blender/4.2/scripts/addons);
they are never copied into this repo, dist or anything public. Only the exported GLBs are committed.
Their operators need a real window (GPU draw handlers), so robot_types.py runs Blender under a virtual display:
    xvfb-run -a blender -noaudio -P tools/blender/robot_types.py -- scout
In `blender -b` (or if an add-on is missing) every call here returns False and kit.py falls back to plain bmesh
bevels / insets, so the pipeline still builds, just with softer detail. USED counts what really ran (written to kit.json).
"""
import bpy, bmesh, importlib, addon_utils
from collections import Counter

USED = Counter()

def available(name):
    if bpy.app.background: return False
    try: return addon_utils.check(name)[1]
    except Exception: return False

def _ctx():
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
    return dict(window=win, area=area, region=next(r for r in area.regions if r.type == 'WINDOW'))

def _select(objs, active):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active

def hops_boolean(target, cutter, mode='difference'):
    """Hard Ops boolean (difference / inset / union / knife) with `cutter`, then apply + delete the cutter."""
    if not available('HOps'): return False
    pre = cutter.name.split('.')[0]
    _select([target, cutter], target)
    with bpy.context.temp_override(**_ctx()):
        try: r = getattr(bpy.ops.hops, 'bool_' + mode)()
        except Exception as e: print('hops bool failed', e); return False
    if 'FINISHED' not in r: return False
    _apply_all(target)
    for o in list(bpy.data.objects):
        if o != target and o.name.startswith(pre): bpy.data.objects.remove(o)
    USED['HOps bool_' + mode] += 1; return True

def hops_bevel(target, width=0.006, segments=2, angle=30):
    """Hard Ops bevel modifier (angle-limited, harden normals), tuned and applied."""
    if not available('HOps'): return False
    _select([target], target); n = len(target.modifiers)
    with bpy.context.temp_override(**_ctx()):
        try: bpy.ops.hops.add_mod_bevel()
        except Exception: pass  # HOps finishes its modal tail with an error in a scripted context; the modifier is in place
    mods = [m for m in target.modifiers if m.type == 'BEVEL']
    if len(target.modifiers) == n or not mods: return False
    import math
    m = mods[-1]; m.width = width; m.segments = segments; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle); m.harden_normals = True
    m.use_clamp_overlap = True; m.miter_outer = 'MITER_ARC'
    USED['HOps add_mod_bevel'] += 1; return True

def hops_weighted_normal(target):
    if not available('HOps'): return False
    _select([target], target)
    with bpy.context.temp_override(**_ctx()):
        try: r = bpy.ops.hops.mod_weighted_normal()
        except Exception as e: return False
    USED['HOps mod_weighted_normal'] += 1; return True

def _apply_all(o):
    _select([o], o)
    for m in list(o.modifiers):
        if m.type == 'NODES': o.modifiers.remove(m); continue  # HOps' smooth-by-angle node: we set sharp edges ourselves
        try: bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e: print('apply failed', m.name, e); o.modifiers.remove(m)

def apply_all(o): _apply_all(o)

_fuse_patched = False
def mm_fuse_loop(obj, edge_pred, width=0.02, segments=5, tension=0.7):
    """MESHmachine Fuse: chamfer the edge loop picked by edge_pred(edge) then let Fuse turn the chamfer into a proper fillet."""
    global _fuse_patched
    if not available('MESHmachine'): return False
    if not _fuse_patched:
        F = importlib.import_module('MESHmachine.operators.fuse').Fuse  # attrs Fuse normally sets up in invoke()
        F.init = True; F.decalmachine = False; F.hypercursor = False; F.loops = []; F.handles = []; F.matindex = 0
        _fuse_patched = True
    _select([obj], obj)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    edges = [e for e in bm.edges if edge_pred(e)]
    if not edges: bm.free(); return False
    r = bmesh.ops.bevel(bm, geom=edges, offset=width, segments=1, affect='EDGES', clamp_overlap=True)
    for f in bm.faces: f.select = False
    for v in bm.verts: v.select = False
    for e in bm.edges: e.select = False
    for f in r['faces']: f.select = True
    bm.select_flush(True); bm.to_mesh(obj.data); bm.free()
    bpy.ops.object.mode_set(mode='EDIT')
    ok = False
    with bpy.context.temp_override(**_ctx()):
        try:
            importlib.import_module('MESHmachine.operators.fuse').Fuse.init = True
            ok = 'FINISHED' in bpy.ops.machin3.fuse(segments=segments, tension=tension)
        except Exception as e: print('fuse failed', e)
    bpy.ops.object.mode_set(mode='OBJECT')
    if ok: USED['MESHmachine fuse'] += 1
    return ok

# ---------------------------------------------------------------- Boxcutter (driven through its real modal operator)
# Boxcutter has no scriptable cut API: bc.shape_draw is a modal tool fed by mouse events. Under xvfb with
# `blender --enable-event-simulate` we frame the target in an ortho view, invoke bc.shape_draw and feed it a
# simulated drag (press -> drag -> release -> extrude nudge -> click). Boxcutter builds its own cutter + boolean;
# we then set the cut depth on its cutter, apply, and delete the cutter. Generators: each `yield` returns to the event loop.
from bpy_extras import view3d_utils
from mathutils import Vector

def bc_available():
    return available('Boxcutter') and getattr(bpy.app, 'use_event_simulate', False)

def _view():
    win = bpy.context.window_manager.windows[0]
    area = max((a for a in win.screen.areas if a.type == 'VIEW_3D'), key=lambda a: a.width * a.height)
    return win, area, next(r for r in area.regions if r.type == 'WINDOW')

VIEWS = {'F': ('FRONT', 1, -1), 'B': ('BACK', 1, 1), 'R': ('RIGHT', 0, 1), 'L': ('LEFT', 0, -1)}

def bc_cut(obj, others, face, u, v, w, h, depth=0.005, shape='BOX', tol=0.012):
    """One Boxcutter CUT on `obj` from `face` (F/B/R/L) at normalized bbox (u, v), size w x h metres. Yields delays."""
    win, area, reg = _view(); vname, ai, sg = VIEWS[face]
    bb = [Vector(c) for c in obj.bound_box]; mn = Vector([min(p[i] for p in bb) for i in range(3)]); mx = Vector([max(p[i] for p in bb) for i in range(3)])
    ua = 0 if ai == 1 else 1  # screen-horizontal world axis: x for F/B, y for R/L
    def wp(du, dv):
        p = Vector((0, 0, 0)); p[ua] = mn[ua] + (mx[ua] - mn[ua]) * u + du; p[2] = mn[2] + (mx[2] - mn[2]) * v + dv
        p[ai] = (mx[ai] if sg > 0 else mn[ai]) + sg * 0.05; return p
    d = Vector((0, 0, 0)); d[ai] = -sg
    hits = [obj.ray_cast(wp(du, dv), d) for du, dv in ((0, 0), (-w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2), (w / 2, -h / 2))]
    if not all(hh[0] for hh in hits): print('BCSKIP miss', obj.name, face, u, v, flush=True); return
    s = hits[0][1][ai]
    if any(abs(hh[1][ai] - s) > tol for hh in hits): print('BCSKIP curved', obj.name, face, u, v, flush=True); return  # keep cuts on flat-ish plates
    s = min((hh[1][ai] for hh in hits), key=lambda q: q * sg)  # deepest corner, so a cut on a curved plate still bites everywhere
    for o in others: o.hide_set(True)
    obj.hide_set(False); _select([obj], obj)
    with bpy.context.temp_override(window=win, area=area, region=reg):
        bpy.ops.view3d.view_axis(type=vname); bpy.ops.view3d.view_selected()
        if bpy.context.workspace.tools.from_space_view3d_mode('OBJECT').idname != 'Boxcutter': bpy.ops.bc.tool_activate(swap_tools=False)
        getattr(bpy.ops.bc, 'circle' if shape == 'CIRCLE' else 'box')()
    yield 0.05
    r3 = area.spaces.active.region_3d
    def px(p): q = view3d_utils.location_3d_to_region_2d(reg, r3, p); return int(q.x + reg.x), int(q.y + reg.y)
    if shape == 'CIRCLE': a, b = px(wp(0, 0)), px(wp(w / 2, 0))
    else: a, b = px(wp(-w / 2, -h / 2)), px(wp(w / 2, h / 2))
    win.event_simulate('MOUSEMOVE', 'NOTHING', x=a[0], y=a[1]); yield 0.03
    with bpy.context.temp_override(window=win, area=area, region=reg):
        if 'RUNNING_MODAL' not in bpy.ops.bc.shape_draw('INVOKE_DEFAULT'): 
            for o in others: o.hide_set(False)
            return
    for ev in (('MOUSEMOVE', 'NOTHING', ((a[0] + b[0]) // 2, (a[1] + b[1]) // 2)), ('MOUSEMOVE', 'NOTHING', b), ('LEFTMOUSE', 'RELEASE', b),
               ('MOUSEMOVE', 'NOTHING', (b[0] + 4, b[1] + 4)), ('LEFTMOUSE', 'PRESS', b), ('LEFTMOUSE', 'RELEASE', b)):
        win.event_simulate(ev[0], ev[1], x=ev[2][0], y=ev[2][1]); yield 0.03
    for _ in range(20):
        if not bpy.context.scene.bc.running: break
        yield 0.05
    mods = [m for m in obj.modifiers if m.type == 'BOOLEAN' and m.object]
    ok = False
    if mods:
        cut = mods[-1].object; me = cut.data; M = cut.matrix_world; Mi = M.inverted()
        cos = [M @ vv.co for vv in me.vertices]; order = sorted(range(len(cos)), key=lambda i: cos[i][ai] * sg)
        half = len(order) // 2
        for k, i in enumerate(order):
            c = cos[i]; c[ai] = s + sg * (0.03 if k >= half else -depth); me.vertices[i].co = Mi @ c
        before = len(obj.data.polygons)
        for m in list(obj.modifiers):
            if m.type == 'NODES': obj.modifiers.remove(m)
        _apply_all(obj); ok = len(obj.data.polygons) != before
    for o in list(bpy.data.objects):
        if o is not obj and o not in others and (o.name.startswith('Cutter') or o.name.startswith('_bc') or o.name.startswith('Lattice') or o.name.startswith('Plane')):
            bpy.data.objects.remove(o)
    for o in others: o.hide_set(False)
    print('BCCUT', obj.name, face, u, v, shape, ok, flush=True)
    if ok: USED['Boxcutter ' + ('circle' if shape == 'CIRCLE' else 'box') + ' cut'] += 1

def bc_cleanup():
    for c in list(bpy.data.collections):
        if c.name.startswith('Cutters') and not c.objects: bpy.data.collections.remove(c)
