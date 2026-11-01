"""Preview render of the Glitch cube robot (public/robot/glitch/cubes.json) in rest pose, for the paint-over loop.
blender -b -P tools/blender/glitch_preview.py -- <tag> [helmet=halo ...]"""
import bpy, bmesh, json, os, sys, math
from mathutils import Vector
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
tag = argv[0] if argv else 'g'; over = dict(a.split('=') for a in argv[1:])
data = json.load(open(os.path.join(ROOT, 'public', 'robot', 'glitch', 'cubes.json')))
sk = json.load(open(os.path.join(ROOT, 'src', 'robot', 'skeleton.json')))['glitch']
par = {'Hips': None, 'Spine': 'Hips', 'Head': 'Spine', 'LeftArm': 'Spine', 'LeftForeArm': 'LeftArm', 'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg'}
def world(n):
    L = n.replace('Right', 'Left'); v = Vector()
    while L: v += Vector(sk['bones'][L]); L = par[L]
    if n.startswith('Right'): v.x = -v.x
    return v
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
cols = [((0.9, 0.9, 0.88), 0.25, 0), ((0.03, 0.03, 0.035), 0.5, 0), ((0.45, 0.1, 1.0), 0.3, 1.6)]
mats = []
for i, (c, r, e) in enumerate(cols):
    m = bpy.data.materials.new(f'c{i}'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = r
    if e: b.inputs['Emission Color'].default_value = (*c, 1); b.inputs['Emission Strength'].default_value = e
    mats.append(m)
import random; random.seed(3)
build = {k: v[0] for k, v in data['slots'].items()}; build.update(over)
bm = bmesh.new(); mi = bm.faces.layers.int.new('m') if False else None
me = bpy.data.meshes.new('cubes'); allv = []; allf = []; fm = []
for p in data['parts']:
    if p['slot'] != 'body' and build.get(p['slot']) != p['opt']: continue
    w = world(p['bone'])
    for x, y, z, s, c in p['cubes']:
        ctr = w + Vector((x, y, z)); h = s * 0.47
        # idle drift: a few cubes float off
        if random.random() < 0.02: ctr += Vector((x, y * 0.3, z)).normalized() * random.uniform(0.05, 0.25)
        base = len(allv)
        for dx in (-h, h):
            for dy in (-h, h):
                for dz in (-h, h): allv.append((ctr.x + dx, -(ctr.z + dz), ctr.y + dy))
        for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)): allf.append(tuple(base + i for i in f)); fm.append(c)
me.from_pydata(allv, [], allf)
for m in mats: me.materials.append(m)
for poly, c in zip(me.polygons, fm): poly.material_index = c
ob = bpy.data.objects.new('cubes', me); bpy.context.scene.collection.objects.link(ob)
sc = bpy.context.scene; h = sk['height']
camd = bpy.data.cameras.new('C'); camd.lens = 70; cam = bpy.data.objects.new('C', camd); sc.collection.objects.link(cam)
for i, (ang, el) in enumerate(((0.55, -0.1), (-0.6, 0.0), (2.6, 0.05))):
    dist = h * 2.25; cam.location = (math.sin(ang) * dist, -math.cos(ang) * dist, h * 0.55 + dist * math.sin(el + 0.12))
    cam.rotation_euler = (Vector((0, 0, h * 0.52)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam
    if i == 0:
        for nm, loc, e, col in (('K', (2.5, -3, 4), 250, (1, 0.95, 0.9)), ('F', (-3.5, -2, 2.5), 90, (0.75, 0.85, 1)), ('R', (0, 4, 3.5), 400, (0.7, 0.45, 1))):
            ld = bpy.data.lights.new(nm, 'AREA'); ld.energy = e; ld.size = 2.5; ld.color = col; lo = bpy.data.objects.new(nm, ld); lo.location = loc
            lo.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); sc.collection.objects.link(lo)
        fl = bpy.data.meshes.new('floor'); b2 = bmesh.new(); bmesh.ops.create_grid(b2, x_segments=1, y_segments=1, size=8); b2.to_mesh(fl); fo = bpy.data.objects.new('floor', fl); sc.collection.objects.link(fo)
        if not sc.world: sc.world = bpy.data.worlds.new('W')
        sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.035, 0.08, 1)
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.use_denoising = True; sc.render.resolution_x, sc.render.resolution_y = 720, 960
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'Medium High Contrast'
    sc.render.filepath = f'/workspace/city-shots/types-glitch-{tag}-b{i}.png'; bpy.ops.render.render(write_still=True)
print('GLITCH cubes', len(allf) // 6)
