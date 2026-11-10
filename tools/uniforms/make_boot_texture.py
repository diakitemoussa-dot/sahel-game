"""Texture du cuir nubuck des bottes : beige moutarde (couleur relevée sur l'image, ~ (205, 165, 85)), fin velours (grain fin),
légères irrégularités plus claires et plus foncées. Périodique (sans raccord). Usage : python -I make_boot_texture.py <dossier de sortie>"""
import os, sys
import numpy as np
from PIL import Image

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
S = 512
rng = np.random.default_rng(57)
base = np.array([203, 163, 86], float)
yy, xx = np.mgrid[0:S, 0:S].astype(float)
fine = rng.normal(0, 3.2, (S, S))                                     # velours du nubuck
big = 3.0 * np.sin(2 * np.pi * xx / S * 2 + 0.7) * np.cos(2 * np.pi * yy / S * 3)
# petites marques de frottement (plus claires) et de pli (plus sombres)
marks = np.zeros((S, S))
for _ in range(140):
    x0, y0 = rng.integers(0, S), rng.integers(0, S)
    a = rng.uniform(0, np.pi); L = rng.integers(8, 30); s = rng.choice([-1, 1])
    for t in range(L):
        x, y = int(x0 + t * np.cos(a)) % S, int(y0 + t * np.sin(a)) % S
        marks[y, x] += s * 6.0
img = base[None, None, :] + (fine + big + marks)[..., None] * np.array([1.0, 0.95, 0.7])
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(out, "botte_nubuck.png"))
print("écrit botte_nubuck.png")
