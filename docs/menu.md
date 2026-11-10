# Menu du jeu

Interface « vrai jeu » : accueil → vidéo d'intro → menu principal → jeu → pause.

- **Accueil** : « Chargement du monde… » puis « Cliquer pour commencer » (le clic est nécessaire pour lancer la vidéo avec le son).
- **Intro** : `assets/video/intro.mp4` (30 s, voix off + effets). Passer : bouton, clic, Échap, Espace ou Entrée.
- **Menu principal** : JOUER, TENUES, OPTIONS, REVOIR L'INTRO, CRÉDITS. La scène 3D vit derrière (héros debout, caméra qui oscille, PNJ non hostiles).
- **Orbite** (menu principal, tenues, options) : glisser la souris, stick droit de la manette = tourner autour du personnage (haut/bas = hauteur), molette = zoom. Sans geste pendant 4 s, le menu principal tourne doucement seul. Le menu des tenues est à gauche, le personnage reste visible à droite. En jeu, la caméra tourne déjà autour du personnage à la souris / stick droit.
- **Options** (mémorisées dans `localStorage` `sahel.options`) : volume de l'intro, sensibilité, qualité de l'image (basse/normale/haute), radar, aide des touches, sang, plein écran.
- **Pause** : Échap ou bouton ⏸ en haut à droite ; le monde est figé. REPRENDRE, TENUES, OPTIONS, QUITTER AU MENU.
- **Manette** : croix directionnelle ou stick gauche pour choisir (gauche/droite règle un curseur ou change un choix), **A** valide, **B** revient, **Start** met en pause / reprend / passe l'intro, **Carré** active le son de l'intro s'il est bloqué. La manette n'est reconnue qu'après un premier appui (filtre anti-manette fantôme de `gamepad.js`) : si rien ne se passe, appuyer une seconde fois.
- Intro : `intro.mp4` = version avec voix off et effets (recompressée en x264 CRF 27, 3 Mo au lieu de 10,5 ; l original est dans DocumentsMontagesSahel-GameVersion 3) (`Sahel_Game_Intro_voix_et_effets.mp4`). Si le navigateur refuse le son (aucun clic avant), la vidéo se lance sans son avec un bouton « Activer le son ».
- Test automatique (`?autotest=`) : le menu est ignoré, le jeu démarre directement.

Fichiers : `src/menustate.js` (logique pure, `tests/menustate.test.mjs`), `src/menu.js` (DOM), `menu.css`, branchement dans `src/main.js` (`menuFrame`).
Test navigateur : `node tests/menu_e2e.mjs` (parcours complet + captures).
Pour changer la vidéo : remplacer `assets/video/intro.mp4` (et `intro_poster.jpg`), puis changer `ASSET_VERSION`.
- **Fenêtre quittée** (autre onglet, Alt+Tab) : le jeu se met en pause, le son et la vidéo d'intro s'arrêtent ; au retour tout repart tout seul (la souris se recapture d'un clic sur l'image). Une pause choisie par le joueur reste en pause. Logique : `AwayGuard` dans `menustate.js`.
