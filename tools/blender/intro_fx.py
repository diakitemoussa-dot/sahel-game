"""Effets spéciaux des intros (vraies explosions, vrais coups de feu, fumée) : sprites animés en feuilles d'images (assets/intro3/fx), orientés vers la caméra,
étincelles et débris balistiques, ondes de choc, traînées de balles, éclairs de bouche, lumière. Même palette de flamme que le jeu.
S'appuie sur s42_intro2.py (personnages, caméras, sol). À importer depuis les scripts de parties : import intro_fx as X."""
import math, os, random
import bpy, bmesh
from mathutils import Vector
import importlib.util

PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
_spec = importlib.util.spec_from_file_location("s42", os.path.join(PROJ, "tools", "blender", "s42_intro2.py"))
S = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(S)
sc, ground, RND, FLASH = S.sc, S.ground, S.RND, S.FLASH
FXDIR = os.path.join(PROJ, "assets", "intro3", "fx")
CAMREC = []                                   # (début, fin, [(image, position)]) : positions de caméra pour orienter les sprites
_cache = {}


# ------------------------------------------------------------------ caméras (avec mémoire des positions)
def cam_track(name, lens, f0, f1, fn, amp=0.0, every=2, fstop=None, focus=None):
    frames = list(range(f0, f1 + 1, every))
    if frames[-1] != f1:
        frames.append(f1)
    CAMREC.append((f0, f1, [(f, tuple(fn(f)[0])) for f in frames]))
    return S.cam_track(name, lens, f0, f1, fn, amp=amp, every=every, fstop=fstop, focus=focus)


def cam_pos(f):
    for f0, f1, pts in CAMREC:
        if f0 <= f <= f1:
            for (a, pa), (b, pb) in zip(pts, pts[1:]):
                if a <= f <= b:
                    u = (f - a) / max(1, b - a)
                    return Vector(pa) + (Vector(pb) - Vector(pa)) * u
            return Vector(pts[-1][1])
    return Vector(CAMREC[-1][2][-1][1]) if CAMREC else Vector((0, 0, 10))


def make_cam_proxy(f_start, f_end):
    """Un objet vide qui suit la caméra active (cible des sprites qui se tournent vers l'objectif)."""
    e = bpy.data.objects.new("CamProxy", None); S.FX.objects.link(e)
    for f in range(f_start, f_end + 1, 2):
        e.location = cam_pos(f); e.keyframe_insert("location", frame=f)
    S.linear(e)
    _cache["proxy"] = e
    return e


# ------------------------------------------------------------------ sprites
def _plane():
    if "plane" not in _cache:
        me = bpy.data.meshes.new("fx_plan"); bm = bmesh.new()
        v = [bm.verts.new(p) for p in ((-0.5, -0.5, 0), (0.5, -0.5, 0), (0.5, 0.5, 0), (-0.5, 0.5, 0))]
        f = bm.faces.new(v); uv = bm.loops.layers.uv.new("UVMap")
        for lp, uvv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            lp[uv].uv = uvv
        bm.to_mesh(me); bm.free()
        _cache["plane"] = me
    return _cache["plane"]


def _img(name):
    if name not in _cache:
        im = bpy.data.images.load(os.path.join(FXDIR, name), check_existing=True)
        im.colorspace_settings.name = "sRGB"; im.alpha_mode = "STRAIGHT"
        _cache[name] = im
    return _cache[name]


KINDS = {  # image, colonnes, lignes, images, type de matériau
    "feu": ("fx_feu.png", 8, 8, 64, "emit"), "fumee": ("fx_fumee.png", 8, 4, 32, "lit"), "poussiere": ("fx_poussiere.png", 8, 4, 32, "lit"),
    "bouche": ("fx_bouche.png", 1, 1, 1, "emit"), "etincelle": ("fx_etincelle.png", 1, 1, 1, "emit"), "onde": ("fx_onde.png", 1, 1, 1, "lit"),
}


def _material(kind, strength):
    """Un matériau PARTAGÉ par famille de sprites ; la case de la feuille d'images (fx_u, fx_v) et l'opacité (fx_a) sont lues dans les propriétés
    de chaque objet (nœud Attribut), donc animées par objet (animer le matériau lui-même le partageait entre tous les sprites)."""
    key = (kind, strength)
    if key in _cache:
        return _cache[key]
    img, cols, rows, n, mode = KINDS[kind]
    m = bpy.data.materials.new(f"sp_{kind}"); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    co = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); tx = nt.nodes.new("ShaderNodeTexImage")
    mp.inputs["Scale"].default_value = (1.0 / cols, 1.0 / rows, 1.0)
    tx.image = _img(img); tx.extension = "CLIP"; tx.interpolation = "Linear"

    def attr(name):
        a_ = nt.nodes.new("ShaderNodeAttribute"); a_.attribute_type = "OBJECT"; a_.attribute_name = name
        return a_
    au, av, aa = attr("fx_u"), attr("fx_v"), attr("fx_a")
    cx = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(au.outputs["Fac"], cx.inputs["X"]); nt.links.new(av.outputs["Fac"], cx.inputs["Y"]); nt.links.new(cx.outputs["Vector"], mp.inputs["Location"])
    nt.links.new(co.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], tx.inputs["Vector"])
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
    nt.links.new(tx.outputs["Alpha"], mul.inputs[0]); nt.links.new(aa.outputs["Fac"], mul.inputs[1])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); mix = nt.nodes.new("ShaderNodeMixShader"); out = nt.nodes.new("ShaderNodeOutputMaterial")
    if mode == "emit":
        sh = nt.nodes.new("ShaderNodeEmission"); sh.inputs["Strength"].default_value = strength
        nt.links.new(tx.outputs["Color"], sh.inputs["Color"])
    else:
        sh = nt.nodes.new("ShaderNodeBsdfDiffuse"); nt.links.new(tx.outputs["Color"], sh.inputs["Color"])
    nt.links.new(mul.outputs[0], mix.inputs[0]); nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(sh.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs[0])
    for attr_, val in (("surface_render_method", "BLENDED"), ("use_backface_culling", False)):
        try:
            setattr(m, attr_, val)
        except Exception:
            pass
    _cache[key] = m
    return m


def _key_props(o, f, u=None, v=None, a=None):
    for name, val in (("fx_u", u), ("fx_v", v), ("fx_a", a)):
        if val is not None:
            o[name] = float(val); o.keyframe_insert(f'["{name}"]', frame=f)


def sprite(kind, pos, f0, f1, size0, size1, drift=(0, 0, 0), strength=6.0, alpha=1.0, flat=False, mirror=False, fade_in=2, ease=0.5):
    """Un sprite qui vit de f0 à f1 : taille de size0 à size1, dérive de `drift` mètres, feuille d'images animée, fondu d'entrée et de sortie."""
    img, cols, rows, n, mode = KINDS[kind]
    m = _material(kind, strength)
    o = bpy.data.objects.new(f"sp_{kind}_{f0}", _plane()); S.set_obj_material(o, m)
    S.FX.objects.link(o)
    try:
        o.visible_shadow = False
    except Exception:
        pass
    if not flat:
        c = o.constraints.new("TRACK_TO"); c.target = _cache["proxy"]; c.track_axis = "TRACK_Z"; c.up_axis = "UP_Y"
    life = max(1, f1 - f0)
    for f in range(f0 - 1, f1 + 2):
        u = min(1.0, max(0.0, (f - f0) / life))
        on = f0 <= f <= f1
        s = (size0 + (size1 - size0) * (u ** ease)) if on else 0.0001
        o.location = (pos[0] + drift[0] * u, pos[1] + drift[1] * u, pos[2] + drift[2] * u ** 0.8)
        o.scale = (-s if mirror else s, s, s)
        o.keyframe_insert("location", frame=f); o.keyframe_insert("scale", frame=f)
        if n > 1:
            idx = min(n - 1, int(u * n)); r, cc = divmod(idx, cols)
            fu, fv = cc / cols, (rows - 1 - r) / rows
        else:
            fu = fv = 0.0
        fade = (1.0 - max(0.0, (u - 0.7) / 0.3) ** 1.5) if kind != "feu" else 1.0
        a = alpha * min(1.0, (f - f0 + 1) / max(1, fade_in)) * fade
        _key_props(o, f, fu, fv, max(0.0, a) if on else 0.0)
    if flat:
        o.rotation_euler = (0, 0, RND.uniform(0, 6.28))
    return o


# ------------------------------------------------------------------ étincelles et débris
def ballistic(name, mesh, mat, pos, v, f0, life, size, spin=False, gravity=9.8, bounce_z=None):
    o = S.fx_obj(name, mesh, mat, pos, 0.0001)
    z_floor = bounce_z if bounce_z is not None else pos[2] - 50
    for f in range(f0 - 1, f0 + life + 2):
        t = max(0.0, (f - f0) / 24.0)
        x, y = pos[0] + v[0] * t, pos[1] + v[1] * t
        z = max(z_floor, pos[2] + v[2] * t - 0.5 * gravity * t * t)
        on = f0 <= f <= f0 + life
        o.location = (x, y, z); o.keyframe_insert("location", frame=f)
        S.key_scale(o, f, (size, size * 0.55, size * 0.8) if on else 0.0001)
        if spin:
            o.rotation_euler = (t * 7 + 1, t * 5 + 2, t * 6); o.keyframe_insert("rotation_euler", frame=f)
    return o


def sparks(pos, f0, n=10, speed=9.0, size=0.07, life=(18, 36), floor=None):
    mat = S.emission_mat("sp_etincelle", (1.0, 0.62, 0.18), 60.0)
    for i in range(n):
        th, ph = RND.uniform(0, 6.28), RND.uniform(0.2, 1.3)
        sp = speed * RND.uniform(0.4, 1.0)
        v = (math.cos(th) * math.sin(ph) * sp, math.sin(th) * math.sin(ph) * sp, math.cos(ph) * sp)
        ballistic(f"etincelle_{f0}_{i}", S.sphere_mesh(), mat, pos, v, f0, RND.randint(*life), size * RND.uniform(0.6, 1.3), bounce_z=floor)


def debris(pos, f0, n=8, speed=8.0, size=0.14, floor=None):
    mat = S.matte_mat("sp_debris", (0.2, 0.15, 0.1), 1.0)
    for i in range(n):
        th, ph = RND.uniform(0, 6.28), RND.uniform(0.3, 1.2)
        sp = speed * RND.uniform(0.35, 1.0)
        v = (math.cos(th) * math.sin(ph) * sp, math.sin(th) * math.sin(ph) * sp, math.cos(ph) * sp)
        ballistic(f"debris_{f0}_{i}", S.sphere_mesh(), mat, pos, v, f0, RND.randint(24, 46), size * RND.uniform(0.6, 1.6), spin=True, bounce_z=floor)


# ------------------------------------------------------------------ explosions
def explosion(pos, f, radius=4.0, smoke=True, flash=0.7, dust=True):
    """Vraie explosion : boule de feu en feuille d'images, noyau chaud, panache de fumée, poussière au sol, onde de choc, étincelles, débris, lumière, éclair."""
    x, y, z = pos
    gz = ground(x, y)
    sprite("feu", (x, y, z), f, f + 26, radius * 1.1, radius * 2.5, drift=(0, 0, radius * 0.5), strength=3.4, ease=0.6, fade_in=1)
    for i in range(3):
        a = RND.uniform(0, 6.28)
        off = (math.cos(a) * radius * 0.55, math.sin(a) * radius * 0.55, RND.uniform(0.2, 0.9) * radius * 0.4)
        sprite("feu", (x + off[0], y + off[1], z + off[2]), f + 1 + i, f + 24 + i * 2, radius * 0.8, radius * 1.7, drift=(off[0] * 0.6, off[1] * 0.6, radius * 0.9), strength=2.8, mirror=bool(i % 2), fade_in=1)
    sprite("etincelle", (x, y, z + radius * 0.15), f, f + 6, radius * 0.7, radius * 1.8, strength=12.0, fade_in=1, ease=0.5)         # flash chaud
    if dust:
        for i in range(4):
            a = RND.uniform(0, 6.28)
            sprite("poussiere", (x + math.cos(a) * radius * 0.4, y + math.sin(a) * radius * 0.4, gz + radius * 0.35), f + 1, f + 46, radius * 1.4, radius * 3.6,
                   drift=(math.cos(a) * radius * 1.8, math.sin(a) * radius * 1.8, radius * 0.5), alpha=0.8, mirror=bool(i % 2))
        ring = sprite("onde", (x, y, gz + 0.25), f, f + 16, radius * 0.8, radius * 8.5, flat=True, alpha=0.25, fade_in=1, ease=0.55)
    if smoke:                                                  # la fumée apparaît quand la boule de feu retombe (sinon elle la cache), plus haut et plus petite au départ
        for i in range(7):
            a = RND.uniform(0, 6.28); rr = RND.uniform(0.0, 0.6) * radius
            t0 = f + 8 + i * 3
            sprite("fumee", (x + math.cos(a) * rr, y + math.sin(a) * rr, z + radius * 0.9), t0, t0 + RND.randint(70, 110), radius * 1.0, radius * RND.uniform(4.2, 6.0),
                   drift=(RND.uniform(1.5, 4.0), RND.uniform(-1, 1), radius * RND.uniform(1.8, 3.2) + 5), alpha=0.95, mirror=bool(i % 2), ease=0.6, fade_in=8)
    sparks((x, y, z), f, n=int(8 + radius * 1.5), speed=7 + radius * 1.2, size=0.08, floor=gz)
    debris((x, y, z), f, n=int(5 + radius), speed=6 + radius, size=0.06 + radius * 0.012, floor=gz)
    pl = S.point_light(f"expl_lum_{f}_{int(x)}", (x, y, z + radius * 0.6), (1.0, 0.62, 0.3), 0.0, radius * 0.5)
    for ff, e in ((f - 1, 0.0), (f, 2200.0 * radius), (f + 3, 1300.0 * radius), (f + 10, 300.0 * radius), (f + 22, 0.0)):
        pl.data.energy = e; pl.data.keyframe_insert("energy", frame=ff)
    for dd, k in ((0, flash), (1, flash * 0.75), (2, flash * 0.5), (3, flash * 0.28), (4, flash * 0.12)):
        FLASH[f + dd] = max(FLASH.get(f + dd, 0.0), k)


def fire_column(pos, f0, f1, size=2.0, smoke=True):
    """Incendie : flammes (sprites de feu qui se renouvellent), fumée épaisse qui monte, lueur qui vacille."""
    x, y, z = pos
    for f in range(f0, f1 + 1, 4):
        a = RND.uniform(0, 6.28); rr = RND.uniform(0, 0.7) * size
        sprite("feu", (x + math.cos(a) * rr, y + math.sin(a) * rr, z + size * 0.5), f, f + 14, size * 1.1, size * RND.uniform(1.8, 2.8), drift=(0, 0, size * 1.4), strength=2.6,
               mirror=bool((f // 4) % 2), fade_in=2, ease=0.7)
    if smoke:
        for f in range(f0 + 2, f1 + 1, 7):
            a = RND.uniform(0, 6.28)
            sprite("fumee", (x + math.cos(a) * size * 0.3, y + math.sin(a) * size * 0.3, z + size * 1.1), f, f + RND.randint(80, 120), size * 1.5, size * RND.uniform(4.5, 6.5),
                   drift=(RND.uniform(2.0, 5.0), RND.uniform(-1.5, 1.5), size * 3.5 + 10), alpha=0.9, mirror=bool((f // 7) % 2), ease=0.65)
    pl = S.point_light(f"feu_lum_{f0}_{int(x)}", (x, y, z + size), (1.0, 0.5, 0.2), 0.0, size * 0.5)
    for f in range(f0, f1 + 1, 3):
        pl.data.energy = RND.uniform(0.6, 1.0) * 1800.0 * size; pl.data.keyframe_insert("energy", frame=f)
    pl.data.energy = 0; pl.data.keyframe_insert("energy", frame=f0 - 1); pl.data.keyframe_insert("energy", frame=f1 + 1)


# ------------------------------------------------------------------ coups de feu
def _cyl():
    if "cyl" not in _cache:
        me = bpy.data.meshes.new("fx_cyl"); bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.5, radius2=0.5, depth=1.0); bm.to_mesh(me); bm.free()
        _cache["cyl"] = me
    return _cache["cyl"]


def muzzle_fire(actor, f0, f1, density=0.6, size=0.55):
    """Éclairs de bouche : étoile lumineuse (sprite) collée à la bouche du canon + lueur, allumée au hasard sur f0..f1 (comme dans le jeu)."""
    mz = S.muzzle_of(actor)
    if not mz:
        return
    m = _material("bouche", 45.0)
    o = bpy.data.objects.new(f"bouche_{actor.arm.name}_{f0}", _plane()); S.set_obj_material(o, m); S.FX.objects.link(o)
    o["fx_u"] = 0.0; o["fx_v"] = 0.0; o["fx_a"] = 1.0
    o.parent = mz
    try:
        o.visible_shadow = False
    except Exception:
        pass
    c = o.constraints.new("TRACK_TO"); c.target = _cache["proxy"]; c.track_axis = "TRACK_Z"; c.up_axis = "UP_Y"
    ld = S.point_light(f"bouche_lum_{f0}", (0, 0, 0), (1.0, 0.7, 0.35), 0.0, 0.1); ld.parent = mz
    for f in range(f0 - 1, f1 + 2):
        on = f0 <= f <= f1 and RND.random() < density
        s = size * RND.uniform(0.7, 1.35) if on else 0.0001
        S.key_scale(o, f, (s if RND.random() < 0.5 else -s, s, s))
        ld.data.energy = 260.0 * RND.uniform(0.7, 1.3) if on else 0.0; ld.data.keyframe_insert("energy", frame=f)


def tracers(origin_fn, target_fn, f0, f1, interval=5, speed=110.0, length=3.0, name="trace", impact=True, impact_size=0.9):
    """Traînées de balles lumineuses de la bouche vers la cible, avec un impact (poussière, étincelles) à l'arrivée.
    origin_fn(f), target_fn(f) -> (x, y, z). Un seul objet réutilisé pour tous les tirs de ce tireur."""
    mat = S.emission_mat("sp_trace", (1.0, 0.82, 0.45), 80.0)
    o = S.fx_obj(f"{name}_{f0}", _cyl(), mat, (0, 0, -500), 0.0001)
    try:
        o.visible_shadow = False
    except Exception:
        pass
    o.rotation_mode = "QUATERNION"
    for f in range(f0, f1 + 1, interval):
        a = Vector(origin_fn(f)); b = Vector(target_fn(f))
        d = b - a; dist = d.length
        if dist < 2:
            continue
        flight = max(1, int(round(dist / speed * 24)))
        q = d.to_track_quat("Z", "Y")
        for k in range(flight + 1):
            u = k / flight
            p = a + d * u
            o.location = p; o.rotation_quaternion = q
            S.key_scale(o, f + k, (0.035, 0.035, length)); o.keyframe_insert("location", frame=f + k); o.keyframe_insert("rotation_quaternion", frame=f + k)
        o.location = (0, 0, -500)
        S.key_scale(o, f + flight + 1, 0.0001); o.keyframe_insert("location", frame=f + flight + 1)
        S.key_scale(o, f - 1, 0.0001) if f - 1 not in range(f0, f1) or True else None
        if impact:
            sprite("poussiere", b, f + flight, f + flight + 14, impact_size * 0.6, impact_size * 2.0, drift=(0, 0, impact_size), alpha=0.8)
            sparks(tuple(b), f + flight, n=4, speed=5.0, size=0.04, life=(8, 16), floor=None)
    return o
