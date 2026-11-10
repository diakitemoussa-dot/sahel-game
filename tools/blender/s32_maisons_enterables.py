"""Rend enterables les maisons du village restées pleines (Maison_01, 04, 06, 07, 10, 11, 13, 16).
Chacune est remplacée par une maisonnette avec intérieur (porte, fenêtres, sol, toit, mobilier) du même modèle que s11_huts,
orientée porte vers la mosquée, au même emplacement. Les nouvelles cabanes s'ajoutent à la collection 'Cabanes'
(Cabane_11 à Cabane_18) ; les cabanes existantes ne sont pas touchées (s11_huts.run() reconstruirait tout : ne pas le relancer).
Usage dans Blender :  import s32_maisons_enterables as M; M.run()"""
import math, bpy
import common as C
import s10_realism as R
import s11_huts as H


def run():
    sc = bpy.context.scene
    col = C.coll("Cabanes")
    vx, vy = C.ZONES["village"]["c"]
    sites = {k: list(v) for k, v in sc.get("hut_sites", {}).items()}
    pleines = sorted(o.name for o in bpy.data.objects
                     if o.name.startswith("Maison_") and "Acrotere" not in o.name and o.type == 'MESH')
    start = len([o for o in col.objects if o.type == 'EMPTY' and o.name.startswith("Cabane_")])
    before = set(col.objects)
    made = []
    for nm in pleines:
        n = int(nm.split("_")[1])
        o = bpy.data.objects[nm]
        x, y, jit = o.location.x, o.location.y, o.rotation_euler.z
        for victim in (nm, nm + "_Acrotere"):
            ob = bpy.data.objects.get(victim)
            if ob:
                me = ob.data
                bpy.data.objects.remove(ob, do_unlink=True)
                if me.users == 0:
                    bpy.data.meshes.remove(me)
        rz = H._snap(math.atan2(vx - x, -(vy - y))) + jit
        made.append(H.hut(f"Cabane_{start + len(made) + 1:02d}", x, y, rz))
        sites[str(n)] = [x, y, jit]
    sc["hut_sites"] = sites
    meshes = [o for o in col.objects if o not in before and o.type == 'MESH']
    R._bake_modifiers(meshes)
    for o in meshes:
        o["realism"] = True
    print("maisons rendues enterables :", len(made), "| pièces :", len(meshes))
    return made
