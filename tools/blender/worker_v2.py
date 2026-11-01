"""WORKER v4: combat medic / support mech. Olive armour, gunmetal joints, green heal accents (glow_m -> decalColor):
back-mounted regen core, left forearm injector, right forearm heal emitter, green light strips, subtle green plus / pulse decals.
Sloped/tapered armour plates with paneled insets (plate()), helmet sunk into a raised collar with a red visor slit,
hydraulic pistons at every major joint, clawed feet, sunk helmet with a red visor slit.
Run: blender --enable-event-simulate -noaudio -P worker_v2.py -- [--fast] [--kit] [--preview]"""
import bpy, bmesh, math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix
from scout_v2 import *
import scout_v2 as S, addons as A

V = Vector
OLV = mat('armor_white', (0.05, 0.062, 0.024), 0.68, 0.08, wear=True)     # main olive armour
YEL = mat('armor_blue', (0.036, 0.046, 0.018), 0.7, 0.1, wear=True)       # secondary olive (darker)
ORA = mat('armor_red', (0.03, 0.2, 0.06), 0.5, wear=True)                  # medic green accent ONLY (small)
HEAL = mat('glow_m', (0, 0, 0), 0.3, 0, (0.15, 1.0, 0.3), 14)           # heal glow (decalColor)
GRY = mat('armor_yellow', (0.035, 0.04, 0.047), 0.5, 0.3, wear=True)      # gunmetal sub-frame
FR = mat('frame', (0.035, 0.037, 0.042), 0.5, 0.85)
ST = mat('steel', (0.4, 0.4, 0.41), 0.32, 1.0)
RUB = mat('rubber', (0.012, 0.012, 0.014), 0.85)
LAMP = mat('glow', (0, 0, 0), 0.3, 0, (1.0, 0.12, 0.05), 14)
LENS = mat('screen', (0, 0.01, 0.02), 0.1, 0, (1.0, 0.08, 0.02), 30)
WORKER_SLOTS = {'helmet': ['boxcam', 'welder', 'lamp'], 'arms': ['claw', 'drill', 'welder'], 'bionics': ['tanks', 'battery', 'reel'],
                'legs': ['cans', 'strut', 'ribbed'], 'thrusters': ['stacks', 'fans', 'rocket'], 'boots': ['stabilizer', 'wheels', 'clamp']}

def _R(rx, ry, rz):
    R = Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X')
    return (R.col[0].copy(), R.col[1].copy(), R.col[2].copy())

def plate(name, c, ax, half, m, taper=0.72, slope=0.8, inset=True, bev=0.3, out=None):
    """Tapered, sloped armour plate: thin axis = normal. Narrows along its long axis (taper) and its outer face is
    chamfered (slope), with a gunmetal groove + raised inset panel on the outer face."""
    c = V(c); ax = tuple(V(a) for a in ax)
    o = S._box(name, c, ax, half, m, bev)
    nI, a, b = sorted(range(3), key=lambda i: half[i])
    ref = V(out) if out is not None else c - V((0, 0.03, c.z))
    sg = 1 if ax[nI].dot(ref) >= 0 else -1
    for v in o.data.vertices:
        t = (v.co[b] / half[b] + 1) / 2; k = 1 - (1 - taper) * t
        v.co[a] *= k
        if v.co[nI] * sg > 0: v.co[a] *= slope; v.co[b] *= (0.5 + slope / 2)
    if inset and half[a] > 0.025 and half[b] > 0.03:
        fc = c + ax[nI] * sg * half[nI]
        hg = [0, 0, 0]; hg[nI] = 0.004; hg[a] = half[a] * slope * 0.8; hg[b] = half[b] * (0.5 + slope / 2) * 0.82
        plate(name + '_g', fc + ax[nI] * sg * 0.001, ax, tuple(hg), FR, taper, 1.0, False, 0.2, out=ax[nI] * sg)
        hp = list(hg); hp[nI] = 0.005; hp[a] *= 0.86; hp[b] *= 0.88
        plate(name + '_p', fc + ax[nI] * sg * 0.004, ax, tuple(hp), m, taper, 0.9, False, 0.3, out=ax[nI] * sg)
    return o

def pbox(name, c, half, m, rx=0.0, ry=0.0, rz=0.0, **kw):
    return plate(name, c, _R(rx, ry, rz), half, m, **kw)

def box(name, c, half, m, rx=0.0, ry=0.0, rz=0.0, bev=0.32):
    return S._box(name, V(c), _R(rx, ry, rz), half, m, bev)

def hose(name, pts, r=0.018):
    P = [V(p) for p in pts]; out = []
    for i in range(len(P) - 1):
        a, b = P[i], P[i + 1]
        for t in range(3):
            u0, u1 = t / 3, (t + 1) / 3
            sag = lambda u: V((0, 0, -0.025 * math.sin(math.pi * u)))
            out.append(cyl(f'{name}_{i}{t}', a.lerp(b, u0) + sag(u0), a.lerp(b, u1) + sag(u1), r, RUB, n=10))
    return out

def hazard(name, c, ax, half, n=4):
    """Small hazard accent: alternating accent / black chevrons along local x of frame ax."""
    for i in range(n):
        x = -half[0] + (i + 0.5) * 2 * half[0] / n
        S._box(f'{name}_{i}', V(c) + ax[0] * x, ax, (half[0] / n, half[1], half[2]), ORA if i % 2 == 0 else FR, 0.1)

def plus(name, c, ax, r=0.03, t=0.007):
    """Green plus decal (not a red cross) on frame ax at c."""
    S._box(name + '_h', V(c), ax, (r, 0.003, t), HEAL, 0.1); S._box(name + '_v', V(c), ax, (t, 0.003, r), HEAL, 0.1)

def strip(name, a, b, r=0.006):
    return cyl(name, V(a), V(b), r, HEAL, n=6)

def _frame(a, b):
    d = (b - a).normalized(); x = V((1, 0, 0)); x = (x - d * x.dot(d)).normalized(); y = d.cross(x).normalized()
    return x, y, d

def hyd(name, a, b, r=0.018):
    """Hydraulic actuator: gunmetal barrel, polished rod, clevis lugs at both ends."""
    a, b = V(a), V(b); d = (b - a).normalized(); mid = a.lerp(b, 0.58)
    cyl(name + '_barrel', a, mid, r, GRY, n=14)
    cyl(name + '_collar', mid - d * 0.012, mid + d * 0.006, r * 1.25, FR, n=14)
    cyl(name + '_rod', mid, b, r * 0.5, ST, n=10)
    for p, nm in ((a, 'a'), (b, 'b')):
        side = d.cross(V((0, 0, 1)) if abs(d.z) < 0.9 else V((1, 0, 0))).normalized()
        cyl(f'{name}_lug{nm}', p - side * r * 1.2, p + side * r * 1.2, r * 1.15, FR, n=12)

def claw_foot(side, s, ank):
    """Digitigrade-style clawed foot: armoured ankle block, three forward talons + rear spur, steel tips."""
    joint(f'ankle_{side}', ank, (1, 0, 0), 0.05, 0.11, m=GRY)
    pbox(f'boot_{side}', ank + V((0, -0.03, -0.06)), (0.085, 0.11, 0.05), OLV, rx=0.15, taper=0.75, inset=False, out=(0, 0, 1))
    pbox(f'boot_upper_{side}', ank + V((0, -0.06, -0.015)), (0.07, 0.055, 0.025), YEL, rx=0.35, taper=0.8, inset=False, out=(0, -0.5, 1))
    box(f'sole_{side}', ank + V((0, -0.03, -0.112)), (0.08, 0.1, 0.012), RUB, bev=0.3)
    for i, ox in enumerate((-0.055, 0.0, 0.055)):
        base = ank + V((ox, -0.12, -0.09)); tip = base + V((ox * 0.5, -0.13, -0.035))
        x, y, d = _frame(base, tip)
        plate(f'toe_{side}{i}', base.lerp(tip, 0.45), (x, y, d), (0.026, 0.02, (tip - base).length * 0.5), GRY, taper=0.45, slope=0.7, inset=False, out=(0, 0, 1))
        cyl(f'toe_pin_{side}{i}', base - x * 0.03, base + x * 0.03, 0.017, ST, n=10)
        cyl(f'talon_{side}{i}', tip - d * 0.02, tip + d * 0.045 + V((0, 0, -0.02)), 0.014, ST, n=10, r2=0.002)
    sp0 = ank + V((0, 0.08, -0.08)); sp1 = sp0 + V((0, 0.09, -0.045))
    x, y, d = _frame(sp0, sp1)
    plate(f'spur_{side}', sp0.lerp(sp1, 0.5), (x, y, d), (0.03, 0.02, 0.05), GRY, taper=0.4, inset=False, out=(0, 0, 1))
    cyl(f'spur_tip_{side}', sp1, sp1 + d * 0.04 + V((0, 0, -0.015)), 0.013, ST, n=10, r2=0.002)
    hyd(f'ankle_hyd_{side}', ank + V((0.07 * s, 0.05, 0.16)), ank + V((0.07 * s, -0.09, -0.06)), r=0.012)

def arm(s):
    side = 'L' if s > 0 else 'R'; B = 'Left' if s > 0 else 'Right'
    bone(B + 'Arm'); J[B + 'Arm'] = V((0.34 * s, 0.02, 1.64))
    joint(f'shoulder_{side}', V((0.32 * s, 0.02, 1.64)), (1, 0, 0), 0.075, 0.1, m=GRY)
    # layered sloped pauldron: big tapered shell + two lames below, hazard accent on the front edge only
    pbox(f'pauldron_{side}', (0.45 * s, 0.02, 1.79), (0.17, 0.19, 0.06), OLV, rx=0.0, ry=-0.45 * s, rz=0.0, taper=0.8, slope=0.78, out=(0.6 * s, 0, 1))
    for i in range(2):
        pbox(f'pauldron_lame{i}_{side}', (0.53 * s + 0.02 * i * s, 0.02, 1.68 - 0.06 * i), (0.03, 0.15 - 0.02 * i, 0.055), YEL, ry=-0.3 * s, taper=0.85, inset=False, out=(s, 0, 0))
    if s > 0: plus(f'sh_plus_{side}', V((0.47 * s, -0.19, 1.77)), _R(0, -0.45 * s, 0), r=0.028, t=0.007)
    else: hazard(f'hz_sh_{side}', V((0.45 * s, -0.17, 1.765)), _R(0, -0.45 * s, 0), (0.06, 0.006, 0.012), n=4)
    box(f'worklight_{side}', (0.4 * s, -0.12, 1.85), (0.025, 0.02, 0.016), FR, bev=0.2)
    box(f'worklight_lens_{side}', (0.4 * s, -0.141, 1.85), (0.018, 0.002, 0.01), LAMP, bev=0.3)
    sh, el, wr = V((0.43 * s, 0.02, 1.6)), V((0.46 * s, 0.07, 1.24)), V((0.45 * s, -0.04, 0.9))
    cyl(f'upperarm_{side}', sh, el, 0.06, GRY)
    x, y, d = _frame(sh, el)
    plate(f'upperarm_panel_{side}', sh.lerp(el, 0.45) + x * 0.035 * s, (x, y, d), (0.03, 0.08, 0.13), OLV, taper=0.75, out=x * s)
    plate(f'upperarm_front_{side}', sh.lerp(el, 0.45) - y * 0.06, (x, y, d), (0.065, 0.02, 0.12), YEL, taper=0.8, out=-y)
    hyd(f'bicep_hyd_{side}', sh - y * 0.08 + d * 0.06, el - y * 0.075 + d * 0.06, r=0.017)
    bone(B + 'ForeArm'); J[B + 'ForeArm'] = el.copy()
    joint(f'elbow_{side}', el, (1, 0, 0), 0.06, 0.1, m=GRY)
    fa = loft(f'forearm_{side}', [(0, 0, 0, 0.06, 0.06), (0.15, 0, 0, 0.085, 0.08), (0.3, 0, 0, 0.07, 0.065)], GRY, e=6, n=8); place(fa, el, wr)
    x, y, d = _frame(el, wr); fm = el.lerp(wr, 0.5)
    plate(f'forearm_plate_{side}', fm + x * 0.075 * s, (x, y, d), (0.022, 0.085, 0.15), OLV, taper=0.65, out=x * s)
    plate(f'forearm_top_{side}', fm - y * 0.085, (x, y, d), (0.075, 0.022, 0.14), OLV, taper=0.7, out=-y)
    S._box(f'forearm_cuff_{side}', el.lerp(wr, 0.92), (x, y, d), (0.088, 0.088, 0.02), FR, bev=0.2)
    hyd(f'elbow_hyd_{side}', el.lerp(sh, 0.3) + y * 0.08, el.lerp(wr, 0.35) + y * 0.085, r=0.015)
    strip(f'fa_strip_{side}', fm + x * 0.098 * s - d * 0.1, fm + x * 0.098 * s + d * 0.1)
    if s < 0:  # right: heal emitter, gunmetal barrel with a green lens ring
        c0, c1 = el.lerp(wr, 0.3) + V((-0.1, -0.07, 0)), el.lerp(wr, 0.95) + V((-0.11, -0.13, -0.02))
        cyl(f'emitter_body_{side}', c0, c1, 0.032, GRY, n=16)
        for u in (0.3, 0.55): cyl(f'emitter_fin_{u}_{side}', c0.lerp(c1, u), c0.lerp(c1, u + 0.05), 0.042, FR, n=8)
        cyl(f'emitter_ring_{side}', c1, c1 + (c1 - c0).normalized() * 0.02, 0.03, HEAL, n=16)
        cyl(f'emitter_lens_{side}', c1 + (c1 - c0).normalized() * 0.02, c1 + (c1 - c0).normalized() * 0.026, 0.02, ST, n=12)
        hose(f'hose_w_{side}', [el + V((-0.09, 0.06, -0.02)), el.lerp(wr, 0.4) + V((-0.13, 0.0, 0)), c0], 0.009)
    else:  # left: auto-injector, armoured canister with a glowing vial window and a steel needle
        c0, c1 = fm + x * 0.11 - d * 0.1, fm + x * 0.11 + d * 0.12
        cyl(f'inj_body_{side}', c0, c1, 0.03, GRY, n=14)
        for u in (0.0, 1.0): cyl(f'inj_cap_{u}_{side}', c0.lerp(c1, u) - d * 0.012, c0.lerp(c1, u) + d * 0.012, 0.034, FR, n=8)
        cyl(f'inj_vial_{side}', c0.lerp(c1, 0.25) - y * 0.0, c0.lerp(c1, 0.75), 0.032, HEAL, n=14)
        for k in range(4): S._box(f'inj_cage_{k}_{side}', c0.lerp(c1, 0.5) + (x if k % 2 else -y) * (0.033 if k < 2 else -0.033), (x, y, d), (0.005, 0.005, 0.06), FR, bev=0.1)
        cyl(f'inj_needle_{side}', c1, c1 + d * 0.09, 0.006, ST, n=8, r2=0.001)
    slot('arms', 'claw'); box(f'a_claw_{side}', tuple(el.lerp(wr, 0.6) + V((0.1 * s, 0, 0))), (0.02, 0.05, 0.1), ST)
    slot('arms', 'drill'); cyl(f'a_drill_{side}', el.lerp(wr, 0.5) + V((0.09 * s, -0.04, 0)), el.lerp(wr, 0.5) + V((0.09 * s, -0.25, 0)), 0.03, ST, r2=0.004)
    slot('arms', 'welder'); box(f'a_tank_{side}', tuple(el.lerp(wr, 0.4) + V((0.09 * s, 0.05, 0))), (0.03, 0.03, 0.08), GRY)
    slot('body')
    S.build_hand(side, wr, (wr - el).normalized(), fingers=5, size=1.55, curl=0.55, armor_m=OLV, digit_m=GRY, thick=1.2)

def leg(s):
    side = 'L' if s > 0 else 'R'; B = 'Left' if s > 0 else 'Right'
    hip, knee, ank = V((0.15 * s, 0, 0.98)), V((0.2 * s, -0.1, 0.56)), V((0.25 * s, 0.03, 0.17))
    bone(B + 'UpLeg'); J[B + 'UpLeg'], J[B + 'Leg'], J[B + 'Foot'] = hip.copy(), knee.copy(), ank.copy()
    joint(f'hip_{side}', hip, (1, 0, 0), 0.065, 0.11, m=GRY)
    th = loft(f'thigh_{side}', [(0.04, 0, 0, 0.07, 0.07), (0.2, 0, 0, 0.085, 0.085), (0.36, 0, 0, 0.068, 0.068)], GRY, e=6, n=8); place(th, hip, knee)
    x, y, d = _frame(hip, knee); tm = hip.lerp(knee, 0.48)
    plate(f'thigh_front_{side}', tm - y * 0.095, (x, y, d), (0.085, 0.024, 0.16), OLV, taper=0.72, out=-y)
    plate(f'thigh_side_{side}', tm + x * 0.095 * s, (x, y, d), (0.022, 0.07, 0.14), OLV, taper=0.75, out=x * s)
    hyd(f'thigh_hyd_{side}', hip - x * 0.075 * s - y * 0.03 + d * 0.04, knee - x * 0.07 * s - y * 0.03, r=0.016)
    slot('legs', 'cans'); cyl(f'l_can_{side}', hip.lerp(knee, 0.3) + V((0.1 * s, 0.05, 0)), hip.lerp(knee, 0.8) + V((0.1 * s, 0.05, 0)), 0.03, GRY)
    slot('legs', 'strut'); cyl(f'l_strut_{side}', hip + V((0.08 * s, -0.06, -0.05)), knee + V((0.07 * s, -0.06, 0.04)), 0.012, ST)
    slot('legs', 'ribbed')
    for i in range(4): cyl(f'l_rib{i}_{side}', hip.lerp(knee, 0.25 + i * 0.15), hip.lerp(knee, 0.29 + i * 0.15), 0.095, RUB, n=16)
    slot('body')
    bone(B + 'Leg')
    joint(f'knee_{side}', knee, (1, 0, 0), 0.065, 0.12, m=GRY)
    pbox(f'kneepad_{side}', knee + V((0, -0.085, 0.02)), (0.07, 0.025, 0.08), OLV, rx=0.25, taper=0.6, out=(0, -1, 0))
    sh = loft(f'shin_{side}', [(0.04, 0, 0, 0.07, 0.07), (0.2, 0, 0, 0.085, 0.085), (0.36, 0, 0, 0.065, 0.065)], GRY, e=6, n=8); place(sh, knee, ank)
    x, y, d = _frame(knee, ank); sm = knee.lerp(ank, 0.45)
    plate(f'shin_front_{side}', sm - y * 0.095, (x, y, d), (0.09, 0.026, 0.17), OLV, taper=0.6, out=-y)
    plate(f'shin_side_{side}', sm + x * 0.095 * s, (x, y, d), (0.022, 0.07, 0.15), YEL, taper=0.7, out=x * s)
    strip(f'shin_strip_{side}', sm - y * 0.123 - d * 0.1, sm - y * 0.118 + d * 0.1, 0.005)
    plate(f'shin_calf_{side}', sm + y * 0.085, (x, y, d), (0.065, 0.024, 0.13), OLV, taper=0.65, out=y)
    hyd(f'shin_hyd_{side}', knee - x * 0.08 * s + y * 0.04, ank - x * 0.08 * s + y * 0.04 + d * -0.04, r=0.015)
    hose(f'hose_k_{side}', [knee + V((0.08 * s, 0.08, 0.06)), knee.lerp(ank, 0.5) + V((0.1 * s, 0.09, 0)), ank + V((0.08 * s, 0.07, 0.05))], 0.01)
    bone(B + 'Foot')
    claw_foot(side, s, ank)
    slot('boots', 'stabilizer'); box(f'bt_stab_{side}', tuple(ank + V((0.11 * s, -0.02, -0.1))), (0.03, 0.12, 0.02), GRY)
    slot('boots', 'wheels'); cyl(f'bt_wheel_{side}', ank + V((0.1 * s, 0.1, -0.08)), ank + V((0.13 * s, 0.1, -0.08)), 0.05, RUB)
    slot('boots', 'clamp'); box(f'bt_clamp_{side}', tuple(ank + V((0, -0.3, -0.1))), (0.06, 0.03, 0.02), ST, rx=0.4)
    slot('body')

def hook(name, top):
    """Heavy forged crane hook: shank, swivel nut, then a C-curve whose radius tapers to the point."""
    top = V(top)
    cyl(name + '_shank', top, top + V((0, 0, -0.06)), 0.016, ST, n=12)
    cyl(name + '_nut', top + V((0, 0, -0.005)), top + V((0, 0, -0.028)), 0.026, GRY, n=6)
    ctr = top + V((0, 0, -0.115)); R0 = 0.05; prev = None; N = 10
    for i in range(N + 1):
        a = math.radians(90 + 250 * i / N)          # start at top, sweep around the bowl to the tip
        p = ctr + V((0, -R0 * math.cos(a) * 0.95 if False else R0 * math.cos(a), R0 * math.sin(a)))
        p = ctr + V((0, R0 * math.cos(a), R0 * math.sin(a)))
        if prev is not None:
            r = 0.026 * (1 - 0.7 * (i / N)) + 0.004
            cyl(f'{name}_c{i}', prev, p, r, ST, n=12)
            bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=p, segments=12, ring_count=6)
            o = bpy.context.active_object; o.name = f'{name}_k{i}'; o.data.materials.append(ST); S.ALL.append(o)
        prev = p
    # latch
    cyl(name + '_latch', top + V((0, 0, -0.065)), ctr + V((0, R0 * math.cos(math.radians(340)), R0 * math.sin(math.radians(340)))), 0.004, ST, n=6)

def build():
    bone('Hips'); J['Hips'] = V((0, 0, 1.02))
    pbox('pelvis', (0, 0, 1.0), (0.17, 0.13, 0.08), GRY, taper=0.85, inset=False, out=(0, -1, 0))
    pbox('codplate', (0, -0.14, 0.97), (0.09, 0.02, 0.07), OLV, rx=0.15, taper=0.55, rz=0, out=(0, -1, 0))
    for s_ in (1, -1):
        pbox(f'tasset_{s_}', (0.16 * s_, -0.09, 0.96), (0.08, 0.02, 0.085), OLV, rz=0.45 * s_, rx=0.12, taper=0.75, out=(0.5 * s_, -1, 0))
    cyl('belt', V((0, 0, 1.06)), V((0, 0, 1.1)), 0.2, FR, n=28)
    for i, x in enumerate((0.2, -0.2)):
        pbox(f'pouch_{i}', (x, 0.07, 1.0), (0.035, 0.06, 0.055), GRY, taper=0.85, inset=False, out=(x, 0, 0))
    bone('Spine'); J['Spine'] = V((0, 0, 1.14))
    loft('waist', [(1.1, 0, 0, 0.13, 0.1), (1.25, 0, 0, 0.15, 0.11)], GRY, armor=False)
    loft('chest', [(1.2, 0, 0, 0.21, 0.16), (1.4, 0, -0.02, 0.31, 0.2), (1.6, 0, -0.01, 0.35, 0.21), (1.72, 0, 0.01, 0.29, 0.18)], OLV, e=2.6)
    for s_ in (1, -1):  # sloped pectoral plates with paneled insets + raised armoured collar that swallows the helmet
        pbox(f'chest_chevron_{s_}', (0.13 * s_, -0.205, 1.5), (0.13, 0.022, 0.1), OLV, rz=-0.3 * s_, ry=0.35 * s_, rx=-0.15, taper=0.7, out=(0.3 * s_, -1, 0))
        pbox(f'collar_{s_}', (0.16 * s_, -0.02, 1.83), (0.025, 0.15, 0.1), OLV, ry=0.4 * s_, taper=0.8, out=(s_, 0, 0.3))
        pbox(f'abplate_{s_}', (0.08 * s_, -0.17, 1.27), (0.075, 0.02, 0.06), YEL, rx=0.1, taper=0.8, out=(0, -1, 0))
    pbox('collar_front', (0, -0.18, 1.73), (0.15, 0.025, 0.06), YEL, rx=-0.4, taper=0.85, out=(0, -1, 0.4))
    pbox('collar_back', (0, 0.12, 1.86), (0.16, 0.025, 0.1), OLV, rx=0.25, taper=0.8, out=(0, 1, 0.3))
    # pulse line across the right pec + green strips down the chest flanks
    pulse = [(0.05, 1.42), (0.1, 1.42), (0.12, 1.47), (0.145, 1.37), (0.165, 1.42), (0.22, 1.42)]
    for i in range(len(pulse) - 1):
        (x0, z0), (x1, z1) = pulse[i], pulse[i + 1]; strip(f'pulse_{i}', (x0 - 0.12, -0.262, z0 + 0.2), (x1 - 0.12, -0.262, z1 + 0.2), 0.006)
    for s_ in (1, -1): strip(f'chest_strip_{s_}', (0.33 * s_, -0.15, 1.58), (0.24 * s_, -0.17, 1.3), 0.008)
    box('chest_light', (-0.17, -0.2, 1.62), (0.018, 0.01, 0.012), HEAL)
    # back: gunmetal frame
    pbox('backframe', (0, 0.2, 1.48), (0.18, 0.05, 0.2), GRY, taper=0.85, out=(0, 1, 0))
    # back: armoured regen core (replaces the crane)
    pbox('regen_housing', (0, 0.29, 1.5), (0.15, 0.06, 0.2), OLV, taper=0.8, slope=0.85, out=(0, 1, 0))
    cyl('regen_core', V((0, 0.36, 1.33)), V((0, 0.36, 1.67)), 0.045, HEAL, n=16)
    for z in (1.3, 1.7): cyl(f'regen_cap_{z}', V((0, 0.36, z - 0.03)), V((0, 0.36, z + 0.03)), 0.06, GRY, n=16)
    for i in range(4): S._box(f'regen_slat_{i}', V((0, 0.405, 1.37 + i * 0.09)), _R(0, 0, 0), (0.055, 0.008, 0.012), FR, 0.2)
    for s_ in (1, -1):
        pbox(f'regen_fin_{s_}', (0.1 * s_, 0.34, 1.52), (0.02, 0.05, 0.17), GRY, ry=0.25 * s_, taper=0.7, inset=False, out=(s_, 0.5, 0))
        strip(f'regen_strip_{s_}', (0.125 * s_, 0.36, 1.38), (0.125 * s_, 0.36, 1.64))
        hose(f'hose_regen_{s_}', [V((0.06 * s_, 0.37, 1.69)), V((0.15 * s_, 0.3, 1.8)), V((0.3 * s_, 0.1, 1.72))], 0.014)
    plus('regen_plus', (0, 0.355, 1.76), _R(0, 0, 0), r=0.025, t=0.006)
    hose('hose_back', [V((-0.12, 0.25, 1.62)), V((-0.2, 0.18, 1.72)), V((-0.32, 0.05, 1.68))], 0.016)
    slot('bionics', 'tanks')
    for s in (1, -1): cyl(f'b_tank_{s}', V((0.09 * s - 0.03, 0.27, 1.3)), V((0.09 * s - 0.03, 0.27, 1.5)), 0.05, GRY)
    slot('bionics', 'battery'); pbox('b_batt', (-0.05, 0.3, 1.4), (0.12, 0.06, 0.1), OLV, out=(0, 1, 0))
    slot('bionics', 'reel'); cyl('b_reel', V((-0.18, 0.27, 1.42)), V((-0.08, 0.27, 1.42)), 0.09, GRY)
    slot('thrusters', 'stacks')
    for s in (1, -1): cyl(f't_stack_{s}', V((0.12 * s, 0.25, 1.62)), V((0.13 * s, 0.27, 1.92)), 0.03, FR)
    slot('thrusters', 'fans'); cyl('t_fan', V((-0.05, 0.27, 1.65)), V((-0.05, 0.33, 1.65)), 0.11, GRY)
    slot('thrusters', 'rocket'); cyl('t_rocket', V((-0.05, 0.27, 1.3)), V((-0.05, 0.3, 1.0)), 0.06, ST, r2=0.08)
    slot('body')
    # helmet: low armoured wedge sunk between the collar plates; deep brow over a narrow red visor slit
    bone('Head'); J['Head'] = V((0, -0.04, 1.76))
    cyl('neck', V((0, 0, 1.7)), V((0, -0.03, 1.78)), 0.045, FR)
    loft('head', [(1.76, 0, -0.02, 0.1, 0.11), (1.84, 0, -0.03, 0.115, 0.125), (1.9, 0, -0.02, 0.1, 0.11), (1.93, 0, 0.0, 0.06, 0.08)], OLV, e=2.4)
    pbox('head_crest', (0, -0.02, 1.935), (0.025, 0.11, 0.02), GRY, taper=0.6, inset=False, out=(0, 0, 1))
    pbox('brow', (0, -0.14, 1.885), (0.12, 0.03, 0.022), OLV, rx=-0.45, taper=0.9, inset=False, out=(0, -1, 1))
    box('visor_recess', (0, -0.138, 1.845), (0.09, 0.012, 0.016), FR, bev=0.2)
    box('visor_slit', (0, -0.149, 1.845), (0.075, 0.003, 0.0045), LENS, bev=0.2)
    for s_ in (1, -1):
        pbox(f'cheek_{s_}', (0.08 * s_, -0.12, 1.8), (0.045, 0.02, 0.04), YEL, rz=0.5 * s_, rx=0.2, taper=0.6, inset=False, out=(0.5 * s_, -1, 0))
    pbox('jaw', (0, -0.13, 1.785), (0.06, 0.025, 0.03), GRY, rx=0.35, taper=0.6, inset=False, out=(0, -1, -0.3))
    for i in range(3): box(f'jaw_vent_{i}', (-0.025 + i * 0.025, -0.157, 1.785), (0.006, 0.003, 0.014), FR, rx=0.35)
    slot('helmet', 'boxcam'); box('h_cam2', (0.09, -0.08, 1.95), (0.025, 0.035, 0.02), GRY)
    slot('helmet', 'welder'); box('h_mask', (0, -0.16, 1.86), (0.11, 0.008, 0.035), GRY, rx=-0.3)
    slot('helmet', 'lamp'); cyl('h_lamp', V((0, -0.05, 1.94)), V((0, -0.05, 1.99)), 0.03, LAMP)
    slot('body')
    arm(1); arm(-1); leg(1); leg(-1)
    upb = [o for o in S.ALL if not o['bone'].endswith(('UpLeg', 'Leg', 'Foot')) and o['bone'] != 'Hips']
    lean = Matrix.Translation((0, 0, 1.1)) @ Matrix.Rotation(0.03, 4, 'Y') @ Matrix.Rotation(0.15, 4, 'X').inverted() @ Matrix.Translation((0, 0, -1.1))
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
    if '--preview' in S.argv:
        if '--closeup' not in S.argv: S.render(S.OUT.replace('.png', '-34.png'), tgt=(0, 0, 1.1), dist=5.8)
        S.render(S.OUT.replace('.png', '-closeup.png'), cam_az=-2.75, cam_el=0.15, res=(1500, 1200), tgt=(0.0, 0.3, 1.45), dist=2.6, lens=60, setup='--closeup' in S.argv); return
    if '--skel' in S.argv if 'worker' != 'scout' else '--skel' in argv:
        import v2export as X; X.write_skeleton('worker', [o for o in bpy.data.objects if o.type == 'MESH']); return
    yield from addon_pass()
    print('TRIS', sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons), flush=True)
    bpy.ops.wm.save_as_mainfile(filepath='/workspace/private/worker_v2.blend')
    import v2export as X
    X.turnaround('worker', tgt_z=1.1, dist=5.8, slots=WORKER_SLOTS)
    if '--kit' in S.argv: X.export_kit('worker', WORKER_SLOTS, budget=25800)

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
