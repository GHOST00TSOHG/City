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
