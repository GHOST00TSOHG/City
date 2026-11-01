"""Heavy and Worker builders (game frame, bone space). Imported by robot_types.py."""
from kit import *
L = 'Left'

def spikes(c, n, r, h, region='shorts', axis='y'):
    return [cyl((c[0] + (i - (n - 1) / 2) * r * 2.2, c[1], c[2]), r, h, region, n=4, r2=0.002, axis=axis) for i in range(n)]

# ================================================================ HEAVY (~2.6 m, barrel torso, hydraulics)
def heavy(k):
    k.add('body', 'base', 'Hips', [
        box((0, 0.0, 0), (0.46, 0.18, 0.32), 'joints', bev=0.012),
        hull([(-0.12, 0.05, 0.17), (0.12, 0.05, 0.17), (-0.08, -0.2, 0.19), (0.08, -0.2, 0.19), (-0.12, 0.05, 0.1), (0.12, 0.05, 0.1), (0, -0.26, 0.12)], 'backpack', bev=0.01),
        box((0, -0.06, 0.205), (0.08, 0.05, 0.012), 'shorts', bev=0.004, seg=1), decal((0, 0.0, 0.196), (0.07, 0.07), (3, 0)),
        box((0, 0.02, -0.17), (0.34, 0.14, 0.06), 'shell', bev=0.012),
        box((0.13, 0.0, 0.165), (0.07, 0.012, 0.01), 'visor', bev=0, seg=1, rot=(0, 0, 0.3)), box((-0.13, 0.0, 0.165), (0.07, 0.012, 0.01), 'visor', bev=0, seg=1, rot=(0, 0, -0.3))])
    k.add('body', 'base', 'Hips', [hull([(0.2, 0.06, -0.14), (0.2, 0.06, 0.15), (0.3, -0.24, -0.13), (0.3, -0.24, 0.17), (0.25, 0.06, -0.14), (0.25, 0.06, 0.15), (0.34, -0.22, -0.13), (0.34, -0.22, 0.17)], 'torso', bev=0.012),
                                   slats((0.338, -0.12, 0.02), 0.14, 0.1, 3, axis='x', depth=0.01, region='shorts')], mirror=True)
    k.add('body', 'base', 'Spine', [
        cyl((0, 0.05, 0), 0.17, 0.06, 'joints', n=16), cyl((0, 0.1, 0), 0.155, 0.012, 'visor', n=16, bev=0), cyl((0, 0.14, 0), 0.17, 0.06, 'joints', n=16),
        box((0, 0.42, 0.0), (0.84, 0.5, 0.56), 'shell', taperb=(0.62, 0.72), taper=(1, 0.9), bev=0.04, seg=3),
        hull([(-0.22, 0.62, 0.3), (0.22, 0.62, 0.3), (-0.32, 0.42, 0.32), (0.32, 0.42, 0.32), (-0.18, 0.2, 0.25), (0.18, 0.2, 0.25), (-0.22, 0.62, 0.2), (0.22, 0.62, 0.2), (-0.3, 0.42, 0.2), (0.3, 0.42, 0.2), (0, 0.18, 0.2)], 'torso', bev=0.014),
        cyl((0, 0.42, 0.33), 0.085, 0.03, 'joints', axis='z', n=8), cyl((0, 0.42, 0.345), 0.062, 0.016, 'visor', axis='z', n=8, bev=0.004),
        ring((0, 0.42, 0.34), 0.1, 0.012, 0.02, 'chrome', n=24, axis='z'),
        slats((0.16, 0.3, 0.27), 0.1, 0.08, 3, depth=0.01, region='shorts'), slats((-0.16, 0.3, 0.27), 0.1, 0.08, 3, depth=0.01, region='shorts'),
        box((0, 0.66, 0.0), (0.44, 0.06, 0.4), 'joints', bev=0.012),
        hull([(-0.24, 0.66, 0.2), (0.24, 0.66, 0.2), (-0.2, 0.8, 0.14), (0.2, 0.8, 0.14), (-0.24, 0.66, -0.2), (0.24, 0.66, -0.2), (-0.2, 0.84, -0.14), (0.2, 0.84, -0.14), (-0.14, 0.72, 0.2), (0.14, 0.72, 0.2)], 'shell', bev=0.014),
        box((0, 0.4, -0.3), (0.5, 0.42, 0.1), 'backpack', bev=0.02, taper=(0.9, 1)), slats((0, 0.35, -0.352), 0.36, 0.2, 6, depth=0.014),
        decal((0, 0.53, -0.3505), (0.18, 0.09), (2, 0), axis='-z'), decal((0.31, 0.47, 0.18), (0.11, 0.11), (2, 1), axis='x', rot=0),
    ])
    k.add('body', 'base', 'Spine', [box((0.33, 0.47, 0.0), (0.12, 0.24, 0.36), 'shell', bev=0.02, taper=(0.85, 0.9)), cyl((0.27, 0.6, 0.12), 0.03, 0.12, 'chrome', axis='x', n=10),
                                    tube([(0.18, 0.18, 0.2), (0.27, 0.25, 0.22), (0.31, 0.38, 0.2)], 0.014)], mirror=True)
    k.add('body', 'base', L + 'Arm', [sphere((0, 0, 0), 0.1, 'joints', n=14), cyl((0, -0.2, 0), 0.07, 0.3, 'joints', n=12), cyl((0, -0.2, 0), 0.075, 0.03, 'chrome', n=12),
                                      box((0.02, -0.21, 0.0), (0.17, 0.2, 0.18), 'shell', bev=0.024, taper=(0.9, 0.9))], mirror=True)
    k.add('body', 'base', L + 'ForeArm', [cyl((0, 0, 0), 0.08, 0.15, 'joints', axis='x', n=14), cyl((0, 0, 0), 0.088, 0.04, 'chrome', axis='x', n=14),
                                          box((0, -0.5, 0.0), (0.13, 0.12, 0.15), 'joints', bev=0.014)] +
          [box((0, -0.59, z), (0.06, 0.1, 0.032), 'rubber', bev=0.008, rot=(-0.1 * i, 0, 0)) for i, z in enumerate((0.05, 0.0, -0.05))] + [box((-0.07, -0.53, 0.06), (0.03, 0.08, 0.032), 'rubber', bev=0.008, rot=(0.4, 0, 0.3))], mirror=True)
    k.add('body', 'base', L + 'UpLeg', [cyl((0, -0.02, 0), 0.08, 0.12, 'joints', axis='x', n=14)], mirror=True)
    k.add('body', 'base', L + 'Leg', [cyl((0, 0, 0), 0.085, 0.2, 'joints', axis='x', n=16), cyl((0, 0, 0), 0.095, 0.05, 'chrome', axis='x', n=16)], mirror=True)
    k.add('body', 'base', L + 'Foot', [cyl((0, 0, 0), 0.07, 0.17, 'joints', axis='x', n=14)], mirror=True)

    # helmet: head sunk into the collar
    k.add('helmet', 'dome', 'Head', [sphere((0, 0.1, 0), 0.17, 'shell', n=16, sy=0.85), box((0, 0.05, 0.1), (0.24, 0.08, 0.12), 'joints', bev=0.014),
                                     box((0, 0.065, 0.16), (0.2, 0.035, 0.012), 'visor', bev=0.003, seg=1), *spikes((0, 0.26, -0.02), 3, 0.022, 0.12),
                                     box((0, 0.24, 0.02), (0.06, 0.06, 0.24), 'backpack', bev=0.012, taper=(0.5, 1))])
    k.add('helmet', 'dome', 'Head', [hull([(0.14, 0.1, 0.05), (0.15, 0.06, -0.05), (0.32, 0.3, -0.12), (0.3, 0.33, -0.1), (0.14, 0.16, 0.0)], 'shorts', bev=0.004)], mirror=True)
    k.add('helmet', 'slit', 'Head', [box((0, 0.1, 0), (0.3, 0.2, 0.3), 'shell', bev=0.03, seg=2, taper=(0.8, 0.85)), box((0, 0.12, 0.15), (0.26, 0.03, 0.012), 'visor', bev=0.003, seg=1),
                                     wedge((0, 0.03, 0.15), (0.26, 0.08, 0.06), 'torso', front=0.35), box((0, 0.22, 0), (0.04, 0.06, 0.32), 'shorts', bev=0.006, taper=(0.6, 1))])
    k.add('helmet', 'slit', 'Head', [cyl((0.16, 0.1, 0), 0.06, 0.04, 'joints', axis='x', n=12), hull([(0.17, 0.16, 0.05), (0.17, 0.12, -0.05), (0.26, 0.36, -0.08), (0.24, 0.37, -0.06)], 'shorts', bev=0.003)], mirror=True)
    k.add('helmet', 'periscope', 'Head', [box((0, 0.09, 0), (0.28, 0.18, 0.28), 'joints', bev=0.024), box((0, 0.1, 0.14), (0.2, 0.08, 0.02), 'glass', bev=0.006),
                                          box((0.08, 0.32, -0.04), (0.06, 0.3, 0.06), 'shell', bev=0.01), box((0.08, 0.45, 0.02), (0.07, 0.07, 0.14), 'shell', bev=0.01),
                                          cyl((0.08, 0.45, 0.095), 0.025, 0.012, 'visor', axis='z', n=10), crest_v(0.2, 0.15)])
    # arms: big pauldrons + siege forearms
    def drum(): return [cyl((0.08, 0.04, 0), 0.19, 0.2, 'shell', axis='x', n=20, bev=0.02), cyl((0.19, 0.04, 0), 0.15, 0.02, 'torso', axis='x', n=20),
                        hull([(0.05, 0.2, -0.08), (0.12, 0.21, 0.06), (0.15, 0.2, -0.1), (0.2, 0.42, -0.2), (0.17, 0.42, -0.22)], 'shorts', bev=0.004),
                        decal((0.2005, 0.04, 0), (0.15, 0.15), (3, 1), axis='x')]
    k.add('arms', 'piledriver', L + 'Arm', drum(), mirror=True)
    k.add('arms', 'piledriver', L + 'ForeArm', [box((0, -0.22, 0), (0.2, 0.36, 0.2), 'shell', bev=0.024, taper=(0.9, 0.9)), cyl((0.0, -0.25, 0.12), 0.05, 0.3, 'joints', n=12),
                                                cyl((0.0, -0.44, 0.12), 0.03, 0.12, 'chrome', n=10), cyl((0, -0.52, 0.12), 0.05, 0.05, 'backpack', n=12), box((0.105, -0.22, 0), (0.012, 0.2, 0.12), 'torso', bev=0.004),
                                                box((0.112, -0.22, 0), (0.006, 0.12, 0.02), 'visor', bev=0.002, seg=1)], mirror=True)
    k.add('arms', 'shield', L + 'Arm', drum(), mirror=True)
    k.add('arms', 'shield', L + 'ForeArm', [box((0, -0.22, 0), (0.18, 0.34, 0.18), 'shell', bev=0.02), hull([(0.13, 0.05, -0.2), (0.13, 0.05, 0.22), (0.16, -0.5, -0.18), (0.16, -0.5, 0.2), (0.17, -0.62, 0.0), (0.18, 0.05, -0.2), (0.18, 0.05, 0.22), (0.2, -0.5, -0.18), (0.2, -0.5, 0.2)], 'torso', bev=0.012),
                                            decal((0.2005, -0.25, 0), (0.18, 0.18), (2, 2), axis='x'), box((0.202, -0.08, 0), (0.008, 0.04, 0.3), 'shorts', bev=0.003, seg=1)], mirror=True)
    k.add('arms', 'gatling', L + 'Arm', drum(), mirror=True)
    k.add('arms', 'gatling', L + 'ForeArm', [box((0, -0.18, 0), (0.18, 0.3, 0.18), 'shell', bev=0.02), cyl((0.0, -0.36, 0.0), 0.1, 0.08, 'joints', n=16)] +
          [cyl((0.055 * math.cos(a), -0.52, 0.055 * math.sin(a)), 0.02, 0.3, 'chrome', n=8) for a in [i * math.pi / 3 for i in range(6)]] + [ring((0, -0.62, 0), 0.08, 0.012, 0.03, 'backpack', n=16, axis='y')], mirror=True)
    # bionics
    k.add('bionics', 'reactor', 'Spine', [cyl((0, 0.45, -0.38), 0.13, 0.32, 'joints', n=16), cyl((0, 0.45, -0.38), 0.115, 0.26, 'visor', n=16, bev=0)] + [ring((0, y, -0.38), 0.135, 0.012, 0.02, 'chrome', n=20, axis='y') for y in (0.36, 0.45, 0.54)])
    k.add('bionics', 'plate', 'Spine', [hull([(-0.3, 0.68, 0.32), (0.3, 0.68, 0.32), (-0.36, 0.5, 0.36), (0.36, 0.5, 0.36), (-0.3, 0.68, 0.26), (0.3, 0.68, 0.26), (-0.36, 0.5, 0.3), (0.36, 0.5, 0.3)], 'backpack', bev=0.012),
                                        decal((0.2, 0.6, 0.355), (0.1, 0.1), (1, 1), rot=-0.25)])
    k.add('bionics', 'missiles', 'Spine', [box((0.3, 0.76, -0.2), (0.2, 0.16, 0.26), 'shell', bev=0.016), box((0.3, 0.76, -0.06), (0.17, 0.13, 0.012), 'joints', bev=0.003)] +
          [cyl((0.3 + dx, 0.76 + dy, -0.055), 0.022, 0.012, 'backpack', axis='z', n=8) for dx in (-0.05, 0, 0.05) for dy in (-0.03, 0.03)], mirror=True)
    # legs
    def thigh(region='shell'): return [box((0, -0.25, 0.02), (0.24, 0.42, 0.26), region, bev=0.028, taperb=(0.8, 0.85)), box((0, -0.22, 0.15), (0.14, 0.24, 0.02), 'torso', bev=0.006),
                                       slats((0, -0.22, 0.162), 0.1, 0.12, 3, depth=0.008, region='shorts')]
    k.add('legs', 'piston', L + 'UpLeg', thigh(), mirror=True)
    k.add('legs', 'piston', L + 'Leg', [box((0, -0.3, 0.0), (0.24, 0.42, 0.26), 'shell', bev=0.028, taper=(1.1, 1)), hull([(-0.1, 0.06, 0.16), (0.1, 0.06, 0.16), (0, 0.2, 0.2), (-0.12, -0.1, 0.15), (0.12, -0.1, 0.15), (0, 0.0, 0.08)], 'torso', bev=0.01),
                                        box((0, -0.3, 0.14), (0.17, 0.27, 0.02), 'joints', bev=0.006), decal((0, -0.3, 0.1505), (0.15, 0.24), (1, 0)), decal((0.1225, -0.3, 0), (0.12, 0.12), (1, 0), axis='x')], mirror=True)
    k.add_piston('legs', 'piston', L + 'UpLeg', (0.0, -0.12, -0.16), L + 'Leg', (0.0, -0.28, -0.15), r=0.04)
    k.add('legs', 'reverse', L + 'UpLeg', thigh(), mirror=True)
    k.add('legs', 'reverse', L + 'Leg', [box((0, -0.25, -0.08), (0.2, 0.42, 0.2), 'shell', bev=0.022, rot=(0.3, 0, 0)), cyl((0, -0.45, -0.15), 0.07, 0.2, 'joints', axis='x', n=14),
                                         hull([(-0.08, 0.05, 0.13), (0.08, 0.05, 0.13), (0, 0.2, 0.17), (-0.09, -0.12, 0.08), (0.09, -0.12, 0.08)], 'shorts', bev=0.008)], mirror=True)
    k.add_piston('legs', 'reverse', L + 'UpLeg', (0.0, -0.1, 0.15), L + 'Leg', (0.0, -0.3, 0.05), r=0.035)
    k.add('legs', 'armored', L + 'UpLeg', thigh('torso'), mirror=True)
    k.add('legs', 'armored', L + 'Leg', [box((0, -0.28, 0.02), (0.28, 0.5, 0.3), 'shell', bev=0.03, taperb=(1.15, 1.1)), hull([(-0.13, 0.08, 0.18), (0.13, 0.08, 0.18), (0, 0.28, 0.24), (-0.14, -0.15, 0.18), (0.14, -0.15, 0.18), (0, 0.0, 0.1)], 'backpack', bev=0.01),
                                         slats((0.142, -0.3, 0), 0.16, 0.2, 4, axis='x', depth=0.012)], mirror=True)
    # thrusters
    k.add('thrusters', 'booster', 'Spine', [box((0, 0.45, -0.42), (0.4, 0.4, 0.16), 'joints', bev=0.02)] + [cyl((x, 0.2, -0.44), 0.08, 0.16, 'backpack', n=16, r2=0.1) for x in (-0.12, 0.12)] +
          [cyl((x, 0.1, -0.44), 0.06, 0.04, 'chrome', n=16, r2=0.09) for x in (-0.12, 0.12)])
    k.add('thrusters', 'cans', 'Spine', [cyl((0.24, 0.45, -0.42), 0.09, 0.44, 'shell', n=16), cyl((0.24, 0.2, -0.42), 0.07, 0.06, 'chrome', n=16, r2=0.09), ring((0.24, 0.6, -0.42), 0.095, 0.01, 0.03, 'torso', n=16, axis='y')], mirror=True)
    k.add('thrusters', 'vectored', 'Spine', [box((0, 0.5, -0.4), (0.3, 0.3, 0.12), 'joints', bev=0.016), hull([(0.1, 0.6, -0.38), (0.1, 0.3, -0.38), (0.5, 0.8, -0.5), (0.48, 0.66, -0.52), (0.1, 0.6, -0.44)], 'torso', bev=0.006),
                                             cyl((0.24, 0.3, -0.47), 0.06, 0.14, 'backpack', n=12, r2=0.08, rot=(0.3, 0, 0))], mirror=True)
    # boots
    k.add('boots', 'tank', L + 'Foot', [box((0, -0.07, 0.06), (0.3, 0.14, 0.44), 'joints', bev=0.03, seg=2), box((0, -0.13, 0.06), (0.32, 0.04, 0.46), 'rubber', bev=0.015),
                                        hull([(-0.14, -0.02, 0.2), (0.14, -0.02, 0.2), (-0.15, -0.12, 0.3), (0.15, -0.12, 0.3), (-0.14, 0.03, 0.05), (0.14, 0.03, 0.05)], 'backpack', bev=0.012)] +
          [cyl((0.16, -0.1, z), 0.04, 0.03, 'chrome', axis='x', n=10) for z in (-0.1, 0.06, 0.22)], mirror=True)
    k.add('boots', 'claw', L + 'Foot', [box((0, -0.05, 0.0), (0.22, 0.12, 0.24), 'shell', bev=0.025)] +
          [hull([(x - 0.03, -0.06, 0.1), (x + 0.03, -0.06, 0.1), (x - 0.03, -0.14, 0.1), (x + 0.03, -0.14, 0.1), (x, -0.15, 0.34)], 'chrome', bev=0.004) for x in (-0.08, 0, 0.08)] +
          [hull([(-0.03, -0.06, -0.1), (0.03, -0.06, -0.1), (-0.03, -0.14, -0.1), (0.03, -0.14, -0.1), (0, -0.15, -0.26)], 'chrome', bev=0.004)], mirror=True)
    k.add('boots', 'stomper', L + 'Foot', [cyl((0, -0.08, 0.04), 0.2, 0.16, 'shell', n=20, bev=0.02), cyl((0, -0.15, 0.04), 0.21, 0.03, 'rubber', n=20),
                                           box((0, -0.03, 0.2), (0.16, 0.1, 0.06), 'backpack', bev=0.014), decal((0, -0.06, 0.2405), (0.1, 0.05), (1, 0))], mirror=True)
    k.screens = {}

def crest_v(y, z):
    return [hull([(0, y - 0.01, z + 0.02), (0.015, y + 0.02, z), (-0.015, y + 0.02, z), (s * 0.22, y + 0.22, z - 0.06), (s * 0.2, y + 0.24, z - 0.07), (0, y + 0.05, z - 0.02)], 'shorts', bev=0.003) for s in (1, -1)]

# ================================================================ WORKER (~2.4 m, lanky, exposed frame, tool arm)
def worker(k):
    k.add('body', 'base', 'Hips', [box((0, 0, 0), (0.3, 0.12, 0.2), 'joints', bev=0.01), box((0, -0.05, 0.11), (0.16, 0.12, 0.03), 'shell', bev=0.008, taperb=(0.6, 1)),
                                   decal((0, -0.05, 0.1255), (0.08, 0.04), (1, 0)), cyl((0, -0.02, 0), 0.03, 0.34, 'chrome', axis='x', n=8)])
    k.add('body', 'base', 'Spine', [
        cyl((0, 0.06, 0), 0.03, 0.14, 'chrome', n=8), tube([(0.05, 0.0, -0.03), (0.07, 0.08, -0.02), (0.06, 0.16, -0.03)], 0.012), tube([(-0.05, 0.0, -0.03), (-0.07, 0.08, -0.02), (-0.06, 0.16, -0.03)], 0.012),
        box((0, 0.36, 0.0), (0.46, 0.4, 0.3), 'shell', taperb=(0.6, 0.75), bev=0.02, seg=2),
        box((0, 0.36, 0.152), (0.3, 0.22, 0.012), 'torso', bev=0.004), decal((0, 0.38, 0.1595), (0.26, 0.13), (1, 0)), decal((0.13, 0.25, 0.155), (0.07, 0.07), (3, 0)),
        box((0, 0.12, 0.0), (0.2, 0.1, 0.2), 'joints', bev=0.008), slats((0, 0.12, 0.1), 0.15, 0.06, 3, depth=0.008, region='visor'),
        box((0, 0.58, 0.0), (0.56, 0.06, 0.24), 'joints', bev=0.01), cyl((0, 0.65, 0.02), 0.04, 0.12, 'chrome', n=10),
        box((0, 0.36, -0.2), (0.3, 0.32, 0.1), 'backpack', bev=0.014), decal((0, 0.42, -0.2505), (0.14, 0.07), (0, 3), axis='-z'),
        box((0.2, 0.47, 0.155), (0.04, 0.02, 0.012), 'shorts', bev=0.003, seg=1)])
    k.add('body', 'base', 'Spine', [box((0.22, 0.42, 0.0), (0.04, 0.3, 0.26), 'joints', bev=0.006), tube([(0.12, 0.2, 0.12), (0.2, 0.25, 0.14), (0.25, 0.45, 0.1)], 0.01)], mirror=True)
    k.add('body', 'base', L + 'Arm', [sphere((0, 0, 0), 0.06, 'joints', n=12), cyl((0, -0.2, 0), 0.025, 0.36, 'chrome', n=8), cyl((0, -0.2, 0.04), 0.012, 0.3, 'joints', n=6),
                                      box((0.0, -0.1, 0), (0.08, 0.12, 0.08), 'shell', bev=0.012)], mirror=True)
    k.add('body', 'base', L + 'ForeArm', [cyl((0, 0, 0), 0.045, 0.08, 'joints', axis='x', n=12), box((0, -0.5, 0), (0.07, 0.1, 0.09), 'joints', bev=0.01),
                                          box((0, -0.57, 0.02), (0.045, 0.08, 0.02), 'rubber', bev=0.006), box((0, -0.57, -0.02), (0.045, 0.08, 0.02), 'rubber', bev=0.006)], mirror=True)
    k.add('body', 'base', L + 'UpLeg', [cyl((0, -0.03, 0), 0.05, 0.1, 'joints', axis='x', n=12)], mirror=True)
    k.add('body', 'base', L + 'Leg', [cyl((0, 0, 0), 0.05, 0.12, 'joints', axis='x', n=14), cyl((0.035, -0.3, 0), 0.016, 0.58, 'chrome', n=8), cyl((-0.035, -0.3, 0), 0.016, 0.58, 'chrome', n=8),
                                      tube([(0, -0.05, -0.04), (0, -0.3, -0.05), (0, -0.55, -0.03)], 0.012), box((0, -0.3, 0), (0.1, 0.03, 0.06), 'joints', bev=0.006)], mirror=True)
    k.add('body', 'base', L + 'Foot', [cyl((0, 0, 0), 0.042, 0.1, 'joints', axis='x', n=12)], mirror=True)
    # helmets
    k.add('helmet', 'boxcam', 'Head', [box((0, 0.1, 0), (0.22, 0.18, 0.22), 'shell', bev=0.016), cyl((0, 0.1, 0.13), 0.06, 0.06, 'joints', axis='z', n=16), cyl((0, 0.1, 0.165), 0.045, 0.012, 'glass', axis='z', n=16),
                                       ring((0, 0.1, 0.165), 0.05, 0.008, 0.01, 'visor', n=16), box((0, 0.21, 0), (0.12, 0.04, 0.16), 'torso', bev=0.008), decal((0.1105, 0.1, 0), (0.08, 0.08), (3, 0), axis='x'),
                                       cyl((0.08, 0.3, -0.06), 0.005, 0.2, 'chrome', n=6), sphere((0.08, 0.4, -0.06), 0.012, 'visor', n=8)])
    k.add('helmet', 'welder', 'Head', [box((0, 0.1, -0.02), (0.24, 0.22, 0.22), 'joints', bev=0.02), hull([(-0.13, 0.22, 0.1), (0.13, 0.22, 0.1), (-0.14, -0.02, 0.12), (0.14, -0.02, 0.12), (-0.12, 0.22, 0.16), (0.12, 0.22, 0.16), (-0.12, 0.0, 0.18), (0.12, 0.0, 0.18)], 'torso', bev=0.012),
                                       box((0, 0.13, 0.172), (0.16, 0.04, 0.012), 'visor', bev=0.003, seg=1), crest_v(0.23, 0.08)])
    k.add('helmet', 'lamp', 'Head', [box((0, 0.08, 0), (0.2, 0.16, 0.2), 'shell', bev=0.014), cyl((0, 0.22, 0.04), 0.07, 0.1, 'torso', axis='z', n=16, r2=0.08), cyl((0, 0.22, 0.095), 0.06, 0.01, 'screen', axis='z', n=16),
                                     box((0.035, 0.08, 0.105), (0.08, 0.025, 0.01), 'visor', bev=0.002, seg=1, rot=(0, 0, -0.5)), box((-0.035, 0.08, 0.105), (0.08, 0.025, 0.01), 'visor', bev=0.002, seg=1, rot=(0, 0, 0.5))])
    # arms (tool on left only, right gets a plain pauldron)
    sh = lambda: [hull([(0, 0.08, -0.09), (0, 0.08, 0.1), (0.12, 0.05, -0.1), (0.12, 0.05, 0.11), (0.14, -0.08, -0.09), (0.14, -0.08, 0.1)], 'shell', bev=0.012), hull([(0.05, 0.07, -0.03), (0.1, 0.06, 0.03), (0.1, 0.06, -0.06), (0.16, 0.24, -0.1), (0.14, 0.25, -0.11)], 'shorts', bev=0.003), decal((0.1, 0.0, 0.1), (0.06, 0.06), (1, 0))]
    k.add('arms', 'claw', L + 'Arm', sh(), mirror=True)
    k.add('arms', 'claw', L + 'ForeArm', [box((0, -0.2, 0), (0.2, 0.36, 0.22), 'torso', bev=0.022), slats((0.101, -0.2, 0), 0.16, 0.2, 4, axis='x'), box((0, -0.4, 0), (0.16, 0.04, 0.16), 'joints')] +
          [hull([(x - 0.02, -0.4, -0.02), (x + 0.02, -0.4, -0.02), (x - 0.02, -0.4, 0.02), (x + 0.02, -0.4, 0.02), (x * 1.6, -0.55, 0.0), (x * 1.3, -0.62, 0.0)], 'chrome', bev=0.004) for x in (-0.05, 0.05)])
    k.add('arms', 'claw', 'RightForeArm', [box((0, -0.24, 0), (0.1, 0.44, 0.1), 'shell', bev=0.014, taper=(0.85, 0.85)), box((0.052, -0.24, 0), (0.008, 0.2, 0.05), 'torso', bev=0.002, seg=1)])
    k.add('arms', 'drill', L + 'Arm', sh(), mirror=True)
    k.add('arms', 'drill', L + 'ForeArm', [cyl((0, -0.2, 0), 0.11, 0.34, 'torso', n=16), ring((0, -0.1, 0), 0.115, 0.012, 0.03, 'shorts', n=16, axis='y'), cyl((0, -0.4, 0), 0.08, 0.06, 'joints', n=16),
                                           cyl((0, -0.56, 0), 0.07, 0.28, 'chrome', n=12, r2=0.004)])
    k.add('arms', 'drill', 'RightForeArm', [box((0, -0.24, 0), (0.1, 0.44, 0.1), 'shell', bev=0.014, taper=(0.85, 0.85)), box((0.052, -0.24, 0), (0.008, 0.2, 0.05), 'torso', bev=0.002, seg=1)])
    k.add('arms', 'welder', L + 'Arm', sh(), mirror=True)
    k.add('arms', 'welder', L + 'ForeArm', [box((0, -0.2, 0), (0.16, 0.32, 0.16), 'shell', bev=0.018), cyl((0.0, -0.42, 0.05), 0.02, 0.18, 'chrome', n=8), cyl((0, -0.52, 0.05), 0.014, 0.03, 'visor', n=8),
                                            cyl((0.09, -0.2, 0), 0.04, 0.2, 'backpack', n=12), decal((0, -0.2, 0.081), (0.08, 0.08), (3, 0))])
    k.add('arms', 'welder', 'RightForeArm', [box((0, -0.24, 0), (0.1, 0.44, 0.1), 'shell', bev=0.014, taper=(0.85, 0.85)), box((0.052, -0.24, 0), (0.008, 0.2, 0.05), 'torso', bev=0.002, seg=1)])
    # bionics
    k.add('bionics', 'tanks', 'Spine', [cyl((0.09, 0.4, -0.3), 0.065, 0.42, 'backpack', n=14), sphere((0.09, 0.61, -0.3), 0.065, 'backpack', n=14), cyl((0.09, 0.66, -0.3), 0.02, 0.05, 'chrome', n=8),
                                        decal((0.09, 0.4, -0.3655), (0.07, 0.07), (3, 0), axis='-z')], mirror=True)
    k.add('bionics', 'battery', 'Spine', [box((0, 0.42, -0.32), (0.34, 0.3, 0.16), 'torso', bev=0.014), box((0, 0.42, -0.4), (0.24, 0.12, 0.012), 'visor', bev=0.003), decal((0, 0.3, -0.4005), (0.14, 0.07), (1, 0), axis='-z')])
    k.add('bionics', 'reel', 'Spine', [cyl((0, 0.45, -0.32), 0.14, 0.14, 'shorts', axis='z', n=20), cyl((0, 0.45, -0.32), 0.08, 0.15, 'rubber', axis='z', n=20), cyl((0, 0.45, -0.4), 0.03, 0.02, 'chrome', axis='z', n=10)])
    # legs: chunky cylinder thighs over skinny exposed shins
    k.add('legs', 'cans', L + 'UpLeg', [cyl((0, -0.24, 0), 0.11, 0.4, 'shell', n=16), ring((0, -0.12, 0), 0.115, 0.01, 0.03, 'shorts', n=16, axis='y'), ring((0, -0.36, 0), 0.115, 0.01, 0.03, 'shorts', n=16, axis='y'),
                                        decal((0, -0.24, 0.111), (0.08, 0.08), (3, 2))], mirror=True)
    k.add('legs', 'cans', L + 'Leg', [box((0, -0.06, 0.07), (0.1, 0.12, 0.04), 'torso', bev=0.01)], mirror=True)
    k.add('legs', 'strut', L + 'UpLeg', [box((0, -0.24, 0), (0.14, 0.42, 0.16), 'shell', bev=0.016, taperb=(0.7, 0.7)), cyl((0.08, -0.24, 0), 0.02, 0.36, 'chrome', n=8)], mirror=True)
    k.add('legs', 'strut', L + 'Leg', [box((0, -0.2, 0.06), (0.08, 0.3, 0.03), 'shorts', bev=0.006)], mirror=True)
    k.add('legs', 'ribbed', L + 'UpLeg', [cyl((0, -0.24, 0), 0.1, 0.4, 'joints', n=16)] + [ring((0, y, 0), 0.105, 0.012, 0.025, 'shell', n=16, axis='y') for y in (-0.08, -0.16, -0.24, -0.32, -0.4)], mirror=True)
    k.add('legs', 'ribbed', L + 'Leg', [box((0, -0.13, 0.0), (0.12, 0.17, 0.12), 'torso', bev=0.01), decal((0, -0.13, 0.0605), (0.11, 0.16), (1, 0))], mirror=True)
    for h, y in (('boxcam', 0.23), ('welder', 0.24), ('lamp', 0.17)):
        k.add('helmet', h, 'Head', [cyl((0.0 if h != 'lamp' else -0.07, y, -0.05), 0.03, 0.025, 'joints', n=10), cyl((0.0 if h != 'lamp' else -0.07, y + 0.035, -0.05), 0.024, 0.045, 'screen', n=10, r2=0.02)])
    k.add('thrusters', 'stacks', 'Spine', [cyl((0.1, 0.7, -0.24), 0.04, 0.3, 'joints', n=10), cyl((0.1, 0.86, -0.24), 0.05, 0.03, 'chrome', n=10)], mirror=True)
    k.add('thrusters', 'fans', 'Spine', ring((0.2, 0.45, -0.3), 0.1, 0.02, 0.07, 'torso', n=18, axis='z') + [cyl((0.2, 0.45, -0.3), 0.025, 0.05, 'chrome', axis='z', n=8), box((0.2, 0.45, -0.3), (0.18, 0.02, 0.01), 'joints')], mirror=True)
    k.add('thrusters', 'rocket', 'Spine', [cyl((0, 0.5, -0.32), 0.08, 0.4, 'backpack', n=14), sphere((0, 0.7, -0.32), 0.08, 'backpack', n=14), cyl((0, 0.27, -0.32), 0.06, 0.06, 'chrome', n=14, r2=0.08),
                                           decal((0, 0.5, -0.4005), (0.06, 0.12), (0, 2), axis='-z', rot=1.5708)])
    k.add('boots', 'stabilizer', L + 'Foot', [box((0, -0.06, 0.05), (0.16, 0.08, 0.28), 'shell', bev=0.016), box((0, -0.11, 0.05), (0.2, 0.02, 0.34), 'rubber', bev=0.008),
                                              box((0, -0.04, 0.16), (0.1, 0.04, 0.06), 'shorts', bev=0.008)], mirror=True)
    k.add('boots', 'wheels', L + 'Foot', [box((0, -0.04, 0.03), (0.12, 0.06, 0.2), 'joints', bev=0.01)] + [cyl((0.0, -0.08, z), 0.045, 0.1, 'rubber', axis='x', n=14) for z in (-0.06, 0.12)] +
          [cyl((0.0, -0.08, z), 0.025, 0.105, 'shorts', axis='x', n=10) for z in (-0.06, 0.12)], mirror=True)
    k.add('boots', 'clamp', L + 'Foot', [box((0, -0.05, 0.03), (0.14, 0.08, 0.16), 'shell', bev=0.014)] +
          [hull([(x - 0.015, -0.06, 0.1), (x + 0.015, -0.06, 0.1), (x - 0.015, -0.1, 0.1), (x + 0.015, -0.1, 0.1), (x * 1.3, -0.12, 0.26)], 'chrome', bev=0.003) for x in (-0.04, 0.04)], mirror=True)
    k.screens = {'lamp': [0, 0.22, 0.1, 0.12, 0.12]}

SLOTS = {'heavy': {'helmet': ['dome', 'slit', 'periscope'], 'arms': ['piledriver', 'shield', 'gatling'], 'bionics': ['reactor', 'plate', 'missiles'],
                   'legs': ['piston', 'reverse', 'armored'], 'thrusters': ['booster', 'cans', 'vectored'], 'boots': ['tank', 'claw', 'stomper']},
         'worker': {'helmet': ['boxcam', 'welder', 'lamp'], 'arms': ['claw', 'drill', 'welder'], 'bionics': ['tanks', 'battery', 'reel'],
                    'legs': ['cans', 'strut', 'ribbed'], 'thrusters': ['stacks', 'fans', 'rocket'], 'boots': ['stabilizer', 'wheels', 'clamp']}}
FACTORY = {'heavy': {'shell': (0.15, 0.155, 0.16), 'joints': (0.012, 0.013, 0.015), 'torso': (0.85, 0.18, 0.005), 'shorts': (0.95, 0.62, 0.02), 'backpack': (0.12, 0.13, 0.14),
                     'visor': (0.1, 1.0, 0.25), 'decalColor': (0.02, 0.02, 0.02), 'screen': (0.1, 1.0, 0.25)},
           'worker': {'shell': (0.12, 0.15, 0.04), 'joints': (0.02, 0.02, 0.022), 'torso': (0.9, 0.55, 0.0), 'shorts': (0.85, 0.08, 0.01), 'backpack': (0.06, 0.1, 0.13),
                      'visor': (0.05, 0.75, 1.0), 'decalColor': (0.015, 0.015, 0.015), 'screen': (1.0, 0.9, 0.6)}}
