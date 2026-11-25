# Sahel Game : véhicule « technical » (pick-up armé)

Pick-up Land Cruiser 79 simple cabine camouflé (crème, olive, vert sombre, brun), avec un canon antiaérien jumelé ZU-23-2 sur la plateau, d'après l'image de référence. Modélisé de zéro dans Blender, semi-réaliste, sali (boue sur le bas de caisse et les ailes, poussière).

## Design (deuxième version)

Refait après la remarque « le design n'est pas très joli » : capot et toit **bombés**, ailes et cabine aux bords bien arrondis (biseaux à 4 segments), phares avec anneaux chromés, antibrouillards dans le pare-chocs, cadres noirs autour des vitres, gouttières, marchepieds, bavettes, charnières et loquets, bandes de caoutchouc sur les bords de la plateau, anneaux d'arrimage, chaîne de hayon, rétroviseurs avec glace, bande de munitions en laiton sur le canon, peinture brillante.
**Ombres de contact** (occlusion ambiante) peintes dans les couleurs de sommets : passages de roue, dessous, jonctions de panneaux sont plus sombres, ce qui donne du volume.

## Contenu

| Partie | Détail |
|---|---|
| Carrosserie | capot, ailes avec passages de roue, cabine avec vitres, calandre, phares, clignotants, pare-chocs, plaque, essuie-glaces, rétroviseurs, feux de toit |
| Détails de la référence | snorkel côté droit, poche de toile sur la porte gauche, roue de secours debout derrière la cabine |
| Plateau | plancher à nervures, bords avec passages de roue, hayon, pare-chocs et marche arrière, feux rouges, attelage, rails tubulaires olive, 5 caisses de munitions |
| Châssis | longerons, essieux, ponts, amortisseurs, ressorts, réservoir, échappement |
| Roues | 4 + roue de secours : pneu à sculptures, jante tôle à trous, 6 écrous |
| Canon ZU-23-2 | base à 3 pieds, colonne, plateau tournant, berceau, deux canons de 2 m levés à 25° (vers l'arrière, comme sur l'image), manchons, freins de bouche, boîtes de munitions, bouclier incliné, siège, volants de pointage, viseur |

Dimensions réelles (1 unité = 1 m) : 5,3 m de long, 1,95 m de large, 2,05 m de haut. L'avant est vers -Y dans Blender (+Z dans le jeu), le conducteur à gauche.

## Nœuds mobiles (pour animer plus tard)

`V_RoueAvG`, `V_RoueAvD`, `V_RoueArG`, `V_RoueArD`, `V_RoueSecours` (tournent autour de X), `V_Tourelle` (tourne autour de Z : pointage en direction), `V_Canons` (tourne autour de X : élévation, 25° au repos).

## Dans le jeu

- Fichier : `client/assets/vehicles/technique.glb` (0,63 Mo, environ 33 000 polygones ; les 323 pièces fixes sont regroupées par matériau en quelques dizaines de maillages).
- Placé par `client/config/props.json` (`client/src/props.js`) : posé sur le sol, **20 m à gauche (ouest) du départ du joueur**, sur un terrain plat vérifié. **Collider mesh** (`assets/vehicles/technique_collision.bin`) : l'enveloppe de ses pièces, pas une boîte. On ne le traverse pas, il arrête les tirs, et on peut **monter dessus** (capot, plateau, toit à 2 m) avec un double saut. Voir `docs/collisions.md`.
- C'est un décor : il ne roule pas et la tourelle ne tire pas encore.

## Fabrication

- `tools/blender/s34_vehicle.py` : construit tout (collection `Vehicule_Technique`, racine `Technique` posée à (0, -300, 0), hors de la carte). `V.run()` reconstruit uniquement cette collection.
- `tools/vehicles/make_camo_vehicule.py` : textures `camo_vehicule.png` et `peinture_olive.png` (`assets/textures/vehicules/`).
- `tools/blender/s35_export_vehicle.py` puis `node tools/glb/compress_glb.mjs <export.glb> client/assets/vehicles/technique.glb --merge-static`.
- La saleté est portée par les couleurs de sommets (multipliées à la texture) ; la carrosserie est subdivisée en cellules de 10 cm pour que la boue ait du détail.

Tests : `tests/props.test.mjs` ; scénarios Chrome `vehicule_vue`, `vehicule_proche`, `vehicule_cote_soleil`, `vehicule_avant`, `vehicule_collision`.

## Blindé MRAP : monter, s'installer et rouler (avec les alliés)

> **Désactivé.** Décision : les personnages n'entrent plus dans le blindé. Il reste un décor posé sur la piste (avec sa collision). Les réglages sont gardés dans `client/config/props.json` sous la clé `boardingOff` ; pour tout réactiver, la renommer en `boarding` (le code, `src/boarding.js`, est toujours là et testé).

Modèle et animation faits dans `assets/blinde_mrap.blend` (le personnage de ce fichier n'est **pas** exporté : le jeu a le sien).

- **Fichiers** : `client/assets/vehicles/blinde.glb` (0,17 Mo ; la porte arrière est un nœud animé, clip `Porte_Arriere_Ouvre`), `blinde_collision.bin` (10 enveloppes convexes : châssis, coque, roues, marchepied, portes), `client/assets/anims/entrer_blinde.glb` (0,08 Mo : le squelette seul avec le clip `Entrer_Blinde_Arriere`, 156 images à 24 i/s, les cibles IK sont cuites dans les os).
- **Fabrication** : `tools/blender/s38_export_blinde.py` (dans le Blender ouvert ou en arrière-plan) puis `node tools/glb/compress_glb.mjs <brut.glb> <sortie.glb> [--merge-static]` (les nœuds animés ne sont plus fondus dans les pièces fixes).
- **Placement** : `client/config/props.json`, décor `blinde_1`, posé **sur la piste** (`config/road.json`) à l'ouest du départ. Clés `boarding` : `anim`, `clip`, `doorClip`, `start` (là où le personnage commence l'animation : 7 m derrière le centre, repère Blender), `clipEnd` (où ses hanches finissent), `reach` (portée de l'invite), `seats` (places), `queue` (places d'attente), `cruise` (vitesse, m/s), `speed` (vitesse de l'animation).
- **Jeu** (`src/boarding.js`, `src/vehicle.js`) :
  1. près de la porte arrière, l'invite **E : monter dans le blindé** apparaît ;
  2. le joueur monte d'abord, puis les alliés vivants un par un (les autres attendent à côté de la porte, sans se marcher dessus) : animation d'entrée, puis chacun glisse jusqu'à sa place et reste assis ;
  3. le premier allié (le plus proche de la porte) **conduit** : le blindé suit la piste (8 m/s), s'incline sur le relief, les roues tournent, la collision du véhicule est retirée pendant qu'il roule ;
  4. **E : arrêter le blindé** (ou fin de piste) : il freine, la porte s'ouvre, tout le monde descend par l'animation jouée à l'envers, la collision est reposée.
  Personne n'est touché à bord (le joueur est protégé, les alliés ne sont ni visés ni blessés). Sans allié, le joueur monte seul et peut descendre (E).
- **Le joueur est le tireur** : après l'animation d'entrée il **se lève et marche** dans le véhicule jusqu'au pied de la **trappe du toit** (x = 0, y = 0,65 dans le repère Blender, toit à 3,25 m), monte sur son poste (`rootY` = hauteur des pieds, 2,3 m : la ceinture au niveau du toit) et reste **debout dans le véhicule, le haut du corps dehors**. La bague, la trappe et les périscopes qui dépassaient autour du trou ont été retirés à l'export (sur une copie : le .blend n'est pas touché). Le jeu le pilote alors avec ses commandes normales : viser à la souris, tirer, recharger, changer d'arme, tourner à 360° ; mais il ne marche pas et ne saute pas (`Player.locked`). Il suit le blindé, qui roule. E arrête le blindé, puis il redescend par la porte.
- Autres places (repère Blender) : conducteur (0,6 ; -1,1), banc gauche avant (-1,0 ; 1,6) et arrière (-1,0 ; 3,2). La place où l'animation se termine (1,0 ; 3,18) reste libre : chacun la traverse puis s'en éloigne, personne ne s'assoit sur un autre.
- **Caméra d'installation** : pendant que le joueur et les alliés montent (puis descendent), la caméra passe en fondu derrière le blindé, à gauche et en hauteur, face à la porte ouverte (`boarding.camera` dans props.json : `pos` et `look`, repère Blender) ; elle redonne la main au jeu dès que le blindé démarre. Le joueur ne tire pas pendant ce temps.
- **Sol** : l'animation suppose un sol plat au niveau du véhicule ; sur un sol plus haut ou plus bas derrière le blindé, les personnages enfonçaient les pieds dans la terre. Ils sont maintenant remontés de l'écart mesuré (`groundBlend`), qui s'efface pendant qu'ils montent sur le marchepied.
- Arrivé au bout de la piste, le blindé repart dans l'autre sens à la montée suivante (le chemin est retourné).
- Tests : `tests/vehicle.test.mjs`.
