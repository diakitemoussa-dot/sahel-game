"""Peinture de la coque du casque : vert olive mat (couleur relevée sur l'image de référence, ~ (120, 130, 72)),
avec un fin grain de peinture, de légères irrégularités à grande échelle et quelques petites éraflures plus claires.
Périodique (sans raccord). Usage : python -I make_casque_texture.py <dossier de sortie>"""
import os, sys
import numpy as np
from PIL import Image

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
S = 512
rng = np.random.default_rng(31)
base = np.array([116, 127, 70], float)
yy, xx = np.mgrid[0:S, 0:S].astype(float)
grain = rng.normal(0, 2.6, (S, S))
big = 3.5 * np.sin(2 * np.pi * xx / S * 3 + 1.1) * np.cos(2 * np.pi * yy / S * 2) + 2.5 * np.sin(2 * np.pi * (xx - yy) / S * 4)
img = base[None, None, :] + (grain + big)[..., None] * np.array([1.0, 1.0, 0.8])
for _ in range(90):                                              # éraflures : petits traits clairs
    x0, y0 = rng.integers(0, S), rng.integers(0, S)
    L = rng.integers(4, 14); a = rng.uniform(0, np.pi)
    for t in range(L):
        x, y = int(x0 + t * np.cos(a)) % S, int(y0 + t * np.sin(a)) % S
        img[y, x] += np.array([14, 14, 9])
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(out, "casque_peinture.png"))
print("écrit casque_peinture.png")
