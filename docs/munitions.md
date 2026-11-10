# Munitions et recharge

- Un chargeur par arme : **fusil 30 balles, pistolet 12** (`client/src/ammo.js`). Pas de réserve limitée : une recharge remplit toujours le chargeur.
- Chaque tir enlève une balle. **Chargeur vide : la recharge démarre toute seule** avec son animation. Pendant la recharge on ne peut pas tirer.
- **R** (ou la touche de recharge) recharge à la main si le chargeur n'est pas plein, fusil comme pistolet. Changer d'arme interrompt la recharge ; elle reprendra toute seule si le chargeur est vide.
- Mort : la recharge s'annule ; à la réapparition les chargeurs sont pleins.
- **Les soldats ennemis et les alliés** ont aussi leurs chargeurs : au dernier coup ils s'arrêtent de tirer, jouent la recharge (avec son son) puis reprennent.
- Affichage : en bas à droite, « FUSIL 24 / 30 » (rouge quand il reste ¼), « RECHARGE… » pendant l'animation.
- Animations : `Rifle Reload` (celle du fichier, accélérée : 2,6 s) et `Pistol Reload` (2,2 s). Cette dernière n'existait pas : `client/src/reloadclip.js` la compose au chargement (jambes de `Pistol Idle`, haut du corps de `Rifle Reload`, le pistolet suit la main droite). Pour une vraie animation de pistolet, l'ajouter dans Blender sous le nom `Pistol Reload` : elle remplacera la version composée.
- Test automatique : chargeurs sans fin, sauf les scénarios `recharge_*`. Scénarios `vue_recharge_<arme>_<image>` : captures de face de la recharge.
