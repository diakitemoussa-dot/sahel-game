# Sahel Game : collisions sur maillage, montée sur les objets, double saut

## Collider mesh (et non boîte)

Tous les objets solides de la carte ont maintenant un **collider mesh** : leur vraie forme, pas une boîte ni un cercle. Une tente est une pyramide (on peut passer dans les coins de son ancienne boîte), un rocher garde sa forme de rocher, un mur sa forme de mur, la plateau et le toit du véhicule ont leur hauteur réelle.

- **Fabrication** : `tools/blender/s36_export_collision.py` remplace chaque objet solide des collections Camp, Oasis, Village, Fort, Props et Cabanes par l'**enveloppe convexe simplifiée** de sa géométrie (`tools/blender/colmesh.py` : au plus 96 triangles par morceau ; les troncs hauts et courbes sont découpés en tranches de 1,2 m). Résultat : `client/assets/collision.bin` (864 morceaux, 29 810 triangles, 0,5 Mo, format binaire compact `SCOL`).
- **Ignorés** : feuillage des palmiers, branches, tapis, matelas, étagère murale, brèche du donjon, eau.
- **Véhicule** : `tools/blender/s37_export_vehicle_collision.py` fait de même pour ses grosses pièces (capot, ailes, cabine, plateau, roues, pied et bouclier du canon, canons, caisses) : `client/assets/vehicles/technique_collision.bin` (1 888 triangles). Le jeu pose ces triangles là où il place le véhicule (`client/config/props.json`, clé `collision`).
- **Reconstruire après un changement dans Blender** : relancer les deux scripts :
  `blender -b assets/sahel_desert.blend --python tools/blender/s36_export_collision.py -- "<projet>/client"`
  (et `s37_...` pour le véhicule).

## Ce que fait le moteur (`client/src/meshworld.js`)

| Fonction | Rôle |
|---|---|
| `surfaceY` | hauteur du dessus d'un objet sous le personnage : on peut se tenir debout dessus (sol, caisse, toit...) |
| `pushOut` | repousse le personnage (cylindre de 0,4 m de rayon, 1,75 m de haut) hors des parois sur toute sa hauteur. Ce qui est plus bas que 45 cm (marche, rebord bas) s'enjambe ; ce qui est au-dessus de la tête (linteau de porte) ne bloque pas |
| `blocked` / `raycast` | les tirs et les lignes de vue des PNJ sont arrêtés par la vraie forme des objets (une caisse basse ne cache plus un PNJ debout derrière) |
| `findLedge` | cherche un rebord à portée de main devant le personnage (voir ci-dessous) |

Une grille de 2 m accélère les recherches. Si `collision.bin` est absent, le jeu retombe sur les anciennes boîtes 2D (`config/colliders.json`, toujours générées par `s22_export_config.py`).

## Monter sur les objets : saut, double saut, escalade

| Action | Résultat |
|---|---|
| Espace (A sur la manette, bouton SAUT) | saut d'environ **1 m** : on peut atterrir sur un objet de moins de 1 m (caisse) |
| 2e appui en l'air, **sans rebord** devant | **double saut** : il remonte, presque 2 m de haut au total |
| 2e appui en l'air, **près d'un rebord** (objet devant, entre 0,5 et 2,5 m plus haut que les pieds, avec la place d'y tenir debout) | il **grimpe** : il monte le long de l'objet puis se rétablit debout sur le dessus (0,85 s, animation de saut) |

On peut donc monter sur le capot, la plateau et le toit (2 m) du véhicule, sur les caisses, les rochers, les murets, les gravats. Les cabanes (3 m) restent trop hautes. En marchant hors d'un bord, le personnage tombe. Les PNJ utilisent les mêmes collisions.

## Tests

`tests/meshworld.test.mjs` : formes simples (boîte, pyramide), enjamber, linteau, tirs, rebords, et les **vraies données** (tente pyramidale, dessus de caisse, accès par la porte aux 18 maisons, toit du véhicule). Scénarios Chrome : `saut_simple`, `double_saut`, `saut_sur_caisse`, `double_saut_grimpe` (monte sur le toit du véhicule), `col_tente`, `col_caisse`, `entre_maison`, `vehicule_collision`.
