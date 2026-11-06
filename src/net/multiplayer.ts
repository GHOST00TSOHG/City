import * as THREE from 'three/webgpu';
import { createRobotSwitch, type RobotSwitch } from '../robot/typed';
import { sanitizeLook, type RobotLook, type PoseInput } from '../robot/model';
import type { RobotType } from '../robot/types';

export interface LocalState { p: number[]; v: number[]; q: number[]; a: string; rType: RobotType; look: RobotLook; dmg: number; hangar: boolean; pose: PoseInput | null; thr: number; bst: number; chg: boolean }
interface Peer {
  id: string; name: string; last: any; seen: number; rType?: RobotType; lookKey?: string; robot?: RobotSwitch | null; token: number;
  pos: THREE.Vector3; quat: THREE.Quaternion; ready: boolean; phase: number; t: number; chip: HTMLButtonElement; tag: HTMLButtonElement;
}

export function createMultiplayer(o: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; state: () => LocalState; teleport: (x: number, y: number, z: number) => void }) {
  const qs = new URLSearchParams(location.search);
  const room = qs.get('room') || 'main';
  const api: any = { connected: false, id: '', name: '', room, peers: () => [...peers.values()].map((p) => ({ id: p.id, name: p.name, p: p.last?.p, rType: p.rType })) };
  (window as any).__mp = api;
  if (qs.get('mp') === '0') return { update() {} };

  const peers = new Map<string, Peer>();
  const bar = document.createElement('div'); bar.id = 'mp-bar';
  const dot = document.createElement('i'); bar.appendChild(dot); document.body.appendChild(bar);
  const local = new THREE.Vector3();
  let ws: WebSocket | null = null, delay = 1000, sendT = 0, pingT = 0;

  const drop = (p: Peer) => {
    p.token++; if (p.robot) { o.scene.remove(p.robot.root); p.robot.dispose(); }
    p.chip.remove(); p.tag.remove(); peers.delete(p.id);
  };
  const upsert = (m: any) => {
    let p = peers.get(m.id);
    if (!p) {
      const chip = document.createElement('button'); chip.className = 'mp-chip';
      const tag = document.createElement('button'); tag.className = 'mp-tag';
      p = { id: m.id, name: m.name || m.id, last: m, seen: performance.now(), token: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), ready: false, phase: 0, t: 0, chip, tag };
      const pr = p;
      const go = () => { const q = pr.last?.p; if (q) o.teleport(q[0] + 3.5, q[1] + 2.5, q[2] + 3.5); };
      chip.onclick = go; tag.onclick = go; bar.appendChild(chip); document.body.appendChild(tag); peers.set(m.id, p);
    }
    if (m.name) p.name = m.name;
    if (m.t === 's') { p.last = m; p.seen = performance.now(); sync(p, m); }
    return p;
  };
  const sync = (p: Peer, m: any) => {
    if (!m.rType || !m.p) return;
    const look = sanitizeLook(m.look, m.rType), key = m.rType + JSON.stringify(look);
    if (!p.ready) { p.pos.fromArray(m.p); p.ready = true; if (m.q) p.quat.fromArray(m.q); }
    if (key === p.lookKey) return;
    p.lookKey = key; const tk = ++p.token;
    createRobotSwitch(m.rType, look).then((r) => {
      if (tk !== p.token || !peers.has(p.id)) { r.dispose(); return; }
      if (p.robot) { o.scene.remove(p.robot.root); p.robot.dispose(); }
      p.robot = r; p.rType = m.rType; o.scene.add(r.root);
    }).catch(() => { p.lookKey = undefined; });
  };

  const connect = () => {
    const sock = ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/mp?room=${encodeURIComponent(room)}`);
    sock.onopen = () => { delay = 1000; api.connected = true; dot.classList.add('on'); };
    sock.onmessage = (e) => {
      let m: any; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { api.id = m.id; api.name = m.name; (m.peers || []).forEach((s: any) => s.id !== m.id && upsert(s)); }
      else if (m.t === 'join') { if (m.id !== api.id) upsert(m); }
      else if (m.t === 's') { if (m.id !== api.id) upsert(m); }
      else if (m.t === 'leave') { const p = peers.get(m.id); if (p) drop(p); }
    };
    sock.onclose = () => {
      if (ws !== sock) return; ws = null; api.connected = false; dot.classList.remove('on');
      setTimeout(connect, delay); delay = Math.min(5000, delay * 1.6);
    };
    sock.onerror = () => sock.close();
  };
  connect();

  const v3 = new THREE.Vector3();
  return {
    update(dt: number) {
      const now = performance.now();
      if (ws?.readyState === 1) {
        sendT += dt; pingT += dt;
        if (sendT >= 0.05) {
          sendT = 0; const s = o.state(); local.fromArray(s.p);
          ws.send(JSON.stringify({ t: 's', n: api.name, a: s.a, rType: s.rType, look: s.look, dmg: s.dmg, hangar: s.hangar, p: s.p, v: s.v, q: s.q, thr: s.thr, bst: s.bst, chg: s.chg, pose: s.pose }));
        }
        if (pingT >= 15) { pingT = 0; ws.send('{"t":"ping"}'); }
      }
      local.fromArray(o.state().p);
      const w = innerWidth, h = innerHeight;
      for (const p of [...peers.values()]) {
        if (now - p.seen > 12000) { drop(p); continue; }
        const m = p.last; if (!m?.p) continue;
        v3.fromArray(m.p);
        const d = p.pos.distanceTo(v3);
        if (d > 80) p.pos.copy(v3); else p.pos.lerp(v3, 1 - Math.exp(-15 * dt));
        if (m.q) p.quat.slerp(new THREE.Quaternion().fromArray(m.q), 1 - Math.exp(-15 * dt));
        const r = p.robot;
        if (r) {
          r.root.position.copy(p.pos); r.root.quaternion.copy(p.quat);
          if (m.pose) { p.phase += dt * (2 + (m.pose.speed || 0) * 6); p.t += dt; r.animate({ ...m.pose, phase: (m.pose.phase || 0) + p.phase, t: (m.pose.t || 0) + p.t }, dt); }
        }
        p.chip.textContent = `${p.name} · ${Math.round(p.pos.distanceTo(local))}m`;
        // nametag
        v3.copy(p.pos); v3.y += (r?.height ?? 2) + 0.7; v3.project(o.camera);
        let x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
        if (v3.z > 1) { x = w - x; y = h; }
        x = Math.min(w - 40, Math.max(40, x)); y = Math.min(h - 20, Math.max(20, y));
        p.tag.textContent = p.name; p.tag.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      }
    },
  };
}
