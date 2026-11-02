// Bundles tools/trees/bake-ez.ts with vite (ssr: ez-tree uses extensionless imports, json and image imports) and runs it. No network, no install.
//   node tools/trees/bake.mjs [outDir=public/trees]
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
await build({
  root, logLevel: 'warn', configFile: false,
  resolve: { alias: { '@eztree': `${root}node_modules/@dgreenheck/ez-tree/src/lib` } },
  plugins: [{ name: 'stub-textures', enforce: 'pre', resolveId(src, importer) { return src === './textures' && importer?.includes('ez-tree') ? `${root}src/area/ez-textures-stub.ts` : null; } }],
  build: { ssr: `${root}tools/trees/bake-ez.ts`, outDir: `${root}.tmp/ezbake`, emptyOutDir: true, target: 'node20', rollupOptions: { output: { entryFileNames: 'bake-ez.mjs' } } },
  ssr: { noExternal: true },
});
execFileSync('node', [`${root}.tmp/ezbake/bake-ez.mjs`, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root });
