# WonderStats

Application de statistiques, de **sélection** et d'**évaluation** pour le volleyball féminin.
Fichier unique, sans dépendance, installable et **fonctionnelle hors-ligne** (PWA).

```
index.html      application complète (HTML + CSS + JS vanilla)
manifest.json   métadonnées PWA
sw.js           service worker (app-shell en cache-first)
server/         relais de synchronisation optionnel (deux implémentations)
AUDIT.md        audit du workflow, modèle de données, suivi des corrections
ROLES.md        profils, matrice des accès, contrat de relais
tests/          suite de non-régression Playwright
```

---

## Trois profils, des rôles par équipe

Un rôle n'appartient pas à une personne : il la relie à **une équipe**. Sofia est
*entraîneuse des U15* et peut être *sélectionneuse des U18* — les deux coexistent.
Le bouton en haut à droite ouvre le **sélecteur de contexte** : « j'agis en tant
que… ».

### 🛡️ Administrateur

Gère le club : les personnes, les **équipes durables** (qui traversent les saisons),
les affectations, les saisons, la base de joueuses et le relais. Il ne saisit pas
les matchs et n'évalue pas — ce sont des actes de terrain qui engagent leur auteur.

| Onglet | Rôle |
|---|---|
| 👤 **Personnes** | Créer, affecter à une équipe, inviter (émission d'un jeton personnel) |
| 👕 **Équipes** | Créer, catégorie, réglage *vue imposée / vue libre* |
| 🗓️ **Saisons** | Créer, dater, clôturer · sauvegarde complète du club |
| 🗂️ **Joueuses** | Base commune au club |
| 📡 **Relais** | Configuration, jetons en circulation, révocation |
| 📜 **Journal** | Toutes les décisions du club, signées et datées |

### 👔 Entraîneur

| Onglet | Rôle |
|---|---|
| 🗓️ **Saison** | Tableau de sélection · **campagnes d'évaluation** · **journal des décisions** · saisons |
| 👥 **Joueuses** | Base de données partagée entre toutes les saisons · convocation |
| ✏️ **Saisie** | Statistiques en direct — mode rapide ou mode grille |
| 📊 **Récap** | Match en cours · cumul (filtrable par **nature** et par **rencontre**) · **⭐ évaluations par campagne** et **📈 progression** · **🏐 rencontres** |
| 🎯 **Sélection** | Vues sélectionneur · publication · soumissions reçues |

Il ne voit que **son** équipe : roster, statistiques, campagnes et soumissions.
Il peut ajouter des athlètes à la base du club et inviter des sélectionneurs sur
son équipe, mais ni nommer un entraîneur, ni exporter le club entier.

### 🎯 Sélectionneur

Interface réduite : chaque athlète est désignée par son **numéro**. Pour chacune,
5 critères notés de 1 à 5, des compteurs de statistiques, une recommandation et un
commentaire. Puis `📤 Soumettre`.

Deux façons de recevoir du travail :

- **vue imposée** — l'entraîneur compose la vue et la lui adresse ;
- **vue libre** — l'entraîneur publie le *catalogue* de l'équipe (numéros et
  postes) et le sélectionneur **choisit lui-même** les athlètes qu'il observe.

Il ne voit que les équipes où il est affecté, et **jamais** l'avis d'un collègue.

> Le détail des profils, la matrice complète des accès et ce que l'application
> peut réellement garantir : [`ROLES.md`](ROLES.md).

---

## Rencontres

Un match s'enregistre dans une **rencontre**, qui porte sa nature, son adversaire,
sa date réelle et son lieu.

| Nature | Usage |
|---|---|
| 🏆 **Championnat** | Une journée de calendrier |
| 🎪 **Tournoi** | Une journée à plusieurs matchs — un seul bloc, plusieurs matchs |
| 🤝 **Amical** | Hors concours, préparation |
| 🎽 **Entraînement** | Séance chiffrée |

Un tournoi se saisit une fois puis se complète : le second match propose
« Rattacher à » la rencontre du jour. Chaque match garde **son propre adversaire**
— il change à chaque tour — et son score par set, dont l'issue (V/D/N) est déduite.

L'écran **🏐 Rencontres** regroupe les matchs sous leur rencontre, affiche le bilan
de la saison décliné par nature, et le bouton 📊 d'une rencontre bascule le cumul
sur elle seule.

La date de la rencontre est distincte de l'horodatage de saisie : un tournoi joué
samedi et saisi dimanche reste daté de samedi.

### Lire le cumul

Trois axes se composent : la **nature** (toutes, championnat, tournoi, amical), la
**rencontre** (un tournoi précis) et la **fenêtre** (toute la saison, 3, 5 ou 10
derniers matchs). Le bandeau rappelle en clair ce qui est cumulé.

`÷ Par match` divise par le nombre de sessions jouées par chaque joueuse : une
titulaire à 8 matchs et une arrivante à 1 se lisent alors sur la même échelle.

---

## Numéros d'athlète

Le numéro n'est **jamais attribué automatiquement** — vous le saisissez.

- à la création d'une fiche joueuse (champ *Numéro d'athlète*, facultatif) ;
- en fin de ligne dans l'ajout en lot : `Léa Tremblay 7` ;
- **et à tout moment ensuite**, directement dans la case de gauche du tableau
  `🗓️ Saison → Sélection`.

Un numéro déjà pris est refusé, un doublon s'affiche en rouge, et les joueuses sans
numéro sont signalées — c'est la seule information que verront vos sélectionneurs,
elle doit être exacte.

---

## Campagnes d'évaluation

Une **campagne** est un moment d'évaluation daté : la sélection d'août, un point de
mi-saison, le bilan de mai. Chaque vue sélectionneur appartient à une campagne, et
**les moyennes ne se mélangent jamais d'une campagne à l'autre**.

```
Sélection (août)     Léa · 2,5  ─┐
Mi-saison (janvier)  Léa · 3,5  ─┼─▶  chaque campagne garde son score
Fin de saison (mai)  Léa · 4,5  ─┘    Récap → 📈 Progression : +2,0
```

Pour réévaluer les mêmes athlètes plus tard, **🔁 Réévaluer** duplique la vue dans
une autre campagne avec des données **vierges** : aucune note périmée ne peut être
resoumise par inadvertance.

`🗓️ Saison → Campagnes` permet d'ouvrir, renommer, clore et supprimer une campagne.
Une campagne close, comme une saison clôturée, disparaît du rôle sélectionneur.

---

## Le circuit de sélection

```
Base de joueuses ──convocation──▶ Roster de la saison (numéros saisis)
                                        │
                                        ├──▶ Vue sélectionneur A  (#7 #12 #3)   ─┐
                                        ├──▶ Vue sélectionneur B  (#3 #9 #14)   ─┤ une joueuse
                                        └──▶ …                                  ─┘ peut être
                                                                                   dans plusieurs vues
   chaque sélectionneur soumet ──▶ Soumissions (figées, rattachées à leur campagne)
                                        │
                                   compilation par joueuse
                     (somme des stats · moyenne/min/max par critère · avis)
                                        │
                     ▼ Récap → ⭐ Évaluations   et   📈 Progression
                     ▼ Saison → Sélection : Retenir / Recaller / Non retenue
                                        │
                             joueuses retenues ──▶ équipe de la saison
```

### Trois façons de distribuer une vue

**Sur un seul appareil** — `🎯 Ouvrir ici` passe le téléphone au sélectionneur.

**Sur son propre appareil, par le réseau** *(recommandé)* — configurez un relais une
fois (voir ci-dessous), invitez la personne depuis 🛡️ Administration → Personnes
(un **jeton personnel** est émis), puis `📡 Publier` la vue. Le sélectionneur ouvre
son lien : l'application se configure seule, reconnaît son identité auprès du
relais, il récupère ses vues, évalue, et `📡 Téléverse` sa soumission.

**Par fichier, hors-ligne** — `📤 Fichier` produit un paquet JSON ; le sélectionneur
l'importe, évalue, et renvoie un fichier de soumission. Aucun réseau requis.

### Anonymat

Par défaut une vue est **anonyme** : ni l'interface du sélectionneur, ni le paquet
exporté, ni ce qui transite par le relais ne contiennent de nom. Pour un bilan de fin
de saison, où l'évaluateur connaît déjà l'équipe, la vue peut être passée en
**nominative** — un libellé court (« Léa T. ») accompagne alors le numéro.

---

## Synchronisation

Optionnelle. Sans elle, tout fonctionne par échange de fichiers.

Le relais est un petit service que **vous** déployez, gratuitement et sans carte
bancaire : un Cloudflare Worker ou un script Google Apps Script. Les deux sont
fournis dans [`server/`](server/README.md) avec leurs instructions.

Ensuite, dans `🎯 Sélection → Configurer` : collez l'URL, générez un code de salon,
testez, enregistrez.

Chaque invitation émet un **jeton personnel**, révocable. Le relais ne restitue à
chacun que ce qui lui revient : un sélectionneur reçoit ses vues et le catalogue de
son équipe, jamais les soumissions — pas même la sienne une fois déposée.

> Un jeton identifie, il n'authentifie pas : quiconque obtient un lien d'invitation
> en prend l'identité. Révoquez-le si un appareil est perdu, et changez de salon
> entre deux saisons.

---

## Statuts

Deux axes indépendants, pour ne jamais réécrire l'histoire d'une joueuse.

| Sélection | | Effectif *(une fois retenue)* | |
|---|---|---|---|
| ◻️ Candidate | convoquée, en cours d'évaluation | ● Active | sur le terrain |
| 🔁 Recallée | rappelée pour la suite | 🩹 Blessée | hors terrain, reste dans l'équipe |
| ✅ Retenue | fait partie de l'équipe | → Partie | a quitté l'équipe en cours de saison |
| ⛔ Non retenue | écartée | | |

Une joueuse blessée ou partie **conserve son statut *Retenue*, ses matchs joués et
son cumul** ; elle est simplement retirée du terrain.

---

## Créer une nouvelle saison

`Saison → Saisons → + Nouvelle saison`, puis au choix :

- **partir d'une base vide** — vous convoquez ensuite qui vous voulez ;
- **reprendre l'effectif d'une saison précédente** — toutes ses joueuses reviennent
  au statut *Candidate*, avec leur numéro et leur position, à re-sélectionner.

Dans les deux cas la **base de joueuses reste commune** : l'historique de chacune est
conservé d'une saison à l'autre.

---

## Données

Tout est stocké localement (`localStorage`). Rien ne sort de l'appareil, sauf ce que
vous publiez explicitement sur votre propre relais.

- `Saison → Saisons → 📤 Sauvegarde` produit un fichier complet.
- `📥 Restaurer / fusionner` réimporte en dédoublonnant les joueuses. Les exports de
  l'ancienne version (v7 et antérieurs) sont acceptés.
- Au premier lancement, les données de l'ancienne version sont migrées automatiquement.
- Les saisons enregistrées avant les rencontres sont reprises : les matchs d'un même
  tournoi se regroupent d'eux-mêmes, la nature est devinée du nom, l'adversaire lu
  dans « vs X ».

---

## Développement

Aucun build. Ouvrez `index.html`, ou servez le dossier pour tester le service worker :

```bash
python3 -m http.server 8899
```

Non-régression : voir [`tests/README.md`](tests/README.md).
