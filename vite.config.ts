import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ezLib = fileURLToPath(new URL('./node_modules/@dgreenheck/ez-tree/src/lib', import.meta.url));
const stub = fileURLToPath(new URL('./src/area/ez-textures-stub.ts', import.meta.url));

// Optional drop-ins: a build only probes for them if they were in public/ at build time (no 404s in the console); dev always probes.
const has = (p: string) => existsSync(fileURLToPath(new URL('./public/' + p, import.meta.url)));

// Content hash of public/robot (kits, GLBs, JSON): appended as ?v= to robot asset URLs so Pages/Safari never serve a stale kit.
const robotDir = fileURLToPath(new URL('./public/robot', import.meta.url));
const walk = (d: string): string[] => readdirSync(d).sort().flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const robotV = (() => { const h = createHash('sha256'); if (existsSync(robotDir)) for (const p of walk(robotDir)) { h.update(p.slice(robotDir.length)); h.update(readFileSync(p)); } return h.digest('hex').slice(0, 12); })();

export default defineConfig({
  define: { __HAS_TREE_SPECIES__: JSON.stringify(has('trees/species.json')), __HAS_ROBOT_GLB__: JSON.stringify(has('robot/robot.glb')), __ROBOT_V__: JSON.stringify(robotV) },
  resolve: { alias: { '@eztree': ezLib } },
  plugins: [{
    // ez-tree's textures.js eagerly loads every bark/leaf set (~3 MB). We only use its geometry and load the two leaf/bark maps we need ourselves.
    name: 'ez-tree-textures-stub', enforce: 'pre',
    resolveId(src, importer) { if (src === './textures' && importer?.includes('ez-tree')) return stub; return null; },
  }],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  preview: { port: 4173, strictPort: true },
});
