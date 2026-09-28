from PIL import Image, ImageDraw, ImageFilter
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'icons')
def icon(size, maskable=False):
    S = 1024
    im = Image.new('RGB', (S, S), (22, 16, 13))
    d = ImageDraw.Draw(im)
    # subtle wood gradient
    for y in range(S):
        c = int(22 + 14 * (y / S))
        d.line([(0, y), (S, y)], fill=(c + 6, c - 2, c - 6))
    pad = 190 if maskable else 150
    x0, x1 = pad, S - pad
    y0, y1 = pad - 10, S - pad + 10
    # nut
    d.rounded_rectangle([x0 - 20, y0 - 26, x1 + 20, y0 + 10], radius=12, fill=(236, 226, 208))
    # frets (brass)
    for k in range(1, 5):
        y = y0 + (y1 - y0) * k / 4.6
        d.rounded_rectangle([x0 - 20, y - 9, x1 + 20, y + 9], radius=9, fill=(200, 140, 52))
    # strings
    for i in range(6):
        x = x0 + (x1 - x0) * i / 5
        w = 12 - i
        d.rectangle([x - w / 2, y0, x + w / 2, y1], fill=(222, 212, 196))
    # finger dots
    def dot(si, fret, col):
        x = x0 + (x1 - x0) * si / 5
        y = y0 + (y1 - y0) * (fret - 0.5) / 4.6
        r = 62
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)
    dot(1, 2, (242, 169, 59))
    dot(2, 2, (242, 238, 228))
    dot(3, 1, (242, 238, 228))
    im = im.resize((size, size), Image.LANCZOS)
    return im
for s, n, m in [(192, 'icon-192.png', False), (512, 'icon-512.png', False), (180, 'apple-touch-icon.png', False), (512, 'maskable-512.png', True), (32, 'favicon-32.png', False)]:
    icon(s, m).save(os.path.join(OUT, n))
print('ok')
