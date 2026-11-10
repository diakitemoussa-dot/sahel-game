"""Lunettes de sport de la tenue militaire, d'après les gros plans de référence.

Emplacement : celui placé à la main par l'utilisateur (relevé : chaque verre va de ~8° à ~39° autour de l'axe de la tête, de
z = 1,6384 à 1,6600, sur un cylindre de rayon ~9,65 cm). Les chiffres sont en constantes : le script est donc le même à chaque lancement.

Dessin (comme sur l'image) :
  - arcade : UNE barre noire continue au-dessus des deux verres, qui plonge au centre pour former le pont ;
  - verres : lisses (portion de cylindre), échancrés sur le nez en bas à l'intérieur, haut un peu plus bas près du nez ;
  - cerclage fin autour des verres (plus fin en bas), arêtes biseautées ;
  - verre fumé dégradé : plus sombre en haut, plus clair et translucide en bas (on devine les yeux) ;
  - charnières aux deux bouts de l'arcade. Les branches placées à la main ne sont pas touchées.

Ce script n'efface QUE U_LunettesVerre*, U_LunettesMonture*, U_LunettesArcade, U_LunettesPont, U_LunettesCharniere*.
Usage :  import s29_glasses_design as D; D.run()"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix
import s24_uniform_military as U

B = U.B
HEAD = {B + "Head": 1.0}
CY0 = -0.030                                  # axe de la tête en y
R0 = 0.0965                                   # rayon du cylindre des verres
Z0, Z1 = 1.6384, 1.6600                       # bas et haut des verres (placement de l'utilisateur)
H = Z1 - Z0
TH_IN = {1: 7.7, -1: 8.0}                     # angle du bord intérieur (près du nez), en degrés
TH_OUT = {1: 38.8, -1: 40.2}                  # angle du bord extérieur
MINE = ("U_LunettesVerre", "U_LunettesMonture", "U_LunettesArcade", "U_LunettesPont", "U_LunettesCharniere")
LENS_THICK, RIM_DEPTH, BAR_DEPTH = 0.0020, 0.0036, 0.0042


def to3d(sgn, X, z, dr=0.0):
    """(X, z) sur le cylindre : X = distance (arc) depuis le centre du visage, positive vers l'extérieur de la lunette `sgn`."""
    th = sgn * X / R0
    R = R0 + dr
    return Vector((U.CX + R * math.sin(th), U.CY + CY0 - R * math.cos(th), z))


def _sq(px, py, mix=0.5):
    dx = px * math.sqrt(max(0.0, 1 - py * py / 2))
    dy = py * math.sqrt(max(0.0, 1 - px * px / 2))
    return px + (dx - px) * mix, py + (dy - py) * mix


def lens_xz(sgn, s, v):
    """Forme du verre : (s, v) dans [0,1]² -> (X, z). Échancrure du nez en bas à l'intérieur, haut plus bas près du nez, coins arrondis."""
    q = _sq(2 * s - 1, 2 * v - 1)
    ss, vv = (q[0] + 1) / 2, (q[1] + 1) / 2
    u_in = 0.02 + 0.30 * (1 - vv) ** 1.8
    u_out = 1 - 0.04 * (1 - vv) ** 2
    u = u_in + ss * (u_out - u_in)
    zb = Z0 + 0.22 * H * (1 - u) ** 1.6
    zt = Z1 - 0.10 * H * (1 - u) ** 2
    X = R0 * math.radians(TH_IN[sgn] + u * (TH_OUT[sgn] - TH_IN[sgn]))
    return X, zb + vv * (zt - zb)


def _orient(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ctr = Vector((U.CX, U.CY + CY0, 1.66))
    if sum(f.normal.dot(f.calc_center_median() - ctr) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)


def solid(name, bm, thick, bevel, mat, col, offset=0.0):
    """Nappe -> pièce épaisse, arêtes vives biseautées, attachée à la tête (travail en mètres, repère monde)."""
    me = bpy.data.meshes.new(name + "_t")
    bm.to_mesh(me)
    bm.free()
    tmp = bpy.data.objects.new(name + "_t", me)
    col.objects.link(tmp)
    sm = tmp.modifiers.new("S", 'SOLIDIFY'); sm.thickness = thick; sm.offset = offset
    new = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.meshes.remove(me)
    b2 = bmesh.new(); b2.from_mesh(new); bpy.data.meshes.remove(new)
    if bevel:
        edges = [e for e in b2.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > 0.6]
        bmesh.ops.bevel(b2, geom=edges, offset=bevel, segments=2, affect='EDGES')
    return U._finish(name, b2, mat, col, None, HEAD)


def lens_sheet(sgn, NU=40, NV=14):
    bm = bmesh.new()
    rows = []
    for i in range(NU + 1):
        col = []
        for j in range(NV + 1):
            X, z = lens_xz(sgn, i / NU, j / NV)
            col.append(bm.verts.new(to3d(sgn, X, z, -0.0004)))
        rows.append(col)
    for i in range(NU):
        for j in range(NV):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    _orient(bm)
    return bm


def outline(sgn, NU=40, NV=14):
    """Contour du verre, dans l'ordre : bord intérieur (bas -> haut), haut, bord extérieur (haut -> bas), bas."""
    path = [(0, j) for j in range(NV + 1)] + [(i, NV) for i in range(1, NU + 1)] + \
           [(NU, j) for j in range(NV - 1, -1, -1)] + [(i, 0) for i in range(NU - 1, 0, -1)]
    return [lens_xz(sgn, i / NU, j / NV) for i, j in path]


def rim_sheet(sgn):
    """Cerclage : du bord du verre (légèrement rentré) à 2,6 mm plus loin, un peu plus large vers le haut et plus fin en bas."""
    pts = outline(sgn)
    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cz = sum(p[1] for p in pts) / n
    bm = bmesh.new()
    inner, outer = [], []
    for k in range(n):
        p0, p1 = pts[(k - 1) % n], pts[(k + 1) % n]
        tx, tz = p1[0] - p0[0], p1[1] - p0[1]
        L = math.hypot(tx, tz) or 1.0
        nx, nz = tz / L, -tx / L
        if nx * (pts[k][0] - cx) + nz * (pts[k][1] - cz) < 0:          # normale vers l'extérieur
            nx, nz = -nx, -nz
        w = 0.0030 + 0.0020 * max(0.0, nz) - 0.0004 * max(0.0, -nz)
        inner.append(bm.verts.new(to3d(sgn, pts[k][0] - nx * 0.0007, pts[k][1] - nz * 0.0007, 0.0006)))
        outer.append(bm.verts.new(to3d(sgn, pts[k][0] + nx * w, pts[k][1] + nz * w, 0.0006)))
    for k in range(n):
        bm.faces.new((inner[k], inner[(k + 1) % n], outer[(k + 1) % n], outer[k]))
    _orient(bm)
    return bm


def bar_z(x):
    """Hauteur du centre de l'arcade : au-dessus des verres, plonge sur le nez (pont), redescend un peu aux extrémités."""
    return Z1 + 0.0036 - 0.0040 * math.exp(-(x / 0.0115) ** 2) - 0.0008 * (abs(x) / 0.065) ** 2


def bar_sheet(N=60):
    x_g = R0 * math.radians(TH_OUT[1] + 0.6)
    x_d = -R0 * math.radians(TH_OUT[-1] + 0.6)
    bm = bmesh.new()
    rows = []
    for i in range(N + 1):
        x = x_d + (x_g - x_d) * i / N
        th = x / R0
        h = 0.0038 * (1.0 - 0.20 * (abs(x) / 0.065) ** 2)               # un peu plus fine aux extrémités
        zc = bar_z(x)
        R = R0 + 0.0006
        px, py = U.CX + R * math.sin(th), U.CY + CY0 - R * math.cos(th)
        rows.append((bm.verts.new((px, py, zc - h)), bm.verts.new((px, py, zc + h))))
    for i in range(N):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    _orient(bm)
    return bm, x_g, x_d


def hinge(x, side, M, col):
    th = x / R0
    p = Vector((U.CX + (R0 + 0.0004) * math.sin(th), U.CY + CY0 - (R0 + 0.0004) * math.cos(th), bar_z(x) - 0.0005))
    t = Vector((math.cos(th), math.sin(th), 0.0))
    n = Vector((math.sin(th), -math.cos(th), 0.0))
    fr = Matrix(((t.x, -n.x, 0.0), (t.y, -n.y, 0.0), (t.z, -n.z, 1.0)))
    return U.box(f"U_LunettesCharniere{side}", (p.x - U.CX, p.y - U.CY, p.z), (0.0030, 0.0031, 0.0042),
                 M["monture"], col_ref[0], weights=HEAD, bevel=0.0012, frame=fr)


col_ref = [None]


def lens_gradient_image():
    """Dégradé du verre fumé : très sombre en haut, plus clair et translucide en bas. Image intégrée au fichier."""
    name = "lunette_verre_degrade"
    img = bpy.data.images.get(name)
    if img is not None:
        bpy.data.images.remove(img)
    W, Hh = 8, 128
    img = bpy.data.images.new(name, W, Hh, alpha=True)
    px = []
    for row in range(Hh):
        t = row / (Hh - 1)                                      # 0 = bas, 1 = haut
        top, bot = (0.050, 0.055, 0.066, 0.93), (0.150, 0.178, 0.215, 0.60)
        c = [bot[k] + (top[k] - bot[k]) * (t ** 0.8) for k in range(4)]
        px += c * W
    img.pixels = px
    img.colorspace_settings.name = "sRGB"
    img.pack()
    return img


def lens_material():
    m = bpy.data.materials.get("U_LunettesVerre") or bpy.data.materials.new("U_LunettesVerre")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    b.inputs["Roughness"].default_value = 0.05
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = lens_gradient_image()
    t.interpolation = 'Linear'
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    try:
        m.surface_render_method = 'BLENDED'
    except Exception as e:
        print("transparence non réglée :", e)
    return m


def gradient_uv(o):
    me = o.data
    for l in list(me.uv_layers):
        me.uv_layers.remove(l)
    uv = me.uv_layers.new(name="degrade")
    for p in me.polygons:
        for li in p.loop_indices:
            w = U.MW @ me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((w.x - U.CX) / 0.13 + 0.5, min(1.0, max(0.0, (w.z - Z0) / H)))


def run():
    U._setup()
    col = bpy.data.collections[U.COLL]
    col_ref[0] = col
    for o in list(col.objects):
        if o.name.startswith(MINE):
            me = o.data if o.type == 'MESH' else None
            bpy.data.objects.remove(o, do_unlink=True)
            if me is not None and me.users == 0:
                bpy.data.meshes.remove(me)
    M = U.materials()
    M["monture"] = U._mat("U_LunettesMonture", (0.016, 0.017, 0.020), 0.40, 0.0)
    M["verre"] = lens_material()
    parts = []
    for sgn, side in ((1, "G"), (-1, "D")):
        lens = solid(f"U_LunettesVerre{side}", lens_sheet(sgn), LENS_THICK, 0.0, M["verre"], col)
        gradient_uv(lens)
        parts.append(lens)
        parts.append(solid(f"U_LunettesMonture{side}", rim_sheet(sgn), RIM_DEPTH, 0.0006, M["monture"], col))
    bm, x_g, x_d = bar_sheet()
    parts.append(solid("U_LunettesArcade", bm, BAR_DEPTH, 0.0009, M["monture"], col, offset=1.0))
    parts.append(hinge(x_g, "G", M, col))
    parts.append(hinge(x_d, "D", M, col))
    print("lunettes redessinées :", len(parts), "pièces")
    return parts
