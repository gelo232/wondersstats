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

Avant de livrer : `./tests/run.sh` (voir `tests/README.md`). Une suite qui
échoue déjà sur `main` n'empêche pas la livraison, mais se signale.

## Rappels

- `index.html` est l'application entière — sans build, sans dépendance.
- Toute livraison bouge `APP_VERSION` et le `CACHE` de `sw.js`.
- README, GUIDE et `tests/README.md` suivent les changements visibles.
- Le texte de l'application et des documents est en français.
- Une suite de tests crée son contexte par `nouveauContexte` (`tests/gate-helper.js`),
  qui bloque le service worker : sans cela, ses requêtes échappent aux `ctx.route`
  des tests. Seule `tests/hors-ligne.js` le laisse tourner.
