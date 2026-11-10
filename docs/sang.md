# Sahel Game : effets de sang sur les PNJ

Semi-réaliste : rouge sombre, taches irrégulières qui sèchent et s'effacent. Uniquement sur les PNJ.

| Effet | Détail |
|---|---|
| Jet à l'impact | gouttelettes projetées **dans le sens du tir** (puis retombées par gravité) et une brève brume rouge au point touché. Effet volontairement mesuré : 7 gouttelettes pour une blessure légère, une vingtaine pour un coup fatal. Plus le coup est grave, plus il y en a (dégâts, tir à la tête, coup fatal) |
| Éclaboussures au sol | environ une gouttelette sur trois qui retombe sur le sable laisse une petite tache irrégulière (posée à plat sur la pente), qui s'efface en 30 s |
| Mare | sous un PNJ tombé, une mare se forme (0,9 s après la chute), s'étend en quelques secondes (1 m de large au maximum) puis s'efface au bout de 60 s |
| Coups au corps à corps | même effet, projeté dans le sens du coup |

Désactiver le sang : ajouter `?sang=0` à l'adresse du jeu (par exemple `index.html?sang=0`).

Code : `client/src/blood.js` (`splatSpecs`, `poolRadius`, `decalAlpha`, `groundNormal` : logique pure testée ; `BloodFx` : affichage). Déclenché par `Skirmish.hurtNpc` (`bloodFx.hit`) et à la mort du PNJ (`bloodFx.bleed`).
Réserve circulaire de 140 taches (la plus ancienne est remplacée) : pas de ralentissement même après un long combat.
Tests : `tests/blood.test.mjs` ; scénarios Chrome `sang_impact` et `sang_mare`.
