"""Intro animée de Sahel Game (20 s) : construit les plans dans une COPIE en mémoire de sahel_desert.blend (le fichier n'est jamais enregistré)
puis rend des images. À lancer en arrière-plan :
    blender -b assets/sahel_desert.blend --python tools/blender/s40_intro.py
Variables d'environnement : INTRO_FRAMES="1,80,150" (images de contrôle seules, en 640 x 360) ; INTRO_OUT=dossier de sortie ; INTRO_RANGE="1,396" (rendu complet).
Histoire : « Le convoi en danger ». Plans (24 i/s) : 1 le camp à l'aube (1-72) ; 2 le héros écoute l'alerte (73-144) ; 3 il court au véhicule (145-228) ;
4 le véhicule fonce dans les dunes, le héros sur le plateau (229-336) ; 5 le fort au loin (337-396). Le titre (397-480) est ajouté ensuite par intro_post.py.
Le héros et le véhicule sont ceux du jeu (collection Tenue_Militaire, Vehicule_Technique, animations « Rifle Idle / Run / Aim »)."""
import math, os, sys
import bpy
from mathutils import Vector, Euler

PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
OUT = os.environ.get("INTRO_OUT", os.path.join(PROJ, "assets", "intro", "frames"))
FPS = 24
S = {1: (1, 72), 2: (73, 144), 3: (145, 228), 4: (229, 336), 5: (337, 396)}
LOG = open(os.path.join(os.path.dirname(OUT), "intro_build.log"), "w", encoding="utf-8", buffering=1)
sys.stdout = sys.stderr = LOG

sc = bpy.context.scene
dg = None


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- terrain
terrain = [o for o in bpy.data.collections["Terrain"].objects if o.type == "MESH"]


def ground(x, y):
    """Altitude du sol (terrain seul) en (x, y), repère Blender."""
    best = None
    for o in terrain:
        inv = o.matrix_world.inverted()
        o0 = inv @ Vector((x, y, 400.0)); d = (inv.to_3x3() @ Vector((0, 0, -1))).normalized()
        ok, loc, _n, _i = o.ray_cast(o0, d)
        if ok:
            z = (o.matrix_world @ loc).z
            best = z if best is None else max(best, z)
    return 0.0 if best is None else best


def los_clear(a, b, margin=0.6, step=2.5):
    """La ligne de a à b passe-t-elle au-dessus du terrain (pas de dune entre la caméra et le sujet) ?"""
    d = (Vector(b) - Vector(a)); n = max(2, int(d.length / step))
    for i in range(1, n):
        p = Vector(a) + d * (i / n)
        if ground(p.x, p.y) > p.z - margin:
            return False
    return True


def lift_view(loc, tgt, max_lift=14.0):
    """Monte la caméra par pas de 0,5 m tant qu'une dune cache le sujet."""
    loc = Vector(loc)
    for _ in range(int(max_lift / 0.5)):
        if los_clear(loc, tgt):
            break
        loc.z += 0.5
    return tuple(loc)


# ---------------------------------------------------------------- mise en scène
def hide_collection(name, render=True):
    c = bpy.data.collections.get(name)
    if c:
        c.hide_render = True; c.hide_viewport = True


def setup_render(preview):
    r = sc.render
    r.engine = "BLENDER_EEVEE"
    r.resolution_x, r.resolution_y = (640, 360) if preview else (1280, 720)
    r.resolution_percentage = 100
    r.fps = FPS
    r.image_settings.file_format = "PNG"
    r.film_transparent = False
    try:
        sc.eevee.taa_render_samples = 24 if preview else 48
    except Exception as e:
        log("samples:", e)
    for attr, val in (("use_gtao", True), ("use_bloom", True), ("use_motion_blur", not preview), ("use_shadows", True)):
        try:
            setattr(sc.eevee, attr, val)
        except Exception:
            pass
    sc.view_settings.view_transform = sc.view_settings.view_transform      # on garde l'étalonnage de la scène


def dawn_light(elevation_deg=14, azimuth_deg=105, strength=3.2, color=(1.0, 0.74, 0.52)):
    """Soleil bas à l'est (azimut 105° ≈ est-sud-est) : lumière rasante dorée."""
    sun = bpy.data.objects["Soleil_Sahel"]
    sun.data.energy = strength
    sun.data.color = color
    el, az = math.radians(elevation_deg), math.radians(azimuth_deg)
    # le soleil éclaire dans la direction opposée à sa position dans le ciel ; azimut mesuré depuis le nord (+y) vers l'est (+x)
    d = Vector((-math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), -math.sin(el)))
    sun.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    w = sc.world
    if w and w.use_nodes:
        for n in w.node_tree.nodes:
            if n.type == "TEX_SKY":
                try:
                    n.sun_elevation = el; n.sun_rotation = math.radians(180 - azimuth_deg + 90)
                except Exception as e:
                    log("ciel:", e)


def clean_scene():
    bpy.data.objects["Armature"].data.pose_position = "POSE"       # le .blend est enregistré en pose de repos (T) : on anime le squelette
    hide_collection("Tenue_PNJ")
    hide_collection("Cameras_Jeu_Reperes")
    for n in ("Pistol", "Muzzle", "Muzzle_Pistol", "Rifle_Mag"):
        o = bpy.data.objects.get(n)
        if o and n != "Rifle_Mag":
            o.hide_render = True; o.hide_viewport = True
    for n in ("Hoodie", "Pants", "Shoes", "Hair_Twists"):          # la tenue de base est cachée sous la tenue militaire
        o = bpy.data.objects.get(n)
        if o:
            o.hide_render = True; o.hide_viewport = True


def set_clip(arm, segments):
    """segments : [(action, début, fin, vitesse)] ; une piste NLA par segment (les pistes hautes l'emportent)."""
    ad = arm.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for i, (name, f0, f1, speed) in enumerate(segments):
        act = bpy.data.actions[name]
        tr = ad.nla_tracks.new(); tr.name = f"{i}_{name}"
        st = tr.strips.new(name, int(f0), act)
        st.scale = 1.0 / speed
        length = (act.frame_range[1] - act.frame_range[0]) * st.scale
        st.repeat = max(1.0, (f1 - f0 + 1) / max(1e-6, length))
        st.extrapolation = "NOTHING"
        st.blend_in = 0; st.blend_out = 0


def face(dx, dy):
    """Rotation Z du héros pour regarder dans la direction (dx, dy) (par défaut il regarde vers -y)."""
    return math.atan2(dx, -dy)


def key_obj(o, frame, loc=None, rot=None):
    if loc is not None:
        o.location = loc; o.keyframe_insert("location", frame=frame)
    if rot is not None:
        o.rotation_euler = rot; o.keyframe_insert("rotation_euler", frame=frame)


def linear(o):
    ad = o.animation_data
    if not ad or not ad.action:
        return
    try:
        fcs = ad.action.fcurves
    except Exception:
        try:
            fcs = [fc for layer in ad.action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
        except Exception:
            return
    for fc in fcs:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


# ---------------------------------------------------------------- caméras
def make_cam(name, lens, f0, loc_a, tgt_a, loc_b=None, tgt_b=None, f1=None, sensor=36.0, fstop=None, focus=None):
    """Une caméra par plan, liée à un repère de la ligne de temps ; mouvement linéaire de (loc_a, tgt_a) à (loc_b, tgt_b)."""
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_width = sensor
    cd.clip_end = 3000
    if fstop:
        cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
        if focus:
            cd.dof.focus_distance = focus
    co = bpy.data.objects.new(name, cd)
    sc.collection.objects.link(co)

    def aim(loc, tgt):
        co.location = loc
        co.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    aim(loc_a, tgt_a); co.keyframe_insert("location", frame=f0); co.keyframe_insert("rotation_euler", frame=f0)
    if loc_b is not None and f1:
        aim(loc_b, tgt_b if tgt_b is not None else tgt_a)
        co.keyframe_insert("location", frame=f1); co.keyframe_insert("rotation_euler", frame=f1)
        linear(co)
    m = sc.timeline_markers.new(name, frame=f0); m.camera = co
    return co


def track_cam(name, lens, f0, f1, fn, fstop=None, focus=None, every=3):
    """Caméra qui accompagne un sujet : fn(f) -> (position, cible), clé toutes les `every` images (interpolation linéaire)."""
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_width = 36.0; cd.clip_end = 3000
    if fstop:
        cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
        if focus:
            cd.dof.focus_distance = focus
    co = bpy.data.objects.new(name, cd); sc.collection.objects.link(co)
    frames = list(range(f0, f1 + 1, every))
    if frames[-1] != f1:
        frames.append(f1)
    for f in frames:
        loc, tgt = fn(f)
        co.location = loc
        co.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        co.keyframe_insert("location", frame=f); co.keyframe_insert("rotation_euler", frame=f)
    linear(co)
    m = sc.timeline_markers.new(name, frame=f0); m.camera = co
    return co


def build():
    global dg
    preview = "INTRO_FRAMES" in os.environ
    setup_render(preview)
    clean_scene()
    dawn_light()
    arm = bpy.data.objects["Armature"]
    veh = bpy.data.objects["Technique"]
    for t in list(sc.timeline_markers):
        sc.timeline_markers.remove(t)
    sc.frame_start, sc.frame_end = 1, 396

    # ---- le véhicule est posé au camp, comme dans le jeu (-204, -174), l'avant vers -y
    VX, VY = -204.0, -174.0
    veh.location = (VX, VY, ground(VX, VY)); veh.rotation_euler = (0, 0, 0)
    wheels = {n: bpy.data.objects[n] for n in ("V_RoueArD", "V_RoueArG", "V_RoueAvD", "V_RoueAvG") if n in bpy.data.objects}
    wheel0 = {n: tuple(o.rotation_euler) for n, o in wheels.items()}

    # ---- héros : animations du jeu (NLA)
    set_clip(arm, [("Rifle Idle", S[1][0], S[3][0] - 1, 1.0), ("Rifle Run", S[3][0], S[3][1], 1.2), ("Rifle Aim", S[4][0], S[5][1], 1.0)])
    hero_start = (-184.0, -174.0)

    # plan 2 : face à la caméra (il regarde vers l'est)
    HEAD = face(-0.9, -0.42)                                  # il regarde vers l'ouest-sud-ouest : la caméra y est, le fond est l'intérieur de la carte
    key_obj(arm, S[1][0], (hero_start[0], hero_start[1], ground(*hero_start)), (math.radians(90), 0, HEAD))
    key_obj(arm, S[2][1], (hero_start[0], hero_start[1], ground(*hero_start)), (math.radians(90), 0, HEAD))

    # plan 3 : il court vers le véhicule (cap ouest), de 5,4 m/s
    side_x = VX + 2.0
    f0, f1 = S[3]
    for f in range(f0, f1 + 1):
        t = (f - f0) / (f1 - f0)
        x = hero_start[0] + (side_x - hero_start[0]) * t; y = hero_start[1] + 0.6 * t
        key_obj(arm, f, (x, y, ground(x, y)), (math.radians(90), 0, face(-1, 0.03)))

    # plan 4-5 : le véhicule fonce ; le héros est sur le plateau, derrière la tourelle
    # trajet entre les tentes du camp (Tente_03 à (-190, -163), Tente_04 à (-200, -180), puits à (-180, -180)), puis vers le nord-est
    path = [(VX, VY), (-197, -170), (-184, -170.5), (-172, -169.5), (-160, -164), (-142, -146), (-124, -124), (-112, -95)]
    seg = [0.0]
    for a, b in zip(path, path[1:]):
        seg.append(seg[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    total = seg[-1]

    def pos_on_path(s_):
        s_ = max(0.0, min(total, s_))
        for i in range(len(seg) - 1):
            if s_ <= seg[i + 1]:
                u = (s_ - seg[i]) / (seg[i + 1] - seg[i])
                a, b = path[i], path[i + 1]
                return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, math.atan2(b[0] - a[0], -(b[1] - a[1])))
        return (*path[-1], 0.0)

    speed = 13.0                                             # m/s
    f0, f1 = S[4]
    L = 3.2
    wheel_r = 0.38
    drive_s = {}
    for f in range(f0 - 1, f1 + 1):
        s_ = max(0.0, (f - f0) * speed / FPS)
        x, y, yaw = pos_on_path(s_)
        # sol sous l'avant et l'arrière : hauteur et tangage
        fx, fy = x + math.sin(yaw) * L / 2, y - math.cos(yaw) * L / 2
        bx, by = x - math.sin(yaw) * L / 2, y + math.cos(yaw) * L / 2
        zf, zb = ground(fx, fy), ground(bx, by)
        bounce = 0.035 * math.sin(f * 1.7) + 0.02 * math.sin(f * 3.1) if f >= f0 else 0.0
        z = (zf + zb) / 2 + bounce
        pitch = -math.atan2(zf - zb, L)
        key_obj(veh, f, (x, y, z), (pitch, 0, yaw))
        drive_s[f] = (s_, x, y, z, yaw)
        for n, o in wheels.items():
            key_obj(o, f, None, (wheel0[n][0] + s_ / wheel_r, wheel0[n][1], wheel0[n][2]))
    linear(veh)
    for o in wheels.values():
        linear(o)
    # le héros suit le véhicule : debout sur le plateau, devant la tourelle (l'arrière du véhicule est à l'opposé de son avant (sin yaw, -cos yaw))
    def hero_on_bed(x, y, z, yaw):
        back = (-math.sin(yaw), math.cos(yaw)); left = (-math.cos(yaw), -math.sin(yaw))
        return (x + back[0] * 0.85 + left[0] * 0.15, y + back[1] * 0.85 + left[1] * 0.15, z + 1.02)
    for f in range(f0, f1 + 1):
        s_, x, y, z, yaw = drive_s[f]
        key_obj(arm, f, hero_on_bed(x, y, z, yaw), (math.radians(90), 0, yaw))
    linear(arm)

    # plan 5 : le véhicule continue plus loin vers le fort (au loin) ; le héros n'est plus visible ici
    # (le véhicule garde son mouvement : voir plus haut ; on prolonge sur le chemin)
    for f in range(S[4][1] + 1, S[5][1] + 1):
        s_ = (f - S[4][0]) * speed / FPS
        x, y, yaw = pos_on_path(s_)
        zf = ground(x, y)
        key_obj(veh, f, (x, y, zf), (0, 0, yaw))
        for n, o in wheels.items():
            key_obj(o, f, None, (wheel0[n][0] + s_ / wheel_r, wheel0[n][1], wheel0[n][2]))
        key_obj(arm, f, hero_on_bed(x, y, zf, yaw), (math.radians(90), 0, yaw))
    linear(veh); linear(arm)
    for o in wheels.values():
        linear(o)

    # ---- caméras (toujours tournées vers l'intérieur de la carte : le camp est au coin sud-ouest, on ne montre jamais le bord du monde)
    hz = lambda x, y, h: (x, y, ground(x, y) + h)
    hero_p = (hero_start[0], hero_start[1], ground(*hero_start))
    # plan 1 : plan large du camp à l'aube, vu du sud-ouest, lente avancée
    c1a = lift_view(hz(-205, -195, 3.2), hz(-182, -172, 2.0)); c1b = lift_view(hz(-196, -186, 2.4), hz(-182, -172, 2.0))
    make_cam("C1_aube", 30, S[1][0], c1a, hz(-182, -172, 2.2), c1b, hz(-182, -172, 2.0), S[1][1])
    # plan 2 : gros plan du héros, face à la caméra (sud-ouest), lente avancée sur le visage
    make_cam("C2_heros", 65, S[2][0], (hero_start[0] - 2.4, hero_start[1] - 1.1, hero_p[2] + 1.62), (hero_start[0], hero_start[1], hero_p[2] + 1.6),
             (hero_start[0] - 1.6, hero_start[1] - 0.75, hero_p[2] + 1.6), (hero_start[0], hero_start[1], hero_p[2] + 1.58), S[2][1], fstop=2.2, focus=2.5)
    # plan 3 : travelling latéral depuis le sud : la caméra accompagne le héros qui court de droite à gauche vers le véhicule
    def hero_xy(f):
        t = (f - S[3][0]) / (S[3][1] - S[3][0])
        return hero_start[0] + (side_x - hero_start[0]) * t, hero_start[1] + 0.6 * t
    def c3(f):
        hx, hy = hero_xy(f)
        return (hx + 6.5, hy - 6.0, ground(hx + 6.5, hy - 6.0) + 1.25), (hx - 3.0, hy, ground(hx, hy) + 1.15)
    track_cam("C3_course", 32, S[3][0], S[3][1], c3)
    # plan 4 : poursuite basse depuis le côté nord-ouest du trajet : la caméra accompagne le véhicule (le décor défile)
    def c4(f):
        _, x, y, z, yaw = drive_s[max(S[4][0], min(S[4][1], f))]
        u = (f - S[4][0]) / (S[4][1] - S[4][0])
        ox, oy = -8.0 + 6.0 * u, 10.5 - 1.5 * u                         # le véhicule passe peu à peu de la droite vers le centre du cadre
        pos = (x + ox, y + oy, ground(x + ox, y + oy) + 1.4)
        tgt = (x, y, z + 1.4)
        return lift_view(pos, tgt), tgt
    track_cam("C4_vehicule", 32, S[4][0], S[4][1], c4)
    # plan 5 : derrière le véhicule qui file vers le fort au loin : la caméra est alignée sur la direction du fort, le véhicule traverse le cadre
    fort = (-150, 150, ground(-150, 150) + 16)
    def cam5(f):
        x, y, yaw = pos_on_path((f - S[4][0]) * speed / FPS)
        dx, dy = fort[0] - x, fort[1] - y; n = math.hypot(dx, dy); dx, dy = dx / n, dy / n
        px, py = -dy, dx                                                    # perpendiculaire (à gauche)
        pos = (x - dx * 17 + px * 3.0, y - dy * 17 + py * 3.0); pos = (pos[0], pos[1], ground(*pos) + 3.0)
        tgt = (x + dx * 30, y + dy * 30, ground(x + dx * 30, y + dy * 30) + 6.0)
        return pos, tgt
    pa, ta = cam5(S[5][0]); pb, tb = cam5(S[5][1])
    make_cam("C5_fort", 38, S[5][0], pa, ta, pb, tb, S[5][1])
    return arm, veh


def render_frames(frames, preview):
    for f in frames:
        sc.frame_set(f)
        sc.render.filepath = os.path.join(OUT, f"f_{f:04d}.png")
        bpy.ops.render.render(write_still=True)
        log("rendu", f)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    build()
    if "INTRO_FRAMES" in os.environ:
        render_frames([int(x) for x in os.environ["INTRO_FRAMES"].split(",")], True)
    else:
        a, b = [int(x) for x in os.environ.get("INTRO_RANGE", "1,396").split(",")]
        render_frames(range(a, b + 1), False)
    log("TERMINÉ")
