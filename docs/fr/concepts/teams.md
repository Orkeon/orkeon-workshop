# Les équipes

*[English](../../concepts/teams.md) · Français*

## Ce qu'est une équipe Orkeon

Une équipe Orkeon — un *crew* — est un petit groupe d'agents d'IA qui accomplissent une liste de tâches :

| Élément | Ce que c'est | Exemple |
|---|---|---|
| **Agents** | chacun a un rôle, un objectif et un contexte (`backstory`), qui forment ensemble son prompt, et les outils qu'il peut utiliser | *Rédacteur de notes* : lit une note, en écrit un résumé ; outil `file_read` |
| **Tâches** | ce qu'il faut faire, à quoi le résultat doit ressembler, quel agent s'en charge, après quelles autres tâches | *Résumé* : lire `/notes/topic.md`, répondre en une ligne |
| **Un processus** | comment les tâches sont exécutées : `sequential` (l'une après l'autre, par défaut), `hierarchical` (un agent superviseur attribue les tâches et relit le travail), `parallel`, `consensual`, `graph`, `autonomous` | `sequential` |
| **Outils** | ce que les agents peuvent faire au-delà d'écrire du texte : lire et écrire des fichiers, analyser des documents, lire et rédiger des e-mails, chercher sur le web, interroger des bases de données… — 80 intégrés, plus les vôtres | `file_read`, `directory_read` |
| **Livrables** | les fichiers que produit l'équipe, écrits par Orkeon à partir de la réponse d'une tâche | `/reports/note.md` |

Le modèle derrière les agents (local ou distant) ne fait pas partie de l'équipe : dans l'atelier, il vient
du fichier de réglages propre à l'équipe (`settings/<slug>/appsettings.json`) ou des réglages Orkeon de la
machine ; dans Orkeon Studio, des réglages de Studio ou du profil de modèle que nomme la carte de l'équipe.
Une équipe ne contient jamais de clé d'API.

## Trois formats

| Format | À utiliser pour | Généré par |
|---|---|---|
| **YAML** | la plupart des équipes : quelques fichiers, rien à compiler | le skill `orkeon-crew-yaml` — [guide](../guides/yaml-team.md) |
| **TypeScript** (`.ork.ts`) | une équipe qui a besoin d'outils sur mesure — un calcul, une étape d'analyse, une règle métier que le modèle appliquerait mal | le skill `orkeon-crew-typescript` — [guide](../guides/typescript-team.md) |
| **C#** | outils lourds, entrées-sorties, intégration .NET, et les fonctions que seul C# expose (graphes d'états, flux, stockage des points de contrôle, reprise) | les gabarits .NET — [guide](../guides/csharp-tools.md) ; les skills C# sont prévus |

Une équipe YAML, fichier par fichier :

```yaml
# crew/config.yaml — l'équipe
name: notes-digest
goal: "Digest the notes of a folder in one line"
process: sequential
```

```yaml
# crew/agents/writer.yaml — un agent ; le nom du fichier est son identifiant
role: "Note writer"
goal: "Read the note file and write a one-line digest"
backstory: |
  Careful writer. Reads the input file before writing.
tools: [file_read]
allowDelegation: false
maxIter: 4
```

```yaml
# crew/tasks/digest.yaml — une tâche, et le livrable qu'elle écrit
description: |
  Read /notes/topic.md with file_read, then write a one-line digest of it.
expectedOutput: "One line."
agent: writer
deliverable:
  path: /reports/note.md
  source: final_message
  format: markdown
```

La même équipe en TypeScript tient en un seul fichier, `crew/crew.ork.ts`, construit avec
`agentBuilder()`, `taskBuilder()` et `crewBuilder()`, plus `crew/tools/index.ts` pour ses outils sur
mesure.

## Le dossier de l'équipe

`teams/<slug>/` contient exactement ce dont Orkeon Studio a besoin pour lister et exécuter l'équipe :

```text
teams/notes-digest/
├── crew/              la définition, et rien d'autre
├── mounts.json        ses points de montage (le harnais le lit ; Studio l'ignore)
├── studio-team.json   la carte : nom, description, montages
├── run.sh, run.cmd    les lanceurs pour un terminal (Linux/conteneur, Windows)
├── README.md          ce que fait l'équipe et comment la lancer
├── .gitignore         écrit par scaffold : ce que l'équipe lit et écrit reste hors de git
└── notes/, reports/   un dossier par point de montage, chacun avec un .gitkeep
```

La façon dont l'équipe a été faite (son besoin, son plan, ses tentatives, ses décisions) se trouve dans
`workbooks/notes-digest/`, la preuve qu'elle fonctionne (jeux de données, scénarios, juges) dans
`tests/notes-digest/`, et ses propres réglages Orkeon, quand elle en a besoin (une boîte aux lettres, un
autre modèle), dans `settings/notes-digest/appsettings.json` — jamais dans le dossier de l'équipe, dont
les agents peuvent lire le `crew/`.

### La carte Studio

```json
{
  "name": "Notes digest",
  "description": "Digest the notes of a folder in one line.",
  "mounts": [
    "./notes:/notes:ro",
    "./reports:/reports:rw"
  ]
}
```

`mounts` relie chaque point de montage à un dossier de l'équipe (`./` est relatif au dossier de l'équipe).
Studio lit aussi `profile` (le nom d'un des profils de modèle de Studio : le modèle avec lequel l'équipe
s'exécute dans Studio) et `schedule` (`daily@08:00`, `hourly`, seulement affiché) quand vous les
renseignez à la main — Studio lui-même ne les écrit que pour une équipe adoptée par son propre assistant.
`orkeon-bench scaffold` écrit `mounts` à partir de `mounts.json` et conserve les autres champs. Studio lit
la carte de façon stricte : un commentaire, une virgule finale ou un type erroné lui fait ignorer toute la
carte, et l'équipe se lance alors sans ses dossiers. Après chaque exécution, Studio réécrit la carte : il y
ajoute `lastRunAt`, écrit `null` pour les champs absents et supprime les champs qu'il ne connaît pas.

### Les lanceurs

`run.sh` et `run.cmd` exécutent l'équipe depuis un terminal comme le fait Studio : `orkeon run crew`
depuis le dossier de l'équipe, avec chaque point de montage relié. Ils sont écrits par
`orkeon-bench scaffold` — ne les modifiez jamais à la main : changez `mounts.json` et relancez
`scaffold`. Les arguments supplémentaires sont passés à `orkeon run` :

```bash
./run.sh --validate          # charger l'équipe, résoudre chaque outil, n'appeler aucun modèle
./run.sh                     # l'exécuter sur le modèle du conteneur
TEAM_ENV=test ./run.sh       # l'exécuter sur le jeu de dossiers mounts.test/<slug>/
```

### Les règles que Studio attend

- `crew/` contient la définition, et rien d'autre.
- Aucun dossier `agents/` ou `tasks/` à la racine de l'équipe — pas même comme dossier d'un point de
  montage : Studio prendrait le dossier de l'équipe lui-même pour le crew, et le lancement échouerait.
  Jamais de `*.ork.ts` à la racine ni à côté d'un crew YAML.
- Aucun point de montage relié au dossier de l'équipe lui-même (`.`) : Studio refuse de lancer l'équipe,
  et ses agents pourraient la réécrire. Un dossier hors de l'équipe ne fonctionne dans Studio qu'une fois
  déclaré dans ses « Dossiers autorisés » (Authorized folders).
- Dans un crew TypeScript, le point d'entrée est exactement `crew/crew.ork.ts`.
- Jamais de clé d'API dans le dossier.

Les skills générateurs et leurs vérifications (`check_crew.py`, `check_team.py`) font respecter toutes
ces règles, et dans le conteneur, `orkeon-studio-check <slug>` (sans argument : toutes les équipes de
l'atelier) lit l'équipe avec le code même de Studio : la carte, le crew que Studio exécuterait et depuis
où, les points de montage qu'il refuserait, comparés à ce que font les lanceurs. Dans le conteneur, il
compare les chemins en tenant compte de la casse, là où Studio sous Windows l'ignore, et il ne voit pas
les attributs Caché et Système de Windows.

### Ce que font les actions de Studio

Studio ne connaît que le dossier de l'équipe. Ses actions **Renommer** (Rename), **Dupliquer**
(Duplicate) et **Supprimer** (Delete) laissent derrière elles le cahier, les tests, les réglages et les
jeux de dossiers, sous l'ancien nom — déplacez-les à la main (prévu, lot 4 : `orkeon-bench doctor`
listera ces orphelins, et `orkeon-bench team rename|remove` déplacera ou supprimera ensemble les cinq
arborescences d'une équipe, D39). Réadopter une équipe après l'action **Modifier** (Modify) de Studio
régénère `crew/` et les lanceurs : relancez `orkeon-bench scaffold <team>`.

Suite : [Points de montage et jeux de dossiers](./mount-points.md).
