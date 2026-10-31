import * as THREE from 'three/webgpu';

/** Growable non-indexed triangle soup with flat normals and vertex colours (linear). */
export class Soup {
  p: number[] = []; n: number[] = []; c: number[] = [];
  private static e1 = new THREE.Vector3(); private static e2 = new THREE.Vector3(); private static nn = new THREE.Vector3();
  /** Adds triangle; flips winding so the face normal points along `hint` (or computed normal if no hint). */
  tri(a: number[], b: number[], c: number[], col: THREE.Color, hint?: [number, number, number], shade: [number, number, number] = [1, 1, 1]) {
    const e1 = Soup.e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]), e2 = Soup.e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = Soup.nn.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-10) return;
    n.normalize();
    let s = shade;
    if (hint && n.x * hint[0] + n.y * hint[1] + n.z * hint[2] < 0) { const t = b; b = c; c = t; n.negate(); s = [shade[0], shade[2], shade[1]]; }
    for (const [v, k] of [[a, s[0]], [b, s[1]], [c, s[2]]] as [number[], number][]) {
      this.p.push(v[0], v[1], v[2]); this.n.push(n.x, n.y, n.z); this.c.push(col.r * k, col.g * k, col.b * k);
    }
  }
  quad(a: number[], b: number[], c: number[], d: number[], col: THREE.Color, hint?: [number, number, number], shade?: [number, number, number, number]) {
    const s = shade ?? [1, 1, 1, 1];
    this.tri(a, b, c, col, hint, [s[0], s[1], s[2]]); this.tri(a, c, d, col, hint, [s[0], s[2], s[3]]);
  }
  get empty() { return this.p.length === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

export const ringPts = (r: number[]) => { const out: [number, number][] = []; for (let i = 0; i < r.length; i += 2) out.push([r[i] / 10, r[i + 1] / 10]); return out; };
export const signedArea = (pts: [number, number][]) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

/** Flat horizontal polygon (with holes) at height y, facing up. */
export function flatPoly(s: Soup, outer: [number, number][], holes: [number, number][][], y: number | ((x: number, z: number) => number), col: THREE.Color, down = false) {
  const contour = outer.map(([x, z]) => new THREE.Vector2(x, z)), hs = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  const all = [...contour, ...hs.flat()];
  let idx: number[][];
  try { idx = THREE.ShapeUtils.triangulateShape(contour, hs); } catch { return; }
  const Y = typeof y === 'number' ? () => y : y;
  const hint: [number, number, number] = down ? [0, -1, 0] : [0, 1, 0];
  for (const [i, j, k] of idx) { const a = all[i], b = all[j], c = all[k]; if (!a || !b || !c) continue; s.tri([a.x, Y(a.x, a.y), a.y], [b.x, Y(b.x, b.y), b.y], [c.x, Y(c.x, c.y), c.y], col, hint); }
}
