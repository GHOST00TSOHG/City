// Lists the robot audio slots that actually exist: node tools/audio-manifest.mjs → public/audio/robots/manifest.json
// Files: public/audio/robots/<type>/<type>-<slot>.ogg (+ .m4a one-shot fallback), Echo's v3 naming (docs/audio-robots-v3/README.md). The slot id is the
// file name without "<type>-" and the extension, e.g. "footstep_01", "land-slam_light", "tread-growl". The game only fetches slots named here, so a
// missing file is silent: no request, no 404, no console error. Run it again whenever files are added.
import fs from 'fs';
const root = 'public/audio/robots', out = {};
for (const t of ['scout', 'heavy', 'worker', 'glitch']) {
  const files = fs.existsSync(`${root}/${t}`) ? fs.readdirSync(`${root}/${t}`) : [];
  out[t] = files.filter((f) => f.startsWith(`${t}-`) && f.endsWith('.ogg')).map((f) => f.slice(t.length + 1, -4)).sort();
}
fs.writeFileSync(`${root}/manifest.json`, JSON.stringify(out)); console.log(Object.entries(out).map(([t, a]) => `${t}: ${a.length}`).join(', '));
