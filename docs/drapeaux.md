# Drapeaux du Mali sur les véhicules

Chaque véhicule porte un drapeau du Mali (vert, jaune, rouge en partant du mât) au sommet de son antenne : les deux blindés garés, les trois du convoi et le Technical (qui n'a pas d'antenne : un petit mât noir est ajouté derrière le plateau). Un blindé du convoi neutralisé perd son drapeau.

## Comment il flotte
- **Le vent du jeu** : le même que celui de la poussière et de la fumée (`wind()` dans `dust.js`), qui souffle toujours dans la même direction avec des rafales.
- **Le mouvement du véhicule** : le drapeau suit le *vent apparent* = vent − vitesse du véhicule. À l'arrêt il suit le vent ; en roulant il est plaqué vers l'arrière et claque d'autant plus que le véhicule va vite.
- **Force** : sans vent le bout pend ; vers 3 m/s de vent apparent le tissu est complètement tendu. L'ondulation grandit vers le bout libre, et chaque drapeau a sa phase (ils ne battent pas à l'unisson).

## Où est le code
- `src/flaglogic.js` : vent apparent, force, forme du tissu — logique pure, testée (`tests/flaglogic.test.mjs`).
- `src/flag.js` : le tissu 3D (maillage 16 × 5 recalculé à chaque image), le mât, et `FlagSystem` (un drapeau par véhicule, mis à jour une fois par image).
- `config/drive.json` et `config/convoy.json` : `flag.tip` = sommet de l'antenne dans le repère du véhicule ([x, y, z]) ; `flag.pole.base` ajoute un mât (Technical).
- La taille du drapeau (0,7 × 0,47 m) est `FLAG` dans `flaglogic.js`.
