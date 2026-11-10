# Étape 1 : Désert dans Blender — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ce plan pilote le Blender ouvert via le MCP Blender (`execute_blender_code`, `get_scene_info`, `look`). Les tâches sont séquentielles sur une seule instance Blender : préférer l'exécution inline.

**Goal :** Produire `assets/sahel_desert.blend`, un désert semi-réaliste de 500 m x 500 m avec 5 zones (camp, dunes, oasis, village en banco, fort en ruine), des marqueurs de jeu, et une copie sûre du personnage wax.

**Architecture :** Un module `common.py` (fonction de hauteur du terrain, matériaux, primitives) partagé par un script par zone. Chaque script vide sa propre collection avant de la reconstruire, donc il peut être relancé sans doublons. Les scripts sont dans `tools/blender/` et lancés dans Blender par `exec`/`import` depuis `execute_blender_code`.

**Tech Stack :** Blender (bpy, bmesh, mathutils.noise), MCP Blender.

**Règles du projet :**
- Pas de modèle repris des anciens jeux. Seul le personnage wax est copié, et uniquement vers un fichier séparé.
- Sauvegarder le .blend après chaque tâche (une session non sauvegardée a déjà été perdue lors d'un crash).
- **Aucun export (`tools/export_*`, glTF) sans l'accord explicite de l'utilisateur.** L'export et le baking de l'éclairage relèvent du plan suivant.
- Le dossier n'est pas un dépôt git. Les « checkpoints » sont des sauvegardes .blend. `git init` est optionnel.

**Chemins :**
- `PROJ` = `C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game`
- `TOOLS` = `PROJ\tools\blender`
- `BLEND` = `PROJ\assets\sahel_desert.blend`

**Carte (mètres, centre en 0,0, axes X et Y de -250 à +250) :**

| Zone | Centre (x, y) | Rayon plat | Altitude |
|---|---|---|---|
| Camp de base | (-180, -180) | 40 | 0 |
| Oasis | (160, -140) | 45 | -1 |
| Village en banco | (140, 150) | 50 | 0,5 |
| Fort en ruine | (-150, 170) | 35 | 14 (colline) |
| Dunes | le reste, surtout le centre | - | variable |

## Structure des fichiers

- `tools/blender/common.py` : constantes des zones, `height_at`, matériaux, primitives, collections, sauvegarde.
- `tools/blender/s00_setup.py` : copie du personnage, diagnostic, nouvelle scène.
- `tools/blender/s01_terrain.py` : terrain, eau.
- `tools/blender/s02_camp.py` : camp de base.
- `tools/blender/s03_oasis.py` : oasis.
- `tools/blender/s04_village.py` : village en banco.
- `tools/blender/s05_fort.py` : fort en ruine.
- `tools/blender/s06_props.py` : rochers, arbres morts, épave, caisses.
- `tools/blender/s07_markers.py` : points d'apparition et objectifs.
- `tools/blender/s08_lighting.py` : soleil, ciel, EEVEE.
- `tools/blender/s09_report.py` : bilan et budget de polygones.

Chaque script se lance dans Blender avec ce gabarit (remplacer `sXX_nom`) :

```python
import sys, importlib
TOOLS = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game\tools\blender"
if TOOLS not in sys.path: sys.path.insert(0, TOOLS)
import common; importlib.reload(common)
import sXX_nom; importlib.reload(sXX_nom)
sXX_nom.run()
```

Chaque script `sXX_nom.py` expose une fonction `run()`.

---

### Task 1 : Module commun

**Files :**
- Create : `tools/blender/common.py`

- [ ] **Step 1 : Créer le dossier et écrire `common.py`**

```python
import bpy, bmesh, math, random
from mathutils import Vector, noise

PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
BLEND = PROJ + r"\assets\sahel_desert.blend"
MAP_HALF = 250.0

ZONES = {
    "camp":    dict(c=(-180.0, -180.0), r=40.0, h=0.0),
    "oasis":   dict(c=(160.0, -140.0),  r=45.0, h=-1.0),
    "village": dict(c=(140.0, 150.0),   r=50.0, h=0.5),
    "fort":    dict(c=(-150.0, 170.0),  r=35.0, h=14.0),
}
WATER_LEVEL = -1.4


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def dune_height(x, y):
    n = noise.fractal(Vector((x * 0.008, y * 0.008, 0.0)), 1.0, 2.0, 4)
    ridge = 1.0 - abs(noise.noise(Vector((x * 0.015, y * 0.02, 3.0))))
    return 6.0 * n + 5.0 * ridge * ridge


def height_at(x, y):
    h = dune_height(x, y)
    for z in ZONES.values():
        d = math.hypot(x - z["c"][0], y - z["c"][1])
        w = 1.0 - smoothstep(z["r"], z["r"] * 2.2, d)
        h = h * (1.0 - w) + z["h"] * w
    ox, oy = ZONES["oasis"]["c"]
    do = math.hypot(x - ox, y - oy)
    h -= 2.5 * (1.0 - smoothstep(4.0, 16.0, do))
    return h


def get_mat(name, color, rough=0.9):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def coll(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def clear_collection(c):
    for o in list(c.objects):
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


def new_obj(name, mesh, collection, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    o = bpy.data.objects.new(name, mesh)
    collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    if mat is not None:
        o.data.materials.append(mat)
    return o


def box(name, size, loc, collection, mat, rot_z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return new_obj(name, me, collection, mat, loc, (0, 0, rot_z))


def cone(name, r_bottom, r_top, depth, segments, loc, collection, mat, rot_z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments,
                          radius1=r_bottom, radius2=r_top, depth=depth)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return new_obj(name, me, collection, mat, loc, (0, 0, rot_z))


def on_ground(x, y, height, sink=0.3):
    """Altitude du centre d'un objet de hauteur `height` posé en (x, y)."""
    return height_at(x, y) + height / 2.0 - sink


def save():
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    return BLEND
```

- [ ] **Step 2 : Vérifier la syntaxe en l'important dans Blender**

Lancer dans `execute_blender_code` :

```python
import sys, importlib
TOOLS = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game\tools\blender"
if TOOLS not in sys.path: sys.path.insert(0, TOOLS)
import common; importlib.reload(common)
print(round(common.height_at(0, 0), 2), round(common.height_at(-150, 170), 2))
```

Attendu : deux nombres. Le second est proche de 14.0 (centre du fort).

---

### Task 2 : Copie du personnage et nouvelle scène

**Files :**
- Create : `tools/blender/s00_setup.py`
- Create : `assets/personnage_wax_copie.blend` (généré)
- Create : `assets/sahel_desert.blend` (généré)

- [ ] **Step 1 : Copier le personnage sans toucher au fichier d'origine**

Blender a `personnage_wax_tenue.blend` ouvert. Lancer :

```python
import bpy
PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
import os
os.makedirs(PROJ + r"\assets", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=PROJ + r"\assets\personnage_wax_copie.blend", copy=True)
print(bpy.data.filepath)
```

Attendu : `bpy.data.filepath` affiche encore le chemin d'origine `...\Desktop\personnage_wax_tenue.blend` (`copy=True` ne change pas le fichier actif).

- [ ] **Step 2 : Diagnostiquer le torse et la tête manquants**

```python
import bpy
arm = bpy.data.objects["Armature"]
for o in arm.children:
    print(o.name, o.type, "hide_vp:", o.hide_viewport, "hide_render:", o.hide_render,
          "hide_get:", o.hide_get(), "mods:", [m.type + ":" + m.name for m in o.modifiers],
          "verts:", len(o.data.vertices) if o.type == "MESH" else "-")
```

Attendu : une ligne par enfant de l'armature. Noter les objets masqués (torse, tête, cheveux) ou porteurs d'un modificateur Mask.

- [ ] **Step 3 : Dans `assets/personnage_wax_copie.blend` seulement, corriger la cause trouvée**

La correction est à faire dans la copie, jamais dans l'original : ouvrir la copie (`bpy.ops.wm.open_mainfile`), puis démasquer l'objet (`o.hide_viewport = False; o.hide_set(False)`) ou retirer le modificateur Mask fautif (`o.modifiers.remove(m)`), puis `bpy.ops.wm.save_mainfile()`. Si la cause est autre (maillage réellement absent), le noter pour l'utilisateur et passer à la suite.

- [ ] **Step 4 : Contrôle visuel**

Appeler `look` avec `mode="angles"`, `target=["Armature"]`, `views=["front","right"]`. Attendu : personnage complet (tête, torse, jambes, bras).

- [ ] **Step 5 : Créer le fichier du désert avec une scène vide**

```python
import bpy
PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
bpy.ops.wm.read_homefile(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1.0
bpy.ops.wm.save_as_mainfile(filepath=PROJ + r"\assets\sahel_desert.blend")
print(bpy.data.filepath, len(bpy.data.objects))
```

Attendu : le chemin de `sahel_desert.blend` et `0` objet.

---

### Task 3 : Terrain et eau

**Files :**
- Create : `tools/blender/s01_terrain.py`

- [ ] **Step 1 : Écrire le script**

```python
import bpy, bmesh
import common as C


def run():
    col = C.coll("Terrain")
    C.clear_collection(col)

    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=200, y_segments=200, size=C.MAP_HALF)
    m = max(abs(v.co.x) for v in bm.verts)
    f = C.MAP_HALF / m
    for v in bm.verts:
        v.co.x *= f
        v.co.y *= f
        v.co.z = C.height_at(v.co.x, v.co.y)
    me = bpy.data.meshes.new("Sol_Desert")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    C.new_obj("Sol_Desert", me, col, C.get_mat("Sable", (0.76, 0.56, 0.33), 0.95))

    ox, oy = C.ZONES["oasis"]["c"]
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=15.0)
    me = bpy.data.meshes.new("Eau_Oasis")
    bm.to_mesh(me)
    bm.free()
    C.new_obj("Eau_Oasis", me, col, C.get_mat("Eau", (0.05, 0.25, 0.30), 0.1),
              loc=(ox, oy, C.WATER_LEVEL))
```

- [ ] **Step 2 : Lancer avec le gabarit (`s01_terrain`)**

- [ ] **Step 3 : Vérifier les dimensions**

`get_scene_info` avec `query="Sol_Desert"` et `fields=["size","details"]`. Attendu : taille environ 500 x 500 sur X et Y, Z entre 15 et 30, environ 40 000 faces. Si X et Y valent environ 250, `create_grid` n'a pas pris la taille attendue : le facteur `f` de `run()` devrait déjà l'avoir corrigé, vérifier `m`.

- [ ] **Step 4 : Contrôle visuel**

`look` avec `mode="angles"`, `target=["Sol_Desert","Eau_Oasis"]`, `views=["three_quarter","top"]`, `shading="material"`. Attendu : dunes ondulées, plateau au fort (coin -150,170), creux d'oasis avec un disque d'eau.

- [ ] **Step 5 : Sauvegarder**

```python
import common; print(common.save())
```

---

### Task 4 : Camp de base

**Files :**
- Create : `tools/blender/s02_camp.py`

- [ ] **Step 1 : Écrire le script**

```python
import math, random
import common as C


def run():
    col = C.coll("Camp")
    C.clear_collection(col)
    rnd = random.Random(11)
    cx, cy = C.ZONES["camp"]["c"]
    toile = C.get_mat("Toile", (0.78, 0.68, 0.50), 0.95)
    banco = C.get_mat("Banco", (0.58, 0.40, 0.27), 1.0)
    bois = C.get_mat("Bois", (0.30, 0.20, 0.12), 0.9)

    for i in range(6):
        a = i * math.tau / 6.0
        x, y = cx + 20.0 * math.cos(a), cy + 20.0 * math.sin(a)
        C.cone(f"Tente_{i+1:02d}", 3.4, 0.2, 2.8, 4,
               (x, y, C.on_ground(x, y, 2.8, 0.1)), col, toile, rot_z=a + math.pi / 4)

    C.cone("Puits_Margelle", 1.6, 1.6, 1.0, 16,
           (cx, cy, C.on_ground(cx, cy, 1.0, 0.1)), col, banco)
    C.box("Puits_Poteau_G", (0.2, 0.2, 2.4), (cx - 1.2, cy, C.on_ground(cx - 1.2, cy, 2.4, 0.1)), col, bois)
    C.box("Puits_Poteau_D", (0.2, 0.2, 2.4), (cx + 1.2, cy, C.on_ground(cx + 1.2, cy, 2.4, 0.1)), col, bois)

    for i in range(8):
        x = cx + rnd.uniform(-8, 8)
        y = cy + rnd.uniform(-8, 8) - 10
        C.box(f"Caisse_{i+1:02d}", (1.0, 1.0, 0.8),
              (x, y, C.on_ground(x, y, 0.8, 0.05)), col, bois, rot_z=rnd.uniform(0, 3.14))
```

- [ ] **Step 2 : Lancer avec le gabarit (`s02_camp`)**

- [ ] **Step 3 : Vérifier**

`get_scene_info` avec `query="Tente"`. Attendu : 6 tentes. `look` avec `target=["Tente_01","Puits_Margelle"]`, `distance=40`. Attendu : tentes en cercle, puits au centre, objets posés au sol (pas flottants ni enterrés).

- [ ] **Step 4 : Sauvegarder** (`common.save()`)

---

### Task 5 : Oasis

**Files :**
- Create : `tools/blender/s03_oasis.py`

- [ ] **Step 1 : Écrire le script**

```python
import math, random
import common as C


def palm(col, name, x, y, rnd, mats):
    h = rnd.uniform(7.0, 11.0)
    z0 = C.height_at(x, y)
    C.cone(name + "_Tronc", 0.35, 0.2, h, 8, (x, y, z0 + h / 2.0 - 0.2), col, mats["tronc"])
    for k in range(7):
        a = k * math.tau / 7.0 + rnd.uniform(-0.2, 0.2)
        dx, dy = 1.7 * math.cos(a), 1.7 * math.sin(a)
        C.box(f"{name}_Palme_{k}", (3.6, 0.5, 0.08),
              (x + dx, y + dy, z0 + h - 0.3), col, mats["palme"], rot_z=a)


def run():
    col = C.coll("Oasis")
    C.clear_collection(col)
    rnd = random.Random(23)
    ox, oy = C.ZONES["oasis"]["c"]
    mats = {"tronc": C.get_mat("Tronc", (0.35, 0.25, 0.15), 0.95),
            "palme": C.get_mat("Palme", (0.18, 0.38, 0.12), 0.8)}
    n = 0
    while n < 25:
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(18.0, 42.0)
        x, y = ox + r * math.cos(a), oy + r * math.sin(a)
        palm(col, f"Palmier_{n+1:02d}", x, y, rnd, mats)
        n += 1
    herbe = C.get_mat("Herbe", (0.30, 0.42, 0.15), 0.9)
    for i in range(40):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(14.0, 30.0)
        x, y = ox + r * math.cos(a), oy + r * math.sin(a)
        C.cone(f"Touffe_{i+1:02d}", 0.7, 0.05, 0.6, 6,
               (x, y, C.on_ground(x, y, 0.6, 0.05)), col, herbe)
```

- [ ] **Step 2 : Lancer avec le gabarit (`s03_oasis`)**

- [ ] **Step 3 : Vérifier**

`get_scene_info` avec `query="Palmier"` et `limit=60`. Attendu : 25 troncs. `look` avec `target=["Eau_Oasis"]`, `distance=60`, `mode="angles"`, `views=["three_quarter"]`. Attendu : palmiers autour d'un point d'eau.

- [ ] **Step 4 : Sauvegarder** (`common.save()`)

---

### Task 6 : Village en banco

**Files :**
- Create : `tools/blender/s04_village.py`

- [ ] **Step 1 : Écrire le script**

```python
import math, random
import common as C


def run():
    col = C.coll("Village")
    C.clear_collection(col)
    rnd = random.Random(37)
    vx, vy = C.ZONES["village"]["c"]
    banco = C.get_mat("Banco", (0.58, 0.40, 0.27), 1.0)
    banco_clair = C.get_mat("Banco_Clair", (0.68, 0.50, 0.34), 1.0)

    n = 0
    for i in (-2, -1, 1, 2):
        for j in (-2, -1, 1, 2):
            n += 1
            x = vx + i * 16.0 + rnd.uniform(-2, 2)
            y = vy + j * 16.0 + rnd.uniform(-2, 2)
            w, d, h = rnd.uniform(6, 9), rnd.uniform(6, 9), rnd.uniform(3.2, 5.2)
            rz = rnd.uniform(-0.15, 0.15)
            C.box(f"Maison_{n:02d}", (w, d, h), (x, y, C.on_ground(x, y, h)), col, banco, rz)
            C.box(f"Maison_{n:02d}_Acrotere", (w + 0.4, d + 0.4, 0.4),
                  (x, y, C.height_at(x, y) + h - 0.3 + 0.2), col, banco_clair, rz)

    # Mosquée au centre : salle, deux minarets tronconiques
    C.box("Mosquee_Salle", (14.0, 8.0, 7.0), (vx, vy, C.on_ground(vx, vy, 7.0)), col, banco_clair)
    for s, dx in (("G", -5.5), ("D", 5.5)):
        x = vx + dx
        C.cone(f"Mosquee_Minaret_{s}", 1.8, 1.0, 11.0, 8,
               (x, vy, C.on_ground(x, vy, 11.0)), col, banco_clair)
        C.cone(f"Mosquee_Pointe_{s}", 0.6, 0.0, 1.8, 6,
               (x, vy, C.height_at(x, vy) + 11.0 + 0.7), col, banco_clair)

    # Toguna : toit bas sur piliers
    tx, ty = vx + 28.0, vy - 40.0
    C.box("Toguna_Toit", (7.0, 5.0, 0.5), (tx, ty, C.height_at(tx, ty) + 2.4), col, banco)
    for k, (px, py) in enumerate([(-3, -2), (3, -2), (-3, 2), (3, 2)]):
        C.box(f"Toguna_Pilier_{k+1}", (0.4, 0.4, 2.4),
              (tx + px, ty + py, C.on_ground(tx + px, ty + py, 2.4, 0.1)), col, banco)

    # Murets de clôture
    for k in range(10):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(34, 46)
        x, y = vx + r * math.cos(a), vy + r * math.sin(a)
        C.box(f"Muret_{k+1:02d}", (rnd.uniform(4, 8), 0.5, 1.4),
              (x, y, C.on_ground(x, y, 1.4)), col, banco, rot_z=rnd.uniform(0, 3.14))
```

- [ ] **Step 2 : Lancer avec le gabarit (`s04_village`)**

- [ ] **Step 3 : Vérifier**

`get_scene_info` avec `query="Maison_"` et `limit=60`. Attendu : 16 maisons et 16 acrotères. `look` avec `target=["Mosquee_Salle"]`, `distance=70`, `mode="angles"`, `views=["three_quarter","top"]`. Attendu : maisons en grille avec ruelles en croix, mosquée à deux minarets au centre.

- [ ] **Step 4 : Sauvegarder** (`common.save()`)

---

### Task 7 : Fort en ruine

**Files :**
- Create : `tools/blender/s05_fort.py`

- [ ] **Step 1 : Écrire le script**

```python
import math, random
import common as C


def run():
    col = C.coll("Fort")
    C.clear_collection(col)
    rnd = random.Random(53)
    fx, fy = C.ZONES["fort"]["c"]
    z0 = C.ZONES["fort"]["h"]
    mur = C.get_mat("Mur_Fort", (0.62, 0.45, 0.30), 1.0)
    N, R = 24, 24.0
    seg = 2.0 * math.pi * R / N + 0.4

    for k in range(N):
        a = k * math.tau / N
        x, y = fx + R * math.cos(a), fy + R * math.sin(a)
        if k == 0:
            continue  # porte
        ruined = rnd.random() < 0.25
        h = rnd.uniform(1.2, 2.5) if ruined else 6.0
        C.box(f"Rempart_{k:02d}", (seg, 1.6, h), (x, y, z0 + h / 2.0 - 0.1), col, mur, rot_z=a + math.pi / 2)

    for k in range(3, N, 6):
        a = k * math.tau / N
        x, y = fx + R * math.cos(a), fy + R * math.sin(a)
        C.cone(f"Tour_{k:02d}", 3.4, 3.0, 10.0, 12, (x, y, z0 + 5.0 - 0.1), col, mur)

    C.box("Donjon", (12.0, 12.0, 9.0), (fx, fy, z0 + 4.5 - 0.1), col, mur)
    C.box("Donjon_Breche", (4.0, 2.0, 4.0), (fx + 6.0, fy, z0 + 2.0), col,
          C.get_mat("Ombre", (0.08, 0.06, 0.05), 1.0))

    for i in range(18):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(8.0, 28.0)
        x, y = fx + r * math.cos(a), fy + r * math.sin(a)
        s = rnd.uniform(0.6, 1.6)
        C.box(f"Gravats_{i+1:02d}", (s, s * 1.3, s * 0.8), (x, y, z0 + s * 0.4 - 0.1), col, mur,
              rot_z=rnd.uniform(0, 3.14))
```

- [ ] **Step 2 : Lancer avec le gabarit (`s05_fort`)**

- [ ] **Step 3 : Vérifier**

`get_scene_info` avec `query="Rempart"` et `limit=40`. Attendu : 23 éléments (24 moins la porte). `look` avec `target=["Donjon"]`, `distance=80`, `mode="angles"`, `views=["three_quarter","front"]`. Attendu : enceinte avec brèches, 4 tours, donjon central, au sommet d'une colline. Si les murs flottent ou sont enterrés, vérifier que le plateau est bien à l'altitude 14 (`common.height_at(fx, fy)`).

- [ ] **Step 4 : Sauvegarder** (`common.save()`)

---

### Task 8 : Props dispersés

**Files :**
- Create : `tools/blender/s06_props.py`

- [ ] **Step 1 : Écrire le script**

```python
import math, random, bpy, bmesh
import common as C


def far_from_zones(x, y, margin=8.0):
    for z in C.ZONES.values():
        if math.hypot(x - z["c"][0], y - z["c"][1]) < z["r"] + margin:
            return False
    return True


def rock(name, x, y, s, rnd, col, mat):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=s)
    for v in bm.verts:
        k = rnd.uniform(0.75, 1.2)
        v.co.x *= k * 1.2
        v.co.y *= k
        v.co.z *= k * 0.7
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return C.new_obj(name, me, col, mat, (x, y, C.height_at(x, y) + s * 0.2), (0, 0, rnd.uniform(0, 3.14)))


def run():
    col = C.coll("Props")
    C.clear_collection(col)
    rnd = random.Random(71)
    roche = C.get_mat("Roche", (0.45, 0.33, 0.25), 1.0)
    bois = C.get_mat("Bois_Mort", (0.28, 0.20, 0.14), 1.0)

    n = 0
    while n < 80:
        x, y = rnd.uniform(-240, 240), rnd.uniform(-240, 240)
        if not far_from_zones(x, y, 4.0):
            continue
        n += 1
        rock(f"Rocher_{n:02d}", x, y, rnd.uniform(0.8, 3.2), rnd, col, roche)

    n = 0
    while n < 30:
        x, y = rnd.uniform(-240, 240), rnd.uniform(-240, 240)
        if not far_from_zones(x, y):
            continue
        n += 1
        h = rnd.uniform(2.0, 3.5)
        C.cone(f"Arbre_Mort_{n:02d}", 0.2, 0.08, h, 6, (x, y, C.on_ground(x, y, h, 0.1)), col, bois)
        for b in range(3):
            a = rnd.uniform(0, math.tau)
            C.box(f"Arbre_Mort_{n:02d}_Branche_{b}", (1.2, 0.08, 0.08),
                  (x + 0.5 * math.cos(a), y + 0.5 * math.sin(a), C.height_at(x, y) + h * 0.75),
                  col, bois, rot_z=a)

    # Épave de pick-up
    px, py = -60.0, -40.0
    rouille = C.get_mat("Rouille", (0.42, 0.22, 0.12), 0.8)
    pneu = C.get_mat("Pneu", (0.05, 0.05, 0.05), 0.9)
    gz = C.height_at(px, py)
    C.box("Epave_Chassis", (4.8, 1.9, 0.5), (px, py, gz + 0.8), col, rouille, rot_z=0.4)
    C.box("Epave_Cabine", (1.8, 1.8, 1.0), (px + 1.2 * math.cos(0.4), py + 1.2 * math.sin(0.4), gz + 1.5), col, rouille, rot_z=0.4)
    C.box("Epave_Benne", (2.4, 1.9, 0.7), (px - 1.3 * math.cos(0.4), py - 1.3 * math.sin(0.4), gz + 1.2), col, rouille, rot_z=0.4)
    for i, (dx, dy) in enumerate([(1.6, 1.0), (1.6, -1.0), (-1.6, 1.0), (-1.6, -1.0)]):
        C.cone(f"Epave_Roue_{i+1}", 0.45, 0.45, 0.3, 12,
               (px + dx, py + dy, gz + 0.45), col, pneu, rot_z=0.4)
```

- [ ] **Step 2 : Lancer avec le gabarit (`s06_props`)**

- [ ] **Step 3 : Vérifier**

`get_scene_info` avec `query="Rocher"` et `limit=100`. Attendu : 80 rochers. `look` avec `target=["Epave_Chassis"]`, `distance=15`, `mode="angles"`, `views=["three_quarter"]`. Attendu : épave reconnaissable posée au sol.

- [ ] **Step 4 : Sauvegarder** (`common.save()`)

---

### Task 9 : Marqueurs de jeu

Ces points serviront de repères pour le client et le serveur (apparitions et objectifs).

**Files :**
- Create : `tools/blender/s07_markers.py`

- [ ] **Step 1 : Écrire le script**

```python
import bpy
import common as C


def empty(col, name, x, y, dz=0.0):
    o = bpy.data.objects.new(name, None)
    o.empty_display_type = 'ARROWS'
    o.empty_display_size = 2.0
    col.objects.link(o)
    o.location = (x, y, C.height_at(x, y) + dz)
    return o


def run():
    col = C.coll("Markers")
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    cx, cy = C.ZONES["camp"]["c"]
    for i, (dx, dy) in enumerate([(-4, 6), (4, 6), (-4, 10), (4, 10)]):
        empty(col, f"Spawn_Joueur_{i+1}", cx + dx, cy + dy)
    for name, z in (("Obj_Convoi", None), ("Obj_Village", "village"),
                    ("Obj_Oasis", "oasis"), ("Obj_Fort", "fort")):
        if z is None:
            empty(col, name, 0.0, -80.0)
        else:
            x, y = C.ZONES[z]["c"]
            empty(col, name, x, y)
    empty(col, "Spawn_Ennemis_Village", 140.0, 190.0)
    empty(col, "Spawn_Ennemis_Fort", -150.0, 160.0)
```

- [ ] **Step 2 : Lancer avec le gabarit (`s07_markers`)**

- [ ] **Step 3 : Vérifier**

`get_scene_info` avec `query="Spawn_"` puis `query="Obj_"`. Attendu : 4 points de départ joueurs, 2 points ennemis, 4 objectifs, tous avec une coordonnée Z égale au sol.

- [ ] **Step 4 : Sauvegarder** (`common.save()`)

---

### Task 10 : Lumière, ciel et rendu

**Files :**
- Create : `tools/blender/s08_lighting.py`

- [ ] **Step 1 : Écrire le script**

```python
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
```

- [ ] **Step 2 : Lancer avec le gabarit (`s08_lighting`)**

- [ ] **Step 3 : Vérifier avec le rendu des matériaux**

`look` avec `mode="viewport"`, `shading="rendered"`, `max_size=900`. Attendu : lumière chaude rasante, ombres lisibles, ciel bleu. Ajuster l'énergie ou l'angle du soleil si la scène est surexposée.

- [ ] **Step 4 : Sauvegarder** (`common.save()`)

---

### Task 11 : Bilan et budget de polygones

**Files :**
- Create : `tools/blender/s09_report.py`

- [ ] **Step 1 : Écrire le script**

```python
import bpy


def run():
    total = 0
    by_coll = {}
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        o.data.calc_loop_triangles()
        t = len(o.data.loop_triangles)
        total += t
        c = o.users_collection[0].name if o.users_collection else "?"
        by_coll[c] = by_coll.get(c, 0) + t
    for c, t in sorted(by_coll.items()):
        print(f"{c:10s} {t:8d} triangles")
    print("TOTAL", total)
    assert total < 400000, f"Budget dépassé : {total} triangles (limite 400000)"
    for name in ("Camp", "Oasis", "Village", "Fort", "Props", "Markers", "Terrain"):
        assert name in bpy.data.collections, f"Collection manquante : {name}"
    print("OK")
```

- [ ] **Step 2 : Lancer avec le gabarit (`s09_report`)**

Attendu : un tableau par collection, `TOTAL` sous 400 000 et `OK`. Si le budget est dépassé : réduire `x_segments` et `y_segments` du terrain (200 vers 150) dans `s01_terrain.py`, relancer `s01_terrain` puis `s02` à `s07` (le sol change, donc les objets doivent être replacés).

- [ ] **Step 3 : Vue d'ensemble pour l'utilisateur**

`look` avec `mode="angles"`, `shading="material"`, `views=["three_quarter","top"]`, `max_size=1024`. Montrer les images à l'utilisateur.

- [ ] **Step 4 : Sauvegarde finale** (`common.save()`), puis demander à l'utilisateur son accord avant de préparer le plan de l'étape 2 et l'export glTF.

---

## Auto-revue

- **Couverture du design (étape 1)** : camp, dunes, oasis, village en banco, fort en ruine, marqueurs, vérification du personnage wax sur copie, nouveau fichier séparé, sauvegardes, pas d'export. Le baking de l'éclairage, la compression Draco et KTX2 et l'export glTF sont reportés au plan de l'étape 2, car ils nécessitent l'accord de l'utilisateur.
- **Modèles des PNJ ennemis** : prévus à l'étape 4, hors de ce plan.
- **Cohérence des noms** : `common.py` définit `ZONES`, `height_at`, `get_mat`, `coll`, `clear_collection`, `new_obj`, `box`, `cone`, `on_ground`, `save`. Les scripts `s01` à `s09` utilisent ces seuls noms.
