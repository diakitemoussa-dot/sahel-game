"""Texture de camouflage du véhicule (pick-up armé), d'après l'image de référence : grandes taches crème, olive et vert sombre
aux bords nets (peinture au pistolet), un peu de brun, peinture passée et poussiéreuse. Périodique (sans raccord).
Usage : python -I make_camo_vehicule.py <dossier de sortie>   ->  camo_vehicule.png (1024), peinture_olive.png (512)"""
import os, sys
import numpy as np
from PIL import Image

out = sys.argv[1]
os.makedirs(out, exist_ok=True)


def fbm(S, seed, octaves=5, base=3):
    rng = np.random.default_rng(seed)
    acc = np.zeros((S, S)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        n = base * 2 ** o
        g = rng.random((n, n))
        im = Image.fromarray((np.tile(g, (3, 3)) * 255).astype(np.uint8)).resize((S * 3, S * 3), Image.BICUBIC)
        acc += np.asarray(im, float)[S:2 * S, S:2 * S] / 255.0 * amp; tot += amp; amp *= 0.5
    acc /= tot
    return (acc - acc.min()) / (acc.max() - acc.min())


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mixc(img, color, mask):
    return img * (1 - mask[..., None]) + np.array(color, float)[None, None, :] * mask[..., None]


S = 1024
# déformation de domaine : les bords des taches sont organiques et allongés
wx, wy = fbm(S, 1, 4, 2), fbm(S, 2, 4, 2)
yy, xx = np.mgrid[0:S, 0:S].astype(float)
shift = (S * 0.06 * (wx - 0.5)).astype(int), (S * 0.06 * (wy - 0.5)).astype(int)
def warp(n): return n[(yy.astype(int) + shift[0]) % S, (xx.astype(int) + shift[1]) % S]

a = warp(fbm(S, 11, 5, 2)); b = warp(fbm(S, 12, 5, 3)); c = warp(fbm(S, 13, 5, 3))
img = np.zeros((S, S, 3)) + np.array([208, 194, 156], float)                       # fond crème
img = mixc(img, (110, 120, 82), smooth(a, 0.555, 0.57))                              # olive : grandes taches
img = mixc(img, (82, 90, 60), smooth(b, 0.60, 0.615) * smooth(a, 0.48, 0.53))       # vert sombre : dans/à côté de l'olive
img = mixc(img, (144, 112, 76), smooth(c, 0.71, 0.725) * (1 - smooth(a, 0.5, 0.56)))  # brun : taches plus rares sur le crème
# peinture passée et poussiéreuse : variations douces, éclaircies, rayures fines
fade = fbm(S, 21, 6, 6)
img *= (0.90 + 0.18 * fade)[..., None]
dust = smooth(fbm(S, 22, 5, 4), 0.55, 0.9)
img = mixc(img, (176, 158, 124), dust * 0.28)
grain = np.random.default_rng(23).normal(0, 3.2, (S, S))
img += grain[..., None]
rng = np.random.default_rng(24)
for _ in range(220):                                                                # éraflures claires
    x0, y0 = rng.integers(0, S), rng.integers(0, S); ang = rng.uniform(0, np.pi); L = rng.integers(10, 55)
    for t in range(L):
        x, y = int(x0 + t * np.cos(ang)) % S, int(y0 + t * np.sin(ang)) % S
        img[y, x] += 26
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(out, "camo_vehicule.png"))
print("écrit camo_vehicule.png")

# peinture olive unie (canon, rails, caisses) : légèrement écaillée
S2 = 512
n = fbm(S2, 31, 5, 5)
o = np.zeros((S2, S2, 3)) + np.array([64, 72, 44], float)
o *= (0.86 + 0.28 * n)[..., None]
chips = smooth(fbm(S2, 32, 6, 9), 0.7, 0.78)
o = mixc(o, (92, 88, 70), chips * 0.6)
o += np.random.default_rng(33).normal(0, 2.5, (S2, S2))[..., None]
Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).save(os.path.join(out, "peinture_olive.png"))
print("écrit peinture_olive.png")
