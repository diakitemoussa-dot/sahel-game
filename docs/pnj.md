# Sahel Game : les PNJ

Un PNJ est le **même personnage que le joueur** (même modèle, mêmes 57 animations, mêmes collisions), habillé d'une **tenue à part**
et piloté par une patrouille au lieu du clavier.

## Tenue « Milicien du désert » (`pnj_milicien`)

Modélisée dans Blender d'après l'image de référence, style semi-réaliste, usée et sale, puis **retouchée à la main par l'utilisateur** (foulard de tête et tours de cou retirés,
retombée du foulard gardée). Collection `Tenue_PNJ` (objets `N_*`, 46 pièces), construite sur le même squelette que le joueur.
Fichier : `client/assets/uniforms/pnj_milicien.glb` (0,76 Mo après compression). Ne plus relancer `s33_pnj_outfit.py` : il reconstruirait la version d'origine et écraserait les retouches
(version d'origine du script exportée dans `assets/backups/pnj_milicien_version1_20261106.glb`).

| Élément | Détail |
|---|---|
| Foulard | kaki, retombée sur les épaules et le haut de la poitrine (la tête n'a plus de foulard dans la version retouchée) |
| Masque | noir, découpé dans la peau du visage (nez, bouche, menton) |
| Tunique | longue (jusqu'aux genoux), panneau brun au centre, flancs et manches indigo délavé, ouverte sur les côtés vers le bas (suit les jambes) |
| Gilet | olive, 2 poches hautes et 2 grandes poches basses à rabat, sangle de poitrine avec boucle, bretelles de cuir |
| Cuir | bandoulière en diagonale, ceinture avec boucle et languettes, sangles de la sacoche et de la gourde |
| Accessoires | sacoche sur la hanche droite, gourde sur la hanche gauche |
| Bas | pantalon kaki large, froncé aux chevilles ; chaussures de marche gris-brun |

Cette tenue n'est **pas dans le menu du joueur** (`"menu": false` dans `client/config/uniforms.json`) : un joueur ne peut pas la porter,
même avec une ancienne sauvegarde.

Fichiers de construction : `tools/blender/s33_pnj_outfit.py` (relancer `P.run()` reconstruit uniquement la collection `Tenue_PNJ`),
textures `tools/uniforms/make_pnj_textures.py` (dans `assets/textures/uniformes/pnj_*.png`), captures de contrôle `tools/blender/snap.py`.
Export : `blender -b assets/sahel_desert.blend --python tools/blender/s25_export_uniform.py -- "<projet>/client" pnj_milicien`, puis
`node tools/glb/compress_glb.mjs <export.glb> client/assets/uniforms/pnj_milicien.glb --merge-skinned`.

## PNJ dans le jeu

- `client/config/npcs.json` : liste des PNJ (id, tenue, arme, pause en secondes, route en coordonnées Blender). Trois PNJ patrouillent
  autour du camp de départ, sur des rectangles de 8 x 6 m sans obstacle (vérifié par un test).
- `client/src/npc.js` : charge `player.glb` une fois, en fait une copie par PNJ, les habille (`Outfit`) et les place.
- `client/src/patrol.js` : cerveau de patrouille (logique pure testée) : va de point en point, pause à chaque point, abandonne un point si un obstacle le bloque.
- Le PNJ marche arme baissée (`player.relaxed = true` : animations « Rifle Idle » et « Rifle Walk »).

Animations : le PNJ a **les 57 mêmes animations que le joueur** (même fichier `player.glb`, même sélection d'animation `pickClip`). Vérifié par le scénario
`pnj_animations` : mêmes noms, aucune piste d'animation sans os sur le squelette du PNJ. Aujourd'hui la patrouille n'utilise que « Rifle Idle » et « Rifle Walk » ;
les autres (course, tir, recharge, coups, mort...) seront déclenchées par l'IA de combat. Une commande ponctuelle peut déjà être envoyée à un PNJ (`npc.override = { kick: true }`).

Tests : `tests/patrol.test.mjs` ; scénarios Chrome `pnj_patrouille`, `pnj_gros_plan`, `pnj_animations`, `pnj_coup_de_pied`, `pnj_mort` dans `src/autotest.js`.

## À faire pour la suite (étape 4 du plan : combat)

Détection du joueur, tir, points de vie, mort (« Rifle Death »), autres modèles de PNJ (autres tenues et visages), réapparition par vagues.
