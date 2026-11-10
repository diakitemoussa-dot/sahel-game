import bpy
import common as C


def empty(col, name, x, y, dz=0.0):
    o = bpy.data.objects.new(name, None)
    o.empty_display_type = 'ARROWS'
    o.empty_display_size = 2.0
    col.objects.link(o)
    o.location = (x, y, C.height_at(x, y) + dz)
    return o


def run():
    col = C.coll("Markers")
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    cx, cy = C.ZONES["camp"]["c"]
    for i, (dx, dy) in enumerate([(-4, 6), (4, 6), (-4, 10), (4, 10)]):
        empty(col, f"Spawn_Joueur_{i+1}", cx + dx, cy + dy)
    for name, z in (("Obj_Convoi", None), ("Obj_Village", "village"),
                    ("Obj_Oasis", "oasis"), ("Obj_Fort", "fort")):
        if z is None:
            empty(col, name, 0.0, -80.0)
        elif z == "oasis":
            x, y = C.ZONES[z]["c"]
            empty(col, name, x, y + 22.0)  # berge, hors de l'eau
        else:
            x, y = C.ZONES[z]["c"]
            empty(col, name, x, y)
    empty(col, "Spawn_Ennemis_Village", 140.0, 190.0)
    empty(col, "Spawn_Ennemis_Fort", -150.0, 160.0)
