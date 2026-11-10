import math, random, bpy, bmesh
import common as C


def _trunk(bm, h, lean_a, lean):
    N, seg = 10, 8
    rings = []
    cx = cy = 0.0
    for i in range(N):
        t = i / (N - 1)
        cx = math.cos(lean_a) * lean * t * t * h * 0.12
        cy = math.sin(lean_a) * lean * t * t * h * 0.12
        r = 0.40 - 0.18 * t + 0.025 * math.sin(i * 2.7)
        ring = []
        for k in range(seg):
            a = k * math.tau / seg
            ring.append(bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), h * t - 0.4)))
        rings.append(ring)
    for i in range(N - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg],
                          rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bm.faces.new(rings[-1])
    return (cx, cy, h - 0.3)


def _frond(bm, base, a, L, th0, droop, wmax, S=8):
    d = (math.cos(a), math.sin(a))
    p = (-d[1], d[0])
    rows = []
    for s in range(S + 1):
        u = s / S
        hd = L * u * math.cos(th0)
        vz = L * u * math.sin(th0) - droop * L * u * u
        w = wmax * math.sin(math.pi * min(1.0, u ** 0.55)) * (1 - 0.25 * u) + 0.02
        cx, cy, cz = base[0] + d[0] * hd, base[1] + d[1] * hd, base[2] + vz
        fold = 0.35 * w
        rows.append((bm.verts.new((cx - p[0] * w, cy - p[1] * w, cz + fold)),
                     bm.verts.new((cx, cy, cz)),
                     bm.verts.new((cx + p[0] * w, cy + p[1] * w, cz + fold))))
    for s in range(S):
        a0, b0, c0 = rows[s]
        a1, b1, c1 = rows[s + 1]
        bm.faces.new((a0, b0, b1, a1))
        bm.faces.new((b0, c0, c1, b1))


def palm(col, name, x, y, rnd, mats):
    z0 = C.height_at(x, y)
    h = rnd.uniform(7.5, 11.5)
    bm = bmesh.new()
    top = _trunk(bm, h, rnd.uniform(0, math.tau), rnd.uniform(0.4, 1.6))
    me = bpy.data.meshes.new(name + "_Tronc")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    C.new_obj(name + "_Tronc", me, col, mats["tronc"], (x, y, z0))

    bm = bmesh.new()
    n = 14
    for k in range(n):
        a = k * math.tau / n + rnd.uniform(-0.15, 0.15)
        _frond(bm, top, a, rnd.uniform(3.8, 5.0), rnd.uniform(0.75, 1.15),
               rnd.uniform(0.8, 1.3), 0.55)
    for k in range(4):  # palmes mortes qui pendent
        a = rnd.uniform(0, math.tau)
        _frond(bm, (top[0], top[1], top[2] - 0.2), a, rnd.uniform(2.6, 3.4),
               rnd.uniform(-0.1, 0.2), 3.0, 0.45)
    me = bpy.data.meshes.new(name + "_Palmes")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    C.new_obj(name + "_Palmes", me, col, mats["palme"], (x, y, z0))


def run():
    col = C.coll("Oasis")
    C.clear_collection(col)
    rnd = random.Random(23)
    ox, oy = C.ZONES["oasis"]["c"]
    mats = {"tronc": C.get_mat("Tronc", (0.35, 0.25, 0.15), 0.95),
            "palme": C.get_mat("Palme", (0.18, 0.38, 0.12), 0.8)}
    n = 0
    while n < 25:
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(18.0, 42.0)
        x, y = ox + r * math.cos(a), oy + r * math.sin(a)
        palm(col, f"Palmier_{n+1:02d}", x, y, rnd, mats)
        n += 1
    herbe = C.get_mat("Herbe", (0.30, 0.42, 0.15), 0.9)
    for i in range(40):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(14.0, 30.0)
        x, y = ox + r * math.cos(a), oy + r * math.sin(a)
        C.cone(f"Touffe_{i+1:02d}", 0.7, 0.05, 0.6, 6,
               (x, y, C.on_ground(x, y, 0.6, 0.05)), col, herbe)
