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
  Statistiques      3.00    30 % du score
  Sévérité corrigée +0.15   l'évaluateur notait bas
  Peu de regards    −0.12   2 regards — ramené vers 3.42
  Score retenu      3.70
```

Puis les critères barre par barre — avec l'écart min–max quand les évaluateurs
divergent — et les efficacités relevées, famille par famille.

Ce détail n'est pas décoratif : **un chiffre qui décide d'une sélection doit pouvoir
être défendu** devant l'athlète et ses parents.

---

## 5 · Régler la formule

`📊 Récap → ⭐ Évaluations → ⚖️ Formule`. Le réglage vaut **pour toute la saison** :
comparer septembre à décembre n'a de sens que si les deux sont mesurés pareil.

| Réglage | Effet |
|---|---|
| **Poids des critères** | — (écarté) à ×3 |
| **Part des statistiques** | 0 à 100 %, 30 % par défaut |
| **Poids des familles** | quelles familles de compteurs pèsent |
| **Sévérité** | corriger l'exigence propre à chaque évaluateur |
| **Amortir un score peu observé** | ramener vers la moyenne ce qui repose sur un seul regard |
| **Gestes minimum** | seuil sous lequel une famille n'est pas notée |

**`Moyenne simple`** rétablit le calcul d'avant la v6.3 en un bouton : critères à
poids égal, statistiques à 0 %, aucune correction.

### Ce que les corrections changent, concrètement

Sur le cas joué, trois athlètes étaient à **4,00 partout** sur les critères. Le
classement les départageait par numéro de dossard — c'est-à-dire par hasard. Une
fois les compteurs pris en compte, elles se séparent nettement.

La correction de sévérité compare chaque évaluateur aux autres **sur les athlètes
qu'ils ont vues en commun**, jamais à la moyenne générale : celui qui n'a observé
que les meilleures passerait sinon pour complaisant. Sans recoupement, rien n'est
corrigé.

> **Une limite à connaître.** Le biais est mesuré sur les critères recoupés, puis
> appliqué à toutes les notes de la personne. Quand un coach de drill ne note que la
> Technique, le biais mesuré là déborde sur les autres critères de celui qui les
> note seul. L'effet est amorti, borné et recentré pour ne pas déplacer l'échelle,
> mais il existe. Voir [`AUDIT.md`](AUDIT.md).

---

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
« Rattacher à » propose les tournois récents avec leur date. Le match rattaché est
daté du jour de la rencontre, pas du jour où vous le saisissez — un tournoi joué
samedi et saisi dimanche reste daté de samedi.

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
part des statistiques étant à 30 % par défaut. Notes, avis et statuts ne bougent pas.
`⚖️ Formule → Moyenne simple` rétablit l'ancien calcul.

**Sauvegardez.** `🗓️ Saison → 🗓️ Saisons → 📤 Sauvegarde` avant chaque séance de
sélection. Les données vivent dans le navigateur ; la phrase de passe ne se retrouve pas.
