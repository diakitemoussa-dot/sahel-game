import bpy, bmesh, math, random
from mathutils import Vector, noise

PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
BLEND = PROJ + r"\assets\sahel_desert.blend"
MAP_HALF = 250.0

ZONES = {
    "camp":    dict(c=(-180.0, -180.0), r=40.0, h=0.0),
    "oasis":   dict(c=(160.0, -140.0),  r=45.0, h=-1.0),
    "village": dict(c=(140.0, 150.0),   r=50.0, h=0.5),
    "fort":    dict(c=(-150.0, 170.0),  r=35.0, h=14.0),
}
WATER_LEVEL = -1.4


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def dune_height(x, y):
    n = noise.fractal(Vector((x * 0.008, y * 0.008, 0.0)), 1.0, 2.0, 4)
    ridge = 1.0 - abs(noise.noise(Vector((x * 0.015, y * 0.02, 3.0))))
    return 14.0 * n + 9.0 * ridge * ridge


def height_at(x, y):
    h = dune_height(x, y)
    for z in ZONES.values():
        d = math.hypot(x - z["c"][0], y - z["c"][1])
        w = 1.0 - smoothstep(z["r"], z["r"] * 2.2, d)
        h = h * (1.0 - w) + z["h"] * w
    ox, oy = ZONES["oasis"]["c"]
    do = math.hypot(x - ox, y - oy)
    h -= 2.5 * (1.0 - smoothstep(4.0, 16.0, do))
    return h


def get_mat(name, color, rough=0.9):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def coll(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def clear_collection(c):
    for o in list(c.objects):
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


def new_obj(name, mesh, collection, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    o = bpy.data.objects.new(name, mesh)
    collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    if mat is not None:
        o.data.materials.append(mat)
    return o


def box(name, size, loc, collection, mat, rot_z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return new_obj(name, me, collection, mat, loc, (0, 0, rot_z))


def cone(name, r_bottom, r_top, depth, segments, loc, collection, mat, rot_z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments,
                          radius1=r_bottom, radius2=r_top, depth=depth)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return new_obj(name, me, collection, mat, loc, (0, 0, rot_z))


def on_ground(x, y, height, sink=0.3):
    """Altitude du centre d'un objet de hauteur `height` posé en (x, y)."""
    return height_at(x, y) + height / 2.0 - sink


def save():
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    return BLEND
