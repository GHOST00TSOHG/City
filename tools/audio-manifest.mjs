// Lists the robot audio slots that actually exist: node tools/audio-manifest.mjs → public/audio/robots/manifest.json
// The game only fetches slots named in this file, so a missing file (Echo's files arrive later) is silent: no 404, no console error.
// Run it again whenever files are added to public/audio/robots/<type>/ (a slot counts when BOTH <type>_<slot>.ogg and .m4a exist).
import fs from 'fs';
const root = 'public/audio/robots', out = {};
for (const t of ['scout', 'heavy', 'worker', 'glitch']) {
  const files = fs.existsSync(`${root}/${t}`) ? fs.readdirSync(`${root}/${t}`) : [], names = new Set(files.filter((f) => f.endsWith('.ogg')).map((f) => f.slice(t.length + 1, -4)));
  out[t] = [...names].filter((n) => files.includes(`${t}_${n}.m4a`)).sort();
}
fs.writeFileSync(`${root}/manifest.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
