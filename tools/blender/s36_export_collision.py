"""Export de la maille de collision de la carte (Blender en arrière-plan) : client/assets/collision.bin.
Usage : blender -b assets/sahel_desert.blend --python tools/blender/s36_export_collision.py -- <dossier client>
Chaque objet solide des collections Camp, Oasis, Village, Fort, Props et Cabanes est remplacé par son enveloppe convexe simplifiée (voir colmesh.py) :
le personnage entre en collision avec la vraie forme des objets (pyramide de tente, rocher, murs...), peut se tenir debout dessus et les tirs s'y arrêtent.
Le .blend n'est pas enregistré."""
import os, sys
import bpy

CLIENT = sys.argv[sys.argv.index("--") + 1]
sys.stdout = sys.stderr = open(os.path.join(CLIENT, "export_collision.log"), "w", buffering=1, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import colmesh as K

COLLS = ("Camp", "Oasis", "Village", "Fort", "Props", "Cabanes")
# ce qui n'est pas solide à hauteur de personnage ou n'a pas d'intérêt : feuillage des palmiers, branches, tapis et matelas (au sol), étagère murale,
# brèche du donjon (ouverture), eau, repères
SKIP = ("Palmes", "Branche", "Tapis", "Matelas", "Etagere", "Donjon_Breche", "Eau_", "Repere", "Muzzle")

b = K.Builder()
per_coll = {}
for cname in COLLS:
    c = bpy.data.collections.get(cname)
    if c is None:
        continue
    n = 0
    for o in c.all_objects:
        if o.type != 'MESH' or o.get("helper") or any(s in o.name for s in SKIP):
            continue
        for hull in K.object_hulls(o):
            b.add(hull, o.name); n += 1
    per_coll[cname] = n
out = os.path.join(CLIENT, "assets", "collision.bin")
nv, nt, no = b.write(out)
print("morceaux par collection:", per_coll)
print(f"EXPORT OK: {out} | {nv} sommets, {nt} triangles, {no} objets | {os.path.getsize(out) / 1024:.0f} Ko")
