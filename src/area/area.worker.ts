import { decodeTerrain } from './data';
/** A6 area loader worker: fetch area.json / terrain.bin / ground-mask.bin, parse and blur off the main thread. */
(self as any).onmessage = async (e: MessageEvent) => {
  const { seq, id, base } = e.data;
  try {
    const [area, bin, mask] = await Promise.all([
      fetch(base + 'area.json').then((r) => { if (!r.ok) throw new Error(`area ${id}: ${r.status}`); return r.json(); }),
      fetch(base + 'terrain.bin').then((r) => { if (!r.ok) throw new Error(`terrain ${id}: ${r.status}`); return r.arrayBuffer(); }),
      fetch(base + 'ground-mask.bin').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
    ]);
    const terrain = decodeTerrain(bin);
    const xfer: Transferable[] = [terrain.h.buffer, terrain.cover.buffer]; if (mask) xfer.push(mask);
    (self as any).postMessage({ seq, area, terrain, mask }, xfer);
  } catch (err) { (self as any).postMessage({ seq, error: String((err as Error)?.message ?? err) }); }
};
