"""Merge world-check-{static,perf,inspect}.json into world-check.json and print the headline numbers."""
import json
o = 'tools/perf/out/'
r = {}
for k in ('static', 'perf', 'inspect'):
    d = json.load(open(f'{o}world-check-{k}.json'))
    r[k] = d[k]
    if k == 'inspect':
        r['shotStats'] = d['shotStats']
json.dump(r, open(o + 'world-check.json', 'w'), indent=1)
s = r['static']
print({k: v for k, v in s.items() if k != 'views'})
p = r['perf']['summary']
print({k: p[k] for k in ('seconds', 'fpsMedian', 'fpsMinWindowMedian', 'worstFrameMs', 'framesOver33', 'frames', 'callsMax', 'callsMedian', 'speedMax', 'mem', 'popInEvents')})
