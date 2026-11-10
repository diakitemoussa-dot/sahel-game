# Sahel Game : flamme de bouche du canon

Chaque coup de feu (joueur et PNJ) produit une **petite flamme** à la bouche du canon : éclair orange à cœur jaune, quelques étincelles, un peu de fumée. Sa taille est réglée par `FLAME_SIZE` en tête de `muzzle.js` (0,3 ; 1 = grosse boule de feu, version précédente jugée trop forte).

| Élément | Détail |
|---|---|
| Éclair | sprite à la bouche du canon, 0,07 s : cœur blanc-jaune, halo orange, quelques pointes qui rayonnent. 4 sprites réutilisés (cadence du fusil : 10 coups/s) |
| Boule de feu | 17 particules qui jaillissent surtout vers l'avant (jusqu'à 14 m/s), un peu sur les côtés et en arrière, 0,1 à 0,3 s. Couleur selon la chaleur : jaune-orange, orange, puis braise rouge |
| Étincelles | 14 points brillants rapides (8 à 22 m/s) qui retombent, 0,15 à 0,4 s |
| Fumée | 3 volutes grises qui s'attardent environ 1 s et dérivent avec le vent |
| Lumière | éclairage orange très bref (0,09 s) sur le personnage et le sable autour |
| Pistolet | effet réduit à 70 % |

Code : `client/src/muzzle.js` (`burstSpecs`, `heatColor`, `flashLevel` : logique pure testée ; `MuzzleFlash` : affichage). Déclenché par `shoot()` dans `main.js` (joueur) et `Skirmish.npcShoot` (PNJ).
Tout est préalloué : aucune allocation pendant le jeu, et la lumière est toujours présente (intensité 0 au repos) pour éviter les saccades de compilation.
Réglages : nombre de particules, tailles, couleurs et durées en tête de `burstSpecs` ; puissance de la lumière dans `MuzzleFlash.shot` (22).
Tests : `tests/muzzle.test.mjs` ; scénarios Chrome `tir_flamme` et `tir_flamme_pistolet`.
