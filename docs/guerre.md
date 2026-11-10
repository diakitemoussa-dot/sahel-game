# Guerre intense

Le jeu n'est plus un décor calme : il y a toujours de la guerre autour du joueur.

## Guerre de fond (`client/src/war.js`, règles dans `warlogic.js`)
- **Combats lointains** : deux groupes à 100-300 m s'échangent des rafales (traçantes rouges et vertes, flammes de bouche, tirs entendus de loin,
  la moitié des balles finit dans le sable). Un nouveau combat toutes les 6 à 13 s, 3 au plus en même temps.
- **Explosions lointaines** : toutes les 10 à 22 s à 150-340 m, avec fumée et feu (8 foyers temporaires au plus).
- **Salves d'obus** : toutes les 34 à 60 s, 1 à 3 obus plongent du ciel à 45-115 m du joueur, de préférence devant lui.
- **Rafales d'hélicoptère** : toutes les 11 à 24 s, un hélicoptère balaie le sol de traçantes jaunes, parfois près du joueur (sifflement des balles).
- **Avions** : un passage toutes les 30 à 58 s, **2 missiles** par passage (1 par avion).

## Le souffle des explosions
Toute explosion (missile d'avion, obus, explosion lointaine) blesse le joueur et les PNJ proches : jusqu'à 75 points au centre, rien à 10 m
(plus loin pour les grosses). Les miliciens à moins de 70 m sont mis en alerte. Les explosions et missiles s'entendent maintenant de loin (700 m).

## Combat plus dur
- Miliciens : repèrent en 0,25 s (avant 0,3), voient à 34 m (28), entendent à 60 m (45), rafales plus longues et plus rapprochées,
  6 points par balle (5) : 17 balles pour tuer le joueur (20 avant). Un milicien tué alerte ceux qui sont à moins de 45 m (30).
- Joueur touché : l'écran rougit et **la caméra tremble**. Sous 30 % de vie, le bord de l'écran **pulse en rouge**.

## Téléphone
`war` dans `perfprofile.js` : 1 (ordinateur), 0,6 (téléphone), 0,4 (téléphone modeste) : moins d'événements de fond, toutes les cadences sont divisées par ce niveau.

## Réglages
`WAR` dans `warlogic.js` (cadences, portées, tailles de rafales) ; `blastDamage` (souffle) ; `NPC_DAMAGE` dans `combat.js`.
Tests : `node --test tests/warlogic.test.mjs` ; scénarios `fumee_guerre_helico` et `fumee_guerre_souffle`.

## Miliciens (réglage du 8 nov.)
- **Plus solides** : 160 points de vie (`ENEMY_HP`), soit 7 balles de fusil au lieu de 4.
- **Tirent plus vite** : une balle toutes les 0,12 s en rafale (`ENEMY_FIRE_GAP`, avant 0,2 s), rafales plus longues et plus rapprochées.
- **Agissent vite** : ils repèrent en 0,15 s, le sursaut quand on les touche ne dure que 0,3 s (avant 0,7), esquive et abri plus vifs,
  corps à corps toutes les 0,9 s (avant 1,3 s). Les alliés gardent leurs réglages.
