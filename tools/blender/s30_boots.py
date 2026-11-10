"""Bottes de combat de la tenue militaire, d'après l'image de référence : nubuck beige, semelle crantée épaisse avec liseré, bout renforcé
avec sa couture, laçage croisé à œillets métalliques, languette et col matelassés, petite patte au sommet. Le pantalon est remonté
et resserré pour retomber en blouson par-dessus la tige.

La botte est construite de zéro (surface paramétrique : sections le long du pied) à l'échelle du pied du personnage (14,5 x 32 cm),
attachée aux os Foot / ToeBase / Leg. Ce script n'efface QUE ses propres pièces (U_Botte*, U_Semelle*, U_Lacet*, U_Oeillet*, U_Languette*)
et ne modifie que le pantalon U_Pantalon (ourlet).
Usage :  import s30_boots as K; K.run()"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import s24_uniform_military as U

B = U.B
XC = 0.1675                                   # centre du pied gauche (x)
Z_BOT, Z_SOLE = -0.012, 0.030                 # dessous de la semelle ; haut de la semelle (début de la tige)
OWN = ("U_Botte", "U_Semelle", "U_Lacet", "U_Oeillet", "U_Languette", "U_Patte")
TEX_TILE = 0.12

WSOLE = [(-0.2125, 0.0), (-0.2075, 0.026), (-0.1950, 0.049), (-0.1700, 0.066), (-0.1300, 0.0745), (-0.0800, 0.0715),
         (-0.0200, 0.0650), (0.0400, 0.0640), (0.0900, 0.0630), (0.1090, 0.0520), (0.1150, 0.0)]
HTOP = [(-0.2100, 0.045), (-0.1960, 0.072), (-0.1600, 0.088), (-0.1250, 0.098), (-0.0950, 0.128), (-0.0700, 0.180),
        (-0.0500, 0.232), (-0.0400, 0.248), (0.0900, 0.248), (0.1000, 0.200), (0.1080, 0.090), (0.1130, 0.040)]


def sm(a, b, x):
    return U._smooth(0, a, b, x)


def interp(tbl, y):
    """Interpolation douce (lissée entre les points) d'une table (y, valeur)."""
    if y <= tbl[0][0]:
        return tbl[0][1]
    for (y0, v0), (y1, v1) in zip(tbl, tbl[1:]):
        if y <= y1:
            t = (y - y0) / (y1 - y0)
            return v0 + (v1 - v0) * (t * t * (3 - 2 * t))
    return tbl[-1][1]


def wd(side, y, z):
    """Poids d'un point de la botte : orteils (ToeBase) devant, jambe (Leg) en haut de la tige, pied (Foot) ailleurs."""
    w_toe = sm(-0.080, -0.130, y) * (1 - sm(0.07, 0.11, z))
    w_leg = sm(0.10, 0.20, z)
    w_foot = max(0.0, 1.0 - w_toe - w_leg)
    return {B + side + "Foot": w_foot, B + side + "ToeBase": w_toe, B + side + "Leg": w_leg}


def finish(name, bm, mat, col, side):
    """bm en repère monde -> objet attaché à l'armature, avec des poids qui dépendent de la position."""
    bmesh.ops.transform(bm, matrix=U.MINV, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    o.parent = U.arm
    me.materials.append(mat)
    o.modifiers.new("Armature", 'ARMATURE').object = U.arm
    groups = {}
    for i, v in enumerate(me.vertices):
        w = U.MW @ v.co
        for bone, val in wd(side, w.y - U.CY, w.z).items():
            if val > 1e-4:
                vg = groups.get(bone) or groups.setdefault(bone, o.vertex_groups.new(name=bone))
                vg.add([i], val, 'REPLACE')
    return o


def orient_out(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    c = sum((v.co for v in bm.verts), Vector()) / max(1, len(bm.verts))
    if sum(f.normal.dot(f.calc_center_median() - c) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)


def P(sgn, x, y, z):
    """Point du repère de la botte gauche -> monde (sgn = -1 pour la botte droite : symétrie en x)."""
    return Vector((U.CX + sgn * x, U.CY + y, z))


def xcenter(y):
    return XC - 0.0225 * sm(-0.05, 0.03, y)


# ------------------------------------------------------------------ semelle
def sole(sgn, mat, col, side):
    bm = bmesh.new()
    N = 72
    ys = [-0.2125 + (0.115 + 0.2125) * (0.5 - 0.5 * math.cos(math.pi * i / (N // 2))) for i in range(N // 2 + 1)]
    def ring(z, grow):
        right, left = [], []
        for y in ys:
            w = interp(WSOLE, y) + (grow if interp(WSOLE, y) > 0.002 else 0.0)
            right.append((XC + w, y)); left.append((XC - w, y))
        pts = right + list(reversed(left[1:-1]))
        return [bm.verts.new(P(sgn, x, y, z)) for x, y in pts]
    tiers = [(Z_BOT, 0.0030), (Z_BOT + 0.020, 0.0030), (Z_BOT + 0.0225, -0.0010), (Z_SOLE, 0.0012)]    # semelle crantée, rainure, semelle intermédiaire
    rings = [ring(z, g) for z, g in tiers]
    n = len(rings[0])
    for a, b_ in zip(rings, rings[1:]):
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b_[(k + 1) % n], b_[k]))
    bm.faces.new(list(reversed(rings[0])))                       # dessous
    bm.faces.new(rings[-1])                                      # dessus (sous la tige)
    orient_out(bm)
    outline = [(v.co.x - U.CX, v.co.y - U.CY) for v in rings[0]]
    o = finish("U_Semelle" + side, bm, mat, col, side)
    return o, outline


def lugs(sgn, outline, mat, col, side):
    """Crans de la semelle : petits blocs sur le flanc, un tous les 2,3 cm, orientés selon le contour."""
    made = []
    n = len(outline)
    acc, last = 0.0, outline[0]
    for k in range(1, n + 1):
        cur = outline[k % n]
        acc += math.hypot(cur[0] - last[0], cur[1] - last[1])
        last = cur
        if acc < 0.0225:
            continue
        acc = 0.0
        p0, p1 = outline[(k - 1) % n], outline[(k + 1) % n]
        t = Vector((p1[0] - p0[0], p1[1] - p0[1], 0.0))
        if t.length < 1e-6:
            continue
        t.normalize()
        out = Vector((t.y, -t.x, 0.0))
        c2 = Vector((sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n, 0.0))
        if out.dot(Vector((cur[0], cur[1], 0.0)) - c2) < 0:
            out = -out
        fr = Matrix(((t.x, out.x, 0.0), (t.y, out.y, 0.0), (0.0, 0.0, 1.0)))
        zc = Z_BOT + 0.0105
        if cur[1] < -0.205:
            continue
        made.append(U.box(f"U_SemelleCran{side}{len(made)}", (cur[0] + out.x * 0.0016, cur[1] + out.y * 0.0016, zc),
                          (0.0078, 0.0022, 0.0098), mat, col, weights=wd(side, cur[1], zc), bevel=0.0012, frame=fr))
    return made


# ------------------------------------------------------------------ tige
def upper(sgn, mat, col, side):
    bm = bmesh.new()
    NR, M = 84, 44
    y0, y1 = -0.2105, 0.1135
    rings = []
    for i in range(NR + 1):
        y = y0 + (y1 - y0) * (0.5 - 0.5 * math.cos(math.pi * i / NR))
        bump = 0.0034 * (1 - sm(-0.141, -0.133, y))                # bout renforcé : marche de 2 mm = couture
        W = max(0.0006, interp(WSOLE, y) - 0.006 + (bump if interp(WSOLE, y) > 0.01 else 0.0))
        Hh = max(Z_SOLE + 0.002, interp(HTOP, y) + bump)
        zc, hz = (Z_SOLE + Hh) / 2, (Hh - Z_SOLE) / 2
        p = 2.4 + 0.8 * sm(-0.10, -0.05, y)
        e = 2.0 / p
        xc = xcenter(y)
        ring = []
        for k in range(M):
            a = 2 * math.pi * k / M
            c, s_ = math.cos(a), math.sin(a)
            ring.append(bm.verts.new(P(sgn, xc + W * math.copysign(abs(c) ** e, c), y, zc + hz * math.copysign(abs(s_) ** e, s_))))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(M):
            bm.faces.new((r0[k], r0[(k + 1) % M], r1[(k + 1) % M], r1[k]))
    bm.faces.new(list(reversed(rings[0])))                      # bouts fermés (pointe et talon)
    bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0006)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if len(f.verts) < 3], context='FACES')
    # ouverture du haut : coupe plane et nette à z = 24 cm (bord propre pour le col)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=Vector((0, 0, 0.2405)),
                           plane_no=Vector((0, 0, 1)), clear_outer=True, use_snap_center=False)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    orient_out(bm)
    bm.normal_update()
    surf = BVHTree.FromBMesh(bm)                                  # surface extérieure : sert à poser œillets, laçage, patte
    loop = boundary_loop(bm)                                      # bord de l'ouverture, pour le col matelassé
    # tige épaisse (4 mm, vers l'intérieur)
    me = bpy.data.meshes.new("tmp_up")
    bm.to_mesh(me)
    bm.free()
    tmp = bpy.data.objects.new("tmp_up", me)
    col.objects.link(tmp)
    s = tmp.modifiers.new("S", 'SOLIDIFY'); s.thickness = 0.0040; s.offset = -1.0
    new = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.meshes.remove(me)
    b2 = bmesh.new(); b2.from_mesh(new); bpy.data.meshes.remove(new)
    o = finish("U_Botte" + side, b2, mat, col, side)
    U.camo_uv(o.data, name="nubuck", tile=TEX_TILE)
    return o, surf, loop


def boundary_loop(bm):
    edges = [e for e in bm.edges if e.is_boundary]
    if not edges:
        return []
    adj = {}
    for e in edges:
        a, b = e.verts
        adj.setdefault(a.index, []).append(b)
        adj.setdefault(b.index, []).append(a)
    start = edges[0].verts[0]
    loop, prev, cur = [start], None, start
    for _ in range(len(edges) + 2):
        nxt = [v for v in adj[cur.index] if prev is None or v.index != prev.index]
        if not nxt:
            break
        prev, cur = cur, nxt[0]
        if cur.index == start.index:
            break
        loop.append(cur)
    return [v.co.copy() for v in loop]


def collar(sgn, loop, mat, col, side):
    """Col matelassé : tube de 2,2 cm qui suit le bord de l'ouverture, un peu rejeté vers l'extérieur."""
    if len(loop) < 8:
        return None
    c = sum(loop, Vector()) / len(loop)
    bm = bmesh.new()
    R, S = 0.0108, 10
    n = len(loop)
    rows = []
    for k in range(n):
        p = loop[k]
        t = (loop[(k + 1) % n] - loop[(k - 1) % n]).normalized()
        out = Vector((p.x - c.x, p.y - c.y, 0.0)).normalized()
        u = out
        v = Vector((0, 0, 1.0))
        ctr = p + out * 0.0045 + Vector((0, 0, 0.0035))
        rows.append([bm.verts.new(ctr + (u * math.cos(2 * math.pi * j / S) + v * math.sin(2 * math.pi * j / S)) * R) for j in range(S)])
    for k in range(n):
        for j in range(S):
            bm.faces.new((rows[k][j], rows[k][(j + 1) % S], rows[(k + 1) % n][(j + 1) % S], rows[(k + 1) % n][j]))
    orient_out(bm)
    return finish("U_BotteCol" + side, bm, mat, col, side)


# ------------------------------------------------------------------ laçage, languette, patte
def surface_point(tree, sgn, x, y, z0=0.4):
    hit = tree.ray_cast(P(sgn, x, y, z0), Vector((0, 0, -1)))
    return (hit[0], hit[1].normalized()) if hit[0] is not None else (None, None)


def lacing(sgn, tree, M, col, side):
    made = []
    ys = [-0.1180 + k * 0.0100 for k in range(8)]                 # 8 paires d'œillets, du bout renforcé au haut de la tige
    left, right = [], []
    for y in ys:
        for lst, dx in ((left, -0.0175), (right, 0.0175)):
            p, n = surface_point(tree, sgn, xcenter(y) + dx, y)
            lst.append((p, n))
    if any(p is None for p, _ in left + right):
        print("laçage : surface introuvable pour", side)
        return made
    for k in range(len(ys)):                                       # œillets
        for tag, (p, n) in (("G", left[k]), ("D", right[k])):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.0033, radius2=0.0033, depth=0.0022)
            tvec = Vector((0, 1, 0)).cross(n).normalized() if abs(n.x) < 0.9 else Vector((0, 0, 1)).cross(n).normalized()
            bvec = n.cross(tvec).normalized()
            for v in bm.verts:
                v.co = tvec * v.co.x + bvec * v.co.y + n * v.co.z
            bmesh.ops.translate(bm, vec=p + n * 0.0012, verts=bm.verts)
            made.append(finish(f"U_Oeillet{side}{k}{tag}", bm, M["metal"], col, side))
    for k in range(len(ys) - 1):                                   # lacets croisés : de chaque œillet à celui d'en face, une paire plus haut
        for a, b in ((left[k], right[k + 1]), (right[k], left[k + 1])):
            pa, na = a; pb, nb = b
            d = pb - pa
            L = d.length
            if L < 1e-5:
                continue
            nn = (na + nb).normalized()
            dn = d.normalized()
            bi = nn.cross(dn).normalized()
            nrm = dn.cross(bi).normalized()
            fr = Matrix(((dn.x, bi.x, nrm.x), (dn.y, bi.y, nrm.y), (dn.z, bi.z, nrm.z)))
            c = (pa + pb) / 2 + nn * 0.0030
            made.append(U.box(f"U_Lacet{side}{k}{'a' if a is left[k] else 'b'}", (c.x - U.CX, c.y - U.CY, c.z),
                              (L / 2 + 0.0012, 0.0017, 0.0011), M["lacet"], col, weights=wd(side, c.y - U.CY, c.z), bevel=0.0006, frame=fr))
    return made


def tongue(sgn, tree, M, col, side):
    """Languette matelassée qui dépasse au-dessus du col, et bande de languette visible entre les deux rangées d'œillets."""
    made = []
    p, n = surface_point(tree, sgn, xcenter(-0.044), -0.044)
    if p is None:
        return made
    tilt = Matrix.Rotation(math.radians(-18), 3, Vector((1, 0, 0)))          # penchée vers l'avant
    cx = xcenter(-0.044)
    ctr = P(sgn, cx, -0.054, 0.256)
    made.append(U.box(f"U_Languette{side}", (ctr.x - U.CX, ctr.y - U.CY, ctr.z), (0.0300, 0.0075, 0.0230), M["languette"], col,
                      weights=wd(side, -0.05, 0.262), bevel=0.0060, frame=tilt))
    # bande de languette sous le laçage : suit la pente
    ys = [-0.122 + 0.0065 * k for k in range(12)]
    sm_ = bmesh.new()
    rows = []
    for y in ys:
        pl, nl = surface_point(tree, sgn, xcenter(y) - 0.0135, y)
        pr, nr = surface_point(tree, sgn, xcenter(y) + 0.0135, y)
        if pl is None or pr is None:
            continue
        rows.append((sm_.verts.new(pl + nl * 0.0016), sm_.verts.new(pr + nr * 0.0016)))
    for i in range(len(rows) - 1):
        sm_.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
    if len(rows) > 2:
        orient_out(sm_)
        me = bpy.data.meshes.new("tmp_t"); sm_.to_mesh(me); sm_.free()
        made.append(U._from_mesh_solid(f"U_Languette{side}Bande", me, 0.0030, M["languette"], col, wd(side, -0.08, 0.15), None))
    return made


def tab(sgn, tree, M, col, side):
    """Patte rectangulaire au sommet de la tige, côté extérieur."""
    x = xcenter(-0.012) + 0.075
    hit = tree.ray_cast(P(sgn, x, -0.012, 0.225), Vector((-sgn, 0, 0)))
    if hit[0] is None:
        return []
    loc, n = hit[0], hit[1].normalized()
    right = Vector((0, 1, 0))
    up = Vector((0, 0, 1))
    fr = Matrix(((right.x, -n.x, up.x), (right.y, -n.y, up.y), (right.z, -n.z, up.z)))
    c = loc + n * 0.0030
    return [U.box(f"U_Patte{side}", (c.x - U.CX, c.y - U.CY, c.z), (0.0105, 0.0022, 0.0180), M["botte"], col,
                  weights=wd(side, c.y - U.CY, c.z), bevel=0.0012, frame=fr)]


# ------------------------------------------------------------------ pantalon
def adjust_pants():
    """Ourlet remonté et resserré : le pantalon retombe en blouson par-dessus le haut de la botte."""
    col = bpy.data.collections[U.COLL]
    o = col.objects.get("U_Pantalon")
    if o is None:
        return
    bm = bmesh.new()
    bm.from_mesh(o.data)
    Z_CUT = 0.208
    cut = [f for f in bm.faces if all((U.MW @ v.co).z < Z_CUT for v in f.verts)]
    bmesh.ops.delete(bm, geom=cut, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    for v in bm.verts:                                              # ourlet net : le bord de la coupe est recalé sur le plan
        if v.is_boundary:
            w0 = U.MW @ v.co
            v.co = U.MINV @ Vector((w0.x, w0.y, Z_CUT))
    for v in bm.verts:
        w = U.MW @ v.co
        if w.z < 0.34:
            side = 1 if w.x - U.CX > 0 else -1
            ax = Vector((U.CX + side * 0.142, U.CY + 0.030, w.z))        # axe de la jambe
            d = Vector((w.x - ax.x, w.y - ax.y, 0.0))
            f = 1.0 - 0.21 * (1 - sm(Z_CUT, 0.34, w.z))                    # resserré vers l'ourlet
            ang = math.atan2(d.y, d.x)
            fold = 1.0 + 0.045 * math.sin(ang * 5 + w.z * 40) * (1 - sm(Z_CUT, 0.30, w.z))
            nd = d * f * fold
            w2 = Vector((ax.x + nd.x, ax.y + nd.y, w.z - 0.012 * (1 - sm(Z_CUT, 0.28, w.z))))
            v.co = U.MINV @ w2
    bm.to_mesh(o.data)
    bm.free()
    for p in o.data.polygons:
        p.use_smooth = True


def run():
    U._setup()
    col = bpy.data.collections[U.COLL]
    for o in list(col.objects):
        if o.name.startswith(OWN):
            me = o.data if o.type == 'MESH' else None
            bpy.data.objects.remove(o, do_unlink=True)
            if me is not None and me.users == 0:
                bpy.data.meshes.remove(me)
    M = U.materials()
    M["botte"] = U._mat("U_Botte", None, 0.92, image="botte_nubuck.png")
    M["semelle"] = U._mat("U_BotteSemelle", (0.43, 0.30, 0.10), 0.86, 0.0)
    M["lacet"] = U._mat("U_BotteLacet", (0.38, 0.27, 0.07), 0.80, 0.0)
    M["languette"] = U._mat("U_BotteLanguette", (0.58, 0.42, 0.14), 0.92, 0.0)
    M["metal"] = U._mat("U_BotteMetal", (0.10, 0.10, 0.11), 0.35, 0.8)
    adjust_pants()
    parts = []
    for sgn, side in ((1, "Left"), (-1, "Right")):
        so, outline = sole(sgn, M["semelle"], col, side)
        parts.append(so)
        parts += lugs(sgn, outline, M["semelle"], col, side)
        up, tree, loop = upper(sgn, M["botte"], col, side)
        parts.append(up)
        cl = collar(sgn, loop, M["languette"], col, side)
        if cl is not None:
            parts.append(cl)
        parts += lacing(sgn, tree, M, col, side)
        parts += tongue(sgn, tree, M, col, side)
        parts += tab(sgn, tree, M, col, side)
    print("bottes :", len(parts), "pièces")
    return parts
