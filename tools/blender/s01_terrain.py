import bpy, bmesh
import common as C


def run():
    col = C.coll("Terrain")
    C.clear_collection(col)

    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=200, y_segments=200, size=C.MAP_HALF)
    m = max(abs(v.co.x) for v in bm.verts)
    f = C.MAP_HALF / m
    for v in bm.verts:
        v.co.x *= f
        v.co.y *= f
        v.co.z = C.height_at(v.co.x, v.co.y)
    me = bpy.data.meshes.new("Sol_Desert")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    C.new_obj("Sol_Desert", me, col, C.get_mat("Sable", (0.76, 0.56, 0.33), 0.95))

    ox, oy = C.ZONES["oasis"]["c"]
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=15.0)
    me = bpy.data.meshes.new("Eau_Oasis")
    bm.to_mesh(me)
    bm.free()
    C.new_obj("Eau_Oasis", me, col, C.get_mat("Eau", (0.05, 0.25, 0.30), 0.1),
              loc=(ox, oy, C.WATER_LEVEL))
