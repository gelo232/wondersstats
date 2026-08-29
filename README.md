# WonderStats

Application de statistiques, de **sélection** et d'**évaluation** pour le volleyball féminin.
Fichier unique, sans dépendance, installable et **entièrement hors-ligne** (PWA).

```
index.html      application complète (HTML + CSS + JS vanilla)
manifest.json   métadonnées PWA
sw.js           service worker (app-shell en cache-first)
AUDIT.md        audit de la version précédente et modèle de données v3
tests/          suite de non-régression Playwright
```

---

## Les deux rôles

Le bouton en haut à droite bascule entre les deux modes.

### 👔 Entraîneur

| Onglet | Rôle |
|---|---|
| 🗓️ **Saison** | Créer et activer une saison · tableau de sélection (`✅ Retenir` / `🔁 Recaller` / `⛔ Non retenue`) · équipes de la saison |
| 👥 **Joueuses** | Base de données partagée entre toutes les saisons · convocation · numéros et positions |
| ✏️ **Saisie** | Statistiques en direct — mode rapide (une joueuse, tous les gestes) ou mode grille (un geste, toutes les joueuses) |
| 📊 **Récap** | Match en cours · cumul toutes sessions · **⭐ évaluations compilées** · sessions enregistrées |
| 🎯 **Sélection** | Créer les vues sélectionneur · suivre et importer les soumissions |

### 🎯 Sélectionneur

Interface volontairement réduite, **sans aucun nom** : les athlètes sont désignées
uniquement par leur **numéro**. Pour chaque numéro : 5 critères notés de 1 à 5,
compteurs de statistiques, recommandation et commentaire libre. Puis `📤 Soumettre`.

---

## Le circuit de sélection

```
Base de joueuses ──convocation──▶ Roster de la saison
                                        │
                                        ├──▶ Vue sélectionneur A  (#7 #12 #3)   ─┐
                                        ├──▶ Vue sélectionneur B  (#3 #9 #14)   ─┤ une joueuse
                                        └──▶ Vue sélectionneur C  (…)           ─┘ peut être
                                                                                   dans plusieurs vues
   chaque sélectionneur soumet ──▶ Soumissions (instantanés figés)
                                        │
                                   compilation par joueuse
                     (somme des stats · moyenne/min/max par critère · avis)
                                        │
                            ▼ vue entraîneur : Récap → ⭐ Évaluations
                            ▼ statut du roster : Retenir / Recaller / Couper
                                        │
                             joueuses retenues ──▶ équipe de la saison
```

**Sur un seul appareil** — l'entraîneur crée la vue, passe le téléphone au sélectionneur
(bouton *Ouvrir en mode sélectionneur*), qui évalue et soumet directement.

**Sur plusieurs appareils** — l'entraîneur exporte un `📤 Paquet` (JSON ne contenant
que les numéros). Le sélectionneur l'importe depuis son mode sélectionneur, évalue,
puis génère un fichier de soumission que l'entraîneur réimporte.

---

## Créer une nouvelle saison

`Saison → Saisons → + Nouvelle saison`, puis au choix :

- **partir d'une base vide** — vous convoquez ensuite qui vous voulez ;
- **reprendre l'effectif d'une saison précédente** — toutes ses joueuses reviennent
  au statut *Candidate*, avec leur numéro et leur position, à re-sélectionner.

Dans les deux cas la **base de joueuses reste commune** : l'historique de chacune
est conservé d'une saison à l'autre.

---

## Données

Tout est stocké localement (`localStorage`), rien ne sort de l'appareil.

- `Saison → Saisons → 📤 Sauvegarde` produit un fichier de sauvegarde complet.
- `📥 Restaurer / fusionner` réimporte une sauvegarde en dédoublonnant les joueuses.
  Les exports de l'ancienne version (v7 et antérieurs) sont acceptés.
- Au premier lancement, les données de l'ancienne version sont migrées automatiquement.

---

## Développement

Aucun build. Ouvrez `index.html`, ou servez le dossier pour tester le service worker :

```bash
python3 -m http.server 8899
```

Non-régression : voir [`tests/README.md`](tests/README.md).
