import { DEFAULT_LOOK, SLOTS, sanitizeLook, type RobotLook, type Slot } from './model';

/** Garage: colour regions shown, with labels. Keys match RobotLook. */
const COLOURS: [keyof RobotLook, string][] = [
  ['shell', 'Armour'], ['torso', 'Trim'], ['backpack', 'Accent'], ['joints', 'Frame'], ['visor', 'Energy'], ['decalColor', 'Crest / glow'],
];
const PALETTE = ['#eceae4', '#2b2e33', '#5a606b', '#d7263d', '#f07a22', '#ffd23f', '#3fa34d', '#3df2ff', '#2f6fdb', '#7b4bd6', '#f28dc2', '#ff3df2'];
const SLOT_LABEL: Record<Slot, string> = { helmet: 'Helmet', arms: 'Arms', bionics: 'Bionics', legs: 'Legs', thrusters: 'Thrusters', boots: 'Rocket boots' };
const NAMES: Record<string, string> = { kai: 'Kai V-fin', saiyan: 'Flare crest', oni: 'Oni horns', strike: 'Strike', brawler: 'Brawler', blade: 'Blade', core: 'Reactor core',
  aegis: 'Aegis shields', cannon: 'Shoulder cannon', sprint: 'Sprint', heavy: 'Heavy', spike: 'Spike', twin: 'Twin bells', wing: 'Wing binder', halo: 'Halo ring',
  jet: 'Jet', talon: 'Talon', tank: 'Tank' };
export const PRESETS: [string, Partial<RobotLook>][] = [
  ['Vanguard', { ...DEFAULT_LOOK }],
  ['Ki Burst', { shell: '#f07a22', torso: '#2f6fdb', backpack: '#2b2e33', joints: '#2b2e33', visor: '#ffd23f', decalColor: '#ffd23f', helmet: 'saiyan', arms: 'brawler', bionics: 'core', legs: 'heavy', thrusters: 'halo', boots: 'tank' }],
  ['Night Oni', { shell: '#2b2e33', torso: '#7b4bd6', backpack: '#d7263d', joints: '#5a606b', visor: '#ff3df2', decalColor: '#d7263d', helmet: 'oni', arms: 'blade', bionics: 'aegis', legs: 'spike', thrusters: 'wing', boots: 'talon' }],
  ['Artillery', { shell: '#3fa34d', torso: '#eceae4', backpack: '#ffd23f', joints: '#2b2e33', visor: '#3df2ff', decalColor: '#f07a22', helmet: 'kai', arms: 'strike', bionics: 'cannon', legs: 'heavy', thrusters: 'twin', boots: 'tank' }],
];

/**
 * Garage / customise screen. Opens every time the player enters the world, loaded with the saved build, so
 * "Enter world" is one click. Changes apply live via `apply` and persist via `save`. Repair resets battle damage.
 */
export function createCustomizer(initial: RobotLook, damage: () => number, apply: (l: RobotLook) => void, onEnter: () => void, onRepair: () => void) {
  let look = { ...initial };
  const el = document.createElement('div'); el.id = 'hangar'; el.hidden = true;
  el.innerHTML = `<div class="panel"><h2>Garage</h2><p class="sub">Build your mech. Saved automatically.</p>
<div class="presets">${PRESETS.map(([n], i) => `<button data-p="${i}">${n}</button>`).join('')}<button data-rand>Random</button></div>
${(Object.keys(SLOTS) as Slot[]).map((k) => `<div class="grp"><label>${SLOT_LABEL[k]}</label><div class="opts" data-k="${k}">${SLOTS[k].map((o) => `<button data-v="${o}">${NAMES[o] ?? o}</button>`).join('')}</div></div>`).join('')}
<div class="cols">${COLOURS.map(([k, label]) => `<div class="col" data-k="${k}"><label>${label}<input type="color" aria-label="${label} colour"></label><div class="sw">${PALETTE.map((c) => `<i data-c="${c}" style="background:${c}" title="${c}"></i>`).join('')}</div></div>`).join('')}</div>
<div class="dmg"><label>Battle damage <b>0%</b></label><i><u></u></i><button data-repair>Repair</button></div>
</div><div class="go"><button class="drop">Enter world</button><span>Enter to drop in · drag to turn · B for the garage in game</span></div>`;
  document.body.appendChild(el);
  const dmgLabel = el.querySelector('.dmg b') as HTMLElement, dmgBar = el.querySelector('.dmg u') as HTMLElement, repairBtn = el.querySelector('[data-repair]') as HTMLButtonElement;
  const sync = () => {
    el.querySelectorAll<HTMLElement>('.opts').forEach((g) => g.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(look[g.dataset.k as keyof RobotLook] === b.dataset.v))));
    el.querySelectorAll<HTMLElement>('.col').forEach((c) => {
      const v = look[c.dataset.k as keyof RobotLook]; (c.querySelector('input') as HTMLInputElement).value = v;
      c.querySelectorAll<HTMLElement>('i').forEach((i) => i.classList.toggle('on', i.dataset.c === v));
    });
  };
  const set = (l: Partial<RobotLook>) => { look = sanitizeLook({ ...look, ...l }); apply(look); sync(); };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('.opts button')) set({ [(t.parentElement as HTMLElement).dataset.k!]: t.dataset.v } as Partial<RobotLook>);
    else if (t.matches('.sw i')) set({ [(t.closest('.col') as HTMLElement).dataset.k!]: t.dataset.c } as Partial<RobotLook>);
    else if (t.dataset.p) set(PRESETS[+t.dataset.p][1]);
    else if (t.hasAttribute('data-rand')) set({ ...Object.fromEntries(COLOURS.map(([k]) => [k, pick(PALETTE)])), ...Object.fromEntries((Object.keys(SLOTS) as Slot[]).map((k) => [k, pick(SLOTS[k])])) } as Partial<RobotLook>);
    else if (t.hasAttribute('data-repair')) onRepair();
    else if (t.matches('.drop')) onEnter();
  });
  el.addEventListener('input', (e) => { const t = e.target as HTMLInputElement; if (t.type === 'color') set({ [(t.closest('.col') as HTMLElement).dataset.k!]: t.value } as Partial<RobotLook>); });
  addEventListener('keydown', (e) => { if (!el.hidden && e.code === 'Enter' && !(e.target as HTMLElement).matches?.('button')) { e.preventDefault(); onEnter(); } });
  sync();
  return {
    get open() { return !el.hidden; }, get look() { return look; },
    setOpen(v: boolean) { el.hidden = !v; if (v) (el.querySelector('.drop') as HTMLElement).focus({ preventScroll: true }); },
    /** Refresh the damage meter (called a few times a second while open). */
    tick() { const d = damage(); dmgLabel.textContent = `${Math.round(d * 100)}%`; dmgBar.style.width = `${d * 100}%`; repairBtn.disabled = d < 0.005; },
    set,
  };
}
