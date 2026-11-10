import math, random
import common as C


def run():
    col = C.coll("Village")
    C.clear_collection(col)
    rnd = random.Random(37)
    vx, vy = C.ZONES["village"]["c"]
    banco = C.get_mat("Banco", (0.58, 0.40, 0.27), 1.0)
    banco_clair = C.get_mat("Banco_Clair", (0.68, 0.50, 0.34), 1.0)

    n = 0
    for i in (-2, -1, 1, 2):
        for j in (-2, -1, 1, 2):
            n += 1
            x = vx + i * 16.0 + rnd.uniform(-2, 2)
            y = vy + j * 16.0 + rnd.uniform(-2, 2)
            w, d, h = rnd.uniform(6, 9), rnd.uniform(6, 9), rnd.uniform(3.2, 5.2)
            rz = rnd.uniform(-0.15, 0.15)
            C.box(f"Maison_{n:02d}", (w, d, h), (x, y, C.on_ground(x, y, h)), col, banco, rz)
            C.box(f"Maison_{n:02d}_Acrotere", (w + 0.4, d + 0.4, 0.4),
                  (x, y, C.height_at(x, y) + h - 0.3 + 0.2), col, banco_clair, rz)

    # Mosquée au centre : salle, deux minarets tronconiques
    C.box("Mosquee_Salle", (14.0, 8.0, 7.0), (vx, vy, C.on_ground(vx, vy, 7.0)), col, banco_clair)
    for s, dx in (("G", -5.5), ("D", 5.5)):
        x = vx + dx
        C.cone(f"Mosquee_Minaret_{s}", 1.8, 1.0, 11.0, 8,
               (x, vy, C.on_ground(x, vy, 11.0)), col, banco_clair)
        C.cone(f"Mosquee_Pointe_{s}", 0.6, 0.0, 1.8, 6,
               (x, vy, C.height_at(x, vy) + 11.0 + 0.7), col, banco_clair)

    # Toguna : toit bas sur piliers
    tx, ty = vx + 28.0, vy - 40.0
    C.box("Toguna_Toit", (7.0, 5.0, 0.5), (tx, ty, C.height_at(tx, ty) + 2.4), col, banco)
    for k, (px, py) in enumerate([(-3, -2), (3, -2), (-3, 2), (3, 2)]):
        C.box(f"Toguna_Pilier_{k+1}", (0.4, 0.4, 2.4),
              (tx + px, ty + py, C.on_ground(tx + px, ty + py, 2.4, 0.1)), col, banco)

    # Murets de clôture
    for k in range(10):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(34, 46)
        x, y = vx + r * math.cos(a), vy + r * math.sin(a)
        C.box(f"Muret_{k+1:02d}", (rnd.uniform(4, 8), 0.5, 1.4),
              (x, y, C.on_ground(x, y, 1.4)), col, banco, rot_z=rnd.uniform(0, 3.14))
