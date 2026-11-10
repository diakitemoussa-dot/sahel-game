# Sahel Game : combat entre le joueur et les PNJ

Les PNJ voient, entendent, réagissent à la violence, se défendent et attaquent le joueur. Le joueur peut les tirer et les frapper.

## Points de vie et dégâts

Joueur et PNJ ont **100 points de vie**. Valeurs dans `client/src/combat.js` (un seul endroit pour équilibrer le jeu).

| Attaque du joueur | Dégâts | Pour tuer un PNJ |
|---|---|---|
| Fusil | 25 (x2 à la tête) | 4 balles (2 à la tête) |
| Pistolet | 15 (x2 à la tête) | 7 balles |
| Coup de poing (Melee Punch / Cross Punch / Elbow Punch / Pistol Whip) | 20 | 5 coups |
| Poing simple (Punch) | 15 | 7 coups |
| Coup de pied (Kick / Side Kick) | 30 | 4 coups |

| Attaque d'un PNJ | Dégâts | Pour tuer le joueur |
|---|---|---|
| Balle de fusil | 5 | 20 balles qui touchent |
| Coup au corps à corps | 12 | 9 coups |

- **Tir du joueur** : le rayon part du viseur (milieu de l'écran) contre le corps des PNJ (cylindre de 38 cm de rayon, 1,75 m). Un mur ou une tente entre le canon et le PNJ arrête le tir.
- **Coups du joueur** : le coup touche à un moment précis de l'animation (0,30 à 0,35 s après le début) si un PNJ est encore à moins de 1,9 m, dans son champ (58° de chaque côté).
- **Tir d'un PNJ** : la précision baisse avec la distance et si le joueur court ; un mur arrête le tir. Les tirs des PNJ sont visibles (trait orange).
- **Retour visuel** : barre de vie en bas, flash rouge quand le joueur est touché, croix autour du viseur quand un tir touche (rouge si le PNJ tombe), compteur « PNJ neutralisés ».
- **Indicateur de tirs** : quand un PNJ tire sur le joueur (même s'il rate) ou le frappe, un **arc jaune lumineux avec une pointe de flèche** (au milieu de l'arc, tournée vers le tireur, contour sombre pour bien se lire sur le sable, petite animation d'apparition) apparaît autour du personnage, du côté du tireur. Il tourne en direct quand le joueur pivote (le tireur reste au même endroit du monde), devient plein un instant puis s'efface en 2 s. Un seul arc par tireur (il se rafraîchit à chaque tir), 6 arcs au maximum. Un tir qui touche donne un arc plus net qu'un tir raté. Code : `client/src/hitdir.js` (angle, effacement, forme de l'arc et de la pointe, testés), `hud.js` (`shotFrom`, `updateIndicators`).
- **Mort** : le joueur tombe (« Rifle Death »), puis réapparaît 5 s plus tard au départ avec toute sa vie, protégé 3 s. Un PNJ (milicien ou allié) qui meurt reste mort pour de bon : il ne revient jamais, et son corps n'est plus animé 4 s après sa chute. Scénario : `mort_definitive`.

## Comportement des PNJ (`client/src/npcbrain.js`)

| État | Ce qu'il fait |
|---|---|
| Patrouille | Marche arme baissée sur sa ronde |
| Alerte | Il a vu le joueur (à moins de 28 m, dans son champ de vision de 144°, sans mur) ou entendu un tir (45 m) ou un combat (20 m) : il se tourne et lève son arme (0,55 s de réaction) |
| Combat | Loin (> 15 m) : il court vers le joueur. À bonne distance (4 à 15 m) : il tire par rafales de 0,6 s toutes les 1,5 s et se déplace de côté entre deux rafales. Trop près (< 4 m) : il recule. Collé au joueur (< 1,8 m) : il frappe (une attaque toutes les 1,3 s) |
| Touché | Il sursaute (« Hit Reaction »), puis se retourne vers l'endroit d'où on lui a tiré dessus et se bat, même s'il ne voyait pas le joueur |
| Blessé (< 30 % de vie) | Il se met à genoux pour tirer |
| Allié tombé | Les PNJ à moins de 30 m sont alertés |
| Joueur perdu de vue | Il cherche à sa dernière position connue pendant quelques secondes, puis reprend sa ronde |
| Joueur mort | Il cesse le combat |

Les PNJ utilisent la même classe `Player` que le joueur : mêmes 57 animations, mêmes collisions, mêmes entrées (viser, tirer, frapper). `Player.relaxed` baisse l'arme à la patrouille.

## Fichiers

- `client/src/combat.js` : règles pures (vie, dégâts, rayon contre un corps, obstacles, précision, cône de coup).
- `client/src/npcbrain.js` : cerveau des PNJ (logique pure).
- `client/src/skirmish.js` : relie tout (tirs, coups, bruit, alarmes, mort).
- `client/src/npc.js`, `patrol.js`, `hud.js` (barre de vie, flash, croix, messages).
- Tests : `tests/combat.test.mjs`, `tests/npcbrain.test.mjs` ; scénarios Chrome `combat_*` (`src/autotest.js`). En test automatique, les PNJ ne font que patrouiller, sauf les scénarios `combat_*` (`hostile: true`).

## Réglages à connaître

Tout est dans le code, en tête des fichiers : vue (28 m), ouïe, distances de combat, cadence des rafales, dégâts.
Les PNJ patrouillent à 12 à 25 m du départ du joueur : ils le repèrent donc très vite. Pour un début plus calme, les éloigner (`client/config/npcs.json`).

## Alliés et repères au-dessus des têtes

- **Alliés** (`client/config/npcs.json`, clé `allies`) : même personnage et même tenue militaire que le joueur. Ils suivent le joueur en formation (`slot` : côté, recul en mètres ; `allybrain.js`), voient tout autour d'eux et combattent les miliciens (dégâts alliés : fusil 10, mêlée 15). Mort : retour près du joueur après 15 s. `window.__game.spawnAllies()` les fait venir en test automatique.
- **Repères** (`hud.updateTags`, CSS `.tag`) : nom, barre de vie et flèche au-dessus de la tête. Vert : alliés ; rouge : miliciens ; bleu : le joueur (« Joueur », caché en vue première personne). Masqués si le personnage est mort, derrière la caméra ou à plus de 80 m.

## PNJ plus malins : abri, esquive, réactions rapides

Valable pour les miliciens et pour les alliés (même cerveau, `client/src/npcbrain.js`).
- **Abri** (`src/cover.js`, choisi par `skirmish._findCover` avec la géométrie réelle du monde) : dès qu'un PNJ voit son adversaire, il cherche dans un rayon de 14 m un point atteignable, caché du tireur quand on s'y accroupit, à 5 à 26 m de lui.
  Un abri **bas** (caisse, muret) est préféré : accroupi il y est caché, debout il tire par-dessus. Un abri **haut** oblige à se décaler pour voir.
  Cycle : il court à l'abri (`seek`), s'accroupit (`hide`, ~1 s, plus longtemps s'il est blessé), se relève et tire une rafale (`peek`), se recache ; après trois sorties ou s'il est touché, il en cherche un autre ; deux PNJ ne prennent pas la même place.
  Si aucun abri n'existe, il combat à découvert comme avant. Journal des tests : `npc_abri`, `allie_abri`.
- **Esquive** : quand une balle le vise ou passe à moins de 2,5 m (`brain.underFire()`), il fait un pas de côté à pleine allure (0,4 s, pas de visée, puis 1,3 s de repos). Une cible qui court ou s'accroupit est plus difficile à toucher (`hitChance`) ; accroupie, elle est aussi plus petite pour les tirs du joueur et des PNJ.
- **Réactions rapides** : repérage en 0,25 à 0,3 s (0,55 avant), rafales de 0,5 s toutes les 1,2 s, changements de direction plus vifs.
- **Miliciens dans toute la carte** (`config/npcs.json`, clé `zone`) : fort, village, oasis, convoi, deux points centraux, nord, sud, en plus du camp de départ (18 au total, rondes dans des carrés libres de 8 x 6 m trouvés avec le scénario `monde_sites`). Un milicien à plus de 125 m du joueur « dort » (ni mis à jour ni affiché) et se réveille à moins de 105 m : les performances restent celles de quelques PNJ.
- **Troisième allié** (`allie_3`, à droite et un peu devant le joueur).
- En test automatique seuls les miliciens du camp sont chargés ; les scénarios `monde_*` chargent tout. Tests : `tests/cover.test.mjs`, `tests/npcbrain.test.mjs`, scénarios `combat_abri`, `monde_eveil`.

## Carte de repérage (radar)

Cercle en haut à gauche (`hud.updateRadar`, projection pure dans `src/radar.js`, `tests/radar.test.mjs`). Le joueur (flèche bleue) est au centre et le haut est la direction où regarde la caméra ;
le cône clair est le champ de la caméra. Points rouges : miliciens (cerclés quand ils sont en alerte ou au combat) ; points verts : alliés. Portée 140 m ; au-delà, un point pâle posé sur le bord
indique la direction. Les miliciens morts disparaissent. Raccourci pour aller voir une zone : `index.html?tp=convoi` (fort, village, oasis, nord, sud, milieu1, milieu2).

## Rapidité des animations et suivi des alliés

- Toutes les animations hors combat sont jouées 20 % plus vite (`ANIM_SPEED` dans `src/animstate.js`) ; les vitesses de déplacement montent de 20 % aussi (`SPEED` dans `src/player.js` : marche 2,4, course 5,5, sprint 7,0, accroupi 2,0 m/s) pour que les pas collent au sol. Fondus : 0,3 s autour de l'arrêt et de la visée, 0,1 s entre deux déplacements ; la visée et le demi-tour du corps sont plus vifs.
  Les animations de combat gardent leur propre vitesse : le moment d'impact des coups en dépend (`MELEE_DELAY`, `combat.js`).
- Un allié court dès 3,5 m d'écart avec sa place et sprinte dès 8 m (`Follower`). Coincé contre un obstacle (moins de 35 cm en 0,7 s), il saute (double saut : il peut grimper) et contourne d'un côté, puis de l'autre.
