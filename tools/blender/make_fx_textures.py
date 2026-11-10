"""Textures d'effets pour les intros (programmes de feuilles d'animation) : boule de feu, fumée, flamme de bouche, étincelle, onde de choc.
Mêmes couleurs de flamme que le jeu (client/src/muzzle.js, heatColor). Usage : python -I make_fx_textures.py <dossier de sortie>"""
import os, sys
import numpy as np
from PIL import Image

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
STOPS = [(0.0, (0.34, 0.07, 0.02)), (0.35, (1.0, 0.38, 0.05)), (0.7, (1.0, 0.72, 0.2)), (1.0, (1.0, 0.96, 0.75))]    # heatColor du jeu


def heat(h):
    h = np.clip(h, 0, 1)
    out = np.zeros(h.shape + (3,), np.float32)
    for (h0, c0), (h1, c1) in zip(STOPS, STOPS[1:]):
        m = (h >= h0) & (h <= h1)
        t = ((h - h0) / (h1 - h0))[..., None]
        out = np.where(m[..., None], np.array(c0) + (np.array(c1) - np.array(c0)) * t, out)
    return out


def fbm(n, seed, octaves=5, shift=(0.0, 0.0)):
    """Bruit de valeur à plusieurs octaves, taille n x n, valeurs 0..1."""
    r = np.random.default_rng(seed)
    acc = np.zeros((n, n), np.float32); amp, tot = 1.0, 0.0
    for o in range(octaves):
        k = 3 * 2 ** o
        g = r.random((k + 2, k + 2)).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((int((k + 2) * n / k), int((k + 2) * n / k)), Image.BICUBIC)
        a = np.asarray(im).astype(np.float32) / 255.0
        ox, oy = int(shift[0] * n / k) % max(1, a.shape[1] - n), int(shift[1] * n / k) % max(1, a.shape[0] - n)
        acc += amp * a[oy:oy + n, ox:ox + n]; tot += amp; amp *= 0.5
    return acc / tot


def sheet(frames, cols, rows, n, fn, name):
    img = np.zeros((rows * n, cols * n, 4), np.uint8)
    for k in range(frames):
        rgba = fn(k / (frames - 1))
        r, c = divmod(k, cols)
        img[r * n:(r + 1) * n, c * n:(c + 1) * n] = (np.clip(rgba, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(os.path.join(OUT, name))
    print("écrit", name, img.shape)


N = 128
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
cx = cy = (N - 1) / 2
D = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (N / 2)
NOISE_A, NOISE_B = fbm(N, 1), fbm(N, 2)


def fire_frame(t):
    # la boule grossit vite puis s'étire et s'éteint ; bords déchiquetés par le bruit ; cœur blanc-jaune qui rougit
    r = 0.22 + 0.62 * np.sqrt(t)
    n1 = fbm(N, 3, shift=(t * 9, t * 5)); wob = (n1 - 0.5) * (0.55 + 0.4 * t)
    inten = np.clip((r + wob - D) / 0.22, 0, 1)
    core = np.clip(((r * (1 - 0.7 * t)) - D + (n1 - 0.5) * 0.3) / 0.25, 0, 1)
    hh = np.clip(0.18 + 0.82 * core * (1 - t) ** 0.7 + 0.25 * inten * (1 - t), 0, 1)
    col = heat(hh)
    a = inten * np.clip(1.15 - t ** 1.8 * 1.15, 0, 1)
    return np.dstack([col, a])


def smoke_frame(t):
    r = 0.38 + 0.22 * t
    n1 = fbm(N, 5, shift=(t * 4, t * 3)); n2 = fbm(N, 6, 4, shift=(t * 7, -t * 5))
    wob = (n1 - 0.5) * 0.7
    inten = np.clip((r + wob - D) / 0.32, 0, 1) * (0.55 + 0.6 * n2)
    shade = 0.10 + 0.20 * n2 + 0.10 * np.clip(1 - D * 1.1, 0, 1) * (1 - t)       # gris sombre, plus clair au centre en vieillissant
    col = np.dstack([shade * 1.02, shade, shade * 0.97])
    a = np.clip(inten, 0, 1) * np.clip(1.25 - t ** 1.6, 0, 1) * 0.92
    return np.dstack([col, a])


def dust_frame(t):
    f = smoke_frame(t)
    col = np.dstack([0.55 + 0.1 * NOISE_A, 0.43 + 0.08 * NOISE_A, 0.30 + 0.06 * NOISE_A])
    return np.dstack([col, f[..., 3] * 0.8])


sheet(64, 8, 8, N, fire_frame, "fx_feu.png")
sheet(32, 8, 4, N, smoke_frame, "fx_fumee.png")
sheet(32, 8, 4, N, dust_frame, "fx_poussiere.png")

# flamme de bouche : étoile à branches inégales, cœur blanc, pointes orange
M = 256
yy2, xx2 = np.mgrid[0:M, 0:M].astype(np.float32)
dx, dy = (xx2 - M / 2) / (M / 2), (yy2 - M / 2) / (M / 2)
rr = np.sqrt(dx ** 2 + dy ** 2); ang = np.arctan2(dy, dx)
spk = np.zeros_like(rr)
for i, (a0, w, ln) in enumerate(((0.0, 0.10, 1.0), (1.2, 0.09, 0.62), (2.5, 0.11, 0.78), (3.6, 0.08, 0.55), (4.7, 0.10, 0.7), (5.6, 0.09, 0.5))):
    da = np.abs(((ang - a0 + np.pi) % (2 * np.pi)) - np.pi)
    spk = np.maximum(spk, np.exp(-(da / w) ** 2) * np.clip(1 - rr / ln, 0, 1) ** 1.3)
core = np.exp(-(rr / 0.22) ** 2)
inten = np.clip(spk * 1.1 + core * 1.2, 0, 1)
col = heat(np.clip(0.25 + 0.75 * inten ** 1.3, 0, 1))
Image.fromarray((np.dstack([col, inten]).clip(0, 1) * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, "fx_bouche.png")); print("écrit fx_bouche.png")

# étincelle : petit point doux ; onde de choc : anneau
S = 64
y3, x3 = np.mgrid[0:S, 0:S].astype(np.float32); r3 = np.sqrt(((x3 - S / 2) / (S / 2)) ** 2 + ((y3 - S / 2) / (S / 2)) ** 2)
sp = np.clip(1 - r3, 0, 1) ** 2
Image.fromarray((np.dstack([heat(0.5 + 0.5 * sp), sp]).clip(0, 1) * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, "fx_etincelle.png")); print("écrit fx_etincelle.png")
ring = np.exp(-((rr - 0.78) / 0.09) ** 2) * (0.6 + 0.4 * NOISE_B[:M, :M].mean() if False else 1.0)
Image.fromarray((np.dstack([np.full(rr.shape + (3,), 0.85, np.float32)[..., 0:3].reshape(M, M, 3), ring * 0.9]).clip(0, 1) * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, "fx_onde.png")); print("écrit fx_onde.png")
