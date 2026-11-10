"""Tenue du PNJ (milicien du désert), d'après l'image de référence : foulard kaki enroulé sur la tête et le cou, masque noir,
longue tunique indigo à panneau brun, gilet olive à poches, sangles en cuir, sacoche, gourde, ceinture de cuir, pantalon large.
Semi-réaliste, usé et sale. Construite sur le même squelette que le joueur (mêmes noms d'os) : les 57 animations s'appliquent.
Toutes les pièces sont dans la collection 'Tenue_PNJ' (objets N_*). Ce script n'efface QUE cette collection : la tenue
militaire et le personnage de base ne sont pas touchés.

Usage dans Blender :  import s33_pnj_outfit as P; P.run()"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix, noise
from mathutils.kdtree import KDTree
import s24_uniform_military as U
import s26_balaclava as C26

B = U.B
COLL = "Tenue_PNJ"
CYB = -0.027                     # axe du tronc en y (centre des hanches)


# ---------------------------------------------------------------- matériaux
def _tex_mat(name, image, rough, extend=False):
    m = U._mat(name, None, rough, image=image)
    if extend:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE':
                n.extension = 'EXTEND'
    return m


def materials():
    return {
        "tunique": _tex_mat("N_Tunique", "pnj_tunique.png", 0.95, extend=True),
        "manche": _tex_mat("N_Manche", "pnj_manche.png", 0.95),
        "pantalon": _tex_mat("N_Pantalon", "pnj_pantalon.png", 0.95),
        "gilet": _tex_mat("N_Gilet", "pnj_gilet.png", 0.92),
        "cuir": _tex_mat("N_Cuir", "pnj_cuir.png", 0.60),
        "foulard": _tex_mat("N_Foulard", "pnj_foulard.png", 0.95),
        "masque": _tex_mat("N_Masque", "pnj_masque.png", 0.90),
        "metal": U._mat("N_Metal", (0.17, 0.165, 0.15), 0.42, 0.85),
        "gourde": U._mat("N_Gourde", (0.19, 0.22, 0.11), 0.55, 0.35),
        "botte": U._mat("N_Botte", (0.17, 0.15, 0.12), 0.85),
        "cuirbotte": U._mat("N_BotteCuir", (0.20, 0.125, 0.07), 0.70),
        "semelle": U._mat("N_Semelle", (0.045, 0.04, 0.035), 0.9),
        "lacet": U._mat("N_Lacet", (0.20, 0.17, 0.12), 0.9),
    }


# ---------------------------------------------------------------- outils
def set_weights(o, fn):
    """Poids recalculés par sommet : fn(point monde) -> {os: poids}."""
    o.vertex_groups.clear()
    groups = {}
    for i, v in enumerate(o.data.vertices):
        for bone, val in fn(U.MW @ v.co).items():
            if val <= 1e-4:
                continue
            vg = groups.get(bone) or groups.setdefault(bone, o.vertex_groups.new(name=bone))
            vg.add([i], val, 'REPLACE')


def inflate(me, fn_cm):
    """Gonfle le maillage le long des normales : fn_cm(z monde) = épaisseur en cm."""
    bm = bmesh.new(); bm.from_mesh(me)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * fn_cm((U.MW @ v.co).z)
    bm.to_mesh(me); bm.free()
    me.update()
    for p in me.polygons:
        p.use_smooth = True


def mesh_of(bm, name):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return me


# ---------------------------------------------------------------- tunique, jupe, pantalon, chaussures
def tunic_top(col, M):
    """Haut de la tunique : copie de la chemise de base (mêmes poids). Panneau brun au centre (UV planes), manches indigo (tuile)."""
    o = U.dup_clothing("Hoodie", "N_TuniqueHaut", col, [M["tunique"], M["manche"]])
    me = o.data
    for l in list(me.uv_layers):
        me.uv_layers.remove(l)
    uv = me.uv_layers.new(name="tissu")
    k = 0.01 / 0.30
    for p in me.polygons:
        c = U.MW @ p.center
        sleeve = abs(c.x - U.CX) > 0.205
        p.material_index = 1 if sleeve else 0
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if sleeve:
                u, v = ((co.z, co.y) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y))
                uv.data[li].uv = (u * k, v * k)
            else:
                w = U.MW @ co
                uv.data[li].uv = ((w.x - U.CX) / 0.42 + 0.5, (w.z - 0.5) / 1.0)
    return o


def skirt_panel(name, front, col, M):
    """Pan avant ou arrière de la tunique, de la ceinture jusqu'aux genoux, ouvert sur les côtés vers le bas.
    Poids : ceinture (Hips) en haut, cuisse gauche/droite en bas (selon le côté), pour suivre les jambes sans les traverser."""
    NU, NV = 18, 16
    z_top, z_bot = 1.118, 0.50
    bm = bmesh.new()
    rows = []
    for j in range(NV + 1):
        z = z_top + (z_bot - z_top) * j / NV
        t = max(0.0, min(1.0, (1.07 - z) / 0.57))
        rx = 0.176 + 0.085 * t ** 0.8
        ry = 0.148 + 0.030 * t
        s = U._smooth(0, 0.86, 0.97, z)                              # 1 au-dessus de 0,97 : mur plein ; en dessous : fente de côté
        thmax = math.radians(72 + 18 * s)
        row = []
        for i in range(NU + 1):
            th = -thmax + 2 * thmax * i / NU
            fold = t * (0.011 * math.sin(7 * th + 8 * z + (0.0 if front else 1.7)) + 0.006 * noise.noise(Vector((th * 2.0, z * 7.0, 1.3 if front else 4.1))))
            hem = t * 0.012 * math.sin(5 * th + 2.0)                 # ourlet irrégulier
            r = 1.0 + fold / 0.15
            x = rx * math.sin(th) * r
            y = CYB + (-1 if front else 1) * ry * math.cos(th) * r
            row.append(bm.verts.new((U.CX + x, U.CY + y, z + (hem if j == NV else 0.0))))
        rows.append(row)
    for j in range(NV):
        for i in range(NU):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    o = U._from_mesh_solid(name, mesh_of(bm, "tmp_skirt"), 0.007, M["tunique"], col, {B + "Hips": 1.0}, None)
    uv = o.data.uv_layers[0] if o.data.uv_layers else o.data.uv_layers.new(name="tissu")
    for p in o.data.polygons:                                        # panneau brun au centre, comme le haut de la tunique
        p.use_smooth = True
        for li in p.loop_indices:
            w = U.MW @ o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv = ((w.x - U.CX) / 0.42 + 0.5, (w.z - 0.5) / 1.0)

    def wfn(w):
        b = 1.0 - U._smooth(0, 0.80, 1.07, w.z)                      # 0 à la ceinture -> 1 en bas
        side = U._smooth(0, -0.04, 0.04, w.x - U.CX)                 # +x = gauche
        return {B + "Hips": 1.0 - b, B + "LeftUpLeg": b * side, B + "RightUpLeg": b * (1.0 - side)}
    set_weights(o, wfn)
    return o


def pants(col, M):
    o = U.dup_clothing("Pants", "N_Pantalon", col, [M["pantalon"]])
    inflate(o.data, lambda z: 0.9 + 0.9 * U._smooth(0, 1.0, 0.45, z) + (0.8 if z < 0.16 else 0.0))   # large, froncé à la cheville
    U.camo_uv(o.data, name="tissu", tile=0.45)
    return o


def shoes(col, M):
    # emplacements d'origine : 0 ShoeBrown (bout), 1-2 ShoeBrown (talon, semelle), 3 SneakerWhite (dessus), 4 LaceBlack
    return U.dup_clothing("Shoes", "N_Chaussures", col, [M["cuirbotte"], M["semelle"], M["semelle"], M["botte"], M["lacet"]])


# ---------------------------------------------------------------- gilet, sangles, ceinture, sacoche, gourde
def strip_from_rows(name, rows, mat, col, thick=0.006, tile=0.12):
    """Ruban (rangées de 3 points) épaissi, poids repris de la chemise la plus proche."""
    src = bpy.data.objects["Hoodie"]
    kd = KDTree(len(src.data.vertices))
    for i, v in enumerate(src.data.vertices):
        kd.insert(U.MW @ v.co, i)
    kd.balance()
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in r] for r in rows]
    for i in range(len(rows) - 1):
        for k in range(2):
            bm.faces.new((vs[i][k], vs[i][k + 1], vs[i + 1][k + 1], vs[i + 1][k]))
    me = mesh_of(bm, "tmp_strip")
    tmp = bpy.data.objects.new("tmp_strip", me); col.objects.link(tmp)
    sm = tmp.modifiers.new("S", 'SOLIDIFY'); sm.thickness = thick; sm.offset = 1.0
    new = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.meshes.remove(me)
    bmw = bmesh.new(); bmw.from_mesh(new); bpy.data.meshes.remove(new)
    pts = [v.co.copy() for v in bmw.verts]
    bmesh.ops.transform(bmw, matrix=U.MINV, verts=bmw.verts)
    fme = mesh_of(bmw, name)
    o = bpy.data.objects.new(name, fme)
    col.objects.link(o)
    o.parent = U.arm
    o.matrix_parent_inverse = src.matrix_parent_inverse.copy()
    for g in src.vertex_groups:
        o.vertex_groups.new(name=g.name)
    for i, wp in enumerate(pts):
        _, idx, _ = kd.find(wp)
        for g in src.data.vertices[idx].groups:
            if g.weight > 1e-4:
                o.vertex_groups[g.group].add([i], g.weight, 'REPLACE')
    for p in fme.polygons:
        p.use_smooth = True
    fme.materials.append(mat)
    U.camo_uv(fme, name="tissu", tile=tile)
    o.modifiers.new("Armature", 'ARMATURE').object = U.arm
    return o


def crossbody(col, M, bvhs):
    """Bandoulière de cuir : de l'épaule gauche (+x) en diagonale vers la hanche droite, devant et derrière (passe par-dessus l'épaule)."""
    xs, zs = 0.135, 1.455                 # sur l'épaule
    xe, ze = -0.178, 1.075                # arrivée à la hanche droite
    hw, lift = 0.024, 0.016

    def cast(origin, direction):
        best = None
        for bvh in bvhs:
            h = bvh.ray_cast(origin, direction)
            if h[0] is not None and (best is None or h[3] < best[3]):
                best = h
        return None if best is None else best[0] + best[1].normalized() * lift

    rows = []
    n = 14
    for i in range(n + 1):                                                  # devant : rayons horizontaux vers l'arrière
        t = i / n
        x, z = xs + (xe - xs) * t, zs + (ze - zs) * t
        rows.append([cast(Vector((U.CX + x + dx, U.CY - 0.7, z)), Vector((0, 1, 0))) for dx in (-hw, 0.0, hw)])
    rows.reverse()                                                          # de la hanche avant jusqu'à l'épaule, puis dans le dos
    for i in range(1, 16):                                                  # par-dessus l'épaule : rayons vers le bas
        y = -0.115 + 0.24 * i / 15
        rows.append([cast(Vector((U.CX + xs + dx, U.CY + y, 1.95)), Vector((0, 0, -1))) for dx in (-hw, 0.0, hw)])
    for i in range(n + 1):                                                  # derrière : rayons horizontaux vers l'avant
        t = i / n
        x, z = xs + (xe - xs) * t, zs + (ze - zs) * t
        rows.append([cast(Vector((U.CX + x + dx, U.CY + 0.7, z)), Vector((0, -1, 0))) for dx in (-hw, 0.0, hw)])
    for r in rows:
        for k in range(3):
            if r[k] is None:
                r[k] = next((q for q in r if q is not None), Vector((U.CX, U.CY, 1.3)))
    return strip_from_rows("N_Bandouliere", rows, M["cuir"], col, thick=0.007, tile=0.10)


def cyl(name, center, rx, ry, h, mat, col, weights, bevel=0.01, segs=20):
    """Cylindre fermé aux bouts arrondis (gourde)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=1.0, radius2=1.0, depth=1.0)
    for v in bm.verts:
        v.co.x *= rx; v.co.y *= ry; v.co.z *= h
    U._bevel(bm, bevel)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((U.CX + center[0], U.CY + center[1], center[2])), verts=bm.verts)
    return U._finish(name, bm, mat, col, None, weights)


def accessories(col, M):
    HIPS = {B + "Hips": 1.0}
    out = []
    # ceinture de cuir, boucle, languettes pendantes
    out.append(U.ring("N_Ceinture", (0, CYB), 0.190, 0.152, 1.032, 1.098, 0.012, M["cuir"], col, weights=HIPS))
    out.append(U.box("N_CeintureBoucle", (0.0, CYB - 0.155, 1.066), (0.034, 0.005, 0.027), M["metal"], col, weights=HIPS, bevel=0.003))
    out.append(U.box("N_CeintureBoucleIn", (0.0, CYB - 0.159, 1.066), (0.022, 0.003, 0.017), M["cuir"], col, weights=HIPS, bevel=0.002))
    out.append(U.box("N_CeintureLanguette1", (-0.060, CYB - 0.158, 0.960), (0.015, 0.0035, 0.120), M["cuir"], col, weights=HIPS, bevel=0.002))
    out.append(U.box("N_CeintureLanguette2", (0.035, CYB - 0.160, 1.000), (0.013, 0.0035, 0.075), M["cuir"], col, weights=HIPS, bevel=0.002))
    out.append(U.box("N_CeintureAnneau", (0.035, CYB - 0.164, 0.930), (0.019, 0.004, 0.014), M["metal"], col, weights=HIPS, bevel=0.002))
    # sacoche sur la hanche droite (x < 0) : face large vers l'avant, comme sur l'image
    cx, cz = -0.250, 0.985
    out.append(U.box("N_SacocheCorps", (cx, -0.026, cz), (0.052, 0.026, 0.078), M["gilet"], col, weights=HIPS, bevel=0.012))
    out.append(U.box("N_SacocheRabat", (cx, -0.026 - 0.0245, cz + 0.040), (0.054, 0.008, 0.044), M["gilet"], col, weights=HIPS, bevel=0.009))
    out.append(U.box("N_SacocheLanguette", (cx, -0.026 - 0.0335, cz + 0.020), (0.012, 0.004, 0.056), M["cuir"], col, weights=HIPS, bevel=0.002))
    out.append(U.box("N_SacocheBoucle", (cx, -0.026 - 0.037, cz - 0.014), (0.014, 0.003, 0.011), M["metal"], col, weights=HIPS, bevel=0.0015))
    out.append(U.box("N_SacocheAttacheG", (cx + 0.034, -0.026, cz + 0.082), (0.011, 0.012, 0.014), M["cuir"], col, weights=HIPS, bevel=0.003))
    out.append(U.box("N_SacocheAttacheD", (cx - 0.034, -0.026, cz + 0.082), (0.011, 0.012, 0.014), M["cuir"], col, weights=HIPS, bevel=0.003))
    # gourde sur la hanche gauche (x > 0) : bouteille plate vue de face, bandeau et sangle de cuir
    gx, gz = 0.252, 1.000
    out.append(cyl("N_Gourde", (gx, -0.030, gz), 0.050, 0.038, 0.112, M["gourde"], col, HIPS, 0.014))
    out.append(cyl("N_GourdeGoulot", (gx, -0.030, gz + 0.132), 0.017, 0.017, 0.026, M["gourde"], col, HIPS, 0.004, 14))
    out.append(cyl("N_GourdeBouchon", (gx, -0.030, gz + 0.162), 0.020, 0.020, 0.012, M["metal"], col, HIPS, 0.003, 14))
    out.append(U.ring("N_GourdeBandeau", (gx, -0.030), 0.0525, 0.0405, gz - 0.030, gz + 0.025, 0.006, M["cuir"], col, weights=HIPS))
    out.append(U.box("N_GourdeSangle", (gx - 0.030, -0.030 - 0.041, gz + 0.075), (0.011, 0.0035, 0.060), M["cuir"], col, weights=HIPS, bevel=0.002))
    return out


def vest_and_pouches(col, M):
    out = []
    vest = U.vest_shell("N_Gilet", col, M["gilet"], plate=0.0)
    out.append(vest)
    bvh = U.world_bvh(vest)
    Mp = {"pouche": M["gilet"], "sangle": M["cuir"]}
    for sgn in (-1, 1):
        side = "G" if sgn > 0 else "D"
        out += U.mag_pouch(f"NHaut{side}", bvh, sgn * 0.102, 1.322, Mp, col, True, wide=0.033, tall=0.036)
        out += U.mag_pouch(f"NBas{side}", bvh, sgn * 0.108, 1.228, Mp, col, True, wide=0.050, tall=0.054)
    # sangle de poitrine : bande de cuir et boucle noire entre les deux grandes poches
    out.append(U.conform_box("N_PoitrineSangle", bvh, 0.0, 1.232, (0.040, 0.0035, 0.011), M["cuir"], col, True, bevel=0.002, lift=0.006))
    out.append(U.conform_box("N_PoitrineBoucle", bvh, 0.0, 1.232, (0.016, 0.0055, 0.014), M["metal"], col, True, bevel=0.002, lift=0.010))
    out += U.shoulder_straps(col, M["cuir"], half_w=0.021)
    out.append(crossbody(col, M, [bvh, U.world_bvh(bpy.data.objects["N_TuniqueHaut"])]))
    return [o for o in out if o is not None]


# ---------------------------------------------------------------- tête : foulard, masque
def _scarf_weights(z):
    h = U._smooth(0, 1.50, 1.58, z)
    sp = 1.0 - U._smooth(0, 1.36, 1.47, z)
    return {B + "Head": h, B + "Spine2": sp, B + "Neck": max(0.0, 1.0 - h - sp)}


def _lerp(table, z):
    for (z0, a0, b0), (z1, a1, b1) in zip(table, table[1:]):
        if z <= z1:
            t = max(0.0, (z - z0) / (z1 - z0))
            return a0 + (a1 - a0) * t, b0 + (b1 - b0) * t
    return table[-1][1], table[-1][2]


def headscarf(col, M):
    """Foulard enroulé sur la tête : couvre le front, les tempes, les oreilles et les joues jusqu'à la mâchoire, avec des plis ;
    s'ouvre sur les yeux (fente) et laisse voir le masque au-dessous."""
    NU, NV, N0 = 72, 30, 12
    cy0 = -0.034
    prof = [(1.545, 0.106, 0.124), (1.600, 0.121, 0.141), (1.660, 0.128, 0.152), (1.706, 0.129, 0.153)]
    z_dome, H = 1.706, 0.108
    z_top = z_dome + H
    bm = bmesh.new()
    rows = []
    for j in range(NV + 1):
        if j <= N0:
            z = 1.545 + (z_dome - 1.545) * j / N0
            rx, ry = _lerp(prof, z)
        else:
            phi = math.radians(86.0) * (j - N0) / (NV - N0)               # dôme : rayon R cos(phi), hauteur H sin(phi)
            z = z_dome + H * math.sin(phi)
            rx, ry = prof[-1][1] * math.cos(phi), prof[-1][2] * math.cos(phi)
        row = []
        for i in range(NU):
            th = 2 * math.pi * i / NU                       # 0 = devant
            front = 0.5 * (1 + math.cos(th))
            fold = (0.022 * math.sin(5 * th + 9 * z) + 0.012 * math.sin(11 * th - 14 * z + 1.0)
                    + 0.014 * noise.noise(Vector((math.cos(th) * 2.6, math.sin(th) * 2.6, z * 11))))
            brim = 0.016 * math.exp(-((z - 1.714) / 0.013) ** 2) * front ** 2          # bord roulé au-dessus des sourcils
            k = 1.0 + (fold + brim) / 0.14
            row.append(bm.verts.new((U.CX + rx * math.sin(th) * k, U.CY + cy0 - ry * math.cos(th) * k, z)))
        rows.append(row)
    apex = bm.verts.new((U.CX, U.CY + cy0, z_top))
    for j in range(NV):
        for i in range(NU):
            bm.faces.new((rows[j][i], rows[j][(i + 1) % NU], rows[j + 1][(i + 1) % NU], rows[j + 1][i]))
    for i in range(NU):
        bm.faces.new((rows[NV][i], rows[NV][(i + 1) % NU], apex))

    def in_opening(f):                                      # fente des yeux et ouverture sur le masque
        c = f.calc_center_median()
        x, y, z = c.x - U.CX, c.y - U.CY, c.z
        if y > cy0 - 0.04:
            return False
        half = 0.080 if z > 1.625 else 0.098
        return abs(x) < half and z < 1.714 - 0.022 * (x / 0.08) ** 2
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if in_opening(f)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.verts.index_update()
    for _ in range(14):                                     # bord lissé : la découpe par faces le rend en escalier
        target = {}
        for v in bm.verts:
            if v.is_boundary:
                nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
                if len(nb) == 2:
                    target[v.index] = (nb[0].co + nb[1].co) / 2
        for v in bm.verts:
            if v.index in target:
                v.co = v.co.lerp(target[v.index], 0.5)
    return U._from_mesh_solid("N_FoulardTete", mesh_of(bm, "tmp_hood"), 0.012, M["foulard"], col, {B + "Head": 1.0}, None)


def _coil_z(z, drop, th):
    return z - drop * 0.5 * (1 + math.cos(th))


def coil(name, z, rx, ry, minor, cy, drop, col, M, seed):
    """Tour de foulard épais autour du cou (tore irrégulier), plus bas devant que derrière."""
    NU, NV = 64, 12
    bm = bmesh.new()
    rings = []
    for i in range(NU):
        th = 2 * math.pi * i / NU
        cx_, cy_, cz_ = rx * math.sin(th), cy - ry * math.cos(th), _coil_z(z, drop, th)
        rh = Vector((math.sin(th), -math.cos(th), 0.0))
        ring = []
        for k in range(NV):
            v = 2 * math.pi * k / NV
            m = minor * (1.0 + 0.10 * noise.noise(Vector((math.cos(th) * 1.8 + seed, math.sin(th) * 1.8, 0.0))) + 0.07 * math.sin(5 * th + seed))
            p = Vector((cx_, cy_, cz_)) + rh * (m * math.cos(v)) + Vector((0, 0, m * 0.85 * math.sin(v)))
            ring.append(bm.verts.new((U.CX + p.x, U.CY + p.y, p.z)))
        rings.append(ring)
    for i in range(NU):
        for k in range(NV):
            bm.faces.new((rings[i][k], rings[(i + 1) % NU][k], rings[(i + 1) % NU][(k + 1) % NV], rings[i][(k + 1) % NV]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return U._finish(name, bm, M["foulard"], col, _scarf_weights, None)


# paramètres communs : les tours reposent sur la retombée, qui commence juste sous le premier tour
C1 = dict(z=1.512, rx=0.128, ry=0.136, minor=0.031, cy=-0.032, drop=0.046)
C2 = dict(z=1.452, rx=0.176, ry=0.172, minor=0.037, cy=-0.038, drop=0.056)


def cowl(col, M):
    """Retombée du foulard sur les épaules et le haut de la poitrine : anneau à plis, qui part du premier tour et s'évase sur les épaules."""
    NU, NV = 64, 14
    bm = bmesh.new()
    rows = []
    for j in range(NV + 1):
        row = []
        for i in range(NU):
            th = 2 * math.pi * i / NU
            z_top = _coil_z(C1["z"], C1["drop"], th) - 0.004
            z = z_top + (1.385 - z_top) * j / NV
            t = max(0.0, min(1.0, (z_top - z) / (z_top - 1.385)))
            rx = C1["rx"] + (0.215 - C1["rx"]) * t ** 0.9
            ry = C1["ry"] + (0.180 - C1["ry"]) * t ** 0.9
            cy = C1["cy"] - 0.020 * t
            fold = (0.030 * t * math.sin(6 * th + 11 * z) + 0.016 * t * math.sin(13 * th - 9 * z)
                    + 0.016 * t * noise.noise(Vector((math.cos(th) * 2.2, math.sin(th) * 2.2, z * 8))))
            hem = 0.012 * math.sin(9 * th + 1.0) if j == NV else 0.0
            r = 1.0 + fold / 0.12
            row.append(bm.verts.new((U.CX + rx * math.sin(th) * r, U.CY + cy - ry * math.cos(th) * r, z + hem)))
        rows.append(row)
    for j in range(NV):
        for i in range(NU):
            bm.faces.new((rows[j][i], rows[j][(i + 1) % NU], rows[j + 1][(i + 1) % NU], rows[j + 1][i]))
    o = U._from_mesh_solid("N_FoulardCou", mesh_of(bm, "tmp_cowl"), 0.011, M["foulard"], col, None, _scarf_weights)
    U.camo_uv(o.data, name="tissu", tile=0.20)
    return o


def coils(col, M):
    return [coil("N_FoulardTour1", col=col, M=M, seed=1.0, **C1), coil("N_FoulardTour2", col=col, M=M, seed=5.0, **C2)]


def mask(col, M):
    """Masque noir : coque découpée dans la peau du visage (nez, bouche, menton), sous les yeux, sans le cou."""
    old_region, old_thick = C26.in_region, C26.thickness_cm

    def region(x, y, z):
        return 1.532 <= z <= C26.top_edge(x) and y < -0.040

    def thick(x, y, z):
        return 0.45 + 0.20 * noise.noise(Vector((x * 30, y * 30, z * 30)))
    C26.in_region, C26.thickness_cm = region, thick
    try:
        o = C26.build_shell(col, M["masque"])
    finally:
        C26.in_region, C26.thickness_cm = old_region, old_thick
    o.name = "N_Masque"; o.data.name = "N_Masque"
    return o


# ---------------------------------------------------------------- assemblage
def run():
    U._setup()
    col = bpy.data.collections.get(COLL) or bpy.data.collections.new(COLL)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)
    M = materials()
    built = []
    built.append(tunic_top(col, M))
    built.append(skirt_panel("N_TuniqueAvant", True, col, M))
    built.append(skirt_panel("N_TuniqueArriere", False, col, M))
    built.append(pants(col, M))
    built.append(shoes(col, M))
    built += vest_and_pouches(col, M)
    built += accessories(col, M)
    built.append(headscarf(col, M))
    built.append(cowl(col, M))
    built += coils(col, M)
    built.append(mask(col, M))
    built = [o for o in built if o is not None]
    for o in built:                                    # noms uniformes (les outils de la tenue militaire créent des U_*)
        if o.name.startswith("U_"):
            o.name = "N_" + o.name[2:]
        o["pnj"] = True
    print("tenue PNJ :", len(built), "objets dans", COLL)
    return built
