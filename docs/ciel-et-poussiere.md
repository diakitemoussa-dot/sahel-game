# Sahel Game : ciel, soleil, nuages et poussière

## Ciel (`client/src/sky.js`)

Un dôme dessiné par un shader, qui suit la caméra (le ciel est toujours à l'infini).

- **Dégradé** : bleu profond au zénith, bleu pâle plus bas, puis **brume chaude** à l'horizon. La couleur de la brume est aussi celle du brouillard (`HORIZON`) : le sable lointain s'y fond sans ligne visible.
- **Soleil** : disque éblouissant, halo et grande lueur chaude. Sa direction est **celle de la lumière du jeu** (`SUN`, même direction que l'ancienne lumière (-60, 90, -40)) : le soleil qu'on voit correspond aux ombres. Au départ il est **derrière le joueur, à droite, haut dans le ciel** : on le voit en se retournant et en regardant vers le haut.
- **Nuages** : en volume, éclairés du côté du soleil (bord doré), qui dérivent lentement avec le vent. Couverture réglable (`cover`, 0,46 par défaut : plus petit = plus de nuages).
- Le ciel n'utilise pas la correction de tonalité (AgX) : ses couleurs sont exactement celles de la brume.

## Poussière (`client/src/dust.js`)

| Effet | Détail |
|---|---|
| Grains en suspension | 650 petits grains clairs autour de la caméra, qui scintillent et dérivent avec le vent (boîte de 76 m qui suit la caméra) |
| Voiles de poussière | 70 grandes taches très transparentes qui rasent le sol, plus denses dans les rafales |
| Pas | un nuage tous les 0,13 s sous un personnage qui court (joueur et PNJ), plus gros en sprint |
| Impacts | jet de poussière quand une balle (joueur ou PNJ) finit au sol |
| Vent | toujours dans le même sens, avec des rafales (`wind()`) |

Les nuages de poussière naissent invisibles, grossissent, puis s'effacent (pas de « pop »). Tout est préalloué : aucune allocation pendant le jeu.

## Réglages

Tout est en tête de `sky.js` et de `dust.js` : couleurs (`HORIZON`, `ZENITH`, `LOW_SKY`), couverture des nuages, nombre de grains et de voiles, opacité, taille et durée des nuages de pas et d'impact.
Pour avoir le soleil **devant** le joueur au départ (rendu à contre-jour, personnage plus sombre), changer `SUN` dans `sky.js` : la lumière du jeu suit automatiquement.

## Tests

`tests/sky_dust.test.mjs` (direction du soleil, bouclage des grains, vent, cycle de vie des particules). Scénarios Chrome : `ciel_soleil`, `ciel_nuages`, `ciel_horizon`, `poussiere_course`, `poussiere_test`.
