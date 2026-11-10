"""Intro 2 de Sahel Game (45 s, très nerveuse) : l'histoire d'Ir Ganda (la base attaquée, Artex, les frappes, le communiqué, le palais).
Construit les plans dans une COPIE en mémoire de sahel_desert.blend (jamais enregistrée) puis rend des images. À lancer en arrière-plan :
    blender -b assets/sahel_desert.blend --python tools/blender/s42_intro2.py
Variables : INTRO_FRAMES="1,100" (contrôle, 640 x 360) ; INTRO_RANGE="1,1080" (rendu, saute les images déjà rendues) ; INTRO_OUT=dossier.
Personnages (squelette du jeu dupliqué, peaux mélangées) : armée d'Ir Ganda = treillis gris uni, gilet noir (ni camouflage, ni wax, sans drapeau) ;
Artex = tenue noire « ARTE-X » ; milice = tenue de milicien du désert. Le héros (noir) est un soldat de l'armée.
Les plans (24 i/s) sont décrits dans SHOTS ; le texte, les éclairs blancs et le titre sont ajoutés ensuite par intro2_post.py."""
import json, math, os, random, sys
import bpy, bmesh
from mathutils import Vector, Euler
import importlib.util

PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
OUT = os.environ.get("INTRO_OUT", os.path.join(PROJ, "assets", "intro2", "frames"))
os.makedirs(OUT, exist_ok=True)
os.environ["INTRO_OUT"] = OUT
_spec = importlib.util.spec_from_file_location("s40", os.path.join(PROJ, "tools", "blender", "s40_intro.py"))
S40 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(S40)          # outils communs : sol, vues dégagées, caméras
ground, lift_view, face, key_obj, linear, set_clip, los_clear = S40.ground, S40.lift_view, S40.face, S40.key_obj, S40.linear, S40.set_clip, S40.los_clear
sc = S40.sc
log = S40.log
FPS = 24
TOTAL = 1080
RND = random.Random(42)
FLASH = {}                        # image -> intensité (0..1) d'éclair blanc ajouté en post-production
SKINS = ["noire", "metisse", "blanche"]

# ------------------------------------------------------------------ plans : (début, fin)
SHOTS = {
    "A": (1, 72), "B": (73, 144), "C": (145, 216), "D": (217, 288), "E": (289, 360), "F": (361, 456), "G": (457, 528),
    "H": (529, 624), "I": (625, 744), "J": (745, 840), "K": (841, 936), "L": (937, 1032), "M": (1033, 1080),
}
FORT = (-150.0, 170.0)
PALAIS = (140.0, 150.0)

# ------------------------------------------------------------------ outils d'effets
_mats = {}


def emission_mat(name, color, strength):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0, 0, 0, 1)
    b.inputs["Emission Color"].default_value = (*color, 1)
    b.inputs["Emission Strength"].default_value = strength
    _mats[name] = m
    return m


def matte_mat(name, color, rough=1.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    _mats[name] = m
    return m


_mesh_cache = {}


def sphere_mesh():
    if "sph" not in _mesh_cache:
        me = bpy.data.meshes.new("fx_sph"); bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0); bm.to_mesh(me); bm.free()
        for p in me.polygons:
            p.use_smooth = True
        _mesh_cache["sph"] = me
    return _mesh_cache["sph"]


def cone_mesh():
    if "cone" not in _mesh_cache:
        me = bpy.data.meshes.new("fx_cone"); bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=7, radius1=0.5, radius2=0.0, depth=1.0); bm.to_mesh(me); bm.free()
        for p in me.polygons:
            p.use_smooth = True
        _mesh_cache["cone"] = me
    return _mesh_cache["cone"]


FX = bpy.data.collections.new("FX_Intro"); sc.collection.children.link(FX)
ACT = bpy.data.collections.new("Acteurs_Intro"); sc.collection.children.link(ACT)


def set_obj_material(o, mat):
    """Matériau propre à l'objet (les maillages d'effets sont partagés : un matériau posé sur le maillage serait celui de TOUS les objets)."""
    if not o.data.materials:
        o.data.materials.append(None)
    o.material_slots[0].link = "OBJECT"
    o.material_slots[0].material = mat


def fx_obj(name, mesh, mat, loc=(0, 0, 0), scale=1.0):
    o = bpy.data.objects.new(name, mesh); set_obj_material(o, mat)
    FX.objects.link(o); o.location = loc
    s = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    o.scale = s
    return o


def key_scale(o, f, s):
    o.scale = s if isinstance(s, (tuple, list)) else (s, s, s)
    o.keyframe_insert("scale", frame=f)


def point_light(name, loc, color=(1, 0.6, 0.3), energy=0.0, radius=0.4):
    ld = bpy.data.lights.new(name, "POINT"); ld.color = color; ld.energy = energy; ld.shadow_soft_size = radius
    lo = bpy.data.objects.new(name, ld); FX.objects.link(lo); lo.location = loc
    return lo


def explosion(pos, f, radius=4.0, smoke=True, flash=0.7):
    """Boule de feu (apparition vive, puis disparition), onde de poussière, fumée qui monte, éclair de lumière."""
    x, y, z = pos
    hot = fx_obj(f"expl_chaud_{f}", sphere_mesh(), emission_mat("fx_chaud", (1.0, 0.82, 0.45), 90.0), pos, 0.01)
    fire = fx_obj(f"expl_feu_{f}", sphere_mesh(), emission_mat("fx_feu", (1.0, 0.38, 0.06), 26.0), pos, 0.01)
    for o, k in ((hot, 0.7), (fire, 1.0)):
        key_scale(o, f - 1, 0.01); key_scale(o, f, radius * 0.25 * k); key_scale(o, f + 3, radius * 0.95 * k)
        key_scale(o, f + 9, radius * (1.15 if o is fire else 0.55) * k); key_scale(o, f + 16, 0.01)
    radius_s = min(radius, 6.5)                                     # la fumée d'une très grosse explosion reste raisonnable (elle cachait le décor)
    if smoke:
        for i in range(5):
            sm = fx_obj(f"expl_fumee_{f}_{i}", sphere_mesh(), matte_mat("fx_fumee", (0.16, 0.15, 0.14), 1.0), (x, y, z), 0.01)
            ox, oy = RND.uniform(-1, 1) * radius * 0.4, RND.uniform(-1, 1) * radius * 0.4
            t0 = f + 2 + i * 3
            for ff, (dz, k) in ((t0 - 1, (0.2, 0.01)), (t0, (radius_s * 0.3, radius_s * 0.45)), (t0 + 40, (radius_s * 1.9 + i * 0.4 + radius * 0.5, radius_s * 0.95)), (t0 + 110, (radius_s * 3.8 + i * 0.8 + radius * 1.2, radius_s * 1.45)), (t0 + 111, (radius_s * 3.8, 0.01))):
                loc = (x + ox + (ff - t0) * 0.02, y + oy, z + dz)
                key_obj(sm, ff, loc); key_scale(sm, ff, (k, k, k * 1.25))
    pl = point_light(f"expl_lum_{f}", (x, y, z + radius * 0.6), (1.0, 0.62, 0.3), 0.0, radius * 0.5)
    for ff, e in ((f - 1, 0.0), (f, 4.0e5 * radius), (f + 6, 1.2e5 * radius), (f + 22, 0.0)):
        pl.data.energy = e; pl.data.keyframe_insert("energy", frame=ff)
    for dd, k in ((0, flash), (1, flash * 0.7), (2, flash * 0.45), (3, flash * 0.25)):
        FLASH[f + dd] = max(FLASH.get(f + dd, 0.0), k)


def fire_column(pos, f0, f1, size=2.0, smoke=True):
    """Flammes qui vacillent (quelques cônes) + panache de fumée continue."""
    x, y, z = pos
    cones = []
    for i in range(5):
        o = fx_obj(f"flamme_{f0}_{i}_{int(x)}", cone_mesh(), emission_mat("fx_flamme", (1.0, 0.13, 0.01), 1.9), (x + RND.uniform(-1, 1) * size * 0.5, y + RND.uniform(-1, 1) * size * 0.5, z + size * 0.5), 0.01)
        cones.append(o)
    for f in range(f0, f1 + 1, 2):
        for i, o in enumerate(cones):
            h = size * RND.uniform(1.2, 2.3) * (1.0 if i else 1.3)
            o.location = (x + math.sin(i * 1.3 + f * 0.2) * size * 0.35, y + math.cos(i * 1.7 + f * 0.17) * size * 0.35, z + h * 0.5)
            key_obj(o, f, o.location); key_scale(o, f, (size * RND.uniform(0.35, 0.65), size * RND.uniform(0.35, 0.65), h))
    for o in cones:
        key_scale(o, f0 - 1, 0.01); key_scale(o, f1 + 1, 0.01)
    pl = point_light(f"feu_lum_{f0}_{int(x)}", (x, y, z + size), (1.0, 0.5, 0.2), 0.0, size * 0.5)
    for f in range(f0, f1 + 1, 3):
        pl.data.energy = RND.uniform(0.6, 1.0) * 9.0e3 * size; pl.data.keyframe_insert("energy", frame=f)
    pl.data.energy = 0; pl.data.keyframe_insert("energy", frame=f1 + 1); pl.data.keyframe_insert("energy", frame=f0 - 1)
    if smoke:
        for f in range(f0, f1 + 1, 6):
            sm = fx_obj(f"fumee_{f}_{int(x)}_{int(y)}", sphere_mesh(), matte_mat("fx_fumee", (0.16, 0.15, 0.14), 1.0), (x, y, z), 0.01)
            life = 100
            for ff, (dz, s, dx) in ((f - 1, (size * 1.0, 0.01, 0)), (f, (size * 1.2, size * 0.7, 0)), (f + life * 0.5, (size * 2.4 + 3.5, size * 0.75, 2)), (f + life, (size * 4.0 + 8, size * 1.2, 5)), (f + life + 1, (size * 4, 0.01, 5))):
                key_obj(sm, int(ff), (x + dx * 0.6, y + dx * 0.25, z + dz)); key_scale(sm, int(ff), s)


def muzzle_flicker(muzzle_obj, f0, f1, density=0.55, size=0.12, power=1800.0):
    """Éclairs de bouche : une petite sphère lumineuse et une lampe, allumées au hasard sur les images f0..f1."""
    sp = fx_obj(f"eclair_{muzzle_obj.name}_{f0}", sphere_mesh(), emission_mat("fx_bouche", (1.0, 0.75, 0.35), 120.0), (0, 0, 0), 0.0001)
    sp.parent = muzzle_obj
    ld = point_light(f"eclair_lum_{f0}", (0, 0, 0), (1.0, 0.7, 0.35), 0.0, 0.1); ld.parent = muzzle_obj
    key_scale(sp, f0 - 1, 0.0001); ld.data.energy = 0; ld.data.keyframe_insert("energy", frame=f0 - 1)
    for f in range(f0, f1 + 1):
        on = RND.random() < density
        key_scale(sp, f, size * RND.uniform(0.7, 1.4) if on else 0.0001)
        ld.data.energy = power * RND.uniform(0.7, 1.3) if on else 0.0; ld.data.keyframe_insert("energy", frame=f)
    key_scale(sp, f1 + 1, 0.0001); ld.data.energy = 0; ld.data.keyframe_insert("energy", frame=f1 + 1)


def shake_amp(f, shots):
    """Tremblement de caméra à la main : amplitude par plan (dict plan -> m)."""
    for k, (a, b) in SHOTS.items():
        if a <= f <= b:
            return shots.get(k, 0.0)
    return 0.0


def noise3(f, seed, amp):
    r = random.Random(seed)
    ph = [r.uniform(0, 6.28) for _ in range(6)]
    return Vector((amp * (math.sin(f * 0.9 + ph[0]) + 0.5 * math.sin(f * 2.3 + ph[1])), amp * (math.sin(f * 1.1 + ph[2]) + 0.5 * math.sin(f * 2.9 + ph[3])),
                   amp * 0.7 * (math.sin(f * 1.3 + ph[4]) + 0.5 * math.sin(f * 3.1 + ph[5]))))


# ------------------------------------------------------------------ personnages
SRC_ARM = bpy.data.objects["Armature"]
SRC_BODY = bpy.data.objects["Body"]
_skin_mats = {}
_gray = {}


def load_img(path, colorspace="sRGB"):
    im = bpy.data.images.load(path, check_existing=True); im.colorspace_settings.name = colorspace
    return im


def skin_material(skin):
    if skin not in _skin_mats:
        base = bpy.data.materials["Ch12_body"]
        m = base.copy(); m.name = f"Peau_{skin}"
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and n.image.colorspace_settings.name != "Non-Color":
                n.image = load_img(os.path.join(PROJ, "client", "assets", "skins", f"peau_{skin}.webp"))
                n.image.alpha_mode = "STRAIGHT"
        _skin_mats[skin] = m
    return _skin_mats[skin]


def army_shirt_material():
    if "m" not in _gray:
        base = bpy.data.materials["U_Camo"]
        m = base.copy(); m.name = "U_Camo_Armee"
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and n.image.name.startswith("tissu_noir_grand"):
                n.image = load_img(os.path.join(PROJ, "assets", "textures", "uniformes", "tissu_gris.png"))
        _gray["m"] = m
    return _gray["m"]


def pieces_of(kind):
    mil = [o for o in bpy.data.collections["Tenue_Militaire"].objects if o.type == "MESH"]
    if kind == "artex":
        return mil
    if kind == "armee":
        return [o for o in mil if o.name != "U_Texte_ARTE-X"]
    return [o for o in bpy.data.collections["Tenue_PNJ"].objects if o.type == "MESH"]          # milice


class Actor:
    def __init__(self, arm, objs, rifle):
        self.arm, self.objs, self.rifle = arm, objs, rifle


def spawn(kind, skin, name, with_rifle=True):
    """Duplique le personnage du jeu (même squelette, mêmes animations) avec sa tenue et sa peau. Les maillages sont partagés (léger)."""
    arm = SRC_ARM.copy(); arm.name = f"{name}_arm"; ACT.objects.link(arm)
    arm.animation_data_clear(); arm.hide_render = False; arm.hide_viewport = False
    objs = []

    def clone(o, parent=None):
        n = o.copy(); n.name = f"{name}_{o.name}"; ACT.objects.link(n)
        n.parent = parent or arm; n.parent_type = o.parent_type; n.parent_bone = o.parent_bone
        n.matrix_parent_inverse = o.matrix_parent_inverse.copy()
        for md in n.modifiers:
            if md.type == "ARMATURE":
                md.object = arm
        n.hide_render = False; n.hide_viewport = False
        objs.append(n)
        return n

    body = clone(SRC_BODY)
    body.material_slots[0].link = "OBJECT"; body.material_slots[0].material = skin_material(skin)
    for o in pieces_of(kind):
        n = clone(o)
        if kind == "armee":
            for sl in n.material_slots:
                if sl.material and sl.material.name == "U_Camo":
                    sl.link = "OBJECT"; sl.material = army_shirt_material()
    rifle = None
    if with_rifle:
        rifle = clone(bpy.data.objects["Rifle"])
        mag = bpy.data.objects.get("Rifle_Mag")
        if mag:
            clone(mag)
        mz = bpy.data.objects.get("Muzzle")
        if mz:
            mzc = mz.copy(); mzc.name = f"{name}_Muzzle"; ACT.objects.link(mzc); mzc.parent = rifle
            mzc.matrix_parent_inverse = mz.matrix_parent_inverse.copy(); objs.append(mzc)
            rifle["muzzle_name"] = mzc.name
    arm.rotation_euler = (math.radians(90), 0, 0)
    arm.data.pose_position = "POSE"
    return Actor(arm, objs, rifle)


def visible(actor, windows):
    """Le personnage n'existe à l'écran que pendant les fenêtres [(début, fin), ...] (images)."""
    if isinstance(windows, tuple):
        windows = [windows]
    ev = []                                                        # (image, caché ?)
    ev.append((1, windows[0][0] > 1))
    for a_, b_ in windows:
        ev.append((a_, False)); ev.append((b_ + 1, True))
    seen = {}
    for f, h in ev:
        seen[f] = h
    for o in [actor.arm] + actor.objs:
        for f in sorted(seen):
            o.hide_render = seen[f]; o.keyframe_insert("hide_render", frame=f)


def foot_ground(x, y):
    """Sol sous les pieds : le point le plus haut de l'empreinte (rayon 30 cm) moins 3 cm, pour que les pieds ne s'enfoncent pas dans la pente d'une dune."""
    return max(ground(x, y), ground(x + 0.3, y), ground(x - 0.3, y), ground(x, y + 0.3), ground(x, y - 0.3)) - 0.03


def actor_pos(actor, f):
    """Position (x, y, z) du personnage à l'image f, d'après les points posés par keys() (interpolation linéaire)."""
    pts = actor.path
    if f <= pts[0][0]:
        return pts[0][1:4]
    for a, b in zip(pts, pts[1:]):
        if a[0] <= f <= b[0]:
            u = (f - a[0]) / max(1, b[0] - a[0])
            return tuple(a[i] + (b[i] - a[i]) * u for i in (1, 2, 3))
    return pts[-1][1:4]


def keys(actor, pts):
    """pts : [(image, x, y, cap)] ; cap = None -> direction du déplacement vers le point suivant ; (cap en radians sinon). Interpolation linéaire."""
    prev = None
    rec = []
    for i, (f, x, y, yaw) in enumerate(pts):
        if yaw is None:
            yaw = prev if prev is not None else 0.0
            for (_, nx, ny, _) in pts[i + 1:]:
                if abs(nx - x) + abs(ny - y) > 1e-3:
                    yaw = face(nx - x, ny - y); break
        if prev is not None:
            while yaw - prev > math.pi: yaw -= 2 * math.pi
            while yaw - prev < -math.pi: yaw += 2 * math.pi
        prev = yaw
        key_obj(actor.arm, f, (x, y, foot_ground(x, y)), (math.radians(90), 0, yaw))
        rec.append((f, x, y, foot_ground(x, y)))
    actor.path = rec
    linear(actor.arm)


def clips_for(actor, segments):
    """Pistes NLA : une par segment (action, début, fin, vitesse) ; les pistes hautes l'emportent. « Death » est joué une fois puis maintenu au sol."""
    ad = actor.arm.animation_data_create()                          # (on garde l'action des positions : elle porte les déplacements)
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for i, seg in enumerate(segments):
        name, f0, f1, speed = seg[:4]
        phase = seg[4] if len(seg) > 4 else 0.0                       # décalage dans l'animation (images) pour que deux personnages ne soient pas synchrones
        act = bpy.data.actions[name]
        tr = ad.nla_tracks.new(); tr.name = f"{i}_{name}"
        st = tr.strips.new(name, int(f0 - phase), act)
        st.scale = 1.0 / speed
        length = (act.frame_range[1] - act.frame_range[0]) * st.scale
        if "Death" in name:
            st.repeat = 1.0; st.extrapolation = "HOLD_FORWARD"
        else:
            st.repeat = max(1.0, (f1 - f0 + 1 + phase) / max(1e-6, length)); st.extrapolation = "NOTHING"
        st.blend_in = 0; st.blend_out = 0


def place(actor, path, clips, yaw_extra=0.0, smooth=0.35):
    """path : [(image, x, y)] (interpolation linéaire, le personnage regarde dans le sens de la marche) ; clips : [(action, début, fin, vitesse)]."""
    clips_for(actor, clips)
    last_yaw = None
    for i, (f, x, y) in enumerate(path):
        if i + 1 < len(path):
            nf, nx, ny = path[i + 1][0], path[i + 1][1], path[i + 1][2]
            dx, dy = nx - x, ny - y
        else:
            dx, dy = last_dir
        if abs(dx) + abs(dy) > 1e-4:
            yaw = face(dx, dy); last_dir = (dx, dy)
        else:
            yaw = last_yaw if last_yaw is not None else 0.0
        if last_yaw is not None:                                    # évite les tours de 360° au passage de ±pi
            while yaw - last_yaw > math.pi: yaw -= 2 * math.pi
            while yaw - last_yaw < -math.pi: yaw += 2 * math.pi
        last_yaw = yaw
        key_obj(actor.arm, f, (x, y, ground(x, y)), (math.radians(90), 0, yaw + yaw_extra))
    linear(actor.arm)


def hold(actor, x, y, yaw, f0, f1, clips):
    """Reste en place (cap fixe)."""
    clips_for(actor, clips)
    z = ground(x, y)
    key_obj(actor.arm, f0, (x, y, z), (math.radians(90), 0, yaw)); key_obj(actor.arm, f1, (x, y, z), (math.radians(90), 0, yaw))


def muzzle_of(actor):
    n = actor.rifle["muzzle_name"] if actor.rifle and "muzzle_name" in actor.rifle.keys() else None
    return bpy.data.objects.get(n) if n else None


# ------------------------------------------------------------------ caméras
def cam_track(name, lens, f0, f1, fn, amp=0.0, every=2, fstop=None, focus=None):
    """Caméra pilotée image par image : fn(f) -> (position, cible) ; tremblement `amp` en mètres (caméra à l'épaule)."""
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_width = 36.0; cd.clip_end = 4000
    if fstop:
        cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
        if focus:
            cd.dof.focus_distance = focus
    co = bpy.data.objects.new(name, cd); sc.collection.objects.link(co)
    seed = abs(hash(name)) % 1000
    frames = list(range(f0, f1 + 1, every))
    if frames[-1] != f1:
        frames.append(f1)
    for f in frames:
        loc, tgt = fn(f)
        loc = Vector(loc) + (noise3(f, seed, amp) if amp else Vector())
        tgt = Vector(tgt) + (noise3(f, seed + 7, amp * 0.6) if amp else Vector())
        co.location = loc
        co.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
        co.keyframe_insert("location", frame=f); co.keyframe_insert("rotation_euler", frame=f)
    linear(co)
    m = sc.timeline_markers.new(name, frame=f0); m.camera = co
    return co


def lerp3(a, b, u):
    return tuple(a[i] + (b[i] - a[i]) * u for i in range(3))


def lerp_cam(f0, f1, a, ta, b, tb, ease=False):
    def fn(f):
        u = (f - f0) / max(1, (f1 - f0))
        if ease:
            u = u * u * (3 - 2 * u)
        return lerp3(a, b, u), lerp3(ta, tb, u)
    return fn


def gz(x, y, h=0.0):
    return ground(x, y) + h


# ------------------------------------------------------------------ éléments de décor et d'effets
def drone(name, f0, f1, a, b, size=1.0, bank=0.25):
    """Petit drone armé (corps, quatre bras, quatre rotors sombres) qui traverse le ciel de a à b."""
    me = bpy.data.meshes.get("fx_drone")
    if me is None:
        me = bpy.data.meshes.new("fx_drone"); bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(1.4, 0.55, 0.22), verts=bm.verts)
        for sx in (-1, 1):
            for sy in (-1, 1):
                r = bmesh.ops.create_cube(bm, size=0.18)
                bmesh.ops.translate(bm, vec=(sx * 0.85, sy * 0.55, 0.0), verts=r["verts"])
                d = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.42, radius2=0.42, depth=0.02)
                bmesh.ops.translate(bm, vec=(sx * 0.85, sy * 0.55, 0.16), verts=d["verts"])
        bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); FX.objects.link(o)
    o.data.materials.clear(); o.data.materials.append(matte_mat("fx_drone_m", (0.03, 0.03, 0.035), 0.5))
    o.scale = (size * 1.4, size * 1.4, size * 1.4)
    for f in (f0, f1):
        u = (f - f0) / max(1, f1 - f0)
        o.location = lerp3(a, b, u)
        d = Vector(b) - Vector(a)
        o.rotation_euler = (math.radians(8), bank, math.atan2(d.y, d.x))
        key_obj(o, f, o.location, o.rotation_euler)
    key_scale(o, f0 - 1, 0.0001); key_scale(o, f0, size * 1.4); key_scale(o, f1, size * 1.4); key_scale(o, f1 + 1, 0.0001)
    linear(o)
    return o


def flag(name, pos, yaw, width, f0, f1, mast=True, mast_h=None):
    """Drapeau d'Artex (renard fennec blanc sur noir) qui flotte : plan subdivisé + déformation « onde » animée, avec son mât."""
    me = bpy.data.meshes.new(name + "_me"); bm = bmesh.new()
    nx, ny = 30, 20; hgt = width * 853 / 1280
    verts = [[bm.verts.new((i / nx * width, 0, -j / ny * hgt)) for j in range(ny + 1)] for i in range(nx + 1)]
    uvl = bm.loops.layers.uv.new("UVMap")
    for i in range(nx):
        for j in range(ny):
            f = bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]))
            for lp, (iu, jv) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lp[uvl].uv = (iu / nx, 1 - jv / ny)
            f.smooth = True
    bm.to_mesh(me); bm.free()
    m = bpy.data.materials.new(name + "_m"); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    tex = m.node_tree.nodes.new("ShaderNodeTexImage"); tex.image = load_img(os.path.join(PROJ, "assets", "intro", "drapeau_artex.png"))
    m.node_tree.links.new(tex.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.75
    try:
        m.surface_render_method = "DITHERED"; m.use_backface_culling = False
    except Exception:
        pass
    me.materials.append(m)
    o = bpy.data.objects.new(name, me); FX.objects.link(o)
    o.location = pos; o.rotation_euler = (0, 0, yaw)
    w = o.modifiers.new("onde", "WAVE")                         # le modificateur « onde » avance tout seul avec la ligne de temps
    w.use_x = True; w.use_y = False; w.use_cyclic = False; w.use_normal = True
    w.use_normal_x = False; w.use_normal_y = True; w.use_normal_z = False       # le drapeau est dans le plan XZ : il ondule le long de Y
    w.height = width * 0.07; w.width = 1.5; w.narrowness = 3.0; w.speed = 0.3
    w.start_position_x = 0.0; w.falloff_radius = width * 1.2
    w.time_offset = 0.0
    if mast:
        h = mast_h or (width * 0.8)
        cm = bpy.data.meshes.get("fx_mat")
        if cm is None:
            cm = bpy.data.meshes.new("fx_mat"); bm2 = bmesh.new()
            bmesh.ops.create_cone(bm2, cap_ends=True, segments=8, radius1=0.045, radius2=0.03, depth=1.0)
            bmesh.ops.translate(bm2, vec=(0, 0, 0.5), verts=bm2.verts); bm2.to_mesh(cm); bm2.free()
        po = bpy.data.objects.new(name + "_mat", cm); FX.objects.link(po)
        po.data.materials.clear(); po.data.materials.append(matte_mat("fx_mat_m", (0.25, 0.22, 0.2), 0.6))
        po.location = (pos[0], pos[1], pos[2] - hgt - 0.1); po.scale = (1, 1, hgt + h)
    return o


# ------------------------------------------------------------------ construction des plans
def vehicle_setup():
    veh = bpy.data.objects["Technique"]
    wheels = {n: bpy.data.objects[n] for n in ("V_RoueArD", "V_RoueArG", "V_RoueAvD", "V_RoueAvG") if n in bpy.data.objects}
    return veh, wheels, {n: tuple(o.rotation_euler) for n, o in wheels.items()}


def const_before(o, frame):
    """Saut instantané : les clés de position/rotation à `frame` sont maintenues (interpolation constante) jusqu'à la clé suivante."""
    ad = o.animation_data
    if not ad or not ad.action:
        return
    try:
        fcs = list(ad.action.fcurves)
    except Exception:
        fcs = [fc for layer in ad.action.layers for st in layer.strips for bag in st.channelbags for fc in bag.fcurves]
    for fc in fcs:
        for kp in fc.keyframe_points:
            if abs(kp.co.x - frame) < 0.01:
                kp.interpolation = "CONSTANT"


def hide_at(obj_name, frame):
    """L'objet disparaît à partir de `frame` (tente détruite, minaret abattu)."""
    o = bpy.data.objects.get(obj_name)
    if o:
        o.hide_render = False; o.keyframe_insert("hide_render", frame=1)
        o.hide_render = True; o.keyframe_insert("hide_render", frame=frame)


def build():
    preview = "INTRO_FRAMES" in os.environ
    S40.setup_render(preview)
    try:
        sc.eevee.taa_render_samples = 14 if preview else 40
    except Exception:
        pass
    S40.clean_scene(); S40.dawn_light(elevation_deg=11, azimuth_deg=100, strength=3.4)
    for o in [SRC_ARM] + list(SRC_ARM.children_recursive):
        o.hide_render = True
    sc.frame_start, sc.frame_end = 1, 1032
    for t in list(sc.timeline_markers):
        sc.timeline_markers.remove(t)
    fcx, fcy = FORT
    fz = ground(fcx, fcy)
    log("sol du fort", round(fz, 2), "palais", round(ground(*PALAIS), 2))

    # ---------------- personnages
    hero = spawn("armee", "noire", "hero")
    sol = [spawn("armee", SKINS[(i + 1) % 3], f"sol{i}") for i in range(4)]
    mil = [spawn("milice", SKINS[(i + 2) % 3], f"mil{i}") for i in range(7)]
    art = [spawn("artex", SKINS[(i + 1) % 3], f"art{i}") for i in range(5)]
    camp = [spawn("armee", SKINS[i % 3], f"camp{i}") for i in range(3)]
    log("personnages créés")

    # ---------------- A (1-72) : le fort à l'aube (aucun personnage visible)
    A0, A1 = SHOTS["A"]

    def cam_a(f):
        u = (f - A0) / (A1 - A0)
        x, y = -186 + 20 * u, 118 + 16 * u
        pos = (x, y, ground(x, y) + 4.5 + 8.0 * u)
        return lift_view(pos, (fcx, fcy, fz + 8)), (fcx, fcy, fz + 8.5 + 1.0 * u)
    cam_track("CA", 28, A0, A1, cam_a, amp=0.03, every=3)

    # ---------------- B (73-144) : cour du fort, gros plan du héros, soldats autour
    B0, B1 = SHOTS["B"]
    H0 = (fcx + 1.0, fcy - 11.5)
    visible(hero, [(1, 360), (745, 936)])
    keys(hero, [(1, H0[0], H0[1], face(-0.8, -0.6)), (216, H0[0], H0[1], face(-0.8, -0.6)), (225, H0[0], H0[1], face(0.0, -1.0)), (300, H0[0], H0[1], face(0.0, -1.0)),
                (312, H0[0], H0[1] + 4, None), (352, H0[0] - 9, H0[1] + 10, None),
                (745, H0[0] - 0.4, H0[1], face(-0.9, -0.4)), (840, H0[0] - 0.4, H0[1], face(-0.9, -0.4)),
                (870, H0[0] - 0.4, H0[1], face(0.2, -1.0)), (936, H0[0] + 3, H0[1] - 22, None)])
    clips_for(hero, [("Rifle Idle", 1, 216, 1.0), ("Rifle Kneel Tir", 217, 288, 1.0), ("Rifle Run Tir", 289, 360, 1.2),
                     ("Rifle Idle", 745, 870, 1.0), ("Rifle Run", 871, 936, 1.2)])
    sp = [(-9.5, -9.0), (-6.0, -7.0), (7.5, -9.0), (10.0, -5.0)]
    for i, a_ in enumerate(sol):
        visible(a_, [(1, 360), (745, 936)])
        x, y = fcx + sp[i][0], fcy + sp[i][1]
        yaw0 = face(RND.uniform(-1, 1), RND.uniform(-0.4, 0.3))
        keys(a_, [(1, x, y, yaw0), (216, x, y, yaw0), (225, x, y, face(0, -1)), (300, x, y, face(0, -1)),
                  (320, x + RND.uniform(-6, 6), y + 9, None), (356, x + RND.uniform(-9, 9), y + 16, None),
                  (745, x, y, yaw0), (936, x, y, yaw0)])
        clips_for(a_, [("Rifle Idle", 1, 216, 1.0, i * 17), ("Rifle Fire", 217, 288, 1.0, i * 9), ("Rifle Run", 289, 360, 1.2),
                       ("Rifle Idle", 745, 936, 1.0, i * 13)])

    def cam_b(f):
        u = (f - B0) / (B1 - B0)
        d = 2.4 - 0.9 * u
        return (H0[0] - 0.8 * d, H0[1] - 0.6 * d, ground(*H0) + 1.62), (H0[0], H0[1], ground(*H0) + 1.6)
    cam_track("CB", 62, B0, B1, cam_b, amp=0.01, fstop=2.0, focus=2.0, every=3)
    for nm, (g0, g1) in (("fill_B", (B0, B1)), ("fill_J", (745, 840))):
        fl_ = point_light(nm, (H0[0] - 1.8, H0[1] - 1.3, ground(*H0) + 2.0), (1.0, 0.86, 0.72), 0.0, 0.6)
        for ff, e in ((g0 - 1, 0.0), (g0, 520.0), (g1, 520.0), (g1 + 1, 0.0)):
            fl_.data.energy = e; fl_.data.keyframe_insert("energy", frame=ff)

    # ---------------- C (145-216) : la milice charge vers le mur sud
    C0, C1 = SHOTS["C"]
    for i, m_ in enumerate(mil):
        visible(m_, [(145, 528)])
        x0 = fcx - 7 + i * 2.4 + RND.uniform(-0.6, 0.6)
        y0 = fcy - 52 + RND.uniform(-3, 3)
        x1 = fcx - 7 + i * 2.4
        y1 = fcy - 27 + RND.uniform(-2.5, 2.5)
        flee_x = fcx - 62 if i % 2 == 0 else fcx + 62
        fy = fcy - 24.0 - RND.uniform(0, 5)
        keys(m_, [(C0, x0, y0, None), (C1, x1, y1, None), (C1 + 1, x1, y1, face(0, 1)), (456, x1, y1, face(0, 1)),
                  (457 + i * 2, x1, y1, face(flee_x - x1, 0)), (528, flee_x, fy, None)])
        clips_for(m_, [("Rifle Run Tir", C0, C1, 1.2, i * 3), ("Rifle Kneel Tir", C1 + 1, 456, 1.0, i * 5), ("Rifle Run", 457 + i * 2, 480 + i * 2, 1.2),
                       ("Rifle Death", 468 + i * 5, 528, 1.0)])

    def cam_c(f):                                           # la caméra court derrière la milice, le fort se dresse devant eux
        u = (f - C0) / (C1 - C0)
        yc = fcy - 52 + 24 * u
        gx = fcx + 1.5
        px_, py_ = gx - 3.0, yc - 8.0
        pos = (px_, py_, ground(px_, py_) + 2.0)
        tgt = (gx, yc + 14.0, ground(gx, yc + 14) + 3.0)
        return pos, tgt
    cam_track("CC", 26, C0, C1, cam_c, amp=0.07, every=2)
    for i, m_ in enumerate(mil[:5]):
        mz = muzzle_of(m_)
        if mz:
            muzzle_flicker(mz, C0 + 3 + i, C1, density=0.5)

    # ---------------- D (217-288) : impacts sur le mur, le héros riposte
    D0, D1 = SHOTS["D"]
    explosion((fcx + 0.5, fcy - 16.6, fz + 2.4), 222, 3.8, smoke=False)
    explosion((fcx + 9.0, fcy - 16.4, fz + 2.0), 238, 3.2, smoke=False)
    explosion((fcx - 8.5, fcy - 16.7, fz + 2.6), 256, 3.6, smoke=False)
    explosion((fcx + 2.0, fcy - 16.5, fz + 2.2), 272, 3.0, smoke=False, flash=0.5)
    fire_column((fcx + 0.5, fcy - 15.8, fz), 226, 456, 2.0)
    fire_column((fcx - 8.5, fcy - 15.8, fz), 258, 456, 1.8)
    for a_ in [hero] + sol[:3]:
        mz = muzzle_of(a_)
        if mz:
            muzzle_flicker(mz, D0, D1, density=0.6)

    def cam_d(f):
        u = (f - D0) / (D1 - D0)
        return (H0[0] - 1.6 + 0.6 * u, H0[1] + 3.8 - 1.4 * u, ground(*H0) + 1.55), (fcx - 0.5, fcy - 16, fz + 2.4)
    cam_track("CD", 27, D0, D1, cam_d, amp=0.13, every=2)

    # ---------------- E (289-360) : la base brûle, vue haute
    E0, E1 = SHOTS["E"]
    fire_column((fcx, fcy, fz + 9.2), 289, 700, 2.6)
    fire_column((fcx + 17, fcy + 17, fz + 10.2), 297, 700, 2.3)
    fire_column((fcx - 17, fcy - 17, fz + 10.2), 300, 500, 2.0)
    explosion((fcx + 17, fcy + 17, fz + 9.0), 302, 4.8)
    explosion((fcx - 17, fcy + 17, fz + 9.0), 322, 4.4)
    explosion((fcx + 4, fcy - 2, fz + 4.0), 340, 3.4, flash=0.4)

    def cam_e(f):
        u = (f - E0) / (E1 - E0)
        p = lerp3((fcx + 40, fcy + 38, 0), (fcx + 30, fcy + 22, 0), u)
        return lift_view((p[0], p[1], ground(p[0], p[1]) + 12 - 3.5 * u), (fcx, fcy, fz + 6)), (fcx - 2 * u, fcy, fz + 6.5)
    cam_track("CE", 26, E0, E1, cam_e, amp=0.08, every=3)

    # ---------------- F (361-456) : Artex arrive à toute vitesse
    F0, F1 = SHOTS["F"]
    veh, wheels, wheel0 = vehicle_setup()
    vpath = [(-198, 66), (-188, 86), (-175, 106), (-160, 122), (-153, 128)]
    seg = [0.0]
    for a_, b_ in zip(vpath, vpath[1:]):
        seg.append(seg[-1] + math.hypot(b_[0] - a_[0], b_[1] - a_[1]))
    tot = seg[-1]

    def vpos(s_):
        s_ = max(0.0, min(tot, s_))
        for i in range(len(seg) - 1):
            if s_ <= seg[i + 1]:
                u = (s_ - seg[i]) / (seg[i + 1] - seg[i])
                p, q = vpath[i], vpath[i + 1]
                return p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, math.atan2(q[0] - p[0], -(q[1] - p[1]))
        p, q = vpath[-2], vpath[-1]
        return q[0], q[1], math.atan2(q[0] - p[0], -(q[1] - p[1]))

    def vspeed(f):                                          # 15,5 m/s puis le véhicule freine (les fantassins le rattrapent)
        return 15.5 if f < F0 + 52 else max(5.5, 15.5 - (f - F0 - 52) * 0.22)
    sdist = {}
    s_acc = 0.0
    for f in range(F0, F1 + 1):
        sdist[f] = s_acc
        s_acc += vspeed(f) / FPS
    key_obj(veh, 1, (0, -300, 0), (0, 0, 0))
    key_obj(veh, F0 - 1, (0, -300, 0), (0, 0, 0))
    L = 3.2
    for f in range(F0, F1 + 1):
        x, y, yaw = vpos(sdist[f])
        fx_, fy_ = x + math.sin(yaw) * L / 2, y - math.cos(yaw) * L / 2
        bx_, by_ = x - math.sin(yaw) * L / 2, y + math.cos(yaw) * L / 2
        zf, zb = ground(fx_, fy_), ground(bx_, by_)
        z = (zf + zb) / 2 + 0.035 * math.sin(f * 1.7) + 0.02 * math.sin(f * 3.1)
        key_obj(veh, f, (x, y, z), (-math.atan2(zf - zb, L), 0, yaw))
        for n, o in wheels.items():
            key_obj(o, f, None, (wheel0[n][0] + sdist[f] / 0.38, wheel0[n][1], wheel0[n][2]))
    key_obj(veh, F1 + 1, (0, -300, 0), (0, 0, 0))
    key_obj(veh, 1060, (0, -300, 0), (0, 0, 0))
    linear(veh)
    const_before(veh, F0 - 1)
    const_before(veh, F1)
    for o in wheels.values():
        linear(o)
    vstate = {f: vpos(sdist[f]) for f in range(F0, F1 + 1)}

    # un tireur d'Artex sur le plateau
    visible(art[0], [(F0, F1)])
    clips_for(art[0], [("Rifle Aim", F0, F1, 1.0)])
    for f in range(F0, F1 + 1):
        x, y, yaw = vstate[f]
        back = (-math.sin(yaw), math.cos(yaw))
        left = (-math.cos(yaw), -math.sin(yaw))
        key_obj(art[0].arm, f, (x + back[0] * 0.85 + left[0] * 0.15, y + back[1] * 0.85 + left[1] * 0.15, ground(x, y) + 1.02 + 0.035 * math.sin(f * 1.7)),
                (math.radians(90), 0, yaw))
    linear(art[0].arm)
    # trois fantassins d'Artex courent derrière le véhicule, puis s'arrêtent au sud du mur ; plus tard ils entourent le drapeau
    for i in range(1, 4):
        visible(art[i], [(F0 + 30, 528), (625, 744)])
        pts = []
        for f in range(F0 + 30, F1 + 1, 4):
            x, y, yaw = vstate[f]
            pts.append((f, x - math.sin(yaw) * (9 + i * 3) + math.cos(yaw) * (i - 2) * 3.0, y + math.cos(yaw) * (9 + i * 3) + math.sin(yaw) * (i - 2) * 3.0, yaw))
        ex, ey, yaw_run = pts[-1][1], pts[-1][2], pts[-1][3]
        stop = (ex + math.sin(yaw_run) * 4.0, ey - math.cos(yaw_run) * 4.0)
        pts.append((F1 + 14, stop[0], stop[1], yaw_run))
        fx_ = -34 + (i - 2) * 2.4
        fy_ = 8 + abs(i - 2) * 1.2
        keys(art[i], pts + [(528, stop[0], stop[1], face(0, 1)), (625, fx_, fy_, face(0.9, -0.4)), (744, fx_, fy_, face(0.9, -0.4))])
        clips_for(art[i], [("Rifle Run Tir", F0 + 30, F1 + 14, 1.2, i * 5), ("Rifle Fire", F1 + 15, 528, 1.0, i * 7), ("Rifle Idle", 625, 744, 1.0, i * 11)])
        mz = muzzle_of(art[i])
        if mz:
            muzzle_flicker(mz, F0 + 30, F1 + 14, density=0.45)
    # le drapeau d'Artex flotte sur le véhicule
    fl = flag("flag_veh", (0, -300, 0), 0.0, 1.5, F0, F1, mast=False)
    for f in range(F0, F1 + 1):
        x, y, yaw = vstate[f]
        key_obj(fl, f, (x, y, ground(x, y) + 2.9), (0, 0, yaw + math.pi / 2))
    linear(fl)
    key_scale(fl, F0 - 1, 0.0001)
    key_scale(fl, F0, 1.0)
    key_scale(fl, F1 + 1, 0.0001)

    def cam_f1(f):
        x, y, yaw = vstate[f]
        fw = (math.sin(yaw), -math.cos(yaw))
        lf = (-math.cos(yaw), -math.sin(yaw))
        u = (f - F0) / 48.0
        px_, py_ = x + fw[0] * 8.5 + lf[0] * 4.2, y + fw[1] * 8.5 + lf[1] * 4.2
        return (px_, py_, ground(px_, py_) + 0.9 + 0.6 * u), (x, y, ground(x, y) + 1.5)
    cam_track("CF1", 30, F0, F0 + 47, cam_f1, amp=0.1, every=2)

    def cam_f2(f):
        x, y, yaw = vstate[f]
        fw = (math.sin(yaw), -math.cos(yaw))
        lf = (-math.cos(yaw), -math.sin(yaw))
        px_, py_ = x - fw[0] * 11 - lf[0] * 1.5, y - fw[1] * 11 - lf[1] * 1.5
        tgt = (x + fw[0] * 10, y + fw[1] * 10, ground(x, y) + 2.6)
        return lift_view((px_, py_, ground(px_, py_) + 1.7), tgt), tgt
    cam_track("CF2", 32, F0 + 48, F1, cam_f2, amp=0.1, every=2)

    # ---------------- G (457-528) : Artex élimine la milice
    G0, G1 = SHOTS["G"]
    for i in range(1, 4):
        mz = muzzle_of(art[i])
        if mz:
            muzzle_flicker(mz, G0, G1 - 8, density=0.55)
    explosion((fcx - 6, fcy - 29, ground(fcx - 6, fcy - 29) + 1.2), 482, 3.4, flash=0.45)
    explosion((fcx + 8, fcy - 27, ground(fcx + 8, fcy - 27) + 1.2), 500, 3.0, flash=0.4)

    def cam_g(f):
        u = (f - G0) / (G1 - G0)
        ex, ey, yaw = vstate[F1]
        cx_, cy_ = ex - math.sin(yaw) * 9 + 0.0, ey + math.cos(yaw) * 9
        pos = (cx_ - 2.5 + 1.0 * u, cy_ - 7.5 + 2.0 * u)
        tgt = (cx_ + 1, cy_ + 14, ground(cx_, cy_ + 14) + 1.3)
        return lift_view((pos[0], pos[1], ground(*pos) + 1.2), tgt), tgt
    cam_track("CG", 32, G0, G1, cam_g, amp=0.1, every=2)

    # ---------------- H (529-624) : frappes de drones sur les positions de l'armée (le camp)
    H0_, H1_ = SHOTS["H"]
    camp_pos = [(-176, -167), (-181, -176), (-172, -181)]
    for i, c in enumerate(camp):
        visible(c, [(H0_, H1_)])
        x, y = camp_pos[i]
        keys(c, [(H0_, x, y, face(1, 0.2 * i)), (554, x, y, face(1, 0.2 * i)), (558, x + 2, y + 5, None), (H1_, x - 14, y + 26, None)])
        tail = [("Rifle Death", H1_ - 20, H1_ + 30, 1.0)] if i == 2 else [("Rifle Run", H1_ - 24, H1_ + 30, 1.2)]
        clips_for(c, [("Rifle Idle", H0_, 553, 1.0, i * 9), ("Rifle Run", 554, H1_ - 24, 1.2)] + tail)
    strikes = [(556, (-170, -163), "Tente_02", 5.0), (572, (-160, -180), "Tente_01", 5.4), (588, (-190, -197), "Tente_05", 5.0), (604, (-190, -163), "Tente_03", 6.4)]
    for f, (x, y), tent, R in strikes:
        explosion((x, y, ground(x, y) + 1.5), f, R)
        fire_column((x, y, ground(x, y)), f + 4, 700, 2.0)
        hide_at(tent, f + 1)
    for i, (f0_, a_, b_) in enumerate(((532, (-120, -140, 26), (-230, -190, 24)), (545, (-110, -190, 27), (-220, -145, 25)), (560, (-130, -170, 30), (-235, -165, 28)))):
        drone(f"drone_h{i}", f0_, f0_ + 48, a_, b_, size=1.1)

    def cam_h(f):
        u = (f - H0_) / (H1_ - H0_)
        p = lerp3((-205, -198, 0), (-198, -190, 0), u)
        return lift_view((p[0], p[1], ground(p[0], p[1]) + 3.2 + 0.8 * u), (-176, -174, ground(-176, -174) + 3)), (-175, -173, ground(-175, -173) + 3.5)
    cam_track("CH", 28, H0_, H1_, cam_h, amp=0.1, every=2)

    # ---------------- I (625-744) : le communiqué, drapeau d'Artex flottant au sommet d'une dune
    I0, I1 = SHOTS["I"]
    PX, PY = -34.0, 8.0
    pz = ground(PX, PY)
    flag("flag_com", (PX, PY, pz + 5.6), 0.0, 3.4, I0, I1, mast=True, mast_h=2.6)

    def cam_i(f):
        u = (f - I0) / (I1 - I0)
        return (PX + 12.0 - 3.0 * u, PY - 4.5 + 1.2 * u, pz + 1.0 + 0.5 * u), (PX + 1.8, PY, pz + 3.7)
    cam_track("CI", 32, I0, I1, cam_i, amp=0.02, every=3)

    # ---------------- J (745-840) : le journal : le héros écoute la radio, la base brûle derrière lui
    J0, J1 = SHOTS["J"]

    def cam_j(f):
        u = (f - J0) / (J1 - J0)
        d = 2.9 - 0.7 * u
        return (H0[0] - 0.4 - 0.9 * d, H0[1] - 0.4 * d, ground(*H0) + 1.55), (H0[0] - 0.4, H0[1], ground(*H0) + 1.62)
    cam_track("CJ", 60, J0, J1, cam_j, amp=0.012, fstop=2.0, focus=2.4, every=3)

    # ---------------- K (841-936) : « Attention ! » les drones arrivent, le héros court
    K0, K1 = SHOTS["K"]
    for i, (f0_, a_, b_) in enumerate(((846, (fcx + 60, fcy - 40, fz + 30), (fcx - 60, fcy + 10, fz + 34)), (852, (fcx + 50, fcy - 60, fz + 26), (fcx - 70, fcy - 8, fz + 30)),
                                       (860, (fcx + 70, fcy - 20, fz + 36), (fcx - 50, fcy + 30, fz + 38)))):
        drone(f"drone_k{i}", f0_, f0_ + 50, a_, b_, size=1.3)
    explosion((fcx + 4, fcy - 17, fz + 3.0), 892, 4.4)
    explosion((fcx - 6, fcy - 6, fz + 1.5), 904, 5.0)
    explosion((fcx + 12, fcy - 12, fz + 1.5), 918, 4.2, flash=0.9)

    def cam_k(f):
        u = (f - K0) / (K1 - K0)
        hx, hy = H0[0] - 0.4, H0[1]
        pos = (hx + 3.3 * (1 - u), hy - 6.2 * (1 - u) - 4.0 * u, ground(hx, hy) + 0.75)
        look_u = max(0.0, min(1.0, (f - 856) / 18.0))
        down_u = max(0.0, min(1.0, (f - 888) / 10.0))
        tgt_hero = (hx, hy, ground(hx, hy) + 1.4)
        tgt_sky = (hx - 10, hy + 6, fz + 36)
        return pos, lerp3(tgt_hero, tgt_sky, look_u * (1 - down_u))
    cam_track("CK", 26, K0, K1, cam_k, amp=0.11, every=2)

    # ---------------- L (937-1032) : frappe sur le palais présidentiel (la grande salle du village)
    L0, L1 = SHOTS["L"]
    px, py = PALAIS
    pgz = ground(px, py)
    hide_at("Mosquee_Minaret_G", 972)
    ml = fx_obj("missile", cone_mesh(), emission_mat("fx_missile", (1.0, 0.9, 0.7), 160.0), (0, 0, 0), 0.0001)
    sx, sy, sz = px + 70, py + 40, 80.0
    d = Vector((px - 1.0 - sx, py - sy, pgz + 7.0 - sz))
    ml.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    for ff, u, on in ((962, 0.0, False), (963, 0.0, True), (969, 1.0, True), (970, 1.0, False)):
        ml.location = (sx + d.x * u, sy + d.y * u, sz + d.z * u)
        key_obj(ml, ff, ml.location, ml.rotation_euler)
        key_scale(ml, ff, (0.55, 0.55, 16.0) if on else 0.0001)
    linear(ml)
    explosion((px, py, pgz + 7.0), 970, 14.0, flash=1.0)
    explosion((px + 7, py + 2, pgz + 4.5), 974, 9.0, flash=0.8)
    explosion((px - 8, py - 1, pgz + 3.5), 980, 8.0, flash=0.6)
    fire_column((px, py, pgz + 6), 975, 1032, 4.0)
    fire_column((px + 6, py + 2, pgz + 3), 980, 1032, 3.2)

    def cam_l(f):
        u = (f - L0) / (L1 - L0)
        x, y = px - 52 - 14 * u, py - 48 - 14 * u
        return (x, y, ground(x, y) + 9.0 + 3.0 * u), (px, py, pgz + 8.5)
    cam_track("CL", 28, L0, L1, cam_l, amp=0.03, every=2)
    log("TOUT EST EN PLACE")


def render_frames(frames):
    for f in frames:
        path = os.path.join(OUT, f"f_{f:04d}.png")
        if os.path.exists(path) and "INTRO_FRAMES" not in os.environ:
            continue
        sc.frame_set(f)
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        log("rendu", f)


if __name__ == "__main__":
    build()
    json.dump({str(k): v for k, v in FLASH.items()}, open(os.path.join(os.path.dirname(OUT), "flash.json"), "w"))
    if "INTRO_DEBUG" in os.environ:                                    # contrôle : positions des personnages et caméra à l'image donnée
        fr = int(os.environ["INTRO_DEBUG"]); sc.frame_set(fr)
        for n in ("hero_arm", "sol0_arm", "mil0_arm", "mil3_arm", "mil6_arm", "art1_arm", "camp0_arm"):
            o = bpy.data.objects[n]
            log("DBG", fr, n, tuple(round(v, 1) for v in o.matrix_world.translation), "caché" if o.hide_render else "visible",
                "action" if (o.animation_data and o.animation_data.action) else "sans action")
        dg = bpy.context.evaluated_depsgraph_get()
        for n in ("mil0_Body", "mil0_N_Ceinture", "sol0_Body", "sol0_U_Casque"):
            o = bpy.data.objects.get(n)
            if o:
                e = o.evaluated_get(dg)
                vs = [e.matrix_world @ v.co for v in e.data.vertices]
                log("DBG", n, "cache" if o.hide_render else "visible", "bbox", tuple(round(min(v[i] for v in vs), 1) for i in range(3)), tuple(round(max(v[i] for v in vs), 1) for i in range(3)))
            else:
                log("DBG absent", n)
        cam = sc.camera
        log("DBG caméra active", cam.name if cam else None, tuple(round(v, 1) for v in cam.matrix_world.translation) if cam else None)
        sys.exit(0)
    if "INTRO_FRAMES" in os.environ:
        render_frames([int(x) for x in os.environ["INTRO_FRAMES"].split(",")])
    else:
        a, b = [int(x) for x in os.environ.get("INTRO_RANGE", "1,1032").split(",")]
        render_frames(range(a, b + 1))
    log("TERMINÉ")
