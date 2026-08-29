# Suite de non-régression

Trois suites Playwright pilotent l'application réelle dans Chromium et vérifient
qu'aucune erreur JS n'est levée.

| Suite | Couverture |
|---|---|
| `smoke.js` | Migration v2 → v3, navigation des onglets, stabilité de l'identité d'une joueuse (renommage + changement de numéro sans perte d'historique), détection des numéros en double |
| `e2e.js` | Parcours complet : création de saison → effectif → vues sélectionneur (joueuse partagée entre deux vues) → **anonymat strict** (aucun nom dans le DOM ni dans le paquet exporté) → évaluation → soumission → compilation multi-évaluateurs → application des avis → composition de l'équipe → saisie de match → undo → persistance → suppression sans référence orpheline |
| `modals.js` | Ouverture, rendu et fermeture de chacune des 13 modales, absence de fuite d'état entre modales, et fonctionnement réel de quatre d'entre elles |

## Exécution

```bash
npm i -D playwright
npx playwright install chromium     # ou : export CHROMIUM_PATH=/chemin/vers/chrome
./tests/run.sh
```

Variables : `PORT` (défaut 8899), `BASE_URL`, `CHROMIUM_PATH`.

Les tests n'ajoutent **aucune dépendance à l'application** : `index.html` reste
un fichier autonome, sans build ni bibliothèque.
