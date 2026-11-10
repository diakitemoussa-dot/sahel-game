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
