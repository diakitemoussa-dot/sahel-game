"""Caméras de jeu à la troisième personne (par-dessus l'épaule droite).

Un pivot 'Cam_Pivot' suit la position du personnage au sol (Copy Location sur x et y).
Chaque caméra est enfant du pivot, avec des coordonnées locales :
  x = décalage à droite, y = avant (le joueur regarde vers +y), z = hauteur au-dessus du sol.
Les réglages sont aussi copiés en propriétés personnalisées (dist, h, side, fov, look)
pour l'export futur vers le jeu.
"""
import math, bpy
from mathutils import Vector

# nom: distance derrière, hauteur, décalage à droite, champ vertical (°), point visé (droite, devant, hauteur)
CAMS = {
    "Cam_Exploration": dict(dist=3.2, h=1.9, side=0.60, fov=60, look=(0.60, 10.0, 1.5), pose=("Rifle Run", 6)),
    "Cam_Visee":       dict(dist=1.6, h=1.7, side=0.55, fov=45, look=(0.55, 10.0, 1.6), pose=("Rifle Aim", 20)),
    "Cam_Accroupi":    dict(dist=2.8, h=1.4, side=0.60, fov=60, look=(0.60, 10.0, 1.1), pose=("Rifle Kneel", 15)),
    "Cam_ATerre":      dict(dist=2.6, h=2.2, side=0.0,  fov=55, look=(0.0, 0.0, 0.3),  pose=("Rifle Death", -1)),
    # position réglée à la main par l'utilisateur dans Blender (à hauteur des yeux, lunette) : à conserver telle quelle
    "Cam_Sniper":      dict(dist=0.488, h=1.569, side=0.528, fov=25, look=(-6.480, 28.478, -1.872), pose=("Rifle Aim", 20)),
}
# Essai : vue à la première personne (hauteur des yeux), canon visant le centre de l'image
CAMS["Cam_PremierePersonne"] = dict(dist=-0.064, h=1.585, side=0.185, fov=65, look=(0.185, 30.0, 1.585),
                                    pose=("Rifle Aim FPS", 20))
COLORS = {"Cam_PremierePersonne": (0.1, 0.9, 0.9), "Cam_Exploration": (0.2, 0.6, 1.0), "Cam_Visee": (1.0, 0.3, 0.2), "Cam_Accroupi": (0.3, 0.8, 0.3),
          "Cam_ATerre": (0.9, 0.8, 0.1), "Cam_Sniper": (0.8, 0.3, 0.9)}


def run():
    arm = bpy.data.objects["Armature"]
    col = bpy.data.collections.get("Cameras_Jeu") or bpy.data.collections.new("Cameras_Jeu")
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        d = o.data if o.type == 'CAMERA' else None
        bpy.data.objects.remove(o, do_unlink=True)
        if d is not None and d.users == 0:
            bpy.data.cameras.remove(d)

    # Pivot au sol, orienté vers l'avant du personnage (le personnage regarde vers -Y du monde)
    pivot = bpy.data.objects.new("Cam_Pivot", None)
    pivot.empty_display_type = 'ARROWS'
    pivot.empty_display_size = 1.2
    col.objects.link(pivot)
    pivot.location = (arm.location.x, arm.location.y, arm.location.z)
    pivot.rotation_euler = (0.0, 0.0, math.pi)
    c = pivot.constraints.new('COPY_LOCATION')
    c.target = arm
    c.use_z = False

    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    for name, p in CAMS.items():
        cd = bpy.data.cameras.new(name)
        cd.sensor_fit = 'VERTICAL'
        cd.angle = math.radians(p["fov"])
        cd.clip_start, cd.clip_end = 0.1, 800.0
        cd.display_size = 0.6
        cam = bpy.data.objects.new(name, cd)
        col.objects.link(cam)
        cam.parent = pivot
        pos = Vector((p["side"], -p["dist"], p["h"]))
        look = Vector(p["look"])
        cam.location = pos
        cam.rotation_mode = 'XYZ'
        cam.rotation_euler = (look - pos).to_track_quat('-Z', 'Y').to_euler()
        cam.color = (*COLORS[name], 1.0)
        for k, v in (("dist", p["dist"]), ("h", p["h"]), ("side", p["side"]), ("fov", p["fov"]), ("look", list(p["look"]))):
            cam[k] = v
    return pivot
