"""Véhicule « technical » : pick-up Land Cruiser 79 simple cabine camouflé, avec canon antiaérien jumelé ZU-23-2 sur la plateau
(d'après l'image de référence). Semi-réaliste, sali. Modélisé de zéro, à l'échelle réelle (1 unité = 1 m, longueur ~5,3 m).

Repère du véhicule : l'avant est vers -Y (comme le personnage), la gauche (conducteur) vers +X, le sol est z = 0.
Hiérarchie : racine 'Technique' > carrosserie, 4 roues + roue de secours (chaque roue est un nœud qui tourne autour de X : 'V_Roue...'),
tourelle 'V_Tourelle' (tourne autour de Z) > 'V_Canons' (s'élève autour de X) > canons.
Toutes les pièces sont dans la collection 'Vehicule_Technique' ; la racine est posée à (0, -300, 0), hors du terrain, pour ne rien gêner.
Ce script n'efface QUE sa collection.

Usage dans Blender :  import s34_vehicle as V; V.run()"""
import math, os
import bpy, bmesh
from mathutils import Vector, Matrix, Euler, noise

PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
TEX = os.path.join(PROJ, "assets", "textures", "vehicules")
COLL = "Vehicule_Technique"
STAGE = (0.0, -300.0, 0.0)

# cotes (m)
AX_F, AX_R = -1.59, 1.59            # axes des essieux (y)
R_TIRE, Z_AXLE, TRACK = 0.40, 0.40, 0.80
CAMO_TILE = 3.4                     # un motif de camouflage couvre 3,4 m

_col = None; _root = None; _objs = []


# ---------------------------------------------------------------- matériaux
def _mat(name, color=(0.5, 0.5, 0.5), rough=0.8, metal=0.0, image=None, vcol=False, spec=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if spec is not None and "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = spec
    src = None
    if image:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(os.path.join(TEX, image), check_existing=True)
        t.image.colorspace_settings.name = "sRGB"
        src = t.outputs["Color"]
    if vcol:                                                       # saleté peinte dans les couleurs de sommets : multipliée à la texture
        vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        if src is None:
            mix.inputs[6].default_value = (*color, 1.0)
        else:
            nt.links.new(src, mix.inputs[6])
        nt.links.new(vc.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    elif src is not None:
        nt.links.new(src, b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = (*color, 1.0)
    return m


def materials():
    return {
        "camo": _mat("V_Camo", image="camo_vehicule.png", rough=0.62, vcol=True, spec=0.65),
        "chrome": _mat("V_Chrome", (0.55, 0.55, 0.54), 0.22, 1.0),
        "laiton": _mat("V_Laiton", (0.62, 0.42, 0.12), 0.32, 1.0),
        "noir": _mat("V_Noir", (0.025, 0.025, 0.027), 0.7),
        "acier": _mat("V_Acier", (0.075, 0.07, 0.065), 0.55, 0.7, vcol=True),
        "chassis": _mat("V_Chassis", (0.06, 0.05, 0.04), 0.9, vcol=True),
        "vitre": _mat("V_Vitre", (0.018, 0.026, 0.032), 0.05, 0.0, spec=1.0),
        "phare": _mat("V_Phare", (0.55, 0.6, 0.62), 0.08, 0.0, spec=1.0),
        "orange": _mat("V_Clignotant", (0.8, 0.35, 0.03), 0.3),
        "rouge": _mat("V_FeuArriere", (0.55, 0.03, 0.03), 0.3),
        "olive": _mat("V_Olive", image="peinture_olive.png", rough=0.7, vcol=True),
        "canon": _mat("V_Canon", (0.05, 0.055, 0.05), 0.5, 0.8),
        "toile": _mat("V_Toile", (0.48, 0.40, 0.26), 0.95),
        "pneu": _mat("V_Pneu", (0.13, 0.11, 0.09), 0.95, vcol=True),
        "jante": _mat("V_Jante", (0.20, 0.19, 0.17), 0.55, 0.6, vcol=True),
        "plaque": _mat("V_Plaque", (0.7, 0.68, 0.6), 0.6),
    }


# ---------------------------------------------------------------- outils de construction
def setup():
    global _col, _root, _objs
    _post.clear()
    _col = bpy.data.collections.get(COLL) or bpy.data.collections.new(COLL)
    if _col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(_col)
    for o in list(_col.objects):
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)
    _root = bpy.data.objects.new("Technique", None)
    _root.empty_display_type = 'ARROWS'
    _col.objects.link(_root)
    _objs = []


def empty(name, loc, parent=None, rot=(0, 0, 0)):
    """Nœud vide placé à la position MONDE loc (le parent peut être décalé : la position locale est recalculée)."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.15
    _col.objects.link(e)
    e.parent = parent or _root
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.LocRotScale(Vector(loc), Euler(rot), None)
    bpy.context.view_layer.update()
    return e


def reparent(o, parent):
    """Change de parent en gardant la position monde actuelle."""
    bpy.context.view_layer.update()
    w = o.matrix_world.copy()
    o.parent = parent
    o.matrix_parent_inverse = parent.matrix_world.inverted()
    o.matrix_world = w


def _obj(name, bm, mat, parent=None, bevel=None, smooth=True, segs=3):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if mat is not None:
        me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    _col.objects.link(o)
    o.parent = parent or _root
    if bevel:
        b = o.modifiers.new("Bevel", 'BEVEL'); b.width = bevel; b.segments = segs; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(32)
    _objs.append(o)
    return o


def box(name, c, h, mat, bevel=0.0, rot=None, parent=None, segs=3):
    """Boîte : centre c, demi-dimensions h, rotation optionnelle (Euler en radians) autour de son centre."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for v in bm.verts:
        v.co.x *= h[0]; v.co.y *= h[1]; v.co.z *= h[2]
    if rot is not None:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler(rot).to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=c, verts=bm.verts)
    return _obj(name, bm, mat, parent, bevel, segs=segs)


def slab(name, pts, x0, x1, mat, bevel=0.0, parent=None, segs=3):
    """Profil (y, z) extrudé entre x0 et x1 (panneaux latéraux, cabine, capot)."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in pts]
    b = [bm.verts.new((x1, y, z)) for y, z in pts]
    n = len(pts)
    bm.faces.new(a[::-1]); bm.faces.new(b)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    return _obj(name, bm, mat, parent, bevel, segs=segs)


def tube(name, p0, p1, r, mat, segs=14, r2=None, caps=True, parent=None, bevel=0.0):
    """Cylindre (ou cône) entre deux points."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0; L = d.length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r, radius2=(r if r2 is None else r2), depth=L)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=q.to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(p0 + p1) / 2, verts=bm.verts)
    return _obj(name, bm, mat, parent, bevel)


def ball(name, c, r, mat, scale=(1, 1, 1), parent=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=r)
    for v in bm.verts:
        v.co.x *= scale[0]; v.co.y *= scale[1]; v.co.z *= scale[2]
    bmesh.ops.translate(bm, vec=c, verts=bm.verts)
    return _obj(name, bm, mat, parent)


def plate(name, a, b, width, thick, mat, off=0.0, bevel=0.0, parent=None):
    """Plaque fine qui suit le segment a -> b dans le plan (y, z), large de `width` en x, décalée de `off` vers l'extérieur
    (normale tournée vers l'avant/le haut) : vitres posées sur un panneau incliné."""
    a, b = Vector((0, a[0], a[1])), Vector((0, b[0], b[1]))          # points donnés en (y, z)
    d = b - a; L = d.length; z = d.normalized()
    n = Vector((0, -z.z, z.y))                                        # normale dans le plan (y, z)
    if n.dot(Vector((0, -1, 1))) < 0:
        n = -n                                                        # tournée vers l'avant / le haut
    x = Vector((1, 0, 0)); y = z.cross(x)                             # repère direct : x, y, z
    M = Matrix(((x.x, y.x, z.x), (x.y, y.y, z.y), (x.z, y.z, z.z)))
    return box(name, tuple((a + b) / 2 + n * off), (width, thick, L / 2), mat, bevel, rot=M.to_euler(), parent=parent)


def arch_points(yc, r, z_cut, y0, y1, steps=14):
    """Points (y, z) d'une arche de passage de roue (cercle de rayon r centré en (yc, Z_AXLE)), du côté y0 vers y1, au-dessus de z_cut."""
    s = math.asin(max(-1, min(1, (z_cut - Z_AXLE) / r)))
    pts = []
    for i in range(steps + 1):
        t = s + (math.pi - 2 * s) * i / steps
        pts.append((yc + r * math.cos(t), Z_AXLE + r * math.sin(t)))
    return pts if y0 > y1 else pts[::-1]


# ---------------------------------------------------------------- saleté (couleurs de sommets) et UV
_ao_tree = None
_AO_DIRS = []
for _i in range(12):                                                  # 12 directions réparties sur l'hémisphère (spirale), plus denses près de la normale
    _t = (_i + 0.5) / 12; _r = math.sqrt(_t); _a = _i * 2.399963
    _AO_DIRS.append((_r * math.cos(_a), _r * math.sin(_a), math.sqrt(1 - _t)))


def build_ao_tree():
    """Arbre de recherche de toute la géométrie du véhicule (pour l'occlusion ambiante peinte dans les couleurs de sommets)."""
    global _ao_tree
    from mathutils.bvhtree import BVHTree
    verts, tris = [], []
    for o in _col.objects:
        if o.type != 'MESH':
            continue
        me = o.data; me.calc_loop_triangles()
        base = len(verts); M = o.matrix_world
        verts += [M @ v.co for v in me.vertices]
        tris += [tuple(base + i for i in t.vertices) for t in me.loop_triangles]
    _ao_tree = BVHTree.FromPolygons(verts, tris)


def ao_factor(p, n, dist=0.7, strength=0.62):
    """Ombre de contact : 1 = dégagé, plus sombre dans les creux (passages de roue, dessous, jonctions de panneaux)."""
    t = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))).normalized(); b = n.cross(t)
    hits = 0.0
    for dx, dy, dz in _AO_DIRS:
        d = (t * dx + b * dy + n * dz).normalized()
        loc, nn, idx, dd = _ao_tree.ray_cast(p + n * 0.012, d, dist)
        if loc is not None:
            hits += 1.0 - dd / dist
    return 1.0 - strength * hits / len(_AO_DIRS)


def _paint_dirt_now(o, fn):
    """Couleur de sommet = fn(point) * occlusion ambiante -> multipliée à la texture : poussière, boue, ombres de contact."""
    me = o.data
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", 'FLOAT_COLOR', 'CORNER')
    M = o.matrix_world; N = M.to_3x3()
    ao = {}
    if _ao_tree is not None:
        for v in me.vertices:
            n = (N @ v.normal).normalized()
            ao[v.index] = ao_factor(M @ v.co, n)
    for p in me.polygons:
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            r, g, b = fn(me.vertices[vi].co)
            k = ao.get(vi, 1.0)
            attr.data[li].color = (r * k, g * k, b * k, 1.0)


def body_dirt(c):
    """Boue brune sur le bas de caisse et les ailes (éclaboussures qui montent par endroits), poussière claire sur tout le reste."""
    n = noise.noise(Vector((c.x * 3.1, c.y * 2.3, c.z * 3.7)))
    n2 = noise.noise(Vector((c.x * 9.0, c.y * 7.0, c.z * 8.0)))
    reach = 1.12 + 0.38 * n + 0.14 * n2                                     # hauteur jusqu'où monte la boue (variable)
    low = max(0.0, min(1.0, (reach - c.z) / 0.60))
    mud = low ** 0.7 * (0.9 + 0.3 * n2)
    dust = 0.26 + 0.14 * noise.noise(Vector((c.x * 1.2, c.y * 1.1, c.z * 1.0)))
    k = max(0.0, min(0.96, mud + dust * (1 - mud)))
    return (1 - k * (1 - 0.30), 1 - k * (1 - 0.22), 1 - k * (1 - 0.14))


def wheel_dirt(c):
    n = noise.noise(Vector((c.x * 6, c.y * 6, c.z * 6)))
    k = 0.45 + 0.4 * n
    return (1 - k * 0.45, 1 - k * 0.56, 1 - k * 0.7)


def _uv_now(o, tile):
    """UV à l'échelle réelle par projection selon l'axe dominant de chaque face : le camouflage se prolonge d'un panneau à l'autre."""
    me = o.data
    for l in list(me.uv_layers):
        me.uv_layers.remove(l)
    uv = me.uv_layers.new(name="UVMap")
    k = 1.0 / tile
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            u, v = ((c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y))
            uv.data[li].uv = (u * k, v * k)


_post = []                                                           # travaux différés : exécutés APRÈS l'application des biseaux (qui effacent UV et couleurs)


def paint_dirt(o, fn):
    _post.append(('dirt', o, fn))


def uv_world(o, tile=CAMO_TILE):
    if tile == CAMO_TILE:
        _post.append(('dense', o, None))                              # carrosserie : maillage assez fin pour porter des éclaboussures de boue
    _post.append(('uv', o, tile))


def uv_box(o, tile=0.6):
    _post.append(('uv', o, tile))


def dense(o, maxlen=0.10):
    """Subdivise jusqu'à des arêtes de moins de maxlen (m) : les couleurs de sommets prennent alors le détail de la boue."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    for _ in range(5):
        edges = [e for e in bm.edges if e.calc_length() > maxlen]
        if not edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
    bm.to_mesh(o.data); bm.free()
    for p in o.data.polygons:
        p.use_smooth = True


def crown(o, fn):
    """Bombe une surface (capot, toit) : fn(Vector) -> Vector appliquée à chaque sommet, après la subdivision."""
    _post.append(('crown', o, fn))


def finalize():
    for kind, o, arg in [x for x in _post if x[0] == 'dense']:
        dense(o)
    for kind, o, fn in [x for x in _post if x[0] == 'crown']:
        for v in o.data.vertices:
            v.co = fn(v.co.copy())
        o.data.update()
    bpy.context.view_layer.update()
    build_ao_tree()                                                  # ombres de contact : la géométrie est maintenant définitive
    for kind, o, arg in _post:
        if kind == 'uv':
            _uv_now(o, arg)
        elif kind == 'dirt':
            _paint_dirt_now(o, arg)
    _post.clear()


def bake(o):
    """Applique les modificateurs (biseaux)."""
    if not o.modifiers:
        return
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data
    o.modifiers.clear(); o.data = new
    bpy.data.meshes.remove(old)
    for p in new.polygons:
        p.use_smooth = True


# ---------------------------------------------------------------- carrosserie
def chassis(M):
    out = []
    for s in (1, -1):
        out.append(box(f"V_Longeron{'G' if s > 0 else 'D'}", (s * 0.45, 0.25, 0.54), (0.045, 2.45, 0.07), M["chassis"]))
    for y in (-1.0, 0.2, 1.2, 2.2):
        out.append(box(f"V_Traverse{y:+.1f}", (0, y, 0.54), (0.45, 0.04, 0.05), M["chassis"]))
    for nm, y in (("Av", AX_F), ("Ar", AX_R)):
        out.append(box(f"V_Essieu{nm}", (0, y, Z_AXLE), (0.82, 0.05, 0.06), M["chassis"]))
        out.append(ball(f"V_Pont{nm}", (0, y + (0.04 if nm == "Av" else -0.04), Z_AXLE), 0.15, M["chassis"], (1.0, 0.8, 0.9)))
    for s in (1, -1):
        for nm, y in (("Av", AX_F), ("Ar", AX_R)):
            out.append(tube(f"V_Amortisseur{nm}{'G' if s > 0 else 'D'}", (s * 0.58, y + 0.1, 0.34), (s * 0.58, y + 0.1, 0.72), 0.022, M["acier"], 8))
            out.append(box(f"V_Ressort{nm}{'G' if s > 0 else 'D'}", (s * 0.62, y, 0.50), (0.04, 0.50 if nm == "Ar" else 0.36, 0.03), M["chassis"]))
    out.append(box("V_Reservoir", (-0.05, 1.75, 0.47), (0.45, 0.50, 0.10), M["acier"], bevel=0.03))
    out.append(tube("V_Echappement", (-0.30, -0.6, 0.50), (-0.30, 2.95, 0.50), 0.04, M["acier"], 10))
    out.append(box("V_Plancher", (0, 0.1, 0.68), (0.87, 2.55, 0.03), M["chassis"]))
    for y in (AX_F + 0.54, AX_R + 0.54):                              # bavettes derrière les roues
        for s in (1, -1):
            out.append(box(f"V_Bavette{y:+.1f}{s}", (s * 0.80, y, 0.50), (0.17, 0.012, 0.12), M["noir"], 0.006))
    for o in out:
        paint_dirt(o, wheel_dirt)
    return out


def front_end(M):
    out = []
    # capot, ailes, face avant
    hood = slab("V_Capot", [(-2.40, 0.98), (-2.43, 1.12), (-2.35, 1.27), (-1.0, 1.31), (-0.76, 1.27), (-0.76, 0.98)], -0.66, 0.66, M["camo"], 0.06, segs=4)
    out.append(hood)
    crown(hood, lambda c: Vector((c.x, c.y, c.z + (0.04 * (1 - (c.x / 0.66) ** 2) if c.z > 1.15 else 0.0))))     # capot bombé
    for s in (1, -1):                                                                                       # charnières et loquets du capot
        out.append(box(f"V_CharniereCapot{s}", (s * 0.40, -0.80, 1.30), (0.05, 0.03, 0.012), M["noir"], 0.006))
        out.append(box(f"V_LoquetCapot{s}", (s * 0.30, -2.40, 1.19), (0.035, 0.012, 0.02), M["noir"], 0.006))
    for s, nm in ((1, "G"), (-1, "D")):
        pts = [(-2.42, 0.62), (-2.45, 1.00), (-2.38, 1.20), (-0.75, 1.20), (-0.70, 0.62)]
        arch = arch_points(AX_F, 0.50, 0.62, -0.70, -2.42)                      # de l'arrière vers l'avant
        pts = pts[:5] + arch
        x0, x1 = (0.66, 0.97) if s > 0 else (-0.97, -0.66)
        out.append(slab(f"V_Aile{nm}", pts, x0, x1, M["camo"], 0.05, segs=4))
        inner = arch_points(AX_F, 0.50, 0.62, -0.70, -2.42)
        outer = arch_points(AX_F, 0.57, 0.62, -0.70, -2.42)
        out.append(slab(f"V_PassageAv{nm}", inner + outer[::-1], (0.965 if s > 0 else -1.02), (1.02 if s > 0 else -0.965), M["noir"], 0.006))
    out.append(box("V_Calandre", (0, -2.43, 0.90), (0.62, 0.03, 0.10), M["noir"], 0.012))
    for i in range(4):
        out.append(box(f"V_Lame{i}", (0, -2.465, 0.82 + 0.052 * i), (0.58, 0.012, 0.012), M["acier"]))
    out.append(box("V_Logo", (0, -2.47, 0.90), (0.05, 0.01, 0.02), M["acier"]))
    for s, nm in ((1, "G"), (-1, "D")):
        out.append(tube(f"V_PharesBoitier{nm}", (s * 0.78, -2.37, 0.98), (s * 0.78, -2.47, 0.98), 0.105, M["noir"], 18))
        out.append(tube(f"V_PharesVerre{nm}", (s * 0.78, -2.465, 0.98), (s * 0.78, -2.485, 0.98), 0.085, M["phare"], 18))
        out.append(tube(f"V_PharesBague{nm}", (s * 0.78, -2.455, 0.98), (s * 0.78, -2.478, 0.98), 0.112, M["chrome"], 22))        # anneau chromé autour du phare
        out.append(tube(f"V_PharesCentre{nm}", (s * 0.78, -2.484, 0.98), (s * 0.78, -2.492, 0.98), 0.03, M["chrome"], 12))
        out.append(box(f"V_Clignotant{nm}", (s * 0.90, -2.43, 0.90), (0.045, 0.02, 0.04), M["orange"], 0.01))
        out.append(tube(f"V_AntibrouillardBoitier{nm}", (s * 0.42, -2.60, 0.70), (s * 0.42, -2.645, 0.70), 0.058, M["noir"], 14))
        out.append(tube(f"V_AntibrouillardVerre{nm}", (s * 0.42, -2.642, 0.70), (s * 0.42, -2.655, 0.70), 0.044, M["phare"], 14))
    # pare-chocs, plaque, crochets
    out.append(box("V_PareChocAv", (0, -2.55, 0.68), (0.93, 0.09, 0.085), M["noir"], 0.03))
    out.append(box("V_SabotAv", (0, -2.42, 0.53), (0.70, 0.05, 0.04), M["acier"]))
    for s in (1, -1):
        out.append(box(f"V_CrochetAv{s}", (s * 0.55, -2.655, 0.66), (0.025, 0.035, 0.03), M["acier"]))
    out.append(box("V_PlaqueAv", (0, -2.652, 0.70), (0.26, 0.005, 0.065), M["plaque"]))
    for o in out:
        if o.name.startswith(("V_Capot", "V_Aile")):
            uv_world(o); paint_dirt(o, body_dirt)
        elif o.name.startswith(("V_PareChoc", "V_Sabot", "V_Crochet")):
            paint_dirt(o, wheel_dirt)
    return out


def cabin(M):
    out = []
    cab = slab("V_Cabine", [(-0.75, 0.62), (-0.75, 1.22), (-0.58, 1.92), (-0.40, 1.965), (0.55, 1.965), (0.62, 1.88), (0.62, 0.62)], -0.87, 0.87, M["camo"], 0.07, segs=4)
    out.append(cab)
    crown(cab, lambda c: Vector((c.x, c.y, c.z + (0.035 * (1 - (c.x / 0.87) ** 2) if c.z > 1.9 else 0.0))))   # toit bombé
    out.append(plate("V_PareBriseCadre", (-0.748, 1.255), (-0.572, 1.915), 0.752, 0.005, M["noir"], 0.002))
    out.append(plate("V_PareBrise", (-0.735, 1.27), (-0.585, 1.89), 0.70, 0.006, M["vitre"], 0.006))
    for s in (1, -1):                                                         # gouttières du toit et marchepieds
        out.append(box(f"V_Gouttiere{s}", (s * 0.855, 0.10, 1.935), (0.014, 0.66, 0.014), M["noir"], 0.006))
    for s, nm in ((1, "G"), (-1, "D")):
        out.append(box(f"V_Marchepied{nm}", (s * 0.965, -0.10, 0.585), (0.085, 0.56, 0.018), M["noir"], 0.01))
        for y in (-0.55, 0.30):
            out.append(box(f"V_MarchepiedAppui{nm}{y:+.2f}", (s * 0.93, y, 0.62), (0.04, 0.03, 0.03), M["noir"], 0.006))
    for s, nm in ((1, "G"), (-1, "D")):
        x0, x1 = ((0.866, 0.876) if s > 0 else (-0.876, -0.866))
        xf0, xf1 = ((0.862, 0.869) if s > 0 else (-0.869, -0.862))
        out.append(slab(f"V_CadreVitre{nm}", [(-0.48, 1.28), (0.435, 1.28), (0.48, 1.88), (-0.44, 1.90)], xf0, xf1, M["noir"], 0.004))          # cadre noir autour de la vitre
        out.append(slab(f"V_VitreCote{nm}", [(-0.44, 1.31), (0.40, 1.31), (0.44, 1.85), (-0.40, 1.87)], x0, x1, M["vitre"], 0.004))
        for y in (-0.58, 0.40):
            out.append(box(f"V_JointPorte{nm}{y:+.2f}", (s * 0.872, y, 1.20), (0.003, 0.003, 0.62), M["noir"]))
        out.append(box(f"V_Poignee{nm}", (s * 0.884, 0.24, 1.17), (0.012, 0.065, 0.014), M["chrome"], 0.004))
        out.append(box(f"V_Retro{nm}Bras", (s * 0.92, -0.60, 1.55), (0.05, 0.012, 0.012), M["noir"]))
        out.append(box(f"V_Retro{nm}", (s * 1.01, -0.62, 1.57), (0.028, 0.05, 0.095), M["noir"], 0.014))
        out.append(box(f"V_RetroVerre{nm}", (s * 1.01, -0.665, 1.57), (0.022, 0.004, 0.082), M["vitre"], 0.004))
        out.append(box(f"V_Gard{nm}", (s * 0.93, 0.0, 0.64), (0.012, 0.9, 0.012), M["noir"]))
    out.append(box("V_LunetteCadre", (0, 0.622, 1.62), (0.585, 0.004, 0.26), M["noir"], 0.004))
    out.append(box("V_LunetteArriere", (0, 0.628, 1.62), (0.55, 0.006, 0.23), M["vitre"], 0.004))
    # poche de porte en toile (côté gauche) comme sur l'image, essuie-glaces, feux de toit
    out.append(box("V_PocheToile", (0.888, -0.10, 1.04), (0.016, 0.21, 0.17), M["toile"], 0.012))
    out.append(box("V_PocheRabat", (0.9, -0.10, 1.16), (0.014, 0.215, 0.055), M["toile"], 0.01))
    for i, x in enumerate((-0.30, 0.18)):
        a = (x, -0.745, 1.30); b = (x + 0.30, -0.65, 1.62)
        out.append(tube(f"V_EssuieGlace{i}", (x, -0.752, 1.29), (x + 0.28, -0.69, 1.58), 0.006, M["noir"], 6))
    for s, nm in ((1, "G"), (-1, "D")):
        out.append(tube(f"V_FeuToit{nm}", (s * 0.74, -0.30, 1.96), (s * 0.74, -0.30, 2.05), 0.045, M["noir"], 12))
    # tuyau d'admission (snorkel) côté droit : monte le long du montant avant
    out.append(tube("V_Snorkel", (-0.93, -0.70, 1.00), (-0.93, -0.62, 2.00), 0.048, M["noir"], 12))
    out.append(box("V_SnorkelTete", (-0.93, -0.70, 2.05), (0.065, 0.075, 0.05), M["noir"], 0.02))
    out.append(box("V_SnorkelBase", (-0.92, -0.74, 1.04), (0.07, 0.08, 0.05), M["noir"], 0.02))
    for o in out:
        if o.name == "V_Cabine":
            uv_world(o); paint_dirt(o, body_dirt)
        elif o.name.startswith(("V_Vitre", "V_PareBrise", "V_Lunette")):
            paint_dirt(o, lambda c: (0.8, 0.77, 0.7))
    return out


def bed(M):
    out = []
    for s, nm in ((1, "G"), (-1, "D")):
        arch = arch_points(AX_R, 0.50, 0.62, 2.04, 1.14)
        pts = [(0.66, 0.62), (0.66, 1.30), (2.72, 1.30), (2.72, 0.62)] + arch
        x0, x1 = (0.84, 0.92) if s > 0 else (-0.92, -0.84)
        out.append(slab(f"V_BordPlateau{nm}", pts, x0, x1, M["camo"], 0.035, segs=4))
        out.append(box(f"V_BordureHaute{nm}", (s * 0.88, 1.69, 1.312), (0.055, 1.03, 0.014), M["noir"], 0.008))      # bande de caoutchouc sur le haut du bord
        for y in (0.95, 1.25, 2.1, 2.45):                                                                          # anneaux d'arrimage
            out.append(tube(f"V_Arrimage{nm}{y}", (s * 0.925, y, 1.16), (s * 0.945, y, 1.16), 0.028, M["acier"], 10))
        inner = arch_points(AX_R, 0.50, 0.62, 2.04, 1.14)
        outer = arch_points(AX_R, 0.57, 0.62, 2.04, 1.14)
        out.append(slab(f"V_PassageAr{nm}", inner + outer[::-1], (0.915 if s > 0 else -0.97), (0.97 if s > 0 else -0.915), M["noir"], 0.006))
    out.append(box("V_SolPlateau", (0, 1.69, 0.90), (0.84, 1.03, 0.022), M["olive"], 0.01))
    for i in range(7):
        out.append(box(f"V_Nervure{i}", (0, 0.80 + i * 0.29, 0.926), (0.82, 0.018, 0.012), M["chassis"]))
    out.append(box("V_Hayon", (0, 2.725, 1.00), (0.85, 0.035, 0.31), M["camo"], 0.03))
    for s in (1, -1):
        out.append(box(f"V_CharniereHayon{s}", (s * 0.80, 2.70, 0.72), (0.05, 0.025, 0.025), M["noir"], 0.006))
        out.append(tube(f"V_ChaineHayon{s}", (s * 0.84, 2.70, 1.15), (s * 0.84, 2.60, 1.20), 0.007, M["acier"], 6))
        out.append(box(f"V_Loquet{s}", (s * 0.60, 2.765, 1.20), (0.05, 0.012, 0.025), M["noir"], 0.006))
        out.append(box(f"V_FeuAr{s}", (s * 0.77, 2.752, 0.90), (0.06, 0.02, 0.11), M["rouge"], 0.012))
        out.append(box(f"V_FeuArCadre{s}", (s * 0.77, 2.746, 0.90), (0.07, 0.012, 0.12), M["noir"], 0.012))
    out.append(box("V_PareChocAr", (0, 2.84, 0.69), (0.93, 0.09, 0.085), M["noir"], 0.03))
    out.append(box("V_MarcheAr", (0, 2.90, 0.76), (0.45, 0.05, 0.02), M["acier"]))
    out.append(box("V_PlaqueAr", (0, 2.768, 1.00), (0.25, 0.005, 0.065), M["plaque"]))
    out.append(tube("V_Attelage", (0, 2.93, 0.58), (0, 3.02, 0.58), 0.028, M["acier"], 10))
    # rails tubulaires autour de la plateau (peinture olive), comme sur l'image
    zt, zm = 1.74, 1.52
    posts = [(s * 0.87, y) for s in (1, -1) for y in (0.80, 1.69, 2.62)] + [(s * 0.40, 2.62) for s in (1, -1)]
    for i, (x, y) in enumerate(posts):
        out.append(tube(f"V_Montant{i}", (x, y, 1.30), (x, y, zt), 0.019, M["olive"], 8))
    for s, nm in ((1, "G"), (-1, "D")):
        for z, k in ((zt, "H"), (zm, "M")):
            out.append(tube(f"V_Rail{nm}{k}", (s * 0.87, 0.80, z), (s * 0.87, 2.62, z), 0.017, M["olive"], 8))
    for z, k in ((zt, "H"), (zm, "M")):
        out.append(tube(f"V_RailArr{k}", (-0.87, 2.62, z), (0.87, 2.62, z), 0.017, M["olive"], 8))
    for i, (x, y) in enumerate(posts):
        out.append(ball(f"V_Noeud{i}", (x, y, zt), 0.024, M["olive"]))
    # caisses de munitions
    boxes = [(-0.60, 2.38, 1.06), (0.60, 2.38, 1.06), (-0.60, 1.18, 1.06), (0.60, 1.18, 1.06), (-0.60, 2.38, 1.31)]
    for i, (x, y, z) in enumerate(boxes):
        out.append(box(f"V_Caisse{i}", (x, y, z), (0.20, 0.30, 0.135), M["olive"], 0.012))
        out.append(box(f"V_CaisseSangle{i}", (x, y, z + 0.137), (0.17, 0.02, 0.004), M["noir"]))
        out.append(box(f"V_CaisseLoquet{i}", (x - 0.2 * (1 if x > 0 else -1) * 0 , y, z + 0.0), (0.004, 0.04, 0.01), M["acier"]))
    for o in out:
        if o.name.startswith(("V_BordPlateau", "V_Hayon")):
            uv_world(o); paint_dirt(o, body_dirt)
        elif o.name.startswith(("V_Montant", "V_Rail", "V_Noeud", "V_Caisse", "V_Sol")):
            uv_box(o, 0.9); paint_dirt(o, lambda c: (0.92, 0.88, 0.8))
        elif o.name.startswith(("V_PareChocAr", "V_Marche", "V_Attelage")):
            paint_dirt(o, wheel_dirt)
    return out


# ---------------------------------------------------------------- roues
def wheel(name, loc, M, parent=None, axis='x'):
    """Roue complète (pneu à sculptures, jante tôle, écrous) dans un nœud qui tourne autour de son axe."""
    w = empty(name, loc, parent)
    NU = 40
    prof = [(-0.135, 0.255), (-0.141, 0.31), (-0.126, 0.375), (-0.085, 0.397), (-0.045, 0.40), (0.045, 0.40), (0.085, 0.397), (0.126, 0.375), (0.141, 0.31), (0.135, 0.255), (0.10, 0.232), (-0.10, 0.232)]
    bm = bmesh.new()
    rings = []
    for i in range(NU * 2):
        th = 2 * math.pi * i / (NU * 2)
        ring = []
        for k, (x, r) in enumerate(prof):
            tread = k in (3, 4, 5, 6)
            r2 = r + (0.016 if (tread and (i % 2 == 0)) else 0.0) * (1.0 if k in (4, 5) else 0.6)
            ring.append(bm.verts.new((x, r2 * math.cos(th), r2 * math.sin(th))))
        rings.append(ring)
    m = len(prof)
    for i in range(NU * 2):
        for k in range(m):
            bm.faces.new((rings[i][k], rings[(i + 1) % (NU * 2)][k], rings[(i + 1) % (NU * 2)][(k + 1) % m], rings[i][(k + 1) % m]))
    tire = _obj(name + "_Pneu", bm, M["pneu"], w)
    paint_dirt(tire, wheel_dirt)
    # jante : disque creusé + moyeu + écrous
    rim = tube(name + "_Jante", (-0.07, 0, 0), (0.115, 0, 0), 0.236, M["jante"], 28, parent=w)
    hub = tube(name + "_Moyeu", (0.10, 0, 0), (0.155, 0, 0), 0.075, M["acier"], 16, parent=w)
    paint_dirt(rim, wheel_dirt)
    for j in range(6):
        a = 2 * math.pi * j / 6
        tube(name + f"_Ecrou{j}", (0.11, 0.125 * math.cos(a), 0.125 * math.sin(a)), (0.14, 0.125 * math.cos(a), 0.125 * math.sin(a)), 0.016, M["acier"], 6, parent=w)
    for j in range(5):                                                # grands trous de la jante tôle
        a = 2 * math.pi * j / 5 + 0.3
        tube(name + f"_Trou{j}", (0.112, 0.185 * math.cos(a), 0.185 * math.sin(a)), (0.118, 0.185 * math.cos(a), 0.185 * math.sin(a)), 0.026, M["noir"], 10, parent=w)
    if axis == 'y':                                                   # roue de secours : axe vertical vers l'avant
        w.rotation_euler = (0, 0, math.radians(90))
    return w


def wheels(M):
    out = []
    for nm, y in (("Av", AX_F), ("Ar", AX_R)):
        for s, side in ((1, "G"), (-1, "D")):
            w = wheel(f"V_Roue{nm}{side}", (s * TRACK, y, Z_AXLE), M)
            if s < 0:
                w.rotation_euler = (0, 0, math.radians(180))          # la face de jante regarde vers l'extérieur
            out.append(w)
    return out


# ---------------------------------------------------------------- canon antiaérien ZU-23-2
def gun(M):
    """Affût sur la plateau (y = 1,80) : plateau d'appui, tourelle, berceau, deux canons de 2 m levés à 25°, bouclier incliné, siège."""
    B = Vector((0.0, 1.80, 0.93))
    out = []
    out.append(tube("V_AffutBase", (B.x, B.y, B.z), (B.x, B.y, B.z + 0.06), 0.52, M["olive"], 28))
    for i in range(3):
        a = math.radians(90 + 120 * i)
        d = Vector((math.cos(a), math.sin(a), 0))
        out.append(tube(f"V_AffutPied{i}", B + d * 0.15 + Vector((0, 0, 0.06)), B + d * 0.62 + Vector((0, 0, 0.06)), 0.035, M["olive"], 8))
        out.append(tube(f"V_AffutVerin{i}", B + d * 0.60 + Vector((0, 0, 0.03)), B + d * 0.60 + Vector((0, 0, -0.01)), 0.045, M["acier"], 8))
    out.append(tube("V_AffutColonne", (B.x, B.y, B.z + 0.06), (B.x, B.y, B.z + 0.44), 0.19, M["olive"], 20))
    for o in out:
        uv_box(o, 0.9)
    tur = empty("V_Tourelle", (B.x, B.y, B.z + 0.44), _root)
    # tourelle : plateau tournant, deux flasques du berceau, tourillons
    P = Vector((0.0, B.y, B.z + 0.70))                                # axe d'élévation
    turn = []
    turn.append(tube("V_Plateau", (B.x, B.y, B.z + 0.44), (B.x, B.y, B.z + 0.50), 0.34, M["olive"], 24))
    for s, nm in ((1, "G"), (-1, "D")):
        turn.append(box(f"V_Flasque{nm}", (s * 0.27, B.y, P.z - 0.04), (0.03, 0.34, 0.24), M["olive"], 0.01))
        turn.append(tube(f"V_Tourillon{nm}", (s * 0.22, P.y, P.z), (s * 0.36, P.y, P.z), 0.045, M["acier"], 10))
    turn.append(box("V_Siege", (0, B.y - 0.62, B.z + 0.40), (0.17, 0.15, 0.03), M["noir"], 0.012))
    turn.append(box("V_SiegeDos", (0, B.y - 0.78, B.z + 0.60), (0.17, 0.02, 0.17), M["noir"], 0.012))
    turn.append(tube("V_SiegeBras", (0, B.y - 0.35, B.z + 0.44), (0, B.y - 0.62, B.z + 0.40), 0.03, M["olive"], 8))
    for s, nm in ((1, "G"), (-1, "D")):                                # volants de pointage
        turn.append(tube(f"V_Volant{nm}", (s * 0.30, B.y - 0.18, B.z + 0.62), (s * 0.42, B.y - 0.18, B.z + 0.62), 0.07, M["noir"], 14))
        turn.append(tube(f"V_VolantAxe{nm}", (s * 0.27, B.y - 0.18, B.z + 0.62), (s * 0.30, B.y - 0.18, B.z + 0.62), 0.02, M["acier"], 8))
    # bouclier : trapèze incliné vers l'arrière, au-dessus de la cabine
    sh = bmesh.new()
    pts = [(-0.34, 0.0), (0.34, 0.0), (0.27, 0.78), (-0.27, 0.78)]
    ang = math.radians(24)
    base = Vector((0.0, B.y - 0.80, B.z + 0.72))
    vs = []
    for (x, v) in pts:
        for t in (-0.012, 0.012):
            vs.append(sh.verts.new((base.x + x, base.y + math.sin(ang) * v + t * math.cos(ang), base.z + math.cos(ang) * v - t * math.sin(ang))))
    f = lambda a, b, c, d: sh.faces.new((vs[a], vs[b], vs[c], vs[d]))
    f(0, 2, 4, 6); f(1, 7, 5, 3)
    for i in range(4):
        j = (i + 1) % 4
        sh.faces.new((vs[2 * i], vs[2 * j], vs[2 * j + 1], vs[2 * i + 1]))
    shield = _obj("V_Bouclier", sh, M["olive"], bevel=0.008)
    turn.append(shield)
    for s in (1, -1):
        turn.append(tube(f"V_BouclierAppui{s}", (s * 0.26, B.y - 0.55, B.z + 0.62), (s * 0.22, B.y - 0.80, B.z + 0.74), 0.015, M["olive"], 6))
    # canons (repère local de l'élévation : on les construit à plat, le nœud V_Canons les relève)
    elev = empty("V_Canons", tuple(P), tur)
    gun_parts = []
    for s, nm in ((1, "G"), (-1, "D")):
        x = s * 0.15
        gun_parts.append(tube(f"V_Canon{nm}", (x, P.y + 0.05, P.z), (x, P.y + 2.02, P.z), 0.046, M["canon"], 14))
        gun_parts.append(tube(f"V_Manchon{nm}", (x, P.y + 0.15, P.z), (x, P.y + 1.05, P.z), 0.074, M["canon"], 16))
        gun_parts.append(tube(f"V_Bouche{nm}", (x, P.y + 1.96, P.z), (x, P.y + 2.16, P.z), 0.062, M["canon"], 14, r2=0.050))
        gun_parts.append(box(f"V_Culasse{nm}", (x, P.y - 0.17, P.z), (0.085, 0.25, 0.11), M["olive"], 0.012))
        gun_parts.append(box(f"V_Boite{nm}", (s * 0.42, P.y - 0.22, P.z - 0.06), (0.12, 0.17, 0.14), M["olive"], 0.012))
        gun_parts.append(tube(f"V_Guide{nm}", (s * 0.34, P.y - 0.16, P.z - 0.02), (s * 0.27, P.y - 0.10, P.z + 0.02), 0.03, M["acier"], 8))
        # bande de munitions en laiton, de la caisse vers la culasse (courbe de Bézier)
        p0 = Vector((s * 0.40, P.y - 0.22, P.z + 0.085)); p1 = Vector((s * 0.43, P.y - 0.20, P.z + 0.26)); p2 = Vector((s * 0.17, P.y - 0.14, P.z + 0.10))
        for k in range(15):
            t = k / 14
            c = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2
            d = (2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1)).normalized()
            gun_parts.append(box(f"V_Cartouche{nm}{k}", tuple(c), (0.011, 0.022, 0.011), M["laiton"], 0.003, rot=(0, 0, math.atan2(d.x, -d.y) * 0 + (0.4 if k % 2 else -0.4))))
        gun_parts.append(box(f"V_BandeMaillon{nm}", (s * 0.40, P.y - 0.22, P.z + 0.10), (0.05, 0.03, 0.012), M["acier"], 0.004))
    gun_parts.append(box("V_Bloc", (0, P.y - 0.05, P.z), (0.16, 0.12, 0.09), M["olive"], 0.01))
    gun_parts.append(box("V_ViseurSupport", (-0.30, P.y - 0.10, P.z + 0.17), (0.04, 0.12, 0.06), M["olive"], 0.008))
    gun_parts.append(tube("V_Viseur", (-0.30, P.y - 0.30, P.z + 0.24), (-0.30, P.y + 0.12, P.z + 0.24), 0.04, M["noir"], 12))
    for o in turn:
        reparent(o, tur)                                              # la tourelle tourne autour de Z avec le plateau, le bouclier et le siège
    for o in gun_parts:
        reparent(o, elev)                                             # les canons se lèvent autour de X
    for o in turn + gun_parts:
        if o.data.materials and o.data.materials[0].name == "V_Olive":
            uv_box(o, 0.9); paint_dirt(o, lambda c: (0.9, 0.86, 0.78))
    # canons levés à 25° : on tourne le nœud d'élévation (rotation positive autour de X : l'avant des canons monte)
    elev.rotation_euler = (math.radians(25), 0, 0)
    return out + turn + gun_parts


def spare(M):
    """Roue de secours debout contre l'arrière de la cabine (axe vers l'avant), côté droit, sur la plateau."""
    w = wheel("V_RoueSecours", (-0.45, 0.90, 1.50), M)
    w.rotation_euler = (0, 0, math.radians(90))                       # axe X -> axe Y
    w.scale = (0.97, 0.97, 0.97)
    bpy.context.view_layer.update()
    for k, x in enumerate((-0.45 - 0.2, -0.45 + 0.2)):
        tube(f"V_SecoursSangle{k}", (x, 0.76, 1.30), (x, 0.82, 1.74), 0.012, M["noir"], 6)
    return w


# ---------------------------------------------------------------- assemblage
def run():
    setup()
    M = materials()
    parts = []
    parts += chassis(M)
    parts += front_end(M)
    parts += cabin(M)
    parts += bed(M)
    wheels(M)
    spare(M)
    gun(M)
    bpy.context.view_layer.update()
    for o in list(_col.objects):
        if o.type == 'MESH':
            bake(o)
    finalize()                                                       # UV, subdivision de la carrosserie, saleté
    for o in list(_col.objects):                                     # sécurité : toute pièce a ses couleurs de sommets (sinon noires) et ses UV si texturée
        if o.type != 'MESH' or not o.data.materials or o.data.materials[0] is None:
            continue
        nodes = o.data.materials[0].node_tree.nodes
        if any(n.type == 'VERTEX_COLOR' for n in nodes) and "Col" not in o.data.color_attributes:
            _paint_dirt_now(o, lambda c: (1.0, 1.0, 1.0))
        if any(n.type == 'TEX_IMAGE' for n in nodes) and not o.data.uv_layers:
            _uv_now(o, 0.9)
    _root.location = STAGE
    bpy.context.view_layer.update()
    n = sum(1 for o in _col.objects if o.type == 'MESH')
    tri = sum(len(o.data.polygons) for o in _col.objects if o.type == 'MESH')
    print("véhicule :", n, "pièces,", tri, "polygones")
    return _root
