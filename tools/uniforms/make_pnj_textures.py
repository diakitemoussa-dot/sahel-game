"""Textures du PNJ (milicien du désert), d'après l'image de référence : tissus usés et sales, semi-réalistes.
Usage : python -I make_pnj_textures.py <dossier de sortie>
Sorties : pnj_tunique.png (panneaux indigo/brun, 1024), pnj_manche.png, pnj_pantalon.png, pnj_gilet.png, pnj_cuir.png,
pnj_foulard.png, pnj_masque.png (tuiles sans raccord, 512)."""
import os, sys
import numpy as np
from PIL import Image

out = sys.argv[1]
os.makedirs(out, exist_ok=True)


def fbm(S, seed, octaves=5, base=4, periodic=True):
    """Bruit fractal 0..1, périodique (sans raccord) : somme de grilles aléatoires interpolées (bicubique)."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((S, S)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        n = base * 2 ** o
        g = rng.random((n, n))
        im = Image.fromarray((np.tile(g, (3, 3)) * 255).astype(np.uint8)).resize((S * 3, S * 3), Image.BICUBIC)
        a = np.asarray(im, float)[S:2 * S, S:2 * S] / 255.0
        acc += a * amp; tot += amp; amp *= 0.5
    acc /= tot
    return (acc - acc.min()) / (acc.max() - acc.min())


def weave(S, period, strength):
    """Trame de tissu : fils croisés."""
    yy, xx = np.mgrid[0:S, 0:S].astype(float)
    a = np.sin(2 * np.pi * xx / period) * np.sin(2 * np.pi * yy / period)
    b = np.sin(2 * np.pi * (xx + period / 2) / (period * 2)) * 0.5
    return 1.0 + strength * (0.7 * a + 0.3 * b)


def mix(c0, c1, t):
    return np.array(c0, float)[None, None, :] * (1 - t[..., None]) + np.array(c1, float)[None, None, :] * t[..., None]


def save(name, img):
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(out, name))
    print("écrit", name)


def dirt(S, seed, amount=1.0):
    """Taches de saleté : 0 = propre, 1 = très sale."""
    d = fbm(S, seed, 6, 3)
    d = np.clip((d - 0.42) * 2.2, 0, 1) * amount
    fine = fbm(S, seed + 1, 4, 24)
    return np.clip(d * (0.7 + 0.5 * fine), 0, 1)


def tile(name, c0, c1, seed, period=5.0, wstr=0.10, dirt_amt=0.8, dirt_col=(70, 55, 38), S=512):
    n = fbm(S, seed, 5, 6)
    base = mix(c0, c1, n) * weave(S, period, wstr)[..., None]
    d = dirt(S, seed + 7, dirt_amt)
    base = base * (1 - 0.55 * d[..., None]) + np.array(dirt_col, float)[None, None, :] * 0.55 * d[..., None]
    base *= (0.92 + 0.16 * fbm(S, seed + 3, 3, 8))[..., None]
    save(name, base)


# --- tissus en tuiles
tile("pnj_manche.png", (58, 64, 88), (80, 86, 112), 11, 4.0, 0.12, 0.9, (88, 74, 56))                   # indigo délavé
tile("pnj_pantalon.png", (108, 94, 58), (138, 120, 76), 21, 5.0, 0.08, 1.0, (84, 66, 42))                # kaki sali
tile("pnj_gilet.png", (80, 88, 54), (108, 114, 70), 31, 4.0, 0.14, 0.9, (74, 64, 44))                     # olive passé
tile("pnj_foulard.png", (140, 112, 68), (172, 142, 92), 41, 6.0, 0.07, 0.7, (96, 78, 44))                 # kaki clair
tile("pnj_masque.png", (30, 30, 33), (46, 46, 50), 51, 3.5, 0.10, 0.4, (26, 24, 24))                      # noir délavé

# --- cuir brun : grain, éraflures claires, bords usés
S = 512
n = fbm(S, 61, 5, 8)
img = mix((70, 38, 20), (112, 64, 34), n)
grain = fbm(S, 62, 3, 64)
img *= (0.88 + 0.24 * grain)[..., None]
rng = np.random.default_rng(63)
yy, xx = np.mgrid[0:S, 0:S]
scuff = np.zeros((S, S))
for _ in range(220):
    x0, y0 = rng.integers(0, S), rng.integers(0, S)
    a = rng.uniform(0, np.pi); L = rng.integers(10, 60)
    for t in range(L):
        x, y = int(x0 + t * np.cos(a)) % S, int(y0 + t * np.sin(a)) % S
        scuff[y, x] = rng.uniform(0.4, 1.0)
img += scuff[..., None] * np.array([46, 34, 24], float)[None, None, :]
d = dirt(S, 64, 0.7)
img = img * (1 - 0.5 * d[..., None]) + np.array([60, 48, 34], float)[None, None, :] * 0.5 * d[..., None]
save("pnj_cuir.png", img)

# --- tunique : panneaux (indigo | brun | indigo), coutures, broderie du col, saleté plus forte en bas
S = 1024
u = np.linspace(0, 1, S)[None, :].repeat(S, 0)           # 0..1 = de -20 cm à +20 cm autour de l'axe du corps
v = np.linspace(0, 1, S)[:, None].repeat(S, 1)           # ligne 0 = haut de l'image = z haut ; v = (z - 0,5) / 1,0 en bas de l'image
vimg = 1 - v                                             # hauteur normalisée (0 = bas de la tunique, 1 = haut)
c_half = 0.215                                           # demi-largeur du panneau brun (fraction de la largeur)
edge = np.abs(u - 0.5)
panel = np.clip((edge - c_half) * 90 + 0.5, 0, 1)        # 0 = brun, 1 = indigo (bord net)
ind = mix((58, 64, 90), (82, 88, 116), fbm(S, 71, 6, 5)) * weave(S, 5.0, 0.12)[..., None]
brn = mix((112, 80, 52), (146, 106, 70), fbm(S, 72, 6, 5)) * weave(S, 5.0, 0.12)[..., None]
img = brn * (1 - panel[..., None]) + ind * panel[..., None]
seam = np.exp(-((edge - c_half) / 0.004) ** 2)           # coutures en relief (plus sombres)
img *= (1 - 0.35 * seam)[..., None]
seam2 = np.exp(-((edge - c_half - 0.012) / 0.002) ** 2) * ((np.arange(S)[:, None] // 6) % 2)   # points de couture
img += (seam2 * 34)[..., None]
# broderie du col : fine bande verticale claire au centre, entre z = 1,28 et 1,46 (vimg 0,78..0,96)
emb = (np.abs(u - 0.5) < 0.030) & (vimg > 0.78) & (vimg < 0.97)
pat = (np.sin(2 * np.pi * vimg * 90) > 0.2) & (np.abs(np.abs(u - 0.5) - 0.012) < 0.0035)
img[emb & pat] = (176, 160, 134)
# saleté : plus forte en bas (ourlet), aux flancs ; usure claire par endroits
low = np.clip((0.55 - vimg) * 1.8, 0, 1)
d = np.clip(dirt(S, 73, 1.0) + 0.55 * low * fbm(S, 74, 5, 6), 0, 1)
img = img * (1 - 0.6 * d[..., None]) + np.array([78, 62, 44], float)[None, None, :] * 0.6 * d[..., None]
fade = np.clip((fbm(S, 75, 5, 4) - 0.62) * 3, 0, 1)
img = img * (1 - 0.25 * fade[..., None]) + np.array([118, 112, 108], float)[None, None, :] * 0.25 * fade[..., None]
hem = np.clip((0.06 - vimg) * 25, 0, 1)                  # ourlet très sali
img = img * (1 - 0.45 * hem[..., None]) + np.array([62, 50, 36], float)[None, None, :] * 0.45 * hem[..., None]
save("pnj_tunique.png", img)
