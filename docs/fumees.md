# Fumées et champ de bataille

- **Colonnes de fumée noire** (comme sur la photo de référence) : noires et rougeoyantes au pied, de plus en plus grises et larges en montant, qui dérivent avec le vent. Elles sont déjà hautes au démarrage.
- **Foyers au sol** (`client/config/smoke.json`, repère Blender x, y) : 6 colonnes réparties dans la carte (sud près du départ, milieu ×2, nord, oasis, fort).
- **Véhicules en feu** : 3 épaves de « Technical » carbonisées (`config/props.json`, entrées `technique_brule_*`, avec collision), flammes, crépitement et lueur sur le décor proche.
- **Missiles** : toutes les 30 à 60 s (première frappe 16 s après le début), un missile traverse le ciel avec sa traînée blanche, tombe loin devant le joueur (70 à 280 m, de préférence dans son champ de vision) et explose : boule de feu, éclair, anneau de poussière, secousse de la caméra si proche, grondement. Le point d'impact devient une nouvelle colonne de fumée qui brûle environ 1 minute puis s'éteint. Les frappes ne font aucun dégât.
- **Sons** : `explosion`, `missile` (sifflement), `crackle` (feu), placés dans l'espace (voir `docs/sons.md`).
- Aussi derrière le menu principal (pas pendant l'intro).

Code : `client/src/smoke.js` (rendu : panneaux face caméra, une couche normale pour la fumée, une couche additive pour le feu), `client/src/smokelogic.js` (règles pures, `tests/smokelogic.test.mjs`).

**Ajouter ou déplacer un foyer** : modifier `config/smoke.json` (`kind` : `column` grande colonne, `car` véhicule ; `scale` : taille) puis changer `ASSET_VERSION`. Pour une épave de plus : copier une entrée `technique_brule_*` de `props.json`.

**Tests** : `?autotest=fumee_sites`, `fumee_frappe` ; vues de contrôle `vue_fumee_epave`, `vue_fumee_colonne`, `vue_fumee_frappe`. En test automatique les fumées sont coupées (sauf ces scénarios) pour garder les tests rapides.
