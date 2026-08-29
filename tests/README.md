# Suite de non-régression

Cinq suites Playwright pilotent l'application réelle dans Chromium et vérifient
qu'aucune erreur JS n'est levée.

| Suite | Couverture |
|---|---|
| `smoke.js` | Migration v2 → v3, navigation des onglets, stabilité de l'identité d'une joueuse (renommage + changement de numéro sans perte d'historique), détection des numéros en double |
| `e2e.js` | Parcours complet : création de saison → effectif → vues sélectionneur (joueuse partagée entre deux vues) → **anonymat strict** (aucun nom dans le DOM ni dans le paquet exporté) → évaluation → soumission → compilation multi-évaluateurs → application des avis → composition de l'équipe → saisie de match → undo → persistance → suppression sans référence orpheline. Vérifie aussi qu'**aucun numéro n'est attribué automatiquement** |
| `modals.js` | Ouverture, rendu et fermeture de chacune des 17 modales, absence de fuite d'état entre modales, saisie manuelle du numéro et refus d'un doublon |
| `campaigns.js` | **Cloisonnement des campagnes** (2,0 en sélection et 4,0 en fin de saison ne se moyennent pas), mesure de la progression, copie de vue vierge, clôture de campagne et de saison, statut d'effectif préservant les matchs joués, fiche joueuse réunissant match et évaluations, anonymat réglable, filtre de période |
| `sync.js` | **Deux navigateurs isolés** avec un relais simulé : l'entraîneur publie, le lien de partage configure l'appareil du sélectionneur, celui-ci récupère ses vues, évalue et téléverse, l'entraîneur relève. Contrôle qu'aucun nom ne transite par le relais, qu'aucune donnée de l'entraîneur n'atteint l'appareil du sélectionneur, qu'un second relevé ne duplique rien, qu'un relais injoignable est signalé, et que le repli par fichier reste disponible |

## Exécution

```bash
npm i -D playwright
npx playwright install chromium     # ou : export CHROMIUM_PATH=/chemin/vers/chrome
./tests/run.sh
```

Variables : `PORT` (défaut 8899), `BASE_URL`, `CHROMIUM_PATH`, `LOG_FILE`
(journal écrit de façon synchrone, lisible même si une suite est interrompue).

Le relais réseau de `sync.js` est **simulé en mémoire** : la suite vérifie le contrat
HTTP, elle ne contacte aucun service externe.

Les tests n'ajoutent **aucune dépendance à l'application** : `index.html` reste
un fichier autonome, sans build ni bibliothèque.
