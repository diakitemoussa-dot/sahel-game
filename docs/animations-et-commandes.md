# Sahel Game : animations du personnage et commandes

Analyse du 2026-11-05 sur `assets/sahel_desert.blend` (personnage wax, 113 actions). Durées calculées à 30 images par seconde (cadence des clips Mixamo d'origine).

**Validé par l'utilisateur le 2026-11-05 :** la liste des animations et le schéma de commandes (section 6) sont conservés, y compris la roulade (Roll), qui passe de facultative à gardée.

**Limites de cette analyse.** Les choix reposent sur les noms, les durées, la fermeture des boucles (première et dernière image) et le déplacement de la racine. Je n'ai visionné que Walk, Rifle Idle et Pistol Idle. Les clips marqués « à voir » sont à prévisualiser avec le panneau Animations avant de les figer.

## 1. Tri des 113 actions

| Groupe | Nombre | Décision |
|---|---|---|
| Actions de la liste du panneau (les « vraies ») | 50 | À trier (section 2) : 39 gardées (29 + 10 facultatives), 11 écartées |
| `bak_*` (sauvegardes) | 20 | À supprimer |
| `v1_` à `v8_` (anciennes versions du fusil) | 39 | À supprimer |
| `Armature.001\|mixamo.com\|Layer0*` (2 images, restes d'import) | 4 | À supprimer |

Hors la liste, 63 actions sont donc des doublons ou des restes. Elles ne doivent pas partir dans le jeu.

## 2. Animations à garder

Toutes les animations gardées bouclent proprement (début = fin), sauf celles notées « une fois ».

### Déplacement avec le fusil (arme par défaut)

| Animation | Durée | Quand | Clavier + souris | Manette | Écran tactile |
|---|---|---|---|---|---|
| Rifle Idle | 8,6 s, boucle | À l'arrêt, fusil en main | (aucune touche) | (aucune touche) | (aucun doigt sur le stick) |
| Rifle Walk | 1,3 s, boucle | Déplacement lent : visée active, ou stick à moins de 60 % | Z/Q/S/D + clic droit maintenu | Stick gauche incliné à moins de 60 % | Stick virtuel gauche, petite inclinaison |
| Rifle Run | 0,8 s, boucle | Déplacement normal | Z/Q/S/D (par défaut) | Stick gauche incliné à plus de 60 % | Stick virtuel gauche, grande inclinaison |
| Rifle Walk Backward | 1,3 s, boucle | Reculer en gardant l'ennemi en face | S | Stick gauche vers le bas | Stick virtuel vers le bas |
| Rifle Crouch Walk | 2 s, boucle | Accroupi et en déplacement | C (bascule) + Z/Q/S/D | B (bascule) + stick gauche | Bouton Accroupi + stick |
| Rifle Kneel | 1,7 s, boucle | Accroupi et immobile | C (bascule) | B (bascule) | Bouton Accroupi |

### Combat avec le fusil

| Animation | Durée | Quand | Clavier + souris | Manette | Écran tactile |
|---|---|---|---|---|---|
| Rifle Aim | 3,1 s, boucle | Visée maintenue | Clic droit maintenu | Gâchette gauche (LT) maintenue | Bouton Viser (appui = bascule) |
| Rifle Fire | 0,3 s, en superposition | Chaque tir (rejoué à chaque coup) | Clic gauche | Gâchette droite (RT) | Gros bouton Tir (côté droit) |
| Rifle Reload | 3,3 s, une fois | Recharge, interrompue si on saute ou on change d'arme | R | X | Bouton Recharger |
| Rifle Jump | 2,3 s, une fois | Saut avec le fusil (à accélérer ×1,5) | Espace | A | Bouton Saut |

### Pistolet

| Animation | Durée | Quand | Clavier + souris | Manette | Écran tactile |
|---|---|---|---|---|---|
| Pistol Idle | 8,3 s, boucle | À l'arrêt, pistolet en main | (aucune touche) | (aucune touche) | (aucun doigt sur le stick) |
| Pistol Walk | 0,8 s, boucle | Déplacement lent | Z/Q/S/D + clic droit | Stick à moins de 60 % | Stick, petite inclinaison |
| Pistol Run | 0,8 s, boucle | Déplacement normal | Z/Q/S/D | Stick à plus de 60 % | Stick, grande inclinaison |
| Pistol Walk Backward | 1,1 s, boucle | Reculer | S | Stick vers le bas | Stick vers le bas |
| Pistol Strafe | 0,6 s, boucle | Déplacement latéral | Q ou D | Stick gauche, côté | Stick, côté |
| Pistol Kneel | 3,8 s, boucle | Accroupi, pistolet en main | C | B | Bouton Accroupi |
| Pistol Jump | 2 s, une fois | Saut avec le pistolet | Espace | A | Bouton Saut |
| Pistol Whip | 2,6 s, une fois | Coup de crosse (mêlée avec le pistolet) | V | Clic du stick droit (R3) | Bouton Mêlée |

### Mêlée sans arme, chutes et réactions

| Animation | Durée | Quand | Clavier + souris | Manette | Écran tactile |
|---|---|---|---|---|---|
| Melee Punch | 1 s, une fois | Mêlée avec le fusil en main (coup de poing rapide) | V | R3 | Bouton Mêlée |
| Fall | 4,5 s, boucle | En l'air, après le saut ou une chute | (automatique) | (automatique) | (automatique) |
| Land | 2,1 s, une fois | Atterrissage (à raccourcir à 0,5 s) | (automatique) | (automatique) | (automatique) |
| Hit Reaction | 1,9 s, en superposition | Le joueur est touché (à raccourcir à 0,5 s) | (automatique) | (automatique) | (automatique) |

### Équipe : mort, relève, soin, victoire

| Animation | Durée | Quand | Clavier + souris | Manette | Écran tactile |
|---|---|---|---|---|---|
| Rifle Death | 3,8 s, une fois | Joueur à terre (vie à 0). L'animation reste figée sur la dernière image pendant les 15 s de relève | (automatique) | (automatique) | (automatique) |
| Death | 4,4 s, une fois | Mort définitive (relève ratée) ou ennemis PNJ | (automatique) | (automatique) | (automatique) |
| Crouch Idle | 6,7 s, boucle | Joueur qui relève un allié : il s'accroupit à côté pendant l'action | E maintenu près d'un allié à terre | X maintenu | Bouton Relever (apparaît près d'un allié) |
| Wave | 0,6 s, une fois | Signal rapide (ping, « ici ») | T | Croix directionnelle droite | Bouton Emote |
| Victory | 1,9 s, une fois | Mission réussie, écran de fin | (automatique) | (automatique) | (automatique) |
| Sit Idle | 4,3 s, boucle | Lobby et camp, en attendant que tout le monde soit prêt | (automatique) | (automatique) | (automatique) |

### Facultatives (à garder si le temps le permet)

| Animation | Durée | Usage | Commande |
|---|---|---|---|
| Roll (GARDÉE, validée) | 4 s (à jouer ×3 : 1,3 s) | Roulade d'esquive | Alt gauche / croix directionnelle bas / bouton Esquive |
| Idle | 10 s, boucle | Sans arme : lobby et menus | (automatique) |
| Walk, Run, Walk Backward, Run Backward, Strafe Left, Strafe Right | 0,6 à 1,2 s, boucle | Déplacements sans arme (lobby, voyage entre zones) et base du déplacement latéral avec le fusil | Z/Q/S/D |
| Dance | 13,8 s, boucle | Emote | T maintenue / Croix directionnelle haut / bouton Emote |
| Jump | 0,9 s | Saut sans arme | Espace |

## 3. Animations à écarter

| Animation | Raison |
|---|---|
| Boxing, Block, Cross Punch, Side Kick, Kick, Elbow Punch, Punch | Doublons de la mêlée : une seule animation (Melee Punch) suffit. |
| Climb Ladder | Aucune échelle sur la carte. |
| Entering Car | Pas de véhicule en version 1. |
| Push | 8 s, déplacement de la racine de 3 m. Pas d'usage prévu. |
| Crouch Walk | Remplacé par Rifle Crouch Walk (sans arme : inutile en combat). |

## 4. Ce qui manque (à récupérer sur Mixamo ou à créer)

| Manque | Pourquoi | Solution provisoire |
|---|---|---|
| Lancer de grenade | La grenade est dans les armes de la v1. | Utiliser Melee Punch accéléré. |
| Déplacement latéral avec le fusil | Le fusil n'a pas d'animation de côté. | Mixer le bas du corps de Strafe Left/Right avec le haut de Rifle Aim (superposition haut et bas du corps). |
| Reculer en courant avec le fusil | Seul Rifle Walk Backward existe. | Jouer Rifle Walk Backward plus vite. |
| Ramper (joueur à terre) | Le joueur à terre doit bouger lentement. | Rester immobile sur la dernière image de Rifle Death. |
| Gestes de soin, d'interaction et de relève | Aucun geste dédié. | Crouch Idle. |
| Tir accroupi, visée accroupie | Seul Rifle Kneel existe. | Rifle Aim superposé sur Rifle Kneel. |
| Recharge du pistolet, tir du pistolet | Absents. | Rifle Reload et Rifle Fire. |

## 5. Points à régler avant l'export

1. **Verrouiller la racine** : Rifle Jump, Roll, Rifle Death et Death déplacent le personnage de 1 à 3,5 m par eux-mêmes. Dans le jeu, le serveur décide de la position, donc l'animation doit rester sur place.
2. **Accélérer ou raccourcir** : Land, Hit Reaction et Rifle Jump sont trop longs pour le jeu (1,9 à 2,5 s).
3. **Superposition haut et bas du corps** : prévoir un masque d'os (jambes d'un côté, torse et bras de l'autre) pour le déplacement latéral et le tir accroupi.
4. **Fréquence** : la scène Blender est à 24 images par seconde alors que les clips sont à 30. À régler avant l'export, sinon tout paraît ralenti de 20 %.
5. **Poids** : en ne gardant que les 39 animations, la taille du fichier du personnage baisse nettement (plus de 59 000 courbes d'animation aujourd'hui pour 113 actions).

## 6. Schéma des commandes

**Clavier et souris**

| Action | Touche |
|---|---|
| Se déplacer | Z, Q, S, D (ou W, A, S, D selon le clavier) |
| Viser | Clic droit maintenu |
| Tirer | Clic gauche |
| Recharger | R |
| Sauter ; en l'air : double saut, ou grimper sur un rebord proche | Espace (2 appuis) |
| S'accroupir | C (bascule) |
| Fusil, pistolet | 1, 2 ou molette |
| Grenade | G |
| Mêlée | V |
| Coup de pied (une pression par coup : Kick, puis Side Kick) | F |
| Relever un allié, ouvrir une caisse | E (maintenu) |
| Se soigner | H |
| Signal rapide (appui) / danse (maintenu) | T |
| Esquive (roulade) | Alt gauche |
| Menu des tenues (puis ← → choisir, Entrée valider, Échap annuler) | U |
| Sensibilité du viseur : moins / plus (par pas de 10 %, de 30 % à 250 %, mémorisée) | Page suivante / Page précédente (ou pavé numérique - / +) |

**Manette (disposition Xbox)**

| Action | Bouton |
|---|---|
| Se déplacer | Stick gauche (marche ou course selon l'inclinaison) |
| Caméra | Stick droit |
| Viser | LT |
| Tirer | RT |
| Recharger / relever un allié | X (appui / maintenu) |
| Sauter ; en l'air : double saut, ou grimper sur un rebord proche | A (2 appuis) |
| S'accroupir | B (bascule) |
| Tourner autour du personnage (à l'arrêt : il garde son orientation ; dès qu'il avance, vise ou tire, il se retourne vers la caméra) | Stick droit |
| Changer d'arme (fusil, pistolet, mains nues) | L1 |
| Sprint (Rifle Run avec le fusil, Pistol Run avec le pistolet) | Stick gauche enfoncé (L3) en poussant vers l'avant ; au clavier : Maj gauche |
| Grenade | RB |
| Se soigner | LB |
| Mêlée | R3 |
| Combat : toutes les animations à la suite, une pression par coup (celle de l'arme tenue, puis Punch, Cross Punch, Elbow Punch, Kick, Side Kick) | Triangle (Y sur une manette Xbox) ; clavier : X (F = coups de pied seulement) |
| Recharger l'arme | Carré (X sur une manette Xbox) ; clavier : R |
| Signal rapide | Croix directionnelle droite |
| Esquive (roulade) | Croix directionnelle bas |
| Menu des tenues (puis croix gauche/droite choisir, A valider, B annuler) | Select (Partager) ou R3 |

**Écran tactile (téléphone)**

| Action | Contrôle |
|---|---|
| Se déplacer | Stick virtuel à gauche |
| Caméra | Glisser le doigt dans la moitié droite de l'écran |
| Tirer | Gros bouton à droite (option : tir automatique quand on vise un ennemi) |
| Viser | Bouton (appui = bascule) |
| Sauter, s'accroupir, recharger, arme, grenade, mêlée, esquive | Boutons au-dessus du bouton Tir |
| Coup de pied | Bouton Pied (prévu, pas encore dans le jeu) |
| Menu des tenues | Bouton TENUE (puis ◀ VALIDER ▶ ✕ à l'écran) |
| Relever un allié, ouvrir une caisse | Bouton qui n'apparaît que près d'un allié à terre ou d'une caisse |
| Se soigner, signal rapide | Petits boutons en haut à droite |
