// Downloads the CC0 ambientCG sets in sets.json (1K JPG), resizes to `size`, and encodes each set as one
// KTX2 2D-array texture (Basis ETC1S, sRGB, mipmaps) into public/textures/<set>.ktx2.
// Needs KTX-Software's `ktx` CLI on PATH (https://github.com/KhronosGroup/KTX-Software/releases). Run: node tools/textures/build.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
const here = new URL('.', import.meta.url).pathname, cache = join(here, '../cache/textures'), out = join(here, '../../public/textures');
mkdirSync(cache, { recursive: true }); mkdirSync(out, { recursive: true });
const sets = JSON.parse(readFileSync(join(here, 'sets.json'), 'utf8'));
for (const [name, set] of Object.entries(sets)) {
  if (name.startsWith('_')) continue;
  const pngs = [];
  for (const id of set.layers) {
    const jpg = join(cache, `${id}_Color.jpg`);
    if (!existsSync(jpg)) {
      const zip = join(cache, `${id}.zip`);
      execFileSync('curl', ['-sSLf', '-o', zip, `https://ambientcg.com/get?file=${id}_1K-JPG.zip`]);
      execFileSync('unzip', ['-o', '-j', '-q', zip, `${id}_1K-JPG_Color.jpg`, '-d', cache]);
      execFileSync('mv', [join(cache, `${id}_1K-JPG_Color.jpg`), jpg]);
    }
    const png = join(cache, `${id}_${set.size}.png`);
    await sharp(jpg).resize(set.size, set.size).removeAlpha().png().toFile(png);
    pngs.push(png);
  }
  execFileSync('ktx', ['create', '--format', 'R8G8B8_SRGB', '--layers', String(pngs.length), '--encode', 'basis-lz', '--qlevel', '160', '--generate-mipmap', '--assign-tf', 'srgb', ...pngs, join(out, `${name}.ktx2`)], { stdio: 'inherit' });
  console.log(name, set.layers.join(', '));
}
writeFileSync(join(out, 'LICENSES.md'), `# Textures (public/textures/)\n\nAll textures are **CC0 1.0** (public domain) from [ambientCG](https://ambientcg.com) by Lennart Demes. No attribution required; listed for provenance. Built by \`node tools/textures/build.mjs\` (512 px, KTX2 Basis ETC1S, mipmapped 2D arrays).\n\n| File | Layer | ambientCG asset | URL | Licence |\n|---|---|---|---|---|\n` +
  Object.entries(sets).filter(([n]) => !n.startsWith('_')).flatMap(([n, s]) => s.layers.map((id, i) => `| ${n}.ktx2 | ${i} | ${id} | https://ambientcg.com/view?id=${id} | CC0 1.0 |`)).join('\n') + '\n');
