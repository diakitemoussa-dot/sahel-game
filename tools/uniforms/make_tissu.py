"""Textures de tissu sans raccord pour la tenue militaire : un peu de mélange de teintes + du relief (carte de normales).
 - tissu_gris.png / tissu_gris_n.png : chemise et pantalon (une tuile couvre 0,9 m) : taches douces de gris plus clairs et plus sombres, grain, plis.
 - tissu_noir.png / tissu_noir_n.png : gilet, casque, cagoule (une tuile couvre 12 cm) : noir légèrement nuancé, trame tissée.
Usage : python -I make_tissu.py <dossier de sortie>"""
import sys, os
import numpy as np
from PIL import Image

out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)


def periodic_noise(n, cells, seed):
    """Bruit de valeur périodique (boucle sans couture), valeurs dans [0, 1]."""
    r = np.random.default_rng(seed)
    g = r.random((cells, cells))
    xs = np.linspace(0, cells, n, endpoint=False)
    i0 = np.floor(xs).astype(int) % cells
    i1 = (i0 + 1) % cells
    t = xs - np.floor(xs)
    t = t * t * (3 - 2 * t)
    row0 = g[i0][:, i0] * (1 - t)[None] + g[i0][:, i1] * t[None]
    row1 = g[i1][:, i0] * (1 - t)[None] + g[i1][:, i1] * t[None]
    return row0 * (1 - t)[:, None] + row1 * t[:, None]


def centered(a):
    return (a - a.mean()) / (a.std() + 1e-9)


def normal_map(h, strength):
    """Hauteur périodique -> normales (convention OpenGL, comme Blender et glTF). Rangée 0 = haut de l'image = v maximal."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dr = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5       # le long des rangées (vers le bas de l'image)
    n = np.dstack([-dx * strength, dr * strength, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).round().astype(np.uint8)


def save(arr, name):
    Image.fromarray(arr).save(os.path.join(out_dir, name))
    print("écrit", name, arr.shape)


def srgb_hex(h):
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


# ---------------------------------------------------------------- gris : chemise et pantalon
S = 1024
blotch = centered(periodic_noise(S, 6, 21)) * 0.55 + centered(periodic_noise(S, 14, 22)) * 0.35     # grandes taches douces
mid = centered(periodic_noise(S, 40, 23))                                                          # nuances moyennes
grain = centered(np.random.default_rng(24).random((S, S)))                                           # grain fin
tone = 1.0 + blotch * 0.075 + mid * 0.035 + grain * 0.02                                            # facteur de luminosité autour de 1
warm = centered(periodic_noise(S, 5, 25)) * 0.025                                                    # dérive de teinte : gris tantôt froid, tantôt chaud
base = srgb_hex("6E7074")
img = base[None, None, :] * tone[..., None] * np.stack([1 + warm, np.ones_like(warm), 1 - warm], 2)
save(np.clip(img, 0, 255).astype(np.uint8), "tissu_gris.png")
# même motif en noir (chemise et pantalon noirs) : variation plus marquée, car les écarts se voient moins sur du noir
tone_n = 1.0 + (tone - 1.0) * 2.2
img = srgb_hex("1D1D20")[None, None, :] * tone_n[..., None] * np.stack([1 + warm * 0.5, np.ones_like(warm), 1 - warm * 0.5], 2)
save(np.clip(img, 0, 255).astype(np.uint8), "tissu_noir_grand.png")
h = centered(periodic_noise(S, 10, 31)) * 1.0 + centered(periodic_noise(S, 26, 32)) * 0.6 + centered(periodic_noise(S, 90, 33)) * 0.25 + grain * 0.35
save(normal_map(h, 7.0), "tissu_gris_n.png")

# ---------------------------------------------------------------- noir : gilet, casque, cagoule
T = 512
P = 8                                                                                              # période de la trame en pixels
y, x = np.mgrid[0:T, 0:T]
weave = np.sin(2 * np.pi * x / P) * np.sin(2 * np.pi * y / P)                                       # damier de fils croisés
fil = (np.sin(2 * np.pi * x / (P * 2)) + np.sin(2 * np.pi * y / (P * 2))) * 0.5
patch = centered(periodic_noise(T, 6, 41)) * 0.6 + centered(periodic_noise(T, 24, 42)) * 0.4
tone = 1.0 + patch * 0.28 + weave * 0.12 + centered(np.random.default_rng(43).random((T, T))) * 0.08
base = srgb_hex("141416")
img = base[None, None, :] * tone[..., None]
save(np.clip(img, 0, 255).astype(np.uint8), "tissu_noir.png")
h = weave * 0.8 + fil * 0.3 + patch * 0.15
save(normal_map(h, 3.0), "tissu_noir_n.png")
