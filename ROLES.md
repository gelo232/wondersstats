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

## 5. Évolution du contrat de relais (niveau 2)

Aujourd'hui les dépôts sont rangés sous `{salon}/{type}/{id}` et `list` renvoie
**tout** ce qui porte ce préfixe. Cible :

```
{salon}/{jeton}/{type}/{id}
```

- `publish` exige un `token` valide ; le dépôt est rangé sous ce jeton.
- `list` ne renvoie que ce qui est **destiné** au porteur du jeton : ses vues, et
  pour un entraîneur les soumissions de son équipe.
- une soumission porte l'identité du jeton — le champ `selectorName` cesse d'être
  du texte libre.

Les jetons sont émis à l'invitation et révocables. Ils ne remplacent pas une
authentification : ils empêchent la lecture croisée, ce qui est l'objectif.

---

## 6. Ce qu'il ne faut pas écrire

Tant que le niveau 3 n'existe pas, aucun texte d'interface ni de documentation ne
doit présenter les rôles comme une protection. Formulations à proscrire : « accès
sécurisé », « données protégées », « seul l'entraîneur peut voir ». Formulation
juste : « chacun voit ce qui le concerne ».
