"""Texture du sable cuite (couleur + relief) : chemins, UV du terrain, matériau de jeu.
Utilisé par s23_bake_sand.py (cuisson) et s20_export_map.py (export). Le sable de Blender est procédural
(bruit, vagues, rampe de couleurs) : le jeu ne le voit que s'il est cuit dans des images."""
import os
import bpy

MAP_HALF = 250.0
TEX_DIR_NAME = os.path.join("assets", "textures")
COLOR_FILE, NORMAL_FILE = "sable_color.jpg", "sable_normal.jpg"
NORMAL_STRENGTH = 3.0   # le relief cuit est subtil (écart-type 8/255) : renforcé dans le jeu pour retrouver les ondulations de Blender


def tex_dir(proj):
    return os.path.join(proj, TEX_DIR_NAME)


def ensure_planar_uv(obj, half=MAP_HALF, name="UVMap"):
    """UV planes : (x, y) de la carte ramené sur [0, 1]. Aucune couture, même échelle partout."""
    me = obj.data
    uv = me.uv_layers.get(name) or me.uv_layers.new(name=name)
    verts = me.vertices
    for loop in me.loops:
        v = verts[loop.vertex_index].co
        uv.data[loop.index].uv = ((v.x + half) / (2 * half), (v.y + half) / (2 * half))
    me.uv_layers.active = uv
    return uv


def baked_sand_material(proj, name="G_Sable"):
    """Matériau de jeu du sable : image de couleur + image de relief (carte de normales), rugosité fixe."""
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    cpath = os.path.join(tex_dir(proj), COLOR_FILE)
    npath = os.path.join(tex_dir(proj), NORMAL_FILE)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = 0.95
    ci = nt.nodes.new("ShaderNodeTexImage")
    ci.image = bpy.data.images.load(cpath)
    ci.image.colorspace_settings.name = "sRGB"
    ni = nt.nodes.new("ShaderNodeTexImage")
    ni.image = bpy.data.images.load(npath)
    ni.image.colorspace_settings.name = "Non-Color"
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = NORMAL_STRENGTH      # exporté comme « scale » de la carte de normales
    nt.links.new(ci.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(ni.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m
