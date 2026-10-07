# Votre première équipe

*[English](../../getting-started/first-team.md) · Français*

Un exemple complet, d'une simple phrase jusqu'à une équipe qui tourne sur un modèle local et apparaît dans
Orkeon Studio. Il suppose que le conteneur est démarré et que Claude Code est ouvert dans l'atelier
([Installer](./install.md)).

## 1. La demander

Dans Claude Code, décrivez ce que l'équipe doit faire, avec vos propres mots :

```text
Crée une équipe YAML qui lit la note topic.md que j'ai mise dans un dossier et en écrit un résumé
d'une ligne dans un rapport.
```

Cette demande déclenche le skill `orkeon-crew-yaml`. Sans rien vous demander, sauf si le besoin n'est pas
clair, il :

1. lit les documents de référence Orkeon de l'atelier (`references/orkeon/`) ;
2. choisit les **points de montage** — les dossiers que l'équipe voit — d'après votre besoin : `/notes`, en
   lecture seule, pour ce qu'elle lit, et `/reports`, en écriture, pour ce qu'elle produit
   ([Points de montage](../concepts/mount-points.md)) ;
3. écrit l'équipe dans `teams/notes-digest/` ;
4. exécute `orkeon-bench scaffold notes-digest`, qui écrit les lanceurs, la carte Studio et les dossiers
   d'après les points de montage ;
5. vérifie le dossier (`check_crew.py`) et le fait charger par Orkeon (`./run.sh --validate`) — rien de
   payant : aucun modèle n'est appelé.

## 2. Regarder ce qu'il a produit

```text
teams/notes-digest/
├── crew/
│   ├── config.yaml          l'équipe : son nom, son objectif et son processus
│   ├── agents/writer.yaml   un agent
│   └── tasks/digest.yaml    une tâche, et le livrable qu'elle écrit
├── mounts.json              les points de montage
├── studio-team.json         la carte que lit Orkeon Studio
├── run.sh, run.cmd          les lanceurs (Linux/conteneur, Windows)
├── README.md                comment utiliser l'équipe
├── .gitignore               exclut de git ce que l'équipe lit et écrit
├── notes/                   le dossier derrière /notes (avec un .gitkeep)
└── reports/                 le dossier derrière /reports (avec un .gitkeep)
```

Voici les fichiers d'une version minimale de cette équipe — ceux de Claude différeront par les noms, la
formulation et le nombre d'agents (de deux à cinq), pas par l'arborescence. `mounts.json`, la source unique
des points de montage :

```json
{
  "version": 1,
  "mounts": [
    { "root": "/notes", "access": "ro", "role": "inputs", "default": "./notes", "description": "The notes to digest" },
    { "root": "/reports", "access": "rw", "role": "deliverables", "default": "./reports", "description": "The digest" }
  ]
}
```

```yaml
# crew/config.yaml
name: notes-digest
goal: "Digest the notes of a folder in one line"
process: sequential
```

```yaml
# crew/agents/writer.yaml
role: "Note writer"
goal: "Read the note file and write a one-line digest"
backstory: |
  Careful writer. Reads the input file before writing.
tools: [file_read]
allowDelegation: false
maxIter: 4
```

```yaml
# crew/tasks/digest.yaml
description: |
  Read /notes/topic.md with file_read, then write a one-line digest of it.
expectedOutput: "One line."
agent: writer
deliverable:
  path: /reports/note.md
  source: final_message
  format: markdown
```

L'agent voit `/notes` et `/reports`, jamais votre disque : Orkeon relie chaque point de montage à un vrai
dossier au moment où l'équipe s'exécute. `orkeon-bench scaffold` a affiché ce qu'il a fait :

```text
notes-digest: yaml crew, launchers start crew
wrote run.sh, run.cmd, studio-team.json, .gitignore
mounts: ./notes:/notes:ro ./reports:/reports:rw
created notes/ reports/
```

et les vérifications se sont terminées par :

```text
OK: 1 agent(s), 1 task(s), 0 error(s), 0 warning(s)
VALIDATION OK: /workspace/teams/notes-digest/crew (agents=1, tasks=1, tools resolved=1)
```

## 3. L'exécuter

Déposez une note dans le dossier `notes` — depuis Windows, c'est `%USERPROFILE%\Orkeon\teams\notes-digest\notes\` ;
nommez-la `topic.md`. Puis, dans un terminal du conteneur :

```bash
cd /workspace/teams/notes-digest
./run.sh
```

L'équipe s'exécute sur le modèle défini dans les réglages Orkeon du conteneur : par défaut le modèle local
Ollama, gratuit et qui reste sur votre machine — mais plus lent qu'un modèle distant, surtout sans GPU.
Quand elle a terminé, le résumé se trouve dans `reports/note.md`.

> Le lanceur transmet ses arguments supplémentaires à `orkeon run` : `./run.sh --validate` se contente de
> charger l'équipe, `./run.sh -v 2` affiche plus de détails.

## 4. L'exécuter sur d'autres dossiers : un jeu de dossiers

Pour essayer l'équipe sur d'autres notes sans toucher à ses propres dossiers, créez un **jeu de dossiers** —
un dossier par point de montage, sous `mounts.<name>/<team>/` dans l'atelier (`run.sh` crée lui-même les
dossiers en écriture, si bien qu'ici seul `notes/` est nécessaire) :

```bash
mkdir -p /workspace/mounts.test/notes-digest/notes
cp ~/some-other-note.md /workspace/mounts.test/notes-digest/notes/topic.md
TEAM_ENV=test ./run.sh
```

Le résumé arrive dans `mounts.test/notes-digest/reports/note.md` ; les dossiers `notes/` et `reports/` de
l'équipe restent intacts. Un jeu de dossiers qui n'existe pas est refusé avec un message clair :

```text
run.sh: no mount set 'nope' for this team: /workspace/mounts.nope/notes-digest does not exist
```

## 5. La voir dans Orkeon Studio

Sous Windows, Orkeon Studio liste chaque dossier de son dossier d'équipes — `%USERPROFILE%\Orkeon\teams`
par défaut ; pour un atelier placé dans un autre dossier, indiquez une fois à Studio son sous-dossier
`teams` ([L'atelier](../concepts/workshop.md#orkeon-studio-le-voit)). **Notes digest** y
figure la prochaine fois que vous ouvrez « Mes équipes » (My teams), avec la description de sa carte. Studio
utilise les propres dossiers de l'équipe (`notes/`, `reports/`) ; les jeux de dossiers servent aux lanceurs.
Il l'exécute avec les réglages de modèle **de Studio**, pas avec ceux du conteneur — cette équipe n'a pas
de fichier de réglages propre : configurez un modèle
dans les « Réglages » (Settings) de Studio, ou nommez dans la carte l'un des profils de modèle de Studio
(`"profile": "<name>"` dans `studio-team.json`). Dans le conteneur, `orkeon-studio-check notes-digest` lit
l'équipe avec le code même de Studio et indique si Studio la listerait et la lancerait comme le font ses
lanceurs.

## 6. La modifier

Demandez à Claude, en langage courant : *« fais un résumé de trois lignes avec un titre »*, *« lis aussi les
notes de `/archive` »*. Quand les points de montage changent, Claude met à jour `mounts.json` et relance
`orkeon-bench scaffold`, pour que les lanceurs et la carte suivent.

## Ce que cet exemple a laissé de côté

C'était le chemin rapide, un **prototype** : un skill générateur, une validation et une exécution — rien ne
prouve encore que l'équipe fait ce dont vous avez besoin. Pour une équipe sur laquelle vous allez compter, la
méthode de l'atelier met le besoin par écrit, définit ce que « terminé » veut dire et écrit les tests
**avant** l'équipe — [Comment se construit une équipe](../concepts/process.md) et
[Tester une équipe](../concepts/testing.md). Un prototype comme celui-ci rejoint la méthode avec
`/team-init --adopt notes-digest`, puis `/team-need notes-digest`, qui vous interroge et rédige le
besoin ; les skills des étapes qui suivent le besoin sont prévus, et d'ici là Claude suit ces étapes à la
main avec les gabarits de l'atelier.

Suite : [L'atelier](../concepts/workshop.md), ou [Une équipe YAML](../guides/yaml-team.md) pour en savoir
plus sur ce que fait le générateur.
