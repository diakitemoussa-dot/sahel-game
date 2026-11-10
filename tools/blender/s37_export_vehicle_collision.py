"""Export de la maille de collision du véhicule : client/assets/vehicles/technique_collision.bin (repère du véhicule, avant vers +Z dans le jeu).
Usage : blender -b assets/sahel_desert.blend --python tools/blender/s37_export_vehicle_collision.py -- <dossier client>
Chaque grosse pièce (capot, ailes, cabine, bords de plateau, hayon, plancher, pare-chocs, roues, pied et bouclier du canon, canons, caisses) est remplacée par
son enveloppe convexe simplifiée. Les petits détails (écrous, rails fins, vitres, essuie-glaces...) sont ignorés : le joueur ne s'y accroche pas.
Le jeu pose ces triangles là où il place le véhicule : on peut monter sur le capot, le toit, la plateau. Le .blend n'est pas enregistré."""
import os, sys
import bpy

CLIENT = sys.argv[sys.argv.index("--") + 1]
sys.stdout = sys.stderr = open(os.path.join(CLIENT, "export_vehicle_collision.log"), "w", buffering=1, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import colmesh as K

root = bpy.data.objects["Technique"]
root.location = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()
col = bpy.data.collections["Vehicule_Technique"]

KEEP = ("V_Capot", "V_Aile", "V_Cabine", "V_BordPlateau", "V_Hayon", "V_SolPlateau", "V_Plancher", "V_PareChoc", "V_Marchepied",
        "V_Reservoir", "V_Caisse", "V_AffutBase", "V_AffutColonne", "V_Plateau", "V_Bouclier", "V_Canon", "V_Manchon", "V_Culasse", "V_Boite", "V_Bloc",
        "V_Siege", "V_Pont", "V_Essieu", "V_Pneu", "V_Longeron")
# les pièces dont le nom commence par un de ces préfixes mais qui sont des détails : à ignorer
DROP = ("V_CaisseSangle", "V_CaisseLoquet", "V_SiegeBras", "V_SiegeDos", "V_BoucheG", "V_BoucheD", "V_BoiteG_", "V_BandeMaillon")

b = K.Builder()
kept = 0
for o in col.all_objects:
    if o.type != 'MESH':
        continue
    n = o.name
    base = n.split("_Pneu")[0] if n.endswith("_Pneu") else n
    if not (n.endswith("_Pneu") or n.startswith(KEEP)) or n.startswith(DROP):
        continue
    for hull in K.object_hulls(o, max_tris=64):
        b.add(hull, n); kept += 1
out = os.path.join(CLIENT, "assets", "vehicles", "technique_collision.bin")
os.makedirs(os.path.dirname(out), exist_ok=True)
nv, nt, no = b.write(out)
print(f"EXPORT OK: {out} | {kept} morceaux, {nv} sommets, {nt} triangles | {os.path.getsize(out) / 1024:.0f} Ko")
