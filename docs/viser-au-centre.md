# Sahel Game : le canon vise toujours le centre de la caméra

Règle voulue : pour les deux armes (fusil et pistolet), dans toutes les animations où le joueur tire, le bout du canon pointe vers le milieu de l'image de la caméra. L'arme reste attachée aux mains. Les balles sortent du canon.

## 1. Points de sortie des tirs (dans `sahel_desert.blend`)

| Objet | Arme | Collé à | Position locale (m) | Axe de tir |
|---|---|---|---|---|
| `Muzzle` | Fusil | `Rifle` | (0,713 ; -0,0015 ; 0,0605) | axe X de l'objet |
| `Muzzle_Pistol` | Pistolet | `Pistol` | (0,149 ; 0 ; 0,077) | axe X de l'objet |

Ils suivent l'arme, donc ils suivent la main. Dans le jeu, la balle part de ce point, dans la direction de cet axe.

## 2. Comment c'est obtenu

**Animations de tir** (versions « Tir », les animations d'origine ne sont pas modifiées). Le buste est tourné d'un bloc (os `Spine1` et tout ce qui est au-dessus : bras, mains, tête) jusqu'à ce que le canon vise le centre de la caméra Visée, à 30 m. Le fusil suit la main droite avec un décalage fixe (écart mesuré : moins de 1 cm), donc il ne se détache jamais.

**Fusil** : jambes et bassin de l'animation de déplacement, haut du corps de la visée. **Pistolet** : copie de l'animation d'origine, déjà tenu devant soi. Les deux sont ensuite corrigés au buste.

Vérification : 0,00° d'écart entre le canon et le centre de la caméra sur chaque image des 15 animations ci-dessous (caméra Visée, regard à l'horizontale).

**Pistolet, mode tireur d'élite (`Pistol Aim Sniper`, script `s18_pistol_sniper.py`).** Copie de `Pistol Idle` dont les deux bras sont levés de 20° pour rapprocher le pistolet de la ligne de visée, puis le buste est réaligné sur le centre de `Cam_Sniper` (écart 0,00° sur les 250 images, torsion du buste 19° au maximum). Vu de `Cam_Sniper` (à hauteur des yeux, sur l'épaule droite), le pistolet reste en bas à gauche de l'image : il est tenu au milieu du buste, alors que la caméra est à droite. Lever davantage les bras ou les tourner vers la droite n'a rien changé à la position du canon à l'écran, car le réalignement du buste compense, et ça le tordait jusqu'à 41°.

## 3. Quelle animation jouer quand le joueur tire ou vise

| État du joueur | Fusil | Pistolet |
|---|---|---|
| Immobile, visée ou tir | Rifle Aim (visée) puis Rifle Fire (chaque coup) | Pistol Idle Tir |
| Marche | Rifle Walk Tir | Pistol Walk Tir |
| Course | Rifle Run Tir | Pistol Run Tir |
| Recul | Rifle Walk Backward Tir | Pistol Walk Backward Tir |
| Déplacement latéral | Voir section 5 | Pistol Strafe Tir |
| Accroupi immobile | Rifle Kneel Tir | Pistol Kneel Tir |
| Accroupi en marche | Rifle Crouch Walk Tir | Pistol Kneel Tir (pas de version en marche) |
| En l'air | Rifle Jump Tir | Pistol Jump Tir |
| Tireur d'élite, lunette (à l'arrêt, debout) | Rifle Aim Sniper, Rifle Fire Sniper (aligné sur la caméra Tireur d'élite) | Pistol Aim Sniper, aligné sur la même caméra ; pas de clip de tir, le recul est fait par le jeu |

Hors tir (pas de visée) : on garde les animations d'origine (Rifle Idle, Rifle Walk, etc., arme baissée).

## 4. Ce que le jeu doit faire en plus (en direct)

Les animations « Tir » visent le centre quand la caméra regarde à l'horizontale. Quand le joueur lève ou baisse la caméra, ou la tourne, le jeu applique chaque image la même correction :

1. Le point visé est le centre de l'image : le point touché par un rayon lancé depuis la caméra, ou à 30 m si rien n'est touché.
2. On calcule la rotation qui amène l'axe du `Muzzle` (ou `Muzzle_Pistol`) sur la direction du point visé, en répétant le calcul 3 à 5 fois car le canon bouge quand on tourne le buste.
3. On applique cette rotation au buste, autour de l'os `Spine1`. L'arme est attachée à la main droite (décalage fixe), elle suit.
4. Limiter l'angle (par exemple 60° de torsion) pour éviter les poses absurdes.
5. La balle part du `Muzzle`, vers le point visé.

Ce calcul est celui du script `tools/blender/s13_aim_bake.py`.

## 5. Limites connues

- **Déplacement latéral avec le fusil** : les animations de côté d'origine sont des courses de côté, qui obligeraient à tourner le buste de 120°. Je les ai retirées. Solution prévue : jambes de la marche avec le bassin décalé de 90° dans le jeu, ou animation de pas chassés à récupérer sur Mixamo.
- **Pistolet** : pas d'animation de tir ni de recharge dédiée. Le recul sera fait par le jeu.
- **Rifle Jump, Pistol Jump** : l'animation déplace le personnage d'elle-même (racine). À figer avant l'export.
- **Recharge, mort, changement d'arme, mêlée** : pas de visée, voulu.
