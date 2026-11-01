"""Original decal atlas for the robot types (4x4 cells, 256 px each, white on transparent; the game tints it with
the 'decal colour' paint channel). Run with plain python3 + Pillow:  python3 tools/blender/decal_atlas.py
Cells: (col,row) 0,0 chevrons | 1,0 hazard stripes | 2,0 CITY WORKS sticker | 3,0 warning triangle
       0,1 roundel | 1,1 "07" | 2,1 "12" | 3,1 "33" | 0,2 arrow | 1,2 barcode | 2,2 bolt | 3,2 "LIFT HERE"
       0,3 "UNIT-W" plate | 1,3 crosshair | 2,3 tally marks | 3,3 "HV-9"."""
import os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
C = 256; img = Image.new('L', (C * 4, C * 4), 0); d = ImageDraw.Draw(img)
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font = lambda s: ImageFont.truetype(F, s)
def cell(c, r): return c * C, r * C
def text(c, r, s, size, y=0.5):
    x0, y0 = cell(c, r); f = font(size); w = d.textlength(s, font=f); d.text((x0 + (C - w) / 2, y0 + C * y - size * 0.6), s, font=f, fill=255)
x, y = cell(0, 0)
for i in range(3): o = 58 * i; d.polygon([(x + 30, y + 30 + o), (x + 128, y + 80 + o), (x + 226, y + 30 + o), (x + 226, y + 62 + o), (x + 128, y + 112 + o), (x + 30, y + 62 + o)], fill=255)
x, y = cell(1, 0); hz = Image.new('L', (C, C), 0); hd = ImageDraw.Draw(hz)
for i in range(-5, 6): hd.polygon([(i * 56, 236), (i * 56 + 28, 236), (i * 56 + 28 + 216, 20), (i * 56 + 216, 20)], fill=255)
hd.rectangle([0, 0, C - 1, 19], fill=0); hd.rectangle([0, 237, C - 1, C - 1], fill=0); hd.rectangle([4, 20, C - 5, 236], outline=255, width=6); img.paste(hz, (x, y))
x, y = cell(2, 0)
d.rounded_rectangle([x + 8, y + 64, x + 248, y + 192], 14, outline=255, width=8); text(2, 0, 'CITY', 58, 0.39); text(2, 0, 'WORKS', 40, 0.62)
d.rectangle([x + 20, y + 168, x + 236, y + 174], fill=255)
x, y = cell(3, 0)
d.polygon([(x + 128, y + 24), (x + 236, y + 220), (x + 20, y + 220)], fill=255); d.polygon([(x + 128, y + 62), (x + 204, y + 200), (x + 52, y + 200)], fill=0)
d.rectangle([x + 118, y + 100, x + 138, y + 160], fill=255); d.ellipse([x + 116, y + 170, x + 140, y + 192], fill=255)
x, y = cell(0, 1)
d.ellipse([x + 20, y + 20, x + 236, y + 236], fill=255); d.ellipse([x + 50, y + 50, x + 206, y + 206], fill=0); d.ellipse([x + 92, y + 92, x + 164, y + 164], fill=255)
d.rectangle([x + 120, y + 20, x + 136, y + 236], fill=255)
for (c, s) in ((1, '07'), (2, '12'), (3, '33')): text(c, 1, s, 170)
x, y = cell(0, 2); d.polygon([(x + 30, y + 100), (x + 150, y + 100), (x + 150, y + 50), (x + 230, y + 128), (x + 150, y + 206), (x + 150, y + 156), (x + 30, y + 156)], fill=255)
x, y = cell(1, 2); random.seed(7); xx = x + 20
while xx < x + 236:
    w = random.choice((3, 5, 8)); d.rectangle([xx, y + 50, xx + w, y + 180], fill=255); xx += w + random.choice((4, 6, 9))
text(1, 2, '0 4 4 1 9 2', 26, 0.83)
x, y = cell(2, 2); d.polygon([(x + 150, y + 16), (x + 70, y + 140), (x + 124, y + 140), (x + 100, y + 240), (x + 190, y + 104), (x + 136, y + 104)], fill=255)
text(3, 2, 'LIFT', 70, 0.38); text(3, 2, 'HERE', 70, 0.66); x, y = cell(3, 2); d.rectangle([x + 12, y + 12, x + 243, y + 243], outline=255, width=8)
x, y = cell(0, 3); d.rectangle([x + 10, y + 70, x + 246, y + 186], fill=255); f = font(50); s = 'UNIT-W'; w = d.textlength(s, font=f); d.text((x + (C - w) / 2, y + 90), s, font=f, fill=0)
x, y = cell(1, 3); d.ellipse([x + 40, y + 40, x + 216, y + 216], outline=255, width=12)
for a in ((128, 10, 128, 90), (128, 166, 128, 246), (10, 128, 90, 128), (166, 128, 246, 128)): d.line([x + a[0], y + a[1], x + a[2], y + a[3]], fill=255, width=12)
x, y = cell(2, 3)
for i in range(4): d.rectangle([x + 40 + i * 40, y + 50, x + 54 + i * 40, y + 206], fill=255)
d.line([x + 24, y + 190, x + 232, y + 66], fill=255, width=14)
text(3, 3, 'HV-9', 92)
# wear: erode with noise so stickers look used, not vector-clean
random.seed(3); noise = Image.effect_noise((C * 4, C * 4), 90).filter(ImageFilter.GaussianBlur(2.2))
mask = noise.point(lambda v: 255 if v > 70 else 0)
img = Image.composite(img, Image.new('L', img.size, 0), mask).filter(ImageFilter.GaussianBlur(0.6))
out = Image.merge('RGBA', (Image.new('L', img.size, 255),) * 3 + (img,))
p = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'robot', 'decals.png'); out.save(p); print('wrote', p)
