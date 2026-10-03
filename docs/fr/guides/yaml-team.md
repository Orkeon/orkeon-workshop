# Une équipe YAML

*[English](../../guides/yaml-team.md) · Français*

YAML est le format par défaut d'une équipe Orkeon : quelques fichiers lisibles, rien à compiler. Le skill
`orkeon-crew-yaml` de l'atelier conçoit et écrit une telle équipe dans un dossier qu'Orkeon Studio exécute
tel quel, puis il la vérifie.

## La demander

Décrivez le besoin avec vos propres mots ; ne citez YAML que si vous voulez vous assurer du format :

```text
Fais-moi une équipe d'agents qui lit les factures PDF d'un dossier, en extrait le fournisseur, la date
et le montant, et écrit un récapitulatif en CSV.
```

```text
Crée une équipe YAML pour une veille technologique hebdomadaire sur Rust : chercher sur le web, garder
les 10 articles les plus pertinents, écrire une synthèse en Markdown.
```

```text
Une équipe qui trie les e-mails d'un dossier en urgent / normal / indésirable, se souvient de ce
qu'elle a déjà trié, et écrit un rapport.
```

Plus vous en dites sur **ce qu'elle lit, ce qu'elle écrit et ce qu'est un bon résultat**, moins le skill
a à deviner. Il ne pose une question que si le besoin lui-même n'est pas clair ; sinon, il choisit des
valeurs par défaut raisonnables et les énumère dans son rapport.

## Ce que décide le skill

| Décision | Comment |
|---|---|
| titre et slug | tirés du besoin : *Veille technologique*, `tech-watch` |
| dossier cible | `teams/<slug>/` ; s'il existe déjà, `teams/<slug>-2/` — le skill n'écrase jamais une équipe |
| points de montage | les dossiers que vous avez nommés, sinon ceux du `NEED.md`/`DESIGN.md` de l'équipe, sinon un par type de contenu (`/invoices` en lecture seule, `/reports` en écriture…), sinon un schéma proposé — [Points de montage](../concepts/mount-points.md) |
| livrable | le fichier que produit l'équipe, sous un point de montage en écriture, avec son format et sa structure |
| processus | `sequential`, sauf si le besoin appelle un autre mode (un superviseur qui relit, une répartition en parallèle…) |
| agents | de 2 à 5, chacun avec un rôle, un objectif et un contexte concrets (`role`, `goal`, `backstory`), et seulement les outils dont il a besoin, pris dans le catalogue d'Orkeon |
| tâches | une par étape, chacune nommant les chemins virtuels et les outils qu'elle utilise, la dernière portant le livrable |
| prérequis | les clés et les comptes dont les outils ont besoin (`ORKEON_TAVILY_API_KEY` pour `web_search`, un compte e-mail…) — listés dans le README, jamais écrits sur le disque |

## Ce que le skill écrit

```text
teams/tech-watch/
├── mounts.json              les points de montage
├── crew/config.yaml         l'équipe : nom, objectif, processus
├── crew/agents/<id>.yaml    un fichier par agent
├── crew/tasks/<id>.yaml     un fichier par tâche
├── studio-team.json         la carte Studio
├── README.md                objectif, agents, tâches, points de montage, prérequis, comment la lancer
├── run.sh, run.cmd          écrits par orkeon-bench scaffold
├── .gitignore               écrit par orkeon-bench scaffold : ce que l'équipe lit et écrit reste hors de git
└── <un dossier par point de montage, chacun avec un .gitkeep>
```

Si vous ne donnez aucune entrée, des exemples sont déposés dans un dossier en lecture seule, sous forme de
fichiers `*.example.md` — supprimez-les avant une vraie exécution.

## Comment le skill vérifie l'équipe

Deux vérifications, relancées jusqu'à ce que toutes deux soient propres :

```bash
python3 .claude/skills/orkeon-crew-yaml/scripts/check_crew.py teams/tech-watch --orkeon orkeon
cd teams/tech-watch && ./run.sh --validate
```

Elles se terminent ainsi — les nombres dépendent de l'équipe :

```text
OK: 3 agent(s), 3 task(s), 0 error(s), 0 warning(s)
VALIDATION OK: /workspace/teams/tech-watch/crew (agents=3, tasks=3, tools resolved=4)
```

`check_crew.py` couvre ce que la validation d'Orkeon elle-même ne voit pas : l'organisation attendue par
Studio, les dossiers, une carte ou des lanceurs en désaccord avec `mounts.json`, un livrable hors des
points de montage en écriture, des clés YAML inconnues, des identifiants (`agent:`, `dependencies:`) qui
ne désignent rien, des valeurs hors limites, un point de montage lié à un dossier que les agents de
l'équipe ne doivent jamais atteindre, un fichier de réglages d'équipe qui contient un secret ou un
réglage valable pour toute la machine, un fichier de réglages au-dessus des crews, et `shell_command`
(signalé par un avertissement ; refusé dans une équipe qui a un compte e-mail). Dans l'image, il lance
aussi `orkeon-studio-check`, la lecture que Studio fait lui-même de l'équipe. `--validate` charge
l'équipe dans Orkeon et résout chaque outil, sans appeler de modèle. Aucune des deux vérifications ne
contrôle les clés externes : un outil auquel il manque une clé échoue à l'exécution, d'où les prérequis
du README.

Le skill ne lance jamais l'équipe pour de vrai de lui-même — une exécution appelle un modèle. Lancez-la
vous-même (`./run.sh`), ou demandez-le.

## Ce que YAML sait faire et TypeScript non

Les `guardrails` (ceux d'un agent passent avant ceux de sa tâche), les réglages d'échantillonnage d'une
tâche dans `llmOverride` (température, jetons, réflexion — TypeScript ne peut que faire passer une tâche à
un profil nommé), `graphConfig` (le processus `graph`) et `memoryProvider` n'existent qu'en YAML. Le
`llm` d'un agent ou de la crew est appliqué lui aussi. Le `circuitBreaker` d'une tâche n'existe plus :
Orkeon refuse la crew au chargement, et le graphe se règle avec `graphConfig`. Si votre équipe a
besoin d'outils sur mesure écrits en code, consultez [Une équipe TypeScript](./typescript-team.md) ; pour
des outils lourds ou des entrées-sorties, [Outils C#](./csharp-tools.md).

## Modifier une équipe

Demandez-le à Claude avec des mots simples — *« ajoute un agent qui vérifie les sources »*, *« écris la
synthèse en français »*, *« lis aussi `/archive` »*. Quand les points de montage changent, `mounts.json`
change et `orkeon-bench scaffold <team>` est relancé pour que les lanceurs et la carte suivent ; les
vérifications sont relancées elles aussi.

Quelques règles gardent le dossier valide — le skill et sa vérification les font respecter :

- un seul format par dossier : jamais de `*.ork.ts` à côté d'un crew YAML ;
- pas de dossier `agents/` ni `tasks/` à la racine de l'équipe (leur place est dans `crew/`) ;
- le nom de fichier d'un agent ou d'une tâche est son identifiant, celui auquel renvoient `agent:` et
  `dependencies:` ;
- pas de bloc `mounts:` dans `config.yaml` — les montages passent par `mounts.json`, les lanceurs et la
  carte ;
- aucune clé d'API nulle part dans le dossier.

Suite : [Une équipe TypeScript](./typescript-team.md).
