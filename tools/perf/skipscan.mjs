// RSS bisect: run baseline.mjs (first tile of an area) once per query string and print the last WebContent MB sample + the max.
//   node tools/perf/skipscan.mjs [--port 5199] [--area newark] "&skipgeo=roads" "&skipstage=trees" ...
import { execFileSync } from 'node:child_process';
const a = process.argv.slice(2);
const take = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a.splice(i, 2)[1] : d; };
const port = take('--port', '5199'), area = take('--area', 'newark');
for (const q of a) {
  const out = execFileSync('node', ['tools/perf/baseline.mjs', '--port', port, '--ready', '--wait', '3', '--step', '500', '--area', area, '--q', q], { encoding: 'utf8', timeout: 300000 });
  const v = [...out.split('\n')[0].matchAll(/:(\d+)/g)].map((m) => +m[1]);
  console.log(`${q}: final ${v[v.length - 1]} max ${Math.max(...v)}`);
}
