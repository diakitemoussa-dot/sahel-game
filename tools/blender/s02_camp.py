import math, random
import common as C


def run():
    col = C.coll("Camp")
    C.clear_collection(col)
    rnd = random.Random(11)
    cx, cy = C.ZONES["camp"]["c"]
    toile = C.get_mat("Toile", (0.78, 0.68, 0.50), 0.95)
    banco = C.get_mat("Banco", (0.58, 0.40, 0.27), 1.0)
    bois = C.get_mat("Bois", (0.30, 0.20, 0.12), 0.9)

    for i in range(6):
        a = i * math.tau / 6.0
        x, y = cx + 20.0 * math.cos(a), cy + 20.0 * math.sin(a)
        C.cone(f"Tente_{i+1:02d}", 3.4, 0.2, 2.8, 4,
               (x, y, C.on_ground(x, y, 2.8, 0.1)), col, toile, rot_z=a + math.pi / 4)

    C.cone("Puits_Margelle", 1.6, 1.6, 1.0, 16,
           (cx, cy, C.on_ground(cx, cy, 1.0, 0.1)), col, banco)
    C.box("Puits_Poteau_G", (0.2, 0.2, 2.4), (cx - 1.2, cy, C.on_ground(cx - 1.2, cy, 2.4, 0.1)), col, bois)
    C.box("Puits_Poteau_D", (0.2, 0.2, 2.4), (cx + 1.2, cy, C.on_ground(cx + 1.2, cy, 2.4, 0.1)), col, bois)

    for i in range(8):
        x = cx + rnd.uniform(-8, 8)
        y = cy + rnd.uniform(-8, 8) - 10
        C.box(f"Caisse_{i+1:02d}", (1.0, 1.0, 0.8),
              (x, y, C.on_ground(x, y, 0.8, 0.05)), col, bois, rot_z=rnd.uniform(0, 3.14))
