# Effets sonores

Tous les sons sont **fabriqués par calcul** (Web Audio, aucun fichier audio) : `client/src/sfxsynth.js`. Lecture, volume et placement dans l'espace : `client/src/sfx.js` ; règles pures (distance, gauche/droite, cadence des pas) : `client/src/sfxlogic.js`.

| Événement | Son |
|---|---|
| Tir du joueur / des PNJ | `rifle`, `pistol` (les PNJ sont placés dans l'espace : plus loin = plus faible, plus sourd, en retard) |
| Balle dans le sable | `impact_dust` |
| Balle ou coup sur un corps | `impact_flesh` |
| Balle qui passe près du joueur | `whiz` |
| Touche un PNJ / le neutralise | `hit_tick` / `kill` |
| Joueur touché / tombé | `hurt` / `death` |
| Pas (sable), atterrissage | (aussi ceux des soldats et alliés à moins de 40 m, placés dans l espace) | `step` (cadence selon la vitesse, discret accroupi), `land` |
| Recharge (fusil, pistolet), changement d arme | `reload_rifle`, `reload_pistol` (déclic, chargeur qui glisse et tombe, nouveau chargeur, culasse : calés sur l animation), `switch` |
| Coups de poing / de pied | `punch`, `kick` |
| Menu | `ui_move`, `ui_ok`, `ui_back`, `ui_start` |
| Ambiance | vent du désert en boucle, discret (coupé pendant la vidéo d'intro) |

- Volume : réglage « Volume (intro et effets) » des options (mémorisé).
- Le navigateur n'autorise le son qu'après un clic ou une touche : le son démarre au premier geste.
- Test automatique (`?autotest=`) : muet.
- **Écouter et régler** : ouvrir `http://localhost:8080/sons.html` (un bouton par son, curseurs volume / distance / côté, bouton vent).
- Tests : `tests/sfxlogic.test.mjs`, et `node tests/sfx_e2e.mjs` (chaque son fabriqué hors ligne : audible et non saturé ; le jeu demande bien les sons).
- Pour modifier un son : éditer sa fonction dans `SYNTH` (`sfxsynth.js`) puis changer `ASSET_VERSION`.
