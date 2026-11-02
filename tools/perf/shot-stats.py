"""Blank / sky-only frame check for the flight screenshots: python3 -I tools/perf/shot-stats.py <dir>  -> JSON on stdout.
A frame is flagged when the lower 55% of the image (below the HUD rows) is nearly uniform (blank) or matches the sky colour sampled from the top band (sky-only)."""
import json, sys, os
import numpy as np
from PIL import Image

out = {}
for name in sorted(os.listdir(sys.argv[1])):
    if not name.startswith('flight-') or not name.endswith('.png'):
        continue
    a = np.asarray(Image.open(os.path.join(sys.argv[1], name)).convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    low = a[int(h * 0.45):int(h * 0.93), int(w * 0.02):int(w * 0.98)]
    top = a[int(h * 0.12):int(h * 0.2), int(w * 0.3):int(w * 0.7)]
    sky = np.median(top.reshape(-1, 3), axis=0)
    std = float(low.reshape(-1, 3).std(axis=0).mean())
    skyLike = float((np.abs(low - sky).max(axis=2) < 10).mean())
    out[name] = {'lowerStd': round(std, 1), 'skyLikeFraction': round(skyLike, 3), 'blank': std < 3.0, 'skyOnly': skyLike > 0.9}
print(json.dumps({'frames': out, 'flagged': [k for k, v in out.items() if v['blank'] or v['skyOnly']]}))
