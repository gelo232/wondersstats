# Suite de non-régression

Dix suites Playwright pilotent l'application réelle dans Chromium et vérifient
qu'aucune erreur JS n'est levée.

Depuis le verrou, l'application s'ouvre sur un écran de garde. Les suites le
franchissent par le vrai parcours via `gate-helper.js` — **aucune porte dérobée
n'est ajoutée à l'application pour les tests**.

| Suite | Couverture |
|---|---|
| `smoke.js` | Migration v2 → v3 puis **v4 → v5** (les matchs d'un ancien tournoi se regroupent d'eux-mêmes, la nature est devinée, l'adversaire lu dans « vs X », l'opération est idempotente), navigation des onglets, stabilité de l'identité d'une joueuse (renommage + changement de numéro sans perte d'historique), détection des numéros en double |
| `e2e.js` | Parcours complet : création de saison → effectif → vues sélectionneur (joueuse partagée entre deux vues) → **anonymat strict** (aucun nom dans le DOM ni dans le paquet exporté) → évaluation → soumission → compilation multi-évaluateurs → application des avis → composition de l'équipe → saisie de match → undo → persistance → suppression sans référence orpheline. Vérifie aussi qu'**aucun numéro n'est attribué automatiquement** |
| `modals.js` | Ouverture, rendu et fermeture de chacune des 17 modales, absence de fuite d'état entre modales, saisie manuelle du numéro et refus d'un doublon |
| `campaigns.js` | **Cloisonnement des campagnes** (2,0 en sélection et 4,0 en fin de saison ne se moyennent pas), mesure de la progression, copie de vue vierge, clôture de campagne et de saison, statut d'effectif préservant les matchs joués, fiche joueuse réunissant match et évaluations, anonymat réglable, filtre de période |
| `roles.js` | **La matrice des accès** de `ROLES.md` : un rôle est une arête (personne · équipe · rôle), Sofia cumule entraîneuse des U15 et sélectionneuse des U18, chacun ne voit que son périmètre, un contexte forgé à la main ne survit pas au rendu, la vue libre expose un catalogue sans nom, l'export d'équipe n'emporte pas les collègues, et supprimer une équipe ne laisse aucune affectation orpheline |
| `season.js` | **Une saison complète jouée dans l'application** : sélection d'août, deux amicaux, trois tournois, sept journées de championnat, blessure, départ, arrivée en mars, bilan de mai, clôture — **19 matchs en 12 rencontres, bilan 14V–5D**. Vérifie ce qui doit tenir (le cumul survit à une blessure et à un départ, une vue de mi-saison repart vierge, la progression reste calculable malgré un effectif mouvant, la fiche joueuse réunit matchs et campagnes) **et que les onze défauts du quatrième audit ne reviennent pas** : nature, adversaire par match, tournoi comme unité, date réelle, cumul par nature, résultats, moyenne par match, progression expliquée |
| `gate.js` | **Le verrou** : au premier lancement l'application ne donne aucune identité ni aucun droit ; une phrase trop courte ou mal répétée est refusée ; le coffre posé, plus rien de lisible ne reste sur le disque (ni le nom du propriétaire) ; recharger reverrouille ; une phrase fausse est rejetée ; les données survivent au cycle. Vérifie enfin qu'un appareil neuf n'hérite d'aucune donnée ni d'aucun droit — le défaut d'origine — et qu'une base v5.0 déjà installée est reprise sans dupliquer son administrateur |
| `github.js` | **La sauvegarde GitHub**, contre une API simulée : jeton invalide signalé clairement, dépôt ne contenant que du chiffré, jeton jamais déposé (ni en clair, ni dans le bloc chiffré), phrase fausse ne restituant rien, dépôt modifié ailleurs non écrasé en silence, écrasement délibéré possible, et export local sans jeton |
| `owner.js` | **Le propriétaire unique** : avant la fondation aucune installation ne propose de créer un club ; fonder engendre la clé et prouve sa possession ; la clé privée ne fuit ni dans le coffre en clair ni dans `DB` ; club charté et nomination signée sont vérifiés ; plusieurs administrateurs par club, dont un entraîneur. Puis, sur un **second appareil sans la clé** : il ne peut pas signer, une charte forgée est rejetée, une charte authentique altérée est rejetée, une charte intacte est acceptée, et **se déclarer propriétaire dans les données ne suffit pas**. Enfin le transport scellé de la clé, et le périmètre d'une administratrice limitée à son club |
| `sync.js` | **Trois navigateurs isolés** contre un relais simulé conforme au contrat v2. Au-delà du parcours nominal, vérifie ce que le relais **refuse** : une vue adressée n'est lisible que par son destinataire, aucun sélectionneur ne peut lister les soumissions (pas même la sienne), une vue forgée par un sélectionneur est rejetée, un jeton inconnu ou révoqué est refusé. Plus : identité estampillée par le relais, catalogue sans nom, relais injoignable signalé |

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

`season.js` se distingue des autres : elle **instrumente un parcours** de neuf mois
plutôt que des gestes isolés. Les onze manques relevés par le quatrième audit (⚑)
y sont devenus des assertions — la suite échoue si l'un d'eux revient. Elle imprime
en fin de parcours le compte d'observations restantes, aujourd'hui zéro.

Les tests n'ajoutent **aucune dépendance à l'application** : `index.html` reste
un fichier autonome, sans build ni bibliothèque.
