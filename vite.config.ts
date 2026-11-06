import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ezLib = fileURLToPath(new URL('./node_modules/@dgreenheck/ez-tree/src/lib', import.meta.url));
const stub = fileURLToPath(new URL('./src/area/ez-textures-stub.ts', import.meta.url));

// Optional drop-ins: a build only probes for them if they were in public/ at build time (no 404s in the console); dev always probes.
const has = (p: string) => existsSync(fileURLToPath(new URL('./public/' + p, import.meta.url)));

// Dev/preview relay for /mp websockets (stands in for the production room object).
function mpRelay(server: any) {
  import('ws').then(({ WebSocketServer }: any) => {
    const wss = new WebSocketServer({ noServer: true });
    const rooms = new Map<string, Map<string, any>>();
    let n = 0;
    server.httpServer?.on('upgrade', (req: any, sock: any, head: any) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname !== '/mp') return;
      const room = (u.searchParams.get('room') || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'main';
      wss.handleUpgrade(req, sock, head, (ws: any) => {
        const m = rooms.get(room) ?? new Map<string, any>(); rooms.set(room, m);
        const id = 'p' + ++n, name = 'Player ' + n; ws.pid = id;
        const send = (c: any, o: any) => c.readyState === 1 && c.send(JSON.stringify(o));
        send(ws, { t: 'welcome', id, name, count: m.size + 1, peers: [...m.values()].map((c) => c.last).filter(Boolean) });
        m.set(id, ws);
        m.forEach((c, k) => k !== id && send(c, { t: 'join', id, name, count: m.size }));
        ws.on('message', (d: any) => {
          let o: any; try { o = JSON.parse(String(d)); } catch { return; }
          if (o.t === 'ping') return send(ws, { t: 'pong' });
          if (o.t !== 's' && o.t !== 'fx') return;
          o.id = id; o.name = name; if (o.t === 's') ws.last = o;
          m.forEach((c, k) => k !== id && send(c, o));
        });
        ws.on('close', () => { m.delete(id); m.forEach((c) => send(c, { t: 'leave', id, count: m.size })); if (!m.size) rooms.delete(room); });
      });
    });
  }).catch((e) => console.warn('[mp] relay needs the ws package', e.message));
}

export default defineConfig({
  define: { __HAS_TREE_SPECIES__: JSON.stringify(has('trees/species.json')), __HAS_ROBOT_GLB__: JSON.stringify(has('robot/robot.glb')) },
  resolve: { alias: { '@eztree': ezLib } },
  plugins: [{ name: 'mp-relay', configureServer: mpRelay, configurePreviewServer: mpRelay }, {
    // ez-tree's textures.js eagerly loads every bark/leaf set (~3 MB). We only use its geometry and load the two leaf/bark maps we need ourselves.
    name: 'ez-tree-textures-stub', enforce: 'pre',
    resolveId(src, importer) { if (src === './textures' && importer?.includes('ez-tree')) return stub; return null; },
  }],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  preview: { port: 4173, strictPort: true },
});
