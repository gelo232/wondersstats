# Rôles et accès — spécification

Document normatif : le code doit s'y conformer. L'analyse détaillée et l'audit qui
l'accompagnent sont dans l'artifact « Rôles et accès WonderStats ».

> **État au moment de la rédaction : rien de ceci n'est implémenté.** La v3.1 ne
> connaît ni personne, ni compte, ni équipe durable. `state.role` est une bascule
> d'interface à deux valeurs. Ce document décrit la cible.

---

## 1. Principes

1. **Le rôle est une arête, pas un attribut.** Une personne n'« est » pas entraîneur :
   elle est entraîneuse *de telle équipe* et éventuellement sélectionneuse *de telle
   autre*. Toute autorisation se lit sur le triplet `(personne, équipe, rôle)`.
2. **L'équipe est durable.** Elle traverse les saisons ; l'affectation d'un entraîneur
   la suit. Le croisement équipe × saison porte le roster, les statistiques et les
   campagnes.
3. **La base de joueuses reste commune au club.** La cloisonner par équipe casserait
   l'identité stable d'une athlète qui change de catégorie. Ce sont les *droits
   d'écriture* qui sont périmétrés, pas les données.
4. **Un sélectionneur ne doit jamais lire l'avis d'un autre.** C'est la seule
   propriété de confidentialité qui a une valeur métier ici ; c'est donc celle qu'il
   faut faire respecter par le relais, pas seulement par l'interface.

---

## 2. Modèle de données cible

```
club
├─ people[]          {id, name, isAdmin, token?}
├─ teams[]           {id, name, category, freeView, createdAt}
├─ assignments[]     {personId, teamId, role}       role ∈ coach | selector
├─ players[]         {id, firstName, lastName, birthYear, notes, archived}
├─ seasons[]         {id, name, category, startDate, endDate, campaigns[], …}
└─ squads[]          {teamId, seasonId,
                      roster[], lineup[], subteams[], stats{}, sessions[],
                      selectorViews[], submissions[]}
```

Trois entités nouvelles (`people`, `teams`, `assignments`) et un déplacement :
`season.teams[]` devient `squads[]`, indexé par `(teamId, seasonId)`.

**Migration** — chaque `season.teams[i]` existant devient une équipe durable plus un
squad. Un administrateur unique est créé et affecté à toutes les équipes trouvées ;
la redistribution est ensuite manuelle.

---

## 3. Matrice des accès

« Entraîneur » désigne toujours l'entraîneur **de l'équipe considérée**.

| Opération | Admin | Entraîneur | Autre entraîneur | Sélectionneur affecté |
|---|:--:|:--:|:--:|:--:|
| Créer, renommer, supprimer une équipe | ● | ○ | ○ | ○ |
| Affecter un entraîneur ou un sélectionneur | ● | ◐ ᵃ | ○ | ○ |
| Ouvrir une saison, ouvrir ou clore une campagne | ● | ● | ○ | ○ |
| Créer une athlète dans la base du club | ● | ● | ● | ○ |
| Modifier la fiche d'une athlète | ● | ◐ ᵇ | ○ | ○ |
| Supprimer une athlète de la base du club | ● | ○ | ○ | ○ |
| Convoquer, numéroter, positionner, statuer | ● | ● | ○ | ○ |
| Saisir un match, enregistrer une session | ○ | ● | ○ | ○ |
| Consulter le roster **nominatif** | ● | ● | ○ | ○ |
| Consulter le catalogue **par numéros** | ● | ● | ○ | ● |
| Composer une vue sélectionneur | ● | ● | ○ | ◐ ᶜ |
| Évaluer et soumettre | ○ | ◐ ᵈ | ◐ ᵈ | ● |
| Lire les soumissions d'autrui | ● | ● | ○ | ○ |
| Compilation, progression, application des avis | ● | ● | ○ | ○ |
| Exporter les données de son équipe | ● | ● | ○ | ○ |
| Consulter le journal de son équipe | ● | ● | ○ | ○ |
| Consulter le journal du club | ● | ○ | ○ | ○ |
| Sauvegarde complète du club, restauration | ● | ○ | ○ | ○ |
| Configurer le relais et le salon | ● | ○ | ○ | ○ |
| Inviter un sélectionneur (lien, jeton) | ● | ● | ○ | ○ |

● autorisé · ◐ sous condition · ○ refusé

- **ᵃ** un entraîneur invite un sélectionneur sur son équipe, mais ne nomme pas d'entraîneur.
- **ᵇ** seulement pour une athlète actuellement convoquée dans son équipe.
- **ᶜ** seulement si l'équipe est en *vue libre*, et seulement pour ses propres vues.
- **ᵈ** en agissant explicitement dans son contexte de sélectionneur, sur une équipe où il est affecté comme tel.

L'administrateur ne saisit pas les matchs et n'évalue pas : ce sont des actes de
terrain qui engagent leur auteur. Il peut tout lire et tout réparer.

---

## 4. Niveaux d'application

| Niveau | Ce qu'il apporte | Coût | Garantie |
|---|---|---|---|
| 0 — actuel | rien | nul | aucune |
| **1 — rôles côté client** | personnes, équipes, affectations, sélecteur de contexte | moyen, sans infrastructure | ergonomique : évite l'erreur, pas l'intention |
| **2 — jetons sur le relais** | dépôts adressés, `list` filtré par jeton, soumissions signées | modéré, le relais existe | réelle sur le réseau |
| 3 — comptes et serveur | autorisation vérifiée à chaque requête | élevé, change l'architecture | complète |

**Retenu : 1 puis 2.** Ensemble ils couvrent le besoin exprimé et ferment la seule
fuite qui compte — un sélectionneur ne doit pas lire l'avis de ses collègues — sans
renoncer au fonctionnement hors-ligne ni introduire de comptes.

Le niveau 3 ne se justifierait que si le club devait répondre de la confidentialité
de données de mineures devant un tiers.

---

## 5. Contrat de relais (niveau 2)

Toute requête porte un `token`. Le **premier jeton présenté sur un salon vierge en
devient propriétaire** — c'est l'amorçage, il n'y a personne d'autre pour
l'autoriser.

```
GET  {url}?action=ping&room=R
GET  {url}?action=whoami&room=R&token=T        -> {ok, grant, isOwner}
GET  {url}?action=list&room=R&token=T&kind=...&since=...&teamId=...
POST {url}?action=publish   {room, token, kind, id, teamId, to?, payload}
POST {url}?action=grant     {room, token, grant:{token, name, role, teamId, teamName}}
POST {url}?action=revoke    {room, token, target}
```

`kind` vaut `packet` (une vue), `catalog` (le roster d'une équipe : numéros et
postes) ou `submission`.

**Ce que le relais autorise**

| Porteur | publish | list |
|---|---|---|
| propriétaire / admin | tout | tout |
| entraîneur de T | `packet`, `catalog` sur T | les `submission` de T, et ses propres dépôts |
| sélectionneur de T | `submission` sur T | les `catalog` de T, et les `packet` non adressés ou qui lui sont adressés |

Trois conséquences, vérifiées par `tests/sync.js` :

1. **un sélectionneur ne lit jamais une `submission`**, la sienne comprise ;
2. une vue déposée avec `to = jeton` n'est lisible que par son destinataire ;
3. le champ `by` d'un dépôt est **estampillé par le relais**, jamais fourni par
   l'appelant : `selectorName` cesse d'être du texte libre (constat R8).

Les jetons sont émis à l'invitation (lien personnel `#s=`) et révocables. Ils ne
remplacent pas une authentification : ils empêchent la lecture croisée, ce qui
est l'objectif.

Deux implémentations conformes sont fournies : `server/worker.js` (Cloudflare) et
`server/apps-script.gs` (Google).

---

## 6. Journal des décisions

Sont enregistrés les actes qui engagent — un statut tranché, une soumission
supprimée, une clôture, une affectation, un jeton — et rien d'autre : un journal
qui note chaque frappe ne se relit pas.

Chaque entrée fige le **nom de son auteur** et le **numéro de l'athlète** tels
qu'ils étaient au moment des faits ; un renommage ultérieur ne réécrit rien. Les
entrées ne sont ni modifiables ni supprimables depuis l'interface, et les 500
dernières sont conservées.

Périmètre : un entraîneur consulte le journal de son équipe, l'administrateur
celui du club. L'export d'équipe emporte le journal correspondant.

> Le journal **documente, il ne prouve pas**. Il est écrit par l'appareil qui
> agit et reste modifiable depuis la console, comme le reste des données locales.

---

## 6 bis. Ce que le verrou change — et ce qu'il ne change pas

Depuis la v5.1, l'application s'ouvre sur un écran de garde et chiffre les données
du club au repos (AES-GCM 256, clé dérivée par PBKDF2-SHA256).

**Ce que cela corrige.** Ouvrir l'adresse publique donnait l'administration :
`loadAll` désignait d'office le premier administrateur trouvé, en fabriquait un si
la base n'en avait pas, et la migration en créait un nommé « Administrateur ».
Plus rien de tout cela. L'identité se réclame, elle ne s'hérite pas.

**Ce que cela protège vraiment.** Le vol de l'appareil, et la lecture de
`localStorage` par un tiers. Sans la phrase, le contenu est du bruit. Le jeton
GitHub est protégé de la même façon.

**Ce que cela ne protège toujours pas, et qu'il ne faut pas prétendre.** La matrice
d'accès du §4 reste appliquée côté client. Qui connaît la phrase ouvre le coffre, et
qui ouvre le coffre peut modifier le code de la page qu'il exécute. La phrase de
passe contrôle **l'entrée dans l'application**, pas ce qu'un utilisateur légitime
peut faire une fois entré. Le §7 reste donc valable mot pour mot.

Seul le relais autorise réellement, parce qu'il s'exécute ailleurs que dans le
navigateur de celui qu'il contrôle. C'est aussi pourquoi les sélectionneurs ne
passent pas par GitHub : un droit d'écriture sur le dépôt emporterait la lecture de
toutes les soumissions.

## 7. Ce qu'il ne faut pas écrire

Tant que le niveau 3 n'existe pas, aucun texte d'interface ni de documentation ne
doit présenter **les rôles** comme une protection. Formulations à proscrire :
« accès sécurisé », « données protégées », « seul l'entraîneur peut voir ».
Formulation juste : « chacun voit ce qui le concerne ».

Le chiffrement au repos, lui, est réel et peut être décrit comme tel : « les données
de cet appareil sont chiffrées », « sans la phrase, elles sont illisibles ». La
frontière est nette, et il faut s'y tenir :

| On peut écrire | On ne peut pas écrire |
|---|---|
| Les données de cet appareil sont chiffrées | Les données sont protégées |
| Sans la phrase, elles sont illisibles | L'accès est sécurisé |
| Chacun voit ce qui le concerne | Seul l'entraîneur peut voir les évaluations |
| Le relais ne restitue à chacun que ce qui lui est destiné | Les rôles empêchent la consultation |

La phrase de passe contrôle **l'entrée**. Elle ne dit rien de ce qu'un utilisateur
légitime peut faire une fois entré, et le prétendre serait mentir à un club qui
manipule des données d'enfants.
