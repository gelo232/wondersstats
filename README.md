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

## Ouvrir l'application

Au premier lancement, l'application ne donne aucun droit : elle demande qui vous
êtes.

- **Créer un club** — vous mettez le club en place, vous en êtes l'administrateur.
- **Rejoindre comme sélectionneur** — vous avez reçu un lien d'invitation.

Puis elle vous demande une **phrase de passe**. Les données du club sont ensuite
chiffrées dans le navigateur — AES-GCM 256, clé dérivée par PBKDF2-SHA256, dont le
coût est calibré sur votre appareil. La clé ne quitte jamais la mémoire, la phrase
n'est stockée nulle part, et rien de lisible ne reste sur le disque.

> **Personne ne peut retrouver cette phrase.** Si vous l'oubliez, les données de
> cet appareil sont perdues. Exportez une sauvegarde régulièrement, ou configurez
> la sauvegarde GitHub ci-dessous.

**Ce que le chiffrement protège** : quelqu'un qui récupère l'appareil, ou qui lit
`localStorage`, ne voit que du bruit.

**Ce qu'il ne protège pas** : la séparation des rôles reste côté client. Un site
statique ne peut rien imposer à qui ouvre la console de son navigateur. Seul le
relais autorise réellement — voir [`ROLES.md`](ROLES.md).

Ouverte depuis un fichier local (`file://`) plutôt que par une adresse `https`,
l'application le signale et propose de continuer sans chiffrement, plutôt que de
faire semblant.

---

## Sauvegarde GitHub

`Administration → 📡 Relais → 🗄️ Sauvegarde GitHub` dépose vos données dans un
dépôt **privé** : sauvegarde, historique, et passage d'un appareil à l'autre.

Ce qui est déposé est le **même bloc chiffré** que sur l'appareil. GitHub n'en voit
que du bruit, et c'est votre phrase de passe qui l'ouvre ailleurs — pas votre mot de
passe GitHub.

Le jeton d'accès est saisi à la main, jamais présent dans le code. Il est rangé avec
les secrets, donc chiffré au repos ; il n'apparaît dans aucune sauvegarde exportée
et n'est jamais déposé dans le dépôt. Chaque appareil a le sien.

Un jeton **fine-grained** limité à ce seul dépôt, avec la permission `Contents` en
lecture et écriture, suffit — l'assistant détaille les cinq étapes.

Si le dépôt a été modifié depuis un autre appareil, l'envoi s'arrête et vous
demande quoi faire, plutôt que d'écraser en silence.

**Pourquoi les sélectionneurs ne passent pas par GitHub** : leur donner le droit
d'écrire dans le dépôt leur donnerait aussi la lecture de toutes les soumissions,
y compris celles de leurs collègues. C'est exactement ce que le relais à jetons
refuse. Ils passent donc par le relais, ou par lien et fichier.

---

## Mettre l'application en service

Une seule fois, sur l'appareil qui sera le vôtre.

1. Ouvrez l'application. Elle indique qu'**aucun propriétaire n'est déclaré** —
   si vous l'utilisiez déjà, un bandeau 👑 le dit en haut de l'écran, et vos
   données restent en place.
2. **Je suis le propriétaire** → votre nom, une phrase de passe (sur une
   installation déjà en service, la phrase existante est conservée).
3. L'écran affiche le contenu de `superadmin.json`. Copiez-le, créez ce fichier
   **à la racine du dépôt**, à côté de `index.html`, et publiez.
4. **J'ai publié — continuer.**
5. Aussitôt : `👑 Propriétaire → 🗝️ Ma clé → Exporter`. Gardez ce fichier
   ailleurs que sur l'appareil. Sans lui, une clé perdue oblige à refonder.

Ensuite seulement : `🏛️ Clubs` pour créer et charter, `🛡️ Administrateurs` pour
nommer. Un club déjà présent avant la fondation attend votre signature — le
bouton **Signer** est sur sa carte.

---

## Le propriétaire, et un seul

Le système a **un propriétaire**, établi une fois pour toutes à la fondation. Lui
seul crée des clubs et nomme leurs administrateurs.

Ce n'est pas un rôle qu'on s'attribue : c'est une clé. La fondation engendre une
paire ; la privée reste chiffrée sur l'appareil du propriétaire, la publique se
publie dans `superadmin.json`, à côté de `index.html`. Toutes les installations la
lisent au démarrage.

- Tant qu'aucun propriétaire n'est déclaré, **aucune installation ne propose de
  créer un club** — elle propose de fonder le système.
- Une fois la clé publiée, une installation qui ne la détient pas ne peut plus rien
  fonder : elle attend une invitation.
- Un club porte une **charte signée**, une nomination d'administrateur porte une
  **autorisation signée**. Forgées ou modifiées après coup, elles sont rejetées.

> **La clé se perd si vous ne l'exportez pas.** Elle n'est ni dans vos sauvegardes,
> ni dans votre dépôt — c'est voulu. `👑 Propriétaire → 🗝️ Ma clé → Exporter`
> produit un fichier scellé, à garder ailleurs que sur l'appareil.

**Ce que la signature empêche vraiment** : qu'un club ou une nomination inventés
soient acceptés **ailleurs** — sur un autre appareil, ou par le relais. Sur sa
propre machine, qui modifie sa copie de la page fait ce qu'il veut ; c'est la même
limite qu'ailleurs dans cette application, et [`ROLES.md`](ROLES.md) la détaille.

---

## Clubs, équipes, administrateurs

Un club regroupe des équipes et peut compter **plusieurs administrateurs**. Un
administrateur ne voit que son club. Un entraîneur peut être administrateur du
sien — les deux rôles se cumulent sans se confondre — et une personne qui
n'entraîne rien le peut tout autant.

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
