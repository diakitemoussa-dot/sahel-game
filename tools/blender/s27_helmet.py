"""Casque de la tenue militaire, d'après l'image de référence (coque olive lisse qui épouse la tête, visière marquée,
plaque losange de fixation à l'avant, bandes velcro sur les côtés, rails avec molette à hauteur des oreilles, plaque velcro derrière).

La coque est découpée DANS LE MAILLAGE DE LA PEAU DU CRÂNE (Body) : elle a donc la forme de la tête, gonflée de 1,9 cm,
avec une visière qui dépasse surtout devant, un bourrelet au bord, puis épaissie. Tout est attaché à l'os de la tête.
Ce script n'efface QUE ses propres pièces (U_Casque*) : il ne touche pas au gilet ni au reste de la tenue.

Usage dans Blender :  import s27_helmet as H; H.run()"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import s24_uniform_military as U

B = U.B
CY0 = -0.030
HEAD = {B + "Head": 1.0}
# hauteur du bord bas du casque selon l'angle autour de la tête (0° = devant, 90° = côté, 180° = derrière)
EDGE = [(0, 1.690), (35, 1.684), (60, 1.660), (80, 1.633), (100, 1.616), (135, 1.600), (180, 1.597)]
BASE_OFF, THICK = 0.019, 0.008


def edge_z(a):
    a = abs(a)
    for (a0, z0), (a1, z1) in zip(EDGE, EDGE[1:]):
        if a <= a1:
            return z0 + (z1 - z0) * (a - a0) / (a1 - a0)
    return EDGE[-1][1]


def theta(x, y):
    return math.degrees(math.atan2(x, -(y - CY0)))


def flange(x, y, d):
    """Visière évasée tout autour (2,8 cm devant, 1,6 cm sur les côtés et derrière), qui s'efface vers le haut ;
    puis un bourrelet arrondi, en relief de 5 mm, entre 3 et 14 mm au-dessus du bord (le « rebord » de l'image de référence)."""
    fr = max(0.0, math.cos(math.radians(theta(x, y)))) ** 2
    amp = 0.016 + 0.012 * fr
    bead = 0.0055 * U._smooth(0, 0.0, 0.004, d) * (1 - U._smooth(0, 0.009, 0.016, d))
    return amp * (1 - U._smooth(0, 0.0, 0.050, d)) + bead


def _head_points():
    """Tous les points de la tête (peau + cheveux), en repère monde, vus en coordonnées cylindriques autour de l'axe du cou."""
    CX, CY = U.CX, U.CY
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for name in ("Body",):                                      # les tresses (Hair_Twists) font partie de la tenue de base : masquées sous le casque
        o = bpy.data.objects.get(name)
        if o is None:
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ev.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            if p.z >= 1.585:
                x, y = p.x - CX, p.y - CY
                pts.append((math.atan2(x, -(y - CY0)), p.z, math.hypot(x, y - CY0)))
        ev.to_mesh_clear()
    return pts


NT, NZ, Z0, DZ = 72, 90, 1.585, 0.003          # grille de l'enveloppe : 72 secteurs de 5 degrés, tranches de 3 mm


def _envelope(pts):
    """Rayon maximal de la tête (oreilles et cheveux compris) par secteur et par hauteur, élargi à 3 x 3 cases."""
    E = [[0.0] * NZ for _ in range(NT)]
    for th, z, r in pts:
        i = int((th + math.pi) / (2 * math.pi) * NT) % NT
        k = int((z - Z0) / DZ)
        if 0 <= k < NZ and r > E[i][k]:
            E[i][k] = r
    E3 = [[max(E[(i + di) % NT][min(NZ - 1, max(0, k + dk))] for di in (-1, 0, 1) for dk in (-1, 0, 1)) for k in range(NZ)] for i in range(NT)]
    return E3


def _env(E3, th, z):
    i = int((th + math.pi) / (2 * math.pi) * NT) % NT
    k = min(NZ - 1, max(0, int((z - Z0) / DZ)))
    return E3[i][k]


def build_shell(col, mat):
    CX, CY = U.CX, U.CY
    pts = [q for q in _head_points() if q[1] >= edge_z(abs(math.degrees(q[0])))]      # points de la tête qui seront sous le casque
    z_head = max(q[1] for q in pts)
    zc = 1.640                                                  # centre de l'ellipsoïde
    c = z_head + BASE_OFF + 0.002 - zc

    NEXP = 3.0                                                  # profil « super-ellipse » : dôme plus plein qu'un ellipsoïde, comme un crâne

    def ell(th, z, a_, b_):
        t = abs((z - zc) / c)
        if t >= 1:
            return 0.0
        return (1 - t ** NEXP) ** (1 / NEXP) / math.sqrt((math.sin(th) / a_) ** 2 + (math.cos(th) / b_) ** 2)
    # dôme ellipsoïdal lisse, agrandi juste assez pour contenir toute la tête (cheveux et oreilles) avec 1,1 cm de marge
    A0, B0, k = 0.092, 0.112, 1.0
    while k < 2.0 and any(ell(th, z, A0 * k, B0 * k) < r + 0.011 for th, z, r in pts):
        k += 0.01
    A, Bb = A0 * k, B0 * k
    print("casque : ellipsoïde", round(A, 3), "x", round(Bb, 3), "| facteur", round(k, 2))
    z_last = zc + 0.992 * c                                    # presque au sommet : le profil referme le dôme tout seul
    NTH, M = 96, 34
    caps = ()
    zlev, Rg, ths = [], [], [-math.pi + 2 * math.pi * i / NTH for i in range(NTH)]
    for th in ths:
        ez = edge_z(abs(math.degrees(th)))
        zl = [ez + ((j / M) ** 1.5) * (z_last - ez) for j in range(M + 1)]
        zlev.append(zl)
        Rg.append([ell(th, z, A, Bb) for z in zl])
    # visière évasée et bourrelet, ajoutés après le lissage ; le bord descend un peu avec l'évasement
    bm = bmesh.new()
    grid = []
    for i, th in enumerate(ths):
        ez = edge_z(abs(math.degrees(th)))
        row = []
        for j in range(M + 1):
            z = zlev[i][j]
            x0, y0 = math.sin(th), -math.cos(th)
            fl = flange(Rg[i][j] * x0, CY0 + Rg[i][j] * y0, z - ez)
            r = Rg[i][j] + fl
            row.append(bm.verts.new((CX + r * x0, CY + CY0 + r * y0, z - 0.35 * fl)))
        grid.append(row)
    for i in range(NTH):
        for j in range(M):
            bm.faces.new((grid[i][j], grid[(i + 1) % NTH][j], grid[(i + 1) % NTH][j + 1], grid[i][j + 1]))
    last = [grid[i][M] for i in range(NTH)]
    prev = last
    top_z = last[0].co.z
    for t in caps:                                             # calotte arrondie
        ring = []
        for i, th in enumerate(ths):
            r0 = math.hypot(last[i].co.x - CX, last[i].co.y - CY - CY0) * math.sqrt(1 - t * t)
            ring.append(bm.verts.new((CX + r0 * math.sin(th), CY + CY0 - r0 * math.cos(th), last[i].co.z + t * 0.040)))
        for i in range(NTH):
            bm.faces.new((prev[i], prev[(i + 1) % NTH], ring[(i + 1) % NTH], ring[i]))
        prev = ring
    apex = bm.verts.new((CX, CY + CY0, top_z + 0.004))
    for i in range(NTH):
        bm.faces.new((prev[i], prev[(i + 1) % NTH], apex))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    axis = Vector((CX, CY + CY0, 1.65))
    if sum((f.normal.dot(f.calc_center_median() - axis)) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.normal_update()
    for v in bm.verts:                                         # surface extérieure fixée ; l'épaisseur va vers l'intérieur
        v.co += v.normal * THICK / 2
    me = bpy.data.meshes.new("U_Casque_tmp")
    bm.to_mesh(me)
    bm.free()
    o = U._from_mesh_solid("U_Casque", me, THICK, mat, col, HEAD, None)
    import s26_balaclava as C
    C.cylindrical_uv(o.data, tile=0.15)
    return o


# ------------------------------------------------------------------ accessoires posés sur la coque
def surface(tree, origin, direction):
    """Point de la coque touché par un rayon, normale vers l'extérieur et repère (droite, haut) local."""
    hit = tree.ray_cast(Vector(origin), Vector(direction))
    if hit[0] is None:
        return None
    loc, n = hit[0], hit[1].normalized()
    if n.dot(Vector(direction)) > 0:
        n = -n
    right = Vector((0, 0, 1)).cross(n).normalized()
    up = n.cross(right).normalized()
    return loc, n, right, up


def put(name, S, dx, dz, dout, half, mat, col, bevel=0.002, turn=0.0):
    """Pose une boîte sur la surface : dx vers la droite locale, dz vers le haut local, dout vers l'extérieur ; turn : rotation (degrés) autour de la normale."""
    loc, n, right, up = S
    c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
    r2, u2 = right * c + up * s, up * c - right * s
    p = loc + r2 * dx + u2 * dz + n * dout
    frame = Matrix(((r2.x, -n.x, u2.x), (r2.y, -n.y, u2.y), (r2.z, -n.z, u2.z)))
    return U.box(name, (p.x - U.CX, p.y - U.CY, p.z), half, mat, col, weights=HEAD, bevel=bevel, frame=frame)


def knob(name, S, dx, dz, dout, radius, length, mat, col):
    """Molette ronde (cylindre dont l'axe suit la normale)."""
    loc, n, right, up = S
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=18, radius1=radius, radius2=radius * 0.92, depth=length)
    for v in bm.verts:                                          # axe Z -> normale
        v.co = right * v.co.x + up * v.co.y + n * v.co.z
    c = loc + right * dx + up * dz + n * dout
    bmesh.ops.translate(bm, vec=c, verts=bm.verts)
    return U._finish(name, bm, mat, bpy.data.collections[U.COLL], None, HEAD)


def fittings(shell, M, col):
    tree = U.world_bvh(shell)
    CX, CY = U.CX, U.CY
    out = []
    # plaque losange de fixation à l'avant (avec cadre rectangulaire et crochet)
    S = surface(tree, (CX, CY - 0.5, 1.742), (0, 1, 0))
    if S:
        out.append(put("U_CasquePlaqueLosange", S, 0, 0, 0.0030, (0.0255, 0.0030, 0.0255), M["casque"], col, 0.0018, turn=45))
        for nm, dx, dz, h in (("H", 0, 0.0108, (0.0125, 0.0042, 0.0026)), ("B", 0, -0.0108, (0.0125, 0.0042, 0.0026)),
                              ("G", -0.0118, 0, (0.0026, 0.0042, 0.0108)), ("D", 0.0118, 0, (0.0026, 0.0042, 0.0108))):
            out.append(put(f"U_CasqueCadre{nm}", S, dx, dz, 0.0030 + 0.0042, h, M["casque"], col, 0.0012))
        out.append(put("U_CasqueCrochet", S, 0, 0.0185, 0.0030 + 0.0030, (0.0070, 0.0030, 0.0038), M["casque"], col, 0.0012))
        for nm, dx in (("G", -0.030), ("D", 0.030)):
            out.append(put(f"U_CasqueVis{nm}", S, dx, 0.0, 0.0030 + 0.0014, (0.0026, 0.0016, 0.0026), M["noir"], col, 0.0006, turn=45))
    for sgn, side in ((1, "G"), (-1, "D")):
        # bande velcro sur le flanc du dôme, inclinée selon la pente
        S = surface(tree, (CX + sgn * 0.5, CY - 0.012, 1.738), (-sgn, 0, 0))
        if S:
            out.append(put(f"U_CasqueVelcro{side}", S, 0, 0, 0.0002, (0.0100, 0.0016, 0.0240), M["velcro_c"], col, 0.0012, turn=-sgn * 22))
        # rail d'oreille + molette + patte
        S = surface(tree, (CX + sgn * 0.5, CY - 0.036, edge_z(90) + 0.026), (-sgn, 0, 0))
        if S:
            out.append(put(f"U_CasqueRail{side}", S, 0, 0, 0.0028, (0.0082, 0.0030, 0.0270), M["casque"], col, 0.0022, turn=sgn * 14))
            out.append(knob(f"U_CasqueMolette{side}", S, sgn * 0.0066, 0.0225, 0.0058, 0.0092, 0.0058, M["casque"], col))
            out.append(put(f"U_CasquePatte{side}", S, -sgn * 0.0030, -0.0195, 0.0028 + 0.0030, (0.0042, 0.0026, 0.0095), M["noir"], col, 0.0012, turn=sgn * 14))
        for k, (dy, dz) in enumerate(((-0.018, 0.048), (-0.006, 0.040), (0.008, 0.050))):       # petits rivets
            Sr = surface(tree, (CX + sgn * 0.5, CY + dy, edge_z(90) + 0.026 + dz), (-sgn, 0, 0))
            if Sr:
                out.append(put(f"U_CasqueRivet{side}{k}", Sr, 0, 0, 0.0010, (0.0022, 0.0012, 0.0022), M["noir"], col, 0.0006))
    # derrière : grande plaque velcro, petite plaque verticale au sommet
    S = surface(tree, (CX, CY + 0.5, 1.690), (0, -1, 0))
    if S:
        out.append(put("U_CasqueVelcroDos", S, 0, 0, 0.0004, (0.0280, 0.0016, 0.0200), M["velcro_c"], col, 0.0012))
    S = surface(tree, (CX, CY + 0.5, 1.745), (0, -1, 0))
    if S:
        out.append(put("U_CasquePlaqueDos", S, 0, 0.0, 0.0004, (0.0120, 0.0024, 0.0150), M["casque"], col, 0.0016))
    return [o for o in out if o is not None]


def run():
    U._setup()
    col = bpy.data.collections.get(U.COLL) or bpy.data.collections.new(U.COLL)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        if o.name.startswith("U_Casque"):
            me = o.data if o.type == 'MESH' else None
            bpy.data.objects.remove(o, do_unlink=True)
            if me is not None and me.users == 0:
                bpy.data.meshes.remove(me)
    M = U.materials()
    M["casque"] = U._mat("U_Casque", None, 0.55, image="casque_peinture.png")
    M["velcro_c"] = U._mat("U_CasqueVelcro", (0.13, 0.155, 0.045), 0.96)
    shell = build_shell(col, M["casque"])
    bpy.context.view_layer.update()
    parts = [shell] + fittings(shell, M, col)
    print("casque :", len(parts), "pièces |", len(shell.data.vertices), "sommets de coque")
    return parts
