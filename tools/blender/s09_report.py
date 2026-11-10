import bpy


def run():
    total = 0
    by_coll = {}
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        o.data.calc_loop_triangles()
        t = len(o.data.loop_triangles)
        total += t
        c = o.users_collection[0].name if o.users_collection else "?"
        by_coll[c] = by_coll.get(c, 0) + t
    for c, t in sorted(by_coll.items()):
        print(f"{c:10s} {t:8d} triangles")
    print("TOTAL", total)
    assert total < 400000, f"Budget dépassé : {total} triangles (limite 400000)"
    for name in ("Camp", "Oasis", "Village", "Fort", "Props", "Markers", "Terrain"):
        assert name in bpy.data.collections, f"Collection manquante : {name}"
    print("OK")
