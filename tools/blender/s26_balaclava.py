"""Cagoule + cache-cou de la tenue militaire, d'après l'image de référence (moutarde, plis épais, jugulaire sur les joues).

La coque est découpée DANS LE MAILLAGE DE LA PEAU (Body) : même surface, mêmes poids. Elle épouse donc exactement le nez,
la bouche, le menton et le cou, et se déforme avec la tête et le cou. Elle est gonflée de 0,4 cm sur le visage et jusqu'à
3 cm sur le cou, avec des plis obliques, puis épaissie en tissu. Ce script n'efface QUE ses propres pièces (U_Cagoule*,
U_Jugulaire*) : il ne touche pas au reste de la tenue.

Usage dans Blender :  import s26_balaclava as C; C.run()"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree
import s24_uniform_military as U

B = U.B
OWN = ("U_Cagoule", "U_Jugulaire", "U_CacheCou", "U_Menton")          # préfixes des pièces gérées par ce script
Z_NECK0, Z_NECK1 = 1.452, 1.556     # le cache-cou va du haut des épaules à la mâchoire
CY0 = -0.030                        # axe du cou (centre de la tête) en y


def top_edge(x):
    """Bord haut du masque (z) : sur l'arête du nez au centre (1,632), puis nettement sous les yeux et les pommettes."""
    return 1.632 - 0.020 * U._smooth(0, 0.010, 0.050, abs(x)) - 0.012 * U._smooth(0, 0.050, 0.090, abs(x))


def ring_top(x, y):
    """Haut du cache-cou autour de la tête : 1,556 sur les côtés (sous l'oreille), jusqu'à 1,606 derrière (sous le casque)."""
    return Z_NECK1 + 0.094 * U._smooth(0, -0.004, 0.026, y)      # la nuque est à y ~ 0 : le haut est atteint dès là, derrière l'oreille


def in_region(x, y, z):
    r = math.hypot(x, y - CY0)
    if Z_NECK0 <= z < ring_top(x, y):
        return r < 0.112                                      # tout le tour du cou, et la nuque jusqu'au casque
    if Z_NECK1 <= z <= top_edge(x):
        return y < -0.046                                     # visage : devant les oreilles seulement
    return False


def thickness_cm(x, y, z):
    """Épaisseur à ajouter à la peau, en cm : bourrelet de cache-cou en bas, tissu fin sur le visage, plis obliques."""
    t = U._smooth(0, 1.490, 1.558, z)                         # 0 = cou, 1 = visage (le tissu colle à la peau dès le menton)
    base = 3.0 * (1 - t) + 0.40 * t
    ang = math.atan2(x, -(y - CY0))
    wrinkle = 0.55 * math.sin(2 * math.pi * (z / 0.032 + 0.30 * ang / math.pi + 0.45 * noise.noise(Vector((x * 14, y * 14, z * 9)))))
    wrinkle += 0.30 * noise.noise(Vector((x * 38, y * 38, z * 38)))
    bottom = 0.55 * (1 - U._smooth(0, Z_NECK0, Z_NECK0 + 0.014, z))            # ourlet épais en bas
    rim = 0.30 * (1 - U._smooth(0, 0.0, 0.007, top_edge(x) - z)) * t           # ourlet roulé du bord haut du masque
    return base + (1 - t) * wrinkle + 0.30 * t * noise.noise(Vector((x * 30, y * 30, z * 30))) + bottom + rim


def build_shell(col, mat):
    arm, MW, CX, CY = U.arm, U.MW, U.CX, U.CY
    body = bpy.data.objects["Body"]
    bm = bmesh.new()
    bm.from_mesh(body.data)
    inside = {}
    for v in bm.verts:
        w = MW @ v.co
        inside[v.index] = in_region(w.x - CX, w.y - CY, w.z)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(inside[v.index] for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    for _ in range(1):                                         # pointes sur le bord (une seule passe : chaque passe grignote le bord)
        spikes = [f for f in bm.faces if sum(1 for e in f.edges if e.is_boundary) >= 2]
        if not spikes:
            break
        bmesh.ops.delete(bm, geom=spikes, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # ne garder que la plus grande pièce connexe (les petits îlots de peau détachés)
    seen, best = set(), []
    for f0 in bm.faces:
        if f0.index in seen:
            continue
        comp, stack = [], [f0]
        seen.add(f0.index)
        while stack:
            f = stack.pop(); comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index); stack.append(g)
        if len(comp) > len(best):
            best = comp
    keep = set(f.index for f in best)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.verts.index_update()
    for _ in range(45):                                        # bord lissé
        target = {}
        for v in bm.verts:
            if v.is_boundary:
                nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
                if len(nb) >= 2:
                    target[v.index] = sum((n.co for n in nb), Vector()) / len(nb)
        for v in bm.verts:
            if v.index in target:
                v.co = v.co.lerp(target[v.index], 0.5)
    bm.normal_update()
    skin_tree = BVHTree.FromBMesh(bm)                          # peau d'origine : référence pour le dégagement
    # gonflement : plis et bourrelet (les coordonnées locales sont en cm)
    moves = []
    for v in bm.verts:
        w = MW @ v.co
        moves.append((v, v.normal.copy() * thickness_cm(w.x - CX, w.y - CY, w.z)))
    for v, d in moves:
        v.co += d
    inner = [v for v in bm.verts if not v.is_boundary]
    bmesh.ops.smooth_vert(bm, verts=inner, factor=0.35, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    face = [v for v in inner if (MW @ v.co).z > 1.552 and (MW @ v.co).y - CY < -0.046]     # masque : tissu tendu, sans narines ni lèvres
    for _ in range(12):
        bmesh.ops.smooth_vert(bm, verts=face, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.smooth_vert(bm, verts=inner, factor=0.25, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for v in bm.verts:                                         # dégagement minimal : jamais à moins de 3,5 mm de la peau
        loc, n, _, _ = skin_tree.find_nearest(v.co)
        if loc is not None:
            d = (v.co - loc).dot(n)
            if d < 0.35:
                v.co += n * (0.35 - d)
    me = bpy.data.meshes.new("U_Cagoule")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("U_Cagoule", me)
    col.objects.link(o)
    o.parent = arm
    o.matrix_parent_inverse = body.matrix_parent_inverse.copy()
    for g in body.vertex_groups:                               # mêmes groupes, dans le même ordre : les poids de la peau suivent
        o.vertex_groups.new(name=g.name)
    s = o.modifiers.new("S", 'SOLIDIFY'); s.thickness = 0.28; s.offset = -1.0      # cm : tissu de 2,8 mm, vers la peau
    new = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    old = o.data
    o.modifiers.clear()
    o.data = new
    bpy.data.meshes.remove(old)
    for p in new.polygons:
        p.use_smooth = True
    new.materials.append(mat)
    cylindrical_uv(new, tile=0.08)
    o.modifiers.new("Armature", 'ARMATURE').object = arm
    return o


def cylindrical_uv(me, tile=0.08):
    """UV cylindriques autour de l'axe du cou : la maille est à l'échelle réelle, sans couture visible."""
    for l in list(me.uv_layers):
        me.uv_layers.remove(l)
    uv = me.uv_layers.new(name="tissu")
    MW, CX, CY = U.MW, U.CX, U.CY
    circ = 2 * math.pi * 0.085
    for p in me.polygons:
        vals = []
        for li in p.loop_indices:
            w = MW @ me.vertices[me.loops[li].vertex_index].co
            a = math.atan2(w.x - CX, -(w.y - CY - CY0))
            vals.append([a / (2 * math.pi) * circ / tile, w.z / tile])
        for u in vals[1:]:                                     # continuité autour de la couture
            while u[0] - vals[0][0] > circ / tile / 2:
                u[0] -= circ / tile
            while u[0] - vals[0][0] < -circ / tile / 2:
                u[0] += circ / tile
        for li, u in zip(p.loop_indices, vals):
            uv.data[li].uv = (u[0], u[1])


def chin_straps(shell, M, col):
    """Jugulaire : sangle plate de chaque oreille jusqu'au menton, posée sur la surface du masque, avec une coque sous le menton
    et deux petits réglages métalliques par côté."""
    MW = U.MW
    bm = bmesh.new(); bm.from_mesh(shell.data)
    bmesh.ops.transform(bm, matrix=shell.matrix_world, verts=bm.verts)
    tree = BVHTree.FromBMesh(bm); bm.free()
    # peau de la tête (devant l'oreille, au-dessus de la cagoule) : la jugulaire s'y appuie là où il n'y a pas de tissu
    sk = bmesh.new(); sk.from_mesh(bpy.data.objects["Body"].data)
    bmesh.ops.transform(sk, matrix=U.MW, verts=sk.verts)
    out_f = [f for f in sk.faces if not all(1.50 < v.co.z < 1.74 and v.co.y - U.CY < 0.0 for v in f.verts)]
    bmesh.ops.delete(sk, geom=out_f, context='FACES')
    skin_tree = BVHTree.FromBMesh(sk); sk.free()
    HEAD = {B + "Head": 1.0}
    made = []
    for sgn, side in ((1, "L"), (-1, "R")):
        # part du rail d'oreille du casque, descend devant l'oreille, longe la joue puis passe sous le menton
        way = [(sgn * 0.091, -0.040, 1.652), (sgn * 0.090, -0.052, 1.634), (sgn * 0.086, -0.068, 1.614),
               (sgn * 0.078, -0.090, 1.596), (sgn * 0.062, -0.112, 1.580), (sgn * 0.038, -0.126, 1.562), (sgn * 0.010, -0.127, 1.548)]
        # points régulièrement espacés le long de la ligne brisée, rabattus sur la surface du masque
        pts = []
        for i in range(len(way) - 1):
            a, b = Vector(way[i]), Vector(way[i + 1])
            for k in range(6):
                pts.append(a.lerp(b, k / 6))
        pts.append(Vector(way[-1]))
        surf = []
        for p in pts:
            q = Vector((U.CX + p.x, U.CY + p.y, p.z))
            a = tree.find_nearest(q)
            b = skin_tree.find_nearest(q)
            if a[0] is not None and (b[0] is None or a[3] <= b[3] + 0.002):
                surf.append((a[0], a[1].normalized(), 0.0))            # sur le tissu de la cagoule
            elif b[0] is not None:
                surf.append((b[0], b[1].normalized(), 0.0026))         # sur la peau, au-dessus du tissu
        if len(surf) < 4:
            print("jugulaire", side, ": surface introuvable")
            continue
        for _ in range(4):                                     # tracé et orientation lissés : sangle plate, pas vrillée
            locs = [q[0].copy() for q in surf]; ns = [q[1].copy() for q in surf]; lifts = [q[2] for q in surf]
            for i in range(1, len(surf) - 1):
                locs[i] = (surf[i - 1][0] + 2 * surf[i][0] + surf[i + 1][0]) / 4
                ns[i] = ((surf[i - 1][1] + 2 * surf[i][1] + surf[i + 1][1]) / 4).normalized()
                lifts[i] = (surf[i - 1][2] + 2 * surf[i][2] + surf[i + 1][2]) / 4
            surf = list(zip(locs, ns, lifts))
        sm = bmesh.new()
        rows = []
        for i, (loc, n, lift) in enumerate(surf):
            t = (surf[min(i + 1, len(surf) - 1)][0] - surf[max(i - 1, 0)][0]).normalized()
            side_v = n.cross(t).normalized()
            c = loc + n * (0.0016 + lift)
            rows.append((sm.verts.new(c - side_v * 0.0075), sm.verts.new(c + side_v * 0.0075)))
        for i in range(len(rows) - 1):
            sm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
        me = bpy.data.meshes.new("tmp_j"); sm.to_mesh(me); sm.free()
        made.append(U._from_mesh_solid(f"U_Jugulaire{side}", me, 0.0026, M["jug"], col, HEAD, None))
        for k, idx in enumerate((len(surf) // 3, 2 * len(surf) // 3)):         # réglages métalliques
            loc, n, lift = surf[idx]
            t = (surf[min(idx + 1, len(surf) - 1)][0] - surf[max(idx - 1, 0)][0]).normalized()
            sv = n.cross(t).normalized()
            fr = Matrix(((sv.x, -n.x, t.x), (sv.y, -n.y, t.y), (sv.z, -n.z, t.z)))
            c = loc + n * (0.0042 + lift)
            made.append(U.box(f"U_JugulaireMetal{side}{k}", (c.x - U.CX, c.y - U.CY, c.z), (0.0090, 0.0016, 0.0058), M["metal"], col, weights=HEAD, bevel=0.0008, frame=fr))
    # coque sous le menton, qui relie les deux sangles
    loc, n, _, _ = tree.find_nearest(Vector((U.CX, U.CY - 0.116, 1.546)))
    n = n.normalized()
    right = Vector((1, 0, 0)); up = n.cross(right).normalized(); right = up.cross(n).normalized()
    fr = Matrix(((right.x, -n.x, up.x), (right.y, -n.y, up.y), (right.z, -n.z, up.z)))
    c = loc + n * 0.0050
    made.append(U.box("U_JugulaireMenton", (c.x - U.CX, c.y - U.CY, c.z), (0.026, 0.0042, 0.0125), M["jug"], col, weights=HEAD, bevel=0.003, frame=fr))
    return made


def run():
    U._setup()
    col = bpy.data.collections.get(U.COLL) or bpy.data.collections.new(U.COLL)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        if o.name.startswith(OWN):
            me = o.data if o.type == 'MESH' else None
            bpy.data.objects.remove(o, do_unlink=True)
            if me is not None and me.users == 0:
                bpy.data.meshes.remove(me)
    M = U.materials()
    M["cagoule"] = U._mat("U_Cagoule", None, 0.95, image="cagoule_tissu.png")
    M["jug"] = U._mat("U_Jugulaire", (0.19, 0.098, 0.011), 0.8)
    shell = build_shell(col, M["cagoule"])
    bpy.context.view_layer.update()
    parts = [shell] + chin_straps(shell, M, col)
    print("cagoule :", len(parts), "pièces |", len(shell.data.vertices), "sommets de coque")
    return parts
