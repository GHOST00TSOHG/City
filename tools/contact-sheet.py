#!/usr/bin/env python3
"""python3 tools/contact-sheet.py <dir> <out.jpg> <cols> <tile_w> [prefix ...]
Labelled contact sheet of the PNGs in <dir> (all, or only names starting with a prefix)."""
import os
import sys

from PIL import Image, ImageDraw

d, out, cols, tw = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
prefixes = sys.argv[5:]
names = sorted(n for n in os.listdir(d) if n.endswith(".png") and (not prefixes or n.startswith(tuple(prefixes))))
if not names:
    sys.exit("no images")
th = int(tw * 800 / 1280)
rows = (len(names) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * th), (20, 20, 20))
for i, n in enumerate(names):
    im = Image.open(os.path.join(d, n)).convert("RGB").resize((tw, th), Image.LANCZOS)
    ImageDraw.Draw(im).text((6, th - 14), n[:-4], fill=(255, 255, 0))
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
sheet.save(out, quality=88)
print(len(names), sheet.size)
