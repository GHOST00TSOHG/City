import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const ezLib = fileURLToPath(new URL('./node_modules/@dgreenheck/ez-tree/src/lib', import.meta.url));
const stub = fileURLToPath(new URL('./src/area/ez-textures-stub.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@eztree': ezLib } },
  plugins: [{
    // ez-tree's textures.js eagerly loads every bark/leaf set (~3 MB). We only use its geometry and load the two leaf/bark maps we need ourselves.
    name: 'ez-tree-textures-stub', enforce: 'pre',
    resolveId(src, importer) { if (src === './textures' && importer?.includes('ez-tree')) return stub; return null; },
  }],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  preview: { port: 4173, strictPort: true },
});
