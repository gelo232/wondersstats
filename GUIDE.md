# Guide d'utilisation — une sélection, puis une demi-saison

Ce guide suit un cas réel de bout en bout : la sélection U14 féminin de septembre,
la constitution de l'équipe, le second regard sur les recallées, puis le suivi
jusqu'à la mi-saison de décembre. Chaque écran est décrit au moment où l'on s'en
sert, et non dans l'ordre des menus.

Il complète le [`README`](README.md), qui décrit ce que fait l'application ; ici,
on la fait fonctionner.

**Le cas** — 10 athlètes, dossards 1 à 10. Deux évaluateurs : *Willy*, qui tranche,
et *Brittany*, coach de drill, qui compte. Objectif de la journée : retenir 5,
recaller 2, écarter 3.

---

## 1 · La veille — le terrain administratif

Rien de ce qui suit ne peut se faire dans le gymnase. Faites-le la veille.

### La saison et la campagne

`🗓️ Saison → 📅 Campagnes`. Une saison neuve porte déjà une campagne ; renommez-la
en **« Sélection U14 — sept. 2026 »** et donnez-lui le type 🎯 *Sélection*.

> **Pourquoi le type compte.** La campagne de type *Sélection* devient la **base de
> référence** de toute la saison : c'est à elle que le suivi de chaque athlète
> retenue se comparera. Si vous la laissez en « Ponctuelle », vous perdez cette
> lecture.

### Les athlètes et les dossards

`👥 Joueuses → ⚡ Ajout en lot`. Une athlète par ligne, le dossard en fin de ligne :

```
Rosalie Béland 1
Maëva Côté 2
Anaïs Lavoie 3
…
```

Le numéro est facultatif dans ce champ, mais **c'est la seule chose que verront vos
évaluateurs**. Un numéro manquant ou en double s'affiche en rouge dans
`🗓️ Saison → 🎯 Sélection`, avec un bandeau d'avertissement. Corrigez-les là,
directement dans la case de gauche, avant de composer les vues.

L'ajout en lot n'interdit pas les doublons — il les signale après coup. Sur 28
dossards, vérifiez le bandeau avant de partir.

### Changer un numéro en cours de route

**Oui, à tout moment, et sans rien perdre.** Une athlète est identifiée par sa fiche,
jamais par son numéro : renuméroter conserve ses évaluations, ses avis reçus, ses
statistiques de match, sa progression entre campagnes et sa base de sélection. Le
changement est inscrit au journal (`🗓️ Saison → 📜 Journal`, entrée 🔢 *Numéros*).

Ce qui suit le nouveau numéro : les classements, les fiches, les exports CSV, et une
vue ouverte sur place par `🎯 Ouvrir ici`.

> **Le seul piège : les vues déjà distribuées.** Un paquet publié par relais ou
> exporté en fichier emporte les numéros du moment — c'est ce qui le rend lisible
> hors-ligne. Renuméroter après coup ne le rattrape pas : le sélectionneur verrait
> l'ancien numéro sur son écran et le nouveau sur le dossard. L'application vous
> avertit alors, et il suffit de **republier la vue**.

Corrigez donc les dossards **avant** de distribuer les vues, pendant la préparation.


### Les postes du roster

Toujours dans `🎯 Sélection`, dépliez une athlète pour lui donner sa position. Ce
poste est celui de **l'entraîneur** ; l'avis des évaluateurs ne l'écrasera jamais.

---

## 2 · Composer les vues des évaluateurs

`🎯 Sélection → + Nouvelle vue`. Une vue par personne qui saisit.

Chaque vue se règle sur quatre points :

| Réglage | Ce qu'il décide |
|---|---|
| **Athlètes** | qui cette personne observe |
| **Critères** | ce qu'elle note, de 1 à 5 |
| **Groupes de statistiques** | ce qu'elle compte |
| **Anonymat** | numéro seul, ou numéro + nom |

**La vue de l'évaluateur** — les 5 critères, les familles de compteurs du jeu, et
le poste proposé. Nominative si la personne connaît déjà le groupe, anonyme en
sélection pure.

**La vue d'un coach de drill** — un seul critère (Technique, souvent) et les
familles qu'il anime. Anonyme : il n'a pas à savoir qui il note.

> **Décocher tous les groupes est un choix valide** : vous obtenez une vue de notes
> seules, sans aucun compteur. C'est utile quand une personne ne fait que juger.
> Décochez, et la vue n'affichera rien d'autre que les notes.

Une même athlète peut figurer dans plusieurs vues, et c'est le cas normal : Willy
et Brittany voient les dix.

---

## 3 · Pendant la séance — qui saisit quoi

`🎯 Ouvrir ici` passe l'appareil en mode évaluateur sur cette vue. (Sur trois
appareils, configurez le relais et utilisez `📡 Publier` ; hors-ligne,
`📤 Fichier`.)

L'écran présente les dossards en tuiles. Une tuile ouvre le panneau de l'athlète :

1. **Évaluation** — les critères, de 1 à 5. Un critère non touché reste *non noté*
   et n'entre dans aucune moyenne. Ce n'est pas un zéro.
2. **Statistiques observées** — des compteurs qu'on incrémente au fil de l'action,
   avec un `−` pour corriger. Ce ne sont pas des notes : on compte des gestes.
3. **Recommandation** — ✅ Retenir · 🔁 Recaller · ⛔ Non retenue.
4. **Poste proposé** — facultatif, et c'est un avis.
5. **Commentaire** — une phrase, rédigée pour pouvoir être lue telle quelle à
   l'athlète ou à ses parents.

Puis `📤 Soumettre la vue`, avant de quitter le gymnase.

> **Les compteurs comptent.** Depuis la v6.3, ce que l'évaluateur relève pèse sur la
> décision, aux côtés des notes. Voir §5.

---

## 4 · Lire le classement

Retour en entraîneur : `📊 Récap → ⭐ Évaluations`.

Le bandeau rappelle la campagne lue et le nombre de soumissions. **Les campagnes ne
se mélangent jamais** — un onglet « Toutes » existe, il vous avertit qu'il mêle des
moments différents.

Chaque ligne porte :

```
 3.8   #1 Rosalie Béland          OH 1/1   ✅ 1/1   ▾
       2 notes · Willy, Brittany
```

- le **score**, de 1 à 5 — ou `—` si personne ne l'a notée ;
- le nombre de **notes**, et les relevés de compteurs comptés à part ;
- le **poste** majoritaire proposé, et l'**avis** majoritaire.

Le dénominateur des avis ne compte que ceux qui se sont prononcés. Un coach de drill
qui n'a relevé que des compteurs n'y figure pas : « ✅ 1/1 » veut dire *une personne
s'est prononcée, et elle dit oui*.

### D'où vient le score

Dépliez une ligne. Le premier bloc détaille le calcul :

```
D'OÙ VIENT LE SCORE
  Critères          4.00    à poids égal
  Statistiques      3.00    50 % du score
  Sévérité corrigée +0.15   l'évaluateur notait bas
  Peu de regards    −0.12   2 regards — ramené vers 3.42
  Score retenu      3.70
```

Puis les critères barre par barre — avec l'écart min–max quand les évaluateurs
divergent — et les efficacités relevées, famille par famille.

Ce détail n'est pas décoratif : **un chiffre qui décide d'une sélection doit pouvoir
être défendu** devant l'athlète et ses parents.

---

<a id="formule"></a>

## 5 · Régler la formule du score

### Où la trouver

Deux chemins mènent au même écran :

| Chemin | Quand l'utiliser |
|---|---|
| `🗓️ Saison → 📅 Campagnes → ⚖️ Régler` | **avant la séance**, en préparant la campagne |
| `📊 Récap → ⭐ Évaluations → ⚖️ Formule` | une fois les évaluations reçues, pour ajuster |

La carte du premier écran affiche en permanence la formule en vigueur, sans
avoir à ouvrir quoi que ce soit :

```
Formule du score, pour toute la saison          ⚖️ Régler
Score : critères 50 % · statistiques 50 % ·
sévérité des sélectionneurs corrigée · amorti
selon le nombre de regards.
```

> **Réglez-la avant la séance.** La formule décide de ce sur quoi la sélection se
> jouera ; la découvrir une fois les notes tombées, c'est la découvrir trop tard.

### Sa portée : une équipe, une saison, toutes ses campagnes

| | Même formule ? |
|---|---|
| Deux **campagnes** d'une même équipe-saison — sélection de septembre et bilan de mai | **oui**, toujours |
| Deux **équipes** de la même saison — U14 et U16 | **non**, chacune la sienne |
| La **même équipe** d'une saison à l'autre — U14 2026 et U14 2027 | **oui**, elle est reprise |

Comparer septembre à décembre n'aurait aucun sens si les deux étaient mesurés
autrement : c'est pourquoi la formule ne se règle pas par campagne. Changer la
formule recalcule aussitôt tous les scores de la saison — les notes, les avis et les
statuts, eux, ne bougent jamais.

**La formule suit l'équipe d'une saison à l'autre.** Un club qui a décidé du poids
de ses critères ne le redécide pas chaque septembre, et la comparaison avec la
saison passée reste valable. Seul le réglage est repris : le roster, les campagnes,
les vues et les matchs naissent vierges — c'est une nouvelle saison.

Une **équipe créée après coup** part, elle, des valeurs par défaut : elle n'a pas de
passé dont hériter.

**Ce qui reste propre à chaque campagne**, même avec des réglages partagés : les
efficacités sont situées parmi les athlètes *de cette campagne*, la correction de
sévérité se mesure sur les recoupements *de cette campagne*, et l'amortissement
ramène vers la moyenne *de cette campagne*. Les réglages sont communs ; les calculs,
eux, ne se mélangent jamais d'un moment à l'autre.

### Comment le score se construit

```
        notes des critères            compteurs relevés
                │                            │
                ▼                            ▼
   ① sévérité de l'évaluateur      ③ efficacité par famille
          corrigée                          │
                │                    ④ notée de 1 à 5 parmi
   ② moyenne pondérée                 les athlètes de la campagne
      des critères                           │
                └──────────┬─────────────────┘
                           ▼
              ⑤ mélange selon la part des statistiques
                           ▼
              ⑥ amortissement si peu de regards
                           ▼
                      SCORE RETENU
```

Les six réglages ci-dessous agissent chacun sur une de ces étapes.

---

### ① Poids des critères

Cinq lignes — Technique, Physique, Lecture du jeu, Attitude, Potentiel — chacune
réglable sur quatre crans :

| Cran | Effet |
|---|---|
| **—** | le critère est **écarté** du score (il reste noté et affiché) |
| **×1** | poids normal *(défaut)* |
| **×2** | compte double |
| **×3** | compte triple |

Le score des critères est leur **moyenne pondérée** : `Σ(poids × note) ÷ Σ(poids)`.
Seuls les critères effectivement notés entrent au calcul.

> **Exemple.** Une athlète notée Technique 3, Physique 4, Lecture 5, Attitude 4,
> Potentiel 3.
> À poids égal : `(3+4+5+4+3)÷5 = 3,80`.
> Avec Lecture ×3 et Potentiel ×2 : `(3+4+15+4+6)÷(1+1+3+1+2) = 32÷8 = 4,00`.

**Quand y toucher.** Une sélection de passeuses met Lecture du jeu à ×2 ou ×3. Un
camp de développement met Potentiel à ×2. Une journée qui n'a pas permis de juger le
physique met Physique à **—** plutôt que de laisser une note molle peser.

---

### ② Part des statistiques

Un curseur de **0 à 100 %**, à **50 % par défaut**.

```
score = (1 − part) × score des critères  +  part × score des statistiques
```

| Réglage | Ce que ça veut dire |
|---|---|
| **0 %** | seules les notes comptent — le calcul d'avant la v6.3 |
| **50 %** | *(défaut)* ce qu'on a vu et ce qu'on a compté pèsent pareil |
| **100 %** | seuls les compteurs comptent, les notes deviennent indicatives |

> **Exemple.** Critères 4,00 · statistiques 3,00.
> À 0 % → **4,00** · à 30 % → **3,70** · à 50 % → **3,50** · à 100 % → **3,00**.

**Deux cas où la part est ignorée**, et c'est voulu :

- une athlète **notée mais sans compteur exploitable** garde son score de critères
  entier — on ne la pénalise pas d'un volume qu'on n'a pas relevé ;
- une athlète **avec des compteurs mais aucune note** est jugée sur ses seuls
  compteurs, et son score reste lisible plutôt que de tomber à zéro.

---

### ③ Poids des familles de compteurs

Sept lignes — Services, Réception, Passes, Attaques, Blocs, Défense, Habiletés — sur
la même échelle **—** / ×1 / ×2 / ×3.

Chaque famille est d'abord ramenée à une **efficacité** entre −1 et +1 :

| Famille | Compte pour | Compte contre | Neutre |
|---|---|---|---|
| Services | Ace | Erreur | En jeu |
| Réception | En jeu | Erreur | Hors sys. |
| Passes | Attaquable | Hors sys. | |
| Attaques | Kill | Erreur | Réussie |
| Blocs | Kill, Solo, Aide | Erreur | |
| Défense | Réussie, Soutien | Sout. err. | Hors sys. |
| Habiletés | Contrôlée, Avec appel, Couverture | *(rien)* | |

`efficacité = (gestes positifs − gestes négatifs) ÷ total des gestes de la famille`

> **Exemple.** 7 kills, 4 réussies, 2 erreurs → `(7−2) ÷ 13 = +0,38`.

**Habiletés n'a pas de geste manqué** : son efficacité mesure un volume propre, pas
un rendement. Beaucoup de clubs la mettent à **—**.

**Le cas du libéro.** Une libéro n'attaque pas : dans une formule où toutes les
familles pèsent pareil, ses quelques attaques la desservent. Pour une campagne
centrée sur la défense, mettez Attaques et Blocs à **—**, ou Réception et Défense à
×2. L'application ne le fait pas d'elle-même — c'est une décision de club.

---

### ④ Sévérité des évaluateurs

Un interrupteur, **activé par défaut**.

Deux personnes n'ont pas la même main. L'application compare chaque évaluateur aux
autres **sur les athlètes qu'ils ont vues en commun** — jamais à la moyenne
générale, qui ferait passer pour complaisant celui qui n'a observé que les
meilleures — et retire l'écart qui lui est propre.

**Sans effet dans trois cas** : un seul évaluateur ; aucune athlète vue par deux
personnes ; des évaluateurs qui notent déjà pareil.

> **Exemple.** Willy et Brittany voient les mêmes dix athlètes, Brittany note
> systématiquement un point plus bas. La correction ramène les deux sur une échelle
> commune, et le classement cesse de dépendre de qui a vu qui.

Le min–max affiché à côté de chaque critère montre toujours les **notes réellement
mises** : la correction ajuste la moyenne, elle n'efface pas le désaccord.

> **Une limite à connaître.** Le biais est mesuré sur les critères recoupés, puis
> appliqué à toutes les notes de la personne. Quand un coach de drill ne note que la
> Technique, le biais mesuré là déborde sur les autres critères. L'effet est amorti
> selon le nombre de recoupements, borné à ±1,5 et recentré pour ne pas déplacer
> l'échelle — mais il existe. Voir [`AUDIT.md`](AUDIT.md).

---

### ⑤ Amortir un score peu observé

Quatre crans : **—** / ×1 *(défaut)* / ×2 / ×3.

Un score tiré d'un seul regard est ramené vers la moyenne du groupe, à proportion du
peu sur quoi il repose :

```
score final = (n × score + K × moyenne du groupe) ÷ (n + K)
```
où `n` est le nombre d'évaluateurs qui ont **noté** l'athlète, et `K` le cran choisi.

| Cran | Une athlète vue 1 fois | Vue 2 fois | Vue 3 fois |
|---|---|---|---|
| **—** | aucun amortissement | — | — |
| **×1** | 50 % de son score, 50 % de la moyenne | 67 % / 33 % | 75 % / 25 % |
| **×2** | 33 % / 67 % | 50 % / 50 % | 60 % / 40 % |

> **Ce que ça évite.** Une athlète vue par un seul évaluateur généreux coiffait
> celles que trois personnes avaient jugées. Elle ne le peut plus.

**Quand toutes les athlètes sont vues autant de fois, ce réglage ne change aucun
classement** — il ne fait que resserrer l'échelle. Il n'agit que sur les écarts de
nombre de regards.

Mettez **—** si chaque athlète est vue par le même nombre de personnes et que vous
préférez des scores non tassés.

---

### ⑥ Gestes minimum par famille

De **0 à 10**, à **5 par défaut**.

En dessous de ce seuil, l'efficacité d'une famille **n'est pas notée** : six services
ne disent rien, et une efficacité tirée de deux gestes serait du bruit. La famille
est alors marquée « trop peu » dans le détail et ne pèse pas.

Montez-le à 8 ou 10 pour une longue séance où chacune touche beaucoup de ballons ;
descendez-le à 3 pour un format court où les volumes sont faibles.

---

### Le bouton `Moyenne simple`

En bas de la modale. Il remet d'un coup :

- tous les critères à ×1 ;
- la part des statistiques à **0 %** ;
- la sévérité **désactivée** ;
- l'amortissement à **—**.

C'est **exactement** le calcul d'avant la v6.3. Utilisez-le si les scores de vos
saisons passées doivent rester ceux que vos coachs connaissent.

---

### Trois réglages types

| | Sélection classique | Journée très comptée | Bilan qualitatif |
|---|---|---|---|
| **Part des statistiques** | 50 % | 70 % | 20 % |
| **Poids des critères** | tous ×1 | tous ×1 | Lecture ×2, Attitude ×2 |
| **Familles** | Habiletés — | toutes ×1 | Habiletés — |
| **Sévérité** | activée | activée | activée |
| **Amortissement** | ×1 | ×1 | ×2 |
| **Gestes minimum** | 5 | 8 | 3 |

---

### Vérifier l'effet de son réglage

Ne réglez pas à l'aveugle. Après chaque changement, **dépliez une ligne du
classement** : le bloc « D'où vient le score » montre la part des critères, celle
des statistiques, ce que la sévérité a déplacé et ce que l'amortissement a retiré.

Le bandeau au-dessus de la liste rappelle en permanence la formule en vigueur :

```
Score : critères 50 % · statistiques 50 % · sévérité des sélectionneurs
corrigée · amorti selon le nombre de regards.
```

Toute modification est inscrite au **journal des décisions**
(`🗓️ Saison → 📜 Journal`, entrée 🎚️ *Formule*) : on sait qui a changé quoi, et quand.

---

<a id="equipes"></a>

## 5bis · Ce qui appartient à quoi

Une question revient dès qu'un club gère plus d'une équipe : **qu'est-ce qu'une
nouvelle équipe emporte avec elle ?** Tout, sauf les joueuses.

### Chaque équipe-saison a son propre lot

Créez une équipe U16 à côté de vos U14, et elle arrive avec :

| Ce qu'elle a en propre | À la création |
|---|---|
| **Roster** — qui est convoqué, les dossards, les postes, les statuts | vide |
| **Campagnes** d'évaluation | une, nommée *Sélection* |
| **Vues sélectionneur** et **soumissions** | aucune |
| **Rencontres** et **matchs** | aucun |
| **Formule du score** | valeurs par défaut |
| **Effectif**, composition de terrain, sous-équipes | vide |

Rien ne déborde d'une équipe sur l'autre. Régler les U14 à 80 % de statistiques
laisse les U16 à 50 %. Convoquer une athlète chez les U14 ne la convoque pas chez
les U16. Une campagne *Sélection* ouverte chez les unes n'existe pas chez les autres.

### Ce qui est commun au club

| Ce qui est partagé | Portée |
|---|---|
| **Base de joueuses** | tout le club, toutes saisons |
| **Personnes et rôles** — entraîneurs, sélectionneurs | le club |
| **Catégories** (U12, U14…) | le club |
| **Relais de synchronisation** | le club |
| **Journal des décisions** | le club, filtrable par équipe |

La **base de joueuses est commune** : une athlète qui passe des U14 aux U16 garde sa
fiche, son historique et ses évaluations passées. C'est elle qu'on convoque dans
l'une ou l'autre équipe, jamais un doublon.

### D'une saison à l'autre

Pour une **équipe qui existait déjà**, la nouvelle saison reprend **la formule du
score**, et rien d'autre : roster, campagnes, vues et matchs repartent de zéro. Si
vous voulez aussi reprendre l'effectif, `🗓️ Saison → 🗓️ Saisons → + Nouvelle saison`
propose **« reprendre l'effectif d'une saison précédente »** — les joueuses
reviennent au statut *Candidate*, avec leur numéro et leur position, à
re-sélectionner.

```
Nouvelle saison d'une équipe existante
  ├── formule du score ........ reprise
  ├── effectif ................ sur demande, au statut Candidate
  └── campagnes, vues,
      soumissions, matchs ..... vierges
```


## 6 · Trancher

`🗓️ Saison → 🎯 Sélection`. Les athlètes y sont classées par score, les non notées
en fin de liste.

Trois boutons par ligne : ✅ 🔁 ⛔. Ou, pour aligner d'un coup sur les avis reçus :
**`⚡ Appliquer les avis`**. La modale liste chaque changement avant de l'appliquer —
lisez-la, c'est le dernier moment où la décision est réversible sans trace.

> **Le score ordonne, il ne tranche pas.** Le statut vient des avis ou de votre main,
> jamais du chiffre. Il est normal qu'une recallée devance une retenue au classement :
> ce sont deux lectures différentes.

**Un évaluateur ne compte qu'une voix**, celle de son dernier avis. S'il revoit une
athlète à une seconde séance, sa nouvelle parole remplace l'ancienne. Quand les avis
se partagent, le badge porte un ⚖ et c'est le plus récent qui l'emporte — la modale
vous le signale avant d'appliquer.

### Composer l'équipe

`👕 Composer l'équipe` verse toutes les **Retenues** dans l'effectif de la saison.
C'est ce qui rend la saisie de match possible : seules les joueuses de l'effectif
apparaissent dans `✏️ Saisie`.

---

## 7 · Le second regard sur les recallées

Les recallées ne sont ni prises ni écartées : elles attendent une seconde séance.

1. `🗓️ Saison → 📅 Campagnes → + Nouvelle campagne`. Type *Ponctuelle*, nom
   **« Second regard — oct. 2026 »**. Elle devient active.
2. `🎯 Sélection → + Nouvelle vue` : ne cochez que les recallées.
3. Une vue par séance de pratique — les notes des deux séances s'additionnent,
   mais l'avis de la seconde remplace celui de la première.
4. Évaluez, soumettez, puis `⚡ Appliquer les avis`.

Les recallées retenues rejoignent l'équipe par `👕 Composer l'équipe` ; les autres
passent en ⛔.

> **Pourquoi une campagne séparée** et non la même qu'en septembre : les moyennes ne
> se mélangent pas, et vous pourrez lire la progression de l'une à l'autre.

---

## 8 · La saison — rencontres et cumul

### Enregistrer un match

`✏️ Saisie` — une joueuse, ses compteurs. Puis `💾 Enregistrer le match`.

La modale demande la **nature** (🏆 Championnat · 🎪 Tournoi · 🤝 Amical ·
🎽 Entraînement), le nom de la rencontre, l'adversaire **de ce match**, la date
réelle et le lieu. Les sets sont facultatifs ; l'issue (V/D/N) s'en déduit.

**Un tournoi se saisit une fois puis se complète.** Au match suivant, le champ
« Rattacher à » propose les tournois de la saison avec leur date. Le match rattaché
est daté du jour de la rencontre, pas du jour où vous le saisissez — un tournoi joué
samedi et saisi dimanche reste daté de samedi.

Le jour même, le tournoi en cours est proposé d'emblée. Les jours suivants, il reste
dans la liste mais « ➕ Nouvelle rencontre » redevient le choix par défaut : on
rattache parce qu'on le veut, jamais par inadvertance.

Chaque match d'un tournoi garde **son propre adversaire** : la question se repose à
chaque tour.

### Lire le cumul

`📊 Récap → 🌐 Cumul` compose trois axes : la **nature**, la **rencontre**, et la
**fenêtre** (toute la saison, 3, 5 ou 10 derniers matchs). Le bandeau rappelle en
clair ce qui est cumulé.

`÷ Par match` divise par le nombre de matchs joués par chacune : une titulaire à 8
matchs et une arrivante à 1 deviennent comparables.

`📊 Récap → 🏐 Rencontres` regroupe les matchs sous leur rencontre et affiche le
bilan décliné par nature.

---

## 9 · La mi-saison

### Réévaluer

Nouvelle campagne, type 📈 *Mi-saison*. Puis, au choix :

- **`🔁 Réévaluer`** sur une vue existante — elle est dupliquée dans la nouvelle
  campagne avec des données **vierges**. Aucune note périmée ne peut être resoumise
  par inadvertance.
- ou une vue neuve sur l'effectif (`L'équipe` coche les joueuses retenues).

### Lire la progression

`📊 Récap → ⭐ Évaluations → 📈 Progression`, dès qu'il existe deux campagnes avec
des soumissions. Choisissez « De » et « À » : l'écart s'affiche globalement et
critère par critère. Une athlète n'apparaît avec un écart que si elle a été évaluée
**dans les deux**.

### Depuis la sélection

Dépliez une athlète dans `🗓️ Saison → 🎯 Sélection`. Sous son cumul de matchs, le
bloc **« Depuis la sélection »** met face à face ce qu'elle valait au tryout et ce
qu'elle vaut aujourd'hui :

```
                sélect.   saison    écart
Réception        +0,73     +0,58    −0,15
Attaques         +0,38     +0,49    +0,11
```

La comparaison porte sur les **efficacités**, jamais sur les volumes : une séance de
sélection et vingt matchs ne se comparent pas en nombre de gestes. Une famille
absente d'un côté se lit `—` plutôt que zéro — ne pas avoir servi n'est pas avoir
mal servi.

---

## 10 · Ce qui se passe mal, et ce qu'il faut savoir

**Les statuts et l'effectif sont deux axes distincts.** Une joueuse blessée ou partie
conserve son statut *Retenue*, ses matchs joués et son cumul ; seule son appartenance
courante change. On ne réécrit pas l'histoire d'une athlète.

**Une athlète non notée n'est pas une athlète à zéro.** Si l'on n'a d'elle que des
compteurs, son score se lit `—` et elle se range après les athlètes notées, jamais
sous elles.

**Une famille à faible volume n'est pas notée.** Six services ne disent rien. Le seuil
se règle dans `⚖️ Formule`.

**L'échelle des statistiques est relative à la campagne.** Une efficacité est située
parmi les athlètes du même moment, pas contre un barème absolu — c'est ce qui permet
de servir une U13 et une senior sans réglage. En contrepartie, un score statistique
n'est pas comparable d'une campagne à l'autre si les groupes diffèrent entièrement.

**Un groupe sans dispersion donne 3 à tout le monde.** C'est voulu : si toutes
réussissent autant, la famille ne départage rien.

**Les scores d'une saison antérieure à la v6.3 changent au premier chargement**, la
part des statistiques étant à 50 % par défaut. Notes, avis et statuts ne bougent pas.
`⚖️ Formule → Moyenne simple` rétablit l'ancien calcul.

**Sauvegardez.** `🗓️ Saison → 🗓️ Saisons → 📤 Sauvegarde` avant chaque séance de
sélection. Les données vivent dans le navigateur ; la phrase de passe ne se retrouve pas.
