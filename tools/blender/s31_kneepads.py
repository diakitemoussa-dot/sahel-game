"""Genouillères de la tenue militaire, d'après l'image de référence : coque en plastique beige légèrement brillante, en forme de bouclier
(plus large en haut, légère taille vers le bas), bord plat autour d'un panneau central bombé, 6 rivets, liseré de mousse dessous,
et deux larges sangles beiges avec boucle à clip sur le côté extérieur.

La coque est posée SUR LA JAMBE : chaque point est projeté sur la surface du pantalon (rayons horizontaux) et décalé radialement, donc
elle épouse la jambe. Poids : cuisse (UpLeg) en haut, jambe (Leg) en bas, donc la genouillère suit la flexion du genou.
Ce script n'efface QUE ses propres pièces (U_Genouillere*, U_SangleLeft*, U_SangleRight*).
Usage :  import s31_kneepads as G; G.run()"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix
import s24_uniform_military as U

B = U.B
ZC = 0.505                                    # centre de la genouillère (articulation du genou à 0,507)
HH = 0.088                                    # demi-hauteur (17,6 cm)
OWN = ("U_Genouillere", "U_SangleLeft", "U_SangleRight")


def sm(a, b, x):
    return U._smooth(0, a, b, x)


def width_at(v):
    """Demi-largeur du bouclier à la hauteur relative v (-1 bas, +1 haut) : plus large en haut, taille en bas, bouts arrondis."""
    top = 1.0 + 0.09 * sm(-0.2, 0.8, v)
    waist = 1.0 - 0.13 * math.exp(-((v + 0.22) / 0.26) ** 2)
    ends = max(0.0, 1.0 - abs(v) ** 3.0) ** 0.5
    return 0.057 * top * waist * ends


def wfun(side):
    def f(z):
        t = sm(0.46, 0.56, z)
        return {B + side + "Leg": t, B + side + "UpLeg": 1 - t}
    return f


def pants_verts():
    o = bpy.data.collections[U.COLL].objects["U_Pantalon"]
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    mw = ev.matrix_world
    verts = [mw @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return verts


class Leg:
    """Jambe modélisée par une section elliptique lisse à chaque hauteur (centre, demi-axes), mesurée sur le pantalon puis lissée :
    la surface du pantalon est trop irrégulière pour qu'on s'y appuie directement."""

    def __init__(self, sgn, verts):
        self.sgn = sgn
        self.zs = [0.34 + 0.01 * k for k in range(48)]
        rows = []
        for z in self.zs:
            pts = [v for v in verts if abs(v.z - z) < 0.008 and (v.x - U.CX) * sgn > 0.025]
            if not pts:
                rows.append(rows[-1] if rows else None)
                continue
            x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
            y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
            rows.append(((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2))
        for k in range(len(rows)):
            if rows[k] is None:
                rows[k] = next(r for r in rows if r is not None)
        for _ in range(4):                                     # lissage répété : plus aucune ondulation sur la coque
            sm_ = []
            for k in range(len(rows)):
                win = rows[max(0, k - 4):k + 5]
                sm_.append(tuple(sum(r[i] for r in win) / len(win) for i in range(4)))
            rows = sm_
        self.rows = rows

    def ell(self, z):
        t = (z - self.zs[0]) / 0.01
        k = int(max(0, min(len(self.rows) - 2, math.floor(t))))
        f = max(0.0, min(1.0, t - k))
        return tuple(self.rows[k][i] * (1 - f) + self.rows[k + 1][i] * f for i in range(4))

    def axis(self, z):
        e = self.ell(z)
        return e[0], e[1]

    def at(self, phi, z, lift):
        """Point de la surface à l'angle phi (0 = devant, + vers +x) décalé de `lift` selon la normale de l'ellipse."""
        cx, cy, rx, ry = self.ell(z)
        n = Vector((math.sin(phi) / rx, -math.cos(phi) / ry, 0.0)).normalized()
        return Vector((cx + rx * math.sin(phi), cy - ry * math.cos(phi), z)) + n * lift, n

    def front_point(self, x, z, lift):
        """Point à la hauteur z, au décalage latéral x par rapport à l'axe, sur le devant de la jambe."""
        cx, cy, rx, ry = self.ell(z)
        phi = math.asin(max(-0.985, min(0.985, x / rx)))
        p, n = self.at(phi, z, lift)
        return p, n


def orient(bm, leg_center):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if sum(f.normal.dot(f.calc_center_median() - leg_center) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)


def shield_sheet(leg, scale, height_fn, NU=26, NV=48):
    """Nappe en forme de bouclier posée sur la jambe. height_fn(r2, u, v) = hauteur au-dessus de la surface."""
    bm = bmesh.new()
    rows = []
    for i in range(NU + 1):
        col = []
        for j in range(NV + 1):
            u = -1 + 2 * i / NU
            v = -1 + 2 * j / NV
            z = ZC + v * HH * scale
            x = u * width_at(v) * scale
            r2 = max(abs(u), abs(v)) ** 2.4
            p, _ = leg.front_point(x, z, height_fn(r2, u, v))
            col.append(bm.verts.new(p))
        rows.append(col)
    for i in range(NU):
        for j in range(NV):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    ax, ay = leg.axis(ZC)
    orient(bm, Vector((ax, ay, ZC)))
    return bm


def solid(name, bm, thick, mat, col, side, offset=1.0):
    me = bpy.data.meshes.new(name + "_t")
    bm.to_mesh(me)
    bm.free()
    tmp = bpy.data.objects.new(name + "_t", me)
    col.objects.link(tmp)
    s = tmp.modifiers.new("S", 'SOLIDIFY'); s.thickness = thick; s.offset = offset
    new = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.meshes.remove(me)
    b2 = bmesh.new(); b2.from_mesh(new); bpy.data.meshes.remove(new)
    edges = [e for e in b2.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > 0.7]
    if edges:
        bmesh.ops.bevel(b2, geom=edges, offset=0.0009, segments=2, affect='EDGES')
    return U._finish(name, b2, mat, col, wfun(side), None)


def strap_ring(leg, z, width, thick, mat, col, side, name, N=72):
    """Sangle : bande plate qui fait tout le tour de la jambe, posée sur le pantalon."""
    bm = bmesh.new()
    top, bot = [], []
    for k in range(N):
        phi = 2 * math.pi * k / N
        p, _ = leg.at(phi, z, 0.0048)
        top.append(bm.verts.new(Vector((p.x, p.y, z + width / 2))))
        bot.append(bm.verts.new(Vector((p.x, p.y, z - width / 2))))
    for k in range(N):
        bm.faces.new((bot[k], bot[(k + 1) % N], top[(k + 1) % N], top[k]))
    ax, ay = leg.axis(z)
    orient(bm, Vector((ax, ay, z)))
    return solid(name, bm, thick, mat, col, side)


def buckle(leg, sgn, z, M, col, side, tag):
    """Boucle à clip sur le côté extérieur de la sangle, avec le coulisseau tout près."""
    out = []
    phi = sgn * math.pi / 2
    p, n = leg.at(phi, z, 0.0)
    tang = Vector((n.y * -1.0, n.x, 0.0)) * (1 if sgn > 0 else -1)   # tangente horizontale, vers l'avant de la jambe
    tang = Vector((0, -1, 0)) if abs(tang.length) < 1e-6 else tang.normalized()
    if tang.y > 0:
        tang = -tang
    fr = Matrix(((tang.x, -n.x, 0.0), (tang.y, -n.y, 0.0), (0.0, 0.0, 1.0)))
    c1 = p + n * 0.0074
    out.append(U.box(f"U_GenouillereBoucle{side}{tag}", (c1.x - U.CX, c1.y - U.CY, z), (0.0112, 0.0042, 0.0072), M["boucle"], col,
                     weights=wfun(side)(z), bevel=0.0018, frame=fr))
    p2, n2 = leg.at(phi - sgn * 0.17, z, 0.0060)
    out.append(U.box(f"U_GenouillereCoulisse{side}{tag}", (p2.x - U.CX, p2.y - U.CY, z), (0.0060, 0.0034, 0.0085), M["strap"], col,
                     weights=wfun(side)(z), bevel=0.0012,
                     frame=Matrix(((tang.x, -n2.x, 0.0), (tang.y, -n2.y, 0.0), (0.0, 0.0, 1.0)))))
    return out


def rivet(leg, u, v, side, M, col, name):
    w = width_at(v)
    z = ZC + v * HH
    h = 0.0040 + 0.0060 * (1 - max(abs(u), abs(v)) ** 2.4) ** 0.7 + 0.0050 + 0.0011
    p, r = leg.front_point(u * w, z, h)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=0.0033, radius2=0.0028, depth=0.0024)
    nz = Vector((0, 0, 1))
    tv = nz.cross(r).normalized()
    bv = r.cross(tv).normalized()
    for vv in bm.verts:
        vv.co = tv * vv.co.x + bv * vv.co.y + r * vv.co.z
    bmesh.ops.translate(bm, vec=p, verts=bm.verts)
    return U._finish(name, bm, M["rivet"], col, wfun(side), None)


def knee(sgn, side, verts, M, col):
    leg = Leg(sgn, verts)
    parts = []
    # mousse : liseré plus grand sous la coque
    foam = shield_sheet(leg, 1.07, lambda r2, u, v: 0.0022)
    parts.append(solid(f"U_GenouillereMousse{side}", foam, 0.0030, M["mousse"], col, side))
    # coque : bord plat qui s'épaissit vers le centre (bombé)
    shell = shield_sheet(leg, 1.0, lambda r2, u, v: 0.0040 + 0.0060 * (1 - r2) ** 0.7)
    parts.append(solid(f"U_GenouillereCoque{side}", shell, 0.0050, M["coque"], col, side))
    # panneau central surélevé (marche de 3,5 mm)
    panel = shield_sheet(leg, 0.80, lambda r2, u, v: 0.0040 + 0.0060 * (1 - max(abs(u), abs(v)) ** 2.4 * 0.80 ** 2.4) ** 0.7 + 0.0068)
    parts.append(solid(f"U_GenouillerePanneau{side}", panel, 0.0030, M["coque"], col, side))
    # six rivets sur le bord
    for k, (u, v) in enumerate(((-0.86, 0.60), (0.86, 0.60), (-0.90, -0.02), (0.90, -0.02), (-0.66, -0.80), (0.66, -0.80))):
        parts.append(rivet(leg, u, v, side, M, col, f"U_GenouillereRivet{side}{k}"))
    # deux sangles + boucles
    for tag, z in (("H", ZC + 0.047), ("B", ZC - 0.047)):
        parts.append(strap_ring(leg, z, 0.036, 0.0030, M["strap"], col, side, f"U_GenouillereSangle{side}{tag}"))
        parts += buckle(leg, sgn, z, M, col, side, tag)
    return parts


def run():
    U._setup()
    col = bpy.data.collections[U.COLL]
    arm = U.arm
    pose = arm.data.pose_position
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    try:
        for o in list(col.objects):
            if o.name.startswith(OWN):
                me = o.data if o.type == 'MESH' else None
                bpy.data.objects.remove(o, do_unlink=True)
                if me is not None and me.users == 0:
                    bpy.data.meshes.remove(me)
        M = U.materials()
        M["coque"] = U._mat("U_GenouCoque", (0.46, 0.30, 0.060), 0.34, 0.0)
        M["mousse"] = U._mat("U_GenouMousse", (0.26, 0.17, 0.035), 0.95, 0.0)
        M["strap"] = U._mat("U_GenouSangle", (0.34, 0.24, 0.060), 0.88, 0.0)
        M["boucle"] = U._mat("U_GenouBoucle", (0.045, 0.055, 0.022), 0.45, 0.0)
        M["rivet"] = U._mat("U_GenouRivet", (0.30, 0.20, 0.045), 0.30, 0.55)
        verts = pants_verts()
        parts = []
        for sgn, side in ((1, "Left"), (-1, "Right")):
            parts += knee(sgn, side, verts, M, col)
    finally:
        arm.data.pose_position = pose
    print("genouillères :", len(parts), "pièces")
    return parts
