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
GUIDE.md        guide d'utilisation — une sélection, puis une demi-saison
tests/          suite de non-régression Playwright — dix-huit suites
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

## Catégories

Les catégories ne sont pas figées dans le code : ce sont des **données du club**,
que son administrateur remanie depuis `🛡️ Administration → 👕 Équipes → 🏷️
Catégories` (le propriétaire y accède aussi depuis la carte du club).

**La catégorie appartient à l'équipe, jamais à la saison.** Un club fait jouer ses
U13 et ses U21 dans la même saison — celle-ci n'est que son axe de temps. Elle se
règle donc dans `👕 Équipes`, d'où les équipes-saisons en tiennent leur copie.

La liste de départ d'un club neuf est `U12 · U13 · U14 · U15 · U16 · U18 · U21 ·
Senior`, mais chaque fédération a les siennes et elles changent : ajoutez,
retirez, ou repartez de la liste par défaut.

Deux garde-fous :

- Une catégorie **portée par une équipe** ne peut pas être retirée — sa puce
  affiche le nombre d'équipes concernées et sa croix est inactive. Changez
  d'abord la catégorie de l'équipe.
- Une catégorie **héritée** d'une base plus ancienne reste proposée dans le menu
  même si elle ne figure plus dans la liste du club, pour qu'une simple
  modification d'équipe ne la reclasse pas en silence.

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

La barre du bas porte **trois axes**, pas une liste d'écrans :

| Onglet | Rôle |
|---|---|
| 🗓️ **Saison** | Le tableau de bord des **six parties** de la saison |
| 👥 **Athlètes** | La base du club, partagée entre toutes les saisons |
| ⚙️ **Réglages** | Saisons · journal des décisions · sortie des données |

Six onglets auraient tenu 62 px chacun sur un téléphone de 375 px, et tronqué
quatre libellés sur six. Une barre d'onglets annonce des axes ; les contenus
vivent dessous. L'onglet Saison ouvre donc un **tableau de bord de six tuiles**,
chacune portant son chiffre du moment — ce qui reste à trancher, le bilan, les
offres en attente. Une saison vide dit par où commencer.

| Partie | Ce qu'elle porte |
|---|---|
| 🎯 **Sélection** | Les **campagnes**, et pour chacune : convoquées, récap, scores, vues, soumissions, décisions, offres |
| 🎽 **Entraînements** | La performance en séance, par athlète et pour l'équipe |
| 🤝 **Matchs** | Amicaux **et** championnat — par set, par match, sur tous les matchs |
| 🎪 **Tournois** | Tous tournois confondus, par tournoi, par match, par set |
| 📈 **Objectifs** | Objectifs d'athlète et d'équipe, recalculés à chaque relevé |
| 📊 **Récap global** | La compilation des cinq autres, par athlète et pour l'équipe |

La **saisie** n'est pas un onglet : c'est l'acte d'une partie de rencontres —
« ✏️ Relever », qui propose d'emblée la nature de la partie d'où l'on vient.

Il ne voit que **son** équipe : roster, statistiques, campagnes et soumissions.
Il peut ajouter des athlètes à la base du club et inviter des sélectionneurs sur
son équipe, mais ni nommer un entraîneur, ni exporter le club entier.

### 🎯 Sélectionneur

Interface réduite : chaque athlète est désignée par son **numéro**. Pour chacune,
5 critères notés de 1 à 5, des compteurs de statistiques, une recommandation, un
**poste proposé** (facultatif) et un commentaire. Puis `📤 Soumettre`.

Le poste proposé est un **avis**, jamais une donnée d'effectif : il est compté par
joueuse comme les recommandations, s'affiche en violet sous le badge *Avis*, et ne
touche pas au poste du roster — que seul l'entraîneur écrit.

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

Les trois parties de rencontres — **Entraînements**, **Matchs**, **Tournois** —
lisent les **mêmes** rencontres, filtrées par nature. Rien n'est dupliqué : une
rencontre mal classée se corrige en changeant sa nature, jamais en la déplaçant.

Le **championnat n'a pas de partie à lui** : il se compte et s'affiche exactement
comme un amical, et lui donner son propre écran en aurait fait le jumeau de celui
des amicaux. La partie **Matchs** couvre les deux, derrière un sélecteur
`Amicaux · Championnat · Tous` qui n'apparaît que si la saison en contient.

### Par set, par match, par tournoi, globalement

Deux axes se croisent dans un seul écran, plutôt que dans huit écrans jumeaux :

- le **niveau** — global → tournoi → match → set. On descend d'un appui, on
  remonte par `← Remonter`, qui dit toujours où l'on retombe ;
- le **sujet** — `📊 L'équipe` ou `👥 Les athlètes`. L'équipe n'est jamais une
  donnée à part : c'est la somme de ses athlètes, et l'application le vérifie.

Un tournoi a un niveau de plus qu'un match, parce qu'il porte plusieurs matchs.
Un match seul n'a pas de niveau intermédiaire : on y descend droit.

### Relever set par set

Pendant la saisie, **⏭ Set suivant** pose une borne. Les sets sont les
différences successives de ces bornes, la dernière étant le total : **leur somme
vaut donc le total exactement, par construction**, et non par vérification. Rien
n'est remis à zéro en cours de match, ce qui permet de corriger un compteur
*après* avoir clos un set.

Les matchs saisis avant cette possibilité ne sont **pas ventilés**. Ils
s'affichent « Match (non ventilé) » et jamais « Set 1 » — on n'affirme pas une
donnée qu'on n'a pas — et comptent à l'identique dans tous les cumuls.

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
  `🗓️ Saison → 🎯 Sélection → 👥 Convoquées`.

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
Fin de saison (mai)  Léa · 4,5  ─┘    Sélection → 📊 Scores : +2,0
```

Pour réévaluer les mêmes athlètes plus tard, **🔁 Réévaluer** duplique la vue dans
une autre campagne avec des données **vierges** : aucune note périmée ne peut être
resoumise par inadvertance.

La **barre de campagne**, en tête de la partie Sélection, porte le nom de la
campagne ouverte et son avancement. Elle ouvre la feuille **📅 Campagnes** : créer,
renommer, clore, supprimer, et régler la formule du score. Les cinq volets —
Convoquées, Récap, Scores, Vues, Soumissions — sont **bornés à la campagne
ouverte**, ce qui est la seule garantie qu'on ne tranche pas la journée 1 en
croyant trancher la 2.

Une campagne close, comme une saison clôturée, disparaît du rôle sélectionneur.
Supprimer une campagne emporte ses convocations et ses offres, et le dit avant.

---

## Comment se calcule le score

Le score d'une athlète dans une campagne se construit en cinq temps. Chacun corrige
un travers que la moyenne simple laissait passer.
`🎯 Sélection → barre de campagne → ⚖️ Régler` règle l'ensemble — **pour une équipe, sur toute sa saison, et pour chacune de ses
campagnes**. Comparer septembre à décembre n'a de sens que si les deux sont mesurés
pareil. Chaque équipe a la sienne ; elle la conserve d'une saison à l'autre, tandis qu'une
équipe créée après coup part des valeurs par défaut.

**1 · Les notes, corrigées de la sévérité.** Deux évaluateurs n'ont pas la même main.
L'application compare chacun aux autres **sur les athlètes qu'ils ont vues en commun**
— jamais à la moyenne générale, qui ferait passer pour complaisant celui qui n'a vu
que les meilleures — et retire l'écart qui lui est propre. Sans recoupement, rien
n'est corrigé. La correction est amortie quand elle repose sur peu de comparaisons,
bornée à ±1,5, et recentrée pour ne pas déplacer le niveau général.

**2 · Les critères, pondérés.** Chaque critère porte un poids de — (écarté) à ×3.
À poids égal, c'est la moyenne d'avant.

**3 · Les compteurs, ramenés à une efficacité.** Douze kills ne disent rien sans le
nombre de tentatives. Chaque famille se réduit donc à une **efficacité** entre −1 et
+1 — la part nette de gestes réussis — et à un **volume**. En dessous du volume
minimum, la famille n'est pas notée : trop peu de gestes pour en tirer quoi que ce
soit.

| Famille | Compte pour | Compte contre |
|---|---|---|
| Services | Ace | Erreur |
| Réception | En jeu | Erreur |
| Passes | Attaquable | Hors sys. |
| Attaques | Kill | Erreur |
| Blocs | Kill, Solo, Aide | Erreur |
| Défense | Réussie, Soutien | Sout. err. |

*Hors sys.* en réception et en défense ne compte ni d'un côté ni de l'autre : la balle
est restée en jeu.

**4 · Les efficacités, situées dans la campagne.** Une efficacité d'attaque de +0,30
est excellente en U13 et ordinaire chez les seniors. Plutôt qu'un barème importé,
l'application situe chaque athlète **parmi celles du même moment** et ramène cela sur
la même échelle 1–5 que les critères. Un groupe sans dispersion donne 3 à tout le monde.

**5 · Le mélange, puis l'amortissement.** La part des statistiques est réglable
(50 % par défaut : notes et compteurs pèsent à égalité). Enfin, un score qui ne
repose que sur un seul regard est ramené
vers la moyenne du groupe, à proportion du peu sur quoi il repose : une athlète vue
une fois cesse de coiffer celles que trois personnes ont jugées.

> Chaque ligne du classement se déplie sur **« D'où vient le score »** : la part des
> critères, celle des statistiques, ce que la correction de sévérité a déplacé et ce
> que l'amortissement a retiré. Un chiffre qui décide d'une sélection doit pouvoir
> être défendu devant l'athlète et ses parents.

`⚖️ Formule → Moyenne simple` rétablit d'un bouton le calcul d'avant : critères à
poids égal, statistiques à 0 %, aucune correction.

### Le score ordonne, il ne tranche pas

Le statut *Retenue · Recallée · Non retenue* ne vient jamais du score : il vient des
**avis** des sélectionneurs, comptés à part, ou de la main de l'entraîneur. `⚡ Appliquer
les avis` aligne les statuts sur l'avis majoritaire — et le dénominateur ne compte que
ceux qui se sont prononcés, pas ceux qui n'ont relevé que des compteurs.

---

## La sélection comme point de départ

Les compteurs relevés le jour de la sélection ne sont pas un souvenir : c'est la
**première mesure** de l'athlète. Une fois retenue, sa fiche de saison
(`🎯 Sélection → ⚖️ Récap`, ouvrez sa feuille) porte un bloc **« Depuis la sélection »** qui met
face à face l'efficacité relevée ce jour-là et celle du cumul des matchs, famille par
famille, avec l'écart.

```
                sélect.   saison    écart
Réception        +0,73     +0,58    −0,15
Attaques         +0,38     +0,49    +0,11
```

La comparaison porte sur les **efficacités**, jamais sur les volumes : une séance de
sélection et vingt matchs ne se comparent pas en nombre de gestes. Une famille absente
d'un côté se lit « — » plutôt que zéro — ne pas avoir servi n'est pas avoir mal servi.

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
                     ▼ Sélection → 📊 Scores   et   📈 Progression
                     ▼ Sélection → ⚖️ Récap : Retenir / Recaller / Non retenue
                     ▼ une retenue reçoit une OFFRE en attente
                     ▼ 👕 Constituer l'équipe : Confirmer / Archiver
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

## Offres — être retenue n'est pas avoir dit oui

Retenir une athlète ne la met plus dans l'effectif. Elle reçoit une **offre de
rejoindre l'équipe**, qui a trois états :

| État | Ce qu'il veut dire |
|---|---|
| ⏳ **En attente** | Elle est retenue, elle n'a pas encore répondu |
| 🤝 **Acceptée** | Elle est dans l'équipe |
| ✖️ **Refusée** | Elle n'en sera pas — archivée |

L'équipe se constitue par **👕 Constituer l'équipe**, en barre du bas de la partie
Sélection. La feuille liste les retenues, et devant chacune deux gestes :

- **Confirmer** — l'offre passe à *acceptée* et l'athlète entre dans l'effectif ;
- **Archiver** — l'offre passe à *refusée* et l'athlète en sort. **Ni sa fiche, ni
  ses statistiques, ni les matchs qu'elle a joués ne sont touchés** : elle a joué,
  cela reste vrai.

Une offre tranchée ne se réécrit pas — c'est un acte daté — mais elle se **rouvre**
explicitement, et le journal le note. Retirer une décision annule une offre encore
en attente ; elle reste en base, datée, parce qu'elle n'a engagé personne.

Un effectif ne se remplit donc plus de joueuses qui n'ont pas répondu. C'est la
seule différence de comportement entre la v6 et la v7 sur un geste existant.

---

## Objectifs

Chaque athlète peut porter des **objectifs de progression**, recalculés à chaque
relevé et réajustés d'eux-mêmes : relevés d'un pas quand ils sont atteints, ramenés
au niveau réel quand la performance recule. Chaque palier franchi et chaque recul
noté restent comptés.

**Les seuils se calculent sur votre équipe**, pas sur un barème venu d'ailleurs :
la médiane de l'effectif donne le point de départ, sa dispersion donne la hauteur
du pas. Un classement universitaire américain n'a rien à dire d'une U13
québécoise ; son équipe, si. Un barème par catégorie ne sert que d'amorce, au tout
premier match, et une seule de ses cellules est réellement sourcée.

### Ce que l'application refuse de dire

C'est le plus important. Un objectif faux coûte plus cher que pas d'objectif.

- **Sous le volume minimal, elle se taît.** Une efficacité sur trois services ne
  dit rien. Chaque geste vaut +1, 0 ou −1, donc une efficacité fluctue d'environ
  ±0,10 d'un match à l'autre par pur hasard quand l'athlète fait quarante gestes.
  C'est ce bruit qui fixe tous les seuils — le pas vaut environ une fois et demie
  l'erreur-type, le seuil de recul le double du pas.
- **Un recul n'est déclaré qu'après confirmation** sur une seconde fenêtre. On ne
  dit pas à une joueuse de quatorze ans qu'elle régresse sur une seule mesure.
- **Un recul partagé par toute l'équipe n'est pas imputé à l'athlète** : si tout le
  monde a baissé autant, c'est le calendrier, pas elle.
- **Pas d'objectif sur les habiletés** : cette famille n'a aucun compteur d'erreur,
  donc sa valeur décrit le type de ballon reçu, pas la qualité du geste.
- **Au service, la cible est plafonnée à l'équilibre.** L'efficacité y est la
  différence entre les aces et les fautes ; même au plus haut niveau elle ne passe
  pas durablement au-dessus de zéro, et viser plus serait inatteignable par
  construction.
- **Si les attaques « réussie » ne sont pas saisies**, l'efficacité d'attaque est
  gonflée et n'est plus un pourcentage d'attaque. L'application affiche « saisie
  incomplète » plutôt qu'un objectif faux.

La fenêtre d'observation se définit par le **volume**, jamais par un nombre de
matchs : une centrale fait six attaques un soir et trente le lendemain.

---

## Récap global

La compilation des cinq autres parties, par athlète et pour l'équipe entière.
**Rien n'y est stocké** : tout se recalcule à l'affichage, depuis les mêmes
fonctions que les parties. C'est la seule façon qu'un total ne puisse pas
contredire le détail dont il sort — un cache se serait désynchronisé au premier
score corrigé, sans que personne le voie.

---

## Corriger une soumission

Un évaluateur se trompe. Il note 2 au lieu de 5, il écarte une athlète
qu'il voulait retenir. Jusqu'ici, soumettre une seconde fois **ajoutait**
une observation : les deux notes se moyennaient, et la fausse survivait
pour toujours dans le score.

L'écran de soumission pose donc la question, à qui a déjà soumis :

| Choix | Ce qui se passe |
|---|---|
| **✎ Je corrige** | La soumission précédente est remplacée. Ses notes, ses compteurs et son avis ne comptent plus. |
| **➕ Nouvelle séance** | Elle est conservée. Les deux séances s'additionnent, et l'avis retenu est le plus récent. |

L'application ne peut pas trancher à la place de qui a vu jouer : deux
séances valent mieux qu'une, mais une erreur ne vaut rien. Côté
entraîneur, une soumission corrigée reste visible — c'est une pièce du
dossier — estompée, et marquée « Corrigée — ne compte plus ».

---

## La place occupée sur l'appareil

Une saison de deux équipes, cent soixante relevés et soixante-dix fiches
pèse environ **700 Ko** une fois chiffrée. Les navigateurs accordent à peu
près 5 Mo par site : **quatre à cinq saisons tiennent, pas dix**.

`⚙️ Réglages → 💾 Données` affiche en permanence la place occupée. Passé
3,5 Mo, un bandeau le signale — avant le mur, et non après l'échec d'une
sauvegarde, qui serait le pire moment pour l'apprendre. Le geste qui aide :
exporter une sauvegarde, puis archiver les saisons qu'on ne consulte plus.

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

- `⚙️ Réglages → 💾 Données → 📤 Sauvegarde complète` produit un fichier complet :
  le club, ses équipes, ses saisons et sa base de joueuses. C'est lui qu'il faut pour
  repartir d'un appareil neuf. Il ne contient **aucun jeton d'invitation** — restaurer
  une sauvegarde suppose donc de réémettre les liens.
- `📤 Exporter mon équipe`, à côté, n'emporte qu'une équipe-saison : de quoi passer
  la main sans emporter les données des collègues.
- `📥 Restaurer / fusionner` réimporte en dédoublonnant les joueuses sur `nom + année`,
  les équipes et les clubs sur leur nom. Rien n'est écrasé : une équipe-saison déjà
  présente n'est pas fusionnée, et l'écran vous la **nomme** plutôt que de la taire.
  Les exports de l'ancienne version (v7 et antérieurs) sont acceptés.
- `⚙️ Réglages → 🔒 Sécurité` verrouille l'appareil sur-le-champ, et permet de
  **changer la phrase de passe** — les données sont rechiffrées sur place.
- Au premier lancement, les données de l'ancienne version sont migrées automatiquement.
- Les saisons enregistrées avant les rencontres sont reprises : les matchs d'un même
  tournoi se regroupent d'eux-mêmes, la nature est devinée du nom, l'adversaire lu
  dans « vs X ».

---

## Notes de version

### v7.2 — le filet de sécurité, et trois promesses tenues

Les versions précédentes ont construit ce que l'application **fait**. Celle-ci
regarde ce qu'elle promet de **ne pas perdre** — et c'est là qu'étaient les
défauts les plus coûteux : tous silencieux, tous découverts après coup.

**Restaurer une sauvegarde restaure vraiment tout.** L'import n'emportait ni les
clubs ni les affectations de club : les équipes entraient avec l'identifiant de
club de l'appareil d'origine, inconnu ici, et disparaissaient **au rechargement
suivant** — pas à l'import, ce qui rendait la perte invisible sur le moment. Le
remappage des identifiants oubliait par ailleurs tout ce qui est né avec la v7:
convocations, décisions, offres, objectifs, ventilation par set. Et la
normalisation finale était appelée sans que son résultat soit repris — seul des
quatorze appels du fichier à l'oublier. Enfin, une équipe-saison déjà présente
était écartée **sans un mot**, pendant que le message disait « Import terminé » :
elle vous est maintenant nommée.

**« Sauvegardé » veut dire écrit.** Sous coffre — c'est-à-dire toujours —
l'écriture est un chiffrement asynchrone. L'application effaçait le journal de
secours et affichait « Sauvegardé » **avant** que le bloc n'atteigne le disque.
Le bouton « Mettre à jour », lui, rechargeait la page dans la foulée : perte
garantie. Le journal n'est désormais purgé qu'une fois l'écriture confirmée, et
jamais si elle a échoué ; à la fermeture de l'onglet on n'y touche plus du tout
— c'est lui qui survivra, et le démarrage suivant le rejouera.

**Une base illisible n'est plus écrasée par une base vide.** Une erreur de
lecture donnait un club vide, sans message ; la première bascule d'onglet
écrivait ce vide par-dessus la saison. L'application refuse maintenant d'écrire
ce qu'elle n'a pas su lire.

**L'annulation dit vrai.** Confirmer une offre puis annuler laissait l'athlète
dans l'équipe avec une offre revenue « en attente » : les champs propres à
l'équipe-saison n'étaient pris dans aucun instantané. Le badge de décision
restait sur la valeur annulée jusqu'au rechargement. L'annulation d'une note
d'évaluateur ne faisait rien du tout — elle cherchait les vues dans les saisons,
où il n'y en a pas. Et quatre écrans offraient « Annuler » sur un geste qui
n'empilait rien : le bouton annulait l'opération **précédente**, un compteur de
match ou une décision de sélection.

**Trois choses que le code savait faire et que l'écran n'offrait pas.**
`⚙️ Réglages → 🔒 Sécurité` verrouille l'appareil sur-le-champ — pour l'iPad du
club qu'on laisse au bord du terrain — et permet enfin de **changer la phrase de
passe** : choisie à la hâte le premier jour, elle ne pouvait plus jamais l'être.
`💾 Données` porte la **sauvegarde complète** et sa restauration, jusqu'ici
réservées au rôle administrateur alors que ce guide les donnait comme un geste
d'entraîneur. Et **ventiler un match après coup** existe : l'application écrivait
« Vous pourrez le ventiler plus tard », puis n'offrait aucun geste. On reporte
désormais sa feuille de match compteur par compteur, dans un tableau où le reste
se déduit tout seul — rien ne s'additionne, on **déplace** ce qui est déjà
compté, et le total du match ne peut pas bouger.

**Lisible au soleil, touchable avec des gants.** Un audit mesuré au pixel
sur quarante et un écrans a trouvé du blanc sur ambre à **2,15:1** là où
il en faut 4,5 — la pilule de vue active, illisible sous une visière — et
quatre des sept couleurs de famille employées comme encre sur fond
sombre, entre 3,45 et 4,15. Elles ont désormais une encre distincte de
leur teinte. Côté doigts : le « − » qui corrige un compteur mal tapé
faisait **23 × 20 pixels**, à 2 px du « +1 » et à **11 px du « +1 » de
l'athlète suivante** — une visée basse s'inscrivait chez la mauvaise
joueuse, sans un mot. Le crayon d'une sous-équipe faisait 19 × 14 px,
collé à son libellé. Le filtre de poste offrait six cibles de 25 à 43 px
séparées de 3. Tout cela respecte maintenant le plancher de 44 px que
l'application s'était donné — le dessin n'a pas grossi, c'est la zone de
toucher qui s'est étendue.

**Et ce que l'application ne disait pas à voix haute.** Dix-neuf champs
de formulaire sur vingt et un n'avaient aucun nom lisible par une
synthèse vocale. Les fenêtres ne retenaient pas le focus : au clavier
d'un iPad, on finissait par piloter l'écran resté derrière le voile, sans
le voir. La barre « Terrain » — le premier geste de chaque match —
n'était pas atteignable au clavier. Et l'issue d'un match ne tenait qu'à
la couleur de son score.

**L'écran rendu au contenu.** Mesuré sur un téléphone de 375 × 667 :
l'écran Sélection consacrait **628 pixels sur 667** à ses propres barres —
94 % de la hauteur — et il restait de quoi afficher une ligne de liste.
La barre de recherche, les filtres, les tris et le compteur occupaient
quatre rangées à eux seuls ; deux barres de contexte redisaient ce que
l'en-tête affichait déjà ; le récapitulatif empilait cinq rangées de
réglages au-dessus de son tableau. Tout cela tient maintenant sur une
ligne chacun, et les filtres comme les tris s'ouvrent dans une feuille —
où **chaque option porte son chiffre** : combien d'athlètes elle laissera
passer, compte tenu de tout le reste. Une option qui n'en laisserait
aucune est grisée plutôt que de promettre une liste vide. Selon les
écrans, le contenu gagne de 30 à 47 % de hauteur.

**Une saison entière tient de nouveau sur l'appareil.** C'est le défaut
le plus lourd, et il ne se voyait qu'à l'échelle réelle : deux équipes,
soixante-dix athlètes, deux cent soixante relevés font 5 Mo de données —
et plus de 13 Mo une fois chiffrées et encodées, là où un navigateur en
accorde 5. L'écriture échouait, et **la saison disparaissait au
rechargement suivant**. Le coffre bascule désormais sur une autre réserve
du navigateur dès que la première refuse ; tant qu'elle suffit, rien ne
change. Et l'avertissement « l'espace se remplit » mesurait ce qui est
déjà sur le disque — il se taisait donc au moment précis où l'écriture ne
passait plus.

**Ce que les objectifs disaient de travers.** Un recul était déclaré pour une
athlète parfaitement stable, au seul motif qu'elle est sous la médiane de son
équipe : la médiane sert à fixer la cible, elle ne peut pas servir de référence
de recul. Celle-ci est désormais la première mesure réelle de l'athlète. Une
correction de relevé à volume égal — un kill requalifié en erreur — ne
déclenchait aucun recalcul. Une seule attaque « Réussie » sur toute la saison
désarmait le garde-fou de saisie incomplète, et une efficacité trois fois gonflée
repartait piloter la cible. La base d'équipe ignorait le périmètre de l'objectif.
Une catégorie « M15 » ou « Cadettes » retombait sur le barème senior. Et au
service, une équipe déjà à l'équilibre recevait une cible **sous** son niveau :
l'objectif naissait atteint et se redatait indéfiniment.

**Ce que le score disait de travers.** La correction de sévérité était bornée
puis recentrée — donc débordait la borne annoncée — et déplaçait des notes
qu'aucun second évaluateur n'avait vues. Une athlète relevée au compteur mais
jamais notée échappait à l'amortissement et coiffait le classement. Supprimer une
soumission corrective ressuscitait la note que l'évaluateur avait corrigée.
« Je corrige » pouvait annuler la soumission d'une **autre** vue. « Appliquer les
avis » lisait une campagne et écrivait dans une autre. Et le seuil de volume du
score de sélection était de cinq gestes, quand l'application refuse par ailleurs
de parler d'un objectif sous soixante-cinq.

**Sécurité.** Un lien d'invitation ouvert sur une application déjà installée
reconfigurait le relais et l'identité sans un mot — il demande maintenant
confirmation. Une sauvegarde complète exportait le jeton de relais de chacun.
Révoquer un jeton hors ligne affichait un succès et ne faisait rien, tout en
effaçant le seul moyen de réessayer. Jetons et codes de salon venaient de
`Math.random()`. Poser le verrou laissait l'inbox d'un sélectionneur en clair sur
le disque, et « repartir de zéro » laissait le jeton de relais. Côté relais, un
entraîneur pouvait réécrire la nomination de n'importe quel jeton dont il
connaissait la valeur.

**Vitesse.** Sur une saison réelle — quatre mégaoctets — chaque sauvegarde
passait 365 ms à encoder caractère par caractère, et 2,3 secondes sur un vieil
iPad : 77 % du coût, pour trois lignes. Changer d'onglet rechiffrait la base
entière, 473 ms pour enregistrer le nom d'un onglet. Et la bannière qui prévient
que l'espace se remplit mesurait ce qui est **sur le disque** — donc se taisait
précisément quand l'écriture échouait faute de place. Les trois sont corrigés.

**Deux gestes qui referment une fenêtre.** `Échap` ne faisait rien ; le retour
système d'Android **quittait l'application** en pleine saisie de match. Et le
fond d'une fenêtre la fermait au moindre contact — au bord d'un terrain, le pouce
se pose n'importe où, et un formulaire à moitié rempli disparaissait sans un mot.

**Et la remise en attente d'une offre**, à l'unité ou pour vingt athlètes d'un
seul geste : « Archiver » sortait bien une athlète de l'équipe, mais en la disant
*refusée*, ce qu'elle n'est pas quand on veut seulement lui reposer la question.

**Deux onglets ne s'effacent plus l'un l'autre.** Chaque fenêtre tient la
base entière en mémoire et la réécrit en entier dès qu'elle passe en
arrière-plan : il suffisait donc de basculer d'un onglet à l'autre pour que
celui qu'on quitte écrase le travail de celui qu'on rejoint. Une fiche créée
à gauche, un aller-retour, et elle n'existait plus — sans un message, sans
une ligne au journal. Désormais, une fenêtre qui n'a rien modifié se remet
à jour toute seule quand l'autre enregistre ; et si les deux ont du travail
que l'autre n'a pas, aucune n'écrit : l'application le dit à l'écran, avec
les deux issues possibles et ce que chacune coûte. Mieux vaut poser la
question que défaire.

**Les chiffres des filtres disent enfin ce que la liste rendra.** L'option
« Toutes » comptait deux fois les lignes sans valeur — 35 annoncés pour
20 lignes rendues — et les filtres dont la valeur peut manquer n'offraient
aucun moyen d'isoler ces lignes : ils ont maintenant leur « — Sans poste »,
leur « — Aucune ». Dans « Ce qu'on regarde », le chiffre d'une nature
ignorait la période déjà posée.

**Une recherche infructueuse n'était plus un cul-de-sac.** Ni croix pour
l'effacer, ni ligne « 0 sur 20 · Tout effacer », et les écrans vides sur
mesure n'offraient aucune sortie : il fallait vider le champ à la main.
Taper une lettre détruisait au passage le bouton « Tout effacer » du
compteur.

**Le « Annuler » des bandeaux est enfin offert.** Douze actions
destructrices — remise en attente, suppression d'un match, d'une
soumission, retrait d'une convocation, réinitialisation — annonçaient un
bandeau avec son bouton d'annulation, aussitôt détruit par le rafraîchis-
sement qui suivait. Le filet existait et était bien armé ; il n'était
simplement plus atteignable.

**Un dossard ne peut plus être porté deux fois.** L'ajout en lot créait les
doublons que la fiche unique refuse depuis toujours — alors que le numéro
est la seule information transmise aux sélectionneurs. Et supprimer une
fiche ne laisse plus derrière elle une offre qui la désigne.

**Le tableau détaillé a retrouvé sa porte** : athlètes × compteurs, triable,
par match ou cumulé. Plus rien n'y menait — on y accède depuis « Récap
global », et « ← Récap » ramène d'où l'on vient.

---

### v7.1 — une saison entière, jouée puis auditée

Deux équipes, trois sélectionneurs, soixante-dix athlètes, deux sélections
par équipe et huit mois de relevés : `tests/saison-complete.js` joue tout
cela sur une application **déjà en service**, et vérifie que la saison
précédente n'en ressort pas touchée d'un compteur.

Ce que ce parcours a fait sortir, et qu'aucun geste isolé ne montrait :

- **Une soumission ne pouvait pas être corrigée.** Resoumettre ajoutait une
  observation : la note fautive survivait dans la moyenne. L'écran
  promettait pourtant « vous pouvez soumettre à nouveau après correction ».
  L'évaluateur choisit maintenant entre corriger et ajouter, et le test
  compare l'athlète corrigée à un témoin noté à l'identique — écart nul
  exigé.
- **Retenir une athlète déjà dans l'équipe lui refabriquait une offre.**
  Une équipe de douze reconduite à la campagne suivante produisait douze
  offres fantômes à « confirmer » pour des joueuses qui jouaient déjà.
- **La recherche de la base du club reconstruisait l'écran à chaque
  frappe**, donc refermait le clavier entre deux lettres. Elle passe par la
  barre de liste partagée, qui rafraîchit sans reconstruire — et gagne au
  passage les tris et les filtres que les autres listes avaient déjà. Un
  ordre par défaut a été ajouté au composant : soixante-dix fiches dans
  leur ordre de création ne se lisent pas.
- **« Constituer l'équipe » laissait un bouton grisé** pour seule marque
  d'une offre acceptée. Un bouton grisé n'est pas un état : la ligne dit
  maintenant « 🤝 Dans l'équipe », et les offres en attente passent en tête
  — on constitue une équipe de douze en douze gestes d'affilée.
- **La place occupée n'était signalée qu'après l'échec d'une sauvegarde.**
  Elle est désormais affichée en permanence, et un bandeau prévient à 3,5 Mo.

Mesuré sur la saison chargée (50 698 gestes relevés, 158 relevés, deux
équipes) : chaque partie se dessine en **1 à 15 ms**, et aucun écran ne
déborde à 375 px.

**Ce qu'une relecture des tests a encore trouvé.** Trois contrôles
d'objectifs ne prouvaient rien : ils acceptaient l'état « recul à
confirmer » comme un succès, ou se contentaient de vérifier qu'une
fonction renvoie un nombre. Remplacés par une trajectoire déterministe qui
exige l'état exact à chaque étape — silence, progression, atteinte, recul
non confirmé, recul inscrit, recul collectif non imputé. Deux défauts en
sont sortis : le garde-fou d'équipe comparait deux fenêtres qui se
recouvraient presque, donc ne se déclenchait jamais ; et un objectif ne
mesurait par défaut que les matchs, alors qu'une équipe de club fait
cinquante séances pour dix-huit matchs.

Dix-neuf suites, 365 contrôles.

### v7.0 — la saison en six parties

La refonte du profil entraîneur. Cinq onglets et quatorze volets menaient à
vingt-quatre destinations par trente-huit chemins : près d'une destination sur deux
s'atteignait de plusieurs façons, ce qui est la définition de s'y perdre. La
sélection paraissait à trois endroits, les statistiques à deux.

**Navigation.** Trois axes en barre du bas — Saison, Athlètes, Réglages — et un
tableau de bord de six tuiles vivantes sous Saison. La saisie cesse d'être un
onglet pour redevenir l'acte d'une partie (« ✏️ Relever »). Le journal et les
saisons passent aux Réglages. Retaper l'onglet actif ramène à sa racine.

**Sélection par campagne.** Une décision par campagne, là où le statut de saison
n'en portait qu'une : une athlète recallée en journée 1 et retenue à l'extra avait
une seule case pour deux décisions. Chaque campagne porte ses convoquées, son
récap, ses scores, ses vues et ses soumissions. Dans le récap, chaque soumission se
lit **en lecture seule** avant de trancher.

**Offres.** Retenir envoie une offre en attente ; l'équipe se constitue en la
confirmant. Archiver sort de l'effectif sans toucher aux statistiques.

**Statistiques par set.** Les sets sont les différences successives d'instantanés
cumulatifs, donc leur somme vaut le total du match par construction arithmétique —
même après une correction faite une fois le set clos. Les matchs d'avant sont dits
« non ventilés » et comptent à l'identique.

**Objectifs.** Recalculés à chaque relevé, réajustés à l'atteinte comme au recul,
avec leurs marqueurs. Les seuils sortent de la dispersion réelle de l'équipe.

**Récap global.** La compilation des cinq parties, par athlète et pour l'équipe,
sans rien stocker.

**Préparation d'un hébergement serveur.** Une couche `Store` gouverne toutes les
écritures : une collection par future table, un journal d'opérations horodaté et
identifié, des transactions qui restaurent ce qu'elles ont touché si elles
échouent. La sauvegarde devient progressive à deux vitesses — le journal part en
quelques centaines de millisecondes, le bloc chiffré suit — et le journal est
rejoué au démarrage s'il est en avance sur le bloc.

**Corrigé au passage.** `window.confirm` ne s'affiche pas en PWA autonome : il
renvoyait `false` sans rien montrer, donc l'action la plus destructrice de
l'application échouait en silence. Remplacé par une confirmation maison dont le
bouton porte le verbe (défaut B4 de l'audit). Le gris des libellés secondaires
était à 3,75:1 de contraste, sous le seuil AA, partout dans l'application.

**Compatibilité.** Le modèle v7 est strictement additif : aucun champ v6 retiré ni
renommé, migration idempotente qui tourne à chaque chargement. Un export v7 relu
par une v6 perdrait cependant la ventilation par set ; déployez la v7 partout avant
de faire circuler des exports. Dix-huit suites de non-régression le vérifient, dont
cinq neuves.

### v6.3 — les statistiques décident aussi

- **Le score n'est plus une moyenne simple.** Les compteurs relevés en sélection
  pèsent désormais sur la décision : ramenés à une efficacité, situés parmi les
  athlètes de la campagne, mélangés aux notes selon une part réglable. La sévérité
  propre à chaque évaluateur est corrigée, et un score fondé sur un seul regard est
  amorti. Tout se règle dans `Récap → ⭐ Évaluations → ⚖️ Formule`, et
  **`Moyenne simple` rétablit le calcul d'avant en un bouton**.
- **⚠️ Les scores d'une saison existante changent au premier chargement**, puisque la
  formule par défaut fait peser les statistiques à 50 %. Les notes, les avis et les
  statuts, eux, ne bougent pas : seul le chiffre qui ordonne la liste est recalculé.
  Un club qui veut retrouver exactement ses anciens scores passe par `Moyenne simple`.
- **⚠️ Export CSV** — `Récap → ⭐ Évaluations → 📤 Exporter (CSV)` : les colonnes
  `Evaluations` et `Score` deviennent `Saisies · Notes · Avis · Score ·
  Score_criteres · Score_stats · Corr_severite · Corr_fiabilite · Part_stats`, une
  colonne `Dossard_campagne` s'insère après `Numero`, et une colonne `Eff_<famille>`
  avant les compteurs bruts. Relisez par en-tête, jamais par position.
- **Le dossard de sélection survit au maillot.** Les retenues reçoivent leur numéro
  de saison une fois l'équipe formée ; les écrans d'évaluation affichent alors
  `#12 · dossard 1`, sans quoi le classement du tryout montrerait des numéros que
  personne n'a portés ce jour-là et les commentaires des évaluateurs deviendraient
  illisibles.
- **Une vue sans compteur est enfin possible.** Décocher tous les groupes de
  statistiques les réaffichait tous ; la liste vide est désormais respectée, ce qui
  permet la vue de notes seules que décrit un plan de sélection.
- **« 1/2 avis » ne ment plus.** Un coach de drill qui ne relève que des compteurs
  ne comptait pas moins comme un avis exprimé. Saisies, notes et avis sont maintenant
  comptés séparément, et une athlète dont on n'a que des compteurs se lit « — » au
  lieu d'être classée dernière avec un zéro qu'elle n'a pas mérité.
- **« Depuis la sélection »** : la fiche de saison d'une retenue compare l'efficacité
  relevée au tryout à celle du cumul des matchs, famille par famille.
- **Un tournoi se complète enfin le lendemain.** Le rattachement d'un match à une
  rencontre existante n'était proposé que le jour même : un tournoi saisi le
  lendemain se retrouvait éclaté en autant de rencontres que de tours, alors que
  l'application revendique la distinction entre date de jeu et date de saisie. Les
  tournois de la saison sont désormais proposés, avec leur date, et **un match
  rattaché est daté du jour de sa rencontre**, non du jour de la saisie. Passé le
  jour même, « ➕ Nouvelle rencontre » reste le choix par défaut : rattacher est un
  geste voulu, jamais subi.
- **Un évaluateur ne compte qu'une voix.** Quand la même personne revoit une athlète
  dans la même campagne — deux séances de pratique — son second avis remplace le
  premier au lieu de s'y ajouter. À égalité, le plus récent l'emporte, le badge porte
  un ⚖ et la modale d'application le signale avant d'appliquer. Les notes et les
  compteurs, eux, continuent de s'additionner : ce sont des observations, pas des
  décisions.
- **Tout se fait en lot, dans la liste elle-même.** `☑️ Sélectionner` fait passer
  `🗂️ Base de données` et `📋 Convoquées` en mode sélection : on coche des lignes,
  une barre basse dit ce qu'on peut en faire — `📋 Convoquer`, `📦 Archiver`,
  `↩ Réactiver`, `🗑️ Supprimer` dans la base ; `✕ Retirer de la convocation` dans
  la convocation, avec des raccourcis par statut (`⛔ Non retenue (11)` après un
  tryout). La recherche et le tri restent actifs, et `Tout` ne prend que ce qui est
  affiché. **Les deux modales « en lot » ont disparu avec** : elles demandaient un
  second écran pour choisir dans une liste qu'on avait déjà sous les yeux.
- **Ce qu'un geste emporte est annoncé avant d'agir**, dans la barre à chaque coche
  puis dans la confirmation : retenues qui sortent de l'effectif, athlètes ayant
  déjà joué, compteurs en cours de saisie, vues déjà distribuées, fiches avec un
  historique. Le journal garde une ligne par geste, avec les noms, sous la nature
  🗂️ *Fiches* pour la base et 👥 *Convocation* pour la saison.
- **⚠️ Supprimer une fiche efface désormais tout ce que la phrase annonçait** : la
  fiche, ses convocations dans toutes les saisons, **ses lignes de match** et les
  relevés que les évaluateurs ont faits d'elle. Auparavant les lignes de match
  survivaient et le cumul de la saison continuait d'afficher une « Joueuse » sans
  nom que plus rien ne permettait d'identifier. Pour conserver l'historique sans
  encombrer la liste : `📦 Archiver`, qui se défait.
- **`🗑️ Vider la convocation`** reste à un seul bouton, dans `📋 Convoquées` : c'est
  le geste de la liste montée sur la mauvaise saison, il n'y a rien à y choisir.
- **L'invitation part de la vue, et n'ouvre que celle-là.**
  `🔗 Inviter un sélectionneur` sur la carte d'une vue fait tout d'un geste : la
  personne est créée si besoin, affectée à l'équipe, son jeton émis, la vue publiée
  **à son nom**, et le lien rendu à transmettre. Il fallait auparavant quatre écrans
  — créer, affecter, inviter, puis revenir publier en adressant — et trois occasions
  d'oublier le dernier, celui qui restreint justement ce que le relais remet.
  L'isolement est tenu par le relais, pas par l'application : un paquet adressé n'est
  remis qu'à son destinataire, et deux évaluateurs invités sur deux vues ne voient
  jamais celle de l'autre. Une vue publiée **sans** destinataire reste lisible par
  tout sélectionneur invité de l'équipe — l'écran le dit dès qu'un jeton circule.
- **⚠️ L'invitation aboutit enfin, quel que soit le chemin.** Elle échouait de
  quatre façons, toutes finissant sur le même écran — « Je suis le propriétaire »,
  qui n'est pour personne d'autre que lui :
  - **L'application enregistrait avant d'avoir rien chargé.** Un `saveAll()` part à
    chaque fois que l'onglet passe en arrière-plan — sur un téléphone, dès qu'on
    revient à sa messagerie. Un appareil qui n'avait fait qu'ouvrir l'écran d'accueil
    se retrouvait avec une **base vide sur le disque**, et cette base prenait ensuite
    le pas sur le lien : l'invité était accueilli en propriétaire d'un club qui
    n'existait pas. Plus rien ne s'écrit tant que rien n'est chargé, et une
    invitation l'emporte sur une base où il n'y a personne — ce qui rattrape les
    appareils déjà marqués.
  - **Le lien touché sur une application déjà ouverte ne faisait rien.** Une
    application installée ne s'ouvre pas deux fois : le lien ne change que ce qui
    suit le `#`, et rien ne se rechargeait. Ce changement est désormais entendu.
  - **Un lien coupé en route** renvoyait à la fondation ; il le dit maintenant, et
    mène à l'écran où le recoller.
  - **Sans relais, aucun lien ne peut exister.** Le champ vide et le bouton grisé
    laissaient croire à une panne, et « Copier » recopiait le vide. C'est dit, avec
    le bouton qui mène au relais.
  L'écran d'accueil mène désormais par **✉️ J'ai une invitation** quand le système
  est déjà fondé : la carte du propriétaire ne concerne qu'une personne au monde.
- **⚠️ Une invitation de sélectionneur ne peut plus devenir une administration.**
  Le relais répond « Administrateur » à qui arrive le premier dans un salon sans
  propriétaire — et un salon expire au bout de 120 jours d'inactivité. Une
  sélectionneuse rouvrant son lien après coup se retrouvait alors **administratrice,
  renommée « Administrateur », sans son équipe**. Le lien porte désormais le rôle et
  l'équipe pour lesquels le jeton a été émis, et l'appareil qui rejoint **refuse
  toute réponse qui ne correspond pas** : il affiche « votre invitation est de
  sélectionneur, mais le relais vous répond administrateur » et invite à demander un
  nouveau lien. Les liens émis avant cette version n'annoncent rien : réémettez-les.
- **⚠️ Une vue reçue par relais peut enfin être soumise.** Elle ne retenait pas son
  équipe ; la soumission repartait sans, et le relais la refusait — un jeton de
  sélectionneur ne dépose que pour la sienne. L'équipe est maintenant estampillée à
  la réception, et à défaut celle du jeton fait foi, ce qui rattrape les vues déjà
  reçues.
- **Les groupes se composent sur l'écran de saisie, et suivent la vue.**
  `⚙️ Groupes` : `par 7` fait de 28 athlètes **4 groupes de 7** dans l'ordre des
  numéros, ou `+ Groupe` en crée un qu'on nomme (« Passeuses », « 9 h ») et qu'on
  remplit en touchant les numéros — une puce déjà prise affiche son groupe (`#8 · B`),
  et un numéro n'appartient qu'à un seul. On ne voit ensuite que la vague qui passe,
  avec son avancement (`Groupe B 3/7`), et les flèches du panneau restent dans le
  groupe : « athlète 3/7 », pas 3/28.
  L'entraîneur peut les **préparer avant d'inviter** (`🎯 Ouvrir ici` mène au même
  écran) : ils partent alors dans le paquet et l'invité les retrouve sur son appareil.
  Mais ils **restent à qui évalue** : il les recompose à sa guise, ça tient au
  rechargement, et **une republication n'y touche pas** — elle les recadre simplement
  sur les athlètes encore dans la vue. Sans groupes de son côté, ceux qui arrivent
  avec la vue servent de point de départ.
- **La grille de numéros se replie**, et les athlètes déjà évaluées se masquent.
  Repliée, le panneau de saisie a tout l'écran : sur un téléphone, vingt-huit tuiles
  et un formulaire ne tiennent pas ensemble.
- **La saison n'a plus de catégorie.** Le formulaire en proposait une, et la barre
  de contexte l'affichait — mais une saison est l'axe de temps du club, où les U13
  et les U21 jouent ensemble. Le champ appartenait déjà à l'équipe depuis la v3 : il
  disparaît de la saison, et reste dans `👕 Équipes`. Les bases existantes gardent
  la valeur qu'elles portaient ; elle n'est simplement plus lue ni affichée.
- **Une soumission s'emporte avant la corbeille.** Un bouton `📤` sur chaque carte de
  `🎯 Sélection → 📥 Soumissions` l'enregistre dans un fichier que l'import reprend
  telle quelle, scores compris. La confirmation de suppression dit maintenant ce
  qu'elle fait vraiment : **rien ne ramène une soumission supprimée** — ni un nouveau
  relevé, qui ne redemande que ce qui est plus récent, ni une sauvegarde restaurée,
  qui n'écrase pas une équipe-saison déjà là. Elle nomme le seul recours restant :
  demander à l'évaluateur de soumettre à nouveau.
- **Un onglet `🔢 Numérotation`, pour poser vingt-huit dossards d'une traite.**
  On règle la série qu'on a en main (`du 1 au 28`, devinée de l'effectif si on ne dit
  rien), on touche une athlète, on touche un numéro — et **l'écran passe à la
  suivante sans numéro**. La grille montre toute la série d'un coup d'œil : ce qui
  est libre, et ce qui est pris **avec le nom de qui le porte**. Toucher son propre
  numéro le retire ; toucher un numéro pris **échange** les deux dossards, après
  confirmation. Rien n'est jamais attribué d'office — chaque numéro vient d'un doigt
  sur une tuile — et parce que l'échange remplace l'écrasement, **on ne peut pas y
  créer de doublon**.
- **La base se trie par date de naissance, jour compris.** `👥 Joueuses →
  🗂️ Base de données` propose `A → Z` ou `🎂 Plus âgées d'abord`, un second clic
  inversant le sens. Trier, cocher, `📋 Convoquer` : c'est ainsi qu'on compose une
  catégorie. Une fiche qui ne porte que l'année se range avec son année, après
  celles dont on connaît le jour ; celles qui n'ont ni l'une ni l'autre restent en
  fin de liste, dans les deux sens — on ne leur invente ni un jour, ni un âge.
- **La naissance s'écrit `26/10/2011`, ou `2011` quand le jour n'est pas connu.**
  Dans la fiche (`Date de naissance`) comme dans `⚡ Ajout en lot`, où la ligne
  devient `Prénom Nom [naissance] [dossard]` :

  ```
  Rosalie Béland 26/10/2011 1
  Maëva Côté 2010 2
  Anaïs Lavoie 3
  ```

  Rien n'est deviné à la position : la naissance se reconnaît à sa forme, le dossard
  à la sienne — un à trois chiffres en fin de ligne. Quatre chiffres ne peuvent pas
  être un dossard, un dossard ne peut pas être une année. Une date impossible
  (`31/02`) est refusée sur place, et fait refuser le lot entier en nommant la ligne
  fautive plutôt que d'écrire la moitié des fiches. Les bases existantes gardent leur
  année seule ; l'année reste ce qui décide des catégories et ce qui dédoublonne à la
  fusion d'un export.
- **[`GUIDE.md`](GUIDE.md)** — un guide d'utilisation qui suit une sélection puis une
  demi-saison de bout en bout.

### v6.2 — la réception à trois niveaux, le poste proposé

- **Réception** : un troisième compteur, `rec_err` « Erreur », à côté de *En jeu* et
  *Hors sys.* L'ace subi se compte enfin, et la réception s'aligne sur le service et
  l'attaque, qui avaient déjà leurs trois niveaux.
- **⚠️ Export CSV** — `Récap → ⭐ Évaluations → 📤 Exporter (CSV)` : les colonnes de
  statistiques sont engendrées dans l'ordre des compteurs, donc **`rec_err` s'insère
  au milieu du fichier, entre `rec_out` et `pas_att`**, et deux colonnes
  `Poste_propose` · `Poste_votes` s'ajoutent après les avis. Un tableur qui lisait
  ces colonnes **par position** se décale : relisez-les par en-tête, ou refaites le
  gabarit. Les exports et sauvegardes **JSON** ne bougent pas.
- **Poste proposé** : le sélectionneur peut dire « je pense que la 14 est une
  passeuse ». Les votes sont compilés par joueuse et le poste majoritaire s'affiche
  auprès de l'avis. Le poste du roster n'est jamais écrasé.
- **Cibles tactiles** : les boutons de saisie annonçaient 56 px et n'en faisaient que
  37 — `flex:1` annulait leur hauteur. Ils sont revenus à 56 px, et les rangées de
  notes et d'avis du sélectionneur à 46 px, au-dessus du seuil de 44 px.
- Toute sauvegarde ou soumission antérieure se recharge sans changement : la clé
  `rec_err` naît à 0 et le poste proposé à vide.

---

## Développement

Aucun build. Ouvrez `index.html`, ou servez le dossier pour tester le service worker :

```bash
python3 -m http.server 8899
```

Non-régression : voir [`tests/README.md`](tests/README.md).
