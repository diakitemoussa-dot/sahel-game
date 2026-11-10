"""Maisonnettes en banco avec intérieur (porte, fenêtres, sol, toit, mobilier).
Remplace 8 maisons pleines du village et ajoute 2 cabanes à l'oasis.
Idempotent : relancer reconstruit la collection 'Cabanes'."""
import math, bpy
import common as C
import materials
import s10_realism as R

HUTS_VILLAGE = [2, 3, 5, 8, 9, 12, 14, 15]
OASIS_SITES = [(30.0, 26.0), (-32.0, 28.0)]  # décalage par rapport au centre de l'oasis
W, D, H, T = 6.5, 5.5, 3.0, 0.4  # largeur (x), profondeur (y), hauteur, épaisseur des murs


def _mats():
    materials.earthy("Sol_Interieur", [(0.0, (0.28, 0.18, 0.10)), (1.0, (0.46, 0.32, 0.19))],
                     big=0.8, fine=6.0, bump=0.3)
    materials.earthy("Couverture", [(0.0, (0.42, 0.08, 0.05)), (1.0, (0.72, 0.24, 0.12))],
                     rough=0.9, big=2.0, fine=18.0, bump=0.2)
    materials.earthy("Tapis", [(0.0, (0.08, 0.22, 0.34)), (0.5, (0.62, 0.20, 0.10)), (1.0, (0.80, 0.60, 0.22))],
                     rough=0.95, big=3.0, fine=14.0, bump=0.15)
    materials.earthy("Terre_Cuite", [(0.0, (0.42, 0.20, 0.10)), (1.0, (0.66, 0.36, 0.20))],
                     rough=0.8, big=1.5, fine=8.0, bump=0.3)


def _bevel(o, w=0.05):
    b = o.modifiers.new("Bevel", 'BEVEL')
    b.width = w
    b.segments = 2
    b.limit_method = 'ANGLE'


def _child(o, parent, bevel=True):
    o.parent = parent
    if bevel:
        _bevel(o)
    return o


def _wall(col, parent, name, axis, fixed, length, openings, mat):
    """Mur le long de `axis` ('x' ou 'y'), percé d'ouvertures (centre, largeur, bas, haut)."""
    pieces = []

    def add(u0, u1, z0, z1):
        if u1 - u0 < 1e-3 or z1 - z0 < 1e-3:
            return
        u, ln, zc, hz = (u0 + u1) / 2, u1 - u0, (z0 + z1) / 2, z1 - z0
        if axis == 'x':
            pieces.append(((ln, T, hz), (u, fixed, zc)))
        else:
            pieces.append(((T, ln, hz), (fixed, u, zc)))

    cur = -length / 2
    for c, wd, bot, top in sorted(openings):
        a, b = c - wd / 2, c + wd / 2
        add(cur, a, 0, H)
        add(a, b, top, H)   # linteau
        add(a, b, 0, bot)   # appui de fenêtre
        cur = b
    add(cur, length / 2, 0, H)
    for i, (size, loc) in enumerate(pieces):
        _child(C.box(f"{name}_{i}", size, loc, col, mat), parent)


def hut(name, x, y, rz):
    col = C.coll("Cabanes")
    mur = bpy.data.materials["Banco"]
    clair = bpy.data.materials["Banco_Clair"]
    bois = bpy.data.materials["Bois"]
    sol = bpy.data.materials["Sol_Interieur"]
    couv = bpy.data.materials["Couverture"]
    tapis = bpy.data.materials["Tapis"]
    terre = bpy.data.materials["Terre_Cuite"]

    root = bpy.data.objects.new(name, None)
    root.empty_display_type = 'PLAIN_AXES'
    col.objects.link(root)
    root.location = (x, y, C.height_at(x, y))
    root.rotation_euler = (0, 0, rz)

    # Murs : porte en façade (y = -D/2), fenêtres au fond et à gauche
    _wall(col, root, f"{name}_MurFacade", 'x', -D / 2 + T / 2, W, [(0.0, 1.0, 0.0, 2.0)], mur)
    _wall(col, root, f"{name}_MurFond", 'x', D / 2 - T / 2, W, [(1.5, 0.6, 1.3, 1.9)], mur)
    _wall(col, root, f"{name}_MurGauche", 'y', -W / 2 + T / 2, D - 2 * T, [(0.2, 0.6, 1.3, 1.9)], mur)
    _wall(col, root, f"{name}_MurDroit", 'y', W / 2 - T / 2, D - 2 * T, [], mur)

    # Sol, toit plat et acrotère
    _child(C.box(f"{name}_Sol", (W, D, 0.3), (0, 0, -0.05), col, sol), root, bevel=False)
    _child(C.box(f"{name}_Toit", (W + 0.6, D + 0.6, 0.35), (0, 0, H + 0.175), col, clair), root)
    ac = 0.3
    for k, (size, loc) in enumerate([
            ((W + 0.6, 0.25, ac), (0, -(D + 0.6) / 2 + 0.125, H + 0.35 + ac / 2)),
            ((W + 0.6, 0.25, ac), (0, (D + 0.6) / 2 - 0.125, H + 0.35 + ac / 2)),
            ((0.25, D + 0.1, ac), (-(W + 0.6) / 2 + 0.125, 0, H + 0.35 + ac / 2)),
            ((0.25, D + 0.1, ac), ((W + 0.6) / 2 - 0.125, 0, H + 0.35 + ac / 2))]):
        _child(C.box(f"{name}_Acrotere_{k}", size, loc, col, clair), root)

    # Mobilier
    _child(C.box(f"{name}_Tapis", (2.4, 1.6, 0.04), (0.0, 0.2, 0.12), col, tapis), root, bevel=False)
    bx, by = -W / 2 + T + 1.1, D / 2 - T - 0.55
    _child(C.box(f"{name}_Lit", (2.0, 0.95, 0.35), (bx, by, 0.30), col, bois), root)
    _child(C.box(f"{name}_Matelas", (1.9, 0.85, 0.12), (bx, by, 0.54), col, couv), root)
    tx, ty = W / 2 - T - 0.8, D / 2 - T - 0.6
    _child(C.box(f"{name}_Table", (0.9, 0.6, 0.75), (tx, ty, 0.375), col, bois), root)
    for k, (dx, dy) in enumerate([(-0.9, -0.2), (-0.5, -0.8)]):
        _child(C.cone(f"{name}_Tabouret_{k}", 0.24, 0.22, 0.4, 10, (tx + dx, ty + dy, 0.2), col, bois), root, bevel=False)
    for k, (jx, jy, r) in enumerate([(W / 2 - T - 0.45, -D / 2 + T + 0.55, 0.32),
                                     (W / 2 - T - 1.1, -D / 2 + T + 0.4, 0.24)]):
        _child(C.cone(f"{name}_Jarre_{k}", r, r * 0.7, 0.85, 12, (jx, jy, 0.42), col, terre), root, bevel=False)
    _child(C.box(f"{name}_Etagere", (1.2, 0.25, 0.06), (-1.0, D / 2 - T - 0.15, 1.5), col, bois), root)
    return root


def _snap(rz_to_center):
    return round(rz_to_center / (math.pi / 2)) * (math.pi / 2)


def run():
    sc = bpy.context.scene
    _mats()
    col = C.coll("Cabanes")
    C.clear_collection(col)

    vx, vy = C.ZONES["village"]["c"]
    sites = {}
    if "hut_sites" in sc:
        sites = {k: tuple(v) for k, v in sc["hut_sites"].items()}

    for n in HUTS_VILLAGE:
        o = bpy.data.objects.get(f"Maison_{n:02d}")
        if o is not None:
            sites[str(n)] = (o.location.x, o.location.y, o.rotation_euler.z)
            for nm in (f"Maison_{n:02d}", f"Maison_{n:02d}_Acrotere"):
                ob = bpy.data.objects.get(nm)
                if ob:
                    me = ob.data
                    bpy.data.objects.remove(ob, do_unlink=True)
                    if me.users == 0:
                        bpy.data.meshes.remove(me)
    sc["hut_sites"] = {k: list(v) for k, v in sites.items()}

    made = []
    for n in HUTS_VILLAGE:
        x, y, jit = sites[str(n)]
        rz = _snap(math.atan2(vx - x, -(vy - y))) + jit
        made.append(hut(f"Cabane_{len(made)+1:02d}", x, y, rz))

    ox, oy = C.ZONES["oasis"]["c"]
    for dx, dy in OASIS_SITES:
        x, y = ox + dx, oy + dy
        rz = _snap(math.atan2(ox - x, -(oy - y)))
        made.append(hut(f"Cabane_{len(made)+1:02d}", x, y, rz))

    meshes = [o for o in col.objects if o.type == 'MESH']
    R._bake_modifiers(meshes)
    for o in meshes:
        o["realism"] = True
    print("cabanes:", len(made), "| pièces:", len(meshes))
