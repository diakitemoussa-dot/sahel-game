import math, random, bpy, bmesh
import common as C


def far_from_zones(x, y, margin=8.0):
    for z in C.ZONES.values():
        if math.hypot(x - z["c"][0], y - z["c"][1]) < z["r"] + margin:
            return False
    return True


def rock(name, x, y, s, rnd, col, mat):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=s)
    for v in bm.verts:
        k = rnd.uniform(0.75, 1.2)
        v.co.x *= k * 1.2
        v.co.y *= k
        v.co.z *= k * 0.7
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return C.new_obj(name, me, col, mat, (x, y, C.height_at(x, y) + s * 0.2), (0, 0, rnd.uniform(0, 3.14)))


def run():
    col = C.coll("Props")
    C.clear_collection(col)
    rnd = random.Random(71)
    roche = C.get_mat("Roche", (0.45, 0.33, 0.25), 1.0)
    bois = C.get_mat("Bois_Mort", (0.28, 0.20, 0.14), 1.0)

    n = 0
    while n < 80:
        x, y = rnd.uniform(-240, 240), rnd.uniform(-240, 240)
        if not far_from_zones(x, y, 4.0):
            continue
        n += 1
        rock(f"Rocher_{n:02d}", x, y, rnd.uniform(0.8, 3.2), rnd, col, roche)

    n = 0
    while n < 30:
        x, y = rnd.uniform(-240, 240), rnd.uniform(-240, 240)
        if not far_from_zones(x, y):
            continue
        n += 1
        h = rnd.uniform(2.0, 3.5)
        C.cone(f"Arbre_Mort_{n:02d}", 0.2, 0.08, h, 6, (x, y, C.on_ground(x, y, h, 0.1)), col, bois)
        for b in range(3):
            a = rnd.uniform(0, math.tau)
            C.box(f"Arbre_Mort_{n:02d}_Branche_{b}", (1.2, 0.08, 0.08),
                  (x + 0.5 * math.cos(a), y + 0.5 * math.sin(a), C.height_at(x, y) + h * 0.75),
                  col, bois, rot_z=a)

    # Épave de pick-up
    px, py = -60.0, -40.0
    rouille = C.get_mat("Rouille", (0.42, 0.22, 0.12), 0.8)
    pneu = C.get_mat("Pneu", (0.05, 0.05, 0.05), 0.9)
    gz = C.height_at(px, py)
    C.box("Epave_Chassis", (4.8, 1.9, 0.5), (px, py, gz + 0.8), col, rouille, rot_z=0.4)
    C.box("Epave_Cabine", (1.8, 1.8, 1.0), (px + 1.2 * math.cos(0.4), py + 1.2 * math.sin(0.4), gz + 1.5), col, rouille, rot_z=0.4)
    C.box("Epave_Benne", (2.4, 1.9, 0.7), (px - 1.3 * math.cos(0.4), py - 1.3 * math.sin(0.4), gz + 1.2), col, rouille, rot_z=0.4)
    for i, (dx, dy) in enumerate([(1.6, 1.0), (1.6, -1.0), (-1.6, 1.0), (-1.6, -1.0)]):
        C.cone(f"Epave_Roue_{i+1}", 0.45, 0.45, 0.3, 12,
               (px + dx, py + dy, gz + 0.45), col, pneu, rot_z=0.4)
