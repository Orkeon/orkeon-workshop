# Votre première équipe

*[English](../../getting-started/first-team.md) · Français*

Un exemple complet, d'une simple phrase jusqu'à une équipe qui tourne sur un modèle local et apparaît dans
Orkeon Studio. Il suppose que l'atelier est démarré et que Claude Code y est ouvert
([Installer](./install.md), étapes 1 à 4). Chaque commande ci-dessous dit où elle se tape — dans Claude
Code, dans le terminal du conteneur, ou sur votre ordinateur
([Trois endroits où taper](./install.md#trois-endroits-où-taper)). Écrivez vos demandes en français : Claude vous répond en français — et
`/workshop-language fr`, tapée une fois, fait du français la langue de votre atelier
([Votre langue](./install.md#votre-langue)).

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
   lecture seule, pour ce qu'elle lit, et `/reports`, en écriture, pour ce qu'elle produit. En lecture
   seule, l'équipe peut ouvrir les fichiers mais jamais les modifier ; en écriture, elle peut y créer et
   y modifier des fichiers ([Points de montage](../concepts/mount-points.md)) ;
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

**Déposez une note dans le dossier `notes` de l'équipe.** Sur votre ordinateur, avec l'explorateur de
fichiers, le dossier est `notes-digest\notes` dans le dossier `teams` de votre atelier — sous Windows, par
défaut, `%USERPROFILE%\Orkeon\teams\notes-digest\notes\`. Écrivez-y un court fichier texte et nommez-le
`topic.md`.

**Vérifiez que le modèle local est là.** Il a été téléchargé en arrière-plan au premier démarrage
(environ 5 Go). Quittez Claude Code avec `/exit` — vous êtes alors dans le terminal du conteneur — et tapez :

```bash
ollama list
```

Le modèle de la commande de démarrage, `qwen3:8b`, doit figurer dans la liste. Pas encore là ? Le
téléchargement continue : attendez quelques minutes et retapez la commande. La liste reste vide si le
conteneur a été créé sans modèle : choisissez-en un d'abord ([Modèles](../guides/models.md)).

**Exécutez l'équipe.** Demandez à Claude de l'exécuter, ou faites-le vous-même dans le terminal du
conteneur, avec la ligne ci-dessous ; `workshop` rouvre ensuite Claude Code.

```bash
cd /workspace/teams/notes-digest && sh run.sh
```

Le lanceur passe par `sh` : un atelier monté depuis Windows ne garde pas la marque qui permet de lancer un
fichier comme un programme, si bien que `./run.sh` peut y être refusé, alors que `sh run.sh` marche
toujours.

L'équipe s'exécute sur le modèle défini dans les réglages Orkeon du conteneur : le modèle local Ollama nommé
à la création du conteneur, gratuit et qui reste sur votre machine — mais plus lent qu'un modèle distant,
surtout sans GPU. Quand elle a terminé, le résumé se trouve dans `reports/note.md`, que vous pouvez ouvrir
depuis votre ordinateur dans le dossier `reports` de l'équipe.

> Le lanceur transmet ses arguments supplémentaires à `orkeon run` : `./run.sh --validate` se contente de
> charger l'équipe, `./run.sh -v 2` affiche plus de détails.

## 4. La voir dans Orkeon Studio

Si vous utilisez Orkeon Studio, sous Windows : il liste chaque dossier de son dossier d'équipes — `%USERPROFILE%\Orkeon\teams`
par défaut ; pour un atelier placé dans un autre dossier, indiquez une fois à Studio son sous-dossier
`teams` ([L'atelier](../concepts/workshop.md#orkeon-studio-le-voit)). **Notes digest** y
figure la prochaine fois que vous ouvrez « Mes équipes » (My teams), avec la description de sa carte. Studio
utilise les propres dossiers de l'équipe (`notes/`, `reports/`) ; les jeux de dossiers servent aux lanceurs.
Il l'exécute avec les réglages de modèle **de Studio**, pas avec ceux du conteneur — cette équipe n'a pas
de fichier de réglages propre : configurez un modèle
dans les « Réglages » (Settings) de Studio, ou nommez dans la carte l'un des profils de modèle de Studio
(`"profile": "<name>"` dans `studio-team.json`). Dans le terminal du conteneur, `orkeon-studio-check notes-digest` lit
l'équipe avec le code même de Studio et indique si Studio la listerait et la lancerait comme le font ses
lanceurs.

## 5. La modifier

Dans Claude Code, demandez en langage courant : *« fais un résumé de trois lignes avec un titre »*, *« lis aussi les
notes de `/archive` »*. Quand les points de montage changent, Claude met à jour `mounts.json` et relance
`orkeon-bench scaffold`, pour que les lanceurs et la carte suivent.

## Pour aller plus loin

### L'exécuter sur d'autres dossiers : un jeu de dossiers

Pour essayer l'équipe sur d'autres notes sans toucher à ses propres dossiers, créez un **jeu de dossiers** —
un dossier par point de montage, sous `mounts.<name>/<team>/` dans l'atelier (`run.sh` crée lui-même les
dossiers en écriture, si bien qu'ici seul `notes/` est nécessaire). Dans le terminal du conteneur — la
deuxième ligne copie la note de l'étape 3 ; mettez à sa place n'importe quelle autre note depuis votre
ordinateur :

```bash
mkdir -p /workspace/mounts.test/notes-digest/notes
cp /workspace/teams/notes-digest/notes/topic.md /workspace/mounts.test/notes-digest/notes/topic.md
cd /workspace/teams/notes-digest && TEAM_ENV=test sh run.sh
```

Le résumé arrive dans `mounts.test/notes-digest/reports/note.md` ; les dossiers `notes/` et `reports/` de
l'équipe restent intacts. Un jeu de dossiers qui n'existe pas est refusé avec un message clair :

```text
run.sh: no mount set 'nope' for this team: /workspace/mounts.nope/notes-digest does not exist
```

### Ce que cet exemple a laissé de côté

C'était le chemin rapide, un **prototype** : un skill générateur, une validation et une exécution — rien ne
prouve encore que l'équipe fait ce dont vous avez besoin. Pour une équipe sur laquelle vous allez compter, la
méthode de l'atelier met le besoin par écrit, définit ce que « terminé » veut dire et écrit les tests
**avant** l'équipe — [Comment se construit une équipe](../concepts/process.md) et
[Tester une équipe](../concepts/testing.md). Un prototype comme celui-ci rejoint la méthode avec
`/team-init --adopt notes-digest`, puis `/team-need notes-digest`, qui vous interroge et rédige le
besoin, puis `/team-test-plan`, `/team-design` et `/team-tests`, qui rédigent les critères, le plan de test, la
conception et les tests ; les skills des étapes qui suivent les tests sont prévus, et d'ici là Claude suit ces
étapes à la main avec les gabarits de l'atelier. `/deploy` empaquette l'équipe en archive pour l'installer
dans un autre atelier.

Suite : [L'atelier](../concepts/workshop.md), ou [Une équipe YAML](../guides/yaml-team.md) pour en savoir
plus sur ce que fait le générateur.
