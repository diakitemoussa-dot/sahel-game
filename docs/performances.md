# Performances : ordinateur et téléphone

Le jeu choisit un **profil** selon l'appareil (`client/src/perfprofile.js`), et le joueur peut le forcer dans Options → **Performances** : Auto (selon l'appareil), Économie (mode téléphone), Maximum.

| | Ordinateur | Téléphone | Téléphone modeste |
|---|---|---|---|
| Résolution max (× pixels de l'écran) | 2 | **1,5** | 1,25 |
| Anti-aliasing | oui | **non** | non |
| Ombres (carte / zone) | 2048 px / 60 m | **1024 px / 44 m** | aucune |
| Fumée (cadence, éclats, taille) | 100 % | **55 %, 60 %, nuages +10 %** | 40 %, 45 %, +15 % |
| Traînées d'avion | normales | 2× plus espacées | 3× |
| Images par seconde | libre | **plafond 30** | plafond 30 |

- **Détection** : écran tactile principal ou navigateur mobile → téléphone ; moins de 4 Go de mémoire ou 4 cœurs ou moins → téléphone modeste.
- **Essayer le mode téléphone sur ordinateur** : ajouter `?perf=eco` à l'adresse (`?perf=max` pour l'inverse).
- L'anti-aliasing ne peut se changer qu'au démarrage : il change au prochain lancement du jeu. Le reste s'applique tout de suite.
- Le plafond à 30 images par seconde évite que le téléphone travaille (et chauffe) pour rien : un 30 stable vaut mieux qu'un 60 instable.

**Mesure** (`node tests/perf_compare.mjs`) : écran de téléphone simulé 844×390 en 3x, scène chargée de fumée. Chrome sans carte graphique, donc seul le rapport compte : le profil Économie dessine environ **3,8 fois plus d'images par seconde** que Maximum (1688×780 → 1266×585 pixels, sans anti-aliasing, 705 nuages de fumée au lieu de 1338). Sur une vraie carte graphique de téléphone, le gain sera différent : à confirmer sur un appareil réel.

**Pas encore fait** (étape suivante) : qualité adaptative en direct (le jeu mesure sa fluidité et baisse la résolution seul quand ça ramasse), textures compressées KTX2, fumée dessinée en demi-résolution, test de longue durée sur un vrai téléphone. Point d'attention : la scène contient environ 730 000 triangles et 186 appels de dessin, ce qui est lourd pour un téléphone modeste.

## Qualité adaptative (fluidité automatique)

Le jeu surveille sa propre fluidité (`client/src/perfgovernor.js`, branché dans `main.js`). Toutes les 2,5 s il regarde la durée **médiane** d'une image (les pics isolés et les images de pause ou d'onglet caché sont ignorés). Si elle dépasse 20 ms (moins de 50 images/s), il baisse d'un palier, avec au moins 4 s entre deux baisses :

| Palier | Résolution de l'image | Ombres |
|---|---|---|
| maximum | 100 % | pleines |
| élevée | 85 % | pleines |
| moyenne | 70 % | deux fois moins fines |
| économique | 55 % | aucune |

Un message « Qualité réduite pour rester fluide » s'affiche à chaque baisse. S'il y a de la marge pendant 20 s de suite et au moins 40 s après le dernier changement, il remonte d'un cran (« Qualité remontée ») ; si c'est trop lent dans les 12 s qui suivent, il redescend et bloque les remontées pendant 3 minutes (pas d'oscillation).
Le choix **Maximum** dans les options coupe ce système ; **Auto** et **Économie** l'utilisent. Il est inactif en test automatique. Tests : `tests/perfgovernor.test.mjs`.

Mesures sur un ordinateur de développement (profil desktop, partie normale avec le convoi) : environ 113 images/s, 8,8 ms par image dont 6,1 ms de dessin et moins de 1,5 ms de logique de jeu (PNJ 0,85 ms, convoi 0,08 ms) ; environ 1 million de triangles et 182 appels de dessin par image. Le dessin est donc ce qui pèse : sur une machine plus modeste, c'est la résolution et les ombres que le système baisse.
