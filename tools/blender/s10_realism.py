"""Passe semi-réaliste : matériaux, bords biseautés et irréguliers, ciel, tonalité.
Idempotent : relancer d'abord s02..s06 (qui reconstruisent les objets) puis ce script."""
import math, bpy
import common as C
import materials

BUILD_PREFIX = ("Maison", "Mosquee", "Toguna", "Muret", "Rempart", "Tour", "Donjon", "Gravats",
                "Puits", "Tente", "Caisse", "Epave")
ROCK_PREFIX = ("Rocher",)


def _tex(name, scale):
    t = bpy.data.textures.get(name) or bpy.data.textures.new(name, 'CLOUDS')
    t.noise_scale = scale
    t.noise_depth = 3
    return t


def _bake_modifiers(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if not o.modifiers:
            continue
        ev = o.evaluated_get(dg)
        new = bpy.data.meshes.new_from_object(ev)
        old = o.data
        mats = [s.material for s in o.material_slots]
        o.modifiers.clear()
        o.data = new
        for m in mats:
            if m and m.name not in [x.name for x in new.materials if x]:
                new.materials.append(m)
        for p in new.polygons:
            p.use_smooth = True
        if old.users == 0:
            bpy.data.meshes.remove(old)


def _detail(o, rocky=False):
    if o.modifiers:
        return
    if rocky:
        s = o.modifiers.new("Sub", 'SUBSURF')
        s.levels = 1
        s.render_levels = 1
        d = o.modifiers.new("Disp", 'DISPLACE')
        d.texture = _tex("RocNoise", 0.8)
        d.strength = 0.5
        return
    bv = o.modifiers.new("Bevel", 'BEVEL')
    bv.width = 0.18
    bv.segments = 2
    bv.limit_method = 'ANGLE'
    s = o.modifiers.new("Sub", 'SUBSURF')
    s.subdivision_type = 'SIMPLE'
    s.levels = 2
    s.render_levels = 2
    d = o.modifiers.new("Disp", 'DISPLACE')
    d.texture = _tex("BancoNoise", 0.7)
    d.strength = 0.16
    d.mid_level = 0.5


def run():
    materials.run()

    targets, rocks = [], []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.get("realism"):
            continue
        if o.name.startswith(ROCK_PREFIX):
            rocks.append(o)
        elif o.name.startswith(BUILD_PREFIX):
            targets.append(o)
    for o in targets:
        _detail(o)
    for o in rocks:
        _detail(o, rocky=True)
    _bake_modifiers(targets + rocks)
    for o in targets + rocks:
        o["realism"] = True

    sc = bpy.context.scene
    # Ciel physique
    w = sc.world
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    sky = nt.nodes.new('ShaderNodeTexSky')
    items = [i.identifier for i in sky.bl_rna.properties['sky_type'].enum_items]
    for pick in ('NISHITA', 'MULTIPLE_SCATTERING', 'SINGLE_SCATTERING'):
        if pick in items:
            sky.sky_type = pick
            break
    if hasattr(sky, 'sun_elevation'):
        sky.sun_elevation = math.radians(40)
        sky.sun_rotation = math.radians(30)
        sky.sun_disc = False
    if hasattr(sky, 'air_density'):
        sky.air_density = 1.0
    if hasattr(sky, 'aerosol_density'):
        sky.aerosol_density = 2.5
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    bg.inputs['Strength'].default_value = 0.9

    # Tonalité du rendu
    vt = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items]
    for pick in ('AgX', 'Filmic', 'Standard'):
        if pick in vt:
            sc.view_settings.view_transform = pick
            break
    try:
        sc.view_settings.look = 'AgX - Punchy'
    except TypeError as e:
        print("look indisponible :", str(e)[:200])
    sc.view_settings.exposure = -0.6
    bg.inputs['Strength'].default_value = 0.35
    sun = bpy.data.lights.get("Soleil_Sahel")
    if sun:
        sun.energy = 2.2
    print("sky:", sky.sky_type, "| vue:", sc.view_settings.view_transform, sc.view_settings.look)
