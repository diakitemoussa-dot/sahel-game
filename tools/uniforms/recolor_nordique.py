"""Peau très claire, cheveux blonds, yeux bleus : recoloration de l'atlas du personnage (peau noire d'origine).
Usage : python -I nordique.py <atlas d'origine> <atlas recoloré>"""
import sys
import numpy as np
from PIL import Image, ImageFilter
src, dst = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32)
rgb = im[..., :3] / 255.0; a = im[..., 3]
H, W = a.shape
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
mx, mn = rgb.max(2), rgb.min(2)
sat = (mx - mn) / (mx + 1e-6)
lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
ys, xs = (np.arange(H)[:, None] / H), (np.arange(W)[None, :] / W)
def blur(x, rad): return np.asarray(Image.fromarray(np.clip(x * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) / 255

# ---- peau (visage, mains, jambes : moitié droite de l'atlas)
skin = (r >= g * 0.97) & (g >= b * 0.9) & (sat > 0.14) & (mx > 0.03) & (xs > 0.52)
m = np.clip(blur(skin.astype(np.float32), 2.0) * 1.3, 0, 1)
sk = skin.astype(np.float32)
low = np.clip(blur(lum * sk, 40) / (blur(sk, 40) + 1e-4), 0.02, 1)
detail = np.clip(lum / (low + 1e-4), 0.5, 1.22) ** 0.7
lowshade = np.clip((low / np.median(lum[skin])) ** 0.18, 0.88, 1.08)
base = np.array([240, 207, 192], np.float32) / 255.0           # peau nordique : très claire, rosée
tone = np.clip(base[None, None, :] * (detail * lowshade)[..., None], 0, 1)
red = np.clip((sat - 0.55) * 0.8, 0, 0.3)[..., None]            # lèvres, narines
tone = tone * (1 - red) + np.array([0.80, 0.45, 0.44], np.float32)[None, None, :] * detail[..., None] * red
out = rgb * (1 - m[..., None]) + tone * m[..., None]

# ---- cheveux blonds : cartes de mèches (zone à droite du buste, à gauche de la tête) + calotte sombre du crâne
blond_hi = np.array([244, 220, 160], np.float32) / 255.0
blond_lo = np.array([200, 164, 96], np.float32) / 255.0
hair_cards = (xs > 0.40) & (a > 20) & ~skin & (((xs < 0.505) & (ys > 0.08) & (ys < 0.47)) | ((xs < 0.585) & (ys > 0.30) & (ys < 0.48) & (lum < 0.12)))
scalp = (xs > 0.50) & (lum < 0.075) & ~skin & ((ys < 0.105) | ((ys < 0.17) & ((xs < 0.60) | (xs > 0.89))))
hm = np.clip(blur((hair_cards | scalp).astype(np.float32), 1.5) * 1.2, 0, 1) * (a > 20)
t = np.clip(lum / 0.16, 0, 1)[..., None] ** 0.8                  # le motif sombre/clair d'origine module le blond
hair = blond_lo[None, None, :] * (1 - t) + blond_hi[None, None, :] * t
out = out * (1 - hm[..., None]) + hair * hm[..., None]

# ---- yeux bleus : anneau rouge-brun des iris, à gauche de l'atlas
eye = (xs > 0.19) & (xs < 0.32) & (ys > 0.08) & (ys < 0.34) & (r > g * 1.35) & (r > 0.12)
em = np.clip(blur(eye.astype(np.float32), 1.0) * 1.2, 0, 1)
bl = np.stack([lum * 0.55, lum * 1.15 + 0.05, lum * 2.2 + 0.15], 2)
bl = np.clip(bl, 0, 1)
out = out * (1 - em[..., None]) + bl * em[..., None]

res = np.dstack([np.clip(out, 0, 1) * 255, a]).round().astype(np.uint8)
Image.fromarray(res, "RGBA").save(dst)
print("ok", int(skin.sum()), int(hair_cards.sum()), int(scalp.sum()), int(eye.sum()))
