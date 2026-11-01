import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ezLib = fileURLToPath(new URL('./node_modules/@dgreenheck/ez-tree/src/lib', import.meta.url));
const stub = fileURLToPath(new URL('./src/area/ez-textures-stub.ts', import.meta.url));

// Optional drop-ins: a build only probes for them if they were in public/ at build time (no 404s in the console); dev always probes.
const has = (p: string) => existsSync(fileURLToPath(new URL('./public/' + p, import.meta.url)));

export default defineConfig({
  define: { __HAS_TREE_SPECIES__: JSON.stringify(has('trees/species.json')), __HAS_ROBOT_GLB__: JSON.stringify(has('robot/robot.glb')) },
  resolve: { alias: { '@eztree': ezLib } },
  plugins: [{
    // ez-tree's textures.js eagerly loads every bark/leaf set (~3 MB). We only use its geometry and load the two leaf/bark maps we need ourselves.
    name: 'ez-tree-textures-stub', enforce: 'pre',
    resolveId(src, importer) { if (src === './textures' && importer?.includes('ez-tree')) return stub; return null; },
  }],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  preview: { port: 4173, strictPort: true },
});
