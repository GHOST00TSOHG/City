import { sanitizeLook, type RobotLook } from './model';
import { TYPES, TYPE_KEYS, SLOT_KEYS, defaultSlots, type RobotType, type Slot } from './types';

/** Garage: colour regions shown, with labels. Keys match RobotLook. */
const COLOURS: [keyof RobotLook, string][] = [
  ['shell', 'Armour'], ['torso', 'Trim'], ['backpack', 'Accent'], ['shorts', 'Detail'], ['joints', 'Frame'], ['visor', 'Energy'], ['decalColor', 'Crest / glow'],
];
const PALETTE = ['#eceae4', '#2b2e33', '#5a606b', '#d7263d', '#f07a22', '#ffd23f', '#3fa34d', '#3df2ff', '#2f6fdb', '#7b4bd6', '#f28dc2', '#ff3df2'];
const SLOT_LABEL: Record<Slot, string> = { helmet: 'Helmet', arms: 'Arms', bionics: 'Bionics', legs: 'Legs', thrusters: 'Thrusters', boots: 'Rocket boots' };
/** Paint presets (shared across types). "Factory" = the selected type's own default paint. */
export const PRESETS: [string, Partial<RobotLook> | null][] = [
  ['Factory', null],
  ['Ki Burst', { shell: '#f07a22', torso: '#2f6fdb', backpack: '#2b2e33', shorts: '#ffd23f', joints: '#2b2e33', visor: '#ffd23f', decalColor: '#ffd23f' }],
  ['Night Oni', { shell: '#2b2e33', torso: '#7b4bd6', backpack: '#d7263d', shorts: '#d7263d', joints: '#5a606b', visor: '#ff3df2', decalColor: '#d7263d' }],
  ['Vanguard', { shell: '#eceae4', torso: '#2f6fdb', backpack: '#d7263d', shorts: '#ffd23f', joints: '#2b2e33', visor: '#3df2ff', decalColor: '#ffd23f' }],
];

/**
 * Garage / customise screen. Opens every time the player enters the world, loaded with the saved build, so
 * "Enter world" is one click. Type cards swap the body (each type keeps its own slot build; paint is shared);
 * slot buttons are rebuilt per type. Changes apply live via `apply` / `applyType`. Repair resets battle damage.
 */
export function createCustomizer(initType: RobotType, initial: RobotLook, damage: () => number, apply: (l: RobotLook) => void,
  applyType: (t: RobotType) => RobotLook, onEnter: () => void, onRepair: () => void) {
  let type = initType, look = { ...initial };
  const el = document.createElement('div'); el.id = 'hangar'; el.hidden = true;
  el.innerHTML = `<div class="panel"><h2>Garage</h2><p class="sub">Build your mech. Saved automatically.</p>
<div class="types">${TYPE_KEYS.map((t) => `<button data-t="${t}" title="${TYPES[t].blurb}"><b>${TYPES[t].label}</b><small>${TYPES[t].blurb}</small></button>`).join('')}</div>
<div class="presets">${PRESETS.map(([n], i) => `<button data-p="${i}">${n}</button>`).join('')}<button data-rand>Random</button></div>
<div class="slots"></div>
<div class="cols">${COLOURS.map(([k, label]) => `<div class="col" data-k="${k}"><label>${label}<input type="color" aria-label="${label} colour"></label><div class="sw">${PALETTE.map((c) => `<i data-c="${c}" style="background:${c}" title="${c}"></i>`).join('')}</div></div>`).join('')}</div>
<div class="dmg"><label>Battle damage <b>0%</b></label><i><u></u></i><button data-repair>Repair</button></div>
</div><div class="go"><button class="drop">Enter world</button><span>Enter to drop in · drag to turn · B for the garage in game</span></div>`;
  document.body.appendChild(el);
  const slotsEl = el.querySelector('.slots') as HTMLElement;
  const buildSlots = () => {
    const d = TYPES[type];
    slotsEl.innerHTML = SLOT_KEYS.map((k) => `<div class="grp"><label>${SLOT_LABEL[k]}</label><div class="opts" data-k="${k}">${d.slots[k].map((o) => `<button data-v="${o}">${d.names[`${k}.${o}`] ?? d.names[o] ?? o}</button>`).join('')}</div></div>`).join('');
    for (const [k, label] of COLOURS) {
      const l = el.querySelector(`.col[data-k="${k}"] label`)!, t = (d.colourLabels as Record<string, string> | undefined)?.[k] ?? label;
      l.firstChild!.textContent = t; l.querySelector('input')!.setAttribute('aria-label', `${t} colour`);
    }
  };
  const dmgLabel = el.querySelector('.dmg b') as HTMLElement, dmgBar = el.querySelector('.dmg u') as HTMLElement, repairBtn = el.querySelector('[data-repair]') as HTMLButtonElement;
  const sync = () => {
    el.querySelectorAll<HTMLButtonElement>('.types button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === type)));
    el.querySelectorAll<HTMLElement>('.opts').forEach((g) => g.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(look[g.dataset.k as keyof RobotLook] === b.dataset.v))));
    el.querySelectorAll<HTMLElement>('.col').forEach((c) => {
      const v = look[c.dataset.k as keyof RobotLook]; (c.querySelector('input') as HTMLInputElement).value = v;
      c.querySelectorAll<HTMLElement>('i').forEach((i) => i.classList.toggle('on', i.dataset.c === v));
    });
  };
  const set = (l: Partial<RobotLook>) => { look = sanitizeLook({ ...look, ...l }, type); apply(look); sync(); };
  const setType = (t: RobotType) => { if (t === type || !TYPES[t]) return; type = t; buildSlots(); look = sanitizeLook(applyType(t), t); sync(); };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button, .sw i') as HTMLElement | null; if (!t) return;
    if (t.dataset.t) setType(t.dataset.t as RobotType);
    else if (t.matches('.opts button')) set({ [(t.parentElement as HTMLElement).dataset.k!]: t.dataset.v } as Partial<RobotLook>);
    else if (t.matches('.sw i')) set({ [(t.closest('.col') as HTMLElement).dataset.k!]: t.dataset.c } as Partial<RobotLook>);
    else if (t.dataset.p) set(PRESETS[+t.dataset.p][1] ?? TYPES[type].paint);
    else if (t.hasAttribute('data-rand')) set({ ...Object.fromEntries(COLOURS.map(([k]) => [k, pick(PALETTE)])), ...Object.fromEntries(SLOT_KEYS.map((k) => [k, pick(TYPES[type].slots[k])])) } as Partial<RobotLook>);
    else if (t.hasAttribute('data-repair')) onRepair();
    else if (t.matches('.drop')) onEnter();
  });
  el.addEventListener('input', (e) => { const t = e.target as HTMLInputElement; if (t.type === 'color') set({ [(t.closest('.col') as HTMLElement).dataset.k!]: t.value } as Partial<RobotLook>); });
  addEventListener('keydown', (e) => { if (!el.hidden && e.code === 'Enter' && !(e.target as HTMLElement).matches?.('button')) { e.preventDefault(); onEnter(); } });
  buildSlots(); sync();
  return {
    get open() { return !el.hidden; }, get look() { return look; }, get type() { return type; },
    setOpen(v: boolean) { el.hidden = !v; if (v) (el.querySelector('.drop') as HTMLElement).focus({ preventScroll: true }); },
    /** Refresh the damage meter (called a few times a second while open). */
    tick() { const d = damage(); dmgLabel.textContent = `${Math.round(d * 100)}%`; dmgBar.style.width = `${d * 100}%`; repairBtn.disabled = d < 0.005; },
    set, setType, defaults: defaultSlots,
  };
}
