"""Lunettes de sport enveloppantes de la tenue militaire, d'après l'image de référence : un verre sombre d'un seul tenant qui
suit la courbure du visage (arc autour de la tête), échancré sur le nez, monture noire fine tout autour, branches qui longent le crâne
jusqu'aux oreilles. Tout est attaché à l'os de la tête.

Ce script n'efface QUE ses propres pièces (U_Lunettes*, et les anciennes U_Verre*, U_Branche*, U_LunettesPont) : il ne touche ni au casque
(retouché à la main par l'utilisateur), ni au gilet, ni au reste de la tenue.

Usage dans Blender :  import s28_glasses as G; G.run()"""
import math
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import s24_uniform_military as U

B = U.B
HEAD = {B + "Head": 1.0}
CY0 = -0.030                      # axe de la tête en y
STANDOFF = 0.011                  # le verre est à 1,1 cm du visage
TH_MAX = 38.0                     # demi-ouverture de l'arc, en degrés
Z_TOP = 1.680                     # haut du verre : sous la visière du casque
OLD = ("U_Lunettes", "U_Verre", "U_Branche")


def z_bottom(x):
    """Bas du verre : échancrure sur le nez au centre, 1,641 sur les côtés."""
    return 1.634 + 0.014 * (1 - U._smooth(0, 0.010, 0.028, abs(x)))


_RS = {}


def face_radius(th):
    """Rayon (depuis l'axe de la tête) de la peau au niveau des yeux dans la direction th (radians), arcade sourcilière et nez compris, lissé."""
    if not _RS:
        pts = {}
        dg = bpy.context.evaluated_depsgraph_get()
        ev = bpy.data.objects["Body"].evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            p = ev.matrix_world @ v.co
            if 1.642 <= p.z <= 1.686:
                x, y = p.x - U.CX, p.y - U.CY
                if y < CY0:
                    k = int(round(math.degrees(math.atan2(x, -(y - CY0))) / 2.0))
                    pts[k] = max(pts.get(k, 0.0), math.hypot(x, y - CY0))
        ev.to_mesh_clear()
        ks = list(range(-30, 31))
        base = pts.get(0, 0.11)
        vals = [pts.get(k, None) for k in ks]
        last = base
        for i, v in enumerate(vals):                          # trous éventuels : on reprend le voisin
            vals[i] = v if v is not None else last
            last = vals[i]
        for _ in range(3):
            vals = [sum(vals[min(len(vals) - 1, max(0, i + j))] for j in range(-3, 4)) / 7 for i in range(len(vals))]
        for k, v in zip(ks, vals):
            _RS[k] = v
    k = max(-30, min(30, int(round(math.degrees(th) / 2.0))))
    return _RS[k]


def lens_r(th, off=0.0):
    return face_radius(th) + STANDOFF + off


def sheet(off, th_max, margin_x, margin_top, margin_bot, NTH=48, M=10):
    """Nappe courbe (arc de rayon r autour de la tête), en repère monde ; margin_* agrandissent le contour (pour la monture)."""
    bm = bmesh.new()
    th_ext = math.degrees(margin_x / 0.10)
    rows = []
    for i in range(NTH + 1):
        th = math.radians(-(th_max + th_ext) + 2 * (th_max + th_ext) * i / NTH)
        r = lens_r(th, off)
        x = r * math.sin(th)
        y = CY0 - r * math.cos(th)
        zb = z_bottom(x) - margin_bot
        zt = Z_TOP + margin_top
        rows.append([bm.verts.new((U.CX + x, U.CY + y, zb + (zt - zb) * j / M)) for j in range(M + 1)])
    for i in range(NTH):
        for j in range(M):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ctr = Vector((U.CX, U.CY + CY0, 1.66))
    if sum(f.normal.dot(f.calc_center_median() - ctr) for f in bm.faces) < 0:       # normales vers l'extérieur
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return bm


def solid(name, bm, thick, mat, col):
    me = bpy.data.meshes.new(name + "_t")
    bm.to_mesh(me)
    bm.free()
    return U._from_mesh_solid(name, me, thick, mat, col, HEAD, None)


def temples(M, col):
    """Branches : rubans verticaux de 8 mm qui longent le crâne, du bord du verre jusqu'à l'oreille."""
    sk = bmesh.new(); sk.from_mesh(bpy.data.objects["Body"].data)
    bmesh.ops.transform(sk, matrix=U.MW, verts=sk.verts)
    bmesh.ops.delete(sk, geom=[f for f in sk.faces if not all(1.58 < v.co.z < 1.75 for v in f.verts)], context='FACES')
    tree = BVHTree.FromBMesh(sk); sk.free()
    out = []
    for sgn, side in ((1, "G"), (-1, "D")):
        r_end = lens_r(math.radians(TH_MAX))
        x_end = r_end * math.sin(math.radians(TH_MAX))
        way = [(sgn * x_end, CY0 - r_end * math.cos(math.radians(TH_MAX)), 1.666),
               (sgn * 0.080, -0.082, 1.666), (sgn * 0.088, -0.060, 1.665), (sgn * 0.091, -0.042, 1.664)]
        pts = []
        for i in range(len(way) - 1):
            a, b = Vector(way[i]), Vector(way[i + 1])
            pts += [a.lerp(b, k / 6) for k in range(6)]
        pts.append(Vector(way[-1]))
        sm = bmesh.new()
        rows = []
        for p in pts:
            loc, n, _, _ = tree.find_nearest(Vector((U.CX + p.x, U.CY + p.y, p.z)))
            c = loc + n.normalized() * 0.0042
            rows.append((sm.verts.new(c + Vector((0, 0, -0.0045))), sm.verts.new(c + Vector((0, 0, 0.0045)))))
        for i in range(len(rows) - 1):
            sm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
        me = bpy.data.meshes.new("tmp_br"); sm.to_mesh(me); sm.free()
        out.append(U._from_mesh_solid(f"U_LunettesBranche{side}", me, 0.0030, M["monture"], col, HEAD, None))
    return out


TH_IN, TH_OUT = 8.0, 41.0         # chaque verre va de 8° (près du nez) à 41° (vers l'oreille), de chaque côté


def _squircle(px, py, mix=0.45):
    """Carré -> forme arrondie (coins arrondis) : mélange du carré et du disque."""
    dx = px * math.sqrt(max(0.0, 1 - py * py / 2))
    dy = py * math.sqrt(max(0.0, 1 - px * px / 2))
    return px + (dx - px) * mix, py + (dy - py) * mix


def lens_point(sgn, px, py, off=0.0):
    """Point 3D du verre pour des coordonnées (px, py) entre -1 et 1 (px : du nez vers l'oreille, py : bas vers haut)."""
    u, v = px / 2 + 0.5, py / 2 + 0.5
    th = math.radians(sgn * (TH_IN + u * (TH_OUT - TH_IN)))
    r = lens_r(th, off)
    zb = 1.650 - 0.008 * U._smooth(0, 0.0, 1.0, u)               # bas : à peine plus haut près du nez (presque horizontal, comme l'image)
    zt = 1.679 + 0.003 * math.sin(math.pi * min(1.0, max(0.0, u)))   # haut : légèrement bombé
    return Vector((U.CX + r * math.sin(th), U.CY + CY0 - r * math.cos(th), zb + (zt - zb) * v))


def _orient(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ctr = Vector((U.CX, U.CY + CY0, 1.66))
    if sum(f.normal.dot(f.calc_center_median() - ctr) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)


def lens_sheet(sgn, NU=26, NV=10):
    bm = bmesh.new()
    rows = []
    for i in range(NU + 1):
        col = []
        for j in range(NV + 1):
            q = _squircle(-1 + 2 * i / NU, -1 + 2 * j / NV)
            col.append(bm.verts.new(lens_point(sgn, q[0], q[1])))
        rows.append(col)
    for i in range(NU):
        for j in range(NV):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    _orient(bm)
    return bm


def rim_ring(sgn, N=72, gx=1.20, gy=1.34):
    """Monture : anneau autour du verre (bord du verre -> 5 mm plus loin), épaissi ensuite."""
    bm = bmesh.new()
    inner, outer = [], []
    for k in range(N):
        a = 2 * math.pi * k / N
        c, sn = math.cos(a), math.sin(a)
        m = 1.0 / max(abs(c), abs(sn))
        q = _squircle(c * m, sn * m)
        inner.append(bm.verts.new(lens_point(sgn, q[0] * 0.97, q[1] * 0.97, -0.0010)))
        outer.append(bm.verts.new(lens_point(sgn, q[0] * gx, q[1] * gy, -0.0010)))
    for k in range(N):
        bm.faces.new((inner[k], inner[(k + 1) % N], outer[(k + 1) % N], outer[k]))
    _orient(bm)
    return bm


def run():
    U._setup()
    col = bpy.data.collections.get(U.COLL) or bpy.data.collections.new(U.COLL)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        if o.name.startswith(OLD):
            me = o.data if o.type == 'MESH' else None
            bpy.data.objects.remove(o, do_unlink=True)
            if me is not None and me.users == 0:
                bpy.data.meshes.remove(me)
    M = U.materials()
    M["monture"] = U._mat("U_LunettesMonture", (0.040, 0.041, 0.046), 0.38)
    M["verre"] = U._mat("U_LunettesVerre", (0.020, 0.022, 0.026), 0.05)
    try:                                                         # verre fumé translucide : on devine les yeux
        nt = M["verre"].node_tree
        b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Alpha"].default_value = 0.78
        M["verre"].surface_render_method = 'BLENDED'
    except Exception as e:
        print("transparence du verre non réglée :", e)
    parts = []
    for sgn, side in ((1, "G"), (-1, "D")):
        parts.append(solid(f"U_LunettesVerre{side}", lens_sheet(sgn), 0.0024, M["verre"], col))
        parts.append(solid(f"U_LunettesMonture{side}", rim_ring(sgn), 0.0050, M["monture"], col))
    r0 = lens_r(0.0)                                              # pont : barre arquée au-dessus du nez
    parts.append(U.box("U_LunettesPont", (0.0, CY0 - r0 - 0.0005, 1.6775), (0.0135, 0.0032, 0.0052), M["monture"], col, weights=HEAD, bevel=0.0018))
    parts += temples(M, col)
    print("lunettes :", len(parts), "pièces")
    return parts
