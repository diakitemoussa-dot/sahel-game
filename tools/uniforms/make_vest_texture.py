"""Texture du gilet pare-balles : tissu nylon olive uni avec une trame fine (couleurs relevées sur les gros plans).
Les sangles MOLLE, poches et bretelles sont des pièces en relief, pas de la texture. Usage : python -I make_vest_texture.py <dossier de sortie>"""
import os, sys
import numpy as np
from PIL import Image

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
S = 512
rng = np.random.default_rng(7)
base = np.array([112, 120, 58], float)                    # vert olive du tissu du gilet
img = np.zeros((S, S, 3)) + base
yy, xx = np.mgrid[0:S, 0:S]
weave = ((xx // 3 + yy // 3) % 2) * 5.0 - 2.5              # trame en damier fin
img += weave[..., None]
img += rng.normal(0, 2.5, (S, S, 1))
img += (4 * np.sin(xx / 61.0) * np.cos(yy / 83.0))[..., None]   # très légère variation
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(out, "gilet_tissu.png"))
print("écrit gilet_tissu.png")
