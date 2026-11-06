/** Hidden tuning panel: `?dev=1` or the Backtick key. Short slider rows and a Copy JSON button, nothing else. */
export interface Tune { glass: number; window: number; lamp: number; wet: number; fog: number; exposure: number; moon: number; fov: number }
export const TUNE_DEFAULTS: Tune = { glass: 1, window: 1, lamp: 1, wet: 0, fog: 1, exposure: 1, moon: 1, fov: 55 };
const ROWS: { key: keyof Tune; label: string; min: number; max: number; step: number }[] = [
  { key: 'glass', label: 'Glass Reflection', min: 0, max: 3, step: 0.05 },
  { key: 'window', label: 'Window Glow', min: 0, max: 3, step: 0.05 },
  { key: 'lamp', label: 'Lamp Intensity', min: 0, max: 3, step: 0.05 },
  { key: 'wet', label: 'Road Wetness', min: 0, max: 1, step: 0.01 },
  { key: 'fog', label: 'Fog Density', min: 0, max: 4, step: 0.05 },
  { key: 'exposure', label: 'Exposure', min: 0.3, max: 2.5, step: 0.02 },
  { key: 'moon', label: 'Moonlight', min: 0, max: 3, step: 0.05 },
  { key: 'fov', label: 'FOV', min: 30, max: 100, step: 1 },
];

export function createDevPanel(tune: Tune, apply: () => void) {
  const el = document.createElement('div'); el.id = 'devpanel'; el.style.display = 'none';
  el.style.cssText = 'display:none;position:fixed;bottom:34px;right:12px;z-index:50;width:230px;padding:10px 12px;border-radius:10px;background:rgba(8,10,18,.82);backdrop-filter:blur(8px);color:#dfe4f0;font:12px/1.3 Inter,system-ui,sans-serif;gap:6px';
  const inputs = new Map<keyof Tune, HTMLInputElement>();
  for (const r of ROWS) {
    const row = document.createElement('label'); row.style.cssText = 'display:grid;grid-template-columns:1fr 44px;gap:2px 8px;align-items:center';
    const name = document.createElement('span'); name.textContent = r.label;
    const val = document.createElement('span'); val.style.cssText = 'text-align:right;opacity:.7;font-variant-numeric:tabular-nums';
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = String(r.min); inp.max = String(r.max); inp.step = String(r.step); inp.value = String(tune[r.key]); inp.style.cssText = 'grid-column:1/3;width:100%;margin:0';
    const show = () => (val.textContent = (+inp.value).toFixed(r.step < 1 ? 2 : 0));
    inp.addEventListener('input', () => { tune[r.key] = +inp.value; show(); apply(); }); show();
    row.append(name, val, inp); el.append(row); inputs.set(r.key, inp);
  }
  const copy = document.createElement('button'); copy.textContent = 'Copy JSON';
  copy.style.cssText = 'margin-top:4px;padding:6px 8px;border:0;border-radius:6px;background:#2b3a5c;color:#fff;font:inherit;cursor:pointer';
  copy.addEventListener('click', () => { const t = JSON.stringify(tune, null, 2); void navigator.clipboard?.writeText(t).catch(() => {}); copy.textContent = 'Copied'; setTimeout(() => (copy.textContent = 'Copy JSON'), 1200); });
  el.append(copy); document.body.appendChild(el);
  const toggle = (on?: boolean) => { const show = on === undefined ? el.style.display === 'none' : on; el.style.display = show ? 'grid' : 'none'; };
  addEventListener('keydown', (e) => { if (e.code === 'Backquote' && (e.target as HTMLElement)?.tagName !== 'INPUT') toggle(); });
  if (new URLSearchParams(location.search).get('dev') === '1') toggle(true);
  return { el, toggle };
}
