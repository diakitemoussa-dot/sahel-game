# Mission : éliminer tous les miliciens avec son escouade

- **Objectif** : neutraliser les 18 miliciens avec les 3 hommes de l'escouade (alliés en tenue militaire). Au clic sur JOUER, un message rappelle la mission.
- **Panneau en haut à gauche** : `Miliciens : X / 18` et `Escouade : Y / 3` (hommes encore debout). Tous les miliciens comptent,
  qu'ils soient tombés sous les balles du joueur, de ses hommes, du feu ou d'une explosion.
- **Victoire** : quand le dernier milicien tombe, le message **MISSION ACCOMPLIE** s'affiche avec le bilan : escouade au complet (3/3)
  ou « 2 hommes sur 3 ». La partie continue.
- Code : `client/src/mission.js` (règles pures, `tests/mission.test.mjs`), panneau et message dans `hud.js`, branchement dans `main.js`.
  Scénarios : `mission_victoire`, `mission_en_cours`.
