"""Intro Ir Ganda (30 s, 720 images à 24 i/s) en TROIS PARTIES rendues séparément, caméra de cinéma : mouvements fluides et stables (travelling, grue,
pousser-tirer, panoramiques lents avec accélération et freinage), aucun tremblement. Vraies explosions, vrais coups de feu (intro_fx.py), pieds sur les dunes.
    blender -b assets/sahel_desert.blend --python tools/blender/intro30.py          (INTRO_PART=1|2|3)
Partie 1 « La base » (1-228) : le fort à l'aube, le héros, la charge de la milice, les explosions au mur.
Partie 2 « Artex » (229-432)  : l'incendie, l'arrivée d'Artex, la milice anéantie, les frappes de drones sur le camp.
Partie 3 « Le communiqué et le palais » (433-636) : le drapeau, le journal, « ATTENTION ! », la frappe sur le palais. Le titre (637-720) est ajouté en post-production.
Variables : INTRO_PART ; INTRO_FRAMES="100,200" (contrôle 640x360) ; INTRO_RANGE="a,b" ; INTRO_OUT=dossier."""
import json, math, os, sys
import importlib.util
PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
OUT = os.environ.get("INTRO_OUT", os.path.join(PROJ, "assets", "intro3", "frames"))
os.makedirs(OUT, exist_ok=True); os.environ["INTRO_OUT"] = OUT
_spec = importlib.util.spec_from_file_location("intro_fx", os.path.join(PROJ, "tools", "blender", "intro_fx.py"))
X = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(X)
S = X.S
import bpy
from mathutils import Vector
S40 = S.S40
ground, lift_view, face, sc, log = S.ground, S.lift_view, S.face, S.sc, S.log
PART = int(os.environ.get("INTRO_PART", "1"))
SH = {"S1": (1, 72), "S2": (73, 120), "S3": (121, 180), "S4": (181, 228), "S5": (229, 276), "S6": (277, 336), "S7": (337, 384), "S8": (385, 432),
      "S9": (433, 492), "S10": (493, 540), "S11": (541, 576), "S12": (577, 636)}
PARTS = {1: (1, 228), 2: (229, 432), 3: (433, 636)}
P0, P1 = PARTS[PART]
fcx, fcy = S.FORT
fz = ground(fcx, fcy)
H0 = (fcx + 1.0, fcy - 11.5)                      # place du héros dans la cour du fort
SKINS = S.SKINS


# ------------------------------------------------------------------ mouvements de caméra de cinéma
def ss(u):                                        # accélération puis freinage doux (smoothstep)
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def lerp(a, b, u):
    return tuple(a[i] + (b[i] - a[i]) * u for i in range(3))


def move(name, lens, f0, f1, a, ta, b, tb, mid=None, tmid=None, ease=True, fstop=None, focus=None):
    """Travelling / grue : la caméra va de a à b (par un point intermédiaire facultatif) en regardant de ta à tb, avec accélération et freinage."""
    def fn(f):
        u = (f - f0) / max(1, f1 - f0)
        u = ss(u) if ease else u
        if mid:                                                    # courbe de Bézier quadratique : trajectoire arrondie
            p = tuple((1 - u) ** 2 * a[i] + 2 * (1 - u) * u * mid[i] + u * u * b[i] for i in range(3))
            t = tuple((1 - u) ** 2 * ta[i] + 2 * (1 - u) * u * (tmid or lerp(ta, tb, 0.5))[i] + u * u * tb[i] for i in range(3))
            return p, t
        return lerp(a, b, u), lerp(ta, tb, u)
    return X.cam_track(name, lens, f0, f1, fn, amp=0.0, every=1, fstop=fstop, focus=focus)


def smooth(vals, w=21):
    """Moyenne glissante : supprime les à-coups (relief du sol, rebonds) d'une trajectoire suivie par la caméra."""
    n = len(vals); out = []
    for i in range(n):
        lo, hi = max(0, i - w // 2), min(n, i + w // 2 + 1)
        out.append(sum(vals[lo:hi]) / (hi - lo))
    return out


def follow(name, lens, f0, f1, subj, off, look, h_cam, fstop=None, focus=None, w=21):
    """Caméra qui accompagne un sujet : subj(f) -> (x, y) ; off(u) -> (dx, dy) décalage (u de 0 à 1) ; look(u) -> (dx, dy, h) point regardé relatif ; h_cam(u) hauteur au-dessus du sol.
    Toutes les trajectoires sont lissées : aucun à-coup."""
    fr = list(range(f0, f1 + 1))
    pos = []; tgt = []
    for f in fr:
        u = (f - f0) / max(1, f1 - f0)
        sx, sy = subj(f); ox, oy = off(u); lx, ly, lh = look(u)
        pos.append((sx + ox, sy + oy)); tgt.append((sx + lx, sy + ly, lh))
    px = smooth([p[0] for p in pos], w); py = smooth([p[1] for p in pos], w)
    gz = smooth([ground(px[i], py[i]) for i in range(len(fr))], w)
    tx = smooth([t[0] for t in tgt], w); ty = smooth([t[1] for t in tgt], w)
    tz = smooth([ground(tx[i], ty[i]) + tgt[i][2] for i in range(len(fr))], w)

    def fn(f):
        i = f - f0; u = i / max(1, f1 - f0)
        return (px[i], py[i], gz[i] + h_cam(u)), (tx[i], ty[i], tz[i])
    return X.cam_track(name, lens, f0, f1, fn, amp=0.0, every=1, fstop=fstop, focus=focus)


# ------------------------------------------------------------------ rendu semi-réaliste
def semi_realistic(preview):
    """Rendu semi-réaliste : lancer de rayons (réflexions, éclairage indirect), ombres douces, brume de poussière dans l'air (volume + faisceaux du soleil),
    flou de mouvement naturel, étalonnage sobre (AgX contraste normal, pas « punchy »), soleil bas et net."""
    e = sc.eevee
    for attr, val in (("use_raytracing", True), ("use_fast_gi", True), ("use_shadows", True), ("use_volumetric_shadows", True), ("shadow_ray_count", 2), ("shadow_step_count", 8),
                      ("volumetric_start", 0.1), ("volumetric_end", 600.0), ("volumetric_samples", 48 if not preview else 24), ("volumetric_tile_size", "2" if not preview else "4"),
                      ("taa_render_samples", 48 if not preview else 16)):
        try:
            setattr(e, attr, val)
        except Exception as ex:
            log("eevee", attr, ex)
    try:
        e.ray_tracing_options.use_denoise = True; e.ray_tracing_options.resolution_scale = "2" if not preview else "4"
    except Exception as ex:
        log("rt", ex)
    sc.render.use_motion_blur = not preview
    try:
        sc.render.motion_blur_shutter = 0.5
    except Exception:
        pass
    vs = sc.view_settings
    for look in ("AgX - Base Contrast", "AgX - Medium High Contrast", "None"):
        try:
            vs.look = look; break
        except Exception:
            continue
    vs.exposure = -0.5
    # air chargé de poussière : un grand volume léger au-dessus de la carte (le volume du monde noircissait le ciel) : profondeur des lointains, rayons de soleil
    if os.environ.get("INTRO_BRUME", "1") == "1":
        import bmesh
        me = bpy.data.meshes.new("brume"); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new("Brume", me); sc.collection.objects.link(ob)
        ob.location = (0, 0, 28); ob.scale = (700, 700, 70)
        mt = bpy.data.materials.new("Brume_m"); mt.use_nodes = True
        nt = mt.node_tree; nt.nodes.clear()
        pv = nt.nodes.new("ShaderNodeVolumePrincipled"); pv.inputs["Density"].default_value = float(os.environ.get("INTRO_BRUME_DENS", "0.0028"))
        pv.inputs["Anisotropy"].default_value = 0.5; pv.inputs["Color"].default_value = (1.0, 0.92, 0.80, 1.0)
        out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(pv.outputs[0], out.inputs["Volume"])
        me.materials.append(mt)
        try:
            ob.visible_shadow = False
        except Exception:
            pass
    sun = bpy.data.objects["Soleil_Sahel"]
    sun.data.angle = 0.012                                       # soleil net : ombres nettes comme en plein désert


# ------------------------------------------------------------------ mise en place commune
def setup():
    preview = "INTRO_FRAMES" in os.environ and os.environ.get("INTRO_FULL") != "1"          # INTRO_FULL=1 : images de contrôle en pleine qualité (1280 x 720)
    S40.setup_render(preview)
    try:
        sc.eevee.taa_render_samples = 14 if preview else 44
    except Exception:
        pass
    S40.clean_scene(); S40.dawn_light(elevation_deg=11, azimuth_deg=100, strength=3.4)
    semi_realistic(preview)
    for o in [S.SRC_ARM] + list(S.SRC_ARM.children_recursive):
        o.hide_render = True
    sc.frame_start, sc.frame_end = P0, P1
    for t in list(sc.timeline_markers):
        sc.timeline_markers.remove(t)


def fill_light(name, g0, g1, energy=520.0):
    fl_ = S.point_light(name, (H0[0] - 1.8, H0[1] - 1.3, ground(*H0) + 2.0), (1.0, 0.86, 0.72), 0.0, 0.6)
    for ff, e in ((g0 - 1, 0.0), (g0, energy), (g1, energy), (g1 + 1, 0.0)):
        fl_.data.energy = e; fl_.data.keyframe_insert("energy", frame=ff)


def gun_cover(org_actor, target_fn, f0, f1, name, interval=5, height=1.3, impact=True, size=0.9):
    org = (lambda f: (S.actor_pos(org_actor, f)[0], S.actor_pos(org_actor, f)[1], S.actor_pos(org_actor, f)[2] + height))
    return X.tracers(org, target_fn, f0, f1, interval=interval, name=name, impact=impact, impact_size=size)


# ------------------------------------------------------------------ PARTIE 1
def build_p1():
    a0, a1 = SH["S1"]; b0, b1 = SH["S2"]; c0, c1 = SH["S3"]; d0, d1 = SH["S4"]
    wall_y = fcy - 17.0
    # S1 : le fort à l'aube, grue lente vers le haut et avancée (aucun tremblement)
    pa = lift_view((-186, 118, ground(-186, 118) + 4.5), (fcx, fcy, fz + 8))
    pb = lift_view((-166, 134, ground(-166, 134) + 12.5), (fcx, fcy, fz + 9.5))
    move("C1", 28, a0, a1, pa, (fcx, fcy, fz + 8.0), pb, (fcx, fcy, fz + 9.5))
    # S2 : gros plan du héros, lente avancée sur le visage
    gz0 = ground(*H0)
    move("C2", 62, b0, b1, (H0[0] - 0.8 * 2.4, H0[1] - 0.6 * 2.4, gz0 + 1.62), (H0[0], H0[1], gz0 + 1.6),
         (H0[0] - 0.8 * 1.5, H0[1] - 0.6 * 1.5, gz0 + 1.6), (H0[0], H0[1], gz0 + 1.58), fstop=2.0, focus=2.0)
    # S3 : travelling arrière-avant : la caméra court derrière la milice, le fort se dresse devant eux
    ymil = lambda f: fcy - 42 + 15 * (f - c0) / (c1 - c0)
    follow("C3", 26, c0, c1, lambda f: (fcx + 1.5, ymil(f)), lambda u: (-3.0, -8.5 + 1.0 * u), lambda u: (0.0, 14.0, 3.0), lambda u: 2.0 + 0.5 * u)
    # S4 : glissement latéral lent derrière le héros : on découvre les explosions sur le mur
    move("C4", 26, d0, d1, (fcx - 5.0, fcy - 8.0, ground(fcx - 5, fcy - 8) + 1.5), (fcx - 1.5, wall_y, fz + 2.6),
         (fcx + 4.0, fcy - 8.0, ground(fcx + 4, fcy - 8) + 1.7), (fcx + 1.5, wall_y, fz + 2.6))
    X.make_cam_proxy(P0, P1)

    hero = S.spawn("armee", "noire", "hero")
    sol = [S.spawn("armee", SKINS[(i + 1) % 3], f"sol{i}") for i in range(4)]
    mil = [S.spawn("milice", SKINS[(i + 2) % 3], f"mil{i}") for i in range(7)]
    S.visible(hero, [(1, P1)])
    S.keys(hero, [(1, H0[0], H0[1], face(-0.8, -0.6)), (172, H0[0], H0[1], face(-0.8, -0.6)), (186, H0[0], H0[1], face(0.0, -1.0)), (P1, H0[0], H0[1], face(0.0, -1.0))])
    S.clips_for(hero, [("Rifle Idle", 1, 180, 1.0), ("Rifle Kneel Tir", 181, P1, 1.0)])
    sp = [(-9.5, -9.0), (-6.0, -7.0), (7.5, -9.0), (10.0, -5.0)]
    for i, a_ in enumerate(sol):
        S.visible(a_, [(1, P1)])
        x, y = fcx + sp[i][0], fcy + sp[i][1]
        yaw0 = face(S.RND.uniform(-1, 1), S.RND.uniform(-0.4, 0.3))
        S.keys(a_, [(1, x, y, yaw0), (172, x, y, yaw0), (186, x, y, face(0, -1)), (P1, x, y, face(0, -1))])
        S.clips_for(a_, [("Rifle Idle", 1, 180, 1.0, i * 17), ("Rifle Fire", 181, P1, 1.0, i * 9)])
    for i, m_ in enumerate(mil):
        S.visible(m_, [(c0, P1)])
        x0 = fcx - 7 + i * 2.4 + S.RND.uniform(-0.6, 0.6)
        y1 = fcy - 27 + S.RND.uniform(-2.5, 2.5)
        S.keys(m_, [(c0, x0, ymil(c0) + (i % 3) * 1.4, None), (c1, x0, y1, None), (c1 + 1, x0, y1, face(0, 1)), (P1, x0, y1, face(0, 1))])
        S.clips_for(m_, [("Rifle Run Tir", c0, c1, 1.2, i * 3), ("Rifle Kneel Tir", c1 + 1, P1, 1.0, i * 5)])
    fill_light("fill_S2", b0, b1)

    # coups de feu : la milice tire vers le mur (traçantes, impacts), puis le héros et les soldats ripostent
    for i, m_ in enumerate(mil):
        X.muzzle_fire(m_, c0 + 3 + i, P1, density=0.55 if i < 5 else 0.4)
        if i < 5:
            tgt = (lambda f, i=i: (fcx - 8 + i * 4.0 + 1.5 * math.sin(f), wall_y, fz + 1.0 + 1.6 * abs(math.sin(f * 0.7))))
            gun_cover(m_, tgt, c0 + 3 + i, P1, f"tr_mil{i}", interval=4 + (i % 2), impact=(i < 3))
    for j, a_ in enumerate([hero] + sol[:3]):
        X.muzzle_fire(a_, d0 + 2, d1, density=0.6)
        gun_cover(a_, (lambda f, j=j: (fcx - 6 + j * 4.0, fcy - 30, fz + 0.5)), d0 + 2 + j, d1, f"tr_sol{j}", interval=5, height=1.0, impact=False)
    # explosions et incendies au pied du mur sud
    X.explosion((fcx + 0.5, fcy - 16.6, fz + 2.4), 190, 3.8)
    X.explosion((fcx + 9.0, fcy - 16.4, fz + 2.0), 202, 3.2)
    X.explosion((fcx - 8.5, fcy - 16.7, fz + 2.6), 212, 3.6)
    X.explosion((fcx + 2.0, fcy - 16.5, fz + 2.2), 222, 4.4, flash=0.6)
    X.fire_column((fcx + 0.5, fcy - 15.8, fz), 194, P1, 1.8)
    X.fire_column((fcx - 8.5, fcy - 15.8, fz), 214, P1, 1.6)


# ------------------------------------------------------------------ PARTIE 2
def build_p2():
    e0, e1 = SH["S5"]; f0, f1 = SH["S6"]; g0, g1 = SH["S7"]; h0, h1 = SH["S8"]
    # S5 : l'incendie vu d'en haut, grue stable qui descend lentement vers la cour
    a = lift_view((fcx + 42, fcy + 40, ground(fcx + 42, fcy + 40) + 13), (fcx, fcy, fz + 6))
    b = lift_view((fcx + 30, fcy + 24, ground(fcx + 30, fcy + 24) + 9), (fcx, fcy, fz + 6.5))
    move("C5", 26, e0, e1, a, (fcx, fcy, fz + 6.0), b, (fcx - 1.5, fcy, fz + 6.5))
    # S6 : le véhicule d'Artex ; travelling latéral qui monte, caméra devant-gauche
    veh, wheels, wheel0 = S.vehicle_setup()
    vpath = [(-198, 66), (-188, 86), (-175, 106), (-160, 122), (-153, 128)]
    seg = [0.0]
    for p_, q_ in zip(vpath, vpath[1:]):
        seg.append(seg[-1] + math.hypot(q_[0] - p_[0], q_[1] - p_[1]))
    tot = seg[-1]

    def vpos(s_):
        s_ = max(0.0, min(tot, s_))
        for i in range(len(seg) - 1):
            if s_ <= seg[i + 1]:
                u = (s_ - seg[i]) / (seg[i + 1] - seg[i]); p, q = vpath[i], vpath[i + 1]
                return p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, math.atan2(q[0] - p[0], -(q[1] - p[1]))
        p, q = vpath[-2], vpath[-1]
        return q[0], q[1], math.atan2(q[0] - p[0], -(q[1] - p[1]))
    sdist = {f: (f - f0) * 14.0 / S.FPS for f in range(f0, f1 + 1)}
    vstate = {f: vpos(sdist[f]) for f in sdist}
    vx = smooth([vstate[f][0] for f in range(f0, f1 + 1)], 15); vy = smooth([vstate[f][1] for f in range(f0, f1 + 1)], 15)
    yawf = {f: vstate[f][2] for f in vstate}

    def cam6(f):
        i = f - f0; u = i / (f1 - f0)
        yaw = yawf[f]; fw = (math.sin(yaw), -math.cos(yaw)); lf = (-math.cos(yaw), -math.sin(yaw))
        d = 12.0 - 3.0 * ss(u); side = 5.5 - 1.5 * ss(u)
        px_, py_ = vx[i] + fw[0] * d + lf[0] * side, vy[i] + fw[1] * d + lf[1] * side
        return (px_, py_, ground(px_, py_) + 1.0 + 2.6 * ss(u)), (vx[i], vy[i], ground(vx[i], vy[i]) + 1.6)
    X.cam_track("C6", 30, f0, f1, cam6, amp=0.0, every=1)
    # S7 : les mercenaires éliminent la milice ; pousser lent derrière la ligne d'Artex
    ax = [fcx - 4.5, fcx - 1.5, fcx + 1.5, fcx + 4.5]
    cam_a = (fcx - 3.5, fcy - 49.0, ground(fcx - 3.5, fcy - 49) + 1.35)
    cam_b = (fcx - 2.2, fcy - 45.0, ground(fcx - 2.2, fcy - 45) + 1.55)
    move("C7", 32, g0, g1, cam_a, (fcx, fcy - 27, fz + 1.5), cam_b, (fcx, fcy - 27, fz + 1.5))
    # S8 : le camp frappé par les drones ; travelling lent
    ca = lift_view((-205, -198, ground(-205, -198) + 3.4), (-176, -174, ground(-176, -174) + 3))
    cb = lift_view((-196, -189, ground(-196, -189) + 4.6), (-176, -174, ground(-176, -174) + 3))
    move("C8", 28, h0, h1, ca, (-176, -174, ground(-176, -174) + 3.2), cb, (-174, -173, ground(-174, -173) + 3.5))
    X.make_cam_proxy(P0, P1)

    # incendie persistant du fort (déjà en feu depuis la partie 1)
    X.fire_column((fcx + 0.5, fcy - 15.8, fz), P0, e1, 1.8)
    X.fire_column((fcx - 8.5, fcy - 15.8, fz), P0, e1, 1.6)
    X.fire_column((fcx, fcy, fz + 9.2), P0, g1, 2.6)
    X.fire_column((fcx + 17, fcy + 17, fz + 10.2), 233, g1, 2.3)
    X.fire_column((fcx - 17, fcy - 17, fz + 10.2), 240, e1 + 40, 2.0)
    X.explosion((fcx + 17, fcy + 17, fz + 9.0), 236, 4.8)
    X.explosion((fcx - 17, fcy + 17, fz + 9.0), 252, 4.4)
    X.explosion((fcx + 4, fcy - 2, fz + 4.0), 266, 3.4, flash=0.4)
    # S5 : les défenseurs courent dans la cour
    hero = S.spawn("armee", "noire", "hero")
    sol = [S.spawn("armee", SKINS[(i + 1) % 3], f"sol{i}") for i in range(3)]
    S.visible(hero, [(e0, e1)]); S.keys(hero, [(e0, H0[0], H0[1], None), (e1, H0[0] - 9, H0[1] + 10, None)]); S.clips_for(hero, [("Rifle Run Tir", e0, e1, 1.2)])
    for i, a_ in enumerate(sol):
        S.visible(a_, [(e0, e1)])
        x, y = fcx + [-9.5, -6.0, 7.5][i], fcy + [-9.0, -7.0, -9.0][i]
        S.keys(a_, [(e0, x, y, None), (e1, x + [-6, 5, 8][i], y + 14 + i * 2, None)])
        S.clips_for(a_, [("Rifle Run", e0, e1, 1.2, i * 4)])
    # S6 : le véhicule, l'Artex sur le plateau, le drapeau
    S.key_obj(veh, 1, (0, -300, 0), (0, 0, 0)); S.key_obj(veh, f0 - 1, (0, -300, 0), (0, 0, 0))
    L = 3.2
    for f in range(f0, f1 + 1):
        x, y, yaw = vstate[f]
        fx_, fy_ = x + math.sin(yaw) * L / 2, y - math.cos(yaw) * L / 2
        bx_, by_ = x - math.sin(yaw) * L / 2, y + math.cos(yaw) * L / 2
        zf, zb = ground(fx_, fy_), ground(bx_, by_)
        S.key_obj(veh, f, (x, y, (zf + zb) / 2 + 0.03 * math.sin(f * 1.7)), (-math.atan2(zf - zb, L), 0, yaw))
        for n, o in wheels.items():
            S.key_obj(o, f, None, (wheel0[n][0] + sdist[f] / 0.38, wheel0[n][1], wheel0[n][2]))
    S.key_obj(veh, f1 + 1, (0, -300, 0), (0, 0, 0)); S.key_obj(veh, 900, (0, -300, 0), (0, 0, 0))
    S.linear(veh); S.const_before(veh, f0 - 1); S.const_before(veh, f1)
    for o in wheels.values():
        S.linear(o)
    art = [S.spawn("artex", SKINS[(i + 1) % 3], f"art{i}") for i in range(5)]
    S.visible(art[0], [(f0, f1)]); S.clips_for(art[0], [("Rifle Aim", f0, f1, 1.0)])
    for f in range(f0, f1 + 1):
        x, y, yaw = vstate[f]
        back = (-math.sin(yaw), math.cos(yaw)); left = (-math.cos(yaw), -math.sin(yaw))
        S.key_obj(art[0].arm, f, (x + back[0] * 0.85 + left[0] * 0.15, y + back[1] * 0.85 + left[1] * 0.15, ground(x, y) + 1.02 + 0.03 * math.sin(f * 1.7)), (math.radians(90), 0, yaw))
    S.linear(art[0].arm)
    fl = S.flag("flag_veh", (0, -300, 0), 0.0, 1.5, f0, f1, mast=False)
    for f in range(f0, f1 + 1):
        x, y, yaw = vstate[f]
        S.key_obj(fl, f, (x, y, ground(x, y) + 2.9), (0, 0, yaw + math.pi / 2))
    S.linear(fl); S.key_scale(fl, f0 - 1, 0.0001); S.key_scale(fl, f0, 1.0); S.key_scale(fl, f1 + 1, 0.0001)
    X.muzzle_fire(art[0], f0, f1, density=0.35)
    # S7 : la ligne d'Artex tire vers le mur ; la milice, à genoux au pied du mur, fuit puis tombe
    mil = [S.spawn("milice", SKINS[(i + 2) % 3], f"mil{i}") for i in range(7)]
    for i in range(1, 4):
        a_ = art[i]
        S.visible(a_, [(g0, g1)])
        x = ax[i - 1] + 0.0; y = fcy - 42.0
        S.keys(a_, [(g0, x, y, face(0, 1)), (g1, x, y + 1.5, face(0, 1))])
        S.clips_for(a_, [("Rifle Fire", g0, g1, 1.0, i * 7)])
        X.muzzle_fire(a_, g0, g1, density=0.55)
    for i, m_ in enumerate(mil):
        S.visible(m_, [(g0, g1)])
        x = fcx - 7 + i * 2.4; y = fcy - 27 + (i % 3) * 0.8
        flee = fcx - 40 if i % 2 == 0 else fcx + 40
        S.keys(m_, [(g0, x, y, face(0, 1)), (g0 + 6 + i, x, y, face(flee - x, 0.3)), (g1, flee * 0.0 + x + (flee - fcx) * 0.35, y - 4.0, None)])
        S.clips_for(m_, [("Rifle Kneel Tir", g0, g0 + 5 + i, 1.0), ("Rifle Run", g0 + 6 + i, g0 + 15 + i * 2, 1.2), ("Rifle Death", g0 + 14 + i * 3, g1 + 30, 1.0)])
    for i in range(1, 4):
        gun_cover(art[i], (lambda f, i=i: (fcx - 8 + i * 4.0, fcy - 27 - 0.5 * math.sin(f), fz + 1.0)), g0 + i, g1 - 6, f"tr_art{i}", interval=4, impact=True, size=0.8)
    X.explosion((fcx - 6, fcy - 29, ground(fcx - 6, fcy - 29) + 1.2), 352, 3.4, flash=0.45)
    X.explosion((fcx + 7, fcy - 27, ground(fcx + 7, fcy - 27) + 1.2), 366, 3.0, flash=0.4)
    # S8 : camp frappé par les drones
    camp = [S.spawn("armee", SKINS[i % 3], f"camp{i}") for i in range(3)]
    camp_pos = [(-176, -167), (-181, -176), (-172, -181)]
    for i, c in enumerate(camp):
        S.visible(c, [(h0, h1)])
        x, y = camp_pos[i]
        S.keys(c, [(h0, x, y, face(1, 0.2 * i)), (398, x, y, face(1, 0.2 * i)), (402, x + 2, y + 5, None), (h1, x - 12, y + 22, None)])
        tail = [("Rifle Death", h1 - 12, h1 + 30, 1.0)] if i == 2 else [("Rifle Run", h1 - 24, h1 + 30, 1.2)]
        S.clips_for(c, [("Rifle Idle", h0, 397, 1.0, i * 9), ("Rifle Run", 398, h1 - 24, 1.2)] + tail)
    strikes = [(396, (-170, -163), "Tente_02", 5.0), (408, (-160, -180), "Tente_01", 5.4), (418, (-190, -197), "Tente_05", 5.0), (428, (-190, -163), "Tente_03", 6.4)]
    for f, (x, y), tent, R in strikes:
        X.explosion((x, y, ground(x, y) + 1.5), f, R)
        X.fire_column((x, y, ground(x, y)), f + 4, h1, 2.0)
        S.hide_at(tent, f + 1)
    for i, (df0, a_, b_) in enumerate(((388, (-120, -140, 26), (-230, -190, 24)), (396, (-110, -190, 27), (-220, -145, 25)), (404, (-130, -170, 30), (-235, -165, 28)))):
        S.drone(f"drone_h{i}", df0, df0 + 40, a_, b_, size=1.1)


# ------------------------------------------------------------------ PARTIE 3
def build_p3():
    i0, i1 = SH["S9"]; j0, j1 = SH["S10"]; k0, k1 = SH["S11"]; l0, l1 = SH["S12"]
    PX, PY = -34.0, 8.0
    pz = ground(PX, PY)
    # S9 : le drapeau d'Artex ; travelling lent qui se rapproche en tournant un peu
    move("C9", 32, i0, i1, (PX + 12.0, PY - 4.5, pz + 1.0), (PX + 1.8, PY, pz + 3.7), (PX + 9.0, PY - 1.8, pz + 1.5), (PX + 1.6, PY, pz + 3.9))
    # S10 : le héros écoute le journal ; pousser lent sur le visage
    gz0 = ground(*H0)
    move("C10", 60, j0, j1, (H0[0] - 0.4 - 0.9 * 2.9, H0[1] - 0.4 * 2.9, gz0 + 1.55), (H0[0] - 0.4, H0[1], gz0 + 1.62),
         (H0[0] - 0.4 - 0.9 * 2.0, H0[1] - 0.4 * 2.0, gz0 + 1.57), (H0[0] - 0.4, H0[1], gz0 + 1.62), fstop=2.0, focus=2.4)
    # S11 : « Attention ! » : on lève lentement les yeux vers les drones, puis retour sur l'explosion
    hx, hy = H0[0] - 0.4, H0[1]

    def cam11(f):
        u = (f - k0) / (k1 - k0)
        pos = (hx + 3.3 - 1.0 * ss(u), hy - 6.2 + 1.6 * ss(u), ground(hx, hy) + 0.8)
        up = ss((f - k0) / 14.0) * (1 - ss((f - (k0 + 20)) / 12.0))
        return pos, lerp((hx, hy, ground(hx, hy) + 1.4), (hx - 10, hy + 6, fz + 36), up)
    X.cam_track("C11", 26, k0, k1, cam11, amp=0.0, every=1)
    # S12 : la frappe sur le palais présidentiel ; plan large, avancée très lente
    px, py = S.PALAIS
    pgz = ground(px, py)
    move("C12", 28, l0, l1, (px - 52, py - 48, ground(px - 52, py - 48) + 9.0), (px, py, pgz + 8.5), (px - 42, py - 38, ground(px - 42, py - 38) + 7.5), (px, py, pgz + 8.0))
    X.make_cam_proxy(P0, P1)

    # S9 : le drapeau flotte au sommet de la dune ; les mercenaires, de peaux différentes, posent autour
    S.flag("flag_com", (PX, PY, pz + 5.6), 0.0, 3.4, i0, i1, mast=True, mast_h=2.6)
    art = [S.spawn("artex", SKINS[(i + 1) % 3], f"art{i}") for i in range(4)]
    for i in range(1, 4):
        fx_ = PX + (i - 2) * 2.4; fy_ = PY + abs(i - 2) * 1.2
        S.visible(art[i], [(i0, i1)]); S.keys(art[i], [(i0, fx_, fy_, face(0.9, -0.4)), (i1, fx_, fy_, face(0.9, -0.4))])
        S.clips_for(art[i], [("Rifle Idle", i0, i1, 1.0, i * 11)])
    # S10 / S11 : le héros et ses camarades dans la cour du fort (le feu et la fumée derrière eux)
    hero = S.spawn("armee", "noire", "hero")
    sol = [S.spawn("armee", SKINS[(i + 1) % 3], f"sol{i}") for i in range(2)]
    S.visible(hero, [(j0, k1)])
    S.keys(hero, [(j0, hx, hy, face(-0.9, -0.4)), (k0 + 14, hx, hy, face(-0.9, -0.4)), (k0 + 22, hx, hy, face(0.2, -1.0)), (k1, hx + 1.0, hy - 6.0, None)])
    S.clips_for(hero, [("Rifle Idle", j0, k0 + 22, 1.0), ("Rifle Run", k0 + 23, k1, 1.2)])
    for i, a_ in enumerate(sol):
        x, y = fcx + [-9.5, -6.0][i], fcy + [-9.0, -7.0][i]
        S.visible(a_, [(j0, k1)]); S.keys(a_, [(j0, x, y, face(0.7, -0.3)), (k1, x, y, face(0.7, -0.3))])
        S.clips_for(a_, [("Rifle Idle", j0, k1, 1.0, i * 13)])
    fill_light("fill_S10", j0, j1)
    X.fire_column((fcx, fcy, fz + 9.2), P0, k1 + 30, 2.6)
    X.fire_column((fcx - 8.5, fcy - 15.8, fz), P0, k1 + 30, 1.6)
    # S11 : les drones passent au-dessus du fort, puis une explosion derrière le héros
    for i, (df0, a_, b_) in enumerate(((543, (fcx + 60, fcy - 40, fz + 30), (fcx - 60, fcy + 10, fz + 34)), (546, (fcx + 50, fcy - 60, fz + 26), (fcx - 70, fcy - 8, fz + 30)),
                                       (550, (fcx + 70, fcy - 20, fz + 36), (fcx - 50, fcy + 30, fz + 38)))):
        S.drone(f"drone_k{i}", df0, df0 + 40, a_, b_, size=1.5)
    X.explosion((fcx + 4, fcy - 17, fz + 3.0), 566, 4.4, flash=0.8)
    # S12 : le missile, l'explosion du palais, l'incendie
    S.hide_at("Mosquee_Minaret_G", 601)
    ml = S.fx_obj("missile", S.cone_mesh(), S.emission_mat("fx_missile", (1.0, 0.9, 0.7), 160.0), (0, 0, 0), 0.0001)
    sx, sy, sz = px + 70, py + 40, 80.0
    d = Vector((px - 1.0 - sx, py - sy, pgz + 7.0 - sz))
    ml.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    for ff, u, on in ((591, 0.0, False), (592, 0.0, True), (598, 1.0, True), (599, 1.0, False)):
        ml.location = (sx + d.x * u, sy + d.y * u, sz + d.z * u)
        S.key_obj(ml, ff, ml.location, ml.rotation_euler); S.key_scale(ml, ff, (0.55, 0.55, 16.0) if on else 0.0001)
    S.linear(ml)
    X.explosion((px, py, pgz + 7.0), 599, 12.0, flash=1.0)
    X.explosion((px + 7, py + 2, pgz + 4.5), 604, 8.0, flash=0.8)
    X.explosion((px - 8, py - 1, pgz + 3.5), 610, 7.0, flash=0.6)
    X.fire_column((px, py, pgz + 6), 604, l1, 4.0)
    X.fire_column((px + 6, py + 2, pgz + 3), 610, l1, 3.2)


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
    setup()
    {1: build_p1, 2: build_p2, 3: build_p3}[PART]()
    log(f"TOUT EST EN PLACE (partie {PART})")
    json.dump({str(k): v for k, v in S.FLASH.items()}, open(os.path.join(os.path.dirname(OUT), f"flash_p{PART}.json"), "w"))
    for k in os.environ.get("INTRO_HIDE", "").split(","):             # contrôle : masque une famille d'effets (sp_poussiere, sp_feu, sp_fumee, sp_onde, sp_etincelle, etincelle, debris...)
        if k:
            for o in S.FX.objects:
                if o.name.startswith(k):
                    o.hide_render = True
    if "INTRO_DEBUG" in os.environ:                                    # contrôle : objets d'effets proches de la caméra à l'image donnée
        fr = int(os.environ["INTRO_DEBUG"]); sc.frame_set(fr)
        cam = sc.camera; cp = cam.matrix_world.translation
        log("DBG caméra", cam.name, tuple(round(v, 1) for v in cp))
        near = []
        for o in S.FX.objects:
            d = (o.matrix_world.translation - cp).length
            sz = max(abs(v) for v in o.scale)
            if d < 25 and sz > 0.01:
                near.append((round(d, 1), o.name, round(sz, 2)))
        for t in sorted(near)[:14]:
            log("DBG proche", t)
        sys.exit(0)
    if "INTRO_FRAMES" in os.environ:
        render_frames([int(x) for x in os.environ["INTRO_FRAMES"].split(",")])
    else:
        a, b = [int(x) for x in os.environ.get("INTRO_RANGE", f"{P0},{P1}").split(",")]
        render_frames(range(a, b + 1))
    log("TERMINÉ")
