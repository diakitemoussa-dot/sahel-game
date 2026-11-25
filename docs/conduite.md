# Conduire un blindé

Deux blindés sont garés près du point de départ (`client/config/drive.json`). Le joueur peut en conduire un, avec ses alliés à bord.

## Déroulement
1. **S'approcher** (moins de 7 m) : le bouton **Entrer** apparaît (icône de porte, touches `E` et `R1`) ; il est aussi cliquable sur écran tactile.
2. **Monter** : le joueur marche jusqu'à la porte arrière et monte. Les alliés (3 au plus, les plus proches d'abord) le suivent : **l'un d'eux monte au poste de tir sur le toit**, debout, et tire sur les miliciens à moins de 75 m ; les autres s'installent à l'intérieur (invisibles, sans repère). Une caméra montre la scène. Au bout de 9 s au plus, ceux qui n'ont pas pu monter restent dehors.
3. **Conduire** : l'interface de conduite apparaît (vitesse en km/h, rapport D / R / N, jauge segmentée). L'encadré des commandes à l'écran a été retiré : elles sont dans le tableau ci-dessous. La caméra suit le véhicule ; souris ou stick droit pour regarder autour, elle revient d'elle-même.
4. **Descendre** : arrêter le véhicule (moins de 3 m/s) puis `E` / `R1` / bouton **Descendre**. Le joueur et les alliés sortent du côté gauche.

À bord, personne n'est touché (comme dans l'ancien système de blindé).

## Commandes
| Action | Clavier / souris | Manette | Écran tactile |
|---|---|---|---|
| Accélérer | `Z` / `W` / `↑` | `RT` ou stick gauche vers le haut | stick vers le haut |
| Freiner, reculer | `S` / `↓` | `LT` ou stick gauche vers le bas | stick vers le bas |
| Tourner | `Q` `D` / `A` `D` / `←` `→` | stick gauche | stick à gauche / à droite |
| Frein à main | `Espace` | `A` | — |
| Regarder autour | souris | stick droit | glisser un doigt (moitié droite) |
| Entrer / descendre | `E` | `R1` | bouton à l'écran |

## Où est le code
- `src/drivelogic.js` : physique (accélération, freinage, recul, braquage — volant à droite = le cap diminue —, frein à main) et liste des commandes — logique pure, testée (`tests/drivelogic.test.mjs`).
- `src/drive.js` : `DriveVehicle` (modèle, roues, sol, collisions, passagers, tireur, caméra), `DriveSystem` (bouton « Entrer », véhicule actif), `loadDrive`.
- `src/hud.js` : `setPrompt(texte, { icon, keys })` et `setDrive({ kmh, gear, frac })`.
- `src/input.js`, `src/gamepad.js` : `R1` = interagir, gâchettes `RT` / `LT`, frein à main.
- `src/main.js` : appelle la conduite à chaque image, remplace la caméra du joueur par la caméra de poursuite, rend les commandes à la descente.
- Scénarios : `conduite_bouton` (le bouton s'affiche), `conduite_entre` (monter, tireur, rouler).

## Réglages (`config/drive.json`)
Positions et caps des véhicules, portée du bouton, nombre de places, position de la porte, du poste de tir et de la sortie (repère du véhicule : x droite, z avant), caméra, vitesses.

## Limites connues
- Les blindés du **convoi** (qui roulent seuls) ne se conduisent pas : seuls les deux blindés garés le peuvent.
- Pas de son de moteur, pas de dégâts au véhicule ni aux personnages écrasés.
- Les passagers montent sans l'animation d'entrée (qui avait fait planter le jeu) : ils marchent jusqu'à la porte puis disparaissent à l'intérieur.
