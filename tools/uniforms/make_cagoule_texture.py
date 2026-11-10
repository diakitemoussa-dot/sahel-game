"""Texture de la cagoule / du cache-cou : tissu en maille moutarde (couleur relevée sur l'image de référence :
~ (150, 110, 35), plus clair ~ (175, 135, 50) sur les crêtes, plus sombre ~ (110, 78, 20) dans les creux).
La maille est un tricot jersey : fines côtes verticales et rangées de mailles. Usage : python -I make_cagoule_texture.py <dossier de sortie>"""
import os, sys
import numpy as np
from PIL import Image

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
S = 512
rng = np.random.default_rng(21)
base = np.array([150, 110, 35], float)
yy, xx = np.mgrid[0:S, 0:S].astype(float)
ribs = np.cos(2 * np.pi * xx / 8.0)                                   # côtes verticales
rows = np.sin(2 * np.pi * (yy / 6.0 + 0.5 * np.sin(2 * np.pi * xx / 16.0)))   # rangées de mailles en V
knit = 5.0 * ribs + 3.5 * rows
# variation à grande échelle (tissu un peu délavé par endroits), périodique donc sans raccord
big = 0.5 * np.sin(2 * np.pi * xx / S * 2) * np.cos(2 * np.pi * yy / S * 3) + 0.5 * np.sin(2 * np.pi * (xx + yy) / S * 5)
img = base[None, None, :] + (knit + 9.0 * big + rng.normal(0, 2.2, (S, S)))[..., None] * np.array([1.0, 0.95, 0.55])
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(out, "cagoule_tissu.png"))
print("écrit cagoule_tissu.png")
