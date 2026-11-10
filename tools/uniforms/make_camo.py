"""Texture camouflage sans raccord (tuile) + écusson, pour la tenue militaire.
Les couleurs sont relevées sur l'image de référence (zone de pantalon), puis un camouflage pixélisé est généré par bruit
périodique (la tuile se répète sans couture). Usage : python -I make_camo.py <image de référence> <dossier de sortie>"""
import sys, os
import numpy as np
from PIL import Image

ref_path, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)

# --- 1) palette : k-means sur la zone du pantalon (vue de dos, 1024 x 1536)
ref = np.asarray(Image.open(ref_path).convert("RGB")).astype(float)
zone = ref[820:1230, 380:640].reshape(-1, 3)
zone = zone[(zone.max(1) - zone.min(1) > 12) | (zone.mean(1) < 120)]          # écarte le fond blanc
rng = np.random.default_rng(3)
def kmeans(pts, k, it=25):
    c = pts[rng.choice(len(pts), k, replace=False)]
    for _ in range(it):
        lab = np.argmin(((pts[:, None, :] - c[None]) ** 2).sum(2), 1)
        c = np.array([pts[lab == i].mean(0) if (lab == i).any() else c[i] for i in range(k)])
    return c
# les verts sont rares et proches des bruns : on les isole d'abord (le vert domine le rouge et surtout le bleu)
is_green = (zone[:, 1] > zone[:, 0] * 0.97) & (zone[:, 1] > zone[:, 2] * 1.25)
print("pixels verts dans la zone:", round(float(is_green.mean()), 2))
green = kmeans(zone[is_green], 2) if is_green.sum() > 200 else np.array([[104, 118, 62], [78, 92, 45]])
others = kmeans(zone[~is_green], 4)
palette = np.array(sorted(list(green) + list(others), key=lambda c: c.sum()))
print("palette relevée (sombre -> clair):", palette.round(0).tolist())

# --- 2) bruit périodique (valeur) : la grille boucle, donc la tuile se répète sans raccord
def periodic_noise(n, cells, seed):
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

SIZE, BLOCK = 1024, 8                       # 128 x 128 cellules pixélisées
N = SIZE // BLOCK
field = 0.40 * periodic_noise(N, 10, 11) + 0.35 * periodic_noise(N, 20, 12) + 0.25 * periodic_noise(N, 40, 13)
field = (field - field.min()) / (field.max() - field.min())
# 4 classes, avec des proportions proches de l'image : beaucoup de sable, du vert, du brun, peu de très foncé
qs = np.quantile(field, [0.10, 0.28, 0.46, 0.66, 0.86])
cls = np.digitize(field, qs)                # 0 très foncé, 1 .. 5 : du plus sombre au plus clair
cols = palette
# petite variation de teinte par cellule pour casser l'aplat
jit = (np.random.default_rng(5).random((N, N, 1)) - 0.5) * 14
img = np.clip(cols[cls] + jit, 0, 255).astype(np.uint8)
img = np.kron(img, np.ones((BLOCK, BLOCK, 1), dtype=np.uint8))
Image.fromarray(img).save(os.path.join(out_dir, "camo_tuile.png"))
print("écrit camo_tuile.png", img.shape, "| proportions:", [round(float((cls == k).mean()), 2) for k in range(len(palette))])

# --- 3) écusson : bandes verticales verte, jaune, rouge (drapeau du Mali), sur fond de patch vert-olive
W, H = 256, 160
flag = np.zeros((H, W, 3), np.uint8)
flag[:, : W // 3] = (20, 154, 63)
flag[:, W // 3: 2 * W // 3] = (252, 209, 22)
flag[:, 2 * W // 3:] = (206, 17, 38)
Image.fromarray(flag).save(os.path.join(out_dir, "ecusson_mali.png"))
print("écrit ecusson_mali.png")
