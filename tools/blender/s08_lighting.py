import math, bpy
import common as C


def run():
    sc = bpy.context.scene
    for o in [o for o in bpy.data.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o, do_unlink=True)
    ld = bpy.data.lights.new("Soleil_Sahel", 'SUN')
    ld.energy = 4.0
    ld.color = (1.0, 0.90, 0.75)
    ld.angle = math.radians(1.5)
    so = bpy.data.objects.new("Soleil_Sahel", ld)
    C.coll("Terrain").objects.link(so)
    so.rotation_euler = (math.radians(50), 0.0, math.radians(30))

    if sc.world is None:
        sc.world = bpy.data.worlds.new("Ciel_Sahel")
    sc.world.use_nodes = True
    bg = next(n for n in sc.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.55, 0.72, 0.95, 1.0)
    bg.inputs["Strength"].default_value = 1.0

    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except TypeError as e:
        print("Moteur EEVEE indisponible :", e)
