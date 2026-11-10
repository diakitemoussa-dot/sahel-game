# Étape 2 : prototype solo dans le navigateur — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. La partie A pilote Blender (MCP Blender pour trouver l'exécutable, puis Blender en ligne de commande) ; la partie B est du JavaScript testé avec `node --test`. Le code de ce plan n'a pas été exécuté au moment de l'écriture : si une commande ou un paramètre est refusé, corriger en suivant le message d'erreur.

**Goal :** Un jeu jouable seul dans le navigateur : le personnage wax se déplace dans le désert (clavier + souris, manette, écran tactile), avec la caméra par-dessus l'épaule (et la vue première personne en option), le canon du fusil ou du pistolet visant toujours le centre de l'image, et les bonnes animations de tir.

**Architecture :** Blender exporte trois choses : `map.glb` (carte en un seul maillage, couleurs simples), `player.glb` (personnage, armes, `Muzzle`, animations) et des fichiers JSON (caméras, hauteur du terrain, collisions, points d'apparition). Le client three.js lit ces fichiers. Le calcul de visée (`aimsolve.js`) est le même que `tools/blender/s13_aim_bake.py` : on tourne le buste autour de l'os `Spine1` pour amener le canon sur la cible, et le fusil suit la main droite avec un décalage fixe.

**Tech Stack :** Blender 5.2 en ligne de commande (export glTF), three.js 0.170 (modules ES via CDN), Node.js (tests `node --test`), Playwright MCP (vérification dans le navigateur).

**Règles du projet :**
- **Aucun export sans l'accord explicite de l'utilisateur** (règle enregistrée). La tâche A0 est une porte : ne pas lancer A1 à A3 sans un « oui » clair à la question posée.
- Les exports tournent dans un **Blender séparé en arrière-plan** (`--background`) : la session de l'utilisateur, ses panneaux et son fichier ouvert ne sont pas touchés. Le .blend doit être sauvegardé avant.
- Le dossier n'est pas un dépôt git : en fin de tâche, pas de commit, juste une vérification.
- Pas de multijoueur dans cette étape (c'est l'étape 3).

**Chemins :**
- `PROJ` = `C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game`
- `CLIENT` = `PROJ\client`
- `BLEND` = `PROJ\assets\sahel_desert.blend`

**Repères de coordonnées :**
- Blender : x vers l'est, y vers le nord, z en haut. Le personnage regarde vers -Y quand son lacet vaut 0.
- three.js (après export glTF avec Y vers le haut) : `x_three = x_blender`, `y_three = z_blender`, `z_three = -y_blender`. Le personnage regarde donc vers +Z quand `yaw = 0`.
- Les fichiers JSON de configuration restent en coordonnées Blender ; le client convertit avec `x_b = x_three`, `y_b = -z_three`.
- En three.js, pour un lacet `yaw` : avant `f = (sin yaw, 0, cos yaw)` ; droite `r = f × haut`. Tourner la souris vers la droite fait **diminuer** `yaw`.

## Structure des fichiers

```
tools/blender/
  s20_export_map.py        Blender (arrière-plan) : carte -> client/assets/map.glb
  s21_export_player.py     Blender (arrière-plan) : personnage + animations -> client/assets/player.glb
  s22_export_config.py     Blender (arrière-plan) : JSON de configuration -> client/config/
client/
  package.json             scripts de test, three pour les tests
  index.html               page, carte d'import three.js, viseur, aide
  config/clips.json        liste des animations à exporter (source de vérité)
  config/cameras.json      (généré)  config/spawns.json (généré)
  config/heightmap.json    (généré)  config/colliders.json (généré)
  assets/map.glb, assets/player.glb   (générés)
  src/heightmap.js         hauteur du terrain (interpolation bilinéaire)       [testé]
  src/colliders.js         collisions cercle/boîte, repousser le joueur        [testé]
  src/aimsolve.js          rotation qui amène le canon sur la cible            [testé]
  src/animstate.js         choix de l'animation selon l'état du joueur         [testé]
  src/input.js             clavier + souris, manette, écran tactile -> un seul état
  src/world.js             chargement de la carte et des JSON, sol, collisions, rayon
  src/camera.js            caméras de jeu (états, lissage, tangage)
  src/player.js            personnage : déplacement, animations, fusil à la main, visée
  src/hud.js               viseur, texte d'aide
  src/main.js              boucle de jeu
  tests/*.test.mjs         tests node
```

---

## PARTIE A : export depuis Blender

### Task A0 : Porte d'accord et préparation

**Files :**
- Create : `client/config/clips.json`

- [ ] **Step 1 : Demander l'accord à l'utilisateur**

Poser cette question et attendre une réponse claire : « Je lance l'export vers le jeu : carte, personnage avec ses animations, et fichiers de configuration, dans `Sahel-Game/client`. Ton fichier Blender n'est pas modifié. Je peux y aller ? » Ne continuer qu'après un « oui ».

- [ ] **Step 2 : Sauvegarder le .blend dans la session de l'utilisateur**

Dans `execute_blender_code` :

```python
import bpy
print(bpy.ops.wm.save_mainfile(), bpy.data.filepath)
print("EXE_BLENDER =", bpy.app.binary_path)
```

Attendu : le chemin de `sahel_desert.blend` et le chemin de `blender.exe`. Noter `EXE_BLENDER` pour les commandes suivantes.

- [ ] **Step 3 : Créer `client/config/clips.json`**

Source de vérité : les animations exportées. L'export Blender et un test JavaScript la lisent.

```json
{
  "export": [
    "Idle", "Walk", "Run", "Walk Backward", "Jump", "Land", "Hit Reaction", "Death", "Victory", "Wave", "Crouch Idle",
    "Melee Punch",
    "Rifle Idle", "Rifle Walk", "Rifle Run", "Rifle Walk Backward", "Rifle Crouch Walk", "Rifle Kneel", "Rifle Jump",
    "Rifle Reload", "Rifle Death", "Rifle Aim", "Rifle Fire", "Rifle Aim Sniper", "Rifle Fire Sniper",
    "Rifle Walk Tir", "Rifle Run Tir", "Rifle Walk Backward Tir", "Rifle Crouch Walk Tir", "Rifle Kneel Tir", "Rifle Jump Tir",
    "Pistol Draw", "Pistol Idle", "Pistol Walk", "Pistol Run", "Pistol Walk Backward", "Pistol Strafe", "Pistol Kneel", "Pistol Jump", "Pistol Whip",
    "Pistol Idle Tir", "Pistol Walk Tir", "Pistol Run Tir", "Pistol Walk Backward Tir", "Pistol Strafe Tir", "Pistol Kneel Tir", "Pistol Jump Tir"
  ]
}
```

---

### Task A1 : Export de la carte

**Files :**
- Create : `tools/blender/s20_export_map.py`
- Generate : `client/assets/map.glb`

La carte est fusionnée en un seul maillage (un seul objet, un matériau par couleur) pour limiter le nombre d'appels de dessin. Les matériaux procéduraux de Blender ne s'exportent pas : on les remplace, pour l'export seulement, par une couleur moyenne simple. La texture détaillée viendra plus tard (cuisson des textures).

- [ ] **Step 1 : Écrire le script**

```python
"""Export de la carte (Blender en arrière-plan). Usage : blender -b fichier.blend --python s20_export_map.py -- <dossier client>"""
import os, sys
import bpy

CLIENT = sys.argv[sys.argv.index("--") + 1]
STATIC = ("Terrain", "Camp", "Oasis", "Village", "Fort", "Props", "Cabanes")


def mat_params(mat):
    """Couleur moyenne (milieu de la rampe de couleurs si elle existe), rugosité, opacité."""
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if mat.use_nodes else None
    ramp = next((n for n in mat.node_tree.nodes if n.type == "VALTORGB"), None) if mat.use_nodes else None
    rough = bsdf.inputs["Roughness"].default_value if bsdf else 0.9
    alpha = bsdf.inputs["Alpha"].default_value if bsdf else 1.0
    if ramp is not None:
        color = tuple(ramp.color_ramp.evaluate(0.5)[:3])
    elif bsdf is not None:
        color = tuple(bsdf.inputs["Base Color"].default_value[:3])
    else:
        color = tuple(mat.diffuse_color[:3])
    return color, rough, alpha


def simple_material(src):
    name = "G_" + src.name
    m = bpy.data.materials.get(name)
    if m is None:
        color, rough, alpha = mat_params(src)
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Base Color"].default_value = (*color, 1.0)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Alpha"].default_value = alpha
        if alpha < 1.0:
            try:
                m.surface_render_method = 'BLENDED'
            except Exception:
                pass
    return m


def static_objects():
    out = []
    for cname in STATIC:
        c = bpy.data.collections.get(cname)
        if c is None:
            continue
        for o in c.all_objects:
            if o.type == 'MESH' and not o.get("helper") and len(o.data.polygons) > 0:
                out.append(o)
    return out


objs = static_objects()
print("objets statiques:", len(objs))
for o in objs:
    o.hide_set(False)
    o.hide_viewport = False
    for slot in o.material_slots:
        if slot.material is not None:
            slot.material = simple_material(slot.material)

bpy.ops.object.select_all(action='DESELECT')
terrain = bpy.data.objects["Sol_Desert"]
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = terrain
bpy.ops.object.join()
joined = bpy.context.view_layer.objects.active
joined.name = "Carte"
tris = 0
joined.data.calc_loop_triangles()
tris = len(joined.data.loop_triangles)
print("carte fusionnée:", len(joined.data.vertices), "sommets,", tris, "triangles,", len(joined.data.materials), "matériaux")

os.makedirs(os.path.join(CLIENT, "assets"), exist_ok=True)
out = os.path.join(CLIENT, "assets", "map.glb")
bpy.ops.object.select_all(action='DESELECT')
joined.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=True, export_materials='EXPORT', export_cameras=False,
                          export_lights=False, export_animations=False)
print("EXPORT OK:", out, round(os.path.getsize(out) / 1e6, 1), "Mo")
```

- [ ] **Step 2 : Lancer l'export** (PowerShell ; remplacer `<EXE_BLENDER>` par la valeur notée en A0)

```powershell
$P = "C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
& "<EXE_BLENDER>" --background "$P\assets\sahel_desert.blend" --python "$P\tools\blender\s20_export_map.py" -- "$P\client"
```

Attendu : des lignes `objets statiques: ...`, `carte fusionnée: ...`, puis `EXPORT OK: ...\map.glb <taille> Mo`. Si l'exporteur refuse un paramètre (par exemple `export_apply`), retirer ce paramètre du script et relancer.

- [ ] **Step 3 : Vérifier le fichier**

```powershell
Get-Item "$P\client\assets\map.glb" | Select-Object Name, Length
```

Attendu : un fichier de quelques à quelques dizaines de Mo. S'il pèse plus de 40 Mo, le signaler à l'utilisateur avant de continuer.

---

### Task A2 : Export du personnage et des animations

**Files :**
- Create : `tools/blender/s21_export_player.py`
- Generate : `client/assets/player.glb`

Le script place le personnage à l'origine, ne garde que les animations de `clips.json` (une piste par animation, nommée comme l'animation), fige l'avance horizontale des hanches (les animations avancent toutes seules, le jeu décide de la position) et exporte armature, corps, vêtements, cheveux, armes et points `Muzzle`.

- [ ] **Step 1 : Écrire le script**

```python
"""Export du personnage (Blender en arrière-plan). Usage : blender -b fichier.blend --python s21_export_player.py -- <dossier client>"""
import json, math, os, sys
import bpy

CLIENT = sys.argv[sys.argv.index("--") + 1]
KEEP = json.load(open(os.path.join(CLIENT, "config", "clips.json"), encoding="utf-8"))["export"]
OBJECTS = ["Armature", "Body", "Hoodie", "Hair_Twists", "Pants", "Shoes", "Rifle", "Rifle_Mag", "Pistol", "Muzzle", "Muzzle_Pistol"]

arm = bpy.data.objects["Armature"]
arm.location = (0.0, 0.0, 0.0)               # personnage à l'origine, debout, face à -Y
arm.rotation_euler = (math.radians(90), 0.0, 0.0)
arm.hide_set(False)

# le masque de tête (essai première personne) ne doit pas partir dans le fichier
body = bpy.data.objects["Body"]
m = body.modifiers.get("MasqueTete")
if m is not None:
    body.modifiers.remove(m)


def fcurves_of(a):
    try:
        return list(a.fcurves)
    except Exception:
        return [fc for L in a.layers for S in L.strips for cb in S.channelbags for fc in cb.fcurves]


# 1) une piste par animation à exporter, rien d'autre
ad = arm.animation_data
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
ad.action = None
missing = []
for name in KEEP:
    act = bpy.data.actions.get(name)
    if act is None:
        missing.append(name)
        continue
    # 2) l'avance horizontale des hanches est figée (axe Z local = avant chez Mixamo) : le jeu décide de la position
    for fc in fcurves_of(act):
        if fc.data_path == 'pose.bones["mixamorig4:Hips"].location' and fc.array_index == 2 and len(fc.keyframe_points):
            v0 = fc.keyframe_points[0].co[1]
            for kp in fc.keyframe_points:
                kp.co[1] = v0
                kp.handle_left[1] = v0
                kp.handle_right[1] = v0
            fc.update()
    tr = ad.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, int(act.frame_range[0]), act)
    st.name = name
assert not missing, "animations introuvables: %s" % missing
print("animations exportées:", len(KEEP))

# 3) sélection et export
for o in bpy.data.objects:
    o.select_set(False)
for n in OBJECTS:
    o = bpy.data.objects[n]
    o.hide_set(False)
    o.hide_viewport = False
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
os.makedirs(os.path.join(CLIENT, "assets"), exist_ok=True)
out = os.path.join(CLIENT, "assets", "player.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=False, export_skins=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                          export_cameras=False, export_lights=False, export_image_format='AUTO')
print("EXPORT OK:", out, round(os.path.getsize(out) / 1e6, 1), "Mo")
```

- [ ] **Step 2 : Lancer l'export**

```powershell
& "<EXE_BLENDER>" --background "$P\assets\sahel_desert.blend" --python "$P\tools\blender\s21_export_player.py" -- "$P\client"
```

Attendu : `animations exportées: 47` puis `EXPORT OK: ...\player.glb <taille> Mo`. Si le mode `NLA_TRACKS` est refusé, remplacer par `export_animation_mode='ACTIONS'` et, avant l'export, supprimer du script de la session les actions qui ne sont pas dans `KEEP` (`bpy.data.actions.remove`).

- [ ] **Step 3 : Vérifier le contenu du fichier avec Node**

Créer `client/tests/inspect_glb.mjs` :

```js
// Usage : node tests/inspect_glb.mjs assets/player.glb
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const names = (json.nodes || []).map(n => n.name);
console.log('animations :', (json.animations || []).length);
console.log('noeuds clés :', ['Muzzle', 'Muzzle_Pistol', 'Weapon', 'Rifle', 'Pistol', 'mixamorig4:Spine1', 'mixamorig4:RightHand', 'mixamorig4:Head']
  .map(k => `${k}=${names.some(n => n === k || n === k.replace(':', '')) ? 'oui' : 'NON'}`).join(' | '));
console.log('maillages :', (json.meshes || []).length, '| peaux :', (json.skins || []).length);
```

Lancer : `cd "$P\client"; node tests\inspect_glb.mjs assets\player.glb`.

Attendu : `animations : 47`, tous les nœuds clés à `oui`. Si un nœud manque (par exemple `Weapon`), le client ne trouvera pas l'os : corriger l'export avant de continuer.

---

### Task A3 : Export de la configuration (JSON)

**Files :**
- Create : `tools/blender/s22_export_config.py`
- Generate : `client/config/cameras.json`, `spawns.json`, `heightmap.json`, `colliders.json`

- [ ] **Step 1 : Écrire le script**

```python
"""Export de la configuration (Blender en arrière-plan). Usage : blender -b fichier.blend --python s22_export_config.py -- <dossier client>"""
import json, math, os, sys
import bpy
from mathutils import Vector

CLIENT = sys.argv[sys.argv.index("--") + 1]
sys.path.insert(0, os.path.join(os.path.dirname(bpy.data.filepath), "..", "tools", "blender"))
import common as C

CFG = os.path.join(CLIENT, "config")
os.makedirs(CFG, exist_ok=True)


def dump(name, data):
    with open(os.path.join(CFG, name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("écrit:", name, os.path.getsize(os.path.join(CFG, name)), "octets")


# --- caméras de jeu (distance derrière, hauteur, décalage à droite, champ vertical, point visé en repère du joueur)
cams = {}
for o in bpy.data.collections["Cameras_Jeu"].objects:
    if o.type == 'CAMERA':
        cams[o.name] = dict(dist=round(o["dist"], 3), h=round(o["h"], 3), side=round(o["side"], 3),
                            fov=round(o["fov"], 1), look=[round(v, 3) for v in o["look"]])
dump("cameras.json", cams)

# --- points d'apparition et objectifs (coordonnées Blender)
sp = {}
for o in bpy.data.objects:
    if o.type == 'EMPTY' and o.name.startswith(("Spawn_", "Obj_")):
        t = o.matrix_world.translation
        sp[o.name] = [round(t.x, 2), round(t.y, 2), round(t.z, 2)]
dump("spawns.json", sp)

# --- hauteur du terrain (même fonction que le maillage), grille de 2,5 m
n, step, x0, y0 = 201, 2.5, -250.0, -250.0
h = [round(C.height_at(x0 + i * step, y0 + j * step), 3) for j in range(n) for i in range(n)]
dump("heightmap.json", dict(n=n, step=step, x0=x0, y0=y0, h=h))

# --- collisions 2D : cercles (tours, minarets, troncs, rochers) et boîtes tournées (murs, maisons)
CIRCLE_PREFIX = ("Tour_", "Mosquee_Minaret_", "Puits_Margelle", "Rocher_")
BOX_PREFIX = ("Mosquee_Salle", "Muret_", "Rempart_", "Donjon", "Toguna_Pilier")
cols = []
for cname in ("Camp", "Oasis", "Village", "Fort", "Props", "Cabanes"):
    c = bpy.data.collections.get(cname)
    if c is None:
        continue
    for o in c.all_objects:
        if o.type != 'MESH' or o.get("helper"):
            continue
        nm = o.name
        d = o.dimensions
        mw = o.matrix_world
        centre = mw @ (sum((Vector(b) for b in o.bound_box), Vector()) / 8.0)   # centre de la boîte englobante, en monde
        if nm.startswith(CIRCLE_PREFIX) or nm.endswith("_Tronc"):
            cols.append(dict(t="c", x=round(centre.x, 2), y=round(centre.y, 2), r=round(max(d.x, d.y) / 2.0, 2)))
        elif (nm.startswith("Maison_") and "Acrotere" not in nm) or nm.startswith(BOX_PREFIX) or "_Mur" in nm:
            if nm.startswith("Donjon_Breche"):
                continue
            cols.append(dict(t="b", x=round(centre.x, 2), y=round(centre.y, 2), hx=round(d.x / 2.0, 2),
                             hy=round(d.y / 2.0, 2), yaw=round(mw.to_euler().z, 4)))
print("collisions:", len(cols))
dump("colliders.json", cols)
```

- [ ] **Step 2 : Lancer l'export**

```powershell
& "<EXE_BLENDER>" --background "$P\assets\sahel_desert.blend" --python "$P\tools\blender\s22_export_config.py" -- "$P\client"
```

Attendu : quatre lignes `écrit: ...`, avec `collisions:` entre 150 et 400.

- [ ] **Step 3 : Vérifier les valeurs**

```powershell
node -e "const c=require('$($P -replace '\\','/')/client/config/cameras.json'); console.log(Object.keys(c).join(', ')); console.log(c.Cam_Exploration)"
```

Attendu : les 6 caméras (dont `Cam_PremierePersonne`), et pour `Cam_Exploration` : `dist: 3.2, h: 1.9, side: 0.6, fov: 60`.

---

## PARTIE B : le client dans le navigateur

### Task B1 : Squelette du client et environnement de test

**Files :**
- Create : `client/package.json`, `client/index.html`

- [ ] **Step 1 : Vérifier Node**

Run : `node --version` et `npm --version`.
Attendu : une version de Node 18 ou plus. Sinon, informer l'utilisateur qu'il faut installer Node.js avant de continuer.

- [ ] **Step 2 : Écrire `client/package.json`**

```json
{
  "name": "sahel-client",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "serve": "python -m http.server 8080"
  },
  "devDependencies": {
    "three": "0.170.0"
  }
}
```

- [ ] **Step 3 : Installer**

Run : `cd "$P\client"; npm install`
Attendu : dossier `node_modules/three` créé, aucune erreur.

- [ ] **Step 4 : Écrire `client/index.html`**

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>Sahel Game - prototype</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #87a7c9; font-family: system-ui, sans-serif; touch-action: none; }
  #c { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
  #cross { position: fixed; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; pointer-events: none; }
  #cross:before, #cross:after { content: ""; position: absolute; background: #fff; opacity: .9; box-shadow: 0 0 2px #000; }
  #cross:before { left: 10px; top: 0; width: 2px; height: 22px; }
  #cross:after { top: 10px; left: 0; height: 2px; width: 22px; }
  #hud { position: fixed; left: 12px; bottom: 12px; color: #fff; text-shadow: 0 0 3px #000; font-size: 14px; line-height: 1.4; pointer-events: none; white-space: pre; }
  #msg { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; text-shadow: 0 0 4px #000;
         font-size: 20px; text-align: center; background: rgba(0,0,0,.35); pointer-events: none; }
  .tbtn { position: fixed; width: 64px; height: 64px; border-radius: 50%; background: rgba(255,255,255,.25); border: 2px solid rgba(255,255,255,.6);
          color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; user-select: none; }
  #stick { position: fixed; left: 24px; bottom: 24px; width: 130px; height: 130px; border-radius: 50%; background: rgba(255,255,255,.18); border: 2px solid rgba(255,255,255,.5); }
  #knob { position: absolute; left: 45px; top: 45px; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,.6); }
</style>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
} }
</script>
</head>
<body>
<canvas id="c"></canvas>
<div id="cross"></div>
<div id="hud"></div>
<div id="msg">Chargement…</div>
<script type="module" src="src/main.js"></script>
</body>
</html>
```

---

### Task B2 : Hauteur du terrain (test d'abord)

**Files :**
- Test : `client/tests/heightmap.test.mjs`
- Create : `client/src/heightmap.js`

- [ ] **Step 1 : Écrire le test qui échoue**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleHeight } from '../src/heightmap.js';

// carte 3x3 où la hauteur vaut x (0, 1, 2) sur chaque ligne
const hm = { x0: 0, y0: 0, step: 1, n: 3, h: [0, 1, 2, 0, 1, 2, 0, 1, 2] };

test('interpolation bilinéaire', () => {
  assert.equal(sampleHeight(hm, 0.5, 1), 0.5);
  assert.equal(sampleHeight(hm, 1.25, 0.3), 1.25);
});

test('hors de la carte : valeur du bord', () => {
  assert.equal(sampleHeight(hm, -5, 1), 0);
  assert.equal(sampleHeight(hm, 99, 1), 2);
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `cd "$P\client"; node --test tests/heightmap.test.mjs`
Attendu : échec, module `../src/heightmap.js` introuvable.

- [ ] **Step 3 : Implémenter**

```js
// Hauteur du terrain en (x, y) en coordonnées Blender. La grille est rangée ligne par ligne (x varie le plus vite).
export function sampleHeight(hm, x, y) {
  const fx = (x - hm.x0) / hm.step;
  const fy = (y - hm.y0) / hm.step;
  const i = Math.max(0, Math.min(hm.n - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(hm.n - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - i));
  const ty = Math.max(0, Math.min(1, fy - j));
  const h = (a, b) => hm.h[b * hm.n + a];
  return h(i, j) * (1 - tx) * (1 - ty) + h(i + 1, j) * tx * (1 - ty)
       + h(i, j + 1) * (1 - tx) * ty + h(i + 1, j + 1) * tx * ty;
}
```

- [ ] **Step 4 : Vérifier la réussite**

Run : `node --test tests/heightmap.test.mjs`
Attendu : 2 tests passent.

---

### Task B3 : Collisions (test d'abord)

**Files :**
- Test : `client/tests/colliders.test.mjs`
- Create : `client/src/colliders.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { pushOut } from '../src/colliders.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('cercle : le joueur est repoussé', () => {
  const p = { x: 1.2, y: 0 };
  pushOut(p, 0.4, [{ t: 'c', x: 0, y: 0, r: 1 }]);
  assert.ok(near(p.x, 1.4) && near(p.y, 0));
});

test('boîte : repoussé par la face', () => {
  const p = { x: 1.2, y: 0 };
  pushOut(p, 0.5, [{ t: 'b', x: 0, y: 0, hx: 1, hy: 1, yaw: 0 }]);
  assert.ok(near(p.x, 1.5) && near(p.y, 0));
});

test('boîte tournée de 90 degrés', () => {
  const p = { x: 0, y: 2.2 };
  pushOut(p, 0.5, [{ t: 'b', x: 0, y: 0, hx: 2, hy: 0.5, yaw: Math.PI / 2 }]);
  assert.ok(near(p.x, 0) && near(p.y, 2.5));
});

test('centre dans la boîte : le joueur ressort par le bord le plus proche', () => {
  const p = { x: 0.9, y: 0 };
  pushOut(p, 0.5, [{ t: 'b', x: 0, y: 0, hx: 1, hy: 1, yaw: 0 }]);
  assert.ok(near(p.x, 1.5));
});

test('loin de tout : inchangé', () => {
  const p = { x: 10, y: 10 };
  pushOut(p, 0.4, [{ t: 'c', x: 0, y: 0, r: 1 }, { t: 'b', x: 0, y: 0, hx: 1, hy: 1, yaw: 0 }]);
  assert.deepEqual(p, { x: 10, y: 10 });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `node --test tests/colliders.test.mjs`
Attendu : échec, module introuvable.

- [ ] **Step 3 : Implémenter**

```js
// Repousse le joueur (cercle de rayon `radius`, position {x, y} en coordonnées Blender) hors des obstacles.
// Obstacle cercle : {t:'c', x, y, r}. Obstacle boîte : {t:'b', x, y, hx, hy, yaw} (demi-dimensions, rotation autour de Z).
export function pushOut(pos, radius, colliders) {
  for (const c of colliders) {
    if (c.t === 'c') {
      const dx = pos.x - c.x, dy = pos.y - c.y;
      const d = Math.hypot(dx, dy), m = radius + c.r;
      if (d < m) {
        if (d > 1e-6) { const k = (m - d) / d; pos.x += dx * k; pos.y += dy * k; }
        else { pos.x += m; }
      }
    } else {
      const cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw);
      const dx = pos.x - c.x, dy = pos.y - c.y;
      const lx = dx * cs - dy * sn, ly = dx * sn + dy * cs;       // position dans le repère de la boîte
      const qx = Math.max(-c.hx, Math.min(c.hx, lx));
      const qy = Math.max(-c.hy, Math.min(c.hy, ly));
      const ox = lx - qx, oy = ly - qy;
      const d = Math.hypot(ox, oy);
      if (d < radius) {
        let nx, ny, push;
        if (d > 1e-6) { nx = ox / d; ny = oy / d; push = radius - d; }
        else {
          const px = c.hx - Math.abs(lx), py = c.hy - Math.abs(ly);
          if (px < py) { nx = Math.sign(lx) || 1; ny = 0; push = px + radius; }
          else { nx = 0; ny = Math.sign(ly) || 1; push = py + radius; }
        }
        pos.x += (nx * Math.cos(c.yaw) - ny * Math.sin(c.yaw)) * push;
        pos.y += (nx * Math.sin(c.yaw) + ny * Math.cos(c.yaw)) * push;
      }
    }
  }
  return pos;
}
```

- [ ] **Step 4 : Vérifier la réussite**

Run : `node --test tests/colliders.test.mjs`
Attendu : 5 tests passent.

---

### Task B4 : Calcul de visée du canon (test d'abord)

**Files :**
- Test : `client/tests/aimsolve.test.mjs`
- Create : `client/src/aimsolve.js`

C'est le même calcul que `tools/blender/s13_aim_bake.py` : on cherche la rotation autour d'un pivot (l'os `Spine1`) qui amène l'axe du canon sur la direction du point visé, en répétant le calcul car le canon bouge quand on tourne.

- [ ] **Step 1 : Écrire les tests qui échouent**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { solveAim, limitRotation } from '../src/aimsolve.js';

test('après rotation, le canon vise la cible', () => {
  const pivot = new THREE.Vector3(0, 1.3, 0);
  const muzzlePos = new THREE.Vector3(0.3, 1.2, 0.6);
  const muzzleDir = new THREE.Vector3(0.6, 0.1, 0.8).normalize();
  const target = new THREE.Vector3(0, 1.5, 30);
  const R = solveAim(pivot, muzzlePos, muzzleDir, target, 5);
  const newPos = muzzlePos.clone().sub(pivot).applyQuaternion(R).add(pivot);
  const newDir = muzzleDir.clone().applyQuaternion(R);
  const want = target.clone().sub(newPos).normalize();
  assert.ok(newDir.angleTo(want) < 1e-3, 'écart ' + newDir.angleTo(want));
});

test('canon déjà aligné : rotation nulle', () => {
  const R = solveAim(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0.5), new THREE.Vector3(0, 0, 1),
                     new THREE.Vector3(0, 1, 30), 5);
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(R.w))) < 1e-3);
});

test('la rotation est limitée', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.5);
  const l = limitRotation(q, 0.5);
  assert.ok(Math.abs(2 * Math.acos(Math.abs(l.w)) - 0.5) < 1e-6);
});

test('une petite rotation est conservée', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.2);
  const l = limitRotation(q, 0.5);
  assert.ok(Math.abs(l.x - q.x) < 1e-9 && Math.abs(l.w - q.w) < 1e-9);
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `node --test tests/aimsolve.test.mjs`
Attendu : échec, module introuvable.

- [ ] **Step 3 : Implémenter**

```js
import * as THREE from 'three';

/** Rotation (quaternion, repère monde) à appliquer autour de `pivot` pour que le canon vise `target`.
 *  muzzlePos / muzzleDir : position et direction de tir actuelles du canon. */
export function solveAim(pivot, muzzlePos, muzzleDir, target, iterations = 5) {
  const R = new THREE.Quaternion();
  const mp = new THREE.Vector3(), md = new THREE.Vector3(), want = new THREE.Vector3();
  const step = new THREE.Quaternion();
  for (let i = 0; i < iterations; i++) {
    mp.copy(muzzlePos).sub(pivot).applyQuaternion(R).add(pivot);
    md.copy(muzzleDir).applyQuaternion(R).normalize();
    want.copy(target).sub(mp).normalize();
    step.setFromUnitVectors(md, want);
    R.premultiply(step);
  }
  return R;
}

/** Limite l'angle d'une rotation (en radians) en gardant son axe. */
export function limitRotation(q, maxRad) {
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  if (angle <= maxRad) return q;
  const axis = new THREE.Vector3(q.x, q.y, q.z).normalize();
  if (q.w < 0) axis.negate();
  return new THREE.Quaternion().setFromAxisAngle(axis, maxRad);
}
```

- [ ] **Step 4 : Vérifier la réussite**

Run : `node --test tests/aimsolve.test.mjs`
Attendu : 4 tests passent.

---

### Task B5 : Choix de l'animation (test d'abord)

**Files :**
- Test : `client/tests/animstate.test.mjs`
- Create : `client/src/animstate.js`

Reprend le tableau de `docs/viser-au-centre.md`. Par défaut le joueur est « prêt » (`raised = true`) : le canon est toujours pointé, donc les versions « Tir » sont utilisées.

- [ ] **Step 1 : Écrire les tests qui échouent**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickClip } from '../src/animstate.js';

const exported = new Set(JSON.parse(readFileSync(new URL('../config/clips.json', import.meta.url), 'utf8')).export);
const base = { weapon: 'rifle', crouch: false, move: 'idle', raised: true, sniper: false, airborne: false, downed: false, dead: false };
const pick = (o) => pickClip({ ...base, ...o });

test('fusil prêt : immobile, course, recul', () => {
  assert.equal(pick({}).clip, 'Rifle Aim');
  assert.equal(pick({ move: 'run' }).clip, 'Rifle Run Tir');
  assert.equal(pick({ move: 'back' }).clip, 'Rifle Walk Backward Tir');
});

test('fusil baissé : animations d\'origine', () => {
  assert.equal(pick({ raised: false, move: 'walk' }).clip, 'Rifle Walk');
  assert.equal(pick({ raised: false }).clip, 'Rifle Idle');
});

test('accroupi', () => {
  assert.equal(pick({ crouch: true }).clip, 'Rifle Kneel Tir');
  assert.equal(pick({ crouch: true, move: 'walk' }).clip, 'Rifle Crouch Walk Tir');
});

test('pistolet prêt', () => {
  assert.equal(pick({ weapon: 'pistol' }).clip, 'Pistol Idle Tir');
  assert.equal(pick({ weapon: 'pistol', move: 'side' }).clip, 'Pistol Strafe Tir');
  assert.equal(pick({ weapon: 'pistol', crouch: true }).clip, 'Pistol Kneel Tir');
});

test('tireur d\'élite immobile', () => {
  assert.equal(pick({ sniper: true }).clip, 'Rifle Aim Sniper');
});

test('saut, mort, à terre : une seule fois, jamais en boucle', () => {
  assert.equal(pick({ airborne: true }).clip, 'Rifle Jump Tir');
  assert.equal(pick({ airborne: true }).once, true);
  assert.equal(pick({ dead: true }).clip, 'Rifle Death');
  assert.equal(pick({ downed: true }).clip, 'Rifle Death');
  assert.equal(pick({ downed: true }).clamp, true);
});

test('toutes les animations choisies sont exportées', () => {
  for (const weapon of ['rifle', 'pistol', 'none'])
    for (const crouch of [false, true])
      for (const move of ['idle', 'walk', 'run', 'back', 'side'])
        for (const raised of [false, true])
          for (const sniper of [false, true])
            for (const airborne of [false, true])
              for (const dead of [false, true])
                for (const downed of [false, true]) {
                  const c = pick({ weapon, crouch, move, raised, sniper, airborne, dead, downed }).clip;
                  assert.ok(exported.has(c), `animation non exportée : ${c}`);
                }
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `node --test tests/animstate.test.mjs`
Attendu : échec, module introuvable.

- [ ] **Step 3 : Implémenter**

```js
/** Choisit l'animation selon l'état du joueur.
 *  state : { weapon: 'rifle'|'pistol'|'none', crouch, move: 'idle'|'walk'|'run'|'back'|'side',
 *            raised (arme levée : le canon vise le centre), sniper, airborne, downed, dead }
 *  Retourne { clip, once?, clamp? }. */
export function pickClip(s) {
  const w = s.weapon;
  if (s.dead) return { clip: w === 'rifle' ? 'Rifle Death' : 'Death', once: true, clamp: true };
  if (s.downed) return { clip: 'Rifle Death', once: true, clamp: true };
  const tir = s.raised && (w === 'rifle' || w === 'pistol');
  const m = s.move;
  if (s.airborne) {
    if (w === 'rifle') return { clip: tir ? 'Rifle Jump Tir' : 'Rifle Jump', once: true };
    if (w === 'pistol') return { clip: tir ? 'Pistol Jump Tir' : 'Pistol Jump', once: true };
    return { clip: 'Jump', once: true };
  }
  const crouchMove = s.crouch && m !== 'idle';
  if (w === 'rifle') {
    if (s.sniper && m === 'idle' && !s.crouch) return { clip: 'Rifle Aim Sniper' };
    if (tir) {
      if (s.crouch) return { clip: crouchMove ? 'Rifle Crouch Walk Tir' : 'Rifle Kneel Tir' };
      return { clip: { idle: 'Rifle Aim', walk: 'Rifle Walk Tir', run: 'Rifle Run Tir', back: 'Rifle Walk Backward Tir', side: 'Rifle Run Tir' }[m] };
    }
    if (s.crouch) return { clip: crouchMove ? 'Rifle Crouch Walk' : 'Rifle Kneel' };
    return { clip: { idle: 'Rifle Idle', walk: 'Rifle Walk', run: 'Rifle Run', back: 'Rifle Walk Backward', side: 'Rifle Run' }[m] };
  }
  if (w === 'pistol') {
    if (s.crouch) return { clip: tir ? 'Pistol Kneel Tir' : 'Pistol Kneel' };
    const base = { idle: 'Pistol Idle', walk: 'Pistol Walk', run: 'Pistol Run', back: 'Pistol Walk Backward', side: 'Pistol Strafe' }[m];
    return { clip: tir ? base + ' Tir' : base };
  }
  if (s.crouch) return { clip: 'Crouch Idle' };
  return { clip: { idle: 'Idle', walk: 'Walk', run: 'Run', back: 'Walk Backward', side: 'Run' }[m] };
}
```

- [ ] **Step 4 : Vérifier la réussite et lancer toute la suite**

Run : `node --test tests/`
Attendu : tous les tests de B2 à B5 passent (heightmap 2, colliders 5, aimsolve 4, animstate 7).

---

### Task B6 : Commandes (clavier, souris, manette, tactile)

**Files :**
- Create : `client/src/input.js`

- [ ] **Step 1 : Écrire le module**

```js
// Une seule lecture par image : poll() renvoie l'état des commandes, quelle que soit la source.
// Clavier : touches physiques (KeyW = Z sur AZERTY). Souris : verrouillage du pointeur au clic.
const DEAD = 0.15;
const ax = (v) => (Math.abs(v) < DEAD ? 0 : v);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.lookX = 0; this.lookY = 0;
    this.mouse = { left: false, right: false };
    this.t = { move: { x: 0, y: 0 }, fire: false, aim: false, jump: false, crouch: false, weapon: false, lookX: 0, lookY: 0 };
    this.padPrev = {};
    this.override = {};              // pour les tests automatiques : fusionné dans le résultat de poll()
    this.isTouch = matchMedia('(pointer: coarse)').matches;

    addEventListener('keydown', (e) => { if (!e.repeat) this.pressed.add(e.code); this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('click', () => {
      if (!this.isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    if (this.isTouch) this._buildTouchUI();
  }

  _buildTouchUI() {
    const stick = document.createElement('div'); stick.id = 'stick';
    const knob = document.createElement('div'); knob.id = 'knob'; stick.appendChild(knob);
    document.body.appendChild(stick);
    const setStick = (touch) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (touch.clientX - cx) / (r.width / 2), dy = (touch.clientY - cy) / (r.height / 2);
      const n = Math.hypot(dx, dy); if (n > 1) { dx /= n; dy /= n; }
      this.t.move.x = dx; this.t.move.y = -dy;
      knob.style.left = 45 + dx * 45 + 'px'; knob.style.top = 45 + dy * 45 + 'px';
    };
    let stickId = null;
    stick.addEventListener('touchstart', (e) => { stickId = e.changedTouches[0].identifier; setStick(e.changedTouches[0]); e.preventDefault(); }, { passive: false });
    stick.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) setStick(t); e.preventDefault(); }, { passive: false });
    const endStick = (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) {
      stickId = null; this.t.move.x = 0; this.t.move.y = 0; knob.style.left = '45px'; knob.style.top = '45px'; } };
    stick.addEventListener('touchend', endStick); stick.addEventListener('touchcancel', endStick);

    // glisser le doigt dans la moitié droite de l'écran : caméra
    let lookId = null, lx = 0, ly = 0;
    addEventListener('touchstart', (e) => { for (const t of e.changedTouches)
      if (lookId === null && t.clientX > innerWidth * 0.5 && !t.target.classList?.contains('tbtn')) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; } });
    addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) {
      this.t.lookX += (t.clientX - lx) * 0.5; this.t.lookY += (t.clientY - ly) * 0.5; lx = t.clientX; ly = t.clientY; } });
    const endLook = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    addEventListener('touchend', endLook); addEventListener('touchcancel', endLook);

    const btn = (label, right, bottom, hold, key) => {
      const b = document.createElement('div'); b.className = 'tbtn'; b.textContent = label;
      b.style.right = right + 'px'; b.style.bottom = bottom + 'px'; document.body.appendChild(b);
      b.addEventListener('touchstart', (e) => { this.t[key] = true; e.preventDefault(); }, { passive: false });
      if (hold) { const up = () => { this.t[key] = false; }; b.addEventListener('touchend', up); b.addEventListener('touchcancel', up); }
    };
    btn('TIR', 24, 24, true, 'fire');
    btn('VISER', 100, 24, true, 'aim');
    btn('SAUT', 24, 100, false, 'jump');
    btn('ACCR.', 100, 100, false, 'crouch');
    btn('ARME', 176, 24, false, 'weapon');
  }

  poll() {
    const k = (c) => this.keys.has(c), p = (c) => this.pressed.has(c);
    let mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    let my = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    let lookX = this.lookX * 0.0022, lookY = this.lookY * 0.0022;
    this.lookX = 0; this.lookY = 0;
    let fire = this.mouse.left, aim = this.mouse.right;
    let jump = p('Space'), crouchToggle = p('KeyC'), toggleWeapon = p('KeyQ');
    let weapon = p('Digit1') ? 'rifle' : p('Digit2') ? 'pistol' : null;
    const viewToggle = p('KeyB'), sniperToggle = p('KeyT');

    const pad = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find((g) => g && g.connected);
    if (pad) {
      mx += ax(pad.axes[0] || 0); my += -ax(pad.axes[1] || 0);
      lookX += ax(pad.axes[2] || 0) * 0.045; lookY += ax(pad.axes[3] || 0) * 0.045;
      fire = fire || (pad.buttons[7]?.value ?? 0) > 0.3;       // RT
      aim = aim || (pad.buttons[6]?.value ?? 0) > 0.3;         // LT
      const edge = (i) => { const now = !!pad.buttons[i]?.pressed, was = !!this.padPrev[i]; this.padPrev[i] = now; return now && !was; };
      jump = edge(0) || jump;                                  // A
      crouchToggle = edge(1) || crouchToggle;                  // B
      toggleWeapon = edge(3) || toggleWeapon;                  // Y
    }
    if (this.isTouch) {
      mx += this.t.move.x; my += this.t.move.y;
      lookX += this.t.lookX * 0.004; lookY += this.t.lookY * 0.004; this.t.lookX = 0; this.t.lookY = 0;
      fire = fire || this.t.fire; aim = aim || this.t.aim;
      if (this.t.jump) { jump = true; this.t.jump = false; }
      if (this.t.crouch) { crouchToggle = true; this.t.crouch = false; }
      if (this.t.weapon) { toggleWeapon = true; this.t.weapon = false; }
    }
    const n = Math.hypot(mx, my);
    if (n > 1) { mx /= n; my /= n; }
    this.pressed.clear();
    return { moveX: mx, moveY: my, lookX, lookY, fire, aim, jump, crouchToggle, toggleWeapon, weapon, viewToggle, sniperToggle, ...this.override };
  }
}
```

- [ ] **Step 2 : Vérification de syntaxe**

Run : `node --check "$P\client\src\input.js"`
Attendu : aucune sortie (pas d'erreur de syntaxe).

---

### Task B7 : Monde (carte, sol, collisions, rayon)

**Files :**
- Create : `client/src/world.js`

- [ ] **Step 1 : Écrire le module**

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sampleHeight } from './heightmap.js';
import { pushOut } from './colliders.js';

const getJSON = (n) => fetch(`config/${n}.json`).then((r) => { if (!r.ok) throw new Error(`config/${n}.json introuvable`); return r.json(); });

/** Charge la carte et les fichiers de configuration. Coordonnées de jeu : celles de three.js (Y en haut). */
export async function loadWorld(scene) {
  const [hm, colliders, cams, spawns] = await Promise.all(['heightmap', 'colliders', 'cameras', 'spawns'].map(getJSON));
  const gltf = await new GLTFLoader().loadAsync('assets/map.glb');
  gltf.scene.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false; } });
  scene.add(gltf.scene);

  const groundY = (x, z) => sampleHeight(hm, x, -z);          // three (x, z) -> Blender (x, -z)
  return {
    hm, colliders, cams, spawns, groundY,
    /** position d'apparition d'un joueur en coordonnées three.js */
    spawn(name) { const s = spawns[name] || [0, 0, 0]; return new THREE.Vector3(s[0], s[2], -s[1]); },
    /** repousse la position (three.js) hors des obstacles */
    collide(p, radius = 0.4) {
      const q = { x: p.x, y: -p.z };
      pushOut(q, radius, colliders);
      p.x = q.x; p.z = -q.y;
    },
    /** premier point où le rayon touche le sol (pas de 1 m), sinon le point à `max` mètres */
    rayGround(origin, dir, max = 120) {
      const p = new THREE.Vector3();
      for (let d = 1; d <= max; d += 1) {
        p.copy(origin).addScaledVector(dir, d);
        if (p.y <= groundY(p.x, p.z)) return p.clone();
      }
      return origin.clone().addScaledVector(dir, max);
    },
  };
}
```

- [ ] **Step 2 : Vérification de syntaxe**

Run : `node --check "$P\client\src\world.js"`
Attendu : aucune sortie.

---

### Task B8 : Caméras de jeu

**Files :**
- Create : `client/src/camera.js`

Reprend la géométrie des caméras de Blender : position derrière et à droite du joueur, point visé devant lui, tangage appliqué en tournant tout autour du point d'appui à hauteur de tête.

- [ ] **Step 1 : Écrire le module**

```js
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const clone = (c) => ({ ...c, look: [...c.look] });

export class CameraRig {
  constructor(camera, cfgs) {
    this.camera = camera;
    this.cfgs = cfgs;
    this.cur = clone(cfgs.Cam_Exploration);
    this.view = 'epaule';                     // 'epaule' ou 'fps'
  }

  toggleView() { this.view = this.view === 'epaule' ? 'fps' : 'epaule'; }

  /** nom de la caméra de Blender à utiliser selon l'état */
  nameFor(s) {
    if (this.view === 'fps') return 'Cam_PremierePersonne';
    if (s.downed) return 'Cam_ATerre';
    if (s.sniper) return 'Cam_Sniper';
    if (s.aiming) return 'Cam_Visee';
    if (s.crouch) return 'Cam_Accroupi';
    return 'Cam_Exploration';
  }

  /** ground : position du joueur au sol (three.js). yaw, pitch : orientation voulue par le joueur (pitch > 0 : regarder en haut). */
  update(dt, ground, yaw, pitch, state) {
    const goal = this.cfgs[this.nameFor(state)];
    const k = 1 - Math.exp(-dt * 10);
    for (const key of ['dist', 'h', 'side', 'fov']) this.cur[key] += (goal[key] - this.cur[key]) * k;
    for (let i = 0; i < 3; i++) this.cur.look[i] += (goal.look[i] - this.cur.look[i]) * k;

    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const r = new THREE.Vector3().crossVectors(f, UP);
    const c = this.cur;
    const pos = ground.clone().addScaledVector(r, c.side).addScaledVector(f, -c.dist).addScaledVector(UP, c.h);
    const tgt = ground.clone().addScaledVector(r, c.look[0]).addScaledVector(f, c.look[1]).addScaledVector(UP, c.look[2]);
    // tangage : on fait tourner la caméra et sa cible autour d'un point d'appui à hauteur de tête, axe = droite du joueur
    const pivot = ground.clone().addScaledVector(UP, 1.5);
    const q = new THREE.Quaternion().setFromAxisAngle(r, pitch);
    pos.sub(pivot).applyQuaternion(q).add(pivot);
    tgt.sub(pivot).applyQuaternion(q).add(pivot);

    this.camera.position.copy(pos);
    this.camera.lookAt(tgt);
    this.camera.fov = c.fov;
    this.camera.updateProjectionMatrix();
  }
}
```

- [ ] **Step 2 : Vérification de syntaxe**

Run : `node --check "$P\client\src\camera.js"`
Attendu : aucune sortie.

---

### Task B9 : Le personnage (déplacement, animations, fusil à la main, visée)

**Files :**
- Create : `client/src/player.js`

Deux étapes par image : `step()` déplace le joueur (avant la caméra), `pose()` joue l'animation, remet le fusil dans la main droite et tourne le buste pour que le canon vise la cible (après la caméra).

- [ ] **Step 1 : Écrire le module**

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { pickClip } from './animstate.js';
import { solveAim, limitRotation } from './aimsolve.js';

const UP = new THREE.Vector3(0, 1, 0);
const san = (n) => THREE.PropertyBinding.sanitizeNodeName(n);     // three retire les ':' des noms d'os
const SPEED = { walk: 2.0, run: 4.6, crouch: 1.7 };

export class Player {
  static async load(scene, url = 'assets/player.glb') {
    const gltf = await new GLTFLoader().loadAsync(url);
    return new Player(scene, gltf);
  }

  constructor(scene, gltf) {
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.root.add(this.model);
    scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = new Map(gltf.animations.map((c) => [c.name, c]));
    const find = (n) => this.model.getObjectByName(san(n));
    this.bones = { spine: find('mixamorig4:Spine1'), hand: find('mixamorig4:RightHand'), weapon: find('Weapon'), head: find('mixamorig4:Head') };
    this.rifle = find('Rifle'); this.mag = find('Rifle_Mag'); this.pistol = find('Pistol');
    this.muzzles = { rifle: find('Muzzle'), pistol: find('Muzzle_Pistol') };
    for (const [k, v] of Object.entries({ ...this.bones, rifle: this.rifle, pistol: this.pistol })) {
      if (!v) throw new Error(`nœud introuvable dans player.glb : ${k}`);
    }
    this.model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });

    this.pos = new THREE.Vector3();
    this.yaw = 0; this.vy = 0; this.onGround = true;
    this.fps = false;
    this.current = null; this.action = null;
    this.state = { weapon: 'rifle', crouch: false, move: 'idle', aiming: false, firing: false,
                   sniper: false, downed: false, dead: false, airborne: false, raised: true };
    this._computeGrip();
    this.setWeapon('rifle');
  }

  /** Décalage fixe entre la main droite et l'os du fusil, mesuré sur la visée (le fusil y est rigide à moins de 1 cm). */
  _computeGrip() {
    const clip = this.clips.get('Rifle Aim');
    if (!clip) throw new Error("animation 'Rifle Aim' introuvable");
    const a = this.mixer.clipAction(clip);
    a.play();
    this.mixer.setTime(0.5);
    this.model.updateMatrixWorld(true);
    const { hand, weapon } = this.bones;
    this.grip = new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(weapon.matrixWorld);
    this.mixer.stopAllAction();
  }

  _applyGrip() {
    const { hand, weapon } = this.bones;
    if (this.state.weapon !== 'rifle') return;
    const world = new THREE.Matrix4().multiplyMatrices(hand.matrixWorld, this.grip);
    const local = new THREE.Matrix4().copy(weapon.parent.matrixWorld).invert().multiply(world);
    local.decompose(weapon.position, weapon.quaternion, weapon.scale);
    weapon.updateMatrixWorld(true);
  }

  setWeapon(w) {
    this.state.weapon = w;
    this.rifle.visible = w === 'rifle';
    if (this.mag) this.mag.visible = w === 'rifle';
    this.pistol.visible = w === 'pistol';
  }

  /** Déplacement, saut, collisions. camYaw : le joueur regarde toujours dans la direction de la caméra. */
  step(dt, inp, world, camYaw) {
    const s = this.state;
    if (inp.weapon && inp.weapon !== s.weapon) this.setWeapon(inp.weapon);
    if (inp.toggleWeapon) this.setWeapon(s.weapon === 'rifle' ? 'pistol' : 'rifle');
    if (inp.crouchToggle) s.crouch = !s.crouch;
    if (inp.sniperToggle && s.weapon === 'rifle') s.sniper = !s.sniper;
    s.aiming = !!inp.aim; s.firing = !!inp.fire;
    this.yaw = camYaw;

    const f = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const r = new THREE.Vector3().crossVectors(f, UP);
    const dir = new THREE.Vector3().addScaledVector(f, inp.moveY).addScaledVector(r, inp.moveX);
    const mag = Math.min(1, dir.length());
    const speed = s.crouch ? SPEED.crouch : (mag > 0.6 && !s.aiming && !s.sniper ? SPEED.run : SPEED.walk);
    if (mag > 0.01) { dir.normalize().multiplyScalar(speed * mag * dt); this.pos.add(dir); }
    s.move = mag < 0.05 ? 'idle'
      : Math.abs(inp.moveX) > Math.abs(inp.moveY) ? 'side'
      : inp.moveY < 0 ? 'back'
      : speed >= SPEED.run ? 'run' : 'walk';

    if (inp.jump && this.onGround && !s.crouch) { this.vy = 6.0; this.onGround = false; }
    this.vy -= 18.0 * dt;
    this.pos.y += this.vy * dt;
    world.collide(this.pos);
    const g = world.groundY(this.pos.x, this.pos.z);
    if (this.pos.y <= g) { this.pos.y = g; this.vy = 0; this.onGround = true; }
    s.airborne = !this.onGround;
    this.root.position.copy(this.pos);
    this.model.rotation.y = this.yaw;           // le modèle regarde vers +Z quand yaw = 0
  }

  _play(sel) {
    const clip = this.clips.get(sel.clip);
    if (!clip) { if (!this._warned?.has(sel.clip)) { (this._warned ??= new Set()).add(sel.clip); console.warn('animation absente :', sel.clip); } return; }
    if (this.current === sel.clip) return;
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(sel.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!sel.clamp || !!sel.once;
    next.enabled = true;
    next.play();
    if (this.action) next.crossFadeFrom(this.action, 0.15, false);
    this.action = next; this.current = sel.clip;
  }

  /** Muzzle de l'arme tenue : position et direction de tir dans le monde. */
  muzzleWorld() {
    const mz = this.muzzles[this.state.weapon];
    this.model.updateMatrixWorld(true);
    return { pos: mz.getWorldPosition(new THREE.Vector3()), dir: new THREE.Vector3(1, 0, 0).transformDirection(mz.matrixWorld) };
  }

  /** Animation, fusil dans la main, buste tourné pour que le canon vise `target` (point du monde). */
  pose(dt, target) {
    this._play(pickClip(this.state));
    this.mixer.update(dt);
    this.model.updateMatrixWorld(true);
    this._applyGrip();
    const s = this.state;
    if (s.raised && !s.dead && !s.downed) this._aim(target);
    this.bones.head.scale.setScalar(this.fps ? 0.001 : 1);     // vue première personne : la tête disparaît
    this.model.updateMatrixWorld(true);
  }

  _aim(target) {
    const { pos: mp, dir: md } = this.muzzleWorld();
    const sp = this.bones.spine;
    const pivot = sp.getWorldPosition(new THREE.Vector3());
    let R = solveAim(pivot, mp, md, target, 5);
    R = limitRotation(R, THREE.MathUtils.degToRad(60));
    const wq = sp.getWorldQuaternion(new THREE.Quaternion());
    const pq = sp.parent.getWorldQuaternion(new THREE.Quaternion());
    sp.quaternion.copy(pq.invert().multiply(R.multiply(wq)));
    this.model.updateMatrixWorld(true);
    this._applyGrip();
  }
}
```

- [ ] **Step 2 : Vérification de syntaxe**

Run : `node --check "$P\client\src\player.js"`
Attendu : aucune sortie.

---

### Task B10 : Affichage d'aide et boucle de jeu

**Files :**
- Create : `client/src/hud.js`, `client/src/main.js`

- [ ] **Step 1 : Écrire `hud.js`**

```js
export class Hud {
  constructor() { this.el = document.getElementById('hud'); this.msg = document.getElementById('msg'); }
  hideMessage() { this.msg.style.display = 'none'; }
  showMessage(t) { this.msg.style.display = 'flex'; this.msg.textContent = t; }
  update(p, rig) {
    const s = p.state;
    this.el.textContent =
      `Arme : ${s.weapon === 'rifle' ? 'fusil' : 'pistolet'}${s.sniper ? ' (lunette)' : ''}   Vue : ${rig.view === 'fps' ? 'première personne' : 'par-dessus l\'épaule'}\n` +
      `Animation : ${p.current ?? '-'}\n` +
      `ZQSD/WASD bouger · souris viser · clic gauche tirer · clic droit viser · Espace sauter · C accroupi\n` +
      `1 fusil · 2 pistolet · Q alterner · T lunette · B changer de vue · cliquer pour capturer la souris`;
  }
}
```

- [ ] **Step 2 : Écrire `main.js`**

```js
import * as THREE from 'three';
import { Input } from './input.js';
import { loadWorld } from './world.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('c');
const hud = new Hud();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bbbd9);
scene.fog = new THREE.Fog(0x9bbbd9, 120, 420);
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 900);

scene.add(new THREE.HemisphereLight(0xcfe3ff, 0xc29a6a, 0.9));
const sun = new THREE.DirectionalLight(0xffe6c0, 2.2);
sun.position.set(-60, 90, -40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 250 });
scene.add(sun, sun.target);

const input = new Input(canvas);
const tracers = [];

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function shoot(player, world) {
  const { pos } = player.muzzleWorld();
  const o = camera.getWorldPosition(new THREE.Vector3());
  const d = camera.getWorldDirection(new THREE.Vector3());
  const hit = world.rayGround(o, d, 120);
  const geo = new THREE.BufferGeometry().setFromPoints([pos, hit]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff2a0 }));
  scene.add(line);
  tracers.push({ line, t: 0.08 });
}

async function start() {
  const world = await loadWorld(scene);
  const player = await Player.load(scene);
  const rig = new CameraRig(camera, world.cams);
  player.pos.copy(world.spawn('Spawn_Joueur_1'));
  player.pos.y = world.groundY(player.pos.x, player.pos.z);
  let yaw = 0, pitch = 0, cooldown = 0, last = performance.now();
  hud.hideMessage();
  window.__game = { player, rig, input, world, camera };     // accès pour les tests automatiques

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const inp = input.poll();
    yaw -= inp.lookX; pitch = THREE.MathUtils.clamp(pitch - inp.lookY, -1.0, 1.0);
    if (inp.viewToggle) rig.toggleView();
    player.fps = rig.view === 'fps';

    player.step(dt, inp, world, yaw);
    rig.update(dt, player.pos, yaw, pitch, { ...player.state });
    // point visé : le centre de l'image, à 30 m devant la caméra
    const target = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 30);
    player.pose(dt, target);

    cooldown -= dt;
    if (inp.fire && cooldown <= 0) { shoot(player, world); cooldown = player.state.weapon === 'rifle' ? 0.1 : 0.25; }
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].t -= dt;
      if (tracers[i].t <= 0) { scene.remove(tracers[i].line); tracers[i].line.geometry.dispose(); tracers.splice(i, 1); }
    }
    sun.position.set(player.pos.x - 60, player.pos.y + 90, player.pos.z - 40);
    sun.target.position.copy(player.pos);
    hud.update(player, rig);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start().catch((e) => { console.error(e); hud.showMessage('Erreur : ' + e.message); });
```

- [ ] **Step 3 : Vérifier la syntaxe de tous les modules**

Run : `Get-ChildItem "$P\client\src\*.js" | ForEach-Object { node --check $_.FullName; "$($_.Name) ok" }`
Attendu : une ligne `... ok` par fichier, aucune erreur.

---

### Task B11 : Lancer et vérifier dans le navigateur

**Files :** aucun nouveau fichier.

- [ ] **Step 1 : Lancer le serveur local** (en arrière-plan)

Run : `cd "$P\client"; python -m http.server 8080`
Attendu : `Serving HTTP on ... port 8080`.

- [ ] **Step 2 : Ouvrir la page avec Playwright**

Avec `browser_navigate` : `http://localhost:8080/index.html`, attendre 10 secondes (`browser_wait_for`), puis `browser_console_messages`.
Attendu : aucune erreur rouge. Un avertissement `animation absente : ...` signifie qu'un nom de `clips.json` ne correspond pas à un export : corriger le nom.

- [ ] **Step 3 : Vérifier que le jeu a démarré**

Avec `browser_evaluate` :

```js
() => { const g = window.__game; return g ? { pos: g.player.pos.toArray().map(v => +v.toFixed(2)), anim: g.player.current, arme: g.player.state.weapon, vue: g.rig.view } : 'pas démarré'; }
```

Attendu : une position proche de `[-184, 0.x, 174]` (apparition du camp en coordonnées three.js), `anim: "Rifle Aim"`, `arme: "rifle"`.

- [ ] **Step 4 : Faire courir le joueur et vérifier les collisions**

Avec `browser_evaluate` : `() => { window.__game.input.override = { moveY: 1 }; return 'ok'; }`, attendre 3 secondes, puis relire la position et `anim`.
Attendu : la position a avancé vers +Z (au moins 8 m) et `anim` vaut `Rifle Run Tir`. Remettre `override = {}`.

- [ ] **Step 5 : Vérifier que le canon vise le centre**

Avec `browser_evaluate` :

```js
() => { const g = window.__game, m = g.player.muzzleWorld();
  const o = g.camera.getWorldPosition(new g.camera.position.constructor()), d = g.camera.getWorldDirection(new g.camera.position.constructor());
  const t = o.clone().addScaledVector(d, 30), want = t.clone().sub(m.pos).normalize();
  return { ecartDegres: +(m.dir.angleTo(want) * 180 / Math.PI).toFixed(2) }; }
```

Attendu : `ecartDegres` inférieur à 2.

- [ ] **Step 6 : Captures d'écran**

`browser_take_screenshot` dans les situations suivantes : (a) à l'arrêt, vue par-dessus l'épaule ; (b) après `window.__game.rig.toggleView()` pour la vue première personne ; (c) avec `window.__game.player.setWeapon('pistol')`. Montrer les captures à l'utilisateur.

- [ ] **Step 7 : Arrêter le serveur** et résumer à l'utilisateur ce qui marche et ce qui reste (collisions des cabanes à tester à la main, ombres, performances sur téléphone).

---

## Auto-revue

- **Spec (étape 2 : prototype solo)** : carte et personnage exportés (A1, A2), caméras de Blender reprises (A3, B8), commandes clavier + souris, manette, tactile (B6), animations choisies selon le tableau de `docs/animations-et-commandes.md` et `docs/viser-au-centre.md` (B5), canon visant le centre avec le fusil collé à la main (B4, B9), collisions et terrain (B2, B3, B7).
- **Hors de ce plan** : cuisson des textures (couleurs simples pour l'instant), allègement de la carte pour les téléphones, recharge, mêlée, tir au pistolet avec recul, déplacement latéral avec le fusil (utilise la course), réseau (étape 3).
- **Cohérence des noms** : `sampleHeight(hm, x, y)`, `pushOut(pos, radius, colliders)`, `solveAim(pivot, muzzlePos, muzzleDir, target, iterations)`, `limitRotation(q, maxRad)`, `pickClip(state)`, `loadWorld(scene)` avec `groundY`, `collide`, `spawn`, `rayGround`, `Player.step/pose/muzzleWorld/setWeapon`, `CameraRig.update/toggleView/nameFor` sont utilisés tels quels dans `main.js`.
- **Risques connus** : les noms de paramètres de l'exporteur glTF de Blender 5.2 (A1, A2) ; la sanitisation des noms d'os par three.js (gérée avec `PropertyBinding.sanitizeNodeName`) ; la taille de `map.glb`.
