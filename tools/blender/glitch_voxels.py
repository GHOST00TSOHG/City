"""Glitch (cube robot) voxelizer. Plain Python, no Blender needed:  python3 tools/blender/glitch_voxels.py
Shapes are authored per bone in game frame (+Y up, +Z forward, bone space), voxelized to a shell of cubes on a
VOX grid, and written as packed per-part cube lists to public/robot/glitch/cubes.json.
Each cube = [x, y, z, size, colour] with colour 0 = shell (white), 1 = joints (graphite), 2 = visor (glitch glow).
The game draws all cubes as ONE InstancedMesh skinned by bone index on the GPU (src/robot/glitch.ts)."""
import json, math, os, random
VOX = 0.034
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')

def box(c, s):
    return lambda x, y, z: abs(x - c[0]) <= s[0] / 2 and abs(y - c[1]) <= s[1] / 2 and abs(z - c[2]) <= s[2] / 2
def ell(c, r):
    return lambda x, y, z: ((x - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2 + ((z - c[2]) / r[2]) ** 2 <= 1
def cap(a, b, r):
    def f(x, y, z):
        ax, ay, az = b[0] - a[0], b[1] - a[1], b[2] - a[2]; px, py, pz = x - a[0], y - a[1], z - a[2]
        t = max(0, min(1, (px * ax + py * ay + pz * az) / (ax * ax + ay * ay + az * az)))
        return (px - ax * t) ** 2 + (py - ay * t) ** 2 + (pz - az * t) ** 2 <= r * r
    return f
def union(*fs): return lambda x, y, z: any(f(x, y, z) for f in fs)

def voxelize(shape, lo, hi, colour=0, shell=True, glow=None, seed=1, vox=VOX, seam=None):
    rnd = random.Random(seed); out = []
    n = [int(math.ceil((hi[i] - lo[i]) / vox)) + 1 for i in range(3)]
    def P(i, j, k): return (lo[0] + i * vox, lo[1] + j * vox, lo[2] + k * vox)
    for i in range(n[0]):
        for j in range(n[1]):
            for k in range(n[2]):
                p = P(i, j, k)
                if not shape(*p): continue
                if shell and all(shape(*P(i + a, j + b, k + c)) for a, b, c in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))): continue
                col = colour
                if glow and glow(*p): col = 2
                elif colour == 0 and (j % 5 == 2 or (seam and seam(*p))) and rnd.random() < 0.85: col = 1   # graphite panel lines (paint-over r1: structured seams, not speckle)
                s = vox * (0.92 if col != 1 else rnd.choice((0.8, 0.92)))
                out.append([round(p[0], 4), round(p[1], 4), round(p[2], 4), round(s, 4), col])
    return out

PARTS = []
def stripe(cubes, axis):
    # paint-over r1: one glowing cube line along the outer face (axis 0 = +x side for arms, 2 = +z front for legs)
    rows = {}
    for c in cubes:
        if c[4] != 0: continue
        key = round(c[1], 3); best = rows.get(key)
        o = 2 if axis == 0 else 0
        if abs(c[o]) < VOX * 0.6 and (best is None or c[axis] > best[axis]): rows[key] = c
    for c in rows.values(): c[4] = 2
    return cubes
def add(slot, opt, bone, cubes, mirror=False):
    if slot == 'arms' and 'Fore' in bone: cubes = stripe(cubes, 0)
    if slot == 'legs': cubes = stripe(cubes, 2)
    PARTS.append({'slot': slot, 'opt': opt, 'bone': bone, 'cubes': cubes})
    if mirror: PARTS.append({'slot': slot, 'opt': opt, 'bone': bone.replace('Left', 'Right'), 'cubes': [[-c[0]] + c[1:] for c in cubes]})

def bb(c, s, pad=0.05): return [c[i] - s[i] / 2 - pad for i in range(3)], [c[i] + s[i] / 2 + pad for i in range(3)]

L = 'Left'
# body core: dark graphite frame (solid, small cubes) + white shell
add('body', 'base', 'Hips', voxelize(union(box((0, 0, 0), (0.3, 0.16, 0.2)), ell((0, -0.06, 0.04), (0.12, 0.1, 0.1))), (-0.25, -0.2, -0.16), (0.25, 0.12, 0.2), 0, seed=2))
add('body', 'base', 'Spine', voxelize(union(ell((0, 0.32, 0.0), (0.24, 0.24, 0.16)), box((0, 0.1, 0), (0.18, 0.16, 0.14)), box((0, 0.46, 0), (0.44, 0.08, 0.2))), (-0.3, -0.02, -0.22), (0.3, 0.56, 0.22), 0,
                                      glow=box((0, 0.32, 0.16), (0.12, 0.12, 0.06)), seam=lambda x, y, z: abs(abs(x) - 0.1) < 0.018 and y > 0.2, seed=3))
add('body', 'base', 'Spine', voxelize(cap((0, 0.48, 0), (0, 0.56, 0), 0.05), (-0.08, 0.42, -0.08), (0.08, 0.62, 0.08), 1, shell=False, vox=0.03, seed=4))
add('body', 'base', L + 'Arm', voxelize(cap((0, 0, 0), (0, -0.28, 0), 0.06), (-0.1, -0.36, -0.1), (0.1, 0.08, 0.1), 0, seed=5), mirror=True)
add('body', 'base', L + 'ForeArm', voxelize(union(cap((0, 0, 0), (0, -0.24, 0), 0.05), box((0, -0.3, 0), (0.08, 0.1, 0.1))), (-0.1, -0.38, -0.1), (0.1, 0.08, 0.1), 0, glow=box((0.05, -0.14, 0), (0.03, 0.2, 0.025)), seed=6), mirror=True)
add('body', 'base', L + 'UpLeg', voxelize(cap((0, -0.02, 0), (0, -0.42, 0), 0.075), (-0.12, -0.5, -0.12), (0.12, 0.08, 0.12), 0, seed=7), mirror=True)
add('body', 'base', L + 'Leg', voxelize(cap((0, 0, 0), (0, -0.4, 0), 0.06), (-0.1, -0.48, -0.1), (0.1, 0.08, 0.1), 0, glow=box((0.025, -0.22, 0.05), (0.025, 0.3, 0.04)), seam=lambda x, y, z: abs(y + 0.04) < 0.02, seed=8), mirror=True)
# helmet
add('helmet', 'smooth', 'Head', voxelize(ell((0, 0.13, 0.01), (0.12, 0.15, 0.13)), (-0.17, -0.06, -0.16), (0.17, 0.32, 0.18), 0, glow=box((0, 0.15, 0.12), (0.18, 0.04, 0.06)), seed=9))
add('helmet', 'skull', 'Head', voxelize(union(box((0, 0.13, 0), (0.22, 0.24, 0.22)), box((0, 0.3, -0.03), (0.06, 0.12, 0.2))), (-0.16, -0.02, -0.16), (0.16, 0.4, 0.16), 0,
                                         glow=union(box((0.06, 0.15, 0.11), (0.05, 0.04, 0.04)), box((-0.06, 0.15, 0.11), (0.05, 0.04, 0.04))), seed=10))
halo = [[round(0.2 * math.cos(a), 4), 0.38, round(0.2 * math.sin(a) - 0.03, 4), 0.034, 2] for a in [i * math.pi / 14 for i in range(28)]]
add('helmet', 'halo', 'Head', voxelize(ell((0, 0.13, 0.01), (0.12, 0.14, 0.13)), (-0.17, -0.06, -0.16), (0.17, 0.32, 0.18), 0, glow=box((0, 0.15, 0.12), (0.2, 0.025, 0.06)), seed=11) + halo)
# arms
add('arms', 'block', L + 'Arm', voxelize(box((0.06, -0.04, 0), (0.18, 0.18, 0.2)), (-0.06, -0.16, -0.14), (0.18, 0.08, 0.14), 0, seed=12), mirror=True)
add('arms', 'block', L + 'ForeArm', voxelize(box((0, -0.16, 0), (0.13, 0.22, 0.14)), (-0.1, -0.3, -0.1), (0.1, -0.02, 0.1), 0, seed=13), mirror=True)
add('arms', 'blade', L + 'Arm', voxelize(box((0.06, -0.02, 0), (0.14, 0.12, 0.16)), (-0.06, -0.12, -0.12), (0.16, 0.08, 0.12), 0, seed=14), mirror=True)
add('arms', 'blade', L + 'ForeArm', [[0.06, -0.08 - i * 0.04, 0.0, 0.03, 2 if i > 3 else 1] for i in range(12)], mirror=True)
orb = [[round(0.13 * math.cos(a), 4), round(-0.16 + 0.13 * math.sin(a), 4), 0, 0.03, 2 if i % 3 == 0 else 0] for i, a in enumerate([j * math.pi / 8 for j in range(16)])]
add('arms', 'orbit', L + 'Arm', voxelize(ell((0.04, 0, 0), (0.09, 0.09, 0.09)), (-0.08, -0.12, -0.12), (0.16, 0.12, 0.12), 0, seed=15), mirror=True)
add('arms', 'orbit', L + 'ForeArm', orb, mirror=True)
# bionics (back)
wing = [[round(0.12 + i * 0.05, 4), round(0.44 + i * 0.045 - j * 0.05, 4), -0.2 - i * 0.02, 0.038, 2 if j == 0 else 0] for i in range(7) for j in range(max(1, 5 - i // 2))]
add('bionics', 'wings', 'Spine', wing, mirror=True)
add('bionics', 'ring', 'Spine', [[round(0.24 * math.cos(a), 4), round(0.42 + 0.24 * math.sin(a), 4), -0.24, 0.04, 2 if i % 2 else 1] for i, a in enumerate([j * math.pi / 12 for j in range(24)])])
add('bionics', 'spikes', 'Spine', [[x * 0.08, 0.3 + k * 0.08, -0.18 - h * 0.04, 0.034, 2 if h == 3 else 1] for x in (-1, 0, 1) for k in range(3) for h in range(4)])
# legs
add('legs', 'slim', L + 'Leg', voxelize(box((0, -0.18, 0.05), (0.06, 0.2, 0.04)), (-0.06, -0.3, -0.02), (0.06, -0.06, 0.1), 1, seed=16), mirror=True)
add('legs', 'block', L + 'UpLeg', voxelize(box((0, -0.22, 0), (0.2, 0.28, 0.2)), (-0.14, -0.4, -0.14), (0.14, -0.04, 0.14), 0, seed=17), mirror=True)
add('legs', 'block', L + 'Leg', voxelize(box((0, -0.22, 0.01), (0.16, 0.3, 0.17)), (-0.12, -0.42, -0.12), (0.12, -0.02, 0.12), 0, seed=18), mirror=True)
add('legs', 'digi', L + 'Leg', voxelize(cap((0, -0.12, 0.08), (0, -0.3, -0.08), 0.05), (-0.08, -0.4, -0.16), (0.08, -0.04, 0.16), 0, glow=box((0, -0.12, 0.13), (0.04, 0.05, 0.04)), seed=19), mirror=True)
# thrusters
add('thrusters', 'jets', 'Spine', voxelize(box((0.1, 0.32, -0.2), (0.08, 0.2, 0.08)), (0.0, 0.18, -0.3), (0.2, 0.46, -0.1), 1, seed=20) + [[0.1, 0.18 - i * 0.045, -0.2, 0.03 - i * 0.004, 2] for i in range(4)], mirror=True)
add('thrusters', 'trail', 'Spine', [[round(x * 0.05, 4), round(0.3 - i * 0.05, 4), round(-0.22 - i * 0.03, 4), round(0.04 - i * 0.004, 4), 2 if i > 2 else 0] for x in (-1, 0, 1) for i in range(7)])
add('thrusters', 'ring', 'Spine', [[round(0.16 * math.cos(a), 4), round(0.3 + 0.16 * math.sin(a), 4), -0.28, 0.034, 2] for a in [j * math.pi / 9 for j in range(18)]])
# boots
add('boots', 'block', L + 'Foot', voxelize(box((0, -0.04, 0.05), (0.12, 0.08, 0.26)), (-0.1, -0.12, -0.12), (0.1, 0.04, 0.22), 0, glow=box((0, -0.04, 0.18), (0.13, 0.03, 0.03)), seed=21), mirror=True)
add('boots', 'hover', L + 'Foot', voxelize(ell((0, -0.03, 0.03), (0.08, 0.05, 0.12)), (-0.1, -0.1, -0.12), (0.1, 0.04, 0.18), 0, seed=22) + [[0, -0.1, 0.03, 0.05, 2]], mirror=True)
add('boots', 'spike', L + 'Foot', voxelize(box((0, -0.04, 0.02), (0.1, 0.08, 0.16)), (-0.08, -0.1, -0.1), (0.08, 0.04, 0.12), 0, seed=23) + [[0, -0.06, 0.12 + i * 0.04, 0.03 - i * 0.004, 2 if i == 3 else 1] for i in range(4)], mirror=True)

SLOTS = {'helmet': ['smooth', 'skull', 'halo'], 'arms': ['block', 'blade', 'orbit'], 'bionics': ['wings', 'ring', 'spikes'], 'legs': ['slim', 'block', 'digi'],
         'thrusters': ['jets', 'trail', 'ring'], 'boots': ['block', 'hover', 'spike']}
if __name__ == '__main__':
    total = {}
    for p in PARTS: total[(p['slot'], p['opt'])] = total.get((p['slot'], p['opt']), 0) + len(p['cubes'])
    body = total[('body', 'base')]
    builds = [{s: o[i] for s, o in SLOTS.items()} for i in range(3)]
    for i, b in enumerate(builds): print(f'build {i}: cubes', body + sum(total[(s, o)] for s, o in b.items()), 'tris', 12 * (body + sum(total[(s, o)] for s, o in b.items())))
    out = os.path.join(ROOT, 'public', 'robot', 'glitch', 'cubes.json')
    json.dump({'type': 'glitch', 'vox': VOX, 'slots': SLOTS, 'parts': PARTS}, open(out, 'w'), separators=(',', ':'))
    print('wrote', out, os.path.getsize(out), 'bytes')
