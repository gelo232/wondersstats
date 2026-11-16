# Consignes pour Claude

## Livraison — toujours, sans redemander

Une modification terminée et vérifiée se livre de bout en bout, sans attendre de
confirmation (consigne du propriétaire du dépôt) :

1. commit sur une branche `claude/…` ;
2. push de la branche ;
3. pull request vers `main` ;
4. merge de la PR ;
5. vérification du déploiement : le site public sert la nouvelle version
   (`APP_VERSION` dans `index.html`, `CACHE` dans `sw.js`).

Avant de livrer : **ne lancer que les suites des applications modifiées** (consigne
du propriétaire). Le dépôt porte trois applications, chacune avec ses suites :

- `six-deux.html` (Comprendre le 6-2) → `./tests/run.sh six-deux` ;
- `chrono.html` (Chrono d'entraînement) → `./tests/run.sh chrono` ;
- `index.html` (WonderStats) → `./tests/run.sh wonderstats`.

Ne pas lancer les suites des autres applications. Le changement de `APP_VERSION` et
du `CACHE`, qui accompagne toute livraison, ne compte pas comme une modification de
WonderStats. `./tests/run.sh` sans argument lance tout : à réserver à un changement
qui touche plusieurs applications ou le service worker lui-même (voir
`tests/README.md`). Une suite qui échoue déjà sur `main` n'empêche pas la livraison,
mais se signale.

## Rappels

- `index.html` est l'application entière — sans build, sans dépendance.
- Toute livraison bouge `APP_VERSION` et le `CACHE` de `sw.js`.
- README, GUIDE et `tests/README.md` suivent les changements visibles.
- Le texte de l'application et des documents est en français.
- **Tout groupe d'en-tête se replie** (consigne du propriétaire). Les barres du haut
  d'un écran se replient par son titre (`marquerHaut`), comme celles du bas ; un titre
  de section, une famille de compteurs, un en-tête de carte portent leur chevron
  (`plierGroupes`). Un nouvel écran ou une nouvelle fenêtre emploie ces classes
  (`.section-title`, `.qp-group-title`, `card()`) plutôt qu'un titre maison, et
  `tests/replis.js` le vérifie.
- Une fenêtre de saisie se vérifie à 320, 375, 768 et 1024 px : rien ne déborde,
  aucun champ sous 16 px, aucun libellé de bouton coupé, chaque champ nommé.
- Une suite de tests crée son contexte par `nouveauContexte` (`tests/gate-helper.js`),
  qui bloque le service worker : sans cela, ses requêtes échappent aux `ctx.route`
  des tests. Seule `tests/hors-ligne.js` le laisse tourner.
