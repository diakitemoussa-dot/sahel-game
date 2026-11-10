# Avions de chasse et hélicoptères

- **Hélicoptères** : 2 hélicoptères d'attaque (gris-vert) tournent en permanence au-dessus de la carte, à 58 et 68 m au-dessus du sol, dans des sens opposés (rayons 140 et 120 m, 22 et 19 m/s). Rotor et rotor de queue tournent, feu rouge clignotant, patins. L'orbite A passe tout près de la zone de départ. Orbites réglables dans `HELI_ORBITS` (`client/src/aircraft.js`).
- **Avions de chasse** : toutes les 40 à 85 s (premier passage 20 s après le début), deux chasseurs en formation traversent le ciel devant le joueur (de gauche à droite ou l'inverse), à 85-135 m au-dessus du sol et 140-170 m/s, avec flamme de postcombustion et traînées blanches de condensation. Le passage dure environ 8 s.
- **Sons** (placés dans l'espace, suivis à chaque image) : battement de pales + moteur pour les hélicoptères, rugissement + sifflement des réacteurs avec **effet Doppler** (plus aigu en approche, plus grave en s'éloignant) pour les avions. Les moteurs se taisent en pause, pendant l'intro et quand on quitte la fenêtre.
- Ils ne tirent pas et ne font aucun dégât : c'est de l'ambiance.
- Aussi derrière le menu principal (pas pendant l'intro).
- Modèles : construits en code (`buildJet`, `buildHeli`), aucun fichier. Pour de vrais modèles : créer des .glb dans Blender et les charger à la place.
- Code : `client/src/aircraft.js` (modèles et trafic), `client/src/aircraftlogic.js` (orbites, passages, Doppler : `tests/aircraftlogic.test.mjs`), voix dans `client/src/sfx.js` (classe `Voice`).
- Écoute : `http://localhost:8080/sons.html` (boutons « Hélicoptère » et « Avion qui passe »).
- Tests : scénarios `air_helicos`, `air_avions` ; vues de contrôle `vue_avion`, `vue_helico`. En test automatique l'aviation est coupée (sauf ces scénarios).
