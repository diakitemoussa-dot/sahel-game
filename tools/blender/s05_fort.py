import math, random
import common as C


def run():
    col = C.coll("Fort")
    C.clear_collection(col)
    rnd = random.Random(53)
    fx, fy = C.ZONES["fort"]["c"]
    z0 = C.ZONES["fort"]["h"]
    mur = C.get_mat("Mur_Fort", (0.62, 0.45, 0.30), 1.0)
    N, R = 24, 24.0
    seg = 2.0 * math.pi * R / N + 0.4

    for k in range(N):
        a = k * math.tau / N
        x, y = fx + R * math.cos(a), fy + R * math.sin(a)
        if k == 0:
            continue  # porte
        ruined = rnd.random() < 0.25
        h = rnd.uniform(1.2, 2.5) if ruined else 6.0
        C.box(f"Rempart_{k:02d}", (seg, 1.6, h), (x, y, z0 + h / 2.0 - 0.1), col, mur, rot_z=a + math.pi / 2)

    for k in range(3, N, 6):
        a = k * math.tau / N
        x, y = fx + R * math.cos(a), fy + R * math.sin(a)
        C.cone(f"Tour_{k:02d}", 3.4, 3.0, 10.0, 12, (x, y, z0 + 5.0 - 0.1), col, mur)

    C.box("Donjon", (12.0, 12.0, 9.0), (fx, fy, z0 + 4.5 - 0.1), col, mur)
    C.box("Donjon_Breche", (4.0, 2.0, 4.0), (fx + 6.0, fy, z0 + 2.0), col,
          C.get_mat("Ombre", (0.08, 0.06, 0.05), 1.0))

    for i in range(18):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(8.0, 28.0)
        x, y = fx + r * math.cos(a), fy + r * math.sin(a)
        s = rnd.uniform(0.6, 1.6)
        C.box(f"Gravats_{i+1:02d}", (s, s * 1.3, s * 0.8), (x, y, z0 + s * 0.4 - 0.1), col, mur,
              rot_z=rnd.uniform(0, 3.14))
