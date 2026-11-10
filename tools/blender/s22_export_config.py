"""Export de la configuration (Blender en arrière-plan). Usage : blender -b fichier.blend --python s22_export_config.py -- <dossier client>"""
import json, math, os, sys
import bpy
from mathutils import Vector

CLIENT = sys.argv[sys.argv.index("--") + 1]
ONLY_COLLIDERS = "--only-colliders" in sys.argv          # ne réécrit que colliders.json (caméras, relief et points d'apparition inchangés)
sys.stdout = sys.stderr = open(os.path.join(CLIENT, "export_config.log"), "w", buffering=1, encoding="utf-8")   # le lanceur Windows ne renvoie rien
sys.path.insert(0, os.path.join(os.path.dirname(bpy.data.filepath), "..", "tools", "blender"))
import common as C

CFG = os.path.join(CLIENT, "config")
os.makedirs(CFG, exist_ok=True)


def dump(name, data):
    with open(os.path.join(CFG, name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("écrit:", name, os.path.getsize(os.path.join(CFG, name)), "octets")


if not ONLY_COLLIDERS:
    # --- caméras de jeu (distance derrière, hauteur, décalage à droite, champ vertical, point visé en repère du joueur)
    cams = {}
    for o in bpy.data.collections["Cameras_Jeu"].objects:
        if o.type == 'CAMERA':
            cams[o.name] = dict(dist=round(o["dist"], 3), h=round(o["h"], 3), side=round(o["side"], 3),
                                fov=round(o["fov"], 1), look=[round(v, 3) for v in o["look"]])
    dump("cameras.json", cams)

    # --- points d'apparition et objectifs (coordonnées Blender)
    sp = {}
    for o in bpy.data.objects:
        if o.type == 'EMPTY' and o.name.startswith(("Spawn_", "Obj_")):
            t = o.matrix_world.translation
            sp[o.name] = [round(t.x, 2), round(t.y, 2), round(t.z, 2)]
    dump("spawns.json", sp)

    # --- hauteur du terrain (même fonction que le maillage), grille de 2,5 m
    n, step, x0, y0 = 201, 2.5, -250.0, -250.0
    h = [round(C.height_at(x0 + i * step, y0 + j * step), 3) for j in range(n) for i in range(n)]
    dump("heightmap.json", dict(n=n, step=step, x0=x0, y0=y0, h=h))

# --- collisions 2D : tout ce qui est solide à hauteur de personnage. Cercles (tours, minarets, troncs, rochers, pots, tabourets...)
# et boîtes tournées (murs, maisons, tentes, caisses, gravats, épave, lits, tables). Pas de collider pour ce qui est au sol (tapis,
# matelas, sol des cabanes), au-dessus de la tête (toits, acrotères, palmes) ou purement décoratif (branches, étagère murale).
import re
CIRCLE_PREFIX = ("Tour_", "Mosquee_Minaret_", "Puits_Margelle", "Puits_Poteau", "Rocher_", "Epave_Roue")
BOX_PREFIX = ("Mosquee_Salle", "Muret_", "Rempart_", "Donjon", "Toguna_Pilier", "Tente_", "Caisse_", "Gravats_", "Epave_Chassis", "Epave_Cabine", "Epave_Benne")
HEAD_CLEARANCE = 1.9                                        # une pièce dont le bas est à plus de 1,9 m du sol ne bloque pas le personnage
SHRINK = {"Touffe_": 0.7}                                   # buissons : cercle un peu plus petit que l'objet


def kind(nm):
    """'c' (cercle), 'b' (boîte) ou None."""
    if nm.startswith("Donjon_Breche"):
        return None
    if nm.startswith(CIRCLE_PREFIX) or nm.endswith("_Tronc") or re.fullmatch(r"Arbre_Mort_\d+", nm)             or "_Jarre_" in nm or "_Tabouret_" in nm or nm.startswith("Touffe_"):
        return "c"
    if (nm.startswith("Maison_") and "Acrotere" not in nm) or nm.startswith(BOX_PREFIX) or "_Mur" in nm             or nm.endswith(("_Lit", "_Table")):
        return "b"
    return None


cols = []
counts = {}
for cname in ("Camp", "Oasis", "Village", "Fort", "Props", "Cabanes"):
    c = bpy.data.collections.get(cname)
    if c is None:
        continue
    for o in c.all_objects:
        if o.type != 'MESH' or o.get("helper"):
            continue
        k = kind(o.name)
        if k is None:
            continue
        d = o.dimensions
        mw = o.matrix_world
        zmin = min((mw @ Vector(b)).z for b in o.bound_box)
        if zmin - C.height_at(mw.translation.x, mw.translation.y) > HEAD_CLEARANCE:      # linteau, pièce de mur au-dessus d'une porte : on passe dessous
            print("au-dessus de la tête, ignoré :", o.name)
            continue
        centre = mw @ (sum((Vector(b) for b in o.bound_box), Vector()) / 8.0)   # centre de la boîte englobante, en monde
        if k == "c":
            f = next((v for p, v in SHRINK.items() if o.name.startswith(p)), 1.0)
            cols.append(dict(t="c", x=round(centre.x, 2), y=round(centre.y, 2), r=round(max(d.x, d.y) / 2.0 * f, 2)))
        else:
            cols.append(dict(t="b", x=round(centre.x, 2), y=round(centre.y, 2), hx=round(d.x / 2.0, 2),
                             hy=round(d.y / 2.0, 2), yaw=round(mw.to_euler().z, 4)))
        base = re.sub(r"(_?\d+)+", "#", o.name)
        counts[base] = counts.get(base, 0) + 1
print("collisions:", len(cols))
print("par type:", counts)
dump("colliders.json", cols)
