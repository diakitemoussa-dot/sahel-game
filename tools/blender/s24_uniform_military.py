"""Tenue militaire camouflage (d'après les 3 images de référence), construite sur le squelette existant.
Toutes les pièces sont dans la collection 'Tenue_Militaire' (objets U_*), attachées à l'armature 'Armature' : les 57
animations s'appliquent sans rien changer. Le fichier .blend n'est pas modifié ailleurs ; la collection est reconstruite
à chaque lancement (idempotent). Coordonnées : mètres, repère monde, personnage centré en (cx, cy), face à -Y.

Usage dans Blender :  import s24_uniform_military as U; U.run()"""
import math, os
import bpy, bmesh
from mathutils import Matrix, Vector, Euler

PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
TEX = os.path.join(PROJ, "assets", "textures", "uniformes")
COLL = "Tenue_Militaire"
B = "mixamorig4:"
CAMO_TILE_M = 0.9          # une tuile de camouflage couvre 0,9 m

arm = None; MW = None; MINV = None; CX = CY = 0.0


def _setup():
    global arm, MW, MINV, CX, CY
    arm = bpy.data.objects["Armature"]
    MW = arm.matrix_world.copy()
    MINV = MW.inverted()
    CX, CY = arm.location.x, arm.location.y


# ---------------------------------------------------------------- matériaux
def _mat(name, color, rough=0.8, metal=0.0, image=None):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if image:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(os.path.join(TEX, image), check_existing=True)
        t.image.colorspace_settings.name = "sRGB"
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = (*color, 1.0)
    return m


def materials():
    return {
        "camo": _mat("U_Camo", None, 0.92, image="camo_tuile.png"),
        "gilet": _mat("U_Gilet", None, 0.92, image="gilet_tissu.png"),
        "sangle": _mat("U_SangleTissu", (0.30, 0.30, 0.07), 0.9),
        "metal": _mat("U_Metal", (0.16, 0.16, 0.15), 0.4, 0.85),
        "pouche": _mat("U_Pouche", (0.138, 0.117, 0.016), 0.88),
        "sable": _mat("U_Sable", (0.50, 0.38, 0.16), 0.80),
        "ceinture": _mat("U_CeintureMoutarde", (0.413, 0.223, 0.027), 0.82),    # jaune moutarde doré, relevé sur l'image de référence
        "boucle_c": _mat("U_CeintureBoucle", (0.042, 0.040, 0.033), 0.45),
        "chaussure": _mat("U_ChaussureMoutarde", (0.413, 0.223, 0.027), 0.82),
        "casque": _mat("U_Casque", (0.22, 0.30, 0.12), 0.55),
        "noir": _mat("U_Noir", (0.025, 0.025, 0.028), 0.55),
        "verre": _mat("U_Lunettes", (0.01, 0.01, 0.012), 0.12, 0.2),
        "botte": _mat("U_Botte", (0.48, 0.36, 0.15), 0.75),
        "semelle": _mat("U_Semelle", (0.10, 0.075, 0.05), 0.9),
        "coque": _mat("U_Genouillere", (0.55, 0.42, 0.16), 0.45),
        "velcro": _mat("U_Velcro", (0.20, 0.26, 0.10), 0.95),
        "ecusson": _mat("U_Ecusson", None, 0.8, image="ecusson_mali.png"),
    }


# ---------------------------------------------------------------- outils de construction
def _smooth(step, a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def torso_weights(z):
    """Poids du haut du corps : Spine1 en bas, Spine2 en haut (le gilet suit la flexion du buste)."""
    t = _smooth(0, 1.20, 1.38, z)
    return {B + "Spine1": 1.0 - t, B + "Spine2": t}


def _finish(name, bm, mat, collection, weights_fn=None, weights=None, smooth=True):
    """bm en repère monde -> objet en repère armature, attaché à l'armature, poids par sommet."""
    bmesh.ops.transform(bm, matrix=MINV, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    collection.objects.link(o)
    o.parent = arm
    me.materials.append(mat)
    o.modifiers.new("Armature", 'ARMATURE').object = arm
    groups = {}
    for i, v in enumerate(me.vertices):
        w = weights_fn((MW @ v.co).z) if weights_fn else weights
        for bone, val in w.items():
            if val <= 1e-4:
                continue
            vg = groups.get(bone) or groups.setdefault(bone, o.vertex_groups.new(name=bone))
            vg.add([i], val, 'REPLACE')
    return o


def _bevel(bm, r):
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, segments=2, affect='EDGES', profile=0.5)


def box(name, center, half, mat, collection, weights=None, weights_fn=None, bevel=0.006, rot=(0, 0, 0), frame=None):
    """Boîte arrondie. center et half en mètres, repère monde (dx, dy, z) relatif au personnage."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for v in bm.verts:
        v.co.x *= half[0]; v.co.y *= half[1]; v.co.z *= half[2]
    if bevel:
        _bevel(bm, min(bevel, min(half) * 0.45))
    R3 = frame if frame is not None else Euler(rot).to_matrix()
    T = Matrix.Translation((CX + center[0], CY + center[1], center[2])) @ R3.to_4x4()
    bmesh.ops.transform(bm, matrix=T, verts=bm.verts)
    return _finish(name, bm, mat, collection, weights_fn, weights)


def ring(name, center, rx, ry, z0, z1, thick, mat, collection, weights=None, weights_fn=None, rx2=None, ry2=None, segs=28):
    """Anneau elliptique ouvert (cuve) d'épaisseur `thick`, de z0 à z1 ; rx2/ry2 : rayons du haut (cône)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=1.0, radius2=1.0, depth=1.0)
    for v in bm.verts:
        top = v.co.z > 0
        rx_, ry_ = (rx2 if (top and rx2) else rx), (ry2 if (top and ry2) else ry)
        v.co.x *= rx_; v.co.y *= ry_
        v.co.z = z1 if top else z0
        v.co.x += CX + center[0]; v.co.y += CY + center[1]
    bm.faces.ensure_lookup_table()
    me_tmp = bpy.data.meshes.new("tmp")
    bm.to_mesh(me_tmp); bm.free()
    o = _from_mesh_solid(name, me_tmp, thick, mat, collection, weights, weights_fn)
    return o


def _from_mesh_solid(name, me, thick, mat, collection, weights, weights_fn):
    """Épaissit une coque (repère monde) par un modificateur Solidify appliqué, puis finalise."""
    o = bpy.data.objects.new(name + "_t", me)
    collection.objects.link(o)
    s = o.modifiers.new("S", 'SOLIDIFY'); s.thickness = thick; s.offset = 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me2 = bpy.data.meshes.new_from_object(ev)
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.meshes.remove(me)
    bm = bmesh.new(); bm.from_mesh(me2); bpy.data.meshes.remove(me2)
    return _finish(name, bm, mat, collection, weights_fn, weights)


def ellipsoid_shell(name, center, radii, keep, thick, mat, collection, weights, rot=(0, 0, 0)):
    """Coquille d'ellipsoïde : on garde les sommets pour lesquels keep(x, y, z) est vrai (repère relatif au centre du personnage)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=1.0)
    for v in bm.verts:
        v.co.x *= radii[0]; v.co.y *= radii[1]; v.co.z *= radii[2]
        v.co += Vector(center)
    drop = [v for v in bm.verts if not keep(v.co.x, v.co.y, v.co.z)]
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    for v in bm.verts:
        v.co.x += CX; v.co.y += CY
    me = bpy.data.meshes.new("tmp"); bm.to_mesh(me); bm.free()
    return _from_mesh_solid(name, me, thick, mat, collection, weights, None)


# ---------------------------------------------------------------- vêtements dupliqués (poids déjà faits)
def camo_uv(me, name="camo", tile=CAMO_TILE_M):
    """UV camouflage à l'échelle réelle : projection selon l'axe dominant de chaque face (coordonnées locales Mixamo : cm, Y en haut)."""
    for l in list(me.uv_layers):
        me.uv_layers.remove(l)
    uv = me.uv_layers.new(name=name)
    k = 0.01 / tile
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            u, v = ((c.z, c.y) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y))
            uv.data[li].uv = (u * k, v * k)


def dup_clothing(src_name, new_name, collection, mats_by_slot):
    src = bpy.data.objects[src_name]
    me = src.data.copy()
    o = bpy.data.objects.new(new_name, me)
    collection.objects.link(o)
    o.parent = arm
    o.matrix_parent_inverse = src.matrix_parent_inverse.copy()
    o.modifiers.new("Armature", 'ARMATURE').object = arm
    for i, s in enumerate(me.materials):
        me.materials[i] = mats_by_slot[min(i, len(mats_by_slot) - 1)]
    return o


def gloves(name, collection, mat):
    """Gants : coque des mains de Body, légèrement gonflée (mêmes poids, donc mêmes déformations)."""
    body = bpy.data.objects["Body"]
    names = {g.index: g.name for g in body.vertex_groups}
    bm = bmesh.new(); bm.from_mesh(body.data)
    dl = bm.verts.layers.deform.active
    def is_hand(v):
        if not v[dl]:
            return False
        g = max(v[dl].items(), key=lambda kv: kv[1])[0]
        return "Hand" in names[g] and ("Left" in names[g] or "Right" in names[g])
    hand = {v.index for v in bm.verts if is_hand(v)}
    drop = [f for f in bm.faces if not all(v.index in hand for v in f.verts)]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.45                       # cm : le gant dépasse de 4,5 mm
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    collection.objects.link(o)
    o.parent = arm
    o.matrix_parent_inverse = body.matrix_parent_inverse.copy()
    for g in body.vertex_groups:
        o.vertex_groups.new(name=g.name)             # même ordre : les poids copiés par bmesh pointent sur les bons groupes
    o.modifiers.new("Armature", 'ARMATURE').object = arm
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return o



def vest_shell(name, collection, mat, plate=0.8):
    """Gilet : coque découpée dans la chemise (même maillage, mêmes poids : il se déforme avec le torse),
    gonflée de 1 cm, avec une plaque avant et une plaque arrière en relief de 0,8 cm de plus, puis épaissie."""
    plate_cm = plate
    src = bpy.data.objects["Hoodie"]
    bm = bmesh.new(); bm.from_mesh(src.data)

    def ok(v):
        w = MW @ v.co
        x, z = abs(w.x - CX), w.z
        if z < 1.13 or z > 1.46:
            return False
        if z > 1.375:                            # au-dessus des plaques : rien (les bretelles sont des pièces à part)
            return False
        if x > 0.215:
            return False
        if x > 0.185 and z > 1.30:               # emmanchures : les bras sortent du gilet
            return False
        return True
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(ok(v) for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    for _ in range(4):                                                            # pointes : faces qui n'ont plus qu'un seul voisin
        spikes = [f for f in bm.faces if sum(1 for e in f.edges if e.is_boundary) >= 2]
        if not spikes:
            break
        bmesh.ops.delete(bm, geom=spikes, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.verts.index_update()
    for _ in range(20):                                                           # bord lissé : la découpe par sommets le rend dentelé
        target = {}
        for v in bm.verts:
            if v.is_boundary:
                nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
                if len(nb) == 2:
                    target[v.index] = (nb[0].co + nb[1].co) / 2
        for v in bm.verts:
            if v.index in target:
                v.co = v.co.lerp(target[v.index], 0.6)
    bm.normal_update()
    plate = set()
    for f in bm.faces:
        c = MW @ f.calc_center_median()
        x, z = c.x - CX, c.z
        if abs(x) < 0.125 and 1.215 < z < 1.375 and abs(f.normal.z) > 0.55:      # normales locales : Z = avant/arrière
            plate.update(v.index for v in f.verts)
    for v in bm.verts:
        v.co += v.normal * (1.0 + (plate_cm if v.index in plate else 0.0))            # cm
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(4):                                                            # lisse l'arête de la fermeture de la chemise
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    collection.objects.link(o)
    o.parent = arm
    o.matrix_parent_inverse = src.matrix_parent_inverse.copy()
    for g in src.vertex_groups:
        o.vertex_groups.new(name=g.name)
    s = o.modifiers.new("S", 'SOLIDIFY'); s.thickness = 0.6; s.offset = -1.0     # cm
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data
    o.modifiers.clear()
    o.data = new
    bpy.data.meshes.remove(old)
    for p in new.polygons:
        p.use_smooth = True
    new.materials.append(mat)
    camo_uv(new, name="tissu", tile=0.12)
    o.modifiers.new("Armature", 'ARMATURE').object = arm
    return o


def world_bvh(obj):
    """Arbre de recherche de la surface d'un objet, en repère monde (pour poser des pièces sur le torse)."""
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.transform(bm, matrix=MW, verts=bm.verts)
    t = BVHTree.FromBMesh(bm); bm.free()
    return t


def conform_box(name, bvh, x, z, half, mat, collection, front=True, weights_fn=None, bevel=0.006, lift=0.0):
    """Boîte posée sur la surface (lancer de rayon horizontal vers le torse) et orientée selon sa normale."""
    o = Vector((CX + x, CY + (-0.8 if front else 0.8), z))
    hit = bvh.ray_cast(o, Vector((0, 1, 0)) if front else Vector((0, -1, 0)))
    if hit[0] is None:
        print("pas de surface pour", name, x, z)
        return None
    loc, n = hit[0], hit[1].normalized()
    if (n.y < 0) != front:
        n = -n
    ref = Vector((0, -1, 0)) if front else Vector((0, 1, 0))
    rot = ref.rotation_difference(n).to_euler()
    c = loc + n * (half[1] + lift)
    return box(name, (c.x - CX, c.y - CY, c.z), half, mat, collection, weights_fn=weights_fn or torso_weights, bevel=bevel, rot=tuple(rot))


def shoulder_straps(collection, mat, y0=-0.143, y1=0.121, n=22, half_w=0.031, xc=0.102, lift=0.012):
    """Deux bretelles par-dessus les épaules, qui relient le devant au dos : elles suivent la surface de la chemise
    (lancers de rayons vers le bas), sont épaissies, et reprennent les poids de la chemise (elles suivent les bras)."""
    from mathutils.kdtree import KDTree
    src = bpy.data.objects["Hoodie"]
    bvh = world_bvh(src)
    kd = KDTree(len(src.data.vertices))
    for i, v in enumerate(src.data.vertices):
        kd.insert(MW @ v.co, i)
    kd.balance()
    made = []
    for sgn, side in ((1, "L"), (-1, "R")):
        rows = []

        def cast(origin, direction):
            hit = bvh.ray_cast(origin, direction)
            return None if hit[0] is None else hit[0] + hit[1].normalized() * lift
        zs_v = [1.285 + 0.150 * k / 9 for k in range(10)]                        # montée le long de la poitrine, du bord des plaques au sommet
        for z in zs_v:                                                          # devant : rayons horizontaux vers l'arrière
            rows.append([cast(Vector((CX + sgn * xc + dx, CY - 0.6, z)), Vector((0, 1, 0))) for dx in (-half_w, 0.0, half_w)])
        for i in range(n + 1):                                                  # par-dessus l'épaule : rayons vers le bas
            y = y0 + (y1 - y0) * i / n
            rows.append([cast(Vector((CX + sgn * xc + dx, CY + y, 1.85)), Vector((0, 0, -1))) for dx in (-half_w, 0.0, half_w)])
        for z in reversed(zs_v):                                                # derrière : rayons horizontaux vers l'avant
            rows.append([cast(Vector((CX + sgn * xc + dx, CY + 0.6, z)), Vector((0, -1, 0))) for dx in (-half_w, 0.0, half_w)])
        n = len(rows) - 1
        # trous éventuels : on reprend le point voisin
        for r in rows:
            for k in range(3):
                if r[k] is None:
                    r[k] = next((q for q in r if q is not None), Vector((CX + sgn * xc, CY, 1.45)))
        bm = bmesh.new()
        vs = [[bm.verts.new(p) for p in r] for r in rows]
        for i in range(n):
            for k in range(2):
                bm.faces.new((vs[i][k], vs[i][k + 1], vs[i + 1][k + 1], vs[i + 1][k]))
        me = bpy.data.meshes.new("tmp_s"); bm.to_mesh(me); bm.free()
        tmp = bpy.data.objects.new("tmp_s", me); collection.objects.link(tmp)
        sm = tmp.modifiers.new("S", 'SOLIDIFY'); sm.thickness = 0.008; sm.offset = 1.0
        dg = bpy.context.evaluated_depsgraph_get()
        new = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
        bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.meshes.remove(me)
        bmw = bmesh.new(); bmw.from_mesh(new); bpy.data.meshes.remove(new)
        world_pts = [v.co.copy() for v in bmw.verts]
        bmesh.ops.transform(bmw, matrix=MINV, verts=bmw.verts)
        fme = bpy.data.meshes.new(f"U_Bretelle{side}"); bmw.to_mesh(fme); bmw.free()
        o = bpy.data.objects.new(f"U_Bretelle{side}", fme)
        collection.objects.link(o)
        o.parent = arm
        o.matrix_parent_inverse = src.matrix_parent_inverse.copy()
        for g in src.vertex_groups:
            o.vertex_groups.new(name=g.name)
        for i, wp in enumerate(world_pts):
            _, idx, _ = kd.find(wp)
            for g in src.data.vertices[idx].groups:
                if g.weight > 1e-4:
                    o.vertex_groups[g.group].add([i], g.weight, 'REPLACE')
        for p in fme.polygons:
            p.use_smooth = True
        fme.materials.append(mat)
        camo_uv(fme, name="tissu", tile=0.12)
        o.modifiers.new("Armature", 'ARMATURE').object = arm
        made.append(o)
    return made


def mag_pouch(tag, bvh, x, z, M, col, front=True, wide=0.033, tall=0.056):
    """Poche de chargeur : corps, grand rabat arrondi, large sangle verticale beige, boucle. Toutes les pièces sont posées dans
    un seul repère, celui de la surface du gilet au centre de la poche : elles restent alignées entre elles."""
    o = Vector((CX + x, CY + (-0.8 if front else 0.8), z))
    hit = bvh.ray_cast(o, Vector((0, 1, 0)) if front else Vector((0, -1, 0)))
    if hit[0] is None:
        print("pas de surface pour", tag)
        return []
    loc, n = hit[0], hit[1].normalized()
    if (n.y < 0) != front:
        n = -n
    right = Vector((0, 0, 1)).cross(n).normalized()
    up = n.cross(right).normalized()
    frame = Matrix(((right.x, -n.x, up.x), (right.y, -n.y, up.y), (right.z, -n.z, up.z)))     # colonnes : X = droite, Y = -normale, Z = haut
    d = 0.026

    def part(name, dx, dz, dout, half, mat, bevel):
        c = loc + right * dx + up * dz + n * dout
        return box(name, (c.x - CX, c.y - CY, c.z), half, mat, col, weights_fn=torso_weights, bevel=bevel, frame=frame)
    return [part(f"U_Poche{tag}", 0, 0, d, (wide, d, tall), M["pouche"], 0.010),
            part(f"U_Rabat{tag}", 0, tall * 0.30, 2 * d + 0.011, (wide + 0.001, 0.011, tall * 0.74), M["pouche"], 0.009),
            part(f"U_Sangle{tag}", 0, tall * 0.12, 2 * d + 0.022 + 0.003, (min(0.010, wide * 0.30), 0.003, tall * 0.84), M["sangle"], 0.002),
            part(f"U_Boucle{tag}", 0, -tall * 0.12, 2 * d + 0.022 + 0.008, (min(0.013, wide * 0.38), 0.005, 0.011), M["sangle"], 0.002)]


def webbing_bands(bvh, M, col):
    """Sangles MOLLE en relief : trois sur le devant (la plus haute porte un clip), trois dans le dos."""
    out = []
    for j, (z, hw) in enumerate(((1.352, 0.082), (1.314, 0.112), (1.280, 0.112))):
        out.append(conform_box(f"U_MolleAv{j}", bvh, 0.0, z, (hw, 0.0045, 0.013), M["sangle"], col, True, bevel=0.002))
    out.append(conform_box("U_ClipAv", bvh, 0.0, 1.352, (0.020, 0.006, 0.0085), M["sangle"], col, True, bevel=0.003, lift=0.004))
    for j, z in enumerate((1.352, 1.314, 1.280)):
        out.append(conform_box(f"U_MolleAr{j}", bvh, 0.0, z, (0.112, 0.0045, 0.013), M["sangle"], col, False, bevel=0.002))
    return [o for o in out if o is not None]


def strap_hardware(M, col, sh_bvh):
    """Échelle de réglage (3 barres métalliques) sur chaque bretelle, devant et dans le dos, et languette qui descend sur la plaque."""
    out = []
    for sgn, side in ((1, "L"), (-1, "R")):
        for fr, tag, ys in ((True, "Av", (-0.108, -0.086, -0.064)), (False, "Ar", (0.075, 0.055))):
            for k, y in enumerate(ys):
                hit = sh_bvh.ray_cast(Vector((CX + sgn * 0.102, CY + y, 1.85)), Vector((0, 0, -1)))
                if hit[0] is None:
                    continue
                c = hit[0] + hit[1].normalized() * (0.012 + 0.0085)
                out.append(box(f"U_Echelle{side}{tag}{k}", (c.x - CX, c.y - CY, c.z), (0.029, 0.0045, 0.0035), M["metal"], col,
                               weights_fn=torso_weights, bevel=0.0012))
    return out

# ---------------------------------------------------------------- tenue
def run():
    _setup()
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

    # chemise et pantalon : copies des vêtements actuels, en camouflage
    shirt = dup_clothing("Hoodie", "U_Chemise", col, [M["camo"]]); camo_uv(shirt.data); built.append(shirt)
    pants = dup_clothing("Pants", "U_Pantalon", col, [M["camo"]]); camo_uv(pants.data); built.append(pants)
    # bottes : la chaussure actuelle en beige + tiges
    boots = dup_clothing("Shoes", "U_BottesBase", col, [M["chaussure"]] * 5)       # tige, semelle et lacets : jaune moutarde, comme la ceinture; built.append(boots)

    for sgn, side in ((1, "Left"), (-1, "Right")):
        # tige de botte : cône ouvert autour de la cheville, poids Foot (bas) -> Leg (haut)
        built.append(ring(f"U_Botte{side}", (sgn * 0.145, 0.034), 0.098, 0.106, 0.03, 0.31, 0.007, M["botte"], col,
                          weights_fn=lambda z, s=side: {B + s + "Foot": 1 - _smooth(0, 0.05, 0.25, z), B + s + "Leg": _smooth(0, 0.05, 0.25, z)},
                          rx2=0.094, ry2=0.108))
        for i in range(6):                          # lacets
            z = 0.09 + 0.037 * i
            built.append(box(f"U_Lacet{side}{i}", (sgn * 0.145, 0.034 - 0.108, z), (0.036, 0.004, 0.005), M["noir"], col,
                             weights_fn=lambda zz, s=side: {B + s + "Foot": 1 - _smooth(0, 0.05, 0.25, zz), B + s + "Leg": _smooth(0, 0.05, 0.25, zz)}, bevel=0.002))
        # genouillère et sangles
        built.append(box(f"U_Genouillere{side}", (sgn * 0.123, -0.122, 0.52), (0.058, 0.026, 0.078), M["coque"], col,
                         weights={B + side + "Leg": 1.0}, bevel=0.016))
        for k, z in enumerate((0.66, 0.34)):
            built.append(ring(f"U_Sangle{side}{k}", (sgn * 0.123, 0.01), 0.108, 0.118, z - 0.022, z + 0.022, 0.006, M["sable"], col,
                              weights={B + side + ("UpLeg" if z > 0.55 else "Leg"): 1.0}))
        # écusson d'épaule et patch velcro (gauche : drapeau ; droite : velcro seul)
        built.append(box(f"U_Velcro{side}", (sgn * 0.335, 0.030, 1.482), (0.048, 0.034, 0.004), M["velcro"], col,
                         weights={B + side + "Arm": 1.0}, bevel=0.0015))
    flag = box("U_Ecusson", (0.335, 0.026, 1.4875), (0.032, 0.020, 0.0015), M["ecusson"], col, weights={B + "LeftArm": 1.0}, bevel=0.0)
    # UV de l'écusson : l'image remplit toute la face supérieure
    fme = flag.data; uv = fme.uv_layers.active or fme.uv_layers.new(name="UVMap")
    xs = [v.co.x for v in fme.vertices]; zs = [v.co.z for v in fme.vertices]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    for p in fme.polygons:
        for li in p.loop_indices:
            c = fme.vertices[fme.loops[li].vertex_index].co
            uv.data[li].uv = ((c.x - x0) / (x1 - x0), (c.z - z0) / (z1 - z0))
    built.append(flag)

    # ceinture et poches de ceinture
    built.append(ring("U_Ceinture", (0, -0.027), 0.188, 0.148, 1.035, 1.095, 0.012, M["ceinture"], col, weights={B + "Hips": 1.0}))
    built.append(box("U_Boucle", (0, -0.027 - 0.150, 1.065), (0.030, 0.006, 0.026), M["boucle_c"], col, weights={B + "Hips": 1.0}, bevel=0.003))
    for sgn, side in ((1, "L"), (-1, "R")):
        built.append(box(f"U_PocheCeinture{side}", (sgn * 0.215, -0.03, 0.965), (0.032, 0.056, 0.078), M["ceinture"], col,
                         weights={B + "Hips": 1.0}, bevel=0.012))
        built.append(box(f"U_RabatCeinture{side}", (sgn * 0.215 + sgn * 0.002, -0.03, 1.016), (0.034, 0.058, 0.022), M["ceinture"], col,
                         weights={B + "Hips": 1.0}, bevel=0.008))

    # gilet pare-balles : coque qui épouse le torse, plaques en relief, poches posées sur la surface
    vest = vest_shell("U_Gilet", col, M["gilet"]); built.append(vest)
    bvh = world_bvh(vest)
    built += shoulder_straps(col, M["gilet"])
    built += webbing_bands(bvh, M, col)
    built += strap_hardware(M, col, world_bvh(bpy.data.objects["Hoodie"]))
    for i, x in enumerate((-0.112, -0.038, 0.038, 0.112)):          # 4 poches de chargeur sur le devant
        built += mag_pouch(f"Av{i}", bvh, x, 1.205, M, col, True, wide=0.033, tall=0.058)
    for sgn, side in ((1, "L"), (-1, "R")):                          # grandes poches latérales arrière
        built += mag_pouch(f"Dos{side}", bvh, sgn * 0.126, 1.212, M, col, False, wide=0.050, tall=0.064)
    built[:] = [x for x in built if x is not None]

    # tête : casque, lunettes, cagoule et cache-cou
    HEAD = {B + "Head": 1.0}
    cx_, cy_, cz_ = 0.0, -0.037, 1.675
    def keep_helmet(x, y, z):
        rim = 1.612 + 0.088 * _smooth(0, 0.0, -0.075, y)      # bord bas : haut du front devant, au-dessus des oreilles derrière
        return z >= rim
    built.append(ellipsoid_shell("U_Casque", (cx_, cy_, cz_), (0.116, 0.142, 0.122), keep_helmet, 0.010, M["casque"], col, HEAD))
    built.append(box("U_CasquePlaque", (0, -0.134, 1.768), (0.040, 0.026, 0.007), M["casque"], col, weights=HEAD, bevel=0.003, rot=(math.radians(40), 0, 0)))
    built.append(box("U_CasqueVelcro", (0, 0.078, 1.757), (0.048, 0.036, 0.004), M["velcro"], col, weights=HEAD, bevel=0.002, rot=(math.radians(-50), 0, 0)))
    for sgn, side in ((1, "L"), (-1, "R")):
        built.append(box(f"U_CasqueRail{side}", (sgn * 0.121, -0.035, 1.690), (0.006, 0.075, 0.014), M["casque"], col, weights=HEAD, bevel=0.003))
        built.append(box(f"U_Verre{side}", (sgn * 0.034, -0.148, 1.665), (0.030, 0.007, 0.020), M["verre"], col, weights=HEAD, bevel=0.005))
        built.append(box(f"U_Branche{side}", (sgn * 0.090, -0.075, 1.668), (0.003, 0.070, 0.004), M["verre"], col, weights=HEAD, bevel=0.0015))
    built.append(box("U_LunettesPont", (0, -0.148, 1.672), (0.008, 0.005, 0.004), M["verre"], col, weights=HEAD, bevel=0.001))
    def keep_mask(x, y, z):
        return z < 1.648 and y < -0.034
    built.append(ellipsoid_shell("U_Cagoule", (0, -0.040, 1.612), (0.096, 0.112, 0.074), keep_mask, 0.006, M["sable"], col, HEAD))
    built.append(ring("U_CacheCou", (0, -0.030), 0.092, 0.100, 1.435, 1.535, 0.008, M["sable"], col,
                      weights_fn=lambda z: {B + "Neck": 1 - _smooth(0, 1.46, 1.55, z), B + "Head": _smooth(0, 1.46, 1.55, z)},
                      rx2=0.082, ry2=0.090))

    # gants
    built.append(gloves("U_Gants", col, M["noir"]))

    print("tenue militaire :", len(built), "objets dans", COLL)
    return built
