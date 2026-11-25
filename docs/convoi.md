# Convoi de blindés et lance-missiles

Trois blindés MRAP (`client/assets/vehicles/blinde.glb`) roulent **doucement** (3,2 m/s, environ 11 km/h) en file sur la longue piste (`config/road.json`), à 17 m les uns des autres. Des miliciens lance-missiles, en embuscade au bord de la piste, les prennent pour cible.

Réglages : `client/config/convoy.json` (piste, positions de départ sur la piste, vitesse, distance entre blindés, points de vie `hp`, boîte de collision, portée et cadence des lance-missiles). Code : `client/src/convoy.js` (file, dégâts, contournement, modèles 3D), `skirmish._launchStep` (les tireurs), `world.addDynamic` (collision des blindés qui roulent). Tests : `tests/convoy.test.mjs`. Scénario : `?autotest=convoi_vue`.

## Les lance-missiles
Trois miliciens ont `"launcher": true` dans `config/npcs.json` (`pnj_lance_1` à `3`, embusqués à 25 à 35 m de la piste, en hauteur quand c'est possible). Tant qu'ils sont tranquilles, ils repèrent un blindé vivant à 30 à 85 m **dont ils ont la ligne de vue**, le visent 1,8 s, puis tirent un missile **en anticipant sa course** (marge d'erreur de 0,8 m + 2 % de la distance), puis rechargent 10 à 16 s. Si le joueur les repère, ils se battent contre lui comme les autres miliciens.
Le missile est celui de `SmokeSystem.launchMissile` (traînée de fumée, son, éclair). À l'explosion : jusqu'à 4 m, 2 points de dégâts au blindé ; jusqu'à 8 m, 1 point ; le souffle blesse aussi le joueur et les PNJ proches. Un blindé a 3 points de vie : **deux tirs bien placés le neutralisent** : il s'arrête, noircit et brûle (foyer de fumée), et le message « Un blindé du convoi est neutralisé » s'affiche.

## Contournement intelligent des épaves
Quand un blindé est neutralisé, ceux qui le suivent **ne s'arrêtent pas derrière** : ils le contournent.
- Ils **choisissent un côté praticable** (gauche d'abord, sinon droite) en vérifiant le terrain 12 m avant à 12 m après l'épave : pas d'objet de la carte, pas de pente de plus de 22° en tangage ou 17° en roulis.
- Ils **ralentissent** (2 m/s) et se **décalent progressivement** (jamais plus de 1,6 m/s de côté : pas de coup de volant) entre 35 et 15 m avant l'épave, la dépassent à 5,6 m de son axe (les deux boîtes de 4,2 m ne se touchent pas), ne reviennent sur la piste qu'une fois **entièrement dépassée** (14 à 26 m après), puis reprennent leur vitesse.
- Le véhicule s'oriente dans le sens où il se décale ; la file garde ses distances (chacun suit le véhicule **vivant** qui le précède) ; une autre épave sur le passage est contournée de la même façon.
- **Si aucun côté n'est praticable**, ils s'arrêtent à 14 m avant l'épave.
- En fin de piste, chacun s'arrête pile à sa place dans la file.

## Pose sur le sol (roues, suspension)
Chaque blindé est posé sur ses **quatre roues** (`rideOnSurface`, `vehicle.js`) avec les vraies mesures du modèle : essieux à +2,91 m et -1,69 m de l'origine, demi-voie de 1,72 m.
- **Vraie hauteur du sable** : un rayon sous chaque roue sur le maillage du sable proche de la piste (la carte de hauteur est trop grossière : avant, les roues s'enfonçaient jusqu'à 73 cm ou flottaient jusqu'à 30 cm).
- **Inclinaison** : le plan des quatre roues (nez en haut, côté droit en haut), limitée à 18° en tangage et 15° en roulis. L'ancien code inclinait le véhicule du mauvais côté en roulis.
- **Hauteur** : celle qui pose la roue la plus haute sur le sol, donc aucune roue ne s'enfonce.
- **Suspension** : chaque roue descend jusqu'au sol (jusqu'à 60 cm) quand le terrain est irrégulier ; elles ne pendent plus dans le vide.
- **Stabilité** : hauteur, tangage et roulis sont lissés indépendamment du nombre d'images par seconde (plus de tremblement à 60 ou à 144 Hz).
Mesure sur 1 920 relevés le long de la piste : écart entre le bas des roues et le sol de -0,18 m à +0,68 m (5 % des roues à moins de -2 cm, médiane +3 cm, 95 % à moins de +15 cm) ; avant : de -0,73 m à +0,30 m avec des écarts constants de 20 à 40 cm.

## Avancement du convoi sur la carte
- **Panneau « CONVOI »** sous la mission : nombre de blindés vivants (3/3), pourcentage d'avancement du plus avancé des vivants, et une barre de route avec la position de chaque blindé (carré doré = vivant, gris = neutralisé). « arrivé » quand tous les vivants sont au bout de la piste, « neutralisé » quand il n'en reste aucun (`hud.setConvoy`, `Convoy.progress`).
- **Radar** (cercle en haut à gauche) : la piste est tracée en beige là où elle passe dans la portée (140 m), les blindés sont des carrés dorés (gris barrés une fois neutralisés) et, hors de portée, posés sur le bord du cercle dans leur direction.

## Les tirs aériens se rabattent sur les miliciens
- Les passages d'avions de chasse ne tirent plus sur des foyers au hasard : ils visent **un milicien ou un groupe de miliciens** (`skirmish.airTarget`) à 40–280 m du joueur et **à plus de 30 m de lui et de ses alliés** (pas de tir fratricide). Priorité aux lance-missiles qui viennent de tirer (dans les 60 s), puis aux groupes les plus fournis ; s'il n'y a personne, ils reprennent les foyers habituels.
- **Appui aérien** : quand un lance-missiles tire sur le convoi, 5 à 9 s plus tard les avions se rabattent sur lui (`air.callSupport`) : un passage survole sa position et lui tire dessus. Au plus un appui toutes les 30 s. Le souffle blesse tout le monde à proximité, y compris le joueur et les alliés s'ils sont trop près.

## Intensité du jeu réduite d'un cran
Guerre de fond (combats lointains, explosions, obus, rafales d'hélicoptère) : 65 % de la cadence sur ordinateur (avant 100 %), 45 % sur téléphone, 30 % sur téléphone modeste. Passages d'avions : premier à 25 s puis toutes les 45–90 s (avant 10 s puis 30–58 s). Secousse et éclair des explosions : -30 % et -20 %. Miliciens : une balle toutes les 0,15 s (avant 0,12 s) et 5 points de dégâts (avant 6) : 20 balles pour tuer le joueur au lieu de 17. Réglages : `perfprofile.js` (`war`), `aircraft.js` (planificateur), `smoke.js`, `combat.js`.
