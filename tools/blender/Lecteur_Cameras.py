"""Panneau 'Caméras' (barre latérale N de la vue 3D) : passer d'une caméra de jeu à l'autre,
régler distance / hauteur / côté / champ en direct, et afficher la pose du personnage associée.
Même principe que le panneau 'Animations'. Ce script ne fait que manipuler des objets de la scène."""
import math
import bpy
from mathutils import Vector
from bpy.props import StringProperty, IntProperty, BoolProperty, FloatProperty, CollectionProperty

MARK = "Cameras_Jeu_Reperes"
ORDER = ["Cam_Exploration", "Cam_Visee", "Cam_Accroupi", "Cam_ATerre", "Cam_Sniper", "Cam_PremierePersonne"]
LABEL = {"Cam_Exploration": "Exploration (déplacement)", "Cam_Visee": "Visée",
         "Cam_Accroupi": "Accroupi", "Cam_ATerre": "À terre (attente de relève)",
         "Cam_Sniper": "Tireur d'élite", "Cam_PremierePersonne": "Première personne (essai)"}
# pose du personnage montrée avec chaque caméra : (action, image de départ + décalage ; -1 = dernière image)
POSE = {"Cam_Exploration": ("Rifle Run", 6), "Cam_Visee": ("Rifle Aim", 20),
        "Cam_Accroupi": ("Rifle Kneel", 15), "Cam_ATerre": ("Rifle Death", -1),
        "Cam_Sniper": ("Rifle Aim Sniper", 20), "Cam_PremierePersonne": ("Rifle Aim FPS", 20)}
_lock = False


class CP_Item(bpy.types.PropertyGroup):
    name: StringProperty()


def _cur(sc):
    names = [it.name for it in sc.cp_items]
    return bpy.data.objects.get(names[sc.cp_index]) if 0 <= sc.cp_index < len(names) else None


def _areas():
    for win in bpy.context.window_manager.windows:
        for a in win.screen.areas:
            if a.type == 'VIEW_3D':
                yield a


def _set_view(mode):
    for a in _areas():
        sp = a.spaces[0]
        sp.region_3d.view_perspective = mode
        # image propre en vue caméra : pas de cadres de caméras, d'axes ni de grille
        sp.overlay.show_extras = (mode != 'CAMERA')
        sp.overlay.show_floor = (mode != 'CAMERA')
        sp.overlay.show_relationship_lines = (mode != 'CAMERA')
        sp.overlay.show_outline_selected = (mode != 'CAMERA')


def _in_camera_view():
    return any(a.spaces[0].region_3d.view_perspective == 'CAMERA' for a in _areas())


def _ensure_defaults(cam):
    if "def" not in cam:
        look = cam["look"]
        cam["def"] = [cam["dist"], cam["h"], cam["side"], cam["fov"], look[0], look[1], look[2]]


def _load_values(sc, cam):
    global _lock
    _lock = True
    try:
        sc.cp_dist, sc.cp_h, sc.cp_side, sc.cp_fov = cam["dist"], cam["h"], cam["side"], cam["fov"]
    finally:
        _lock = False


def _place(cam, dist, h, side, fov):
    look = Vector(cam["look"])
    look.x += side - cam["side"]       # le point visé suit le décalage latéral (visée parallèle)
    pos = Vector((side, -dist, h))
    cam.location = pos
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = (look - pos).to_track_quat('-Z', 'Y').to_euler()
    cam.data.angle = math.radians(fov)
    cam["dist"], cam["h"], cam["side"], cam["fov"] = dist, h, side, fov
    cam["look"] = [look.x, look.y, look.z]


def _pose(sc, cam):
    if not sc.cp_auto_pose or cam.name not in POSE:
        return
    action, off = POSE[cam.name]
    t = bpy.data.texts.get("Lecteur_Animations.py")
    if t is not None:
        mod = t.as_module()
        if hasattr(mod, "ap_play"):
            mod.ap_play(sc, action)
    else:
        arm, act = bpy.data.objects.get("Armature"), bpy.data.actions.get(action)
        if arm is None or act is None or arm.animation_data is None:
            return
        for tr in arm.animation_data.nla_tracks:
            tr.mute = True
        arm.animation_data.action = act
        sc.frame_start, sc.frame_end = int(act.frame_range[0]), int(act.frame_range[1])
    if bpy.context.screen.is_animation_playing:
        bpy.ops.screen.animation_play()
    sc.frame_set(sc.frame_end if off < 0 else sc.frame_start + off)


def _fps(on):
    """Vue à la première personne : on masque la tête et les cheveux (sinon ils remplissent l'image)."""
    body = bpy.data.objects.get("Body")
    m = body.modifiers.get("MasqueTete") if body else None
    if m:
        m.show_viewport = on
        m.show_render = on
    hair = bpy.data.objects.get("Hair_Twists")
    if hair:
        hair.hide_set(on)


def _switch(self, ctx):
    if _lock:
        return
    sc = ctx.scene
    cam = _cur(sc)
    if cam is None:
        return
    sc.camera = cam
    _ensure_defaults(cam)
    _load_values(sc, cam)
    _set_view('CAMERA')
    _sync_markers(sc)
    _fps(cam.name == "Cam_PremierePersonne")
    _pose(sc, cam)


def _apply(self, ctx):
    if _lock:
        return
    sc = ctx.scene
    cam = _cur(sc)
    if cam is not None:
        _ensure_defaults(cam)
        _place(cam, sc.cp_dist, sc.cp_h, sc.cp_side, sc.cp_fov)


def _sync_markers(sc):
    """Repères visibles seulement en vue libre (en vue caméra ils masqueraient l'image)."""
    c = bpy.data.collections.get(MARK)
    if c is not None:
        c.hide_viewport = _in_camera_view() or not sc.cp_markers


def _markers(self, ctx):
    _sync_markers(ctx.scene)


class CP_OT_refresh(bpy.types.Operator):
    bl_idname = "cp.refresh"
    bl_label = "Actualiser la liste"

    def execute(self, ctx):
        global _lock
        sc = ctx.scene
        sc.cp_items.clear()
        for n in ORDER:
            if n in bpy.data.objects:
                sc.cp_items.add().name = n
        names = [it.name for it in sc.cp_items]
        _lock = True
        try:
            sc.cp_index = names.index(sc.camera.name) if sc.camera and sc.camera.name in names else -1
        finally:
            _lock = False
        cam = _cur(sc)
        if cam is not None:
            _ensure_defaults(cam)
            _load_values(sc, cam)
        return {'FINISHED'}


class CP_OT_step(bpy.types.Operator):
    bl_idname = "cp.step"
    bl_label = "Caméra suivante / précédente"
    d: IntProperty()

    def execute(self, ctx):
        sc = ctx.scene
        n = len(sc.cp_items)
        if n:
            sc.cp_index = (sc.cp_index + self.d) % n if sc.cp_index >= 0 else 0
        return {'FINISHED'}


class CP_OT_free(bpy.types.Operator):
    bl_idname = "cp.free"
    bl_label = "Quitter la caméra (vue libre)"

    def execute(self, ctx):
        _set_view('PERSP')
        _sync_markers(ctx.scene)
        _fps(False)
        return {'FINISHED'}


class CP_OT_reset(bpy.types.Operator):
    bl_idname = "cp.reset"
    bl_label = "Remettre les réglages d'origine"

    def execute(self, ctx):
        sc = ctx.scene
        cam = _cur(sc)
        if cam is None:
            return {'CANCELLED'}
        _ensure_defaults(cam)
        d = list(cam["def"])
        cam["dist"], cam["h"], cam["side"], cam["fov"] = d[0], d[1], d[2], d[3]
        cam["look"] = [d[4], d[5], d[6]]
        _place(cam, d[0], d[1], d[2], d[3])
        _load_values(sc, cam)
        return {'FINISHED'}


class CP_OT_play(bpy.types.Operator):
    bl_idname = "cp.play"
    bl_label = "Lecture / Pause de l'animation"

    def execute(self, ctx):
        bpy.ops.screen.animation_play()
        return {'FINISHED'}


class CP_UL_list(bpy.types.UIList):
    def draw_item(self, ctx, layout, data, item, icon, active_data, prop, index):
        on = ctx.scene.camera is not None and ctx.scene.camera.name == item.name
        layout.label(text=LABEL.get(item.name, item.name), icon='OUTLINER_OB_CAMERA' if on else 'CAMERA_DATA')


class CP_PT_panel(bpy.types.Panel):
    bl_label = "Caméras de jeu"
    bl_idname = "CP_PT_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Caméras"

    def draw(self, ctx):
        l, sc = self.layout, ctx.scene
        if not len(sc.cp_items):
            l.operator("cp.refresh", icon='FILE_REFRESH')
        l.template_list("CP_UL_list", "", sc, "cp_items", sc, "cp_index", rows=5)
        r = l.row(align=True)
        r.scale_y = 1.6
        o = r.operator("cp.step", text="", icon='TRIA_LEFT')
        o.d = -1
        r.operator("cp.free", text="Vue libre", icon='VIEW_PERSPECTIVE')
        o = r.operator("cp.step", text="", icon='TRIA_RIGHT')
        o.d = 1
        cam = _cur(sc)
        if cam is not None:
            b = l.box()
            b.label(text=LABEL.get(cam.name, cam.name), icon='CAMERA_DATA')
            col = b.column(align=True)
            col.prop(sc, "cp_dist")
            col.prop(sc, "cp_h")
            col.prop(sc, "cp_side")
            col.prop(sc, "cp_fov")
            b.operator("cp.reset", icon='LOOP_BACK')
        l.prop(sc, "cp_auto_pose")
        l.prop(sc, "cp_markers")
        l.operator("cp.play", text="Pause" if ctx.screen.is_animation_playing else "Lecture", icon='PAUSE' if ctx.screen.is_animation_playing else 'PLAY')


CLS = (CP_Item, CP_OT_refresh, CP_OT_step, CP_OT_free, CP_OT_reset, CP_OT_play, CP_UL_list, CP_PT_panel)


def register():
    for c in CLS:
        try:
            bpy.utils.unregister_class(c)
        except Exception:
            pass
        bpy.utils.register_class(c)
    S = bpy.types.Scene
    S.cp_items = CollectionProperty(type=CP_Item)
    S.cp_index = IntProperty(default=-1, update=_switch)
    S.cp_auto_pose = BoolProperty(name="Pose du personnage associée", default=True)
    S.cp_markers = BoolProperty(name="Afficher les repères (cônes, rayons)", default=True, update=_markers)
    S.cp_dist = FloatProperty(name="Distance derrière (m)", min=-1.0, max=8.0, step=10, precision=2, update=_apply)
    S.cp_h = FloatProperty(name="Hauteur (m)", min=0.5, max=3.5, step=10, precision=2, update=_apply)
    S.cp_side = FloatProperty(name="Décalage à droite (m)", min=-1.5, max=1.5, step=10, precision=2, update=_apply)
    S.cp_fov = FloatProperty(name="Champ de vision (°)", min=10.0, max=100.0, step=100, precision=0, update=_apply)
    if bpy.context.scene and not len(bpy.context.scene.cp_items):
        bpy.ops.cp.refresh()


def unregister():
    for c in reversed(CLS):
        bpy.utils.unregister_class(c)
    for p in ("cp_items", "cp_index", "cp_auto_pose", "cp_markers", "cp_dist", "cp_h", "cp_side", "cp_fov"):
        try:
            delattr(bpy.types.Scene, p)
        except Exception:
            pass


if __name__ == "__main__":
    register()
