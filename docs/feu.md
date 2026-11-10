# Le feu qui brûle et les frappes des avions

## Le feu brûle (`client/src/firelogic.js`)
- Chaque foyer en feu (colonnes de fumée, épaves, impacts de missile) a une **zone de brûlure** : un cercle un peu plus large que les flammes
  (colonne ≈ 2,7 m, épave ≈ 1,7 m). Un impact de missile ne brûle qu'une fois le feu bien pris et s'éteint à la fin de sa vie.
- **Joueur ou PNJ dans le feu** : il perd des points de vie **petit à petit** : 8 pv/s au contact, jusqu'à 18 pv/s après 3 s.
  Rester dedans tue en 6 s environ. Après la sortie il brûle encore 2,5 s (de moins en moins fort). Des flammes et un peu de fumée
  sortent de son corps ; le joueur voit l'écran rougir, entend son cri et lit « Vous brûlez ! ». Sa barre de vie baisse ; celle des PNJ aussi.
- **Mort par le feu** : le joueur réapparaît au départ (comme après une balle) ; un PNJ ou un allié reste mort (« Un allié a brûlé »).
- Pas de brûlure si on est à plus de 2,6 m au-dessus du foyer (toit, saut).

## Les PNJ n'entrent pas dans les flammes
- Ils gardent **1 m de marge** autour de la zone de brûlure : un PNJ qui marche vers le feu longe le bord et le contourne.
- Un PNJ pris par une explosion sort du feu en courant (5 m/s), il brûle un peu au passage.
- Ils ne choisissent pas d'abri dans le feu. Les routes de patrouille autour des foyers ont été élargies (`config/npcs.json`) ;
  un test vérifie qu'aucune route ne traverse une zone évitée.

## Les frappes viennent des avions de chasse
- Il n'y a plus de missile qui tombe du ciel au hasard. À chaque passage des deux avions (`aircraft.js`), le premier tire un missile
  au tiers de la traversée, le second 0,8 s plus tard. Chaque missile part du **dessous de l'avion**, vole vers un foyer devant le joueur
  (70 à 280 m, sinon jusqu'à 520 m) et explose en laissant un nouveau foyer qui brûle ~1 min.
- Passages : le premier après 14 s, puis toutes les 32 à 68 s.

## Réglages
`BURN` dans `firelogic.js` : dégâts, durée après la sortie, marge des PNJ, vitesse de fuite. `AirTraffic.strikes = false` coupe les tirs d'avion.

## Tests
`node --test tests/firelogic.test.mjs` (dégâts progressifs, contournement, fuite, routes de patrouille) ;
scénarios `fumee_brule_joueur`, `fumee_brule_mort`, `fumee_brule_pnj`, `fumee_avion_frappe` (`node tests/e2e.mjs <url> <dossier> <scénarios>`).
