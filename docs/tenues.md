# Sahel Game : bibliothèque de tenues

Le joueur choisit sa tenue dans un menu. **Les animations ne changent pas** : une tenue est un ensemble de pièces rattachées
aux mêmes os que le personnage de base.

## Tenues disponibles

| Id | Nom | Contenu |
|---|---|---|
| `wax` | Tenue wax (par défaut) | Sweat à capuche, pantalon cargo, baskets (dans `player.glb`) |
| `militaire` | Militaire camouflage | Treillis camouflage sable/vert/brun, gilet avec poches et bretelles, ceinture jaune moutarde, casque, cagoule, lunettes, gants, genouillères, bottes, écusson du Mali sur l'épaule (`assets/uniforms/militaire.glb`, 1,0 Mo après compression) |

## Choisir sa tenue en jeu

| Appareil | Ouvrir | Choisir | Valider | Annuler |
|---|---|---|---|---|
| Clavier | U | ← → | Entrée (ou Espace) | Échap (ou C) |
| Manette | Select | croix gauche / droite | A | B |
| Tactile / souris | bouton TENUE | ◀ ▶ | VALIDER | ✕ |

Pendant le menu, la tenue change en aperçu ; Annuler remet la tenue d'avant. Le personnage et la caméra restent immobiles.
Le choix validé est mémorisé dans le navigateur (`localStorage`, clé `sahel.uniform`).

## Ajouter une tenue

1. Dans Blender, ajouter les pièces dans une collection, rattachées à l'armature du personnage (poids sur les mêmes os).
2. Exporter : `blender -b assets/sahel_desert.blend --python tools/blender/s25_export_uniform.py -- "<dossier>/client" <id>`
   (le script exporte la collection `Tenue_Militaire` ; adapter le nom de collection pour une autre tenue). Résultat : `client/assets/uniforms/<id>.glb`.
3. Ajouter une entrée dans `client/config/uniforms.json` : `id`, `name`, `description`, `file`, et `hide` = pièces de base à cacher
   (`Hoodie`, `Pants`, `Shoes`, `Hair_Twists` ; ne jamais cacher `Body`, la peau).
4. Changer `ASSET_VERSION` dans `client/src/version.js` (sinon le navigateur garde l'ancien fichier en cache).

## Fonctionnement technique

- `src/uniforms.js` : lit `uniforms.json`, charge le `.glb` de la tenue à la demande (une seule fois), recrée les maillages skinnés sur
  le squelette du joueur (os retrouvés par leur nom, matrices de liaison conservées), cache les pièces de base listées dans `hide`.
- `src/wardrobe.js` : état du menu, sauvegarde, affichage. Tant que le menu est ouvert, `main.js` remplace les commandes du jeu par des commandes neutres.
- Si le fichier d'une tenue manque ou est abîmé, le menu affiche « Tenue indisponible » et le jeu continue avec la tenue précédente.
- Tests : `tests/uniforms.test.mjs` (bibliothèque, menu, sauvegarde, manette) ; scénarios Chrome `tenue_*` dans `src/autotest.js`
  (`node tests/e2e.mjs http://localhost:8080/index.html <dossier> tenue_militaire,tenue_run,tenue_menu,tenue_annule`).

## Poids des fichiers (compression sans perte visible)

| Fichier | Avant | Après |
|---|---|---|
| `assets/player.glb` (personnage, 57 animations, armes) | 2,67 Mo | 1,58 Mo |
| `assets/uniforms/militaire.glb` | 1,58 Mo | 1,02 Mo |

Après chaque export depuis Blender, passer les fichiers dans `tools/glb/compress_glb.mjs` (nécessite `npm i -g @gltf-transform/cli`) :

```
set APPDATA=%APPDATA%
node tools/glb/compress_glb.mjs <export.glb> client/assets/player.glb
node tools/glb/compress_glb.mjs <export.glb> client/assets/uniforms/militaire.glb --merge-skinned
```

- Supprime les doublons et la description inutile du fichier (3 166 petits blocs d'animation dans `player.glb`), recode la géométrie en Meshopt
  avec une précision élevée (positions et coordonnées de texture 16 bits, normales 12 bits). Les textures (déjà en WebP) ne sont pas retouchées.
- `--merge-skinned` (tenues seulement) regroupe les pièces de même matériau : 111 pièces deviennent 21, donc moins d'objets à dessiner. Ne pas l'utiliser sur
  `player.glb` : le jeu cache `Hoodie`, `Pants`, `Shoes` et `Hair_Twists` par leur nom.
- Vérifié : mêmes animations (57, 3 420 canaux), mêmes repères (`Muzzle`, `Weapon`...), canon à 0° du centre, captures identiques à l'œil.
- Les pièces d'une tenue partagent un seul squelette dans le jeu (`src/uniforms.js`).

## Teintes de peau

Le personnage n'a qu'une texture de corps (atlas : visage, mains, jambes, yeux). Trois variantes où seule la peau est recolorée sont dans
`client/assets/skins/peau_noire.webp` (d'origine), `peau_metisse.webp` (#B78773) et `peau_blanche.webp` (#ECC4B0).
`src/skins.js` donne à chaque personnage sa propre copie du matériau `Ch12_body` avec la texture choisie ; le joueur est noir (`main.js`),
les PNJ ont leur teinte dans `client/config/npcs.json` (clé `skin`, alliés comme miliciens). `player.glb` n'est donc pas modifié.
Régénérer : `python -I tools/uniforms/recolor_peau.py <atlas d'origine> <sortie.png> <couleur hex>` (sauvegardes des atlas d'origine dans `assets/backups/`), puis WebP.
Scénario Chrome : `peaux_vue` (les cinq PNJ en rang).

## Variantes de couleur de la tenue militaire (menu U)

Chaque couleur créée dans Blender reste dans la bibliothèque (`client/config/uniforms.json`) :

| id | Nom | Fichier |
|---|---|---|
| `militaire` | Militaire noir (tenue actuelle de Blender) | `militaire.glb` |
| `militaire_camo` | Militaire camouflage (version d'origine) | `militaire_camo.glb` |
| `militaire_sable` | Militaire sable (treillis uni #B89E70) | `militaire_sable.glb` |
| `militaire_roux` | Militaire brun roux (treillis uni #774122) | `militaire_roux.glb` |
| `militaire_gris` | Militaire gris (treillis gris nuancé, accessoires noirs, gants) | `militaire_gris.glb` |

`camo`, `sable` et `roux` partent de l'export d'origine (gilet vert, casque vert, ceinture moutarde) : `sable` et `roux` sont créés avec
`node tools/glb/recolor_material.mjs <militaire_camo.glb> <sortie.glb> U_Camo <RRGGBB>`. `gris` est l'export du 2026-11-06 (sauvegardé dans `assets/backups/`).
Les alliés portent `militaire` (noir). Scénarios Chrome `tenue_camo|sable|roux|gris`.
