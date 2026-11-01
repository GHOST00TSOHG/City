// Convert the Blender-baked robot textures to WebP for shipping:  node tools/robot-textures.mjs
// masks (R AO, G edge wear, B grime) and normal maps are lossy-but-high-quality (data maps, no alpha);
// the decal atlas keeps alpha. PNG sources are deleted afterwards (they are rebuilt by tools/blender/robot_types.py).
import sharp from 'sharp';
import { existsSync, unlinkSync, statSync } from 'node:fs';
const dir = new URL('../public/robot/', import.meta.url).pathname;
const jobs = [['decals', { quality: 92, alphaQuality: 100 }]];
for (const t of ['scout', 'heavy', 'worker']) jobs.push([`${t}/masks`, { quality: 90 }], [`${t}/normal`, { quality: 94, smartSubsample: true }]);
for (const [name, opt] of jobs) {
  const src = `${dir}${name}.png`, out = `${dir}${name}.webp`;
  if (!existsSync(src)) { console.log('skip', name); continue; }
  await sharp(src).webp({ effort: 6, ...opt }).toFile(out);
  console.log(name, (statSync(src).size / 1e6).toFixed(2), 'MB ->', (statSync(out).size / 1e6).toFixed(2), 'MB');
  if (!process.argv.includes('--keep')) unlinkSync(src);
}
