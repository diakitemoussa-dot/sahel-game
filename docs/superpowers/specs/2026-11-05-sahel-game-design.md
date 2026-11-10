# Sahel Game — Design

Date : 2026-11-05

## 1. Vision

Jeu d'action 3D coopératif en ligne, dans le navigateur. Une équipe de 2 à 4 joueurs affronte des PNJ dans un désert du Sahara malien (nord du Mali). Rendu semi-réaliste (textures peintes, éclairage baké), conçu pour rester fluide à 4 joueurs plus les PNJ.

## 2. Contexte et contraintes

- **Factions fictives.** L'équipe des joueurs protège convois, villages et points d'eau. Les ennemis sont une milice inventée de pillards et mercenaires. Aucun vrai groupe, ethnie ou armée n'est représenté.
- **Identité visuelle.** Dunes, oasis, architecture en banco, tentes, fort en ruine, fleuve Niger comme référence, pick-up, chameaux, turbans et cheches pour les civils.
- **Assets.** Tout l'environnement et les PNJ sont modélisés de zéro dans un nouveau fichier `sahel_desert.blend`. Seul le personnage wax de `personnage_wax_tenue.blend` est réutilisé comme modèle de joueur, sur une copie. Le fichier d'origine n'est pas modifié. Rien d'autre des anciens jeux (village, ville néon) n'est repris.
- **Export.** Aucun export vers le jeu sans l'accord explicite de l'utilisateur. Sauvegarde du .blend après chaque grande étape.
- **Hébergement.** Client sur GitHub Pages. Serveur Node.js (WebSocket) sur Render ou Fly.io. L'offre gratuite de Render s'endort et met environ 1 minute à se réveiller.

## 3. Architecture

Trois blocs indépendants, reliés par un fichier de messages réseau partagé.

1. **`assets/`** (Blender vers glTF compressé Draco et KTX2). Terrain, dunes, oasis, fort, village, végétation, props, personnages joueurs, PNJ.
2. **`server/`** (Node.js, WebSocket). Salles avec code à 4 lettres, 4 joueurs maximum. Simulation à 20 ticks par seconde : déplacements, tirs, dégâts, IA, vagues, objectifs.
3. **`client/`** (three.js). Chargement de la carte, rendu des joueurs et PNJ, caméra à la troisième personne, commandes, HUD, lobby, prédiction locale.

Dossier : `Desktop\MES PROJETS\projects\active\Sahel-Game`.

## 4. Carte et gameplay

**Carte** d'environ 500 m x 500 m, cinq zones reliées par des pistes :

1. Camp de base (tentes, puits, point de réapparition).
2. Dunes (zone ouverte, embuscades).
3. Oasis (palmiers, point d'eau, couvert léger).
4. Village en banco (ruelles, toits, combat rapproché).
5. Fort en ruine (objectif final, hauteur, murs, tours).

**Missions** : campagne de 4 à 5 objectifs enchaînés (escorter un convoi, sécuriser le village, défendre l'oasis par vagues, reprendre le fort avec un chef ennemi).

**PNJ** : fantassins, tireurs d'élite sur les toits, un chef plus résistant. IA : patrouille, détection, prise de couvert, attaque. Difficulté proportionnelle au nombre de joueurs.

**Jeu d'équipe** : un joueur à terre peut être relevé pendant 15 secondes. Trois rôles légers : assaut, soutien (soigne), tireur d'élite. Munitions et soins partagés via des caisses.

**Armes (v1)** : fusil d'assaut, pistolet, grenades. Pas de véhicules en v1.

## 5. Réseau

- **Connexion** : pseudo, création ou entrée par code à 4 lettres, lobby avec rôle et bouton Prêt, l'hôte lance la partie. Limite de 4 joueurs.
- **Serveur autoritaire** : il possède tout l'état. Les clients envoient leurs intentions (direction, visée, tir, recharge, relever) environ 30 fois par seconde. Le serveur renvoie des instantanés, limités à ce qui change.
- **Fluidité** : prédiction locale pour son propre personnage, avec correction serveur. Interpolation (environ 100 ms de retard) pour les autres joueurs et les PNJ. Touches calculées par le serveur (hitscan), effets affichés tout de suite côté client.
- **Robustesse** : en cas de déconnexion, le personnage reste 30 secondes et le joueur peut revenir avec le même pseudo. Si l'hôte part, un autre joueur le remplace. Les messages invalides ou trop rapides sont ignorés.

## 6. Tests

- Simulation (PNJ, dégâts, vagues, relève) écrite en code pur, testable sans réseau ni navigateur.
- Serveur testé avec de faux clients automatiques.
- Rendu et performances vérifiés à la main sur le prototype solo (étape 2).

## 7. Ordre de construction

1. Désert dans Blender (`sahel_desert.blend`). Avant de commencer : vérifier pourquoi la copie du personnage wax semble sans torse ni tête dans la vue.
2. Prototype solo navigateur : carte, personnage wax, déplacement, visée, tir.
3. Serveur et lobby : salles, 2 à 4 joueurs, déplacements synchronisés, sans PNJ.
4. PNJ et combat : modèles ennemis dans Blender, IA, dégâts, relève.
5. Missions et vagues : campagne, HUD, caisses, écrans de victoire et de défaite.
6. Mise en ligne : GitHub Pages pour le client, Render ou Fly.io pour le serveur.

## 8. Hors périmètre (v1)

Véhicules, serveur public permanent, plus de 4 joueurs, représentation de forces réelles du conflit.
